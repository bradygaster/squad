/**
 * OpenCode Runtime Driver
 *
 * Implements AgentRuntimeDriver for OpenCode CLI using subprocess mode.
 * Communicates via `opencode run` command which spawns a headless agent
 * process and streams output to stdout.
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
 * OpenCode server connection configuration.
 */
export interface OpenCodeOptions extends DriverOptions {
  /** Request timeout in ms (default: 120000) */
  requestTimeout?: number;
  /** Session inactivity timeout in ms (default: 300000) */
  sessionTimeout?: number;
}

/**
 * Raw output line from opencode subprocess.
 */
interface OpenCodeJsonEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  part?: {
    id?: string;
    messageID?: string;
    type?: string;
    text?: string;
    error?: string;
    time?: {
      start?: number;
      end?: number;
    };
  };
  error?: string;
  reason?: string;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: {
      write?: number;
      read?: number;
    };
  };
  snapshot?: string;
}

/**
 * OpenCode Session implementation.
 * Each session spawns a new `opencode run` subprocess.
 */
class OpenCodeSessionImpl implements AgentSession {
  private readonly _sessionId: string;
  private readonly cliPath: string;
  private readonly cwd: string;
  private readonly env: Record<string, string>;
  private readonly requestTimeout: number;
  private readonly eventEmitter = new EventEmitter();
  private process: ChildProcess | null = null;
  private _isAborted = false;
  private _lastActivity = Date.now();
  private outputBuffer = '';
  private fullOutput = '';
  private openCodeSessionId: string | null = null;
  private _isContinued = false;

  constructor(
    sessionId: string,
    cliPath: string,
    cwd: string,
    env: Record<string, string>,
    requestTimeout: number
  ) {
    this._sessionId = sessionId;
    this.cliPath = cliPath;
    this.cwd = cwd;
    this.env = env;
    this.requestTimeout = requestTimeout;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get isContinued(): boolean {
    return this._isContinued;
  }

  markContinued(): void {
    this._isContinued = true;
  }

  private updateActivity(): void {
    this._lastActivity = Date.now();
  }

  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]+\x07/g, '');
  }

  private parseOutputLine(line: string): { content: string; isError: boolean } {
    const stripped = this.stripAnsiCodes(line);
    const isError = stripped.startsWith('[ERROR]') || stripped.startsWith('Error:');
    return { content: stripped, isError };
  }

  private emitChunk(content: string): void {
    this.eventEmitter.emit('chunk', {
      type: 'chunk',
      content,
      sessionId: this._sessionId,
    });
  }

  private emitError(message: string): void {
    this.eventEmitter.emit('error', {
      type: 'error',
      message,
      sessionId: this._sessionId,
    });
  }

  private spawnProcess(prompt: string, continueSession?: boolean): ChildProcess {
    const args = ['run', '--format', 'json'];

    if (continueSession || this.openCodeSessionId) {
      args.push('--continue');
    }

    args.push('--', prompt);

    const proc = spawn(this.cliPath, args, {
      cwd: this.cwd,
      env: { ...this.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return proc;
  }

  private parseJsonEvent(line: string): OpenCodeJsonEvent | null {
    try {
      const event = JSON.parse(line) as OpenCodeJsonEvent;
      return event;
    } catch {
      return null;
    }
  }

  async sendMessage(options: DriverMessageOptions): Promise<void> {
    this.updateActivity();
    this._isAborted = false;
    this.outputBuffer = '';
    this.fullOutput = '';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._isAborted = true;
        this.process?.kill('SIGTERM');
        reject(new DriverSessionError('opencode', 'Session timed out'));
      }, this.requestTimeout);

      const continueSession = this._isContinued;
      this.process = this.spawnProcess(options.prompt, continueSession);

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.fullOutput += text;
        this.outputBuffer += text;

        const lines = this.outputBuffer.split('\n');
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            const event = this.parseJsonEvent(line);
            if (event) {
              if (event.sessionID && !this.openCodeSessionId) {
                this.openCodeSessionId = event.sessionID;
              }

              if (event.type === 'text' && event.part?.text) {
                this.emitChunk(event.part.text);
              } else if (event.type === 'error' || event.type === 'error_event') {
                this.emitError(event.error || event.part?.text || 'Unknown error');
              } else if (event.type === 'step_finish' && event.reason === 'error') {
                this.emitError(event.part?.error || 'Step finished with error');
              }
            } else {
              const parsed = this.parseOutputLine(line);
              if (parsed.isError) {
                this.emitError(parsed.content);
              }
            }
          }
        }

        this.updateActivity();
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.fullOutput += text;
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(new DriverSessionError('opencode', `Process error: ${err.message}`));
      });

      this.process.on('close', (code) => {
        clearTimeout(timeout);

        if (this.outputBuffer.trim()) {
          const event = this.parseJsonEvent(this.outputBuffer);
          if (event && event.type === 'text' && event.part?.text) {
            this.emitChunk(event.part.text);
          }
        }

        if (this._isAborted) {
          this.eventEmitter.emit('idle', { type: 'idle', sessionId: this._sessionId });
          resolve();
        } else if (code === 0) {
          this.eventEmitter.emit('complete', {
            type: 'complete',
            sessionId: this._sessionId,
            exitCode: code,
          });
          resolve();
        } else {
          reject(new DriverSessionError('opencode', `Process exited with code ${code}`));
        }
      });
    });
  }

  async sendAndWait(options: DriverMessageOptions, _timeoutMs?: number): Promise<unknown> {
    await this.sendMessage(options);
    return { message: this.fullOutput, sessionId: this._sessionId };
  }

  async abort(): Promise<void> {
    this._isAborted = true;
    this.process?.kill('SIGTERM');
    this.eventEmitter.emit('idle', { type: 'idle', sessionId: this._sessionId });
  }

  async getMessages(): Promise<unknown[]> {
    return [
      { role: 'assistant', content: this.fullOutput },
    ];
  }

  on(eventType: string, handler: DriverSessionEventHandler): void {
    this.eventEmitter.on(eventType, handler);
  }

  off(eventType: string, handler: DriverSessionEventHandler): void {
    this.eventEmitter.off(eventType, handler);
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.eventEmitter.emit('closed', { type: 'closed', sessionId: this._sessionId });
  }
}

/**
 * OpenCode Runtime Driver
 *
 * Implements AgentRuntimeDriver for OpenCode CLI using headless subprocess mode.
 * Each session spawns a new `opencode run` process.
 */
export class OpenCodeDriver implements AgentRuntimeDriver {
  readonly name = 'opencode';
  readonly displayName = 'OpenCode';

  private state: DriverConnectionState = 'disconnected';
  private eventEmitter = new EventEmitter();
  private sessions = new Map<string, OpenCodeSessionImpl>();
  private options: {
    cliPath: string;
    cliArgs: string[];
    cwd: string;
    useStdio: boolean;
    logLevel: 'error' | 'warning' | 'info' | 'debug' | 'all' | 'none';
    autoStart: boolean;
    autoReconnect: boolean;
    env: Record<string, string>;
    requestTimeout: number;
    sessionTimeout: number;
  };
  private sessionCounter = 0;

  constructor(userOptions: OpenCodeOptions = {}) {
    this.options = {
      cliPath: userOptions.cliPath ?? 'opencode',
      cliArgs: userOptions.cliArgs ?? ['run'],
      cwd: userOptions.cwd ?? process.cwd(),
      useStdio: userOptions.useStdio ?? false,
      logLevel: userOptions.logLevel ?? 'info',
      autoStart: userOptions.autoStart ?? true,
      autoReconnect: userOptions.autoReconnect ?? true,
      env: userOptions.env ?? (process.env as Record<string, string>),
      requestTimeout: userOptions.requestTimeout ?? 120000,
      sessionTimeout: userOptions.sessionTimeout ?? 300000,
    };
  }

  getState(): DriverConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;

    const span = tracer.startSpan('squad.driver.opencode.connect');

    try {
      this.state = 'connecting';

      const proc = spawn(this.options.cliPath, ['--version'], {
        cwd: this.options.cwd,
        env: this.options.env as Record<string, string>,
        stdio: 'pipe',
      });

      await new Promise<void>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`opencode --version exited with code ${code}`));
        });
        setTimeout(() => {
          proc.kill();
          reject(new Error('Timeout checking opencode version'));
        }, 5000);
      });

      this.state = 'connected';
      span.setAttribute('connection.transport', 'subprocess');
    } catch (err) {
      this.state = 'error';
      const message = err instanceof Error ? err.message : String(err);
      span.recordException(err as Error);
      throw new DriverConnectionError(this.name, `Failed to connect to OpenCode: ${message}`);
    } finally {
      span.end();
    }
  }

  async disconnect(): Promise<Error[]> {
    const span = tracer.startSpan('squad.driver.opencode.disconnect');
    const errors: Error[] = [];

    try {
      for (const session of this.sessions.values()) {
        try {
          await session.close();
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
      this.sessions.clear();
      this.state = 'disconnected';
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    } finally {
      span.end();
    }

    return errors;
  }

  async forceDisconnect(): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        await session.close();
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();
    this.state = 'disconnected';
  }

  async createSession(config?: DriverSessionConfig): Promise<AgentSession> {
    const span = tracer.startSpan('squad.driver.opencode.session.create');

    try {
      const sessionId = `oc-${Date.now()}-${++this.sessionCounter}`;
      const session = new OpenCodeSessionImpl(
        sessionId,
        this.options.cliPath,
        this.options.cwd,
        this.options.env,
        this.options.requestTimeout
      );

      this.sessions.set(sessionId, session);
      span.setAttribute('session.id', sessionId);

      if (this.state !== 'connected') {
        await this.connect();
      }

      return session;
    } finally {
      span.end();
    }
  }

  async resumeSession(sessionId: string, config?: DriverSessionConfig): Promise<AgentSession> {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      return session;
    }

    const span = tracer.startSpan('squad.driver.opencode.session.resume');
    span.setAttribute('session.id', sessionId);

    try {
      if (this.state !== 'connected') {
        await this.connect();
      }

      const sessionId = `oc-${Date.now()}-${++this.sessionCounter}`;
      const session = new OpenCodeSessionImpl(
        sessionId,
        this.options.cliPath,
        this.options.cwd,
        this.options.env,
        this.options.requestTimeout
      );

      session.markContinued();

      this.sessions.set(sessionId, session);
      span.setAttribute('session.id', sessionId);

      return session;
    } finally {
      span.end();
    }
  }

  async listSessions(): Promise<DriverSessionMetadata[]> {
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      startTime: new Date(),
      modifiedTime: new Date(),
      isRemote: false,
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  async getLastSessionId(): Promise<string | undefined> {
    const sessions = Array.from(this.sessions.keys());
    return sessions[sessions.length - 1];
  }

  async ping(): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    return {
      message: 'OpenCode driver ready',
      timestamp: Date.now(),
      protocolVersion: 1,
    };
  }

  async getStatus(): Promise<DriverStatus> {
    return {
      version: '1.14.31',
    };
  }

  async getAuthStatus(): Promise<DriverAuthStatus> {
    return {
      isAuthenticated: true,
      authType: 'cli' as const,
      statusMessage: 'OpenCode CLI authentication',
    };
  }

  async listModels(): Promise<DriverModelInfo[]> {
    return [
      {
        id: 'auto',
        name: 'Auto-select',
        capabilities: {
          supports: { vision: true, reasoningEffort: true },
          limits: { max_context_window_tokens: 200000 },
        },
      },
    ];
  }

  async sendMessage(session: AgentSession, options: DriverMessageOptions): Promise<void> {
    const span = tracer.startSpan('squad.driver.opencode.session.message');
    span.setAttribute('session.id', session.sessionId);
    span.setAttribute('prompt.length', options.prompt.length);

    try {
      await session.sendMessage(options);
    } catch (err) {
      span.recordException(err as Error);
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
    } finally {
      span.end();
    }
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, handler);
  }
}

/**
 * Create an OpenCode driver instance.
 */
export function createOpenCodeDriver(options?: OpenCodeOptions): AgentRuntimeDriver {
  return new OpenCodeDriver(options);
}

/**
 * Register the OpenCode driver with the runtime registry.
 */
export async function registerOpenCodeDriver(
  registry?: { registerDriverFactory: (name: string, factory: () => Promise<AgentRuntimeDriver>) => void },
  options?: OpenCodeOptions
): Promise<AgentRuntimeDriver> {
  const driver = new OpenCodeDriver(options);
  if (registry) {
    registry.registerDriverFactory('opencode', async () => driver);
  }
  return driver;
}