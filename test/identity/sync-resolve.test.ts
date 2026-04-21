/**
 * Tests for H-09 — synchronous cache-only token resolver.
 *
 * `resolveTokenSync` is a hot-path helper for callers that just want to know
 * whether a token is currently cached. It MUST NOT perform I/O:
 *   - No filesystem reads
 *   - No JWT signing
 *   - No network calls
 *
 * @see packages/squad-sdk/src/identity/tokens.ts
 * @module test/identity/sync-resolve
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveToken,
  resolveTokenSync,
  clearTokenCache,
} from '@bradygaster/squad-sdk/identity';

const { privateKey: TEST_PEM } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const tmpDirs: string[] = [];

function makeProject(role: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-sync-test-'));
  tmpDirs.push(dir);
  const appsDir = join(dir, '.squad', 'identity', 'apps');
  const keysDir = join(dir, '.squad', 'identity', 'keys');
  mkdirSync(appsDir, { recursive: true });
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(
    join(appsDir, `${role}.json`),
    JSON.stringify({ appId: 12345, appSlug: 'test-app', installationId: 99999 }),
  );
  writeFileSync(join(keysDir, `${role}.pem`), TEST_PEM);
  return dir;
}

afterEach(() => {
  clearTokenCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tmpDirs.length = 0;
  delete process.env['SQUAD_IDENTITY_MOCK'];
  delete process.env['SQUAD_IDENTITY_MOCK_TOKEN'];
});

describe('resolveTokenSync', () => {
  it('returns null on cache miss', () => {
    const dir = makeProject('lead');
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const token = resolveTokenSync(dir, 'lead');
    expect(token).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached token after a prior async resolution', async () => {
    const dir = makeProject('lead');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'ghs_warm', expires_at: expiresAt }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await resolveToken(dir, 'lead');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    const token = resolveTokenSync(dir, 'lead');
    expect(token).toBe('ghs_warm');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when cached token is within the refresh margin', async () => {
    const dir = makeProject('lead');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'ghs_near_expiry', expires_at: expiresAt }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await resolveToken(dir, 'lead');
    mockFetch.mockClear();
    expect(resolveTokenSync(dir, 'lead')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never reads from disk — works even when registration and PEM are missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-sync-empty-'));
    tmpDirs.push(dir);

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    expect(resolveTokenSync(dir, 'lead')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns mock token under SQUAD_IDENTITY_MOCK=1 (matches async parity)', () => {
    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    const dir = mkdtempSync(join(tmpdir(), 'squad-sync-mock-'));
    tmpDirs.push(dir);

    expect(resolveTokenSync(dir, 'lead')).toBe('mock-token-lead');

    process.env['SQUAD_IDENTITY_MOCK_TOKEN'] = 'custom-mock';
    expect(resolveTokenSync(dir, 'backend')).toBe('custom-mock');
  });

  it('is synchronous — return type is not a Promise', () => {
    const dir = makeProject('lead');
    const result = resolveTokenSync(dir, 'lead');
    expect(result === null || typeof (result as unknown as { then?: unknown }).then !== 'function').toBe(true);
  });
});
