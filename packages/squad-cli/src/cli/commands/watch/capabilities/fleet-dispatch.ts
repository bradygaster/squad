/**
 * FleetDispatch capability — batches read-heavy issues into a single
 * `/fleet`-style parallel Copilot session for efficient triage.
 *
 * Runs in the `post-execute` phase.  When `dispatchMode` is `'fleet'` or
 * `'hybrid'`, this capability picks up issues classified as read-heavy
 * (research, review, audit, etc.) and dispatches them as parallel
 * analysis tracks inside one Copilot invocation.
 */

import { execSync, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import type { DispatchMode } from '../config.js';
import {
  type ExecutableWorkItem,
  findExecutableIssues,
  classifyIssue,
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
  ].join('\n');
}

/** Invoke a fleet prompt via the Copilot CLI. */
function invokeFleet(
  prompt: string,
  cwd: string,
  timeoutMs: number,
): { success: boolean; output?: string; error?: string } {
  const promptFile = join(tmpdir(), `fleet-prompt-${Date.now()}.txt`);
  writeFileSync(promptFile, prompt, 'utf-8');

  try {
    // Read the prompt from file
    const promptContent = readFileSync(promptFile, 'utf-8');

    // Use execFileSync with args array — no shell, no injection risk
    const copilotBin = process.platform === 'win32' ? 'copilot.cmd' : 'copilot';
    const result = execFileSync(copilotBin, [
      '-p', promptContent,
      '--allow-all',
      '--no-ask-user',
      '--autopilot',
    ], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8' as BufferEncoding,
    });

    return { success: true, output: String(result) };
  } catch (e) {
    const err = e as Error & { killed?: boolean; stderr?: string };
    const msg = err.killed
      ? `Fleet dispatch timed out after ${Math.round(timeoutMs / 60_000)}m`
      : err.stderr || err.message;
    return { success: false, error: msg };
  } finally {
    try { unlinkSync(promptFile); } catch { /* best-effort cleanup */ }
  }
}

export class FleetDispatchCapability implements WatchCapability {
  readonly name = 'fleet-dispatch';
  readonly description = 'Batch read-heavy issues into a parallel /fleet Copilot session';
  readonly configShape = 'boolean' as const;
  readonly requires = ['gh', 'copilot'];
  readonly phase = 'post-execute' as const;

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
      }));

      const { filterByCapabilities, loadCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
      const capabilities: MachineCapabilities | null = await loadCapabilities(context.teamRoot);
      const { handled } = filterByCapabilities(issues, capabilities);

      const executable = findExecutableIssues(context.roster, capabilities, handled);

      // Pick only read-heavy issues (or all in pure fleet mode)
      const readIssues = dispatchMode === 'fleet'
        ? executable
        : executable.filter(i => classifyIssue(i.title) === 'read');

      if (readIssues.length === 0) {
        return { success: true, summary: 'fleet-dispatch: no read-heavy issues to batch' };
      }

      // Build and invoke fleet prompt
      const prompt = buildFleetPrompt(readIssues, context.roster);
      const fleetTimeout = Math.max(timeoutMs, 300_000); // at least 5 min for fleet
      const result = invokeFleet(prompt, context.teamRoot, fleetTimeout);

      if (result.success) {
        return {
          success: true,
          summary: `fleet-dispatch: ${readIssues.length} issues analyzed in parallel`,
          data: { dispatched: readIssues.length, issues: readIssues.map(i => i.number) },
        };
      }

      return {
        success: false,
        summary: `fleet-dispatch: failed — ${result.error}`,
        data: { dispatched: 0, error: result.error },
      };
    } catch (e) {
      return { success: false, summary: `fleet-dispatch error: ${(e as Error).message}` };
    }
  }
}
