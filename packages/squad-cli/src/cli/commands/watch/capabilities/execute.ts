/**
 * Execute capability — spawns Copilot sessions for eligible issues.
 */

import { execFile, type ChildProcess } from 'node:child_process';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import { createVerboseLogger } from '../verbose.js';

/** Normalized work item for execution. */
export interface ExecutableWorkItem {
  number: number;
  title: string;
  body?: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
}

/** Labels that block autonomous execution. */
const BLOCKED_LABELS: ReadonlySet<string> = new Set([
  'status:blocked',
  'status:waiting-external',
  'status:postponed',
  'status:scheduled',
  'status:needs-action',
  'status:needs-decision',
  'status:needs-review',
  'pending-user',
  'do-not-merge',
]);

/** Build agent command for a prompt. */
function buildAgentCommand(
  prompt: string,
  context: WatchContext,
): { cmd: string; args: string[] } {
  if (context.agentCmd) {
    const parts = context.agentCmd.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), '--message', prompt];
    return { cmd, args };
  }
  const args = ['copilot', '--message', prompt];
  if (context.copilotFlags) {
    args.push(...context.copilotFlags.trim().split(/\s+/));
  }
  return { cmd: 'gh', args };
}

/** Find issues eligible for autonomous execution. */
export function findExecutableIssues(
  roster: Array<{ name: string; label: string; expertise: string[] }>,
  capabilities: MachineCapabilities | null,
  issues: ExecutableWorkItem[],
): ExecutableWorkItem[] {
  const memberLabels = new Set(roster.map(m => m.label));
  return issues.filter(issue => {
    const labels = issue.labels.map(l => l.name);
    if (!labels.some(l => memberLabels.has(l))) return false;
    if (issue.assignees && issue.assignees.length > 0) return false;
    if (labels.some(l => BLOCKED_LABELS.has(l))) return false;
    return true;
  });
}

/** Spawn agent for a single issue. */
async function executeOne(
  issue: ExecutableWorkItem,
  context: WatchContext,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  // Claim the issue
  try {
    await context.adapter.addTag(issue.number, 'status:in-progress');
  } catch { /* best-effort */ }

  try {
    await context.adapter.addComment(issue.number, '🤖 Ralph: starting autonomous work on this issue.');
  } catch { /* best-effort */ }

  const prompt = `Work on issue #${issue.number}: ${issue.title}. Read the issue body for full details.`;
  const { cmd, args } = buildAgentCommand(prompt, context);

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const _cp: ChildProcess = execFile(
      cmd,
      args,
      { cwd: context.teamRoot, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 },
      (err) => {
        if (err) {
          const execErr = err as Error & { killed?: boolean };
          const msg = execErr.killed ? `Timed out` : execErr.message;
          resolve({ success: false, error: msg });
        } else {
          resolve({ success: true });
        }
      },
    );
  });
}

export class ExecuteCapability implements WatchCapability {
  readonly name = 'execute';
  readonly description = 'Spawn Copilot sessions to work on eligible issues';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh'];
  readonly phase = 'post-execute' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return new Promise<PreflightResult>((resolve) => {
      execFile('gh', ['--version'], (err) => {
        resolve(err ? { ok: false, reason: 'gh CLI not found' } : { ok: true });
      });
    });
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const vlog = createVerboseLogger(context.verbose ?? false);

    try {
      const maxConcurrent = (context.config['maxConcurrent'] as number) ?? 1;
      const timeout = ((context.config['timeout'] as number) ?? 30) * 60_000;

      vlog.log(`Execute: agentCmd=${context.agentCmd ?? 'gh copilot'}, maxConcurrent=${maxConcurrent}, timeout=${timeout / 60_000}m`);

      // Fetch open issues with squad label
      const sdkItems = await context.adapter.listWorkItems({ tags: ['squad'], state: 'open', limit: 50 });
      const issues: ExecutableWorkItem[] = sdkItems.map(wi => ({
        number: wi.id,
        title: wi.title,
        labels: wi.tags.map(t => ({ name: t })),
        assignees: wi.assignedTo ? [{ login: wi.assignedTo }] : [],
      }));

      // Filter by capabilities
      const { filterByCapabilities, loadCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
      const capabilities = await loadCapabilities(context.teamRoot);
      const { handled } = filterByCapabilities(issues, capabilities);

      const executable = findExecutableIssues(context.roster, capabilities, handled);
      const batch = executable.slice(0, maxConcurrent);

      vlog.log(`Execute: ${issues.length} total issues, ${handled.length} capable, ${executable.length} executable, ${batch.length} in batch`);
      for (const issue of batch) {
        const labels = issue.labels.map(l => l.name).join(', ');
        vlog.log(`  → #${issue.number}: "${issue.title}" [${labels}]`);
      }

      if (batch.length === 0) {
        return { success: true, summary: 'no executable issues' };
      }

      const results = await Promise.all(
        batch.map(issue => executeOne(issue, context, timeout)),
      );
      const succeeded = results.filter(r => r.success).length;
      const failed = results.length - succeeded;

      return {
        success: true,
        summary: `${succeeded} executed, ${failed} failed`,
        data: { executed: succeeded, failed },
      };
    } catch (e) {
      return { success: false, summary: `execute error: ${(e as Error).message}` };
    }
  }
}
