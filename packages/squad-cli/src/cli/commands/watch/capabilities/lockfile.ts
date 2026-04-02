/**
 * Lockfile utility — per-repo lock with PID, timestamp, and stale detection.
 *
 * Ported from ralph-watch.ps1 lockfile logic.
 * Written BEFORE a round (status=running) and AFTER (status=idle/error).
 * External tools (e.g., squad-monitor) can read this file to know if
 * a watch process is active.
 *
 * This is a utility module — not a WatchCapability.
 */

import path from 'node:path';
import fs from 'node:fs';

export interface LockfileData {
  pid: number;
  status: 'running' | 'idle' | 'error';
  round: number;
  lastRun: string;
  exitCode: number;
  consecutiveFailures: number;
  started: string;
  directory: string;
}

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Acquire a lockfile for this watch process.
 * Returns false if another non-stale process holds the lock.
 */
export function acquireLock(teamRoot: string): boolean {
  const lockPath = getLockPath(teamRoot);

  if (fs.existsSync(lockPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockfileData;
      // Check if the PID is still alive
      if (isProcessAlive(existing.pid)) {
        // Check if it's stale
        const age = Date.now() - new Date(existing.lastRun).getTime();
        if (age < STALE_THRESHOLD_MS) {
          return false; // Another active process holds the lock
        }
        // Stale — we can take over
      }
      // Dead or stale PID — safe to overwrite
    } catch {
      // Corrupt lockfile — overwrite
    }
  }

  writeLock(teamRoot, {
    pid: process.pid,
    status: 'running',
    round: 0,
    lastRun: new Date().toISOString(),
    exitCode: 0,
    consecutiveFailures: 0,
    started: new Date().toISOString(),
    directory: teamRoot,
  });

  return true;
}

/** Update the lockfile with current round state. */
export function updateLock(
  teamRoot: string,
  status: 'running' | 'idle' | 'error',
  round: number,
  exitCode: number = 0,
  consecutiveFailures: number = 0,
): void {
  const lockPath = getLockPath(teamRoot);
  let existing: Partial<LockfileData> = {};
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch { /* use defaults */ }

  writeLock(teamRoot, {
    pid: process.pid,
    status,
    round,
    lastRun: new Date().toISOString(),
    exitCode,
    consecutiveFailures,
    started: (existing as LockfileData).started ?? new Date().toISOString(),
    directory: teamRoot,
  });
}

/** Release the lockfile on shutdown. */
export function releaseLock(teamRoot: string): void {
  const lockPath = getLockPath(teamRoot);
  try {
    if (fs.existsSync(lockPath)) {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockfileData;
      if (data.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch { /* best-effort */ }
}

function getLockPath(teamRoot: string): string {
  return path.join(teamRoot, '.ralph-watch.lock');
}

function writeLock(teamRoot: string, data: LockfileData): void {
  try {
    fs.writeFileSync(getLockPath(teamRoot), JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* best-effort */ }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
