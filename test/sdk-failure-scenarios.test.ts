/**
 * SDK Failure Scenario Tests
 *
 * Tests graceful degradation when the SDK fails in various ways:
 * - sendAndWait returns undefined (ghost response)
 * - sendAndWait throws Error
 * - sendAndWait hangs past timeout
 * - Session fires 'error' event mid-stream
 * - Malformed data from SDK
 *
 * Follows patterns from test/repl-streaming.test.ts and test/ghost-response.test.ts.
 *
 * Closes #377
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withGhostRetry,
  parseCoordinatorResponse,
  SessionRegistry,
} from '../packages/squad-cli/src/cli/shell/index.js';

// ============================================================================
// Types & mock factories (mirrors repl-streaming.test.ts patterns)
// ============================================================================

type EventHandler = (event: { type: string; [key: string]: unknown }) => void;

interface MockSquadSession {
  sendAndWait: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sessionId: string;
  _listeners: Map<string, Set<EventHandler>>;
  _emit: (eventName: string, event: { type: string; [key: string]: unknown }) => void;
}

function createMockSession(overrides: Partial<Pick<MockSquadSession, 'sendAndWait' | 'sendMessage'>> = {}): MockSquadSession {
  const listeners = new Map<string, Set<EventHandler>>();

  const session: MockSquadSession = {
    sessionId: `mock-${Date.now()}`,
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

    sendAndWait: overrides.sendAndWait ?? vi.fn().mockResolvedValue(undefined),
    sendMessage: overrides.sendMessage ?? vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return session;
}

/**
 * Simulates the dispatch flow from index.ts:
 * 1. Register delta listener
 * 2. Call sendAndWait
 * 3. Accumulate deltas
 * 4. Return accumulated or fallback content
 */
async function simulateDispatch(
  session: MockSquadSession,
  message: string,
  timeoutMs = 5000,
): Promise<{ content: string; error?: string }> {
  let accumulated = '';

  const onDelta = (event: { type: string; [key: string]: unknown }): void => {
    const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
    const delta = typeof val === 'string' ? val : '';
    if (delta) accumulated += delta;
  };

  session.on('message_delta', onDelta);

  try {
    const result = await Promise.race([
      session.sendAndWait({ prompt: message }, timeoutMs),
      new Promise<'timeout'>((_, reject) =>
        setTimeout(() => reject(new Error('Session response timeout')), timeoutMs)
      ),
    ]);

    // Extract fallback content if available
    const data = (result as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined;
    const fallback = typeof data?.['content'] === 'string' ? data['content'] as string : '';
    if (!accumulated && fallback) accumulated = fallback;

    return { content: accumulated };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { content: accumulated, error: errorMsg };
  } finally {
    try { session.off('message_delta', onDelta); } catch { /* ignore */ }
  }
}

// ============================================================================
// 1. sendAndWait returns undefined (ghost response)
// ============================================================================

describe('SDK failure: sendAndWait returns undefined', () => {
  it('returns empty content, does not throw', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockResolvedValue(undefined),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.content).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('returns empty content when result is null', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockResolvedValue(null),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.content).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('ghost retry recovers on second attempt', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('recovered');

    const result = await withGhostRetry(sendFn, {
      backoffMs: [1],
    });

    expect(result).toBe('recovered');
    expect(sendFn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// 2. sendAndWait throws Error
// ============================================================================

describe('SDK failure: sendAndWait throws', () => {
  it('catches synchronous throw gracefully', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.error).toBe('Connection refused');
    expect(result.content).toBe('');
  });

  it('catches TypeError from SDK', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockRejectedValue(new TypeError('Cannot read property of undefined')),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.error).toContain('Cannot read property');
  });

  it('catches non-Error throws', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockRejectedValue('string error'),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.error).toBe('string error');
  });

  it('catches throw after partial streaming', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        // Emit some deltas then throw
        session._emit('message_delta', { type: 'message_delta', deltaContent: 'partial ' });
        session._emit('message_delta', { type: 'message_delta', deltaContent: 'data' });
        throw new Error('Connection dropped mid-stream');
      }),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.error).toBe('Connection dropped mid-stream');
    expect(result.content).toBe('partial data');
  });
});

// ============================================================================
// 3. sendAndWait hangs past timeout
// ============================================================================

describe('SDK failure: sendAndWait hangs', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('times out after specified duration', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(() => new Promise(() => {
        // Never resolves
      })),
    });

    const dispatchPromise = simulateDispatch(session, 'hello', 100);
    await vi.advanceTimersByTimeAsync(200);
    const result = await dispatchPromise;

    expect(result.error).toBe('Session response timeout');
    expect(result.content).toBe('');
  });

  it('times out but preserves partial streamed content', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        session._emit('message_delta', { type: 'message_delta', deltaContent: 'partial' });
        // Then hang forever
        return new Promise(() => {});
      }),
    });

    const dispatchPromise = simulateDispatch(session, 'hello', 100);
    await vi.advanceTimersByTimeAsync(200);
    const result = await dispatchPromise;

    expect(result.error).toBe('Session response timeout');
    expect(result.content).toBe('partial');
  });
});

// ============================================================================
// 4. Session fires 'error' event mid-stream
// ============================================================================

describe('SDK failure: session error event', () => {
  it('error event during dispatch does not crash', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        session._emit('message_delta', { type: 'message_delta', deltaContent: 'hello' });
        session._emit('error', { type: 'error', message: 'WebSocket disconnected' });
        return undefined;
      }),
    });

    // Error events should not cause unhandled exceptions
    const result = await simulateDispatch(session, 'test');
    // Content up to error point should be preserved
    expect(result.content).toBe('hello');
  });

  it('multiple error events do not stack crash', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        session._emit('error', { type: 'error', message: 'err1' });
        session._emit('error', { type: 'error', message: 'err2' });
        session._emit('error', { type: 'error', message: 'err3' });
        return undefined;
      }),
    });

    const result = await simulateDispatch(session, 'test');
    expect(result.error).toBeUndefined();
  });

  it('error handler registration and cleanup works', () => {
    const session = createMockSession();
    const errorHandler = vi.fn();

    session.on('error', errorHandler);
    session._emit('error', { type: 'error', message: 'test' });
    expect(errorHandler).toHaveBeenCalledTimes(1);

    session.off('error', errorHandler);
    session._emit('error', { type: 'error', message: 'test2' });
    expect(errorHandler).toHaveBeenCalledTimes(1); // Not called again
  });
});

// ============================================================================
// 5. Malformed data from SDK
// ============================================================================

describe('SDK failure: malformed data', () => {
  it('handles sendAndWait returning a number', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockResolvedValue(42),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.content).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('handles sendAndWait returning an empty object', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockResolvedValue({}),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.content).toBe('');
  });

  it('handles malformed delta events', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        // Deltas with wrong shape
        session._emit('message_delta', { type: 'message_delta' }); // no content
        session._emit('message_delta', { type: 'message_delta', deltaContent: 42 } as any); // number
        session._emit('message_delta', { type: 'message_delta', deltaContent: null } as any); // null
        session._emit('message_delta', { type: 'message_delta', deltaContent: undefined }); // undefined
        session._emit('message_delta', { type: 'message_delta', deltaContent: { nested: 'object' } } as any); // object
        return undefined;
      }),
    });

    const result = await simulateDispatch(session, 'hello');
    // None of the malformed deltas should contribute content
    expect(result.content).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('handles delta with empty string content', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn(async () => {
        session._emit('message_delta', { type: 'message_delta', deltaContent: '' });
        session._emit('message_delta', { type: 'message_delta', deltaContent: '' });
        session._emit('message_delta', { type: 'message_delta', deltaContent: 'actual' });
        return undefined;
      }),
    });

    const result = await simulateDispatch(session, 'hello');
    expect(result.content).toBe('actual');
  });

  it('handles coordinator response with malformed routing data', () => {
    // parseCoordinatorResponse should not throw on garbage input
    const garbageInputs = [
      '',
      'null',
      '42',
      '{}',
      'ROUTE:',
      'ROUTE: ',
      'MULTI:',
      'MULTI: ',
      'DIRECT:',
      '\n\nROUTE: agent',
      '```\nROUTE: agent\n```',
      'Sure! ROUTE: agent',
      'ROUTE:nonexistent_agent some message',
    ];

    for (const input of garbageInputs) {
      expect(() => {
        const result = parseCoordinatorResponse(input, ['Brady', 'Kovash']);
        expect(result).toBeDefined();
        expect(result).toHaveProperty('type');
      }).not.toThrow();
    }
  });
});

// ============================================================================
// 6. Session recovery after failure
// ============================================================================

describe('SDK failure: session recovery', () => {
  it('SessionRegistry tracks error state correctly', () => {
    const registry = new SessionRegistry();
    registry.register('TestAgent', 'developer');

    // Simulate error
    registry.updateStatus('TestAgent', 'error');
    expect(registry.get('TestAgent')?.status).toBe('error');

    // Recovery: back to idle
    registry.updateStatus('TestAgent', 'idle');
    expect(registry.get('TestAgent')?.status).toBe('idle');
    expect(registry.getActive()).toHaveLength(0);
  });

  it('SessionRegistry remove clears dead sessions', () => {
    const registry = new SessionRegistry();
    registry.register('DeadAgent', 'developer');
    registry.updateStatus('DeadAgent', 'error');

    expect(registry.get('DeadAgent')).toBeDefined();
    registry.remove('DeadAgent');
    expect(registry.get('DeadAgent')).toBeUndefined();
  });

  it('session close after error does not throw', async () => {
    const session = createMockSession({
      sendAndWait: vi.fn().mockRejectedValue(new Error('dead')),
    });

    await simulateDispatch(session, 'test');
    // Close should work fine after error
    await expect(session.close()).resolves.toBeUndefined();
  });

  it('new dispatch after error works on fresh session', async () => {
    // First session fails
    const deadSession = createMockSession({
      sendAndWait: vi.fn().mockRejectedValue(new Error('dead')),
    });
    const result1 = await simulateDispatch(deadSession, 'test');
    expect(result1.error).toBe('dead');

    // New session works
    const freshSession = createMockSession({
      sendAndWait: vi.fn(async () => {
        freshSession._emit('message_delta', { type: 'message_delta', deltaContent: 'recovered' });
        return undefined;
      }),
    });
    const result2 = await simulateDispatch(freshSession, 'test');
    expect(result2.content).toBe('recovered');
    expect(result2.error).toBeUndefined();
  });
});
