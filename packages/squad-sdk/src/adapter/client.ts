/**
 * Squad SDK Client Adapter
 *
 * Wraps a SquadProvider to provide connection lifecycle management, error
 * recovery, automatic reconnection, OTel instrumentation, and EventBus
 * integration.
 *
 * The provider is pluggable: by default a CopilotProvider is constructed
 * (preserving backward compatibility), but callers can inject any
 * SquadProvider implementation.
 *
 * @module adapter/client
 */

import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import { recordSessionCreated, recordSessionClosed, recordSessionError, recordTokenUsage } from '../runtime/otel-metrics.js';
import { estimateCost } from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';
import type { UsageEvent } from '../runtime/streaming.js';
import type { SquadProvider } from './provider.js';
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
} from './types.js';

const tracer = trace.getTracer('squad-sdk');

/**
 * Connection state for SquadClient.
 */
export type SquadConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Options for creating a SquadClient.
 */
export interface SquadClientOptions {
  /**
   * Pre-built provider instance. When supplied, the client delegates to
   * this provider directly and Copilot-specific options are ignored.
   */
  provider?: SquadProvider;

  /**
   * Path to the Copilot CLI executable.
   * Defaults to bundled CLI from @github/copilot package.
   * Only used when no `provider` is supplied (CopilotProvider default).
   */
  cliPath?: string;

  /** Additional arguments to pass to the CLI process. */
  cliArgs?: string[];

  /**
   * Working directory for the CLI process.
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Port to bind the CLI server (TCP mode).
   * Set to 0 for random port, or undefined to use stdio mode.
   */
  port?: number;

  /**
   * Use stdio transport instead of TCP.
   * @default true
   */
  useStdio?: boolean;

  /**
   * URL of an external CLI server to connect to.
   * Mutually exclusive with useStdio and cliPath.
   */
  cliUrl?: string;

  /**
   * Log level for the CLI process.
   * @default "debug"
   */
  logLevel?: 'error' | 'warning' | 'info' | 'debug' | 'all' | 'none';

  /**
   * Automatically start the connection when creating a session.
   * @default true
   */
  autoStart?: boolean;

  /**
   * Automatically reconnect on transient failures.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Optional EventBus for telemetry auto-wiring.
   * When provided, session `usage` events are automatically forwarded
   * to the EventBus, enabling CostTracker and OTel integration.
   */
  eventBus?: EventBus;

  /**
   * Environment variables to pass to the CLI process.
   * @default process.env
   */
  env?: Record<string, string>;

  /**
   * GitHub token for authentication.
   * If not provided, uses logged-in user credentials.
   */
  githubToken?: string;

  /**
   * Use logged-in user credentials for authentication.
   * @default true (false if githubToken is provided)
   */
  useLoggedInUser?: boolean;

  /**
   * Maximum number of reconnection attempts before giving up.
   * @default 3
   */
  maxReconnectAttempts?: number;

  /**
   * Initial delay in milliseconds before first reconnection attempt.
   * Subsequent attempts use exponential backoff.
   * @default 1000
   */
  reconnectDelayMs?: number;
}

/**
 * SquadClient wraps a SquadProvider with enhanced lifecycle management.
 *
 * Features:
 * - Connection state tracking
 * - Automatic reconnection with exponential backoff
 * - OTel instrumentation
 * - Error recovery
 * - Session lifecycle event handling
 *
 * @example
 * ```typescript
 * const client = new SquadClient();
 * await client.connect();
 *
 * const session = await client.createSession({
 *   model: "claude-sonnet-4.5"
 * });
 *
 * await client.disconnect();
 * ```
 */
export class SquadClient {
  private provider: SquadProvider;
  private state: SquadConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private options: {
    autoStart: boolean;
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    reconnectDelayMs: number;
    eventBus?: EventBus;
    useStdio?: boolean;
  };
  private manualDisconnect: boolean = false;

  /**
   * Creates a new SquadClient instance.
   *
   * When `options.provider` is supplied, the client delegates to it directly.
   * Otherwise, a CopilotProvider is lazily constructed from the remaining
   * options (backward-compatible default).
   */
  constructor(options: SquadClientOptions = {}) {
    this.options = {
      autoStart: options.autoStart ?? true,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      eventBus: options.eventBus,
      useStdio: options.useStdio ?? true,
    };

    if (options.provider) {
      this.provider = options.provider;
    } else {
      // Lazy-import CopilotProvider to avoid pulling in @github/copilot-sdk
      // when a different provider is supplied.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CopilotProvider } = require('./providers/copilot-provider.js');
      this.provider = new CopilotProvider({
        cliPath: options.cliPath,
        cliArgs: options.cliArgs,
        cwd: options.cwd,
        port: options.port,
        useStdio: options.useStdio,
        cliUrl: options.cliUrl,
        logLevel: options.logLevel,
        env: options.env,
        githubToken: options.githubToken,
        useLoggedInUser: options.useLoggedInUser,
      });
    }
  }

  /** Get the current connection state. */
  getState(): SquadConnectionState {
    return this.state;
  }

  /** Check if the client is connected. */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /** Get the underlying provider. */
  getProvider(): SquadProvider {
    return this.provider;
  }

  /**
   * Establish connection to the LLM provider.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    if (this.state === 'connecting' && this.connectPromise) {
      return this.connectPromise;
    }

    const span = tracer.startSpan('squad.client.connect');
    span.setAttribute('provider', this.provider.name);
    span.setAttribute('connection.transport', this.options.useStdio ? 'stdio' : 'tcp');

    this.state = 'connecting';
    this.manualDisconnect = false;

    this.connectPromise = (async () => {
      const startTime = Date.now();

      try {
        await this.provider.connect();
        const elapsed = Date.now() - startTime;

        this.state = 'connected';
        this.reconnectAttempts = 0;

        span.setAttribute('connection.duration_ms', elapsed);

        if (elapsed > 2000) {
          console.warn(`SquadClient connection took ${elapsed}ms (> 2s threshold)`);
        }
      } catch (error) {
        this.state = 'error';
        const wrapped = new Error(
          `Failed to connect to ${this.provider.name} provider: ${error instanceof Error ? error.message : String(error)}`,
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

  /**
   * Disconnect from the LLM provider.
   */
  async disconnect(): Promise<Error[]> {
    const span = tracer.startSpan('squad.client.disconnect');
    try {
      this.manualDisconnect = true;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      const errors = await this.provider.disconnect();
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

  /**
   * Force disconnect without graceful cleanup.
   * Use only when disconnect() fails or hangs.
   */
  async forceDisconnect(): Promise<void> {
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.provider.forceDisconnect) {
      await this.provider.forceDisconnect();
    } else {
      await this.provider.disconnect();
    }
    this.state = 'disconnected';
    this.reconnectAttempts = 0;
    this.connectPromise = null;
  }

  /**
   * Create a new Squad session.
   */
  async createSession(config: SquadSessionConfig = {}): Promise<SquadSession> {
    const span = tracer.startSpan('squad.session.create');
    span.setAttribute('session.auto_start', this.options.autoStart);
    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new Error('Client not connected. Call connect() first.');
      }

      try {
        // Normalize legacy 'approved' permission kind → 'approve-once' before forwarding to SDK
        const normalizedConfig: SquadSessionConfig = config.onPermissionRequest
          ? {
              ...config,
              onPermissionRequest: async (
                req: Parameters<NonNullable<SquadSessionConfig['onPermissionRequest']>>[0],
                inv: Parameters<NonNullable<SquadSessionConfig['onPermissionRequest']>>[1],
              ) => {
                const result = await config.onPermissionRequest!(req, inv);
                if (result.kind === 'approved') {
                  return { ...result, kind: 'approve-once' as const };
                }
                return result;
              },
            }
          : config;
        const result = await this.provider.createSession(normalizedConfig);
        if (result.sessionId) {
          span.setAttribute('session.id', result.sessionId);
        }
        recordSessionCreated();

        if (this.options.eventBus) {
          const bus = this.options.eventBus;
          const sid = result.sessionId;
          result.on('usage', (event: SquadSessionEvent) => {
            const inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
            const outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
            const model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
            const cost = estimateCost(model, inputTokens, outputTokens);
            void bus.emit({
              type: 'session:message',
              sessionId: sid,
              payload: { inputTokens, outputTokens, model, estimatedCost: cost },
              timestamp: new Date(),
            });
          });
        }

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('onPermissionRequest')) {
          throw new Error(
            'Session creation failed: an onPermissionRequest handler is required. ' +
            'Pass { onPermissionRequest: () => ({ kind: "approve-once" }) } in your session config ' +
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

  /**
   * Resume an existing Squad session by ID.
   */
  async resumeSession(sessionId: string, config: SquadSessionConfig = {}): Promise<SquadSession> {
    const span = tracer.startSpan('squad.session.resume');
    span.setAttribute('session.id', sessionId);
    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new Error('Client not connected. Call connect() first.');
      }

      try {
        if (!this.provider.resumeSession) {
          throw new Error(`Provider ${this.provider.name} does not support session resumption`);
        }
        return await this.provider.resumeSession(sessionId, config);
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

  /**
   * List all available sessions.
   */
  async listSessions(): Promise<SquadSessionMetadata[]> {
    const span = tracer.startSpan('squad.session.list');
    try {
      if (!this.isConnected()) {
        throw new Error('Client not connected');
      }

      try {
        if (!this.provider.listSessions) {
          return [];
        }
        const result = await this.provider.listSessions();
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

  /**
   * Delete a session by ID.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.session.delete');
    span.setAttribute('session.id', sessionId);
    try {
      if (!this.isConnected()) {
        throw new Error('Client not connected');
      }

      try {
        if (this.provider.deleteSession) {
          await this.provider.deleteSession(sessionId);
        }
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

  /**
   * Get the ID of the last updated session.
   */
  async getLastSessionId(): Promise<string | undefined> {
    if (!this.isConnected()) {
      throw new Error('Client not connected');
    }

    try {
      if (!this.provider.getLastSessionId) return undefined;
      return await this.provider.getLastSessionId();
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getLastSessionId();
      }
      throw error;
    }
  }

  /**
   * Send a ping to verify connectivity.
   */
  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    if (!this.isConnected()) {
      throw new Error('Client not connected');
    }

    try {
      if (!this.provider.ping) {
        return { message: message ?? 'pong', timestamp: Date.now() };
      }
      return await this.provider.ping(message);
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.ping(message);
      }
      throw error;
    }
  }

  /**
   * Get provider status information.
   */
  async getStatus(): Promise<SquadGetStatusResponse> {
    if (!this.isConnected()) {
      throw new Error('Client not connected');
    }

    try {
      if (!this.provider.getStatus) {
        return { version: '0.0.0', protocolVersion: 0 };
      }
      return await this.provider.getStatus();
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getStatus();
      }
      throw error;
    }
  }

  /**
   * Get authentication status.
   */
  async getAuthStatus(): Promise<SquadGetAuthStatusResponse> {
    if (!this.isConnected()) {
      throw new Error('Client not connected');
    }

    try {
      if (!this.provider.getAuthStatus) {
        return { isAuthenticated: true };
      }
      return await this.provider.getAuthStatus();
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.getAuthStatus();
      }
      throw error;
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<SquadModelInfo[]> {
    if (!this.isConnected()) {
      throw new Error('Client not connected');
    }

    try {
      if (!this.provider.listModels) {
        return [];
      }
      return await this.provider.listModels();
    } catch (error) {
      if (this.shouldAttemptReconnect(error)) {
        await this.attemptReconnection();
        return this.listModels();
      }
      throw error;
    }
  }

  /**
   * Send a message to a session, wrapped with OTel tracing.
   */
  async sendMessage(session: SquadSession, options: SquadMessageOptions): Promise<void> {
    const messageSpan = tracer.startSpan('squad.session.message');
    messageSpan.setAttribute('session.id', session.sessionId);
    messageSpan.setAttribute('prompt.length', options.prompt.length);
    messageSpan.setAttribute('streaming', true);

    const streamSpan = tracer.startSpan('squad.session.stream');
    streamSpan.setAttribute('session.id', session.sessionId);

    const messageStartMs = Date.now();
    let firstTokenRecorded = false;
    let outputTokens = 0;
    let inputTokens = 0;
    let model = 'unknown';

    const origOn = session.on.bind(session);

    const streamListener = (event: SquadSessionEvent) => {
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

  /**
   * Close a session (alias for deleteSession with `squad.session.close` span).
   */
  async closeSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.session.close');
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

  /**
   * Send a message and wait for the response, wrapped with OTel tracing.
   */
  async sendAndWait(session: SquadSession, options: SquadMessageOptions, timeout?: number): Promise<unknown> {
    const span = tracer.startSpan('squad.session.sendAndWait');
    span.setAttribute('session.id', session.sessionId);
    span.setAttribute('prompt.length', options.prompt.length);

    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'unknown';

    const usageListener = (event: SquadSessionEvent) => {
      if (event.type === 'usage') {
        inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
        outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
        model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
      }
    };

    session.on('usage', usageListener);

    try {
      if (!session.sendAndWait) {
        throw new Error('Session does not support sendAndWait()');
      }
      const result = await session.sendAndWait(options, timeout);

      span.setAttribute('tokens.input', inputTokens);
      span.setAttribute('tokens.output', outputTokens);

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

      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
      try {
        session.off('usage', usageListener);
      } catch {
        // session may not support off — ignore
      }
    }
  }

  /**
   * Subscribe to client-level session lifecycle events.
   */
  on<K extends SquadClientEventType>(eventType: K, handler: (event: SquadClientEvent & { type: K }) => void): () => void;
  on(handler: SquadClientEventHandler): () => void;
  on(
    eventTypeOrHandler: SquadClientEventType | SquadClientEventHandler,
    handler?: (event: SquadClientEvent) => void,
  ): () => void {
    if (this.provider.on) {
      if (typeof eventTypeOrHandler === 'string' && handler) {
        return this.provider.on(eventTypeOrHandler, handler);
      }
      return this.provider.on(eventTypeOrHandler as SquadClientEventHandler);
    }
    // Provider does not support lifecycle events — return no-op unsubscribe
    return () => {};
  }

  /**
   * Determine if an error is recoverable via reconnection.
   */
  private shouldAttemptReconnect(error: unknown): boolean {
    if (!this.options.autoReconnect) return false;
    if (this.manualDisconnect) return false;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) return false;

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

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private async attemptReconnection(): Promise<void> {
    if (this.state === 'reconnecting') {
      throw new Error('Reconnection already in progress');
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => {
      this.reconnectTimer = setTimeout(resolve, delay);
    });

    try {
      await this.provider.disconnect();
      await this.provider.connect();
      this.state = 'connected';
      this.reconnectAttempts = 0;
    } catch (error) {
      this.state = 'error';
      throw new Error(
        `Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
