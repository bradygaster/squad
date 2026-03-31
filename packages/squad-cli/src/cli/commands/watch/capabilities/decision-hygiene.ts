/**
 * DecisionHygiene capability — merge decision inbox when >5 files.
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const storage = new FSStorageProvider();

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

export class DecisionHygieneCapability implements WatchCapability {
  readonly name = 'decision-hygiene';
  readonly description = 'Auto-merge decision inbox when >5 files accumulate';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh'];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    const inboxDir = path.join(context.teamRoot, '.squad', 'decisions', 'inbox');
    if (!storage.existsSync(inboxDir)) {
      return { ok: false, reason: 'no decision inbox directory found' };
    }
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const inboxDir = path.join(context.teamRoot, '.squad', 'decisions', 'inbox');
      if (!storage.existsSync(inboxDir)) {
        return { success: true, summary: 'no decision inbox' };
      }

      let fileCount = 0;
      try {
        const files = storage.listSync?.(inboxDir) ?? [];
        fileCount = Array.isArray(files) ? files.filter((f: string) => f.endsWith('.md')).length : 0;
      } catch {
        return { success: true, summary: 'decision inbox empty' };
      }

      if (fileCount <= 5) {
        return { success: true, summary: `decision inbox: ${fileCount} files (threshold: >5)` };
      }

      const prompt =
        'Merge the decision inbox files in .squad/decisions/inbox/ into .squad/decisions.md. ' +
        'Append each decision as a new section. After merging, delete the inbox files.';

      const { cmd, args } = buildAgentCommand(prompt, context);
      await spawnWithTimeout(cmd, args, context.teamRoot, 60_000);
      return { success: true, summary: `decision inbox merged (${fileCount} files)` };
    } catch (e) {
      return { success: false, summary: `decision hygiene: ${(e as Error).message}` };
    }
  }
}
