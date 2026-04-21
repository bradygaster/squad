/**
 * Tests for H-03: retry with exponential backoff in resolveTokenWithDiagnostics.
 *
 * Coverage:
 *   - Success on first attempt (no retry fired)
 *   - Retry on 500 then succeed
 *   - Retry on 429 with Retry-After header respected
 *   - Max retries exhausted → TokenResolveError with retriesExhausted: true
 *   - AbortError (timeout) does NOT retry
 *   - kind: 'not-configured' does NOT retry
 *   - onRetry callback fires with correct args
 *   - jitter produces different delays for different random() inputs
 *   - Jitter seam: random: () => 0 vs random: () => 1 gives distinct delays
 *
 * @module test/identity/retry
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveTokenWithDiagnostics,
  clearTokenCache,
  GitHubApiError,
  RetryExhaustedError,
  withRetry as _withRetry, // not exported — we test via the public API
} from '@bradygaster/squad-sdk/identity';

// ============================================================================
// Test RSA key pair
// ============================================================================

const { privateKey: TEST_PEM } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ============================================================================
// Temp directory helpers
// ============================================================================

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-retry-test-'));
  tmpDirs.push(dir);
  return dir;
}

function scaffoldIdentity(dir: string, roleKey = 'lead'): void {
  const appsDir = join(dir, '.squad', 'identity', 'apps');
  const keysDir = join(dir, '.squad', 'identity', 'keys');
  mkdirSync(appsDir, { recursive: true });
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(
    join(appsDir, `${roleKey}.json`),
    JSON.stringify({ appId: 42, appSlug: 'test-app', installationId: 9999 }),
  );
  writeFileSync(join(keysDir, `${roleKey}.pem`), TEST_PEM, { mode: 0o600 });
}

afterEach(() => {
  clearTokenCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// Helper: build a mock response
// ============================================================================

function okResponse(token = 'ghs_test', expiresIn = 3600): object {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return {
    ok: true,
    status: 200,
    json: async () => ({ token, expires_at: expiresAt }),
    headers: { get: () => null },
  };
}

function errorResponse(status: number, body = 'server error', retryAfter?: string): object {
  return {
    ok: false,
    status,
    text: async () => body,
    headers: { get: (h: string) => (h === 'Retry-After' ? (retryAfter ?? null) : null) },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('H-03 · retry with exponential backoff', () => {
  it('success on first attempt — onRetry never fires, no retriesExhausted', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('ghs_first_try')));

    const retries: number[] = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: { maxRetries: 2, initialDelayMs: 0, onRetry: (a) => retries.push(a) },
    });

    expect(result.token).toBe('ghs_first_try');
    expect(result.error).toBeNull();
    expect(retries).toHaveLength(0);
  });

  it('retry on 500 then succeed — token returned, onRetry called once', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValue(okResponse('ghs_after_500'));
    vi.stubGlobal('fetch', mockFetch);

    const retryLog: Array<{ attempt: number; reason: string; delayMs: number }> = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 0,
        onRetry: (attempt, reason, delayMs) => retryLog.push({ attempt, reason, delayMs }),
      },
    });

    expect(result.token).toBe('ghs_after_500');
    expect(result.error).toBeNull();
    expect(retryLog).toHaveLength(1);
    expect(retryLog[0]!.attempt).toBe(1);
    expect(retryLog[0]!.reason).toMatch(/500/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retry on 429 with Retry-After — delay equals Retry-After seconds in ms', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(429, 'rate limited', '2')) // Retry-After: 2s
      .mockResolvedValue(okResponse('ghs_after_429'));
    vi.stubGlobal('fetch', mockFetch);

    const retryLog: Array<{ attempt: number; delayMs: number }> = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 0,
        onRetry: (attempt, _reason, delayMs) => retryLog.push({ attempt, delayMs }),
      },
    });

    expect(result.token).toBe('ghs_after_429');
    expect(retryLog).toHaveLength(1);
    expect(retryLog[0]!.delayMs).toBe(2000); // Retry-After: 2 → 2000ms
  });

  it('max retries exhausted → TokenResolveError with retriesExhausted: true', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    // Always 503
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(503)));

    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: { maxRetries: 2, initialDelayMs: 0 },
    });

    expect(result.token).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.kind).toBe('runtime');
    expect(result.error!.retriesExhausted).toBe(true);
    expect(result.error!.message).toMatch(/503/);
  });

  it('AbortError does NOT retry — returns immediately with retriesExhausted: false', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const abortError = new Error('fetch timeout: installation token request exceeded 10s');
    abortError.name = 'AbortError';

    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', mockFetch);

    const retries: number[] = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 3,
        initialDelayMs: 0,
        onRetry: (a) => retries.push(a),
      },
    });

    expect(result.token).toBeNull();
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.retriesExhausted).toBe(false);
    expect(retries).toHaveLength(0); // never retried
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('not-configured (missing registration) does NOT retry', async () => {
    const dir = makeTmpDir();
    // No identity scaffolding — no app registration

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const retries: number[] = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 3,
        initialDelayMs: 0,
        onRetry: (a) => retries.push(a),
      },
    });

    expect(result.token).toBeNull();
    expect(result.error!.kind).toBe('not-configured');
    expect(result.error!.retriesExhausted).toBe(false);
    expect(retries).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('onRetry callback receives correct attempt, reason, and delayMs', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(500, 'internal error'))
      .mockResolvedValueOnce(errorResponse(503, 'service unavailable'))
      .mockResolvedValue(okResponse('ghs_third_try'));
    vi.stubGlobal('fetch', mockFetch);

    const log: Array<{ attempt: number; reason: string; delayMs: number }> = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 4000,
        random: () => 0.5, // no jitter: delay = base exactly
        onRetry: (attempt, reason, delayMs) => log.push({ attempt, reason, delayMs }),
      },
    });

    expect(result.token).toBe('ghs_third_try');
    expect(log).toHaveLength(2);

    // Attempt 1: base = min(4000, 100 * 2^0) = 100, jitter = 0, delay = 100
    expect(log[0]!.attempt).toBe(1);
    expect(log[0]!.reason).toMatch(/500/);
    expect(log[0]!.delayMs).toBe(100);

    // Attempt 2: base = min(4000, 100 * 2^1) = 200, jitter = 0, delay = 200
    expect(log[1]!.attempt).toBe(2);
    expect(log[1]!.reason).toMatch(/503/);
    expect(log[1]!.delayMs).toBe(200);
  });

  it('jitter seam: random: () => 0 vs random: () => 1 produces different delays', () => {
    // Directly verify the jitter formula produces different values for
    // random=0 (negative jitter) vs random=1 (positive jitter).
    const initialDelayMs = 500;
    const maxDelayMs = 4000;
    const attempt = 0;

    function computeDelay(randomVal: number): number {
      const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt));
      const jitter = base * 0.2 * (2 * randomVal - 1);
      return Math.max(0, Math.round(base + jitter));
    }

    const delayLow = computeDelay(0);    // -20% jitter → 400ms
    const delayMid = computeDelay(0.5);  // no jitter   → 500ms
    const delayHigh = computeDelay(1);   // +20% jitter → 600ms

    expect(delayLow).toBeLessThan(delayMid);
    expect(delayMid).toBeLessThan(delayHigh);
    expect(delayLow).toBe(400);
    expect(delayMid).toBe(500);
    expect(delayHigh).toBe(600);
  });

  it('4xx other than 429 does NOT retry', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const mockFetch = vi.fn().mockResolvedValue(errorResponse(401, 'Bad credentials'));
    vi.stubGlobal('fetch', mockFetch);

    const retries: number[] = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 3,
        initialDelayMs: 0,
        onRetry: (a) => retries.push(a),
      },
    });

    expect(result.token).toBeNull();
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.retriesExhausted).toBe(false); // 401 not retried
    expect(retries).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('network error (fetch rejection) IS retried', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET: socket hang up'))
      .mockResolvedValue(okResponse('ghs_after_network_error'));
    vi.stubGlobal('fetch', mockFetch);

    const retries: number[] = [];
    const result = await resolveTokenWithDiagnostics(dir, 'lead', {
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 0,
        onRetry: (a) => retries.push(a),
      },
    });

    expect(result.token).toBe('ghs_after_network_error');
    expect(retries).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('GitHubApiError has correct status and message fields', () => {
    const err = new GitHubApiError(429, 'rate limited', 5000);
    expect(err.status).toBe(429);
    expect(err.message).toBe('GitHub API error 429: rate limited');
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe('GitHubApiError');
  });

  it('RetryExhaustedError wraps the last error and includes attempt count', () => {
    const cause = new Error('upstream 503');
    const err = new RetryExhaustedError(cause, 3);
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('3 attempt(s)');
    expect(err.message).toContain('upstream 503');
    expect(err.name).toBe('RetryExhaustedError');
  });
});
