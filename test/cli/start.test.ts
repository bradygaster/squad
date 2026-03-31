/**
 * Start Command Tests — PTY Mirror Mode for Copilot
 *
 * Tests module exports and StartOptions interface.
 * Does NOT spawn PTY or create tunnels (requires native deps + network).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('CLI: start command', () => {
  it('module exports runStart function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/start');
    expect(typeof mod.runStart).toBe('function');
  });

  it('module exports StartOptions type (verifiable via function arity)', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/start');
    // runStart(cwd, options) — should accept 2 parameters
    expect(mod.runStart.length).toBe(2);
  });

  it('module has no unexpected default export', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/start');
    // ESM module should have named exports, no default
    expect(mod.default).toBeUndefined();
  });
});

/**
 * Issue #711: Verify node-pty is checked BEFORE bridge/tunnel creation
 * 
 * Regression test: if node-pty import fails, the command must exit
 * immediately without creating RemoteBridge or tunnel side effects.
 */
describe('CLI: start command - node-pty requirement (issue #711)', () => {
  it('exits before bridge or tunnel setup when node-pty is missing', async () => {
    const exitSignal = new Error('process.exit');
    const remoteBridgeCtor = vi.fn();
    const remoteBridgeStart = vi.fn(async () => 0);
    const createTunnel = vi.fn();
    const destroyTunnel = vi.fn();
    const getGitInfo = vi.fn(() => ({ repo: 'owner/repo', branch: 'test-branch' }));
    const getMachineId = vi.fn(() => 'machine-id');
    const isDevtunnelAvailable = vi.fn(() => true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null,
    ) => {
      (exitSignal as Error & { exitCode?: string | number | null }).exitCode = code;
      throw exitSignal;
    }) as never);

    vi.doMock('@bradygaster/squad-sdk', () => {
      class FSStorageProvider {
        existsSync(): boolean {
          return false;
        }

        statSync(): undefined {
          return undefined;
        }

        appendSync(): void {}
      }

      class RemoteBridge {
        constructor(_config: unknown) {
          remoteBridgeCtor(_config);
        }

        setStaticHandler = vi.fn();
        start = remoteBridgeStart;
        getSessionToken = vi.fn(() => 'session-token');
        getAuditLogPath = vi.fn(() => 'audit.log');
        getSessionExpiry = vi.fn(() => Date.now() + 60_000);
        setPassthrough = vi.fn();
        passthroughFromAgent = vi.fn();
        stop = vi.fn();
      }

      return { FSStorageProvider, RemoteBridge };
    });

    vi.doMock('../../packages/squad-cli/src/cli/commands/rc-tunnel.js', () => ({
      isDevtunnelAvailable,
      createTunnel,
      destroyTunnel,
      getMachineId,
      getGitInfo,
    }));

    vi.doMock('node-pty', () => {
      throw new Error('Cannot find package "node-pty" imported from start.ts');
    });

    const { runStart } = await import('../../packages/squad-cli/src/cli/commands/start.ts');

    await expect(runStart(process.cwd(), { tunnel: true, port: 0 })).rejects.toBe(exitSignal);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect((exitSignal as Error & { exitCode?: string | number | null }).exitCode).toBe(1);

    const errorOutput = consoleError.mock.calls.flat().join('\n');
    expect(errorOutput).toMatch(/node-pty not available/i);
    expect(errorOutput).toMatch(/npm install -g node-pty/i);

    expect(getGitInfo).not.toHaveBeenCalled();
    expect(getMachineId).not.toHaveBeenCalled();
    expect(isDevtunnelAvailable).not.toHaveBeenCalled();
    expect(remoteBridgeCtor).not.toHaveBeenCalled();
    expect(remoteBridgeStart).not.toHaveBeenCalled();
    expect(createTunnel).not.toHaveBeenCalled();
    expect(destroyTunnel).not.toHaveBeenCalled();
  });

  it('uses checkNodePty helper before RemoteBridge construction in source', async () => {
    // Read the source file directly to verify implementation order
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    const startTsPath = path.resolve(process.cwd(), 'packages/squad-cli/src/cli/commands/start.ts');
    const source = fs.readFileSync(startTsPath, 'utf-8');

    // Verify the dedicated helper exists and owns the optional import
    const helperStart = source.indexOf('async function checkNodePty');
    expect(helperStart).toBeGreaterThan(-1);

    const functionStart = source.indexOf('export async function runStart');
    expect(functionStart).toBeGreaterThan(-1);

    const helperSource = source.slice(helperStart, functionStart);
    expect(helperSource).toMatch(/await import\(['"]node-pty['"]\)/);
    
    // Find helper call position (relative to function start)
    const helperCallPos = source.indexOf('await checkNodePty()', functionStart);
    expect(helperCallPos).toBeGreaterThan(-1);
    
    // Find RemoteBridge construction
    const bridgePattern = /new RemoteBridge\(/;
    const bridgeMatch = source.slice(functionStart).match(bridgePattern);
    if (bridgeMatch) {
      const bridgePos = functionStart + bridgeMatch.index;
      // checkNodePty MUST run before RemoteBridge construction
      expect(helperCallPos).toBeLessThan(bridgePos);
    }
    
    // Find bridge.start() call
    const bridgeStartPattern = /bridge\.start\(\)/;
    const bridgeStartMatch = source.slice(functionStart).match(bridgeStartPattern);
    if (bridgeStartMatch) {
      const bridgeStartPos = functionStart + bridgeStartMatch.index;
      expect(helperCallPos).toBeLessThan(bridgeStartPos);
    }
    
    // Find createTunnel call
    const createTunnelPattern = /createTunnel\(/;
    const createTunnelMatch = source.slice(functionStart).match(createTunnelPattern);
    if (createTunnelMatch) {
      const createTunnelPos = functionStart + createTunnelMatch.index;
      expect(helperCallPos).toBeLessThan(createTunnelPos);
    }
  });
});
