import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { WorktreeBackend, GitNotesBackend, OrphanBranchBackend, TwoLayerBackend, resolveStateBackend, validateStateKey, StateBackendStorageAdapter } from '../packages/squad-sdk/src/state-backend.js';
import type { StateBackendType } from '../packages/squad-sdk/src/state-backend.js';
import { resolveSquadState, clearResolveSquadCache } from '../packages/squad-sdk/src/resolution.js';
import { ToolRegistry } from '../packages/squad-sdk/src/tools/index.js';

const TMP = join(process.cwd(), `.test-state-backend-${randomBytes(4).toString('hex')}`);
function git(args: string, cwd = TMP): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function initRepo(): void {
  mkdirSync(TMP, { recursive: true });
  git('init'); git('config user.email "test@test.com"'); git('config user.name "Test"');
  writeFileSync(join(TMP, 'README.md'), '# test\n'); git('add .'); git('commit -m "init"');
}

describe('WorktreeBackend', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
  it('read/write/exists round-trip', () => {
    const b = new WorktreeBackend(squadDir());
    expect(b.exists('team.md')).toBe(false); expect(b.read('team.md')).toBeUndefined();
    b.write('team.md', '# Team\n'); expect(b.exists('team.md')).toBe(true); expect(b.read('team.md')).toBe('# Team\n');
  });
  it('list returns directory entries', () => {
    const b = new WorktreeBackend(squadDir());
    b.write('agents/data.md', '# Data'); b.write('agents/picard.md', '# Picard');
    expect(b.list('agents')).toContain('data.md'); expect(b.list('agents')).toContain('picard.md');
  });
  it('list returns empty for non-existent directory', () => { expect(new WorktreeBackend(squadDir()).list('nonexistent')).toEqual([]); });
  it('name is local', () => { expect(new WorktreeBackend(squadDir()).name).toBe('local'); });
});

describe('GitNotesBackend', () => {
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
  it('read returns undefined when no note exists', () => { expect(new GitNotesBackend(TMP).read('team.md')).toBeUndefined(); });
  it('write then read round-trip', () => { const b = new GitNotesBackend(TMP); b.write('team.md', '# Team Config'); expect(b.read('team.md')).toBe('# Team Config'); });
  it('exists reflects write state', () => { const b = new GitNotesBackend(TMP); expect(b.exists('d/i/t.md')).toBe(false); b.write('d/i/t.md', 'x'); expect(b.exists('d/i/t.md')).toBe(true); });
  it('list returns entries in a virtual directory', () => {
    const b = new GitNotesBackend(TMP); b.write('agents/data.md', 'D'); b.write('agents/picard.md', 'P'); b.write('agents/sub/n.md', 'N');
    const e = b.list('agents'); expect(e).toContain('data.md'); expect(e).toContain('picard.md'); expect(e).toContain('sub');
  });
  it('multiple writes update the same key', () => { const b = new GitNotesBackend(TMP); b.write('c.json', '1'); expect(b.read('c.json')).toBe('1'); b.write('c.json', '2'); expect(b.read('c.json')).toBe('2'); });
  it('normalizes Windows paths', () => { const b = new GitNotesBackend(TMP); b.write('agents\\data.md', 'D'); expect(b.read('agents/data.md')).toBe('D'); });
  it('name is git-notes', () => { expect(new GitNotesBackend(TMP).name).toBe('git-notes'); });
  it('state persists across branch switches (root-commit anchor)', { timeout: 15_000 }, () => {
    // 1. Write state on main
    const b = new GitNotesBackend(TMP);
    b.write('decisions.md', '# Team Decisions');
    b.write('agents/data.md', 'Data config');
    expect(b.read('decisions.md')).toBe('# Team Decisions');

    // 2. Create and switch to a feature branch
    git('checkout -b feature-xyz');

    // 3. Make a new commit on the feature branch (HEAD now differs from main)
    writeFileSync(join(TMP, 'feature.txt'), 'new feature\n');
    git('add feature.txt');
    git('commit -m "add feature"');

    // 4. Read state — should still be there (anchor is root commit, not HEAD)
    const b2 = new GitNotesBackend(TMP);
    expect(b2.read('decisions.md')).toBe('# Team Decisions');
    expect(b2.read('agents/data.md')).toBe('Data config');
    expect(b2.list('agents')).toContain('data.md');

    // 5. Switch back to previous branch — state still there
    git('checkout -');
    const b3 = new GitNotesBackend(TMP);
    expect(b3.read('decisions.md')).toBe('# Team Decisions');
    expect(b3.read('agents/data.md')).toBe('Data config');
  });
});


describe('OrphanBranchBackend', () => {
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
  it('read returns undefined when branch does not exist', () => { expect(new OrphanBranchBackend(TMP).read('team.md')).toBeUndefined(); });
  it('write creates orphan branch', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP); b.write('team.md', '# Team'); expect(b.read('team.md')).toBe('# Team');
    expect(git('branch')).toContain('squad-state');
    let common = true; try { git('merge-base HEAD squad-state'); } catch { common = false; } expect(common).toBe(false);
  });
  it('exists reflects write state', { timeout: 10_000 }, () => { const b = new OrphanBranchBackend(TMP); expect(b.exists('c.json')).toBe(false); b.write('c.json', '{}'); expect(b.exists('c.json')).toBe(true); });
  it('write to nested path', { timeout: 10_000 }, () => { const b = new OrphanBranchBackend(TMP); b.write('d/i/x.md', 'D'); expect(b.read('d/i/x.md')).toBe('D'); });
  it('list returns entries', { timeout: 15_000 }, () => { const b = new OrphanBranchBackend(TMP); b.write('agents/data.md', 'D'); b.write('agents/picard.md', 'P'); const e = b.list('agents'); expect(e).toContain('data.md'); expect(e).toContain('picard.md'); });
  it('list returns empty for non-existent path', () => { expect(new OrphanBranchBackend(TMP).list('nonexistent')).toEqual([]); });
  it('multiple writes preserve entries', { timeout: 15_000 }, () => { const b = new OrphanBranchBackend(TMP); b.write('a.md', 'first'); b.write('b.md', 'second'); expect(b.read('a.md')).toBe('first'); expect(b.read('b.md')).toBe('second'); });
  it('update existing file', { timeout: 15_000 }, () => { const b = new OrphanBranchBackend(TMP); b.write('t.md', 'v1'); b.write('t.md', 'v2'); expect(b.read('t.md')).toBe('v2'); });
  it('does not disturb working tree', { timeout: 10_000 }, () => {
    const b = new OrphanBranchBackend(TMP); const before = readFileSync(join(TMP, 'README.md'), 'utf-8');
    b.write('s.json', '{}'); expect(readFileSync(join(TMP, 'README.md'), 'utf-8')).toBe(before); expect(git('status --porcelain')).toBe('');
  });
  it('name is orphan', () => { expect(new OrphanBranchBackend(TMP).name).toBe('orphan'); });
});

describe('resolveStateBackend()', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
  it('defaults to local', () => { expect(resolveStateBackend(squadDir(), TMP).name).toBe('local'); });
  it('reads stateBackend from config.json (git-notes migrates to two-layer)', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    expect(resolveStateBackend(squadDir(), TMP).name).toBe('two-layer');
  });
  it('CLI override wins over config', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    expect(resolveStateBackend(squadDir(), TMP, 'orphan').name).toBe('orphan');
  });
  it('falls back on invalid type', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'bad' }));
    expect(resolveStateBackend(squadDir(), TMP).name).toBe('local');
  });
  it('falls back on malformed JSON', () => { writeFileSync(join(squadDir(), 'config.json'), 'bad'); expect(resolveStateBackend(squadDir(), TMP).name).toBe('local'); });
  it('external returns local stub', () => { expect(resolveStateBackend(squadDir(), TMP, 'external').name).toBe('local'); });
  it('legacy worktree alias accepted', () => { expect(resolveStateBackend(squadDir(), TMP, 'worktree' as any).name).toBe('local'); });
  it('all valid types accepted', () => {
    for (const t of ['local', 'external', 'orphan', 'two-layer'] as const) expect(resolveStateBackend(squadDir(), TMP, t)).toBeDefined();
  });
  it('legacy git-notes migrates to two-layer', () => {
    expect(resolveStateBackend(squadDir(), TMP, 'git-notes' as any).name).toBe('two-layer');
  });
  it('fails closed when an explicit git-native backend is unavailable', () => {
    const nonGitRoot = join(tmpdir(), `.squad-state-non-git-${randomBytes(4).toString('hex')}`);
    const nonGitSquad = join(nonGitRoot, '.squad');
    mkdirSync(nonGitSquad, { recursive: true });
    writeFileSync(join(nonGitSquad, 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'two-layer' }));

    try {
      expect(() => resolveStateBackend(nonGitSquad, nonGitRoot)).toThrow(/State backend 'two-layer' failed/);
    } finally {
      rmSync(nonGitRoot, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// Security: Shell Injection Prevention Tests
// ============================================================================

describe('State Backend: validateStateKey', () => {
  it('should accept valid keys', () => {
    expect(() => validateStateKey('team.md')).not.toThrow();
    expect(() => validateStateKey('agents/data.md')).not.toThrow();
    expect(() => validateStateKey('deep/nested/path/file.json')).not.toThrow();
  });

  it('should reject null bytes', () => {
    expect(() => validateStateKey('key\x00injected')).toThrow('null bytes');
  });

  it('should reject newline characters', () => {
    expect(() => validateStateKey('key\ninjected')).toThrow('newline');
    expect(() => validateStateKey('key\rinjected')).toThrow('newline');
  });

  it('should reject tab characters', () => {
    expect(() => validateStateKey('key\tinjected')).toThrow('tab');
  });

  it('should reject empty key', () => {
    expect(() => validateStateKey('')).toThrow('non-empty');
  });

  it('should reject path traversal with .. segments', () => {
    expect(() => validateStateKey('../../../etc/passwd')).toThrow('. or ..');
    expect(() => validateStateKey('agents/../../../etc/passwd')).toThrow('. or ..');
    expect(() => validateStateKey('..')).toThrow('. or ..');
  });

  it('should reject . segments', () => {
    expect(() => validateStateKey('.')).toThrow('. or ..');
    expect(() => validateStateKey('agents/./data.md')).toThrow('. or ..');
  });

  it('should reject empty path segments', () => {
    expect(() => validateStateKey('agents//data.md')).toThrow('empty path segments');
  });
});

describe('State Backend: Key injection blocked at backend level', () => {
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('GitNotesBackend rejects path traversal in write', () => {
    const b = new GitNotesBackend(TMP);
    expect(() => b.write('../../../etc/passwd', 'pwned')).toThrow('. or ..');
  });

  it('GitNotesBackend rejects null bytes in read', () => {
    const b = new GitNotesBackend(TMP);
    expect(() => b.read('key\x00injected')).toThrow('null bytes');
  });

  it('GitNotesBackend rejects tab injection in key', () => {
    const b = new GitNotesBackend(TMP);
    expect(() => b.write('key\tvalue', 'data')).toThrow('tab');
  });

  it('OrphanBranchBackend rejects path traversal in write', { timeout: 10_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    expect(() => b.write('../../../etc/passwd', 'pwned')).toThrow('. or ..');
  });

  it('OrphanBranchBackend rejects null bytes in read', () => {
    const b = new OrphanBranchBackend(TMP);
    expect(() => b.read('key\x00injected')).toThrow('null bytes');
  });

  it('OrphanBranchBackend rejects newline injection in exists', () => {
    const b = new OrphanBranchBackend(TMP);
    expect(() => b.exists('key\ninjected')).toThrow('newline');
  });

  it('WorktreeBackend normalizes and rejects traversal in write', () => {
    const squadDir = join(TMP, '.squad');
    mkdirSync(squadDir, { recursive: true });
    const b = new WorktreeBackend(squadDir);
    // WorktreeBackend uses path.join which handles traversal, but normalizeKey now validates
    expect(() => b.write('../../../etc/passwd', 'pwned')).toThrow('. or ..');
  });
});

// ============================================================================
// delete() and append() tests (Issue #1003)
// ============================================================================

describe('WorktreeBackend delete/append', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('delete removes an existing file and returns true', () => {
    const b = new WorktreeBackend(squadDir());
    b.write('decisions.md', '# Decisions');
    expect(b.delete('decisions.md')).toBe(true);
    expect(b.exists('decisions.md')).toBe(false);
  });

  it('delete returns false for non-existent file', () => {
    const b = new WorktreeBackend(squadDir());
    expect(b.delete('nonexistent.md')).toBe(false);
  });

  it('append creates file if it does not exist', () => {
    const b = new WorktreeBackend(squadDir());
    b.append('log.md', 'line 1\n');
    expect(b.read('log.md')).toBe('line 1\n');
  });

  it('append adds to existing content', () => {
    const b = new WorktreeBackend(squadDir());
    b.write('log.md', 'line 1\n');
    b.append('log.md', 'line 2\n');
    expect(b.read('log.md')).toBe('line 1\nline 2\n');
  });
});

describe('GitNotesBackend delete/append', () => {
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('delete removes a key from the blob', { timeout: 15_000 }, () => {
    const b = new GitNotesBackend(TMP);
    b.write('team.md', '# Team');
    b.write('routing.md', '# Routing');
    expect(b.delete('team.md')).toBe(true);
    expect(b.exists('team.md')).toBe(false);
    expect(b.read('routing.md')).toBe('# Routing');
  });

  it('delete returns false for non-existent key', { timeout: 10_000 }, () => {
    const b = new GitNotesBackend(TMP);
    expect(b.delete('nonexistent.md')).toBe(false);
  });

  it('append creates entry if it does not exist', { timeout: 10_000 }, () => {
    const b = new GitNotesBackend(TMP);
    b.append('log.md', 'entry 1\n');
    expect(b.read('log.md')).toBe('entry 1\n');
  });

  it('append concatenates to existing entry', { timeout: 15_000 }, () => {
    const b = new GitNotesBackend(TMP);
    b.write('log.md', 'entry 1\n');
    b.append('log.md', 'entry 2\n');
    expect(b.read('log.md')).toBe('entry 1\nentry 2\n');
  });
});

describe('OrphanBranchBackend delete/append', () => {
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('delete removes a file from the orphan branch', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('team.md', '# Team');
    b.write('routing.md', '# Routing');
    expect(b.delete('team.md')).toBe(true);
    expect(b.exists('team.md')).toBe(false);
    expect(b.read('routing.md')).toBe('# Routing');
  });

  it('delete returns false for non-existent file', () => {
    const b = new OrphanBranchBackend(TMP);
    expect(b.delete('nonexistent.md')).toBe(false);
  });

  it('append creates file if it does not exist', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.append('log.md', 'entry 1\n');
    expect(b.read('log.md')).toBe('entry 1\n');
  });

  it('append concatenates to existing file', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('log.md', 'entry 1\n');
    b.append('log.md', 'entry 2\n');
    expect(b.read('log.md')).toBe('entry 1\nentry 2\n');
  });

  it('delete does not disturb working tree', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('s.json', '{}');
    const before = readFileSync(join(TMP, 'README.md'), 'utf-8');
    b.delete('s.json');
    expect(readFileSync(join(TMP, 'README.md'), 'utf-8')).toBe(before);
    expect(git('status --porcelain')).toBe('');
  });

  it('delete last file in directory prunes the empty directory', { timeout: 15_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('agents/data.md', '# Data');
    b.write('team.md', '# Team');
    expect(b.list('')).toContain('agents');
    b.delete('agents/data.md');
    expect(b.exists('agents/data.md')).toBe(false);
    // The agents directory should be pruned since it's now empty
    expect(b.list('')).not.toContain('agents');
    // Other files should still be intact
    expect(b.read('team.md')).toBe('# Team');
  });

  it('delete in nested directory prunes empty parents', { timeout: 30_000 }, () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('a/b/c.md', 'deep');
    b.write('top.md', 'root');
    expect(b.list('')).toContain('a');
    b.delete('a/b/c.md');
    expect(b.exists('a/b/c.md')).toBe(false);
    // Both 'a' and 'a/b' should be pruned
    expect(b.list('')).not.toContain('a');
    expect(b.read('top.md')).toBe('root');
  });
});

describe('resolveSquadState()', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('returns null when no squad dir exists', () => {
    rmSync(squadDir(), { recursive: true, force: true });
    expect(resolveSquadState(TMP)).toBeNull();
  });

  it('returns context with local backend by default', () => {
    writeFileSync(join(squadDir(), 'team.md'), '# Team');
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.' }));
    const ctx = resolveSquadState(TMP);
    expect(ctx).not.toBeNull();
    expect(ctx!.backend.name).toBe('local');
    expect(ctx!.paths.projectDir).toBe(squadDir());
  });

  it('respects stateBackend in config.json (git-notes migrates to two-layer)', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    const ctx = resolveSquadState(TMP);
    expect(ctx).not.toBeNull();
    expect(ctx!.backend.name).toBe('two-layer');
  });

  it('CLI override wins over config', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    const ctx = resolveSquadState(TMP, 'orphan');
    expect(ctx).not.toBeNull();
    expect(ctx!.backend.name).toBe('orphan');
  });

  it('repoRoot uses git rev-parse --show-toplevel, not path.resolve parent', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.' }));
    const ctx = resolveSquadState(TMP);
    expect(ctx).not.toBeNull();
    // repoRoot should match the actual git toplevel, which is TMP
    const expected = execSync('git rev-parse --show-toplevel', { cwd: TMP, encoding: 'utf-8' }).trim();
    // Normalize path separators for cross-platform comparison
    expect(ctx!.repoRoot.replace(/\\/g, '/')).toBe(expected.replace(/\\/g, '/'));
  });

  it('returns FSStorageProvider for local backend', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.' }));
    const ctx = resolveSquadState(TMP);
    expect(ctx).not.toBeNull();
    expect(ctx!.storage).toBeDefined();
    // Local backend should use FSStorageProvider, not the adapter
    expect(ctx!.storage.constructor.name).toBe('FSStorageProvider');
  });

  it('returns StateBackendStorageAdapter for two-layer backend (via git-notes migration)', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    const ctx = resolveSquadState(TMP);
    expect(ctx).not.toBeNull();
    expect(ctx!.storage.constructor.name).toBe('StateBackendStorageAdapter');
  });
});

// ============================================================================
// StateBackendStorageAdapter tests
// ============================================================================

describe('StateBackendStorageAdapter', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('readSync/writeSync/existsSync round-trip via git-notes', () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    expect(adapter.existsSync('team.md')).toBe(false);
    adapter.writeSync('team.md', '# Team');
    expect(adapter.existsSync('team.md')).toBe(true);
    expect(adapter.readSync('team.md')).toBe('# Team');
  });

  it('listSync returns backend entries', () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    adapter.writeSync('agents/data.md', '# Data');
    adapter.writeSync('agents/picard.md', '# Picard');
    const entries = adapter.listSync('agents');
    expect(entries).toContain('data.md');
    expect(entries).toContain('picard.md');
  });

  it('appendSync via adapter', () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    adapter.writeSync('log.md', 'line 1\n');
    adapter.appendSync('log.md', 'line 2\n');
    expect(adapter.readSync('log.md')).toBe('line 1\nline 2\n');
  });

  it('toRelative strips absolute squad dir prefix', () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    // Write via absolute path, read via relative — should work
    const absPath = join(squadDir(), 'decisions.md');
    adapter.writeSync(absPath, '# Decisions');
    expect(adapter.readSync('decisions.md')).toBe('# Decisions');
  });

  it('deleteSync removes entries', () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    adapter.writeSync('temp.md', 'data');
    expect(adapter.existsSync('temp.md')).toBe(true);
    adapter.deleteSync('temp.md');
    expect(adapter.existsSync('temp.md')).toBe(false);
  });

  it('async read/write round-trip', async () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    await adapter.write('async.md', '# Async');
    expect(await adapter.read('async.md')).toBe('# Async');
    expect(await adapter.exists('async.md')).toBe(true);
  });

  it('stat returns size and isDirectory false for files', async () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    adapter.writeSync('s.md', 'hello');
    const st = await adapter.stat('s.md');
    expect(st).toBeDefined();
    expect(st!.size).toBe(5);
    expect(st!.isDirectory).toBe(false);
  });

  it('stat returns undefined for non-existent path', async () => {
    const backend = new GitNotesBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    expect(await adapter.stat('nope.md')).toBeUndefined();
  });
});

describe('ToolRegistry state tools with git-native backend', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  it('writes mutable state through the adapter without touching the worktree', { timeout: 20_000 }, async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);

    const write = registry.getTool('state.write')!;
    const read = registry.getTool('state.read')!;
    const result = await write.handler({ key: 'agents/data/history.md', content: '# Data\n\n## Learnings\n' });

    expect(result.resultType).toBe('success');
    expect(backend.read('agents/data/history.md')).toBe('# Data\n\n## Learnings\n');
    expect(existsSync(join(squadDir(), 'agents', 'data', 'history.md'))).toBe(false);
    expect(git('status --porcelain')).toBe('');

    const readResult = await read.handler({ key: '.squad/agents/data/history.md' });
    expect(readResult.resultType).toBe('success');
    expect(readResult.textResultForLlm).toContain('## Learnings');
  });

  it('only strips the .squad prefix for real .squad-relative keys', { timeout: 20_000 }, async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);
    const list = registry.getTool('state.list')!;

    backend.write('.squadata/runtime-check.md', 'not a .squad prefix\n');
    expect(backend.read('.squadata/runtime-check.md')).toBe('not a .squad prefix\n');
    expect(backend.read('ata/runtime-check.md')).toBeUndefined();

    const listResult = await list.handler({ dir: '.squadata' });
    expect(listResult.resultType).toBe('success');
    expect(listResult.textResultForLlm).toContain('runtime-check.md');
  });

  it('rejects static config mutations through runtime state tools', { timeout: 20_000 }, async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);
    const write = registry.getTool('state.write')!;
    const append = registry.getTool('state.append')!;
    const del = registry.getTool('state.delete')!;

    await expect(write.handler({ key: 'config.json', content: '{}' })).resolves.toMatchObject({ resultType: 'failure' });
    await expect(append.handler({ key: 'team.md', content: 'bad' })).resolves.toMatchObject({ resultType: 'failure' });
    await expect(del.handler({ key: 'agents/data/charter.md' })).resolves.toMatchObject({ resultType: 'failure' });
    await expect(write.handler({ key: 'skills/reviewer/SKILL.md', content: 'bad' })).resolves.toMatchObject({ resultType: 'failure' });
    await expect(write.handler({ key: '.squadata/runtime-check.md', content: 'bad' })).resolves.toMatchObject({ resultType: 'failure' });
    expect(backend.read('config.json')).toBeUndefined();
    expect(backend.read('team.md')).toBeUndefined();
  });

  it('allows only approved runtime state mutation paths through state tools', { timeout: 20_000 }, async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);
    const write = registry.getTool('state.write')!;
    const append = registry.getTool('state.append')!;
    const del = registry.getTool('state.delete')!;
    const health = registry.getTool('state.health')!;

    await expect(write.handler({ key: 'decisions.md', content: '# Decisions\n' })).resolves.toMatchObject({ resultType: 'success' });
    await expect(write.handler({ key: 'sessions/session-1/state.md', content: 'ok\n' })).resolves.toMatchObject({ resultType: 'success' });
    await expect(write.handler({ key: '.scratch/notes.md', content: 'ok\n' })).resolves.toMatchObject({ resultType: 'success' });
    await expect(append.handler({ key: 'agents/data/history.md', content: 'Learned via state tools.\n' })).resolves.toMatchObject({ resultType: 'success' });
    await expect(del.handler({ key: '.squad/sessions/session-1/state.md' })).resolves.toMatchObject({ resultType: 'success' });
    await expect(health.handler({})).resolves.toMatchObject({ resultType: 'success' });

    expect(backend.read('decisions.md')).toBe('# Decisions\n');
    expect(backend.read('.scratch/notes.md')).toBe('ok\n');
    expect(backend.read('agents/data/history.md')).toBe('Learned via state tools.\n');
    expect(backend.read('sessions/session-1/state.md')).toBeUndefined();
  });

  it('routes existing squad_decide writes through configured backend storage', { timeout: 20_000 }, async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);
    const decide = registry.getTool('squad_decide')!;

    const result = await decide.handler({
      author: 'scribe',
      summary: 'Use runtime state API',
      body: 'Mutable Squad state must be persisted through runtime-owned state tools.',
    });

    expect(result.resultType).toBe('success');
    expect(backend.list('decisions/inbox')).toHaveLength(1);
    expect(existsSync(join(squadDir(), 'decisions', 'inbox'))).toBe(false);
    expect(git('status --porcelain')).toBe('');
  });
});

describe('downloaded session replay regressions', () => {
  const squadDir = () => join(TMP, '.squad');
  beforeEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

  async function createRuntimeTools(): Promise<{
    backend: TwoLayerBackend;
    registry: ToolRegistry;
    stateWrite: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    stateAppend: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    stateRead: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    stateList: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    stateDelete: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    stateHealth: NonNullable<ReturnType<ToolRegistry['getTool']>>;
    decide: NonNullable<ReturnType<ToolRegistry['getTool']>>;
  }> {
    const backend = new TwoLayerBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    const registry = new ToolRegistry(squadDir(), undefined, adapter);
    return {
      backend,
      registry,
      stateWrite: registry.getTool('state.write')!,
      stateAppend: registry.getTool('state.append')!,
      stateRead: registry.getTool('state.read')!,
      stateList: registry.getTool('state.list')!,
      stateDelete: registry.getTool('state.delete')!,
      stateHealth: registry.getTool('state.health')!,
      decide: registry.getTool('squad_decide')!,
    };
  }

  function expectWorktreeUnmoved(initialBranch: string, initialHead: string): void {
    expect(git('rev-parse --abbrev-ref HEAD')).toBe(initialBranch);
    expect(git('rev-parse HEAD')).toBe(initialHead);
    expect(git('status --porcelain')).toBe('');
  }

  it('keeps spawned-agent prompt surfaces on runtime state tools, not manual git state choreography', () => {
    const promptFiles = [
      'templates/spawn-reference.md',
      'templates/after-agent-reference.md',
      'templates/scribe-charter.md',
      '.squad-templates/spawn-reference.md',
      '.squad-templates/after-agent-reference.md',
      '.squad-templates/scribe-charter.md',
      '.github/agents/squad.agent.md',
      'templates/squad.agent.md.template',
      '.squad-templates/squad.agent.md',
      'packages/squad-cli/templates/squad.agent.md.template',
      'packages/squad-sdk/templates/squad.agent.md.template',
    ];
    const forbiddenFragments = [
      'write-note.ps1',
      'git notes --ref',
      'git checkout squad-state',
      'git checkout HEAD -- .squad',
      'git reset HEAD --',
      "refs/notes/squad/*",
      'git push origin squad-state',
      'Scribe handles orphan',
      'Preserve backend-specific state protocol rules',
    ];

    for (const relativePath of promptFiles) {
      const content = readFileSync(join(process.cwd(), relativePath), 'utf-8');
      for (const fragment of forbiddenFragments) {
        expect(content, `${relativePath} should not contain transcript-era instruction: ${fragment}`).not.toContain(fragment);
      }
    }

    const spawnReference = readFileSync(join(process.cwd(), 'templates/spawn-reference.md'), 'utf-8');
    expect(spawnReference).toContain('Runtime State Tools');
    expect(spawnReference).toContain('The runtime routes those calls to the configured backend');
    expect(spawnReference).toContain('squad_decide');
  });

  it('replays the failed two-layer flow through state tools without dirtying or moving the worktree', { timeout: 30_000 }, async () => {
    const { backend, stateWrite, stateAppend, stateRead, stateList, stateDelete, decide } = await createRuntimeTools();
    const initialBranch = git('rev-parse --abbrev-ref HEAD');
    const initialHead = git('rev-parse HEAD');

    expect(await stateWrite.handler({ key: 'decisions.md', content: '# Decisions\n' })).toMatchObject({ resultType: 'success' });
    expect(await stateWrite.handler({ key: 'agents/kobayashi/history.md', content: '# Kobayashi\n\n## Learnings\n' })).toMatchObject({ resultType: 'success' });
    expect(await stateAppend.handler({ key: 'agents/kobayashi/history.md', content: '\n### Replay\nUsed runtime state tools instead of branch choreography.\n' })).toMatchObject({ resultType: 'success' });
    expect(await decide.handler({
      author: 'kobayashi',
      summary: 'Two-layer state belongs to runtime tools',
      body: 'The downloaded session failed when prompts exposed git notes and orphan branch internals.',
    })).toMatchObject({ resultType: 'success' });

    const inbox = await stateList.handler({ dir: 'decisions/inbox' });
    expect(inbox.resultType).toBe('success');
    const inboxEntry = inbox.textResultForLlm.split('\n').find((entry) => entry.endsWith('.md'));
    expect(inboxEntry).toBeDefined();

    const decision = await stateRead.handler({ key: `decisions/inbox/${inboxEntry}` });
    expect(decision.resultType).toBe('success');
    expect(decision.textResultForLlm).toContain('Two-layer state belongs to runtime tools');
    expect(await stateWrite.handler({ key: 'decisions.md', content: `# Decisions\n\n${decision.textResultForLlm}` })).toMatchObject({ resultType: 'success' });
    expect(await stateDelete.handler({ key: `decisions/inbox/${inboxEntry}` })).toMatchObject({ resultType: 'success' });
    expect(await stateWrite.handler({ key: 'orchestration-log/2026-01-01T00-00-kobayashi.md', content: 'Kobayashi completed replay work.\n' })).toMatchObject({ resultType: 'success' });
    expect(await stateWrite.handler({ key: 'log/2026-01-01T00-00-session.md', content: 'Scribe merged replay decision through state tools.\n' })).toMatchObject({ resultType: 'success' });
    expect(await stateAppend.handler({ key: 'agents/scribe/history.md', content: 'Merged replay decision without touching git state by hand.\n' })).toMatchObject({ resultType: 'success' });

    const decisions = await stateRead.handler({ key: '.squad/decisions.md' });
    expect(decisions.resultType).toBe('success');
    expect(decisions.textResultForLlm).toContain('Two-layer state belongs to runtime tools');
    expect(backend.list('decisions/inbox')).toEqual([]);
    expect(existsSync(join(squadDir(), 'decisions.md'))).toBe(false);
    expect(existsSync(join(squadDir(), 'agents', 'kobayashi', 'history.md'))).toBe(false);
    expect(existsSync(join(squadDir(), 'log', '2026-01-01T00-00-session.md'))).toBe(false);
    expectWorktreeUnmoved(initialBranch, initialHead);
  });

  const sessionReplays = [
    {
      name: 'directive capture',
      run: async (tools: Awaited<ReturnType<typeof createRuntimeTools>>) => {
        expect(await tools.decide.handler({
          author: 'coordinator',
          summary: 'Always use runtime state tools',
          body: 'Capture user directives through squad_decide instead of writing inbox files by hand.',
        })).toMatchObject({ resultType: 'success' });
        const inbox = await tools.stateList.handler({ dir: 'decisions/inbox' });
        expect(inbox.resultType).toBe('success');
        expect(inbox.textResultForLlm).toContain('coordinator-always-use-runtime-state-tools.md');
      },
    },
    {
      name: 'spawned agent history update',
      run: async (tools: Awaited<ReturnType<typeof createRuntimeTools>>) => {
        expect(await tools.stateWrite.handler({ key: 'agents/data/history.md', content: '# Data\n\n## Learnings\n' })).toMatchObject({ resultType: 'success' });
        expect(await tools.stateAppend.handler({ key: 'agents/data/history.md', content: '\n### Replay\nSpawn prompt used state.append.\n' })).toMatchObject({ resultType: 'success' });
        const history = await tools.stateRead.handler({ key: '.squad/agents/data/history.md' });
        expect(history.resultType).toBe('success');
        expect(history.textResultForLlm).toContain('Spawn prompt used state.append');
      },
    },
    {
      name: 'scribe merge and inbox cleanup',
      run: async (tools: Awaited<ReturnType<typeof createRuntimeTools>>) => {
        expect(await tools.decide.handler({
          author: 'scribe',
          summary: 'Merge inbox through backend',
          body: 'Scribe reads, writes, and deletes via state tools.',
        })).toMatchObject({ resultType: 'success' });
        const inbox = await tools.stateList.handler({ dir: 'decisions/inbox' });
        expect(inbox.resultType).toBe('success');
        const inboxEntry = inbox.textResultForLlm.split('\n').find((entry) => entry.endsWith('.md'));
        expect(inboxEntry).toBeDefined();
        const decision = await tools.stateRead.handler({ key: `decisions/inbox/${inboxEntry}` });
        expect(decision.resultType).toBe('success');
        expect(await tools.stateWrite.handler({ key: 'decisions.md', content: `# Decisions\n\n${decision.textResultForLlm}` })).toMatchObject({ resultType: 'success' });
        expect(await tools.stateDelete.handler({ key: `decisions/inbox/${inboxEntry}` })).toMatchObject({ resultType: 'success' });
        expect(tools.backend.list('decisions/inbox')).toEqual([]);
      },
    },
    {
      name: 'orchestration and session logs',
      run: async (tools: Awaited<ReturnType<typeof createRuntimeTools>>) => {
        expect(await tools.stateWrite.handler({ key: 'orchestration-log/2026-05-23T14-00-agent.md', content: 'Agent completed.\n' })).toMatchObject({ resultType: 'success' });
        expect(await tools.stateWrite.handler({ key: 'log/2026-05-23T14-00-session.md', content: 'Session completed.\n' })).toMatchObject({ resultType: 'success' });
        expect(tools.backend.list('orchestration-log')).toContain('2026-05-23T14-00-agent.md');
        expect(tools.backend.list('log')).toContain('2026-05-23T14-00-session.md');
      },
    },
    {
      name: 'health and missing-key recovery',
      run: async (tools: Awaited<ReturnType<typeof createRuntimeTools>>) => {
        const missing = await tools.stateRead.handler({ key: 'agents/missing/history.md' });
        expect(missing.resultType).toBe('failure');
        expect(missing.textResultForLlm).toContain('State key not found');
        const health = await tools.stateHealth.handler({});
        expect(health.resultType).toBe('success');
        expect(tools.backend.name).toBe('two-layer');
        expect(health.textResultForLlm).toContain('StateBackendStorageAdapter');
      },
    },
  ];

  it.each(sessionReplays)('replays $name without dirtying or moving the worktree', { timeout: 30_000 }, async ({ run }) => {
    const initialBranch = git('rev-parse --abbrev-ref HEAD');
    const initialHead = git('rev-parse HEAD');
    const tools = await createRuntimeTools();

    await run(tools);

    expect(existsSync(squadDir())).toBe(true);
    expectWorktreeUnmoved(initialBranch, initialHead);
  });
});