import { readFile, writeFile, appendFile, access, readdir, unlink, mkdir, realpath, rm } from 'fs/promises';
import { readFileSync, writeFileSync, existsSync as fsExistsSync, mkdirSync, realpathSync, readdirSync } from 'fs';
import { dirname, resolve, sep } from 'path';
import type { StorageProvider } from './storage-provider.js';
import { StorageError } from './storage-error.js';

/**
 * FSStorageProvider — Node.js `fs` implementation of StorageProvider.
 *
 * - ENOENT reads return `undefined` (no throw).
 * - Writes create parent directories recursively.
 * - Appends create the file (and parent dirs) if missing.
 * - delete is a no-op when the file does not exist.
 * - list returns an empty array for a missing directory.
 * - Optional `rootDir` confines all operations to a specific directory tree.
 */
export class FSStorageProvider implements StorageProvider {
  private static readonly CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';
  private readonly rootDir?: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ? realpathSync(resolve(rootDir)) : undefined;
  }

  private pathStartsWith(fullPath: string, prefix: string): boolean {
    if (FSStorageProvider.CASE_INSENSITIVE) {
      return fullPath.toLowerCase().startsWith(prefix.toLowerCase());
    }
    return fullPath.startsWith(prefix);
  }

  private pathEquals(a: string, b: string): boolean {
    if (FSStorageProvider.CASE_INSENSITIVE) {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }

  /**
   * Validates that filePath resolves within rootDir and does not escape
   * via path traversal or symlinks.
   *
   * ⚠️ TOCTOU: This is a user-space check. Between validation and the
   * subsequent fs operation, a path component could theoretically be
   * swapped for a symlink. This is an inherent limitation of user-space
   * path validation on POSIX systems. For defense-in-depth, callers
   * operating in hostile environments should use OS-level confinement
   * (chroot, namespaces, or sandboxing) in addition to this check.
   */
  private async assertSafePath(filePath: string): Promise<string> {
    if (!this.rootDir) return filePath;
    
    const resolved = resolve(this.rootDir, filePath);
    
    // Check if resolved path is within rootDir
    if (!this.pathStartsWith(resolved, this.rootDir + sep) && !this.pathEquals(resolved, this.rootDir)) {
      throw new Error(`Path traversal blocked: ${filePath}`);
    }
    
    // Check for symlink traversal
    try {
      const real = await realpath(resolved);
      if (!this.pathStartsWith(real, this.rootDir + sep) && !this.pathEquals(real, this.rootDir)) {
        throw new Error(`Symlink traversal blocked: ${filePath}`);
      }
      return real;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Walk up to nearest existing ancestor and verify it resolves within rootDir
        let checkPath = resolved;
        while (!this.pathEquals(checkPath, this.rootDir)) {
          checkPath = dirname(checkPath);
          try {
            const realAncestor = await realpath(checkPath);
            if (!this.pathStartsWith(realAncestor, this.rootDir + sep) && !this.pathEquals(realAncestor, this.rootDir)) {
              throw new Error(`Symlink traversal blocked: ${filePath}`);
            }
            return resolved;
          } catch (ancestorErr: unknown) {
            if ((ancestorErr as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw ancestorErr;
          }
        }
        return resolved;
      }
      throw err;
    }
  }

  private assertSafePathSync(filePath: string): string {
    if (!this.rootDir) return filePath;
    
    const resolved = resolve(this.rootDir, filePath);
    
    // Check if resolved path is within rootDir
    if (!this.pathStartsWith(resolved, this.rootDir + sep) && !this.pathEquals(resolved, this.rootDir)) {
      throw new Error(`Path traversal blocked: ${filePath}`);
    }
    
    // Check for symlink traversal
    try {
      const real = realpathSync(resolved);
      if (!this.pathStartsWith(real, this.rootDir + sep) && !this.pathEquals(real, this.rootDir)) {
        throw new Error(`Symlink traversal blocked: ${filePath}`);
      }
      return real;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Walk up to nearest existing ancestor and verify it resolves within rootDir
        let checkPath = resolved;
        while (!this.pathEquals(checkPath, this.rootDir)) {
          checkPath = dirname(checkPath);
          try {
            const realAncestor = realpathSync(checkPath);
            if (!this.pathStartsWith(realAncestor, this.rootDir + sep) && !this.pathEquals(realAncestor, this.rootDir)) {
              throw new Error(`Symlink traversal blocked: ${filePath}`);
            }
            return resolved;
          } catch (ancestorErr: unknown) {
            if ((ancestorErr as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw ancestorErr;
          }
        }
        return resolved;
      }
      throw err;
    }
  }

  async read(filePath: string): Promise<string | undefined> {
    const safePath = await this.assertSafePath(filePath);
    try {
      return await readFile(safePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new StorageError('read', filePath, err as NodeJS.ErrnoException);
    }
  }

  async write(filePath: string, data: string): Promise<void> {
    const safePath = await this.assertSafePath(filePath);
    try {
      await mkdir(dirname(safePath), { recursive: true });
      await writeFile(safePath, data, 'utf-8');
    } catch (err: unknown) {
      throw new StorageError('write', filePath, err as NodeJS.ErrnoException);
    }
  }

  async append(filePath: string, data: string): Promise<void> {
    const safePath = await this.assertSafePath(filePath);
    try {
      await mkdir(dirname(safePath), { recursive: true });
      await appendFile(safePath, data, 'utf-8');
    } catch (err: unknown) {
      throw new StorageError('append', filePath, err as NodeJS.ErrnoException);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const safePath = await this.assertSafePath(filePath);
    try {
      await access(safePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath: string): Promise<string[]> {
    const safePath = await this.assertSafePath(dirPath);
    try {
      return await readdir(safePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StorageError('list', dirPath, err as NodeJS.ErrnoException);
    }
  }

  async delete(filePath: string): Promise<void> {
    const safePath = await this.assertSafePath(filePath);
    try {
      await unlink(safePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StorageError('delete', filePath, err as NodeJS.ErrnoException);
    }
  }

  readSync(filePath: string): string | undefined {
    const safePath = this.assertSafePathSync(filePath);
    try {
      return readFileSync(safePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new StorageError('read', filePath, err as NodeJS.ErrnoException);
    }
  }

  writeSync(filePath: string, data: string): void {
    const safePath = this.assertSafePathSync(filePath);
    try {
      mkdirSync(dirname(safePath), { recursive: true });
      writeFileSync(safePath, data, 'utf-8');
    } catch (err: unknown) {
      throw new StorageError('write', filePath, err as NodeJS.ErrnoException);
    }
  }

  existsSync(filePath: string): boolean {
    const safePath = this.assertSafePathSync(filePath);
    return fsExistsSync(safePath);
  }

  listSync(dirPath: string): string[] {
    const safePath = this.assertSafePathSync(dirPath);
    try {
      return readdirSync(safePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StorageError('list', dirPath, err as NodeJS.ErrnoException);
    }
  }

  async deleteDir(dirPath: string): Promise<void> {
    const safePath = await this.assertSafePath(dirPath);
    try {
      await rm(safePath, { recursive: true, force: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StorageError('deleteDir', dirPath, err as NodeJS.ErrnoException);
    }
  }
}
