/**
 * `.squad/agents/Rai/` → `.squad/agents/rai/` migration on a case-insensitive filesystem,
 * recorded in git (#2299). The old single `renameSync` left git tracking `agents/Rai/` forever
 * on Windows/macOS because a case-only rename is invisible to the index.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { migrateLegacyRaiAgent } from '@bradygaster/squad-cli/core/upgrade';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

describe('migrateLegacyRaiAgent: two-step rename recorded with git mv (#2299)', () => {
  let repo: string;

  beforeEach(() => {
    repo = join(tmpdir(), `.test-rai-git-${randomBytes(4).toString('hex')}`);
    mkdirSync(join(repo, '.squad', 'agents', 'Rai'), { recursive: true });
    writeFileSync(join(repo, '.squad', 'agents', 'Rai', 'charter.md'), '# Rai — RAI Reviewer\n');
    writeFileSync(join(repo, '.squad', 'agents', 'Rai', 'history.md'), '# Rai — History\n\nkept\n');
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'squad-test@example.invalid');
    git(repo, 'config', 'user.name', 'squad test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repo, { recursive: true, force: true });
  });

  it('a tracked Rai/ directory ends up as rai/ in BOTH the working tree and the git index', () => {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'legacy Rai');
    expect(git(repo, 'ls-files')).toContain('.squad/agents/Rai/charter.md');

    const result = migrateLegacyRaiAgent(repo);

    expect(result.migrated).toEqual(['.squad/agents/rai']);
    expect(result.recordedInGit).toBe(true);
    const onDisk = readdirSync(join(repo, '.squad', 'agents'));
    expect(onDisk).toEqual(['rai']);
    expect(readFileSync(join(repo, '.squad', 'agents', 'rai', 'history.md'), 'utf8')).toContain('kept');

    const indexed = git(repo, 'ls-files').split(/\r?\n/).sort();
    expect(indexed).toEqual(['.squad/agents/rai/charter.md', '.squad/agents/rai/history.md']);
    expect(indexed.some(p => p.includes('/Rai/'))).toBe(false);
    expect(existsSync(join(repo, '.squad', 'agents', '.rai-tmp'))).toBe(false);
    // The rename is staged, so a commit records it (status shows renames, not delete+untracked).
    const status = git(repo, 'status', '--porcelain');
    expect(status).toMatch(/^R\s+\.squad\/agents\/Rai\/charter\.md -> \.squad\/agents\/rai\/charter\.md/m);

    // Idempotent: a second run does nothing.
    const again = migrateLegacyRaiAgent(repo);
    expect(again).toEqual({ migrated: [], tombstoned: [], recordedInGit: false });
    expect(readdirSync(join(repo, '.squad', 'agents'))).toEqual(['rai']);
  });

  it('an untracked Rai/ directory is renamed on disk (filesystem fallback) with no git record', () => {
    const result = migrateLegacyRaiAgent(repo);
    expect(result.migrated).toEqual(['.squad/agents/rai']);
    expect(result.recordedInGit).toBe(false);
    expect(readdirSync(join(repo, '.squad', 'agents'))).toEqual(['rai']);
    expect(readFileSync(join(repo, '.squad', 'agents', 'rai', 'charter.md'), 'utf8')).toContain('RAI Reviewer');
  });

  it('finishes an interrupted two-step rename left at .rai-tmp/', () => {
    rmSync(join(repo, '.squad', 'agents', 'Rai'), { recursive: true });
    mkdirSync(join(repo, '.squad', 'agents', '.rai-tmp'));
    writeFileSync(join(repo, '.squad', 'agents', '.rai-tmp', 'charter.md'), '# Rai\n');
    const result = migrateLegacyRaiAgent(repo);
    expect(result.migrated).toEqual(['.squad/agents/rai']);
    expect(readdirSync(join(repo, '.squad', 'agents'))).toEqual(['rai']);
  });

  it('outside a git repository the rename still succeeds', () => {
    rmSync(join(repo, '.git'), { recursive: true, force: true });
    const result = migrateLegacyRaiAgent(repo);
    expect(result.migrated).toEqual(['.squad/agents/rai']);
    expect(result.recordedInGit).toBe(false);
    expect(readdirSync(join(repo, '.squad', 'agents'))).toEqual(['rai']);
  });
});
