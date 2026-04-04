import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { WorktreeBackend, GitNotesBackend, OrphanBranchBackend, resolveStateBackend } from '../packages/squad-sdk/src/state-backend.js';
import type { StateBackendType } from '../packages/squad-sdk/src/state-backend.js';

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
  it('name is worktree', () => { expect(new WorktreeBackend(squadDir()).name).toBe('worktree'); });
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
  it('defaults to worktree', () => { expect(resolveStateBackend(squadDir(), TMP).name).toBe('worktree'); });
  it('reads stateBackend from config.json', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    expect(resolveStateBackend(squadDir(), TMP).name).toBe('git-notes');
  });
  it('CLI override wins over config', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'git-notes' }));
    expect(resolveStateBackend(squadDir(), TMP, 'orphan').name).toBe('orphan');
  });
  it('falls back on invalid type', () => {
    writeFileSync(join(squadDir(), 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', stateBackend: 'bad' }));
    expect(resolveStateBackend(squadDir(), TMP).name).toBe('worktree');
  });
  it('falls back on malformed JSON', () => { writeFileSync(join(squadDir(), 'config.json'), 'bad'); expect(resolveStateBackend(squadDir(), TMP).name).toBe('worktree'); });
  it('external returns worktree stub', () => { expect(resolveStateBackend(squadDir(), TMP, 'external').name).toBe('worktree'); });
  it('all valid types accepted', () => {
    for (const t of ['worktree', 'external', 'git-notes', 'orphan'] as const) expect(resolveStateBackend(squadDir(), TMP, t)).toBeDefined();
  });
});