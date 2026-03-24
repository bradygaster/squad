/**
 * StorageProvider Contract Test Factory
 *
 * Runs the full conformance suite against ANY StorageProvider implementation.
 * Each test is provider-agnostic — no fs-specific or in-memory-specific assertions.
 *
 * All 11 interface methods are covered:
 *   Async: read, write, append, exists, list, delete, deleteDir
 *   Sync:  readSync, writeSync, existsSync, listSync
 *
 * Edge cases: empty content, paths with spaces, nested dirs, overwrite
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StorageProvider } from '../packages/squad-sdk/src/storage/storage-provider.js';

export function runStorageProviderContractTests(
  name: string,
  factory: () => Promise<{ provider: StorageProvider; cleanup: () => Promise<void> }>
) {
  describe(`StorageProvider contract: ${name}`, () => {
    let provider: StorageProvider;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const ctx = await factory();
      provider = ctx.provider;
      cleanup = ctx.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    // ── read ───────────────────────────────────────────────────────────────

    describe('read', () => {
      it('returns string content for an existing file', async () => {
        await provider.write('contract/read.txt', 'hello');
        const result = await provider.read('contract/read.txt');
        expect(result).toBe('hello');
      });

      it('returns undefined for a non-existent file (ENOENT)', async () => {
        const result = await provider.read('contract/no-such-file.txt');
        expect(result).toBeUndefined();
      });
    });

    // ── write ──────────────────────────────────────────────────────────────

    describe('write', () => {
      it('creates a new file', async () => {
        await provider.write('contract/new.txt', 'created');
        expect(await provider.read('contract/new.txt')).toBe('created');
      });

      it('overwrites existing content', async () => {
        await provider.write('contract/ow.txt', 'first');
        await provider.write('contract/ow.txt', 'second');
        expect(await provider.read('contract/ow.txt')).toBe('second');
      });

      it('creates parent directories recursively', async () => {
        await provider.write('contract/deep/nested/dir/file.txt', 'deep');
        expect(await provider.read('contract/deep/nested/dir/file.txt')).toBe('deep');
      });

      it('handles empty string content', async () => {
        await provider.write('contract/empty.txt', '');
        const result = await provider.read('contract/empty.txt');
        expect(result).toBe('');
      });
    });

    // ── append ─────────────────────────────────────────────────────────────

    describe('append', () => {
      it('creates file if missing', async () => {
        await provider.append('contract/append-new.txt', 'first');
        expect(await provider.read('contract/append-new.txt')).toBe('first');
      });

      it('appends to existing content', async () => {
        await provider.write('contract/append-existing.txt', 'A');
        await provider.append('contract/append-existing.txt', 'B');
        expect(await provider.read('contract/append-existing.txt')).toBe('AB');
      });
    });

    // ── exists ─────────────────────────────────────────────────────────────

    describe('exists', () => {
      it('returns true for an existing file', async () => {
        await provider.write('contract/exists.txt', 'data');
        expect(await provider.exists('contract/exists.txt')).toBe(true);
      });

      it('returns false for a missing path', async () => {
        expect(await provider.exists('contract/ghost.txt')).toBe(false);
      });
    });

    // ── list ───────────────────────────────────────────────────────────────

    describe('list', () => {
      it('returns entry names in a directory', async () => {
        await provider.write('contract/ls/a.txt', 'a');
        await provider.write('contract/ls/b.txt', 'b');
        const entries = await provider.list('contract/ls');
        expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
      });

      it('returns empty array for a non-existent directory', async () => {
        const entries = await provider.list('contract/no-such-dir');
        expect(entries).toEqual([]);
      });

      it('returns only direct children, not full paths', async () => {
        await provider.write('contract/ls2/child.txt', 'x');
        const entries = await provider.list('contract/ls2');
        expect(entries).toContain('child.txt');
      });
    });

    // ── delete ─────────────────────────────────────────────────────────────

    describe('delete', () => {
      it('removes an existing file', async () => {
        await provider.write('contract/del.txt', 'bye');
        await provider.delete('contract/del.txt');
        expect(await provider.exists('contract/del.txt')).toBe(false);
      });

      it('is a no-op when file does not exist (no throw)', async () => {
        await expect(provider.delete('contract/never.txt')).resolves.toBeUndefined();
      });
    });

    // ── deleteDir ──────────────────────────────────────────────────────────

    describe('deleteDir', () => {
      it('removes directory and all children', async () => {
        await provider.write('contract/rmdir/a.txt', 'a');
        await provider.write('contract/rmdir/sub/b.txt', 'b');
        await provider.deleteDir('contract/rmdir');
        expect(await provider.exists('contract/rmdir')).toBe(false);
        expect(await provider.exists('contract/rmdir/a.txt')).toBe(false);
      });

      it('is a no-op when directory does not exist (no throw)', async () => {
        await expect(provider.deleteDir('contract/void-dir')).resolves.toBeUndefined();
      });
    });

    // ── readSync ───────────────────────────────────────────────────────────

    describe('readSync', () => {
      it('returns string content for an existing file', () => {
        provider.writeSync('contract/rsync.txt', 'sync-data');
        expect(provider.readSync('contract/rsync.txt')).toBe('sync-data');
      });

      it('returns undefined for a missing file', () => {
        expect(provider.readSync('contract/missing-sync.txt')).toBeUndefined();
      });
    });

    // ── writeSync ──────────────────────────────────────────────────────────

    describe('writeSync', () => {
      it('creates a file and reads back', () => {
        provider.writeSync('contract/wsync.txt', 'written');
        expect(provider.readSync('contract/wsync.txt')).toBe('written');
      });

      it('creates parent directories recursively', () => {
        provider.writeSync('contract/sync-deep/nested/file.txt', 'nested-sync');
        expect(provider.readSync('contract/sync-deep/nested/file.txt')).toBe('nested-sync');
      });
    });

    // ── existsSync ─────────────────────────────────────────────────────────

    describe('existsSync', () => {
      it('returns true for an existing file', () => {
        provider.writeSync('contract/esync.txt', 'yes');
        expect(provider.existsSync('contract/esync.txt')).toBe(true);
      });

      it('returns false for a missing path', () => {
        expect(provider.existsSync('contract/nope-sync.txt')).toBe(false);
      });
    });

    // ── listSync ───────────────────────────────────────────────────────────

    describe('listSync', () => {
      it('returns entry names in a directory', () => {
        provider.writeSync('contract/lsync/x.txt', 'x');
        provider.writeSync('contract/lsync/y.txt', 'y');
        expect(provider.listSync('contract/lsync').sort()).toEqual(['x.txt', 'y.txt']);
      });

      it('returns empty array for a non-existent directory', () => {
        expect(provider.listSync('contract/no-sync-dir')).toEqual([]);
      });
    });

    // ── Edge cases ─────────────────────────────────────────────────────────

    describe('edge cases', () => {
      it('handles paths with spaces', async () => {
        await provider.write('contract/path with spaces/file name.txt', 'spaced');
        expect(await provider.read('contract/path with spaces/file name.txt')).toBe('spaced');
      });

      it('write + delete + read returns undefined', async () => {
        await provider.write('contract/lifecycle.txt', 'alive');
        await provider.delete('contract/lifecycle.txt');
        expect(await provider.read('contract/lifecycle.txt')).toBeUndefined();
      });

      it('overwrite preserves only latest content', async () => {
        await provider.write('contract/multi.txt', 'v1');
        await provider.write('contract/multi.txt', 'v2');
        await provider.write('contract/multi.txt', 'v3');
        expect(await provider.read('contract/multi.txt')).toBe('v3');
      });
    });

    // ── LIKE wildcard safety (%, _) ───────────────────────────────────────

    describe('LIKE wildcard safety (%, _)', () => {
      it('list() with % in path returns only correct entries', async () => {
        await provider.write('contract/wc/dir/100%_done.txt', 'complete');
        await provider.write('contract/wc/dir/normal.txt', 'normal');
        const entries = await provider.list('contract/wc/dir');
        expect(entries.sort()).toEqual(['100%_done.txt', 'normal.txt']);
      });

      it('list() with _ in path returns only expected entries', async () => {
        await provider.write('contract/wc/udir/file_v2.txt', 'versioned');
        await provider.write('contract/wc/udir/readme.txt', 'info');
        const entries = await provider.list('contract/wc/udir');
        expect(entries.sort()).toEqual(['file_v2.txt', 'readme.txt']);
      });

      it('list() does not treat % as wildcard — a% matches only literal a% dir', async () => {
        await provider.write('contract/wc/a/b.txt', 'wrong');
        await provider.write('contract/wc/a%/c.txt', 'right');
        const entries = await provider.list('contract/wc/a%');
        expect(entries).toEqual(['c.txt']);
      });

      it('list() does not treat _ as single-char wildcard', async () => {
        await provider.write('contract/wc/ab/x.txt', 'wrong');
        await provider.write('contract/wc/a_/y.txt', 'right');
        const entries = await provider.list('contract/wc/a_');
        expect(entries).toEqual(['y.txt']);
      });

      it('existsSync with % in path checks literally', () => {
        provider.writeSync('contract/wc/pct%dir/test.txt', 'data');
        expect(provider.existsSync('contract/wc/pct%dir/test.txt')).toBe(true);
        expect(provider.existsSync('contract/wc/pctXdir/test.txt')).toBe(false);
      });

      it('existsSync with _ in path checks literally', () => {
        provider.writeSync('contract/wc/under_dir/test.txt', 'data');
        expect(provider.existsSync('contract/wc/under_dir/test.txt')).toBe(true);
        expect(provider.existsSync('contract/wc/underXdir/test.txt')).toBe(false);
      });

      it('deleteDir with % only deletes literal match, not wildcard matches', async () => {
        await provider.write('contract/wc/del%dir/target.txt', 'delete-me');
        await provider.write('contract/wc/delXdir/keep.txt', 'keep-me');
        await provider.deleteDir('contract/wc/del%dir');
        expect(await provider.exists('contract/wc/del%dir/target.txt')).toBe(false);
        expect(await provider.exists('contract/wc/delXdir/keep.txt')).toBe(true);
      });
    });
  });
}
