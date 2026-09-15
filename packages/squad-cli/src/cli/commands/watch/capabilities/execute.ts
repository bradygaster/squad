/**
 * Execute capability — spawns Copilot sessions for eligible issues.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import { createVerboseLogger } from '../verbose.js';
import { loadAgentCharter } from '../../../shell/spawn.js';
import {
  buildCopilotCommand,
  spawnAgent,
  withCopilotUsageOutput,
} from '../agent-spawn.js';
import type { AgentSpawnResult, CopilotUsageOutput } from '../agent-spawn.js';

/** Normalized work item for execution. */
export interface ExecutableWorkItem {
  number: number;
  title: string;
  body?: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
}

/** Check whether an issue carries a squad or squad:* label. */
function hasSquadLabel(issue: ExecutableWorkItem): boolean {
  return issue.labels.some(l => l.name === 'squad' || l.name.startsWith('squad:'));
}

/** Keywords that indicate read-heavy / analysis work. */
const READ_KEYWORDS = [
  'research', 'review', 'analyze', 'investigate', 'audit',
  'check', 'scan', 'assess', 'evaluate', 'fact-check',
  'document', 'report',
];

/** Keywords that indicate write-heavy / implementation work. */
const WRITE_KEYWORDS = [
  'fix', 'implement', 'create', 'build', 'refactor',
  'add', 'update', 'migrate', 'deploy', 'feature',
];

/** Classify an issue as read-heavy or write-heavy by title keywords. */
export function classifyIssue(title: string): 'read' | 'write' {
  const lower = title.toLowerCase();
  const isRead = READ_KEYWORDS.some(k => lower.includes(k));
  const isWrite = WRITE_KEYWORDS.some(k => lower.includes(k));
  if (isRead && !isWrite) return 'read';
  return 'write'; // default to write (safer — gets full agent session)
}

/** Labels that indicate an issue should not be auto-executed. */
const BLOCKING_LABELS = ['status:blocked', 'status:wontfix', 'status:on-hold', 'blocked'];

/** Check whether an issue has a blocking status label. */
function hasBlockingLabel(issue: ExecutableWorkItem): boolean {
  return issue.labels.some(l => BLOCKING_LABELS.includes(l.name));
}

/** Check whether an issue is already assigned to a human. */
function isAssigned(issue: ExecutableWorkItem): boolean {
  return issue.assignees.length > 0;
}

/** Find issues eligible for autonomous execution.
 *
 * Pre-filters to keep only clearly actionable items:
 *  - must have a squad/squad:* label
 *  - must not be assigned to a human (agent decides once it reads ralph-instructions.md)
 *  - must not carry a blocking status label
 *
 * Matches the PS1 ralph-watch pre-filter design.
 */
export function findExecutableIssues(
  _roster: Array<{ name: string; label: string; expertise: string[] }>,
  _capabilities: MachineCapabilities | null,
  issues: ExecutableWorkItem[],
): ExecutableWorkItem[] {
  return issues.filter(
    issue => hasSquadLabel(issue) && !isAssigned(issue) && !hasBlockingLabel(issue),
  );
}

/** Format issue list for the agent prompt. */
function formatIssueList(issues: ExecutableWorkItem[]): string {
  return issues.map(i => {
    const labels = i.labels.map(l => l.name).join(', ');
    const assigned = i.assignees?.length
      ? `assigned: ${i.assignees.map(a => a.login).join(',')}`
      : 'unassigned';
    return `- #${i.number}: ${i.title} [${labels}] ${assigned}`;
  }).join('\n');
}

/**
 * Build the rich agent prompt matching PS1 ralph-watch design.
 *
 * `stateDir` — where to look for ralph-instructions.md — defaults to
 * `{teamRoot}/.squad` when omitted; pass the effective state dir directly
 * to follow externalized state (#1490).
 */
export function buildAgentPrompt(
  issues: ExecutableWorkItem[],
  teamRoot: string,
  stateDir?: string,
): string {
  const issueList = formatIssueList(issues);
  const hasInstructions = existsSync(path.join(stateDir ?? path.join(teamRoot, '.squad'), 'ralph-instructions.md'));

  if (hasInstructions) {
    return [
      'Ralph, Go! Read .squad/ralph-instructions.md for your full instructions. Follow ALL sections there. MAXIMIZE PARALLELISM — spawn agents for ALL actionable issues simultaneously.',
      '',
      'Here are the current open squad issues:',
      issueList,
      '',
      'Task: Read the issues, follow your instructions in .squad/ralph-instructions.md, and work on what\'s actionable.',
      'WHY: Keep the squad pipeline moving — no idle work.',
      'Success: Issues get branches, PRs, and progress.',
      'Escalation: If blocked, comment on the issue and move to next.',
    ].join('\n');
  }

  // Fallback when ralph-instructions.md does not exist
  return [
    'You are Ralph, the autonomous work monitor. Review the open squad issues below and work on every actionable one. Skip issues that are blocked, waiting on external input, or already assigned.',
    '',
    'Here are the current open squad issues:',
    issueList,
    '',
    'Task: Triage the list, pick up unblocked/unassigned issues, create branches and PRs.',
    'WHY: Keep the squad pipeline moving — no idle work.',
    'Success: Issues get branches, PRs, and progress.',
    'Escalation: If blocked, comment on the issue and move to next.',
  ].join('\n');
}

/** Spawn a single agent session for all eligible issues. */
async function executeAll(
  issues: ExecutableWorkItem[],
  context: WatchContext,
  timeoutMs: number,
): Promise<AgentSpawnResult> {
  const prompt = buildAgentPrompt(issues, context.teamRoot, context.stateRoot);

  // Load Ralph's charter to give the spawned session full specialist context.
  let charterPrefix = '';
  try {
    const charter = await loadAgentCharter('ralph', context.teamRoot);
    charterPrefix = `You are an AI agent on a software development team.\n\nYOUR CHARTER:\n${charter}\n\nADDITIONAL CONTEXT:\n`;
  } catch {
    // Fall back gracefully if no charter exists (e.g., fresh setup)
  }

  const fullPrompt = charterPrefix + prompt;
  const { cmd, args: baseArgs } = buildCopilotCommand(fullPrompt, context);
  let usageCapture: ReturnType<typeof withCopilotUsageOutput> | undefined;
  let usageSetupError: string | undefined;
  if (!context.agentCmd) {
    try {
      usageCapture = withCopilotUsageOutput(baseArgs, context.stateRoot);
    } catch (error) {
      usageSetupError = `Could not initialize Copilot usage capture: ${(error as Error).message}`;
    }
  }
  const args = usageCapture?.args ?? baseArgs;

  // Track child PID for cleanup on exit/crash
  const issueNums = issues.map(i => `#${i.number}`).join(',');
  const pidTracking = context.pidTracker
    ? { tracker: context.pidTracker, label: `copilot-session-${issueNums}` }
    : undefined;

  const result = await spawnAgent(
    cmd,
    args,
    context.teamRoot,
    timeoutMs,
    pidTracking,
    usageCapture?.filePath,
  );
  return usageSetupError ? { ...result, usageError: usageSetupError } : result;
}

interface EstimatedContextUtilization {
  model: string;
  occupiedTokens: number;
  contextWindowTokens: number;
  utilization: number;
  source: 'estimated';
}

async function estimateContextUtilization(
  usage: CopilotUsageOutput,
  teamRoot: string,
): Promise<EstimatedContextUtilization | undefined> {
  const client = new SquadClient({ cwd: teamRoot });
  try {
    const models = await client.listModels();
    const model = models.find(candidate =>
      candidate.id === usage.currentModel || candidate.name === usage.currentModel);
    const contextWindowTokens = model?.capabilities.limits.max_context_window_tokens;
    if (!Number.isInteger(contextWindowTokens) || !contextWindowTokens || contextWindowTokens <= 0) {
      return undefined;
    }
    const occupiedTokens = usage.lastCallInputTokens + usage.lastCallOutputTokens;
    return {
      model: usage.currentModel,
      occupiedTokens,
      contextWindowTokens,
      utilization: occupiedTokens / contextWindowTokens,
      source: 'estimated',
    };
  } finally {
    await client.disconnect();
  }
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
      const timeout = ((context.config['timeout'] as number) ?? 30) * 60_000;

      vlog.log(`Execute: agentCmd=${context.agentCmd ?? 'copilot'}, timeout=${timeout / 60_000}m`);

      // Fetch open issues with squad label
      const sdkItems = await context.adapter.listWorkItems({ tags: ['squad'], state: 'open', limit: 50 });
      const issues: ExecutableWorkItem[] = sdkItems.map(wi => ({
        number: wi.id,
        title: wi.title,
        labels: wi.tags.map(t => ({ name: t })),
        assignees: wi.assignedTo ? [{ login: wi.assignedTo }] : [],
      }));

      // Minimal filter: must have squad or squad:* label (agent decides the rest)
      const eligible = findExecutableIssues(context.roster, null, issues);

      vlog.log(`Execute: ${issues.length} total issues, ${eligible.length} eligible`);
      for (const issue of eligible.slice(0, 5)) {
        const labels = issue.labels.map(l => l.name).join(', ');
        vlog.log(`  → #${issue.number}: "${issue.title}" [${labels}]`);
      }

      if (eligible.length === 0) {
        return { success: true, summary: 'no squad-labeled issues found' };
      }

      // Single agent invocation with all issues — agent reads ralph-instructions.md
      const result = await executeAll(eligible, context, timeout);
      let contextUtilization: EstimatedContextUtilization | undefined;
      let contextTelemetryError = result.usageError;
      if (result.usage) {
        try {
          contextUtilization = await estimateContextUtilization(result.usage, context.teamRoot);
          if (!contextUtilization) {
            contextTelemetryError = `No context-window limit found for model ${result.usage.currentModel}`;
          }
        } catch (error) {
          contextTelemetryError = `Could not resolve model context window: ${(error as Error).message}`;
        }
      }

      const contextSummary = contextUtilization
        ? `; context ${(contextUtilization.utilization * 100).toFixed(1)}% (${contextUtilization.source})`
        : contextTelemetryError
          ? `; context telemetry unavailable (${contextTelemetryError})`
          : '';
      if (contextUtilization) {
        vlog.log(
          `Execute: context ${(contextUtilization.utilization * 100).toFixed(1)}% `
          + `(${contextUtilization.occupiedTokens}/${contextUtilization.contextWindowTokens} tokens, estimated)`,
        );
      } else if (contextTelemetryError) {
        vlog.log(`Execute: ${contextTelemetryError}`);
      }

      return {
        success: result.success,
        summary: result.success
          ? `agent dispatched with ${eligible.length} issues${contextSummary}`
          : `agent failed: ${result.error}${contextSummary}`,
        data: {
          dispatched: eligible.length,
          success: result.success,
          ...(contextUtilization ? { contextUtilization } : {}),
          ...(contextTelemetryError ? { contextTelemetryError } : {}),
        },
      };
    } catch (e) {
      return { success: false, summary: `execute error: ${(e as Error).message}` };
    }
  }
}