/**
 * Agent CLI detection and command building.
 *
 * Resolves which agent CLI binary to use (copilot, claude, gemini, opencode)
 * and provides a shared helper for building agent invocation commands.
 */

import { execFileSync } from 'node:child_process';
import { withAdditionalMcpConfig } from './copilot-invocation.js';

export interface AgentCli {
  cmd: string;
  name: string;
}

const KNOWN_AGENT_CLIS: readonly AgentCli[] = [
  { cmd: 'copilot', name: 'GitHub Copilot CLI' },
  { cmd: 'claude', name: 'Claude Code' },
  { cmd: 'gemini', name: 'Gemini CLI' },
  { cmd: 'opencode', name: 'OpenCode' },
];

function isInstalled(cmd: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(which, [cmd], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which agent CLIs are installed.
 * Returns all installed CLIs in priority order.
 */
export function detectInstalledAgentClis(): AgentCli[] {
  return KNOWN_AGENT_CLIS.filter(cli => isInstalled(cli.cmd));
}

/**
 * Detect the best available agent CLI.
 * Priority: copilot > claude > gemini > opencode.
 * Returns null if none found.
 */
export function detectAgentCli(): AgentCli | null {
  return KNOWN_AGENT_CLIS.find(cli => isInstalled(cli.cmd)) ?? null;
}

/**
 * Resolve which agent command to use.
 * If agentCmd is provided explicitly, use it. Otherwise auto-detect.
 */
export function resolveAgentCmd(agentCmd?: string): string {
  if (agentCmd) return agentCmd.trim().split(/\s+/)[0]!;
  const detected = detectAgentCli();
  if (detected) return detected.cmd;
  return 'copilot';
}

/**
 * Build a { cmd, args } pair for spawning an agent CLI with a prompt.
 *
 * Shared by loop, watch, and all watch capabilities. Replaces the
 * duplicated pattern that was previously copy-pasted across 8+ files.
 */
export function buildAgentCommand(
  prompt: string,
  options: { agentCmd?: string; agentFlags?: string; teamRoot?: string },
): { cmd: string; args: string[] } {
  if (options.agentCmd) {
    const parts = options.agentCmd.trim().split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '-p', prompt] };
  }
  const cmd = resolveAgentCmd();
  const args = ['-p', prompt];
  if (options.agentFlags) {
    args.push(...options.agentFlags.trim().split(/\s+/));
  }
  return {
    cmd,
    args: cmd === 'copilot' ? withAdditionalMcpConfig('copilot', args, options.teamRoot) : args,
  };
}

/** Human-readable label for the resolved agent CLI (used in status output). */
export function agentCmdLabel(agentCmd?: string): string {
  if (agentCmd) return agentCmd;
  const detected = detectAgentCli();
  return detected ? `${detected.name} (${detected.cmd})` : '(no agent CLI detected)';
}
