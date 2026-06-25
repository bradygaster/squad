/**
 * DecisionHygiene capability — merge decision inbox when >5 files.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildAgentCommand, spawnWithTimeout } from '../agent-spawn.js';

const storage = new FSStorageProvider();

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
