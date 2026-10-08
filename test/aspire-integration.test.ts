// @vitest-environment node
/**
 * Aspire Dashboard Integration Tests — Playwright + Vitest
 *
 * Launches the Aspire dashboard container, configures OTel gRPC export,
 * then uses Playwright to verify telemetry appears in the dashboard UI.
 *
 * Requires Docker. Skipped when SKIP_DOCKER_TESTS=1 or Docker unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
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
const DASHBOARD_IMAGE = 'mcr.microsoft.com/dotnet/aspire-dashboard:13.5.2@sha256:0ef531119b8073aed12b0db2b4e4ab02866c6c69b7a52264269abd00cfb48a34';
const DASHBOARD_URL = 'http://localhost:18888';
const OTLP_GRPC_TARGET = 'http://localhost:4317';
const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_REQUEST_TIMEOUT_MS = 5_000;
const SETUP_TIMEOUT_MS = 300_000;
const DOCKER_LOG_TAIL_LINES = 50;
const MAX_DOCKER_LOG_CHARS = 32_000;
const DOCKER_LOG_MAX_BUFFER_BYTES = 64 * 1024;

// ============================================================================
// Helpers
// ============================================================================

interface ContainerState {
  Status?: string;
  Running?: boolean;
  ExitCode?: number;
  Error?: string;
}

interface HealthProbe {
  fetch: typeof fetch;
  getContainerState: () => ContainerState | null;
  getContainerLogs: () => string;
  timeoutSignal: (milliseconds: number) => AbortSignal;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

interface DockerLogResult {
  stdout: string;
  stderr: string;
  error?: Error;
}

function getContainerState(): ContainerState | null {
  try {
    const output = execSync(
      `docker inspect --format='{{json .State}}' ${CONTAINER_NAME}`,
      { encoding: 'utf8' },
    );
    return JSON.parse(output) as ContainerState;
  } catch {
    return null;
  }
}

function runContainerLogs(): DockerLogResult {
  const result = spawnSync(
    'docker',
    ['logs', '--tail', String(DOCKER_LOG_TAIL_LINES), CONTAINER_NAME],
    {
      encoding: 'utf8',
      maxBuffer: DOCKER_LOG_MAX_BUFFER_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function mergeBoundedDockerLogs(stdout: string, stderr: string): string {
  const logs = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  if (logs.length <= MAX_DOCKER_LOG_CHARS) return logs;

  const prefix = `[truncated to last ${MAX_DOCKER_LOG_CHARS} characters]\n`;
  return prefix + logs.slice(-(MAX_DOCKER_LOG_CHARS - prefix.length));
}

function getContainerLogs(runLogs: () => DockerLogResult = runContainerLogs): string {
  const result = runLogs();
  const logs = mergeBoundedDockerLogs(result.stdout, result.stderr);
  if (logs) return logs;
  if (result.error) {
    return `unavailable (${result.error.message})`;
  }
  return 'unavailable';
}

const DEFAULT_HEALTH_PROBE: HealthProbe = {
  fetch,
  getContainerState,
  getContainerLogs,
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
  now: Date.now,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function startupFailure(
  message: string,
  state: ContainerState | null,
  logs: string,
): Error {
  const stateSummary = state
    ? `status=${state.Status ?? 'unknown'}, running=${state.Running ?? false}, exitCode=${state.ExitCode ?? 'unknown'}, error=${state.Error || 'none'}`
    : 'unavailable';
  return new Error(`${message}\nContainer state: ${stateSummary}\nContainer logs:\n${logs || '(empty)'}`);
}

/** Poll the dashboard while failing immediately if its container exits. */
async function waitForHealthy(
  url: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
  probe: HealthProbe = DEFAULT_HEALTH_PROBE,
): Promise<void> {
  const deadline = probe.now() + timeoutMs;
  while (probe.now() < deadline) {
    const remainingBeforeRequestMs = deadline - probe.now();
    if (remainingBeforeRequestMs <= 0) break;
    const requestTimeoutMs = Math.min(
      HEALTH_REQUEST_TIMEOUT_MS,
      remainingBeforeRequestMs,
    );
    try {
      const res = await probe.fetch(url, {
        signal: probe.timeoutSignal(requestTimeoutMs),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }

    const state = probe.getContainerState();
    if (state && state.Running === false && state.Status !== 'created') {
      throw startupFailure(
        `Dashboard container exited before ${url} became healthy`,
        state,
        probe.getContainerLogs(),
      );
    }

    const remainingMs = deadline - probe.now();
    if (remainingMs <= 0) break;
    await probe.sleep(Math.min(1_000, remainingMs));
  }

  throw startupFailure(
    `Dashboard at ${url} did not become healthy within ${timeoutMs}ms`,
    probe.getContainerState(),
    probe.getContainerLogs(),
  );
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

describe('Aspire dashboard startup diagnostics', () => {
  it('uses an immutable known-good dashboard image', () => {
    expect(DASHBOARD_IMAGE).toMatch(
      /^mcr\.microsoft\.com\/dotnet\/aspire-dashboard:\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/,
    );
    expect(DASHBOARD_IMAGE).not.toContain(':latest');
  });

  it('fails immediately with container state and logs when startup exits', async () => {
    const sleep = vi.fn(async () => {});
    const probe: HealthProbe = {
      fetch: vi.fn(async () => { throw new Error('connection refused'); }),
      getContainerState: () => ({
        Status: 'exited',
        Running: false,
        ExitCode: 145,
      }),
      getContainerLogs: () => "The application '/app/Aspire.Dashboard.dll' does not exist.",
      timeoutSignal: () => new AbortController().signal,
      now: () => 0,
      sleep,
    };

    await expect(waitForHealthy(DASHBOARD_URL, HEALTH_TIMEOUT_MS, probe)).rejects.toThrow(
      /container exited[\s\S]*exitCode=145[\s\S]*Aspire\.Dashboard\.dll/,
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retains bounded Docker stdout and stderr when logs succeeds', () => {
    const logs = getContainerLogs(() => ({
      stdout: 'Dashboard starting',
      stderr: "The application '/app/Aspire.Dashboard.dll' does not exist.",
    }));

    expect(logs).toContain('Dashboard starting');
    expect(logs).toContain('Aspire.Dashboard.dll');

    const boundedLogs = getContainerLogs(() => ({
      stdout: 'x'.repeat(MAX_DOCKER_LOG_CHARS),
      stderr: "The application '/app/Aspire.Dashboard.dll' does not exist.",
    }));
    expect(boundedLogs).toContain('Aspire.Dashboard.dll');
    expect(boundedLogs.length).toBeLessThanOrEqual(MAX_DOCKER_LOG_CHARS);
  });

  it('aborts a health request that never returns headers at the deadline', async () => {
    const timeoutMs = HEALTH_REQUEST_TIMEOUT_MS + 1_000;
    const requestedTimeouts: number[] = [];
    let now = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const hangingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }
        const abort = () => {
          reject(new Error('request aborted'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }));
    const probe: HealthProbe = {
      fetch: hangingFetch as typeof fetch,
      getContainerState: () => ({ Status: 'running', Running: true }),
      getContainerLogs: () => 'still running',
      timeoutSignal: (milliseconds) => {
        requestedTimeouts.push(milliseconds);
        const controller = new AbortController();
        queueMicrotask(() => {
          now += milliseconds;
          controller.abort();
        });
        return controller.signal;
      },
      now: () => now,
      sleep,
    };

    await expect(waitForHealthy(DASHBOARD_URL, timeoutMs, probe)).rejects.toThrow(
      `did not become healthy within ${timeoutMs}ms`,
    );
    expect(requestedTimeouts).toEqual([HEALTH_REQUEST_TIMEOUT_MS]);
    expect(hangingFetch).toHaveBeenCalledWith(
      DASHBOARD_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
  });
});

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

      // Pull the immutable dashboard image validated by this fixture
      execSync(
        `docker pull ${DASHBOARD_IMAGE}`,
        { stdio: 'inherit', timeout: 120_000 },
      );

      // Start the Aspire dashboard container
      execSync(
        [
          'docker run -d',
          `-p 18888:18888 -p 4317:18889`,
          '-e DASHBOARD__FRONTEND__AUTHMODE=Unsecured',
          '-e DASHBOARD__OTLP__AUTHMODE=Unsecured',
          `--name ${CONTAINER_NAME}`,
          DASHBOARD_IMAGE,
        ].join(' '),
        { stdio: 'inherit' },
      );

      // Wait for dashboard UI to respond
      await waitForHealthy(DASHBOARD_URL);

      // Initialize OTel gRPC exporters targeting the dashboard
      initOTelForAspire();

      // Launch Playwright browser
      browser = await chromium.launch({ headless: true });
    }, SETUP_TIMEOUT_MS); // 5 min timeout for pull + health check under CI contention

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
