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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Error taxonomy
// ============================================================================

/**
 * Error thrown by getInstallationToken for non-OK HTTP responses.
 * Carries the HTTP status code so callers can decide whether to retry.
 */
export class GitHubApiError extends Error {
  readonly status: number;
  /** Milliseconds to wait before retrying, parsed from Retry-After header. Present only on 429. */
  readonly retryAfterMs: number | null;

  constructor(status: number, body: string, retryAfterMs: number | null = null) {
    super(`GitHub API error ${status}: ${body}`);
    this.name = 'GitHubApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Structured error returned by resolveTokenWithDiagnostics.
 * - 'not-configured': credentials are absent — normal, not a bug
 * - 'runtime': unexpected failure (PEM invalid, API timeout, FS error)
 */
export interface TokenResolveError {
  kind: 'not-configured' | 'runtime';
  message: string;
  /**
   * True when all retry attempts were exhausted before the call succeeded.
   * Only meaningful when kind is 'runtime' and a retryPolicy was provided.
   */
  retriesExhausted: boolean;
}

// ============================================================================
// Retry policy
// ============================================================================

/**
 * Retry policy for token resolution network calls.
 *
 * Applies exponential backoff with ±20% jitter to transient failures.
 * Only retries: network errors (fetch rejection), 5xx responses, 429 rate
 * limits (honours Retry-After header when present).
 * Never retries: AbortError/timeout (budget already expired), 4xx except 429,
 * not-configured errors.
 *
 * Timeout semantics: each attempt has its own 10-second AbortController budget
 * (one per getInstallationToken call). Total wall time is at most
 * (maxRetries + 1) × 10s plus cumulative backoff delays.
 */
export interface RetryPolicy {
  /** Maximum number of retries after the initial attempt. Default: 2. */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds. Default: 500. */
  initialDelayMs?: number;
  /** Maximum backoff delay cap in milliseconds. Default: 4000. */
  maxDelayMs?: number;
  /**
   * Callback fired before each retry — useful for observability hooks (e.g. doctor).
   * @param attempt  - Retry number (1-based)
   * @param reason   - Error message that triggered the retry
   * @param delayMs  - Milliseconds to wait before this retry
   */
  onRetry?: (attempt: number, reason: string, delayMs: number) => void;
  /**
   * Random number generator — injectable seam for deterministic tests.
   * Must return a value in [0, 1). Defaults to Math.random.
   */
  random?: () => number;
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

// ============================================================================
// Retry internals
// ============================================================================

/**
 * Marker error thrown by withRetry when all retry attempts are exhausted for
 * a retryable error. Wraps the last underlying error for diagnosis.
 */
export class RetryExhaustedError extends Error {
  readonly cause: Error;
  constructor(cause: Error, attempts: number) {
    super(`All ${attempts} attempt(s) failed. Last error: ${cause.message}`);
    this.name = 'RetryExhaustedError';
    this.cause = cause;
  }
}

function isRetryable(e: Error): boolean {
  // Never retry timeouts — the per-attempt budget is already expired
  if (e.name === 'AbortError' || e.message.startsWith('fetch timeout')) return false;
  // HTTP errors: only 429 and 5xx are transient
  if (e instanceof GitHubApiError) return e.status === 429 || e.status >= 500;
  // Network-level errors (fetch rejection, ECONNRESET, etc.) → retryable
  return true;
}

/**
 * Execute fn with exponential backoff retry.
 * Throws RetryExhaustedError if all retryable attempts fail.
 * Propagates non-retryable errors immediately without wrapping.
 */
async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  const {
    maxRetries = 2,
    initialDelayMs = 500,
    maxDelayMs = 4000,
    onRetry,
    random = Math.random,
  } = policy;

  let lastError: Error = new Error('unexpected: no attempts made');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!isRetryable(lastError)) throw lastError;
      if (attempt === maxRetries) break;

      // Honour Retry-After for 429; otherwise exponential backoff + ±20% jitter
      let delayMs: number;
      if (lastError instanceof GitHubApiError && lastError.status === 429 && lastError.retryAfterMs !== null) {
        delayMs = lastError.retryAfterMs;
      } else {
        const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt));
        const jitter = base * 0.2 * (2 * random() - 1);
        delayMs = Math.max(0, Math.round(base + jitter));
      }

      onRetry?.(attempt + 1, lastError.message, delayMs);
      await sleep(delayMs);
    }
  }
  throw new RetryExhaustedError(lastError, maxRetries + 1);
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
    const retryAfterHeader = response.headers?.get('Retry-After') ?? null;
    const retryAfterSec = retryAfterHeader !== null ? parseInt(retryAfterHeader, 10) : NaN;
    const retryAfterMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : null;
    throw new GitHubApiError(response.status, body, retryAfterMs);
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

/**
 * In-flight resolution promises keyed by `${squadDir}:${roleKey}`.
 *
 * H-12: When two callers ask for the same role's token simultaneously and both
 * miss the cache, both would otherwise issue independent GitHub API calls. This
 * map dedups concurrent requests — the second caller joins the first caller's
 * promise. Entries are deleted on resolution (success OR failure) so the next
 * fresh call issues a real request.
 *
 * This sits in FRONT of the token cache — cache hits never touch this map.
 */
const inFlight = new Map<string, Promise<TokenResolveResult>>();

/** Tokens are refreshed when within this many ms of expiry. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clear the token cache. Exposed for testing.
 * Also clears any in-flight dedup entries so tests start from a known state.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
  inFlight.clear();
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
 * N-1 fix: single request to /installation (removed redundant /installation/repositories preflight).
 * N-2 fix: dedicated AbortController per fetch (not shared across multiple calls).
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
    const response = await fetch('https://api.github.com/installation', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { permissions?: Record<string, string> };
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
 * @param options.retryPolicy - Optional retry policy for transient network failures.
 *   When provided, retries on network errors, 5xx, and 429 with exponential backoff.
 *   When omitted, a single attempt is made (backward-compatible default).
 */
export async function resolveTokenWithDiagnostics(
  squadDir: string,
  roleKey: string,
  options?: { retryPolicy?: RetryPolicy },
): Promise<TokenResolveResult> {
  // SQUAD_IDENTITY_MOCK hook — returns deterministic mock token without any I/O.
  // Checked before dedup so mock tests don't hit the in-flight map.
  if (process.env['SQUAD_IDENTITY_MOCK'] === '1') {
    const mockToken = process.env['SQUAD_IDENTITY_MOCK_TOKEN'] ?? `mock-token-${roleKey}`;
    return {
      token: mockToken,
      resolvedRoleKey: roleKey,
      error: null,
    };
  }

  const cacheKey = `${squadDir}:${roleKey}`;

  // Fast path: valid cached token — no dedup needed, cache hits are free.
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    const remainingMs = cached.expiresAt.getTime() - Date.now();
    if (remainingMs > REFRESH_MARGIN_MS) {
      return { token: cached.token, resolvedRoleKey: roleKey, error: null };
    }
    tokenCache.delete(cacheKey);
  }

  // H-12: Dedup concurrent misses — second caller joins the first caller's promise.
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = resolveTokenInternal(squadDir, roleKey, cacheKey, options)
    .finally(() => {
      // Release the slot on both success AND failure so the next call is fresh.
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Internal resolution logic — invoked by resolveTokenWithDiagnostics after
 * the in-flight dedup check. Must not be called directly (bypasses dedup).
 */
async function resolveTokenInternal(
  squadDir: string,
  roleKey: string,
  cacheKey: string,
  options?: { retryPolicy?: RetryPolicy },
): Promise<TokenResolveResult> {
  const retryPolicy = options?.retryPolicy;

  try {
    // --- Path 1: Environment variables (CI/CD override) ---
    const { credentials: envCreds, error: envError } = resolveEnvCredentials(roleKey);

    if (envError) {
      // Partial env config — fail loudly (runtime error, not just not-configured)
      return {
        token: null,
        resolvedRoleKey: null,
        error: { kind: 'runtime', message: envError, retriesExhausted: false },
      };
    }

    if (envCreds) {
      const jwt = buildJWT(envCreds.appId, envCreds.pem);
      const { token, expiresAt } = retryPolicy !== undefined
        ? await withRetry(() => getInstallationToken(jwt, envCreds.installationId), retryPolicy)
        : await getInstallationToken(jwt, envCreds.installationId);
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
          retriesExhausted: false,
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
          retriesExhausted: false,
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
          retriesExhausted: false,
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
    const { token, expiresAt } = retryPolicy !== undefined
      ? await withRetry(() => getInstallationToken(jwt, reg.installationId), retryPolicy)
      : await getInstallationToken(jwt, reg.installationId);

    // Cache
    tokenCache.set(cacheKey, { token, expiresAt });
    return { token, resolvedRoleKey: roleKey, error: null };

  } catch (e) {
    const retriesExhausted = e instanceof RetryExhaustedError;
    const underlying = retriesExhausted ? (e as RetryExhaustedError).cause : e;
    const message = underlying instanceof Error ? underlying.message : String(underlying);
    // Unexpected runtime error — log to stderr, return runtime error
    process.stderr.write(
      `[squad identity] unexpected error resolving "${roleKey}": ${message}\n`,
    );
    return {
      token: null,
      resolvedRoleKey: null,
      error: { kind: 'runtime', message, retriesExhausted },
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
 * @param options.retryPolicy - Optional retry policy (see resolveTokenWithDiagnostics)
 * @returns Installation access token string, or null if credentials are missing
 */
export async function resolveToken(
  squadDir: string,
  roleKey: string,
  options?: { retryPolicy?: RetryPolicy },
): Promise<string | null> {
  const result = await resolveTokenWithDiagnostics(squadDir, roleKey, options);
  return result.token ?? null;
}

/**
 * Synchronous, cache-only token lookup.
 *
 * H-09: Many hot paths (e.g. agent spawn) just want to answer "is there a
 * cached token for this role right now?" without committing to an async
 * filesystem read, JWT sign, or network call. This function returns:
 *   - the cached token string if one is cached AND more than 10 minutes from expiry
 *   - the deterministic mock token when SQUAD_IDENTITY_MOCK=1 (matches async behaviour)
 *   - null otherwise (no cache, cache expired, no mock)
 *
 * It does NOT:
 *   - Read from disk (no PEM load, no registration load)
 *   - Generate a JWT
 *   - Call the GitHub API
 *   - Populate the cache
 *
 * Callers should treat `null` as "fall through to the async `resolveToken`",
 * not as "identity is not configured" — absence here means "not hot right now".
 *
 * @param squadDir - Project root directory (parent of `.squad/`)
 * @param roleKey - Role key (e.g., 'lead', 'backend')
 * @returns Cached token string, or null if no valid cached entry exists
 */
export function resolveTokenSync(squadDir: string, roleKey: string): string | null {
  if (process.env['SQUAD_IDENTITY_MOCK'] === '1') {
    return process.env['SQUAD_IDENTITY_MOCK_TOKEN'] ?? `mock-token-${roleKey}`;
  }

  const cacheKey = `${squadDir}:${roleKey}`;
  const cached = tokenCache.get(cacheKey);
  if (!cached) return null;

  const remainingMs = cached.expiresAt.getTime() - Date.now();
  if (remainingMs <= REFRESH_MARGIN_MS) return null;

  return cached.token;
}
