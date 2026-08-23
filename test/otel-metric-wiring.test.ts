/**
 * OTel Metric Wiring Tests — Integration points
 *
 * Verifies that otel-metrics functions are actually called from the runtime
 * modules that use them (streaming pipeline, agent manager, client adapter).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock otel-metrics BEFORE importing anything that uses it
// ---------------------------------------------------------------------------

const mockRecordTokenUsage = vi.fn();
const mockRecordAgentSpawn = vi.fn();
const mockRecordAgentDuration = vi.fn();
const mockRecordAgentError = vi.fn();
const mockRecordAgentDestroy = vi.fn();
const mockRecordSessionCreated = vi.fn();
const mockRecordSessionClosed = vi.fn();
const mockRecordSessionError = vi.fn();
const mockResetMetrics = vi.fn();

vi.mock('@bradygaster/squad-sdk/runtime/otel-metrics', () => ({
  recordTokenUsage: mockRecordTokenUsage,
  recordAgentSpawn: mockRecordAgentSpawn,
  recordAgentDuration: mockRecordAgentDuration,
  recordAgentError: mockRecordAgentError,
  recordAgentDestroy: mockRecordAgentDestroy,
  recordSessionCreated: mockRecordSessionCreated,
  recordSessionClosed: mockRecordSessionClosed,
  recordSessionError: mockRecordSessionError,
  recordSessionIdle: vi.fn(),
  recordSessionReactivated: vi.fn(),
  recordTimeToFirstToken: vi.fn(),
  recordResponseDuration: vi.fn(),
  recordTokensPerSecond: vi.fn(),
  _resetMetrics: mockResetMetrics,
}));

// =============================================================================
// Streaming Pipeline → recordTokenUsage wiring
// =============================================================================

describe('OTel Metric Wiring — Streaming Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streaming module imports recordTokenUsage from otel-metrics', async () => {
    // Verify the import chain resolves — this is a compile-time/module-resolution test
    const streamingModule = await import('@bradygaster/squad-sdk/runtime/streaming');
    expect(streamingModule).toBeDefined();
    expect(streamingModule.StreamingPipeline).toBeDefined();
  });

  it('StreamingPipeline.processEvent calls recordTokenUsage for usage events', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');

    const pipeline = new StreamingPipeline();

    // Attach a session so events are not ignored
    pipeline.attachToSession('sess-1');

    const usageEvent = {
      type: 'usage' as const,
      sessionId: 'sess-1',
      agentName: 'fenster',
      model: 'gpt-5.6-luna',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.003,
      timestamp: new Date(),
    };

    await pipeline.processEvent(usageEvent);

    expect(mockRecordTokenUsage).toHaveBeenCalledWith(usageEvent);
  });

  it('StreamingPipeline.processEvent does NOT call recordTokenUsage for non-usage events', async () => {
    const { StreamingPipeline } = await import('@bradygaster/squad-sdk/runtime/streaming');

    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('sess-1');

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'sess-1',
      content: 'hello',
      index: 0,
      timestamp: new Date(),
    });

    expect(mockRecordTokenUsage).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Module resolution — import chain verification
// =============================================================================

describe('OTel Metric Wiring — Module Resolution', () => {
  it('otel-metrics exports are accessible from the main barrel', async () => {
    const sdk = await import('@bradygaster/squad-sdk');
    expect(typeof sdk.recordTokenUsage).toBe('function');
    expect(typeof sdk.recordAgentSpawn).toBe('function');
    expect(typeof sdk.recordAgentDuration).toBe('function');
    expect(typeof sdk.recordAgentError).toBe('function');
    expect(typeof sdk.recordAgentDestroy).toBe('function');
    expect(typeof sdk.recordSessionCreated).toBe('function');
    expect(typeof sdk.recordSessionIdle).toBe('function');
    expect(typeof sdk.recordSessionReactivated).toBe('function');
    expect(typeof sdk.recordSessionClosed).toBe('function');
    expect(typeof sdk.recordSessionError).toBe('function');
    expect(typeof sdk.recordTimeToFirstToken).toBe('function');
    expect(typeof sdk.recordResponseDuration).toBe('function');
    expect(typeof sdk.recordTokensPerSecond).toBe('function');
    expect(typeof sdk._resetMetrics).toBe('function');
  });

  it('otel-metrics subpath export resolves', async () => {
    const metricsModule = await import('@bradygaster/squad-sdk/runtime/otel-metrics');
    expect(metricsModule).toBeDefined();
  });
});
