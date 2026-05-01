/**
 * OpenCode Runtime Driver
 *
 * Implements AgentRuntimeDriver for OpenCode CLI.
 *
 * This driver communicates with the OpenCode CLI via stdio JSON-RPC.
 * The implementation is a skeleton that needs to be completed once
 * OpenCode's stdio protocol is documented or discovered.
 *
 * @module drivers/opencode/driver
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { trace, SpanStatusCode } from '../../runtime/otel-api.js';
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
 * OpenCode JSON-RPC message types.
 * These are guesses based on common patterns for CLI tools.
 */
interface OpenCodeRPCRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface OpenCodeRPCResponse {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface OpenCodeSessionInfo {
  sessionId: string;
  // Add other session fields as OpenCode protocol is discovered
}

/**
 * Adapts an OpenCode CLI process to our AgentSession interface.
 */
class OpenCodeSessionAdapter implements AgentSession {
  private _sessionId: string;
  private readonly process: ChildProcess;
  private readonly eventEmitter = new EventEmitter();
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  constructor(sessionId: string, process: ChildProcess) {
    this._sessionId = sessionId;
    this.process = process;

    // Listen to stdout for responses
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleResponse(data.toString());
    });

    // Listen to stderr for events/errors
    this.process.stderr?.on('data', (data: Buffer) => {
      this.handleEvent(data.toString());
    });

    this.process.on('error', (err) => {
      this.eventEmitter.emit('error', { type: 'error', error: err.message });
    });

    this.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.eventEmitter.emit('error', { type: 'error', error: `Process exited with code ${code}` });
      }
      this.eventEmitter.emit('idle', { type: 'idle' });
    });
  }

  private handleResponse(data: string): void {
    // Parse JSON-RPC responses
    for (const line of data.split('\n').filter(Boolean)) {
      try {
        const response = JSON.parse(line) as OpenCodeRPCResponse;
        if (response.id) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
            this.pendingRequests.delete(response.id);
          }
        }
      } catch {
        // Ignore parse errors for non-JSON lines
      }
    }
  }

  private handleEvent(data: string): void {
    // Parse event lines (prefixed with "event:" or similar)
    for (const line of data.split('\n').filter(Boolean)) {
      try {
        // Events might be prefixed - adjust as needed based on OpenCode protocol
        const eventData = line.startsWith('event:') ? JSON.parse(line.slice(6)) : JSON.parse(line);
        if (eventData.type) {
          this.eventEmitter.emit(eventData.type, eventData);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private sendRPC(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const request: OpenCodeRPCRequest = { id, method, params };
      this.pendingRequests.set(id, { resolve, reject });

      this.process.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 60000);
    });
  }

  get sessionId(): string {
    return this._sessionId;
  }

  async sendMessage(options: DriverMessageOptions): Promise<void> {
    await this.sendRPC('session.send', {
      sessionId: this.sessionId,
      prompt: options.prompt,
      attachments: options.attachments,
    });
  }

  async sendAndWait(options: DriverMessageOptions, timeout?: number): Promise<unknown> {
    const response = await this.sendRPC('session.sendAndWait', {
      sessionId: this.sessionId,
      prompt: options.prompt,
      attachments: options.attachments,
      timeout,
    });
    return response;
  }

  async abort(): Promise<void> {
    await this.sendRPC('session.abort', { sessionId: this.sessionId });
  }

  async getMessages(): Promise<unknown[]> {
    const response = await this.sendRPC('session.getMessages', {
      sessionId: this.sessionId,
    });
    return response as unknown[];
  }

  on(eventType: string, handler: DriverSessionEventHandler): void {
    this.eventEmitter.on(eventType, handler);
  }

  off(eventType: string, handler: DriverSessionEventHandler): void {
    this.eventEmitter.off(eventType, handler);
  }

  async close(): Promise<void> {
    await this.sendRPC('session.close', { sessionId: this.sessionId });
    this.process.kill();
    this.pendingRequests.clear();
  }
}

/**
 * OpenCode Runtime Driver
 *
 * Implements AgentRuntimeDriver for OpenCode CLI.
 *
 * Note: This is a skeleton implementation. The actual OpenCode protocol
 * needs to be discovered or documented to complete the implementation.
 *
 * OpenCode CLI is expected to communicate via stdio JSON-RPC, similar to
 * other CLI tools like GitHub Copilot and Anthropic's Claude CLI.
 */
export class OpenCodeDriver implements AgentRuntimeDriver {
  readonly name = 'opencode';

  private state: DriverConnectionState = 'disconnected';
  private process: ChildProcess | null = null;
  private eventEmitter = new EventEmitter();
  private sessions = new Map<string, AgentSession>();
  private options: DriverOptions;

  constructor(options: DriverOptions = {}) {
    this.options = {
      cliPath: options.cliPath ?? 'opencode',
      cwd: options.cwd ?? process.cwd(),
      useStdio: options.useStdio ?? true,
      logLevel: options.logLevel ?? 'debug',
      autoStart: options.autoStart ?? true,
      autoReconnect: options.autoReconnect ?? true,
      env: (options.env ?? process.env) as Record<string, string>,
      ...options,
    };
  }

  getState(): DriverConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.process !== null;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    const span = tracer.startSpan('squad.driver.opencode.connect');

    this.state = 'connecting';

    try {
      return new Promise<void>((resolve, reject) => {
        const args = ['--stdio', '--json'];
        if (this.options.cliArgs) {
          args.push(...this.options.cliArgs);
        }

        const env = this.options.env as Record<string, string>;
        this.process = spawn(this.options.cliPath!, args, {
          cwd: this.options.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.on('error', (err) => {
          this.state = 'error';
          span.recordException(err);
          reject(new DriverConnectionError(this.name, `Failed to start OpenCode: ${err.message}`));
        });

        this.process.on('exit', (code) => {
          if (code !== 0) {
            this.state = 'error';
          } else {
            this.state = 'disconnected';
          }
          this.eventEmitter.emit('disconnected');
        });

        // Wait for ready signal
        this.process.stdout?.on('data', (data: Buffer) => {
          const output = data.toString();
          // OpenCode might send a "ready" message or similar
          if (output.includes('ready') || output.includes('listening')) {
            this.state = 'connected';
            span.setAttribute('connection.transport', 'stdio');
            resolve();
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.state !== 'connected') {
            this.process?.kill();
            reject(new DriverConnectionError(this.name, 'Connection timeout'));
          }
        }, 10000);
      });
    } catch (err) {
      this.state = 'error';
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async disconnect(): Promise<Error[]> {
    const span = tracer.startSpan('squad.driver.opencode.disconnect');

    try {
      // Close all sessions
      for (const session of this.sessions.values()) {
        try {
          await session.close();
        } catch {
          // Ignore session close errors
        }
      }
      this.sessions.clear();

      // Kill the process
      if (this.process) {
        this.process.kill();
        this.process = null;
      }

      this.state = 'disconnected';
      return [];
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      return [err instanceof Error ? err : new Error(String(err))];
    } finally {
      span.end();
    }
  }

  async forceDisconnect(): Promise<void> {
    this.process?.kill('SIGKILL');
    this.process = null;
    this.sessions.clear();
    this.state = 'disconnected';
  }

  async createSession(config?: DriverSessionConfig): Promise<AgentSession> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected. Call connect() first.');
    }

    const span = tracer.startSpan('squad.driver.opencode.session.create');

    try {
      // Send session creation request
      // This is a placeholder - actual protocol needs to be discovered
      const response = await this.sendRPC('session.create', {
        model: config?.model,
        reasoningEffort: config?.reasoningEffort,
      });

      const sessionInfo = response as OpenCodeSessionInfo;
      const session = new OpenCodeSessionAdapter(sessionInfo.sessionId, this.process!);
      this.sessions.set(sessionInfo.sessionId, session);

      span.setAttribute('session.id', sessionInfo.sessionId);
      return session;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async resumeSession(sessionId: string, config?: DriverSessionConfig): Promise<AgentSession> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected. Call connect() first.');
    }

    // Check if we already have this session
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const span = tracer.startSpan('squad.driver.opencode.session.resume');
    span.setAttribute('session.id', sessionId);

    try {
      const response = await this.sendRPC('session.resume', { sessionId });
      const sessionInfo = response as OpenCodeSessionInfo;
      const session = new OpenCodeSessionAdapter(sessionInfo.sessionId, this.process!);
      this.sessions.set(sessionInfo.sessionId, session);
      return session;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async listSessions(): Promise<DriverSessionMetadata[]> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('session.list');
      const sessions = response as OpenCodeSessionInfo[];
      return sessions.map((s) => ({
        sessionId: s.sessionId,
        startTime: new Date(),
        modifiedTime: new Date(),
        isRemote: false,
      }));
    } catch (err) {
      throw new DriverSessionError(this.name, `Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      await this.sendRPC('session.delete', { sessionId });
      this.sessions.delete(sessionId);
    } catch (err) {
      throw new DriverSessionError(this.name, `Failed to delete session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getLastSessionId(): Promise<string | undefined> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('session.getLastSessionId');
      return response as string | undefined;
    } catch (err) {
      throw new DriverSessionError(this.name, `Failed to get last session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('ping', { message });
      return response as { message: string; timestamp: number; protocolVersion?: number };
    } catch (err) {
      throw new DriverSessionError(this.name, `Ping failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getStatus(): Promise<DriverStatus> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('status');
      return response as DriverStatus;
    } catch (err) {
      throw new DriverSessionError(this.name, `Failed to get status: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getAuthStatus(): Promise<DriverAuthStatus> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('auth.status');
      return response as DriverAuthStatus;
    } catch (err) {
      // OpenCode might not require auth - return a default status
      return {
        isAuthenticated: true,
        authType: 'cli',
        statusMessage: 'OpenCode CLI authentication',
      };
    }
  }

  async listModels(): Promise<DriverModelInfo[]> {
    if (!this.isConnected()) {
      throw new DriverSessionError(this.name, 'Client not connected');
    }

    try {
      const response = await this.sendRPC('models.list');
      return response as DriverModelInfo[];
    } catch (err) {
      throw new DriverSessionError(this.name, `Failed to list models: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async sendMessage(session: AgentSession, options: DriverMessageOptions): Promise<void> {
    const span = tracer.startSpan('squad.driver.opencode.session.message');
    span.setAttribute('session.id', session.sessionId);
    span.setAttribute('prompt.length', options.prompt.length);

    try {
      await session.sendMessage(options);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const span = tracer.startSpan('squad.driver.opencode.session.close');
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

  private sendRPC(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new DriverConnectionError(this.name, 'Process not connected'));
        return;
      }

      const id = Math.random().toString(36).slice(2);
      const request = { id, method, params };

      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 60000);

      const pendingRequests = new Map<string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
      }>();

      pendingRequests.set(id, { resolve, reject });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      this.process.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n').filter(Boolean)) {
          try {
            const response = JSON.parse(line) as OpenCodeRPCResponse;
            if (response.id === id) {
              clearTimeout(timeout);
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result);
              }
              pendingRequests.delete(id);
            }
          } catch {
            // Ignore parse errors
          }
        }
      });
    });
  }
}

/**
 * Create an OpenCode driver instance.
 */
export function createOpenCodeDriver(options?: DriverOptions): AgentRuntimeDriver {
  return new OpenCodeDriver(options);
}

/**
 * Register the OpenCode driver with the global registry.
 */
export async function registerOpenCodeDriver(
  registry?: { registerDriverFactory: (name: string, factory: () => Promise<AgentRuntimeDriver>) => void },
  options?: DriverOptions
): Promise<AgentRuntimeDriver> {
  const driver = new OpenCodeDriver(options);
  if (registry) {
    registry.registerDriverFactory('opencode', async () => driver);
  }
  return driver;
}
