/**
 * OTel Metrics Tests — Issues #261, #262, #263, #264
 *
 * Comprehensive tests for the otel-metrics module that provides counters,
 * histograms, and gauges for token usage, agent performance, session pool,
 * and response latency.
 *
 * Strategy: Mock getMeter() from the otel provider to return a spy-enabled
 * meter so we can verify every .add() / .record() call with correct attributes.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  recordTokenUsage,
  recordAgentSpawn,
  recordAgentDuration,
  recordAgentError,
  recordAgentDestroy,
  recordSessionCreated,
  recordSessionIdle,
  recordSessionReactivated,
  recordSessionClosed,
  recordSessionError,
  recordTimeToFirstToken,
  recordResponseDuration,
  recordTokensPerSecond,
  _resetMetrics,
} from '@bradygaster/squad-sdk';

// ---------------------------------------------------------------------------
// Mock the OTel provider's getMeter to return spy instruments
// ---------------------------------------------------------------------------

interface SpyInstrument {
  add: Mock;
  record: Mock;
}

interface SpyMeter {
  createCounter: Mock;
  createHistogram: Mock;
  createUpDownCounter: Mock;
  createGauge: Mock;
  _instruments: Map<string, SpyInstrument>;
}

function createSpyMeter(): SpyMeter {
  const instruments = new Map<string, SpyInstrument>();

  function makeInstrument(name: string): SpyInstrument {
    const inst: SpyInstrument = { add: vi.fn(), record: vi.fn() };
    instruments.set(name, inst);
    return inst;
  }

  return {
    createCounter: vi.fn((name: string) => makeInstrument(name)),
    createHistogram: vi.fn((name: string) => makeInstrument(name)),
    createUpDownCounter: vi.fn((name: string) => makeInstrument(name)),
    createGauge: vi.fn((name: string) => makeInstrument(name)),
    _instruments: instruments,
  };
}

let spyMeter: SpyMeter;

vi.mock('@bradygaster/squad-sdk/runtime/otel', () => ({
  getMeter: () => spyMeter,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInstrument(name: string): SpyInstrument {
  const inst = spyMeter._instruments.get(name);
  if (!inst) throw new Error(`No instrument created for "${name}". Created: ${[...spyMeter._instruments.keys()].join(', ')}`);
  return inst;
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  spyMeter = createSpyMeter();
  _resetMetrics();
});

// =============================================================================
// #261 — Token Usage Metrics
// =============================================================================

describe('OTel Metrics — Token Usage (#261)', () => {
  it('recordTokenUsage calls all four counters with correct attributes', () => {
    recordTokenUsage({
      type: 'usage',
      sessionId: 'sess-1',
      agentName: 'fenster',
      model: 'gpt-5.6-luna',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.003,
      timestamp: new Date(),
    });

    const input = getInstrument('squad.tokens.input');
    const output = getInstrument('squad.tokens.output');
    const cost = getInstrument('squad.tokens.cost');
    const total = getInstrument('squad.tokens.total');

    expect(input.add).toHaveBeenCalledWith(100, { 'agent.name': 'fenster', model: 'gpt-5.6-luna' });
    expect(output.add).toHaveBeenCalledWith(50, { 'agent.name': 'fenster', model: 'gpt-5.6-luna' });
    expect(cost.add).toHaveBeenCalledWith(0.003, { 'agent.name': 'fenster', model: 'gpt-5.6-luna' });
    expect(total.add).toHaveBeenCalledWith(150, { 'agent.name': 'fenster', model: 'gpt-5.6-luna' });
  });

  it('defaults agentName to "unknown" when not provided', () => {
    recordTokenUsage({
      type: 'usage',
      sessionId: 'sess-2',
      model: 'claude-3',
      inputTokens: 200,
      outputTokens: 100,
      estimatedCost: 0.01,
      timestamp: new Date(),
    });

    const input = getInstrument('squad.tokens.input');
    expect(input.add).toHaveBeenCalledWith(200, { 'agent.name': 'unknown', model: 'claude-3' });
  });

  it('handles zero-token usage events', () => {
    recordTokenUsage({
      type: 'usage',
      sessionId: 'sess-3',
      agentName: 'edie',
      model: 'gpt-5.6-luna',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      timestamp: new Date(),
    });

    const input = getInstrument('squad.tokens.input');
    const total = getInstrument('squad.tokens.total');
    expect(input.add).toHaveBeenCalledWith(0, expect.objectContaining({ 'agent.name': 'edie' }));
    expect(total.add).toHaveBeenCalledWith(0, expect.objectContaining({ 'agent.name': 'edie' }));
  });

  it('records different models in separate calls', () => {
    const base = { type: 'usage' as const, sessionId: 's', inputTokens: 10, outputTokens: 5, estimatedCost: 0.001, timestamp: new Date() };

    recordTokenUsage({ ...base, agentName: 'a', model: 'gpt-5.6-luna' });
    recordTokenUsage({ ...base, agentName: 'a', model: 'claude-3' });

    const input = getInstrument('squad.tokens.input');
    expect(input.add).toHaveBeenCalledTimes(2);
    expect(input.add).toHaveBeenCalledWith(10, { 'agent.name': 'a', model: 'gpt-5.6-luna' });
    expect(input.add).toHaveBeenCalledWith(10, { 'agent.name': 'a', model: 'claude-3' });
  });

  it('creates metric instruments with correct names and descriptions', () => {
    recordTokenUsage({
      type: 'usage', sessionId: 's', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCost: 0, timestamp: new Date(),
    });

    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.tokens.input', expect.objectContaining({ unit: 'tokens' }));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.tokens.output', expect.objectContaining({ unit: 'tokens' }));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.tokens.cost', expect.objectContaining({ unit: 'USD' }));
    expect(spyMeter.createUpDownCounter).toHaveBeenCalledWith('squad.tokens.total', expect.objectContaining({ unit: 'tokens' }));
  });
});

// =============================================================================
// #262 — Agent Performance Metrics
// =============================================================================

describe('OTel Metrics — Agent Performance (#262)', () => {
  it('recordAgentSpawn increments spawn counter and active gauge', () => {
    recordAgentSpawn('fenster', 'background');

    const spawns = getInstrument('squad.agent.spawns');
    const active = getInstrument('squad.agent.active');

    expect(spawns.add).toHaveBeenCalledWith(1, { 'agent.name': 'fenster', mode: 'background' });
    expect(active.add).toHaveBeenCalledWith(1, { 'agent.name': 'fenster' });
  });

  it('recordAgentSpawn defaults mode to sync', () => {
    recordAgentSpawn('edie');

    const spawns = getInstrument('squad.agent.spawns');
    expect(spawns.add).toHaveBeenCalledWith(1, { 'agent.name': 'edie', mode: 'sync' });
  });

  it('recordAgentDuration records histogram on success', () => {
    recordAgentDuration('fenster', 1500, 'success');

    const duration = getInstrument('squad.agent.duration');
    expect(duration.record).toHaveBeenCalledWith(1500, { 'agent.name': 'fenster', status: 'success' });
  });

  it('recordAgentDuration defaults status to success', () => {
    recordAgentDuration('fenster', 800);

    const duration = getInstrument('squad.agent.duration');
    expect(duration.record).toHaveBeenCalledWith(800, { 'agent.name': 'fenster', status: 'success' });
  });

  it('recordAgentDuration increments error counter on error status', () => {
    recordAgentDuration('fenster', 2000, 'error');

    const duration = getInstrument('squad.agent.duration');
    const errors = getInstrument('squad.agent.errors');

    expect(duration.record).toHaveBeenCalledWith(2000, { 'agent.name': 'fenster', status: 'error' });
    expect(errors.add).toHaveBeenCalledWith(1, { 'agent.name': 'fenster', 'error.type': 'task_failure' });
  });

  it('recordAgentDuration does NOT increment error counter on success', () => {
    recordAgentDuration('fenster', 500, 'success');

    const errors = getInstrument('squad.agent.errors');
    expect(errors.add).not.toHaveBeenCalled();
  });

  it('recordAgentError records error with type attribute', () => {
    recordAgentError('edie', 'RangeError');

    const errors = getInstrument('squad.agent.errors');
    expect(errors.add).toHaveBeenCalledWith(1, { 'agent.name': 'edie', 'error.type': 'RangeError' });
  });

  it('recordAgentDestroy decrements active gauge', () => {
    recordAgentDestroy('fenster');

    const active = getInstrument('squad.agent.active');
    expect(active.add).toHaveBeenCalledWith(-1, { 'agent.name': 'fenster' });
  });

  it('spawn + destroy lifecycle balances the gauge', () => {
    recordAgentSpawn('fenster', 'sync');
    recordAgentDestroy('fenster');

    const active = getInstrument('squad.agent.active');
    expect(active.add).toHaveBeenCalledTimes(2);
    expect(active.add).toHaveBeenNthCalledWith(1, 1, { 'agent.name': 'fenster' });
    expect(active.add).toHaveBeenNthCalledWith(2, -1, { 'agent.name': 'fenster' });
  });

  it('creates agent instruments with correct metric names', () => {
    recordAgentSpawn('test');

    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.agent.spawns', expect.any(Object));
    expect(spyMeter.createHistogram).toHaveBeenCalledWith('squad.agent.duration', expect.objectContaining({ unit: 'ms' }));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.agent.errors', expect.any(Object));
    expect(spyMeter.createUpDownCounter).toHaveBeenCalledWith('squad.agent.active', expect.any(Object));
  });
});

// =============================================================================
// #263 — Session Pool Metrics
// =============================================================================

describe('OTel Metrics — Session Pool (#263)', () => {
  it('recordSessionCreated increments created counter and active gauge', () => {
    recordSessionCreated();

    const created = getInstrument('squad.sessions.created');
    const active = getInstrument('squad.sessions.active');

    expect(created.add).toHaveBeenCalledWith(1);
    expect(active.add).toHaveBeenCalledWith(1);
  });

  it('recordSessionIdle decrements active and increments idle', () => {
    recordSessionIdle();

    const active = getInstrument('squad.sessions.active');
    const idle = getInstrument('squad.sessions.idle');

    expect(active.add).toHaveBeenCalledWith(-1);
    expect(idle.add).toHaveBeenCalledWith(1);
  });

  it('recordSessionReactivated decrements idle and increments active', () => {
    recordSessionReactivated();

    const idle = getInstrument('squad.sessions.idle');
    const active = getInstrument('squad.sessions.active');

    expect(idle.add).toHaveBeenCalledWith(-1);
    expect(active.add).toHaveBeenCalledWith(1);
  });

  it('recordSessionClosed decrements active and increments closed', () => {
    recordSessionClosed();

    const active = getInstrument('squad.sessions.active');
    const closed = getInstrument('squad.sessions.closed');

    expect(active.add).toHaveBeenCalledWith(-1);
    expect(closed.add).toHaveBeenCalledWith(1);
  });

  it('recordSessionError increments error counter', () => {
    recordSessionError();

    const errors = getInstrument('squad.sessions.errors');
    expect(errors.add).toHaveBeenCalledWith(1);
  });

  it('full session lifecycle: created → idle → reactivated → closed', () => {
    recordSessionCreated();
    recordSessionIdle();
    recordSessionReactivated();
    recordSessionClosed();

    const active = getInstrument('squad.sessions.active');
    const idle = getInstrument('squad.sessions.idle');
    const created = getInstrument('squad.sessions.created');
    const closed = getInstrument('squad.sessions.closed');

    // active: +1 (created) -1 (idle) +1 (reactivated) -1 (closed) = 0 net
    expect(active.add).toHaveBeenCalledTimes(4);
    // idle: +1 (idle) -1 (reactivated) = 0 net
    expect(idle.add).toHaveBeenCalledTimes(2);
    expect(created.add).toHaveBeenCalledTimes(1);
    expect(closed.add).toHaveBeenCalledTimes(1);
  });

  it('multiple sessions can be tracked concurrently', () => {
    recordSessionCreated();
    recordSessionCreated();
    recordSessionCreated();
    recordSessionIdle();

    const active = getInstrument('squad.sessions.active');
    const created = getInstrument('squad.sessions.created');

    expect(created.add).toHaveBeenCalledTimes(3);
    // +1, +1, +1, -1 = net 2 active
    expect(active.add).toHaveBeenCalledTimes(4);
  });

  it('creates session instruments with correct metric names', () => {
    recordSessionCreated();

    expect(spyMeter.createUpDownCounter).toHaveBeenCalledWith('squad.sessions.active', expect.any(Object));
    expect(spyMeter.createUpDownCounter).toHaveBeenCalledWith('squad.sessions.idle', expect.any(Object));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.sessions.created', expect.any(Object));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.sessions.closed', expect.any(Object));
    expect(spyMeter.createCounter).toHaveBeenCalledWith('squad.sessions.errors', expect.any(Object));
  });
});

// =============================================================================
// #264 — Response Latency Metrics
// =============================================================================

describe('OTel Metrics — Response Latency (#264)', () => {
  it('recordTimeToFirstToken records histogram value', () => {
    recordTimeToFirstToken(42.5);

    const ttft = getInstrument('squad.response.ttft');
    expect(ttft.record).toHaveBeenCalledWith(42.5);
  });

  it('recordResponseDuration records histogram value', () => {
    recordResponseDuration(1500);

    const duration = getInstrument('squad.response.duration');
    expect(duration.record).toHaveBeenCalledWith(1500);
  });

  it('recordTokensPerSecond records gauge value', () => {
    recordTokensPerSecond(35.7);

    const tps = getInstrument('squad.response.tokens_per_second');
    expect(tps.record).toHaveBeenCalledWith(35.7);
  });

  it('handles very small TTFT values (sub-millisecond)', () => {
    recordTimeToFirstToken(0.001);

    const ttft = getInstrument('squad.response.ttft');
    expect(ttft.record).toHaveBeenCalledWith(0.001);
  });

  it('handles very large duration values', () => {
    recordResponseDuration(300_000); // 5 minutes

    const duration = getInstrument('squad.response.duration');
    expect(duration.record).toHaveBeenCalledWith(300_000);
  });

  it('creates latency instruments with correct names and units', () => {
    recordTimeToFirstToken(1);

    expect(spyMeter.createHistogram).toHaveBeenCalledWith('squad.response.ttft', expect.objectContaining({ unit: 'ms' }));
    expect(spyMeter.createHistogram).toHaveBeenCalledWith('squad.response.duration', expect.objectContaining({ unit: 'ms' }));
    expect(spyMeter.createGauge).toHaveBeenCalledWith('squad.response.tokens_per_second', expect.objectContaining({ unit: 'tokens/s' }));
  });
});

// =============================================================================
// Reset / Cleanup
// =============================================================================

describe('OTel Metrics — _resetMetrics()', () => {
  it('clears all cached metric instances', () => {
    // Force creation of all instrument categories
    recordTokenUsage({ type: 'usage', sessionId: 's', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCost: 0, timestamp: new Date() });
    recordAgentSpawn('test');
    recordSessionCreated();
    recordTimeToFirstToken(1);

    // Count instruments created
    const initialCount = spyMeter._instruments.size;
    expect(initialCount).toBeGreaterThan(0);

    // Reset and create a fresh spy meter
    _resetMetrics();
    spyMeter = createSpyMeter();

    // Call a metric function — should create fresh instruments on the new meter
    recordTokenUsage({ type: 'usage', sessionId: 's', model: 'x', inputTokens: 5, outputTokens: 5, estimatedCost: 0, timestamp: new Date() });

    // The NEW meter should have been used (not the old one)
    expect(spyMeter.createCounter).toHaveBeenCalled();
    expect(spyMeter._instruments.has('squad.tokens.input')).toBe(true);
  });

  it('metric functions work correctly after reset', () => {
    recordAgentSpawn('before');
    _resetMetrics();
    spyMeter = createSpyMeter();

    recordAgentSpawn('after');

    const spawns = getInstrument('squad.agent.spawns');
    expect(spawns.add).toHaveBeenCalledWith(1, { 'agent.name': 'after', mode: 'sync' });
    // Only one call — the "before" was on the old meter
    expect(spawns.add).toHaveBeenCalledTimes(1);
  });

  it('each category is independently reset', () => {
    recordTokenUsage({ type: 'usage', sessionId: 's', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCost: 0, timestamp: new Date() });

    _resetMetrics();
    spyMeter = createSpyMeter();

    // Only call agent metrics — token metrics should NOT re-create
    recordAgentSpawn('test');

    expect(spyMeter._instruments.has('squad.agent.spawns')).toBe(true);
    expect(spyMeter._instruments.has('squad.tokens.input')).toBe(false);
  });
});

// =============================================================================
// No-op Safety (OTel not configured)
// =============================================================================

describe('OTel Metrics — no-op safety', () => {
  it('all metric functions are safe when meter returns no-op instruments', () => {
    // Our spy meter already returns no-op-like stubs, so these should never throw
    expect(() => recordTokenUsage({
      type: 'usage', sessionId: 's', model: 'x', inputTokens: 1, outputTokens: 1, estimatedCost: 0, timestamp: new Date(),
    })).not.toThrow();
    expect(() => recordAgentSpawn('test')).not.toThrow();
    expect(() => recordAgentDuration('test', 100, 'success')).not.toThrow();
    expect(() => recordAgentDuration('test', 100, 'error')).not.toThrow();
    expect(() => recordAgentError('test', 'TypeError')).not.toThrow();
    expect(() => recordAgentDestroy('test')).not.toThrow();
    expect(() => recordSessionCreated()).not.toThrow();
    expect(() => recordSessionIdle()).not.toThrow();
    expect(() => recordSessionReactivated()).not.toThrow();
    expect(() => recordSessionClosed()).not.toThrow();
    expect(() => recordSessionError()).not.toThrow();
    expect(() => recordTimeToFirstToken(1)).not.toThrow();
    expect(() => recordResponseDuration(1)).not.toThrow();
    expect(() => recordTokensPerSecond(1)).not.toThrow();
  });

  it('_resetMetrics is safe to call multiple times', () => {
    expect(() => {
      _resetMetrics();
      _resetMetrics();
      _resetMetrics();
    }).not.toThrow();
  });
});
