/**
 * SDK Compatibility Smoke Test
 *
 * Validates that @github/copilot-sdk exports the interface Squad depends on.
 * Uses REAL imports (no vi.mock) so breakage is caught before runtime.
 *
 * If this test fails, it means a copilot-sdk update removed or renamed
 * something Squad uses in packages/squad-sdk/src/adapter/client.ts.
 */

import { describe, it, expect } from 'vitest';

// Methods that CopilotClientAdapter (client.ts) calls on CopilotClient instances.
// Keep in sync with packages/squad-sdk/src/adapter/client.ts usage.
const EXPECTED_CLIENT_METHODS = [
  'start',
  'stop',
  'forceStop',
  'createSession',
  'resumeSession',
  'listSessions',
  'deleteSession',
  'getLastSessionId',
  'ping',
  'getStatus',
] as const;

describe('SDK compatibility smoke test', () => {
  it('CopilotClient is exported and is a constructor', async () => {
    const sdk = await import('@github/copilot-sdk');
    expect(sdk.CopilotClient).toBeDefined();
    expect(typeof sdk.CopilotClient).toBe('function');
  });

  for (const method of EXPECTED_CLIENT_METHODS) {
    it(`CopilotClient.prototype.${method} exists`, async () => {
      const sdk = await import('@github/copilot-sdk');
      const proto = sdk.CopilotClient.prototype;
      expect(
        typeof proto[method],
        `Missing method: CopilotClient.prototype.${method} — ` +
          `Squad's adapter depends on this. Check if copilot-sdk renamed or removed it.`,
      ).toBe('function');
    });
  }

  it('vscode-jsonrpc/node subpath is importable', async () => {
    // This subpath import depends on the ESM patch (postinstall).
    // If this fails, the patch-esm-imports.mjs postinstall didn't run.
    const jsonrpc = await import('vscode-jsonrpc/node');
    expect(jsonrpc).toBeDefined();
    // createMessageConnection is the main API surface used by copilot-sdk
    expect(typeof jsonrpc.createMessageConnection).toBe('function');
  });
});
