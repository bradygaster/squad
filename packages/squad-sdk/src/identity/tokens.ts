/**
 * Identity Module — Token lifecycle
 *
 * GitHub App JWT generation and installation token exchange.
 * Uses only node:crypto and globalThis.fetch — no external dependencies.
 *
 * Flow:
 *   1. Load PEM from `.squad/identity/keys/{roleKey}.pem`
 *   2. Generate a short-lived JWT (RS256, 9 min)
 *   3. Exchange JWT for an installation access token via GitHub API
 *   4. Cache token, refresh when within 10 minutes of expiry
 *
 * @module identity/tokens
 */

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppRegistration } from './storage.js';

// ============================================================================
// Base64url helpers
// ============================================================================

function base64url(input: string | Buffer): string {
  const b64 = Buffer.from(input).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================================
// JWT generation
// ============================================================================

/**
 * Generate a JWT for GitHub App authentication.
 * Uses RS256 signing with the app's private key (PEM format).
 * JWT is valid for 9 minutes (leaves buffer under GitHub's 10-minute maximum).
 *
 * @param appId - GitHub App ID
 * @param privateKeyPem - RSA private key in PEM format
 * @returns Signed JWT string
 */
export async function generateAppJWT(appId: number, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: appId,
    iat: now - 60,   // 60 seconds in the past for clock drift
    exp: now + 540,  // 9 minutes — leaves buffer for clock skew (GitHub max is 10min)
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  const encodedSignature = base64url(signature);

  return `${signingInput}.${encodedSignature}`;
}

// ============================================================================
// Installation token exchange
// ============================================================================

/**
 * Exchange a JWT for an installation access token.
 * Uses globalThis.fetch (Node.js 18+ built-in) to call GitHub API.
 *
 * @param jwt - Signed JWT from generateAppJWT
 * @param installationId - GitHub App installation ID
 * @returns Token string and expiry date
 */
export async function getInstallationToken(
  jwt: string,
  installationId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API error ${response.status} creating installation token: ${body}`,
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  return {
    token: data.token,
    expiresAt: new Date(data.expires_at),
  };
}

// ============================================================================
// Token cache
// ============================================================================

interface CachedToken {
  token: string;
  expiresAt: Date;
}

/** Module-level token cache, keyed by roleKey. */
const tokenCache = new Map<string, CachedToken>();

/** Tokens are refreshed when within this many ms of expiry. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clear the token cache. Exposed for testing.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

// ============================================================================
// High-level token resolution
// ============================================================================

/**
 * Attempt to resolve credentials from environment variables.
 * Convention: SQUAD_{ROLE}_APP_ID, SQUAD_{ROLE}_PRIVATE_KEY, SQUAD_{ROLE}_INSTALLATION_ID.
 * The private key may be base64-encoded for env var safety; it is decoded automatically
 * when the value doesn't start with "-----BEGIN".
 *
 * @returns Credentials object, or null if any required env var is missing
 */
function resolveEnvCredentials(roleKey: string): {
  appId: number;
  pem: string;
  installationId: number;
} | null {
  const envKey = roleKey.toUpperCase();
  const appIdStr = process.env[`SQUAD_${envKey}_APP_ID`];
  const pemRaw = process.env[`SQUAD_${envKey}_PRIVATE_KEY`];
  const installIdStr = process.env[`SQUAD_${envKey}_INSTALLATION_ID`];

  if (!appIdStr || !pemRaw || !installIdStr) return null;

  const appId = Number(appIdStr);
  const installationId = Number(installIdStr);
  if (!Number.isFinite(appId) || !Number.isFinite(installationId)) return null;

  // Decode base64 PEM if it doesn't already look like a PEM
  const pem = pemRaw.trimStart().startsWith('-----BEGIN')
    ? pemRaw
    : Buffer.from(pemRaw, 'base64').toString('utf-8');

  return { appId, pem, installationId };
}

/**
 * Get a ready-to-use token for a role's GitHub App.
 *
 * Resolution order:
 *   1. Cache (if still valid)
 *   2. Environment variables (SQUAD_{ROLE}_APP_ID / PRIVATE_KEY / INSTALLATION_ID)
 *   3. Filesystem (`.squad/identity/`)
 *
 * Env vars take precedence over filesystem — explicit is better than implicit.
 * This enables CI/CD workflows to inject credentials via GitHub Actions secrets.
 *
 * @param squadDir - Project root directory (parent of `.squad/`)
 * @param roleKey - Role key (e.g., 'lead', 'backend', or 'shared')
 * @returns Installation access token string, or null if credentials are missing
 */
export async function resolveToken(
  squadDir: string,
  roleKey: string,
): Promise<string | null> {
  try {
    // Check cache — return if still valid
    const cached = tokenCache.get(roleKey);
    if (cached) {
      const remainingMs = cached.expiresAt.getTime() - Date.now();
      if (remainingMs > REFRESH_MARGIN_MS) {
        return cached.token;
      }
      // Expired or near expiry — remove and re-fetch
      tokenCache.delete(roleKey);
    }

    // --- Path 1: Environment variables (CI/CD override) ---
    const envCreds = resolveEnvCredentials(roleKey);
    if (envCreds) {
      const jwt = await generateAppJWT(envCreds.appId, envCreds.pem);
      const { token, expiresAt } = await getInstallationToken(jwt, envCreds.installationId);
      tokenCache.set(roleKey, { token, expiresAt });
      return token;
    }

    // --- Path 2: Filesystem (default) ---
    // Load app registration
    const reg = loadAppRegistration(squadDir, roleKey);
    if (!reg) return null;

    // Load PEM
    const pemPath = join(squadDir, '.squad', 'identity', 'keys', `${roleKey}.pem`);
    if (!existsSync(pemPath)) return null;

    const pem = readFileSync(pemPath, 'utf-8');

    // Generate JWT and exchange for installation token
    const jwt = await generateAppJWT(reg.appId, pem);
    const { token, expiresAt } = await getInstallationToken(jwt, reg.installationId);

    // Cache
    tokenCache.set(roleKey, { token, expiresAt });
    return token;
  } catch {
    // Graceful fallback — never throw; callers expect null on failure
    return null;
  }
}
