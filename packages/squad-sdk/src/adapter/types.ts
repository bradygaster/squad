/**
 * Squad SDK Adapter Types
 * 
 * This module provides Squad-stable interfaces that decouple Squad from
 * direct dependencies on @github/copilot-sdk types. All Squad code should
 * import types from this adapter layer, never directly from the Copilot SDK.
 * 
 * @module adapter/types
 */

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Configuration for creating a Squad session.
 * Wraps and stabilizes the Copilot SDK SessionConfig type.
 */
export interface SquadSessionConfig {
  /**
   * Optional custom session ID.
   * If not provided, one will be generated.
   */
  sessionId?: string;

  /**
   * Client name to identify the application using Squad.
   * Included in User-Agent headers for API requests.
   */
  clientName?: string;

  /**
   * Model identifier to use for this session.
   * @example "claude-sonnet-4.5"
   */
  model?: string;

  /**
   * Reasoning effort level for models that support it.
   * Only valid for models where capabilities support reasoning effort.
   * @example "medium"
   */
  reasoningEffort?: SquadReasoningEffort;

  /**
   * Override the default configuration directory location.
   * When specified, the session will use this directory for config and state.
   */
  configDir?: string;

  /**
   * Tools exposed to the agent session.
   * Each tool defines a capability the agent can invoke.
   */
  tools?: SquadTool<any>[];

  /**
   * System message configuration.
   * Controls how the system prompt is constructed.
   */
  systemMessage?: SquadSystemMessageConfig;

  /**
   * List of tool names to allow. When specified, only these tools are available.
   * Takes precedence over excludedTools.
   */
  availableTools?: string[];

  /**
   * List of tool names to disable. All other tools remain available.
   * Ignored if availableTools is specified.
   */
  excludedTools?: string[];

  /**
   * Custom provider configuration (BYOK - Bring Your Own Key).
   * When specified, uses the provided API endpoint instead of Copilot API.
   */
  provider?: SquadProviderConfig;

  /**
   * Handler for permission requests from the agent.
   * Called when the agent needs permission for operations.
   */
  onPermissionRequest?: SquadPermissionHandler;

  /**
   * Handler for user input requests from the agent.
   * When provided, enables the ask_user tool.
   */
  onUserInputRequest?: SquadUserInputHandler;

  /**
   * Hook handlers for intercepting session lifecycle events.
   * Enables custom logic at various points in the session lifecycle.
   */
  hooks?: SquadSessionHooks;

  /**
   * Working directory for the session.
   * Tool operations will be relative to this directory.
   */
  workingDirectory?: string;

  /**
   * Enable streaming of assistant message and reasoning chunks.
   * When true, delta events are sent as the response is generated.
   * @default false
   */
  streaming?: boolean;

  /**
   * MCP server configurations for the session.
   * Keys are server names, values are server configurations.
   */
  mcpServers?: Record<string, SquadMCPServerConfig>;

  /**
   * Custom agent configurations for the session.
   */
  customAgents?: SquadCustomAgentConfig[];

  /**
   * Directories to load skills from.
   */
  skillDirectories?: string[];

  /**
   * List of skill names to disable.
   */
  disabledSkills?: string[];

  /**
   * Infinite session configuration for persistent workspaces.
   * When enabled (default), sessions automatically manage context limits.
   */
  infiniteSessions?: SquadInfiniteSessionConfig;
}

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Configuration for session lifecycle hooks.
 * Hooks allow Squad to intercept and respond to key events.
 */
export interface SquadSessionHooks {
  /**
   * Called before a tool is executed.
   * Can modify arguments, add context, or block execution.
   */
  onPreToolUse?: SquadPreToolUseHandler;

  /**
   * Called after a tool is executed.
   * Can modify results or add context.
   */
  onPostToolUse?: SquadPostToolUseHandler;

  /**
   * Called when the user submits a prompt.
   * Can modify the prompt or inject context.
   */
  onUserPromptSubmitted?: SquadUserPromptSubmittedHandler;

  /**
   * Called when a session starts.
   * Can inject initial context or modify configuration.
   */
  onSessionStart?: SquadSessionStartHandler;

  /**
   * Called when a session ends.
   * Can perform cleanup or capture session summary.
   */
  onSessionEnd?: SquadSessionEndHandler;

  /**
   * Called when an error occurs.
   * Can implement retry logic or custom error handling.
   */
  onErrorOccurred?: SquadErrorOccurredHandler;
}

/**
 * Base interface for all hook inputs.
 * Provides common context available to all hooks.
 */
export interface SquadBaseHookInput {
  /** Timestamp when the hook was triggered (milliseconds since epoch) */
  timestamp: number;
  /** Current working directory */
  cwd: string;
}

/**
 * Input for pre-tool-use hook.
 */
export interface SquadPreToolUseHookInput extends SquadBaseHookInput {
  /** Name of the tool about to be executed */
  toolName: string;
  /** Arguments passed to the tool */
  toolArgs: unknown;
}

/**
 * Output for pre-tool-use hook.
 * All fields are optional; return undefined/void to proceed normally.
 */
export interface SquadPreToolUseHookOutput {
  /** Permission decision for this tool use */
  permissionDecision?: "allow" | "deny" | "ask";
  /** Reason for the permission decision */
  permissionDecisionReason?: string;
  /** Modified arguments to pass to the tool */
  modifiedArgs?: unknown;
  /** Additional context to inject before tool execution */
  additionalContext?: string;
  /** Whether to suppress output from this tool */
  suppressOutput?: boolean;
}

/**
 * Handler for pre-tool-use hook.
 */
export type SquadPreToolUseHandler = (
  input: SquadPreToolUseHookInput,
  invocation: { sessionId: string }
) => Promise<SquadPreToolUseHookOutput | void> | SquadPreToolUseHookOutput | void;

/**
 * Input for post-tool-use hook.
 */
export interface SquadPostToolUseHookInput extends SquadBaseHookInput {
  /** Name of the tool that was executed */
  toolName: string;
  /** Arguments that were passed to the tool */
  toolArgs: unknown;
  /** Result returned from the tool */
  toolResult: SquadToolResultObject;
}

/**
 * Output for post-tool-use hook.
 */
export interface SquadPostToolUseHookOutput {
  /** Modified result to return instead of the original */
  modifiedResult?: SquadToolResultObject;
  /** Additional context to inject after tool execution */
  additionalContext?: string;
  /** Whether to suppress output from this tool */
  suppressOutput?: boolean;
}

/**
 * Handler for post-tool-use hook.
 */
export type SquadPostToolUseHandler = (
  input: SquadPostToolUseHookInput,
  invocation: { sessionId: string }
) => Promise<SquadPostToolUseHookOutput | void> | SquadPostToolUseHookOutput | void;

/**
 * Input for user-prompt-submitted hook.
 */
export interface SquadUserPromptSubmittedHookInput extends SquadBaseHookInput {
  /** The prompt submitted by the user */
  prompt: string;
}

/**
 * Output for user-prompt-submitted hook.
 */
export interface SquadUserPromptSubmittedHookOutput {
  /** Modified prompt to use instead of the original */
  modifiedPrompt?: string;
  /** Additional context to inject with the prompt */
  additionalContext?: string;
  /** Whether to suppress output */
  suppressOutput?: boolean;
}

/**
 * Handler for user-prompt-submitted hook.
 */
export type SquadUserPromptSubmittedHandler = (
  input: SquadUserPromptSubmittedHookInput,
  invocation: { sessionId: string }
) => Promise<SquadUserPromptSubmittedHookOutput | void> | SquadUserPromptSubmittedHookOutput | void;

/**
 * Input for session-start hook.
 */
export interface SquadSessionStartHookInput extends SquadBaseHookInput {
  /** How the session was started */
  source: "startup" | "resume" | "new";
  /** Initial prompt if provided */
  initialPrompt?: string;
}

/**
 * Output for session-start hook.
 */
export interface SquadSessionStartHookOutput {
  /** Additional context to inject at session start */
  additionalContext?: string;
  /** Modified configuration to apply */
  modifiedConfig?: Record<string, unknown>;
}

/**
 * Handler for session-start hook.
 */
export type SquadSessionStartHandler = (
  input: SquadSessionStartHookInput,
  invocation: { sessionId: string }
) => Promise<SquadSessionStartHookOutput | void> | SquadSessionStartHookOutput | void;

/**
 * Input for session-end hook.
 */
export interface SquadSessionEndHookInput extends SquadBaseHookInput {
  /** Reason the session ended */
  reason: "complete" | "error" | "abort" | "timeout" | "user_exit";
  /** Final message if available */
  finalMessage?: string;
  /** Error message if the session ended due to an error */
  error?: string;
}

/**
 * Output for session-end hook.
 */
export interface SquadSessionEndHookOutput {
  /** Whether to suppress output */
  suppressOutput?: boolean;
  /** Cleanup actions performed */
  cleanupActions?: string[];
  /** Summary of the session */
  sessionSummary?: string;
}

/**
 * Handler for session-end hook.
 */
export type SquadSessionEndHandler = (
  input: SquadSessionEndHookInput,
  invocation: { sessionId: string }
) => Promise<SquadSessionEndHookOutput | void> | SquadSessionEndHookOutput | void;

/**
 * Input for error-occurred hook.
 */
export interface SquadErrorOccurredHookInput extends SquadBaseHookInput {
  /** Error message */
  error: string;
  /** Context where the error occurred */
  errorContext: "model_call" | "tool_execution" | "system" | "user_input";
  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Output for error-occurred hook.
 */
export interface SquadErrorOccurredHookOutput {
  /** Whether to suppress output */
  suppressOutput?: boolean;
  /** How to handle the error */
  errorHandling?: "retry" | "skip" | "abort";
  /** Number of retries to attempt */
  retryCount?: number;
  /** Notification to show the user */
  userNotification?: string;
}

/**
 * Handler for error-occurred hook.
 */
export type SquadErrorOccurredHandler = (
  input: SquadErrorOccurredHookInput,
  invocation: { sessionId: string }
) => Promise<SquadErrorOccurredHookOutput | void> | SquadErrorOccurredHookOutput | void;

// ============================================================================
// MCP Server Configuration
// ============================================================================

/**
 * Base interface for MCP server configuration.
 */
interface SquadMCPServerConfigBase {
  /**
   * List of tools to include from this server.
   * [] means none, "*" means all.
   */
  tools: string[];
  /**
   * Server type: "local", "stdio", "http", or "sse".
   * Defaults to "local" if not specified.
   */
  type?: string;
  /**
   * Optional timeout in milliseconds for tool calls to this server.
   */
  timeout?: number;
}

/**
 * Configuration for a local/stdio MCP server.
 */
export interface SquadMCPLocalServerConfig extends SquadMCPServerConfigBase {
  type?: "local" | "stdio";
  /** Command to execute */
  command: string;
  /** Command-line arguments */
  args: string[];
  /** Environment variables to pass to the server */
  env?: Record<string, string>;
  /** Working directory for the server process */
  cwd?: string;
}

/**
 * Configuration for a remote MCP server (HTTP or SSE).
 */
export interface SquadMCPRemoteServerConfig extends SquadMCPServerConfigBase {
  type: "http" | "sse";
  /** URL of the remote server */
  url: string;
  /** Optional HTTP headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Union type for MCP server configurations.
 * Squad supports both local and remote MCP servers.
 */
export type SquadMCPServerConfig = SquadMCPLocalServerConfig | SquadMCPRemoteServerConfig;

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Result type for tool execution.
 */
export type SquadToolResultType = "success" | "failure" | "rejected" | "denied";

/**
 * Binary result (e.g., images, files) returned from a tool.
 */
export interface SquadToolBinaryResult {
  /** Base64-encoded binary data */
  data: string;
  /** MIME type of the data */
  mimeType: string;
  /** Type identifier */
  type: string;
  /** Optional description */
  description?: string;
}

/**
 * Structured tool result object.
 */
export interface SquadToolResultObject {
  /** Text result for the LLM to process */
  textResultForLlm: string;
  /** Optional binary results (images, files, etc.) */
  binaryResultsForLlm?: SquadToolBinaryResult[];
  /** Result type indicator */
  resultType: SquadToolResultType;
  /** Error message if the tool failed */
  error?: string;
  /** Session log output */
  sessionLog?: string;
  /** Tool-specific telemetry data */
  toolTelemetry?: Record<string, unknown>;
}

/**
 * Tool result can be a simple string or a structured object.
 */
export type SquadToolResult = string | SquadToolResultObject;

/**
 * Context provided to tool handlers when invoked.
 */
export interface SquadToolInvocation {
  /** Session ID where the tool was invoked */
  sessionId: string;
  /** Unique ID for this tool call */
  toolCallId: string;
  /** Name of the tool being invoked */
  toolName: string;
  /** Arguments passed to the tool (untyped) */
  arguments: unknown;
}

/**
 * Handler function for tool execution.
 * @template TArgs - Type of the tool arguments
 */
export type SquadToolHandler<TArgs = unknown> = (
  args: TArgs,
  invocation: SquadToolInvocation
) => Promise<unknown> | unknown;

/**
 * Zod-like schema interface for type inference.
 * Any object with a toJSONSchema() method is treated as a schema.
 */
export interface SquadZodSchema<T = unknown> {
  _output: T;
  toJSONSchema(): Record<string, unknown>;
}

/**
 * Tool definition for Squad.
 * Tools are capabilities that agents can invoke during execution.
 * 
 * @template TArgs - Type of the tool arguments (inferred from schema)
 */
export interface SquadTool<TArgs = unknown> {
  /** Unique name for the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description?: string;
  /** Parameter schema (Zod schema or JSON schema object) */
  parameters?: SquadZodSchema<TArgs> | Record<string, unknown>;
  /** Handler function that implements the tool */
  handler: SquadToolHandler<TArgs>;
}

// ============================================================================
// System Message Configuration
// ============================================================================

/**
 * Append mode: Use CLI foundation with optional appended content (default).
 */
export interface SquadSystemMessageAppendConfig {
  mode?: "append";
  /**
   * Additional instructions appended after SDK-managed sections.
   */
  content?: string;
}

/**
 * Replace mode: Use caller-provided system message entirely.
 * Removes all SDK guardrails including security restrictions.
 */
export interface SquadSystemMessageReplaceConfig {
  mode: "replace";
  /**
   * Complete system message content.
   * Replaces the entire SDK-managed system message.
   */
  content: string;
}

/**
 * System message configuration for session creation.
 * Controls how the agent's system prompt is constructed.
 */
export type SquadSystemMessageConfig =
  | SquadSystemMessageAppendConfig
  | SquadSystemMessageReplaceConfig;

// ============================================================================
// Permission Handling
// ============================================================================

/**
 * Permission request from the agent.
 */
export interface SquadPermissionRequest {
  /** Type of permission being requested */
  kind: "shell" | "write" | "mcp" | "read" | "url";
  /** Tool call ID if associated with a specific tool call */
  toolCallId?: string;
  /** Additional request-specific data */
  [key: string]: unknown;
}

/**
 * Result of a permission request.
 */
export interface SquadPermissionRequestResult {
  /** Outcome of the permission request */
  kind:
    | "approve-once"
    /**
     * @deprecated Use `"approve-once"` instead. This value is kept for
     * backwards compatibility and is normalised to `"approve-once"` by the SDK.
     */
    | "approved"
    | "denied-by-rules"
    | "denied-no-approval-rule-and-could-not-request-from-user"
    | "denied-interactively-by-user";
  /** Rules that influenced the decision */
  rules?: unknown[];
}

/**
 * Handler for permission requests from the agent.
 */
export type SquadPermissionHandler = (
  request: SquadPermissionRequest,
  invocation: { sessionId: string }
) => Promise<SquadPermissionRequestResult> | SquadPermissionRequestResult;

// ============================================================================
// User Input Handling
// ============================================================================

/**
 * Request for user input from the agent (enables ask_user tool).
 */
export interface SquadUserInputRequest {
  /** The question to ask the user */
  question: string;
  /** Optional choices for multiple choice questions */
  choices?: string[];
  /**
   * Whether to allow freeform text input in addition to choices.
   * @default true
   */
  allowFreeform?: boolean;
}

/**
 * Response to a user input request.
 */
export interface SquadUserInputResponse {
  /** The user's answer */
  answer: string;
  /** Whether the answer was freeform (not from choices) */
  wasFreeform: boolean;
}

/**
 * Handler for user input requests from the agent.
 */
export type SquadUserInputHandler = (
  request: SquadUserInputRequest,
  invocation: { sessionId: string }
) => Promise<SquadUserInputResponse> | SquadUserInputResponse;

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Configuration for a custom API provider (BYOK - Bring Your Own Key).
 */
export interface SquadProviderConfig {
  /**
   * Provider type.
   * @default "openai"
   */
  type?: "openai" | "azure" | "anthropic";
  /**
   * API format (openai/azure only).
   * @default "completions"
   */
  wireApi?: "completions" | "responses";
  /** API endpoint URL */
  baseUrl: string;
  /** API key (optional for local providers like Ollama) */
  apiKey?: string;
  /**
   * Bearer token for authentication.
   * Takes precedence over apiKey when both are set.
   */
  bearerToken?: string;
  /** Azure-specific options */
  azure?: {
    /**
     * API version.
     * @default "2024-10-21"
     */
    apiVersion?: string;
  };
}

// ============================================================================
// Custom Agent Configuration
// ============================================================================

/**
 * Configuration for a custom agent in Squad.
 */
export interface SquadCustomAgentConfig {
  /** Unique name of the custom agent */
  name: string;
  /** Display name for UI purposes */
  displayName?: string;
  /** Description of what the agent does */
  description?: string;
  /**
   * List of tool names the agent can use.
   * Use null or undefined for all tools.
   */
  tools?: string[] | null;
  /** The prompt content for the agent */
  prompt: string;
  /** MCP servers specific to this agent */
  mcpServers?: Record<string, SquadMCPServerConfig>;
  /**
   * Whether the agent should be available for model inference.
   * @default true
   */
  infer?: boolean;
}

// ============================================================================
// Infinite Session Configuration
// ============================================================================

/**
 * Configuration for infinite sessions with automatic context compaction.
 * When enabled, sessions automatically manage context window limits through
 * background compaction and persist state to a workspace directory.
 */
export interface SquadInfiniteSessionConfig {
  /**
   * Whether infinite sessions are enabled.
   * @default true
   */
  enabled?: boolean;
  /**
   * Context utilization threshold (0.0-1.0) at which background compaction starts.
   * Compaction runs asynchronously, allowing the session to continue.
   * @default 0.80
   */
  backgroundCompactionThreshold?: number;
  /**
   * Context utilization threshold (0.0-1.0) at which the session blocks until compaction completes.
   * This prevents context overflow when compaction hasn't finished in time.
   * @default 0.95
   */
  bufferExhaustionThreshold?: number;
}

// ============================================================================
// Model and Reasoning Configuration
// ============================================================================

/**
 * Valid reasoning effort levels for models that support it.
 *
 * Canonical reasoning-effort union for the SDK — import this type instead of
 * re-declaring the union inline. The runtime list lives in config/models.ts as
 * `VALID_REASONING_EFFORTS` (kept in sync via `satisfies`).
 */
export type SquadReasoningEffort = "low" | "medium" | "high" | "xhigh";

// ============================================================================
// Session Interface
// ============================================================================

/**
 * Session event types emitted by Squad sessions.
 * These events track the session lifecycle and agent activity.
 */
export type SquadSessionEventType = string;

/**
 * Session event payload.
 * Generic event structure that can be specialized per event type.
 */
export interface SquadSessionEvent {
  type: SquadSessionEventType;
  [key: string]: unknown;
}

/**
 * Handler for session events.
 */
export type SquadSessionEventHandler = (event: SquadSessionEvent) => void;

// ============================================================================
// Client-Level Event Types
// ============================================================================

/**
 * Client-level lifecycle event types (distinct from session-level events).
 * Emitted by CopilotClient when sessions are created, deleted, or change state.
 */
export type SquadClientEventType =
  | 'session.created'
  | 'session.deleted'
  | 'session.updated'
  | 'session.foreground'
  | 'session.background';

/**
 * Client-level lifecycle event payload.
 */
export interface SquadClientEvent {
  type: SquadClientEventType;
  sessionId: string;
  metadata?: {
    startTime: string;
    modifiedTime: string;
    summary?: string;
  };
}

/**
 * Handler for client-level lifecycle events.
 */
export type SquadClientEventHandler = (event: SquadClientEvent) => void;

/**
 * Options for sending a message to a session.
 */
export interface SquadMessageOptions {
  /** The prompt/message to send */
  prompt: string;
  /** File, directory, or selection attachments */
  attachments?: Array<
    | {
        type: "file";
        path: string;
        displayName?: string;
      }
    | {
        type: "directory";
        path: string;
        displayName?: string;
      }
    | {
        type: "selection";
        filePath: string;
        displayName: string;
        selection?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        text?: string;
      }
  >;
  /**
   * Message delivery mode.
   * - "enqueue": Add to queue (default)
   * - "immediate": Send immediately
   */
  mode?: "enqueue" | "immediate";
}

/**
 * Squad session interface.
 * Represents an active agent session with lifecycle management.
 */
export interface SquadSession {
  /** Unique identifier for this session */
  readonly sessionId: string;

  /**
   * Send a message to the session.
   * @param options - Message content and delivery options
   * @returns Promise that resolves when the message is processed
   */
  sendMessage(options: SquadMessageOptions): Promise<void>;

  /**
   * Send a message and wait for the session to become idle.
   * @param options - Message content and delivery options
   * @param timeout - Timeout in milliseconds (default: 60000)
   * @returns Promise that resolves with the final assistant message, or undefined
   */
  sendAndWait?(options: SquadMessageOptions, timeout?: number): Promise<unknown>;

  /**
   * Abort the current in-flight agent work.
   * @returns Promise that resolves when the abort is acknowledged
   */
  abort?(): Promise<void>;

  /**
   * Retrieve all messages from this session.
   * @returns Promise that resolves with the session's message history
   */
  getMessages?(): Promise<unknown[]>;

  /**
   * Register an event handler for session events.
   * @param eventType - Type of event to listen for
   * @param handler - Handler function to call when event occurs
   */
  on(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void;

  /**
   * Remove an event handler.
   * @param eventType - Type of event to stop listening for
   * @param handler - Handler function to remove
   */
  off(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void;

  /**
   * End the session and clean up resources.
   * @returns Promise that resolves when session is fully closed
   */
  close(): Promise<void>;
}

// ============================================================================
// Client Response Types
// ============================================================================

/**
 * Session metadata returned from list operations.
 */
export interface SquadSessionMetadata {
  sessionId: string;
  startTime: Date;
  modifiedTime: Date;
  summary?: string;
  isRemote: boolean;
  context?: Record<string, unknown>;
}

/**
 * Response from getStatus operation.
 */
export interface SquadGetStatusResponse {
  version: string;
  protocolVersion: number;
}

/**
 * Response from getAuthStatus operation.
 */
export interface SquadGetAuthStatusResponse {
  isAuthenticated: boolean;
  authType?: "user" | "env" | "gh-cli" | "hmac" | "api-key" | "token";
  host?: string;
  login?: string;
  statusMessage?: string;
}

/**
 * Model capabilities and limits.
 */
export interface SquadModelCapabilities {
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
}

/**
 * Model policy state.
 */
export interface SquadModelPolicy {
  state: "enabled" | "disabled" | "unconfigured";
  terms: string;
}

/**
 * Model billing information.
 */
export interface SquadModelBilling {
  multiplier: number;
}

/**
 * Information about an available model.
 */
export interface SquadModelInfo {
  id: string;
  name: string;
  capabilities: SquadModelCapabilities;
  policy?: SquadModelPolicy;
  billing?: SquadModelBilling;
  supportedReasoningEfforts?: SquadReasoningEffort[];
  defaultReasoningEffort?: SquadReasoningEffort;
}
