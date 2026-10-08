import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContextUtilizationTracker,
  StreamingPipeline,
  type ContextUsageEvent,
  type StreamDelta,
  type UsageEvent,
  type ReasoningDelta,
} from '@bradygaster/squad-sdk';
import { CostTracker } from '@bradygaster/squad-sdk/runtime/cost-tracker';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';

// ============================================================================
// StreamingPipeline
// ============================================================================

describe('StreamingPipeline', () => {
  let pipeline: StreamingPipeline;

  beforeEach(() => {
    pipeline = new StreamingPipeline();
  });

  // ---------- Handler registration ----------

  it('should register a delta handler', () => {
    const handler = vi.fn();
    const unsubscribe = pipeline.onDelta(handler);
    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should register a usage handler', () => {
    const handler = vi.fn();
    const unsubscribe = pipeline.onUsage(handler);
    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should register a context utilization handler', () => {
    const handler = vi.fn();
    const unsubscribe = pipeline.onContextUtilization(handler);
    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should register a reasoning handler', () => {
    const handler = vi.fn();
    const unsubscribe = pipeline.onReasoning(handler);
    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should unsubscribe delta handler', async () => {
    const handler = vi.fn();
    const unsubscribe = pipeline.onDelta(handler);
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeDelta('s1', 'hello'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    await pipeline.processEvent(makeDelta('s1', 'world'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ---------- Session attachment ----------

  it('should attach a session', () => {
    pipeline.attachToSession('s1');
    expect(pipeline.isAttached('s1')).toBe(true);
  });

  it('should throw when attaching the same session twice', () => {
    pipeline.attachToSession('s1');
    expect(() => pipeline.attachToSession('s1')).toThrow('already attached');
  });

  it('should detach a session', () => {
    pipeline.attachToSession('s1');
    pipeline.detachFromSession('s1');
    expect(pipeline.isAttached('s1')).toBe(false);
  });

  it('should return attached sessions', () => {
    pipeline.attachToSession('s1');
    pipeline.attachToSession('s2');
    expect(pipeline.getAttachedSessions().size).toBe(2);
  });

  // ---------- Event dispatching ----------

  it('should dispatch message delta to delta handlers', async () => {
    const handler = vi.fn();
    pipeline.onDelta(handler);
    pipeline.attachToSession('s1');

    const event = makeDelta('s1', 'hello');
    await pipeline.processEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should dispatch usage to usage handlers', async () => {
    const handler = vi.fn();
    pipeline.onUsage(handler);
    pipeline.attachToSession('s1');

    const event = makeUsage('s1', 100, 50);
    await pipeline.processEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should dispatch reasoning delta to reasoning handlers', async () => {
    const handler = vi.fn();
    pipeline.onReasoning(handler);
    pipeline.attachToSession('s1');

    const event = makeReasoning('s1', 'thinking...');
    await pipeline.processEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should calculate exact context utilization from runtime accounting', async () => {
    const handler = vi.fn();
    pipeline.onContextUtilization(handler);
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeContextUsage('s1', 80_000, 100_000));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      occupiedTokens: 80_000,
      contextWindowTokens: 100_000,
      utilization: 0.8,
      source: 'runtime',
      warning: true,
      thresholdCrossed: true,
    }));
    expect(pipeline.getContextUtilization('s1')?.utilization).toBe(0.8);
  });

  it('should estimate post-turn context without cumulatively double-counting usage', async () => {
    pipeline = new StreamingPipeline({
      resolveContextWindow: model => model === 'claude-sonnet-4' ? 1_000 : undefined,
    });
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeUsage('s1', 100, 50));
    await pipeline.processEvent(makeUsage('s1', 200, 75));

    expect(pipeline.getContextUtilization('s1')).toEqual(expect.objectContaining({
      occupiedTokens: 275,
      contextWindowTokens: 1_000,
      utilization: 0.275,
      source: 'estimated',
    }));
  });

  it('should keep context utilization isolated by session', async () => {
    pipeline = new StreamingPipeline({ resolveContextWindow: () => 1_000 });
    pipeline.attachToSession('s1');
    pipeline.attachToSession('s2');

    await pipeline.processEvent(makeUsage('s1', 100, 50));
    await pipeline.processEvent(makeUsage('s2', 600, 200));

    expect(pipeline.getContextUtilization('s1')?.utilization).toBe(0.15);
    expect(pipeline.getContextUtilization('s2')?.utilization).toBe(0.8);
    expect(pipeline.getAllContextUtilizations()).toHaveLength(2);
  });

  it('should let exact runtime accounting supersede estimated samples', async () => {
    pipeline = new StreamingPipeline({ resolveContextWindow: () => 1_000 });
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeUsage('s1', 100, 50));
    await pipeline.processEvent(makeContextUsage('s1', 400, 2_000));
    await pipeline.processEvent(makeUsage('s1', 900, 100));

    expect(pipeline.getContextUtilization('s1')).toEqual(expect.objectContaining({
      occupiedTokens: 400,
      contextWindowTokens: 2_000,
      utilization: 0.2,
      source: 'runtime',
    }));
  });

  it('should emit typed context utilization events', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('context:utilization', handler);
    pipeline = new StreamingPipeline({ eventBus: bus });
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeContextUsage('s1', 50, 100));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'context:utilization',
      sessionId: 's1',
      payload: expect.objectContaining({
        utilization: 0.5,
        source: 'runtime',
      }),
    }));
  });

  it('should ignore events from unattached sessions', async () => {
    const handler = vi.fn();
    pipeline.onDelta(handler);

    await pipeline.processEvent(makeDelta('unattached', 'hello'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support multiple delta handlers', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    pipeline.onDelta(h1);
    pipeline.onDelta(h2);
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeDelta('s1', 'hi'));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('should isolate handler errors', async () => {
    const failing = vi.fn(() => { throw new Error('fail'); });
    const passing = vi.fn();
    pipeline.onDelta(failing);
    pipeline.onDelta(passing);
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeDelta('s1', 'hi'));
    expect(failing).toHaveBeenCalled();
    expect(passing).toHaveBeenCalled();
  });

  it('should handle async handlers', async () => {
    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    pipeline.onDelta(handler);
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeDelta('s1', 'hi'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ---------- Usage summary ----------

  it('should return empty summary when no events', () => {
    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.estimatedCost).toBe(0);
    expect(summary.byAgent.size).toBe(0);
  });

  it('should aggregate usage across events', async () => {
    pipeline.attachToSession('s1');
    await pipeline.processEvent(makeUsage('s1', 100, 50, 0.01, 'agent-a'));
    await pipeline.processEvent(makeUsage('s1', 200, 100, 0.02, 'agent-b'));

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(150);
    expect(summary.estimatedCost).toBeCloseTo(0.03);
    expect(summary.byAgent.size).toBe(2);
  });

  it('should aggregate usage per agent', async () => {
    pipeline.attachToSession('s1');
    await pipeline.processEvent(makeUsage('s1', 100, 50, 0.01, 'agent-a'));
    await pipeline.processEvent(makeUsage('s1', 200, 75, 0.02, 'agent-a'));

    const summary = pipeline.getUsageSummary();
    const agentA = summary.byAgent.get('agent-a')!;
    expect(agentA.inputTokens).toBe(300);
    expect(agentA.outputTokens).toBe(125);
    expect(agentA.turnCount).toBe(2);
  });

  // ---------- Clear ----------

  it('should clear all state', async () => {
    pipeline.attachToSession('s1');
    pipeline.onDelta(vi.fn());
    await pipeline.processEvent(makeUsage('s1', 100, 50));

    pipeline.clear();
    expect(pipeline.isAttached('s1')).toBe(false);
    expect(pipeline.getUsageSummary().totalInputTokens).toBe(0);
    expect(pipeline.getAllContextUtilizations()).toEqual([]);
  });
});

describe('ContextUtilizationTracker', () => {
  it('warns once per threshold crossing and resets after recovery', () => {
    const tracker = new ContextUtilizationTracker({ warningThreshold: 0.75 });

    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: 800, tokenLimit: 1_000,
    })?.thresholdCrossed).toBe(true);
    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: 900, tokenLimit: 1_000,
    })?.thresholdCrossed).toBe(false);
    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: 500, tokenLimit: 1_000,
    })?.warning).toBe(false);
    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: 800, tokenLimit: 1_000,
    })?.thresholdCrossed).toBe(true);
  });

  it('does not clamp over-limit utilization', () => {
    const tracker = new ContextUtilizationTracker();
    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: 1_200, tokenLimit: 1_000,
    })?.utilization).toBe(1.2);
  });

  it('rejects invalid thresholds and invalid or unresolved samples', () => {
    expect(() => new ContextUtilizationTracker({ warningThreshold: 0 })).toThrow(RangeError);
    expect(() => new ContextUtilizationTracker({ warningThreshold: 1.1 })).toThrow(RangeError);

    const tracker = new ContextUtilizationTracker({ resolveContextWindow: () => undefined });
    expect(tracker.recordRuntime({
      sessionId: 's1', currentTokens: -1, tokenLimit: 100,
    })).toBeUndefined();
    expect(tracker.recordEstimated({
      sessionId: 's1', model: 'unknown', inputTokens: 10, outputTokens: 5,
    })).toBeUndefined();
  });
});

// ============================================================================
// CostTracker
// ============================================================================

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('should record a single usage event', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
    });

    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(500);
    expect(summary.totalOutputTokens).toBe(200);
    expect(summary.totalEstimatedCost).toBeCloseTo(0.05);
  });

  it('should accumulate per-agent data', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
    });
    tracker.recordUsage({
      sessionId: 's2',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 300,
      outputTokens: 100,
      estimatedCost: 0.03,
    });

    const agent = tracker.getSummary().agents.get('keaton')!;
    expect(agent.inputTokens).toBe(800);
    expect(agent.turnCount).toBe(2);
  });

  it('should accumulate per-session data', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
    });
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
    });

    const session = tracker.getSummary().sessions.get('s1')!;
    expect(session.inputTokens).toBe(600);
    expect(session.turnCount).toBe(2);
  });

  it('should track fallback count', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
      isFallback: true,
    });

    const agent = tracker.getSummary().agents.get('keaton')!;
    expect(agent.fallbackCount).toBe(1);
  });

  it('should increment fallback via recordFallback', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
    });
    tracker.recordFallback('keaton');

    const agent = tracker.getSummary().agents.get('keaton')!;
    expect(agent.fallbackCount).toBe(1);
  });

  it('should use "unknown" when agentName is missing', () => {
    tracker.recordUsage({
      sessionId: 's1',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
    });

    expect(tracker.getSummary().agents.has('unknown')).toBe(true);
  });

  it('should reset all data', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
    });

    tracker.reset();
    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.agents.size).toBe(0);
    expect(summary.sessions.size).toBe(0);
  });

  it('should format summary as readable string', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.05,
    });

    const output = tracker.formatSummary();
    expect(output).toContain('Squad Cost Summary');
    expect(output).toContain('keaton');
    expect(output).toContain('claude-opus-4');
    expect(output).toContain('500');
  });

  it('should format summary with fallback info', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'keaton',
      model: 'claude-opus-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
      isFallback: true,
    });

    const output = tracker.formatSummary();
    expect(output).toContain('fallback');
  });

  // ---------- EventBus integration ----------

  it('should wire to EventBus and receive usage events', async () => {
    const bus = new EventBus();
    const unsub = tracker.wireToEventBus(bus);

    await bus.emit({
      type: 'session:message',
      sessionId: 's1',
      agentName: 'harper',
      payload: {
        model: 'claude-sonnet-4',
        inputTokens: 300,
        outputTokens: 150,
        estimatedCost: 0.02,
      },
      timestamp: new Date(),
    });

    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.agents.get('harper')!.model).toBe('claude-sonnet-4');

    unsub();
  });

  it('should unsubscribe from EventBus', async () => {
    const bus = new EventBus();
    const unsub = tracker.wireToEventBus(bus);
    unsub();

    await bus.emit({
      type: 'session:message',
      sessionId: 's1',
      payload: { inputTokens: 100, outputTokens: 50 },
      timestamp: new Date(),
    });

    expect(tracker.getSummary().totalInputTokens).toBe(0);
  });

  it('should ignore events without usage payload', async () => {
    const bus = new EventBus();
    tracker.wireToEventBus(bus);

    await bus.emit({
      type: 'session:message',
      sessionId: 's1',
      payload: { text: 'hello' },
      timestamp: new Date(),
    });

    expect(tracker.getSummary().totalInputTokens).toBe(0);
  });

  it('should handle null payload gracefully', async () => {
    const bus = new EventBus();
    tracker.wireToEventBus(bus);

    await bus.emit({
      type: 'session:message',
      sessionId: 's1',
      payload: null,
      timestamp: new Date(),
    });

    expect(tracker.getSummary().totalInputTokens).toBe(0);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeDelta(sessionId: string, content: string, index = 0): StreamDelta {
  return {
    type: 'message_delta',
    sessionId,
    content,
    index,
    timestamp: new Date(),
  };
}

function makeUsage(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCost = 0,
  agentName?: string,
): UsageEvent {
  return {
    type: 'usage',
    sessionId,
    agentName,
    model: 'claude-sonnet-4',
    inputTokens,
    outputTokens,
    estimatedCost,
    timestamp: new Date(),
  };
}

function makeReasoning(sessionId: string, content: string, index = 0): ReasoningDelta {
  return {
    type: 'reasoning_delta',
    sessionId,
    content,
    index,
    timestamp: new Date(),
  };
}

function makeContextUsage(
  sessionId: string,
  currentTokens: number,
  tokenLimit: number,
): ContextUsageEvent {
  return {
    type: 'context_usage',
    sessionId,
    currentTokens,
    tokenLimit,
    timestamp: new Date(),
  };
}
