/**
 * Tests for dotted tool-name normalization at the Squad → Copilot SDK
 * external-tool adapter boundary (Issue #21).
 *
 * The Copilot SDK enforces ^[a-zA-Z0-9_-]+$ on external tool names.
 * Squad's ToolRegistry uses canonical dotted names (e.g. `memory.classify`).
 * Normalization converts dots to underscores so session creation succeeds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeToolNameForCopilot,
  normalizeToolsInConfig,
  SquadClient,
} from '@bradygaster/squad-sdk/client';
import { CopilotClient } from '@github/copilot-sdk';
import type { SquadSessionConfig, SquadTool } from '@bradygaster/squad-sdk/adapter';

// ---------------------------------------------------------------------------
// Mock CopilotClient — mirrors adapter-client.test.ts stub
// ---------------------------------------------------------------------------

vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: vi.fn(function (this: object) {
      Object.assign(this, {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue([]),
        forceStop: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn().mockResolvedValue({
          sessionId: 'session-norm-1',
          send: vi.fn().mockResolvedValue(undefined),
          sendAndWait: vi.fn().mockResolvedValue(undefined),
          on: vi.fn().mockReturnValue(() => {}),
          destroy: vi.fn().mockResolvedValue(undefined),
        }),
        resumeSession: vi.fn().mockResolvedValue({
          sessionId: 'session-norm-1',
          send: vi.fn().mockResolvedValue(undefined),
          sendAndWait: vi.fn().mockResolvedValue(undefined),
          on: vi.fn().mockReturnValue(() => {}),
          destroy: vi.fn().mockResolvedValue(undefined),
        }),
        listSessions: vi.fn().mockResolvedValue([]),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        getLastSessionId: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: Date.now() }),
        getStatus: vi.fn().mockResolvedValue({ version: '1.0.0' }),
        getAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
        listModels: vi.fn().mockResolvedValue([]),
        on: vi.fn().mockReturnValue(() => {}),
        onLifecycle: vi.fn().mockReturnValue(() => {}),
      });
    }),
    RuntimeConnection: {
      forStdio: vi.fn(() => ({})),
      forTcp: vi.fn(() => ({})),
      forUri: vi.fn(() => ({})),
    },
  };
});

// ---------------------------------------------------------------------------
// Helper: minimal SquadTool stub
// ---------------------------------------------------------------------------

function makeTool(name: string): SquadTool<unknown> {
  return {
    name,
    description: `Tool ${name}`,
    handler: async () => 'ok',
  };
}

// ---------------------------------------------------------------------------
// normalizeToolNameForCopilot — pure unit tests
// ---------------------------------------------------------------------------

describe('normalizeToolNameForCopilot', () => {
  it('replaces dots with underscores', () => {
    expect(normalizeToolNameForCopilot('memory.classify')).toBe('memory_classify');
  });

  it('replaces multiple dots', () => {
    expect(normalizeToolNameForCopilot('a.b.c')).toBe('a_b_c');
  });

  it('leaves already-valid names unchanged', () => {
    expect(normalizeToolNameForCopilot('squad_route')).toBe('squad_route');
    expect(normalizeToolNameForCopilot('squad-route')).toBe('squad-route');
    expect(normalizeToolNameForCopilot('myTool123')).toBe('myTool123');
  });

  it('produces names that match the Copilot external-tool regex', () => {
    const COPILOT_TOOL_RE = /^[a-zA-Z0-9_-]+$/;
    const inputs = [
      'memory.classify',
      'memory.write',
      'memory.search',
      'memory.promote',
      'memory.delete',
      'memory.audit',
    ];
    for (const name of inputs) {
      const wire = normalizeToolNameForCopilot(name);
      expect(COPILOT_TOOL_RE.test(wire)).toBe(true);
    }
  });

  it('handles empty string', () => {
    expect(normalizeToolNameForCopilot('')).toBe('');
  });

  it('handles name that is only dots', () => {
    expect(normalizeToolNameForCopilot('...')).toBe('___');
  });
});

// ---------------------------------------------------------------------------
// normalizeToolsInConfig — config transformation unit tests
// ---------------------------------------------------------------------------

describe('normalizeToolsInConfig', () => {
  it('returns the same config object when no tool-name fields are present', () => {
    const config: SquadSessionConfig = { model: 'claude-sonnet-4.5' };
    expect(normalizeToolsInConfig(config)).toBe(config);
  });

  it('normalizes dotted tool names in config.tools', () => {
    const config: SquadSessionConfig = {
      tools: [
        makeTool('memory.classify'),
        makeTool('memory.write'),
        makeTool('squad_route'),
      ],
    };
    const result = normalizeToolsInConfig(config);
    expect(result.tools?.map(t => t.name)).toEqual([
      'memory_classify',
      'memory_write',
      'squad_route',
    ]);
  });

  it('preserves handler references when normalizing tool names', () => {
    const handler = async () => 'hello';
    const config: SquadSessionConfig = {
      tools: [{ name: 'memory.classify', handler }],
    };
    const result = normalizeToolsInConfig(config);
    expect(result.tools![0]!.handler).toBe(handler);
  });

  it('normalizes dotted names in availableTools', () => {
    const config: SquadSessionConfig = {
      availableTools: ['memory.classify', 'squad_route', 'memory.write'],
    };
    const result = normalizeToolsInConfig(config);
    expect(result.availableTools).toEqual([
      'memory_classify',
      'squad_route',
      'memory_write',
    ]);
  });

  it('normalizes dotted names in excludedTools', () => {
    const config: SquadSessionConfig = {
      excludedTools: ['memory.delete', 'memory.audit'],
    };
    const result = normalizeToolsInConfig(config);
    expect(result.excludedTools).toEqual(['memory_delete', 'memory_audit']);
  });

  it('normalizes dotted names in customAgents[].tools', () => {
    const config: SquadSessionConfig = {
      customAgents: [
        {
          name: 'helper',
          prompt: 'You are a helper agent.',
          tools: ['memory.classify', 'squad_route'],
        },
        {
          name: 'assistant',
          prompt: 'You are an assistant.',
          tools: null,
        },
      ],
    };
    const result = normalizeToolsInConfig(config);
    expect(result.customAgents![0]!.tools).toEqual(['memory_classify', 'squad_route']);
    expect(result.customAgents![1]!.tools).toBeNull();
  });

  it('does not mutate the original config', () => {
    const originalTools = [makeTool('memory.classify')];
    const config: SquadSessionConfig = { tools: originalTools };
    normalizeToolsInConfig(config);
    expect(config.tools![0]!.name).toBe('memory.classify');
  });

  it('normalizes all six governed-memory tool names', () => {
    const memoryTools = [
      'memory.classify',
      'memory.write',
      'memory.search',
      'memory.promote',
      'memory.delete',
      'memory.audit',
    ];
    const config: SquadSessionConfig = { tools: memoryTools.map(makeTool) };
    const result = normalizeToolsInConfig(config);
    expect(result.tools?.map(t => t.name)).toEqual([
      'memory_classify',
      'memory_write',
      'memory_search',
      'memory_promote',
      'memory_delete',
      'memory_audit',
    ]);
  });

  it('throws on collision when two canonical names map to the same wire name', () => {
    const config: SquadSessionConfig = {
      tools: [makeTool('memory.classify'), makeTool('memory_classify')],
    };
    expect(() => normalizeToolsInConfig(config)).toThrowError(
      /collision.*"memory_classify".*"memory\.classify".*"memory_classify"/
    );
  });

  it('throws a descriptive collision error identifying both canonical names', () => {
    const config: SquadSessionConfig = {
      tools: [makeTool('x.y'), makeTool('x_y')],
    };
    expect(() => normalizeToolsInConfig(config)).toThrowError(
      /Rename one of these tools/
    );
  });

  it('handles empty tools array without throwing', () => {
    const config: SquadSessionConfig = { tools: [] };
    const result = normalizeToolsInConfig(config);
    expect(result.tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SquadClient integration — normalization applied before SDK calls
// ---------------------------------------------------------------------------

describe('SquadClient — tool name normalization at SDK boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes dotted tool names before calling CopilotClient.createSession', async () => {
    const client = new SquadClient({ autoStart: true });
    await client.createSession({
      tools: [
        makeTool('memory.classify'),
        makeTool('memory.write'),
        makeTool('squad_route'),
      ],
      onPermissionRequest: () => ({ kind: 'approve-once' }),
    });

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0]!.value;
    const sdkConfig = instance.createSession.mock.calls[0]![0];

    expect(sdkConfig.tools.map((t: SquadTool<unknown>) => t.name)).toEqual([
      'memory_classify',
      'memory_write',
      'squad_route',
    ]);
  });

  it('normalizes availableTools filter before calling CopilotClient.createSession', async () => {
    const client = new SquadClient({ autoStart: true });
    await client.createSession({
      tools: [makeTool('memory.classify')],
      availableTools: ['memory.classify', 'squad_route'],
    });

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0]!.value;
    const sdkConfig = instance.createSession.mock.calls[0]![0];

    expect(sdkConfig.availableTools).toEqual(['memory_classify', 'squad_route']);
  });

  it('normalizes excludedTools filter before calling CopilotClient.createSession', async () => {
    const client = new SquadClient({ autoStart: true });
    await client.createSession({
      tools: [makeTool('memory.audit'), makeTool('memory.delete')],
      excludedTools: ['memory.audit'],
    });

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0]!.value;
    const sdkConfig = instance.createSession.mock.calls[0]![0];

    expect(sdkConfig.excludedTools).toEqual(['memory_audit']);
  });

  it('normalizes dotted tool names before calling CopilotClient.resumeSession', async () => {
    const client = new SquadClient({ autoStart: true });
    await client.resumeSession('existing-session', {
      tools: [
        makeTool('memory.search'),
        makeTool('memory.promote'),
      ],
    });

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0]!.value;
    const sdkConfig = instance.resumeSession.mock.calls[0]![1];

    expect(sdkConfig.tools.map((t: SquadTool<unknown>) => t.name)).toEqual([
      'memory_search',
      'memory_promote',
    ]);
  });

  it('does not modify config when no dotted tool names are present', async () => {
    const client = new SquadClient({ autoStart: true });
    await client.createSession({
      tools: [makeTool('squad_route'), makeTool('squad_status')],
    });

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0]!.value;
    const sdkConfig = instance.createSession.mock.calls[0]![0];

    expect(sdkConfig.tools.map((t: SquadTool<unknown>) => t.name)).toEqual([
      'squad_route',
      'squad_status',
    ]);
  });

  it('rejects collision before forwarding to Copilot SDK', async () => {
    const client = new SquadClient({ autoStart: true });
    await expect(
      client.createSession({
        tools: [makeTool('memory.classify'), makeTool('memory_classify')],
      })
    ).rejects.toThrowError(/collision/);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — hook toolName reverse-mapping (canonical names for consumers)
// ---------------------------------------------------------------------------

describe('Suite 4: hook toolName reverse-mapping via normalizeToolsInConfig', () => {
  function makeConfig(
    toolNames: string[],
    preHook?: SquadSessionConfig['hooks'] & object
  ): SquadSessionConfig {
    return {
      tools: toolNames.map(n => makeTool(n)),
      ...(preHook ? { hooks: preHook } : {}),
    };
  }

  it('onPreToolUse receives canonical dotted name when SDK fires with wire name', async () => {
    const received: string[] = [];
    const config = makeConfig(['memory.classify', 'memory.write'], {
      onPreToolUse: async (input) => { received.push(input.toolName); },
    });

    const normalized = normalizeToolsInConfig(config);

    await normalized.hooks!.onPreToolUse!(
      { toolName: 'memory_classify', toolArgs: {} },
      { sessionId: 'test-s' }
    );

    expect(received).toEqual(['memory.classify']);
  });

  it('onPostToolUse receives canonical dotted name when SDK fires with wire name', async () => {
    const received: string[] = [];
    const config = makeConfig(['memory.write'], {
      onPostToolUse: async (input) => { received.push(input.toolName); },
    });

    const normalized = normalizeToolsInConfig(config);

    await normalized.hooks!.onPostToolUse!(
      { toolName: 'memory_write', toolArgs: {}, toolResult: null },
      { sessionId: 'test-s' }
    );

    expect(received).toEqual(['memory.write']);
  });

  it('unknown wire name passes through unchanged to hook', async () => {
    const received: string[] = [];
    const config = makeConfig(['memory.classify'], {
      onPreToolUse: async (input) => { received.push(input.toolName); },
    });

    const normalized = normalizeToolsInConfig(config);

    // SDK fires an unregistered tool — should not error, passes name as-is
    await normalized.hooks!.onPreToolUse!(
      { toolName: 'some_other_tool', toolArgs: {} },
      { sessionId: 'test-s' }
    );

    expect(received).toEqual(['some_other_tool']);
  });

  it('hooks are not wrapped when no tools have dots (no-op path)', () => {
    const original = vi.fn();
    const config = makeConfig(['plain_tool', 'another-tool'], {
      onPreToolUse: original,
    });

    const normalized = normalizeToolsInConfig(config);

    // When no names contain dots, wireToCanonical.size === 0, so hooks are
    // not wrapped — same function reference is preserved.
    expect(normalized.hooks!.onPreToolUse).toBe(original);
  });

  it('config without hooks normalizes tools without error', () => {
    const config = makeConfig(['memory.classify', 'memory.write']);
    const normalized = normalizeToolsInConfig(config);

    expect(normalized.tools!.map(t => t.name)).toEqual([
      'memory_classify',
      'memory_write',
    ]);
    expect(normalized.hooks).toBeUndefined();
  });
});
