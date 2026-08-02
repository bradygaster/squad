/**
 * Unmocked integration test: validates that normalizeToolNameForCopilot()
 * produces tool names that the real CopilotSession accepts at the
 * handler-registration / dispatch boundary (Acceptance criterion #7 from
 * Issue #1562).
 *
 * NO vi.mock('@github/copilot-sdk') — the real CopilotSession class is used.
 *
 * CopilotSession.registerTools / getToolHandler never touch the underlying
 * MessageConnection, so the tests construct a session with a null connection
 * to avoid requiring a live Copilot CLI process.
 */

import { describe, it, expect } from 'vitest';
import { CopilotSession } from '@github/copilot-sdk';
import { normalizeToolNameForCopilot } from '@bradygaster/squad-sdk/client';
import type { MessageConnection } from 'vscode-jsonrpc/node';
import type { Tool } from '@github/copilot-sdk';

/**
 * The Copilot CLI server enforces this regex for external/custom tool names.
 * Dots, spaces, and most special chars are rejected.
 */
const WIRE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function makeSession(): CopilotSession {
  // @internal constructor; null connection is safe because registerTools /
  // getToolHandler only touch the in-memory toolHandlers Map.
  return new CopilotSession('test-session', null as unknown as MessageConnection);
}

function makeTool(name: string): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    handler: async () => ({ value: `result:${name}` }),
  };
}

describe('Real CopilotSession handler registration (unmocked — criterion #7)', () => {
  it('registerTools accepts all six normalized memory-tool names', () => {
    const session = makeSession();
    const normalizedTools = [
      'memory.classify',
      'memory.write',
      'memory.search',
      'memory.promote',
      'memory.delete',
      'memory.audit',
    ].map(n => makeTool(normalizeToolNameForCopilot(n)));

    expect(() => session.registerTools(normalizedTools)).not.toThrow();
  });

  it('getToolHandler finds handler by wire name after registerTools', () => {
    const session = makeSession();
    const handler = async () => ({ value: 'classified' });

    session.registerTools([{ name: 'memory_classify', description: 'Classify', handler }]);

    const found = session.getToolHandler('memory_classify');
    expect(found).toBe(handler);
  });

  it('getToolHandler returns undefined for dotted canonical name (wire format enforced)', () => {
    const session = makeSession();
    const handler = async () => ({ value: 'classified' });

    session.registerTools([{ name: 'memory_classify', description: 'Classify', handler }]);

    // Dotted name was NOT registered — confirms normalization must happen before
    // SDK registration for dispatch to work at all.
    expect(session.getToolHandler('memory.classify')).toBeUndefined();
  });

  it('handler dispatched under wire name is the same function registered', () => {
    const session = makeSession();
    const handlers = new Map<string, Tool['handler']>();

    const tools = ['memory.classify', 'memory.write', 'memory.search'].map(n => {
      const wireName = normalizeToolNameForCopilot(n);
      const handler = async () => ({ value: wireName });
      handlers.set(wireName, handler);
      return { name: wireName, description: n, handler };
    });

    session.registerTools(tools);

    for (const [wireName, originalHandler] of handlers) {
      expect(session.getToolHandler(wireName)).toBe(originalHandler);
    }
  });

  it('normalizeToolNameForCopilot outputs pass the wire format regex', () => {
    const dotted = [
      'memory.classify',
      'memory.write',
      'memory.search',
      'memory.promote',
      'memory.delete',
      'memory.audit',
      'a.b.c.d',
    ];
    for (const name of dotted) {
      const wire = normalizeToolNameForCopilot(name);
      expect(WIRE_NAME_REGEX.test(wire)).toBe(true);
    }
  });

  it('dotted canonical names fail the wire format regex (why normalization is required)', () => {
    const dotted = ['memory.classify', 'memory.write', 'a.b'];
    for (const name of dotted) {
      expect(WIRE_NAME_REGEX.test(name)).toBe(false);
    }
  });

  it('non-dotted names are unchanged and pass the wire format regex', () => {
    const plain = ['memory_classify', 'classify', 'run-test', 'plain'];
    for (const name of plain) {
      expect(normalizeToolNameForCopilot(name)).toBe(name);
      expect(WIRE_NAME_REGEX.test(name)).toBe(true);
    }
  });
});
