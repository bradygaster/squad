# EECOM: Identity Quick Wins decisions

**Date:** 2026-04-21  
**Author:** EECOM (Coding Agent)  
**Branch:** `squad/identity-quick-wins`

## Decisions made

1. **`TokenResolveError` shape** — `{ kind: 'not-configured' | 'runtime', message: string }` — avoids catch-all errors and allows callers to gate on configuration issues vs. runtime failures.

2. **Async wrapper pattern** — `generateAppJWT` is async (returns rejected Promise on bad PEM) while internal `buildJWT` is sync. This satisfies H-02 tests (`await expect(...).rejects.toThrow()`) AND H-01 fake timer tests (where sync `buildJWT` must be called before `vi.advanceTimersByTime()`).

3. **Cache key format** — `${projectRoot}:${roleKey}` rather than bare `roleKey` to prevent token cache pollution between tests that use different project roots but the same role slug.

4. **Partial env detection is a hard error** — When 1-2 of 3 required env vars are set, the function returns an error (no fallthrough to filesystem). This avoids silently ignoring misconfiguration.

5. **`isCliInvocation` IIFE export** — Exported so tests can assert on the value; computed lazily at module load time so ESM test imports get `false` (vitest runner != script path).
