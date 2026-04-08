/**
 * Tracks child process PIDs spawned during watch rounds.
 * Enables cleanup of orphaned processes on exit or restart.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { GREEN, YELLOW, DIM, RESET } from '../../core/output.js';

export interface TrackedProcess {
  pid: number;
  name: string;
  spawnedAt: string; // ISO 8601
}

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

  /** Kill a process tree. Cross-platform. */
  private killTree(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
      } else {
        // Try process group kill first, fall back to single PID
        try {
          process.kill(-pid, 'SIGKILL'); // negative PID = process group
        } catch {
          process.kill(pid, 'SIGKILL');
        }
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
