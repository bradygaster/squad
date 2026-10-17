# Squad Client and Backend Decoupling v0.2

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-client-backend-decoupling/v0.2`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** Squad already exposes local session APIs, the
`squad_state` MCP bridge, Copilot ACP sessions, and external durable runtimes,
but they do not yet share one portable conversation contract.

**Known deviations:** Conversation admission, approval replay protection, task
leases, and transcript pagination are implemented differently across local,
MCP, and remote runtimes.

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

This split follows the Q and Bubu convergence rule from the Squad 2.0 kickoff:
host adapters stop at host capabilities and transport translation. Conversation
semantics, ordering, idempotency, routing, leases, cancellation, durable
artifacts, checkpoints, observability joins, and authorization boundaries
belong to the shared backend contract rather than to any individual host.

## 2. Three-plane architecture

Squad 2.0 uses three cooperating planes:

| Plane | Responsibility | Typical examples |
|---|---|---|
| Client Plane | gathers user intent, renders transcript state, sends approvals, and hosts local UX affordances | Copilot CLI, Copilot App, VS Code, Claude Code, Cursor, Kiro, OpenCode |
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

| Resource | Purpose | Canonical shape |
|---|---|---|
| `/v1/conversations` | create or enumerate portable conversation identities | conversation descriptor |
| `/v1/capabilities` | report negotiated capabilities for one backend and one client projection | capability envelope |
| `/v1/conversations/{id}/messages` | submit user, system, approval, or tool messages for admission | `BackendMessage` plus admission metadata |
| `/v1/conversations/{id}/transcript` | read the materialized transcript in broker order | transcript snapshot |
| `/v1/conversations/{id}/turns/{seq}` | read one broker turn with its run and task state | `BackendTurn` |
| `/v1/conversations/{id}/runs/{runId}/cancel` | request lifecycle cancellation by stable run identity | cancellation request |
| `/v1/runs/{runId}/cancel` | optional global cancellation alias for the same lifecycle target | cancellation request |
| `/v1/conversations/{id}/approvals/{approvalId}` | resolve one hash-bound approval request | approval request and response envelope |

These paths are a resource vocabulary, not an HTTP requirement. A filesystem
broker, MCP tool surface, or durable task API may project the same resources
through different transports as long as the identifiers, fields, and replay
rules stay stable.

The canonical wire contract is the conversation resource model above. MCP may
carry broker operations for local convenience, but MCP itself is not the
portable conversation protocol.

## 4. Portable TypeScript contracts

The broker contracts are designed to live in one SDK-facing module and remain
independent from any host-specific tool schema.

```ts
export type BackendRunState =
  | 'queued'
  | 'admitted'
  | 'running'
  | 'waiting-input'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type BackendTaskState =
  | 'pending'
  | 'leased'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface BackendLease {
  leaseId: string;
  holderId: string;
  epoch: number;
  acquiredAt: string;
  expiresAt: string;
}

export interface BackendMessage {
  messageId: string;
  conversationId: string;
  kind:
    | 'user'
    | 'assistant'
    | 'system'
    | 'tool-call'
    | 'tool-result'
    | 'approval-request'
    | 'approval-response';
  role: 'user' | 'assistant' | 'system' | 'tool';
  createdAt: string;
  runId?: string;
  turnSeq?: number;
  taskId?: string;
  idempotencyKey?: string;
  causationId?: string;
  correlationId?: string;
  payloadHash: string;
  body: Record<string, unknown>;
}

export interface BackendAdmission {
  conversationId: string;
  messageId: string;
  runId: string;
  state: BackendRunState;
  admittedAt: string;
  expectedTurnSeq: number;
  lease?: BackendLease;
  replayed: boolean;
}

export interface BackendApprovalRequest {
  approvalId: string;
  version: number;
  conversationId: string;
  runId: string;
  turnSeq: number;
  scope: 'conversation' | 'turn' | 'task' | 'artifact';
  requestedAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  requestHash: string;
  payloadHash: string;
  prompt: string;
  options?: string[];
}

export interface BackendTurn {
  conversationId: string;
  runId: string;
  turnSeq: number;
  state: BackendRunState;
  startedAt: string;
  completedAt?: string;
  inputMessageIds: string[];
  outputMessageIds: string[];
  taskStates: Array<{
    taskId: string;
    state: BackendTaskState;
    executorId: string;
    epoch: number;
  }>;
  approval?: BackendApprovalRequest;
  transcriptHash: string;
}

export interface ConversationDescriptor {
  conversationId: string;
  backendKind: 'local' | 'mcp' | 'remote';
  title?: string;
  createdAt: string;
  updatedAt: string;
  currentRunState: BackendRunState;
  currentTurnSeq: number;
}

export interface ConversationTranscript {
  conversation: ConversationDescriptor;
  messages: BackendMessage[];
  turns: BackendTurn[];
  nextCursor?: string;
  lastAcceptedSeq: number;
  resumable: boolean;
}

export interface CapabilityEnvelope {
  clientCapabilities: string[];
  backendCapabilities: string[];
  policyCapabilities: string[];
  effectiveCapabilities: string[];
}

export interface ApprovalResponseInput {
  approvalId: string;
  requestHash: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  responseText?: string;
  leaseId: string;
  epoch: number;
}

export interface IConversationBackend {
  createConversation(input?: { title?: string; metadata?: Record<string, unknown> }):
    Promise<ConversationDescriptor>;
  getConversation(conversationId: string): Promise<ConversationDescriptor | null>;
  admitMessage(
    conversationId: string,
    message: Omit<BackendMessage, 'conversationId'>,
  ): Promise<BackendAdmission>;
  getTranscript(
    conversationId: string,
    options?: { afterTurnSeq?: number; cursor?: string; limit?: number },
  ): Promise<ConversationTranscript>;
  getCapabilities(conversationId?: string): Promise<CapabilityEnvelope>;
  getTurn(conversationId: string, turnSeq: number): Promise<BackendTurn | null>;
  subscribe(
    conversationId: string,
    listener: (event: BackendMessage | BackendTurn) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
  cancelRun(conversationId: string, runId: string, reason?: string): Promise<void>;
  respondApproval(
    conversationId: string,
    response: ApprovalResponseInput,
  ): Promise<BackendAdmission>;
  describe(): Promise<{
    backendKind: 'local' | 'mcp' | 'remote';
    supportsLeases: boolean;
    supportsApprovals: boolean;
    supportsPaging: boolean;
  }>;
}

export interface SquadBackend extends IConversationBackend {
  listTasks(runId: string): Promise<Array<{ taskId: string; state: BackendTaskState }>>;
  reportTaskState(taskId: string, state: BackendTaskState, detail?: Record<string, unknown>):
    Promise<void>;
}
```

`IConversationBackend` is the client-facing minimum surface. `SquadBackend`
extends it with the broker-owned lease and task operations needed by durable
or multi-worker control planes.

The shared backend contract is also where versioned commands and events are
defined. Hosts translate into and out of this contract, but they do not fork
its meaning.

Leases and checkpoints remain internal to the broker and execution planes. The
client-facing contract exposes only opaque resume hints such as `nextCursor`,
`lastAcceptedSeq`, and `resumable`.

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
2. broker returns `BackendAdmission` with the accepted run identity and next
   expected turn sequence;
3. execution publishes `BackendTurn` and resulting output messages back
   through the same conversation resource.

Repeated submission of the same idempotency key returns the original admission.
Reusing the key with a different payload hash is a conflict.

`runId` is exposed independently from turn sequence. `turnSeq` remains the
ordering and causation coordinate, while lifecycle cancellation and resumable
state target `runId`. Host completion signals are evidence for projection, not
the canonical lifecycle state.

## 7. Run and task state machine

Broker-level run state and execution-level task state are related but not
identical.

```text
run: queued -> admitted -> running -> waiting-input|waiting-approval
     -> completed|failed|cancelled|expired

task: pending -> leased -> running -> succeeded|failed|cancelled|expired
```

The broker turn is the join point. A run remains `running` while one or more
leased tasks continue in the execution plane. A run becomes
`waiting-approval` only when the broker has emitted a `BackendApprovalRequest`
and no successor admission has yet been recorded.

Lifecycle cancellation targets `runId` through a run-scoped cancel resource.
The backend may expose either the conversation-relative or global alias, but
both name the same stable run resource.

## 8. Hash-bound approvals

Approvals are durable versioned resources, not ordinary transcript messages or
ephemeral prompts. Approval replay safety is owned by the broker. Every
approval request carries:

- the canonical `requestHash` of the broker-emitted approval payload;
- an explicit `version`, `scope`, `status`, `runId`, and immutable
  `payloadHash`;
- an expiry timestamp;
- the conversation, run, and turn identities.

`respondApproval` succeeds only when the client echoes the same
`approvalId`, `requestHash`, and current approval `version`. If any of those
values are stale, the broker rejects the response and requires the client to
re-read the approval resource or conversation transcript before resubmitting.

## 9. Lease and epoch fencing

Leases fence concurrent writers in the control plane and execution plane.
Clients do not manipulate those leases directly. They only observe whether the
backend can resume from a cursor and which sequence was last durably accepted.

When the broker rotates an internal lease epoch, stale worker writes are
rejected instead of becoming last-writer-wins updates. This keeps a
disconnected worker from overwriting a newer broker decision after recovery
without leaking internal lease handles into client contracts.

## 10. Backend plug-in shapes

The same contract is projected through three backend families.

### 10.1 Local backend

The local backend runs broker and execution logic inside one process tree. It
typically stores transcript state in memory plus repository-local state
artifacts. This is the fastest development path and the reference surface for
single-user sessions.

### 10.2 MCP broker backend

The MCP backend projects the control plane through the `squad_state` server.
Conversation material may still live in local files or broker storage, but the
portable boundary is the MCP tool contract rather than direct file mutation.
This is the bridge used when a host can load `.mcp.json` but cannot link the
SDK directly.

MCP is treated here as an execution and tool transport, or as a local CLI
convenience bridge. It is behind the shared conversation contract, not a
replacement for it.

### 10.3 Remote durable backend

The remote backend maps the same conversation contract onto DurableSquad,
Durable Task Scheduler, or another remote orchestration fabric. Durable
workers own retries and checkpoints, but they still expose the same
conversation descriptors, admissions, turns, task states, approval hashes, and
lease epochs back to the client plane.

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
| `G3` | approvals are durable versioned resources with immutable payload hashes |
| `G4` | effective capabilities are negotiated as `client ∩ backend ∩ policy` |
| `G5` | recovery is cursor-based and exposes `lastAcceptedSeq` plus `resumable` |
| `G6` | cancellation targets `runId`, not host-local completion state |
| `G7` | operational health endpoints stay outside the protocol resource tree |
| `G8` | projections are loss-tolerant for unknown durable events and extensions |
| `G9` | the immutable golden fixtures in `test-fixtures/spec/suite-v0.2/` pass unchanged |

The architectural rationale for those gates is recorded in
[ADR 001: Client, Control, and Execution Boundary](adr-001-client-control-execution-boundary.md).

## 12. Golden conformance trace

The reference golden trace for this draft is:

```text
TurnAccepted(runId, seq)
-> ApprovalRequested(v1)
-> disconnect
-> reconnect(cursor)
-> ApprovalDecided(v2)
-> CancellationRequested(runId)
-> terminal state
```

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
   transcript paging, duplicate idempotency keys, and conflicting payload
   hashes;
2. lease and epoch traces that show stale worker writes being rejected after
   broker failover;
3. approval fixtures covering expired, replayed, and digest-mismatched
   responses;
4. one local backend, one MCP backend, and one remote durable backend passing
   the same contract tests;
5. sanitized transcript evidence that demonstrates the three-plane split
   without leaking tokens, tool secrets, or private prompt content.
