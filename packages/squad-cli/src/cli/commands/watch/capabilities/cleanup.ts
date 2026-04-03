/**
 * Cleanup capability — housekeeping for stale temp and log files.
 *
 * Runs in the 'housekeeping' phase. Clears the scratch directory, archives
 * old orchestration-log and session-log entries, and warns about stale
 * decision inbox files.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const storage = new FSStorageProvider();

/** Default: files older than this many days are archived / deleted. */
const DEFAULT_MAX_AGE_DAYS = 30;
/** Default: run cleanup every N rounds (not every round). */
const DEFAULT_EVERY_N_ROUNDS = 10;
/** Stale inbox warning threshold (days). */
const STALE_INBOX_DAYS = 7;

interface CleanupConfig {
  /** Run cleanup every N rounds (default: 10). */
  everyNRounds?: number;
  /** Max age in days for log/orchestration files before archival (default: 30). */
  maxAgeDays?: number;
}

function parseConfig(raw: Record<string, unknown>): CleanupConfig {
  return {
    everyNRounds: typeof raw.everyNRounds === 'number' ? raw.everyNRounds : DEFAULT_EVERY_N_ROUNDS,
    maxAgeDays: typeof raw.maxAgeDays === 'number' ? raw.maxAgeDays : DEFAULT_MAX_AGE_DAYS,
  };
}

function isOlderThan(filename: string, days: number): boolean {
  // Filenames may start with ISO timestamp: 2026-04-01T12-00-00Z-agent.md
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return false;
  const fileDate = new Date(match[1]!);
  if (isNaN(fileDate.getTime())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return fileDate < cutoff;
}

function safeList(dir: string): string[] {
  try {
    if (!storage.existsSync(dir)) return [];
    return storage.listSync?.(dir) ?? [];
  } catch {
    return [];
  }
}

function safeDelete(filePath: string): boolean {
  try {
    storage.deleteSync?.(filePath);
    return true;
  } catch {
    return false;
  }
}

export class CleanupCapability implements WatchCapability {
  readonly name = 'cleanup';
  readonly description = 'Remove stale scratch files, archive old logs, warn about stale inbox';
  readonly configShape = 'object' as const;
  readonly requires: string[] = [];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    const squadDir = path.join(context.teamRoot, '.squad');
    if (!storage.existsSync(squadDir)) {
      return { ok: false, reason: '.squad/ directory not found' };
    }
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = parseConfig(context.config);
    const everyN = config.everyNRounds ?? DEFAULT_EVERY_N_ROUNDS;

    // Only run on every Nth round (or round 1 for immediate feedback)
    if (context.round > 1 && context.round % everyN !== 0) {
      return { success: true, summary: `cleanup: skipped (runs every ${everyN} rounds)` };
    }

    const squadDir = path.join(context.teamRoot, '.squad');
    const maxAge = config.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
    const actions: string[] = [];

    // 1. Clear .squad/.scratch/ — everything in here is ephemeral
    const scratchDir = path.join(squadDir, '.scratch');
    const scratchFiles = safeList(scratchDir);
    let scratchDeleted = 0;
    for (const f of scratchFiles) {
      if (safeDelete(path.join(scratchDir, f))) scratchDeleted++;
    }
    if (scratchDeleted > 0) {
      actions.push(`scratch: ${scratchDeleted} files cleared`);
    }

    // 2. Archive old orchestration-log entries (older than maxAge days)
    const orchDir = path.join(squadDir, 'orchestration-log');
    const orchFiles = safeList(orchDir);
    let orchArchived = 0;
    for (const f of orchFiles) {
      if (isOlderThan(f, maxAge)) {
        if (safeDelete(path.join(orchDir, f))) orchArchived++;
      }
    }
    if (orchArchived > 0) {
      actions.push(`orchestration-log: ${orchArchived} entries archived (>${maxAge}d)`);
    }

    // 3. Archive old session logs
    const logDir = path.join(squadDir, 'log');
    const logFiles = safeList(logDir);
    let logArchived = 0;
    for (const f of logFiles) {
      if (isOlderThan(f, maxAge)) {
        if (safeDelete(path.join(logDir, f))) logArchived++;
      }
    }
    if (logArchived > 0) {
      actions.push(`log: ${logArchived} entries archived (>${maxAge}d)`);
    }

    // 4. Warn about stale decision inbox files
    const inboxDir = path.join(squadDir, 'decisions', 'inbox');
    const inboxFiles = safeList(inboxDir).filter(f => f.endsWith('.md'));
    const staleInbox = inboxFiles.filter(f => isOlderThan(f, STALE_INBOX_DAYS));
    if (staleInbox.length > 0) {
      actions.push(`⚠ ${staleInbox.length} stale inbox files (>${STALE_INBOX_DAYS}d)`);
    }

    if (actions.length === 0) {
      return { success: true, summary: 'cleanup: nothing to do' };
    }

    return {
      success: true,
      summary: `cleanup: ${actions.join('; ')}`,
      data: { scratchDeleted, orchArchived, logArchived, staleInboxCount: staleInbox.length },
    };
  }
}
