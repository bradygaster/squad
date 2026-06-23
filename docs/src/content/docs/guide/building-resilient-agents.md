---
title: "Building resilient agents"
description: "Use the circuit breaker pattern to handle transient failures gracefully."
---

Long-running agents face inevitable transient failures: rate limits, network timeouts, upstream service degradation. The circuit breaker pattern protects your agents from cascading failures by stopping requests before they fail, and automatically recovering when the system stabilizes.

> **The circuit breaker works out of the box.** Squad includes sensible defaults for your agents. You only need to configure it if you want to customize thresholds or backoff timing. See [Configuration](#configuration) for details.

---

## The circuit breaker state machine

The circuit breaker operates in three states:

| State | Behavior | Transition |
|-------|----------|------------|
| **CLOSED** | Requests pass through normally | Open on threshold exceeded |
| **OPEN** | Requests fail fast without attempting | Half-open after backoff timeout |
| **HALF-OPEN** | Allow a single probe request to test recovery | Closed if probe succeeds; open if fails |

When failures exceed the configured threshold within a time window, the breaker **opens** to prevent further failing requests. After the backoff timeout, it enters **half-open** to test if the system has recovered. A successful probe closes the circuit; a failure re-opens it.

---

## Exponential backoff strategy

Instead of hammering a recovering service, the circuit breaker uses exponential backoff:

- **Initial:** 2 minutes
- **Second attempt:** 4 minutes
- **Third attempt:** 8 minutes
- **Cap:** 30 minutes

Each failed probe attempt resets the backoff. This gives flaky services time to recover without overwhelming them.

---

## Configuration

Squad includes sensible defaults — most agents won't need to change these. Configure the circuit breaker in your agent's `squad.json` or initialization code only if you want to customize:

```json
{
  "resilience": {
    "circuitBreaker": {
      "failureThreshold": 5,
      "successThreshold": 2,
      "timeWindow": 60000,
      "initialBackoff": 120000,
      "maxBackoff": 1800000
    }
  }
}
```

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `failureThreshold` | 5 | Open circuit after this many failures |
| `successThreshold` | 2 | Close circuit after this many successes in half-open |
| `timeWindow` | 60s | Count failures within this window |
| `initialBackoff` | 2m | Start backoff at this duration |
| `maxBackoff` | 30m | Cap backoff at this duration |

---

## Persistent state across restarts

The circuit breaker persists its state to disk. If an agent restarts while the circuit is open, it resumes from the same state — it won't immediately resume hammering a still-recovering service. This ensures resilience survives process restarts.

---

## How to apply to custom agents

When building a custom agent, wrap your external calls with circuit breaker protection:

```typescript
import { CircuitBreaker } from '@squad/resilience';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  timeWindow: 60000,
});

async function callDownstreamAPI() {
  return breaker.execute(async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  });
}

// Circuit breaker automatically handles state transitions
// and exponential backoff — just call it.
try {
  const data = await callDownstreamAPI();
} catch (err) {
  if (err.code === 'CIRCUIT_OPEN') {
    console.log('Circuit is open; retrying later');
  } else {
    console.error('Request failed:', err);
  }
}
```

When the circuit opens, `execute()` throws a `CIRCUIT_OPEN` error. Your agent can catch this and backoff gracefully, or fail-fast to upstream callers.

---

## Monitoring and observability

Emit metrics on circuit breaker state changes:

- **Circuit opened:** Alert on repeated failures
- **Circuit half-open:** Monitor probe requests
- **Circuit closed:** No action needed

Log state transitions and include the circuit state in agent status or dashboards. This helps you correlate agent degradation with downstream service issues.

---

## See also

- [PR #552](https://github.com/bradygaster/squad/pull/552) — Circuit breaker implementation
- [Failure handling](../reference/tools-and-hooks) — Error boundaries and fallbacks
