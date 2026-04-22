/**
 * TwoPass capability — lightweight list then hydrate actionable issues only.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const execFileAsync = promisify(execFile);

/** Labels that block autonomous execution. */
const BLOCKED_LABELS: ReadonlySet<string> = new Set([
  'status:blocked', 'status:waiting-external', 'status:postponed',
  'status:scheduled', 'status:needs-action', 'status:needs-decision',
  'status:needs-review', 'pending-user', 'do-not-merge',
]);

export class TwoPassCapability implements WatchCapability {
  readonly name = 'two-pass';
  readonly description = 'Lightweight scan then hydrate only actionable issues';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh'];
  readonly phase = 'post-triage' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const memberLabels = new Set(context.roster.map(m => m.label));

      // Pass 1: lightweight list
      const allItems = await context.adapter.listWorkItems({
        tags: ['squad'], state: 'open', limit: 200,
      });
      const total = allItems.length;

      // Filter to actionable
      const actionable = allItems.filter(item => {
        const labels = item.tags;
        if (!labels.some(l => memberLabels.has(l))) return false;
        if (item.assignedTo) return false;
        if (labels.some(l => BLOCKED_LABELS.has(l))) return false;
        return true;
      });

      // Pass 2: hydrate actionable issues (fetch body + comments)
      const hydrated: Array<{ number: number; title: string; body?: string }> = [];
      for (const item of actionable) {
        try {
          const { stdout: detailJson } = await execFileAsync('gh', [
            'issue', 'view', String(item.id),
            '--json', 'number,title,body,labels,assignees',
          ], { maxBuffer: 5 * 1024 * 1024 });
          hydrated.push(JSON.parse(detailJson));
        } catch {
          hydrated.push({ number: item.id, title: item.title });
        }
      }

      return {
        success: true,
        summary: `${total} total → ${hydrated.length} actionable (hydrated)`,
        data: { total, actionable: hydrated.length, issues: hydrated },
      };
    } catch (e) {
      return { success: false, summary: `two-pass error: ${(e as Error).message}` };
    }
  }
}
