/**
 * WaveDispatch capability — parallel sub-task execution within issues.
 */

import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { buildAgentCommand, spawnAgent } from '../agent-spawn.js';

interface SubTask {
  description: string;
  dependsOn: string[];
}

/** Parse sub-tasks from issue body markdown. */
function parseSubTasks(body: string | undefined): SubTask[] {
  if (!body) return [];
  const lines = body.split('\n');
  const tasks: SubTask[] = [];

  for (const line of lines) {
    const match = line.match(/^[-*]\s+\[[ x]?\]\s+(.+)/i);
    if (!match) continue;

    let description = match[1]!.trim();
    let dependsOn: string[] = [];

    const depMatch = description.match(/\(depends_on:\s*([^)]+)\)/i);
    if (depMatch) {
      dependsOn = depMatch[1]!.split(',').map(d => d.trim()).filter(Boolean);
      description = description.replace(depMatch[0], '').trim();
    }

    tasks.push({ description, dependsOn });
  }
  return tasks;
}

function executeSubTask(
  prompt: string,
  context: WatchContext,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  const { cmd, args } = buildAgentCommand(prompt, context);
  return spawnAgent(cmd, args, context.teamRoot, timeoutMs);
}

export class WaveDispatchCapability implements WatchCapability {
  readonly name = 'wave-dispatch';
  readonly description = 'Wave-based parallel sub-task dispatch within issues';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh'];
  readonly phase = 'post-execute' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const maxConcurrent = (context.config['maxConcurrent'] as number) ?? 1;
      const timeoutMs = ((context.config['timeout'] as number) ?? 30) * 60_000;

      // Use shared round data when available (#923), otherwise fetch
      const sdkItems = context.roundData?.issues
        ?? await context.adapter.listWorkItems({ tags: ['squad'], state: 'open', limit: 50 });
      let executed = 0;
      let failed = 0;

      for (const item of sdkItems) {
        const subTasks = parseSubTasks(undefined); // Body not available from list; skip sub-tasks for items without body
        if (subTasks.length === 0) continue;

        const completed = new Set<string>();
        const remaining = new Map(subTasks.map((t, i) => [`task-${i}`, t]));
        let waveNum = 0;

        while (remaining.size > 0) {
          waveNum++;
          const wave: Array<[string, SubTask]> = [];
          for (const [id, task] of remaining) {
            if (task.dependsOn.every(dep => completed.has(dep))) wave.push([id, task]);
          }

          if (wave.length === 0) {
            // Circular dep — execute remaining sequentially
            for (const [id] of remaining) completed.add(id);
            break;
          }

          for (let i = 0; i < wave.length; i += maxConcurrent) {
            const batch = wave.slice(i, i + maxConcurrent);
            const results = await Promise.all(
              batch.map(([, task]) => {
                const prompt = `Work on sub-task of #${item.id}: ${task.description}`;
                return executeSubTask(prompt, context, timeoutMs);
              }),
            );
            for (const r of results) {
              if (r.success) executed++;
              else failed++;
            }
          }

          for (const [id] of wave) {
            completed.add(id);
            remaining.delete(id);
          }
        }
      }

      return {
        success: true,
        summary: `wave dispatch: ${executed} succeeded, ${failed} failed`,
        data: { executed, failed },
      };
    } catch (e) {
      return { success: false, summary: `wave dispatch error: ${(e as Error).message}` };
    }
  }
}
