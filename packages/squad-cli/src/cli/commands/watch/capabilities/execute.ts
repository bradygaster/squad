/**
 * Execute capability — spawns Copilot sessions for eligible issues.
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';

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

/** Build agent command for a prompt — writes prompt to temp file (-p flag). */
function buildAgentCommand(
  prompt: string,
  context: WatchContext,
): { cmd: string; args: string[]; promptFile: string } {
  const promptFile = path.join(os.tmpdir(), `squad-prompt-${Date.now()}.md`);
  writeFileSync(promptFile, prompt, 'utf8');

  if (context.agentCmd) {
    const parts = context.agentCmd.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), '-p', promptFile];
    return { cmd, args, promptFile };
  }
  const args = ['copilot', '-p', promptFile];
  if (context.copilotFlags) {
    args.push(...context.copilotFlags.trim().split(/\s+/));
  }
  return { cmd: 'gh', args, promptFile };
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

/** Build the rich agent prompt matching PS1 ralph-watch design. */
export function buildAgentPrompt(
  issues: ExecutableWorkItem[],
  teamRoot: string,
): string {
  const issueList = formatIssueList(issues);
  const hasInstructions = existsSync(path.join(teamRoot, '.squad', 'ralph-instructions.md'));

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

/** Spawn a single agent session for all eligible issues.
 * Uses spawn with stdio:'inherit' so agency output streams to terminal in real-time.
 */
async function executeAll(
  issues: ExecutableWorkItem[],
  context: WatchContext,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  const prompt = buildAgentPrompt(issues, context.teamRoot);
  const { cmd, args, promptFile } = buildAgentCommand(prompt, context);

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const cp = spawn(cmd, args, {
      cwd: context.teamRoot,
      stdio: 'inherit',  // Stream output to terminal in real-time
      env: { ...process.env },
    });

    // Timeout guard
    const timer = setTimeout(() => {
      cp.kill('SIGTERM');
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      resolve({ success: false, error: 'Timed out' });
    }, timeoutMs);

    cp.on('close', (code) => {
      clearTimeout(timer);
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Agent exited with code ${code}` });
      }
    });

    cp.on('error', (err) => {
      clearTimeout(timer);
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      resolve({ success: false, error: err.message });
    });
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
    try {
      const timeout = ((context.config['timeout'] as number) ?? 30) * 60_000;

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

      if (eligible.length === 0) {
        return { success: true, summary: 'no squad-labeled issues found' };
      }

      // Single agent invocation with all issues — agent reads ralph-instructions.md
      const result = await executeAll(eligible, context, timeout);

      return {
        success: result.success,
        summary: result.success
          ? `agent dispatched with ${eligible.length} issues`
          : `agent failed: ${result.error}`,
        data: { dispatched: eligible.length, success: result.success },
      };
    } catch (e) {
      return { success: false, summary: `execute error: ${(e as Error).message}` };
    }
  }
}