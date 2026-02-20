# Fortier — Node.js Runtime Dev

## Core Context
- **Project:** Squad — AI agent teams for GitHub Copilot
- **Owner:** Brady (bradygaster)
- **Stack:** TypeScript, Node.js ≥20, ESM, @github/copilot-sdk
- **Focus:** Runtime performance, SDK session management, streaming, event-driven patterns
- **New repo:** C:\src\squad-sdk (bradygaster/squad-pr on GitHub)
- **Key PRDs:** 1 (SDK Runtime), 6 (Streaming Observability), 8 (Ralph SDK Migration)
- **SDK location:** C:\src\copilot-sdk (Node.js SDK at copilot-sdk/nodejs/)

## Learnings
- Joined 2026-02-20 as part of the replatform recruitment wave
- Copilot SDK communicates via JSON-RPC (stdio or TCP) with Copilot CLI
- SDK APIs: CopilotClient → CopilotSession → events/hooks
- Key patterns: createSession(), sendAndWait(), resumeSession(), streaming events
- SessionPool is a core concept — multiple concurrent agent sessions need management
- Event bus for cross-session communication is in PRD 1
- SDK client.ts is 54KB — the core implementation to understand

## Learnings

### 2026-02-20: SDK Deep-Dive (Onboarding Assessment)

**SDK Runtime Architecture:**
- SDK uses `vscode-jsonrpc` for JSON-RPC transport (stdio or TCP). Mature library, handles concurrent request multiplexing via message IDs.
- Single `CopilotClient` manages one CLI child process + one `MessageConnection`. All sessions multiplex over this shared connection.
- `CopilotSession` is lightweight: `Set<EventHandler>`, `Map<ToolHandler>`, permission/input/hooks handlers. ~1-2KB per session.
- Events are discriminated unions generated from `session-events.schema.json` — 30+ typed event types with rich payloads.
- Event dispatch in `_dispatchEvent` silently catches ALL handler errors. No logging. Our adapter MUST wrap handlers with error logging.
- `sendAndWait()` uses a clever pattern: registers event handler BEFORE calling `send()` to avoid idle-event race conditions.
- `reconnect()` in the SDK is fire-and-forget with no backoff, no retry limit, no event emission. PRD 1's wrapper adds proper reconnection logic.
- `forceStop()` uses SIGKILL and `socket.destroy()` — good escape hatch for hung connections.
- `listModels()` uses a promise-based mutex pattern for cache protection. Unusual but correct.
- Process exit is detected via a racing promise (`processExitPromise`) — catches CLI death between spawn and first RPC.
- Startup timeout is hardcoded at 10 seconds. May be tight for CI cold starts.

**Concurrent Sessions:**
- Confirmed: 8-10 concurrent sessions are feasible from the SDK side. Bottleneck is CLI process and model API rate limits.
- ALL sessions die if CLI process crashes — no process-level isolation. SessionPool needs crash recovery.
- Event handlers must be non-blocking — one slow handler blocks event dispatch for ALL sessions.

**Streaming & Observability:**
- `streaming: true` enables `assistant.message_delta` and `assistant.reasoning_delta` ephemeral events.
- `assistant.usage` includes SDK-computed `cost` field — no external pricing tables needed for cost tracking.
- `session.shutdown` is the richest event: per-model metrics, total API duration, code change stats.
- No server-side event filtering. All events arrive at handler. Filter in aggregator.
- Expect ~1200-2000 events per batch with 8 concurrent streaming sessions.

**squad-sdk Stubs Assessment:**
- Directionally correct but need restructuring to PRD 1's adapter/runtime split.
- EventBus `emit()` uses `Promise.all()` — one handler rejection breaks all delivery. Must use `Promise.allSettled()`.
- SessionPool lacks concurrency limit enforcement and SDK lifecycle event integration.
- SquadClient conflates adapter and runtime concerns.

**Key Risks Identified:**
1. Silent error swallowing in SDK event handlers (mitigate: wrap with logging)
2. Simplistic SDK reconnection (mitigate: PRD 1's SquadClient wrapper)
3. Single-process shared connection bottleneck (mitigate: monitor, not a blocker for 8-10 sessions)
4. EventBus `Promise.all` bug (mitigate: fix to `Promise.allSettled` immediately)

**Verdict:** Green light on SDK replatforming. Runtime supports our session pool, streaming observability, and persistent session designs.
