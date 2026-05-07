import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { WorktreeBackend, GitNotesBackend, OrphanBranchBackend, resolveStateBackend, validateStateKey, StateBackendStorageAdapter } from '../packages/squad-sdk/src/state-backend.js';
import type { StateBackendType } from '../packages/squad-sdk/src/state-backend.js';
import { resolveSquadState } from '../packages/squad-sdk/src/resolution.js';

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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
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
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });
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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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
  beforeEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); initRepo(); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true }); });

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