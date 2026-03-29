/**
 * OrphanBranchBackend — Store Squad state in a git orphan branch.
 *
 * Uses an orphan branch (default: `squad-state`) that has no parent
 * commits and is completely independent of main/dev. State files are
 * read/written via `git show` and `git commit-tree` + `git update-ref`,
 * so they never appear in the working tree and survive all branch
 * switches, rebases, and stashes.
 *
 * This is the core of the git-notes state solution proposed in:
 * https://tamirdresher.com/blog/2026/03/23/scaling-ai-part7b-git-notes
 */

import { execFileSync } from 'node:child_process';
import type { StateBackend, StateBackendHealth } from './state-backend.js';

const DEFAULT_BRANCH = 'squad-state';
const DEFAULT_TIMEOUT = 10_000;

export class OrphanBranchBackend implements StateBackend {
  readonly name = 'orphan-branch';
  private readonly branch: string;
  private readonly repoRoot: string;

  constructor(repoRoot: string, branch = DEFAULT_BRANCH) {
    this.repoRoot = repoRoot;
    this.branch = branch;
  }

  /**
   * Initialize the orphan branch if it doesn't exist.
   * Safe to call multiple times — no-op if branch already exists.
   */
  async init(): Promise<void> {
    if (this.branchExists()) return;

    // Create an empty orphan branch with an initial commit
    // Use git mktree with empty stdin — portable across Windows/macOS/Linux
    let emptyTree: string;
    try {
      emptyTree = this.git(['mktree'], '').trim();
    } catch {
      // Fallback: the well-known empty tree hash
      emptyTree = '4b825dc642cb6eb9a060e54bf899d15363ed7564';
    }
    const commitHash = this.git(
      ['commit-tree', emptyTree, '-m', 'Initialize squad-state branch']
    ).trim();
    this.git(['update-ref', `refs/heads/${this.branch}`, commitHash]);
  }

  async read(path: string): Promise<string | null> {
    try {
      return this.git(['show', `${this.branch}:${path}`]);
    } catch {
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    // Write content to a blob
    const blobHash = this.git(['hash-object', '-w', '--stdin'], content).trim();

    // Get the current tree (or empty tree if branch is fresh)
    let baseTree: string;
    try {
      baseTree = this.git(['rev-parse', `${this.branch}^{tree}`]).trim();
    } catch {
      baseTree = this.git(['mktree'], '').trim();
    }

    // Build the new tree with the updated file
    const treeContent = this.buildTreeWithFile(baseTree, path, blobHash);
    const newTree = this.git(['mktree'], treeContent).trim();

    // Create a commit pointing to the new tree
    const parentHash = this.getHeadCommit();
    const commitArgs = ['commit-tree', newTree, '-m', `Update ${path}`];
    if (parentHash) {
      commitArgs.push('-p', parentHash);
    }
    const newCommit = this.git(commitArgs).trim();

    // Update the branch ref
    this.git(['update-ref', `refs/heads/${this.branch}`, newCommit]);
  }

  async exists(path: string): Promise<boolean> {
    try {
      this.git(['cat-file', '-e', `${this.branch}:${path}`]);
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    try {
      // For root, list top-level entries; for subdirs, list that subtree
      const ref = (dir === '.' || dir === '')
        ? this.branch
        : `${this.branch}:${dir}`;
      const output = this.git(['ls-tree', '--name-only', ref]);
      if (!output.trim()) return [];
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async remove(path: string): Promise<void> {
    // Use ls-tree to get all entries except the one we're removing
    const entries = this.git(['ls-tree', '-r', this.branch])
      .split('\n')
      .filter(Boolean)
      .filter(line => {
        const filePath = line.split('\t')[1];
        return filePath !== path;
      })
      .join('\n');

    const newTree = this.git(['mktree'], entries).trim();
    const parentHash = this.getHeadCommit();
    const commitArgs = ['commit-tree', newTree, '-m', `Remove ${path}`];
    if (parentHash) {
      commitArgs.push('-p', parentHash);
    }
    const newCommit = this.git(commitArgs).trim();
    this.git(['update-ref', `refs/heads/${this.branch}`, newCommit]);
  }

  async doctor(): Promise<StateBackendHealth> {
    // Check 1: Is this a git repo?
    try {
      this.git(['rev-parse', '--git-dir']);
    } catch {
      return {
        healthy: false,
        backend: this.name,
        message: 'Not a git repository',
      };
    }

    // Check 2: Does the orphan branch exist?
    if (!this.branchExists()) {
      return {
        healthy: false,
        backend: this.name,
        message: `Orphan branch '${this.branch}' does not exist. Run squad init to create it.`,
        details: { branch: this.branch },
      };
    }

    // Check 3: Can we read from it?
    try {
      this.git(['ls-tree', '--name-only', this.branch]);
    } catch (err) {
      return {
        healthy: false,
        backend: this.name,
        message: `Cannot read from orphan branch '${this.branch}'`,
        details: { error: String(err) },
      };
    }

    // Check 4: Count state files
    const files = await this.list('.');

    return {
      healthy: true,
      backend: this.name,
      message: `Orphan branch '${this.branch}' is healthy (${files.length} top-level entries)`,
      details: {
        branch: this.branch,
        fileCount: String(files.length),
      },
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private branchExists(): boolean {
    try {
      this.git(['rev-parse', '--verify', `refs/heads/${this.branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  private getHeadCommit(): string | null {
    try {
      return this.git(['rev-parse', this.branch]).trim();
    } catch {
      return null;
    }
  }

  /**
   * Build a new tree that includes all existing entries plus the new file.
   * Handles nested paths by creating subtrees as needed.
   */
  private buildTreeWithFile(baseTree: string, filePath: string, blobHash: string): string {
    // Get existing tree entries
    let entries: string[];
    try {
      entries = this.git(['ls-tree', baseTree])
        .split('\n')
        .filter(Boolean);
    } catch {
      entries = [];
    }

    // For simple (non-nested) paths, add/replace the entry
    if (!filePath.includes('/')) {
      const filtered = entries.filter(e => !e.endsWith(`\t${filePath}`));
      filtered.push(`100644 blob ${blobHash}\t${filePath}`);
      return filtered.join('\n');
    }

    // For nested paths, we need to handle subtrees
    const parts = filePath.split('/');
    const dirName = parts[0];
    const restPath = parts.slice(1).join('/');

    // Find or create the subtree for this directory
    let subtreeHash: string;
    const existingEntry = entries.find(e => e.endsWith(`\t${dirName}`) && e.includes(' tree '));
    if (existingEntry) {
      subtreeHash = existingEntry.split(/\s+/)[2];
    } else {
      subtreeHash = this.git(['mktree'], '').trim();
    }

    // Recursively build the subtree
    const subtreeContent = this.buildTreeWithFile(subtreeHash, restPath, blobHash);
    const newSubtreeHash = this.git(['mktree'], subtreeContent).trim();

    // Replace the subtree entry
    const filtered = entries.filter(e => !e.endsWith(`\t${dirName}`));
    filtered.push(`040000 tree ${newSubtreeHash}\t${dirName}`);
    return filtered.join('\n');
  }

  private git(args: string[], input?: string): string {
    try {
      return execFileSync('git', args, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        timeout: DEFAULT_TIMEOUT,
        input,
        stdio: input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const error = err as { stderr?: string; message?: string };
      throw new Error(`git ${args[0]} failed: ${error.stderr || error.message}`);
    }
  }
}
