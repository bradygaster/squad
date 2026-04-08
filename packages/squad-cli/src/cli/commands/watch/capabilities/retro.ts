/**
 * Retro capability — enforce retrospective checks (Fridays or when missed).
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildCopilotArgs } from '../../copilot-args.js';

const storage = new FSStorageProvider();

function buildAgentCommand(prompt: string, context: WatchContext): { cmd: string; args: string[] } {
  return buildCopilotArgs(prompt, {
    agentCmd: context.agentCmd,
    copilotFlags: context.copilotFlags,
  });
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

export class RetroCapability implements WatchCapability {
  readonly name = 'retro';
  readonly description = 'Enforce retrospective checks (Fridays or when missed >7 days)';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh'];
  readonly phase = 'housekeeping' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const now = new Date();
      const isFriday = now.getUTCDay() === 5;
      const isAfternoon = now.getUTCHours() >= 14;

      const logDir = path.join(context.teamRoot, '.squad', 'log');
      let lastRetroAge = Infinity;
      try {
        const files = storage.listSync?.(logDir) ?? [];
        const retroFiles = (Array.isArray(files) ? files : [])
          .filter((f: string) => f.includes('retrospective'));
        if (retroFiles.length > 0) {
          retroFiles.sort().reverse();
          const newest = retroFiles[0]!;
          const dateMatch = newest.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            const retroDate = new Date(dateMatch[1]!);
            lastRetroAge = now.getTime() - retroDate.getTime();
          }
        }
      } catch { /* no log dir */ }

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const isDue = (isFriday && isAfternoon) || lastRetroAge > sevenDaysMs;

      if (!isDue) {
        return { success: true, summary: 'retro not due' };
      }

      const dateSlug = now.toISOString().slice(0, 10);
      const prompt =
        `Run a sprint retrospective for the squad. ` +
        `Review recent GitHub activity (issues closed, PRs merged, CI status). ` +
        `Summarize: what went well, what didn't, action items. ` +
        `Write the output to .squad/log/${dateSlug}-retrospective.md`;

      const { cmd, args } = buildAgentCommand(prompt, context);
      await spawnWithTimeout(cmd, args, context.teamRoot, 120_000);
      return { success: true, summary: 'retrospective completed' };
    } catch (e) {
      return { success: false, summary: `retro: ${(e as Error).message}` };
    }
  }
}
