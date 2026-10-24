# Squad Client and Backend Decoupling v0.2

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-client-backend-decoupling/v0.2`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** The contract in this draft is implemented as the
experimental `@bradygaster/squad-sdk/backend` subpath (`LocalSquadBackend`,
`DurableHttpSquadBackend`, `DefaultHarnessRegistry`) and bridged over MCP by
`squad state-mcp --experimental-backend`. No execution harness ships with it;
the MCP bridge records transcripts and events only.

**Known deviations:** Approval hashes are opaque harness-supplied strings
(not broker-computed digests), lease epochs are client-asserted rather than
broker-issued, cursors are unsigned, and conversations are whole-file JSON
snapshots. See section 10.4.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-coordination-handoff/v0.1`,
`squad-state-memory-requirements/v0.1`

## 1. Scope and non-goals

This profile separates Squad's interactive surface from its broker and
execution runtimes. It defines the three-plane split, the portable
conversation resources, and the TypeScript contracts that let one client swap
between local, MCP, and remote durable backends without rewriting planner or
agent logic.

It does not standardize LLM prompts, UI layout, GitHub-specific session tools,
token minting, transport codecs, storage engines, or the internal scheduler of
any execution fabric.

This split follows the client/backend convergence rule agreed for Squad 2.0:
host adapters stop at host capabilities and transport translation. Conversation
semantics, ordering, idempotency, routing, leases, cancellation, durable
artifacts, checkpoints, observability joins, and authorization boundaries
belong to the shared backend contract rather than to any individual host.

## 2. Three-plane architecture

Squad 2.0 uses three cooperating planes:

| Plane | Responsibility | Typical examples |
|---|---|---|
| Client Plane | gathers user intent, renders transcript state, sends approvals, and hosts local UX affordances | GitHub Copilot (`copilot`), Claude Code (`claude`), Kiro (`kiro`), OpenCode (`opencode`), Cursor (`cursor`), OpenAI Codex (`codex`), Google Antigravity (`antigravity`) |
| Control and Broker Plane | owns conversation identity, admission, sequencing, transcript projection, task routing, approval digests, and lease fencing | in-process broker, `squad_state` MCP bridge, DurableSquad coordinator, DTS orchestration service |
| Execution Plane | runs agent turns, tools, background work, and durable task continuations | local Copilot session, spawned subagent session, MCP worker, durable task host |

The planes are intentionally asymmetrical. Clients may change faster than the
broker, and execution fabrics may change faster than either, but the portable
conversation model remains stable at the control boundary.

The control and broker plane is therefore the semantic center of gravity. It
owns the durable ordered event log, participant and membership rules, routing,
lease state, resumability, artifact semantics, canonical errors, and the
authorization boundary between host affordances and execution rights.

## 3. Conversation resource model

The broker surface is organized around one conversation resource and a small
set of stable subordinate views.

| Resource | `SquadBackend` method | Canonical shape |
|---|---|---|
| `POST /v1/conversations` | `createConversation` (idempotent per `conversationId`) | `BackendConversation` |
| `POST /v1/capabilities` | `negotiate` | `NegotiatedCapabilities` |
| `POST /v1/conversations/{id}/messages` | `sendMessage` (idempotent per `(runId, seq)`) | `BackendMessage` → `BackendAdmission` |
| `GET /v1/conversations/{id}/transcript` | `getTranscript` | `BackendMessage[]` |
| `GET /v1/conversations/{id}/events?after=&limit=&stream=` | `readEvents` | `BackendEventPage` of `BackendEnvelope` |
| `GET /v1/conversations/{id}/turns/{seq}` | `getTurn` | `BackendTurn` |
| `POST /v1/conversations/{id}/turns/{seq}/cancel` | `cancelTurn` | `BackendTurn` |
| `POST /v1/conversations/{id}/runs/{runId}/cancel` | `cancelRun` (stable run identity) | `BackendTurn` |
| `GET /v1/conversations/{id}/approvals` | `getApprovals` | `ApprovalRecord[]` |
| `POST /v1/conversations/{id}/approvals/{approvalId}` | `respondApproval` (echoes the request `hash`) | `ApprovalResponse` → `BackendTurn` |
| `GET /health/live`, `GET /health/ready` | `health` | operational, outside `/v1` |

These paths are a resource vocabulary, not an HTTP requirement. A filesystem
broker, MCP tool surface, or durable task API may project the same resources
through different transports as long as the identifiers, fields, and replay
rules stay stable.

The canonical wire contract is the conversation resource model above. MCP may
carry broker operations for local convenience, but MCP itself is not the
portable conversation protocol.

## 4. Portable TypeScript contracts

The broker contract lives in one SDK module,
`packages/squad-sdk/src/backend/types.ts`, exported from
`@bradygaster/squad-sdk/backend` (stage: `experimental`). That file is the
source of truth; the excerpts below are copied from it and trimmed to the
members a client author needs.

```ts
export type RunState = 'queued' | 'running' | 'awaiting-approval' | 'completed' | 'failed' | 'cancelled';
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Fencing token: a higher epoch supersedes a lower one; stale epochs are rejected. */
export type LeaseEpoch = number;
export const BACKEND_PROTOCOL_VERSION = '2.0';
/** Opaque, server-issued position in a conversation's event log. Clients do not parse it. */
export type BackendCursor = string;

export type BackendErrorCode =
  | 'not-found' | 'stale-epoch' | 'approval-hash-mismatch' | 'approval-not-pending'
  | 'invalid-request' | 'unsupported-protocol' | 'unavailable' | 'conflict';

export interface BackendErrorInfo {
  code: BackendErrorCode; message: string; retryable: boolean;
  status?: number; correlationId?: string; details?: Record<string, unknown>;
}

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
  /** Target harness, if the caller wants to route explicitly. */
  harness?: string;
  extensions?: ExtensionBag; // keys are `x-<harness>.*`
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

export interface ApprovalRequest {
  approvalId: string;
  turnSeq: number;
  /** Monotonic resource version: 1 when requested, 2 when decided. */
  version: number;
  scope: { kind: 'turn' | 'run' | 'conversation'; runId?: string; seq?: number };
  action: string;
  /** Opaque string supplied by the harness; approvals echo it verbatim. */
  hash: string;
  payload?: unknown;
}

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
  /** Equals {@link ApprovalRequest.hash}. */
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
  epoch?: LeaseEpoch;
}

export interface BackendConversation {
  conversationId: string;
  epoch: LeaseEpoch;
  createdAt: string;
  title?: string;
  metadata?: ExtensionBag;
}

export interface BackendEnvelope<T = unknown> {
  protocol: string;
  id: string;                       // stable across redelivery
  kind: 'command' | 'event' | 'response';
  stream: 'control' | 'execution';
  type: string;                     // e.g. `message.accepted`, `turn.state`
  conversationId: string;
  sequence?: number;                // per-conversation monotonic (events only)
  cursor?: BackendCursor;
  correlationId?: string;
  causationId?: string;
  timestamp: string;
  payload: T;
  error?: BackendErrorInfo;
}

export interface BackendEventPage {
  events: BackendEnvelope[];
  nextCursor: BackendCursor;
  lastAcceptedSeq: number;
  /** false when the supplied cursor is ahead of the log and the client re-syncs from the transcript. */
  resumable: boolean;
}

export interface NegotiatedCapabilities {
  clientCapabilities: string[];
  backendCapabilities: string[];
  policyCapabilities?: string[];
  /** Intersection of client, backend and (optional) policy capabilities. */
  effectiveCapabilities: string[];
  protocol: string;
  contentParts: BackendContentPart['type'][];
  extensionNamespaces: string[];
  streams: Array<'control' | 'execution'>;
  atLeastOnce: true;
  resume: boolean;
  approvals: boolean;
  /** Registered execution harness ids; empty when the backend only records transcripts. */
  harnesses: string[];
}

export interface SquadBackend {
  readonly kind: string;
  negotiate(hello: ProtocolHello): Promise<NegotiatedCapabilities>;
  readEvents(conversationId: string, options?: { after?: BackendCursor; limit?: number; stream?: 'control' | 'execution' }): Promise<BackendEventPage>;
  createConversation(options?: { title?: string; metadata?: ExtensionBag; conversationId?: string }): Promise<BackendConversation>;
  sendMessage(conversationId: string, message: BackendMessage): Promise<BackendAdmission>;
  getTranscript(conversationId: string): Promise<BackendMessage[]>;
  getTurn(conversationId: string, seq: number): Promise<BackendTurn>;
  cancelTurn(conversationId: string, seq: number, epoch?: LeaseEpoch): Promise<BackendTurn>;
  /** Cancel by stable runId (distinct from turn seq). Idempotent. */
  cancelRun(conversationId: string, runId: string, reason?: string, epoch?: LeaseEpoch): Promise<BackendTurn>;
  getApprovals(conversationId: string): Promise<ApprovalRecord[]>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<BackendTurn>;
  health(): Promise<{ ok: boolean; live?: boolean; ready?: boolean; backend: string; version?: string; detail?: string }>;
}

/** DurableSquad naming alias. */
export type IConversationBackend = SquadBackend;
```

`SquadBackend` (alias `IConversationBackend`) is the whole client-facing
surface; there is no separate broker-only extension with task leasing today.
Task state is only visible through `BackendTurn.tasks` as reported by a
harness.

Leases and checkpoints remain internal to the broker and execution planes. The
client-facing contract exposes only opaque resume hints: `nextCursor`,
`lastAcceptedSeq`, and `resumable`.

Event `type` values emitted by the SDK backend are `conversation.created`,
`message.accepted`, `turn.state`, `approval.requested`, `approval.resolved`,
`cancellation.requested`, `harness.message`, `harness.task` and
`harness.epoch-rejected`. The golden trace in
`test-fixtures/spec/suite-v0.2/golden-trace.json` uses these names directly.

## 5. Protocol invariants and stream boundaries

The portable backend contract carries a small set of fixed invariants:

- commands and events are versioned independently from host transports;
- conversation, run, task, approval, artifact, and cursor identities are
  opaque tokens;
- delivery is at-least-once, so commands are idempotent and replay-safe;
- every conversation exposes one monotonic broker sequence for admitted turns;
- capability negotiation happens at the broker boundary, not inside host UI
  adapters;
- content parts are typed so transcripts can carry text, tool calls, tool
  results, approvals, and artifact references without host-specific parsing;
- control-plane events and execution-plane events remain distinguishable even
  when one transport carries both.

Capability negotiation is modeled as an intersection:

- `clientCapabilities` are declared by the host adapter;
- `backendCapabilities` are supported by the server;
- `policyCapabilities` are authorized by repository or operator policy;
- `effectiveCapabilities` are the intersection of those three sets.

The control stream covers admissions, approvals, routing, leases, cancellation,
membership changes, and transcript projection. The execution stream covers task
claims, worker progress, tool execution, produced artifacts, checkpoints, and
observability records. One backend may multiplex both streams, but consumers
must still be able to tell which boundary an event belongs to.

Operational health is not part of this negotiated contract. `/health/live` and
`/health/ready` are unversioned operational endpoints outside
`/v1/conversations` and bypass client projection.

## 6. Admission and transcript semantics

The broker owns message ordering. Clients may stage or buffer UI state
locally, but every durable transcript view is rebuilt from admitted broker
messages and turns.

Admission has three steps:

1. client submits a `BackendMessage` with a stable idempotency key;
2. broker returns `BackendAdmission` with the accepted `(runId, seq)`, the
   run state, the conversation epoch and a cursor positioned after the
   `message.accepted` event;
3. the routed harness publishes messages, task updates, approval requests and
   state changes, which the broker records as `harness.*`, `approval.*` and
   `turn.state` events on the same conversation.

Repeated submission of the same `(runId, seq)` returns `duplicate: true` with
the original admission cursor. Reusing the key with a different `role`,
`content`, `parts` or `extensions` is a `conflict`.

`runId` is exposed independently from turn sequence. `seq` remains the
ordering and causation coordinate, while lifecycle cancellation and resumable
state target `runId`. Host completion signals are evidence for projection, not
the canonical lifecycle state.

## 7. Run and task state machine

Broker-level run state and execution-level task state are related but not
identical.

```text
run:  queued -> running -> awaiting-approval -> running
      -> completed|failed|cancelled

task: pending -> running -> completed|failed|cancelled
```

A turn is admitted as `running` when a harness is routed and as `queued` when
none is (a `queued` turn stays queued until a harness picks it up or it is
cancelled). A run becomes `awaiting-approval` when its harness raises an
`approval-requested` event; an approval decision moves it back to `running`
(approve) or to `cancelled` (deny). Task state is reported by the harness and
recorded on the turn; the broker does not lease tasks.

Lifecycle cancellation targets `runId` through `cancelRun`; `cancelTurn` by
`seq` exists for local convenience. Both are idempotent and emit exactly one
`turn.state` terminal event per turn, caused by the `cancellation.requested`
event.

## 8. Hash-echoed approvals

Approvals are durable versioned resources, not ordinary transcript messages or
ephemeral prompts. Every approval record carries:

- `approvalId`, `turnSeq`, `runId` and a `scope` (`turn` by default);
- `version` (1 while pending, 2 once decided or cancelled) and `state`
  (`pending`, `approved`, `denied`, `cancelled`);
- `hash`, an opaque string supplied by the harness together with the request;
- `requestedAt` and, after the decision, `decidedAt`, `decision` and
  `reason`.

`respondApproval` succeeds only when the response echoes the same
`approvalId` and the exact `hash` string; a different string is rejected with
`approval-hash-mismatch` and no state change. A second decision for an already
decided or cancelled approval is rejected with `approval-not-pending`, so the
side effect of a decision happens at most once.

The broker neither computes nor interprets `hash`. Whether it is a SHA-256 of
a canonical payload, a nonce, or a plain label is entirely the harness's
choice, and nothing stops a client that can read the approval record from
echoing it. There is no `payloadHash`, no expiry, and the response does not
carry or check `version`. Broker-computed hashes and expiry are listed under
"Known limitations" below as future work.

## 9. Lease and epoch fencing

A conversation carries one integer `epoch` (initially 1). Every write may
present an epoch:

- an epoch lower than the conversation's is rejected with `stale-epoch`;
- once any writer has presented an epoch the conversation is *fenced* and a
  write that omits the epoch is rejected as well;
- an epoch higher than the conversation's is adopted and becomes the new
  current epoch.

Harness output tagged with an epoch older than the conversation's is dropped
and recorded as a `harness.epoch-rejected` control event, so a worker that
resumes after a pause cannot overwrite a newer decision.

Epochs are cooperative and client-asserted. There is no broker-issued lease
token, no holder identity and no expiry: any caller that presents a larger
integer takes over the conversation and fences everyone else. This is an
optimistic-concurrency version for well-behaved writers, not a security
boundary against a hostile or buggy co-tenant. The `DurableHttpSquadBackend`
client learns the epoch from every admission and sends it as `X-Lease-Epoch`.

## 10. Backend plug-in shapes

The same contract is projected through three backend families.

### 10.1 Local backend

`LocalSquadBackend` runs the broker in process and stores each conversation as
one JSON snapshot under `.squad/backend/conversations/<id>.json`, serialized
across processes by `.squad/backend/locks/<id>.lock`. Harnesses are plugged in
through a `HarnessRegistry`; the SDK ships the registry and the harness
interface but no harness implementation.

### 10.2 MCP bridge

`squad state-mcp --experimental-backend` exposes the same `SquadBackend`
instance as `squad_backend_*` tools. The portable boundary is still the
conversation contract; MCP only carries it for hosts that can load `.mcp.json`,
`.kiro/settings/mcp.json`, `opencode.json`, `.cursor/mcp.json`,
`.codex/config.toml`, or Antigravity's `mcpServers:` frontmatter in
`.agents/agents/squad.md` without linking the SDK directly.

The bridge is a transcript and event-log surface. It bundles no execution
harness: `squad_backend_health` and `squad_backend_negotiate` report
`harnesses: []` and `executionAvailable: false`, and
`squad_backend_send_message` refuses instead of queueing (`unavailable` when no
harness is registered; when `harness` is omitted on an in-process backend, it
auto-selects a single registered harness or refuses with `invalid-request` when
multiple harnesses are registered). `SQUAD_BACKEND_URL` by itself does not
enable the tools.

### 10.3 Remote durable backend

`DurableHttpSquadBackend` maps the same contract onto DurableSquad's
`/v1/conversations` HTTP surface with retries, per-attempt timeouts and
`Idempotency-Key` headers. The base URL has to be `https://`, or `http://` to a
loopback host, and redirects are treated as errors so the bearer token is never
replayed to another origin.

### 10.4 Known limitations

- Conversations are stored as whole-file JSON snapshots that are rewritten on
  every change (temp file, fsync, rename). There is no append-only log or
  compaction; very long conversations grow the per-write cost accordingly.
- Approval hashes are opaque harness strings; there is no broker-computed
  digest, expiry or response-side version check.
- Lease epochs are client-asserted (see section 9).
- Cursors are unsigned `base64url("c1:<conversationId>:<sequence>")` values,
  validated only for the conversation id and numeric form.
- No execution harness ships with the CLI or SDK.

## 11. Protocol versioning and compatibility policy

The frozen baseline for this draft is `squad-protocol-v2.0-rc1`.

Breaking semantic changes to conversation identity, cancellation targeting,
approval resource behavior, capability intersection, cursor recovery, or the
golden trace require a protocol-major bump beyond this baseline.

Additive evolution uses explicit negotiation and loss-tolerant projection:

- new capabilities appear through `/v1/capabilities`;
- additive event kinds or `x-*` extension fields are preserved even when a
  projection does not interpret them;
- adapters and clients continue forwarding unknown durable events instead of
  collapsing the transcript or crashing the projection layer.

Any future adapter or backend compatibility claim is gated by `G1` through
`G9`:

| Gate | Compatibility proof |
|---|---|
| `G1` | stable `runId` exists independently from turn ordering |
| `G2` | turn ordering remains monotonic by `seq` within one conversation |
| `G3` | approvals are durable versioned resources that echo the harness-supplied opaque `hash` |
| `G4` | effective capabilities are negotiated as `client ∩ backend ∩ policy` |
| `G5` | recovery is cursor-based and exposes `lastAcceptedSeq` plus `resumable` |
| `G6` | cancellation targets `runId`, not host-local completion state |
| `G7` | operational health endpoints stay outside the protocol resource tree |
| `G8` | `x-<harness>.*` extension fields are validated and preserved; unknown event kinds are not yet projected loss-tolerantly |
| `G9` | the golden fixtures in `test-fixtures/spec/suite-v0.2/` pass against the local and durable-http backends |

The architectural rationale for those gates is recorded in
[ADR 001: Client, Control, and Execution Boundary](adr-001-client-control-execution-boundary.md).

## 12. Golden conformance trace

The reference golden trace for this draft, written with the real event `type`
names, is:

```text
message.accepted(runId, seq)
-> approval.requested(version 1, hash)
-> client.disconnected
-> client.reconnected(cursor, resumable)
-> approval.resolved(version 2, decision approve)
-> cancellation.requested(runId)
-> turn.state(cancelled)
```

`client.*` entries are client-side steps that produce no backend event. The
trace is executed end to end against the file-backed local backend and the
durable-http client in `test/squad-20-all-scenarios.e2e.test.ts`, with the
same canonical history on both.

This trace captures the core invariants of the split: stable `runId`
cancellation, monotonic `seq` ordering, durable approval versioning, resumable
cursor-based recovery, and a terminal state chosen by the broker rather than
by host-local projection.

## 13. Relationship to coordination and state authority

`squad-coordination-handoff/v0.1` defines message and causation envelopes
between coordinators and workers. This profile narrows that envelope into a
concrete conversation API with stable turn sequencing and transcript views.

`squad-state-memory-requirements/v0.1` explains why one broker must remain the
authority for mutable state. This profile applies that rule specifically to
conversation transcripts, turn records, leases, and approvals.

## 14. Promotion criteria

Promote this draft only after the suite has:

1. deterministic positive and negative fixtures for message admission,
   transcript paging, duplicate idempotency keys, and conflicting payloads;
2. lease and epoch traces that show stale worker writes being rejected after
   broker failover, with broker-issued (not client-asserted) epochs;
3. approval fixtures covering replayed and hash-mismatched responses, plus
   broker-computed digests and expiry once those exist;
4. one local backend, one MCP backend, and one remote durable backend passing
   the same contract tests, with at least one real execution harness;
5. sanitized transcript evidence that demonstrates the three-plane split
   without leaking tokens, tool secrets, or private prompt content.
