/**
 * Watch Health Check Tests (#808)
 *
 * Tests the health check function: no-instance detection, stale PID cleanup,
 * running status reporting, and PID file I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  getWatchHealth,
  writePidFile,
  removePidFile,
  getPidPath,
  isProcessAlive,
  type WatchPidInfo,
} from '@bradygaster/squad-cli/commands/watch';

/** Create a temp directory with a .squad subdirectory for testing. */
function makeTempTeamRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-health-test-'));
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
}

describe('watch health check', () => {
  let teamRoot: string;

  beforeEach(() => {
    teamRoot = makeTempTeamRoot();
  });

  afterEach(() => {
    fs.rmSync(teamRoot, { recursive: true, force: true });
  });

  it('returns "no instance" when no PID file exists', () => {
    const result = getWatchHealth(teamRoot);
    expect(result).toContain('No watch instance detected');
    expect(result).toContain('squad watch --execute --interval 5');
  });

  it('detects stale PID and cleans up', () => {
    // Write a PID file with a PID that definitely doesn't exist
    const deadPid = 999999999;
    const info: WatchPidInfo = {
      pid: deadPid,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      user: 'test-user',
      interval: 5,
      capabilities: ['self-pull', 'execute'],
      repo: 'owner/repo',
    };
    writePidFile(teamRoot, info);

    // Verify PID file was written
    expect(fs.existsSync(getPidPath(teamRoot))).toBe(true);

    const result = getWatchHealth(teamRoot);
    expect(result).toContain('Stale watch detected');
    expect(result).toContain(String(deadPid));
    expect(result).toContain('Cleaned up');

    // PID file should be removed
    expect(fs.existsSync(getPidPath(teamRoot))).toBe(false);
  });

  it('shows running status when process is alive (this process)', () => {
    // Use our own PID — this process is definitely alive
    const info: WatchPidInfo = {
      pid: process.pid,
      startedAt: new Date(Date.now() - 120_000).toISOString(), // 2 minutes ago
      user: 'test-user',
      interval: 5,
      capabilities: ['self-pull', 'execute', 'board'],
      repo: 'owner/repo',
    };
    writePidFile(teamRoot, info);

    const result = getWatchHealth(teamRoot);
    expect(result).toContain('RUNNING');
    expect(result).toContain(String(process.pid));
    expect(result).toContain('test-user');
    expect(result).toContain('5m');
    expect(result).toContain('owner/repo');
    expect(result).toContain('self-pull, execute, board');
  });

  it('PID file format is valid JSON with required fields', () => {
    const info: WatchPidInfo = {
      pid: 12345,
      startedAt: '2026-04-04T12:00:00Z',
      user: 'alice',
      interval: 10,
      capabilities: ['self-pull'],
      repo: 'alice/project',
    };
    writePidFile(teamRoot, info);

    const raw = fs.readFileSync(getPidPath(teamRoot), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(info);
  });

  it('removePidFile is idempotent (no error when file missing)', () => {
    expect(() => removePidFile(teamRoot)).not.toThrow();
    // Write and remove twice
    writePidFile(teamRoot, {
      pid: 1, startedAt: '', user: '', interval: 1, capabilities: [], repo: '',
    });
    removePidFile(teamRoot);
    expect(() => removePidFile(teamRoot)).not.toThrow();
  });

  it('isProcessAlive returns true for current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('isProcessAlive returns false for non-existent PID', () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });

  it('handles corrupt PID file gracefully', () => {
    fs.writeFileSync(getPidPath(teamRoot), 'not valid json!!!');
    const result = getWatchHealth(teamRoot);
    expect(result).toContain('Corrupt PID file');
  });

  it('handles PID file with missing pid field', () => {
    fs.writeFileSync(getPidPath(teamRoot), JSON.stringify({ user: 'alice' }));
    const result = getWatchHealth(teamRoot);
    expect(result).toContain('Invalid PID file');
  });

  it('reports empty capabilities when none enabled', () => {
    const info: WatchPidInfo = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      user: 'test-user',
      interval: 10,
      capabilities: [],
      repo: 'owner/repo',
    };
    writePidFile(teamRoot, info);

    const result = getWatchHealth(teamRoot);
    expect(result).toContain('(none)');
  });
});
