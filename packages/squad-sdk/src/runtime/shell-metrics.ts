/**
 * Shell Observability Metrics (Issues #508, #520, #526, #530, #531)
 *
 * Provides user-facing shell metrics: session lifetime, agent response
 * latency (time to first visible token), error rate, and session count.
 * No-op when SQUAD_TELEMETRY !== '1' or OTel is not configured.
 *
 * Privacy-first: opt-in via SQUAD_TELEMETRY=1 env var. No PII collected.
 *
 * @module runtime/shell-metrics
 */

import { getMeter } from './otel.js';

// ============================================================================
// Types
// ============================================================================

interface ShellMetrics {
  sessionDuration: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  agentLatency: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  errorCount: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  sessionCount: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
}

// ============================================================================
// Internal state
// ============================================================================

let _metrics: ShellMetrics | undefined;
let _enabled = false;

// ============================================================================
// Opt-in gate
// ============================================================================

/** Check if shell telemetry is opt-in enabled via SQUAD_TELEMETRY=1. */
export function isShellTelemetryEnabled(): boolean {
  return process.env['SQUAD_TELEMETRY'] === '1';
}

function ensureMetrics(): ShellMetrics | undefined {
  if (!_enabled) return undefined;
  if (!_metrics) {
    const meter = getMeter('squad-shell');
    _metrics = {
      sessionDuration: meter.createHistogram('squad.shell.session_duration_ms', {
        description: 'Shell session duration in milliseconds',
        unit: 'ms',
      }),
      agentLatency: meter.createHistogram('squad.shell.agent_response_latency_ms', {
        description: 'Time from message send to first response token in milliseconds',
        unit: 'ms',
      }),
      errorCount: meter.createCounter('squad.shell.error_count', {
        description: 'Total errors during shell session',
      }),
      sessionCount: meter.createCounter('squad.shell.session_count', {
        description: 'Total shell sessions started',
      }),
    };
  }
  return _metrics;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Enable shell metrics collection. Call once at shell startup.
 * Always enabled when OTel is configured; SQUAD_TELEMETRY=1 also enables.
 * Returns true if metrics were enabled.
 */
export function enableShellMetrics(): boolean {
  const hasOTel = !!process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!hasOTel && !isShellTelemetryEnabled()) return false;
  _enabled = true;
  const m = ensureMetrics();
  m?.sessionCount.add(1);
  return true;
}

/** Record the final session duration when the shell exits. */
export function recordShellSessionDuration(durationMs: number): void {
  ensureMetrics()?.sessionDuration.record(durationMs);
}

/**
 * Record agent response latency — time from message dispatch to first
 * visible response token. Attributes include agent name and dispatch type.
 */
export function recordAgentResponseLatency(
  agentName: string,
  latencyMs: number,
  dispatchType: 'direct' | 'coordinator' = 'direct',
): void {
  ensureMetrics()?.agentLatency.record(latencyMs, {
    'agent.name': agentName,
    'dispatch.type': dispatchType,
  });
}

/**
 * Record an error encountered during the shell session.
 * Attributes include error source context.
 */
export function recordShellError(source: string, errorType?: string): void {
  ensureMetrics()?.errorCount.add(1, {
    'error.source': source,
    ...(errorType ? { 'error.type': errorType } : {}),
  });
}

// ============================================================================
// Reset (for testing)
// ============================================================================

/** Reset all cached metric instances and state. Used in tests only. */
export function _resetShellMetrics(): void {
  _metrics = undefined;
  _enabled = false;
}
