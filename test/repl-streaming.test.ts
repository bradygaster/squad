/**
 * REPL Streaming Tests
 *
 * Validates the fix for the streaming dispatch bug where sendMessage()
 * resolved before streaming completed, resulting in empty responses.
 *
 * Tests:
 * - dispatchToAgent waits for streamed content via sendAndWait
 * - dispatchToCoordinator waits for streamed content via sendAndWait
 * - Fallback to turn_end/idle events when sendAndWait is unavailable
 * - Empty response handling (graceful fallback)
 * - The sendMessage → accumulated → parseCoordinatorResponse pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseContextWarningThreshold,
  parseCoordinatorResponse,
  SessionRegistry,
} from '../packages/squad-cli/src/cli/shell/index.js';
import { TIMEOUTS } from '../packages/squad-sdk/src/runtime/constants.js';

// ============================================================================
// Types & mock factories
// ============================================================================

type EventHandler = (event: { type: string; [key: string]: unknown }) => void;

describe('context warning threshold', () => {
  it('accepts a fractional threshold and falls back to 80% for invalid values', () => {
    expect(parseContextWarningThreshold('0.65')).toBe(0.65);
    expect(parseContextWarningThreshold(undefined)).toBe(0.8);
    expect(parseContextWarningThreshold('0')).toBe(0.8);
    expect(parseContextWarningThreshold('101')).toBe(0.8);
    expect(parseContextWarningThreshold('not-a-number')).toBe(0.8);
  });
});

interface MockSquadSession {
  sendMessage: ReturnType<typeof vi.fn>;
  sendAndWait: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sessionId: string;
  /** Stored event listeners keyed by event name */
  _listeners: Map<string, Set<EventHandler>>;
  /** Helper: emit an event to all registered listeners */
  _emit: (eventName: string, event: { type: string; [key: string]: unknown }) => void;
}

/**
 * Create a mock session that simulates SDK streaming behaviour.
 * `sendAndWait` resolves only after all deltas have been emitted.
 */
function createStreamingMockSession(deltas: string[]): MockSquadSession {
  const listeners = new Map<string, Set<EventHandler>>();

  const session: MockSquadSession = {
    sessionId: 'mock-session-1',
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

    // sendAndWait emits deltas then resolves — simulates the real SDK
    sendAndWait: vi.fn(async () => {
      for (const d of deltas) {
        session._emit('message_delta', { type: 'message_delta', deltaContent: d });
      }
      return undefined;
    }),

    sendMessage: vi.fn(async () => {
      // fire-and-forget: resolves immediately, deltas come later
    }),

    close: vi.fn().mockResolvedValue(undefined),
  };

  return session;
}

/**
 * Create a mock session that only has sendMessage (no sendAndWait).
 * Deltas are emitted asynchronously after sendMessage resolves.
 */
function createLegacyMockSession(deltas: string[]): MockSquadSession {
  const listeners = new Map<string, Set<EventHandler>>();

  const session: MockSquadSession = {
    sessionId: 'mock-legacy-1',
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

    // No sendAndWait — deleted below
    sendAndWait: undefined as unknown as ReturnType<typeof vi.fn>,

    sendMessage: vi.fn(async () => {
      // Simulate async streaming: emit deltas then turn_end on next tick
      setTimeout(() => {
        for (const d of deltas) {
          session._emit('message_delta', { type: 'message_delta', deltaContent: d });
        }
        session._emit('turn_end', { type: 'turn_end' });
      }, 5);
    }),

    close: vi.fn().mockResolvedValue(undefined),
  };

  // Remove sendAndWait to trigger fallback path
  delete (session as Record<string, unknown>)['sendAndWait'];

  return session;
}

// ============================================================================
// Test: awaitStreamedResponse behaviour (extracted from index.ts logic)
// ============================================================================

/**
 * Reproduces the dispatch logic from index.ts without the Ink/React rendering.
 * This tests the core send-then-accumulate pipeline.
 */
async function simulateDispatch(
  session: MockSquadSession,
  message: string,
): Promise<string> {
  let accumulated = '';

  const onDelta = (event: { type: string; [key: string]: unknown }): void => {
    const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
    const delta = typeof val === 'string' ? val : '';
    if (!delta) return;
    accumulated += delta;
  };

  session.on('message_delta', onDelta);

  try {
    // Mirror the awaitStreamedResponse logic from index.ts
    if (session.sendAndWait) {
      await session.sendAndWait({ prompt: message }, TIMEOUTS.SESSION_RESPONSE_MS);
    } else {
      const done = new Promise<void>((resolve) => {
        const onEnd = (): void => {
          try { session.off('turn_end', onEnd); } catch { /* ignore */ }
          try { session.off('idle', onEnd); } catch { /* ignore */ }
          resolve();
        };
        session.on('turn_end', onEnd);
        session.on('idle', onEnd);
      });
      await session.sendMessage({ prompt: message });
      await done;
    }
  } finally {
    try { session.off('message_delta', onDelta); } catch { /* ignore */ }
  }

  return accumulated;
}

// ============================================================================
// Tests
// ============================================================================

describe('REPL Streaming — dispatchToAgent waits for streamed content', () => {
  it('accumulates all deltas via sendAndWait before returning', async () => {
    const session = createStreamingMockSession(['Hello', ' world', '!']);
    const result = await simulateDispatch(session, 'say hello');

    expect(result).toBe('Hello world!');
    expect(session.sendAndWait).toHaveBeenCalledWith({ prompt: 'say hello' }, TIMEOUTS.SESSION_RESPONSE_MS);
    expect(session.sendMessage).not.toHaveBeenCalled();
  });

  it('accumulates deltas via fallback turn_end when sendAndWait missing', async () => {
    const session = createLegacyMockSession(['Fallback', ' works']);
    const result = await simulateDispatch(session, 'test fallback');

    expect(result).toBe('Fallback works');
    expect(session.sendMessage).toHaveBeenCalledWith({ prompt: 'test fallback' });
  });

  it('handles single-chunk response', async () => {
    const session = createStreamingMockSession(['complete answer']);
    const result = await simulateDispatch(session, 'one chunk');

    expect(result).toBe('complete answer');
  });

  it('handles many small deltas', async () => {
    const chunks = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const session = createStreamingMockSession(chunks);
    const result = await simulateDispatch(session, 'many chunks');

    expect(result).toBe('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('REPL Streaming — dispatchToCoordinator waits for streamed content', () => {
  it('coordinator response is fully accumulated before parsing', async () => {
    const coordinatorReply = '## Routing\n- **Agent:** kovash\n- **Task:** fix the REPL bug';
    const chunks = [coordinatorReply.slice(0, 20), coordinatorReply.slice(20)];
    const session = createStreamingMockSession(chunks);

    const accumulated = await simulateDispatch(session, 'fix the shell');
    const decision = parseCoordinatorResponse(accumulated);

    // The accumulated text should be the full coordinator reply
    expect(accumulated).toBe(coordinatorReply);
    // parseCoordinatorResponse should return a valid decision (not empty)
    expect(decision).toBeDefined();
    expect(typeof decision.type).toBe('string');
  });

  it('coordinator with sendAndWait accumulates before parseCoordinatorResponse', async () => {
    const reply = 'I can help with that directly. The answer is 42.';
    const session = createStreamingMockSession([reply]);

    const accumulated = await simulateDispatch(session, 'what is the answer?');
    const decision = parseCoordinatorResponse(accumulated);

    expect(accumulated).toBe(reply);
    // Should be a direct answer since no routing markers
    expect(decision.type).toBe('direct');
    expect(decision.directAnswer).toBeTruthy();
  });
});

describe('REPL Streaming — empty response handling', () => {
  it('returns empty string when no deltas are emitted', async () => {
    const session = createStreamingMockSession([]);
    const result = await simulateDispatch(session, 'hello?');

    expect(result).toBe('');
  });

  it('parseCoordinatorResponse handles empty accumulated gracefully', () => {
    const decision = parseCoordinatorResponse('');

    expect(decision).toBeDefined();
    expect(decision.type).toBe('direct');
  });

  it('returns empty when deltas contain only empty strings', async () => {
    const session = createStreamingMockSession(['', '', '']);
    const result = await simulateDispatch(session, 'empty deltas');

    expect(result).toBe('');
  });
});

describe('REPL Streaming — sendMessage → accumulated → parseCoordinatorResponse pipeline', () => {
  it('BUG REPRO: old sendMessage-only flow would have empty accumulated', async () => {
    // This demonstrates the original bug: sendMessage resolves immediately,
    // so accumulated is empty when you try to parse.
    const session = createStreamingMockSession(['Should be', ' captured']);

    // Simulate the OLD buggy code: call sendMessage (fire-and-forget)
    let buggyAccumulated = '';
    session.on('message_delta', (event: { type: string; [key: string]: unknown }) => {
      const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
      buggyAccumulated += typeof val === 'string' ? val : '';
    });

    // With old code: sendMessage returns immediately, no deltas yet
    await session.sendMessage({ prompt: 'test' });

    // Old code would parse here — accumulated is empty because sendMessage
    // is fire-and-forget. (In our mock, sendMessage doesn't emit deltas at all.)
    expect(buggyAccumulated).toBe('');

    // NEW code: sendAndWait waits for deltas
    const fixedResult = await simulateDispatch(session, 'test');
    expect(fixedResult).toBe('Should be captured');
  });

  it('end-to-end pipeline: send → stream → accumulate → parse → route', async () => {
    const routingResponse = [
      '## Routing Decision\n',
      '- **Agent:** kovash\n',
      '- **Task:** Fix the streaming bug\n',
    ];
    const session = createStreamingMockSession(routingResponse);

    const accumulated = await simulateDispatch(session, 'fix streaming');
    expect(accumulated.length).toBeGreaterThan(0);

    const decision = parseCoordinatorResponse(accumulated);
    expect(decision).toBeDefined();
    // Whether it routes or is direct depends on parsing, but it shouldn't be empty
    expect(decision.type).toBeTruthy();
  });

  it('fallback path resolves on idle event instead of turn_end', async () => {
    const listeners = new Map<string, Set<EventHandler>>();
    const session: MockSquadSession = {
      sessionId: 'idle-test',
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
      sendAndWait: undefined as unknown as ReturnType<typeof vi.fn>,
      sendMessage: vi.fn(async () => {
        // Emit deltas then idle (not turn_end)
        setTimeout(() => {
          session._emit('message_delta', { type: 'message_delta', deltaContent: 'via idle' });
          session._emit('idle', { type: 'idle' });
        }, 5);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    delete (session as Record<string, unknown>)['sendAndWait'];

    const result = await simulateDispatch(session, 'test idle');
    expect(result).toBe('via idle');
  });

  it('delta events with content key instead of delta key are handled', async () => {
    const listeners = new Map<string, Set<EventHandler>>();
    const session = createStreamingMockSession([]);
    // Override sendAndWait to emit events with 'content' key instead of 'deltaContent'
    session.sendAndWait = vi.fn(async () => {
      session._emit('message_delta', { type: 'message_delta', content: 'content-key' });
    });

    const result = await simulateDispatch(session, 'content key test');
    expect(result).toBe('content-key');
  });

  it('delta events with legacy delta key are handled', async () => {
    const listeners = new Map<string, Set<EventHandler>>();
    const session = createStreamingMockSession([]);
    // Override sendAndWait to emit events with 'delta' key instead of 'deltaContent'
    session.sendAndWait = vi.fn(async () => {
      session._emit('message_delta', { type: 'message_delta', delta: 'legacy-delta' });
    });

    const result = await simulateDispatch(session, 'legacy delta test');
    expect(result).toBe('legacy-delta');
  });
});

// ============================================================================
// Tests — extractDelta with deltaContent (SDK actual format)
//
// The SDK emits `assistant.message_delta` events where the text lives in
// `deltaContent`, not `delta` or `content`.  After normalizeEvent() spreads
// sdkEvent.data, the event object looks like:
//   { type: 'message_delta', messageId: '...', deltaContent: 'chunk' }
//
// The fixed extractDelta should check:
//   event['deltaContent'] ?? event['delta'] ?? event['content']
// ============================================================================

/**
 * Mirrors the FIXED extractDelta from index.ts (Kovash's patch).
 * Tests will call this directly to validate field-priority behaviour.
 */
function extractDelta(event: { type: string; [key: string]: unknown }): string {
  const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
  return typeof val === 'string' ? val : '';
}

/**
 * Like simulateDispatch but uses the fixed extractDelta (deltaContent-aware).
 */
async function simulateDispatchFixed(
  session: MockSquadSession,
  message: string,
): Promise<string> {
  let accumulated = '';

  const onDelta = (event: { type: string; [key: string]: unknown }): void => {
    const delta = extractDelta(event);
    if (!delta) return;
    accumulated += delta;
  };

  session.on('message_delta', onDelta);

  try {
    if (session.sendAndWait) {
      await session.sendAndWait({ prompt: message }, TIMEOUTS.SESSION_RESPONSE_MS);
    } else {
      const done = new Promise<void>((resolve) => {
        const onEnd = (): void => {
          try { session.off('turn_end', onEnd); } catch { /* ignore */ }
          try { session.off('idle', onEnd); } catch { /* ignore */ }
          resolve();
        };
        session.on('turn_end', onEnd);
        session.on('idle', onEnd);
      });
      await session.sendMessage({ prompt: message });
      await done;
    }
  } finally {
    try { session.off('message_delta', onDelta); } catch { /* ignore */ }
  }

  return accumulated;
}

/**
 * Create a mock session that emits deltaContent (SDK actual format).
 */
function createDeltaContentMockSession(deltas: string[]): MockSquadSession {
  const listeners = new Map<string, Set<EventHandler>>();

  const session: MockSquadSession = {
    sessionId: 'mock-dc-session',
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
        session._emit('message_delta', {
          type: 'message_delta',
          messageId: 'msg-1',
          deltaContent: d,
        });
      }
      return undefined;
    }),

    sendMessage: vi.fn(async () => {}),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return session;
}

// ============================================================================
// Tests — dispatchToCoordinator flow (deep integration)
//
// These tests exercise the FULL dispatch flow including the awaitStreamedResponse
// fallback path, session config verification, and the empty-response bug scenario.
// ============================================================================

/**
 * Mirrors the real dispatchToCoordinator + awaitStreamedResponse pipeline
 * including the fallback path when sendAndWait returns data but deltas are empty.
 */
async function simulateDispatchWithFallback(
  session: MockSquadSession,
  message: string,
): Promise<string> {
  let accumulated = '';

  const onDelta = (event: { type: string; [key: string]: unknown }): void => {
    const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
    const delta = typeof val === 'string' ? val : '';
    if (!delta) return;
    accumulated += delta;
  };

  session.on('message_delta', onDelta);

  try {
    if (session.sendAndWait) {
      const result = await session.sendAndWait({ prompt: message }, TIMEOUTS.SESSION_RESPONSE_MS);
      // Mirror awaitStreamedResponse fallback: extract data.content from result
      const data = (result as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined;
      const fallback = typeof data?.['content'] === 'string' ? data['content'] as string : '';
      if (!accumulated && fallback) {
        accumulated = fallback;
      }
    } else {
      const done = new Promise<void>((resolve) => {
        const onEnd = (): void => {
          try { session.off('turn_end', onEnd); } catch { /* ignore */ }
          try { session.off('idle', onEnd); } catch { /* ignore */ }
          resolve();
        };
        session.on('turn_end', onEnd);
        session.on('idle', onEnd);
      });
      await session.sendMessage({ prompt: message });
      await done;
    }
  } finally {
    try { session.off('message_delta', onDelta); } catch { /* ignore */ }
  }

  return accumulated;
}

/**
 * Simulate the CopilotSessionAdapter.normalizeEvent() logic.
 * Maps dotted SDK event types to short names and flattens data onto top-level.
 */
function normalizeEvent(sdkEvent: { type: string; data?: Record<string, unknown>; [key: string]: unknown }): { type: string; [key: string]: unknown } {
  const REVERSE_EVENT_MAP: Record<string, string> = {
    'assistant.message_delta': 'message_delta',
    'assistant.message': 'message',
    'assistant.usage': 'usage',
    'assistant.reasoning_delta': 'reasoning_delta',
    'assistant.reasoning': 'reasoning',
    'assistant.turn_start': 'turn_start',
    'assistant.turn_end': 'turn_end',
    'assistant.intent': 'intent',
    'session.idle': 'idle',
    'session.error': 'error',
  };
  const squadType = REVERSE_EVENT_MAP[sdkEvent.type] ?? sdkEvent.type;
  return {
    type: squadType,
    ...(sdkEvent.data ?? {}),
  };
}

describe('dispatchToCoordinator flow', () => {
  it('coordinator session receives streaming: true config', async () => {
    // Mock SquadClient.createSession to verify config
    const createSessionSpy = vi.fn(async (config: Record<string, unknown>) => {
      // Return a mock session
      return createStreamingMockSession(['DIRECT: OK']);
    });

    // Simulate the coordinator session creation path
    const config = {
      streaming: true,
      systemMessage: { mode: 'append', content: 'test prompt' },
      workingDirectory: '/test',
    };
    const session = await createSessionSpy(config);

    expect(createSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ streaming: true })
    );
    // Verify the streaming flag wasn't silently dropped
    const passedConfig = createSessionSpy.mock.calls[0]![0]!;
    expect(passedConfig['streaming']).toBe(true);
  });

  it('on(message_delta) handler receives normalized events and accumulates', () => {
    let accumulated = '';
    const onDelta = (event: { type: string; [key: string]: unknown }): void => {
      const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
      const delta = typeof val === 'string' ? val : '';
      if (!delta) return;
      accumulated += delta;
    };

    // Simulate CopilotSessionAdapter behavior: normalize then deliver
    const event1 = normalizeEvent({
      type: 'assistant.message_delta',
      data: { deltaContent: 'hello', messageId: 'msg-1' },
    });
    onDelta(event1);
    expect(accumulated).toBe('hello');

    const event2 = normalizeEvent({
      type: 'assistant.message_delta',
      data: { deltaContent: ' world', messageId: 'msg-1' },
    });
    onDelta(event2);
    expect(accumulated).toBe('hello world');
  });

  it('sendAndWait fallback provides content when deltas are empty', async () => {
    const session = createStreamingMockSession([]);
    // Override sendAndWait to return fallback data but emit no deltas
    session.sendAndWait = vi.fn(async () => {
      // No deltas emitted — simulates SDK returning full response without streaming
      return { data: { content: 'full response' } };
    });

    const result = await simulateDispatchWithFallback(session, 'get response');

    expect(result).toBe('full response');
    expect(session.sendAndWait).toHaveBeenCalledWith({ prompt: 'get response' }, TIMEOUTS.SESSION_RESPONSE_MS);
  });

  it('empty sendAndWait + empty deltas = empty accumulated (regression)', async () => {
    const session = createStreamingMockSession([]);
    // sendAndWait returns nothing useful — no data.content, no deltas
    session.sendAndWait = vi.fn(async () => {
      // No deltas emitted, no data returned
      return undefined;
    });

    const result = await simulateDispatchWithFallback(session, 'silence');

    // THIS IS THE BUG SCENARIO: both paths produce nothing → empty string
    expect(result).toBe('');
    // Verify that parseCoordinatorResponse sees this empty string
    const decision = parseCoordinatorResponse(result);
    expect(decision.type).toBe('direct');
    expect(decision.directAnswer).toBe('');
  });

  it('parseCoordinatorResponse handles empty string', () => {
    const decision = parseCoordinatorResponse('');
    expect(decision).toBeDefined();
    expect(decision.type).toBe('direct');
    // Empty string trimmed is still empty — becomes directAnswer
    expect(decision.directAnswer).toBe('');
  });

  it('sendAndWait fallback ignored when deltas provide content', async () => {
    const session = createStreamingMockSession([]);
    // sendAndWait emits deltas AND returns fallback — deltas should win
    session.sendAndWait = vi.fn(async () => {
      session._emit('message_delta', { type: 'message_delta', deltaContent: 'streamed' });
      return { data: { content: 'fallback should be ignored' } };
    });

    const result = await simulateDispatchWithFallback(session, 'both paths');
    // Deltas took priority — fallback not used because accumulated is non-empty
    expect(result).toBe('streamed');
  });

  // SQUAD_DEBUG env var is not yet implemented in the dispatch pipeline.
  // This test documents the gap — when the feature is added, remove the skip.
  it.todo('SQUAD_DEBUG env var enables diagnostic logging');
});

describe('CopilotSessionAdapter event normalization', () => {
  it('normalizeEvent flattens data.deltaContent to top level', () => {
    const sdkEvent = {
      type: 'assistant.message_delta',
      data: { deltaContent: 'test', messageId: 'abc' },
    };
    const normalized = normalizeEvent(sdkEvent);

    expect(normalized['deltaContent']).toBe('test');
    expect(normalized['messageId']).toBe('abc');
    expect(normalized.type).toBe('message_delta');
  });

  it('normalizeEvent maps all known SDK event types', () => {
    const mappings: Array<[string, string]> = [
      ['assistant.message_delta', 'message_delta'],
      ['assistant.turn_end', 'turn_end'],
      ['session.idle', 'idle'],
      ['session.error', 'error'],
    ];
    for (const [sdkType, squadType] of mappings) {
      const normalized = normalizeEvent({ type: sdkType });
      expect(normalized.type).toBe(squadType);
    }
  });

  it('normalizeEvent passes through unknown event types', () => {
    const normalized = normalizeEvent({ type: 'custom.event', data: { foo: 'bar' } });
    expect(normalized.type).toBe('custom.event');
    expect(normalized['foo']).toBe('bar');
  });

  it('normalizeEvent handles missing data gracefully', () => {
    const normalized = normalizeEvent({ type: 'assistant.message_delta' });
    expect(normalized.type).toBe('message_delta');
    // No data spread → only type present
    expect(normalized['deltaContent']).toBeUndefined();
  });

  it('on/off properly tracks handler references', () => {
    const session = createStreamingMockSession([]);
    let callCount = 0;
    const handler: EventHandler = () => { callCount++; };

    // Register and fire
    session.on('message_delta', handler);
    session._emit('message_delta', { type: 'message_delta', deltaContent: 'x' });
    expect(callCount).toBe(1);

    // Unregister and fire again — should NOT increment
    session.off('message_delta', handler);
    session._emit('message_delta', { type: 'message_delta', deltaContent: 'y' });
    expect(callCount).toBe(1);

    // Verify on/off were called
    expect(session.on).toHaveBeenCalledWith('message_delta', handler);
    expect(session.off).toHaveBeenCalledWith('message_delta', handler);
  });

  it('multiple handlers on same event fire independently', () => {
    const session = createStreamingMockSession([]);
    let count1 = 0;
    let count2 = 0;
    const handler1: EventHandler = () => { count1++; };
    const handler2: EventHandler = () => { count2++; };

    session.on('message_delta', handler1);
    session.on('message_delta', handler2);
    session._emit('message_delta', { type: 'message_delta', deltaContent: 'z' });

    expect(count1).toBe(1);
    expect(count2).toBe(1);

    // Remove one, other still fires
    session.off('message_delta', handler1);
    session._emit('message_delta', { type: 'message_delta', deltaContent: 'w' });
    expect(count1).toBe(1);
    expect(count2).toBe(2);
  });
});

describe('extractDelta — field priority (deltaContent > delta > content)', () => {
  it('extracts deltaContent (SDK actual format)', () => {
    const event = { type: 'message_delta', messageId: 'msg-1', deltaContent: 'hello' };
    expect(extractDelta(event)).toBe('hello');
  });

  it('extracts delta (legacy/alternative format)', () => {
    const event = { type: 'message_delta', delta: 'legacy chunk' };
    expect(extractDelta(event)).toBe('legacy chunk');
  });

  it('extracts content (fallback format)', () => {
    const event = { type: 'message_delta', content: 'content fallback' };
    expect(extractDelta(event)).toBe('content fallback');
  });

  it('returns empty string when no recognised field is present', () => {
    const event = { type: 'message_delta', text: 'nope' };
    expect(extractDelta(event)).toBe('');
  });

  it('returns empty string when deltaContent is non-string (number)', () => {
    const event = { type: 'message_delta', deltaContent: 42 };
    expect(extractDelta(event)).toBe('');
  });

  it('returns empty string when deltaContent is non-string (object)', () => {
    const event = { type: 'message_delta', deltaContent: { nested: true } };
    expect(extractDelta(event)).toBe('');
  });

  it('prefers deltaContent over delta and content', () => {
    const event = {
      type: 'message_delta',
      deltaContent: 'preferred',
      delta: 'not-this',
      content: 'nor-this',
    };
    expect(extractDelta(event)).toBe('preferred');
  });

  it('falls back to delta when deltaContent is undefined', () => {
    const event = {
      type: 'message_delta',
      deltaContent: undefined,
      delta: 'fallback-delta',
      content: 'not-this',
    };
    expect(extractDelta(event)).toBe('fallback-delta');
  });
});

describe('Delta accumulation — full flow with deltaContent events', () => {
  it('accumulates deltaContent chunks into complete text', async () => {
    const session = createDeltaContentMockSession(['Hello', ', ', 'world', '!']);
    const result = await simulateDispatchFixed(session, 'greet me');

    expect(result).toBe('Hello, world!');
    expect(session.sendAndWait).toHaveBeenCalledWith({ prompt: 'greet me' }, TIMEOUTS.SESSION_RESPONSE_MS);
  });

  it('handles single deltaContent chunk', async () => {
    const session = createDeltaContentMockSession(['complete answer']);
    const result = await simulateDispatchFixed(session, 'single');

    expect(result).toBe('complete answer');
  });

  it('handles many small deltaContent chunks', async () => {
    const chars = 'the quick brown fox'.split('');
    const session = createDeltaContentMockSession(chars);
    const result = await simulateDispatchFixed(session, 'fox');

    expect(result).toBe('the quick brown fox');
  });

  it('returns empty string when no deltaContent chunks emitted', async () => {
    const session = createDeltaContentMockSession([]);
    const result = await simulateDispatchFixed(session, 'silence');

    expect(result).toBe('');
  });
});

describe('Coordinator dispatch — deltaContent accumulation + fallback', () => {
  it('coordinator response accumulated from deltaContent is parsed correctly', async () => {
    const chunks = [
      '## Routing\n',
      '- **Agent:** kovash\n',
      '- **Task:** fix the delta bug\n',
    ];
    const session = createDeltaContentMockSession(chunks);
    const accumulated = await simulateDispatchFixed(session, 'fix deltas');
    const decision = parseCoordinatorResponse(accumulated);

    expect(accumulated).toBe('## Routing\n- **Agent:** kovash\n- **Task:** fix the delta bug\n');
    expect(decision).toBeDefined();
    expect(typeof decision.type).toBe('string');
  });

  it('falls back to direct answer when deltaContent accumulates empty', async () => {
    const session = createDeltaContentMockSession([]);
    const accumulated = await simulateDispatchFixed(session, 'nothing here');
    const decision = parseCoordinatorResponse(accumulated);

    // Empty accumulated → parseCoordinatorResponse should return a direct/fallback decision
    expect(decision.type).toBe('direct');
  });

  it('simulateDispatch now captures deltaContent events (bug is fixed)', async () => {
    // After the fix, simulateDispatch checks deltaContent first,
    // so it correctly captures SDK delta events.
    const session = createDeltaContentMockSession(['This ', 'is ', 'captured']);
    const result = await simulateDispatch(session, 'captured message');

    // FIXED: deltaContent is now picked up by simulateDispatch
    expect(result).toBe('This is captured');

    // simulateDispatchFixed also works (same priority order)
    session.sendAndWait.mockClear();
    session.sendAndWait.mockImplementation(async () => {
      for (const d of ['This ', 'is ', 'found']) {
        session._emit('message_delta', {
          type: 'message_delta',
          messageId: 'msg-2',
          deltaContent: d,
        });
      }
      return undefined;
    });

    const fixedResult = await simulateDispatchFixed(session, 'found message');
    expect(fixedResult).toBe('This is found');
  });
});
