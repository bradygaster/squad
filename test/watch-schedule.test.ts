import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), `squad-schedule-cap-test-${Date.now()}`);
const SQUAD_DIR = path.join(TEST_ROOT, '.squad');

import { ScheduleCapability } from '../packages/squad-cli/src/cli/commands/watch/capabilities/schedule.js';
import type { WatchContext } from '../packages/squad-cli/src/cli/commands/watch/types.js';

function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: TEST_ROOT,
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config: {},
    ...overrides,
  };
}

function writeSchedule(schedules: unknown[]): void {
  const manifest = { version: 1, schedules };
  mkdirSync(SQUAD_DIR, { recursive: true });
  writeFileSync(
    path.join(SQUAD_DIR, 'schedule.json'),
    JSON.stringify(manifest, null, 2),
  );
}

function writeState(runs: Record<string, unknown>): void {
  mkdirSync(SQUAD_DIR, { recursive: true });
  writeFileSync(
    path.join(SQUAD_DIR, '.schedule-state.json'),
    JSON.stringify({ runs }, null, 2),
  );
}

function readState(): { runs: Record<string, { lastRun: string; status: string; error?: string }> } {
  const raw = readFileSync(path.join(SQUAD_DIR, '.schedule-state.json'), 'utf8');
  return JSON.parse(raw);
}

beforeEach(() => {
  mkdirSync(SQUAD_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('ScheduleCapability', () => {
  const cap = new ScheduleCapability();

  it('has correct metadata', () => {
    expect(cap.name).toBe('schedule');
    expect(cap.phase).toBe('pre-scan');
    expect(cap.configShape).toBe('object');
  });

  // ── Preflight ────────────────────────────────────────────────

  it('preflight fails when schedule.json is missing', async () => {
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('schedule.json');
  });

  it('preflight fails on invalid JSON', async () => {
    writeFileSync(path.join(SQUAD_DIR, 'schedule.json'), '{ broken }');
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('schedule.json');
  });

  it('preflight fails when no local-polling tasks exist', async () => {
    writeSchedule([
      {
        id: 'remote-only',
        name: 'Remote',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 60 },
        task: { type: 'script', ref: 'echo hi' },
        providers: ['github-actions'],
      },
    ]);
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('No enabled local-polling');
  });

  it('preflight succeeds with valid local-polling schedule', async () => {
    writeSchedule([
      {
        id: 'test-task',
        name: 'Test',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 60 },
        task: { type: 'script', ref: 'echo hello' },
        providers: ['local-polling'],
      },
    ]);
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(true);
  });

  // ── Execute ──────────────────────────────────────────────────

  it('runs a due interval task and persists state', async () => {
    writeSchedule([
      {
        id: 'echo-test',
        name: 'Echo Test',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 1 },
        task: { type: 'script', ref: 'echo schedule-works' },
        providers: ['local-polling'],
      },
    ]);
    // Preflight must be called first (sets paths)
    await cap.preflight(makeContext());
    const result = await cap.execute(makeContext());

    expect(result.success).toBe(true);
    expect(result.summary).toContain('echo-test');

    // State should be persisted
    const state = readState();
    expect(state.runs['echo-test']).toBeDefined();
    expect(state.runs['echo-test']!.status).toBe('success');
  });

  it('reports nothing due when interval has not elapsed', async () => {
    writeSchedule([
      {
        id: 'slow-task',
        name: 'Slow',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 99999 },
        task: { type: 'script', ref: 'echo hi' },
        providers: ['local-polling'],
      },
    ]);
    // Pre-set state as just run
    writeState({
      'slow-task': { lastRun: new Date().toISOString(), status: 'success' },
    });

    await cap.preflight(makeContext());
    const result = await cap.execute(makeContext());

    expect(result.success).toBe(true);
    expect(result.summary).toContain('nothing due');
  });

  it('only runs local-polling tasks, skips github-actions', async () => {
    writeSchedule([
      {
        id: 'local-task',
        name: 'Local',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 1 },
        task: { type: 'script', ref: 'echo local' },
        providers: ['local-polling'],
      },
      {
        id: 'remote-task',
        name: 'Remote',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 1 },
        task: { type: 'script', ref: 'echo remote' },
        providers: ['github-actions'],
      },
    ]);

    await cap.preflight(makeContext());
    const result = await cap.execute(makeContext());

    expect(result.summary).toContain('local-task');
    expect(result.summary).not.toContain('remote-task');
  });

  it('startup trigger fires once then not again', async () => {
    writeSchedule([
      {
        id: 'startup-task',
        name: 'Startup',
        enabled: true,
        trigger: { type: 'startup' },
        task: { type: 'script', ref: 'echo started' },
        providers: ['local-polling'],
      },
    ]);

    // First run — should fire
    await cap.preflight(makeContext());
    const result1 = await cap.execute(makeContext());
    expect(result1.summary).toContain('startup-task');

    // Second run — should not fire (already ran)
    const result2 = await cap.execute(makeContext({ round: 2 }));
    expect(result2.summary).toContain('nothing due');
  });

  it('recovers stale running entries', async () => {
    writeSchedule([
      {
        id: 'stale-task',
        name: 'Stale',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 1 },
        task: { type: 'script', ref: 'echo recovered' },
        providers: ['local-polling'],
      },
    ]);
    // Set state to running from 10 minutes ago (well past 5min threshold)
    const tenMinAgo = new Date(Date.now() - 600_000).toISOString();
    writeState({
      'stale-task': { lastRun: tenMinAgo, status: 'running' },
    });

    await cap.preflight(makeContext());
    const result = await cap.execute(makeContext());

    // Should have recovered the stale entry and re-run
    expect(result.success).toBe(true);
    expect(result.summary).toContain('stale-task');

    const state = readState();
    expect(state.runs['stale-task']!.status).toBe('success');
  });

  it('respects maxPerRound config', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i}`,
      enabled: true,
      trigger: { type: 'interval' as const, intervalSeconds: 1 },
      task: { type: 'script' as const, ref: `echo task-${i}` },
      providers: ['local-polling'],
    }));
    writeSchedule(tasks);

    await cap.preflight(makeContext({ config: { maxPerRound: 2 } }));
    const result = await cap.execute(makeContext({ config: { maxPerRound: 2 } }));

    expect(result.success).toBe(true);
    expect(result.summary).toContain('deferred');
    expect(result.data?.executed).toHaveLength(2);
    expect(result.data?.skipped).toBe(3);
  });
});
