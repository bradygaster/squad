/**
 * Cooperative Rate Pool — shared API call budget across Ralph instances.
 *
 * Ported from ralph-watch.ps1 `New-RatePool` / `Read-RatePool` /
 * `Write-RatePool` / `Update-RatePool` budget coordination logic.
 *
 * Multiple Ralph instances on different machines (or in different
 * terminals) share a single `.squad/ralph-rate-pool.json` file.
 * Advisory file-based locking (read-modify-write with PID stamps)
 * keeps the pool consistent without an external lock manager.
 *
 * Config (via squad.config.ts → watch.ratePool):
 *   maxCallsPerInterval  – max API calls in the window (default: 50)
 *   intervalSeconds      – window length in seconds (default: 600)
 *   poolFile             – override path (default: .squad/ralph-rate-pool.json)
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── Types ────────────────────────────────────────────────────────────

export interface RatePoolConfig {
  maxCallsPerInterval?: number;
  intervalSeconds?: number;
  poolFile?: string;
}

export interface RatePoolMachineEntry {
  lastActive: string;
  pid: number;
  slotsHeld: number;
}

export interface RatePoolState {
  windowStart: string;
  slotsUsed: number;
  maxSlots: number;
  intervalSeconds: number;
  machines: Record<string, RatePoolMachineEntry>;
}

export interface PoolStatus {
  available: boolean;
  slotsUsed: number;
  maxSlots: number;
  remaining: number;
  windowSecondsLeft: number;
  activeMachines: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_MAX_CALLS = 50;
const DEFAULT_INTERVAL_SECONDS = 600; // 10 minutes
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;
const STALE_MACHINE_MS = 30 * 60 * 1000; // 30 minutes

// ── Helpers ──────────────────────────────────────────────────────────

function machineId(): string {
  return `${os.hostname()}-${process.pid}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ── Rate Pool Class ──────────────────────────────────────────────────

export class RatePool {
  private readonly poolPath: string;
  private readonly maxSlots: number;
  private readonly intervalSeconds: number;

  constructor(squadDir: string, config?: RatePoolConfig) {
    this.poolPath =
      config?.poolFile ?? path.join(squadDir, 'ralph-rate-pool.json');
    this.maxSlots = config?.maxCallsPerInterval ?? DEFAULT_MAX_CALLS;
    this.intervalSeconds = config?.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Try to acquire a slot from the shared pool.
   * Returns `true` if a slot was reserved, `false` if budget is exhausted.
   */
  acquireSlot(): boolean {
    const pool = this.read();

    if (pool.slotsUsed >= pool.maxSlots) {
      return false;
    }

    pool.slotsUsed++;
    this.touchMachine(pool, 1);
    this.write(pool);
    return true;
  }

  /**
   * Release a slot back to the pool.
   * Safe to call even if no slot is held (clamps to zero).
   */
  releaseSlot(): void {
    const pool = this.read();
    pool.slotsUsed = Math.max(0, pool.slotsUsed - 1);
    this.touchMachine(pool, -1);
    this.write(pool);
  }

  /** Return a snapshot of the current pool status. */
  getPoolStatus(): PoolStatus {
    const pool = this.read();
    const elapsed = (Date.now() - new Date(pool.windowStart).getTime()) / 1000;
    const windowLeft = Math.max(0, pool.intervalSeconds - elapsed);
    const activeMachines = Object.values(pool.machines).filter(
      (m) => Date.now() - new Date(m.lastActive).getTime() < STALE_MACHINE_MS,
    ).length;

    return {
      available: pool.slotsUsed < pool.maxSlots,
      slotsUsed: pool.slotsUsed,
      maxSlots: pool.maxSlots,
      remaining: Math.max(0, pool.maxSlots - pool.slotsUsed),
      windowSecondsLeft: Math.round(windowLeft),
      activeMachines,
    };
  }

  // ── Persistence ──────────────────────────────────────────────────

  private newPool(): RatePoolState {
    return {
      windowStart: nowISO(),
      slotsUsed: 0,
      maxSlots: this.maxSlots,
      intervalSeconds: this.intervalSeconds,
      machines: {},
    };
  }

  /** Read with retry + window-expiry reset (mirrors Read-RatePool). */
  private read(): RatePoolState {
    if (!fs.existsSync(this.poolPath)) {
      const pool = this.newPool();
      this.write(pool);
      return pool;
    }

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const raw = fs.readFileSync(this.poolPath, 'utf-8');
        const pool = JSON.parse(raw) as RatePoolState;

        // Apply authoritative config (pool file may have been created by
        // another instance with different settings — this instance's config wins)
        pool.maxSlots = this.maxSlots;
        pool.intervalSeconds = this.intervalSeconds;

        // Window expiry check
        const elapsed =
          (Date.now() - new Date(pool.windowStart).getTime()) / 1000;
        if (elapsed >= pool.intervalSeconds) {
          pool.windowStart = nowISO();
          pool.slotsUsed = 0;
          this.pruneStale(pool);
          this.write(pool);
        }

        return pool;
      } catch {
        if (i < MAX_RETRIES - 1) {
          // Busy-wait with escalating backoff (matches PS1 pattern)
          const waitMs = RETRY_BASE_MS * (i + 1);
          const end = Date.now() + waitMs;
          while (Date.now() < end) {
            /* spin */
          }
        }
      }
    }

    // All retries exhausted — create fresh pool
    const pool = this.newPool();
    this.write(pool);
    return pool;
  }

  /** Atomic write: temp file → rename (mirrors Write-RatePool). */
  private write(pool: RatePoolState): void {
    const dir = path.dirname(this.poolPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpFile = `${this.poolPath}.tmp.${process.pid}`;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        fs.writeFileSync(tmpFile, JSON.stringify(pool, null, 2), 'utf-8');
        fs.renameSync(tmpFile, this.poolPath);
        return;
      } catch {
        if (i >= MAX_RETRIES - 1) {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            /* ignore */
          }
        } else {
          const waitMs = RETRY_BASE_MS * (i + 1);
          const end = Date.now() + waitMs;
          while (Date.now() < end) {
            /* spin */
          }
        }
      }
    }
  }

  // ── Machine tracking ─────────────────────────────────────────────

  private touchMachine(pool: RatePoolState, slotDelta: number): void {
    const id = machineId();
    const existing = pool.machines[id];
    const held = Math.max(0, (existing?.slotsHeld ?? 0) + slotDelta);
    pool.machines[id] = {
      lastActive: nowISO(),
      pid: process.pid,
      slotsHeld: held,
    };
  }

  private pruneStale(pool: RatePoolState): void {
    const now = Date.now();
    for (const [id, entry] of Object.entries(pool.machines)) {
      if (now - new Date(entry.lastActive).getTime() > STALE_MACHINE_MS) {
        delete pool.machines[id];
      }
    }
  }
}
