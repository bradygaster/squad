/**
 * OpenTelemetry Provider Initialization (Issue #255)
 *
 * Configures TracerProvider and MeterProvider with OTLP gRPC exporters.
 * Disabled by default — activates only when explicit config or
 * OTEL_EXPORTER_OTLP_ENDPOINT env var is present.
 *
 * @module runtime/otel
 */

import { trace, metrics, diag, DiagConsoleLogger, DiagLogLevel, type Tracer, type Meter } from './otel-api.js';
import { createRequire } from 'node:module';

// ============================================================================
// Types
// ============================================================================

/** Configuration for OTel initialization. */
export interface OTelConfig {
  /** OTLP endpoint URL (e.g. http://localhost:4317) */
  endpoint?: string;
  /** Service name override (default: 'squad-sdk') */
  serviceName?: string;
  /** Enable debug diagnostics */
  debug?: boolean;
  /** Execution mode tag — added as `squad.mode` resource attribute (e.g. 'cli', 'copilot-agent') */
  mode?: string;
}

// ============================================================================
// Internal state
// ============================================================================

let _sdk: { start(): void; shutdown(): Promise<void> } | undefined;
let _tracingActive = false;
let _metricsActive = false;

// ============================================================================
// Helpers
// ============================================================================

function resolveEndpoint(config?: OTelConfig): string | undefined {
  return config?.endpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? undefined;
}

function buildResource(config?: OTelConfig, resourceFromAttributes?: any): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!resourceFromAttributes) return undefined;
  const req = createRequire(import.meta.url);
  let version = 'unknown';
  try {
    const pkg = req('../../package.json');
    version = pkg.version;
  } catch {
    // package.json not resolvable — use fallback
  }

  const attrs: Record<string, string> = {
    'service.name': config?.serviceName ?? 'squad-sdk',
    'squad.version': version,
  };
  if (config?.mode) {
    attrs['squad.mode'] = config.mode;
  }
  return resourceFromAttributes(attrs);
}

function ensureSDK(config?: OTelConfig): void {
  if (_sdk) return;

  const endpoint = resolveEndpoint(config);
  if (!endpoint) return;

  // Lazy-load optional OTel SDK packages via createRequire (#247)
  const req = createRequire(import.meta.url);
  let NodeSDK: any, resourceFromAttributes: any, PeriodicExportingMetricReader: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let OTLPTraceExporter: any, OTLPMetricExporter: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const sdkNode = req('@opentelemetry/sdk-node');
    NodeSDK = sdkNode.NodeSDK;
    resourceFromAttributes = sdkNode.resources.resourceFromAttributes;
    PeriodicExportingMetricReader = sdkNode.metrics.PeriodicExportingMetricReader;
    OTLPTraceExporter = req('@opentelemetry/exporter-trace-otlp-grpc').OTLPTraceExporter;
    OTLPMetricExporter = req('@opentelemetry/exporter-metrics-otlp-grpc').OTLPMetricExporter;
  } catch {
    // Optional SDK packages not installed — telemetry stays disabled
    if (config?.debug || process.env['SQUAD_DEBUG'] === '1') {
      console.error('[squad-otel] Optional OTel SDK packages not available. Telemetry disabled.');
    }
    return;
  }

  const debugMode = config?.debug || process.env['SQUAD_DEBUG'] === '1';
  if (debugMode) {
    diag.setLogger(new DiagConsoleLogger(), config?.debug ? DiagLogLevel.DEBUG : DiagLogLevel.WARN);
  }

  const resource = buildResource(config, resourceFromAttributes);

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
      exportIntervalMillis: 30_000,
    }),
  });

  try {
    sdk.start();
    _sdk = sdk;
  } catch (err) {
    if (debugMode) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[squad-otel] SDK start failed: ${msg}`);
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the TracerProvider with an OTLP gRPC exporter.
 * Returns `true` if a provider was registered, `false` if disabled.
 */
export function initializeTracing(config?: OTelConfig): boolean {
  const endpoint = resolveEndpoint(config);
  if (!endpoint) return false;

  ensureSDK(config);
  _tracingActive = true;
  return true;
}

/**
 * Initialize the MeterProvider with an OTLP gRPC exporter.
 * Returns `true` if a provider was registered, `false` if disabled.
 */
export function initializeMetrics(config?: OTelConfig): boolean {
  const endpoint = resolveEndpoint(config);
  if (!endpoint) return false;

  ensureSDK(config);
  _metricsActive = true;
  return true;
}

/**
 * Convenience wrapper — initializes both tracing and metrics.
 * Returns an object indicating which subsystems were activated.
 */
export function initializeOTel(config?: OTelConfig): { tracing: boolean; metrics: boolean } {
  return {
    tracing: initializeTracing(config),
    metrics: initializeMetrics(config),
  };
}

/**
 * Flush pending telemetry and shut down providers.
 * Safe to call even if OTel was never initialized.
 */
export async function shutdownOTel(): Promise<void> {
  if (_sdk) {
    try {
      await _sdk.shutdown();
    } catch (err) {
      if (process.env['SQUAD_DEBUG'] === '1') {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[squad-otel] Shutdown/flush error: ${msg}`);
      }
    }
    _sdk = undefined;
  }
  _tracingActive = false;
  _metricsActive = false;
}

/**
 * Return a Tracer instance. Falls back to the no-op tracer when
 * tracing has not been initialized.
 */
export function getTracer(name = 'squad-sdk'): Tracer {
  return trace.getTracer(name);
}

/**
 * Return a Meter instance. Falls back to the no-op meter when
 * metrics have not been initialized.
 */
export function getMeter(name = 'squad-sdk'): Meter {
  return metrics.getMeter(name);
}
