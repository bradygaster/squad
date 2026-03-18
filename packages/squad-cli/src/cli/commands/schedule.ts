/**
 * Schedule command — manage Squad scheduled tasks (#296)
 *
 * Subcommands:
 *   squad schedule list     — show configured schedules
 *   squad schedule run <id> — manually trigger a scheduled task
 *   squad schedule init     — create a default schedule.json
 *   squad schedule status   — show last run times and next due
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn, info, secondary, BOLD, RESET, GREEN, YELLOW, RED, GRAY, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';

import type { ScheduleManifest, ScheduleState, ScheduleEntry, ScheduleProvider } from '@bradygaster/squad-sdk/runtime/scheduler';

// Re-export so tests can mock through this module
async function loadSchedulerModule() {
  return import('@bradygaster/squad-sdk/runtime/scheduler');
}

function resolveSchedulePath(cwd: string): string {
  const squadInfo = detectSquadDir(cwd);
  return path.join(squadInfo.path, 'schedule.json');
}

function resolveStatePath(cwd: string): string {
  const squadInfo = detectSquadDir(cwd);
  return path.join(squadInfo.path, '.schedule-state.json');
}

/**
 * Entry point for `squad schedule` subcommands.
 */
export async function runSchedule(cwd: string, subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
      await scheduleList(cwd);
      break;
    case 'run': {
      const id = args[0];
      if (!id) {
        fatal('Usage: squad schedule run <id>');
      }
      await scheduleRun(cwd, id);
      break;
    }
    case 'init':
      await scheduleInit(cwd);
      break;
    case 'status':
      await scheduleStatus(cwd);
      break;
    default:
      fatal(
        `Unknown schedule subcommand: ${subcommand}\n` +
        `       Available: list, run <id>, init, status`,
      );
  }
}

// ============================================================================
// Subcommand: list
// ============================================================================

async function scheduleList(cwd: string): Promise<void> {
  const schedulePath = resolveSchedulePath(cwd);
  const mod = await loadSchedulerModule();
  let manifest: ScheduleManifest;

  try {
    manifest = await mod.parseSchedule(schedulePath);
  } catch {
    fatal(`No schedule.json found — run 'squad schedule init' to create one`);
  }

  if (manifest.schedules.length === 0) {
    info('No schedules configured.');
    return;
  }

  console.log(`\n${BOLD}Configured Schedules${RESET} (${manifest.schedules.length}):\n`);

  for (const entry of manifest.schedules) {
    const status = entry.enabled ? `${GREEN}●${RESET} enabled` : `${GRAY}○${RESET} disabled`;
    const trigger = formatTrigger(entry);
    console.log(`  ${BOLD}${entry.id}${RESET} — ${entry.name}`);
    console.log(`    ${status}  │  ${trigger}  │  ${entry.task.type}:${entry.task.ref}`);
    console.log(`    providers: ${entry.providers.join(', ')}`);
    if (entry.retry) {
      console.log(`    retry: ${entry.retry.maxRetries}× (backoff ${entry.retry.backoffSeconds}s)`);
    }
    console.log('');
  }
}

// ============================================================================
// Subcommand: run
// ============================================================================

async function scheduleRun(cwd: string, id: string): Promise<void> {
  const schedulePath = resolveSchedulePath(cwd);
  const statePath = resolveStatePath(cwd);
  const mod = await loadSchedulerModule();

  let manifest: ScheduleManifest;
  try {
    manifest = await mod.parseSchedule(schedulePath);
  } catch {
    fatal(`No schedule.json found — run 'squad schedule init' to create one`);
  }

  const entry = manifest.schedules.find(s => s.id === id);
  if (!entry) {
    fatal(`Schedule '${id}' not found. Run 'squad schedule list' to see available schedules.`);
  }

  info(`Running schedule: ${entry.name} (${entry.id})...`);

  const provider = new mod.LocalPollingProvider();
  const state = await mod.loadState(statePath);

  state.runs[id] = {
    lastRun: new Date().toISOString(),
    status: 'running',
  };
  await mod.saveState(statePath, state);

  const result = await mod.executeTask(entry, provider);

  state.runs[id] = {
    lastRun: new Date().toISOString(),
    status: result.success ? 'success' : 'failure',
    error: result.error,
  };
  await mod.saveState(statePath, state);

  if (result.success) {
    success(`${entry.name} completed`);
    if (result.output) {
      secondary(`  ${result.output}`);
    }
  } else {
    console.error(`${RED}✗${RESET} ${entry.name} failed: ${result.error ?? 'unknown error'}`);
  }
}

// ============================================================================
// Subcommand: init
// ============================================================================

async function scheduleInit(cwd: string): Promise<void> {
  const schedulePath = resolveSchedulePath(cwd);
  const mod = await loadSchedulerModule();

  if (fs.existsSync(schedulePath)) {
    warn(`schedule.json already exists at ${schedulePath}`);
    return;
  }

  const squadInfo = detectSquadDir(cwd);
  if (!fs.existsSync(squadInfo.path)) {
    fs.mkdirSync(squadInfo.path, { recursive: true });
  }

  const template = mod.defaultScheduleTemplate();
  fs.writeFileSync(schedulePath, JSON.stringify(template, null, 2) + '\n', 'utf8');
  success(`Created ${path.relative(cwd, schedulePath)}`);
  info(`Edit it to configure your scheduled tasks, then run 'squad schedule list' to verify.`);
}

// ============================================================================
// Subcommand: status
// ============================================================================

async function scheduleStatus(cwd: string): Promise<void> {
  const schedulePath = resolveSchedulePath(cwd);
  const statePath = resolveStatePath(cwd);
  const mod = await loadSchedulerModule();

  let manifest: ScheduleManifest;
  try {
    manifest = await mod.parseSchedule(schedulePath);
  } catch {
    fatal(`No schedule.json found — run 'squad schedule init' to create one`);
  }

  const state = await mod.loadState(statePath);
  const now = new Date();

  console.log(`\n${BOLD}Schedule Status${RESET}  (${now.toISOString()})\n`);

  for (const entry of manifest.schedules) {
    const run = state.runs[entry.id];
    const statusIcon = !run
      ? `${GRAY}–${RESET} never run`
      : run.status === 'success'
        ? `${GREEN}✓${RESET} success`
        : run.status === 'running'
          ? `${YELLOW}⟳${RESET} running`
          : `${RED}✗${RESET} failure`;

    const lastRunStr = run ? `last: ${run.lastRun}` : 'last: –';
    const enabledStr = entry.enabled ? '' : ` ${DIM}(disabled)${RESET}`;

    console.log(`  ${BOLD}${entry.id}${RESET}${enabledStr}`);
    console.log(`    ${statusIcon}  │  ${lastRunStr}`);
    if (run?.error) {
      console.log(`    ${RED}error: ${run.error}${RESET}`);
    }
    console.log('');
  }

  // Show which are due
  const due = mod.evaluateSchedule(manifest, state, now);
  if (due.length > 0) {
    console.log(`${YELLOW}⚡${RESET} ${due.length} schedule(s) due now: ${due.map(d => d.id).join(', ')}`);
  } else {
    secondary('No schedules due at this time.');
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatTrigger(entry: ScheduleEntry): string {
  const trigger = entry.trigger;
  switch (trigger.type) {
    case 'cron':
      return `cron: ${trigger.cron}`;
    case 'interval':
      return `every ${trigger.intervalSeconds}s`;
    case 'event':
      return `on: ${trigger.event}`;
    case 'startup':
      return 'on startup';
    default:
      return 'unknown trigger';
  }
}
