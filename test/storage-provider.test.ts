/**
 * StorageProvider — FSStorageProvider tests (Wave 1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { FSStorageProvider } from '@bradygaster/squad-sdk/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-storage-test-'));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FSStorageProvider', () => {
  let dir: string;
  let provider: FSStorageProvider;

  beforeEach(() => {
    dir = tmpDir();
    provider = new FSStorageProvider();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // write / read
  // -------------------------------------------------------------------------

  it('write creates a file and read returns its contents', async () => {
    const file = path.join(dir, 'hello.txt');
    await provider.write(file, 'hello world');
    expect(await provider.read(file)).toBe('hello world');
  });

  it('write creates parent directories automatically', async () => {
    const file = path.join(dir, 'a', 'b', 'c', 'deep.txt');
    await provider.write(file, 'nested');
    expect(await provider.read(file)).toBe('nested');
  });

  it('read throws on a non-existent file', async () => {
    const file = path.join(dir, 'missing.txt');
    await expect(provider.read(file)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // append
  // -------------------------------------------------------------------------

  it('append creates the file if it does not exist', async () => {
    const file = path.join(dir, 'new.txt');
    await provider.append(file, 'first');
    expect(await provider.read(file)).toBe('first');
  });

  it('append adds to an existing file', async () => {
    const file = path.join(dir, 'log.txt');
    await provider.write(file, 'line1\n');
    await provider.append(file, 'line2\n');
    expect(await provider.read(file)).toBe('line1\nline2\n');
  });

  it('append creates parent directories automatically', async () => {
    const file = path.join(dir, 'sub', 'log.txt');
    await provider.append(file, 'content');
    expect(await provider.read(file)).toBe('content');
  });

  // -------------------------------------------------------------------------
  // exists
  // -------------------------------------------------------------------------

  it('exists returns true for an existing file', async () => {
    const file = path.join(dir, 'present.txt');
    await provider.write(file, '');
    expect(await provider.exists(file)).toBe(true);
  });

  it('exists returns false for a missing file', async () => {
    const file = path.join(dir, 'absent.txt');
    expect(await provider.exists(file)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  it('list returns filenames inside a directory', async () => {
    await provider.write(path.join(dir, 'a.txt'), '');
    await provider.write(path.join(dir, 'b.txt'), '');
    const entries = await provider.list(dir);
    expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('list returns an empty array for an empty directory', async () => {
    const sub = path.join(dir, 'empty');
    fs.mkdirSync(sub);
    expect(await provider.list(sub)).toEqual([]);
  });

  it('list returns an empty array for a non-existent directory', async () => {
    expect(await provider.list(path.join(dir, 'no-such-dir'))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  it('delete removes an existing file', async () => {
    const file = path.join(dir, 'gone.txt');
    await provider.write(file, 'bye');
    await provider.delete(file);
    expect(await provider.exists(file)).toBe(false);
  });

  it('delete is a no-op when the file does not exist', async () => {
    const file = path.join(dir, 'never-existed.txt');
    await expect(provider.delete(file)).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Sync methods
  // -------------------------------------------------------------------------

  it('writeSync + readSync round-trips correctly', () => {
    const file = path.join(dir, 'sync.txt');
    provider.writeSync(file, 'sync content');
    expect(provider.readSync(file)).toBe('sync content');
  });

  it('writeSync creates parent directories', () => {
    const file = path.join(dir, 'x', 'y', 'sync.txt');
    provider.writeSync(file, 'deep sync');
    expect(provider.readSync(file)).toBe('deep sync');
  });

  it('existsSync returns true for an existing file', () => {
    const file = path.join(dir, 'sync-exists.txt');
    provider.writeSync(file, '');
    expect(provider.existsSync(file)).toBe(true);
  });

  it('existsSync returns false for a missing file', () => {
    expect(provider.existsSync(path.join(dir, 'nope.txt'))).toBe(false);
  });

  it('existsSync matches exists for the same path', async () => {
    const file = path.join(dir, 'parity.txt');
    await provider.write(file, '');
    expect(provider.existsSync(file)).toBe(await provider.exists(file));
  });
});
