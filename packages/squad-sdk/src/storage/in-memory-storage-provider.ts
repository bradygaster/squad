import { posix } from 'path';
import type { StorageProvider, StorageStats } from './storage-provider.js';

/**
 * InMemoryStorageProvider — test-friendly StorageProvider backed by a Map.
 *
 * No filesystem access. All paths are normalized to forward-slash POSIX form.
 * Useful for unit tests and DI scenarios where real I/O is undesirable.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private files = new Map<string, string>();
  /** Track write timestamps for stat(). Key = normalized path, value = epoch ms. */
  private mtimes = new Map<string, number>();

  private norm(p: string): string {
    // Convert Windows backslashes to forward slashes before POSIX normalization
    // so that paths from path.join() on Windows match stored POSIX keys.
    return posix.normalize(p.replace(/\\/g, '/')).replace(/\/+$/, '');
  }

  async read(filePath: string): Promise<string | undefined> {
    return this.readSync(filePath);
  }

  async write(filePath: string, data: string): Promise<void> {
    this.writeSync(filePath, data);
  }

  async append(filePath: string, data: string): Promise<void> {
    this.appendSync(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.existsSync(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    return this.listSync(dirPath);
  }

  async delete(filePath: string): Promise<void> {
    const key = this.norm(filePath);
    this.files.delete(key);
    this.mtimes.delete(key);
  }

  async deleteDir(dirPath: string): Promise<void> {
    const prefix = this.norm(dirPath) + '/';
    for (const key of [...this.files.keys()]) {
      if (key === this.norm(dirPath) || key.startsWith(prefix)) {
        this.files.delete(key);
        this.mtimes.delete(key);
      }
    }
  }

  // ── Phase 3 Wave 1 additions ────────────────────────────────────────────

  async isDirectory(targetPath: string): Promise<boolean> {
    return this.isDirectorySync(targetPath);
  }

  async mkdir(dirPath: string, _options?: { recursive?: boolean }): Promise<void> {
    this.mkdirSync(dirPath, _options);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldKey = this.norm(oldPath);
    const newKey = this.norm(newPath);
    const oldPrefix = oldKey + '/';

    // Collect all entries to move (exact match + children)
    const toMove: Array<[string, string]> = [];
    for (const [key, value] of this.files) {
      if (key === oldKey) {
        toMove.push([newKey, value]);
      } else if (key.startsWith(oldPrefix)) {
        toMove.push([newKey + key.slice(oldKey.length), value]);
      }
    }

    if (toMove.length === 0) {
      const err = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    // Remove old entries
    for (const [key] of [...this.files]) {
      if (key === oldKey || key.startsWith(oldPrefix)) {
        this.files.delete(key);
        this.mtimes.delete(key);
      }
    }

    // Insert new entries
    const now = Date.now();
    for (const [key, value] of toMove) {
      this.files.set(key, value);
      this.mtimes.set(key, now);
    }
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcKey = this.norm(srcPath);
    const content = this.files.get(srcKey);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, copy '${srcPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    const destKey = this.norm(destPath);
    this.files.set(destKey, content);
    this.mtimes.set(destKey, Date.now());
  }

  async stat(targetPath: string): Promise<StorageStats | undefined> {
    const key = this.norm(targetPath);

    // Exact file match
    if (this.files.has(key)) {
      const content = this.files.get(key)!;
      return {
        size: Buffer.byteLength(content, 'utf-8'),
        mtimeMs: this.mtimes.get(key) ?? 0,
        isDirectory: false,
      };
    }

    // Directory: exists if any file has this prefix
    const prefix = key + '/';
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) {
        return { size: 0, mtimeMs: 0, isDirectory: true };
      }
    }

    return undefined;
  }

  // ── Synchronous variants ────────────────────────────────────────────────

  readSync(filePath: string): string | undefined {
    return this.files.get(this.norm(filePath));
  }

  writeSync(filePath: string, data: string): void {
    const key = this.norm(filePath);
    this.files.set(key, data);
    this.mtimes.set(key, Date.now());
  }

  existsSync(filePath: string): boolean {
    const key = this.norm(filePath);
    if (this.files.has(key)) return true;
    // Check if any key has this as a directory prefix
    const prefix = key + '/';
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) return true;
    }
    return false;
  }

  listSync(dirPath: string): string[] {
    const dir = this.norm(dirPath);
    const prefix = dir + '/';
    const entries = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0]!;
        entries.add(name);
      }
    }
    return [...entries];
  }

  isDirectorySync(targetPath: string): boolean {
    const key = this.norm(targetPath);
    // A path is a directory if any stored file has it as a prefix
    if (this.files.has(key)) return false; // it's a file
    const prefix = key + '/';
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) return true;
    }
    return false;
  }

  mkdirSync(_dirPath: string, _options?: { recursive?: boolean }): void {
    // In-memory provider doesn't need explicit directory creation —
    // directories are implicit from file paths. This is a no-op.
  }

  statSync(targetPath: string): StorageStats | undefined {
    const key = this.norm(targetPath);

    // Exact file match
    if (this.files.has(key)) {
      const content = this.files.get(key)!;
      return {
        size: Buffer.byteLength(content, 'utf-8'),
        mtimeMs: this.mtimes.get(key) ?? 0,
        isDirectory: false,
      };
    }

    // Directory: exists if any file has this prefix
    const prefix = key + '/';
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) {
        return { size: 0, mtimeMs: 0, isDirectory: true };
      }
    }

    return undefined;
  }

  appendSync(filePath: string, data: string): void {
    const key = this.norm(filePath);
    const existing = this.files.get(key) ?? '';
    this.files.set(key, existing + data);
    this.mtimes.set(key, Date.now());
  }

  deleteSync(filePath: string): void {
    const key = this.norm(filePath);
    this.files.delete(key);
    this.mtimes.delete(key);
  }

  renameSync(oldPath: string, newPath: string): void {
    const oldKey = this.norm(oldPath);
    const newKey = this.norm(newPath);
    const oldPrefix = oldKey + '/';

    // Collect all entries to move (exact match + children)
    const toMove: Array<[string, string]> = [];
    for (const [key, value] of this.files) {
      if (key === oldKey) {
        toMove.push([newKey, value]);
      } else if (key.startsWith(oldPrefix)) {
        toMove.push([newKey + key.slice(oldKey.length), value]);
      }
    }

    if (toMove.length === 0) {
      const err = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    // Remove old entries
    for (const [key] of [...this.files]) {
      if (key === oldKey || key.startsWith(oldPrefix)) {
        this.files.delete(key);
        this.mtimes.delete(key);
      }
    }

    // Insert new entries
    const now = Date.now();
    for (const [key, value] of toMove) {
      this.files.set(key, value);
      this.mtimes.set(key, now);
    }
  }

  copySync(srcPath: string, destPath: string): void {
    const srcKey = this.norm(srcPath);
    const content = this.files.get(srcKey);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, copy '${srcPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    const destKey = this.norm(destPath);
    this.files.set(destKey, content);
    this.mtimes.set(destKey, Date.now());
  }

  deleteDirSync(dirPath: string): void {
    const prefix = this.norm(dirPath) + '/';
    for (const key of [...this.files.keys()]) {
      if (key === this.norm(dirPath) || key.startsWith(prefix)) {
        this.files.delete(key);
        this.mtimes.delete(key);
      }
    }
  }

  // ── Test helpers────────────────────────────────────────────────────────

  /** Return a shallow copy of the internal state for test assertions. */
  snapshot(): Map<string, string> {
    return new Map(this.files);
  }

  /** Reset all stored files. */
  clear(): void {
    this.files.clear();
    this.mtimes.clear();
  }
}
