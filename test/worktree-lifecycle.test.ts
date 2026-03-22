/**
 * Integration tests for worktree lifecycle management.
 *
 * Tests worktree detection, merge status checking, and cleanup operations.
 * Uses real git repos in temp directories for full integration testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  listWorktrees,
  findMergedWorktrees,
  cleanupWorktree,
  cleanupMergedWorktrees,
  type WorktreeInfo,
} from '../packages/squad-sdk/src/platform/worktree-lifecycle.js';

/**
 * Initialize a minimal git repo for testing.
 */
function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  
  // Create initial commit on dev branch
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  execSync('git commit -m "Initial commit"', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  execSync('git branch -M dev', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
}

/**
 * Create a worktree at the specified path.
 */
function createWorktree(repoRoot: string, worktreePath: string, branchName: string): void {
  execSync(`git worktree add "${worktreePath}" -b ${branchName}`, {
    cwd: repoRoot,
    stdio: 'ignore',
    timeout: 10_000,
  });
}

/**
 * Make a commit in the specified directory.
 */
function makeCommit(dir: string, filename: string, content: string, message: string): void {
  fs.writeFileSync(path.join(dir, filename), content);
  execSync('git add .', { cwd: dir, stdio: 'ignore', timeout: 10_000 });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'ignore', timeout: 10_000 });
}

/**
 * Merge a branch into dev.
 */
function mergeBranch(repoRoot: string, branchName: string): void {
  // First, ensure we're on dev branch
  execSync('git checkout dev', {
    cwd: repoRoot,
    stdio: 'ignore',
    timeout: 10_000,
  });
  
  // Then merge
  execSync(`git merge --no-ff ${branchName} -m "Merge ${branchName}"`, {
    cwd: repoRoot,
    stdio: 'ignore',
    timeout: 10_000,
  });
}

describe('worktree lifecycle', () => {
  let testRoot: string;
  let repoRoot: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-worktree-test-'));
    repoRoot = path.join(testRoot, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
    initGitRepo(repoRoot);
  });

  afterEach(() => {
    // Clean up temp directory
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('listWorktrees', () => {
    it('should list main worktree for repo with no extra worktrees', () => {
      const worktrees = listWorktrees(repoRoot, 'dev');
      
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].isMain).toBe(true);
      expect(worktrees[0].branch).toBe('dev');
      expect(path.normalize(worktrees[0].path)).toBe(path.normalize(repoRoot));
    });

    it('should detect multiple worktrees', () => {
      const worktree1 = path.join(testRoot, 'worktree-1');
      const worktree2 = path.join(testRoot, 'worktree-2');
      
      createWorktree(repoRoot, worktree1, 'feature-1');
      createWorktree(repoRoot, worktree2, 'feature-2');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      
      expect(worktrees).toHaveLength(3); // main + 2 worktrees
      
      const wt1 = worktrees.find(w => w.branch === 'feature-1');
      const wt2 = worktrees.find(w => w.branch === 'feature-2');
      
      expect(wt1).toBeDefined();
      expect(wt2).toBeDefined();
      expect(wt1?.isMain).toBe(false);
      expect(wt2?.isMain).toBe(false);
    });

    it('should detect merged branches', () => {
      const worktreePath = path.join(testRoot, 'worktree-merged');
      createWorktree(repoRoot, worktreePath, 'feature-merged');
      
      // Make a commit in the worktree
      makeCommit(worktreePath, 'feature.txt', 'feature content', 'Add feature');
      
      // Switch back to dev and merge
      mergeBranch(repoRoot, 'feature-merged');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const merged = worktrees.find(w => w.branch === 'feature-merged');
      
      expect(merged).toBeDefined();
      expect(merged?.isMerged).toBe(true);
    });

    it('should detect dirty worktrees', () => {
      const worktreePath = path.join(testRoot, 'worktree-dirty');
      createWorktree(repoRoot, worktreePath, 'feature-dirty');
      
      // Add uncommitted changes
      fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const dirty = worktrees.find(w => w.branch === 'feature-dirty');
      
      expect(dirty).toBeDefined();
      expect(dirty?.isDirty).toBe(true);
    });

    it('should detect clean worktrees', () => {
      const worktreePath = path.join(testRoot, 'worktree-clean');
      createWorktree(repoRoot, worktreePath, 'feature-clean');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const clean = worktrees.find(w => w.branch === 'feature-clean');
      
      expect(clean).toBeDefined();
      expect(clean?.isDirty).toBe(false);
    });
  });

  describe('findMergedWorktrees', () => {
    it('should return only merged worktrees', () => {
      const mergedPath = path.join(testRoot, 'worktree-merged');
      const unmergedPath = path.join(testRoot, 'worktree-unmerged');
      
      createWorktree(repoRoot, mergedPath, 'feature-merged');
      createWorktree(repoRoot, unmergedPath, 'feature-unmerged');
      
      // Make commits in both
      makeCommit(mergedPath, 'merged.txt', 'merged', 'Merged feature');
      makeCommit(unmergedPath, 'unmerged.txt', 'unmerged', 'Unmerged feature');
      
      // Merge only one branch
      mergeBranch(repoRoot, 'feature-merged');
      
      const merged = findMergedWorktrees(repoRoot, 'dev');
      
      expect(merged).toHaveLength(1);
      expect(merged[0].branch).toBe('feature-merged');
    });

    it('should exclude dirty worktrees', () => {
      const worktreePath = path.join(testRoot, 'worktree-merged-dirty');
      createWorktree(repoRoot, worktreePath, 'feature-merged-dirty');
      
      // Make and merge a commit
      makeCommit(worktreePath, 'feature.txt', 'feature', 'Add feature');
      mergeBranch(repoRoot, 'feature-merged-dirty');
      
      // Add uncommitted changes
      fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted');
      
      const merged = findMergedWorktrees(repoRoot, 'dev');
      
      // Should be excluded because it's dirty
      expect(merged).toHaveLength(0);
    });

    it('should exclude main worktree', () => {
      // The main worktree is never considered for cleanup
      const merged = findMergedWorktrees(repoRoot, 'dev');
      
      expect(merged.every(w => !w.isMain)).toBe(true);
    });
  });

  describe('cleanupWorktree', () => {
    it('should remove worktree and delete branch', () => {
      const worktreePath = path.join(testRoot, 'worktree-cleanup');
      createWorktree(repoRoot, worktreePath, 'feature-cleanup');
      
      // Merge the branch
      makeCommit(worktreePath, 'feature.txt', 'feature', 'Add feature');
      mergeBranch(repoRoot, 'feature-cleanup');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const toClean = worktrees.find(w => w.branch === 'feature-cleanup');
      
      expect(toClean).toBeDefined();
      
      const result = cleanupWorktree(repoRoot, toClean!);
      
      expect(result.success).toBe(true);
      expect(result.actions.some(a => a.includes('Removed worktree'))).toBe(true);
      expect(result.actions.some(a => a.includes('Deleted branch'))).toBe(true);
      expect(fs.existsSync(worktreePath)).toBe(false);
    });

    it('should skip dirty worktrees unless forced', () => {
      const worktreePath = path.join(testRoot, 'worktree-dirty');
      createWorktree(repoRoot, worktreePath, 'feature-dirty');
      
      // Make it dirty
      fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const dirty = worktrees.find(w => w.branch === 'feature-dirty');
      
      expect(dirty).toBeDefined();
      
      // Should skip without force
      const result = cleanupWorktree(repoRoot, dirty!);
      
      expect(result.success).toBe(false);
      expect(result.actions.some(a => a.includes('Skipped dirty'))).toBe(true);
      expect(fs.existsSync(worktreePath)).toBe(true);
    });

    it('should clean dirty worktrees when forced', () => {
      const worktreePath = path.join(testRoot, 'worktree-dirty-force');
      createWorktree(repoRoot, worktreePath, 'feature-dirty-force');
      
      // Make it dirty
      fs.writeFileSync(path.join(worktreePath, 'dirty.txt'), 'uncommitted');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const dirty = worktrees.find(w => w.branch === 'feature-dirty-force');
      
      expect(dirty).toBeDefined();
      
      // Should succeed with force
      const result = cleanupWorktree(repoRoot, dirty!, { force: true });
      
      expect(result.success).toBe(true);
      expect(fs.existsSync(worktreePath)).toBe(false);
    });

    it('should support dry-run mode', () => {
      const worktreePath = path.join(testRoot, 'worktree-dryrun');
      createWorktree(repoRoot, worktreePath, 'feature-dryrun');
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const toTest = worktrees.find(w => w.branch === 'feature-dryrun');
      
      expect(toTest).toBeDefined();
      
      const result = cleanupWorktree(repoRoot, toTest!, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.actions.some(a => a.includes('[dry-run]'))).toBe(true);
      // Worktree should still exist
      expect(fs.existsSync(worktreePath)).toBe(true);
    });

    it('should handle missing worktree path gracefully', () => {
      const worktreePath = path.join(testRoot, 'worktree-missing');
      createWorktree(repoRoot, worktreePath, 'feature-missing');
      
      // Manually delete the worktree directory
      fs.rmSync(worktreePath, { recursive: true, force: true });
      
      const worktrees = listWorktrees(repoRoot, 'dev');
      const missing = worktrees.find(w => w.branch === 'feature-missing');
      
      expect(missing).toBeDefined();
      
      const result = cleanupWorktree(repoRoot, missing!);
      
      // Should still succeed (prune will clean up)
      expect(result.success).toBe(true);
      expect(result.actions.some(a => a.includes('not found'))).toBe(true);
    });

    it('should never clean up main worktree', () => {
      const worktrees = listWorktrees(repoRoot, 'dev');
      const main = worktrees.find(w => w.isMain);
      
      expect(main).toBeDefined();
      
      const result = cleanupWorktree(repoRoot, main!);
      
      expect(result.success).toBe(false);
      expect(result.actions.some(a => a.includes('Skipped main worktree'))).toBe(true);
    });
  });

  describe('cleanupMergedWorktrees', () => {
    it('should clean all merged worktrees', () => {
      const wt1Path = path.join(testRoot, 'worktree-1');
      const wt2Path = path.join(testRoot, 'worktree-2');
      
      createWorktree(repoRoot, wt1Path, 'feature-1');
      createWorktree(repoRoot, wt2Path, 'feature-2');
      
      // Merge both branches
      makeCommit(wt1Path, 'f1.txt', 'f1', 'Feature 1');
      mergeBranch(repoRoot, 'feature-1');
      
      makeCommit(wt2Path, 'f2.txt', 'f2', 'Feature 2');
      mergeBranch(repoRoot, 'feature-2');
      
      const result = cleanupMergedWorktrees(repoRoot, 'dev');
      
      expect(result.cleaned).toBe(2);
      expect(result.skipped).toBe(0);
      expect(fs.existsSync(wt1Path)).toBe(false);
      expect(fs.existsSync(wt2Path)).toBe(false);
    });

    it('should report cleaned and skipped counts', () => {
      const cleanPath = path.join(testRoot, 'worktree-clean');
      const dirtyPath = path.join(testRoot, 'worktree-dirty');
      
      createWorktree(repoRoot, cleanPath, 'feature-clean');
      createWorktree(repoRoot, dirtyPath, 'feature-dirty');
      
      // Merge both
      makeCommit(cleanPath, 'clean.txt', 'clean', 'Clean feature');
      mergeBranch(repoRoot, 'feature-clean');
      
      makeCommit(dirtyPath, 'dirty.txt', 'dirty', 'Dirty feature');
      mergeBranch(repoRoot, 'feature-dirty');
      
      // Make the second one dirty
      fs.writeFileSync(path.join(dirtyPath, 'uncommitted.txt'), 'uncommitted');
      
      const result = cleanupMergedWorktrees(repoRoot, 'dev');
      
      // Dirty worktree is excluded by findMergedWorktrees, so only 1 is cleaned
      expect(result.cleaned).toBe(1);
      expect(result.skipped).toBe(0); // Dirty one never enters cleanup (filtered out)
      expect(fs.existsSync(cleanPath)).toBe(false);
      expect(fs.existsSync(dirtyPath)).toBe(true); // Still exists
    });

    it('should continue on individual failure', () => {
      const wt1Path = path.join(testRoot, 'worktree-ok');
      const wt2Path = path.join(testRoot, 'worktree-fail');
      
      createWorktree(repoRoot, wt1Path, 'feature-ok');
      createWorktree(repoRoot, wt2Path, 'feature-fail');
      
      // Merge both
      makeCommit(wt1Path, 'ok.txt', 'ok', 'OK feature');
      mergeBranch(repoRoot, 'feature-ok');
      
      makeCommit(wt2Path, 'fail.txt', 'fail', 'Fail feature');
      mergeBranch(repoRoot, 'feature-fail');
      
      // Make the second one dirty so it gets skipped
      fs.writeFileSync(path.join(wt2Path, 'dirty.txt'), 'dirty');
      
      const result = cleanupMergedWorktrees(repoRoot, 'dev');
      
      // Should continue despite one failure
      expect(result.cleaned).toBeGreaterThanOrEqual(1);
      expect(result.actions.length).toBeGreaterThan(0);
    });

    it('should report when no merged worktrees found', () => {
      const result = cleanupMergedWorktrees(repoRoot, 'dev');
      
      expect(result.cleaned).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.actions.some(a => a.includes('No merged worktrees'))).toBe(true);
    });

    it('should support dry-run mode for batch cleanup', () => {
      const wt1Path = path.join(testRoot, 'worktree-dryrun-1');
      const wt2Path = path.join(testRoot, 'worktree-dryrun-2');
      
      createWorktree(repoRoot, wt1Path, 'feature-dryrun-1');
      createWorktree(repoRoot, wt2Path, 'feature-dryrun-2');
      
      // Merge both
      makeCommit(wt1Path, 'f1.txt', 'f1', 'Feature 1');
      mergeBranch(repoRoot, 'feature-dryrun-1');
      
      makeCommit(wt2Path, 'f2.txt', 'f2', 'Feature 2');
      mergeBranch(repoRoot, 'feature-dryrun-2');
      
      const result = cleanupMergedWorktrees(repoRoot, 'dev', { dryRun: true });
      
      expect(result.cleaned).toBe(2);
      expect(result.actions.some(a => a.includes('[dry-run]'))).toBe(true);
      // Worktrees should still exist
      expect(fs.existsSync(wt1Path)).toBe(true);
      expect(fs.existsSync(wt2Path)).toBe(true);
    });
  });
});
