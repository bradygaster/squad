/**
 * Claude Code Runtime Provider
 *
 * Implements RuntimeProvider by spawning `claude` CLI processes.
 * Each session is a long-running `claude --json` subprocess with
 * stdin/stdout streaming for message exchange.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type {
  RuntimeProvider,
  RuntimeProviderEvent,
  RuntimeProviderName,
  RuntimeProviderSession,
  RuntimeMessage,
  RuntimeStartOptions,
} from '../provider.js';

interface ClaudeSession {
  id: string;
  process: ChildProcess;
  model?: string;
  handlers: Set<(event: RuntimeProviderEvent) => void>;
  started: boolean;
}

export class ClaudeCodeRuntimeProvider implements RuntimeProvider {
  readonly name: RuntimeProviderName = 'claude-code';
  private sessions = new Map<string, ClaudeSession>();
  private claudeBin: string;

  constructor(options?: { claudeBin?: string }) {
    this.claudeBin = options?.claudeBin ?? 'claude';
  }

  async startSession(options?: RuntimeStartOptions): Promise<RuntimeProviderSession> {
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
    };

    this.sessions.set(sessionId, session);

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
        this.emit(sessionId, {
          type: 'error',
          sessionId,
          timestamp: Date.now(),
          payload: { message: line },
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
    if (!session) return;

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
    for (const handler of session.handlers) {
      try {
        handler(event);
      } catch {
        // Don't let a bad handler crash the provider
      }
    }
  }

  private handleOutputLine(sessionId: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);
      const event = this.mapClaudeEvent(sessionId, data);
      if (event) {
        this.emit(sessionId, event);
      }
    } catch {
      // Non-JSON output — treat as message delta
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

      case 'error':
        return {
          type: 'error',
          sessionId,
          timestamp,
          payload: { message: data.error ?? data.message ?? 'Unknown error' },
        };

      default:
        // Unknown event type — pass through as-is
        return null;
    }
  }
}
