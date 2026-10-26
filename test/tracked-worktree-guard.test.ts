import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertTrackedWorktreeUnchanged,
  createTrackedWorktreeGuard,
  snapshotTrackedWorktree,
} from './setup/tracked-worktree-guard.js';

let root: string;

describe('tracked working-tree guard', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'squad-worktree-guard-'));
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Squad Test'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    writeFileSync(join(root, 'tracked.txt'), 'before\n');
    execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: root });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('allows an unchanged tracked tree', () => {
    const before = snapshotTrackedWorktree(root);
    expect(() => assertTrackedWorktreeUnchanged(root, before)).not.toThrow();
  });

  it('names a tracked file changed during the test run', () => {
    const before = snapshotTrackedWorktree(root);
    writeFileSync(join(root, 'tracked.txt'), 'after\n');
    expect(() => assertTrackedWorktreeUnchanged(root, before))
      .toThrow(/tracked\.txt/);
  });

  it('ignores line-ending-only changes', () => {
    const before = snapshotTrackedWorktree(root);
    writeFileSync(join(root, 'tracked.txt'), 'before\r\n');
    expect(() => assertTrackedWorktreeUnchanged(root, before)).not.toThrow();
  });

  it('skips temporary working directories outside a git checkout', () => {
    const directory = mkdtempSync(join(tmpdir(), 'squad-no-git-'));
    try {
      expect(createTrackedWorktreeGuard(directory)).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
