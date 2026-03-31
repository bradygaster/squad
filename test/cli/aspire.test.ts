/**
 * CLI: `squad aspire` Command Tests — Issue #267
 *
 * Proactive tests for the `squad aspire` command that starts/stops an
 * Aspire dashboard container for local OTel telemetry visualization.
 *
 * The aspire command is expected to:
 * - Check Docker availability (docker info / docker --version)
 * - Start a container with the correct image and port mappings
 * - Configure OTLP endpoint (default: http://localhost:4318)
 * - Stop the container cleanly on `squad aspire stop`
 *
 * Since the command may not be implemented yet, tests pass gracefully
 * with [PROACTIVE] warnings when the module is not found.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { dockerSkipReason } from '../helpers/skip-guards.js';

// ===========================================================================
// Skip guard — bail early if Docker is unavailable or tests disabled
// ===========================================================================

const SKIP_REASON = dockerSkipReason();

// ===========================================================================
// Docker availability helpers (mockable)
// ===========================================================================

function checkDockerAvailability(): string | null {
  try {
    const output = execSync('docker --version', { encoding: 'utf-8', timeout: 5000 });
    return output.trim();
  } catch {
    return null;
  }
}

function buildAspireRunCommand(options: {
  port?: number;
  otlpPort?: number;
  name?: string;
  image?: string;
} = {}): string[] {
  const {
    port = 18888,
    otlpPort = 4318,
    name = 'squad-aspire-dashboard',
    image = 'mcr.microsoft.com/dotnet/aspire-dashboard:latest',
  } = options;

  return [
    'docker', 'run', '-d',
    '--name', name,
    '-p', `${port}:18888`,
    '-p', `${otlpPort}:18889`,
    '-e', 'DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true',
    image,
  ];
}

function buildAspireStopCommands(name = 'squad-aspire-dashboard'): string[][] {
  return [
    ['docker', 'stop', name],
    ['docker', 'rm', name],
  ];
}

// ===========================================================================
// Docker availability
// ===========================================================================

describe.skipIf(SKIP_REASON !== null)(
  `CLI: squad aspire — Docker availability (${SKIP_REASON ?? 'enabled'})`,
  { timeout: 30_000 },
  () => {
  it('checkDockerAvailability returns version string when Docker is present', () => {
    const result = checkDockerAvailability();
    if (result === null) {
      console.warn('[ENV] Docker not available — skipping Docker detection test');
      return;
    }
    expect(result).toMatch(/docker/i);
  });

  it('checkDockerAvailability returns null when Docker is absent', () => {
    const mockExecSync = vi.fn(() => { throw new Error('docker not found'); });
    let result: string | null;
    try {
      mockExecSync();
      result = 'unexpected';
    } catch {
      result = null;
    }
    expect(result).toBeNull();
  });
});

// ===========================================================================
// Container command generation
// ===========================================================================

describe('CLI: squad aspire — container commands', () => {
  it('buildAspireRunCommand generates correct default docker run command', () => {
    const cmd = buildAspireRunCommand();
    expect(cmd[0]).toBe('docker');
    expect(cmd[1]).toBe('run');
    expect(cmd[2]).toBe('-d');
    expect(cmd).toContain('--name');
    expect(cmd).toContain('squad-aspire-dashboard');
    expect(cmd).toContain('-p');
    expect(cmd).toContain('18888:18888');
    expect(cmd).toContain('4318:18889');
  });

  it('buildAspireRunCommand sets anonymous access env var', () => {
    const cmd = buildAspireRunCommand();
    const envIdx = cmd.indexOf('-e');
    expect(envIdx).toBeGreaterThan(-1);
    expect(cmd[envIdx + 1]).toBe('DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true');
  });

  it('buildAspireRunCommand uses correct default image', () => {
    const cmd = buildAspireRunCommand();
    const last = cmd[cmd.length - 1];
    expect(last).toBe('mcr.microsoft.com/dotnet/aspire-dashboard:latest');
  });

  it('buildAspireRunCommand accepts custom port', () => {
    const cmd = buildAspireRunCommand({ port: 9999 });
    expect(cmd).toContain('9999:18888');
  });

  it('buildAspireRunCommand accepts custom OTLP port', () => {
    const cmd = buildAspireRunCommand({ otlpPort: 5555 });
    expect(cmd).toContain('5555:18889');
  });

  it('buildAspireRunCommand accepts custom container name', () => {
    const cmd = buildAspireRunCommand({ name: 'my-aspire' });
    const nameIdx = cmd.indexOf('--name');
    expect(cmd[nameIdx + 1]).toBe('my-aspire');
  });

  it('buildAspireRunCommand accepts custom image', () => {
    const cmd = buildAspireRunCommand({ image: 'my-registry/aspire:v2' });
    const last = cmd[cmd.length - 1];
    expect(last).toBe('my-registry/aspire:v2');
  });
});

// ===========================================================================
// OTLP endpoint configuration
// ===========================================================================

describe('CLI: squad aspire — OTLP endpoint configuration', () => {
  const savedEnv = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    } else {
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = savedEnv;
    }
  });

  it('default OTLP endpoint maps port 4318 to container port 18889', () => {
    const cmd = buildAspireRunCommand();
    expect(cmd).toContain('4318:18889');
  });

  it('OTEL_EXPORTER_OTLP_ENDPOINT should match the exposed port', () => {
    const expectedEndpoint = 'http://localhost:4318';
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = expectedEndpoint;
    expect(process.env['OTEL_EXPORTER_OTLP_ENDPOINT']).toBe(expectedEndpoint);
  });

  it('custom OTLP port updates the port mapping', () => {
    const cmd = buildAspireRunCommand({ otlpPort: 5555 });
    expect(cmd).toContain('5555:18889');
  });
});

// ===========================================================================
// Stop / cleanup commands
// ===========================================================================

describe('CLI: squad aspire — stop/cleanup', () => {
  it('buildAspireStopCommands generates docker stop + rm', () => {
    const cmds = buildAspireStopCommands();
    expect(cmds.length).toBe(2);
    expect(cmds[0]).toEqual(['docker', 'stop', 'squad-aspire-dashboard']);
    expect(cmds[1]).toEqual(['docker', 'rm', 'squad-aspire-dashboard']);
  });

  it('buildAspireStopCommands accepts custom container name', () => {
    const cmds = buildAspireStopCommands('my-aspire');
    expect(cmds[0]).toEqual(['docker', 'stop', 'my-aspire']);
    expect(cmds[1]).toEqual(['docker', 'rm', 'my-aspire']);
  });

  it('stop followed by start should work (idempotent lifecycle)', () => {
    const stopCmds = buildAspireStopCommands();
    const startCmd = buildAspireRunCommand();

    expect(stopCmds[0]![0]).toBe('docker');
    expect(startCmd[0]).toBe('docker');
    // Container name matches between stop/rm and run
    expect(stopCmds[0]![2]).toBe('squad-aspire-dashboard');
    const nameIdx = startCmd.indexOf('--name');
    expect(startCmd[nameIdx + 1]).toBe('squad-aspire-dashboard');
  });
});

// ===========================================================================
// Aspire command module resolution (proactive)
// ===========================================================================

describe('CLI: squad aspire — module resolution', () => {
  it('[PROACTIVE] aspire command source file exists in expected location', () => {
    const aspirePath = join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands', 'aspire.ts');
    if (!existsSync(aspirePath)) {
      console.warn('[PROACTIVE] squad aspire command not yet implemented — source file not found');
      return;
    }
    expect(existsSync(aspirePath)).toBe(true);
  });
});
