/**
 * Squad directory detection — zero dependencies
 */

import fs from 'node:fs';
import path from 'node:path';

export interface SquadDirInfo {
  path: string;
  name: '.squad' | '.ai-team';
  isLegacy: boolean;
}

/**
 * If `dir` has a `.git` worktree pointer file, parse it and return the
 * absolute path of the main checkout. Returns `null` otherwise.
 *
 * The `.git` file format is: `gitdir: <path-to-.git/worktrees/name>`
 */
export function resolveWorktreeMainCheckout(dir: string): string | null {
  const gitPath = path.join(dir, '.git');
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) return null;
    const content = fs.readFileSync(gitPath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match || !match[1]) return null;
    const worktreeGitDir = path.resolve(dir, match[1].trim());
    // worktreeGitDir = /main/.git/worktrees/name
    // mainGitDir     = /main/.git   (up 2 levels)
    // mainCheckout   = /main        (dirname of mainGitDir)
    const mainGitDir = path.resolve(worktreeGitDir, '..', '..');
    const mainCheckout = path.dirname(mainGitDir);
    // Verify the derived main checkout is a real git repo
    if (!fs.existsSync(mainGitDir) || !fs.statSync(mainGitDir).isDirectory()) {
      return null;
    }
    return mainCheckout;
  } catch {
    return null;
  }
}

/**
 * Detect squad directory — .squad/ first, fall back to .ai-team/
 *
 * Worktree-aware: when neither directory exists at `dest`, checks if `dest`
 * is a git worktree and looks in the main checkout as a fallback.
 */
export function detectSquadDir(dest: string): SquadDirInfo {
  const squadDir = path.join(dest, '.squad');
  const aiTeamDir = path.join(dest, '.ai-team');

  if (fs.existsSync(squadDir)) {
    return { path: squadDir, name: '.squad', isLegacy: false };
  }
  if (fs.existsSync(aiTeamDir)) {
    return { path: aiTeamDir, name: '.ai-team', isLegacy: true };
  }

  // Worktree fallback: check the main checkout when dest has a .git pointer file
  const mainCheckout = resolveWorktreeMainCheckout(dest);
  if (mainCheckout) {
    const mainSquadDir = path.join(mainCheckout, '.squad');
    const mainAiTeamDir = path.join(mainCheckout, '.ai-team');
    if (fs.existsSync(mainSquadDir)) {
      return { path: mainSquadDir, name: '.squad', isLegacy: false };
    }
    if (fs.existsSync(mainAiTeamDir)) {
      return { path: mainAiTeamDir, name: '.ai-team', isLegacy: true };
    }
  }

  // Default for new installations
  return { path: squadDir, name: '.squad', isLegacy: false };
}
