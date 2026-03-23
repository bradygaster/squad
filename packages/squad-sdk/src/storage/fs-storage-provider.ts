/**
 * FSStorageProvider — Node.js `fs` / `fs/promises` implementation of StorageProvider.
 *
 * Drop-in default for Wave 1. No call sites are migrated here — this is the
 * foundation layer only. Wave 2 will replace direct fs calls across the codebase.
 */

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { StorageProvider, StorageProviderOptions } from './storage-provider.js';

export class FSStorageProvider implements StorageProvider {
  constructor(_options?: StorageProviderOptions) {
    // options reserved for future use (e.g. baseDir scoping)
  }

  // ---------------------------------------------------------------------------
  // Async
  // ---------------------------------------------------------------------------

  async read(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf8');
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }

  async append(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, content, 'utf8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return [];
      throw err;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
      // ENOENT → no-op
    }
  }

  // ---------------------------------------------------------------------------
  // Sync (deprecated after Wave 2)
  // ---------------------------------------------------------------------------

  /** @deprecated Use {@link read} instead. */
  readSync(filePath: string): string {
    return fsSync.readFileSync(filePath, 'utf8');
  }

  /** @deprecated Use {@link write} instead. */
  writeSync(filePath: string, content: string): void {
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, content, 'utf8');
  }

  /** @deprecated Use {@link exists} instead. */
  existsSync(filePath: string): boolean {
    return fsSync.existsSync(filePath);
  }
}
