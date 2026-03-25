/**
 * Copilot Runtime Provider
 *
 * Thin wrapper that adapts the existing SquadClient / CopilotSessionAdapter
 * to the RuntimeProvider interface.  Maps Squad event names to
 * RuntimeProviderEvent types.  No behaviour change to the existing Copilot
 * integration path.
 *
 * @module runtime/providers/copilot-provider
 */

import { randomUUID } from 'node:crypto';
import type {
  RuntimeProvider,
  RuntimeProviderEvent,
  RuntimeProviderName,
  RuntimeProviderSession,
  RuntimeMessage,
  RuntimeStartOptions,
} from '../provider.js';
import type { SquadClient } from '../../adapter/client.js';
import type { SquadSession, SquadSessionEvent } from '../../adapter/types.js';

/**
 * Internal bookkeeping for an active Copilot session.
 */
interface CopilotSessionEntry {
  id: string;
  session: SquadSession;
  model?: string;
  handlers: Set<(event: RuntimeProviderEvent) => void>;
  /** Unsubscribe functions returned by session.on() wiring. */
  teardowns: Array<() => void>;
}

/**
 * Factory function that returns (or lazily creates) a SquadClient.
 * This lets callers defer construction until the first session is requested.
 */
export type SquadClientFactory = SquadClient | (() => SquadClient | Promise<SquadClient>);

export interface CopilotRuntimeProviderOptions {
  /**
   * A SquadClient instance or a factory that produces one.
   */
  client: SquadClientFactory;
}

export class CopilotRuntimeProvider implements RuntimeProvider {
  readonly name: RuntimeProviderName = 'copilot';
  private sessions = new Map<string, CopilotSessionEntry>();
  private clientFactory: SquadClientFactory;
  private resolvedClient: SquadClient | null = null;

  constructor(options: CopilotRuntimeProviderOptions) {
    this.clientFactory = options.client;
  }

  // ── RuntimeProvider implementation ────────────────────

  async startSession(options?: RuntimeStartOptions): Promise<RuntimeProviderSession> {
    const client = await this.getClient();
    const sessionId = options?.sessionId ?? randomUUID();

    const session = await client.createSession({
      sessionId,
      model: options?.model,
      workingDirectory: options?.workingDirectory,
      systemMessage: options?.systemPrompt
        ? { mode: 'replace', content: options.systemPrompt }
        : undefined,
    });

    const entry: CopilotSessionEntry = {
      id: sessionId,
      session,
      model: options?.model,
      handlers: new Set(),
      teardowns: [],
    };

    this.sessions.set(sessionId, entry);

    // Wire Squad events → RuntimeProviderEvent for any handlers attached later.
    this.wireEvents(entry);

    // Emit a synthetic session.started event so consumers see a consistent lifecycle.
    this.emit(entry, {
      type: 'session.started',
      sessionId,
      timestamp: Date.now(),
      payload: { model: options?.model },
    });

    return {
      id: sessionId,
      provider: 'copilot',
      model: options?.model,
    };
  }

  async sendMessage(sessionId: string, message: RuntimeMessage): Promise<void> {
    const entry = this.getEntry(sessionId);
    await entry.session.sendMessage({ prompt: message.content });
  }

  async onEvent(
    sessionId: string,
    handler: (event: RuntimeProviderEvent) => void,
  ): Promise<() => void> {
    const entry = this.getEntry(sessionId);
    entry.handlers.add(handler);

    return () => {
      entry.handlers.delete(handler);
    };
  }

  async shutdownSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    // Tear down event wiring
    for (const fn of entry.teardowns) {
      try { fn(); } catch { /* best-effort */ }
    }
    entry.teardowns.length = 0;

    // Emit session.ended before closing
    this.emit(entry, {
      type: 'session.ended',
      sessionId,
      timestamp: Date.now(),
    });

    await entry.session.close();
    entry.handlers.clear();
    this.sessions.delete(sessionId);
  }

  async listModels(): Promise<string[]> {
    const client = await this.getClient();
    const models = await client.listModels();
    return models.map((m) => m.id);
  }

  // ── Internal helpers ──────────────────────────────────

  private async getClient(): Promise<SquadClient> {
    if (this.resolvedClient) return this.resolvedClient;

    if (typeof this.clientFactory === 'function') {
      this.resolvedClient = await this.clientFactory();
    } else {
      this.resolvedClient = this.clientFactory;
    }

    return this.resolvedClient;
  }

  private getEntry(sessionId: string): CopilotSessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`No active Copilot session with id: ${sessionId}`);
    }
    return entry;
  }

  /**
   * Subscribes to Squad session events and maps them to
   * RuntimeProviderEvent types.
   *
   * Mapping:
   *   message_delta  → message.delta
   *   message        → message.complete
   *   turn_end       → message.complete
   *   error          → error
   *   usage          → (pass-through as payload on message.complete)
   */
  private wireEvents(entry: CopilotSessionEntry): void {
    const { session, id: sessionId } = entry;

    const wire = (squadEvent: string, runtimeType: RuntimeProviderEvent['type']) => {
      const handler = (evt: SquadSessionEvent) => {
        this.emit(entry, {
          type: runtimeType,
          sessionId,
          timestamp: Date.now(),
          payload: evt,
        });
      };
      session.on(squadEvent, handler);
      // Build a teardown that removes the handler
      entry.teardowns.push(() => {
        try { session.off(squadEvent, handler); } catch { /* ignore */ }
      });
    };

    wire('message_delta', 'message.delta');
    wire('message', 'message.complete');
    wire('turn_end', 'message.complete');
    wire('error', 'error');

    // Usage events: pass through with the original payload so upstream
    // consumers can inspect token counts.  We surface them as
    // message.complete with a distinguishing payload.
    const usageHandler = (evt: SquadSessionEvent) => {
      this.emit(entry, {
        type: 'message.complete',
        sessionId,
        timestamp: Date.now(),
        payload: { ...evt, _usage: true },
      });
    };
    session.on('usage', usageHandler);
    entry.teardowns.push(() => {
      try { session.off('usage', usageHandler); } catch { /* ignore */ }
    });
  }

  private emit(entry: CopilotSessionEntry, event: RuntimeProviderEvent): void {
    for (const handler of entry.handlers) {
      try {
        handler(event);
      } catch {
        // Don't let a bad handler crash the provider
      }
    }
  }
}
