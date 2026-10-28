/**
 * Optional local verification after watch dispatches work.
 */

import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CapabilityResult, PreflightResult, WatchCapability, WatchContext } from '../types.js';

const MAX_BUFFER = 5 * 1024 * 1024;

export function resolveVerificationCommands(
  teamRoot: string,
  config: Record<string, unknown>,
): { commands: string[] } | { error: string } {
  if ('commands' in config) {
    const configured = config['commands'];
    if (!Array.isArray(configured) || configured.length === 0 || configured.some(
      command => typeof command !== 'string' || command.trim().length === 0,
    )) {
      return { error: 'watch.verify.commands must be a non-empty array of command strings' };
    }
    return { commands: configured as string[] };
  }

  let packageJson: { scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(readFileSync(path.join(teamRoot, 'package.json'), 'utf8')) as typeof packageJson;
  } catch (error) {
    return { error: `could not read package.json: ${(error as Error).message}` };
  }

  const scripts = ['build', 'test', 'lint'].filter(name => {
    const script = packageJson.scripts?.[name];
    return typeof script === 'string' && script.trim().length > 0;
  });
  if (scripts.length === 0) {
    return { error: 'no build, test, or lint scripts found in package.json; configure watch.verify.commands' };
  }

  return { commands: scripts.map(script => `npm run ${script}`) };
}

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ success: boolean; detail?: string }> {
  return new Promise(resolve => {
    // Commands are explicitly configured by the repository owner or generated from package.json scripts.
    exec(command, { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ success: true });
        return;
      }

      const errorOutput = [stderr, stdout].find(output => typeof output === 'string' && output.trim().length > 0);
      const detail = errorOutput?.trim().split(/\r?\n/).slice(-8).join('\n').slice(-600);
      resolve({ success: false, detail: detail || error.message });
    });
  });
}

export class VerificationCapability implements WatchCapability {
  readonly name = 'verify';
  readonly description = 'Run project checks after watch dispatches work';
  readonly configShape = 'object' as const;
  readonly requires = [];
  readonly phase = 'verification' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const resolved = resolveVerificationCommands(context.teamRoot, context.config);
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
