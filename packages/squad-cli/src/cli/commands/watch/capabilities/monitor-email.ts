/**
 * MonitorEmail capability — scan email for actionable items + GitHub alerts.
 */

import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildAgentCommand, spawnWithTimeout } from '../agent-spawn.js';

export class MonitorEmailCapability implements WatchCapability {
  readonly name = 'monitor-email';
  readonly description = 'Scan email for actionable items each round (requires WorkIQ MCP)';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh', 'WorkIQ MCP'];
  readonly phase = 'housekeeping' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const prompt =
        'Check email for actionable items. Use workiq-ask_work_iq to query: ' +
        '"Recent emails about CI failures, Dependabot alerts, security vulnerabilities, or review requests". ' +
        'For CI failures: check if a GitHub issue with label "ci-alert" already exists for the same workflow in the last 24 hours — if so, skip. ' +
        'For new alerts: create a GitHub issue with label "email-bridge". ' +
        'If a failed workflow can be re-run, attempt: gh run rerun <run-id> --failed. ' +
        'If WorkIQ is not available, just report that and exit.';

      const { cmd, args } = buildAgentCommand(prompt, context);
      await spawnWithTimeout(cmd, args, context.teamRoot, 60_000);
      return { success: true, summary: 'Email scan complete' };
    } catch (e) {
      return { success: false, summary: `Email monitor: ${(e as Error).message}` };
    }
  }
}
