/**
 * Claude Code Runtime Provider
 *
 * Implements RuntimeProvider by spawning `claude` CLI processes.
 * Each session is a long-running `claude --json` subprocess with
 * stdin/stdout streaming for message exchange.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants as fsConstants } from 'node:fs';
import { createInterface } from 'node:readline';
import type {
  RuntimeProvider,
  RuntimeProviderEvent,
  RuntimeProviderName,
  RuntimeProviderSession,
  RuntimeMessage,
  RuntimeStartOptions,
  RuntimeErrorPayload,
} from '../provider.js';

/** Maximum line length (bytes) accepted from claude stdout. Lines longer than
 *  this are dropped to protect against memory exhaustion from binary noise. */
const MAX_LINE_LENGTH = 1_048_576; // 1 MiB

/** Default session-idle timeout in milliseconds (30 minutes). */
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface ClaudeSession {
  id: string;
  process: ChildProcess;
  model?: string;
  handlers: Set<(event: RuntimeProviderEvent) => void>;
  started: boolean;
  /** True once shutdownSession has been called for this session. */
  shuttingDown: boolean;
  /** Idle-timeout handle — reset each time an event is received. */
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

export class ClaudeCodeRuntimeProvider implements RuntimeProvider {
  readonly name: RuntimeProviderName = 'claude-code';
  private sessions = new Map<string, ClaudeSession>();
  private claudeBin: string;
  private sessionTimeoutMs: number;

  constructor(options?: { claudeBin?: string; sessionTimeout?: number }) {
    this.claudeBin = options?.claudeBin ?? 'claude';
    this.sessionTimeoutMs = options?.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT_MS;
  }

  /**
   * Verify that the claude binary exists and is executable before trying to
   * spawn it.  Throws immediately with a clear message when it is missing or
   * not executable so callers don't have to wait for a process-spawn timeout.
   */
  private assertBinaryAccessible(): void {
    try {
      accessSync(this.claudeBin, fsConstants.X_OK);
    } catch {
      throw new Error(
        `Claude binary not found or not executable: "${this.claudeBin}". ` +
          'Install the Claude CLI and make sure it is on your PATH.',
      );
    }
  }

  async startSession(options?: RuntimeStartOptions): Promise<RuntimeProviderSession> {
    // Fail fast if the binary isn't usable — avoids silent 2-second timeouts.
    this.assertBinaryAccessible();

    const sessionId = options?.sessionId ?? randomUUID();

    const args = ['--json', '--verbose'];
    if (options?.model) args.push('--model', options.model);
    if (options?.systemPrompt) args.push('--system-prompt', options.systemPrompt);

    const proc = spawn(this.claudeBin, args, {
      cwd: options?.workingDirectory ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const session: ClaudeSession = {
      id: sessionId,
      process: proc,
      model: options?.model,
      handlers: new Set(),
      started: false,
      shuttingDown: false,
      timeoutHandle: null,
    };

    this.sessions.set(sessionId, session);

    // Start the idle-timeout watchdog.
    this.resetSessionTimeout(session);

    // Wire up stdout JSON line parsing
    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        this.handleOutputLine(sessionId, line);
      });
    }

    // Wire up stderr for error events
    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line) => {
        const errorPayload: RuntimeErrorPayload = {
          message: line,
          code: 'STDERR',
          retryable: false,
        };
        this.emit(sessionId, {
          type: 'error',
          sessionId,
          timestamp: Date.now(),
          payload: errorPayload,
        });
      });
    }

    // Handle process exit
    proc.on('exit', (code) => {
      this.emit(sessionId, {
        type: 'session.ended',
        sessionId,
        timestamp: Date.now(),
        payload: { exitCode: code },
      });
      this.sessions.delete(sessionId);
    });

    // Wait briefly for process to initialize
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 2000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        reject(new Error(`Failed to start claude process: ${err.message}`));
      });

      // If we get any stdout, it's alive
      if (proc.stdout) {
        proc.stdout.once('data', () => {
          clearTimeout(timeout);
          resolve();
        });
      }
    });

    session.started = true;

    this.emit(sessionId, {
      type: 'session.started',
      sessionId,
      timestamp: Date.now(),
      payload: { model: options?.model },
    });

    return {
      id: sessionId,
      provider: 'claude-code',
      model: options?.model,
    };
  }

  async sendMessage(sessionId: string, message: RuntimeMessage): Promise<void> {
    const session = this.getSession(sessionId);

    // Detect subprocess that has already exited but whose session entry
    // hasn't been cleaned up yet (e.g. between 'exit' emission and handler).
    if (session.process.exitCode !== null || session.process.killed) {
      throw new Error(
        `Session ${sessionId} subprocess has already exited (exitCode=${session.process.exitCode}). ` +
          'Call startSession to create a new session.',
      );
    }

    if (!session.process.stdin?.writable) {
      throw new Error(`Session ${sessionId} stdin is not writable`);
    }

    // Claude CLI in --json mode accepts JSON lines on stdin
    const payload = JSON.stringify({
      role: message.role,
      content: message.content,
    });

    session.process.stdin.write(payload + '\n');
  }

  async onEvent(
    sessionId: string,
    handler: (event: RuntimeProviderEvent) => void,
  ): Promise<() => void> {
    const session = this.getSession(sessionId);
    session.handlers.add(handler);

    return () => {
      session.handlers.delete(handler);
    };
  }

  async shutdownSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    // No-op if session doesn't exist or is already being shut down.
    if (!session) return;
    if (session.shuttingDown) return;
    session.shuttingDown = true;

    // Cancel the idle-timeout watchdog.
    if (session.timeoutHandle !== null) {
      clearTimeout(session.timeoutHandle);
      session.timeoutHandle = null;
    }

    // Try graceful shutdown first
    if (session.process.stdin?.writable) {
      session.process.stdin.end();
    }

    // Wait up to 5s for graceful exit
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => {
        session.process.on('exit', () => resolve(true));
      }),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 5000);
      }),
    ]);

    if (!exited) {
      session.process.kill('SIGTERM');
      // Give SIGTERM 2s, then SIGKILL
      await new Promise<void>((resolve) => {
        const kill = setTimeout(() => {
          session.process.kill('SIGKILL');
          resolve();
        }, 2000);
        session.process.on('exit', () => {
          clearTimeout(kill);
          resolve();
        });
      });
    }

    session.handlers.clear();
    this.sessions.delete(sessionId);
  }

  async listModels(): Promise<string[]> {
    // Claude Code supports these model families
    return [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-haiku-4-5',
    ];
  }

  /**
   * Returns true when the session exists in the registry AND the subprocess
   * is still running (not killed and not yet exited).
   */
  isSessionAlive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.shuttingDown) return false;
    // exitCode is null while the process is still running
    if (session.process.exitCode !== null) return false;
    if (session.process.killed) return false;
    return true;
  }

  // ── Internal helpers ────────────────────────────────

  private getSession(sessionId: string): ClaudeSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No active session with id: ${sessionId}`);
    }
    return session;
  }

  private emit(sessionId: string, event: RuntimeProviderEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Activity received — reset the idle-timeout watchdog (skip for the
    // synthetic timeout-error event itself to avoid an infinite loop).
    if (event.type !== 'error' || (event.payload as RuntimeErrorPayload | undefined)?.['_timeout'] !== true) {
      this.resetSessionTimeout(session);
    }

    for (const handler of session.handlers) {
      try {
        handler(event);
      } catch {
        // Don't let a bad handler crash the provider
      }
    }
  }

  /**
   * (Re-)arm the idle-timeout watchdog for a session.  Called when the
   * session is created and after every received event.
   */
  private resetSessionTimeout(session: ClaudeSession): void {
    // Don't re-arm if shutdown is already in progress.
    if (session.shuttingDown) return;

    if (session.timeoutHandle !== null) {
      clearTimeout(session.timeoutHandle);
    }

    session.timeoutHandle = setTimeout(() => {
      // Emit the timeout error, then tear the session down.
      const timeoutPayload: RuntimeErrorPayload = {
        _timeout: true,
        message: `Session ${session.id} timed out after ${this.sessionTimeoutMs}ms of inactivity and has been shut down.`,
        code: 'TIMEOUT',
        retryable: false,
      };
      this.emit(session.id, {
        type: 'error',
        sessionId: session.id,
        timestamp: Date.now(),
        payload: timeoutPayload,
      });
      void this.shutdownSession(session.id);
    }, this.sessionTimeoutMs);

    // Allow the Node.js process to exit even if the timer is still running.
    if (typeof session.timeoutHandle === 'object' && session.timeoutHandle !== null) {
      (session.timeoutHandle as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
    }
  }

  private handleOutputLine(sessionId: string, line: string): void {
    // Guard: drop lines that are suspiciously long (binary noise / memory risk).
    if (line.length > MAX_LINE_LENGTH) {
      // Emit a non-fatal warning and skip.
      const oversizePayload: RuntimeErrorPayload = {
        message: `Dropped oversized output line (${line.length} bytes) from session ${sessionId}.`,
        code: 'OVERSIZE_LINE',
        retryable: false,
      };
      this.emit(sessionId, {
        type: 'error',
        sessionId,
        timestamp: Date.now(),
        payload: oversizePayload,
      });
      return;
    }

    // Guard: strip non-printable / non-UTF-8 garbage so JSON.parse doesn't
    // receive invalid unicode sequences that could cause internal errors in
    // some runtimes.  We replace lone surrogates and C0/C1 control chars
    // (except the common whitespace ones) with the replacement character.
    // eslint-disable-next-line no-control-regex
    const sanitized = line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '\uFFFD');

    const trimmed = sanitized.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const event = this.mapClaudeEvent(sessionId, data);
      if (event) {
        this.emit(sessionId, event);
      }
    } catch {
      // Non-JSON or partial-JSON output — treat as a plain-text message delta.
      this.emit(sessionId, {
        type: 'message.delta',
        sessionId,
        timestamp: Date.now(),
        payload: { content: trimmed },
      });
    }
  }

  private mapClaudeEvent(
    sessionId: string,
    data: Record<string, unknown>,
  ): RuntimeProviderEvent | null {
    const timestamp = Date.now();

    // Map Claude CLI JSON events to RuntimeProviderEvent types
    switch (data.type) {
      case 'content_block_delta':
        return {
          type: 'message.delta',
          sessionId,
          timestamp,
          payload: {
            content:
              (data.delta as Record<string, unknown>)?.text ?? '',
          },
        };

      case 'message':
      case 'content_block_stop':
        return {
          type: 'message.complete',
          sessionId,
          timestamp,
          payload: data,
        };

      case 'tool_use':
        return {
          type: 'tool.call',
          sessionId,
          timestamp,
          payload: {
            name: data.name,
            input: data.input,
            id: data.id,
          },
        };

      case 'tool_result':
        return {
          type: 'tool.result',
          sessionId,
          timestamp,
          payload: {
            id: data.tool_use_id,
            content: data.content,
          },
        };

      case 'error': {
        const errorPayload: RuntimeErrorPayload = {
          message: (data.error as string | undefined) ?? (data.message as string | undefined) ?? 'Unknown error',
          code: data.code as string | undefined,
          retryable: data.retryable as boolean | undefined,
        };
        return {
          type: 'error',
          sessionId,
          timestamp,
          payload: errorPayload,
        };
      }

      default:
        // Unknown event type — pass through as-is
        return null;
    }
  }
}
