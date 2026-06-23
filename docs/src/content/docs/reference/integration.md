# SDK Integration Guide

This guide covers connecting to the Copilot SDK via Squad's adapter layer, managing sessions, handling events, and recovering from errors.

---

## SquadClient Setup

`SquadClient` wraps `@github/copilot-sdk` with lifecycle management and auto-reconnection:

```typescript
import { SquadClient } from '@bradygaster/squad-sdk';

const client = new SquadClient({
  port: 3000,
  auth: { token: process.env.COPILOT_TOKEN },
  reconnection: { maxRetries: 5, backoffMs: 1000 },
});

await client.connect();
```

The client tracks connection state via `SquadConnectionState`: `disconnected → connecting → connected → reconnecting → error`. Auto-reconnection uses exponential backoff with jitter.

---

## Session Management

Use `SquadClientWithPool` for production workloads — it composes `SquadClient`, `SessionPool`, and `EventBus`:

```typescript
import { SquadClientWithPool } from '@bradygaster/squad-sdk';

const squad = new SquadClientWithPool({
  client: clientOptions,
  pool: { maxConcurrent: 10, idleTimeout: 60_000 },
});

const session = await squad.createSession({ agent: 'backend' });
const response = await session.sendMessage('Implement the /users endpoint');
await session.destroy();
```

`SessionPool` enforces concurrency limits, runs health checks, and reaps idle sessions automatically. `SessionStatus` tracks each session through `creating → active → idle → error → destroyed`.

---

## Event Handling

`EventBus` provides typed pub/sub for session lifecycle events:

```typescript
squad.events.on('session.created', (event) => {
  console.log(`Session ${event.sessionId} started`);
});

squad.events.on('session.status_changed', (event) => {
  if (event.payload.status === 'error') {
    // handle degraded session
  }
});
```

Events include `session.created`, `session.destroyed`, `session.status_changed`, and tool execution events.

---

## Error Handling

All SDK errors are wrapped in `SquadError` subtypes with severity, category, and recoverability:

```typescript
try {
  await client.connect();
} catch (err) {
  if (err instanceof SDKConnectionError) {
    // Retryable — client will auto-reconnect
  } else if (err instanceof AuthenticationError) {
    // Fatal — check credentials
  }
}
```

Error classes:

| Class | Description |
|-------|-------------|
| `SDKConnectionError` | Connection failures (retryable) |
| `SessionLifecycleError` | Session create/destroy issues |
| `ToolExecutionError` | Tool handler failures |
| `ModelAPIError` | Model API call failures |
| `ConfigurationError` | Invalid configuration |
| `AuthenticationError` | Auth failures (fatal) |
| `RateLimitError` | Rate limit exceeded |
| `RuntimeError` | General runtime errors |
| `ValidationError` | Input validation failures |

Use `ErrorFactory` to wrap raw SDK errors with Squad context.

---

## Telemetry

`TelemetryCollector` tracks operation latency and error rates. `HealthMonitor` runs periodic connection checks returning `HealthCheckResult` with status (`healthy | degraded | unhealthy`) and response time.

---

## See Also

- [SDK API Reference](api-reference.md) — Full type and function reference
- [Tools & Hooks](tools-and-hooks.md) — Custom tools and hook pipeline
- [SDK Reference](sdk.md) — Quick reference
