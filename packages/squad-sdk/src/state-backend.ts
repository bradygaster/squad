/**
 * Git-native state backends for `.squad/` state storage.
 *
 * @module state-backend
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import type { StorageProvider, StorageStats } from './storage/storage-provider.js';

const storage = new FSStorageProvider();

export type StateBackendType = 'local' | 'external' | 'git-notes' | 'orphan' | 'two-layer';

export interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  delete(relativePath: string): boolean;
  append(relativePath: string, content: string): void;
  readonly name: string;
}

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
  private cachedAnchor: string | undefined;
  constructor(repoRoot: string) { this.cwd = repoRoot; }

  /**
   * Return the repo's root commit — the first commit with no parents.
   * This commit exists on every branch, so the note persists across
   * branch switches (unlike HEAD, which moves with the checked-out branch).
   */
  private getAnchorCommit(): string {
    if (this.cachedAnchor) return this.cachedAnchor;
    const root = gitExec(['rev-list', '--max-parents=0', 'HEAD'], this.cwd);
    if (!root) throw new Error('git-notes backend: no root commit found');
    // If multiple roots (e.g. from unrelated-history merges), use the first.
    this.cachedAnchor = root.split('\n')[0]!.trim();
    return this.cachedAnchor;
  }

  private loadBlob(): Record<string, string> {
    const anchor = this.getAnchorCommit();
    const raw = gitExec(['notes', `--ref=${this.ref}`, 'show', anchor], this.cwd);
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
    const anchor = this.getAnchorCommit();
    const json = JSON.stringify(blob, null, 2);
    try {
      gitExecWithInput(['notes', `--ref=${this.ref}`, 'add', '-f', '--file', '-', anchor], json, this.cwd);
    } catch { throw new Error('git-notes backend: failed to write note on ' + anchor); }
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
    const key = normalizeKey(relativePath);
    try {
      return execFileSync('git', ['show', `${this.branch}:${key}`], {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return undefined;
    }
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

  delete(relativePath: string): boolean {
    const key = normalizeKey(relativePath);
    if (!this.exists(relativePath)) return false;
    this.ensureBranch();
    const treeResult = gitExec(['log', '--format=%T', '-1', this.branch], this.cwd);
    if (!treeResult) return false;
    const newTree = this.removeFromTree(treeResult, key.split('/'));
    const parentCommit = gitExec(['rev-parse', this.branch], this.cwd);
    let newCommit: string;
    try {
      const parentArgs = parentCommit ? ['-p', parentCommit] : [];
      newCommit = execFileSync('git', ['commit-tree', newTree, ...parentArgs, '-m', `Delete ${key}`], {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error(`orphan backend: failed to commit delete for ${key}`); }
    gitExecOrThrow(['update-ref', `refs/heads/${this.branch}`, newCommit], this.cwd);
    return true;
  }

  append(relativePath: string, content: string): void {
    const existing = this.read(relativePath) ?? '';
    this.write(relativePath, existing + content);
  }

  private removeFromTree(baseTree: string, pathSegments: string[]): string {
    if (pathSegments.length === 0) throw new Error('orphan backend: empty path segments');
    if (pathSegments.length === 1) {
      // Remove the entry from the tree
      const listing = gitExec(['ls-tree', baseTree], this.cwd) ?? '';
      const lines = listing.split('\n').filter(Boolean);
      const filtered = lines.filter((line) => {
        const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
        return !(match && match[4] === pathSegments[0]);
      });
      try {
        return gitExecWithInput(['mktree'], filtered.length > 0 ? filtered.join('\n') + '\n' : '', this.cwd);
      } catch { throw new Error(`orphan backend: failed to remove entry ${pathSegments[0]}`); }
    }
    const [dir, ...rest] = pathSegments;
    const subTreeHash = this.getSubtreeHash(baseTree, dir!);
    if (!subTreeHash) return baseTree; // subtree doesn't exist, nothing to remove
    const childTree = this.removeFromTree(subTreeHash, rest);
    // If the child tree is now empty, remove the directory entry entirely
    const childListing = gitExec(['ls-tree', childTree], this.cwd);
    if (!childListing || childListing.length === 0) {
      // Remove the empty directory from the parent tree
      const listing = gitExec(['ls-tree', baseTree], this.cwd) ?? '';
      const lines = listing.split('\n').filter(Boolean);
      const filtered = lines.filter((line) => {
        const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
        return !(match && match[4] === dir);
      });
      try {
        return gitExecWithInput(['mktree'], filtered.length > 0 ? filtered.join('\n') + '\n' : '', this.cwd);
      } catch { throw new Error(`orphan backend: failed to prune empty directory ${dir}`); }
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
    const normalized = filePath.replace(/\\/g, '/');
    const squadNorm = this.squadDir.replace(/\\/g, '/');
    if (normalized.startsWith(squadNorm + '/')) {
      return normalized.slice(squadNorm.length + 1);
    }
    if (normalized.startsWith(squadNorm)) {
      return normalized.slice(squadNorm.length).replace(/^\//, '') || '.';
    }
    // Already relative
    return normalized;
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
  } catch { /* fall through */ }
  const chosen = normalizeBackendType(cliOverride ?? configBackend ?? 'local');
  try {
    return createBackend(chosen, squadDir, repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: State backend '${chosen}' failed: ${msg}. Falling back to 'local'.`);
    return new WorktreeBackend(squadDir);
  }
}

function isValidBackendType(value: string): value is StateBackendType {
  return ['local', 'worktree', 'external', 'git-notes', 'orphan', 'two-layer'].includes(value);
}

/** Normalize legacy aliases to canonical backend type names. */
function normalizeBackendType(type: string): StateBackendType {
  if (type === 'worktree') return 'local'; // legacy alias
  return type as StateBackendType;
}

function createBackend(type: StateBackendType, squadDir: string, repoRoot: string): StateBackend {
  switch (type) {
    case 'local':     return new WorktreeBackend(squadDir);
    case 'git-notes': return new GitNotesBackend(repoRoot);
    case 'orphan': return new OrphanBranchBackend(repoRoot);
    case 'two-layer': return new TwoLayerBackend(repoRoot);
    case 'external': return new WorktreeBackend(squadDir); // Stub — PR #797
    default: throw new Error(`Unknown state backend type: ${type}`);
  }
}