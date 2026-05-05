/**
 * Agent Runtime Driver Interface
 *
 * This module defines the abstraction layer for AI coding agent runtimes.
 * Implement this interface to add support for new runtimes (OpenCode, Claude Code, Cursor, etc.)
 *
 * @module runtime/driver
 */

import type { EventBus } from './event-bus.js';
import type { UsageEvent } from './streaming.js';

// ============================================================================
// Driver Types
// ============================================================================

/**
 * Connection state for a runtime driver.
 */
export type DriverConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Authentication status for a runtime.
 */
export interface DriverAuthStatus {
  isAuthenticated: boolean;
  authType?: 'user' | 'env' | 'cli' | 'hmac' | 'api-key' | 'token';
  host?: string;
  login?: string;
  statusMessage?: string;
}

/**
 * Runtime status information.
 */
export interface DriverStatus {
  version: string;
  protocolVersion?: number;
}

/**
 * Model information from a runtime.
 */
export interface DriverModelInfo {
  id: string;
  name: string;
  capabilities: {
    supports: {
      vision: boolean;
      reasoningEffort: boolean;
    };
    limits: {
      max_prompt_tokens?: number;
      max_context_window_tokens: number;
      vision?: {
        supported_media_types: string[];
        max_prompt_images: number;
        max_prompt_image_size: number;
      };
    };
  };
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

/**
 * Session metadata returned from list operations.
 */
export interface DriverSessionMetadata {
  sessionId: string;
  startTime: Date;
  modifiedTime: Date;
  summary?: string;
  isRemote: boolean;
  context?: Record<string, unknown>;
}

/**
 * Message options for sending a message to a session.
 */
export interface DriverMessageOptions {
  prompt: string;
  attachments?: Array<
    | { type: 'file'; path: string; displayName?: string }
    | { type: 'directory'; path: string; displayName?: string }
    | {
        type: 'selection';
        filePath: string;
        displayName: string;
        selection?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        text?: string;
      }
  >;
  mode?: 'enqueue' | 'immediate';
}

// ============================================================================
// Agent Session Interface
// ============================================================================

/**
 * Session event handler function.
 */
export type DriverSessionEventHandler = (event: DriverSessionEvent) => void;

/**
 * Session event payload.
 */
export interface DriverSessionEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Agent session interface.
 * Represents an active agent session with lifecycle management.
 */
export interface AgentSession {
  readonly sessionId: string;

  /**
   * Send a message to the session.
   */
  sendMessage(options: DriverMessageOptions): Promise<void>;

  /**
   * Send a message and wait for the session to become idle.
   */
  sendAndWait?(options: DriverMessageOptions, timeout?: number): Promise<unknown>;

  /**
   * Abort the current in-flight agent work.
   */
  abort?(): Promise<void>;

  /**
   * Retrieve all messages from this session.
   */
  getMessages?(): Promise<unknown[]>;

  /**
   * Register an event handler for session events.
   */
  on(eventType: string, handler: DriverSessionEventHandler): void;

  /**
   * Remove an event handler.
   */
  off(eventType: string, handler: DriverSessionEventHandler): void;

  /**
   * End the session and clean up resources.
   */
  close(): Promise<void>;
}

// ============================================================================
// Driver Interface
// ============================================================================

/**
 * Options for creating a runtime driver.
 */
export interface DriverOptions {
  /**
   * Path to the runtime CLI executable.
   * Defaults to bundled CLI from the runtime package.
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
   */
  eventBus?: EventBus;

  /**
   * Environment variables to pass to the CLI process.
   * @default process.env
   */
  env?: Record<string, string>;

  /**
   * Authentication token for the runtime.
   */
  authToken?: string;

  /**
   * Use logged-in user credentials for authentication.
   * @default true
   */
  useLoggedInUser?: boolean;

  /**
   * Maximum number of reconnection attempts before giving up.
   * @default 3
   */
  maxReconnectAttempts?: number;

  /**
   * Initial delay in milliseconds before first reconnection attempt.
   * @default 1000
   */
  reconnectDelayMs?: number;
}

/**
 * Agent Runtime Driver Interface
 *
 * Implement this interface to create a driver for a new AI coding agent runtime.
 * The driver manages the connection lifecycle, session management, and
 * communication with the runtime CLI.
 */
export interface AgentRuntimeDriver {
  /**
   * Human-readable name of the runtime.
   * @example "copilot" | "opencode" | "claude-code" | "cursor"
   */
  readonly name: string;

  /**
   * Get the current connection state.
   */
  getState(): DriverConnectionState;

  /**
   * Check if the driver is connected.
   */
  isConnected(): boolean;

  /**
   * Establish connection to the runtime CLI server.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the runtime CLI server.
   */
  disconnect(): Promise<Error[]>;

  /**
   * Force disconnect without graceful cleanup.
   * Use only when disconnect() fails or hangs.
   */
  forceDisconnect(): Promise<void>;

  /**
   * Create a new agent session.
   */
  createSession(config?: DriverSessionConfig): Promise<AgentSession>;

  /**
   * Resume an existing session by ID.
   */
  resumeSession(sessionId: string, config?: DriverSessionConfig): Promise<AgentSession>;

  /**
   * List all available sessions.
   */
  listSessions(): Promise<DriverSessionMetadata[]>;

  /**
   * Delete a session by ID.
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Get the ID of the last updated session.
   */
  getLastSessionId(): Promise<string | undefined>;

  /**
   * Send a ping to verify connectivity.
   */
  ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }>;

  /**
   * Get CLI status information.
   */
  getStatus(): Promise<DriverStatus>;

  /**
   * Get authentication status.
   */
  getAuthStatus(): Promise<DriverAuthStatus>;

  /**
   * List available models.
   */
  listModels(): Promise<DriverModelInfo[]>;

  /**
   * Send a message to a session.
   */
  sendMessage(session: AgentSession, options: DriverMessageOptions): Promise<void>;

  /**
   * Close a session by ID.
   */
  closeSession(sessionId: string): Promise<void>;
}

/**
 * Configuration for creating a driver session.
 * Driver-specific options are passed through the options field.
 */
export interface DriverSessionConfig {
  sessionId?: string;
  model?: string;
  reasoningEffort?: string;
  tools?: unknown[];
  systemMessage?: unknown;
  availableTools?: string[];
  excludedTools?: string[];
  customAgents?: unknown[];
  workingDirectory?: string;
  streaming?: boolean;
  mcpServers?: Record<string, unknown>;
  skillDirectories?: string[];
  disabledSkills?: string[];
  options?: Record<string, unknown>;
}

// ============================================================================
// Driver Errors
// ============================================================================

/**
 * Error thrown when a driver operation fails.
 */
export class DriverError extends Error {
  constructor(
    message: string,
    public readonly driverName: string,
    public readonly operation: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'DriverError';
  }
}

/**
 * Error thrown when a requested runtime is not registered.
 */
export class UnknownRuntimeError extends Error {
  constructor(public readonly runtimeName: string) {
    super(`Unknown runtime: ${runtimeName}`);
    this.name = 'UnknownRuntimeError';
  }
}

/**
 * Error thrown when a driver fails to connect.
 */
export class DriverConnectionError extends DriverError {
  constructor(driverName: string, message: string) {
    super(message, driverName, 'connect', true);
    this.name = 'DriverConnectionError';
  }
}

/**
 * Error thrown when a session operation fails.
 */
export class DriverSessionError extends DriverError {
  constructor(driverName: string, message: string, recoverable: boolean = true) {
    super(message, driverName, 'session', recoverable);
    this.name = 'DriverSessionError';
  }
}
