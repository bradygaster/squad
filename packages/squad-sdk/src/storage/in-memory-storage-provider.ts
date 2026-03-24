import { posix } from 'path';
import type { StorageProvider } from './storage-provider.js';

/**
 * InMemoryStorageProvider — test-friendly StorageProvider backed by a Map.
 *
 * No filesystem access. All paths are normalized to forward-slash POSIX form.
 * Useful for unit tests and DI scenarios where real I/O is undesirable.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private files = new Map<string, string>();

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
    const key = this.norm(filePath);
    const existing = this.files.get(key) ?? '';
    this.files.set(key, existing + data);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.existsSync(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    return this.listSync(dirPath);
  }

  async delete(filePath: string): Promise<void> {
    this.files.delete(this.norm(filePath));
  }

  async deleteDir(dirPath: string): Promise<void> {
    const prefix = this.norm(dirPath) + '/';
    for (const key of [...this.files.keys()]) {
      if (key === this.norm(dirPath) || key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }

  // ── Synchronous variants ────────────────────────────────────────────────

  readSync(filePath: string): string | undefined {
    return this.files.get(this.norm(filePath));
  }

  writeSync(filePath: string, data: string): void {
    this.files.set(this.norm(filePath), data);
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

  // ── Test helpers ────────────────────────────────────────────────────────

  /** Return a shallow copy of the internal state for test assertions. */
  snapshot(): Map<string, string> {
    return new Map(this.files);
  }

  /** Reset all stored files. */
  clear(): void {
    this.files.clear();
  }
}
