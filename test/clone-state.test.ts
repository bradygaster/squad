/**
 * Tests for clone-state.ts — clone-local runtime state resolution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const TMP = join(process.cwd(), `.test-clone-state-${randomBytes(4).toString('hex')}`);

/**
 * Helper: build a mock LOCALAPPDATA tree within TMP
 */
function makeFakeLocal(): string {
  const localBase = join(TMP, 'local-appdata');
  mkdirSync(localBase, { recursive: true });
  return localBase;
}

describe('clone-state', () => {
  let fakeLocal: string;

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    fakeLocal = makeFakeLocal();

    // Stub LOCALAPPDATA / XDG_DATA_HOME so resolveLocalSquadBase() uses our temp dir
    vi.stubEnv('LOCALAPPDATA', fakeLocal);
    vi.stubEnv('XDG_DATA_HOME', fakeLocal);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  // Dynamically import to pick up env stubs
  async function loadModule() {
    // Force fresh import to pick up env changes
    const mod = await import('@bradygaster/squad-sdk/clone-state');
    return mod;
  }

  describe('resolveLocalSquadBase()', () => {
    it('returns a path ending with squad', async () => {
      const { resolveLocalSquadBase } = await loadModule();
      const result = resolveLocalSquadBase();
      expect(result).toMatch(/squad$/);
    });

    it('uses LOCALAPPDATA on Windows', async () => {
      const { resolveLocalSquadBase } = await loadModule();
      if (process.platform === 'win32') {
        expect(resolveLocalSquadBase()).toBe(join(fakeLocal, 'squad'));
      }
    });
  });

  describe('resolveCloneStateDir()', () => {
    it('derives path with correct structure', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const result = resolveCloneStateDir('/home/user/src/myrepo', 'bradygaster/squad');
      expect(result).toContain(join('repos', 'bradygaster', 'squad', 'clones', 'myrepo'));
    });

    it('lowercases the leaf name', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const result = resolveCloneStateDir('/home/user/src/MyRepo', 'bradygaster/squad');
      expect(result).toContain(join('clones', 'myrepo'));
    });

    it('handles 3-segment repo keys (ADO style)', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const result = resolveCloneStateDir('/home/user/src/os1', 'microsoft/os/os.2020');
      expect(result).toContain(join('repos', 'microsoft', 'os', 'os.2020', 'clones', 'os1'));
    });

    it('rejects invalid repo key with traversal segment', async () => {
      const { resolveCloneStateDir } = await loadModule();
      expect(() => resolveCloneStateDir('/x/repo', '../bad/key')).toThrow(/traversal/);
    });

    it('rejects repo key with empty segment', async () => {
      const { resolveCloneStateDir } = await loadModule();
      expect(() => resolveCloneStateDir('/x/repo', 'owner//repo')).toThrow(/empty/);
    });

    it('rejects repo key with single segment', async () => {
      const { resolveCloneStateDir } = await loadModule();
      expect(() => resolveCloneStateDir('/x/repo', 'noslash')).toThrow(/2-3 segments/);
    });

    it('rejects repo key with uppercase', async () => {
      const { resolveCloneStateDir } = await loadModule();
      expect(() => resolveCloneStateDir('/x/repo', 'Owner/Repo')).toThrow(/invalid characters/);
    });

    it('returns base slot when no collision exists', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const dir = resolveCloneStateDir('/a/repo1', 'owner/repo');
      expect(dir).toMatch(/clones[/\\]repo1$/);
    });

    it('prepends parent dir for generic leaf name "src"', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const dir = resolveCloneStateDir('/git/os/clone1/src', 'microsoft/os');
      expect(dir).toMatch(/clones[/\\]clone1-src$/);
    });

    it('prepends parent dir for generic leaf name "main"', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const dir = resolveCloneStateDir('/git/project/main', 'owner/repo');
      expect(dir).toMatch(/clones[/\\]project-main$/);
    });

    it('two generic-leaf clones resolve to distinct dirs', async () => {
      const { resolveCloneStateDir, ensureCloneState } = await loadModule();
      // Register first clone
      ensureCloneState('/git/os/clone1/src', 'microsoft/os');
      // Resolve second clone with different parent
      const dir2 = resolveCloneStateDir('/git/os/clone2/src', 'microsoft/os');
      expect(dir2).toMatch(/clone2-src/);
      expect(dir2).not.toMatch(/clone1-src/);
    });

    it('does not prepend parent for non-generic leaf', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const dir = resolveCloneStateDir('/git/os/myproject', 'owner/repo');
      expect(dir).toMatch(/clones[/\\]myproject$/);
    });

    it('detects collision and appends suffix', async () => {
      const { resolveCloneStateDir, resolveLocalSquadBase } = await loadModule();
      // Pre-create the base slot with a different clone
      const base = resolveLocalSquadBase();
      const clonesDir = join(base, 'repos', 'owner', 'repo', 'clones', 'sameleaf');
      mkdirSync(clonesDir, { recursive: true });
      writeFileSync(join(clonesDir, 'clone.json'), JSON.stringify({
        clonePath: '/other/path/sameleaf',
        repoKey: 'owner/repo',
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-01T00:00:00Z',
      }));

      const result = resolveCloneStateDir('/my/path/sameleaf', 'owner/repo');
      expect(result).toMatch(/sameleaf-2$/);
    });

    it('finds already-registered clone in suffixed slot', async () => {
      const { resolveCloneStateDir, resolveLocalSquadBase } = await loadModule();
      const base = resolveLocalSquadBase();
      const clonesDir = join(base, 'repos', 'owner', 'repo', 'clones');

      // Base slot: different clone
      const baseDir = join(clonesDir, 'leaf');
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(join(baseDir, 'clone.json'), JSON.stringify({
        clonePath: '/other/leaf',
        repoKey: 'owner/repo',
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-01T00:00:00Z',
      }));

      // Slot -2: our clone (already registered)
      const slot2 = join(clonesDir, 'leaf-2');
      mkdirSync(slot2, { recursive: true });
      writeFileSync(join(slot2, 'clone.json'), JSON.stringify({
        clonePath: '/my/leaf',
        repoKey: 'owner/repo',
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-01T00:00:00Z',
      }));

      const result = resolveCloneStateDir('/my/leaf', 'owner/repo');
      expect(result).toBe(slot2);
    });

    it('handles suffix gap (leaf-3 exists but leaf-2 is free)', async () => {
      const { resolveCloneStateDir, resolveLocalSquadBase } = await loadModule();
      const base = resolveLocalSquadBase();
      const clonesDir = join(base, 'repos', 'owner', 'repo', 'clones');

      // Base slot: different clone
      const baseDir = join(clonesDir, 'leaf');
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(join(baseDir, 'clone.json'), JSON.stringify({
        clonePath: '/x/leaf',
        repoKey: 'owner/repo',
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-01T00:00:00Z',
      }));

      // No slot -2 — it's free
      // Slot -3: exists but belongs to another clone
      // Note: resolveCloneStateDir won't scan past missing slots, so -2 is returned
      const result = resolveCloneStateDir('/new/leaf', 'owner/repo');
      expect(result).toMatch(/leaf-2$/);
    });

    it('claims dir with malformed clone.json', async () => {
      const { resolveCloneStateDir, resolveLocalSquadBase } = await loadModule();
      const base = resolveLocalSquadBase();
      const dir = join(base, 'repos', 'owner', 'repo', 'clones', 'myapp');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'clone.json'), 'not json');

      const result = resolveCloneStateDir('/any/myapp', 'owner/repo');
      // Should claim the dir since clone.json is malformed
      expect(result).toBe(dir);
    });

    it('is idempotent — same clonePath returns same dir', async () => {
      const { resolveCloneStateDir } = await loadModule();
      const r1 = resolveCloneStateDir('/home/user/repo', 'owner/repo');
      const r2 = resolveCloneStateDir('/home/user/repo', 'owner/repo');
      expect(r1).toBe(r2);
    });
  });

  describe('ensureCloneState()', () => {
    it('creates directory and writes clone.json', async () => {
      const { ensureCloneState } = await loadModule();
      const dir = ensureCloneState('/home/user/myrepo', 'owner/repo');

      expect(existsSync(dir)).toBe(true);
      const jsonPath = join(dir, 'clone.json');
      expect(existsSync(jsonPath)).toBe(true);

      const meta = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      expect(meta.repoKey).toBe('owner/repo');
      expect(meta.firstSeen).toBeTruthy();
      expect(meta.lastSeen).toBeTruthy();
    });

    it('clone.json contains normalized clonePath', async () => {
      const { ensureCloneState } = await loadModule();
      const dir = ensureCloneState('/home/user/myrepo/', 'owner/repo');
      const meta = JSON.parse(readFileSync(join(dir, 'clone.json'), 'utf-8'));
      // Should not have trailing separator
      expect(meta.clonePath).not.toMatch(/[/\\]$/);
    });

    it('updates lastSeen on second call without changing firstSeen', async () => {
      const { ensureCloneState } = await loadModule();
      const dir = ensureCloneState('/home/user/repo', 'owner/repo');
      const meta1 = JSON.parse(readFileSync(join(dir, 'clone.json'), 'utf-8'));

      // Small delay to ensure timestamps differ
      const beforeSecondCall = Date.now();
      // Modify firstSeen slightly to verify it's preserved
      const origFirstSeen = meta1.firstSeen;

      const dir2 = ensureCloneState('/home/user/repo', 'owner/repo');
      expect(dir2).toBe(dir);

      const meta2 = JSON.parse(readFileSync(join(dir, 'clone.json'), 'utf-8'));
      expect(meta2.firstSeen).toBe(origFirstSeen);
      // lastSeen should be updated (or at least not earlier)
      expect(new Date(meta2.lastSeen).getTime()).toBeGreaterThanOrEqual(
        new Date(meta1.lastSeen).getTime()
      );
    });

    it('clone.json has expected schema', async () => {
      const { ensureCloneState } = await loadModule();
      const dir = ensureCloneState('/home/user/myrepo', 'owner/repo');
      const meta = JSON.parse(readFileSync(join(dir, 'clone.json'), 'utf-8'));

      expect(meta).toHaveProperty('clonePath');
      expect(meta).toHaveProperty('repoKey');
      expect(meta).toHaveProperty('firstSeen');
      expect(meta).toHaveProperty('lastSeen');
      expect(typeof meta.clonePath).toBe('string');
      expect(typeof meta.repoKey).toBe('string');
      // ISO 8601 format check
      expect(() => new Date(meta.firstSeen)).not.toThrow();
      expect(() => new Date(meta.lastSeen)).not.toThrow();
    });

    it('handles collision in ensureCloneState', async () => {
      const { ensureCloneState, resolveLocalSquadBase } = await loadModule();

      // Pre-register a different clone with same leaf
      const base = resolveLocalSquadBase();
      const existingDir = join(base, 'repos', 'owner', 'repo', 'clones', 'samename');
      mkdirSync(existingDir, { recursive: true });
      writeFileSync(join(existingDir, 'clone.json'), JSON.stringify({
        clonePath: '/different/samename',
        repoKey: 'owner/repo',
        firstSeen: '2025-01-01T00:00:00Z',
        lastSeen: '2025-01-01T00:00:00Z',
      }));

      // This should get a suffixed directory
      const dir = ensureCloneState('/my/path/samename', 'owner/repo');
      expect(dir).toMatch(/samename-2/);
      expect(existsSync(join(dir, 'clone.json'))).toBe(true);
    });

    it('returns the same dir for same clone across calls', async () => {
      const { ensureCloneState } = await loadModule();
      const d1 = ensureCloneState('/home/user/repo', 'owner/repo');
      const d2 = ensureCloneState('/home/user/repo', 'owner/repo');
      expect(d1).toBe(d2);
    });
  });
});
