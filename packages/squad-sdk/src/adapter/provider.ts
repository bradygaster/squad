/**
 * Squad Provider Interface
 *
 * Defines the contract that all LLM backend providers must implement.
 * Providers handle connection lifecycle and session creation; the
 * SquadClient delegates to the active provider.
 *
 * @module adapter/provider
 */

import type {
  SquadSessionConfig,
  SquadSession,
  SquadSessionMetadata,
  SquadGetAuthStatusResponse,
  SquadGetStatusResponse,
  SquadModelInfo,
  SquadClientEventType,
  SquadClientEvent,
  SquadClientEventHandler,
} from './types.js';

/**
 * Supported provider backends.
 *
 * - copilot: GitHub Copilot SDK (default, full feature set)
 * - anthropic: Claude via Anthropic Messages API
 * - anthropic-vertex: Claude via Google Cloud Vertex AI
 * - google: Gemini via Google AI API
 * - google-vertex: Gemini via Google Cloud Vertex AI
 */
export type ProviderType =
  | 'copilot'
  | 'anthropic'
  | 'anthropic-vertex'
  | 'google'
  | 'google-vertex';

/**
 * Provider interface that all LLM backends implement.
 *
 * Required methods cover the minimum surface: connect, disconnect,
 * session creation, and connection state. Optional methods are
 * capabilities that only some backends support (e.g., the Copilot SDK
 * supports session listing and model enumeration; direct API providers
 * generally do not).
 */
export interface SquadProvider {
  /** Provider identifier. */
  readonly name: ProviderType;

  // -- Lifecycle ---------------------------------------------------------------

  /** Establish connection to the backend. */
  connect(): Promise<void>;

  /** Graceful shutdown. Returns any errors encountered during cleanup. */
  disconnect(): Promise<Error[]>;

  /** Force disconnect without graceful cleanup. */
  forceDisconnect?(): Promise<void>;

  /** Whether the provider is ready to create sessions. */
  isConnected(): boolean;

  // -- Session management (required) ------------------------------------------

  /** Create a new agent session. */
  createSession(config: SquadSessionConfig): Promise<SquadSession>;

  // -- Session management (optional) ------------------------------------------

  /** Resume an existing session by ID. */
  resumeSession?(sessionId: string, config: SquadSessionConfig): Promise<SquadSession>;

  /** List all sessions managed by this provider. */
  listSessions?(): Promise<SquadSessionMetadata[]>;

  /** Delete a session by ID. */
  deleteSession?(sessionId: string): Promise<void>;

  /** Get the ID of the most recently updated session. */
  getLastSessionId?(): Promise<string | undefined>;

  // -- Informational (optional) -----------------------------------------------

  /** List available models from this provider. */
  listModels?(): Promise<SquadModelInfo[]>;

  /** Check authentication status. */
  getAuthStatus?(): Promise<SquadGetAuthStatusResponse>;

  /** Get provider/server status. */
  getStatus?(): Promise<SquadGetStatusResponse>;

  /** Connectivity check. */
  ping?(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }>;

  // -- Events (optional) ------------------------------------------------------

  /** Subscribe to provider-level lifecycle events. */
  on?(eventType: SquadClientEventType, handler: (event: SquadClientEvent) => void): () => void;
  on?(handler: SquadClientEventHandler): () => void;
}
