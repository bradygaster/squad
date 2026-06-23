/**
 * Tests for the resolveSquad / findSquadDir cache.
 *
 * Covers:
 *   - cache hits avoid the filesystem walk
 *   - explicit clearResolveSquadCache() invalidates immediately
 *   - SQUAD_NO_RESOLVE_CACHE=1 disables both caches
 *   - cache returns null for misses (and re-checks after invalidation)
 *   - multi-squad.resolveSquadPath() reads squads.json once per call
 *
 * NOTE: TTL-based expiry is tested by mocking Date.now() so the suite runs
 * fast even though the real TTL is 5 seconds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

import {
  resolveSquad,
  clearResolveSquadCache,
} from '@bradygaster/squad-sdk/resolution';
import * as resolutionModule from '@bradygaster/squad-sdk/resolution';

const TMP = join(tmpdir(), `squad-cache-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

describe('resolveSquad cache', () => {
  beforeEach(() => {
    clearResolveSquadCache();
    delete process.env['SQUAD_NO_RESOLVE_CACHE'];
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    clearResolveSquadCache();
    delete process.env['SQUAD_NO_RESOLVE_CACHE'];
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns the same path on repeated calls (positive hit)', () => {
    scaffold('.git', '.squad');
    const first = resolveSquad(TMP);
    const second = resolveSquad(TMP);
    expect(first).toBe(join(TMP, '.squad'));
    expect(second).toBe(first);
  });

  it('serves a cached null when .squad/ is added after the first lookup (until invalidated)', () => {
    scaffold('.git');
    expect(resolveSquad(TMP)).toBeNull();

    // Add .squad/ AFTER the cache has stored null
    mkdirSync(join(TMP, '.squad'), { recursive: true });

    // Without invalidation, the cached null is still served
    expect(resolveSquad(TMP)).toBeNull();

    // Explicit invalidation forces a fresh walk
    clearResolveSquadCache();
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));
  });

  it('serves a cached path even when the underlying directory is removed (until invalidated)', () => {
    scaffold('.git', '.squad');
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));

    rmSync(join(TMP, '.squad'), { recursive: true, force: true });

    // Cached value still returned
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));

    // Invalidation lets the next lookup observe the removal
    clearResolveSquadCache();
    expect(resolveSquad(TMP)).toBeNull();
  });

  it('SQUAD_NO_RESOLVE_CACHE=1 disables the cache entirely', () => {
    process.env['SQUAD_NO_RESOLVE_CACHE'] = '1';
    scaffold('.git');
    expect(resolveSquad(TMP)).toBeNull();

    // Add .squad/ — without cache, the next call reflects FS state immediately
    mkdirSync(join(TMP, '.squad'), { recursive: true });
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));
  });

  it('clearResolveSquadCache() is a no-op when nothing is cached', () => {
    expect(() => clearResolveSquadCache()).not.toThrow();
    // Sanity: a fresh lookup still works after clearing an empty cache
    scaffold('.git', '.squad');
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));
  });

  it('TTL expiry causes a re-walk after the configured window elapses', () => {
    // The cache uses Date.now() with a 5_000 ms TTL. Mocking Date.now lets
    // us assert the expiry behavior without sleeping for 5 seconds.
    scaffold('.git');
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(realNow);
    expect(resolveSquad(TMP)).toBeNull();

    // Add .squad/ AFTER caching the null
    mkdirSync(join(TMP, '.squad'), { recursive: true });

    // Within TTL → cached null still served
    nowSpy.mockReturnValue(realNow + 4_999);
    expect(resolveSquad(TMP)).toBeNull();

    // Just past TTL → cache miss, fresh walk observes new .squad/
    nowSpy.mockReturnValue(realNow + 5_001);
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));

    nowSpy.mockRestore();
  });

  it('separate startDir keys are cached independently', () => {
    scaffold('.git', '.squad', 'sub');
    const subDir = join(TMP, 'sub');

    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));
    expect(resolveSquad(subDir)).toBe(join(TMP, '.squad'));

    // Removing the subdir should not invalidate the parent's cached entry
    rmSync(subDir, { recursive: true, force: true });
    expect(resolveSquad(TMP)).toBe(join(TMP, '.squad'));
  });

  it('exports clearResolveSquadCache from the SDK barrel', async () => {
    const sdk = await import('@bradygaster/squad-sdk');
    expect(typeof sdk.clearResolveSquadCache).toBe('function');
    // It should be the SAME function reference as the resolution module's export
    expect(sdk.clearResolveSquadCache).toBe(resolutionModule.clearResolveSquadCache);
  });
});

// ============================================================================
// multi-squad.resolveSquadPath() — verify squads.json is read once per call
// ============================================================================

describe('multi-squad.resolveSquadPath() — config read dedupe', () => {
  // We assert dedupe behaviorally by counting how many times squads.json is
  // parsed during a single call. Using vi.stubEnv() instead of direct
  // process.env mutation keeps env isolated from parallel test files.

  const HOME = join(tmpdir(), `squad-multi-${randomBytes(4).toString('hex')}`);

  function getSquadsJsonPath(): string {
    if (process.platform === 'win32') {
      return join(HOME, 'squad', 'squads.json');
    } else if (process.platform === 'darwin') {
      return join(HOME, 'Library', 'Application Support', 'squad', 'squads.json');
    }
    return join(HOME, 'squad', 'squads.json');
  }

  beforeEach(() => {
    if (existsSync(HOME)) rmSync(HOME, { recursive: true, force: true });
    mkdirSync(HOME, { recursive: true });
    vi.stubEnv('HOME', HOME);
    vi.stubEnv('XDG_CONFIG_HOME', HOME);
    vi.stubEnv('APPDATA', HOME);
    // NOTE: do NOT stub SQUAD_NAME here. The resolution chain in
    // resolveSquadPath() uses `??` which treats '' as a valid value (only
    // null/undefined trigger the fallback). Setting it to '' would cause
    // `resolved` to be the empty string instead of falling through to
    // config?.active. We want it to remain undefined for these tests.
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(HOME)) rmSync(HOME, { recursive: true, force: true });
  });

  it('reads squads.json exactly once per resolveSquadPath() call', async () => {
    // Import the multi-squad module directly from the built dist; it isn't
    // re-exported from the SDK barrel.
    const distUrl = new URL(
      '../packages/squad-sdk/dist/multi-squad.js',
      import.meta.url,
    ).href;
    const multiSquad = (await import(/* @vite-ignore */ distUrl)) as {
      resolveSquadPath: (name?: string) => string;
    };
    const { resolveSquadPath } = multiSquad;

    // Manually scaffold a valid squads.json for the temp HOME
    const squadsJson = getSquadsJsonPath();
    mkdirSync(join(squadsJson, '..'), { recursive: true });
    const expectedContent =
      JSON.stringify(
        {
          squads: [
            {
              name: 'alpha',
              path: join(HOME, 'squad', 'squads', 'alpha'),
              created_at: new Date().toISOString(),
            },
          ],
          active: 'alpha',
        },
        null,
        2,
      ) + '\n';
    writeFileSync(squadsJson, expectedContent, 'utf-8');

    // Count squads.json parses by spying on JSON.parse and matching content.
    const originalParse = JSON.parse;
    let reads = 0;
    JSON.parse = function patchedParse(text: string, ...rest: unknown[]) {
      if (typeof text === 'string' && text === expectedContent) {
        reads++;
      }
      // @ts-expect-error variadic forward
      return originalParse(text, ...rest);
    };

    try {
      const resolved = resolveSquadPath();
      expect(resolved).toBe(join(HOME, 'squad', 'squads', 'alpha'));
    } finally {
      JSON.parse = originalParse;
    }

    // Pre-fix: 2 reads (active fallback + entry lookup).
    // Post-fix: exactly 1.
    expect(reads).toBe(1);
  });
});
