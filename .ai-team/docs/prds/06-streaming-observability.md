# PRD 6: Streaming Observability

**Owner:** Kujan (Copilot SDK Expert)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 2 (v0.7.0 — requires coordinator as Node.js process)
**Dependencies:** PRD 1 (SDK Integration Core), PRD 2 (Session Management)

## Problem Statement

Squad currently has zero visibility into what agents are doing while they work. The coordinator spawns agents via `task` tool with `mode: "background"` and polls with `read_agent` (30s default timeout) — a pattern that caused the P0 silent success bug (Proposal 015). Users see nothing between "spawning agents" and final results. When an agent takes 45 seconds, there's no way to know if it's stuck, thinking, or running an expensive tool call.

## Goals

1. Real-time visibility into every active agent session (what tool is running, what file is being edited, what model is being called)
2. Token usage tracking per agent, per session, per batch — with cost estimation
3. Live progress display for CLI and VS Code hosts
4. Diagnostics output for debugging slow or failed agent runs
5. Session event replay for post-mortem analysis of failed runs
6. Export format for external dashboards (Grafana, Datadog, custom)

## Non-Goals

- Building a web-based dashboard UI (external tools consume our export format)
- Replacing SDK event system with custom implementation
- Per-token streaming to end users (SDK handles message deltas; we aggregate)
- Historical analytics across sessions (this PRD is real-time + single-session replay)

## Background

The SDK's event system (verified in `nodejs/src/generated/session-events.ts`) provides 30+ strongly-typed event types with rich payloads. Key events for observability:

| Event | Payload | Use |
|-------|---------|-----|
| `tool.execution_start` | `toolCallId`, `toolName`, `arguments`, `mcpServerName` | Live "what is agent doing" |
| `tool.execution_complete` | `toolCallId`, `success`, `result` | Tool duration tracking |
| `tool.execution_progress` | `toolCallId`, `progressMessage` | Streaming progress |
| `assistant.usage` | `model`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cost`, `duration` | Token/cost tracking |
| `assistant.message_delta` | `messageId`, `deltaContent` | Streaming text |
| `assistant.intent` | `intent` | High-level "what agent plans to do" |
| `session.compaction_start/complete` | compaction metrics | Context management visibility |
| `session.shutdown` | `totalPremiumRequests`, `totalApiDurationMs`, `modelMetrics`, `codeChanges` | Per-session summary |
| `session.usage_info` | `tokenLimit`, `currentTokens`, `messagesLength` | Context pressure gauge |
| `session.idle` | (empty) | Agent completion signal |

The `session.shutdown` event is particularly rich — it includes per-model request counts, costs, token breakdowns (input/output/cache), total API duration, and code change metrics (lines added/removed, files modified). This single event is a session-level summary.

The `assistant.usage` event includes `cost` as a number — the SDK already computes cost per API call. Squad doesn't need external pricing data for basic cost tracking (revising the gap identified in the opportunity analysis).

## Proposed Solution

### Architecture

```
Agent Sessions (N concurrent)
    ↓ events (session.on)
Event Aggregator (Node.js, in-process)
    ↓ normalized events
Event Bus (EventEmitter)
    ├→ Live Display Renderer (CLI table / VS Code output)
    ├→ Token Tracker (per-agent, per-session, per-batch accumulators)
    ├→ Event Logger (append-only JSONL to .squad/logs/)
    └→ Export Adapter (OTLP / StatsD / webhook)
```

### 1. Event Aggregator

The coordinator (Phase 2 Node.js process) subscribes to all agent session events via `session.on()`:

```typescript
// Subscribe to all events from all active sessions
function subscribeToAgent(session: CopilotSession, agentName: string) {
  session.on((event) => {
    eventBus.emit('agent-event', {
      agentName,
      sessionId: session.sessionId,
      event,
      receivedAt: Date.now()
    });
  });
}
```

Events are session-scoped in the SDK (confirmed: no global event subscription). The aggregator maintains a `Map<sessionId, agentName>` to correlate sessions to Squad members. Every event gets a `receivedAt` timestamp for latency measurement (SDK `timestamp` is generation time; difference = transport latency).

### 2. Live Progress Display

Render a live status table updated on each event:

```
┌─────────┬────────────────────────────┬────────────┬───────────┐
│ Agent   │ Status                     │ Tokens     │ Cost      │
├─────────┼────────────────────────────┼────────────┼───────────┤
│ Ripley  │ 🔧 edit: src/auth.ts       │ 2,341 in   │ $0.012    │
│ Dallas  │ 💭 thinking...             │ 1,890 in   │ $0.008    │
│ Hockney │ ✅ idle (completed)        │ 4,102 in   │ $0.021    │
│ Scribe  │ ⏳ waiting                 │ 0          │ $0.000    │
└─────────┴────────────────────────────┴────────────┴───────────┘
Batch total: 8,333 input / 3,201 output │ Est. $0.041 │ 23s elapsed
```

Status derivation from events:
- `tool.execution_start` → "🔧 {toolName}: {args summary}"
- `assistant.message_delta` → "💭 thinking..."
- `assistant.intent` → "📋 {intent}" (SDK provides this)
- `session.idle` → "✅ idle (completed)"
- `session.compaction_start` → "🗜️ compacting context..."
- `session.error` → "❌ error: {message}"
- No recent events → "⏳ waiting"

For CLI: Use ANSI escape codes for in-place table updates (or `ora`/`cli-table3`).
For VS Code: Output channel with structured logging (VS Code Extension API, future work).

### 3. Token & Cost Tracking

Accumulate from `assistant.usage` events:

```typescript
interface AgentMetrics {
  agentName: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;      // From assistant.usage.cost (SDK-provided)
  apiCalls: number;
  totalApiDurationMs: number;
  modelBreakdown: Map<string, { calls: number; tokens: number; cost: number }>;
}
```

The `assistant.usage` event fires per API call with `model`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `cost`, and `duration`. The `cost` field means Squad gets per-call cost from the SDK without needing external pricing tables.

At session end, `session.shutdown` provides a validated summary with `modelMetrics` — a map of model name to `{ requests: { count, cost }, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }`. Cross-reference accumulated metrics against shutdown summary for accuracy validation.

Batch-level tracking: sum all agent metrics for the current user request.

### 4. Diagnostics Output

When an agent takes unusually long (>30s without `session.idle`), emit diagnostics:

```typescript
// Detect slow agents
const SLOW_THRESHOLD_MS = 30_000;
setInterval(() => {
  for (const [sessionId, state] of activeSessions) {
    const elapsed = Date.now() - state.lastEventAt;
    if (elapsed > SLOW_THRESHOLD_MS && state.status !== 'idle') {
      emitDiagnostic({
        agentName: state.agentName,
        sessionId,
        elapsed,
        lastEvent: state.lastEvent,
        tokensSoFar: state.metrics.inputTokens + state.metrics.outputTokens,
        pendingTool: state.currentToolCall,
        contextUtilization: state.lastUsageInfo?.currentTokens / state.lastUsageInfo?.tokenLimit
      });
    }
  }
}, 5_000);
```

Diagnostics include:
- Which tool is currently executing and for how long
- Context window utilization (from `session.usage_info` events)
- Whether compaction is in progress (may explain pause)
- Token spend so far vs. similar past sessions
- Model being used (some models are slower)

### 5. Event Log (JSONL)

All events persisted to `.squad/logs/{batch-id}.jsonl`:

```jsonl
{"ts":1708444800000,"agent":"Ripley","session":"squad-ripley-1708444800","type":"tool.execution_start","data":{"toolName":"edit","toolCallId":"tc_1"}}
{"ts":1708444801200,"agent":"Ripley","session":"squad-ripley-1708444800","type":"tool.execution_complete","data":{"toolCallId":"tc_1","success":true}}
{"ts":1708444801500,"agent":"Ripley","session":"squad-ripley-1708444800","type":"assistant.usage","data":{"model":"gpt-5.2-codex","inputTokens":1200,"outputTokens":340,"cost":0.008}}
```

JSONL format: one JSON object per line, streamable, greppable, compatible with `jq`.

### 6. Session Replay

Load a JSONL event log, replay events through the display renderer at original timing (or accelerated):

```typescript
async function replaySession(logPath: string, speed: number = 1) {
  const events = readJsonlFile(logPath);
  let prevTs = events[0].ts;
  for (const event of events) {
    const delay = (event.ts - prevTs) / speed;
    await sleep(delay);
    displayRenderer.processEvent(event);
    prevTs = event.ts;
  }
}
```

Use cases: debugging why an agent failed, understanding where time was spent, training new users on Squad behavior.

### 7. Export Format

OpenTelemetry-compatible spans for external dashboards:

- Each agent session = a trace (traceId = batchId, spanId = sessionId)
- Each tool execution = a child span (tool.execution_start → tool.execution_complete)
- Token metrics as span attributes
- Export via OTLP/HTTP or StatsD UDP

Phase 2 stretch goal. Phase 1 focuses on JSONL logs + CLI display.

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| SDK `assistant.usage.cost` is sufficient for cost tracking | ✅ Decided | SDK computes cost per API call. No external pricing tables needed for v1. |
| JSONL for event persistence, not SQLite | ✅ Decided | Streamable, greppable, no dependency. SQL queries via `jq` or post-processing. |
| Event aggregator runs in-process (not sidecar) | ✅ Decided | Phase 2 coordinator is Node.js — in-process is simplest. Sidecar adds IPC complexity. |
| Live display is CLI-first | ✅ Decided | VS Code output channel is future work. CLI is the primary host for Phase 2. |
| OpenTelemetry export format | 🔄 Pending | Need to validate OTLP/HTTP adds value vs. JSONL + external converter. |

## Implementation Notes

### SDK Event Subscription Pattern

Events are per-session (`session.on(handler)`). No client-level "subscribe to all sessions" exists. The aggregator must subscribe to each session individually at creation time. This is acceptable — the coordinator creates all sessions and can subscribe immediately.

```typescript
const session = await client.createSession({ ... });
subscribeToAgent(session, agentName);  // Must be called before sendAndWait
await session.sendAndWait({ prompt: task });
```

### Event Filtering

SDK provides no server-side event filtering. All events arrive at the handler. Filter in the aggregator:

```typescript
const TRACKED_EVENTS = new Set([
  'tool.execution_start', 'tool.execution_complete', 'tool.execution_progress',
  'assistant.usage', 'assistant.message_delta', 'assistant.intent',
  'session.idle', 'session.error', 'session.compaction_start',
  'session.compaction_complete', 'session.shutdown', 'session.usage_info'
]);
```

### Ephemeral vs. Persistent Events

SDK marks some events as `ephemeral: true` (e.g., `session.idle`, `assistant.message_delta`, `assistant.usage`, `session.usage_info`). Ephemeral events are not persisted in session checkpoints. Squad's JSONL logger captures ALL events (including ephemeral) — the SDK's persistence decisions don't affect Squad's observability.

### Context Pressure Gauge

`session.usage_info` provides `tokenLimit` and `currentTokens`. Squad can display context utilization as a percentage:

```
Ripley: 67% context (85,760 / 128,000 tokens)
```

When `session.compaction_start` fires, display transitions to "🗜️ compacting..." until `session.compaction_complete`. The complete event includes `preCompactionTokens`, `postCompactionTokens`, `tokensRemoved`, and `checkpointNumber`.

### Shutdown Metrics

`session.shutdown` is the richest single event — it provides:
- `totalPremiumRequests`: Total API calls
- `totalApiDurationMs`: Total time in API calls
- `modelMetrics`: Per-model breakdown of requests, costs, and token usage
- `codeChanges`: Lines added/removed, files modified

This is the authoritative session summary. Write it to `.squad/logs/{batch-id}-summary.json`.

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Event volume overwhelms JSONL writer in large teams (10+ agents) | Medium | Buffer writes, flush every 100ms or 100 events. JSONL is append-only — fast. |
| `assistant.usage.cost` may not be available for BYOK providers | High | Fall back to token-based estimation with configurable $/1K rates in `.squad/config.json`. |
| Live display flickers on rapid event bursts | Low | Throttle display updates to 4fps (250ms minimum between renders). |
| Event subscription race condition (events before handler registered) | Medium | Subscribe BEFORE calling `session.send()` — SDK example code confirms this pattern. |
| SDK removes or renames event types in future versions | Medium | Adapter pattern: map SDK events to Squad's internal event schema. SDK changes update adapter only. |
| BYOK providers may not emit `assistant.usage` events | High | Detect missing usage events after first API call. If absent, show "cost tracking unavailable" and log warning. |

## Success Metrics

1. **Live display latency:** <500ms from SDK event to rendered display update
2. **Token accuracy:** Accumulated metrics match `session.shutdown.modelMetrics` within 1%
3. **Cost visibility:** Users can see estimated cost before batch completes
4. **Debug utility:** Diagnostics output identifies root cause of slow agents (>30s) in 80% of cases
5. **Replay fidelity:** Replayed session matches original event sequence exactly
6. **Zero overhead when disabled:** Observability off = no event handlers registered, no disk I/O

## Open Questions

1. **Quota tracking:** `assistant.usage` includes `quotaSnapshots` with remaining percentage and reset date. Should Squad surface this (e.g., "⚠️ 12% quota remaining, resets Feb 21")?
2. **Per-agent cost budgets:** Should Squad support "stop agent if cost exceeds $X"? The `onPostToolUse` hook could intercept after each API call and abort the session.
3. **Event retention policy:** How long to keep JSONL logs? Auto-cleanup after N days? Compress after 24h?
4. **VS Code integration:** Output channel vs. webview panel vs. tree view for live status? Deferred to VS Code PRD.
5. **Multi-model sessions:** If an agent switches models mid-session (via `session.model_change` event), how does cost tracking attribute correctly? Answer: `assistant.usage` includes `model` per call — track per-call, not per-session.
