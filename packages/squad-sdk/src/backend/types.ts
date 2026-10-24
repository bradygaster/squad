/**
 * Squad 2.0 backend/harness decoupling contract.
 *
 * `SquadBackend` (aka `IConversationBackend`) mirrors DurableSquad's
 * conversation backend. Local CLI, MCP and remote durable modes all run
 * through this one contract.
 *
 * @experimental Exported from `@bradygaster/squad-sdk/backend` only while the
 * Squad 2.0 conversation and harness contract stabilizes.
 * @module backend/types
 */

/** Stability stage of the `/backend` subpath contract. @experimental */
export const BACKEND_CONTRACT_STAGE = 'experimental' as const;

export type RunState = 'queued' | 'running' | 'awaiting-approval' | 'completed' | 'failed' | 'cancelled';
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export const TERMINAL_RUN_STATES: readonly RunState[] = ['completed', 'failed', 'cancelled'];

/** Fencing token: a higher epoch supersedes a lower one; stale epochs are rejected. */
export type LeaseEpoch = number;

/** Wire protocol version carried by every envelope. */
export const BACKEND_PROTOCOL_VERSION = '2.0';

/** Opaque, server-issued position in a conversation's event log. Clients must not parse it. */
export type BackendCursor = string;

export type BackendErrorCode =
  | 'not-found'
  | 'stale-epoch'
  | 'approval-hash-mismatch'
  | 'approval-not-pending'
  | 'invalid-request'
  | 'unsupported-protocol'
  | 'unavailable'
  | 'conflict';

const RETRYABLE_CODES: readonly BackendErrorCode[] = ['unavailable'];

/** Canonical error structure shared by every transport (HTTP, MCP, in-process). */
export interface BackendErrorInfo {
  code: BackendErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export class BackendError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: BackendErrorCode,
    message: string,
    readonly status?: number,
    readonly details?: Record<string, unknown>,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'BackendError';
    this.retryable = RETRYABLE_CODES.includes(code);
  }

  toInfo(): BackendErrorInfo {
    return {
      code: this.code, message: this.message, retryable: this.retryable,
      status: this.status, correlationId: this.correlationId, details: this.details,
    };
  }
}

// ── Canonical envelope ──────────────────────────────────────────────

/**
 * Control stream: commands, admissions, lifecycle and approvals.
 * Execution stream: harness output (messages, tasks, tool activity).
 */
export type BackendStream = 'control' | 'execution';

/**
 * Canonical wire envelope. Hosts/transports (HTTP, MCP, in-process) translate
 * to and from this shape. Delivery is at-least-once; consumers dedupe on
 * `id` / `sequence`, and commands are idempotent via their own keys.
 */
export interface BackendEnvelope<T = unknown> {
  protocol: string;
  /** Opaque unique id; stable across redelivery. */
  id: string;
  kind: 'command' | 'event' | 'response';
  stream: BackendStream;
  /** Event/command type, e.g. `message.accepted`, `turn.state`. */
  type: string;
  conversationId: string;
  /** Per-conversation monotonic sequence (events only). */
  sequence?: number;
  /** Resume point: pass as `after` to read events following this one. */
  cursor?: BackendCursor;
  /** Groups everything belonging to one client request/flow. */
  correlationId?: string;
  /** Id of the envelope that directly caused this one. */
  causationId?: string;
  timestamp: string;
  payload: T;
  error?: BackendErrorInfo;
}

export interface ReadEventsOptions {
  after?: BackendCursor;
  limit?: number;
  stream?: BackendStream;
}

export interface BackendEventPage {
  events: BackendEnvelope[];
  /** Cursor to resume from; equals the input cursor when there are no new events. */
  nextCursor: BackendCursor;
  /** Sequence of the last event the backend has accepted for this conversation (client resume state). */
  lastAcceptedSeq: number;
  /** alse when the supplied cursor is ahead of the log and the client must re-sync from the transcript. */
  resumable: boolean;
}

export interface ProtocolHello {
  /** Protocol versions the client speaks, preferred first. */
  protocols: string[];
  clientName?: string;
  /** Content part types the client can render. */
  contentParts?: BackendContentPart['type'][];
  extensionNamespaces?: string[];
  /** Capability flags the client supports; omitted = no client-side restriction. */
  capabilities?: string[];
  /** Capability flags allowed by policy; omitted = no policy restriction. */
  policyCapabilities?: string[];
}

/** Capability flags understood by the backend (see `BACKEND_CAPABILITIES`). */
export type CapabilityFlag = string;

export const BACKEND_CAPABILITIES: readonly CapabilityFlag[] = [
  'approvals', 'background-runs', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts',
];

/** Effective capabilities = client ∩ backend ∩ policy (undefined sides are unrestricted). */
export function intersectCapabilities(
  backend: readonly CapabilityFlag[],
  client?: readonly CapabilityFlag[],
  policy?: readonly CapabilityFlag[],
): CapabilityFlag[] {
  return backend.filter(c => (!client || client.includes(c)) && (!policy || policy.includes(c)));
}

export interface NegotiatedCapabilities {
  /** Capabilities the client declared (all backend capabilities when it declared none). */
  clientCapabilities: CapabilityFlag[];
  backendCapabilities: CapabilityFlag[];
  policyCapabilities?: CapabilityFlag[];
  /** Intersection of client, backend and (optional) policy capabilities. */
  effectiveCapabilities: CapabilityFlag[];
  protocol: string;
  contentParts: BackendContentPart['type'][];
  extensionNamespaces: string[];
  streams: BackendStream[];
  atLeastOnce: true;
  resume: boolean;
  approvals: boolean;
  harnesses: string[];
}

export type BackendContentPart =
  | { type: 'text'; text: string }
  | { type: 'data'; mimeType: string; data: unknown }
  | { type: 'resource'; uri: string; mimeType?: string; title?: string }
  | { type: 'tool-call'; callId: string; name: string; arguments?: unknown }
  | { type: 'tool-result'; callId: string; result?: unknown; isError?: boolean };

export const ALL_CONTENT_PART_TYPES: BackendContentPart['type'][] =
  ['text', 'data', 'resource', 'tool-call', 'tool-result'];

/** Renders parts to plain text (used to keep `content` in sync). */
export function partsToText(parts: BackendContentPart[]): string {
  return parts.map(p => {
    switch (p.type) {
      case 'text': return p.text;
      case 'resource': return p.title ?? p.uri;
      case 'tool-call': return `[tool-call ${p.name}]`;
      case 'tool-result': return `[tool-result ${p.callId}]`;
      default: return `[data ${p.mimeType}]`;
    }
  }).join('\n');
}

/**
 * Extension fields must live under an `x-<harness>.*` namespace,
 * e.g. `x-copilot.model`, `x-claude.thinkingBudget`.
 */
export type ExtensionBag = Record<string, unknown>;

export interface BackendMessage {
  /** Idempotency key, part 1 of `(runId, seq)`. */
  runId: string;
  /** Idempotency key, part 2; monotonically increasing per run. */
  seq: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Plain-text rendering; derived from `parts` when omitted by the sender. */
  content: string;
  /** Typed content; authoritative when present. */
  parts?: BackendContentPart[];
  correlationId?: string;
  causationId?: string;
  /** Fencing token held by the sender. */
  epoch?: LeaseEpoch;
  /** Target harness/agent, if the caller wants to route explicitly. */
  harness?: string;
  extensions?: ExtensionBag;
}

export interface BackendAdmission {
  protocol: string;
  /** Cursor positioned after the admission event. */
  cursor?: BackendCursor;
  correlationId?: string;
  conversationId: string;
  runId: string;
  seq: number;
  /** `true` when `(runId, seq)` had already been admitted; no new turn created. */
  duplicate: boolean;
  state: RunState;
  epoch: LeaseEpoch;
}

export interface ApprovalScope {
  kind: 'turn' | 'run' | 'conversation';
  runId?: string;
  seq?: number;
}

export interface ApprovalRequest {
  approvalId: string;
  turnSeq: number;
  /** Monotonic resource version: 1 when requested. */
  version: number;
  scope: ApprovalScope;
  /** Human readable description of the action requiring approval. */
  action: string;
  /** Hash of the canonical action payload; approvals must echo it. */
  hash: string;
  payload?: unknown;
}

/** Approval request as emitted by a harness; the backend stamps version and default scope. */
export type HarnessApprovalRequest = Omit<ApprovalRequest, 'version' | 'scope'> & { scope?: ApprovalScope };

/** Durable, versioned approval resource: version 1 = pending, 2 = decided. */
export interface ApprovalRecord extends ApprovalRequest {
  state: 'pending' | 'approved' | 'denied' | 'cancelled';
  runId: string;
  requestedAt: string;
  decidedAt?: string;
  decision?: 'approve' | 'deny';
  reason?: string;
}

export interface ApprovalResponse {
  approvalId: string;
  /** Must equal {@link ApprovalRequest.hash}. */
  hash: string;
  decision: 'approve' | 'deny';
  reason?: string;
  epoch?: LeaseEpoch;
}

export interface BackendTurn {
  conversationId: string;
  runId: string;
  seq: number;
  state: RunState;
  tasks: Array<{ id: string; state: TaskState; title?: string }>;
  messages: BackendMessage[];
  pendingApproval?: ApprovalRequest;
  error?: string;
  extensions?: ExtensionBag;
  /** Lease epoch the turn was admitted under; harness output is fenced against it. */
  epoch?: LeaseEpoch;
}

export interface BackendConversation {
  conversationId: string;
  epoch: LeaseEpoch;
  createdAt: string;
  title?: string;
  metadata?: ExtensionBag;
}

export interface CreateConversationOptions {
  title?: string;
  metadata?: ExtensionBag;
  /** Caller-supplied id; the backend generates one when absent. */
  conversationId?: string;
}

export interface BackendHealth {
  /** Liveness (/health/live). */
  live?: boolean;
  /** Readiness (/health/ready). */
  ready?: boolean;
  ok: boolean;
  backend: string;
  version?: string;
  detail?: string;
}

/**
 * The canonical conversation contract. MCP (`backend-mcp.ts`) is only a
 * transport adapter over this interface; it is not the wire contract.
 */
export interface SquadBackend {
  readonly kind: string;
  /** Capability negotiation; throws `unsupported-protocol` if no common version. */
  negotiate(hello: ProtocolHello): Promise<NegotiatedCapabilities>;
  /** At-least-once event feed with opaque cursors; safe to re-read. */
  readEvents(conversationId: string, options?: ReadEventsOptions): Promise<BackendEventPage>;
  createConversation(options?: CreateConversationOptions): Promise<BackendConversation>;
  sendMessage(conversationId: string, message: BackendMessage): Promise<BackendAdmission>;
  getTranscript(conversationId: string): Promise<BackendMessage[]>;
  getTurn(conversationId: string, seq: number): Promise<BackendTurn>;
  cancelTurn(conversationId: string, seq: number, epoch?: LeaseEpoch): Promise<BackendTurn>;
  /** Cancel by stable runId (distinct from turn seq). Idempotent. */
  cancelRun(conversationId: string, runId: string, reason?: string, epoch?: LeaseEpoch): Promise<BackendTurn>;
  /** Durable approval resources, in request order. */
  getApprovals(conversationId: string): Promise<ApprovalRecord[]>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<BackendTurn>;
  health(): Promise<BackendHealth>;
}

/** DurableSquad naming alias. */
export type IConversationBackend = SquadBackend;

// ── Harness SPI ─────────────────────────────────────────────────────

export interface HarnessCapabilities {
  streaming: boolean;
  approvals: boolean;
  cancellation: boolean;
  tools: boolean;
  /** Extension namespaces this harness understands, e.g. `x-copilot`. */
  extensionNamespaces: string[];
}

export interface HarnessSubmission {
  conversationId: string;
  runId: string;
  seq: number;
  /** Deterministic idempotency token (`${conversationId}:${runId}:${seq}`); stable across retries and restarts. */
  operationId?: string;
  messages: BackendMessage[];
  extensions?: ExtensionBag;
  /** Lease epoch of the admission; echo it on every event for the run. */
  epoch?: LeaseEpoch;
}

export type HarnessEvent =
  | { type: 'message'; message: BackendMessage }
  | { type: 'task'; id: string; state: TaskState; title?: string }
  | { type: 'approval-requested'; request: HarnessApprovalRequest }
  | { type: 'state'; state: RunState; error?: string };

/**
 * Harness output for a run. `epoch` is the lease epoch the harness is acting under; when omitted the
 * turn's admission epoch applies. Output whose epoch is older than the conversation's is fenced off.
 */
export type HarnessEventEnvelope = HarnessEvent & { runId: string; seq: number; epoch?: LeaseEpoch };

export interface HarnessDescriptor {
  id: string;
  displayName?: string;
  version?: string;
  capabilities: HarnessCapabilities;
}

export interface HarnessAdapter {
  readonly id: string;
  readonly capabilities: HarnessCapabilities;
  /**
   * Idempotent: deliveries are retried until acknowledged. Adapters MUST deduplicate
   * submissions by `(conversationId, runId, seq)` (or `operationId`) across retries and restarts.
   */
  submit(submission: HarnessSubmission): Promise<void>;
  subscribe(conversationId: string, listener: (event: HarnessEventEnvelope) => void): () => void;
  /** Idempotent: deliveries are retried. operationId is stable across retries and restarts of one delivery. */
  cancel(conversationId: string, runId: string, seq: number, operationId?: string): Promise<void>;
  /** Idempotent: deliveries are retried. operationId is stable across retries and restarts of one delivery. */
  respondApproval(conversationId: string, response: ApprovalResponse, operationId?: string): Promise<void>;
  describe(): HarnessDescriptor;
}

export interface HarnessRegistry {
  register(adapter: HarnessAdapter): void;
  get(id: string): HarnessAdapter | undefined;
  list(): HarnessDescriptor[];
}

export type BackendConfig =
  | { kind: 'local'; squadDir: string; harnesses?: HarnessRegistry; state?: BackendStateStore }
  | { kind: 'mcp'; squadDir: string; harnesses?: HarnessRegistry; state?: BackendStateStore }
  | {
      kind: 'durable-http';
      baseUrl: string;
      token?: string;
      fetch?: typeof fetch;
      maxRetries?: number;
      retryDelayMs?: number;
      requestTimeoutMs?: number;
      epoch?: LeaseEpoch;
    };

/** Minimal subset of the SDK `StateBackend` used for persistence. */
export interface BackendStateStore {
  /**
   * Cross-process mutual exclusion for a read-modify-write of one key. Returns the release function.
   * Stores shared between processes MUST implement it; single-process stores may omit it.
   * Synchronous: used only where the caller cannot await (harness event callbacks).
   */
  lock?(key: string): () => void;
  /**
   * Non-blocking variant of {@link lock}: waits with timers instead of spinning the thread, so a busy
   * lock never stalls the host event loop. Preferred by every async backend method when present.
   */
  lockAsync?(key: string): Promise<() => void>;
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
}
