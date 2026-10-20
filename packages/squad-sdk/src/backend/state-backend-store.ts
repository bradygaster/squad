import { createHash } from 'node:crypto';
import fs from 'node:fs';
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

type InspectableBackend = StateBackendLike & {
  root?: unknown;
  cwd?: unknown;
  repoRoot?: unknown;
  branch?: unknown;
  ref?: unknown;
  orphan?: InspectableBackend;
  notes?: InspectableBackend;
};

/** Resolve symlinks/junctions and platform path casing so path aliases hash to the same identity. */
function canonicalizePath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  let real = resolved;
  const realpathFn = typeof fs.realpathSync.native === 'function' ? fs.realpathSync.native : fs.realpathSync;
  try {
    real = realpathFn(resolved);
  } catch {
    let cur = path.dirname(resolved);
    const tail: string[] = [path.basename(resolved)];
    while (cur && cur !== path.dirname(cur)) {
      try {
        real = path.join(realpathFn(cur), ...tail.reverse());
        break;
      } catch {
        tail.push(path.basename(cur));
        cur = path.dirname(cur);
      }
    }
  }
  return process.platform === 'win32' || process.platform === 'darwin'
    ? real.toLowerCase()
    : real;
}

/**
 * Resolve the shared git common directory (`.git`) when `dir` is a git checkout or linked worktree,
 * so two linked worktrees updating the same git ref contend on the same lock.
 */
function resolveGitCommonStorage(dir: string): string | undefined {
  const tmpNorm = canonicalizePath(os.tmpdir());
  let cur = path.resolve(dir);
  if (path.basename(cur) === '.squad') cur = path.dirname(cur);
  while (cur && cur !== path.dirname(cur)) {
    if (canonicalizePath(cur) === tmpNorm) break;
    const dotGit = path.join(cur, '.git');
    let st: fs.Stats | undefined;
    try { st = fs.statSync(dotGit); } catch { st = undefined; }
    if (st?.isDirectory()) {
      const commonFile = path.join(dotGit, 'commondir');
      try {
        if (fs.statSync(commonFile).isFile()) {
          return canonicalizePath(path.resolve(dotGit, fs.readFileSync(commonFile, 'utf8').trim()));
        }
      } catch { /* regular .git directory */ }
      return canonicalizePath(dotGit);
    }
    if (st?.isFile()) {
      try {
        const raw = fs.readFileSync(dotGit, 'utf8').trim();
        const m = /^gitdir:\s*(.+)$/i.exec(raw);
        if (m) {
          const gitDir = path.resolve(cur, m[1]!.trim());
          const commonFile = path.join(gitDir, 'commondir');
          try {
            if (fs.statSync(commonFile).isFile()) {
              return canonicalizePath(path.resolve(gitDir, fs.readFileSync(commonFile, 'utf8').trim()));
            }
          } catch { /* fallback below */ }
          if (path.basename(path.dirname(gitDir)) === 'worktrees') {
            return canonicalizePath(path.dirname(path.dirname(gitDir)));
          }
          return canonicalizePath(gitDir);
        }
      } catch { /* ignore malformed .git file */ }
    }
    cur = path.dirname(cur);
  }
  return undefined;
}

/** Canonical shared storage + state ref identity across checkouts, linked worktrees, and two-layer wrappers. */
function resolveSharedBackendIdentity(backend: StateBackendLike, opts: StateBackendStoreOptions): { storage: string; stateRef: string } | undefined {
  const candidate = backend as InspectableBackend;
  const primary = candidate.orphan && typeof candidate.orphan === 'object' ? candidate.orphan : candidate;

  const rawDir = typeof primary.cwd === 'string' && primary.cwd
    ? primary.cwd
    : typeof candidate.cwd === 'string' && candidate.cwd
      ? candidate.cwd
      : typeof candidate.repoRoot === 'string' && candidate.repoRoot
        ? candidate.repoRoot
        : opts.lockAnchor;
  if (!rawDir) return undefined;

  const storage = resolveGitCommonStorage(rawDir) ?? canonicalizePath(
    path.basename(rawDir) === '.squad' ? path.dirname(path.resolve(rawDir)) : rawDir,
  );

  const stateRef = typeof primary.branch === 'string' && primary.branch
    ? `refs/heads/${primary.branch}`
    : typeof primary.ref === 'string' && primary.ref
      ? `refs/notes/${primary.ref}`
      : primary.name === 'orphan' || candidate.name === 'two-layer'
        ? 'refs/heads/squad-state'
        : primary.name === 'git-notes'
          ? 'refs/notes/squad'
          : `backend:${candidate.name ?? 'unknown'}`;

  return { storage, stateRef };
}

/** Machine-local lock directory shared by every process that opens the same canonical storage + state ref. */
function machineLocalLockDir(storage: string, stateRef: string): string {
  const key = createHash('sha256').update(`${storage}\u0000${stateRef}`, 'utf8').digest('hex').slice(0, 32);
  return path.join(os.tmpdir(), 'squad-backend-locks', key);
}

/**
 * The lock root must be the same path in every process that shares the backend, otherwise two
 * `squad state-mcp` servers never contend and both believe they hold the conversation.
 *
 * A file-backed backend (`root`) keeps its locks next to its data. Backends whose data lives
 * outside the working tree (`orphan`, `git-notes`, `two-layer`, or an opaque backend with a
 * `lockAnchor`) derive their lock directory from the canonical shared storage (the shared git
 * common dir across linked worktrees, resolved through symlinks/path aliases) and the state ref.
 */
function resolveLockDir(backend: StateBackendLike, opts: StateBackendStoreOptions): string {
  if (opts.squadDir) return path.resolve(opts.squadDir);
  const candidate = backend as InspectableBackend;
  if (typeof candidate.root === 'string' && candidate.root) return path.resolve(candidate.root);
  const identity = resolveSharedBackendIdentity(backend, opts);
  if (identity) return machineLocalLockDir(identity.storage, identity.stateRef);
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
