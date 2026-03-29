/**
 * FilesystemBackend — Store Squad state in a directory on disk.
 *
 * This is the current default behavior — state lives in .squad/ or
 * an external directory. Used as the fallback when git operations
 * aren't available (non-git repos, contributor mode).
 */

import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { StateBackend, StateBackendHealth } from './state-backend.js';

export class FilesystemBackend implements StateBackend {
  readonly name = 'filesystem';
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async read(path: string): Promise<string | null> {
    try {
      return await readFile(join(this.root, path), 'utf-8');
    } catch {
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    const fullPath = join(this.root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(join(this.root, path));
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    try {
      return await readdir(join(this.root, dir));
    } catch {
      return [];
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await unlink(join(this.root, path));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async doctor(): Promise<StateBackendHealth> {
    try {
      await access(this.root);
      const entries = await this.list('.');
      return {
        healthy: true,
        backend: this.name,
        message: `State directory exists (${entries.length} entries)`,
        details: { root: this.root, entryCount: String(entries.length) },
      };
    } catch {
      return {
        healthy: false,
        backend: this.name,
        message: `State directory not accessible: ${this.root}`,
        details: { root: this.root },
      };
    }
  }
}
