/**
 * Tests for the runtime resolver.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveRuntime, isValidRuntime, listRuntimes } from '../../src/runtime/resolver.js';
import { ClaudeCodeRuntimeProvider } from '../../src/runtime/providers/claude-code-provider.js';
import { CopilotRuntimeProvider } from '../../src/runtime/providers/copilot-provider.js';

describe('resolveRuntime', () => {
  it('should resolve claude-code provider', () => {
    const provider = resolveRuntime({ runtime: 'claude-code' });
    expect(provider).toBeInstanceOf(ClaudeCodeRuntimeProvider);
    expect(provider.name).toBe('claude-code');
  });

  it('should resolve copilot provider when client is provided', () => {
    const mockClient = { createSession: vi.fn(), listModels: vi.fn() };
    const provider = resolveRuntime({
      runtime: 'copilot',
      copilot: { client: mockClient as any },
    });
    expect(provider).toBeInstanceOf(CopilotRuntimeProvider);
    expect(provider.name).toBe('copilot');
  });

  it('should throw for copilot when no client is provided', () => {
    expect(() => resolveRuntime({ runtime: 'copilot' })).toThrow(
      'Copilot runtime provider requires a SquadClient',
    );
  });

  it('should default to copilot when no config provided', () => {
    // Default is copilot, which requires a client
    expect(() => resolveRuntime()).toThrow('Copilot runtime provider requires a SquadClient');
  });

  it('should throw for unknown runtime', () => {
    expect(() =>
      resolveRuntime({ runtime: 'unknown' as any }),
    ).toThrow('Unknown runtime provider: "unknown"');
  });

  it('should pass claude-code options through', () => {
    const provider = resolveRuntime({
      runtime: 'claude-code',
      claudeCode: { claudeBin: '/custom/claude' },
    });
    expect(provider.name).toBe('claude-code');
  });
});

describe('isValidRuntime', () => {
  it('should return true for known runtimes', () => {
    expect(isValidRuntime('copilot')).toBe(true);
    expect(isValidRuntime('claude-code')).toBe(true);
  });

  it('should return false for unknown runtimes', () => {
    expect(isValidRuntime('openai')).toBe(false);
    expect(isValidRuntime('')).toBe(false);
  });
});

describe('listRuntimes', () => {
  it('should return all available runtimes', () => {
    const runtimes = listRuntimes();
    expect(runtimes).toContain('copilot');
    expect(runtimes).toContain('claude-code');
    expect(runtimes.length).toBe(2);
  });
});
