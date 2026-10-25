/**
 * FleetDispatch capability — batches read-heavy issues into a single
 * `/fleet`-style parallel Copilot session for efficient triage.
 *
 * Runs in the `post-execute` phase.  When `dispatchMode` is `'fleet'` or
 * `'hybrid'`, this capability picks up issues classified as read-heavy
 * (research, review, audit, etc.) and dispatches them as parallel
 * analysis tracks inside one Copilot invocation.
 */

import { execSync, execFile } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import type { DispatchMode } from '../config.js';
import { agentProcessGroupOptions, killProcessTree, trackAgentProcessGroup } from '../agent-spawn.js';
import { createVerboseLogger } from '../verbose.js';
import {
  acquireClaims,
  claimProviderFor,
  claimsAreExclusive,
  claimSummary,
  excludeDispatchedThisRound,
  holdClaimsWhile,
  markDispatchedThisRound,
} from '../claims.js';
import {
  type ExecutableWorkItem,
  findExecutableIssues,
  classifyIssue,
  createClaimLogger,
} from './execute.js';

/** Map a roster member label to a display-friendly agent name. */
function agentForIssue(
  issue: ExecutableWorkItem,
  roster: WatchContext['roster'],
): string {
  const memberLabels = new Map(roster.map(m => [m.label, m.name]));
  for (const label of issue.labels) {
    const name = memberLabels.get(label.name);
    if (name) return name;
  }
  return 'Copilot';
}

/** Build the multi-track fleet prompt for a set of read-heavy issues. */
function buildFleetPrompt(
  issues: ExecutableWorkItem[],
  roster: WatchContext['roster'],
  claimsActive = false,
): string {
  const tracks = issues.map((issue, idx) => {
    const agent = agentForIssue(issue, roster);
    return [
      `Track ${idx + 1} (${agent}): Issue #${issue.number}: ${issue.title}`,
      `  Read the issue body. Analyze, assess urgency (P0/P1/P2), recommend next step.`,
      `  Write findings as an issue comment.`,
      `  Do NOT create branches or modify files.`,
    ].join('\n');
  });

  return [
    `/fleet Execute these ${issues.length} read-only analysis tracks in parallel:`,
    '',
    ...tracks,
    '',
    'Rules: All tracks READ-ONLY. Write findings as issue comments. Run in parallel.',
    ...(claimsActive
      ? ['Claimed work: these issues are claimed for this session. Analyze ONLY these issues; do not pick up, self-assign, or take over any other issue. If a track cannot finish, stop it — the watcher releases the claim when this session ends.']
      : []),
  ].join('\n');
}

/** Invoke a fleet prompt via the Copilot CLI; aborting `signal` kills the session. */
export type FleetInvoker = (
  prompt: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<{ success: boolean; output?: string; error?: string; cancelled?: boolean }>;

/** Invoke a fleet prompt via the Copilot CLI. */
const invokeFleet: FleetInvoker = (prompt, cwd, timeoutMs, signal) => {
  const promptFile = join(tmpdir(), `fleet-prompt-${Date.now()}.txt`);
  writeFileSync(promptFile, prompt, 'utf-8');
  const cleanupPromptFile = (): void => {
    try { unlinkSync(promptFile); } catch { /* best-effort cleanup */ }
  };

  let promptContent: string;
  try {
    // Read the prompt from file
    promptContent = readFileSync(promptFile, 'utf-8');
  } catch (e) {
    cleanupPromptFile();
    return Promise.resolve({ success: false, error: (e as Error).message });
  }

  return new Promise((resolve) => {
    let onAbort: (() => void) | undefined;
    // Use execFile with args array — no shell, no injection risk
    const copilotBin = process.platform === 'win32' ? 'copilot.cmd' : 'copilot';
    const child = execFile(copilotBin, [
      '-p', promptContent,
      '--allow-all',
      '--no-ask-user',
      '--autopilot',
    ], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      ...(signal ? agentProcessGroupOptions() : {}),
    }, (err, stdout, stderr) => {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      cleanupPromptFile();
      if (signal?.aborted) {
        resolve({ success: false, cancelled: true, error: 'Fleet dispatch cancelled' });
        return;
      }
      if (err) {
        const e = err as Error & { killed?: boolean };
        const msg = e.killed
          ? `Fleet dispatch timed out after ${Math.round(timeoutMs / 60_000)}m`
          : stderr || e.message;
        resolve({ success: false, error: msg });
        return;
      }
      resolve({ success: true, output: String(stdout) });
    });
    if (signal) {
      trackAgentProcessGroup(child);
      onAbort = () => killProcessTree(child);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
};

export interface FleetDispatchOptions {
  /** Override how the fleet session is launched (tests). */
  invoke?: FleetInvoker;
}

export class FleetDispatchCapability implements WatchCapability {
  readonly name = 'fleet-dispatch';
  readonly description = 'Batch read-heavy issues into a parallel /fleet Copilot session';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh', 'copilot'];
  readonly phase = 'post-execute' as const;

  private readonly invoke: FleetInvoker;

  constructor(options: FleetDispatchOptions = {}) {
    this.invoke = options.invoke ?? invokeFleet;
  }

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    // Fleet dispatch requires the copilot CLI — quick sanity check
    try {
      execSync('copilot --version', { encoding: 'utf-8', stdio: 'pipe' });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'copilot CLI not found — required for fleet dispatch' };
    }
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    try {
      const dispatchMode = (context.config['dispatchMode'] as DispatchMode | undefined) ?? 'task';

      // Only run when fleet or hybrid dispatch is active
      if (dispatchMode !== 'fleet' && dispatchMode !== 'hybrid') {
        return { success: true, summary: 'fleet-dispatch: skipped (dispatch mode is task)' };
      }

      const timeoutMs = ((context.config['timeout'] as number) ?? 30) * 60_000;

      // Fetch the same issue set as the execute capability
      const sdkItems = await context.adapter.listWorkItems({ tags: ['squad'], state: 'open', limit: 50 });
      const issues: ExecutableWorkItem[] = sdkItems.map(wi => ({
        number: wi.id,
        title: wi.title,
        labels: wi.tags.map(t => ({ name: t })),
        assignees: wi.assignedTo ? [{ login: wi.assignedTo }] : [],
        ...(wi.url ? { url: wi.url } : {}),
      }));

      const { filterByCapabilities, loadCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
      const capabilities: MachineCapabilities | null = await loadCapabilities(context.teamRoot);
      const { handled } = filterByCapabilities(issues, capabilities);

      // Skip anything another capability (execute in hybrid mode) already dispatched this round
      const executable = excludeDispatchedThisRound(
        context,
        findExecutableIssues(context.roster, capabilities, handled),
      );

      // Pick only read-heavy issues (or all in pure fleet mode)
      const readIssues = dispatchMode === 'fleet'
        ? executable
        : executable.filter(i => classifyIssue(i.title) === 'read');

      if (readIssues.length === 0) {
        return { success: true, summary: 'fleet-dispatch: no read-heavy issues to batch' };
      }

      // Claim before dispatch (ADR-002): only issues this executor won are sent.
      const claimLog = createClaimLogger('fleet-dispatch', createVerboseLogger(context.verbose ?? false));
      const provider = claimProviderFor(context);
      const acquisition = await acquireClaims(context, readIssues, claimLog);
      const claimed = acquisition.won.map(w => w.item);
      const claimsData = claimSummary(provider, acquisition);
      if (claimed.length === 0) {
        return {
          success: true,
          summary: `fleet-dispatch: no claimable issues (${acquisition.held.length} held elsewhere, ${acquisition.unavailable.length} unavailable)`,
          data: { dispatched: 0, issues: [], claims: claimsData },
        };
      }
      markDispatchedThisRound(context, claimed);

      // Build and invoke fleet prompt
      const prompt = buildFleetPrompt(claimed, context.roster, claimsAreExclusive(provider));
      const fleetTimeout = Math.max(timeoutMs, 300_000); // at least 5 min for fleet
      const { result, fencedReason } = await holdClaimsWhile(
        context,
        acquisition.won.map(w => w.claim),
        (signal) => this.invoke(prompt, context.teamRoot, fleetTimeout, signal),
        (r, fenced) => fenced || r?.cancelled ? 'cancelled' : r?.success ? 'completed' : 'abandoned',
        claimLog,
      );

      if (result.success) {
        return {
          success: true,
          summary: `fleet-dispatch: ${claimed.length} issues analyzed in parallel`,
          data: { dispatched: claimed.length, issues: claimed.map(i => i.number), claims: claimsData },
        };
      }

      const error = fencedReason ?? result.error;
      return {
        success: false,
        summary: `fleet-dispatch: failed — ${error}`,
        data: { dispatched: 0, error, claims: { ...claimsData, ...(fencedReason ? { fenced: fencedReason } : {}) } },
      };
    } catch (e) {
      return { success: false, summary: `fleet-dispatch error: ${(e as Error).message}` };
    }
  }
}
