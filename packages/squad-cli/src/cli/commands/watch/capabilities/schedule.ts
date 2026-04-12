/**
 * Schedule capability — runs due tasks from .squad/schedule.json
 * each watch round.
 *
 * Plugs the generic scheduler into the watch loop so that cron,
 * interval, and startup triggers fire automatically alongside
 * Ralph's normal triage cycle.
 *
 * Enable in .squad/config.json:
 *   { "watch": { "schedule": true } }
 *
 * Or with options:
 *   { "watch": { "schedule": { "maxPerRound": 5 } } }
 */

import path from 'node:path';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import {
  parseSchedule,
  evaluateSchedule,
  executeTask,
  loadState,
  saveState,
  LocalPollingProvider,
  type ScheduleManifest,
  type ScheduleEntry,
  type ScheduleState,
} from '@bradygaster/squad-sdk/runtime/scheduler';

/** Max seconds a task can be stuck in 'running' before we consider it stale. */
const STALE_RUNNING_THRESHOLD_S = 300;

/** Default max tasks to execute per watch round. */
const DEFAULT_MAX_PER_ROUND = 5;

interface ScheduleConfig {
  /** Max scheduled tasks to execute per round (default: 5). */
  maxPerRound?: number;
}

function parseConfig(raw: Record<string, unknown>): ScheduleConfig {
  return {
    maxPerRound:
      typeof raw.maxPerRound === 'number' && Number.isFinite(raw.maxPerRound) && raw.maxPerRound > 0
        ? raw.maxPerRound
        : DEFAULT_MAX_PER_ROUND,
  };
}

export class ScheduleCapability implements WatchCapability {
  readonly name = 'schedule';
  readonly description = 'Run due tasks from .squad/schedule.json (cron, interval, startup)';
  readonly configShape = 'object' as const;
  readonly requires: string[] = [];
  readonly phase = 'pre-scan' as const;

  private schedulePath = '';
  private statePath = '';

  async preflight(context: WatchContext): Promise<PreflightResult> {
    const squadDir = path.join(context.teamRoot, '.squad');
    this.schedulePath = path.join(squadDir, 'schedule.json');
    this.statePath = path.join(squadDir, '.schedule-state.json');

    // Parse the manifest at preflight to fail early on bad JSON
    try {
      const manifest = await parseSchedule(this.schedulePath);
      const localTasks = manifest.schedules.filter(
        s => s.enabled && s.providers.includes('local-polling'),
      );
      if (localTasks.length === 0) {
        return { ok: false, reason: 'No enabled local-polling schedules in schedule.json' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `schedule.json: ${(err as Error).message}` };
    }
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = parseConfig(context.config);
    const maxPerRound = config.maxPerRound ?? DEFAULT_MAX_PER_ROUND;
    const now = new Date();

    let manifest: ScheduleManifest;
    try {
      manifest = await parseSchedule(this.schedulePath);
    } catch (err) {
      return { success: false, summary: `schedule: parse error - ${(err as Error).message}` };
    }

    // Filter to local-polling tasks only
    const localManifest: ScheduleManifest = {
      ...manifest,
      schedules: manifest.schedules.filter(
        s => s.enabled && s.providers.includes('local-polling'),
      ),
    };

    const state = await loadState(this.statePath);

    // Recover stale 'running' entries
    this.recoverStaleRunning(state, now);

    const due = evaluateSchedule(localManifest, state, now);
    if (due.length === 0) {
      return { success: true, summary: 'schedule: nothing due' };
    }

    const toRun = due.slice(0, maxPerRound);
    const provider = new LocalPollingProvider();
    const results: string[] = [];

    for (const entry of toRun) {
      // Mark running before execution
      state.runs[entry.id] = {
        lastRun: now.toISOString(),
        status: 'running',
      };
      await saveState(this.statePath, state);

      const result = await executeTask(entry, provider);

      // Persist outcome immediately
      state.runs[entry.id] = {
        lastRun: new Date().toISOString(),
        status: result.success ? 'success' : 'failure',
        error: result.error,
      };
      await saveState(this.statePath, state);

      const icon = result.success ? '\u2713' : '\u2717';
      results.push(`${icon} ${entry.id}`);
    }

    const skipped = due.length - toRun.length;
    const skippedNote = skipped > 0 ? ` (+${skipped} deferred)` : '';

    return {
      success: true,
      summary: `schedule: ${results.join(', ')}${skippedNote}`,
      data: { executed: toRun.map(e => e.id), skipped },
    };
  }

  /**
   * Clear stale 'running' entries that likely indicate a previous crash.
   * If a task has been 'running' longer than the threshold, reset to 'failure'
   * so it can be retried.
   */
  private recoverStaleRunning(state: ScheduleState, now: Date): void {
    for (const [id, run] of Object.entries(state.runs)) {
      if (run.status !== 'running') continue;
      const elapsed = (now.getTime() - new Date(run.lastRun).getTime()) / 1000;
      if (elapsed > STALE_RUNNING_THRESHOLD_S) {
        state.runs[id] = {
          ...run,
          status: 'failure',
          error: `Stale running state recovered after ${Math.round(elapsed)}s`,
        };
      }
    }
  }
}
