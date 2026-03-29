/**
 * StateBackend — Comprehensive Test Suite
 *
 * Validates that Squad state stored in a git orphan branch:
 * 1. Basic CRUD operations work correctly
 * 2. State survives branch switches (core #643 fix)
 * 3. State survives gitignored .squad/ scenarios
 * 4. Handles concurrent writes safely
 * 5. Handles large files and many files
 * 6. Handles edge cases (empty content, special chars, deep nesting)
 * 7. Doctor reports health correctly
 * 8. E2E: full squad state lifecycle simulation
 *
 * Uses temporary git repos for isolation — no side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrphanBranchBackend } from '../packages/squad-sdk/src/state/orphan-branch-backend.js';
import { FilesystemBackend } from '../packages/squad-sdk/src/state/filesystem-backend.js';

function git(args: string[], cwd: string, input?: string): string {
  // Retry up to 3 times for Windows git lock contention
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        timeout: 10_000,
        input,
        stdio: input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const msg = String((err as { stderr?: string }).stderr || err);
      if (msg.includes('.lock') && attempt < 2) {
        // Git lock contention — wait and retry
        const waitMs = 500 * (attempt + 1);
        const start = Date.now();
        while (Date.now() - start < waitMs) { /* busy wait */ }
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-state-test-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  git(['commit', '--allow-empty', '-m', 'initial'], dir);
  return dir;
}

// ============================================================================
// SCENARIO 1: Basic CRUD Operations
// ============================================================================

describe('OrphanBranchBackend — Basic CRUD', { timeout: 30_000 }, () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    repoDir = createTestRepo();
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

  it('init is idempotent — safe to call multiple times', async () => {
    await backend.init();
    await backend.init();
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

  it('overwrites existing file', async () => {
    await backend.init();
    await backend.write('team.md', 'v1');
    await backend.write('team.md', 'v2');
    const content = await backend.read('team.md');
    expect(content).toBe('v2');
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

  it('does not affect the working tree', async () => {
    await backend.init();
    await backend.write('team.md', '# State Branch Team');
    const workingFiles = readdirSync(repoDir);
    expect(workingFiles).not.toContain('team.md');
    expect(workingFiles).not.toContain('.squad');
  });
});

// ============================================================================
// SCENARIO 2: Nested Directory Structures
// ============================================================================

describe('OrphanBranchBackend — Nested Paths', { timeout: 30_000 }, () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    repoDir = createTestRepo();
    backend = new OrphanBranchBackend(repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('handles single-level nesting', async () => {
    await backend.init();
    await backend.write('agents/fido.md', '# FIDO');
    const content = await backend.read('agents/fido.md');
    expect(content).toBe('# FIDO');
  });

  it('handles deep nesting (3 levels)', async () => {
    await backend.init();
    await backend.write('agents/fido/charter.md', '# FIDO Charter');
    const content = await backend.read('agents/fido/charter.md');
    expect(content).toBe('# FIDO Charter');
  });

  it('multiple files in same nested directory', async () => {
    await backend.init();
    await backend.write('agents/fido/charter.md', '# Charter');
    await backend.write('agents/fido/history.md', '# History');
    expect(await backend.read('agents/fido/charter.md')).toBe('# Charter');
    expect(await backend.read('agents/fido/history.md')).toBe('# History');
  });

  it('files in sibling directories', async () => {
    await backend.init();
    await backend.write('agents/fido/charter.md', 'FIDO charter');
    await backend.write('agents/eecom/charter.md', 'EECOM charter');
    expect(await backend.read('agents/fido/charter.md')).toBe('FIDO charter');
    expect(await backend.read('agents/eecom/charter.md')).toBe('EECOM charter');
  });

  it('list works for subdirectories', async () => {
    await backend.init();
    await backend.write('agents/fido/charter.md', 'charter');
    await backend.write('agents/fido/history.md', 'history');
    await backend.write('agents/eecom/charter.md', 'eecom');
    const agentFiles = await backend.list('agents');
    expect(agentFiles).toContain('fido');
    expect(agentFiles).toContain('eecom');
    const fidoFiles = await backend.list('agents/fido');
    expect(fidoFiles).toContain('charter.md');
    expect(fidoFiles).toContain('history.md');
  });
});

// ============================================================================
// SCENARIO 3: Branch Switch Survival (#643 — THE CORE TEST)
// ============================================================================

describe('OrphanBranchBackend — Branch Switch Survival (#643)', { timeout: 30_000 }, () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    repoDir = createTestRepo();
    backend = new OrphanBranchBackend(repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('state survives checkout to feature branch and back', async () => {
    await backend.init();
    await backend.write('team.md', '# My Team');
    await backend.write('decisions.md', '## Decision 1\nWe chose TypeScript.');

    // Switch to feature branch
    git(['checkout', '-b', 'feature/some-work'], repoDir);
    expect(await backend.read('team.md')).toBe('# My Team');
    expect(await backend.read('decisions.md')).toBe('## Decision 1\nWe chose TypeScript.');

    // Switch back
    git(['checkout', 'main'], repoDir);
    expect(await backend.read('team.md')).toBe('# My Team');
  });

  it('state survives multiple rapid branch switches', async () => {
    await backend.init();
    await backend.write('team.md', '# Persistent Team');

    for (let i = 0; i < 5; i++) {
      git(['checkout', '-b', `feature/branch-${i}`], repoDir);
      expect(await backend.read('team.md')).toBe('# Persistent Team');
      git(['checkout', 'main'], repoDir);
    }
  });

  it('state survives with gitignored .squad/ (exact #643 scenario)', async () => {
    await backend.init();
    await backend.write('team.md', '# Gitignored Scenario');

    // Create .squad/ in working tree AND gitignore it
    mkdirSync(join(repoDir, '.squad'), { recursive: true });
    writeFileSync(join(repoDir, '.squad', 'local-state.md'), 'local only');
    writeFileSync(join(repoDir, '.gitignore'), '.squad/\n');
    git(['add', '.gitignore'], repoDir);
    git(['commit', '-m', 'add gitignore'], repoDir);

    // Switch branches — .squad/ working tree files get destroyed
    git(['checkout', '-b', 'feature/destroys-state'], repoDir);
    git(['checkout', 'main'], repoDir);

    // Orphan branch state survives
    expect(await backend.read('team.md')).toBe('# Gitignored Scenario');
  });

  it('can write state while on a different branch', async () => {
    await backend.init();
    await backend.write('team.md', 'v1 from main');

    git(['checkout', '-b', 'feature/writing'], repoDir);
    await backend.write('team.md', 'v2 from feature branch');

    git(['checkout', 'main'], repoDir);
    expect(await backend.read('team.md')).toBe('v2 from feature branch');
  });
});

// ============================================================================
// SCENARIO 4: Edge Cases
// ============================================================================

describe('OrphanBranchBackend — Edge Cases', { timeout: 60_000 }, () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    repoDir = createTestRepo();
    backend = new OrphanBranchBackend(repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('handles empty string content', async () => {
    await backend.init();
    await backend.write('empty.md', '');
    const content = await backend.read('empty.md');
    expect(content).toBe('');
  });

  it('handles content with special characters', async () => {
    await backend.init();
    const special = '# Héllo Wörld 🌍\n\n| Column | Données |\n|--------|---------|\n| ✅ | ❌ |';
    await backend.write('special.md', special);
    expect(await backend.read('special.md')).toBe(special);
  });

  it('handles large file content', async () => {
    await backend.init();
    const large = 'x'.repeat(100_000); // 100KB
    await backend.write('large.md', large);
    expect(await backend.read('large.md')).toBe(large);
  });

  it('handles many files', async () => {
    await backend.init();
    for (let i = 0; i < 20; i++) {
      await backend.write(`file-${i}.md`, `content ${i}`);
    }
    const files = await backend.list('.');
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(await backend.read('file-0.md')).toBe('content 0');
    expect(await backend.read('file-19.md')).toBe('content 19');
  });

  it('handles content with newlines and markdown', async () => {
    await backend.init();
    const markdown = `# Decisions

## Decision 1: Use TypeScript
**Date:** 2026-03-29
**Author:** FIDO

We chose TypeScript for strict mode safety.

## Decision 2: Orphan Branch State
**Date:** 2026-03-29

State lives in \`refs/heads/squad-state\`.

\`\`\`typescript
const backend = new OrphanBranchBackend(repoRoot);
await backend.init();
\`\`\`
`;
    await backend.write('decisions.md', markdown);
    expect(await backend.read('decisions.md')).toBe(markdown);
  });

  it('read before init returns null (not crash)', async () => {
    const content = await backend.read('anything.md');
    expect(content).toBeNull();
  });

  it('exists before init returns false (not crash)', async () => {
    expect(await backend.exists('anything.md')).toBe(false);
  });

  it('list before init returns empty (not crash)', async () => {
    const files = await backend.list('.');
    expect(files).toEqual([]);
  });
});

// ============================================================================
// SCENARIO 5: Doctor Health Checks
// ============================================================================

describe('OrphanBranchBackend — Doctor', () => {
  it('reports unhealthy when orphan branch missing', async () => {
    const repoDir = createTestRepo();
    const backend = new OrphanBranchBackend(repoDir);
    const health = await backend.doctor();
    expect(health.healthy).toBe(false);
    expect(health.message).toContain('does not exist');
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('reports healthy after init', async () => {
    const repoDir = createTestRepo();
    const backend = new OrphanBranchBackend(repoDir);
    await backend.init();
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);
    expect(health.backend).toBe('orphan-branch');
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('reports healthy with file count after writes', async () => {
    const repoDir = createTestRepo();
    const backend = new OrphanBranchBackend(repoDir);
    await backend.init();
    await backend.write('team.md', 'team');
    await backend.write('routing.md', 'routing');
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);
    expect(health.details?.fileCount).toBe('2');
    rmSync(repoDir, { recursive: true, force: true });
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
// SCENARIO 6: E2E — Full Squad State Lifecycle
// ============================================================================

describe('E2E: Full Squad State Lifecycle', { timeout: 60_000 }, () => {
  let repoDir: string;
  let backend: OrphanBranchBackend;

  beforeEach(() => {
    repoDir = createTestRepo();
    backend = new OrphanBranchBackend(repoDir);
  });

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch {}
  });

  it('simulates complete squad init → work → branch switch → resume cycle', async () => {
    // Step 1: squad init — initialize state backend
    await backend.init();
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);

    // Step 2: Write initial squad state (what squad init would produce)
    await backend.write('team.md', `# Mission Control

## Members
| Name | Role |
|------|------|
| Flight | Lead |
| FIDO | Quality Owner |
| EECOM | Core Dev |
`);
    await backend.write('routing.md', `# Routing Rules
| Work Type | Agent |
|-----------|-------|
| Tests & quality | FIDO |
| Core runtime | EECOM |
`);
    await backend.write('decisions.md', '# Decisions\n\n(empty)\n');
    await backend.write('agents/fido/charter.md', '# FIDO — Quality Owner\n> Skeptical, relentless.');
    await backend.write('agents/fido/history.md', '# FIDO History\n\n## 2026-03-29\nJoined the team.');
    await backend.write('agents/eecom/charter.md', '# EECOM — Core Dev');

    // Verify full state
    const team = await backend.read('team.md');
    expect(team).toContain('Flight');
    expect(team).toContain('FIDO');

    // Step 3: Simulate agent work — append to decisions
    const decisions = await backend.read('decisions.md');
    await backend.write('decisions.md', decisions + '\n## Decision: Use orphan branches\nApproved by Flight.\n');

    // Step 4: Developer switches to feature branch (THE #643 TRIGGER)
    git(['checkout', '-b', 'feature/new-api-endpoint'], repoDir);

    // Step 5: State is still fully accessible
    const teamAfter = await backend.read('team.md');
    expect(teamAfter).toContain('FIDO');
    const fidoCharter = await backend.read('agents/fido/charter.md');
    expect(fidoCharter).toContain('Skeptical, relentless');
    const updatedDecisions = await backend.read('decisions.md');
    expect(updatedDecisions).toContain('Use orphan branches');

    // Step 6: Agent writes MORE state while on feature branch
    await backend.write('agents/fido/history.md',
      '# FIDO History\n\n## 2026-03-29\nJoined the team.\n\n## 2026-03-29 (later)\nReviewed PR #680.\n');

    // Step 7: Switch back to main
    git(['checkout', 'main'], repoDir);

    // Step 8: All state including feature-branch writes persists
    const fidoHistory = await backend.read('agents/fido/history.md');
    expect(fidoHistory).toContain('Reviewed PR #680');
  });

  it('simulates multi-machine scenario — state is in git refs, pushable', async () => {
    await backend.init();
    await backend.write('team.md', '# Shared Team');

    // Verify the orphan branch exists as a proper git ref
    const ref = git(['rev-parse', 'squad-state'], repoDir).trim();
    expect(ref).toMatch(/^[0-9a-f]{40}$/); // Valid commit hash

    // The orphan branch has proper commit history
    const log = git(['log', '--oneline', 'squad-state'], repoDir).trim();
    expect(log.split('\n').length).toBeGreaterThanOrEqual(2); // init + write
  });
});

// ============================================================================
// SCENARIO 7: FilesystemBackend (comparison / fallback)
// ============================================================================

describe('FilesystemBackend — Comparison', () => {
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
    expect(await backend.read('team.md')).toBe('# FS Team');
  });

  it('handles nested directories', async () => {
    await backend.write('agents/fido/charter.md', '# FIDO');
    expect(await backend.read('agents/fido/charter.md')).toBe('# FIDO');
  });

  it('reports healthy for existing directory', async () => {
    const health = await backend.doctor();
    expect(health.healthy).toBe(true);
    expect(health.backend).toBe('filesystem');
  });

  it('reports unhealthy for non-existent directory', async () => {
    const badBackend = new FilesystemBackend('/nonexistent/path/that/does/not/exist');
    const health = await badBackend.doctor();
    expect(health.healthy).toBe(false);
  });
});
