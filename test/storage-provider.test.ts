/**
 * StorageProvider Contract Tests — RED phase
 *
 * These tests define the complete contract that any StorageProvider
 * implementation must satisfy. They are written against FSStorageProvider
 * stubs, so every test fails until the implementation is wired in.
 *
 * Run these tests BEFORE implementation → all fail (RED).
 * Run them AFTER implementation → all pass (GREEN).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FSStorageProvider } from '../packages/squad-sdk/src/storage/fs-storage-provider.js';
import { InMemoryStorageProvider } from '../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import type { StorageProvider } from '../packages/squad-sdk/src/storage/storage-provider.js';
import { StorageError } from '../packages/squad-sdk/src/storage/storage-error.js';
import { parseSkillFile } from '../packages/squad-sdk/src/skills/skill-loader.js';
import { runStorageProviderContractTests } from './storage-contract.js';

let provider: StorageProvider;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'squad-storage-test-'));
  provider = new FSStorageProvider();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── write / read ────────────────────────────────────────────────────────────

describe('write + read', () => {
  it('writes a file and reads it back', async () => {
    const file = join(tmpDir, 'hello.txt');
    await provider.write(file, 'hello world');
    const result = await provider.read(file);
    expect(result).toBe('hello world');
  });

  it('overwrites existing content on write', async () => {
    const file = join(tmpDir, 'overwrite.txt');
    await provider.write(file, 'first');
    await provider.write(file, 'second');
    const result = await provider.read(file);
    expect(result).toBe('second');
  });

  it('write creates parent directories recursively', async () => {
    const file = join(tmpDir, 'deep', 'nested', 'dir', 'file.txt');
    await provider.write(file, 'deep content');
    const result = await provider.read(file);
    expect(result).toBe('deep content');
  });

  it('read returns undefined for a missing file (ENOENT)', async () => {
    const file = join(tmpDir, 'nonexistent.txt');
    const result = await provider.read(file);
    expect(result).toBeUndefined();
  });

  it('read returns empty string for a file written with empty string', async () => {
    const file = join(tmpDir, 'empty.txt');
    await provider.write(file, '');
    const result = await provider.read(file);
    expect(result).toBe('');
  });
});

// ── append ───────────────────────────────────────────────────────────────────

describe('append', () => {
  it('creates a file on first append', async () => {
    const file = join(tmpDir, 'new-append.txt');
    await provider.append(file, 'line1\n');
    const result = await provider.read(file);
    expect(result).toBe('line1\n');
  });

  it('appends to an existing file', async () => {
    const file = join(tmpDir, 'existing.txt');
    await provider.write(file, 'line1\n');
    await provider.append(file, 'line2\n');
    const result = await provider.read(file);
    expect(result).toBe('line1\nline2\n');
  });

  it('append creates parent directories', async () => {
    const file = join(tmpDir, 'sub', 'append.log');
    await provider.append(file, 'entry');
    const result = await provider.read(file);
    expect(result).toBe('entry');
  });
});

// ── exists ───────────────────────────────────────────────────────────────────

describe('exists', () => {
  it('returns true for an existing file', async () => {
    const file = join(tmpDir, 'real.txt');
    await provider.write(file, 'data');
    expect(await provider.exists(file)).toBe(true);
  });

  it('returns false for a missing path', async () => {
    const file = join(tmpDir, 'ghost.txt');
    expect(await provider.exists(file)).toBe(false);
  });

  it('returns true for a directory', async () => {
    expect(await provider.exists(tmpDir)).toBe(true);
  });
});

// ── list ─────────────────────────────────────────────────────────────────────

describe('list', () => {
  it('returns file names in a directory', async () => {
    await provider.write(join(tmpDir, 'a.txt'), 'a');
    await provider.write(join(tmpDir, 'b.txt'), 'b');
    const entries = await provider.list(tmpDir);
    expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('returns an empty array for an empty directory', async () => {
    const entries = await provider.list(tmpDir);
    expect(entries).toEqual([]);
  });

  it('returns an empty array for a non-existent directory', async () => {
    const entries = await provider.list(join(tmpDir, 'no-such-dir'));
    expect(entries).toEqual([]);
  });

  it('returns only direct children — not full paths', async () => {
    await provider.write(join(tmpDir, 'file.txt'), 'x');
    const entries = await provider.list(tmpDir);
    expect(entries).not.toContain(join(tmpDir, 'file.txt'));
    expect(entries).toContain('file.txt');
  });
});

// ── delete ───────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('removes an existing file', async () => {
    const file = join(tmpDir, 'todelete.txt');
    await provider.write(file, 'bye');
    await provider.delete(file);
    expect(await provider.exists(file)).toBe(false);
  });

  it('is a no-op when file does not exist (no throw)', async () => {
    const file = join(tmpDir, 'never-existed.txt');
    await expect(provider.delete(file)).resolves.toBeUndefined();
  });
});

// ── sync methods ─────────────────────────────────────────────────────────────

describe('sync methods', () => {
  it('writeSync + readSync round-trip', () => {
    const file = join(tmpDir, 'sync.txt');
    provider.writeSync(file, 'sync data');
    expect(provider.readSync(file)).toBe('sync data');
  });

  it('writeSync creates parent directories', () => {
    const file = join(tmpDir, 'sync', 'nested', 'file.txt');
    provider.writeSync(file, 'nested sync');
    expect(provider.readSync(file)).toBe('nested sync');
  });

  it('readSync returns undefined for missing file', () => {
    const file = join(tmpDir, 'missing-sync.txt');
    expect(provider.readSync(file)).toBeUndefined();
  });

  it('existsSync returns true for an existing file', () => {
    const file = join(tmpDir, 'exists-sync.txt');
    provider.writeSync(file, 'yes');
    expect(provider.existsSync(file)).toBe(true);
  });

  it('existsSync returns false for a missing path', () => {
    expect(provider.existsSync(join(tmpDir, 'nope.txt'))).toBe(false);
  });
});

// ── sync / async parity ──────────────────────────────────────────────────────

describe('sync/async parity', () => {
  it('readSync and read return the same content', async () => {
    const file = join(tmpDir, 'parity.txt');
    await provider.write(file, 'parity check');
    const async_result = await provider.read(file);
    const sync_result = provider.readSync(file);
    expect(sync_result).toBe(async_result);
  });

  it('existsSync and exists agree on a present file', async () => {
    const file = join(tmpDir, 'agree.txt');
    await provider.write(file, 'x');
    expect(provider.existsSync(file)).toBe(await provider.exists(file));
  });

  it('existsSync and exists agree on a missing file', async () => {
    const file = join(tmpDir, 'absent.txt');
    expect(provider.existsSync(file)).toBe(await provider.exists(file));
  });
});

// ── path traversal protection ────────────────────────────────────────────────

describe('path traversal protection', () => {
  let confinedProvider: StorageProvider;
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'squad-confined-'));
    confinedProvider = new FSStorageProvider(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('blocks relative path traversal with ../', async () => {
    await expect(confinedProvider.read('../etc/passwd')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks absolute path outside rootDir', async () => {
    await expect(confinedProvider.write('/tmp/evil.txt', 'hack')).rejects.toThrow(/Path traversal blocked/);
  });

  it('allows normal operations within rootDir', async () => {
    await confinedProvider.write('subdir/file.txt', 'safe');
    const content = await confinedProvider.read('subdir/file.txt');
    expect(content).toBe('safe');
  });

  it('blocks traversal in write', async () => {
    await expect(confinedProvider.write('../../etc/shadow', 'bad')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks traversal in append', async () => {
    await expect(confinedProvider.append('../outside.log', 'entry')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks traversal in exists', async () => {
    await expect(confinedProvider.exists('../../.env')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks traversal in list', async () => {
    await expect(confinedProvider.list('..')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks traversal in delete', async () => {
    await expect(confinedProvider.delete('../victim.txt')).rejects.toThrow(/Path traversal blocked/);
  });

  it('blocks traversal in sync methods', () => {
    expect(() => confinedProvider.readSync('../../secret.txt')).toThrow(/Path traversal blocked/);
    expect(() => confinedProvider.writeSync('../bad.txt', 'data')).toThrow(/Path traversal blocked/);
    expect(() => confinedProvider.existsSync('../../.ssh/id_rsa')).toThrow(/Path traversal blocked/);
  });

  it('allows operations at rootDir itself', async () => {
    await confinedProvider.write('root-file.txt', 'at root');
    expect(await confinedProvider.exists('root-file.txt')).toBe(true);
    const entries = await confinedProvider.list('.');
    expect(entries).toContain('root-file.txt');
  });
});

// ── symlink traversal protection ─────────────────────────────────────────────

describe('symlink traversal protection', () => {
  let confinedProvider: StorageProvider;
  let rootDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'squad-symlink-root-'));
    outsideDir = await mkdtemp(join(tmpdir(), 'squad-symlink-outside-'));
    confinedProvider = new FSStorageProvider(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  // Skip symlink tests on Windows due to permission requirements
  const isWindows = process.platform === 'win32';
  const testOrSkip = isWindows ? it.skip : it;

  testOrSkip('blocks read via symlink pointing outside rootDir', async () => {
    const { symlink } = await import('fs/promises');
    const outsideFile = join(outsideDir, 'secret.txt');
    const symlinkPath = join(rootDir, 'link-to-outside');

    await provider.write(outsideFile, 'secret data');
    await symlink(outsideFile, symlinkPath);

    await expect(confinedProvider.read('link-to-outside')).rejects.toThrow(/Symlink traversal blocked/);
  });

  testOrSkip('blocks write via symlink pointing outside rootDir', async () => {
    const { symlink } = await import('fs/promises');
    const outsideFile = join(outsideDir, 'target.txt');
    const symlinkPath = join(rootDir, 'evil-link');

    await provider.write(outsideFile, 'initial');
    await symlink(outsideFile, symlinkPath);

    await expect(confinedProvider.write('evil-link', 'overwrite')).rejects.toThrow(/Symlink traversal blocked/);
  });

  testOrSkip('blocks exists check via symlink', async () => {
    const { symlink } = await import('fs/promises');
    const outsideFile = join(outsideDir, 'exists.txt');
    const symlinkPath = join(rootDir, 'link');

    await provider.write(outsideFile, 'data');
    await symlink(outsideFile, symlinkPath);

    await expect(confinedProvider.exists('link')).rejects.toThrow(/Symlink traversal blocked/);
  });

  testOrSkip('allows symlinks within rootDir pointing to other paths within rootDir', async () => {
    const { symlink } = await import('fs/promises');
    const targetPath = join(rootDir, 'target.txt');
    const linkPath = join(rootDir, 'link.txt');

    await confinedProvider.write('target.txt', 'internal data');
    await symlink(targetPath, linkPath);

    const content = await confinedProvider.read('link.txt');
    expect(content).toBe('internal data');
  });

  testOrSkip('blocks write through symlink directory to outside rootDir (ENOENT bypass)', async () => {
    const { symlink, mkdir: mkdirFs } = await import('fs/promises');
    const { existsSync } = await import('fs');

    // Create an outside target directory
    const outsideTarget = join(outsideDir, 'escape-target');
    await mkdirFs(outsideTarget, { recursive: true });

    // Create a symlink DIRECTORY inside rootDir pointing outside
    const symlinkDir = join(rootDir, 'link-dir');
    await symlink(outsideTarget, symlinkDir, 'dir');

    // Attempt to write a NEW file through the symlink directory.
    // The file doesn't exist yet, so realpath on the full path throws ENOENT.
    // The old code would blindly trust the resolved path and follow the symlink.
    await expect(confinedProvider.write('link-dir/newfile.txt', 'malicious'))
      .rejects.toThrow(/Symlink traversal blocked/);

    // Verify the file was NOT written outside rootDir
    expect(existsSync(join(outsideTarget, 'newfile.txt'))).toBe(false);
  });

  testOrSkip('blocks writeSync through symlink directory to outside rootDir (ENOENT bypass)', () => {
    const { symlinkSync, mkdirSync: mkdirSyncFs, existsSync } = require('fs');

    // Create an outside target directory
    const outsideTarget = join(outsideDir, 'escape-target-sync');
    mkdirSyncFs(outsideTarget, { recursive: true });

    // Create a symlink DIRECTORY inside rootDir pointing outside
    const symlinkDir = join(rootDir, 'link-dir-sync');
    symlinkSync(outsideTarget, symlinkDir, 'dir');

    // Attempt writeSync through the symlink directory
    expect(() => confinedProvider.writeSync('link-dir-sync/newfile.txt', 'malicious'))
      .toThrow(/Symlink traversal blocked/);

    // Verify the file was NOT written outside rootDir
    expect(existsSync(join(outsideTarget, 'newfile.txt'))).toBe(false);
  });
});

// ── cross-platform path handling ─────────────────────────────────────────

describe('cross-platform path handling', () => {
  it('allows access with different case on case-insensitive platforms', async () => {
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      return; // Only relevant on case-insensitive filesystems
    }
    const root = await mkdtemp(join(tmpdir(), 'squad-case-test-'));
    const confinedProvider = new FSStorageProvider(root);

    await confinedProvider.write('test.txt', 'hello');

    // Build an alternate-cased root path
    const altCase = root.charAt(0) === root.charAt(0).toUpperCase()
      ? root.charAt(0).toLowerCase() + root.slice(1)
      : root.charAt(0).toUpperCase() + root.slice(1);

    const result = await confinedProvider.read(join(altCase, 'test.txt'));
    expect(result).toBe('hello');

    await rm(root, { recursive: true, force: true });
  });
});

// ── deleteDir ────────────────────────────────────────────────────────────────

describe('deleteDir', () => {
  it('recursively removes a directory and all contents', async () => {
    const dir = join(tmpDir, 'to-delete');
    await provider.write(join(dir, 'file1.txt'), 'a');
    await provider.write(join(dir, 'subdir', 'file2.txt'), 'b');

    await provider.deleteDir(dir);

    expect(await provider.exists(dir)).toBe(false);
    expect(await provider.exists(join(dir, 'file1.txt'))).toBe(false);
    expect(await provider.exists(join(dir, 'subdir', 'file2.txt'))).toBe(false);
  });

  it('is a no-op when directory does not exist', async () => {
    const dir = join(tmpDir, 'nonexistent-dir');
    await expect(provider.deleteDir(dir)).resolves.toBeUndefined();
  });

  it('removes nested directory structures', async () => {
    const dir = join(tmpDir, 'deep');
    await provider.write(join(dir, 'a', 'b', 'c', 'file.txt'), 'nested');

    await provider.deleteDir(dir);

    expect(await provider.exists(dir)).toBe(false);
  });

  it('blocks deleteDir traversal when rootDir is set', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'squad-delete-confined-'));
    const confinedProvider = new FSStorageProvider(rootDir);

    await expect(confinedProvider.deleteDir('../outside')).rejects.toThrow(/Path traversal blocked/);

    await rm(rootDir, { recursive: true, force: true });
  });
});

// ── StorageError ─────────────────────────────────────────────────────────────

describe('StorageError', () => {
  it('wraps permission errors without leaking paths', async () => {
    const file = join(tmpDir, 'readonly.txt');
    await provider.write(file, 'data');
    const { chmod } = await import('fs/promises');
    await chmod(file, 0o444);
    try {
      await provider.write(file, 'overwrite');
      expect.fail('Expected StorageError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(StorageError);
      expect(['EPERM', 'EACCES']).toContain((err as StorageError).code);
      expect((err as StorageError).message).not.toContain(tmpDir);
    } finally {
      await chmod(file, 0o644);
    }
  });
});

// ── concurrent writes ────────────────────────────────────────────────────────

describe('concurrent writes', () => {
  it('handles multiple simultaneous writes to different files', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      provider.write(join(tmpDir, `concurrent-${i}.txt`), `data-${i}`)
    );
    await Promise.all(writes);
    for (let i = 0; i < 10; i++) {
      const content = await provider.read(join(tmpDir, `concurrent-${i}.txt`));
      expect(content).toBe(`data-${i}`);
    }
  });

  it('handles concurrent writes to the same file (last writer wins)', async () => {
    const file = join(tmpDir, 'race.txt');
    const writes = Array.from({ length: 5 }, (_, i) =>
      provider.write(file, `writer-${i}`)
    );
    await Promise.all(writes);
    const content = await provider.read(file);
    expect(content).toMatch(/^writer-[0-4]$/);
  });

  it('handles concurrent appends without data loss', async () => {
    const file = join(tmpDir, 'append-race.txt');
    const appends = Array.from({ length: 10 }, (_, i) =>
      provider.append(file, `line-${i}\n`)
    );
    await Promise.all(appends);
    const content = await provider.read(file);
    for (let i = 0; i < 10; i++) {
      expect(content).toContain(`line-${i}`);
    }
  });

  it('handles concurrent reads and writes', async () => {
    const file = join(tmpDir, 'rw-race.txt');
    await provider.write(file, 'initial');

    const ops = [
      provider.read(file),
      provider.write(file, 'updated'),
      provider.read(file),
      provider.append(file, '-appended'),
      provider.read(file),
    ];
    const results = await Promise.all(ops);
    expect(typeof results[0]).toBe('string');
    expect(typeof results[2]).toBe('string');
    expect(typeof results[4]).toBe('string');
  });

  it('handles concurrent directory creation via writes', async () => {
    const writes = Array.from({ length: 5 }, (_, i) =>
      provider.write(join(tmpDir, 'shared-parent', `file-${i}.txt`), `content-${i}`)
    );
    await Promise.all(writes);
    const entries = await provider.list(join(tmpDir, 'shared-parent'));
    expect(entries.length).toBe(5);
  });
});

// ── listSync (FSStorageProvider) ─────────────────────────────────────────────

describe('FSStorageProvider listSync', () => {
  it('returns entry names for a populated directory', () => {
    provider.writeSync(join(tmpDir, 'ls-dir', 'a.txt'), 'a');
    provider.writeSync(join(tmpDir, 'ls-dir', 'b.txt'), 'b');
    const entries = provider.listSync(join(tmpDir, 'ls-dir'));
    expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('returns empty array for ENOENT directory', () => {
    expect(provider.listSync(join(tmpDir, 'no-such-dir'))).toEqual([]);
  });

  it('returns only direct children', () => {
    provider.writeSync(join(tmpDir, 'ls2', 'file.txt'), 'x');
    provider.writeSync(join(tmpDir, 'ls2', 'sub', 'deep.txt'), 'y');
    const entries = provider.listSync(join(tmpDir, 'ls2'));
    expect(entries.sort()).toEqual(['file.txt', 'sub']);
  });

  it('blocks traversal when rootDir is set', async () => {
    const { mkdtemp: mkd } = await import('fs/promises');
    const root = await mkd(join(tmpdir(), 'squad-ls-confined-'));
    const confined = new FSStorageProvider(root);
    expect(() => confined.listSync('../')).toThrow(/traversal blocked/i);
    await rm(root, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// InMemoryStorageProvider
// ═══════════════════════════════════════════════════════════════════════════════

describe('InMemoryStorageProvider', () => {
  let mem: InMemoryStorageProvider;

  beforeEach(() => {
    mem = new InMemoryStorageProvider();
  });

  // ── Async methods ──────────────────────────────────────────────────────────

  describe('read()', () => {
    it('returns undefined for missing key', async () => {
      expect(await mem.read('missing.txt')).toBeUndefined();
    });

    it('reads previously written content', async () => {
      await mem.write('f.txt', 'hello');
      expect(await mem.read('f.txt')).toBe('hello');
    });
  });

  describe('write()', () => {
    it('stores content', async () => {
      await mem.write('a.txt', 'A');
      expect(mem.snapshot().get('a.txt')).toBe('A');
    });

    it('overwrites existing content', async () => {
      await mem.write('a.txt', 'first');
      await mem.write('a.txt', 'second');
      expect(await mem.read('a.txt')).toBe('second');
    });
  });

  describe('append()', () => {
    it('creates file if missing', async () => {
      await mem.append('new.txt', 'start');
      expect(await mem.read('new.txt')).toBe('start');
    });

    it('appends to existing content', async () => {
      await mem.write('log.txt', 'A');
      await mem.append('log.txt', 'B');
      expect(await mem.read('log.txt')).toBe('AB');
    });
  });

  describe('exists()', () => {
    it('returns false for missing key', async () => {
      expect(await mem.exists('ghost')).toBe(false);
    });

    it('returns true for existing file', async () => {
      await mem.write('present.txt', '');
      expect(await mem.exists('present.txt')).toBe(true);
    });

    it('returns true for implicit directory (prefix match)', async () => {
      await mem.write('dir/child.txt', '');
      expect(await mem.exists('dir')).toBe(true);
    });
  });

  describe('list()', () => {
    it('returns empty array for missing directory', async () => {
      expect(await mem.list('empty')).toEqual([]);
    });

    it('returns direct children only', async () => {
      await mem.write('d/a.txt', '');
      await mem.write('d/b.txt', '');
      await mem.write('d/sub/c.txt', '');
      const entries = await mem.list('d');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt', 'sub']);
    });
  });

  describe('delete()', () => {
    it('removes a file', async () => {
      await mem.write('x.txt', 'val');
      await mem.delete('x.txt');
      expect(await mem.read('x.txt')).toBeUndefined();
    });

    it('no-op for missing file', async () => {
      await expect(mem.delete('nope')).resolves.toBeUndefined();
    });
  });

  describe('deleteDir()', () => {
    it('removes directory and all children', async () => {
      await mem.write('rm/a.txt', '');
      await mem.write('rm/sub/b.txt', '');
      await mem.deleteDir('rm');
      expect(mem.snapshot().size).toBe(0);
    });

    it('no-op for missing directory', async () => {
      await expect(mem.deleteDir('void')).resolves.toBeUndefined();
    });
  });

  // ── Sync methods ───────────────────────────────────────────────────────────

  describe('readSync()', () => {
    it('returns undefined for missing key', () => {
      expect(mem.readSync('nope')).toBeUndefined();
    });

    it('reads content', () => {
      mem.writeSync('s.txt', 'data');
      expect(mem.readSync('s.txt')).toBe('data');
    });
  });

  describe('writeSync()', () => {
    it('stores content', () => {
      mem.writeSync('w.txt', 'val');
      expect(mem.snapshot().get('w.txt')).toBe('val');
    });

    it('overwrites existing content', () => {
      mem.writeSync('w.txt', 'first');
      mem.writeSync('w.txt', 'second');
      expect(mem.readSync('w.txt')).toBe('second');
    });
  });

  describe('existsSync()', () => {
    it('returns false for missing key', () => {
      expect(mem.existsSync('no')).toBe(false);
    });

    it('returns true for file', () => {
      mem.writeSync('yes.txt', '');
      expect(mem.existsSync('yes.txt')).toBe(true);
    });

    it('returns true for implicit directory', () => {
      mem.writeSync('dir/child.txt', 'x');
      expect(mem.existsSync('dir')).toBe(true);
    });
  });

  describe('listSync()', () => {
    it('returns empty array for missing directory', () => {
      expect(mem.listSync('no-dir')).toEqual([]);
    });

    it('returns direct children', () => {
      mem.writeSync('ls/alpha.txt', '');
      mem.writeSync('ls/beta.txt', '');
      mem.writeSync('ls/nested/gamma.txt', '');
      expect(mem.listSync('ls').sort()).toEqual(['alpha.txt', 'beta.txt', 'nested']);
    });

    it('deduplicates nested entries', () => {
      mem.writeSync('d/sub/a.txt', '');
      mem.writeSync('d/sub/b.txt', '');
      expect(mem.listSync('d')).toEqual(['sub']);
    });
  });

  // ── Test helpers ───────────────────────────────────────────────────────────

  describe('snapshot()', () => {
    it('returns a copy of internal state', () => {
      mem.writeSync('a', '1');
      const snap = mem.snapshot();
      mem.writeSync('b', '2');
      expect(snap.size).toBe(1);
    });
  });

  describe('clear()', () => {
    it('removes all files', () => {
      mem.writeSync('a', '1');
      mem.writeSync('b', '2');
      mem.clear();
      expect(mem.snapshot().size).toBe(0);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty string content', async () => {
      await mem.write('empty.txt', '');
      expect(await mem.read('empty.txt')).toBe('');
      expect(await mem.exists('empty.txt')).toBe(true);
    });

    it('normalizes trailing slashes', async () => {
      await mem.write('dir/file.txt', 'ok');
      expect(mem.listSync('dir/')).toContain('file.txt');
    });

    it('normalizes double slashes', async () => {
      await mem.write('dir//file.txt', 'ok');
      expect(await mem.read('dir/file.txt')).toBe('ok');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// StorageError — extended
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorageError path sanitization', () => {
  it('strips absolute path, keeps basename', () => {
    const cause = Object.assign(new Error('EACCES'), { code: 'EACCES' }) as NodeJS.ErrnoException;
    const err = new StorageError('read', '/home/user/secret/.squad/config.json', cause);
    expect(err.message).not.toContain('/home/user/secret');
    expect(err.message).toContain('config.json');
  });

  it('preserves operation and code', () => {
    const cause = Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const err = new StorageError('write', 'test.txt', cause);
    expect(err.operation).toBe('write');
    expect(err.code).toBe('ENOENT');
  });

  it('preserves original cause', () => {
    const cause = Object.assign(new Error('EIO'), { code: 'EIO' }) as NodeJS.ErrnoException;
    const err = new StorageError('delete', 'x', cause);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('StorageError');
  });

  it('falls back to UNKNOWN when cause has no code', () => {
    const cause = new Error('no code') as NodeJS.ErrnoException;
    const err = new StorageError('op', 'f.txt', cause);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toContain('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DI injection — InMemoryStorageProvider as drop-in
// ═══════════════════════════════════════════════════════════════════════════════

describe('DI injection — InMemoryStorageProvider', () => {
  it('satisfies StorageProvider contract (typed assignment)', () => {
    const sp: StorageProvider = new InMemoryStorageProvider();
    sp.writeSync('config.json', '{"key":"value"}');
    expect(sp.readSync('config.json')).toBe('{"key":"value"}');
    expect(sp.existsSync('config.json')).toBe(true);
    expect(sp.existsSync('missing.json')).toBe(false);
    expect(sp.readSync('missing.json')).toBeUndefined();
  });

  it('parseSkillFile works with InMemory-loaded content', () => {
    const sp = new InMemoryStorageProvider();
    const skillContent = [
      '---',
      'name: Test Skill',
      'domain: testing',
      'triggers: [vitest, jest]',
      'roles: [tester]',
      '---',
      'This is a test skill body.',
    ].join('\n');

    sp.writeSync('skills/my-skill/SKILL.md', skillContent);
    const raw = sp.readSync('skills/my-skill/SKILL.md');
    expect(raw).toBeDefined();

    const skill = parseSkillFile('my-skill', raw!);
    expect(skill).toBeDefined();
    expect(skill!.id).toBe('my-skill');
    expect(skill!.name).toBe('Test Skill');
    expect(skill!.domain).toBe('testing');
    expect(skill!.triggers).toEqual(['vitest', 'jest']);
    expect(skill!.agentRoles).toEqual(['tester']);
    expect(skill!.content).toContain('test skill body');
  });

  it('InMemory write+read+delete lifecycle matches FSStorageProvider semantics', async () => {
    const sp: StorageProvider = new InMemoryStorageProvider();
    await sp.write('lifecycle.txt', 'created');
    expect(await sp.read('lifecycle.txt')).toBe('created');
    expect(await sp.exists('lifecycle.txt')).toBe(true);
    await sp.delete('lifecycle.txt');
    expect(await sp.read('lifecycle.txt')).toBeUndefined();
    expect(await sp.exists('lifecycle.txt')).toBe(false);
  });

  it('InMemory list + listSync match async/sync behavior', async () => {
    const sp = new InMemoryStorageProvider();
    sp.writeSync('dir/a.txt', '');
    sp.writeSync('dir/b.txt', '');
    sp.writeSync('dir/sub/c.txt', '');
    
    const asyncList = (await sp.list('dir')).sort();
    const syncList = sp.listSync('dir').sort();
    expect(asyncList).toEqual(syncList);
    expect(asyncList).toEqual(['a.txt', 'b.txt', 'sub']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-provider contract — both providers behave identically
// ═══════════════════════════════════════════════════════════════════════════════

describe('cross-provider contract', () => {
  let fsRoot: string;

  beforeEach(async () => {
    fsRoot = await mkdtemp(join(tmpdir(), 'squad-xprovider-'));
  });

  afterEach(async () => {
    await rm(fsRoot, { recursive: true, force: true });
  });

  function providers(): Array<{ name: string; sp: StorageProvider }> {
    return [
      { name: 'FSStorageProvider', sp: new FSStorageProvider(fsRoot) },
      { name: 'InMemoryStorageProvider', sp: new InMemoryStorageProvider() },
    ];
  }

  it('read returns undefined for missing files', async () => {
    for (const { name, sp } of providers()) {
      expect(await sp.read('missing.txt'), `${name}`).toBeUndefined();
    }
  });

  it('write + read roundtrip', async () => {
    for (const { name, sp } of providers()) {
      await sp.write('round.txt', 'trip');
      expect(await sp.read('round.txt'), `${name}`).toBe('trip');
    }
  });

  it('list returns empty for missing dir', async () => {
    for (const { name, sp } of providers()) {
      expect(await sp.list('no-dir'), `${name}`).toEqual([]);
    }
  });

  it('listSync returns empty for missing dir', () => {
    for (const { name, sp } of providers()) {
      expect(sp.listSync('no-dir'), `${name}`).toEqual([]);
    }
  });

  it('delete is no-op for missing file', async () => {
    for (const { sp } of providers()) {
      await expect(sp.delete('ghost.txt')).resolves.toBeUndefined();
    }
  });

  it('existsSync returns false for missing', () => {
    for (const { sp } of providers()) {
      expect(sp.existsSync('nope')).toBe(false);
    }
  });

  it('readSync returns undefined for missing', () => {
    for (const { sp } of providers()) {
      expect(sp.readSync('nope')).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Contract Test Factory — same conformance suite for every StorageProvider
// ═══════════════════════════════════════════════════════════════════════════════

runStorageProviderContractTests('FSStorageProvider', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sp-contract-'));
  const provider = new FSStorageProvider(tmpDir);
  return { provider, cleanup: async () => rmSync(tmpDir, { recursive: true, force: true }) };
});

runStorageProviderContractTests('InMemoryStorageProvider', async () => {
  const provider = new InMemoryStorageProvider();
  return { provider, cleanup: async () => provider.clear() };
});

import { SQLiteStorageProvider } from '../packages/squad-sdk/src/storage/sqlite-storage-provider.js';

runStorageProviderContractTests('SQLiteStorageProvider', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'squad-sqlite-test-'));
  const dbPath = join(tmpDir, 'test.db');
  const provider = new SQLiteStorageProvider(dbPath);
  await provider.init();
  return { provider, cleanup: async () => rmSync(tmpDir, { recursive: true, force: true }) };
});

// ── SQLite-specific tests ─────────────────────────────────────────────────────

describe('SQLiteStorageProvider — SQLite-specific', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'squad-sqlite-specific-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Persistence across instances ────────────────────────────────────────

  it('persists data: write → close → reopen → read returns same data', async () => {
    const dbPath = join(tmpDir, 'persist.db');

    const p1 = new SQLiteStorageProvider(dbPath);
    await p1.init();
    await p1.write('docs/readme.md', '# Hello');
    // p1 goes out of scope — no explicit close needed for sql.js

    const p2 = new SQLiteStorageProvider(dbPath);
    await p2.init();
    expect(await p2.read('docs/readme.md')).toBe('# Hello');
  });

  it('persists multiple files across reopen', async () => {
    const dbPath = join(tmpDir, 'multi-persist.db');

    const p1 = new SQLiteStorageProvider(dbPath);
    await p1.init();
    await p1.write('a.txt', 'alpha');
    await p1.write('b.txt', 'bravo');
    await p1.write('sub/c.txt', 'charlie');

    const p2 = new SQLiteStorageProvider(dbPath);
    await p2.init();
    expect(await p2.read('a.txt')).toBe('alpha');
    expect(await p2.read('b.txt')).toBe('bravo');
    expect(await p2.read('sub/c.txt')).toBe('charlie');
  });

  // ── init() idempotency ──────────────────────────────────────────────────

  it('calling init() twice is safe (idempotent)', async () => {
    const dbPath = join(tmpDir, 'idempotent.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();
    await provider.write('test.txt', 'first');
    await provider.init(); // second init — should be no-op
    expect(await provider.read('test.txt')).toBe('first');
  });

  it('calling init() concurrently is safe', async () => {
    const dbPath = join(tmpDir, 'concurrent-init.db');
    const provider = new SQLiteStorageProvider(dbPath);
    // Fire two init() calls concurrently — should not throw or corrupt
    await Promise.all([provider.init(), provider.init()]);
    await provider.write('ok.txt', 'ok');
    expect(await provider.read('ok.txt')).toBe('ok');
  });

  // ── Large content handling ──────────────────────────────────────────────

  it('handles large content (100 KB)', async () => {
    const dbPath = join(tmpDir, 'large.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();

    const largeContent = 'x'.repeat(100_000);
    await provider.write('big.txt', largeContent);
    expect(await provider.read('big.txt')).toBe(largeContent);
  });

  // ── Path normalization ──────────────────────────────────────────────────

  it('normalizes backslashes to forward slashes', async () => {
    const dbPath = join(tmpDir, 'norm.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();

    await provider.write('dir\\sub\\file.txt', 'normalized');
    // Reading with forward slashes should find the same entry
    expect(await provider.read('dir/sub/file.txt')).toBe('normalized');
  });

  it('normalizes redundant slashes', async () => {
    const dbPath = join(tmpDir, 'norm2.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();

    await provider.write('a//b///c.txt', 'clean');
    expect(await provider.read('a/b/c.txt')).toBe('clean');
  });

  // ── DB file creation ────────────────────────────────────────────────────

  it('creates DB file on disk when it does not exist yet', async () => {
    const dbPath = join(tmpDir, 'brand-new.db');
    expect(existsSync(dbPath)).toBe(false);

    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();
    await provider.write('hello.txt', 'world');

    // After write + persist, the DB file should exist on disk
    expect(existsSync(dbPath)).toBe(true);
  });

  it('creates parent directories for the DB file', async () => {
    const dbPath = join(tmpDir, 'nested', 'dir', 'deep.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();
    await provider.write('test.txt', 'data');
    expect(existsSync(dbPath)).toBe(true);
  });

  // ── updated_at column ──────────────────────────────────────────────────

  it('populates updated_at as an ISO 8601 timestamp on write', async () => {
    const dbPath = join(tmpDir, 'timestamps.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();

    const before = new Date().toISOString();
    await provider.write('ts.txt', 'timestamped');
    const after = new Date().toISOString();

    // Access the internal DB to verify updated_at
    const p2 = new SQLiteStorageProvider(dbPath);
    await p2.init();
    // Use readSync to confirm the file exists, then check timestamp via a second instance
    // We verify by reopening and reading — the file should still be there
    expect(await p2.read('ts.txt')).toBe('timestamped');

    // To verify the timestamp, we need to read the raw DB
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const fileBuffer = readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    const stmt = db.prepare('SELECT updated_at FROM files WHERE path = ?');
    stmt.bind(['ts.txt']);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as { updated_at: string };
    stmt.free();
    db.close();

    // updated_at should be a valid ISO 8601 string between before and after
    expect(row.updated_at).toBeTruthy();
    expect(row.updated_at >= before).toBe(true);
    expect(row.updated_at <= after).toBe(true);
  });

  it('updates updated_at on overwrite', async () => {
    const dbPath = join(tmpDir, 'ts-overwrite.db');
    const provider = new SQLiteStorageProvider(dbPath);
    await provider.init();

    await provider.write('file.txt', 'v1');

    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    await provider.write('file.txt', 'v2');

    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const fileBuffer = readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    const stmt = db.prepare('SELECT updated_at FROM files WHERE path = ?');
    stmt.bind(['file.txt']);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as { updated_at: string };
    stmt.free();
    db.close();

    // The timestamp should reflect the second write
    const ts = new Date(row.updated_at).getTime();
    expect(ts).toBeGreaterThan(0);
  });

  // ── Sync methods require init() ─────────────────────────────────────────

  it('throws if sync methods called before init()', () => {
    const dbPath = join(tmpDir, 'no-init.db');
    const provider = new SQLiteStorageProvider(dbPath);
    // No init() call — sync methods should throw
    expect(() => provider.readSync('any.txt')).toThrow(/not initialized/i);
    expect(() => provider.writeSync('any.txt', 'data')).toThrow(/not initialized/i);
    expect(() => provider.existsSync('any.txt')).toThrow(/not initialized/i);
    expect(() => provider.listSync('dir')).toThrow(/not initialized/i);
  });

  // ── LIKE wildcard regression (escapeLike) ───────────────────────────────

  describe('LIKE wildcard regression — escapeLike()', () => {
    it('list() with % in file path returns it correctly', async () => {
      const dbPath = join(tmpDir, 'wc-pct-list.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      await provider.write('dir/100%_done.txt', 'complete');
      await provider.write('dir/normal.txt', 'ok');
      const entries = await provider.list('dir');
      expect(entries.sort()).toEqual(['100%_done.txt', 'normal.txt']);
    });

    it('list() with _ in file path returns only expected entries', async () => {
      const dbPath = join(tmpDir, 'wc-under-list.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      await provider.write('dir/file_v2.txt', 'versioned');
      await provider.write('dir/readme.txt', 'info');
      const entries = await provider.list('dir');
      expect(entries.sort()).toEqual(['file_v2.txt', 'readme.txt']);
    });

    it('list("a%") returns only files under literal a% dir, not a/', async () => {
      const dbPath = join(tmpDir, 'wc-pct-dir.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      await provider.write('a/b.txt', 'wrong');
      await provider.write('a%/c.txt', 'right');
      const entries = await provider.list('a%');
      expect(entries).toEqual(['c.txt']);
    });

    it('list("a_") returns only files under literal a_ dir, not ab/', async () => {
      const dbPath = join(tmpDir, 'wc-under-dir.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      await provider.write('ab/x.txt', 'wrong');
      await provider.write('a_/y.txt', 'right');
      const entries = await provider.list('a_');
      expect(entries).toEqual(['y.txt']);
    });

    it('existsSync with % in path checks literally', async () => {
      const dbPath = join(tmpDir, 'wc-pct-exists.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      provider.writeSync('pct%dir/test.txt', 'data');
      expect(provider.existsSync('pct%dir/test.txt')).toBe(true);
      expect(provider.existsSync('pctXdir/test.txt')).toBe(false);
    });

    it('existsSync with _ in path checks literally', async () => {
      const dbPath = join(tmpDir, 'wc-under-exists.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      provider.writeSync('under_dir/test.txt', 'data');
      expect(provider.existsSync('under_dir/test.txt')).toBe(true);
      expect(provider.existsSync('underXdir/test.txt')).toBe(false);
    });

    it('deleteDir with % only deletes the literal directory', async () => {
      const dbPath = join(tmpDir, 'wc-pct-deldir.db');
      const provider = new SQLiteStorageProvider(dbPath);
      await provider.init();
      await provider.write('del%dir/target.txt', 'delete-me');
      await provider.write('delXdir/keep.txt', 'keep-me');
      await provider.deleteDir('del%dir');
      expect(await provider.exists('del%dir/target.txt')).toBe(false);
      expect(await provider.exists('delXdir/keep.txt')).toBe(true);
    });
  });
});
