/**
 * Copilot Provider
 *
 * Wraps @github/copilot-sdk CopilotClient as a SquadProvider implementation.
 * This is the sole file in the codebase that imports from the Copilot SDK.
 *
 * @module adapter/providers/copilot-provider
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { SquadProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadSessionEvent,
  SquadSessionEventHandler,
  SquadSessionEventType,
  SquadSessionMetadata,
  SquadGetAuthStatusResponse,
  SquadGetStatusResponse,
  SquadModelInfo,
  SquadMessageOptions,
  SquadClientEventType,
  SquadClientEvent,
  SquadClientEventHandler,
} from '../types.js';

// ---------------------------------------------------------------------------
// CopilotSessionAdapter
// ---------------------------------------------------------------------------

/**
 * Adapts @github/copilot-sdk CopilotSession to the SquadSession interface.
 * Maps sendMessage() → send(), off() via unsubscribe tracking, close() → destroy().
 */
class CopilotSessionAdapter implements SquadSession {
  private static readonly EVENT_MAP: Record<string, string> = {
    'message_delta': 'assistant.message_delta',
    'message': 'assistant.message',
    'usage': 'assistant.usage',
    'reasoning_delta': 'assistant.reasoning_delta',
    'reasoning': 'assistant.reasoning',
    'turn_start': 'assistant.turn_start',
    'turn_end': 'assistant.turn_end',
    'intent': 'assistant.intent',
    'idle': 'session.idle',
    'error': 'session.error',
  };

  private static readonly REVERSE_EVENT_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(CopilotSessionAdapter.EVENT_MAP).map(([k, v]) => [v, k]),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly inner: any;
  private readonly unsubscribers = new Map<SquadSessionEventHandler, Map<string, () => void>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(copilotSession: any) {
    this.inner = copilotSession;
  }

  get sessionId(): string {
    return this.inner.sessionId ?? 'unknown';
  }

  async sendMessage(options: SquadMessageOptions): Promise<void> {
    await this.inner.send(options);
  }

  async sendAndWait(options: SquadMessageOptions, timeout?: number): Promise<unknown> {
    return await this.inner.sendAndWait(options, timeout);
  }

  async abort(): Promise<void> {
    await this.inner.abort();
  }

  async getMessages(): Promise<unknown[]> {
    return await this.inner.getMessages();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static normalizeEvent(sdkEvent: any): SquadSessionEvent {
    const squadType = CopilotSessionAdapter.REVERSE_EVENT_MAP[sdkEvent.type] ?? sdkEvent.type;
    return { type: squadType, ...(sdkEvent.data ?? {}) };
  }

  on(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    const sdkType = CopilotSessionAdapter.EVENT_MAP[eventType] ?? eventType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedHandler = (sdkEvent: any) => {
      handler(CopilotSessionAdapter.normalizeEvent(sdkEvent));
    };
    const unsubscribe = this.inner.on(sdkType, wrappedHandler);
    if (!this.unsubscribers.has(handler)) {
      this.unsubscribers.set(handler, new Map());
    }
    this.unsubscribers.get(handler)!.set(eventType, unsubscribe);
  }

  off(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    const handlerMap = this.unsubscribers.get(handler);
    if (handlerMap) {
      const unsubscribe = handlerMap.get(eventType);
      if (unsubscribe) {
        unsubscribe();
        handlerMap.delete(eventType);
      }
      if (handlerMap.size === 0) {
        this.unsubscribers.delete(handler);
      }
    }
  }

  async close(): Promise<void> {
    await this.inner.destroy();
    this.unsubscribers.clear();
  }
}

// ---------------------------------------------------------------------------
// CopilotProvider
// ---------------------------------------------------------------------------

export interface CopilotProviderOptions {
  cliPath?: string;
  cliArgs?: string[];
  cwd?: string;
  port?: number;
  useStdio?: boolean;
  cliUrl?: string;
  logLevel?: 'error' | 'warning' | 'info' | 'debug' | 'all' | 'none';
  env?: Record<string, string>;
  githubToken?: string;
  useLoggedInUser?: boolean;
}

export class CopilotProvider implements SquadProvider {
  readonly name = 'copilot' as const;

  private client: CopilotClient;
  private connected = false;
  private options: CopilotProviderOptions;

  constructor(options?: CopilotProviderOptions) {
    this.options = options ?? {};
    this.client = new CopilotClient({
      cliPath: this.options.cliPath,
      cliArgs: this.options.cliArgs ?? [],
      cwd: this.options.cwd ?? process.cwd(),
      port: this.options.port ?? 0,
      useStdio: this.options.useStdio ?? true,
      cliUrl: this.options.cliUrl,
      logLevel: this.options.logLevel ?? 'debug',
      autoStart: false,
      autoRestart: false,
      env: this.options.env ?? (process.env as Record<string, string>),
      githubToken: this.options.githubToken,
      useLoggedInUser: this.options.useLoggedInUser ?? (this.options.githubToken ? false : true),
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    await this.client.start();
    this.connected = true;
  }

  async disconnect(): Promise<Error[]> {
    const errors = await this.client.stop();
    this.connected = false;
    return errors;
  }

  async forceDisconnect(): Promise<void> {
    await this.client.forceStop();
    this.connected = false;
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    const session = await this.client.createSession(
      config as Parameters<typeof this.client.createSession>[0],
    );
    return new CopilotSessionAdapter(session);
  }

  async resumeSession(sessionId: string, config: SquadSessionConfig): Promise<SquadSession> {
    const session = await this.client.resumeSession(
      sessionId,
      config as Parameters<typeof this.client.resumeSession>[1],
    );
    return new CopilotSessionAdapter(session);
  }

  async listSessions(): Promise<SquadSessionMetadata[]> {
    const sessions = await this.client.listSessions();
    return sessions.map(
      (s): SquadSessionMetadata => ({
        sessionId: s.sessionId,
        startTime: s.startTime,
        modifiedTime: s.modifiedTime,
        summary: s.summary,
        isRemote: s.isRemote,
        context: s.context as Record<string, unknown> | undefined,
      }),
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.deleteSession(sessionId);
  }

  async getLastSessionId(): Promise<string | undefined> {
    return await this.client.getLastSessionId();
  }

  async listModels(): Promise<SquadModelInfo[]> {
    const models = await this.client.listModels();
    return models.map(
      (m): SquadModelInfo => ({
        id: m.id,
        name: m.name,
        capabilities: m.capabilities,
        policy: m.policy,
        billing: m.billing,
        supportedReasoningEfforts: m.supportedReasoningEfforts,
        defaultReasoningEffort: m.defaultReasoningEffort,
      }),
    );
  }

  async getAuthStatus(): Promise<SquadGetAuthStatusResponse> {
    const raw = await this.client.getAuthStatus();
    return {
      isAuthenticated: raw.isAuthenticated,
      authType: raw.authType,
      host: raw.host,
      login: raw.login,
      statusMessage: raw.statusMessage,
    };
  }

  async getStatus(): Promise<SquadGetStatusResponse> {
    const raw = await this.client.getStatus();
    return { version: raw.version, protocolVersion: raw.protocolVersion };
  }

  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    return await this.client.ping(message);
  }

  on(eventTypeOrHandler: SquadClientEventType | SquadClientEventHandler, handler?: (event: SquadClientEvent) => void): () => void {
    if (typeof eventTypeOrHandler === 'string' && handler) {
      return this.client.on(eventTypeOrHandler, handler);
    }
    return this.client.on(eventTypeOrHandler as SquadClientEventHandler);
  }
}
