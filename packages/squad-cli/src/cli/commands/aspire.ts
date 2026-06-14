/**
 * Aspire command — Launch Aspire dashboard for Squad observability
 * (Issue #265)
 *
 * Starts the Aspire dashboard and configures OTLP export so Squad
 * traces and metrics flow into the dashboard automatically.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { BOLD, RESET, DIM, GREEN, RED, YELLOW } from '../core/output.js';

// ============================================================================
// Constants
// ============================================================================

/** Default OTLP endpoint the Aspire dashboard listens on (host-mapped gRPC port). */
const ASPIRE_OTLP_ENDPOINT = 'http://localhost:4317';

/** Default Aspire dashboard UI port. */
const ASPIRE_DASHBOARD_PORT = 18888;

/** Docker container name for the Aspire dashboard. */
const ASPIRE_CONTAINER_NAME = 'squad-aspire-dashboard';

/** Docker image for the Aspire dashboard. */
const ASPIRE_DOCKER_IMAGE = 'mcr.microsoft.com/dotnet/aspire-dashboard:latest';

// ============================================================================
// Detection helpers
// ============================================================================

function commandExists(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isDotnetAspireAvailable(): boolean {
  if (!commandExists('dotnet')) return false;
  try {
    const output = execSync('dotnet tool list -g', { encoding: 'utf8' });
    if (output.toLowerCase().includes('aspire')) return true;
  } catch {
    // Ignore
  }
  try {
    const workloads = execSync('dotnet workload list', { encoding: 'utf8' });
    if (workloads.toLowerCase().includes('aspire')) return true;
  } catch {
    // Ignore
  }
  return false;
}

function isDockerAvailable(): boolean {
  return commandExists('docker');
}

// ============================================================================
// Launch strategies
// ============================================================================

function launchWithDocker(): ChildProcess {
  console.log(`${DIM}Starting Aspire dashboard via Docker...${RESET}`);
  const child = spawn('docker', [
    'run', '--rm',
    '--name', ASPIRE_CONTAINER_NAME,
    '-p', `${ASPIRE_DASHBOARD_PORT}:18888`,
    '-p', '4317:18889',
    '-e', 'DASHBOARD__FRONTEND__AUTHMODE=Unsecured',
    '-e', 'DASHBOARD__OTLP__AUTHMODE=Unsecured',
    ASPIRE_DOCKER_IMAGE,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  return child;
}

function launchWithDotnet(): ChildProcess {
  console.log(`${DIM}Starting Aspire dashboard via dotnet...${RESET}`);
  const child = spawn('dotnet', [
    'run', '--project', 'aspire',
    '--', '--dashboard-port', String(ASPIRE_DASHBOARD_PORT),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  return child;
}

// ============================================================================
// Public API
// ============================================================================

export interface AspireOptions {
  /** Use Docker even if dotnet is available */
  docker?: boolean;
  /** Custom OTLP endpoint port */
  port?: number;
}

/**
 * Run the `squad aspire` command.
 * Launches the Aspire dashboard and configures OTLP export.
 */
export async function runAspire(options: AspireOptions = {}): Promise<void> {
  const port = options.port ?? ASPIRE_DASHBOARD_PORT;
  const otlpEndpoint = ASPIRE_OTLP_ENDPOINT;

  console.log(`\n${BOLD}🔭 Squad Aspire — OpenTelemetry Dashboard${RESET}\n`);

  // Set OTLP environment so OTel providers pick it up (gRPC endpoint, not dashboard UI)
  process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = otlpEndpoint;
  console.log(`${DIM}OTLP endpoint: ${otlpEndpoint}${RESET}`);

  // Determine launch strategy
  const useDocker = options.docker || !isDotnetAspireAvailable();
  let child: ChildProcess | undefined;

  if (useDocker && isDockerAvailable()) {
    child = launchWithDocker();
  } else if (!useDocker && isDotnetAspireAvailable()) {
    child = launchWithDotnet();
  } else if (isDockerAvailable()) {
    child = launchWithDocker();
  } else {
    console.log(`${RED}✗${RESET} Neither Docker nor Aspire workload found.`);
    console.log(`\n  Install options:`);
    console.log(`    ${BOLD}Docker:${RESET}  https://docker.com/get-started`);
    console.log(`    ${BOLD}Aspire:${RESET}  dotnet workload install aspire\n`);
    return;
  }

  // Wire up output
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) console.log(`${DIM}[aspire]${RESET} ${text}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) console.log(`${YELLOW}[aspire]${RESET} ${text}`);
  });

  child.on('error', (err: Error) => {
    console.error(`${RED}✗${RESET} Failed to start Aspire: ${err.message}`);
  });

  // Give the dashboard a moment to start
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));

  console.log(`\n${GREEN}✓${RESET} Aspire dashboard launching`);
  console.log(`  ${BOLD}Dashboard:${RESET}  http://localhost:${port}`);
  console.log(`  ${BOLD}OTLP gRPC:${RESET}  localhost:4317`);
  console.log(`\n${DIM}Squad OTel will automatically export to this endpoint.${RESET}`);
  console.log(`${DIM}Press Ctrl+C to stop.${RESET}\n`);

  // Keep alive until Ctrl+C
  return new Promise<void>((resolve) => {
    const shutdown = () => {
      console.log(`\n${DIM}🔭 Aspire dashboard stopping...${RESET}`);
      child?.kill();
      resolve();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    child?.on('close', () => {
      console.log(`${DIM}Aspire process exited.${RESET}`);
      resolve();
    });
  });
}
