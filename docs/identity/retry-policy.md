# Identity Retry Policy

**Added:** 2026-04-21 (H-03, PR #23)  
**Applies to:** `resolveToken` / `resolveTokenWithDiagnostics` in `@bradygaster/squad-sdk`

---

## Overview

Token resolution is opt-in retry. Pass a `retryPolicy` to enable it:

```typescript
const result = await resolveTokenWithDiagnostics(squadDir, 'lead', {
  retryPolicy: { maxRetries: 2, initialDelayMs: 500 },
});
```

Without `retryPolicy`, a single attempt is made (backward-compatible default).

---

## RetryPolicy fields

| Field | Default | Description |
|-------|---------|-------------|
| `maxRetries` | 2 | Retry attempts after the initial try |
| `initialDelayMs` | 500 | Base delay for attempt 0 |
| `maxDelayMs` | 4000 | Cap on computed delay before jitter |
| `onRetry` | — | `(attempt, reason, delayMs) => void` — observability hook |
| `random` | `Math.random` | Injectable RNG for deterministic tests |

Delay formula: `min(maxDelayMs, initialDelayMs × 2^attempt) ± 20% jitter`

---

## What retries

| Condition | Retries? | Notes |
|-----------|---------|-------|
| Network error (fetch rejection, ECONNRESET) | ✅ | Transient infrastructure fault |
| 5xx response | ✅ | Transient server error |
| 429 rate limit | ✅ | Uses `Retry-After` header if present, else backoff |
| 4xx except 429 | ❌ | Bad credentials don't benefit from retry |
| `AbortError` / timeout | ❌ | Per-attempt budget already expired |
| `not-configured` error | ❌ | Missing credentials aren't transient |

---

## Timeout semantics

Each attempt has its own 10-second `AbortController` budget (created inside `getInstallationToken`). Retries do **not** share a single global timeout.

Total wall time upper bound: `(maxRetries + 1) × 10s + cumulative backoff delays`.

With defaults: `3 × 10s + (500 + 1000)ms = ~31.5s` worst case.

---

## Error fields

`TokenResolveError` now includes:

```typescript
interface TokenResolveError {
  kind: 'not-configured' | 'runtime';
  message: string;
  retriesExhausted: boolean;  // true when retry budget was used up
}
```

`retriesExhausted: true` only when a `retryPolicy` was provided and all attempts failed on retryable errors. Always `false` for `not-configured` and for non-retryable errors.

---

## Observability via doctor

`squad identity doctor` can hook into retries via `onRetry`:

```typescript
const retryEvents: string[] = [];
await resolveTokenWithDiagnostics(dir, role, {
  retryPolicy: {
    onRetry: (attempt, reason, delayMs) => {
      retryEvents.push(`attempt ${attempt}: ${reason} (wait ${delayMs}ms)`);
    },
  },
});
```

---

## Testing with injectable random

Use `random: () => number` to get deterministic delays in tests:

```typescript
// No jitter — delay is exactly the base value
retryPolicy: { initialDelayMs: 100, random: () => 0.5 }

// Max negative jitter (−20%)
retryPolicy: { initialDelayMs: 100, random: () => 0 }  // → 80ms

// Max positive jitter (+20%)
retryPolicy: { initialDelayMs: 100, random: () => 1 }  // → 120ms
```
