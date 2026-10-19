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
  /** Directory under which lockfiles are coordinated across callers/processes. */
  squadDir?: string;
}

/**
 * The lock root must be the same path in every process that shares the backend, otherwise two
 * `squad state-mcp` servers never contend and both believe they hold the conversation.
 */
function resolveLockDir(backend: StateBackendLike, explicitSquadDir?: string): string {
  if (explicitSquadDir) return path.resolve(explicitSquadDir);
  const candidate = (backend as { root?: unknown; cwd?: unknown });
  if (typeof candidate.root === 'string' && candidate.root) return path.resolve(candidate.root);
  if (typeof candidate.cwd === 'string' && candidate.cwd) return path.resolve(candidate.cwd, '.squad');
  throw new BackendError('invalid-request',
    `Cannot determine a deterministic lock directory for state backend '${backend.name ?? 'unknown'}': pass squadDir`, 400);
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
