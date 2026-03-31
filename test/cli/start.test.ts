/**
 * Start Command Tests — PTY Mirror Mode for Copilot
 *
 * Tests module exports and StartOptions interface.
 * Does NOT spawn PTY or create tunnels (requires native deps + network).
 */

import { describe, it, expect } from 'vitest';

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
  it('verifies node-pty import appears before RemoteBridge construction in source', async () => {
    // Read the source file directly to verify implementation order
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    const startTsPath = path.resolve(process.cwd(), 'packages/squad-cli/src/cli/commands/start.ts');
    const source = fs.readFileSync(startTsPath, 'utf-8');
    
    // Find the start of runStart function
    const functionStart = source.indexOf('export async function runStart');
    expect(functionStart).toBeGreaterThan(-1);
    
    // Find node-pty import position (relative to function start)
    const nodePtyImportPattern = /await import\(['"]node-pty['"]\)/;
    const nodePtyMatch = source.slice(functionStart).match(nodePtyImportPattern);
    expect(nodePtyMatch).toBeTruthy();
    const nodePtyPos = functionStart + (nodePtyMatch?.index || 0);
    
    // Find RemoteBridge construction
    const bridgePattern = /new RemoteBridge\(/;
    const bridgeMatch = source.slice(functionStart).match(bridgePattern);
    if (bridgeMatch) {
      const bridgePos = functionStart + bridgeMatch.index;
      // node-pty import MUST come before RemoteBridge construction
      expect(nodePtyPos).toBeLessThan(bridgePos);
    }
    
    // Find bridge.start() call
    const bridgeStartPattern = /bridge\.start\(\)/;
    const bridgeStartMatch = source.slice(functionStart).match(bridgeStartPattern);
    if (bridgeStartMatch) {
      const bridgeStartPos = functionStart + bridgeStartMatch.index;
      expect(nodePtyPos).toBeLessThan(bridgeStartPos);
    }
    
    // Find createTunnel call
    const createTunnelPattern = /createTunnel\(/;
    const createTunnelMatch = source.slice(functionStart).match(createTunnelPattern);
    if (createTunnelMatch) {
      const createTunnelPos = functionStart + createTunnelMatch.index;
      expect(nodePtyPos).toBeLessThan(createTunnelPos);
    }
  });
});
