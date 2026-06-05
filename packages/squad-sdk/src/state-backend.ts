/**
 * Git-native state backends for `.squad/` state storage.
 *
 * Hardening: retry with exponential backoff for transient git errors,
 * circuit-breaker to prevent cascading failures, startup verification,
 * and observable error surfacing (no silent swallowing).
 *
 * @module state-backend
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import type { StorageProvider, StorageStats } from './storage/storage-provider.js';

const storage = new FSStorageProvider();

// ── Retry configuration ─────────────────────────────────────────────
const RETRY_MAX = 3;
const RETRY_BASE_MS = 100;
const RETRY_MAX_DELAY_MS = 2000;

/**
 * Buffer ceiling for git stdout/stderr. The Node default is 1 MiB, which is
 * easily blown by `git ls-tree` against large trees or `git notes show` on
 * sizeable JSON blobs — spawnSync then dies with ENOBUFS and the wrapper
 * surfaces it as a generic "git command failed". 256 MiB keeps us safely
 * above any realistic `.squad/` state payload while still capping memory.
 */
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

// ── Circuit breaker configuration ───────────────────────────────────
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

/** Classify git stderr as a transient (retryable) failure. */
function isTransientGitError(stderr: string): boolean {
  return /unable to access|could not lock|timeout|connection refused|network|SSL|couldn't connect|Another git process|index\.lock/i.test(stderr);
}

/** Non-busy synchronous sleep using Atomics. Safe in Node.js 20+. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Execute a git command with retry for transient errors.
 * Throws on failure after exhausting retries.
 */
function gitExecWithRetry(args: string[], cwd: string, trimOutput = true): string {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const raw = execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
      return trimOutput ? raw.trim() : raw;
    } catch (err: unknown) {
      lastError = err;
      const stderr = (err as { stderr?: string }).stderr ?? '';
      if (attempt < RETRY_MAX && isTransientGitError(stderr)) {
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
        sleepSync(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Execute a git command with stdin input and retry for transient errors.
 * Throws on failure after exhausting retries.
 */
function gitExecWithInputAndRetry(args: string[], cwd: string, input: string): string {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return execFileSync('git', args, { cwd, input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER }).trim();
    } catch (err: unknown) {
      lastError = err;
      const stderr = (err as { stderr?: string }).stderr ?? '';
      if (attempt < RETRY_MAX && isTransientGitError(stderr)) {
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
        sleepSync(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ── Typed git errors ────────────────────────────────────────────────

/** Typed error for git command failures with stderr and command context. */
export class GitExecError extends Error {
  readonly name = 'GitExecError';
  constructor(
    public readonly command: string,
    public readonly reason: string,
    public readonly stderr: string,
  ) {
    super(`git command failed: ${command} — ${reason}`);
  }
}

/**
 * Patterns indicating an expected "not found" result from git,
 * as opposed to a real failure (corruption, permission, broken repo).
 */
const GIT_EXPECTED_MISSING_RE =
  /no note found|does not exist in|Not a valid object name|invalid object name|not a tree object|bad default revision|Needed a single revision|unknown revision or path|bad object/i;

function isExpectedMissing(err: unknown): boolean {
  const stderr = (err as { stderr?: string }).stderr ?? '';
  const msg = err instanceof Error ? err.message : '';
  return GIT_EXPECTED_MISSING_RE.test(stderr) || GIT_EXPECTED_MISSING_RE.test(msg);
}

export type StateBackendType = 'local' | 'external' | 'orphan' | 'two-layer';

export interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  delete(relativePath: string): boolean;
  append(relativePath: string, content: string): void;
  readonly name: string;
}

// ── Circuit Breaker ─────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number = CIRCUIT_BREAKER_THRESHOLD,
    private readonly cooldownMs: number = CIRCUIT_BREAKER_COOLDOWN_MS,
  ) {}

  /** Execute an operation through the circuit breaker. */
  execute<T>(fn: () => T, operation: string): T {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'half-open';
      } else {
        throw new Error(
          `Circuit breaker OPEN after ${this.failures} consecutive git failures. ` +
          `Operation '${operation}' rejected. Will retry after ${Math.ceil((this.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000)}s cooldown.`,
        );
      }
    }
    try {
      const result = fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  get consecutiveFailures(): number { return this.failures; }
  get currentState(): CircuitState { return this.state; }
}

// ── Git exec helpers (with retry + error classification) ────────────

/**
 * Execute a git command, returning null for expected absence (e.g., missing ref/path/note).
 * Throws GitExecError for real failures (permission denied, corruption, broken repo).
 * Retries transient errors before classifying.
 *
 * NOTE: `args` is an array, NOT a space-separated string. This was previously a
 * string split on whitespace, which silently mangled any argument containing a
 * space (commit messages, paths with spaces, etc.).
 */
function gitExecMaybeMissing(args: string[], cwd: string, trimOutput = true): string | null {
  try {
    return gitExecWithRetry(args, cwd, trimOutput);
  } catch (err: unknown) {
    if (isExpectedMissing(err)) return null;
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitExecError(`git ${args.join(' ')}`, msg, stderr);
  }
}

/**
 * Execute a git command that MUST succeed. Throws GitExecError on any failure.
 * Retries transient errors before throwing.
 *
 * NOTE: `args` is an array, NOT a space-separated string (see gitExecMaybeMissing).
 */
function gitExecOrThrow(args: string[], cwd: string): string {
  try {
    return gitExecWithRetry(args, cwd);
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitExecError(`git ${args.join(' ')}`, msg, stderr);
  }
}

// ── Optimistic concurrency (compare-and-swap) ───────────────────────

/** Maximum CAS retry attempts before surfacing as concurrency error. */
const CAS_MAX_ATTEMPTS = 5;
/** Base delay for jittered exponential backoff: 50, 100, 200, 400, 800 ms. */
const CAS_BASE_DELAY_MS = 50;
/** Git's canonical "ref must not exist" sentinel for update-ref CAS. */
const GIT_NULL_OID = '0000000000000000000000000000000000000000';

/**
 * Thrown when an optimistic CAS write (update-ref expected-old) fails after
 * exhausting all retry attempts. Callers may surface, requeue, or retry with
 * application-level coordination. Distinct from GitExecError, which signals
 * a real git failure (corruption, permission, broken repo).
 */
export class StateBackendConcurrencyError extends Error {
  readonly name = 'StateBackendConcurrencyError';
  constructor(
    public readonly operation: string,
    public readonly attempts: number,
    public readonly lastStderr: string,
  ) {
    super(`State backend concurrency conflict on '${operation}' after ${attempts} attempts: ${lastStderr || 'ref moved between read and write'}`);
  }
}

/**
 * Jittered exponential backoff in milliseconds for attempt N (0-indexed):
 * 50, 100, 200, 400, 800 ms base, with ±25% jitter to avoid thundering herd.
 */
function jitteredBackoffMs(attempt: number): number {
  const base = CAS_BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = (Math.random() - 0.5) * 0.5 * base;
  return Math.max(1, Math.round(base + jitter));
}

/**
 * Patterns indicating an `update-ref` CAS conflict (retryable) rather than
 * a hard failure. We classify any "ref ... is at ... but expected ..." or
 * lock contention as retryable so the caller can re-read and re-attempt.
 */
const GIT_UPDATE_REF_CAS_RE = /is at .* but expected|cannot lock ref|reference already exists|cas_error/i;

/**
 * Attempt an atomic ref update with compare-and-swap semantics.
 *
 * `expectedOldSha` of `null` means "create only if does not exist"
 * (passed as 40 zeros, git's canonical no-such-ref sentinel).
 *
 * Returns `{ ok: true }` on success, `{ ok: false, stderr }` on CAS conflict,
 * and re-throws any non-CAS git failure (corruption, permission, etc.).
 */
function tryUpdateRef(ref: string, newSha: string, expectedOldSha: string | null, cwd: string): { ok: boolean; stderr: string } {
  if (_casInjector) {
    const forced = _casInjector(ref);
    if (forced) return forced;
  }
  const expected = expectedOldSha ?? GIT_NULL_OID;
  try {
    execFileSync('git', ['update-ref', ref, newSha, expected], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER,
    });
    return { ok: true, stderr: '' };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    if (GIT_UPDATE_REF_CAS_RE.test(stderr)) {
      return { ok: false, stderr };
    }
    throw err;
  }
}

/**
 * Test-only injector for forcing CAS-conflict / success outcomes deterministically.
 * Production callers never set this. @internal
 */
let _casInjector: ((ref: string) => { ok: boolean; stderr: string } | null) | null = null;
export function _setCasInjectorForTesting(fn: ((ref: string) => { ok: boolean; stderr: string } | null) | null): void {
  _casInjector = fn;
}

/**
 * Internal CAS primitive — exported for unit tests only.
 * @internal
 */
export const _tryUpdateRefForTesting = tryUpdateRef;

// ── Backends ────────────────────────────────────────────────────────

export class WorktreeBackend implements StateBackend {
  readonly name = 'local';
  private readonly root: string;
  constructor(squadDir: string) {
    if (squadDir.includes('..')) throw new Error('Path traversal not allowed');
    this.root = squadDir;
  }
  read(relativePath: string): string | undefined {
    const key = normalizeKey(relativePath);
    return storage.readSync(path.join(this.root, key)) ?? undefined;
  }
  write(relativePath: string, content: string): void {
    const key = normalizeKey(relativePath);
    storage.writeSync(path.join(this.root, key), content);
  }
  exists(relativePath: string): boolean {
    const key = normalizeKey(relativePath);
    return storage.existsSync(path.join(this.root, key));
  }
  list(relativeDir: string): string[] {
    const key = normalizeKey(relativeDir);
    const full = path.join(this.root, key);
    if (!storage.existsSync(full) || !storage.isDirectorySync(full)) return [];
    return storage.listSync(full);
  }
  delete(relativePath: string): boolean {
    const key = normalizeKey(relativePath);
    const full = path.join(this.root, key);
    if (!storage.existsSync(full)) return false;
    storage.deleteSync(full);
    return true;
  }
  append(relativePath: string, content: string): void {
    const key = normalizeKey(relativePath);
    storage.appendSync(path.join(this.root, key), content);
  }
}


/**
 * Validate a state key against characters that could corrupt git plumbing
 * input (mktree stdin format, branch:path refs) or cause path confusion.
 */
export function validateStateKey(key: string): void {
  if (!key || key.length === 0) {
    throw new Error('State key must be non-empty');
  }
  if (key.includes('\0')) {
    throw new Error('State key must not contain null bytes');
  }
  if (/[\n\r]/.test(key)) {
    throw new Error('State key must not contain newline characters');
  }
  if (key.includes('\t')) {
    throw new Error('State key must not contain tab characters');
  }
  const segments = key.split('/');
  for (const seg of segments) {
    if (seg === '') {
      throw new Error('State key must not contain empty path segments');
    }
    if (seg === '.' || seg === '..') {
      throw new Error('State key must not contain . or .. path segments');
    }
  }
}


function normalizeKey(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  // Empty string after normalization means "root" — valid for list() operations
  if (normalized.length > 0) {
    validateStateKey(normalized);
  }
  return normalized;
}

export class GitNotesBackend implements StateBackend {
  readonly name = 'git-notes';
  private readonly cwd: string;
  private readonly ref = 'squad';
  private readonly breaker = new CircuitBreaker();
  private _rootCommit: string | undefined;
  constructor(repoRoot: string) { this.cwd = repoRoot; }

  /** Returns the root commit SHA — a stable anchor that never moves. Cached after first call. */
  private rootCommit(): string {
    if (!this._rootCommit) {
      this._rootCommit = gitExecOrThrow(['rev-list', '--max-parents=0', 'HEAD'], this.cwd);
    }
    return this._rootCommit;
  }

  /** Resolve the current SHA of refs/notes/<ref>, or null if it doesn't exist. */
  private readNotesRef(): string | null {
    return gitExecMaybeMissing(['rev-parse', '--verify', `refs/notes/${this.ref}`], this.cwd);
  }

  /**
   * Load the JSON blob attached to the root commit at a SPECIFIC notes ref SHA.
   * Reading at a pinned SHA (not the live ref tip) is the foundation of the CAS
   * loop — without it, a writer could observe state at version N, build version
   * N+1, but race against another writer who already advanced to N+1' (losing
   * data). With a pinned read, the subsequent update-ref CAS catches the race.
   *
   * NOTE: this relies on the notes tree having no fanout. Git uses fanout
   * (ab/cdef.../) only when many notes are present; we only ever store a single
   * note (on the root commit), so the path is just `<refSha>:<anchor>`.
   */
  private loadBlobAt(refSha: string | null): Record<string, string> {
    if (!refSha) return {};
    const anchor = this.rootCommit();
    const raw = gitExecMaybeMissing(['show', `${refSha}:${anchor}`], this.cwd, false);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch { return {}; }
  }

  /** Convenience reader at the live ref tip (used for read-only operations). */
  private loadBlob(): Record<string, string> {
    return this.loadBlobAt(this.readNotesRef());
  }

  /**
   * Build a new notes commit and attempt to atomically swing refs/notes/<ref>
   * from `expectedOldRefSha` to it. Returns the same `{ ok, stderr }` shape as
   * tryUpdateRef so the caller's retry loop can act.
   */
  private atomicSaveBlob(blob: Record<string, string>, expectedOldRefSha: string | null): { ok: boolean; stderr: string } {
    const anchor = this.rootCommit();
    const json = JSON.stringify(blob, null, 2);
    let blobSha: string;
    let treeSha: string;
    let commitSha: string;
    try {
      blobSha = gitExecWithInputAndRetry(['hash-object', '-w', '--stdin'], this.cwd, json);
      treeSha = gitExecWithInputAndRetry(['mktree'], this.cwd, `100644 blob ${blobSha}\t${anchor}\n`);
      const parentArgs = expectedOldRefSha ? ['-p', expectedOldRefSha] : [];
      commitSha = gitExecWithRetry(['commit-tree', treeSha, ...parentArgs, '-m', 'Update squad state'], this.cwd);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`git-notes backend: failed to build notes commit — ${msg}`);
    }
    return tryUpdateRef(`refs/notes/${this.ref}`, commitSha, expectedOldRefSha, this.cwd);
  }

  /**
   * Run a mutator under optimistic CAS. The mutator receives the current blob
   * (re-read on every attempt) and may mutate it; its return value is forwarded
   * to the caller on success. On CAS conflict, the loop retries with jittered
   * backoff up to CAS_MAX_ATTEMPTS times, then throws StateBackendConcurrencyError.
   */
  private mutateBlob<T>(operation: string, mutator: (blob: Record<string, string>) => T): T {
    let lastStderr = '';
    for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
      const oldRefSha = this.readNotesRef();
      const blob = this.loadBlobAt(oldRefSha);
      const result = mutator(blob);
      const writeResult = this.atomicSaveBlob(blob, oldRefSha);
      if (writeResult.ok) return result;
      lastStderr = writeResult.stderr;
      if (attempt < CAS_MAX_ATTEMPTS - 1) {
        sleepSync(jitteredBackoffMs(attempt));
      }
    }
    throw new StateBackendConcurrencyError(operation, CAS_MAX_ATTEMPTS, lastStderr);
  }

  read(relativePath: string): string | undefined {
    return this.breaker.execute(() => {
      const blob = this.loadBlob();
      return blob[normalizeKey(relativePath)];
    }, `git-notes:read(${relativePath})`);
  }
  write(relativePath: string, content: string): void {
    this.breaker.execute(() => {
      this.mutateBlob(`git-notes:write(${relativePath})`, (blob) => {
        blob[normalizeKey(relativePath)] = content;
      });
    }, `git-notes:write(${relativePath})`);
  }
  exists(relativePath: string): boolean {
    return this.breaker.execute(
      () => Object.hasOwn(this.loadBlob(), normalizeKey(relativePath)),
      `git-notes:exists(${relativePath})`,
    );
  }
  list(relativeDir: string): string[] {
    return this.breaker.execute(() => {
      const blob = this.loadBlob();
      const normalized = normalizeKey(relativeDir);
      const dirPrefix = normalized ? normalized + '/' : '';
      const entries = new Set<string>();
      for (const key of Object.keys(blob)) {
        if (key.startsWith(dirPrefix)) {
          const rest = key.slice(dirPrefix.length);
          const slash = rest.indexOf('/');
          entries.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }
      return [...entries].sort();
    }, `git-notes:list(${relativeDir})`);
  }
  delete(relativePath: string): boolean {
    return this.breaker.execute(() => {
      const key = normalizeKey(relativePath);
      return this.mutateBlob(`git-notes:delete(${relativePath})`, (blob) => {
        if (!Object.hasOwn(blob, key)) return false;
        delete blob[key];
        return true;
      });
    }, `git-notes:delete(${relativePath})`);
  }
  append(relativePath: string, content: string): void {
    this.breaker.execute(() => {
      this.mutateBlob(`git-notes:append(${relativePath})`, (blob) => {
        const key = normalizeKey(relativePath);
        blob[key] = (blob[key] ?? '') + content;
      });
    }, `git-notes:append(${relativePath})`);
  }
}

export class OrphanBranchBackend implements StateBackend {
  readonly name = 'orphan';
  private readonly cwd: string;
  private readonly branch: string;
  private readonly breaker = new CircuitBreaker();
  constructor(repoRoot: string, branch = 'squad-state') {
    this.cwd = repoRoot; this.branch = branch;
  }

  private ensureBranch(): void {
    if (gitExecMaybeMissing(['rev-parse', '--verify', `refs/heads/${this.branch}`], this.cwd)) return;
    let tree: string;
    try {
      tree = gitExecWithInputAndRetry(['mktree'], this.cwd, '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`orphan backend: failed to create empty tree — ${msg}`);
    }
    let commit: string;
    try {
      commit = gitExecWithRetry(
        ['commit-tree', tree, '-m', 'Initialize squad-state branch'],
        this.cwd,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`orphan backend: failed to create initial commit — ${msg}`);
    }
    // CAS create: succeeds only if the ref still doesn't exist. If a concurrent
    // writer created it between our check and now, fall through silently — the
    // caller's mutation loop will pick up the new head on its next iteration.
    const writeResult = tryUpdateRef(`refs/heads/${this.branch}`, commit, null, this.cwd);
    if (!writeResult.ok) {
      // Re-verify someone else created it; if so, we're done.
      if (gitExecMaybeMissing(['rev-parse', '--verify', `refs/heads/${this.branch}`], this.cwd)) return;
      throw new Error(`orphan backend: failed to initialize branch — ${writeResult.stderr}`);
    }
  }

  read(relativePath: string): string | undefined {
    return this.breaker.execute(() => {
      const result = gitExecMaybeMissing(['show', `${this.branch}:${normalizeKey(relativePath)}`], this.cwd, false);
      return result ?? undefined;
    }, `orphan:read(${relativePath})`);
  }

  write(relativePath: string, content: string): void {
    this.breaker.execute(() => {
      this.ensureBranch();
      const key = normalizeKey(relativePath);

      // Blob is content-addressed, so hash once outside the CAS loop.
      let blobHash: string;
      try {
        blobHash = gitExecWithInputAndRetry(['hash-object', '-w', '--stdin'], this.cwd, content);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`orphan backend: failed to hash content for ${key} — ${msg}`);
      }

      let lastStderr = '';
      for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
        // Re-read the ref every iteration so we rebuild on top of the latest tree.
        const parentCommit = gitExecMaybeMissing(['rev-parse', '--verify', `refs/heads/${this.branch}`], this.cwd);
        let currentTree: string;
        if (parentCommit) {
          const treeResult = gitExecMaybeMissing(['rev-parse', `${parentCommit}^{tree}`], this.cwd);
          currentTree = treeResult ?? gitExecWithInputAndRetry(['mktree'], this.cwd, '');
        } else {
          try { currentTree = gitExecWithInputAndRetry(['mktree'], this.cwd, ''); }
          catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`orphan backend: failed to create empty tree — ${msg}`);
          }
        }

        const newTree = this.updateTree(currentTree, key.split('/'), blobHash);
        let newCommit: string;
        try {
          const parentArgs = parentCommit ? ['-p', parentCommit] : [];
          newCommit = gitExecWithRetry(
            ['commit-tree', newTree, ...parentArgs, '-m', `Update ${key}`],
            this.cwd,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`orphan backend: failed to commit update for ${key} — ${msg}`);
        }

        const writeResult = tryUpdateRef(`refs/heads/${this.branch}`, newCommit, parentCommit, this.cwd);
        if (writeResult.ok) return;
        lastStderr = writeResult.stderr;
        if (attempt < CAS_MAX_ATTEMPTS - 1) {
          sleepSync(jitteredBackoffMs(attempt));
        }
      }
      throw new StateBackendConcurrencyError(`orphan:write(${relativePath})`, CAS_MAX_ATTEMPTS, lastStderr);
    }, `orphan:write(${relativePath})`);
  }

  exists(relativePath: string): boolean {
    return this.breaker.execute(
      () => gitExecMaybeMissing(['cat-file', '-t', `${this.branch}:${normalizeKey(relativePath)}`], this.cwd) !== null,
      `orphan:exists(${relativePath})`,
    );
  }

  list(relativeDir: string): string[] {
    return this.breaker.execute(() => {
      const key = normalizeKey(relativeDir);
      const target = key ? `${this.branch}:${key}` : `${this.branch}:`;
      const result = gitExecMaybeMissing(['ls-tree', '--name-only', target], this.cwd);
      if (!result) return [];
      return result.split('\n').filter(Boolean);
    }, `orphan:list(${relativeDir})`);
  }

  delete(relativePath: string): boolean {
    return this.breaker.execute(() => {
      const key = normalizeKey(relativePath);
      if (gitExecMaybeMissing(['cat-file', '-t', `${this.branch}:${key}`], this.cwd) === null) return false;
      this.ensureBranch();

      let lastStderr = '';
      for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
        const parentCommit = gitExecMaybeMissing(['rev-parse', '--verify', `refs/heads/${this.branch}`], this.cwd);
        if (!parentCommit) return false;
        const treeResult = gitExecMaybeMissing(['rev-parse', `${parentCommit}^{tree}`], this.cwd);
        if (!treeResult) return false;

        // Re-check existence at the freshly-read tree — a concurrent delete may
        // have already removed our key, in which case there's nothing to do.
        if (gitExecMaybeMissing(['cat-file', '-t', `${parentCommit}:${key}`], this.cwd) === null) return false;

        const newTree = this.removeFromTree(treeResult, key.split('/'));
        let newCommit: string;
        try {
          newCommit = gitExecWithRetry(
            ['commit-tree', newTree, '-p', parentCommit, '-m', `Delete ${key}`],
            this.cwd,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`orphan backend: failed to commit delete for ${key} — ${msg}`);
        }

        const writeResult = tryUpdateRef(`refs/heads/${this.branch}`, newCommit, parentCommit, this.cwd);
        if (writeResult.ok) return true;
        lastStderr = writeResult.stderr;
        if (attempt < CAS_MAX_ATTEMPTS - 1) {
          sleepSync(jitteredBackoffMs(attempt));
        }
      }
      throw new StateBackendConcurrencyError(`orphan:delete(${relativePath})`, CAS_MAX_ATTEMPTS, lastStderr);
    }, `orphan:delete(${relativePath})`);
  }

  append(relativePath: string, content: string): void {
    const existing = this.read(relativePath) ?? '';
    this.write(relativePath, existing + content);
  }

  private removeFromTree(baseTree: string, pathSegments: string[]): string {
    if (pathSegments.length === 0) throw new Error('orphan backend: empty path segments');
    if (pathSegments.length === 1) {
      const listing = gitExecMaybeMissing(['ls-tree', baseTree], this.cwd) ?? '';
      const lines = listing.split('\n').filter(Boolean);
      const filtered = lines.filter((line) => {
        const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
        return !(match && match[4] === pathSegments[0]);
      });
      try {
        return gitExecWithInputAndRetry(['mktree'], this.cwd, filtered.length > 0 ? filtered.join('\n') + '\n' : '');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`orphan backend: failed to remove entry ${pathSegments[0]} — ${msg}`);
      }
    }
    const [dir, ...rest] = pathSegments;
    const subTreeHash = this.getSubtreeHash(baseTree, dir!);
    if (!subTreeHash) return baseTree;
    const childTree = this.removeFromTree(subTreeHash, rest);
    const childListing = gitExecMaybeMissing(['ls-tree', childTree], this.cwd);
    if (!childListing || childListing.length === 0) {
      const listing = gitExecMaybeMissing(['ls-tree', baseTree], this.cwd) ?? '';
      const lines = listing.split('\n').filter(Boolean);
      const filtered = lines.filter((line) => {
        const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
        return !(match && match[4] === dir);
      });
      try {
        return gitExecWithInputAndRetry(['mktree'], this.cwd, filtered.length > 0 ? filtered.join('\n') + '\n' : '');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`orphan backend: failed to prune empty directory ${dir} — ${msg}`);
      }
    }
    return this.replaceEntry(baseTree, dir!, '040000', 'tree', childTree);
  }

  private updateTree(baseTree: string, pathSegments: string[], blobHash: string): string {
    if (pathSegments.length === 0) throw new Error('orphan backend: empty path segments');
    if (pathSegments.length === 1) {
      return this.replaceEntry(baseTree, pathSegments[0]!, '100644', 'blob', blobHash);
    }
    const [dir, ...rest] = pathSegments;
    const subTreeHash = this.getSubtreeHash(baseTree, dir!);
    let childTree: string;
    if (subTreeHash) {
      childTree = this.updateTree(subTreeHash, rest, blobHash);
    } else {
      const emptyTree = gitExecWithInputAndRetry(['mktree'], this.cwd, '');
      childTree = this.updateTree(emptyTree, rest, blobHash);
    }
    return this.replaceEntry(baseTree, dir!, '040000', 'tree', childTree);
  }

  private getSubtreeHash(treeHash: string, name: string): string | null {
    const listing = gitExecMaybeMissing(['ls-tree', treeHash], this.cwd);
    if (!listing) return null;
    for (const line of listing.split('\n')) {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      if (match && match[4] === name && match[2] === 'tree') return match[3]!;
    }
    return null;
  }

  private replaceEntry(treeHash: string, name: string, mode: string, type: string, hash: string): string {
    const listing = gitExecMaybeMissing(['ls-tree', treeHash], this.cwd) ?? '';
    const lines = listing.split('\n').filter(Boolean);
    const filtered = lines.filter((line) => {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      return !(match && match[4] === name);
    });
    filtered.push(`${mode} ${type} ${hash}\t${name}`);
    try {
      return gitExecWithInputAndRetry(['mktree'], this.cwd, filtered.join('\n') + '\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`orphan backend: failed to create tree with entry ${name} — ${msg}`);
    }
  }
}

/**
 * Adapter that wraps a StateBackend as a StorageProvider.
 *
 * Modules that accept `storage: StorageProvider` can use this adapter
 * so that git-notes and orphan backends flow through the same code paths
 * as the local filesystem backend.
 */
export class StateBackendStorageAdapter implements StorageProvider {
  constructor(private backend: StateBackend, private squadDir: string) {}

  // ── Async operations ─────────────────────────────────────────────────────
  async read(filePath: string): Promise<string | undefined> {
    return this.backend.read(this.toRelative(filePath));
  }
  async write(filePath: string, data: string): Promise<void> {
    this.backend.write(this.toRelative(filePath), data);
  }
  async append(filePath: string, data: string): Promise<void> {
    this.backend.append(this.toRelative(filePath), data);
  }
  async exists(filePath: string): Promise<boolean> {
    return this.backend.exists(this.toRelative(filePath));
  }
  async list(dirPath: string): Promise<string[]> {
    return this.backend.list(this.toRelative(dirPath));
  }
  async delete(filePath: string): Promise<void> {
    this.backend.delete(this.toRelative(filePath));
  }
  async deleteDir(dirPath: string): Promise<void> {
    const rel = this.toRelative(dirPath);
    const entries = this.backend.list(rel);
    for (const entry of entries) { this.backend.delete(rel ? rel + '/' + entry : entry); }
  }
  async isDirectory(targetPath: string): Promise<boolean> {
    return this.backend.list(this.toRelative(targetPath)).length > 0;
  }
  async mkdir(_dirPath: string, _options?: { recursive?: boolean }): Promise<void> { /* no-op for git backends */ }
  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = this.backend.read(this.toRelative(oldPath));
    if (content !== undefined) { this.backend.write(this.toRelative(newPath), content); this.backend.delete(this.toRelative(oldPath)); }
  }
  async copy(srcPath: string, destPath: string): Promise<void> {
    const content = this.backend.read(this.toRelative(srcPath));
    if (content !== undefined) { this.backend.write(this.toRelative(destPath), content); }
  }
  async stat(targetPath: string): Promise<StorageStats | undefined> {
    const content = this.backend.read(this.toRelative(targetPath));
    if (content === undefined) return undefined;
    return { size: content.length, mtimeMs: Date.now(), isDirectory: false };
  }

  // ── Sync variants ────────────────────────────────────────────────────────
  readSync(filePath: string): string | undefined { return this.backend.read(this.toRelative(filePath)); }
  writeSync(filePath: string, data: string): void { this.backend.write(this.toRelative(filePath), data); }
  appendSync(filePath: string, data: string): void { this.backend.append(this.toRelative(filePath), data); }
  existsSync(filePath: string): boolean { return this.backend.exists(this.toRelative(filePath)); }
  listSync(dirPath: string): string[] { return this.backend.list(this.toRelative(dirPath)); }
  deleteSync(filePath: string): void { this.backend.delete(this.toRelative(filePath)); }
  deleteDirSync(dirPath: string): void {
    const rel = this.toRelative(dirPath);
    const entries = this.backend.list(rel);
    for (const entry of entries) { this.backend.delete(rel ? rel + '/' + entry : entry); }
  }
  isDirectorySync(targetPath: string): boolean {
    return this.backend.list(this.toRelative(targetPath)).length > 0;
  }
  mkdirSync(_dirPath: string, _options?: { recursive?: boolean }): void { /* no-op */ }
  renameSync(oldPath: string, newPath: string): void {
    const content = this.backend.read(this.toRelative(oldPath));
    if (content !== undefined) { this.backend.write(this.toRelative(newPath), content); this.backend.delete(this.toRelative(oldPath)); }
  }
  copySync(srcPath: string, destPath: string): void {
    const content = this.backend.read(this.toRelative(srcPath));
    if (content !== undefined) { this.backend.write(this.toRelative(destPath), content); }
  }
  statSync(targetPath: string): StorageStats | undefined {
    const content = this.backend.read(this.toRelative(targetPath));
    if (content === undefined) return undefined;
    return { size: content.length, mtimeMs: Date.now(), isDirectory: false };
  }

  /** Convert absolute path to relative path for the backend. */
  private toRelative(filePath: string): string {
    // Use path.resolve() so drive-letter casing differences on Windows are
    // normalised before comparison, preventing corrupt git-notes keys.
    const resolvedFile = path.resolve(filePath);
    const resolvedSquad = path.resolve(this.squadDir);

    const isWindows = process.platform === 'win32';
    const fileCmp = isWindows ? resolvedFile.toLowerCase() : resolvedFile;
    const squadCmp = isWindows ? resolvedSquad.toLowerCase() : resolvedSquad;

    const prefix = squadCmp.endsWith(path.sep) ? squadCmp : squadCmp + path.sep;
    if (fileCmp.startsWith(prefix)) {
      return resolvedFile.slice(resolvedSquad.length + 1).replace(/\\/g, '/');
    }
    if (fileCmp === squadCmp) {
      return '.';
    }
    // If the path is already relative (no drive letter or leading sep), normalise and return.
    if (!path.isAbsolute(filePath)) {
      return filePath.replace(/\\/g, '/');
    }
    // Absolute path that doesn't live under squadDir — this would produce a
    // corrupt git-notes key (absolute path leaking into the ref namespace).
    throw new Error(
      `[squad] toRelative: path is outside squadDir and cannot be used as a state key.\n` +
      `  path:     ${resolvedFile}\n` +
      `  squadDir: ${resolvedSquad}`
    );
  }
}

/**
 * Result of promoteNotes — how many notes were moved, archived, or skipped.
 */
export interface PromoteNotesResult {
  /** Orphan keys written for notes flagged `promote_to_permanent`. */
  promoted: string[];
  /** Orphan keys written for notes flagged `archive_on_close`. */
  archived: string[];
  /** Count of notes that had neither flag and were left in place. */
  skipped: number;
}

/**
 * Two-Layer Backend — combines git-notes (commit-scoped annotations) with orphan
 * branch (permanent state). Reads from orphan for bulk state, writes to both:
 * - Git notes for commit-scoped "why" annotations (per-agent namespace)
 * - Orphan branch for permanent state (decisions, histories, logs)
 *
 * The notes layer is a real, callable consumer in this backend: call
 * {@link TwoLayerBackend.promoteNotes} after a PR merges to move notes flagged
 * with `promote_to_permanent` into the orphan store, and copy notes flagged
 * with `archive_on_close` into `archive/`. {@link TwoLayerBackend.readNote}
 * returns a single note's payload.
 */
export class TwoLayerBackend implements StateBackend {
  readonly name = 'two-layer';
  readonly notes: GitNotesBackend;
  readonly orphan: OrphanBranchBackend;
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.notes = new GitNotesBackend(repoRoot);
    this.orphan = new OrphanBranchBackend(repoRoot);
  }

  /** Read from orphan (the permanent store) */
  read(key: string): string | undefined {
    return this.orphan.read(key);
  }

  /** Write to orphan (permanent state) AND git notes (commit-scoped annotation) */
  write(key: string, value: string): void {
    this.orphan.write(key, value);
    try {
      this.notes.write(key, value);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[two-layer] notes write failed for ${key}: ${msg}`);
    }
  }

  list(dir: string): string[] {
    return this.orphan.list(dir);
  }

  exists(key: string): boolean {
    return this.orphan.exists(key);
  }

  delete(key: string): boolean {
    const result = this.orphan.delete(key);
    try {
      this.notes.delete(key);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[two-layer] notes delete failed for ${key}: ${msg}`);
    }
    return result;
  }

  append(key: string, value: string): void {
    this.orphan.append(key, value);
    try {
      this.notes.append(key, value);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[two-layer] notes append failed for ${key}: ${msg}`);
    }
  }

  /**
   * Read a single git-notes payload as parsed JSON.
   *
   * Returns `null` if no note exists on the given commit for the given ref,
   * or if the note body is not valid JSON.
   */
  readNote(ref: string, commitSha: string): unknown | null {
    if (!this.isSafeRef(ref) || !this.isSafeCommitSha(commitSha)) return null;
    const raw = gitExecMaybeMissing(['notes', `--ref=${ref}`, 'show', commitSha], this.repoRoot, false);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  /**
   * Walk all notes attached to commits reachable from HEAD on the given ref
   * and act based on their flags:
   *
   * - `promote_to_permanent: true` — write payload to the orphan layer under
   *   `promoted/<ref>/<sha>.json` and REMOVE the source note (the note has
   *   been promoted to permanent state and is no longer needed).
   * - `archive_on_close: true` — copy payload to the orphan layer under
   *   `archive/<ref>/<sha>.json` and KEEP the source note (archive = copy).
   * - Otherwise — leave the note alone (ephemeral, not worth promoting).
   *
   * Notes that fail to parse as JSON are counted as skipped.
   */
  promoteNotes(ref: string): PromoteNotesResult {
    const result: PromoteNotesResult = { promoted: [], archived: [], skipped: 0 };
    if (!this.isSafeRef(ref)) {
      throw new Error(`[two-layer] promoteNotes: unsafe ref '${ref}'`);
    }

    const listing = gitExecMaybeMissing(['notes', `--ref=${ref}`, 'list'], this.repoRoot);
    if (!listing) return result;

    // git notes list output: "<noteSha> <commitSha>" per line.
    const noteCommitPairs: Array<{ commitSha: string }> = [];
    for (const line of listing.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const commitSha = parts[1]!;
      if (this.isSafeCommitSha(commitSha)) noteCommitPairs.push({ commitSha });
    }
    if (noteCommitPairs.length === 0) return result;

    // Reachability filter: only commits reachable from HEAD.
    const reachableRaw = gitExecMaybeMissing(['rev-list', 'HEAD'], this.repoRoot);
    if (!reachableRaw) return result;
    const reachable = new Set(reachableRaw.split('\n').map((s) => s.trim()).filter(Boolean));

    const refKeySegment = this.sanitizeRefForKey(ref);

    for (const { commitSha } of noteCommitPairs) {
      if (!reachable.has(commitSha)) continue;

      const raw = gitExecMaybeMissing(['notes', `--ref=${ref}`, 'show', commitSha], this.repoRoot, false);
      if (raw === null) continue;

      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { result.skipped++; continue; }

      const flags = payload as { promote_to_permanent?: unknown; archive_on_close?: unknown };
      const shouldPromote = flags?.promote_to_permanent === true;
      const shouldArchive = flags?.archive_on_close === true;

      if (!shouldPromote && !shouldArchive) { result.skipped++; continue; }

      // Stringify payload deterministically (2-space indent matches existing pattern).
      const body = JSON.stringify(payload, null, 2);

      if (shouldPromote) {
        const key = `promoted/${refKeySegment}/${commitSha}.json`;
        this.orphan.write(key, body);
        try {
          gitExecOrThrow(['notes', `--ref=${ref}`, 'remove', commitSha], this.repoRoot);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[two-layer] promoteNotes: removed-source failed for ${commitSha} on ${ref}: ${msg}`);
        }
        result.promoted.push(key);
      }

      if (shouldArchive) {
        const key = `archive/${refKeySegment}/${commitSha}.json`;
        this.orphan.write(key, body);
        result.archived.push(key);
      }
    }

    return result;
  }

  /** True for refs that look like `squad/<name>` — alphanumerics, dash, underscore, slash. */
  private isSafeRef(ref: string): boolean {
    return /^[A-Za-z0-9_\-./]+$/.test(ref) && !ref.includes('..');
  }

  /** True for SHA-1 hex (40 chars) or SHA-256 hex (64 chars). */
  private isSafeCommitSha(sha: string): boolean {
    return /^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(sha);
  }

  /** Pass the ref through as path segments; normalizeKey will validate each. */
  private sanitizeRefForKey(ref: string): string {
    return ref.split('/').filter(Boolean).join('/');
  }
}

export interface StateBackendConfig { stateBackend?: StateBackendType; }

export function resolveStateBackend(squadDir: string, repoRoot: string, cliOverride?: StateBackendType): StateBackend {
  let configBackend: StateBackendType | undefined;
  try {
    const configPath = path.join(squadDir, 'config.json');
    const raw = storage.readSync(configPath);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed['stateBackend'] === 'string' && isValidBackendType(parsed['stateBackend'])) {
        configBackend = normalizeBackendType(parsed['stateBackend']);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Failed to read state backend config from ${path.join(squadDir, 'config.json')}: ${msg}`);
  }
  const explicitBackend = cliOverride !== undefined || configBackend !== undefined;
  const chosen = normalizeBackendType(cliOverride ?? configBackend ?? 'local');
  try {
    return createBackend(chosen, squadDir, repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Always fall back to local with a warning — a broken backend should not
    // prevent Squad from starting. Operators can fix config without losing work.
    console.warn(`Warning: State backend '${chosen}' failed${explicitBackend ? ' (explicit)' : ''}: ${msg}. Falling back to 'local'.`);
    return new WorktreeBackend(squadDir);
  }
}

/**
 * Read-only health check for a state backend.
 * Verifies the backend is accessible without mutating state.
 *
 * For {@link TwoLayerBackend}, both layers are probed independently — the
 * notes layer can fail (corrupt notes ref, missing commits) even when the
 * orphan layer is healthy, and we surface that explicitly.
 */
export function verifyStateBackend(backend: StateBackend): { ok: boolean; error?: string } {
  try {
    backend.list('');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Backend '${backend.name}' verification failed: ${msg}` };
  }

  if (backend instanceof TwoLayerBackend) {
    try {
      backend.notes.list('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Backend '${backend.name}' notes layer unhealthy: ${msg}` };
    }
  }

  return { ok: true };
}

function isValidBackendType(value: string): value is StateBackendType {
  return ['local', 'worktree', 'external', 'git-notes', 'orphan', 'two-layer'].includes(value);
}
// Note: 'worktree' and 'git-notes' are accepted for backward compatibility but normalized away

// One-shot flag: warn once per process so repeated resolveStateBackend() calls
// (e.g. multiple agent startups in the same process) don't spam the console.
let _warnedGitNotesMigration = false;

/** Normalize legacy aliases to canonical backend type names. */
function normalizeBackendType(type: string): StateBackendType {
  if (type === 'worktree') return 'local';
  if (type === 'git-notes') {
    if (!_warnedGitNotesMigration) {
      _warnedGitNotesMigration = true;
      console.warn(
        "[squad] State backend 'git-notes' is deprecated and has been removed. " +
        "Your config is being silently migrated to 'two-layer', which creates a " +
        "'squad-state' orphan branch in your repository. " +
        "To suppress this warning, update .squad/config.json: " +
        "set \"stateBackend\": \"two-layer\". " +
        "See https://github.com/bradygaster/squad/blob/dev/docs/state-backends.md for upgrade instructions."
      );
    }
    return 'two-layer';
  }
  return type as StateBackendType;
}

function createBackend(type: StateBackendType, squadDir: string, repoRoot: string): StateBackend {
  switch (type) {
    case 'local':     return new WorktreeBackend(squadDir);
    case 'orphan':
      requireGitRepository(repoRoot);
      return new OrphanBranchBackend(repoRoot);
    case 'two-layer':
      requireGitRepository(repoRoot);
      return new TwoLayerBackend(repoRoot);
    case 'external': {
      console.warn(`⚠️  State backend 'external' is a stub (PR #797). Using 'local' backend.`);
      return new WorktreeBackend(squadDir);
    }
    default: throw new Error(`Unknown state backend type: ${type}`);
  }
}

function requireGitRepository(repoRoot: string): void {
  gitExecOrThrow(['rev-parse', '--git-dir'], repoRoot);
}

/** @internal Reset the one-shot git-notes migration warn flag. Only for use in tests. */
export function _resetGitNotesMigrationWarnForTesting(): void {
  _warnedGitNotesMigration = false;
}