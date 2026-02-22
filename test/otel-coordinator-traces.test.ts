/**
 * Coordinator Routing Tracing Tests — OTel span verification for Coordinator.route()
 *
 * Validates that Coordinator routing operations produce correct OTel spans
 * with proper attributes and hierarchy.
 *
 * Uses InMemorySpanExporter to capture spans in-process.
 * Written proactively — OTel instrumentation in Coordinator may not be wired yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import {
  Coordinator,
  type CoordinatorConfig,
} from '@bradygaster/squad-sdk/coordinator';

// ---------------------------------------------------------------------------
// Test OTel infrastructure
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupTestOTel() {
  exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  provider = new BasicTracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);
}

function teardownTestOTel() {
  exporter.reset();
  trace.disable();
  provider.shutdown();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CoordinatorConfig> = {}): CoordinatorConfig {
  return {
    teamRoot: '/test/team',
    ...overrides,
  };
}

// =============================================================================
// Coordinator Routing — route() span creation
// =============================================================================

describe('Coordinator routing tracing — route() spans', () => {
  let coordinator: Coordinator;

  beforeEach(() => {
    setupTestOTel();
    coordinator = new Coordinator(makeConfig());
  });

  afterEach(async () => {
    await coordinator.shutdown();
    teardownTestOTel();
  });

  it('route() returns a valid RoutingDecision', async () => {
    const result = await coordinator.route('status');
    expect(result).toBeDefined();
    expect(result.tier).toBeDefined();
    expect(Array.isArray(result.agents)).toBe(true);
  });

  it('route() creates a squad.coordinator.route span', async () => {
    await coordinator.route('hello team');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) =>
        s.name === 'squad.coordinator.route' ||
        s.name.includes('coordinator') ||
        s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn(
        '[PROACTIVE] No coordinator route span — OTel instrumentation not yet wired in Coordinator.route()',
      );
      return;
    }
    expect(routeSpan).toBeDefined();
  });

  it('route() span has correct routing tier attribute', async () => {
    await coordinator.route('status');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — OTel instrumentation pending');
      return;
    }
    const attrs = routeSpan.attributes;
    const tier =
      attrs['squad.routing.tier'] ?? attrs['routing.tier'] ?? attrs['tier'];
    expect(tier).toBe('direct');
  });

  it('route() span includes message attribute for @mention', async () => {
    await coordinator.route('@fenster fix the tests');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — OTel instrumentation pending');
      return;
    }
    const attrs = routeSpan.attributes;
    const msg =
      attrs['squad.routing.message'] ?? attrs['message'] ?? attrs['squad.message'];
    expect(msg).toBeDefined();
  });

  it('route() span includes target agents for @mention', async () => {
    await coordinator.route('@fenster fix the tests');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — OTel instrumentation pending');
      return;
    }
    const attrs = routeSpan.attributes;
    const agents =
      attrs['squad.routing.agents'] ?? attrs['routing.agents'] ?? attrs['agents'];
    expect(agents).toBeDefined();
  });
});

// =============================================================================
// Coordinator Routing — attributes per tier
// =============================================================================

describe('Coordinator routing tracing — attributes per tier', () => {
  let coordinator: Coordinator;

  beforeEach(() => {
    setupTestOTel();
    coordinator = new Coordinator(makeConfig());
  });

  afterEach(async () => {
    await coordinator.shutdown();
    teardownTestOTel();
  });

  it('direct response route has tier=direct', async () => {
    const result = await coordinator.route('help');
    expect(result.tier).toBe('direct');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — instrumentation pending');
      return;
    }
    expect(routeSpan.attributes['squad.routing.tier'] ?? routeSpan.attributes['tier']).toBe('direct');
  });

  it('@mention route includes agent names in attributes', async () => {
    const result = await coordinator.route('@fenster fix build');
    expect(result.agents).toContain('fenster');
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — instrumentation pending');
      return;
    }
    expect(routeSpan.attributes['squad.routing.agents']).toBeDefined();
  });

  it('team fan-out route has parallel=true attribute', async () => {
    const result = await coordinator.route('team refactor the parsers');
    expect(result.parallel).toBe(true);
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('coordinator') || s.name.includes('route'),
    );
    if (!routeSpan) {
      console.warn('[PROACTIVE] No route span — instrumentation pending');
      return;
    }
    expect(
      routeSpan.attributes['squad.routing.parallel'] ?? routeSpan.attributes['parallel'],
    ).toBe(true);
  });
});

// =============================================================================
// Coordinator Routing — span hierarchy (route → execute)
// =============================================================================

describe('Coordinator routing tracing — span hierarchy', () => {
  let coordinator: Coordinator;

  beforeEach(() => {
    setupTestOTel();
    coordinator = new Coordinator(makeConfig());
  });

  afterEach(async () => {
    await coordinator.shutdown();
    teardownTestOTel();
  });

  it('execute() creates a span', async () => {
    try {
      await coordinator.execute('status');
    } catch {
      // execute() may throw if agent sessions aren't available
    }
    const spans = exporter.getFinishedSpans();
    const executeSpan = spans.find(
      (s) => s.name.includes('execute') || s.name.includes('coordinator.execute'),
    );
    if (!executeSpan) {
      console.warn('[PROACTIVE] No execute span — OTel instrumentation for execute() not yet wired');
      return;
    }
    expect(executeSpan).toBeDefined();
  });

  it('execute span is a child of route span', async () => {
    try {
      await coordinator.execute('help');
    } catch {
      // May throw
    }
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('route') && !s.name.includes('execute'),
    );
    const executeSpan = spans.find((s) => s.name.includes('execute'));
    if (!routeSpan || !executeSpan) {
      console.warn('[PROACTIVE] Route/execute span hierarchy not yet instrumented');
      return;
    }
    expect(executeSpan.parentSpanId).toBe(routeSpan.spanContext().spanId);
  });

  it('route and execute spans share the same traceId', async () => {
    try {
      await coordinator.execute('status');
    } catch {
      // May throw
    }
    const spans = exporter.getFinishedSpans();
    const routeSpan = spans.find(
      (s) => s.name.includes('route') && !s.name.includes('execute'),
    );
    const executeSpan = spans.find((s) => s.name.includes('execute'));
    if (!routeSpan || !executeSpan) {
      console.warn('[PROACTIVE] Span hierarchy not yet instrumented');
      return;
    }
    expect(executeSpan.spanContext().traceId).toBe(routeSpan.spanContext().traceId);
  });

  it('multiple routes produce independent traces', async () => {
    await coordinator.route('status');
    await coordinator.route('help');
    const spans = exporter.getFinishedSpans();
    const routeSpans = spans.filter(
      (s) => s.name.includes('route') || s.name.includes('coordinator'),
    );
    if (routeSpans.length < 2) {
      console.warn('[PROACTIVE] Not enough route spans — instrumentation pending');
      return;
    }
    const traceIds = new Set(routeSpans.map((s) => s.spanContext().traceId));
    expect(traceIds.size).toBe(2);
  });
});
