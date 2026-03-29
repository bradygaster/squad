/**
 * Integration tests for the shell module — sessions, spawn, coordinator,
 * lifecycle, and stream-bridge.
 *
 * @module test/shell
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

import { SessionRegistry } from '@bradygaster/squad-cli/shell/sessions';
import {
  loadAgentCharter,
  buildAgentPrompt,
} from '@bradygaster/squad-cli/shell/spawn';
import {
  buildCoordinatorPrompt,
  parseCoordinatorResponse,
  formatConversationContext,
} from '@bradygaster/squad-cli/shell/coordinator';
import { ShellLifecycle } from '@bradygaster/squad-cli/shell/lifecycle';
import { StreamBridge } from '@bradygaster/squad-cli/shell/stream-bridge';
import { ShellRenderer } from '@bradygaster/squad-cli/shell/render';
import type { ShellMessage } from '@bradygaster/squad-cli/shell/types';
import type { StreamDelta, UsageEvent, ReasoningDelta } from '@bradygaster/squad-sdk/runtime/streaming';

const FIXTURES = join(process.cwd(), 'test-fixtures');

// ============================================================================
// 1. SessionRegistry
// ============================================================================

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('register creates a session with idle status', () => {
    const s = registry.register('hockney', 'Tester');
    expect(s.name).toBe('hockney');
    expect(s.role).toBe('Tester');
    expect(s.status).toBe('idle');
    expect(s.startedAt).toBeInstanceOf(Date);
  });

  it('get retrieves a registered session', () => {
    registry.register('fenster', 'Core Dev');
    expect(registry.get('fenster')?.role).toBe('Core Dev');
  });

  it('get returns undefined for unknown name', () => {
    expect(registry.get('nobody')).toBeUndefined();
  });

  it('getAll returns every registered session', () => {
    registry.register('a', 'r1');
    registry.register('b', 'r2');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getActive filters to working/streaming sessions', () => {
    registry.register('idle-agent', 'role');
    registry.register('busy-agent', 'role');
    registry.register('stream-agent', 'role');
    registry.updateStatus('busy-agent', 'working');
    registry.updateStatus('stream-agent', 'streaming');
    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.name).sort()).toEqual(['busy-agent', 'stream-agent']);
  });

  it('updateStatus changes session status', () => {
    registry.register('x', 'role');
    registry.updateStatus('x', 'error');
    expect(registry.get('x')?.status).toBe('error');
  });

  it('remove deletes a session and returns true', () => {
    registry.register('x', 'role');
    expect(registry.remove('x')).toBe(true);
    expect(registry.get('x')).toBeUndefined();
  });

  it('remove returns false for unknown name', () => {
    expect(registry.remove('ghost')).toBe(false);
  });

  it('clear removes all sessions', () => {
    registry.register('a', 'r');
    registry.register('b', 'r');
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});

// ============================================================================
// 2. Spawn infrastructure
// ============================================================================

describe('Spawn infrastructure', () => {
  describe('loadAgentCharter', () => {
    it('loads charter from test-fixtures/.squad/agents/{name}', async () => {
      const charter = await loadAgentCharter('hockney', FIXTURES);
      expect(charter).toContain('Hockney');
      expect(charter).toContain('Tester');
    });

    it('lowercases the agent name for path resolution', async () => {
      const charter = await loadAgentCharter('Fenster', FIXTURES);
      expect(charter).toContain('Core Dev');
    });

    it('throws for a missing charter', async () => {
      await expect(loadAgentCharter('nobody', FIXTURES)).rejects.toThrow(
        /No charter found for "nobody"/,
      );
    });
  });

  describe('buildAgentPrompt', () => {
    it('includes charter content', () => {
      const prompt = buildAgentPrompt('# My Charter');
      expect(prompt).toContain('# My Charter');
      expect(prompt).toContain('YOUR CHARTER');
    });

    it('includes systemContext when provided', () => {
      const prompt = buildAgentPrompt('charter', { systemContext: 'extra info' });
      expect(prompt).toContain('ADDITIONAL CONTEXT');
      expect(prompt).toContain('extra info');
    });

    it('omits ADDITIONAL CONTEXT when systemContext is absent', () => {
      const prompt = buildAgentPrompt('charter');
      expect(prompt).not.toContain('ADDITIONAL CONTEXT');
    });
  });
});

// ============================================================================
// 3. Coordinator
// ============================================================================

describe('Coordinator', () => {
  describe('buildCoordinatorPrompt', () => {
    it('includes team.md content', async () => {
      const prompt = await buildCoordinatorPrompt({
        teamRoot: FIXTURES,
        teamPath: join(FIXTURES, '.squad', 'team.md'),
      });
      expect(prompt).toContain('Hockney');
      expect(prompt).toContain('Fenster');
    });

    it('includes routing.md content', async () => {
      const prompt = await buildCoordinatorPrompt({
        teamRoot: FIXTURES,
        routingPath: join(FIXTURES, '.squad', 'routing.md'),
      });
      expect(prompt).toContain('Tests → Hockney');
    });

    it('falls back gracefully when team.md is missing', async () => {
      const prompt = await buildCoordinatorPrompt({
        teamRoot: join(FIXTURES, 'nonexistent'),
        teamPath: join(FIXTURES, 'nonexistent', 'team.md'),
      });
      expect(prompt).toContain('NO TEAM CONFIGURED');
    });

    it('falls back gracefully when routing.md is missing', async () => {
      const prompt = await buildCoordinatorPrompt({
        teamRoot: join(FIXTURES, 'nonexistent'),
        routingPath: join(FIXTURES, 'nonexistent', 'routing.md'),
      });
      expect(prompt).toContain('No routing.md found');
    });
  });

  describe('parseCoordinatorResponse', () => {
    it('parses DIRECT responses', () => {
      const result = parseCoordinatorResponse('DIRECT: The build is green.');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('The build is green.');
    });

    it('parses ROUTE responses', () => {
      const result = parseCoordinatorResponse(
        'ROUTE: Fenster\nTASK: Fix the parser\nCONTEXT: Related to issue #42',
      );
      expect(result.type).toBe('route');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0]!.agent).toBe('Fenster');
      expect(result.routes![0]!.task).toBe('Fix the parser');
      expect(result.routes![0]!.context).toBe('Related to issue #42');
    });

    it('parses ROUTE without CONTEXT', () => {
      const result = parseCoordinatorResponse('ROUTE: Hockney\nTASK: Run tests');
      expect(result.type).toBe('route');
      expect(result.routes![0]!.agent).toBe('Hockney');
      expect(result.routes![0]!.context).toBeUndefined();
    });

    it('parses MULTI responses', () => {
      const result = parseCoordinatorResponse(
        'MULTI:\n- Fenster: Implement the feature\n- Hockney: Write tests',
      );
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(2);
      expect(result.routes![0]!.agent).toBe('Fenster');
      expect(result.routes![1]!.agent).toBe('Hockney');
    });

    it('falls back to direct for unknown format', () => {
      const result = parseCoordinatorResponse('Just some random text');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('Just some random text');
    });
  });

  describe('formatConversationContext', () => {
    const msgs: ShellMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'user' as const,
      content: `message-${i}`,
      timestamp: new Date(),
    }));

    it('formats all messages with role prefix', () => {
      const ctx = formatConversationContext(msgs, 10);
      expect(ctx).toContain('[user]: message-0');
      expect(ctx).toContain('[user]: message-4');
    });

    it('respects maxMessages limit', () => {
      const ctx = formatConversationContext(msgs, 2);
      expect(ctx).not.toContain('message-0');
      expect(ctx).toContain('message-3');
      expect(ctx).toContain('message-4');
    });

    it('uses agentName prefix when present', () => {
      const agentMsgs: ShellMessage[] = [
        { role: 'agent', agentName: 'fenster', content: 'done', timestamp: new Date() },
      ];
      const ctx = formatConversationContext(agentMsgs);
      expect(ctx).toContain('[fenster]: done');
    });
  });
});

// ============================================================================
// 4. ShellLifecycle
// ============================================================================

describe('ShellLifecycle', () => {
  let lifecycle: ShellLifecycle;
  let registry: SessionRegistry;
  let renderer: ShellRenderer;

  beforeEach(() => {
    registry = new SessionRegistry();
    renderer = new ShellRenderer();
    lifecycle = new ShellLifecycle({ teamRoot: FIXTURES, renderer, registry });
  });

  it('starts in initializing state', () => {
    expect(lifecycle.getState().status).toBe('initializing');
  });

  it('transitions to ready after initialize', async () => {
    await lifecycle.initialize();
    expect(lifecycle.getState().status).toBe('ready');
  });

  it('discovers active agents from team.md', async () => {
    await lifecycle.initialize();
    const agents = lifecycle.getDiscoveredAgents();
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.some(a => a.name === 'Hockney')).toBe(true);
  });

  it('registers active agents in the registry', async () => {
    await lifecycle.initialize();
    expect(registry.getAll().length).toBeGreaterThanOrEqual(2);
  });

  it('addUserMessage appends to history', () => {
    const msg = lifecycle.addUserMessage('hello');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(lifecycle.getHistory()).toHaveLength(1);
  });

  it('addAgentMessage appends with agentName', () => {
    const msg = lifecycle.addAgentMessage('fenster', 'done');
    expect(msg.role).toBe('agent');
    expect(msg.agentName).toBe('fenster');
    expect(lifecycle.getHistory()).toHaveLength(1);
  });

  it('addSystemMessage appends system message', () => {
    const msg = lifecycle.addSystemMessage('system note');
    expect(msg.role).toBe('system');
    expect(lifecycle.getHistory()).toHaveLength(1);
  });

  it('getHistory returns all messages', () => {
    lifecycle.addUserMessage('a');
    lifecycle.addAgentMessage('f', 'b');
    lifecycle.addSystemMessage('c');
    expect(lifecycle.getHistory()).toHaveLength(3);
  });

  it('getHistory filters by agentName', () => {
    lifecycle.addUserMessage('hi');
    lifecycle.addAgentMessage('fenster', 'ok');
    lifecycle.addAgentMessage('hockney', 'tests pass');
    const filtered = lifecycle.getHistory('fenster');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.agentName).toBe('fenster');
  });

  it('shutdown clears all state', async () => {
    await lifecycle.initialize();
    lifecycle.addUserMessage('hi');
    await lifecycle.shutdown();
    expect(lifecycle.getHistory()).toHaveLength(0);
    expect(lifecycle.getDiscoveredAgents()).toHaveLength(0);
    expect(registry.getAll()).toHaveLength(0);
  });
});

// ============================================================================
// 5. StreamBridge
// ============================================================================

describe('StreamBridge', () => {
  let registry: SessionRegistry;
  let bridge: StreamBridge;
  let contentCalls: Array<{ agent: string; content: string }>;
  let completeCalls: ShellMessage[];
  let usageCalls: Array<{ model: string; inputTokens: number; outputTokens: number; cost: number }>;
  let reasoningCalls: Array<{ agent: string; content: string }>;

  beforeEach(() => {
    registry = new SessionRegistry();
    registry.register('fenster', 'Core Dev');

    contentCalls = [];
    completeCalls = [];
    usageCalls = [];
    reasoningCalls = [];

    bridge = new StreamBridge(registry, {
      onContent: (agent, content) => contentCalls.push({ agent, content }),
      onComplete: (msg) => completeCalls.push(msg),
      onUsage: (u) => usageCalls.push(u),
      onReasoning: (agent, content) => reasoningCalls.push({ agent, content }),
    });
  });

  it('handleEvent processes message_delta events', () => {
    const delta: StreamDelta = {
      type: 'message_delta',
      sessionId: 'fenster',
      agentName: 'fenster',
      content: 'hello',
      index: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(delta);
    expect(contentCalls).toHaveLength(1);
    expect(contentCalls[0]!.content).toBe('hello');
  });

  it('accumulates content in getBuffer', () => {
    const mkDelta = (content: string, index: number): StreamDelta => ({
      type: 'message_delta',
      sessionId: 'fenster',
      agentName: 'fenster',
      content,
      index,
      timestamp: new Date(),
    });
    bridge.handleEvent(mkDelta('Hello', 0));
    bridge.handleEvent(mkDelta(' world', 1));
    expect(bridge.getBuffer('fenster')).toBe('Hello world');
  });

  it('handleEvent processes usage events', () => {
    const usage: UsageEvent = {
      type: 'usage',
      sessionId: 'fenster',
      agentName: 'fenster',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
      timestamp: new Date(),
    };
    bridge.handleEvent(usage);
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0]!.model).toBe('gpt-4');
    expect(usageCalls[0]!.cost).toBe(0.01);
  });

  it('handleEvent processes reasoning_delta events', () => {
    const reasoning: ReasoningDelta = {
      type: 'reasoning_delta',
      sessionId: 'fenster',
      agentName: 'fenster',
      content: 'thinking...',
      index: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(reasoning);
    expect(reasoningCalls).toHaveLength(1);
    expect(reasoningCalls[0]!.content).toBe('thinking...');
  });

  it('flush emits a complete ShellMessage', () => {
    const delta: StreamDelta = {
      type: 'message_delta',
      sessionId: 'fenster',
      agentName: 'fenster',
      content: 'result',
      index: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(delta);
    bridge.flush('fenster');
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]!.content).toBe('result');
    expect(completeCalls[0]!.role).toBe('agent');
    // Buffer should be cleared after flush
    expect(bridge.getBuffer('fenster')).toBe('');
  });

  it('flush does nothing for empty buffers', () => {
    bridge.flush('nobody');
    expect(completeCalls).toHaveLength(0);
  });

  it('getBuffer returns empty string for unknown session', () => {
    expect(bridge.getBuffer('unknown')).toBe('');
  });

  it('clear resets all buffers', () => {
    const delta: StreamDelta = {
      type: 'message_delta',
      sessionId: 'fenster',
      content: 'data',
      index: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(delta);
    bridge.clear();
    expect(bridge.getBuffer('fenster')).toBe('');
  });

  it('marks session as streaming on delta', () => {
    const delta: StreamDelta = {
      type: 'message_delta',
      sessionId: 'fenster',
      agentName: 'fenster',
      content: 'x',
      index: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(delta);
    expect(registry.get('fenster')?.status).toBe('streaming');
  });

  it('marks session as idle on usage event', () => {
    registry.updateStatus('fenster', 'streaming');
    const usage: UsageEvent = {
      type: 'usage',
      sessionId: 'fenster',
      agentName: 'fenster',
      model: 'gpt-4',
      inputTokens: 10,
      outputTokens: 5,
      estimatedCost: 0,
      timestamp: new Date(),
    };
    bridge.handleEvent(usage);
    expect(registry.get('fenster')?.status).toBe('idle');
  });
});
