import type { BackendStateStore } from './types.js';

/** The synchronous subset of the SDK's `StateBackend` the conversation store needs. */
export interface StateBackendLike {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  readonly name?: string;
}

/**
 * Adapt a configured SDK state backend (git-notes, orphan, ...) to the backend conversation store, so
 * conversations live wherever the project's `stateBackend` puts mutable squad state instead of always on disk.
 *
 * These backends have no cross-process lock primitive, so `lock` is omitted: the local backend's transactions
 * are synchronous and therefore still atomic within one process.
 */
export function createStateBackendStore(backend: StateBackendLike): BackendStateStore {
  return {
    read: p => backend.read(p),
    write: (p, content) => backend.write(p, content),
    exists: p => backend.exists(p),
    list: dir => backend.list(dir),
  };
}
