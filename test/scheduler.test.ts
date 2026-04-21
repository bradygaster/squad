import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateManifest,
  parseSchedule,
  evaluateSchedule,
  executeTask,
  isCronDue,
  loadState,
  saveState,
  defaultScheduleTemplate,
  LocalPollingProvider,
  GitHubActionsProvider,
  ScheduleValidationError,
} from '../packages/squad-sdk/src/runtime/scheduler.js';
import type {
  ScheduleManifest,
  ScheduleEntry,
  ScheduleState,
  ScheduleProvider,
  RunRecord,
  TaskResult,
} from '../packages/squad-sdk/src/runtime/scheduler.js';

// ============================================================================
// Test Helpers
// ============================================================================

function validManifest(overrides?: Partial<ScheduleManifest>): ScheduleManifest {
  return {
    version: 1,
    schedules: [
      {
        id: 'test-task',
        name: 'Test Task',
        enabled: true,
        trigger: { type: 'interval', intervalSeconds: 60 },
        task: { type: 'script', ref: 'echo hello' },
        providers: ['local-polling'],
      },
    ],
    ...overrides,
  };
}

function validEntry(overrides?: Partial<ScheduleEntry>): ScheduleEntry {
  return {
    id: 'test-task',
    name: 'Test Task',
    enabled: true,
    trigger: { type: 'interval', intervalSeconds: 60 },
    task: { type: 'script', ref: 'echo hello' },
    providers: ['local-polling'],
    ...overrides,
  };
}

function emptyState(): ScheduleState {
  return { runs: {} };
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Scheduler: Schema Validation', () => {
  it('should accept a valid manifest', () => {
    const manifest = validManifest();
    expect(() => validateManifest(manifest)).not.toThrow();
    const result = validateManifest(manifest);
    expect(result.version).toBe(1);
    expect(result.schedules).toHaveLength(1);
  });

  it('should reject null input', () => {
    expect(() => validateManifest(null)).toThrow(ScheduleValidationError);
    expect(() => validateManifest(null)).toThrow('must be a JSON object');
  });

  it('should reject non-object input', () => {
    expect(() => validateManifest('not an object')).toThrow(ScheduleValidationError);
    expect(() => validateManifest(42)).toThrow(ScheduleValidationError);
  });

  it('should reject missing version field', () => {
    expect(() => validateManifest({ schedules: [] })).toThrow('positive integer "version"');
  });

  it('should reject version < 1', () => {
    expect(() => validateManifest({ version: 0, schedules: [] })).toThrow('positive integer "version"');
  });

  it('should reject missing schedules array', () => {
    expect(() => validateManifest({ version: 1 })).toThrow('"schedules" array');
  });

  it('should reject entry with empty id', () => {
    const manifest = validManifest({
      schedules: [{ ...validEntry(), id: '' }],
    });
    expect(() => validateManifest(manifest)).toThrow('id must be a non-empty string');
  });

  it('should reject duplicate schedule ids', () => {
    const manifest = validManifest({
      schedules: [validEntry({ id: 'dup' }), validEntry({ id: 'dup', name: 'Other' })],
    });
    expect(() => validateManifest(manifest)).toThrow('Duplicate schedule id: "dup"');
  });

  it('should reject entry missing enabled boolean', () => {
    const entry = { ...validEntry(), enabled: 'yes' } as unknown;
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'enabled must be a boolean',
    );
  });

  it('should reject invalid trigger type', () => {
    const entry = { ...validEntry(), trigger: { type: 'magic' } } as unknown;
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'trigger.type must be one of',
    );
  });

  it('should reject cron trigger without cron string', () => {
    const entry = validEntry({ trigger: { type: 'cron', cron: '' } });
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'trigger.cron must be a non-empty string',
    );
  });

  it('should reject interval trigger with non-positive value', () => {
    const entry = validEntry({
      trigger: { type: 'interval', intervalSeconds: -5 },
    });
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'trigger.intervalSeconds must be a positive number',
    );
  });

  it('should reject invalid task type', () => {
    const entry = {
      ...validEntry(),
      task: { type: 'invalid', ref: 'x' },
    } as unknown;
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'task.type must be one of',
    );
  });

  it('should reject task with empty ref', () => {
    const entry = validEntry({
      task: { type: 'script', ref: '' },
    });
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'task.ref must be a non-empty string',
    );
  });

  it('should reject empty providers array', () => {
    const entry = validEntry({ providers: [] });
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'providers must be a non-empty array',
    );
  });

  it('should accept valid retry config', () => {
    const entry = validEntry({
      retry: { maxRetries: 3, backoffSeconds: 5 },
    });
    const result = validateManifest({ version: 1, schedules: [entry] });
    expect(result.schedules[0]!.retry).toEqual({ maxRetries: 3, backoffSeconds: 5 });
  });

  it('should reject retry with negative maxRetries', () => {
    const entry = validEntry({
      retry: { maxRetries: -1, backoffSeconds: 5 },
    });
    expect(() => validateManifest({ version: 1, schedules: [entry] })).toThrow(
      'retry.maxRetries must be a non-negative number',
    );
  });

  it('should accept an empty schedules array', () => {
    const result = validateManifest({ version: 1, schedules: [] });
    expect(result.schedules).toHaveLength(0);
  });

  it('should accept all trigger types', () => {
    const schedules = [
      validEntry({ id: 'cron', trigger: { type: 'cron', cron: '*/5 * * * *' } }),
      validEntry({ id: 'interval', trigger: { type: 'interval', intervalSeconds: 30 } }),
      validEntry({ id: 'event', trigger: { type: 'event', event: 'push' } }),
      validEntry({ id: 'startup', trigger: { type: 'startup' } }),
    ];
    const result = validateManifest({ version: 1, schedules });
    expect(result.schedules).toHaveLength(4);
  });

  it('should accept all task types', () => {
    const schedules = [
      validEntry({ id: 'wf', task: { type: 'workflow', ref: '.github/workflows/x.yml' } }),
      validEntry({ id: 'sc', task: { type: 'script', ref: 'echo hi' } }),
      validEntry({ id: 'cp', task: { type: 'copilot', ref: 'review' } }),
      validEntry({ id: 'wh', task: { type: 'webhook', ref: 'https://example.com/hook' } }),
    ];
    const result = validateManifest({ version: 1, schedules });
    expect(result.schedules).toHaveLength(4);
  });
});

// ============================================================================
// Trigger Evaluation Tests
// ============================================================================

describe('Scheduler: Trigger Evaluation', () => {
  it('should return all enabled entries when never run (interval)', () => {
    const manifest = validManifest();
    const state = emptyState();
    const due = evaluateSchedule(manifest, state);
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe('test-task');
  });

  it('should skip disabled entries', () => {
    const manifest = validManifest({
      schedules: [validEntry({ enabled: false })],
    });
    const due = evaluateSchedule(manifest, emptyState());
    expect(due).toHaveLength(0);
  });

  it('should skip entries that are currently running', () => {
    const manifest = validManifest();
    const state: ScheduleState = {
      runs: {
        'test-task': { lastRun: new Date().toISOString(), status: 'running' },
      },
    };
    const due = evaluateSchedule(manifest, state);
    expect(due).toHaveLength(0);
  });

  it('should return interval entry when enough time has elapsed', () => {
    const now = new Date('2025-01-15T12:05:00Z');
    const lastRun = new Date('2025-01-15T12:00:00Z'); // 5 minutes ago = 300s
    const manifest = validManifest({
      schedules: [validEntry({ trigger: { type: 'interval', intervalSeconds: 300 } })],
    });
    const state: ScheduleState = {
      runs: { 'test-task': { lastRun: lastRun.toISOString(), status: 'success' } },
    };
    const due = evaluateSchedule(manifest, state, now);
    expect(due).toHaveLength(1);
  });

  it('should not return interval entry when not enough time has elapsed', () => {
    const now = new Date('2025-01-15T12:02:00Z');
    const lastRun = new Date('2025-01-15T12:00:00Z'); // 2 minutes ago = 120s
    const manifest = validManifest({
      schedules: [validEntry({ trigger: { type: 'interval', intervalSeconds: 300 } })],
    });
    const state: ScheduleState = {
      runs: { 'test-task': { lastRun: lastRun.toISOString(), status: 'success' } },
    };
    const due = evaluateSchedule(manifest, state, now);
    expect(due).toHaveLength(0);
  });

  it('should return startup entry only when never run', () => {
    const entry = validEntry({ trigger: { type: 'startup' } });
    const manifest = validManifest({ schedules: [entry] });

    // Never run → due
    expect(evaluateSchedule(manifest, emptyState())).toHaveLength(1);

    // Already run → not due
    const state: ScheduleState = {
      runs: { 'test-task': { lastRun: new Date().toISOString(), status: 'success' } },
    };
    expect(evaluateSchedule(manifest, state)).toHaveLength(0);
  });

  it('should not return event trigger entries (they are externally fired)', () => {
    const entry = validEntry({ trigger: { type: 'event', event: 'push' } });
    const manifest = validManifest({ schedules: [entry] });
    expect(evaluateSchedule(manifest, emptyState())).toHaveLength(0);
  });
});

// ============================================================================
// Cron Evaluation Tests
// ============================================================================

describe('Scheduler: Cron Evaluation', () => {
  it('should match wildcard cron (* * * * *) to any time', () => {
    const now = new Date('2025-06-15T14:30:00Z');
    expect(isCronDue('* * * * *', undefined, now)).toBe(true);
  });

  it('should match specific minute', () => {
    const now = new Date('2025-06-15T14:30:00Z'); // minute=30
    expect(isCronDue('30 * * * *', undefined, now)).toBe(true);
    expect(isCronDue('15 * * * *', undefined, now)).toBe(false);
  });

  it('should match step syntax (*/5)', () => {
    const at0 = new Date('2025-06-15T14:00:00Z');  // minute=0 → 0%5=0 ✓
    const at3 = new Date('2025-06-15T14:03:00Z');  // minute=3 → 3%5≠0 ✗
    const at10 = new Date('2025-06-15T14:10:00Z'); // minute=10 → 10%5=0 ✓
    expect(isCronDue('*/5 * * * *', undefined, at0)).toBe(true);
    expect(isCronDue('*/5 * * * *', undefined, at3)).toBe(false);
    expect(isCronDue('*/5 * * * *', undefined, at10)).toBe(true);
  });

  it('should match comma-separated values', () => {
    const at15 = new Date('2025-06-15T14:15:00Z');
    const at45 = new Date('2025-06-15T14:45:00Z');
    const at20 = new Date('2025-06-15T14:20:00Z');
    expect(isCronDue('15,45 * * * *', undefined, at15)).toBe(true);
    expect(isCronDue('15,45 * * * *', undefined, at45)).toBe(true);
    expect(isCronDue('15,45 * * * *', undefined, at20)).toBe(false);
  });

  it('should not run again within the same minute', () => {
    const now = new Date('2025-06-15T14:30:00Z');
    const run: RunRecord = { lastRun: '2025-06-15T14:30:15Z', status: 'success' };
    expect(isCronDue('30 * * * *', run, now)).toBe(false);
  });

  it('should reject invalid cron expressions', () => {
    const now = new Date('2025-06-15T14:30:00Z');
    expect(isCronDue('bad cron', undefined, now)).toBe(false);
    expect(isCronDue('* *', undefined, now)).toBe(false);
  });
});

// ============================================================================
// Task Execution Tests
// ============================================================================

describe('Scheduler: Task Execution', () => {
  it('should execute with provider and return result', async () => {
    const mockProvider: ScheduleProvider = {
      name: 'mock',
      execute: vi.fn().mockResolvedValue({ success: true, output: 'done' }),
    };

    const entry = validEntry();
    const result = await executeTask(entry, mockProvider);

    expect(result.success).toBe(true);
    expect(result.output).toBe('done');
    expect(mockProvider.execute).toHaveBeenCalledWith(entry);
  });

  it('should retry on failure when retry is configured', async () => {
    const mockProvider: ScheduleProvider = {
      name: 'mock',
      execute: vi
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'fail 1' })
        .mockResolvedValueOnce({ success: false, error: 'fail 2' })
        .mockResolvedValueOnce({ success: true, output: 'ok' }),
    };

    const entry = validEntry({
      retry: { maxRetries: 2, backoffSeconds: 0.01 },
    });
    const result = await executeTask(entry, mockProvider);

    expect(result.success).toBe(true);
    expect(mockProvider.execute).toHaveBeenCalledTimes(3);
  });

  it('should return last failure if all retries exhausted', async () => {
    const mockProvider: ScheduleProvider = {
      name: 'mock',
      execute: vi.fn().mockResolvedValue({ success: false, error: 'always fails' }),
    };

    const entry = validEntry({
      retry: { maxRetries: 1, backoffSeconds: 0.01 },
    });
    const result = await executeTask(entry, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toBe('always fails');
    expect(mockProvider.execute).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('should handle provider throwing an exception', async () => {
    const mockProvider: ScheduleProvider = {
      name: 'mock',
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const entry = validEntry();
    const result = await executeTask(entry, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});

// ============================================================================
// Provider Tests
// ============================================================================

describe('Scheduler: LocalPollingProvider', () => {
  it('should execute script tasks', async () => {
    const provider = new LocalPollingProvider();
    const entry = validEntry({
      task: { type: 'script', ref: 'echo hello-from-scheduler' },
    });
    const result = await provider.execute(entry);
    expect(result.success).toBe(true);
    expect(result.output).toContain('hello-from-scheduler');
  });

  it('should return stub output for workflow tasks', async () => {
    const provider = new LocalPollingProvider();
    const entry = validEntry({
      task: { type: 'workflow', ref: '.github/workflows/test.yml' },
    });
    const result = await provider.execute(entry);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Workflow');
  });

  it('should return stub output for copilot tasks', async () => {
    const provider = new LocalPollingProvider();
    const entry = validEntry({
      task: { type: 'copilot', ref: 'review' },
    });
    const result = await provider.execute(entry);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Copilot');
  });

  it('should handle script execution failure', async () => {
    const provider = new LocalPollingProvider();
    const entry = validEntry({
      task: { type: 'script', ref: 'exit 1' },
    });
    const result = await provider.execute(entry);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Scheduler: GitHubActionsProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate workflow YAML for cron triggers', async () => {
    const provider = new GitHubActionsProvider();
    const manifest = validManifest({
      schedules: [
        validEntry({
          id: 'daily-check',
          trigger: { type: 'cron', cron: '0 9 * * *' },
          providers: ['github-actions'],
        }),
      ],
    });

    const files = await provider.generate!(manifest, tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('squad-schedule-daily-check.yml');

    const content = fs.readFileSync(files[0]!, 'utf8');
    expect(content).toContain("cron: '0 9 * * *'");
    expect(content).toContain('Squad: Test Task');
    expect(content).toContain('Auto-generated by Squad Scheduler');
  });

  it('should generate workflow YAML for interval triggers (converted to cron)', async () => {
    const provider = new GitHubActionsProvider();
    const manifest = validManifest({
      schedules: [
        validEntry({
          id: 'heartbeat',
          trigger: { type: 'interval', intervalSeconds: 300 },
          providers: ['github-actions'],
        }),
      ],
    });

    const files = await provider.generate!(manifest, tmpDir);
    expect(files).toHaveLength(1);

    const content = fs.readFileSync(files[0]!, 'utf8');
    expect(content).toContain('*/5 * * * *'); // 300s = 5 minutes
  });

  it('should skip disabled entries and non-github-actions providers', async () => {
    const provider = new GitHubActionsProvider();
    const manifest = validManifest({
      schedules: [
        validEntry({ id: 'disabled', enabled: false, providers: ['github-actions'] }),
        validEntry({ id: 'local-only', providers: ['local-polling'] }),
        validEntry({
          id: 'event-based',
          trigger: { type: 'event', event: 'push' },
          providers: ['github-actions'],
        }),
      ],
    });

    const files = await provider.generate!(manifest, tmpDir);
    expect(files).toHaveLength(0);
  });

  it('should return stub result for execute()', async () => {
    const provider = new GitHubActionsProvider();
    const result = await provider.execute(validEntry());
    expect(result.success).toBe(true);
    expect(result.output).toContain('GitHub Actions');
  });
});

// ============================================================================
// State Persistence Tests
// ============================================================================

describe('Scheduler: State Persistence', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-state-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty state when file does not exist', async () => {
    const state = await loadState(path.join(tmpDir, 'nonexistent.json'));
    expect(state).toEqual({ runs: {} });
  });

  it('should round-trip state through save/load', async () => {
    const state: ScheduleState = {
      runs: {
        'task-1': { lastRun: '2025-01-15T12:00:00Z', status: 'success' },
        'task-2': { lastRun: '2025-01-15T11:00:00Z', status: 'failure', error: 'timeout' },
      },
    };

    await saveState(statePath, state);
    const loaded = await loadState(statePath);

    expect(loaded).toEqual(state);
  });
});

// ============================================================================
// parseSchedule (file I/O) Tests
// ============================================================================

describe('Scheduler: parseSchedule', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-parse-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse a valid schedule.json from disk', async () => {
    const filePath = path.join(tmpDir, 'schedule.json');
    fs.writeFileSync(filePath, JSON.stringify(validManifest()), 'utf8');

    const manifest = await parseSchedule(filePath);
    expect(manifest.version).toBe(1);
    expect(manifest.schedules).toHaveLength(1);
  });

  it('should throw on missing file', async () => {
    await expect(parseSchedule(path.join(tmpDir, 'missing.json'))).rejects.toThrow(
      ScheduleValidationError,
    );
  });

  it('should throw on invalid JSON', async () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json!!!', 'utf8');

    await expect(parseSchedule(filePath)).rejects.toThrow('Invalid JSON');
  });
});

// ============================================================================
// Default Template Tests
// ============================================================================

describe('Scheduler: Default Template', () => {
  it('should produce a valid manifest', () => {
    const template = defaultScheduleTemplate();
    expect(() => validateManifest(template)).not.toThrow();
    expect(template.version).toBe(1);
    expect(template.schedules).toHaveLength(1);
    expect(template.schedules[0]!.id).toBe('ralph-heartbeat');
  });
});
