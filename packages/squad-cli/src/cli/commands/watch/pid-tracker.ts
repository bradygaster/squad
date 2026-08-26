/**
 * Tracks child process PIDs spawned during watch rounds.
 * Enables cleanup of orphaned processes on exit or restart.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { YELLOW, DIM, RESET } from '../../core/output.js';

export interface TrackedProcess {
  pid: number;
  name: string;
  spawnedAt: string; // ISO 8601
}

// How far a live process's actual start time may drift from the tracked
// spawnedAt before we treat the PID as reused by an unrelated process.
// Generous enough to absorb spawn/scheduling delay and OS timestamp
// resolution, tight enough to catch reboot/PID-wraparound reuse (which
// shows up as minutes-to-months of drift, not seconds).
const IDENTITY_TOLERANCE_MS = 5 * 60 * 1000;

export class PidTracker {
  private readonly pidFile: string;
  private tracked: TrackedProcess[] = [];

  constructor(teamRoot: string) {
    this.pidFile = join(teamRoot, '.squad', '.watch-pids');
  }

  /** Add a child PID to tracking. */
  track(pid: number, name: string): void {
    this.tracked.push({ pid, name, spawnedAt: new Date().toISOString() });
    this.save();
  }

  /** Remove a PID from tracking (process exited normally). */
  untrack(pid: number): void {
    this.tracked = this.tracked.filter(p => p.pid !== pid);
    this.save();
  }

  /** Check if a process is still alive. */
  private isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // signal 0 = existence check, doesn't kill
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Look up a live process's actual start time from the OS. Returns null if
   * it can't be determined (command unavailable, PID gone, unparsable output).
   */
  private getProcessStartTime(pid: number): Date | null {
    try {
      if (process.platform === 'win32') {
        const out = execFileSync(
          'wmic',
          ['process', 'where', `ProcessId=${pid}`, 'get', 'CreationDate', '/value'],
          { encoding: 'utf-8', timeout: 5000 },
        );
        // WMI CIM_DATETIME: yyyyMMddHHmmss.ffffff(+|-)UUU, where UUU is the
        // machine's UTC offset in minutes (local = UTC + offset).
        const match = /CreationDate=(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d{6}([+-]\d{3})/.exec(out.toString());
        if (!match) return null;
        const [, y, mo, d, h, mi, s, offsetStr] = match;
        const localAsUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
        const date = new Date(localAsUtcMs - Number(offsetStr) * 60_000);
        return isNaN(date.getTime()) ? null : date;
      }

      const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf-8', timeout: 5000 });
      const date = new Date(out.toString().trim());
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Cross-check a tracked record against the live process before we trust the
   * PID. If the OS's actual start time contradicts the tracked spawnedAt, the
   * PID has almost certainly been reused by an unrelated process — reject it.
   * When the start time can't be determined at all, fail open (matches prior
   * behavior) rather than blocking legitimate cleanup.
   */
  private matchesTrackedIdentity(proc: TrackedProcess): boolean {
    const actualStart = this.getProcessStartTime(proc.pid);
    if (!actualStart) return true;

    const trackedStart = new Date(proc.spawnedAt);
    if (isNaN(trackedStart.getTime())) return true;

    return Math.abs(actualStart.getTime() - trackedStart.getTime()) <= IDENTITY_TOLERANCE_MS;
  }

  /** Kill a process tree. Cross-platform. */
  private killTree(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000 });
      } else {
        // Note: We only kill the direct PID. Grandchild cleanup requires
        // spawning with detached:true, which is controlled by the Execute
        // capability. For now, direct PID kill is the honest approach.
        process.kill(pid, 'SIGKILL');
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Kill all tracked processes and clean up the PID file. */
  cleanup(): { killed: number; total: number } {
    let killed = 0;
    const total = this.tracked.length;

    for (const proc of this.tracked) {
      if (this.isAlive(proc.pid)) {
        if (!this.matchesTrackedIdentity(proc)) {
          console.log(`${YELLOW}⚠️ Skipped killing PID ${proc.pid} (${proc.name}): live process start time doesn't match the tracked record — PID likely reused by another process${RESET}`);
          continue;
        }
        if (this.killTree(proc.pid)) {
          killed++;
        }
      }
    }

    this.tracked = [];
    this.deletePidFile();
    return { killed, total };
  }

  /** On startup: check for stale PID file from a previous crashed run.
   *  Kill any orphans that are still alive. */
  cleanupStale(): number {
    if (!existsSync(this.pidFile)) return 0;

    let staleKilled = 0;
    try {
      const content = readFileSync(this.pidFile, 'utf-8');
      const stale: TrackedProcess[] = JSON.parse(content);

      for (const proc of stale) {
        if (this.isAlive(proc.pid)) {
          if (!this.matchesTrackedIdentity(proc)) {
            console.log(`${YELLOW}⚠️ Skipped killing PID ${proc.pid} (${proc.name}): live process start time doesn't match the tracked record — PID likely reused by another process${RESET}`);
            continue;
          }
          if (this.killTree(proc.pid)) {
            staleKilled++;
            console.log(`${YELLOW}⚠️ Killed orphaned process: ${proc.name} (PID ${proc.pid}, spawned ${proc.spawnedAt})${RESET}`);
          }
        }
      }
    } catch {
      // Corrupted PID file — just delete it
    }

    this.deletePidFile();
    return staleKilled;
  }

  /** Register process exit handlers for cleanup. */
  registerExitHandlers(): void {
    const doCleanup = () => {
      const result = this.cleanup();
      if (result.killed > 0) {
        // Can't use console.log in exit handler reliably, but try
        try {
          console.log(`${DIM}Cleaned up ${result.killed} child process(es)${RESET}`);
        } catch { /* ignore */ }
      }
    };

    process.on('exit', doCleanup);
    process.on('SIGINT', () => { doCleanup(); process.exit(130); });
    process.on('SIGTERM', () => { doCleanup(); process.exit(143); });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      doCleanup();
      process.exit(1);
    });
  }

  private save(): void {
    try {
      writeFileSync(this.pidFile, JSON.stringify(this.tracked, null, 2), 'utf-8');
    } catch { /* ignore — best effort */ }
  }

  private deletePidFile(): void {
    try {
      if (existsSync(this.pidFile)) unlinkSync(this.pidFile);
    } catch { /* ignore */ }
  }
}
