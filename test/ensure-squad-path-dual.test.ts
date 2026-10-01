/**
 * Tests for ensureSquadPathDual() and ensureSquadPathResolved()
 * Dual-root write support based on @spboyer (Shayne Boyer)'s remote mode design.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureSquadPathDual, ensureSquadPathResolved } from '@bradygaster/squad-sdk/resolution';
import type { ResolvedSquadPaths } from '@bradygaster/squad-sdk/resolution';

// Use fixed absolute paths for deterministic tests (no filesystem needed — pure validation)
const PROJECT_DIR = join(process.cwd(), 'project', '.squad');
const TEAM_DIR = join(process.cwd(), 'shared-team', '.squad');

describe('ensureSquadPathDual()', () => {
  describe('local mode (projectDir === teamDir)', () => {
    it('behaves like single-root when both dirs are the same', () => {
      const p = join(PROJECT_DIR, 'decisions', 'log.md');
      expect(ensureSquadPathDual(p, PROJECT_DIR, PROJECT_DIR)).toBe(p);
    });

    it('rejects paths outside the single root', () => {
      const outside = join(process.cwd(), 'outside.txt');
      expect(() => ensureSquadPathDual(outside, PROJECT_DIR, PROJECT_DIR))
        .toThrow(/outside both squad roots/);
    });
  });

  describe('remote mode (projectDir !== teamDir)', () => {
    it('accepts writes to projectDir', () => {
      const p = join(PROJECT_DIR, 'decisions', 'decision.md');
      expect(ensureSquadPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
    });

    it('accepts writes to teamDir', () => {
      const p = join(TEAM_DIR, 'agents', 'edie', 'charter.md');
      expect(ensureSquadPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
    });

    it('rejects writes outside both roots', () => {
      const outside = join(process.cwd(), 'random', 'file.txt');
      expect(() => ensureSquadPathDual(outside, PROJECT_DIR, TEAM_DIR))
        .toThrow(/outside both squad roots/);
    });
  });

  it('allows paths inside the system temp directory', () => {
    const p = join(tmpdir(), 'squad-scratch', 'temp.json');
    expect(ensureSquadPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
  });

  it('rejects path traversal attack (../../etc/passwd)', () => {
    const traversal = join(PROJECT_DIR, '..', '..', 'etc', 'passwd');
    expect(() => ensureSquadPathDual(traversal, PROJECT_DIR, TEAM_DIR))
      .toThrow(/outside both squad roots/);
  });

  it('accepts subdirectories of valid roots', () => {
    const projectSub = join(PROJECT_DIR, 'logs', 'orchestration', 'run-001.json');
    const teamSub = join(TEAM_DIR, 'casting', 'registry.json');
    expect(ensureSquadPathDual(projectSub, PROJECT_DIR, TEAM_DIR)).toBe(projectSub);
    expect(ensureSquadPathDual(teamSub, PROJECT_DIR, TEAM_DIR)).toBe(teamSub);
  });

  it('accepts exact root paths', () => {
    expect(ensureSquadPathDual(PROJECT_DIR, PROJECT_DIR, TEAM_DIR)).toBe(PROJECT_DIR);
    expect(ensureSquadPathDual(TEAM_DIR, PROJECT_DIR, TEAM_DIR)).toBe(TEAM_DIR);
  });
});

describe('ensureSquadPathResolved()', () => {
  const localPaths: ResolvedSquadPaths = {
    mode: 'local',
    projectDir: PROJECT_DIR,
    teamDir: PROJECT_DIR,
    teamSquadDir: PROJECT_DIR,
    config: null,
    name: '.squad',
    isLegacy: false,
  };

  const remotePaths: ResolvedSquadPaths = {
    mode: 'remote',
    projectDir: PROJECT_DIR,
    teamDir: TEAM_DIR,
    teamSquadDir: TEAM_DIR,
    config: { version: 1, teamRoot: '../shared-team/.squad', projectKey: null },
    name: '.squad',
    isLegacy: false,
  };

  it('works with ResolvedSquadPaths in local mode', () => {
    const p = join(PROJECT_DIR, 'decisions.md');
    expect(ensureSquadPathResolved(p, localPaths)).toBe(p);
  });

  it('works with ResolvedSquadPaths in remote mode (projectDir)', () => {
    const p = join(PROJECT_DIR, 'logs', 'run.json');
    expect(ensureSquadPathResolved(p, remotePaths)).toBe(p);
  });

  it('works with ResolvedSquadPaths in remote mode (teamDir)', () => {
    const p = join(TEAM_DIR, 'agents', 'fenster', 'scratch.md');
    expect(ensureSquadPathResolved(p, remotePaths)).toBe(p);
  });

  it('rejects paths outside both roots via ResolvedSquadPaths', () => {
    const outside = join(process.cwd(), 'nope.txt');
    expect(() => ensureSquadPathResolved(outside, remotePaths))
      .toThrow(/outside both squad roots/);
  });
});
