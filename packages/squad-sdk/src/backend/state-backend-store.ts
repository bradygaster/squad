import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createFileStateStore, type FileStateStoreOptions } from './local-backend.js';
import { BackendError } from './types.js';
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
  /** Explicit directory under which lockfiles are coordinated across callers/processes. */
  squadDir?: string;
  /**
   * Stable identity (typically the team `.squad` path) used to derive a machine-local lock
   * directory for backends that keep their data outside the working tree (git-notes, orphan,
   * remote) and therefore expose no `root`. Nothing is ever written under this path.
   */
  lockAnchor?: string;
}

/** Machine-local lock directory shared by every process that opens the same backend identity. */
function machineLocalLockDir(backendName: string | undefined, anchor: string): string {
  const key = createHash('sha256').update(`${backendName ?? 'unknown'}\u0000${anchor}`, 'utf8').digest('hex').slice(0, 32);
  return path.join(os.tmpdir(), 'squad-backend-locks', key);
}

/**
 * The lock root must be the same path in every process that shares the backend, otherwise two
 * `squad state-mcp` servers never contend and both believe they hold the conversation.
 *
 * A file-backed backend (`root`) keeps its locks next to its data. Backends whose data lives
 * outside the working tree (`cwd` = repo root for git-notes/orphan, or an opaque backend with a
 * `lockAnchor`) get a deterministic machine-local lock directory instead, so a configured state
 * backend never materializes `.squad/backend/` inside the team directory.
 */
function resolveLockDir(backend: StateBackendLike, opts: StateBackendStoreOptions): string {
  if (opts.squadDir) return path.resolve(opts.squadDir);
  const candidate = (backend as { root?: unknown; cwd?: unknown });
  if (typeof candidate.root === 'string' && candidate.root) return path.resolve(candidate.root);
  const anchor = typeof candidate.cwd === 'string' && candidate.cwd
    ? path.resolve(candidate.cwd)
    : opts.lockAnchor ? path.resolve(opts.lockAnchor) : undefined;
  if (anchor) return machineLocalLockDir(backend.name, anchor);
  throw new BackendError('invalid-request',
    `Cannot determine a deterministic lock directory for state backend '${backend.name ?? 'unknown'}': pass squadDir or lockAnchor`, 400);
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
  const lockRoot = resolveLockDir(backend, opts);
  const fileLockStore = createFileStateStore(lockRoot, opts);

  // The lock directory is intentionally left in place after release: pruning it races another process's
  // mkdir -> open('wx') sequence.
  return {
    lock: (key: string) => fileLockStore.lock!(key),
    lockAsync: (key: string) => fileLockStore.lockAsync!(key),
    read: p => backend.read(p),
    write: (p, content) => backend.write(p, content),
    exists: p => backend.exists(p),
    list: dir => backend.list(dir),
  };
}
