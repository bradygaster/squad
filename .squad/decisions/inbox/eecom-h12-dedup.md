# H-12 — Concurrent same-role token dedup

**By:** EECOM
**Date:** 2026-04-21
**Roadmap:** `docs/proposals/identity-hardening-roadmap-2026-04-20.md` H-12

## What

`resolveToken(squadDir, role)` now dedups concurrent misses via an
`inFlight: Map<string, Promise<TokenResolveResult>>`. Two simultaneous callers
for the same `(squadDir, role)` share one `getInstallationToken` call; the slot
is released on success AND failure so the next caller starts fresh.

The in-flight layer sits **in front of** the existing token cache. Cache hits
never enter the in-flight map.

## Why

Multi-agent workflows regularly resolve the same role's token concurrently
(e.g., two subagents spawning under `lead`). Pre-fix, both issued independent
`POST /app/installations/:id/access_tokens` calls and both results raced into
the cache. Wasted API call + needless rate-limit exposure.

## Tests

`test/identity/dedup.test.ts` — 5 tests: concurrent callers share a promise,
single fetch invocation, diagnostics-path parity, different roles not deduped,
failure releases the slot, cache-hit path bypasses in-flight.

All 194 identity tests pass.
