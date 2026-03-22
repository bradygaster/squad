/**
 * Worktree lifecycle management for Squad — detect merged branches and clean up.
 *
 * @module platform/worktree-lifecycle
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  /** Whether the worktree's branch has been merged into the base branch */
  isMerged: boolean;
  /** Whether the worktree has uncommitted changes */
  isDirty: boolean;
  /** Whether the worktree is the main worktree (repo root) */
  isMain: boolean;
  /** Whether the worktree is locked */
  isLocked: boolean;
}

export interface CleanupResult {
  success: boolean;
  actions: string[];
}

export interface BatchCleanupResult {
  cleaned: number;
  skipped: number;
  actions: string[];
}

/**
 * Parse `git worktree list --porcelain` output into structured data.
 */
function parseWorktreeListOutput(output: string, repoRoot: string, baseBranch: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  
  let current: Partial<WorktreeInfo> = {};
  
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      // Start of a new worktree entry
      if (current.path) {
        worktrees.push(finalizeWorktreeInfo(current, repoRoot, baseBranch));
      }
      current = { path: line.substring('worktree '.length) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      const fullBranch = line.substring('branch '.length);
      // refs/heads/feature-branch → feature-branch
      current.branch = fullBranch.replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      // Bare worktrees are never cleaned up
      current.isMain = true;
    } else if (line.startsWith('locked')) {
      current.isLocked = true;
    } else if (line === 'detached') {
      // Detached HEAD worktrees — treat as non-main
      current.branch = current.branch || 'HEAD';
    }
  }
  
  // Add last entry
  if (current.path) {
    worktrees.push(finalizeWorktreeInfo(current, repoRoot, baseBranch));
  }
  
  return worktrees;
}

/**
 * Finalize a worktree info by checking merge status and dirty state.
 */
function finalizeWorktreeInfo(
  partial: Partial<WorktreeInfo>,
  repoRoot: string,
  baseBranch: string
): WorktreeInfo {
  const worktreePath = partial.path || '';
  const branch = partial.branch || 'HEAD';
  const head = partial.head || '';
  
  // Determine if this is the main worktree
  const isMain = partial.isMain === true || path.normalize(worktreePath) === path.normalize(repoRoot);
  
  // Check if branch is merged into base branch
  let isMerged = false;
  if (!isMain && branch !== 'HEAD') {
    try {
      const mergedBranches = execSync(`git branch --merged ${baseBranch}`, {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      }).trim();
      
      // Check if our branch appears in the merged list
      // Lines look like: "  branch-name" or "* branch-name" (current branch) or "+ branch-name" (worktree branch)
      const branches = mergedBranches.split('\n').map(line => line.replace(/^[*+]?\s+/, '').trim());
      isMerged = branches.includes(branch);
    } catch {
      // If we can't check, assume not merged
      isMerged = false;
    }
  }
  
  // Check if worktree has uncommitted changes
  let isDirty = false;
  if (!isMain && fs.existsSync(worktreePath)) {
    try {
      const status = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      }).trim();
      isDirty = status.length > 0;
    } catch {
      // If we can't check, assume dirty to be safe
      isDirty = true;
    }
  }
  
  return {
    path: worktreePath,
    branch,
    head,
    isMerged,
    isDirty,
    isMain,
    isLocked: partial.isLocked === true,
  };
}

/**
 * List all git worktrees for a repo with merge and dirty status.
 */
export function listWorktrees(repoRoot: string, baseBranch: string = 'dev'): WorktreeInfo[] {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    
    return parseWorktreeListOutput(output, repoRoot, baseBranch);
  } catch (error) {
    // If git worktree list fails, return empty array
    return [];
  }
}

/**
 * Find worktrees whose branches have been merged and are safe to remove.
 * Excludes dirty worktrees, locked worktrees, and the main worktree.
 */
export function findMergedWorktrees(
  repoRoot: string,
  baseBranch: string = 'dev'
): WorktreeInfo[] {
  const all = listWorktrees(repoRoot, baseBranch);
  return all.filter(wt => 
    wt.isMerged && 
    !wt.isDirty && 
    !wt.isMain && 
    !wt.isLocked
  );
}

/**
 * Clean up a single worktree: remove worktree, delete branch, prune stale references.
 * Returns true if cleanup succeeded.
 */
export function cleanupWorktree(
  repoRoot: string,
  worktree: WorktreeInfo,
  options?: { force?: boolean; dryRun?: boolean }
): CleanupResult {
  const actions: string[] = [];
  
  // Safety check: never clean up main worktree
  if (worktree.isMain) {
    actions.push(`⚠️  Skipped main worktree: ${worktree.path}`);
    return { success: false, actions };
  }
  
  // Check if locked
  if (worktree.isLocked && !options?.force) {
    actions.push(`⚠️  Skipped locked worktree: ${worktree.path}`);
    return { success: false, actions };
  }
  
  // Check if dirty
  if (worktree.isDirty && !options?.force) {
    actions.push(`⚠️  Skipped dirty worktree: ${worktree.path} (use --force to clean up anyway)`);
    return { success: false, actions };
  }
  
  if (options?.dryRun) {
    actions.push(`[dry-run] Would remove worktree: ${worktree.path}`);
    if (worktree.branch !== 'HEAD') {
      actions.push(`[dry-run] Would delete branch: ${worktree.branch}`);
    }
    actions.push(`[dry-run] Would prune stale worktree references`);
    return { success: true, actions };
  }
  
  try {
    // 1. Remove worktree
    const removeArgs = options?.force ? '--force' : '';
    const worktreeExists = fs.existsSync(worktree.path);
    
    if (worktreeExists) {
      execSync(`git worktree remove ${removeArgs} "${worktree.path}"`, {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      actions.push(`✓ Removed worktree: ${worktree.path}`);
    } else {
      // Worktree directory was manually deleted — prune will clean up
      actions.push(`⚠️  Worktree directory not found: ${worktree.path} (will prune)`);
    }
    
    // 2. Delete branch (if not detached HEAD)
    if (worktree.branch !== 'HEAD') {
      try {
        const deleteFlag = options?.force ? '-D' : '-d';
        execSync(`git branch ${deleteFlag} "${worktree.branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10_000,
        });
        actions.push(`✓ Deleted branch: ${worktree.branch}`);
      } catch (error) {
        // Branch might already be deleted or not exist
        actions.push(`⚠️  Could not delete branch: ${worktree.branch}`);
      }
    }
    
    // 3. Prune stale worktree references
    execSync('git worktree prune', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    actions.push(`✓ Pruned stale worktree references`);
    
    return { success: true, actions };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    actions.push(`❌ Failed to clean up worktree: ${errorMsg}`);
    return { success: false, actions };
  }
}

/**
 * Clean up ALL merged worktrees. Suitable for Ralph heartbeat.
 * Continues on individual failures to clean up as many as possible.
 */
export function cleanupMergedWorktrees(
  repoRoot: string,
  baseBranch: string = 'dev',
  options?: { force?: boolean; dryRun?: boolean }
): BatchCleanupResult {
  const merged = findMergedWorktrees(repoRoot, baseBranch);
  const actions: string[] = [];
  let cleaned = 0;
  let skipped = 0;
  
  if (merged.length === 0) {
    actions.push('No merged worktrees to clean up.');
    return { cleaned, skipped, actions };
  }
  
  actions.push(`Found ${merged.length} merged worktree(s) to clean up:`);
  
  for (const worktree of merged) {
    const result = cleanupWorktree(repoRoot, worktree, options);
    actions.push(...result.actions);
    
    if (result.success) {
      cleaned++;
    } else {
      skipped++;
    }
  }
  
  actions.push(`\nSummary: ${cleaned} cleaned, ${skipped} skipped`);
  
  return { cleaned, skipped, actions };
}

/**
 * Ralph heartbeat can call cleanupMergedWorktrees() periodically
 * to remove worktrees whose PRs have been merged.
 *
 * Integration point: ralph-commands.ts heartbeat handler
 * Frequency: once per heartbeat cycle (every 5 minutes)
 *
 * Example usage:
 * ```typescript
 * import { cleanupMergedWorktrees } from './worktree-lifecycle.js';
 *
 * // In Ralph's heartbeat handler:
 * const result = cleanupMergedWorktrees(repoRoot, 'dev', { dryRun: false });
 * console.log(result.actions.join('\n'));
 * ```
 */
