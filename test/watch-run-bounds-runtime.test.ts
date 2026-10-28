import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runWatch } from '../packages/squad-cli/src/cli/commands/watch/index.js';
import type { WatchConfig } from '../packages/squad-cli/src/cli/commands/watch/config.js';

const mocks = vi.hoisted(() => ({
  listWorkItems: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  monitorStop: vi.fn(async () => {}),
  emit: vi.fn(async () => {}),
}));

vi.mock('@bradygaster/squad-sdk/platform', () => ({
  getRemoteUrl: () => undefined,
  createPlatformAdapter: () => ({
    type: 'github',
    listWorkItems: mocks.listWorkItems,
    listPullRequests: async () => [],
  }),
}));
vi.mock('@bradygaster/squad-sdk/ralph/triage', () => ({
  parseRoster: () => [{ name: 'Test', label: 'squad:test' }],
  parseRoutingRules: () => [],
  parseModuleOwnership: () => [],
  triageIssue: () => null,
}));
vi.mock('@bradygaster/squad-sdk/ralph/capabilities', () => ({
  loadCapabilities: async () => null,
  filterByCapabilities: (issues: unknown[]) => ({ handled: issues, skipped: [] }),
  getPodId: () => undefined,
}));
vi.mock('@bradygaster/squad-sdk/ralph', () => ({
  RalphMonitor: class {
    start = async () => {};
    stop = mocks.monitorStop;
    healthCheck = async () => {};
  },
}));
vi.mock('@bradygaster/squad-sdk/runtime/event-bus', () => ({
  EventBus: class { emit = mocks.emit; },
}));
vi.mock('../packages/squad-cli/src/cli/core/gh-cli.js', () => ({
  ghAvailable: async () => true,
  ghAuthenticated: async () => true,
  ghRateLimitCheck: async () => null,
  isRateLimitError: () => false,
}));
vi.mock('../packages/squad-cli/src/cli/commands/watch/pid-tracker.js', () => ({
  PidTracker: class {
    cleanupStale = () => 0;
    registerExitHandlers = () => {};
  },
}));

const roots: string[] = [];
const base: WatchConfig = { interval: 10, execute: false, maxConcurrent: 1, timeout: 30, capabilities: {} };

function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'squad-watch-bound-runtime-'));
  roots.push(root);
  mkdirSync(path.join(root, '.squad'));
  writeFileSync(path.join(root, '.squad', 'team.md'), '# Test team\n');
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listWorkItems.mockResolvedValue([]);
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('watch runtime bounds (#1714)', () => {
  it('stops immediately after the final completed round and cleans up', async () => {
    await runWatch(project(), { ...base, maxRounds: 1 });
    expect(mocks.listWorkItems).toHaveBeenCalledTimes(1);
    expect(mocks.monitorStop).toHaveBeenCalledTimes(1);
    expect(mocks.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'session:destroyed' }));
  });

  it('runs the next poll when the round cap has not been reached yet', async () => {
    let poll!: () => Promise<void>;
    const interval = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => Promise<void>) => {
      poll = callback;
      return {} as NodeJS.Timeout;
    }) as typeof setInterval);
    try {
      const running = runWatch(project(), { ...base, maxRounds: 2 });
      await vi.waitFor(() => expect(poll).toBeTypeOf('function'));
      expect(mocks.listWorkItems).toHaveBeenCalledTimes(1);
      expect(mocks.monitorStop).not.toHaveBeenCalled();
      await poll();
      await running;
      expect(mocks.listWorkItems).toHaveBeenCalledTimes(2);
      expect(mocks.monitorStop).toHaveBeenCalledTimes(1);
    } finally {
      interval.mockRestore();
    }
  });

  it('stops at the duration deadline while idle between polls', async () => {
    await runWatch(project(), { ...base, maxDuration: '50ms' });
    expect(mocks.listWorkItems).toHaveBeenCalledTimes(1);
    expect(mocks.monitorStop).toHaveBeenCalledTimes(1);
  });

  it('waits for an active round before stopping at the duration deadline', async () => {
    let finishScan!: (issues: unknown[]) => void;
    mocks.listWorkItems.mockImplementationOnce(() => new Promise(resolve => { finishScan = resolve; }));
    const running = runWatch(project(), { ...base, maxDuration: '50ms' });
    await vi.waitFor(() => expect(mocks.listWorkItems).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mocks.monitorStop).not.toHaveBeenCalled();
    finishScan([]);
    await running;
    expect(mocks.monitorStop).toHaveBeenCalledTimes(1);
  });
});
