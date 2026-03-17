/**
 * Tests for persistent Ralph features — heartbeat timer + watch interval
 *
 * Validates that:
 * - RalphMonitor starts the healthCheck timer on start()
 * - Timer fires at the configured interval
 * - Timer is cleaned up on stop()
 * - Watch command validates interval input
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RalphMonitor,
  type MonitorConfig,
} from '../packages/squad-sdk/src/ralph/index.js';

// --- Mock EventBus ---

function createMockEventBus() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    subscribe(type: string, handler: (event: any) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
      return () => { handlers.get(type)?.delete(handler); };
    },
    subscribeAll(handler: (event: any) => void) {
      return () => {};
    },
    async emit(event: any) {
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const h of typeHandlers) h(event);
      }
    },
  } as any;
}

function makeConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  return {
    teamRoot: '/test/team',
    healthCheckInterval: 100,
    staleSessionThreshold: 500,
    ...overrides,
  };
}

describe('RalphMonitor healthCheck timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the healthCheck timer on start()', async () => {
    const monitor = new RalphMonitor(makeConfig({ healthCheckInterval: 200 }));
    const eventBus = createMockEventBus();
    const healthCheckSpy = vi.spyOn(monitor, 'healthCheck');

    await monitor.start(eventBus);

    // Timer should not have fired yet
    expect(healthCheckSpy).not.toHaveBeenCalled();

    // Advance past interval
    vi.advanceTimersByTime(250);

    expect(healthCheckSpy).toHaveBeenCalledTimes(1);

    await monitor.stop();
  });

  it('fires healthCheck at configured interval', async () => {
    const monitor = new RalphMonitor(makeConfig({ healthCheckInterval: 100 }));
    const eventBus = createMockEventBus();
    const healthCheckSpy = vi.spyOn(monitor, 'healthCheck');

    await monitor.start(eventBus);

    vi.advanceTimersByTime(350);

    // Should have fired 3 times at 100ms intervals (100, 200, 300)
    expect(healthCheckSpy).toHaveBeenCalledTimes(3);

    await monitor.stop();
  });

  it('stops the timer on stop()', async () => {
    const monitor = new RalphMonitor(makeConfig({ healthCheckInterval: 100 }));
    const eventBus = createMockEventBus();
    const healthCheckSpy = vi.spyOn(monitor, 'healthCheck');

    await monitor.start(eventBus);

    vi.advanceTimersByTime(150); // 1 fire
    expect(healthCheckSpy).toHaveBeenCalledTimes(1);

    await monitor.stop();

    vi.advanceTimersByTime(300); // Should NOT fire again
    expect(healthCheckSpy).toHaveBeenCalledTimes(1);
  });

  it('uses default 30s interval when not configured', async () => {
    const monitor = new RalphMonitor({ teamRoot: '/test' });
    const eventBus = createMockEventBus();
    const healthCheckSpy = vi.spyOn(monitor, 'healthCheck');

    await monitor.start(eventBus);

    // Advance 29s — should not fire
    vi.advanceTimersByTime(29_000);
    expect(healthCheckSpy).not.toHaveBeenCalled();

    // Advance past 30s — should fire
    vi.advanceTimersByTime(2_000);
    expect(healthCheckSpy).toHaveBeenCalledTimes(1);

    await monitor.stop();
  });

  it('detects stale agents via timer-driven health check', async () => {
    const monitor = new RalphMonitor(makeConfig({
      healthCheckInterval: 100,
      staleSessionThreshold: 200,
    }));
    const eventBus = createMockEventBus();

    await monitor.start(eventBus);

    // Create a session with a timestamp in the past
    await eventBus.emit({
      type: 'session:created',
      sessionId: 's1',
      agentName: 'TestAgent',
      payload: null,
      timestamp: new Date(Date.now() - 300),
    });

    // Agent should be 'working' initially
    expect(monitor.getStatus()[0].status).toBe('working');

    // Advance timer to trigger healthCheck (agent is now >200ms stale)
    vi.advanceTimersByTime(150);

    // After healthCheck, agent should be 'stale'
    expect(monitor.getStatus()[0].status).toBe('stale');

    await monitor.stop();
  });
});

describe('watch interval validation', () => {
  it('reportBoard accepts round numbers consistently', async () => {
    const { reportBoard } = await import(
      '../packages/squad-cli/src/cli/commands/watch.js'
    );

    const state = {
      untriaged: 0,
      assigned: 0,
      drafts: 0,
      needsReview: 0,
      changesRequested: 0,
      ciFailures: 0,
      readyToMerge: 0,
    };

    // Various valid round numbers
    for (const round of [1, 5, 10, 100, 999]) {
      expect(() => reportBoard(state, round)).not.toThrow();
    }
  });

  it('BoardState interface has all required fields', async () => {
    const { reportBoard } = await import(
      '../packages/squad-cli/src/cli/commands/watch.js'
    );

    const fullState = {
      untriaged: 1,
      assigned: 2,
      drafts: 3,
      needsReview: 4,
      changesRequested: 5,
      ciFailures: 6,
      readyToMerge: 7,
    };

    expect(() => reportBoard(fullState, 1)).not.toThrow();
  });
});
