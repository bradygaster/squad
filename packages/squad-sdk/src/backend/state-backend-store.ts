import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileStateStore, type FileStateStoreOptions } from './local-backend.js';
import type { BackendStateStore } from './types.js';

/** The synchronous subset of the SDK's `StateBackend` the conversation store needs. */
export interface StateBackendLike {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  readonly name?: string;
}

export interface StateBackendStoreOptions extends FileStateStoreOptions {
  /** Directory under which lockfiles are coordinated across callers/processes. */
  squadDir?: string;
}

const fallbackLockDirs = new WeakMap<StateBackendLike, string>();

function resolveLockDir(backend: StateBackendLike, explicitSquadDir?: string): string {
  if (explicitSquadDir) return path.resolve(explicitSquadDir);
  const candidate = (backend as { root?: unknown; cwd?: unknown });
  if (typeof candidate.root === 'string' && candidate.root) return path.resolve(candidate.root);
  if (typeof candidate.cwd === 'string' && candidate.cwd) return path.resolve(candidate.cwd, '.squad');
  let dir = fallbackLockDirs.get(backend);
  if (!dir) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-state-backend-lock-'));
    fallbackLockDirs.set(backend, dir);
  }
  return dir;
}

function cleanupEmptyLockDirs(lockRoot: string, key: string): void {
  const lockFile = path.resolve(lockRoot, `${key}.lock`);
  let cur = path.dirname(lockFile);
  while (cur.startsWith(lockRoot + path.sep) && cur !== lockRoot) {
    try {
      fs.rmdirSync(cur);
    } catch {
      break;
    }
    cur = path.dirname(cur);
  }
}

/**
 * Adapt a configured SDK state backend (git-notes, orphan, two-layer, ...) to the backend conversation store,
 * so conversations live wherever the project's `stateBackend` puts mutable squad state while still enforcing
 * cross-process mutual exclusion via `wx` lockfiles, owner tokens, deadlines, and stale-lock recovery.
 */
export function createStateBackendStore(
  backend: StateBackendLike,
  squadDirOrOptions?: string | StateBackendStoreOptions,
  maybeOptions: FileStateStoreOptions = {},
): BackendStateStore {
  const opts: StateBackendStoreOptions = typeof squadDirOrOptions === 'string'
    ? { ...maybeOptions, squadDir: squadDirOrOptions }
    : (squadDirOrOptions ?? {});
  const lockRoot = resolveLockDir(backend, opts.squadDir);
  const fileLockStore = createFileStateStore(lockRoot, opts);

  return {
    lock: (key: string) => {
      const release = fileLockStore.lock!(key);
      return () => {
        try {
          release();
        } finally {
          cleanupEmptyLockDirs(lockRoot, key);
        }
      };
    },
    read: p => backend.read(p),
    write: (p, content) => backend.write(p, content),
    exists: p => backend.exists(p),
    list: dir => backend.list(dir),
  };
}
