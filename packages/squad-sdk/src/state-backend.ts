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
function gitExecWithRetry(args: string[], cwd: string): string {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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

export type StateBackendType = 'worktree' | 'external' | 'git-notes' | 'orphan';

export interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
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
function gitExecMaybeMissing(args: string, cwd: string): string | null {
  try {
    return gitExecWithRetry(args.split(' '), cwd);
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
  readonly name = 'worktree';
  private readonly root: string;
  constructor(squadDir: string) {
    if (squadDir.includes('..')) throw new Error('Path traversal not allowed');
    this.root = squadDir;
  }
  read(relativePath: string): string | undefined {
    return storage.readSync(path.join(this.root, relativePath)) ?? undefined;
  }
  write(relativePath: string, content: string): void {
    storage.writeSync(path.join(this.root, relativePath), content);
  }
  exists(relativePath: string): boolean {
    return storage.existsSync(path.join(this.root, relativePath));
  }
  list(relativeDir: string): string[] {
    const full = path.join(this.root, relativeDir);
    if (!storage.existsSync(full) || !storage.isDirectorySync(full)) return [];
    return storage.listSync(full);
  }
}

function normalizeKey(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

export class GitNotesBackend implements StateBackend {
  readonly name = 'git-notes';
  private readonly cwd: string;
  private readonly ref = 'squad';
  private readonly breaker = new CircuitBreaker();
  constructor(repoRoot: string) { this.cwd = repoRoot; }

  private loadBlob(): Record<string, string> {
    const raw = gitExecMaybeMissing(`notes --ref=${this.ref} show HEAD`, this.cwd);
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
    const json = JSON.stringify(blob, null, 2);
    try {
      gitExecWithInputAndRetry(
        ['notes', `--ref=${this.ref}`, 'add', '-f', '--file', '-', 'HEAD'],
        this.cwd,
        json,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`git-notes backend: failed to write note on HEAD — ${msg}`);
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
      const result = gitExecMaybeMissing(`show ${this.branch}:${normalizeKey(relativePath)}`, this.cwd);
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

export interface StateBackendConfig { stateBackend?: StateBackendType; }

export function resolveStateBackend(squadDir: string, repoRoot: string, cliOverride?: StateBackendType): StateBackend {
  let configBackend: StateBackendType | undefined;
  try {
    const configPath = path.join(squadDir, 'config.json');
    const raw = storage.readSync(configPath);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed['stateBackend'] === 'string' && isValidBackendType(parsed['stateBackend'])) {
        configBackend = parsed['stateBackend'] as StateBackendType;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Failed to read state backend config from ${path.join(squadDir, 'config.json')}: ${msg}`);
  }

  const chosen = cliOverride ?? configBackend ?? 'worktree';
  const isExplicit = cliOverride !== undefined || configBackend !== undefined;

  try {
    return createBackend(chosen, squadDir, repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isExplicit && chosen !== 'worktree') {
      // Explicit backend selection failed — don't silently degrade, surface the error
      throw new Error(
        `State backend '${chosen}' failed to initialize: ${msg}. ` +
        `Fix the backend configuration or remove the --state-backend override.`,
      );
    }
    console.warn(`⚠️  State backend '${chosen}' failed: ${msg}. Falling back to 'worktree'.`);
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
  return ['worktree', 'external', 'git-notes', 'orphan'].includes(value);
}

function createBackend(type: StateBackendType, squadDir: string, repoRoot: string): StateBackend {
  switch (type) {
    case 'worktree': return new WorktreeBackend(squadDir);
    case 'git-notes': return new GitNotesBackend(repoRoot);
    case 'orphan': return new OrphanBranchBackend(repoRoot);
    case 'external': {
      console.warn(`⚠️  State backend 'external' is a stub (PR #797). Using 'worktree' backend.`);
      return new WorktreeBackend(squadDir);
    }
    default: throw new Error(`Unknown state backend type: ${type}`);
  }
}