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
 * SQUAD_IDENTITY_MOCK=1 — when set, resolveTokenWithDiagnostics and resolveToken
 * return a deterministic mock token `mock-token-{role}` without any filesystem or
 * network I/O. Useful for integration tests that exercise the full token resolution
 * path without real GitHub App credentials.
 *
 * @module identity/tokens
 */

import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
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
// Error taxonomy
// ============================================================================

/**
 * Structured error returned by resolveTokenWithDiagnostics.
 * - 'not-configured': credentials are absent — normal, not a bug
 * - 'runtime': unexpected failure (PEM invalid, API timeout, FS error)
 */
export interface TokenResolveError {
  kind: 'not-configured' | 'runtime';
  message: string;
}

/**
 * Structured result from resolveTokenWithDiagnostics.
 */
export interface TokenResolveResult {
  token: string | null;
  resolvedRoleKey: string | null;
  error: TokenResolveError | null;
}

// ============================================================================
// JWT generation
// ============================================================================

/**
 * Internal sync JWT builder. Called directly by resolveTokenWithDiagnostics to
 * ensure getInstallationToken is registered synchronously (required for fake timer tests).
 */
function buildJWT(appId: number, privateKeyPem: string, nowOverride?: number): string {
  try {
    createPrivateKey(privateKeyPem);
  } catch (e) {
    throw new Error(`Invalid PEM format for role: ${(e as Error).message}`);
  }

  const now = nowOverride ?? Math.floor(Date.now() / 1000);
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

/**
 * Generate a JWT for GitHub App authentication.
 * Uses RS256 signing with the app's private key (PEM format).
 * JWT is valid for 9 minutes (leaves buffer under GitHub's 10-minute maximum).
 *
 * @param appId - GitHub App ID
 * @param privateKeyPem - RSA private key in PEM format
 * @param nowOverride - Optional Unix timestamp in seconds (for deterministic tests). Defaults to Date.now()/1000.
 * @returns Signed JWT string
 */
export async function generateAppJWT(appId: number, privateKeyPem: string, nowOverride?: number): Promise<string> {
  return buildJWT(appId, privateKeyPem, nowOverride);
}

// ============================================================================
// Installation token exchange
// ============================================================================

/**
 * Exchange a JWT for an installation access token.
 * Uses globalThis.fetch (Node.js 18+ built-in) to call GitHub API.
 * Applies a 10-second AbortSignal timeout — hangs indefinitely otherwise.
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

  // Use an explicit AbortController + Promise.race so the timeout works even when fetch
  // is mocked and doesn't natively respect the AbortSignal (e.g., in tests).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(new Error('fetch timeout: installation token request exceeded 10s'));
    });
  });

  let response: Response;
  try {
    response = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }

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

/** Module-level token cache, keyed by `${squadDir}:${roleKey}` to prevent cross-project pollution. */
const tokenCache = new Map<string, CachedToken>();

/** Tokens are refreshed when within this many ms of expiry. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clear the token cache. Exposed for testing.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Peek at the cached token state for a role without triggering a fetch.
 * Useful for diagnostic commands (e.g., `squad identity explain`).
 *
 * @param squadDir - Project root directory
 * @param roleKey - Role key (e.g., 'lead', 'backend')
 * @returns Cache entry info if present, or `{ cached: false }`
 */
export function peekTokenCache(
  squadDir: string,
  roleKey: string,
): { cached: true; expiresAt: Date; remainingMs: number } | { cached: false } {
  const cacheKey = `${squadDir}:${roleKey}`;
  const entry = tokenCache.get(cacheKey);
  if (!entry) return { cached: false };
  return {
    cached: true,
    expiresAt: entry.expiresAt,
    remainingMs: entry.expiresAt.getTime() - Date.now(),
  };
}

/**
 * Fetch the permissions associated with a GitHub App installation token.
 * Calls `GET /installation` with the token to retrieve the current permissions set.
 *
 * Used by `squad identity doctor` to verify the expected scopes are present.
 *
 * @param token - GitHub App installation token
 * @returns Record of permission name → access level, or null on failure
 */
export async function getInstallationPermissions(
  token: string,
): Promise<Record<string, string> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch('https://api.github.com/installation/repositories?per_page=1', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    // The token's own permissions are in the response's X headers or can be
    // queried via GET /installation — use the token to call that endpoint.
    // Fallback: call GET /app/installations/{id} is not possible without JWT.
    // Instead, parse from the token itself via GET /installation.
    const permResponse = await fetch('https://api.github.com/installation', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    if (!permResponse.ok) return null;
    const data = (await permResponse.json()) as { permissions?: Record<string, string> };
    return data.permissions ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
 * Returns { credentials, error }:
 * - credentials non-null + error null → all three vars set, ready to use
 * - credentials null + error null → no vars set at all (not configured)
 * - credentials null + error non-null → partial config (fail loudly)
 */
function resolveEnvCredentials(roleKey: string): {
  credentials: { appId: number; pem: string; installationId: number } | null;
  error: string | null;
} {
  const envKey = roleKey.toUpperCase();
  const appIdStr = process.env[`SQUAD_${envKey}_APP_ID`];
  const pemRaw = process.env[`SQUAD_${envKey}_PRIVATE_KEY`];
  const installIdStr = process.env[`SQUAD_${envKey}_INSTALLATION_ID`];

  const presentCount = [appIdStr, pemRaw, installIdStr].filter(Boolean).length;

  if (presentCount === 0) return { credentials: null, error: null };

  if (presentCount !== 3) {
    const missing: string[] = [];
    if (!appIdStr) missing.push(`SQUAD_${envKey}_APP_ID`);
    if (!pemRaw) missing.push(`SQUAD_${envKey}_PRIVATE_KEY`);
    if (!installIdStr) missing.push(`SQUAD_${envKey}_INSTALLATION_ID`);
    return {
      credentials: null,
      error: `Incomplete environment credentials for role "${roleKey}". Missing: ${missing.join(', ')}`,
    };
  }

  const appId = Number(appIdStr);
  const installationId = Number(installIdStr);
  if (!Number.isFinite(appId) || !Number.isFinite(installationId)) {
    return { credentials: null, error: null };
  }

  // Decode base64 PEM if it doesn't already look like a PEM
  const pem = pemRaw!.trimStart().startsWith('-----BEGIN')
    ? pemRaw!
    : Buffer.from(pemRaw!, 'base64').toString('utf-8');

  return { credentials: { appId, pem, installationId }, error: null };
}

/**
 * Get a ready-to-use token for a role's GitHub App, with structured diagnostics.
 *
 * Resolution order:
 *   1. SQUAD_IDENTITY_MOCK=1 env var (returns deterministic mock token, no I/O)
 *   2. Cache (if still valid)
 *   3. Environment variables (SQUAD_{ROLE}_APP_ID / PRIVATE_KEY / INSTALLATION_ID)
 *   4. Filesystem (`.squad/identity/`)
 *
 * Returns { token, resolvedRoleKey, error }:
 * - On success: token set, error null
 * - On not-configured: token null, error.kind = 'not-configured'
 * - On runtime failure: token null, error.kind = 'runtime'
 *
 * @param squadDir - Project root directory (parent of `.squad/`)
 * @param roleKey - Role key (e.g., 'lead', 'backend', or 'shared')
 */
export async function resolveTokenWithDiagnostics(
  squadDir: string,
  roleKey: string,
): Promise<TokenResolveResult> {
  // SQUAD_IDENTITY_MOCK hook — returns deterministic mock token without any I/O
  if (process.env['SQUAD_IDENTITY_MOCK'] === '1') {
    const mockToken = process.env['SQUAD_IDENTITY_MOCK_TOKEN'] ?? `mock-token-${roleKey}`;
    return {
      token: mockToken,
      resolvedRoleKey: roleKey,
      error: null,
    };
  }

  const cacheKey = `${squadDir}:${roleKey}`;

  try {
    // Check cache — return if still valid
    const cached = tokenCache.get(cacheKey);
    if (cached) {
      const remainingMs = cached.expiresAt.getTime() - Date.now();
      if (remainingMs > REFRESH_MARGIN_MS) {
        return { token: cached.token, resolvedRoleKey: roleKey, error: null };
      }
      tokenCache.delete(cacheKey);
    }

    // --- Path 1: Environment variables (CI/CD override) ---
    const { credentials: envCreds, error: envError } = resolveEnvCredentials(roleKey);

    if (envError) {
      // Partial env config — fail loudly (runtime error, not just not-configured)
      return {
        token: null,
        resolvedRoleKey: null,
        error: { kind: 'runtime', message: envError },
      };
    }

    if (envCreds) {
      const jwt = buildJWT(envCreds.appId, envCreds.pem);
      const { token, expiresAt } = await getInstallationToken(jwt, envCreds.installationId);
      tokenCache.set(cacheKey, { token, expiresAt });
      return { token, resolvedRoleKey: roleKey, error: null };
    }

    // --- Path 2: Filesystem (default) ---
    const reg = loadAppRegistration(squadDir, roleKey);
    if (!reg) {
      return {
        token: null,
        resolvedRoleKey: null,
        error: {
          kind: 'not-configured',
          message: `No app registration found for role "${roleKey}" in .squad/identity/apps/${roleKey}.json.`,
        },
      };
    }

    if (reg.installationId === 0) {
      return {
        token: null,
        resolvedRoleKey: null,
        error: {
          kind: 'not-configured',
          message: `No installation ID set for role "${roleKey}". Run: squad identity update --role ${roleKey}`,
        },
      };
    }

    const pemPath = join(squadDir, '.squad', 'identity', 'keys', `${roleKey}.pem`);
    if (!existsSync(pemPath)) {
      return {
        token: null,
        resolvedRoleKey: null,
        error: {
          kind: 'not-configured',
          message: `No private key found for role "${roleKey}" at ${pemPath}.`,
        },
      };
    }

    // Warn if key file is world/group-readable (security risk)
    if (process.platform !== 'win32') {
      try {
        const stat = statSync(pemPath);
        const mode = stat.mode & 0o777;
        if (mode & 0o044) {
          process.stderr.write(
            `[squad identity] Warning: key file ${pemPath} is world/group-readable (mode ${mode.toString(8)}). Run: chmod 600 ${pemPath}\n`,
          );
        }
      } catch {
        // Non-fatal — stat failure just means we skip the warning
      }
    }

    const pem = readFileSync(pemPath, 'utf-8');

    // Generate JWT and exchange for installation token
    const jwt = buildJWT(reg.appId, pem);
    const { token, expiresAt } = await getInstallationToken(jwt, reg.installationId);

    // Cache
    tokenCache.set(cacheKey, { token, expiresAt });
    return { token, resolvedRoleKey: roleKey, error: null };

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Unexpected runtime error — log to stderr, return runtime error
    process.stderr.write(
      `[squad identity] unexpected error resolving "${roleKey}": ${message}\n`,
    );
    return {
      token: null,
      resolvedRoleKey: null,
      error: { kind: 'runtime', message },
    };
  }
}

/**
 * Get a ready-to-use token for a role's GitHub App.
 *
 * This is a backward-compatible wrapper around resolveTokenWithDiagnostics.
 * For structured diagnostics, use resolveTokenWithDiagnostics directly.
 *
 * Resolution order:
 *   1. Cache (if still valid)
 *   2. Environment variables (SQUAD_{ROLE}_APP_ID / PRIVATE_KEY / INSTALLATION_ID)
 *   3. Filesystem (`.squad/identity/`)
 *
 * Env vars take precedence over filesystem — explicit is better than implicit.
 * This enables CI/CD workflows to inject credentials via GitHub Actions secrets.
 *
 * Unexpected errors (PEM invalid, network failure) are logged to stderr;
 * expected non-configuration (no registration, no key) is silent.
 *
 * @param squadDir - Project root directory (parent of `.squad/`)
 * @param roleKey - Role key (e.g., 'lead', 'backend', or 'shared')
 * @returns Installation access token string, or null if credentials are missing
 */
export async function resolveToken(
  squadDir: string,
  roleKey: string,
): Promise<string | null> {
  const result = await resolveTokenWithDiagnostics(squadDir, roleKey);
  return result.token ?? null;
}
