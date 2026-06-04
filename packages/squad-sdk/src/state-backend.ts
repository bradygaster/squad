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
      const raw = execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
      return execFileSync('git', args, { cwd, input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
 */
function gitExecMaybeMissing(args: string, cwd: string, trimOutput = true): string | null {
  try {
    return gitExecWithRetry(args.split(' '), cwd, trimOutput);
  } catch (err: unknown) {
    if (isExpectedMissing(err)) return null;
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitExecError(`git ${args}`, msg, stderr);
  }
}

/**
 * Execute a git command that MUST succeed. Throws GitExecError on any failure.
 * Retries transient errors before throwing.
 */
function gitExecOrThrow(args: string, cwd: string): string {
  try {
    return gitExecWithRetry(args.split(' '), cwd);
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitExecError(`git ${args}`, msg, stderr);
  }
}

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
      this._rootCommit = gitExecOrThrow('rev-list --max-parents=0 HEAD', this.cwd);
    }
    return this._rootCommit;
  }

  private loadBlob(): Record<string, string> {
    const anchor = this.rootCommit();
    const raw = gitExecMaybeMissing(`notes --ref=${this.ref} show ${anchor}`, this.cwd);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch { return {}; }
  }

  private saveBlob(blob: Record<string, string>): void {
    const anchor = this.rootCommit();
    const json = JSON.stringify(blob, null, 2);
    try {
      gitExecWithInputAndRetry(
        ['notes', `--ref=${this.ref}`, 'add', '-f', '--file', '-', anchor],
        this.cwd,
        json,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`git-notes backend: failed to write note on root commit — ${msg}`);
    }
  }

  read(relativePath: string): string | undefined {
    return this.breaker.execute(() => {
      const blob = this.loadBlob();
      return blob[normalizeKey(relativePath)];
    }, `git-notes:read(${relativePath})`);
  }
  write(relativePath: string, content: string): void {
    this.breaker.execute(() => {
      const blob = this.loadBlob();
      blob[normalizeKey(relativePath)] = content;
      this.saveBlob(blob);
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
    const blob = this.loadBlob();
    const key = normalizeKey(relativePath);
    if (!Object.hasOwn(blob, key)) return false;
    delete blob[key];
    this.saveBlob(blob);
    return true;
  }
  append(relativePath: string, content: string): void {
    const blob = this.loadBlob();
    const key = normalizeKey(relativePath);
    blob[key] = (blob[key] ?? '') + content;
    this.saveBlob(blob);
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
    if (gitExecMaybeMissing(`rev-parse --verify refs/heads/${this.branch}`, this.cwd)) return;
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
    gitExecOrThrow(`update-ref refs/heads/${this.branch} ${commit}`, this.cwd);
  }

  read(relativePath: string): string | undefined {
    return this.breaker.execute(() => {
      const result = gitExecMaybeMissing(`show ${this.branch}:${normalizeKey(relativePath)}`, this.cwd, false);
      return result ?? undefined;
    }, `orphan:read(${relativePath})`);
  }

  write(relativePath: string, content: string): void {
    this.breaker.execute(() => {
      this.ensureBranch();
      const key = normalizeKey(relativePath);
      let blobHash: string;
      try {
        blobHash = gitExecWithInputAndRetry(['hash-object', '-w', '--stdin'], this.cwd, content);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`orphan backend: failed to hash content for ${key} — ${msg}`);
      }

      let currentTree: string;
      const treeResult = gitExecMaybeMissing(`log --format=%T -1 ${this.branch}`, this.cwd);
      if (!treeResult) {
        try {
          currentTree = gitExecWithInputAndRetry(['mktree'], this.cwd, '');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`orphan backend: failed to create empty tree — ${msg}`);
        }
      } else { currentTree = treeResult; }

      const newTree = this.updateTree(currentTree, key.split('/'), blobHash);
      const parentCommit = gitExecMaybeMissing(`rev-parse ${this.branch}`, this.cwd);
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
      gitExecOrThrow(`update-ref refs/heads/${this.branch} ${newCommit}`, this.cwd);
    }, `orphan:write(${relativePath})`);
  }

  exists(relativePath: string): boolean {
    return this.breaker.execute(
      () => gitExecMaybeMissing(`cat-file -t ${this.branch}:${normalizeKey(relativePath)}`, this.cwd) !== null,
      `orphan:exists(${relativePath})`,
    );
  }

  list(relativeDir: string): string[] {
    return this.breaker.execute(() => {
      const key = normalizeKey(relativeDir);
      const target = key ? `${this.branch}:${key}` : `${this.branch}:`;
      const result = gitExecMaybeMissing(`ls-tree --name-only ${target}`, this.cwd);
      if (!result) return [];
      return result.split('\n').filter(Boolean);
    }, `orphan:list(${relativeDir})`);
  }

  delete(relativePath: string): boolean {
    return this.breaker.execute(() => {
      const key = normalizeKey(relativePath);
      if (gitExecMaybeMissing(`cat-file -t ${this.branch}:${key}`, this.cwd) === null) return false;
      this.ensureBranch();
      const treeResult = gitExecMaybeMissing(`log --format=%T -1 ${this.branch}`, this.cwd);
      if (!treeResult) return false;
      const newTree = this.removeFromTree(treeResult, key.split('/'));
      const parentCommit = gitExecMaybeMissing(`rev-parse ${this.branch}`, this.cwd);
      let newCommit: string;
      try {
        const parentArgs = parentCommit ? ['-p', parentCommit] : [];
        newCommit = gitExecWithRetry(
          ['commit-tree', newTree, ...parentArgs, '-m', `Delete ${key}`],
          this.cwd,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`orphan backend: failed to commit delete for ${key} — ${msg}`);
      }
      gitExecOrThrow(`update-ref refs/heads/${this.branch} ${newCommit}`, this.cwd);
      return true;
    }, `orphan:delete(${relativePath})`);
  }

  append(relativePath: string, content: string): void {
    const existing = this.read(relativePath) ?? '';
    this.write(relativePath, existing + content);
  }

  private removeFromTree(baseTree: string, pathSegments: string[]): string {
    if (pathSegments.length === 0) throw new Error('orphan backend: empty path segments');
    if (pathSegments.length === 1) {
      const listing = gitExecMaybeMissing(`ls-tree ${baseTree}`, this.cwd) ?? '';
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
    const childListing = gitExecMaybeMissing(`ls-tree ${childTree}`, this.cwd);
    if (!childListing || childListing.length === 0) {
      const listing = gitExecMaybeMissing(`ls-tree ${baseTree}`, this.cwd) ?? '';
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
    const listing = gitExecMaybeMissing(`ls-tree ${treeHash}`, this.cwd);
    if (!listing) return null;
    for (const line of listing.split('\n')) {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      if (match && match[4] === name && match[2] === 'tree') return match[3]!;
    }
    return null;
  }

  private replaceEntry(treeHash: string, name: string, mode: string, type: string, hash: string): string {
    const listing = gitExecMaybeMissing(`ls-tree ${treeHash}`, this.cwd) ?? '';
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
 * Two-Layer Backend — combines git-notes (commit-scoped annotations) with orphan
 * branch (permanent state). Reads from orphan for bulk state, writes to both:
 * - Git notes for commit-scoped "why" annotations (per-agent namespace)
 * - Orphan branch for permanent state (decisions, histories, logs)
 *
 * Ralph promotes notes with promote_to_permanent after PR merge.
 */
export class TwoLayerBackend implements StateBackend {
  readonly name = 'two-layer';
  private readonly notes: GitNotesBackend;
  private readonly orphan: OrphanBranchBackend;

  constructor(repoRoot: string) {
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
    try { this.notes.write(key, value); } catch { /* notes are best-effort */ }
  }

  list(dir: string): string[] {
    return this.orphan.list(dir);
  }

  exists(key: string): boolean {
    return this.orphan.exists(key);
  }

  delete(key: string): boolean {
    const result = this.orphan.delete(key);
    try { this.notes.delete(key); } catch { /* best-effort */ }
    return result;
  }

  append(key: string, value: string): void {
    this.orphan.append(key, value);
    try { this.notes.append(key, value); } catch { /* best-effort */ }
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
 */
export function verifyStateBackend(backend: StateBackend): { ok: boolean; error?: string } {
  try {
    backend.list('');
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Backend '${backend.name}' verification failed: ${msg}` };
  }
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
  gitExecOrThrow('rev-parse --git-dir', repoRoot);
}

/** @internal Reset the one-shot git-notes migration warn flag. Only for use in tests. */
export function _resetGitNotesMigrationWarnForTesting(): void {
  _warnedGitNotesMigration = false;
}