/**
 * Worktree regression tests — Issue #521
 *
 * Both resolveSquad() and detectSquadDir() treat .git FILES (worktree pointers)
 * the same as .git DIRECTORIES.  In a linked worktree, .git is always a file —
 * so both functions return null/default without ever checking the main checkout
 * for .squad/.
 *
 * These tests FAIL on the current code (proving the bug) and PASS once the
 * fix described in .squad/decisions/inbox/flight-worktree-investigation.md
 * is applied.  They serve as permanent regression guards.
 *
 * Implementation notes:
 *  - Temp dirs are created with mkdtempSync and deleted in afterEach.
 *  - child_process is mocked so tests never spawn a real git process.
 *  - The mock intercepts both execSync and execFileSync because the fix
 *    author may choose either form.
 *
 * @see packages/squad-sdk/src/resolution.ts       resolveSquad()
 * @see packages/squad-cli/src/cli/core/detect-squad-dir.ts  detectSquadDir()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mock child_process BEFORE importing any module that may require it.
// vi.mock() calls are hoisted by vitest, so this runs before all imports.
// After the fix, resolveSquad() / detectSquadDir() will call execSync (or
// execFileSync) to run `git worktree list --porcelain`.
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
  default: {
    execSync: vi.fn(),
    execFileSync: vi.fn(),
  },
}));

import { resolveSquad } from '@bradygaster/squad-sdk/resolution';
import { detectSquadDir } from '@bradygaster/squad-cli/core/detect-squad-dir';
import { execSync, execFileSync } from 'child_process';

const mockExecSync    = vi.mocked(execSync);
const mockExecFileSync = vi.mocked(execFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a realistic `git worktree list --porcelain` payload.
 * The main checkout (first entry) is always listed first by git.
 *
 * Note: git uses forward-slash paths even on Windows.
 */
function fakeWorktreeList(mainPath: string, worktreePath: string): string {
  const main = mainPath.replace(/\\/g, '/');
  const wt   = worktreePath.replace(/\\/g, '/');
  return [
    `worktree ${main}`,
    `HEAD abc0000000000000000000000000000000000000001`,
    `branch refs/heads/main`,
    ``,
    `worktree ${wt}`,
    `HEAD def0000000000000000000000000000000000000002`,
    `branch refs/heads/feature/521`,
    ``,
  ].join('\n');
}

/**
 * Configure the child_process mocks to return the given worktree list output.
 * Handles both execSync(string) and execFileSync(cmd, args) call shapes.
 */
function mockWorktreeList(mainPath: string, worktreePath: string): void {
  const output = fakeWorktreeList(mainPath, worktreePath);
  mockExecSync.mockReturnValue(output as any);
  mockExecFileSync.mockReturnValue(output as any);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('worktree regression (#521)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'squad-worktree-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── resolveSquad() ────────────────────────────────────────────────────────

  describe('resolveSquad()', () => {
    it('.git FILE is not treated as a hard stop — falls back to main checkout', () => {
      // Worktree: .git is a FILE (pointer), no .squad/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../../.git/worktrees/feature-521',
      );

      // Main checkout: .git is a DIRECTORY, .squad/ is present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

      mockWorktreeList(main, worktree);

      // CURRENT CODE → returns null  (treats .git file as hard stop)  ← FAILS
      // AFTER FIX    → returns main/.squad via worktree fallback       ← PASSES
      expect(resolveSquad(worktree)).toBe(join(main, '.squad'));
    });

    it('.git DIRECTORY still marks the repo root boundary correctly', () => {
      // Normal checkout: .git is a directory, .squad/ is present inside
      const repo = join(tmp, 'repo');
      mkdirSync(join(repo, '.git'), { recursive: true });
      mkdirSync(join(repo, '.squad'), { recursive: true });
      mkdirSync(join(repo, 'src'), { recursive: true });

      // resolveSquad() should find .squad/ before hitting the .git directory
      expect(resolveSquad(join(repo, 'src'))).toBe(join(repo, '.squad'));
    });

    it('worktree fallback: resolves .squad/ from src/ subdir inside worktree', () => {
      // Worktree has a nested src/ — walk-up crosses the worktree root
      const worktree = join(tmp, 'worktree');
      mkdirSync(join(worktree, 'src'), { recursive: true });
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../../.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

      mockWorktreeList(main, worktree);

      // CURRENT CODE → returns null  ← FAILS
      // AFTER FIX    → returns main/.squad  ← PASSES
      expect(resolveSquad(join(worktree, 'src'))).toBe(join(main, '.squad'));
    });

    it('worktree fallback: returns null when main checkout also has no .squad/', () => {
      // Worktree: .git file, no .squad/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../../.git/worktrees/feature-521',
      );

      // Main: .git directory, but ALSO no .squad/
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git'), { recursive: true });

      mockWorktreeList(main, worktree);

      // Neither location has .squad/ → should return null in both old and new code
      // (This is a "should stay null" control test.)
      expect(resolveSquad(worktree)).toBeNull();
    });
  });

  // ── detectSquadDir() ──────────────────────────────────────────────────────

  describe('detectSquadDir()', () => {
    it('finds .squad/ from main checkout when invoked from a worktree', () => {
      // Worktree: .git file, no .squad/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../../.git/worktrees/feature-521',
      );

      // Main: .git directory, .squad/ present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

      mockWorktreeList(main, worktree);

      // CURRENT CODE → returns { path: worktree/.squad, ... } — non-existent  ← FAILS
      // AFTER FIX    → returns { path: main/.squad, ... }                      ← PASSES
      const info = detectSquadDir(worktree);
      expect(info.path).toBe(join(main, '.squad'));
      expect(existsSync(info.path)).toBe(true);
      expect(info.isLegacy).toBe(false);
    });

    it('local checkout (non-worktree): still finds .squad/ at dest', () => {
      // Normal checkout — no worktree involved
      const repo = join(tmp, 'repo');
      mkdirSync(join(repo, '.git'), { recursive: true });
      mkdirSync(join(repo, '.squad'), { recursive: true });

      const info = detectSquadDir(repo);
      expect(info.path).toBe(join(repo, '.squad'));
      expect(info.isLegacy).toBe(false);
    });

    it('squad init in worktree: does not silently create a duplicate .squad/', () => {
      // Scenario: developer runs `squad init` from inside a worktree where
      // the main checkout already has .squad/.  The init command calls
      // detectSquadDir(cwd) to decide where to write.
      //
      // CURRENT: detectSquadDir returns worktree/.squad (non-existent) → init
      //          scaffolds a NEW .squad/ inside the worktree — silent data split.
      //
      // AFTER FIX: detectSquadDir returns main/.squad → init sees an existing
      //            .squad/ and prompts the user instead of silently duplicating.

      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../../.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

      mockWorktreeList(main, worktree);

      const info = detectSquadDir(worktree);

      // CURRENT CODE → info.path === worktree/.squad  (wrong)  ← FAILS
      // AFTER FIX    → info.path === main/.squad       (correct) ← PASSES
      expect(info.path).not.toBe(join(worktree, '.squad'));
      expect(info.path).toBe(join(main, '.squad'));

      // The worktree directory must NOT have a .squad/ created as a side effect
      expect(existsSync(join(worktree, '.squad'))).toBe(false);
    });
  });
});
