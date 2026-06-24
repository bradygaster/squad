/**
 * MonitorTeams capability — scan Teams for actionable messages via WorkIQ.
 */

import { execFile } from 'node:child_process';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildSandboxCommand } from '../../sandbox-command.js';

/** Build agent command from prompt, respecting --agent-cmd. */
function buildAgentCommand(prompt: string, context: WatchContext): { cmd: string; args: string[] } {
  if (context.agentCmd) {
    const parts = context.agentCmd.trim().split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '-p', prompt] };
  }
  const args = ['-p', prompt];
  if (context.copilotFlags) args.push(...context.copilotFlags.trim().split(/\s+/));
  return buildSandboxCommand({
    sandbox: context.sandbox,
    sandboxFlags: context.sandboxFlags,
    permissionProfile: context.permissionProfile,
    teamRoot: context.teamRoot,
    baseArgs: args,
  });
}

function spawnWithTimeout(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024, shell: true }, (err) => {
      if (err) {
        const execErr = err as Error & { killed?: boolean };
        reject(new Error(execErr.killed ? `Timed out after ${Math.round(timeoutMs / 1000)}s` : execErr.message));
      } else {
        resolve();
      }
    });
  });
}

export class MonitorTeamsCapability implements WatchCapability {
  readonly name = 'monitor-teams';
  readonly description = 'Scan Teams for actionable messages each round (requires WorkIQ MCP)';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh', 'WorkIQ MCP'];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    // If using custom agentCmd, skip copilot check
    if (context.agentCmd) return { ok: true };
    return new Promise((resolve) => {
      execFile('copilot', ['--version'], { shell: true, timeout: 5000 }, (err) => {
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
        'Check Teams for actionable messages from the last 30 minutes. ' +
        'Use workiq-ask_work_iq to query: "Teams messages in last 30 min mentioning action items, reviews, urgent requests". ' +
        'For each actionable item found, create a GitHub issue with the label "teams-bridge". ' +
        'First check existing open issues with label "teams-bridge" to avoid duplicates. ' +
        'If WorkIQ is not available, just report that and exit.';

      const { cmd, args } = buildAgentCommand(prompt, context);
      await spawnWithTimeout(cmd, args, context.teamRoot, 60_000);
      return { success: true, summary: 'Teams scan complete' };
    } catch (e) {
      return { success: false, summary: `Teams monitor: ${(e as Error).message}` };
    }
  }
}
