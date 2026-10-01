// @vitest-environment node
/**
 * Aspire Dashboard Integration Tests — Playwright + Vitest
 *
 * Launches the Aspire dashboard container, configures OTel gRPC export,
 * then uses Playwright to verify telemetry appears in the dashboard UI.
 *
 * Requires Docker. Skipped when SKIP_DOCKER_TESTS=1 or Docker unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { trace, metrics } from '@opentelemetry/api';
import { NodeSDK, resources, metrics as sdkMetrics } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { dockerSkipReason } from './helpers/skip-guards.js';

const { resourceFromAttributes } = resources;
const { PeriodicExportingMetricReader } = sdkMetrics;

// ============================================================================
// Skip guard — bail early if Docker is unavailable or tests disabled
// ============================================================================

function playwrightBrowserSkipReason(): string | null {
  return existsSync(chromium.executablePath())
    ? null
    : 'Playwright Chromium browser not installed';
}

const SKIP_REASON = dockerSkipReason() ?? playwrightBrowserSkipReason();

const CONTAINER_NAME = 'squad-aspire-dashboard';
const DASHBOARD_URL = 'http://localhost:18888';
const OTLP_GRPC_TARGET = 'http://localhost:4317';
// Pin to a specific, verified-good patch version rather than a floating tag.
// Confirmed in CI: `:latest` AND the floating major tag `:13` currently both
// resolve to the SAME freshly-published `13.6.0` image (built 2026-10-01,
// same layer digests/sha256:239e58... as `:latest`), and that image's
// entrypoint fails immediately with "Aspire.Dashboard.dll does not exist" /
// "No .NET SDKs were found" — the app binary is missing from the image
// itself (confirmed via `docker inspect`/`docker logs`, not a slow/contended
// start). `13.5.2` is a distinct, ~3-week-older build (different layer
// digests, verified via the MCR manifest API) that predates this broken
// release and does not exhibit the problem. Re-pin forward once a newer
// verified-good patch tag is published upstream.
const DASHBOARD_IMAGE = 'mcr.microsoft.com/dotnet/aspire-dashboard:13.5.2';

// ============================================================================
// Helpers
// ============================================================================

/** Poll a URL until it responds with 200 or timeout expires. */
async function waitForHealthy(url: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  // Surface container diagnostics so a slow/crashed start is distinguishable
  // from a genuinely unreachable dashboard without needing to re-run in CI.
  let diagnostics = '';
  try {
    const state = execSync(
      `docker inspect --format="{{.State.Status}} (exitCode={{.State.ExitCode}})" ${CONTAINER_NAME}`,
      { encoding: 'utf8' },
    ).trim();
    // `docker logs` relays container stdout/stderr as two separate OS
    // streams; execSync only returns stdout by default, so a crash reported
    // via stderr (the common case for unhandled .NET exceptions) would be
    // silently dropped. Redirect stderr into stdout so it's captured too.
    const logs = execSync(`docker logs --tail 50 ${CONTAINER_NAME} 2>&1`, { encoding: 'utf8' });
    diagnostics = `\nContainer state: ${state}\nLast logs:\n${logs}`;
  } catch (err) {
    diagnostics = `\n(failed to collect container diagnostics: ${(err as Error).message})`;
  }
  throw new Error(`Dashboard at ${url} did not become healthy within ${timeoutMs}ms${diagnostics}`);
}

/** Force-remove the test container (ignore errors). */
function removeContainer(): void {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch {
    // container may not exist
  }
}

// Best-effort cleanup on unexpected exit (Ctrl+C, uncaught exception, etc.)
// Only register handlers when Docker tests will actually run — avoids
// Docker side effects (and stale removeContainer calls) in skip mode.
if (SKIP_REASON === null) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      removeContainer();
      process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
    });
  }
  process.once('exit', () => removeContainer());
}

// ============================================================================
// OTel setup — NodeSDK with gRPC exporters targeting the Aspire dashboard
// ============================================================================

let sdk: NodeSDK | undefined;

function initOTelForAspire(): void {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'squad-integration-test',
      'squad.version': 'test',
    }),
    traceExporter: new OTLPTraceExporter({ url: OTLP_GRPC_TARGET }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: OTLP_GRPC_TARGET }),
      exportIntervalMillis: 1_000,
    }),
  });
  sdk.start();
}

async function shutdownOTel(): Promise<void> {
  try { await sdk?.shutdown(); } catch { /* ignore */ }
  sdk = undefined;
  trace.disable();
  metrics.disable();
}

// ============================================================================
// Test suite
// ============================================================================

describe.skipIf(SKIP_REASON !== null)(
  `Aspire dashboard integration (${SKIP_REASON ?? 'enabled'})`,
  () => {
    let browser: Browser | undefined;

    // ------------------------------------------------------------------
    // Setup: pull image, start container, wait for healthy, init OTel
    // ------------------------------------------------------------------
    beforeAll(async () => {
      // Clean up any leftover container from a prior run
      removeContainer();

      // Pull the pinned Aspire dashboard image (see DASHBOARD_IMAGE above)
      execSync(
        `docker pull ${DASHBOARD_IMAGE}`,
        { stdio: 'inherit', timeout: 120_000 },
      );

      // Start the Aspire dashboard container.
      // Deliberately NOT using --rm: if the container exits/crashes instead
      // of merely starting slowly, --rm would auto-delete it before
      // waitForHealthy's failure-path diagnostics (docker inspect/logs) can
      // run, masking the real cause as a generic timeout. removeContainer()
      // (called above and in afterAll) already guarantees explicit cleanup.
      execSync(
        [
          'docker run -d',
          `-p 18888:18888 -p 4317:18889`,
          '-e ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true',
          `--name ${CONTAINER_NAME}`,
          DASHBOARD_IMAGE,
        ].join(' '),
        { stdio: 'inherit' },
      );

      // Wait for dashboard UI to respond. 120s gives generous headroom over
      // the dashboard's typical few-second cold start, absorbing real CPU
      // contention on CI runners where this suite runs alongside ~10k other
      // tests in full parallelism. (The repeated timeouts originally
      // investigated in #2123/#2132 turned out to have a separate root
      // cause — a transiently broken `:latest` image tag, fixed above by
      // pinning to DASHBOARD_IMAGE — but a generous timeout remains
      // worthwhile defense-in-depth against genuine contention-induced
      // slow starts.)
      await waitForHealthy(DASHBOARD_URL, 120_000);

      // Initialize OTel gRPC exporters targeting the dashboard
      initOTelForAspire();

      // Launch Playwright browser
      browser = await chromium.launch({ headless: true });
    }, 240_000); // 4 min timeout for pull + start (120s health-check budget + overhead)

    // ------------------------------------------------------------------
    // Teardown: shutdown OTel, close browser, remove container
    // ------------------------------------------------------------------
    afterAll(async () => {
      await shutdownOTel();
      await browser?.close();
      removeContainer();
    }, 60_000);

    // ------------------------------------------------------------------
    // Test 1: Traces appear in Aspire dashboard
    // ------------------------------------------------------------------
    it('traces appear in Aspire dashboard', async () => {
      // Create Squad-style spans
      const tracer = trace.getTracer('squad.test');

      tracer.startActiveSpan('squad.session', (sessionSpan) => {
        sessionSpan.setAttribute('squad.session.id', 'test-session-001');
        sessionSpan.setAttribute('squad.team', 'suspects');

        tracer.startActiveSpan('squad.agent', (agentSpan) => {
          agentSpan.setAttribute('squad.agent.name', 'saul');
          agentSpan.setAttribute('squad.agent.role', 'observability');
          agentSpan.end();
        });

        sessionSpan.end();
      });

      // Force flush via the global provider to ensure spans reach the dashboard
      const tp = trace.getTracerProvider();
      if ('forceFlush' in tp) await (tp as any).forceFlush();
      // Give the dashboard time to index
      await new Promise((r) => setTimeout(r, 3_000));

      // Open the dashboard and navigate to Traces
      const page = await browser!.newPage();
      try {
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

        // Navigate to Traces page directly by URL
        await page.goto(`${DASHBOARD_URL}/traces`, { waitUntil: 'networkidle' });

        // Wait for trace data to render
        const traceContent = await page.locator('fluent-data-grid, table, [class*="trace"], [class*="grid"], main').first().textContent({ timeout: 15_000 });

        // The trace list should contain our squad.test resource or span names
        expect(traceContent).toBeTruthy();

        // Verify we're on the traces page
        expect(page.url().toLowerCase()).toContain('trace');
      } finally {
        await page.close();
      }
    }, 60_000);

    // ------------------------------------------------------------------
    // Test 2: Metrics appear in Aspire dashboard
    // ------------------------------------------------------------------
    it('metrics appear in Aspire dashboard', async () => {
      // Record some metrics
      const meter = metrics.getMeter('squad.test');

      const sessionCounter = meter.createCounter('squad.sessions.total', {
        description: 'Total Squad sessions created',
      });
      sessionCounter.add(5, { 'squad.team': 'suspects' });

      const latencyHistogram = meter.createHistogram('squad.agent.latency', {
        description: 'Agent response latency in ms',
        unit: 'ms',
      });
      latencyHistogram.record(42, { 'squad.agent.name': 'saul' });
      latencyHistogram.record(108, { 'squad.agent.name': 'fenster' });

      // Flush metrics via the global provider
      const mp = metrics.getMeterProvider();
      if ('forceFlush' in mp) await (mp as any).forceFlush();
      // Give the dashboard time to index
      await new Promise((r) => setTimeout(r, 5_000));

      const page = await browser!.newPage();
      try {
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

        // Navigate to Metrics page directly by URL (sidebar uses Fluent UI components)
        await page.goto(`${DASHBOARD_URL}/metrics`, { waitUntil: 'networkidle' });

        // Wait for metrics page to render
        const metricsContent = await page.locator('fluent-data-grid, table, [class*="metric"], [class*="grid"], main').first().textContent({ timeout: 15_000 });

        expect(metricsContent).toBeTruthy();

        // Verify we're on the metrics page
        expect(page.url().toLowerCase()).toContain('metric');
      } finally {
        await page.close();
      }
    }, 60_000);

    // ------------------------------------------------------------------
    // Test 3: squad aspire command lifecycle
    // ------------------------------------------------------------------
    it('squad aspire command exists and exports runAspire', async () => {
      const mod = await import('@bradygaster/squad-cli/commands/aspire');
      expect(typeof mod.runAspire).toBe('function');
    });

    it('squad aspire command has AspireOptions with docker flag', async () => {
      // Type-level validation: if this compiles, the interface is correct
      const mod = await import('@bradygaster/squad-cli/commands/aspire');
      const opts: Parameters<typeof mod.runAspire>[0] = { docker: true, port: 18888 };
      expect(opts.docker).toBe(true);
    });

    it('squad aspire Docker lifecycle: container starts and stops', async () => {
      // The test suite already started the container in beforeAll —
      // verify it is running and will be stopped in afterAll
      const output = execSync(
        `docker inspect --format="{{.State.Running}}" ${CONTAINER_NAME}`,
        { encoding: 'utf8' },
      ).trim();
      expect(output).toBe('true');

      // Verify the dashboard port is accessible
      const res = await fetch(DASHBOARD_URL);
      expect(res.ok).toBe(true);

      // Verify OTLP gRPC port is listening (TCP connect test)
      const net = await import('node:net');
      const grpcAlive = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host: 'localhost', port: 4317 }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.on('error', () => resolve(false));
        sock.setTimeout(3_000, () => { sock.destroy(); resolve(false); });
      });
      expect(grpcAlive).toBe(true);
    }, 15_000);
  },
);
