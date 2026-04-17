/**
 * Git-native state backends for `.squad/` state storage.
 *
 * @module state-backend
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FSStorageProvider } from './storage/fs-storage-provider.js';

const storage = new FSStorageProvider();

export type StateBackendType = 'worktree' | 'external' | 'git-notes' | 'orphan';

export interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  readonly name: string;
}

export class WorktreeBackend implements StateBackend {
  readonly name = 'worktree';
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
}

function gitExec(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

function gitExecWithInput(args: string[], input: string, cwd: string): string {
  return execFileSync('git', args, { cwd, input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function gitExecOrThrow(args: string[], cwd: string): string {
  const result = gitExec(args, cwd);
  if (result === null) throw new Error(`git command failed: git ${args.join(' ')}`);
  return result;
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
  constructor(repoRoot: string) { this.cwd = repoRoot; }

  private loadBlob(): Record<string, string> {
    const raw = gitExec(['notes', `--ref=${this.ref}`, 'show', 'HEAD'], this.cwd);
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
      gitExecWithInput(['notes', `--ref=${this.ref}`, 'add', '-f', '--file', '-', 'HEAD'], json, this.cwd);
    } catch { throw new Error('git-notes backend: failed to write note on HEAD'); }
  }

  read(relativePath: string): string | undefined {
    const blob = this.loadBlob();
    return blob[normalizeKey(relativePath)];
  }
  write(relativePath: string, content: string): void {
    const blob = this.loadBlob();
    blob[normalizeKey(relativePath)] = content;
    this.saveBlob(blob);
  }
  exists(relativePath: string): boolean {
    return Object.hasOwn(this.loadBlob(), normalizeKey(relativePath));
  }
  list(relativeDir: string): string[] {
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
  }
}

export class OrphanBranchBackend implements StateBackend {
  readonly name = 'orphan';
  private readonly cwd: string;
  private readonly branch: string;
  constructor(repoRoot: string, branch = 'squad-state') {
    this.cwd = repoRoot; this.branch = branch;
  }

  private ensureBranch(): void {
    if (gitExec(['rev-parse', '--verify', `refs/heads/${this.branch}`], this.cwd)) return;
    let tree: string;
    try {
      tree = gitExecWithInput(['mktree'], '', this.cwd);
    } catch { throw new Error('orphan backend: failed to create empty tree'); }
    let commit: string;
    try {
      commit = execFileSync('git', ['commit-tree', tree, '-m', 'Initialize squad-state branch'], {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error('orphan backend: failed to create initial commit'); }
    gitExecOrThrow(['update-ref', `refs/heads/${this.branch}`, commit], this.cwd);
  }

  read(relativePath: string): string | undefined {
    const result = gitExec(['show', `${this.branch}:${normalizeKey(relativePath)}`], this.cwd);
    return result ?? undefined;
  }

  write(relativePath: string, content: string): void {
    this.ensureBranch();
    const key = normalizeKey(relativePath);
    let blobHash: string;
    try {
      blobHash = gitExecWithInput(['hash-object', '-w', '--stdin'], content, this.cwd);
    } catch { throw new Error(`orphan backend: failed to hash content for ${key}`); }

    let currentTree: string;
    const treeResult = gitExec(['log', '--format=%T', '-1', this.branch], this.cwd);
    if (!treeResult) {
      try {
        currentTree = gitExecWithInput(['mktree'], '', this.cwd);
      } catch { throw new Error('orphan backend: failed to create empty tree'); }
    } else { currentTree = treeResult; }

    const newTree = this.updateTree(currentTree, key.split('/'), blobHash);
    const parentCommit = gitExec(['rev-parse', this.branch], this.cwd);
    let newCommit: string;
    try {
      const parentArgs = parentCommit ? ['-p', parentCommit] : [];
      newCommit = execFileSync('git', ['commit-tree', newTree, ...parentArgs, '-m', `Update ${key}`], {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error(`orphan backend: failed to commit update for ${key}`); }
    gitExecOrThrow(['update-ref', `refs/heads/${this.branch}`, newCommit], this.cwd);
  }

  exists(relativePath: string): boolean {
    return gitExec(['cat-file', '-t', `${this.branch}:${normalizeKey(relativePath)}`], this.cwd) !== null;
  }

  list(relativeDir: string): string[] {
    const key = normalizeKey(relativeDir);
    const target = key ? `${this.branch}:${key}` : `${this.branch}:`;
    const result = gitExec(['ls-tree', '--name-only', target], this.cwd);
    if (!result) return [];
    return result.split('\n').filter(Boolean);
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
      const emptyTree = gitExecWithInput(['mktree'], '', this.cwd);
      childTree = this.updateTree(emptyTree, rest, blobHash);
    }
    return this.replaceEntry(baseTree, dir!, '040000', 'tree', childTree);
  }

  private getSubtreeHash(treeHash: string, name: string): string | null {
    const listing = gitExec(['ls-tree', treeHash], this.cwd);
    if (!listing) return null;
    for (const line of listing.split('\n')) {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      if (match && match[4] === name && match[2] === 'tree') return match[3]!;
    }
    return null;
  }

  private replaceEntry(treeHash: string, name: string, mode: string, type: string, hash: string): string {
    const listing = gitExec(['ls-tree', treeHash], this.cwd) ?? '';
    const lines = listing.split('\n').filter(Boolean);
    const filtered = lines.filter((line) => {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      return !(match && match[4] === name);
    });
    filtered.push(`${mode} ${type} ${hash}\t${name}`);
    try {
      return gitExecWithInput(['mktree'], filtered.join('\n') + '\n', this.cwd);
    } catch { throw new Error(`orphan backend: failed to create tree with entry ${name}`); }
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
  } catch { /* fall through */ }
  const chosen = cliOverride ?? configBackend ?? 'worktree';
  try {
    return createBackend(chosen, squadDir, repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: State backend '${chosen}' failed: ${msg}. Falling back to 'worktree'.`);
    return new WorktreeBackend(squadDir);
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
    case 'external': return new WorktreeBackend(squadDir); // Stub — PR #797
    default: throw new Error(`Unknown state backend type: ${type}`);
  }
}