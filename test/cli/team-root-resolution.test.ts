/**
 * SQUAD_TEAM_ROOT resolution tests (#836)
 *
 * Verifies that the SQUAD_TEAM_ROOT env var correctly controls squad
 * directory resolution across all scenarios:
 *   - env var set → uses that path
 *   - env var unset → falls back to process.cwd()
 *   - env var empty string → falls back to process.cwd()
 *   - resolveSquad honours the resolved start directory
 *   - invalid SQUAD_TEAM_ROOT produces a null result (no crash)
 *
 * These tests simulate the Copilot CLI bang-command scenario where
 * the subprocess working directory differs from the interactive shell.
 *
 * @see packages/squad-cli/src/cli-entry.ts — getSquadStartDir()
 * @see packages/squad-sdk/src/resolution.ts  — resolveSquad()
 * @see https://github.com/bradygaster/squad/issues/836
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveSquad } from '../../packages/squad-sdk/src/resolution.js';

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

/**
 * Reproduce the private getSquadStartDir() logic from cli-entry.ts so we
 * can unit-test the env-var resolution without depending on the private fn.
 *
 * The real implementation is:
 *   function getSquadStartDir(): string {
 *     return process.env['SQUAD_TEAM_ROOT'] || process.cwd();
 *   }
 */
function getSquadStartDir(): string {
  return process.env['SQUAD_TEAM_ROOT'] || process.cwd();
}

/** Create a minimal valid .squad directory tree inside a temp folder. */
function createSquadProject(): { root: string; squadDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'squad-team-root-'));
  tmpDirs.push(root);

  const squadDir = join(root, '.squad');
  mkdirSync(join(squadDir, 'agents', 'edie'), { recursive: true });
  mkdirSync(join(squadDir, 'decisions', 'inbox'), { recursive: true });
  mkdirSync(join(squadDir, 'orchestration-log'), { recursive: true });
  writeFileSync(join(squadDir, 'team.md'), '# Team\n');
  writeFileSync(join(squadDir, 'routing.md'), '# Routing\n');
  writeFileSync(join(squadDir, 'decisions.md'), '# Decisions\n');
  writeFileSync(
    join(squadDir, 'agents', 'edie', 'history.md'),
    '## Core Context\n\nTest agent.\n',
  );

  // Add a .git directory so resolveSquad stops walking at this level
  mkdirSync(join(root, '.git'), { recursive: true });

  return { root, squadDir };
}

// ============================================================================
// Tests — getSquadStartDir() resolution logic
// ============================================================================

describe('SQUAD_TEAM_ROOT resolution (#836)', () => {
  const savedTeamRoot = process.env['SQUAD_TEAM_ROOT'];
  const originalCwd = process.cwd();

  beforeEach(() => {
    delete process.env['SQUAD_TEAM_ROOT'];
  });

  afterEach(() => {
    // Restore cwd
    process.chdir(originalCwd);
    // Restore env
    if (savedTeamRoot !== undefined) {
      process.env['SQUAD_TEAM_ROOT'] = savedTeamRoot;
    } else {
      delete process.env['SQUAD_TEAM_ROOT'];
    }
    // Clean up temp dirs
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  // --------------------------------------------------------------------------
  // getSquadStartDir() env-var scenarios
  // --------------------------------------------------------------------------

  describe('getSquadStartDir() env-var handling', () => {
    it('returns SQUAD_TEAM_ROOT when the env var is set', () => {
      const { root } = createSquadProject();
      process.env['SQUAD_TEAM_ROOT'] = root;

      expect(getSquadStartDir()).toBe(root);
    });

    it('falls back to process.cwd() when SQUAD_TEAM_ROOT is unset', () => {
      delete process.env['SQUAD_TEAM_ROOT'];

      expect(getSquadStartDir()).toBe(process.cwd());
    });

    it('falls back to process.cwd() when SQUAD_TEAM_ROOT is empty string', () => {
      process.env['SQUAD_TEAM_ROOT'] = '';

      // Empty string is falsy → || falls through to process.cwd()
      expect(getSquadStartDir()).toBe(process.cwd());
    });
  });

  // --------------------------------------------------------------------------
  // resolveSquad integration with SQUAD_TEAM_ROOT
  // --------------------------------------------------------------------------

  describe('resolveSquad() uses getSquadStartDir result', () => {
    it('resolveSquad finds .squad/ when SQUAD_TEAM_ROOT points to a valid project', () => {
      const { root, squadDir } = createSquadProject();
      process.env['SQUAD_TEAM_ROOT'] = root;

      const startDir = getSquadStartDir();
      const result = resolveSquad(startDir);

      expect(result).toBe(squadDir);
    });

    it('resolveSquad finds .squad/ even when cwd is elsewhere', () => {
      const { root, squadDir } = createSquadProject();
      const otherDir = mkdtempSync(join(tmpdir(), 'squad-other-cwd-'));
      tmpDirs.push(otherDir);

      // Simulate Copilot CLI subprocess scenario:
      // cwd is some random directory, but SQUAD_TEAM_ROOT points to real project
      process.chdir(otherDir);
      process.env['SQUAD_TEAM_ROOT'] = root;

      const startDir = getSquadStartDir();
      const result = resolveSquad(startDir);

      expect(result).toBe(squadDir);
    });

    it('resolveSquad returns null when SQUAD_TEAM_ROOT is unset and cwd has no .squad/', () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'squad-empty-'));
      tmpDirs.push(emptyDir);
      // Add .git so resolveSquad stops walking here
      mkdirSync(join(emptyDir, '.git'), { recursive: true });

      delete process.env['SQUAD_TEAM_ROOT'];
      process.chdir(emptyDir);

      const startDir = getSquadStartDir();
      const result = resolveSquad(startDir);

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Invalid / non-existent SQUAD_TEAM_ROOT
  // --------------------------------------------------------------------------

  describe('invalid SQUAD_TEAM_ROOT path', () => {
    it('resolveSquad returns null for a non-existent SQUAD_TEAM_ROOT path', () => {
      const fakePath = join(tmpdir(), 'squad-nonexistent-' + Date.now());
      process.env['SQUAD_TEAM_ROOT'] = fakePath;

      const startDir = getSquadStartDir();
      const result = resolveSquad(startDir);

      // Non-existent path → resolveSquad walks up and finds nothing → null
      expect(result).toBeNull();
    });

    it('resolveSquad returns null for a SQUAD_TEAM_ROOT pointing to a dir without .squad/', () => {
      const dirWithoutSquad = mkdtempSync(join(tmpdir(), 'squad-no-squad-dir-'));
      tmpDirs.push(dirWithoutSquad);
      // Add .git so resolveSquad stops walking here
      mkdirSync(join(dirWithoutSquad, '.git'), { recursive: true });

      process.env['SQUAD_TEAM_ROOT'] = dirWithoutSquad;

      const startDir = getSquadStartDir();
      const result = resolveSquad(startDir);

      expect(result).toBeNull();
    });
  });
});
