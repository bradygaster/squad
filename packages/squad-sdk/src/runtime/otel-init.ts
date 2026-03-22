/**
 * High-Level OTel Initialization (Issue #266)
 *
 * One-call setup that wires OTel providers, the EventBus bridge, and
 * the TelemetryCollector transport in a single invocation. Consumers
 * who don't use OTel pay nothing — if no provider is registered all
 * instrumentation is a no-op.
 *
 * Issue #281 additions: auto-creates EventBus and CostTracker so users
 * just call `initSquadTelemetry()` and everything lights up.
 *
 * @module runtime/otel-init
 */

import type { OTelConfig } from './otel.js';
import { EventBus } from './event-bus.js';
import type { UnsubscribeFn } from './event-bus.js';
import { CostTracker } from './cost-tracker.js';
import { initializeOTel, shutdownOTel } from './otel.js';
import { bridgeEventBusToOTel, createOTelTransport } from './otel-bridge.js';
import { setTelemetryTransport } from './telemetry.js';

// ============================================================================
// Types
// ============================================================================

/** Options for the high-level {@link initSquadTelemetry} helper. */
export interface SquadTelemetryOptions extends OTelConfig {
  /**
   * When provided, this EventBus is used instead of auto-creating one.
   * All EventBus events are automatically forwarded as OTel spans
   * via {@link bridgeEventBusToOTel}.
   */
  eventBus?: EventBus;

  /**
   * When `true`, the OTel-backed TelemetryTransport is registered
   * as the active transport for {@link TelemetryCollector}.
   * @default true
   */
  installTransport?: boolean;
}

/** Handle returned by {@link initSquadTelemetry} for lifecycle control. */
export interface SquadTelemetryHandle {
  /** Whether tracing was activated. */
  tracing: boolean;
  /** Whether metrics were activated. */
  metrics: boolean;
  /** The EventBus instance (auto-created or user-supplied). */
  eventBus: EventBus;
  /** The CostTracker wired to the EventBus. */
  costTracker: CostTracker;
  /**
   * Flush pending telemetry, detach the EventBus bridge (if any),
   * and shut down OTel providers. Safe to call multiple times.
   */
  shutdown: () => Promise<void>;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * One-call OTel setup for Squad SDK consumers.
 *
 * This is the **high-level** entry point. It:
 * 1. Auto-creates an {@link EventBus} (or uses one you supply).
 * 2. Auto-creates a {@link CostTracker} wired to the EventBus.
 * 3. Initializes tracing and metrics via `initializeOTel()`.
 * 4. Bridges the EventBus so every Squad event becomes an OTel span.
 * 5. Optionally installs an OTel-backed `TelemetryTransport` so
 *    the existing `TelemetryCollector` pipeline emits spans too.
 *
 * If no `OTEL_EXPORTER_OTLP_ENDPOINT` env var is set **and** no
 * `endpoint` is provided in `options`, everything remains a no-op.
 *
 * @param options - Configuration and optional EventBus.
 * @returns A handle with `eventBus`, `costTracker`, status booleans,
 *          and a `shutdown()` method for graceful cleanup.
 *
 * @example
 * ```ts
 * import { initSquadTelemetry } from 'squad-sdk';
 *
 * const telemetry = initSquadTelemetry();
 * // That's it. Everything lights up.
 *
 * // Later:
 * console.log(telemetry.costTracker.formatSummary());
 * await telemetry.shutdown();
 * ```
 */
export function initSquadTelemetry(options: SquadTelemetryOptions = {}): SquadTelemetryHandle {
  const { eventBus: userBus, installTransport = true, ...otelConfig } = options;

  // Auto-create EventBus if caller didn't supply one
  const eventBus = userBus ?? new EventBus();

  // Auto-create and wire CostTracker to the EventBus
  const costTracker = new CostTracker();
  const unwireCostTracker = costTracker.wireToEventBus(eventBus);

  const result = initializeOTel(otelConfig);

  // Bridge EventBus → OTel spans
  const unsubscribeBridge: UnsubscribeFn = bridgeEventBusToOTel(eventBus);

  if (installTransport) {
    setTelemetryTransport(createOTelTransport());
  }

  return {
    tracing: result.tracing,
    metrics: result.metrics,
    eventBus,
    costTracker,
    shutdown: async () => {
      unwireCostTracker();
      unsubscribeBridge();
      await shutdownOTel();
    },
  };
}

/**
 * Convenience wrapper for Copilot agent-mode telemetry.
 *
 * Pre-configures `serviceName` to `'squad-copilot-agent'` and
 * `mode` to `'copilot-agent'` so the two surfaces (CLI vs agent)
 * are distinguishable in dashboards and trace queries.
 *
 * Call this at agent-mode startup; call `handle.shutdown()` on exit.
 *
 * @param options - Additional overrides (endpoint, eventBus, etc.).
 */
export function initAgentModeTelemetry(options: Omit<SquadTelemetryOptions, 'serviceName' | 'mode'> = {}): SquadTelemetryHandle {
  return initSquadTelemetry({
    ...options,
    serviceName: 'squad-copilot-agent',
    mode: 'copilot-agent',
  });
}
