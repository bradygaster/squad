/**
 * Watch health check — reports status of a running watch instance.
 *
 * Reads the PID file (stored in OS temp dir) written at watch startup to
 * determine whether a watch process is alive, its uptime, auth account, and
 * whether auth has drifted since launch.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Shape of the PID file written by runWatch at startup. */
export interface WatchPidInfo {
  pid: number;
  startedAt: string;
  user: string;
  interval: number;
  capabilities: string[];
  repo: string;
}

/**
 * Path to the PID file in the OS temp directory.
 * Uses an MD5 hash of the repo path so different clones/worktrees get
 * unique PID files without polluting the repo (avoids accidental commits).
 */
export function getPidPath(teamRoot: string): string {
  const hash = crypto.createHash('md5').update(teamRoot).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `squad-watch-${hash}.json`);
}

/**
 * Write the PID file at watch startup.
 * The caller is responsible for registering exit handlers to clean up.
 */
export function writePidFile(teamRoot: string, info: WatchPidInfo): void {
  const pidPath = getPidPath(teamRoot);
  fs.writeFileSync(pidPath, JSON.stringify(info, null, 2));
}

/** Remove the PID file (best-effort, swallows errors). */
export function removePidFile(teamRoot: string): void {
  try { fs.unlinkSync(getPidPath(teamRoot)); } catch { /* already gone */ }
}

/**
 * Check if a process with the given PID is still alive.
 * Uses `process.kill(pid, 0)` — signal 0 tests existence without killing.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Format a duration in milliseconds to a human-readable string. */
function formatUptime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Returns the currently active `gh` account, or undefined.
 * Duplicated from index.ts to avoid circular imports — the canonical
 * version lives in `getActiveGhUser()` in the watch index.
 */
function probeCurrentGhUser(): string | undefined {
  try {
    const result = execFileSync('gh', ['auth', 'status', '--active'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = result.match(/account\s+(\S+)/);
    return match?.[1];
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    const match = stderr.match(/account\s+(\S+)/);
    return match?.[1];
  }
}

/**
 * Run the watch health check and return a formatted status string.
 *
 * @param teamRoot - The repository root (directory containing `.squad/`).
 */
export function getWatchHealth(teamRoot: string): string {
  const pidPath = getPidPath(teamRoot);

  if (!fs.existsSync(pidPath)) {
    return '📋 No watch instance detected.\n   Start one with: squad watch --execute --interval 5';
  }

  let info: WatchPidInfo;
  try {
    info = JSON.parse(fs.readFileSync(pidPath, 'utf-8')) as WatchPidInfo;
  } catch {
    return `⚠ Corrupt PID file — cannot read watch status.\n   Delete ${pidPath} and restart.`;
  }

  // Validate minimal fields
  if (typeof info.pid !== 'number') {
    return `⚠ Invalid PID file (missing pid).\n   Delete ${pidPath} and restart.`;
  }

  // Check if the process is actually running
  if (!isProcessAlive(info.pid)) {
    // Stale PID file — process died without cleanup
    removePidFile(teamRoot);
    return `⚠ Stale watch detected (PID ${info.pid} is dead). Cleaned up.\n   Restart with: squad watch --execute --interval 5`;
  }

  // Process is alive — build status report
  const uptime = formatUptime(Date.now() - new Date(info.startedAt).getTime());

  const lines = [
    '🔄 Watch Instance — RUNNING',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `  PID:           ${info.pid}`,
    `  Uptime:        ${uptime}`,
    `  Auth:          ${info.user}`,
    `  Interval:      ${info.interval}m`,
    `  Repo:          ${info.repo}`,
    `  Capabilities:  ${(info.capabilities ?? []).join(', ') || '(none)'}`,
  ];

  // Auth drift detection — compare current gh user vs recorded
  const currentUser = probeCurrentGhUser();
  if (currentUser && currentUser !== info.user) {
    lines.push(`  ⚠ AUTH DRIFT:   Expected ${info.user}, current is ${currentUser}`);
  } else if (currentUser) {
    lines.push('  Auth status:   ✓ matches expected');
  } else {
    lines.push('  Auth status:   ? could not verify');
  }

  return lines.join('\n');
}
