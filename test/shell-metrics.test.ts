/**
 * Shell Observability Metrics Tests — Issues #508, #520, #526, #530, #531
 *
 * Tests for shell-level metrics: session duration, agent response latency,
 * error count, and session count. Verifies opt-in gating via SQUAD_TELEMETRY=1.
 *
 * Strategy: Mock getMeter() from the otel provider to return a spy-enabled
 * meter so we can verify every .add() / .record() call with correct attributes.
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

// Import after mock setup — CLI shim re-exports from SDK
import {
  enableShellMetrics,
  recordShellSessionDuration,
  recordAgentResponseLatency,
  recordShellError,
  isShellTelemetryEnabled,
  _resetShellMetrics,
} from '@bradygaster/squad-cli/shell/shell-metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInstrument(name: string): SpyInstrument {
  const inst = spyMeter._instruments.get(name);
  if (!inst) throw new Error(`No instrument created for "${name}". Created: ${[...spyMeter._instruments.keys()].join(', ')}`);
  return inst;
}

// =============================================================================
// Setup / Teardown
// =============================================================================

let originalEnv: string | undefined;

beforeEach(() => {
  spyMeter = createSpyMeter();
  _resetShellMetrics();
  originalEnv = process.env['SQUAD_TELEMETRY'];
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env['SQUAD_TELEMETRY'];
  } else {
    process.env['SQUAD_TELEMETRY'] = originalEnv;
  }
});

// =============================================================================
// Opt-in gating — SQUAD_TELEMETRY=1
// =============================================================================

describe('Shell Metrics — Opt-in Gate', () => {
  it('isShellTelemetryEnabled returns false when SQUAD_TELEMETRY is not set', () => {
    delete process.env['SQUAD_TELEMETRY'];
    expect(isShellTelemetryEnabled()).toBe(false);
  });

  it('isShellTelemetryEnabled returns true when SQUAD_TELEMETRY=1', () => {
    process.env['SQUAD_TELEMETRY'] = '1';
    expect(isShellTelemetryEnabled()).toBe(true);
  });

  it('isShellTelemetryEnabled returns false for other values', () => {
    process.env['SQUAD_TELEMETRY'] = 'true';
    expect(isShellTelemetryEnabled()).toBe(false);
    process.env['SQUAD_TELEMETRY'] = '0';
    expect(isShellTelemetryEnabled()).toBe(false);
  });

  it('enableShellMetrics returns false and creates no instruments when disabled', () => {
    delete process.env['SQUAD_TELEMETRY'];
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    const result = enableShellMetrics();
    expect(result).toBe(false);
    expect(spyMeter.createCounter).not.toHaveBeenCalled();
    expect(spyMeter.createHistogram).not.toHaveBeenCalled();
  });

  it('enableShellMetrics returns true when SQUAD_TELEMETRY=1', () => {
    process.env['SQUAD_TELEMETRY'] = '1';
    const result = enableShellMetrics();
    expect(result).toBe(true);
  });

  it('metrics functions are no-ops when not enabled', () => {
    delete process.env['SQUAD_TELEMETRY'];
    // Should not throw even without enabling
    recordShellSessionDuration(5000);
    recordAgentResponseLatency('fenster', 1200);
    recordShellError('dispatch');
    expect(spyMeter.createCounter).not.toHaveBeenCalled();
  });
});

// =============================================================================
// #508 / #520 — Session Lifetime Metrics
// =============================================================================

describe('Shell Metrics — Session Lifetime (#508, #520)', () => {
  beforeEach(() => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
  });

  it('enableShellMetrics increments session_count', () => {
    const counter = getInstrument('squad.shell.session_count');
    expect(counter.add).toHaveBeenCalledWith(1);
  });

  it('recordShellSessionDuration records to the histogram', () => {
    recordShellSessionDuration(120000);
    const hist = getInstrument('squad.shell.session_duration_ms');
    expect(hist.record).toHaveBeenCalledWith(120000);
  });

  it('session_duration_ms histogram has correct config', () => {
    expect(spyMeter.createHistogram).toHaveBeenCalledWith(
      'squad.shell.session_duration_ms',
      expect.objectContaining({ unit: 'ms' }),
    );
  });
});

// =============================================================================
// #508 / #526 — Agent Response Latency
// =============================================================================

describe('Shell Metrics — Agent Response Latency (#508, #526)', () => {
  beforeEach(() => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
  });

  it('recordAgentResponseLatency records with agent name and dispatch type', () => {
    recordAgentResponseLatency('fenster', 850, 'direct');
    const hist = getInstrument('squad.shell.agent_response_latency_ms');
    expect(hist.record).toHaveBeenCalledWith(850, {
      'agent.name': 'fenster',
      'dispatch.type': 'direct',
    });
  });

  it('defaults dispatch type to direct', () => {
    recordAgentResponseLatency('keaton', 500);
    const hist = getInstrument('squad.shell.agent_response_latency_ms');
    expect(hist.record).toHaveBeenCalledWith(500, {
      'agent.name': 'keaton',
      'dispatch.type': 'direct',
    });
  });

  it('records coordinator dispatch type', () => {
    recordAgentResponseLatency('coordinator', 1200, 'coordinator');
    const hist = getInstrument('squad.shell.agent_response_latency_ms');
    expect(hist.record).toHaveBeenCalledWith(1200, {
      'agent.name': 'coordinator',
      'dispatch.type': 'coordinator',
    });
  });
});

// =============================================================================
// #530 — Error Rate Tracking
// =============================================================================

describe('Shell Metrics — Error Rate (#530)', () => {
  beforeEach(() => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
  });

  it('recordShellError increments error_count with source', () => {
    recordShellError('agent_dispatch', 'fenster');
    const counter = getInstrument('squad.shell.error_count');
    expect(counter.add).toHaveBeenCalledWith(1, {
      'error.source': 'agent_dispatch',
      'error.type': 'fenster',
    });
  });

  it('recordShellError works without optional error type', () => {
    recordShellError('coordinator_dispatch');
    const counter = getInstrument('squad.shell.error_count');
    expect(counter.add).toHaveBeenCalledWith(1, {
      'error.source': 'coordinator_dispatch',
    });
  });

  it('multiple errors accumulate', () => {
    recordShellError('dispatch', 'Error');
    recordShellError('dispatch', 'TypeError');
    recordShellError('agent_dispatch', 'keaton');
    const counter = getInstrument('squad.shell.error_count');
    expect(counter.add).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// #531 — Session Count (Retention Proxy)
// =============================================================================

describe('Shell Metrics — Session Count / Retention (#531)', () => {
  it('each enableShellMetrics call increments session_count', () => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
    const counter = getInstrument('squad.shell.session_count');
    expect(counter.add).toHaveBeenCalledWith(1);
    expect(counter.add).toHaveBeenCalledTimes(1);
  });

  it('creates all four metric instruments', () => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
    expect(spyMeter.createHistogram).toHaveBeenCalledTimes(2); // duration + latency
    expect(spyMeter.createCounter).toHaveBeenCalledTimes(2);   // error_count + session_count
  });
});

// =============================================================================
// Reset
// =============================================================================

describe('Shell Metrics — Reset', () => {
  it('_resetShellMetrics clears cached instruments', () => {
    process.env['SQUAD_TELEMETRY'] = '1';
    enableShellMetrics();
    expect(spyMeter.createCounter).toHaveBeenCalled();

    // Reset and re-create meter
    _resetShellMetrics();
    spyMeter = createSpyMeter();

    // After reset, metrics should be no-ops again (not enabled)
    recordShellSessionDuration(1000);
    expect(spyMeter.createHistogram).not.toHaveBeenCalled();
  });
});
