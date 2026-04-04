/**
 * Git-native state backends for `.squad/` state storage.
 *
 * @module state-backend
 */

import { execSync, execFileSync } from 'node:child_process';
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
    if (relativePath.includes('..')) throw new Error('Path traversal not allowed');
    if (relativePath.includes('..')) throw new Error('Path traversal not allowed');
    if (relativePath.includes('..')) throw new Error('Path traversal not allowed');
  readonly name = 'worktree';
  private readonly root: string;
  constructor(squadDir: string) { this.root = squadDir; }
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

function gitExec(args: string, cwd: string): string | null {
  try {
    return execFileSync('git', args.split(' '), { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

function gitExecContent(args, cwd) {
  try {
    return execFileSync('git', args.split(' '), { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trimEnd();
  } catch { return null; }
}

function gitExecOrThrow(args: string, cwd: string): string {
  const result = gitExec(args, cwd);
  if (result === null) throw new Error(`git command failed: git ${args}`);
  return result;
}

function normalizeKey(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

export class GitNotesBackend implements StateBackend {
  readonly name = 'git-notes';
  private readonly cwd: string;
  private readonly ref = 'squad';
  constructor(repoRoot: string) { this.cwd = repoRoot; }

  private loadBlob(): Record<string, string> {
    const raw = gitExec(`notes --ref=${this.ref} show HEAD`, this.cwd);
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
      execSync(`git notes --ref=${this.ref} add -f --file - HEAD`, {
        cwd: this.cwd, input: json, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
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
    if (gitExec(`rev-parse --verify refs/heads/${this.branch}`, this.cwd)) return;
    let tree: string;
    try {
      tree = execSync('git mktree', { cwd: this.cwd, input: '', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch { throw new Error('orphan backend: failed to create empty tree'); }
    let commit: string;
    try {
      commit = execSync(`git commit-tree ${tree} -m "Initialize squad-state branch"`, {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error('orphan backend: failed to create initial commit'); }
    gitExecOrThrow(`update-ref refs/heads/${this.branch} ${commit}`, this.cwd);
  }

  read(relativePath: string): string | undefined {
    const result = gitExec(`show ${this.branch}:${normalizeKey(relativePath)}`, this.cwd);
    return result ?? undefined;
  }

  write(relativePath: string, content: string): void {
    this.ensureBranch();
    const key = normalizeKey(relativePath);
    let blobHash: string;
    try {
      blobHash = execSync('git hash-object -w --stdin', {
        cwd: this.cwd, input: content, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error(`orphan backend: failed to hash content for ${key}`); }

    let currentTree: string;
    const treeResult = gitExec(`log --format=%T -1 ${this.branch}`, this.cwd);
    if (!treeResult) {
      try {
        currentTree = execSync('git mktree', { cwd: this.cwd, input: '', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch { throw new Error('orphan backend: failed to create empty tree'); }
    } else { currentTree = treeResult; }

    const newTree = this.updateTree(currentTree, key.split('/'), blobHash);
    const parentCommit = gitExec(`rev-parse ${this.branch}`, this.cwd);
    let newCommit: string;
    try {
      const parentArg = parentCommit ? `-p ${parentCommit}` : '';
      newCommit = execSync(`git commit-tree ${newTree} ${parentArg} -m "Update ${key}"`, {
        cwd: this.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { throw new Error(`orphan backend: failed to commit update for ${key}`); }
    gitExecOrThrow(`update-ref refs/heads/${this.branch} ${newCommit}`, this.cwd);
  }

  exists(relativePath: string): boolean {
    return gitExec(`cat-file -t ${this.branch}:${normalizeKey(relativePath)}`, this.cwd) !== null;
  }

  list(relativeDir: string): string[] {
    const key = normalizeKey(relativeDir);
    const target = key ? `${this.branch}:${key}` : `${this.branch}:`;
    const result = gitExec(`ls-tree --name-only ${target}`, this.cwd);
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
      const emptyTree = execSync('git mktree', { cwd: this.cwd, input: '', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      childTree = this.updateTree(emptyTree, rest, blobHash);
    }
    return this.replaceEntry(baseTree, dir!, '040000', 'tree', childTree);
  }

  private getSubtreeHash(treeHash: string, name: string): string | null {
    const listing = gitExec(`ls-tree ${treeHash}`, this.cwd);
    if (!listing) return null;
    for (const line of listing.split('\n')) {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      if (match && match[4] === name && match[2] === 'tree') return match[3]!;
    }
    return null;
  }

  private replaceEntry(treeHash: string, name: string, mode: string, type: string, hash: string): string {
    const listing = gitExec(`ls-tree ${treeHash}`, this.cwd) ?? '';
    const lines = listing.split('\n').filter(Boolean);
    const filtered = lines.filter((line) => {
      const match = line.match(/^(\d+)\s+(blob|tree)\s+([a-f0-9]+)\t(.+)$/);
      return !(match && match[4] === name);
    });
    filtered.push(`${mode} ${type} ${hash}\t${name}`);
    try {
      return execSync('git mktree', { cwd: this.cwd, input: filtered.join('\n') + '\n', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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