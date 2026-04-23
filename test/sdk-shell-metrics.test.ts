/**
 * SDK Shell Metrics Tests — Batch 7a extraction verification
 *
 * Tests that shell-metrics functions are correctly exported from the SDK
 * at @bradygaster/squad-sdk/runtime/shell-metrics. Mirrors the CLI-side
 * tests but imports from the SDK path to validate the extraction.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

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
  getTracer: vi.fn(),
}));

// Import from SDK path to validate extraction
import {
  enableShellMetrics,
  recordShellSessionDuration,
  recordAgentResponseLatency,
  recordShellError,
  isShellTelemetryEnabled,
  _resetShellMetrics,
} from '@bradygaster/squad-sdk/runtime/shell-metrics';

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  spyMeter = createSpyMeter();
  _resetShellMetrics();
  vi.stubEnv('SQUAD_TELEMETRY', undefined as unknown as string);
  vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', undefined as unknown as string);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// =============================================================================
// Opt-in gating — SQUAD_TELEMETRY=1
// =============================================================================

describe('SDK Shell Metrics — Opt-in Gate', () => {
  it('isShellTelemetryEnabled returns false when SQUAD_TELEMETRY not set', () => {
    expect(isShellTelemetryEnabled()).toBe(false);
  });

  it('isShellTelemetryEnabled returns true when SQUAD_TELEMETRY=1', () => {
    vi.stubEnv('SQUAD_TELEMETRY', '1');
    expect(isShellTelemetryEnabled()).toBe(true);
  });

  it('enableShellMetrics returns false when neither OTel nor telemetry flag set', () => {
    const result = enableShellMetrics();
    expect(result).toBe(false);
  });

  it('enableShellMetrics returns true when SQUAD_TELEMETRY=1', () => {
    vi.stubEnv('SQUAD_TELEMETRY', '1');
    const result = enableShellMetrics();
    expect(result).toBe(true);
  });

  it('enableShellMetrics returns true when OTEL_EXPORTER_OTLP_ENDPOINT is set', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');
    const result = enableShellMetrics();
    expect(result).toBe(true);
  });
});

// =============================================================================
// No-op safety — functions do not throw when not enabled
// =============================================================================

describe('SDK Shell Metrics — No-op Safety', () => {
  it('recordShellSessionDuration does not throw when not enabled', () => {
    expect(() => recordShellSessionDuration(5000)).not.toThrow();
  });

  it('recordAgentResponseLatency does not throw when not enabled', () => {
    expect(() => recordAgentResponseLatency('fenster', 1200)).not.toThrow();
  });

  it('recordShellError does not throw when not enabled', () => {
    expect(() => recordShellError('dispatch')).not.toThrow();
  });
});

// =============================================================================
// Reset
// =============================================================================

describe('SDK Shell Metrics — Reset', () => {
  it('_resetShellMetrics resets state so metrics become no-ops again', () => {
    vi.stubEnv('SQUAD_TELEMETRY', '1');
    enableShellMetrics();
    expect(spyMeter.createCounter).toHaveBeenCalled();

    _resetShellMetrics();
    spyMeter = createSpyMeter();

    // After reset, metrics should be no-ops (not enabled)
    recordShellSessionDuration(1000);
    expect(spyMeter.createHistogram).not.toHaveBeenCalled();
  });
});
