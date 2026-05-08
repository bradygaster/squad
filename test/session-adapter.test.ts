import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for CopilotSessionAdapter — the runtime bridge between
 * CopilotSession (send/on/destroy) and SquadSession (sendMessage/on/off/close).
 *
 * We can't import the adapter class directly (it's file-scoped in client.ts),
 * so we test it via SquadClient.createSession() with a mocked CopilotClient.
 */

// Build a minimal mock CopilotSession matching the real @github/copilot-sdk shape
function createMockCopilotSession(sessionId = 'test-session-42') {
  const typedHandlers = new Map<string, Set<(event: any) => void>>();

  return {
    sessionId,
    send: vi.fn().mockResolvedValue('msg-1'),
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
    on: vi.fn((eventType: string, handler: (event: any) => void) => {
      if (!typedHandlers.has(eventType)) {
        typedHandlers.set(eventType, new Set());
      }
      typedHandlers.get(eventType)!.add(handler);
      return () => {
        typedHandlers.get(eventType)?.delete(handler);
      };
    }),
    _dispatchEvent: vi.fn(),
    registerTools: vi.fn(),
    getToolHandler: vi.fn(),
    registerPermissionHandler: vi.fn(),
    registerUserInputHandler: vi.fn(),
    registerHooks: vi.fn(),
    // expose for test assertions
    _typedHandlers: typedHandlers,
    /** Simulate the SDK dispatching an event to typed handlers */
    _emit(eventType: string, event: any) {
      typedHandlers.get(eventType)?.forEach((h) => h(event));
    },
  };
}

// We test the adapter indirectly by importing SquadClient and stubbing internals.
// The adapter is constructed inside createSession(), so we mock the CopilotClient.
import { SquadClient } from '@bradygaster/squad-sdk/client';

describe('CopilotSessionAdapter (via SquadClient)', () => {
  /** Helper: create a SquadClient wired to our mock */
  async function createAdaptedSession() {
    const client = new SquadClient({ autoStart: false });

    // Force connected state
    (client as any).state = 'connected';

    // Inject mock CopilotSession via the CopilotProvider's inner CopilotClient
    const mockSession = createMockCopilotSession();
    (client as any).provider.client.createSession = vi.fn().mockResolvedValue(mockSession);

    const session = await client.createSession();
    return { session, mockSession };
  }

  it('sessionId is accessible', async () => {
    const { session } = await createAdaptedSession();
    expect(session.sessionId).toBe('test-session-42');
  });

  it('sendMessage() delegates to CopilotSession.send()', async () => {
    const { session, mockSession } = await createAdaptedSession();

    await session.sendMessage({ prompt: 'Hello from adapter' });

    expect(mockSession.send).toHaveBeenCalledOnce();
    expect(mockSession.send).toHaveBeenCalledWith({ prompt: 'Hello from adapter' });
  });

  it('sendMessage() passes attachments and mode through', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const opts = {
      prompt: 'Check this file',
      attachments: [{ type: 'file' as const, path: './src/index.ts' }],
      mode: 'immediate' as const,
    };
    await session.sendMessage(opts);

    expect(mockSession.send).toHaveBeenCalledWith(opts);
  });

  // --- Event name mapping ---

  it('on() maps Squad short names to SDK dotted names', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('message_delta', handler);

    // The mock should receive the SDK dotted name, not the short name
    expect(mockSession.on).toHaveBeenCalledWith('assistant.message_delta', expect.any(Function));
  });

  it('on() passes through already-dotted SDK event names', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('assistant.message', handler);

    expect(mockSession.on).toHaveBeenCalledWith('assistant.message', expect.any(Function));
  });

  it('on() maps usage → assistant.usage', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('usage', handler);

    expect(mockSession.on).toHaveBeenCalledWith('assistant.usage', expect.any(Function));
  });

  // --- Event data normalization ---

  it('normalizes SDK event data: flattens event.data and maps type back', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('message_delta', handler);

    // Simulate the SDK dispatching an assistant.message_delta event
    const sdkEvent = {
      id: 'evt-1',
      timestamp: '2026-02-22T10:00:00Z',
      parentId: null,
      ephemeral: true,
      type: 'assistant.message_delta',
      data: { messageId: 'msg-1', deltaContent: 'Hello' },
    };
    mockSession._emit('assistant.message_delta', sdkEvent);

    expect(handler).toHaveBeenCalledOnce();
    const received = handler.mock.calls[0][0];
    // Type should be normalized back to Squad short name
    expect(received.type).toBe('message_delta');
    // Data fields should be flattened onto the event
    expect(received.messageId).toBe('msg-1');
    expect(received.deltaContent).toBe('Hello');
  });

  it('normalizes assistant.usage events with token counts', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('usage', handler);

    const sdkEvent = {
      id: 'evt-2',
      timestamp: '2026-02-22T10:00:01Z',
      parentId: null,
      ephemeral: true,
      type: 'assistant.usage',
      data: { model: 'gpt-4', inputTokens: 100, outputTokens: 50 },
    };
    mockSession._emit('assistant.usage', sdkEvent);

    expect(handler).toHaveBeenCalledOnce();
    const received = handler.mock.calls[0][0];
    expect(received.type).toBe('usage');
    expect(received.inputTokens).toBe(100);
    expect(received.outputTokens).toBe(50);
  });

  // --- off() / unsubscribe ---

  it('off() calls the unsubscribe function for the correct event type', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('message_delta', handler);

    // Wrapped handler should be registered under SDK dotted name
    expect(mockSession._typedHandlers.get('assistant.message_delta')?.size).toBe(1);

    session.off('message_delta', handler);

    // Unsubscribe should have removed it
    expect(mockSession._typedHandlers.get('assistant.message_delta')?.size).toBe(0);
  });

  it('off() is a no-op for unregistered handlers', async () => {
    const { session } = await createAdaptedSession();

    // Should not throw
    const unknownHandler = vi.fn();
    session.off('message_delta', unknownHandler);
  });

  it('same handler on two event types: off() removes only the specified one', async () => {
    const { session, mockSession } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('message_delta', handler);
    session.on('usage', handler);

    expect(mockSession._typedHandlers.get('assistant.message_delta')?.size).toBe(1);
    expect(mockSession._typedHandlers.get('assistant.usage')?.size).toBe(1);

    session.off('message_delta', handler);

    // message_delta unsubscribed, usage still active
    expect(mockSession._typedHandlers.get('assistant.message_delta')?.size).toBe(0);
    expect(mockSession._typedHandlers.get('assistant.usage')?.size).toBe(1);
  });

  // --- close() ---

  it('close() delegates to CopilotSession.destroy()', async () => {
    const { session, mockSession } = await createAdaptedSession();

    await session.close();

    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });

  it('close() clears tracked unsubscribers', async () => {
    const { session } = await createAdaptedSession();

    const handler = vi.fn();
    session.on('message_delta', handler);

    await session.close();

    // After close, off() should be a no-op (no throw)
    session.off('message_delta', handler);
  });

  // --- OTel-relevant: message_delta and usage handlers fire with correct data ---

  it('message_delta handler fires with normalized data (OTel first_token)', async () => {
    const { session, mockSession } = await createAdaptedSession();

    let firstTokenSeen = false;
    const handler = (event: any) => {
      if (event.type === 'message_delta') {
        firstTokenSeen = true;
      }
    };
    session.on('message_delta', handler);

    mockSession._emit('assistant.message_delta', {
      id: 'e1', timestamp: 'ts', parentId: null, ephemeral: true,
      type: 'assistant.message_delta',
      data: { messageId: 'm1', deltaContent: 'Hi' },
    });

    expect(firstTokenSeen).toBe(true);
  });

  it('usage handler populates inputTokens and outputTokens (OTel token tracking)', async () => {
    const { session, mockSession } = await createAdaptedSession();

    let captured: any = null;
    const handler = (event: any) => {
      if (event.type === 'usage') {
        captured = event;
      }
    };
    session.on('usage', handler);

    mockSession._emit('assistant.usage', {
      id: 'e2', timestamp: 'ts', parentId: null, ephemeral: true,
      type: 'assistant.usage',
      data: { model: 'gpt-4', inputTokens: 200, outputTokens: 80 },
    });

    expect(captured).not.toBeNull();
    expect(captured.inputTokens).toBe(200);
    expect(captured.outputTokens).toBe(80);
  });
});

describe('CopilotSessionAdapter via resumeSession', () => {
  it('resumeSession also wraps in adapter', async () => {
    const client = new SquadClient({ autoStart: false });
    (client as any).state = 'connected';

    const mockSession = createMockCopilotSession('resumed-session-99');
    (client as any).provider.client.resumeSession = vi.fn().mockResolvedValue(mockSession);

    const session = await client.resumeSession('resumed-session-99');

    expect(session.sessionId).toBe('resumed-session-99');
    await session.sendMessage({ prompt: 'resumed' });
    expect(mockSession.send).toHaveBeenCalledWith({ prompt: 'resumed' });
  });
});

describe('CopilotSessionAdapter optional methods', () => {
  async function createAdaptedSession() {
    const client = new SquadClient({ autoStart: false });
    (client as any).state = 'connected';
    const mockSession = createMockCopilotSession();
    (client as any).provider.client.createSession = vi.fn().mockResolvedValue(mockSession);
    const session = await client.createSession();
    return { session, mockSession };
  }

  it('sendAndWait() delegates to CopilotSession.sendAndWait()', async () => {
    const { session, mockSession } = await createAdaptedSession();
    mockSession.sendAndWait.mockResolvedValue({ type: 'assistant.message', data: { content: 'hello' } });

    const result = await session.sendAndWait!({ prompt: 'test' }, 5000);

    expect(mockSession.sendAndWait).toHaveBeenCalledWith({ prompt: 'test' }, 5000);
    expect(result).toEqual({ type: 'assistant.message', data: { content: 'hello' } });
  });

  it('abort() delegates to CopilotSession.abort()', async () => {
    const { session, mockSession } = await createAdaptedSession();

    await session.abort!();

    expect(mockSession.abort).toHaveBeenCalledOnce();
  });

  it('getMessages() delegates to CopilotSession.getMessages()', async () => {
    const { session, mockSession } = await createAdaptedSession();
    mockSession.getMessages.mockResolvedValue([{ type: 'assistant.message' }]);

    const messages = await session.getMessages!();

    expect(mockSession.getMessages).toHaveBeenCalledOnce();
    expect(messages).toHaveLength(1);
  });
});
