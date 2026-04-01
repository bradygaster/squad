/**
 * MonitorEmail capability — scan email for actionable items + GitHub alerts.
 */

import { execFile } from 'node:child_process';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

function buildAgentCommand(prompt: string, context: WatchContext): { cmd: string; args: string[] } {
  if (context.agentCmd) {
    const parts = context.agentCmd.trim().split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '--message', prompt] };
  }
  const args = ['copilot', '--message', prompt];
  if (context.copilotFlags) args.push(...context.copilotFlags.trim().split(/\s+/));
  return { cmd: 'gh', args };
}

function spawnWithTimeout(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (err) => {
      if (err) {
        const execErr = err as Error & { killed?: boolean };
        reject(new Error(execErr.killed ? `Timed out after ${Math.round(timeoutMs / 1000)}s` : execErr.message));
      } else {
        resolve();
      }
    });
  });
}

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
