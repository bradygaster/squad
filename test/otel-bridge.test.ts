/**
 * OTel Bridge Tests — TelemetryCollector → OpenTelemetry span conversion
 *
 * Tests the OTel bridge module (packages/squad-sdk/src/runtime/otel-bridge.ts).
 * The bridge converts TelemetryEvents into OTel spans via createOTelTransport().
 *
 * Uses InMemorySpanExporter + SimpleSpanProcessor from @opentelemetry/sdk-trace-base
 * to capture and verify spans in-process without a real collector.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { createOTelTransport } from '@bradygaster/squad-sdk/runtime/otel-bridge';
import type { TelemetryEvent } from '@bradygaster/squad-sdk/runtime/telemetry';

// ---------------------------------------------------------------------------
// Test OTel infrastructure
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function setupTestProvider() {
  exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  provider = new BasicTracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);
}

function teardownTestProvider() {
  exporter.reset();
  trace.disable();
  provider.shutdown();
}

// =============================================================================
// createOTelTransport — basic contract
// =============================================================================

describe('OTel Bridge — createOTelTransport()', () => {
  beforeEach(() => setupTestProvider());
  afterEach(() => teardownTestProvider());

  it('returns a function', () => {
    const transport = createOTelTransport();
    expect(typeof transport).toBe('function');
  });

  it('transport accepts TelemetryEvent[] and endpoint without throwing', async () => {
    const transport = createOTelTransport();
    const events: TelemetryEvent[] = [{ name: 'squad.init', timestamp: Date.now() }];
    await expect(transport(events, '')).resolves.not.toThrow();
  });

  it('handles empty event array gracefully', async () => {
    const transport = createOTelTransport();
    await expect(transport([], '')).resolves.not.toThrow();
    expect(exporter.getFinishedSpans().length).toBe(0);
  });
});

// =============================================================================
// Event type mapping — each TelemetryEventName → span
// =============================================================================

describe('OTel Bridge — event type mapping', () => {
  beforeEach(() => setupTestProvider());
  afterEach(() => teardownTestProvider());

  it('converts squad.init event to a span', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.init', properties: { version: '0.8.0' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const initSpan = spans.find((s) => s.name === 'squad.init');
    expect(initSpan).toBeDefined();
  });

  it('converts squad.agent.spawn event to a span', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.agent.spawn', properties: { agent: 'fenster', mode: 'standard' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const spawnSpan = spans.find((s) => s.name === 'squad.agent.spawn');
    expect(spawnSpan).toBeDefined();
  });

  it('converts squad.error event to a span with ERROR status', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.error', properties: { message: 'test error', code: 'ERR_TEST' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const errorSpan = spans.find((s) => s.name === 'squad.error');
    expect(errorSpan).toBeDefined();
    expect(errorSpan!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('converts squad.run event to a span', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.run', properties: { command: 'test' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const runSpan = spans.find((s) => s.name === 'squad.run');
    expect(runSpan).toBeDefined();
  });

  it('converts squad.upgrade event to a span', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.upgrade', properties: { from: '0.7.0', to: '0.8.0' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const upgradeSpan = spans.find((s) => s.name === 'squad.upgrade');
    expect(upgradeSpan).toBeDefined();
  });

  it('maps event properties to span attributes', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.agent.spawn', properties: { agent: 'fenster', mode: 'standard' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const spawnSpan = spans.find((s) => s.name === 'squad.agent.spawn');
    expect(spawnSpan).toBeDefined();
    const attrs = spawnSpan!.attributes;
    expect(attrs['agent']).toBe('fenster');
    expect(attrs['mode']).toBe('standard');
  });

  it('sets event.timestamp attribute from event timestamp', async () => {
    const ts = Date.now();
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.init', timestamp: ts }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const initSpan = spans.find((s) => s.name === 'squad.init');
    expect(initSpan).toBeDefined();
    expect(initSpan!.attributes['event.timestamp']).toBe(ts);
  });

  it('squad.error span includes exception event', async () => {
    const transport = createOTelTransport();
    await transport(
      [{ name: 'squad.error', properties: { message: 'something broke' }, timestamp: Date.now() }],
      '',
    );
    const spans = exporter.getFinishedSpans();
    const errorSpan = spans.find((s) => s.name === 'squad.error');
    expect(errorSpan).toBeDefined();
    const events = errorSpan!.events;
    const exceptionEvent = events.find((e) => e.name === 'exception');
    expect(exceptionEvent).toBeDefined();
  });

  it('processes multiple events in a single batch', async () => {
    const transport = createOTelTransport();
    await transport(
      [
        { name: 'squad.init', timestamp: Date.now() },
        { name: 'squad.run', timestamp: Date.now() },
        { name: 'squad.agent.spawn', properties: { agent: 'edie' }, timestamp: Date.now() },
      ],
      '',
    );
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(3);
    expect(spans.map((s) => s.name).sort()).toEqual(
      ['squad.agent.spawn', 'squad.init', 'squad.run'],
    );
  });
});
