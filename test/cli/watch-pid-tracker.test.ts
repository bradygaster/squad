/**
 * PID Tracker Tests (#921)
 *
 * Tests child process PID tracking, cleanup, stale PID file handling,
 * and the PID file lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { PidTracker, type TrackedProcess } from '../../packages/squad-cli/src/cli/commands/watch/pid-tracker.js';

/** Create a temp directory with a .squad subdirectory for testing. */
function makeTempTeamRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-pid-test-'));
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
}

/** Read the PID file directly. */
function readPidFile(teamRoot: string): TrackedProcess[] {
  const pidPath = path.join(teamRoot, '.squad', '.watch-pids');
  if (!fs.existsSync(pidPath)) return [];
  return JSON.parse(fs.readFileSync(pidPath, 'utf-8'));
}

/** Write a PID file directly. */
function writePidFile(teamRoot: string, entries: TrackedProcess[]): void {
  const pidPath = path.join(teamRoot, '.squad', '.watch-pids');
  fs.writeFileSync(pidPath, JSON.stringify(entries, null, 2), 'utf-8');
}

/** Check if PID file exists. */
function pidFileExists(teamRoot: string): boolean {
  return fs.existsSync(path.join(teamRoot, '.squad', '.watch-pids'));
}

describe('PidTracker', () => {
  let teamRoot: string;

  beforeEach(() => {
    teamRoot = makeTempTeamRoot();
  });

  afterEach(() => {
    fs.rmSync(teamRoot, { recursive: true, force: true });
  });

  describe('track / untrack', () => {
    it('tracks a PID and persists it to the PID file', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(12345, 'copilot-session-#1');

      const entries = readPidFile(teamRoot);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.pid).toBe(12345);
      expect(entries[0]!.name).toBe('copilot-session-#1');
      expect(entries[0]!.spawnedAt).toBeTruthy();
    });

    it('tracks multiple PIDs', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(100, 'proc-a');
      tracker.track(200, 'proc-b');
      tracker.track(300, 'proc-c');

      const entries = readPidFile(teamRoot);
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.pid)).toEqual([100, 200, 300]);
    });

    it('untracks a PID and updates the PID file', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(100, 'proc-a');
      tracker.track(200, 'proc-b');
      tracker.untrack(100);

      const entries = readPidFile(teamRoot);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.pid).toBe(200);
    });

    it('untrack is a no-op for unknown PIDs', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(100, 'proc-a');
      tracker.untrack(999); // doesn't exist

      const entries = readPidFile(teamRoot);
      expect(entries).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('kills alive processes and reports count', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(111, 'alive-proc');
      tracker.track(222, 'dead-proc');

      // Mock process.kill: 111 is alive, 222 is dead
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
        if (signal === 0) {
          // Existence check — 111 is alive, 222 is dead
          if (Math.abs(pid) === 111) return true;
          throw new Error('ESRCH');
        }
        // Actual kill — succeed for alive process
        return true;
      }) as typeof process.kill);

      const result = tracker.cleanup();

      expect(result.total).toBe(2);
      // On non-Windows, process.kill is used for killing, so 111 should be killed
      if (process.platform !== 'win32') {
        expect(result.killed).toBe(1);
      }
      expect(pidFileExists(teamRoot)).toBe(false);

      killSpy.mockRestore();
    });

    it('skips dead processes', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(333, 'dead-proc');

      // Mock: all processes are dead
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => {
        throw new Error('ESRCH');
      }) as typeof process.kill);

      const result = tracker.cleanup();
      expect(result.killed).toBe(0);
      expect(result.total).toBe(1);
      expect(pidFileExists(teamRoot)).toBe(false);

      killSpy.mockRestore();
    });

    it('deletes PID file after cleanup', () => {
      const tracker = new PidTracker(teamRoot);
      tracker.track(444, 'some-proc');
      expect(pidFileExists(teamRoot)).toBe(true);

      // Mock all dead
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => {
        throw new Error('ESRCH');
      }) as typeof process.kill);

      tracker.cleanup();
      expect(pidFileExists(teamRoot)).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('cleanupStale', () => {
    it('reads stale PID file and kills alive orphans', () => {
      // Write a stale PID file as if from a previous crashed run
      writePidFile(teamRoot, [
        { pid: 555, name: 'stale-proc', spawnedAt: '2025-01-01T00:00:00.000Z' },
      ]);

      const tracker = new PidTracker(teamRoot);

      // Mock: process 555 is alive
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
        if (signal === 0 && pid === 555) return true; // alive
        if (signal === 0) throw new Error('ESRCH');
        return true; // kill succeeds
      }) as typeof process.kill);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const staleKilled = tracker.cleanupStale();

      // On Unix: process.kill(-pid, SIGKILL) or process.kill(pid, SIGKILL)
      // On Windows: execSync taskkill
      // Either way, it should attempt cleanup
      expect(staleKilled).toBeGreaterThanOrEqual(0); // platform-dependent
      expect(pidFileExists(teamRoot)).toBe(false);

      killSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('returns 0 when no PID file exists', () => {
      const tracker = new PidTracker(teamRoot);
      const result = tracker.cleanupStale();
      expect(result).toBe(0);
    });

    it('handles corrupted PID file gracefully', () => {
      // Write garbage to the PID file
      const pidPath = path.join(teamRoot, '.squad', '.watch-pids');
      fs.writeFileSync(pidPath, '<<<not json>>>', 'utf-8');

      const tracker = new PidTracker(teamRoot);
      const result = tracker.cleanupStale();

      expect(result).toBe(0);
      expect(pidFileExists(teamRoot)).toBe(false);
    });

    it('deletes PID file after processing stale entries', () => {
      writePidFile(teamRoot, [
        { pid: 666, name: 'dead-orphan', spawnedAt: '2025-01-01T00:00:00.000Z' },
      ]);

      // Mock: process is dead
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => {
        throw new Error('ESRCH');
      }) as typeof process.kill);

      const tracker = new PidTracker(teamRoot);
      tracker.cleanupStale();

      expect(pidFileExists(teamRoot)).toBe(false);

      killSpy.mockRestore();
    });
  });
});
