/**
 * MonitorEmail capability — scan email for actionable items + GitHub alerts.
 */

import { execFile } from 'node:child_process';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildAgentCommand, spawnWithTimeout, IS_WINDOWS } from '../agent-spawn.js';

export class MonitorEmailCapability implements WatchCapability {
  readonly name = 'monitor-email';
  readonly description = 'Scan email for actionable items each round (requires WorkIQ MCP)';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh', 'WorkIQ MCP'];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    // If using custom agentCmd, skip copilot check
    if (context.agentCmd) return { ok: true };
    return new Promise((resolve) => {
      execFile('copilot', ['--version'], { shell: IS_WINDOWS, timeout: 5000 }, (err) => {
        if (err) {
          resolve({
            ok: false,
            reason:
              "Copilot CLI ('copilot') not found on PATH. Watch capabilities (monitor-teams, monitor-email, retro, decision-hygiene) require it. " +
              "If you installed the GitHub CLI extension, ensure 'copilot' is also available on your PATH, or set --agent-cmd to override.",
          });
        } else {
          resolve({ ok: true });
        }
      });
    });
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
