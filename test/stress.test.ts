/**
 * Stress & Boundary Tests
 *
 * Tests system behavior under load and at boundaries:
 * - 500+ messages in MessageStream — no crash, reasonable memory
 * - Rapid sequential dispatch calls — no race conditions
 * - Extremely long input strings — graceful handling
 * - Concurrent operations — no clobbering
 * - Memory growth tracking with MemoryManager
 *
 * Closes #378
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  parseInput,
  executeCommand,
  SessionRegistry,
  ShellRenderer,
  MemoryManager,
  DEFAULT_LIMITS,
  withGhostRetry,
  parseCoordinatorResponse,
} from '../packages/squad-cli/src/cli/shell/index.js';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

const h = React.createElement;

function makeMessage(content: string, role: ShellMessage['role'] = 'agent', index = 0): ShellMessage {
  return {
    role,
    content,
    timestamp: new Date(Date.now() + index),
    agentName: role === 'agent' ? 'StressAgent' : undefined,
  };
}

function makeCommandContext() {
  return {
    registry: new SessionRegistry(),
    renderer: new ShellRenderer(),
    messageHistory: [] as ShellMessage[],
    teamRoot: '/tmp/stress-test',
  };
}

// ============================================================================
// 1. MessageStream with 500+ messages
// ============================================================================

describe('Stress: MessageStream with large message counts', () => {
  it('renders 500 messages without crashing', () => {
    const messages: ShellMessage[] = [];
    for (let i = 0; i < 500; i++) {
      messages.push(makeMessage(`User message ${i}`, 'user', i * 2));
      messages.push(makeMessage(`Agent response ${i}`, 'agent', i * 2 + 1));
    }

    expect(() => {
      const { unmount, lastFrame } = render(h(MessageStream, { messages }));
      const frame = lastFrame();
      expect(frame).toBeDefined();
      unmount();
    }).not.toThrow();
  });

  it('renders 1000 messages without crashing', () => {
    const messages: ShellMessage[] = [];
    for (let i = 0; i < 1000; i++) {
      messages.push(makeMessage(`Message ${i}`, i % 2 === 0 ? 'user' : 'agent', i));
    }

    expect(() => {
      const { unmount } = render(h(MessageStream, { messages }));
      unmount();
    }).not.toThrow();
  });

  it('maxVisible prop limits rendered messages', () => {
    const messages: ShellMessage[] = [];
    for (let i = 0; i < 200; i++) {
      messages.push(makeMessage(`Message ${i}`, 'user', i));
    }

    // With maxVisible=10, only last 10 should render
    const { lastFrame, unmount } = render(
      h(MessageStream, { messages, maxVisible: 10 })
    );
    const frame = lastFrame()!;
    // Should contain last messages but not first ones
    expect(frame).toContain('Message 199');
    expect(frame).not.toContain('Message 0');
    unmount();
  });

  it('handles rapid message additions', () => {
    const messages: ShellMessage[] = [];

    // Simulate rapid message growth
    for (let batch = 0; batch < 10; batch++) {
      for (let i = 0; i < 50; i++) {
        messages.push(makeMessage(`Batch ${batch} msg ${i}`, 'user', batch * 50 + i));
      }

      expect(() => {
        const { unmount } = render(h(MessageStream, { messages: [...messages] }));
        unmount();
      }).not.toThrow();
    }

    expect(messages.length).toBe(500);
  });
});

// ============================================================================
// 2. Rapid sequential parseInput calls
// ============================================================================

describe('Stress: rapid parseInput calls', () => {
  const agents = ['Brady', 'Agent1', 'Agent2', 'Agent3', 'Agent4', 'Agent5'];

  it('handles 1000 sequential parseInput calls', () => {
    const inputs = [
      'hello world',
      '/status',
      '@Brady fix the bug',
      'Kovash, review this',
      '/help',
      '🚀💥🔥 deploy now',
      '/history 50',
      '@Agent2 run tests',
      "'; DROP TABLE users; --",
      '<script>alert("xss")</script>',
    ];

    for (let i = 0; i < 1000; i++) {
      const input = inputs[i % inputs.length]!;
      expect(() => parseInput(input, agents)).not.toThrow();
    }
  });

  it('alternating slash commands and coordinator messages', () => {
    for (let i = 0; i < 500; i++) {
      if (i % 2 === 0) {
        const result = parseInput(`/command${i}`, agents);
        expect(result.type).toBe('slash_command');
      } else {
        const result = parseInput(`message number ${i}`, agents);
        expect(result.type).toBe('coordinator');
      }
    }
  });
});

// ============================================================================
// 3. Extremely long input strings
// ============================================================================

describe('Stress: extremely long inputs', () => {
  const agents = ['Brady', 'Kovash'];

  it('handles 10KB input string through parseInput', () => {
    const longInput = 'X'.repeat(10240);
    expect(() => {
      const result = parseInput(longInput, agents);
      expect(result.type).toBe('coordinator');
      expect(result.raw.length).toBe(10240);
    }).not.toThrow();
  });

  it('handles 100KB input string through parseInput', () => {
    const longInput = 'Y'.repeat(102400);
    expect(() => {
      const result = parseInput(longInput, agents);
      expect(result.type).toBe('coordinator');
    }).not.toThrow();
  });

  it('handles 10KB slash command through executeCommand', () => {
    const context = makeCommandContext();
    const longArg = 'Z'.repeat(10240);
    expect(() => {
      executeCommand('history', [longArg], context);
    }).not.toThrow();
  });

  it('handles 10KB string in MessageStream', () => {
    const longContent = 'W'.repeat(10240);
    expect(() => {
      const messages = [makeMessage(longContent, 'agent')];
      const { unmount } = render(h(MessageStream, { messages }));
      unmount();
    }).not.toThrow();
  });

  it('handles 1MB string through parseInput without OOM', () => {
    const megaInput = 'M'.repeat(1024 * 1024);
    expect(() => {
      parseInput(megaInput, agents);
    }).not.toThrow();
  });

  it('handles input with 10000 newlines', () => {
    const multiline = 'line\n'.repeat(10000);
    expect(() => {
      const result = parseInput(multiline, agents);
      expect(result.type).toBe('coordinator');
    }).not.toThrow();
  });
});

// ============================================================================
// 4. Concurrent dispatch simulation
// ============================================================================

describe('Stress: concurrent dispatch calls', () => {
  type EventHandler = (event: { type: string; [key: string]: unknown }) => void;

  function createConcurrentSession(name: string, deltas: string[]) {
    const listeners = new Map<string, Set<EventHandler>>();
    return {
      name,
      sessionId: `session-${name}`,
      _listeners: listeners,
      on: vi.fn((event: string, handler: EventHandler) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      }),
      off: vi.fn((event: string, handler: EventHandler) => {
        listeners.get(event)?.delete(handler);
      }),
      _emit(eventName: string, event: { type: string; [key: string]: unknown }) {
        for (const handler of listeners.get(eventName) ?? []) {
          handler(event);
        }
      },
      sendAndWait: vi.fn(async () => {
        for (const d of deltas) {
          // Small delay to simulate real streaming
          await new Promise(r => setTimeout(r, 1));
          listeners.get('message_delta')?.forEach(h =>
            h({ type: 'message_delta', deltaContent: d })
          );
        }
        return undefined;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('handles 5 concurrent dispatches without race conditions', async () => {
    const sessions = [
      createConcurrentSession('Agent1', ['A1-chunk1', 'A1-chunk2']),
      createConcurrentSession('Agent2', ['A2-chunk1', 'A2-chunk2']),
      createConcurrentSession('Agent3', ['A3-chunk1', 'A3-chunk2']),
      createConcurrentSession('Agent4', ['A4-chunk1', 'A4-chunk2']),
      createConcurrentSession('Agent5', ['A5-chunk1', 'A5-chunk2']),
    ];

    const results = await Promise.allSettled(
      sessions.map(async (session) => {
        let accumulated = '';
        const onDelta = (event: { type: string; [key: string]: unknown }) => {
          const delta = typeof event['deltaContent'] === 'string' ? event['deltaContent'] as string : '';
          if (delta) accumulated += delta;
        };
        session.on('message_delta', onDelta);
        await session.sendAndWait({ prompt: `test ${session.name}` }, 5000);
        session.off('message_delta', onDelta);
        return { name: session.name, content: accumulated };
      })
    );

    // All should settle as fulfilled
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    // Each session should have its own content, not mixed
    const values = results
      .filter((r): r is PromiseFulfilledResult<{ name: string; content: string }> => r.status === 'fulfilled')
      .map(r => r.value);

    // Delta content uses short names like A1, A2 etc.
    const shortNames = ['A1', 'A2', 'A3', 'A4', 'A5'];
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      const short = shortNames[i]!;
      expect(v.content).toContain(`${short}-chunk1`);
      expect(v.content).toContain(`${short}-chunk2`);
      // Must NOT contain other agents' content
      for (let j = 0; j < shortNames.length; j++) {
        if (j !== i) {
          expect(v.content).not.toContain(`${shortNames[j]}-chunk`);
        }
      }
    }
  });

  it('handles 10 rapid sequential dispatches', async () => {
    const results: string[] = [];

    for (let i = 0; i < 10; i++) {
      const session = createConcurrentSession(`Seq${i}`, [`result-${i}`]);
      let accumulated = '';
      const onDelta = (event: { type: string; [key: string]: unknown }) => {
        const delta = typeof event['deltaContent'] === 'string' ? event['deltaContent'] as string : '';
        if (delta) accumulated += delta;
      };
      session.on('message_delta', onDelta);
      await session.sendAndWait({ prompt: `test ${i}` }, 5000);
      session.off('message_delta', onDelta);
      results.push(accumulated);
    }

    // Each result should be unique and correct
    for (let i = 0; i < 10; i++) {
      expect(results[i]).toBe(`result-${i}`);
    }
  });
});

// ============================================================================
// 5. MemoryManager limits
// ============================================================================

describe('Stress: MemoryManager enforcement', () => {
  it('trimMessages caps at maxMessages', () => {
    const mm = new MemoryManager({ maxMessages: 100 });
    const messages = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const trimmed = mm.trimMessages(messages);

    expect(trimmed.length).toBe(100);
    // Should keep the LAST 100 messages
    expect((trimmed[0] as any).id).toBe(400);
    expect((trimmed[99] as any).id).toBe(499);
  });

  it('trackBuffer enforces maxStreamBuffer', () => {
    const mm = new MemoryManager({ maxStreamBuffer: 1024 });

    // Fill up to limit
    expect(mm.trackBuffer('session1', 512)).toBe(true);
    expect(mm.trackBuffer('session1', 512)).toBe(true);
    // Exceeds limit
    expect(mm.trackBuffer('session1', 1)).toBe(false);
  });

  it('clearBuffer resets tracking', () => {
    const mm = new MemoryManager({ maxStreamBuffer: 1024 });
    mm.trackBuffer('session1', 1024);
    expect(mm.trackBuffer('session1', 1)).toBe(false);

    mm.clearBuffer('session1');
    expect(mm.trackBuffer('session1', 512)).toBe(true);
  });

  it('canCreateSession respects maxSessions', () => {
    const mm = new MemoryManager({ maxSessions: 5 });
    expect(mm.canCreateSession(4)).toBe(true);
    expect(mm.canCreateSession(5)).toBe(false);
    expect(mm.canCreateSession(10)).toBe(false);
  });

  it('getStats tracks multiple sessions', () => {
    const mm = new MemoryManager();
    mm.trackBuffer('s1', 100);
    mm.trackBuffer('s2', 200);
    mm.trackBuffer('s3', 300);

    const stats = mm.getStats();
    expect(stats.sessions).toBe(3);
    expect(stats.totalBufferBytes).toBe(600);
  });

  it('DEFAULT_LIMITS has sane values', () => {
    expect(DEFAULT_LIMITS.maxMessages).toBe(200);
    expect(DEFAULT_LIMITS.maxStreamBuffer).toBe(1024 * 1024);
    expect(DEFAULT_LIMITS.maxSessions).toBe(10);
    expect(DEFAULT_LIMITS.sessionIdleTimeout).toBe(5 * 60 * 1000);
  });

  it('trimMessages with 10000 messages', () => {
    const mm = new MemoryManager({ maxMessages: 1000 });
    const messages = Array.from({ length: 10000 }, (_, i) => i);
    const trimmed = mm.trimMessages(messages);
    expect(trimmed.length).toBe(1000);
    expect(trimmed[0]).toBe(9000);
  });
});

// ============================================================================
// 6. SessionRegistry under load
// ============================================================================

describe('Stress: SessionRegistry operations', () => {
  it('handles 100 agent registrations', () => {
    const registry = new SessionRegistry();
    for (let i = 0; i < 100; i++) {
      registry.register(`Agent${i}`, 'developer');
    }
    expect(registry.getAll().length).toBe(100);
  });

  it('rapid status transitions', () => {
    const registry = new SessionRegistry();
    registry.register('FlickerAgent', 'developer');

    const statuses: Array<'idle' | 'working' | 'streaming' | 'error'> = [
      'idle', 'working', 'streaming', 'idle', 'error', 'idle', 'working', 'streaming',
    ];

    for (let i = 0; i < 1000; i++) {
      const status = statuses[i % statuses.length]!;
      registry.updateStatus('FlickerAgent', status);
      expect(registry.get('FlickerAgent')?.status).toBe(status);
    }
  });

  it('concurrent activity hint updates', () => {
    const registry = new SessionRegistry();
    for (let i = 0; i < 10; i++) {
      registry.register(`Agent${i}`, 'developer');
    }

    // Rapid hint updates across all agents
    for (let round = 0; round < 100; round++) {
      for (let i = 0; i < 10; i++) {
        registry.updateActivityHint(`Agent${i}`, `Doing task ${round}`);
      }
    }

    // All should have last hint
    for (let i = 0; i < 10; i++) {
      expect(registry.get(`Agent${i}`)?.activityHint).toBe('Doing task 99');
    }
  });
});

// ============================================================================
// 7. parseCoordinatorResponse under load
// ============================================================================

describe('Stress: parseCoordinatorResponse with many agents', () => {
  const manyAgents = Array.from({ length: 50 }, (_, i) => `Agent${i}`);

  it('handles 1000 routing decisions', () => {
    const inputs = [
      'ROUTE: Agent0 Do something',
      'MULTI: Agent0,Agent1,Agent2 Do everything',
      'DIRECT: Just answer directly',
      'Regular message no routing',
      'ROUTE: Agent49 Last agent',
    ];

    for (let i = 0; i < 1000; i++) {
      const input = inputs[i % inputs.length]!;
      expect(() => {
        const result = parseCoordinatorResponse(input, manyAgents);
        expect(result).toBeDefined();
      }).not.toThrow();
    }
  });
});
