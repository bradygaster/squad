/**
 * Tests for identity token lifecycle — JWT generation, installation token
 * exchange, and token caching with graceful fallback.
 *
 * Uses node:crypto to generate test RSA key pairs in-process.
 *
 * @see packages/squad-sdk/src/identity/tokens.ts
 * @module test/identity/tokens
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateAppJWT,
  getInstallationToken,
  resolveToken,
  clearTokenCache,
} from '@bradygaster/squad-sdk/identity';

// ============================================================================
// Test RSA key pair — generated once for all tests
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
  const dir = mkdtempSync(join(tmpdir(), 'squad-token-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  clearTokenCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// Base64url decode helper for inspecting JWT payloads
// ============================================================================

function decodeBase64url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

// ============================================================================
// generateAppJWT
// ============================================================================

describe('generateAppJWT', () => {
  it('produces a valid 3-part JWT string', async () => {
    const jwt = await generateAppJWT(12345, TEST_PEM);

    expect(typeof jwt).toBe('string');
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);

    // Each part should be non-empty base64url
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('encodes RS256 algorithm in header', async () => {
    const jwt = await generateAppJWT(99, TEST_PEM);
    const [headerB64] = jwt.split('.');
    const header = JSON.parse(decodeBase64url(headerB64!));

    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
  });

  it('encodes correct iss, iat, exp in payload', async () => {
    const appId = 42;
    const beforeTime = Math.floor(Date.now() / 1000);

    const jwt = await generateAppJWT(appId, TEST_PEM);

    const afterTime = Math.floor(Date.now() / 1000);
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(decodeBase64url(payloadB64!));

    expect(payload.iss).toBe(appId);

    // iat should be ~60 seconds before now
    expect(payload.iat).toBeGreaterThanOrEqual(beforeTime - 61);
    expect(payload.iat).toBeLessThanOrEqual(afterTime - 59);

    // exp should be ~540 seconds from now (9 minutes)
    expect(payload.exp).toBeGreaterThanOrEqual(beforeTime + 539);
    expect(payload.exp).toBeLessThanOrEqual(afterTime + 541);
  });

  it('produces different JWTs for different app IDs', async () => {
    const jwt1 = await generateAppJWT(1, TEST_PEM);
    const jwt2 = await generateAppJWT(2, TEST_PEM);

    // Different iss should produce different payloads and signatures
    expect(jwt1).not.toBe(jwt2);
  });
});

// ============================================================================
// resolveToken — integration-style tests (no real GitHub API)
// ============================================================================

describe('resolveToken', () => {
  it('returns null when no PEM exists', async () => {
    const dir = makeTmpDir();
    // Create app registration but no PEM
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    mkdirSync(appsDir, { recursive: true });
    writeFileSync(
      join(appsDir, 'lead.json'),
      JSON.stringify({ appId: 1, appSlug: 'test', installationId: 100 }),
    );

    const result = await resolveToken(dir, 'lead');
    expect(result).toBeNull();
  });

  it('returns null when no app registration exists', async () => {
    const dir = makeTmpDir();
    // Create PEM but no app registration
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(join(keysDir, 'lead.pem'), TEST_PEM);

    const result = await resolveToken(dir, 'lead');
    expect(result).toBeNull();
  });

  it('returns null for completely empty directory', async () => {
    const dir = makeTmpDir();
    const result = await resolveToken(dir, 'backend');
    expect(result).toBeNull();
  });
});

// ============================================================================
// Token cache behavior
// ============================================================================

describe('token cache', () => {
  it('returns cached token on second call (mocked API)', async () => {
    const dir = makeTmpDir();

    // Set up storage
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(appsDir, { recursive: true });
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(
      join(appsDir, 'lead.json'),
      JSON.stringify({ appId: 1, appSlug: 'test-app', installationId: 100 }),
    );
    writeFileSync(join(keysDir, 'lead.pem'), TEST_PEM);

    // Mock fetch to return a fake installation token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_fake_token_12345',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // First call — should hit the API
    const token1 = await resolveToken(dir, 'lead');
    expect(token1).toBe('ghs_fake_token_12345');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — should return cached value without hitting API again
    const token2 = await resolveToken(dir, 'lead');
    expect(token2).toBe('ghs_fake_token_12345');
    expect(mockFetch).toHaveBeenCalledTimes(1); // still just 1 call
  });

  it('clearTokenCache forces re-fetch', async () => {
    const dir = makeTmpDir();

    const appsDir = join(dir, '.squad', 'identity', 'apps');
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(appsDir, { recursive: true });
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(
      join(appsDir, 'lead.json'),
      JSON.stringify({ appId: 1, appSlug: 'test-app', installationId: 100 }),
    );
    writeFileSync(join(keysDir, 'lead.pem'), TEST_PEM);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_refreshed_token',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await resolveToken(dir, 'lead');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    clearTokenCache();

    await resolveToken(dir, 'lead');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// resolveToken — environment variable credential override
// ============================================================================

describe('resolveToken with env vars', () => {
  const ENV_KEYS = [
    'SQUAD_BACKEND_APP_ID',
    'SQUAD_BACKEND_PRIVATE_KEY',
    'SQUAD_BACKEND_INSTALLATION_ID',
  ] as const;

  afterEach(() => {
    // Clean up env vars after every test in this block
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it('uses env var credentials when all three are set (raw PEM)', async () => {
    // Set up env vars with raw PEM (starts with -----BEGIN)
    process.env.SQUAD_BACKEND_APP_ID = '55555';
    process.env.SQUAD_BACKEND_PRIVATE_KEY = TEST_PEM;
    process.env.SQUAD_BACKEND_INSTALLATION_ID = '99999';

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_env_token',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Pass a directory with NO filesystem credentials — env var should still work
    const dir = makeTmpDir();
    const result = await resolveToken(dir, 'backend');

    expect(result).toBe('ghs_env_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('decodes base64-encoded PEM from env var', async () => {
    const pemBase64 = Buffer.from(TEST_PEM).toString('base64');

    process.env.SQUAD_BACKEND_APP_ID = '55555';
    process.env.SQUAD_BACKEND_PRIVATE_KEY = pemBase64;
    process.env.SQUAD_BACKEND_INSTALLATION_ID = '99999';

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_base64_env_token',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const dir = makeTmpDir();
    const result = await resolveToken(dir, 'backend');

    expect(result).toBe('ghs_base64_env_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to filesystem when only partial env vars are set', async () => {
    // Only set 2 of 3 env vars — should NOT use env path
    process.env.SQUAD_BACKEND_APP_ID = '55555';
    process.env.SQUAD_BACKEND_INSTALLATION_ID = '99999';
    // SQUAD_BACKEND_PRIVATE_KEY is intentionally NOT set

    const dir = makeTmpDir();

    // Set up filesystem credentials so we can verify fallback
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(appsDir, { recursive: true });
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(
      join(appsDir, 'backend.json'),
      JSON.stringify({ appId: 77, appSlug: 'fs-app', installationId: 200 }),
    );
    writeFileSync(join(keysDir, 'backend.pem'), TEST_PEM);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_filesystem_token',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await resolveToken(dir, 'backend');

    // Should have used filesystem credentials (appId 77), not env var (55555)
    expect(result).toBe('ghs_filesystem_token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('env var takes precedence over filesystem credentials', async () => {
    const dir = makeTmpDir();

    // Set up BOTH filesystem and env var credentials
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(appsDir, { recursive: true });
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(
      join(appsDir, 'backend.json'),
      JSON.stringify({ appId: 77, appSlug: 'fs-app', installationId: 200 }),
    );
    writeFileSync(join(keysDir, 'backend.pem'), TEST_PEM);

    process.env.SQUAD_BACKEND_APP_ID = '55555';
    process.env.SQUAD_BACKEND_PRIVATE_KEY = TEST_PEM;
    process.env.SQUAD_BACKEND_INSTALLATION_ID = '99999';

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      // Verify the installation ID used — env var should use 99999
      expect(url).toContain('/99999/');
      return {
        ok: true,
        json: async () => ({
          token: 'ghs_env_wins',
          expires_at: expiresAt,
        }),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await resolveToken(dir, 'backend');

    expect(result).toBe('ghs_env_wins');
    expect(callCount).toBe(1);
  });

  it('returns null when no env vars and no filesystem credentials exist', async () => {
    const dir = makeTmpDir();
    const result = await resolveToken(dir, 'backend');
    expect(result).toBeNull();
  });
});

// ============================================================================
// getInstallationToken — error handling
// ============================================================================

describe('getInstallationToken', () => {
  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"message":"Bad credentials"}',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      getInstallationToken('fake-jwt', 999),
    ).rejects.toThrow('GitHub API error 401');
  });

  it('returns token and expiry on success', async () => {
    const expiresAt = '2025-12-31T23:59:59Z';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'ghs_test_token',
        expires_at: expiresAt,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getInstallationToken('valid-jwt', 123);
    expect(result.token).toBe('ghs_test_token');
    expect(result.expiresAt).toEqual(new Date(expiresAt));
  });
});
