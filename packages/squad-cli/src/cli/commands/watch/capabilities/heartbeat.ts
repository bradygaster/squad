/**
 * Heartbeat capability — write status JSON every round.
 *
 * Ported from ralph-watch.ps1 `Update-Heartbeat`.
 * Writes to `.squad/ralph-heartbeat.json` every round with:
 *   - round number, status, PID, timestamp
 *   - consecutive failures counter
 *   - duration of last round
 *
 * Also maintains a structured log at `.squad/ralph-watch.log` with rotation.
 *
 * Runs in the `housekeeping` phase.
 *
 * Config (via squad.config.ts → watch.capabilities["heartbeat"]):
 *   heartbeatPath  – override heartbeat file location (default: .squad/ralph-heartbeat.json)
 *   logPath        – override log file location (default: .squad/ralph-watch.log)
 *   maxLogEntries  – max log lines before rotation (default: 500)
 *   maxLogBytes    – max log file size before rotation (default: 1MB)
 */

import path from 'node:path';
import fs from 'node:fs';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

export interface HeartbeatData {
  lastRun: string;
  lastHeartbeat: string;
  round: number;
  status: string;
  exitCode: number;
  durationSeconds: number;
  consecutiveFailures: number;
  pid: number;
}

// Module-level state tracked across rounds
let consecutiveFailures = 0;
let lastRoundStart = Date.now();

export class HeartbeatCapability implements WatchCapability {
  readonly name = 'heartbeat';
  readonly description = 'Write heartbeat JSON and structured log every round';
  readonly configShape = 'object' as const;
  readonly requires = [];
  readonly phase = 'housekeeping' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = context.config as Record<string, unknown>;
    const squadDir = path.join(context.teamRoot, '.squad');
    const heartbeatPath = (config['heartbeatPath'] as string) ?? path.join(squadDir, 'ralph-heartbeat.json');
    const logPath = (config['logPath'] as string) ?? path.join(squadDir, 'ralph-watch.log');
    const maxLogEntries = (config['maxLogEntries'] as number) ?? 500;
    const maxLogBytes = (config['maxLogBytes'] as number) ?? 1_048_576; // 1 MB

    const now = new Date();
    const durationSeconds = Math.round((Date.now() - lastRoundStart) / 1000 * 100) / 100;
    lastRoundStart = Date.now();

    // Write heartbeat
    const heartbeat: HeartbeatData = {
      lastRun: now.toISOString(),
      lastHeartbeat: now.toISOString(),
      round: context.round,
      status: 'idle',
      exitCode: 0,
      durationSeconds,
      consecutiveFailures,
      pid: process.pid,
    };

    try {
      ensureDir(path.dirname(heartbeatPath));
      fs.writeFileSync(heartbeatPath, JSON.stringify(heartbeat, null, 2), 'utf-8');
    } catch { /* best-effort */ }

    // Append structured log entry
    const logEntry = `${now.toISOString()} | Round=${context.round} | Duration=${durationSeconds}s | Failures=${consecutiveFailures} | Status=idle`;
    try {
      ensureDir(path.dirname(logPath));
      fs.appendFileSync(logPath, logEntry + '\n', 'utf-8');
      rotateLog(logPath, maxLogEntries, maxLogBytes);
    } catch { /* best-effort */ }

    return {
      success: true,
      summary: `heartbeat written (round ${context.round})`,
      data: { heartbeatPath, durationSeconds },
    };
  }
}

/** Increment consecutive failure counter (called by the main loop on error). */
export function recordFailure(): void {
  consecutiveFailures++;
}

/** Reset consecutive failure counter (called by the main loop on success). */
export function recordSuccess(): void {
  consecutiveFailures = 0;
}

/** Get current consecutive failure count. */
export function getConsecutiveFailures(): number {
  return consecutiveFailures;
}

/** Mark round start time for duration tracking. */
export function markRoundStart(): void {
  lastRoundStart = Date.now();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function rotateLog(logPath: string, maxEntries: number, maxBytes: number): void {
  try {
    const stat = fs.statSync(logPath);
    let needsRotation = stat.size > maxBytes;

    if (!needsRotation) {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      needsRotation = lines.length > maxEntries;
    }

    if (needsRotation) {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const kept = lines.slice(-Math.max(maxEntries - 1, 1));
      const header = `# Ralph Watch Log — Rotated ${new Date().toISOString()} (kept last ${kept.length} entries)`;
      fs.writeFileSync(logPath, [header, ...kept].join('\n') + '\n', 'utf-8');
    }
  } catch { /* best-effort */ }
}
