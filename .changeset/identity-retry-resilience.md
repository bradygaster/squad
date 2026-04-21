---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': patch
---

**H-03: Retry with exponential backoff** — `resolveTokenWithDiagnostics` and `resolveToken` now accept an optional `retryPolicy` parameter. When provided, transient failures (network errors, 5xx, 429 with `Retry-After` support) are retried with configurable exponential backoff and ±20% jitter. Non-retryable errors (4xx except 429, `AbortError`/timeout, `not-configured`) propagate immediately. Adds `GitHubApiError`, `RetryExhaustedError` and `RetryPolicy` to the SDK public API. `TokenResolveError` gains a `retriesExhausted: boolean` field.

**PR #22 nit fixes:**
- N-1: `getInstallationPermissions` now makes a single `GET /installation` call (removed the redundant preflight to `/installation/repositories`).
- N-2: `getInstallationPermissions` uses a dedicated `AbortController` per fetch (was sharing one across two sequential calls).
- N-3: `squad identity doctor` mode-0o600 check now detects WSL drvfs paths (mode reported as `0o777`) and skips the assertion with a `⚠ skipped (drvfs)` detail instead of false-failing.
