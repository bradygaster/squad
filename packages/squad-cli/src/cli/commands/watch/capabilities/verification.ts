/**
 * Optional local verification after watch dispatches work.
 */

import { runProcessTreeCommand } from '../agent-spawn.js';
import { BOLD, RESET, YELLOW } from '../../../core/output.js';
import type { CapabilityResult, PreflightResult, WatchCapability, WatchContext } from '../types.js';

const MAX_BUFFER = 5 * 1024 * 1024;

export function resolveVerificationCommands(
  config: Record<string, unknown>,
): { commands: string[] } | { error: string } {
  const configured = config['commands'];
  if (!Array.isArray(configured) || configured.length === 0 || configured.some(
    command => typeof command !== 'string' || command.trim().length === 0,
  )) {
    return { error: 'watch.verify.commands must be configured as a non-empty array of command strings' };
  }

  return { commands: configured as string[] };
}

async function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ success: boolean; detail?: string }> {
  const windows = process.platform === 'win32';
  const run = await runProcessTreeCommand(windows ? command : '/bin/sh', windows ? [] : ['-c', command], {
    cwd,
    timeoutMs,
    maxBuffer: MAX_BUFFER,
    shell: windows,
  });

  if (!run.error && !run.timedOut) return { success: true };

  const errorOutput = [run.stderr, run.stdout].find(output => output.trim().length > 0);
  const outputDetail = errorOutput?.trim().split(/\r?\n/).slice(-8).join('\n').slice(-600);
  return {
    success: false,
    detail: run.timedOut
      ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
      : outputDetail || run.error?.message,
  };
}

export class VerificationCapability implements WatchCapability {
  readonly name = 'verify';
  readonly description = 'Run project checks after watch dispatches work';
  readonly configShape = 'object' as const;
  readonly requires = [];
  readonly phase = 'verification' as const;
  private securityNoticePrinted = false;

  private printSecurityNotice(): void {
    if (this.securityNoticePrinted) return;
    this.securityNoticePrinted = true;
    console.log(
      `\n${YELLOW}${BOLD}⚠️  SECURITY: watch.verify.commands run after Ralph edits the working tree.${RESET}`,
    );
    console.log(`${YELLOW}    Commands run with the watch process permissions and environment.${RESET}`);
    console.log(`${YELLOW}    Configure only checks you trust, and review them before enabling verification.${RESET}\n`);
  }

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    this.printSecurityNotice();
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    this.printSecurityNotice();
    const resolved = resolveVerificationCommands(context.config);
    if ('error' in resolved) {
      return { success: false, summary: `verification unavailable: ${resolved.error}` };
    }

    const timeoutMinutes = context.config['timeout'];
    const timeoutMs = typeof timeoutMinutes === 'number' && Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
      ? timeoutMinutes * 60_000
      : 30 * 60_000;

    for (const command of resolved.commands) {
      const result = await runCommand(command, context.teamRoot, timeoutMs);
      if (!result.success) {
        return {
          success: false,
          summary: `verification failed: ${command}${result.detail ? ` — ${result.detail}` : ''}`,
          data: { failedCommand: command, checks: resolved.commands.length },
        };
      }
    }

    return {
      success: true,
      summary: `verification passed (${resolved.commands.length} command${resolved.commands.length === 1 ? '' : 's'})`,
      data: { checks: resolved.commands.length },
    };
  }
}
