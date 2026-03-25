/**
 * Worktree regression tests — Issue #521
 *
 * Both resolveSquad() and detectSquadDir() must handle .git FILES (worktree
 * pointers) by reading the gitdir: pointer and falling back to the main
 * checkout's .squad/. The implementation parses .git via fs.readFileSync —
 * no child_process calls are made.
 *
 * Test directory structure:
 *  tmp/
 *    main/        ← main checkout
 *      .git/      ← real .git directory
 *        worktrees/
 *          feature-521/
 *      .squad/
 *    worktree/    ← worktree
 *      .git       ← FILE: "gitdir: ../main/.git/worktrees/feature-521"
 *
 * @see packages/squad-sdk/src/resolution.ts       resolveSquad()
 * @see packages/squad-cli/src/cli/core/detect-squad-dir.ts  detectSquadDir()
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveSquad } from '@bradygaster/squad-sdk/resolution';
import { detectSquadDir } from '@bradygaster/squad-cli/core/detect-squad-dir';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('worktree regression (#521)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'squad-worktree-test-'));
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
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main checkout: .git is a DIRECTORY with worktrees/, .squad/ is present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

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
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

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
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main: .git directory with worktrees/, but ALSO no .squad/
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });

      // Neither location has .squad/→ should return null in both old and new code
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
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main: .git directory with worktrees/, .squad/ present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

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
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.squad'), { recursive: true });

      const info = detectSquadDir(worktree);

      // CURRENT CODE → info.path === worktree/.squad  (wrong)  ← FAILS
      // AFTER FIX    → info.path === main/.squad       (correct) ← PASSES
      expect(info.path).not.toBe(join(worktree, '.squad'));
      expect(info.path).toBe(join(main, '.squad'));

      // The worktree directory must NOT have a .squad/ created as a side effect
      expect(existsSync(join(worktree, '.squad'))).toBe(false);
    });
  });

  // ── statSync guard ────────────────────────────────────────────────────────

  describe('statSync guard — crafted .git redirection', () => {
    it('resolveSquad(): crafted .git pointing to non-existent path returns null, not crash', () => {
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      // gitdir points to a path where mainCheckout/.git does not exist
      writeFileSync(join(worktree, '.git'), 'gitdir: ../nonexistent/.git/worktrees/malicious');

      expect(resolveSquad(worktree)).toBeNull();
    });

    it('detectSquadDir(): crafted .git pointing to non-existent path returns fallback, not crash', () => {
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(join(worktree, '.git'), 'gitdir: ../nonexistent/.git/worktrees/malicious');

      const info = detectSquadDir(worktree);
      // Falls back to the default (worktree/.squad) without crashing
      expect(info.path).toBe(join(worktree, '.squad'));
    });
  });
});
