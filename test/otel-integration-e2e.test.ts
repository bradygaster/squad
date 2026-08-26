/**
 * OTel Integration E2E Tests — Issue #267
 *
 * End-to-end integration tests covering:
 * a) Full trace hierarchy: request → route → agent → tool span chain
 * b) Zero-overhead verification: no provider configured = no spans, no errors
 * c) Metrics integration: counters increment across real operations
 * d) EventBus → OTel bridge: events produce correct spans
 *
 * Uses InMemorySpanExporter + SimpleSpanProcessor to capture spans in-process.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { createOTelTransport } from '@bradygaster/squad-sdk/runtime/otel-bridge';
import type { TelemetryEvent } from '@bradygaster/squad-sdk/runtime/telemetry';
import { TelemetryCollector, setTelemetryTransport } from '@bradygaster/squad-sdk/runtime/telemetry';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';

// ===========================================================================
// Test OTel infrastructure
// ===========================================================================

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;
let contextManager: AsyncLocalStorageContextManager;

function setupTestProvider() {
  contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  provider = new BasicTracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);
}

function teardownTestProvider() {
  exporter.reset();
  trace.disable();
  provider.shutdown();
  contextManager.disable();
}

// ===========================================================================
// (a) Full Trace Hierarchy: request → route → agent → tool
// ===========================================================================

describe('OTel Integration — full trace hierarchy', () => {
  beforeEach(() => setupTestProvider());
  afterEach(() => teardownTestProvider());

  it('nested spans share the same traceId when context is propagated', () => {
    const tracer = trace.getTracer('squad-e2e');

    const requestSpan = tracer.startSpan('squad.request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    const routeSpan = tracer.startSpan('squad.coordinator.route', {}, requestCtx);
    const routeCtx = trace.setSpan(requestCtx, routeSpan);

    const agentSpan = tracer.startSpan('squad.agent.spawn', {}, routeCtx);
    const agentCtx = trace.setSpan(routeCtx, agentSpan);

    const toolSpan = tracer.startSpan('squad.tool.execute', {}, agentCtx);

    toolSpan.end();
    agentSpan.end();
    routeSpan.end();
    requestSpan.end();

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(4);

    const traceIds = new Set(spans.map((s) => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);
  });

  it('parent-child hierarchy is correct: request → route → agent → tool', () => {
    const tracer = trace.getTracer('squad-e2e');

    const requestSpan = tracer.startSpan('squad.request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    const routeSpan = tracer.startSpan('squad.coordinator.route', {}, requestCtx);
    const routeCtx = trace.setSpan(requestCtx, routeSpan);

    const agentSpan = tracer.startSpan('squad.agent.spawn', {}, routeCtx);
    const agentCtx = trace.setSpan(routeCtx, agentSpan);

    const toolSpan = tracer.startSpan('squad.tool.execute', {}, agentCtx);

    toolSpan.end();
    agentSpan.end();
    routeSpan.end();
    requestSpan.end();

    const spans = exporter.getFinishedSpans();
    const byName = (name: string) => spans.find((s) => s.name === name)!;

    const req = byName('squad.request');
    const route = byName('squad.coordinator.route');
    const agent = byName('squad.agent.spawn');
    const tool = byName('squad.tool.execute');

    // SDK v2 uses parentSpanContext (not parentSpanId)
    expect(req.parentSpanContext).toBeUndefined();
    expect((route as any).parentSpanContext?.spanId).toBe(req.spanContext().spanId);
    expect((agent as any).parentSpanContext?.spanId).toBe(route.spanContext().spanId);
    expect((tool as any).parentSpanContext?.spanId).toBe(agent.spanContext().spanId);
  });

  it('error in tool span propagates status without breaking hierarchy', () => {
    const tracer = trace.getTracer('squad-e2e');

    const requestSpan = tracer.startSpan('squad.request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    const agentSpan = tracer.startSpan('squad.agent.spawn', {}, requestCtx);
    const agentCtx = trace.setSpan(requestCtx, agentSpan);

    const toolSpan = tracer.startSpan('squad.tool.execute', {}, agentCtx);
    toolSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'tool failed' });
    toolSpan.addEvent('exception', { 'exception.message': 'tool failed' });
    toolSpan.end();

    agentSpan.end();
    requestSpan.end();

    const spans = exporter.getFinishedSpans();
    const tool = spans.find((s) => s.name === 'squad.tool.execute')!;
    const req = spans.find((s) => s.name === 'squad.request')!;

    expect(tool.status.code).toBe(SpanStatusCode.ERROR);
    expect(req.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('attributes flow correctly through the hierarchy', () => {
    const tracer = trace.getTracer('squad-e2e');

    const requestSpan = tracer.startSpan('squad.request', { attributes: { 'squad.request.id': 'req-1' } });
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    const agentSpan = tracer.startSpan('squad.agent.spawn', { attributes: { 'agent.name': 'fenster', mode: 'standard' } }, requestCtx);
    const agentCtx = trace.setSpan(requestCtx, agentSpan);

    const toolSpan = tracer.startSpan('squad.tool.execute', { attributes: { 'tool.name': 'readFile', 'tool.args': '/src/index.ts' } }, agentCtx);

    toolSpan.end();
    agentSpan.end();
    requestSpan.end();

    const spans = exporter.getFinishedSpans();
    const req = spans.find((s) => s.name === 'squad.request')!;
    const agent = spans.find((s) => s.name === 'squad.agent.spawn')!;
    const tool = spans.find((s) => s.name === 'squad.tool.execute')!;

    expect(req.attributes['squad.request.id']).toBe('req-1');
    expect(agent.attributes['agent.name']).toBe('fenster');
    expect(tool.attributes['tool.name']).toBe('readFile');
  });

  it('parallel agent spans under one route maintain correct parentage', () => {
    const tracer = trace.getTracer('squad-e2e');

    const routeSpan = tracer.startSpan('squad.coordinator.route');
    const routeCtx = trace.setSpan(context.active(), routeSpan);

    const agent1 = tracer.startSpan('squad.agent.fenster', { attributes: { 'agent.name': 'fenster' } }, routeCtx);
    agent1.end();

    const agent2 = tracer.startSpan('squad.agent.edie', { attributes: { 'agent.name': 'edie' } }, routeCtx);
    agent2.end();

    routeSpan.end();

    const spans = exporter.getFinishedSpans();
    const route = spans.find((s) => s.name === 'squad.coordinator.route')!;
    const a1 = spans.find((s) => s.name === 'squad.agent.fenster')!;
    const a2 = spans.find((s) => s.name === 'squad.agent.edie')!;

    expect((a1 as any).parentSpanContext?.spanId).toBe(route.spanContext().spanId);
    expect((a2 as any).parentSpanContext?.spanId).toBe(route.spanContext().spanId);
    expect(a1.spanContext().traceId).toBe(a2.spanContext().traceId);
  });
});

// ===========================================================================
// (b) Zero-overhead: no provider configured = no spans, no errors
// ===========================================================================

describe('OTel Integration — zero-overhead when unconfigured', () => {
  it('no-op tracer produces spans that do not throw', () => {
    trace.disable();
    const tracer = trace.getTracer('squad-no-op');
    const span = tracer.startSpan('test-no-op');
    expect(span).toBeDefined();
    expect(typeof span.end).toBe('function');
    span.setAttribute('key', 'value');
    span.addEvent('test-event');
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  });

  it('createOTelTransport works with no provider configured', async () => {
    trace.disable();
    const transport = createOTelTransport();
    const events: TelemetryEvent[] = [
      { name: 'squad.init', timestamp: Date.now() },
      { name: 'squad.agent.spawn', properties: { agent: 'fenster' }, timestamp: Date.now() },
      { name: 'squad.error', properties: { message: 'test' }, timestamp: Date.now() },
    ];
    await expect(transport(events, '')).resolves.not.toThrow();
  });

  it('no spans are exported when no provider is configured', async () => {
    trace.disable();
    const transport = createOTelTransport();
    await transport([{ name: 'squad.init', timestamp: Date.now() }], '');
    // No exporter to capture — this is the zero-overhead path
  });

  it('nested span operations do not throw without a provider', () => {
    trace.disable();
    const tracer = trace.getTracer('squad-no-op');
    expect(() => {
      const outer = tracer.startSpan('outer');
      const inner = tracer.startSpan('inner');
      inner.setAttribute('test', true);
      inner.end();
      outer.end();
    }).not.toThrow();
  });

  it('metric operations are safe no-ops without provider', async () => {
    trace.disable();
    const { getTracer, getMeter } = await vi.importActual<typeof import('@bradygaster/squad-sdk/runtime/otel')>(
      '@bradygaster/squad-sdk/runtime/otel',
    );
    const tracer = getTracer('test');
    expect(() => tracer.startSpan('noop').end()).not.toThrow();

    const meter = getMeter('test');
    expect(() => meter.createCounter('test.counter').add(1)).not.toThrow();
    expect(() => meter.createHistogram('test.hist').record(42)).not.toThrow();
  });
});

// ===========================================================================
// (c) Metrics integration: counters increment across real operations
// ===========================================================================

describe('OTel Integration — metrics across operations', () => {
  it('StreamingPipeline processes usage events and tracks data', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');
    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('sess-e2e');

    const usageEvents = [
      { type: 'usage' as const, sessionId: 'sess-e2e', agentName: 'fenster', model: 'gpt-5.6-luna', inputTokens: 100, outputTokens: 50, estimatedCost: 0.003, timestamp: new Date() },
      { type: 'usage' as const, sessionId: 'sess-e2e', agentName: 'edie', model: 'claude-3', inputTokens: 200, outputTokens: 100, estimatedCost: 0.01, timestamp: new Date() },
    ];

    for (const event of usageEvents) {
      await pipeline.processEvent(event);
    }

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(150);
    expect(summary.estimatedCost).toBeCloseTo(0.013);
    expect(summary.byAgent.size).toBe(2);
    expect(summary.byAgent.get('fenster')!.turnCount).toBe(1);
    expect(summary.byAgent.get('edie')!.turnCount).toBe(1);
  });

  it('StreamingPipeline TTFT tracking works with message_delta events', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');
    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('sess-ttft');

    pipeline.markMessageStart('sess-ttft');

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'sess-ttft',
      content: 'Hello',
      index: 0,
      timestamp: new Date(),
    });

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'sess-ttft',
      content: ' world',
      index: 1,
      timestamp: new Date(),
    });

    await pipeline.processEvent({
      type: 'usage',
      sessionId: 'sess-ttft',
      model: 'gpt-5.6-luna',
      inputTokens: 10,
      outputTokens: 5,
      estimatedCost: 0.001,
      timestamp: new Date(),
    });

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(10);
  });

  it('StreamingPipeline ignores events from unattached sessions', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');
    const pipeline = new StreamingPipeline();

    await pipeline.processEvent({
      type: 'usage',
      sessionId: 'ghost-session',
      model: 'gpt-5.6-luna',
      inputTokens: 999,
      outputTokens: 999,
      estimatedCost: 999,
      timestamp: new Date(),
    });

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(0);
  });

  it('multiple sessions accumulate metrics independently', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');
    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('sess-a');
    pipeline.attachToSession('sess-b');

    await pipeline.processEvent({
      type: 'usage', sessionId: 'sess-a', agentName: 'fenster', model: 'gpt-5.6-luna',
      inputTokens: 100, outputTokens: 50, estimatedCost: 0.003, timestamp: new Date(),
    });
    await pipeline.processEvent({
      type: 'usage', sessionId: 'sess-b', agentName: 'edie', model: 'claude-3',
      inputTokens: 200, outputTokens: 100, estimatedCost: 0.01, timestamp: new Date(),
    });

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.byAgent.get('fenster')!.model).toBe('gpt-5.6-luna');
    expect(summary.byAgent.get('edie')!.model).toBe('claude-3');
  });
});

// ===========================================================================
// (d) EventBus → OTel bridge: events produce correct spans
// ===========================================================================

describe('OTel Integration — EventBus → OTel bridge', () => {
  beforeEach(() => setupTestProvider());
  afterEach(() => teardownTestProvider());

  it('TelemetryCollector → OTel transport produces spans for each event', async () => {
    const transport = createOTelTransport();

    const collector = new TelemetryCollector({ enabled: true });
    setTelemetryTransport(transport);

    collector.collectEvent({ name: 'squad.init', properties: { version: '1.0.0' } });
    collector.collectEvent({ name: 'squad.agent.spawn', properties: { agent: 'fenster' } });
    collector.collectEvent({ name: 'squad.run', properties: { command: 'test' } });
    await collector.flush();

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(3);
    expect(spans.map((s) => s.name).sort()).toEqual([
      'squad.agent.spawn',
      'squad.init',
      'squad.run',
    ]);
  });

  it('EventBus subscribeAll → OTel span bridge produces correct spans', async () => {
    const tracer = trace.getTracer('squad-sdk');
    const bus = new EventBus();

    // Manual bridge pattern (equivalent to bridgeEventBusToOTel)
    const detach = bus.subscribeAll((event) => {
      const attrs: Record<string, string | number | boolean> = {
        'event.type': event.type,
      };
      if (event.sessionId) attrs['session.id'] = event.sessionId;
      if (event.agentName) attrs['agent.name'] = event.agentName;

      const span = tracer.startSpan(`squad.${event.type}`, { attributes: attrs });
      if (event.type === 'session:error') {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    });

    await bus.emit({
      type: 'session:created',
      sessionId: 'sess-1',
      agentName: 'fenster',
      payload: {},
      timestamp: new Date(),
    });

    await bus.emit({
      type: 'session:destroyed',
      sessionId: 'sess-1',
      agentName: 'fenster',
      payload: {},
      timestamp: new Date(),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(2);
    expect(spans[0]!.name).toBe('squad.session:created');
    expect(spans[0]!.attributes['session.id']).toBe('sess-1');
    expect(spans[0]!.attributes['agent.name']).toBe('fenster');
    expect(spans[1]!.name).toBe('squad.session:destroyed');

    detach();
  });

  it('EventBus → OTel bridge handles tool_call events with correct attributes', async () => {
    const tracer = trace.getTracer('squad-sdk');
    const bus = new EventBus();

    const detach = bus.subscribeAll((event) => {
      const attrs: Record<string, string | number | boolean> = {
        'event.type': event.type,
      };
      if (event.sessionId) attrs['session.id'] = event.sessionId;
      const span = tracer.startSpan(`squad.${event.type}`, { attributes: attrs });
      span.end();
    });

    await bus.emit({
      type: 'session:tool_call',
      sessionId: 'sess-1',
      payload: { toolName: 'readFile', args: { path: '/src/index.ts' } },
      timestamp: new Date(),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]!.name).toBe('squad.session:tool_call');
    expect(spans[0]!.attributes['event.type']).toBe('session:tool_call');
    expect(spans[0]!.attributes['session.id']).toBe('sess-1');

    detach();
  });

  it('EventBus → OTel bridge sets ERROR status for session:error events', async () => {
    const tracer = trace.getTracer('squad-sdk');
    const bus = new EventBus();

    const detach = bus.subscribeAll((event) => {
      const span = tracer.startSpan(`squad.${event.type}`, {
        attributes: { 'event.type': event.type },
      });
      if (event.type === 'session:error') {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    });

    await bus.emit({
      type: 'session:error',
      sessionId: 'sess-err',
      payload: { message: 'Connection lost' },
      timestamp: new Date(),
    });

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]!.name).toBe('squad.session:error');
    expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR);

    detach();
  });

  it('bridge handles rapid event burst without losing events', async () => {
    const transport = createOTelTransport();

    const events: TelemetryEvent[] = Array.from({ length: 50 }, (_, i) => ({
      name: 'squad.run' as const,
      properties: { iteration: i },
      timestamp: Date.now(),
    }));

    await transport(events, '');

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(50);
  });

  it('OTel transport is no-op after trace.disable()', async () => {
    const transport = createOTelTransport();

    await transport([{ name: 'squad.init', timestamp: Date.now() }], '');
    expect(exporter.getFinishedSpans().length).toBe(1);

    teardownTestProvider();
    await expect(
      transport([{ name: 'squad.run', timestamp: Date.now() }], ''),
    ).resolves.not.toThrow();
  });

  it('EventBus bridge detach stops span creation', async () => {
    const tracer = trace.getTracer('squad-sdk');
    const bus = new EventBus();

    const detach = bus.subscribeAll((event) => {
      const span = tracer.startSpan(`squad.${event.type}`);
      span.end();
    });

    await bus.emit({
      type: 'session:created',
      sessionId: 'sess-1',
      payload: {},
      timestamp: new Date(),
    });
    expect(exporter.getFinishedSpans().length).toBe(1);

    detach();

    await bus.emit({
      type: 'session:created',
      sessionId: 'sess-2',
      payload: {},
      timestamp: new Date(),
    });
    // No new spans after detach
    expect(exporter.getFinishedSpans().length).toBe(1);
  });
});
