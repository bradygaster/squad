/**
 * SelfPull capability — git fetch + pull --ff-only at round start.
 */

import { execFile } from 'node:child_process';
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
    try {
      await new Promise<void>((resolve, reject) => {
        execFile('git', ['fetch', '--quiet'], { cwd: context.teamRoot }, (err) =>
          err ? reject(err) : resolve(),
        );
      });
      await new Promise<void>((resolve, reject) => {
        execFile('git', ['pull', '--ff-only', '--quiet'], { cwd: context.teamRoot }, (err) =>
          err ? reject(err) : resolve(),
        );
      });
      return { success: true, summary: 'git pull ok' };
    } catch {
      return { success: true, summary: 'git pull skipped (not on tracking branch or conflicts)' };
    }
  }
}
