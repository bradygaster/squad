/**
 * Runtime Provider abstraction
 *
 * This interface decouples Squad orchestration from a specific runtime client
 * implementation (Copilot today, Claude Code next).
 */

export type RuntimeProviderName = 'copilot' | 'claude-code';

export interface RuntimeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RuntimeProviderSession {
  id: string;
  provider: RuntimeProviderName;
  model?: string;
}

/**
 * Normalised error payload emitted on `error` events by all providers.
 * Consumers can treat this as the canonical shape; any extra fields from
 * the underlying transport are preserved via the index signature.
 */
export interface RuntimeErrorPayload {
  /** Human-readable description of what went wrong. */
  message: string;
  /** Machine-readable error code (e.g. 'TIMEOUT', 'SUBPROCESS_EXIT'). */
  code?: string;
  /**
   * Whether the error is transient and the caller may reasonably retry.
   * `undefined` means the provider cannot determine retryability.
   */
  retryable?: boolean;
  /** Allow providers to attach additional diagnostic fields. */
  [key: string]: unknown;
}

export interface RuntimeProviderEvent {
  type:
    | 'message.delta'
    | 'message.complete'
    | 'tool.call'
    | 'tool.result'
    | 'error'
    | 'session.started'
    | 'session.ended';
  sessionId: string;
  timestamp: number;
  payload?: unknown;
}

export interface RuntimeStartOptions {
  sessionId?: string;
  model?: string;
  workingDirectory?: string;
  systemPrompt?: string;
}

export interface RuntimeProvider {
  readonly name: RuntimeProviderName;

  startSession(options?: RuntimeStartOptions): Promise<RuntimeProviderSession>;
  sendMessage(sessionId: string, message: RuntimeMessage): Promise<void>;
  onEvent(sessionId: string, handler: (event: RuntimeProviderEvent) => void): Promise<() => void>;
  shutdownSession(sessionId: string): Promise<void>;

  listModels?(): Promise<string[]>;

  /**
   * Check whether a session is still alive.
   *
   * Returns `true` when the session exists in the provider's registry AND the
   * underlying connection or subprocess is in a usable state.  Returns `false`
   * when the session is unknown, has been shut down, or the transport has died.
   *
   * Callers can use this as a lightweight liveness probe before sending a
   * message, without having to catch the `No active session` error.
   */
  isSessionAlive(sessionId: string): boolean;
}
