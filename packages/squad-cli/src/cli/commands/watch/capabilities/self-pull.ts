/**
 * SelfPull capability — git stash + fetch + pull --ff-only + stash pop.
 *
 * Matches PS1 behavior: stashes local changes before pulling, pops after,
 * and warns if watch source files changed (restart recommended).
 */

import { execFile, execFileSync } from 'node:child_process';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

export class SelfPullCapability implements WatchCapability {
  readonly name = 'self-pull';
  readonly description = 'Git fetch/pull at round start to keep work-tree current';
  readonly configShape = 'boolean' as const;
  readonly requires = ['git'];
  readonly phase = 'pre-scan' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return new Promise<PreflightResult>((resolve) => {
      execFile('git', ['--version'], (err) => {
        resolve(err ? { ok: false, reason: 'git not found' } : { ok: true });
      });
    });
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const cwd = context.teamRoot;
    try {
      // Capture HEAD before pull for change detection
      let headBefore = '';
      try {
        headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).trim();
      } catch { /* non-fatal */ }

      // Stash if there are local changes
      let didStash = false;
      try {
        const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' }).trim();
        if (status.length > 0) {
          execFileSync('git', ['stash', '--include-untracked'], { cwd, encoding: 'utf-8' });
          didStash = true;
        }
      } catch { /* non-fatal — proceed without stash */ }

      // Fetch + pull. A thrown error here (no tracking branch, diverged
      // history, network failure) must not skip the stash-pop below — a
      // stash created above and never popped silently strips the user's
      // uncommitted work out of the working tree while this still reports
      // success further down.
      let pullError: unknown;
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('git', ['fetch', '--quiet'], { cwd }, (err) =>
            err ? reject(err) : resolve(),
          );
        });
        await new Promise<void>((resolve, reject) => {
          execFile('git', ['pull', '--ff-only', '--quiet'], { cwd }, (err) =>
            err ? reject(err) : resolve(),
          );
        });
      } catch (err) {
        pullError = err;
      }

      // Pop stash if we created one — always attempted, regardless of
      // whether fetch/pull above succeeded.
      let stashRestored = !didStash;
      if (didStash) {
        try {
          execFileSync('git', ['stash', 'pop'], { cwd, encoding: 'utf-8' });
          stashRestored = true;
        } catch {
          stashRestored = false;
        }
      }

      if (!stashRestored) {
        const cause = pullError ? 'pull failed' : 'stash pop conflict';
        const summary = `git pull left local changes stashed (${cause}) — run \`git stash pop\` in ${cwd} manually`;
        console.log(`⚠️  ${summary}`);
        return { success: false, summary };
      }

      if (pullError) {
        return { success: true, summary: 'git pull skipped (not on tracking branch or conflicts)' };
      }

      // Check if watch source files changed
      let sourceChanged = false;
      if (headBefore) {
        try {
          const headAfter = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).trim();
          if (headBefore !== headAfter) {
            const diff = execFileSync(
              'git', ['diff', '--name-only', headBefore, headAfter, '--', 'packages/squad-cli/src/'],
              { cwd, encoding: 'utf-8' },
            ).trim();
            if (diff.length > 0) {
              sourceChanged = true;
              console.log('⚠️  Watch source changed — restart recommended for latest behavior');
            }
          }
        } catch { /* non-fatal */ }
      }

      return {
        success: true,
        summary: sourceChanged ? 'git pull ok (source changed — restart recommended)' : 'git pull ok',
      };
    } catch {
      return { success: true, summary: 'git pull skipped (not on tracking branch or conflicts)' };
    }
  }
}
