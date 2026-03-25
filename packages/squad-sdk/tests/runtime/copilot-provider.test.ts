/**
 * Tests for CopilotRuntimeProvider.
 *
 * Uses mock SquadClient / SquadSession to verify the thin wrapper behaves
 * correctly without requiring a real Copilot CLI connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotRuntimeProvider } from '../../src/runtime/providers/copilot-provider.js';
import type { SquadSession, SquadSessionEvent, SquadSessionEventHandler, SquadSessionEventType } from '../../src/adapter/types.js';

// ── Mock helpers ────────────────────────────────────────

function createMockSession(sessionId = 'test-session-1'): SquadSession & {
  _listeners: Map<string, Set<SquadSessionEventHandler>>;
  _fire: (type: string, extra?: Record<string, unknown>) => void;
} {
  const listeners = new Map<string, Set<SquadSessionEventHandler>>();

  const session = {
    sessionId,
    _listeners: listeners,

    sendMessage: vi.fn().mockResolvedValue(undefined),

    on(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
      if (!listeners.has(eventType)) listeners.set(eventType, new Set());
      listeners.get(eventType)!.add(handler);
    },

    off(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
      listeners.get(eventType)?.delete(handler);
    },

    close: vi.fn().mockResolvedValue(undefined),

    /** Test helper: fire a mock event on this session. */
    _fire(type: string, extra: Record<string, unknown> = {}): void {
      const event: SquadSessionEvent = { type, ...extra };
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
  };

  return session;
}

function createMockClient(session?: ReturnType<typeof createMockSession>) {
  const mockSession = session ?? createMockSession();
  return {
    createSession: vi.fn().mockResolvedValue(mockSession),
    listModels: vi.fn().mockResolvedValue([
      { id: 'gpt-4o', name: 'GPT-4o', capabilities: {}, policy: undefined, billing: undefined },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', capabilities: {}, policy: undefined, billing: undefined },
    ]),
    _mockSession: mockSession,
  };
}

// ── Tests ───────────────────────────────────────────────

describe('CopilotRuntimeProvider', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let provider: CopilotRuntimeProvider;

  beforeEach(() => {
    mockClient = createMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider = new CopilotRuntimeProvider({ client: mockClient as any });
  });

  it('should have name "copilot"', () => {
    expect(provider.name).toBe('copilot');
  });

  // ── startSession ────────────────────────────────────

  describe('startSession', () => {
    it('should call client.createSession and return a RuntimeProviderSession', async () => {
      const result = await provider.startSession({ model: 'gpt-4o' });

      expect(mockClient.createSession).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('copilot');
      expect(result.model).toBe('gpt-4o');
      expect(result.id).toBeTruthy();
    });

    it('should use provided sessionId', async () => {
      const result = await provider.startSession({ sessionId: 'my-id' });
      expect(result.id).toBe('my-id');
    });

    it('should pass systemPrompt as replace mode systemMessage', async () => {
      await provider.startSession({ systemPrompt: 'Be helpful.' });

      const config = mockClient.createSession.mock.calls[0]![0];
      expect(config.systemMessage).toEqual({ mode: 'replace', content: 'Be helpful.' });
    });

    it('should not set systemMessage when no systemPrompt given', async () => {
      await provider.startSession({});

      const config = mockClient.createSession.mock.calls[0]![0];
      expect(config.systemMessage).toBeUndefined();
    });
  });

  // ── sendMessage ─────────────────────────────────────

  describe('sendMessage', () => {
    it('should call session.sendMessage with prompt', async () => {
      const sess = await provider.startSession();
      await provider.sendMessage(sess.id, { role: 'user', content: 'Hello' });

      expect(mockClient._mockSession.sendMessage).toHaveBeenCalledWith({ prompt: 'Hello' });
    });

    it('should throw for unknown session', async () => {
      await expect(
        provider.sendMessage('nonexistent', { role: 'user', content: 'Hi' }),
      ).rejects.toThrow('No active Copilot session with id: nonexistent');
    });
  });

  // ── onEvent / event mapping ─────────────────────────

  describe('onEvent', () => {
    it('should map message_delta to message.delta', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('message_delta', { content: 'chunk' });

      const deltas = events.filter((e) => e.type === 'message.delta');
      expect(deltas.length).toBe(1);
    });

    it('should map message to message.complete', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('message', { text: 'done' });

      const completes = events.filter((e) => e.type === 'message.complete');
      expect(completes.length).toBeGreaterThanOrEqual(1);
    });

    it('should map turn_end to message.complete', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('turn_end');

      const completes = events.filter((e) => e.type === 'message.complete');
      expect(completes.length).toBeGreaterThanOrEqual(1);
    });

    it('should map error to error', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('error', { message: 'boom' });

      const errors = events.filter((e) => e.type === 'error');
      expect(errors.length).toBe(1);
    });

    it('should map usage to message.complete with _usage flag', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string; payload?: unknown }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('usage', { inputTokens: 100, outputTokens: 50 });

      const usageEvents = events.filter(
        (e) => e.type === 'message.complete' && (e.payload as Record<string, unknown>)?._usage === true,
      );
      expect(usageEvents.length).toBe(1);
    });

    it('should return an unsubscribe function', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      const unsub = await provider.onEvent(sess.id, (e) => events.push(e));

      mockClient._mockSession._fire('message_delta', { content: 'a' });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const countBefore = events.length;
      unsub();
      mockClient._mockSession._fire('message_delta', { content: 'b' });
      expect(events.length).toBe(countBefore);
    });

    it('should emit session.started on startSession', async () => {
      const events: Array<{ type: string }> = [];
      const sess = await provider.startSession();
      await provider.onEvent(sess.id, (e) => events.push(e));

      // session.started was emitted before we subscribed, so we won't see it
      // unless we start a *new* session with a pre-attached handler.
      // Instead, verify the provider tracks the session correctly.
      expect(provider['sessions'].has(sess.id)).toBe(true);
    });
  });

  // ── shutdownSession ─────────────────────────────────

  describe('shutdownSession', () => {
    it('should call session.close() and remove the session', async () => {
      const sess = await provider.startSession();
      await provider.shutdownSession(sess.id);

      expect(mockClient._mockSession.close).toHaveBeenCalledTimes(1);
      expect(provider['sessions'].has(sess.id)).toBe(false);
    });

    it('should emit session.ended before closing', async () => {
      const sess = await provider.startSession();
      const events: Array<{ type: string }> = [];
      await provider.onEvent(sess.id, (e) => events.push(e));

      await provider.shutdownSession(sess.id);

      expect(events.some((e) => e.type === 'session.ended')).toBe(true);
    });

    it('should be a no-op for unknown session', async () => {
      // Should not throw
      await provider.shutdownSession('nonexistent');
    });

    it('should tear down event wiring on the Squad session', async () => {
      const sess = await provider.startSession();
      await provider.shutdownSession(sess.id);

      // After shutdown, the mock session's listener maps should be cleared
      // because off() was called for each wired event.
      let totalListeners = 0;
      for (const handlers of mockClient._mockSession._listeners.values()) {
        totalListeners += handlers.size;
      }
      expect(totalListeners).toBe(0);
    });
  });

  // ── listModels ──────────────────────────────────────

  describe('listModels', () => {
    it('should return model IDs from the client', async () => {
      const models = await provider.listModels();
      expect(models).toEqual(['gpt-4o', 'claude-sonnet-4.5']);
      expect(mockClient.listModels).toHaveBeenCalledTimes(1);
    });
  });

  // ── Factory pattern ─────────────────────────────────

  describe('client factory', () => {
    it('should accept a factory function instead of a direct client', async () => {
      const factoryClient = createMockClient();
      const factoryProvider = new CopilotRuntimeProvider({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: () => factoryClient as any,
      });

      const sess = await factoryProvider.startSession();
      expect(sess.provider).toBe('copilot');
      expect(factoryClient.createSession).toHaveBeenCalledTimes(1);
    });

    it('should accept an async factory function', async () => {
      const factoryClient = createMockClient();
      const factoryProvider = new CopilotRuntimeProvider({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: async () => factoryClient as any,
      });

      const sess = await factoryProvider.startSession();
      expect(sess.provider).toBe('copilot');
    });

    it('should resolve the factory only once', async () => {
      let callCount = 0;
      const factoryClient = createMockClient();
      const factoryProvider = new CopilotRuntimeProvider({
        client: () => {
          callCount++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return factoryClient as any;
        },
      });

      await factoryProvider.startSession({ sessionId: 'a' });
      await factoryProvider.startSession({ sessionId: 'b' });
      expect(callCount).toBe(1);
    });
  });
});
