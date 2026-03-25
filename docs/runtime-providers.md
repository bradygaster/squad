# Runtime Providers

> This document covers the `packages/squad-sdk` runtime provider layer — how Squad selects and uses AI coding agent backends.

## Overview

Squad supports multiple AI coding agent runtimes through the `RuntimeProvider` interface. Each provider wraps a different backend — GitHub Copilot's API or the Claude CLI subprocess — but exposes the same surface to the Squad orchestrator:

- Start and stop sessions
- Send messages
- Receive streaming events (deltas, completions, tool calls, errors)
- Query supported models
- Check whether a session is still alive

Switching runtimes is a one-line config change; no orchestration code changes are required.

---

## Provider Selection

Use `resolveRuntime()` from the SDK runtime module to get a configured provider instance.

```typescript
import { resolveRuntime } from '@bradygaster/squad-sdk/runtime';

// Default: Copilot
const provider = resolveRuntime();

// Explicit Copilot
const copilotProvider = resolveRuntime({
  runtime: 'copilot',
  copilot: { client: mySquadClient },
});

// Claude Code
const claudeProvider = resolveRuntime({
  runtime: 'claude-code',
  claudeCode: {
    claudeBin: '/usr/local/bin/claude', // optional, defaults to 'claude' on PATH
    sessionTimeout: 20 * 60 * 1000,    // optional, defaults to 30 minutes
  },
});
```

**Default:** `copilot`

---

## Copilot Provider

**Class:** `CopilotRuntimeProvider`

Wraps the existing `SquadClient` / `CopilotSessionAdapter` stack. No network calls are made directly — all communication goes through the `SquadClient` instance you supply.

### Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `client` | `SquadClient \| () => SquadClient \| Promise<SquadClient>` | Yes | A live client or a factory that produces one. The factory is called lazily on the first `startSession()` call. |

### Models

| Model | Notes |
|-------|-------|
| `gpt-4.1` | Default flagship |
| `gpt-4.1-mini` | Fast, lower cost |
| `gpt-4o` | Multimodal |
| `o3-mini` | Reasoning model |
| `claude-sonnet-4` | Anthropic model via Copilot |

### Event Mapping

Squad session events are translated to `RuntimeProviderEvent` types:

| Squad event | RuntimeProviderEvent type |
|-------------|--------------------------|
| `message_delta` | `message.delta` |
| `message` | `message.complete` |
| `turn_end` | `message.complete` |
| `tool_call` | `tool.call` |
| `tool_result` | `tool.result` |
| `error` | `error` (normalised to `RuntimeErrorPayload`) |
| `usage` | `message.complete` with `_usage: true` in payload |

### Retry Semantics

The Copilot provider does not implement its own retry loop. The underlying `SquadClient` manages connection pooling and transport-level retries transparently. From the provider's perspective, a session is alive as long as its entry exists in the registry. Errors that propagate to the `error` event surface are emitted with `retryable: false` because the client has already exhausted its own retry budget.

### `isSessionAlive(sessionId)`

Returns `true` when the session is present in the registry (i.e., `startSession` has been called and `shutdownSession` has not been called for it). Because SquadClient reconnects internally, registry presence is the reliable liveness signal.

---

## Claude Code Provider

**Class:** `ClaudeCodeRuntimeProvider`

Spawns a `claude --json` subprocess per session. Messages are written as JSON lines to `stdin`; JSON events are read from `stdout`.

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `claudeBin` | `string` | `'claude'` | Path to the `claude` binary. Must be executable. |
| `sessionTimeout` | `number` | `1800000` (30 min) | Idle timeout in milliseconds. The session is shut down automatically if no events are received within this window. |

### Prerequisites

- **Claude CLI installed** — `npm install -g @anthropic-ai/claude-code` or equivalent
- The `claude` binary must be on `PATH` (or pass `claudeBin` explicitly)
- A valid Anthropic API key in the environment (`ANTHROPIC_API_KEY`)

### Models

| Model | Notes |
|-------|-------|
| `claude-sonnet-4-6` | Balanced performance |
| `claude-opus-4-6` | Highest capability |
| `claude-haiku-4-5` | Fast, lightweight |

### Event Mapping

| Claude CLI JSON event | RuntimeProviderEvent type |
|----------------------|--------------------------|
| `content_block_delta` | `message.delta` |
| `message` / `content_block_stop` | `message.complete` |
| `tool_use` | `tool.call` |
| `tool_result` | `tool.result` |
| `error` | `error` (normalised to `RuntimeErrorPayload`) |
| stderr line | `error` with `code: 'STDERR'` |
| Non-JSON stdout | `message.delta` (plain text passthrough) |

### Session Timeout

If no events are received for `sessionTimeout` milliseconds, the provider:

1. Emits an `error` event with `code: 'TIMEOUT'` and `retryable: false`
2. Calls `shutdownSession()` automatically

The timer is reset on every received event. It runs as an unref'd Node.js timer so it does not block process exit.

### `isSessionAlive(sessionId)`

Returns `true` when all of the following hold:

- The session exists in the registry
- `shutdownSession` has not been called for it
- The subprocess `exitCode` is `null` (still running)
- The subprocess has not been killed

---

## Compatibility Matrix

| Feature | Copilot | Claude Code |
|---------|---------|-------------|
| Chat | Yes | Yes |
| Tool calling | Yes | Yes |
| Streaming | Yes | Yes |
| Session timeout | Via SquadClient adapter | 30 min default (configurable) |
| `isSessionAlive` | Registry presence | Subprocess liveness check |
| Models | 5 | 3 |
| Requires subscription | GitHub Copilot | Anthropic API key |
| Subprocess management | No | Yes |

---

## Error Payload Shape

All providers emit `error` events with a normalised `RuntimeErrorPayload`:

```typescript
interface RuntimeErrorPayload {
  /** Human-readable description of what went wrong. */
  message: string;
  /** Machine-readable error code (e.g. 'TIMEOUT', 'STDERR', 'SUBPROCESS_EXIT'). */
  code?: string;
  /**
   * Whether the caller may reasonably retry.
   * undefined = provider cannot determine retryability.
   */
  retryable?: boolean;
  /** Any additional diagnostic fields from the underlying transport. */
  [key: string]: unknown;
}
```

Listening for errors:

```typescript
const unsubscribe = await provider.onEvent(sessionId, (event) => {
  if (event.type === 'error') {
    const err = event.payload as RuntimeErrorPayload;
    console.error(`[${err.code ?? 'ERROR'}] ${err.message}`);
    if (err.retryable) {
      // safe to call startSession() and retry
    }
  }
});
```

---

## Template Tokens

Squad templates that reference the active coding agent use these placeholder tokens:

| Token | Description |
|-------|-------------|
| `{{CODING_AGENT_HANDLE}}` | The agent's @-handle (e.g. `@copilot`) |
| `{{CODING_AGENT_LABEL}}` | Display name (e.g. `GitHub Copilot`) |
| `{{CODING_AGENT_ASSIGNEE}}` | Issue/PR assignee identifier |

These tokens are resolved at template render time based on the active provider configuration. See `.squad-templates/` for the bundled templates.

---

## Troubleshooting

### Copilot Provider

**`Copilot runtime provider requires a SquadClient`**
Pass `{ copilot: { client: squadClientInstance } }` to `resolveRuntime()`. The client is required and cannot be inferred.

**Events stop arriving**
Check that the underlying `SquadSession` is still open. The Copilot provider tears down event wiring in `shutdownSession()` — if you see no events after a period of inactivity, the session may have been closed by the remote server. Call `isSessionAlive(sessionId)` to check, then start a new session if needed.

### Claude Code Provider

**`Claude binary not found or not executable`**
Install the Claude CLI: see [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code). Ensure the binary is on your `PATH` or pass the absolute path via `claudeBin`.

**Session times out immediately**
The `sessionTimeout` clock starts at `startSession()` and resets on every event. If the subprocess takes longer than the timeout to produce its first output, increase `sessionTimeout` or check that the `claude` binary starts correctly (`claude --version`).

**`Session subprocess has already exited`**
The `claude` process exited before `shutdownSession()` was called. Check stderr output (emitted as `error` events with `code: 'STDERR'`) for the exit reason. Common causes: missing API key, rate limit, or OOM.

**Large amounts of non-JSON output**
The Claude CLI produces JSON in `--json` mode. Plain-text lines are passed through as `message.delta` events. Lines larger than 1 MiB are dropped with an `error` event (`code: 'OVERSIZE_LINE'`). If you see many oversize errors, verify the `claude` binary version supports `--json`.
