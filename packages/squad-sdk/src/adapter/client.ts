/**
 * Squad SDK Client Adapter
 * 
 * Wraps CopilotClient to provide connection lifecycle management, error recovery,
 * automatic reconnection, and protocol version validation.
 * 
 * @module adapter/client
 */

import { CopilotClient } from "@github/copilot-sdk";
import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import { recordSessionCreated, recordSessionClosed, recordSessionError, recordTokenUsage } from '../runtime/otel-metrics.js';
import { estimateCost } from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';
import type { UsageEvent } from '../runtime/streaming.js';
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
} from "./types.js";

const tracer = trace.getTracer('squad-sdk');

/**
 * Adapts @github/copilot-sdk CopilotSession to our SquadSession interface.
 * Maps sendMessage() → send(), off() via unsubscribe tracking, close() → destroy().
 *
 * Bug reported by @spboyer (Shayne Boyer) — Codespace environment exposed
 * the unsafe `as unknown as` cast that skipped runtime method mapping.
 */
class CopilotSessionAdapter implements SquadSession {
  /**
   * Maps Squad short event names → @github/copilot-sdk dotted event names.
   * SDK uses dotted-namespace prefixes (e.g., `assistant.message_delta`),
   * while Squad uses short names (e.g., `message_delta`).
   * Names already in dotted form pass through via the fallback.
   */
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

  /** Reverse map: SDK dotted names → Squad short names. */
  private static readonly REVERSE_EVENT_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(CopilotSessionAdapter.EVENT_MAP).map(([k, v]) => [v, k])
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

  /**
   * Normalizes an SDK event into a SquadSessionEvent.
   * Maps the dotted type back to the Squad short name and
   * flattens `event.data` onto the top-level object so callers
   * can access fields directly (e.g., `event.inputTokens`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static normalizeEvent(sdkEvent: any): SquadSessionEvent {
    const squadType = CopilotSessionAdapter.REVERSE_EVENT_MAP[sdkEvent.type] ?? sdkEvent.type;
    return {
      type: squadType,
      ...(sdkEvent.data ?? {}),
    };
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

/**
 * Connection state for SquadClient.
 */
export type SquadConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

/**
 * Options for creating a SquadClient.
 */
export interface SquadClientOptions {
  /**
   * Path to the Copilot CLI executable.
   * Defaults to bundled CLI from @github/copilot package.
   */
  cliPath?: string;

  /**
   * Additional arguments to pass to the CLI process.
   */
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
  logLevel?: "error" | "warning" | "info" | "debug" | "all" | "none";

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
 * SquadClient wraps CopilotClient with enhanced lifecycle management.
 * 
 * Features:
 * - Connection state tracking
 * - Automatic reconnection with exponential backoff
 * - Protocol version validation
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
  private client: CopilotClient;
  private state: SquadConnectionState = "disconnected";
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private options: Required<Omit<SquadClientOptions, "cliUrl" | "githubToken" | "useLoggedInUser" | "cliPath" | "cliArgs" | "eventBus">> & {
    cliUrl?: string;
    githubToken?: string;
    useLoggedInUser?: boolean;
    cliPath?: string;
    cliArgs: string[];
    eventBus?: EventBus;
  };
  private manualDisconnect: boolean = false;

  /**
   * Creates a new SquadClient instance.
   * 
   * @param options - Configuration options
   * @throws Error if mutually exclusive options are provided
   */
  constructor(options: SquadClientOptions = {}) {
    this.options = {
      cliPath: options.cliPath,
      cliArgs: options.cliArgs ?? [],
      cwd: options.cwd ?? process.cwd(),
      port: options.port ?? 0,
      useStdio: options.useStdio ?? true,
      cliUrl: options.cliUrl,
      logLevel: options.logLevel ?? "debug",
      autoStart: options.autoStart ?? true,
      autoReconnect: options.autoReconnect ?? true,
      env: options.env ?? (process.env as Record<string, string>),
      githubToken: options.githubToken,
      useLoggedInUser: options.useLoggedInUser ?? (options.githubToken ? false : true),
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
      autoStart: false, // We manage connection lifecycle
      autoRestart: false, // We handle reconnection ourselves
      env: this.options.env,
      githubToken: this.options.githubToken,
      useLoggedInUser: this.options.useLoggedInUser,
    });
  }

  /**
   * Get the current connection state.
   */
  getState(): SquadConnectionState {
    return this.state;
  }

  /**
   * Check if the client is connected.
   */
  isConnected(): boolean {
    return this.state === "connected";
  }

  /**
   * Establish connection to the Copilot CLI server.
   * 
   * This method:
   * 1. Spawns or connects to the CLI server
   * 2. Validates protocol version compatibility
   * 3. Sets up automatic reconnection handlers
   * 
   * @returns Promise that resolves when connection is established
   * @throws Error if connection fails or protocol version is incompatible
   */
  async connect(): Promise<void> {
    if (this.state === "connected") {
      return;
    }

    // Dedup: if a connection is already in progress, piggyback on it
    if (this.state === "connecting" && this.connectPromise) {
      return this.connectPromise;
    }

    const span = tracer.startSpan('squad.client.connect');
    span.setAttribute('connection.transport', this.options.useStdio ? 'stdio' : 'tcp');

    this.state = "connecting";
    this.manualDisconnect = false;

    this.connectPromise = (async () => {
      const startTime = Date.now();

      try {
        await this.client.start();
        const elapsed = Date.now() - startTime;
        
        this.state = "connected";
        this.reconnectAttempts = 0;

        span.setAttribute('connection.duration_ms', elapsed);

        if (elapsed > 2000) {
          console.warn(`SquadClient connection took ${elapsed}ms (> 2s threshold)`);
        }
      } catch (error) {
        this.state = "error";
        const wrapped = new Error(
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

  /**
   * Disconnect from the Copilot CLI server.
   * 
   * Performs graceful cleanup:
   * 1. Destroys all active sessions
   * 2. Closes the connection
   * 3. Terminates the CLI process (if spawned)
   * 
   * @returns Promise that resolves with any errors encountered during cleanup
   */
  async disconnect(): Promise<Error[]> {
    const span = tracer.startSpan('squad.client.disconnect');
    try {
      this.manualDisconnect = true;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      const errors = await this.client.stop();
      this.state = "disconnected";
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

    await this.client.forceStop();
    this.state = "disconnected";
    this.reconnectAttempts = 0;
    this.connectPromise = null;
  }

  /**
   * Create a new Squad session.
   * 
   * If autoStart is enabled and the client is not connected, this will
   * automatically establish the connection.
   * 
   * @param config - Session configuration
   * @returns Promise that resolves with the created session
   */
  async createSession(config: SquadSessionConfig = {}): Promise<SquadSession> {
    const span = tracer.startSpan('squad.session.create');
    span.setAttribute('session.auto_start', this.options.autoStart);
    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new Error("Client not connected. Call connect() first.");
      }

      try {
        // Cast config to handle SDK version differences in SessionConfig type
        const session = await this.client.createSession(config as Parameters<typeof this.client.createSession>[0]);
        const result = new CopilotSessionAdapter(session);
        if (result.sessionId) {
          span.setAttribute('session.id', result.sessionId);
        }
        recordSessionCreated();

        // Auto-forward usage events to EventBus when one is configured
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
          throw new Error(
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

  /**
   * Resume an existing Squad session by ID.
   * 
   * @param sessionId - ID of the session to resume
   * @param config - Optional configuration overrides
   * @returns Promise that resolves with the resumed session
   */
  async resumeSession(sessionId: string, config: SquadSessionConfig = {}): Promise<SquadSession> {
    const span = tracer.startSpan('squad.session.resume');
    span.setAttribute('session.id', sessionId);
    try {
      if (!this.isConnected() && this.options.autoStart) {
        await this.connect();
      }

      if (!this.isConnected()) {
        throw new Error("Client not connected. Call connect() first.");
      }

      try {
        // Cast config to handle SDK version differences in ResumeSessionConfig type
        const session = await this.client.resumeSession(sessionId, config as Parameters<typeof this.client.resumeSession>[1]);
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

  /**
   * List all available sessions.
   */
  async listSessions(): Promise<SquadSessionMetadata[]> {
    const span = tracer.startSpan('squad.session.list');
    try {
      if (!this.isConnected()) {
        throw new Error("Client not connected");
      }

      try {
        const sessions = await this.client.listSessions();
        const result = sessions.map((s): SquadSessionMetadata => ({
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

  /**
   * Delete a session by ID.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.session.delete');
    span.setAttribute('session.id', sessionId);
    try {
      if (!this.isConnected()) {
        throw new Error("Client not connected");
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

  /**
   * Get the ID of the last updated session.
   */
  async getLastSessionId(): Promise<string | undefined> {
    if (!this.isConnected()) {
      throw new Error("Client not connected");
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

  /**
   * Send a ping to verify connectivity.
   */
  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    if (!this.isConnected()) {
      throw new Error("Client not connected");
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

  /**
   * Get CLI status information.
   */
  async getStatus(): Promise<SquadGetStatusResponse> {
    if (!this.isConnected()) {
      throw new Error("Client not connected");
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

  /**
   * Get authentication status.
   */
  async getAuthStatus(): Promise<SquadGetAuthStatusResponse> {
    if (!this.isConnected()) {
      throw new Error("Client not connected");
    }

    try {
      const raw = await this.client.getAuthStatus();
      return {
        isAuthenticated: raw.isAuthenticated,
        authType: raw.authType,
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

  /**
   * List available models.
   */
  async listModels(): Promise<SquadModelInfo[]> {
    if (!this.isConnected()) {
      throw new Error("Client not connected");
    }

    try {
      const models = await this.client.listModels();
      return models.map((m): SquadModelInfo => ({
        id: m.id,
        name: m.name,
        capabilities: m.capabilities,
        policy: m.policy,
        billing: m.billing,
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

  /**
   * Send a message to a session, wrapped with OTel tracing.
   *
   * Creates a `squad.session.message` span for the full call and a
   * child `squad.session.stream` span that tracks streaming duration
   * with `first_token`, `last_token`, and `stream_error` events.
   *
   * @param session - The session to send the message to
   * @param options - Message content and delivery options
   * @returns Promise that resolves when the message is processed
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

    // Wire temporary event listener for stream tracking
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

      // Record token usage in OTel metrics (not just span attributes)
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
      // Clean up listeners
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
   *
   * @param sessionId - ID of the session to close
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
   * Send a message and wait for the response, wrapped with OTel tracing
   * and token metric recording.
   *
   * @param session - The session to send the message to
   * @param options - Message content and delivery options
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise that resolves with the session response
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

      // Record token usage in OTel metrics
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
    handler?: (event: SquadClientEvent) => void
  ): () => void {
    if (typeof eventTypeOrHandler === "string" && handler) {
      return this.client.on(eventTypeOrHandler, handler);
    } else {
      return this.client.on(eventTypeOrHandler as SquadClientEventHandler);
    }
  }

  /**
   * Determine if an error is recoverable via reconnection.
   */
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
    
    // Transient connection errors
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("EPIPE") ||
      message.includes("Client not connected") ||
      message.includes("Connection closed")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private async attemptReconnection(): Promise<void> {
    if (this.state === "reconnecting") {
      throw new Error("Reconnection already in progress");
    }

    this.state = "reconnecting";
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => {
      this.reconnectTimer = setTimeout(resolve, delay);
    });

    try {
      await this.client.stop();
      await this.client.start();
      this.state = "connected";
      this.reconnectAttempts = 0;
    } catch (error) {
      this.state = "error";
      throw new Error(
        `Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
