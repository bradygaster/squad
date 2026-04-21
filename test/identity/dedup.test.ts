/**
 * Tests for H-12 — concurrent same-role token resolution deduplication.
 *
 * Verifies that simultaneous callers for the same (squadDir, roleKey) share
 * a single in-flight promise (single getInstallationToken invocation), and
 * that the in-flight slot is released on both success and failure.
 *
 * @see packages/squad-sdk/src/identity/tokens.ts
 * @module test/identity/dedup
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveToken,
  resolveTokenWithDiagnostics,
  clearTokenCache,
} from '@bradygaster/squad-sdk/identity';

const { privateKey: TEST_PEM } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const tmpDirs: string[] = [];

function makeProject(role: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-dedup-test-'));
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
});

describe('H-12: concurrent resolveToken dedup', () => {
  it('two concurrent callers share a single fetch invocation', async () => {
    const dir = makeProject('lead');

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => { release = resolve; });
    const mockFetch = vi.fn(() => gate);
    vi.stubGlobal('fetch', mockFetch);

    const p1 = resolveToken(dir, 'lead');
    const p2 = resolveToken(dir, 'lead');

    expect(mockFetch).toHaveBeenCalledTimes(1);

    release({
      ok: true,
      json: async () => ({
        token: 'ghs_deduped',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    } as unknown as Response);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('ghs_deduped');
    expect(r2).toBe('ghs_deduped');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers receive the same result (diagnostics path)', async () => {
    const dir = makeProject('lead');

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => { release = resolve; });
    const mockFetch = vi.fn(() => gate);
    vi.stubGlobal('fetch', mockFetch);

    const p1 = resolveTokenWithDiagnostics(dir, 'lead');
    const p2 = resolveTokenWithDiagnostics(dir, 'lead');

    expect(mockFetch).toHaveBeenCalledTimes(1);

    release({
      ok: true,
      json: async () => ({
        token: 'ghs_shared',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    } as unknown as Response);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.token).toBe('ghs_shared');
    expect(r2.token).toBe('ghs_shared');
  });

  it('different roles are NOT deduped against each other', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-dedup-test-'));
    tmpDirs.push(dir);
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(appsDir, { recursive: true });
    mkdirSync(keysDir, { recursive: true });
    for (const role of ['lead', 'backend']) {
      writeFileSync(
        join(appsDir, `${role}.json`),
        JSON.stringify({ appId: 12345, appSlug: `app-${role}`, installationId: 99999 }),
      );
      writeFileSync(join(keysDir, `${role}.pem`), TEST_PEM);
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ token: 'ghs_role_specific', expires_at: expiresAt }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    await Promise.all([
      resolveToken(dir, 'lead'),
      resolveToken(dir, 'backend'),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('releases in-flight slot on failure — next call issues a fresh fetch', async () => {
    const dir = makeProject('lead');

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('boom — network'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'ghs_recovered',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const [r1, r2] = await Promise.all([
      resolveToken(dir, 'lead'),
      resolveToken(dir, 'lead'),
    ]);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const r3 = await resolveToken(dir, 'lead');
    expect(r3).toBe('ghs_recovered');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cache hit path does not enter the in-flight map', async () => {
    const dir = makeProject('lead');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'ghs_first', expires_at: expiresAt }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await resolveToken(dir, 'lead');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    const [r1, r2] = await Promise.all([
      resolveToken(dir, 'lead'),
      resolveToken(dir, 'lead'),
    ]);
    expect(r1).toBe('ghs_first');
    expect(r2).toBe('ghs_first');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
