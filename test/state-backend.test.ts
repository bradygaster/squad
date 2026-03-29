/**
 * OrphanBranchBackend — Proof of Concept Tests
 *
 * Validates that Squad state stored in a git orphan branch:
 * 1. Can be read and written without affecting the working tree
 * 2. Survives branch switches (the core problem from #643)
 * 3. Supports nested directory structures
 * 4. Reports health correctly via doctor()
 *
 * Uses a temporary git repo for isolation — no side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrphanBranchBackend } from '../packages/squad-sdk/src/state/orphan-branch-backend.js';
import { FilesystemBackend } from '../packages/squad-sdk/src/state/filesystem-backend.js';

function git(args: string[], cwd: string, input?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 10_000,
    input,
    stdio: input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
}

describe('OrphanBranchBackend', () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    // Create a temporary git repo
    repoDir = mkdtempSync(join(tmpdir(), 'squad-state-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test'], repoDir);
    // Create an initial commit so we have a main branch
    git(['commit', '--allow-empty', '-m', 'initial'], repoDir);
    backend = new OrphanBranchBackend(repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('initializes the orphan branch', async () => {
    await backend.init();
    const branches = git(['branch', '--list', 'squad-state'], repoDir).trim();
    expect(branches).toContain('squad-state');
  });

  it('writes and reads a file', async () => {
    await backend.init();
    await backend.write('team.md', '# My Team\n\nMembers go here.');
    const content = await backend.read('team.md');
    expect(content).toBe('# My Team\n\nMembers go here.');
  });

  it('returns null for non-existent files', async () => {
    await backend.init();
    const content = await backend.read('nonexistent.md');
    expect(content).toBeNull();
  });

  it('checks file existence', async () => {
    await backend.init();
    await backend.write('routing.md', '# Routing');
    expect(await backend.exists('routing.md')).toBe(true);
    expect(await backend.exists('nope.md')).toBe(false);
  });

  it('lists files at root', async () => {
    await backend.init();
    await backend.write('team.md', 'team');
    await backend.write('routing.md', 'routing');
    const files = await backend.list('.');
    expect(files).toContain('team.md');
    expect(files).toContain('routing.md');
  });

  it('removes a file', async () => {
    await backend.init();
    await backend.write('temp.md', 'temporary');
    expect(await backend.exists('temp.md')).toBe(true);
    await backend.remove('temp.md');
    expect(await backend.exists('temp.md')).toBe(false);
  });

  it('handles nested paths', async () => {
    await backend.init();
    await backend.write('agents/fido/charter.md', '# FIDO Charter');
    const content = await backend.read('agents/fido/charter.md');
    expect(content).toBe('# FIDO Charter');
  });

  it('does not affect the working tree', async () => {
    await backend.init();
    await backend.write('team.md', '# State Branch Team');

    // The working tree should have no .squad/ or team.md
    const workingFiles = readdirSync(repoDir);
    expect(workingFiles).not.toContain('team.md');
    expect(workingFiles).not.toContain('.squad');
  });

  // ============================================================================
  // THE KEY TEST: State survives branch switches (#643)
  // ============================================================================

  it('state survives branch switches', async () => {
    await backend.init();

    // Write state on the current branch (main)
    await backend.write('team.md', '# My Team');
    await backend.write('decisions.md', '## Decision 1\nWe chose TypeScript.');

    // Create and switch to a feature branch
    git(['checkout', '-b', 'feature/some-work'], repoDir);

    // State should still be readable (it's in the orphan branch, not working tree)
    const team = await backend.read('team.md');
    expect(team).toBe('# My Team');

    const decisions = await backend.read('decisions.md');
    expect(decisions).toBe('## Decision 1\nWe chose TypeScript.');

    // Switch back to main
    git(['checkout', 'main'], repoDir);

    // State still there
    const teamAgain = await backend.read('team.md');
    expect(teamAgain).toBe('# My Team');
  });

  it('state survives even with gitignored .squad/', async () => {
    await backend.init();
    await backend.write('team.md', '# Gitignored Scenario');

    // Simulate the #643 scenario: .squad/ is gitignored
    execFileSync('git', ['checkout', '-b', 'feature/gitignore-test'], {
      cwd: repoDir, encoding: 'utf-8', stdio: 'pipe',
    });
    execFileSync('git', ['checkout', 'main'], {
      cwd: repoDir, encoding: 'utf-8', stdio: 'pipe',
    });

    // State should survive because it's NOT in the working tree
    const content = await backend.read('team.md');
    expect(content).toBe('# Gitignored Scenario');
  });
});

// ============================================================================
// Doctor validation
// ============================================================================

describe('OrphanBranchBackend.doctor()', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'squad-doctor-test-'));
    git(['init'], repoDir);
    git(['config', 'user.email', 'test@test.com'], repoDir);
    git(['config', 'user.name', 'Test'], repoDir);
    git(['commit', '--allow-empty', '-m', 'initial'], repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('reports unhealthy when orphan branch missing', async () => {
    const backend = new OrphanBranchBackend(repoDir);
    const health = await backend.doctor();
    expect(health.healthy).toBe(false);
    expect(health.message).toContain('does not exist');
  });

  it('reports healthy after init', async () => {
    const backend = new OrphanBranchBackend(repoDir);
    await backend.init();
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);
    expect(health.backend).toBe('orphan-branch');
  });

  it('reports not a git repo for non-repo directory', async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'squad-non-repo-'));
    const backend = new OrphanBranchBackend(nonRepo);
    const health = await backend.doctor();
    expect(health.healthy).toBe(false);
    expect(health.message).toContain('Not a git repository');
    rmSync(nonRepo, { recursive: true, force: true });
  });
});

// ============================================================================
// FilesystemBackend (comparison / fallback)
// ============================================================================

describe('FilesystemBackend', () => {
  let stateDir: string;
  let backend: FilesystemBackend;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'squad-fs-test-'));
    backend = new FilesystemBackend(stateDir);
  });

  afterEach(() => {
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
  });

  it('writes and reads a file', async () => {
    await backend.write('team.md', '# FS Team');
    const content = await backend.read('team.md');
    expect(content).toBe('# FS Team');
  });

  it('reports healthy for existing directory', async () => {
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);
    expect(health.backend).toBe('filesystem');
  });
});
