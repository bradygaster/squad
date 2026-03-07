/**
 * Copilot-Bridge Command Tests — Copilot ACP Bridge
 *
 * Tests the CopilotBridge class exports, instantiation, and state management.
 * Does NOT spawn real copilot processes (requires copilot CLI).
 */

import { describe, it, expect } from 'vitest';

describe('CLI: copilot-bridge command', () => {
  it('module exports CopilotBridge class', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    expect(typeof mod.CopilotBridge).toBe('function');
    expect(typeof mod.CopilotBridge.checkCompatibility).toBe('function');
  });

  it('CopilotBridge can be instantiated with config', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd() });
    expect(bridge).toBeDefined();
    expect(typeof bridge.start).toBe('function');
    expect(typeof bridge.stop).toBe('function');
    expect(typeof bridge.send).toBe('function');
    expect(typeof bridge.sendPrompt).toBe('function');
    expect(typeof bridge.onMessage).toBe('function');
    expect(typeof bridge.isRunning).toBe('function');
  });

  it('isRunning returns false before start', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd() });
    expect(bridge.isRunning()).toBe(false);
  });

  it('accepts optional agent in config', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd(), agent: 'test-agent' });
    expect(bridge).toBeDefined();
    expect(bridge.isRunning()).toBe(false);
  });

  it('stop is safe to call when not running', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd() });
    expect(() => bridge.stop()).not.toThrow();
  });

  it('sendPrompt is safe to call when not initialized', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd() });
    // Should log error but not throw
    expect(() => bridge.sendPrompt('test')).not.toThrow();
  });

  it('onMessage accepts a callback', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    const bridge = new CopilotBridge({ cwd: process.cwd() });
    const cb = (_line: string) => {};
    expect(() => bridge.onMessage(cb)).not.toThrow();
  });

  it('checkCompatibility is a static async method', async () => {
    const { CopilotBridge } = await import('@bradygaster/squad-cli/commands/copilot-bridge');
    expect(typeof CopilotBridge.checkCompatibility).toBe('function');
    // Verify it returns a promise (don't await — spawns real processes)
    expect(CopilotBridge.checkCompatibility.constructor.name).toBe('AsyncFunction');
  });
});
