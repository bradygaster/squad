/**
 * Copilot Runtime Driver
 *
 * Implements AgentRuntimeDriver for GitHub Copilot using @github/copilot-sdk.
 *
 * @module drivers/copilot/driver
 */

import { CopilotClient } from '@github/copilot-sdk';
import { trace, SpanStatusCode } from '../../runtime/otel-api.js';
import { recordSessionCreated, recordSessionClosed, recordSessionError, recordTokenUsage } from '../../runtime/otel-metrics.js';
import { estimateCost } from '../../config/models.js';
import type { EventBus } from '../../runtime/event-bus.js';
import type { UsageEvent } from '../../runtime/streaming.js';
import type {
  AgentRuntimeDriver,
  DriverOptions,
  DriverSessionConfig,
  DriverSessionMetadata,
  DriverMessageOptions,
  DriverAuthStatus,
  DriverStatus,
  DriverModelInfo,
  DriverConnectionState,
  AgentSession,
  DriverSessionEvent,
  DriverSessionEventHandler,
} from '../../runtime/driver.js';
import {
  DriverError,
  DriverConnectionError,
  DriverSessionError,
} from '../../runtime/driver.js';

const tracer = trace.getTracer('squad-sdk');

/**
 * Maps Squad short event names → @github/copilot-sdk dotted event names.
 */
const EVENT_MAP: Record<string, string> = {
  message_delta: 'assistant.message_delta',
  message: 'assistant.message',
  usage: 'assistant.usage',
  reasoning_delta: 'assistant.reasoning_delta',
  reasoning: 'assistant.reasoning',
  turn_start: 'assistant.turn_start',
  turn_end: 'assistant.turn_end',
  intent: 'assistant.intent',
  idle: 'session.idle',
  error: 'session.error',
};

/**
 * Reverse map: SDK dotted names → Squad short names.
 */
const REVERSE_EVENT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_MAP).map(([k, v]) => [v, k])
);

/**
 * Adapts @github/copilot-sdk CopilotSession to our AgentSession interface.
 */
class CopilotSessionAdapter implements AgentSession {
  private readonly inner: unknown;
  private readonly unsubscribers = new Map<DriverSessionEventHandler, Map<string, () => void>>();

  constructor(copilotSession: unknown) {
    this.inner = copilotSession;
  }

  get sessionId(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.inner as any).sessionId ?? 'unknown';
  }

  async sendMessage(options: DriverMessageOptions): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.inner as any).send(options);
  }

  async sendAndWait(options: DriverMessageOptions, timeout?: number): Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.inner as any).sendAndWait(options, timeout);
  }

  async abort(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.inner as any).abort();
  }

  async getMessages(): Promise<unknown[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (this.inner as any).getMessages();
  }

  private static normalizeEvent(sdkEvent: unknown): DriverSessionEvent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = sdkEvent as any;
    const squadType = REVERSE_EVENT_MAP[event.type] ?? event.type;
    return {
      type: squadType,
      ...(event.data ?? {}),
    };
  }

  on(eventType: string, handler: DriverSessionEventHandler): void {
    const sdkType = EVENT_MAP[eventType] ?? eventType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedHandler = (sdkEvent: any) => {
      handler(CopilotSessionAdapter.normalizeEvent(sdkEvent));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (this.inner as any).on(sdkType, wrappedHandler);
    if (!this.unsubscribers.has(handler)) {
      this.unsubscribers.set(handler, new Map());
    }
    this.unsubscribers.get(handler)!.set(eventType, unsubscribe);
  }

  off(eventType: string, handler: DriverSessionEventHandler): void {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.inner as any).destroy();
    this.unsubscribers.clear();
  }
}

/**
 * Copilot Runtime Driver
 *
 * Implements AgentRuntimeDriver for GitHub Copilot using @github/copilot-sdk.
 * This driver wraps CopilotClient to provide connection lifecycle management,
 * error recovery, automatic reconnection, and protocol version validation.
 */
export class CopilotDriver implements AgentRuntimeDriver {
  readonly name = 'copilot';

  private client: CopilotClient;
  private state: DriverConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualDisconnect: boolean = false;
  private options: Required<Omit<DriverOptions, 'cliUrl' | 'authToken' | 'useLoggedInUser' | 'cliPath' | 'cliArgs' | 'eventBus'>> & {
    cliUrl?: string;
    authToken?: string;
    useLoggedInUser?: boolean;
    cliPath?: string;
    cliArgs: string[];
    eventBus?: EventBus;
  };

  constructor(options: DriverOptions = {}) {
    this.options = {
      cliPath: options.cliPath,
      cliArgs: options.cliArgs ?? [],
      cwd: options.cwd ?? process.cwd(),
      port: options.port ?? 0,
      useStdio: options.useStdio ?? true,
      cliUrl: options.cliUrl,
      logLevel: options.logLevel ?? 'debug',
      autoStart: options.autoStart ?? true,
      autoReconnect: options.autoReconnect ?? true,
      env: options.env ?? (process.env as Record<string, string>),
      authToken: options.authToken,
      useLoggedInUser: options.useLoggedInUser ?? (options.authToken ? false : true),
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      eventBus: options.eventBus,
    };

    this.client = new CopilotClient({
      cliPath: this.options.cliPath,
      cliArgs: this.options.cliArgs,
      cwd: this.options.cwd,
      port: this.options.port,
      useStdio: this.options.useStdio,
      cliUrl: this.options.cliUrl,
      logLevel: this.options.logLevel,
      autoStart: false,
      autoRestart: false,
      env: this.options.env,
      githubToken: this.options.authToken,
      useLoggedInUser: this.options.useLoggedInUser,
    });
  }

  getState(): DriverConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    if (this.state === 'connecting' && this.connectPromise) {
      return this.connectPromise;
    }

    const span = tracer.startSpan('squad.driver.copilot.connect');
    span.setAttribute('connection.transport', this.options.useStdio ? 'stdio' : 'tcp');

    this.state = 'connecting';
    this.manualDisconnect = false;

    this.connectPromise = (async () => {
      const startTime = Date.now();
      try {
        await this.client.start();
        const elapsed = Date.now() - startTime;

        this.state = 'connected';
        this.reconnectAttempts = 0;

        span.setAttribute('connection.duration_ms', elapsed);

        if (elapsed > 2000) {
          console.warn(`CopilotDriver connection took ${elapsed}ms (> 2s threshold)`);
        }
      } catch (error) {
        this.state = 'error';
        const wrapped = new DriverConnectionError(
          this.name,
          `Failed to connect to Copilot CLI: ${error instanceof Error ? error.message : String(error)}`
        );
        span.setStatus({ code: SpanStatusCode.ERROR, message: wrapped.message });
        span.recordException(wrapped);
        throw wrapped;
      } finally {
        this.connectPromise = null;
        span.end();
      }
    })();

    return this.connectPromise;
  }

  async disconnect(): Promise<Error[]> {
    const span = tracer.startSpan('squad.driver.copilot.disconnect');
    try {
      this.manualDisconnect = true;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      const errors = await this.client.stop();
      this.state = 'disconnected';
      this.reconnectAttempts = 0;
      this.connectPromise = null;
      return errors;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async forceDisconnect(): Promise<void> {
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.client.forceStop();
    this.state = 'disconnected';
    this.reconnectAttempts = 0;
    this.connectPromise = null;
  }

  async createSession(config?: DriverSessionConfig): Promise<AgentSession> {
    const span = tracer.startSpan('squad.driver.copilot.session.create');
    span.setAttribute('session.auto_start', this.options.autoStart);

    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new DriverSessionError(this.name, 'Client not connected. Call connect() first.');
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await this.client.createSession(config as any);
        const result = new CopilotSessionAdapter(session);

        if (result.sessionId) {
          span.setAttribute('session.id', result.sessionId);
        }

        recordSessionCreated();

        if (this.options.eventBus) {
          const bus = this.options.eventBus;
          const sid = result.sessionId;
          result.on('usage', (event: DriverSessionEvent) => {
            const inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
            const outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
            const model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
            const cost = estimateCost(model, inputTokens, outputTokens);
            void bus.emit({
              type: 'session:message',
              sessionId: sid,
              payload: {
                inputTokens,
                outputTokens,
                model,
                estimatedCost: cost,
              },
              timestamp: new Date(),
            });
          });
        }

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('onPermissionRequest')) {
          throw new DriverSessionError(
            this.name,
            'Session creation failed: an onPermissionRequest handler is required. ' +
            'Pass { onPermissionRequest: () => ({ kind: "approved" }) } in your session config ' +
            'to approve all permissions, or provide a custom handler.'
          );
        }
        recordSessionError();
        if (this.shouldAttemptReconnect(error)) {
          await this.attemptReconnection();
          return this.createSession(config);
        }
        throw error;
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async resumeSession(sessionId: string, config?: DriverSessionConfig): Promise<AgentSession> {
    const span = tracer.startSpan('squad.driver.copilot.session.resume');
    span.setAttribute('session.id', sessionId);

    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new DriverSessionError(this.name, 'Client not connected. Call connect() first.');
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await this.client.resumeSession(sessionId, config as any);
        return new CopilotSessionAdapter(session);
      } catch (error) {
        if (this.shouldAttemptReconnect(error)) {
          await this.attemptReconnection();
          return this.resumeSession(sessionId, config);
        }
        throw error;
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async listSessions(): Promise<DriverSessionMetadata[]> {
    const span = tracer.startSpan('squad.driver.copilot.session.list');

    try {
      if (!this.isConnected()) {
        throw new DriverSessionError(this.name, 'Client not connected');
      }

      try {
        const sessions = await this.client.listSessions();
        const result = sessions.map((s): DriverSessionMetadata => ({
          sessionId: s.sessionId,
          startTime: s.startTime,
          modifiedTime: s.modifiedTime,
          summary: s.summary,
          isRemote: s.isRemote,
          context: s.context as Record<string, unknown> | undefined,
        }));
        span.setAttribute('sessions.count', result.length);
        return result;
      } catch (error) {
        if (this.shouldAttemptReconnect(error)) {
          await this.attemptReconnection();
          return this.listSessions();
        }
        throw error;
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.driver.copilot.session.delete');
    span.setAttribute('session.id', sessionId);

    try {
      if (!this.isConnected()) {
        throw new DriverSessionError(this.name, 'Client not connected');
      }

      try {
        await this.client.deleteSession(sessionId);
        recordSessionClosed();
      } catch (error) {
        recordSessionError();
        if (this.shouldAttemptReconnect(error)) {
          await this.attemptReconnection();
          return this.deleteSession(sessionId);
        }
        throw error;
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async getLastSessionId(): Promise<string | undefined> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      return await this.client.getLastSessionId();
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getLastSessionId();
      }
      throw error;
    }
  }

  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      return await this.client.ping(message);
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.ping(message);
      }
      throw error;
    }
  }

  async getStatus(): Promise<DriverStatus> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const raw = await this.client.getStatus();
      return {
        version: raw.version,
        protocolVersion: raw.protocolVersion,
      };
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getStatus();
      }
      throw error;
    }
  }

  async getAuthStatus(): Promise<DriverAuthStatus> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const raw = await this.client.getAuthStatus();
      return {
        isAuthenticated: raw.isAuthenticated,
        authType: raw.authType === 'gh-cli' ? 'cli' : raw.authType,
        host: raw.host,
        login: raw.login,
        statusMessage: raw.statusMessage,
      };
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getAuthStatus();
      }
      throw error;
    }
  }

  async listModels(): Promise<DriverModelInfo[]> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const models = await this.client.listModels();
      return models.map((m): DriverModelInfo => ({
        id: m.id,
        name: m.name,
        capabilities: m.capabilities,
        supportedReasoningEfforts: m.supportedReasoningEfforts,
        defaultReasoningEffort: m.defaultReasoningEffort,
      }));
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.listModels();
      }
      throw error;
    }
  }

  async sendMessage(session: AgentSession, options: DriverMessageOptions): Promise<void> {
    const messageSpan = tracer.startSpan('squad.driver.copilot.session.message');
    messageSpan.setAttribute('session.id', session.sessionId);
    messageSpan.setAttribute('prompt.length', options.prompt.length);
    messageSpan.setAttribute('streaming', true);
    const streamSpan = tracer.startSpan('squad.driver.copilot.session.stream');
    streamSpan.setAttribute('session.id', session.sessionId);
    const messageStartMs = Date.now();
    let firstTokenRecorded = false;
    let outputTokens = 0;
    let inputTokens = 0;

    let model = 'unknown';

    const origOn = session.on.bind(session);

    const streamListener = (event: DriverSessionEvent) => {
      if (event.type === 'message_delta' && !firstTokenRecorded) {
        firstTokenRecorded = true;
        streamSpan.addEvent('first_token');
      }
      if (event.type === 'usage') {
        inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
        outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
        model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
      }
    };

    origOn('message_delta', streamListener);
    origOn('usage', streamListener);

    try {
      await session.sendMessage(options);

      const durationMs = Date.now() - messageStartMs;
      streamSpan.addEvent('last_token');
      streamSpan.setAttribute('tokens.input', inputTokens);
      streamSpan.setAttribute('tokens.output', outputTokens);
      streamSpan.setAttribute('duration_ms', durationMs);

      if (inputTokens > 0 || outputTokens > 0) {
        const usageEvent: UsageEvent = {
          type: 'usage',
          sessionId: session.sessionId,
          model,
          inputTokens,
          outputTokens,
          estimatedCost: estimateCost(model, inputTokens, outputTokens),
          timestamp: new Date(),
        };
        recordTokenUsage(usageEvent);
      }
    } catch (err) {
      streamSpan.addEvent('stream_error');
      streamSpan.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      streamSpan.recordException(err instanceof Error ? err : new Error(String(err)));
      messageSpan.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      messageSpan.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      streamSpan.end();
      messageSpan.end();
      try {
        session.off('message_delta', streamListener);
        session.off('usage', streamListener);
      } catch {
        // session may not support off — ignore
      }
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.driver.copilot.session.close');
    span.setAttribute('session.id', sessionId);

    try {
      await this.deleteSession(sessionId);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  private shouldAttemptReconnect(error: unknown): boolean {
    if (!this.options.autoReconnect) {
      return false;
    }

    if (this.manualDisconnect) {
      return false;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ECONNRESET') ||
      message.includes('EPIPE') ||
      message.includes('Client not connected') ||
      message.includes('Connection closed')
    ) {
      return true;
    }

    return false;
  }

  private async attemptReconnection(): Promise<void> {
    if (this.state === 'reconnecting') {
      throw new DriverError(this.name, 'Reconnection already in progress', 'reconnect', true);
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => {
      this.reconnectTimer = setTimeout(resolve, delay);
    });

    try {
      await this.client.stop();
      await this.client.start();
      this.state = 'connected';
      this.reconnectAttempts = 0;
    } catch (error) {
      this.state = 'error';
      throw new DriverError(
        this.name,
        `Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`,
        'reconnect',
        true
      );
    }
  }
}

/**
 * Create a Copilot driver instance.
 */
export function createCopilotDriver(options?: DriverOptions): AgentRuntimeDriver {
  return new CopilotDriver(options);
}

/**
 * Register the Copilot driver with the global registry.
 */
export async function registerCopilotDriver(
  registry?: { registerDriverFactory: (name: string, factory: () => Promise<AgentRuntimeDriver>) => void },
  options?: DriverOptions
): Promise<AgentRuntimeDriver> {
  const driver = new CopilotDriver(options);
  if (registry) {
    registry.registerDriverFactory('copilot', async () => driver);
  }
  return driver;
}
