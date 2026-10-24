/**
 * Tests for the resolveSquad / findSquadDir cache.
 *
 * Covers:
 *   - cache hits avoid the filesystem walk
 *   - explicit clearResolveSquadCache() invalidates immediately
 *   - SQUAD_NO_RESOLVE_CACHE=1 disables both caches
 *   - cache returns null for misses (and re-checks after invalidation)
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
