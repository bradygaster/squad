# PR #23 Review — H-03 Retry Resilience + PR #22 Nits

**Reviewer:** Flight (Lead)  
**Date:** 2026-04-21  
**PR:** https://github.com/sabbour/squad/pull/23  
**Branch:** `squad/identity-retry-resilience` → `dev`  
**Author:** EECOM (working as Core Dev)  
**Verdict:** ✅ Approve

---

## Hard Checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Changeset package names | ✅ | `@bradygaster/squad-sdk: minor`, `@bradygaster/squad-cli: patch` — correct |
| 2 | Opt-in retry (zero behavior change without policy) | ✅ | `options?: { retryPolicy?: RetryPolicy }` — when omitted, single attempt, no wrapper overhead |
| 3 | Retry filter correctness | ✅ | See filter table below |
| 4 | Timeout: fresh AbortController per attempt | ✅ | Each `getInstallationToken` call creates its own controller + 10s timer |
| 5 | Jitter determinism via injectable `random` seam | ✅ | `random: () => 0.5` = no jitter; algebraic test verifies formula |
| 6 | Retry-After honoring on 429 | ✅ | Uses header delay (seconds → ms), test asserts `delayMs === 2000` for `Retry-After: 2` |
| 7 | `retriesExhausted` field correctness | ✅ | `true` only when `RetryExhaustedError` caught; all other paths = `false` |
| 8 | Token leakage | ✅ | No tokens in error messages, logs, or stderr output |
| 9 | Protected files (`resolve-token.mjs`) | ✅ | Not touched — only reference is in EECOM history entry |
| 10 | Scope creep (H-09, H-12/13/14, canonicalization) | ✅ | Clean scope: H-03 + 3 nits only |

### Retry filter verification

| Condition | Expected | Actual | Test |
|-----------|----------|--------|------|
| Network error (ECONNRESET) | Retry | ✅ `isRetryable` falls through to `return true` | `network error (fetch rejection) IS retried` |
| 5xx | Retry | ✅ `e.status >= 500` | `retry on 500 then succeed` |
| 429 with Retry-After | Retry (header delay) | ✅ `retryAfterMs` used | `retry on 429 with Retry-After` |
| 429 without Retry-After | Retry (backoff) | ✅ Falls to exponential path | Covered implicitly by filter logic |
| 4xx except 429 | No retry | ✅ `GitHubApiError` status < 500 and ≠ 429 | `4xx other than 429 does NOT retry` |
| AbortError / timeout | No retry | ✅ `e.name === 'AbortError'` early return | `AbortError does NOT retry` |
| `not-configured` | No retry | ✅ Returns before `withRetry` is invoked | `not-configured does NOT retry` |

---

## PR #22 Nit Verification

| Nit | Fixed? | Detail |
|-----|--------|--------|
| **N-1:** Redundant preflight GET | ✅ | `getInstallationPermissions` now makes single `GET /installation` — removed `/installation/repositories?per_page=1` |
| **N-2:** Shared AbortController | ✅ | Moot (N-1 removes second fetch), but remaining single fetch has dedicated controller |
| **N-3:** drvfs false-fail on 0o777 | ✅ | Checks `mode === 0o777` specifically (not any non-0o600). Returns `⚠ skipped (drvfs)` with `ok: true, skipped: true`. Test verifies via `chmodSync(pemPath, 0o777)` |

---

## Nits (non-blocking)

**N-1 (dead import):** `test/identity/retry.test.ts` line 33 imports `withRetry as _withRetry` from the SDK barrel, but `withRetry` is not exported (it's module-private in `tokens.ts`). The variable is never used. Remove the import — in strict ESM it would be a resolution error; vitest likely silently resolves it to `undefined`.

```diff
 import {
   resolveTokenWithDiagnostics,
   clearTokenCache,
   GitHubApiError,
   RetryExhaustedError,
-  withRetry as _withRetry, // not exported — we test via the public API
 } from '@bradygaster/squad-sdk/identity';
```

---

## Positive Call-Outs

1. **Opt-in design.** Zero overhead for existing callers — the `retryPolicy` parameter is fully optional, and the `withRetry` wrapper is only invoked when a policy is provided. This is the correct pattern for additive hardening.

2. **`GitHubApiError` as typed error class.** Carrying `status` and `retryAfterMs` as structured fields (not string-parsed) makes the retry filter crisp and eliminates regex fragility. Good forward investment for any future error-handling work.

3. **Injectable `random` seam.** Clean testing pattern — deterministic delay assertions without `vi.spyOn(Math, 'random')` global pollution. Codified as a reusable skill (`.copilot/skills/injectable-random/SKILL.md`).

4. **Retry-After honoring.** Most retry implementations ignore the header and use pure exponential backoff. Respecting `Retry-After` on 429 is the correct behavior for GitHub's rate limiter and avoids unnecessary delay or re-triggering.

5. **Test coverage.** 12 focused tests covering every filter branch, the exhaustion path, both error class constructors, the jitter formula algebraically, and the `onRetry` callback contract. `initialDelayMs: 0` keeps tests fast.

6. **Documentation.** `docs/identity/retry-policy.md` is a clear contract doc. The changeset is thorough. EECOM's history entry captures design rationale for future contributors.

---

## Merge Action

✅ **Approve and merge.** Nit N-1 (dead import) can be cleaned up in a follow-up or squash-fixed before merge at EECOM's discretion — it does not affect runtime behavior.
