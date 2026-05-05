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
import { spawnSync } from 'node:child_process';
import { createPlatformAdapter, type PlatformAdapter } from '@bradygaster/squad-sdk/platform';

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
  } catch (e: unknown) {
    // EPERM means the process exists but we lack permission to signal it
    if (e && typeof e === 'object' && 'code' in e && (e as NodeJS.ErrnoException).code === 'EPERM') {
      return true;
    }
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
 * Returns the currently active platform user, or undefined.
 */
function probeCurrentUser(adapter: PlatformAdapter): string | undefined {
  if (adapter.type !== 'github') return undefined;

  // TODO(W8): needs PlatformAdapter.getCurrentUser().
  try {
    const result = spawnSync('gh', ['api', 'user', '-q', '.login'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const login = (result.stdout ?? '').trim();
    if (login && result.status === 0) return login;
    return undefined;
  } catch {
    return undefined;
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
  // Validate startedAt before computing uptime
  if (!info.startedAt || isNaN(new Date(info.startedAt).getTime())) {
    return `⚠ Invalid PID file (bad startedAt).
   Delete ${pidPath} and restart.`;
  }
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

  try {
    const adapter = createPlatformAdapter(teamRoot);
    const currentUser = probeCurrentUser(adapter);
    if (adapter.type !== 'github') {
      lines.push(`  Auth status:   not checked for ${adapter.type}`);
    } else if (currentUser && currentUser !== info.user) {
      lines.push(`  ⚠ AUTH DRIFT:   Expected ${info.user}, current is ${currentUser}`);
    } else if (currentUser) {
      lines.push('  Auth status:   ✓ matches expected');
    } else {
      lines.push('  Auth status:   ? could not verify');
    }
  } catch {
    lines.push('  Auth status:   ? could not verify');
  }

  return lines.join('\n');
}
