/**
 * Stale work reclaim capability — find assigned issues with no activity
 * and unassign them so they can be re-queued.
 *
 * Ported from ralph-watch.ps1 `Get-StaleIssues`.
 *
 * Runs in the `pre-scan` phase.
 *
 * Config (via squad.config.ts → watch.capabilities["stale-reclaim"]):
 *   staleHours       – hours since last update to consider stale (default: 24)
 *   dryRun           – log but don't actually unassign (default: false)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class StaleReclaimCapability implements WatchCapability {
  readonly name = 'stale-reclaim';
  readonly description = 'Reclaim issues assigned >24h with no activity';
  readonly configShape = 'object' as const;
  readonly requires = ['gh'];
  readonly phase = 'pre-scan' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = context.config as Record<string, unknown>;
    const staleHours = (config['staleHours'] as number) ?? 24;
    const dryRun = (config['dryRun'] as boolean) ?? false;
    const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    let reclaimed = 0;

    try {
      // List open squad-labeled issues that have assignees
      const { stdout } = await execFileAsync('gh', [
        'issue', 'list',
        '--label', 'squad',
        '--state', 'open',
        '--json', 'number,title,assignees,updatedAt',
        '--limit', '50',
      ], { cwd: context.teamRoot, timeout: 30_000 });

      const issues = JSON.parse(stdout) as Array<{
        number: number;
        title: string;
        assignees: Array<{ login: string }>;
        updatedAt: string;
      }>;

      for (const issue of issues) {
        if (!issue.assignees || issue.assignees.length === 0) continue;

        const lastUpdate = new Date(issue.updatedAt);
        if (lastUpdate >= cutoff) continue;

        const staleHrs = Math.round((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60));

        if (dryRun) {
          console.log(`  [stale-reclaim] Would unassign #${issue.number} "${issue.title}" (stale ${staleHrs}h)`);
        } else {
          try {
            // Unassign all current assignees
            for (const assignee of issue.assignees) {
              await execFileAsync('gh', [
                'issue', 'edit', String(issue.number),
                '--remove-assignee', assignee.login,
              ], { cwd: context.teamRoot, timeout: 10_000 });
            }
            // Add a comment so there's an audit trail
            await execFileAsync('gh', [
              'issue', 'comment', String(issue.number),
              '--body', `🔄 Auto-reclaimed by watch (stale ${staleHrs}h, threshold ${staleHours}h). Re-queued for assignment.`,
            ], { cwd: context.teamRoot, timeout: 10_000 });
            reclaimed++;
          } catch {
            // best-effort per issue
          }
        }
      }

      const mode = dryRun ? ' (dry-run)' : '';
      return {
        success: true,
        summary: `${reclaimed} issue(s) reclaimed${mode}`,
        data: { reclaimed },
      };
    } catch (e) {
      return {
        success: false,
        summary: `stale-reclaim failed: ${(e as Error).message}`,
      };
    }
  }
}
