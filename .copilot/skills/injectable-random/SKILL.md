# Skill: Injectable Randomness for Deterministic Tests

**Owner:** EECOM  
**Date:** 2026-04-21  
**Status:** Active

---

## Problem

Code that uses `Math.random()` is hard to test deterministically. Jitter, random IDs, shuffle operations, and retry delays all suffer from this. Tests either ignore randomness (asserting only bounds) or use `vi.spyOn(Math, 'random')` — which is fragile and affects all code running in the test.

## Pattern

Expose a `random?: () => number` seam in any interface that drives randomness:

```typescript
interface RetryPolicy {
  random?: () => number; // defaults to Math.random
}
```

In implementation, destructure with a default:

```typescript
const { random = Math.random } = policy;
const jitter = base * 0.2 * (2 * random() - 1);
```

In tests, inject a fixed value:

```typescript
// No jitter — exact base delay
retryPolicy: { random: () => 0.5 }

// Min delay (−20% jitter)
retryPolicy: { random: () => 0 }

// Max delay (+20% jitter)
retryPolicy: { random: () => 1 }
```

## When to use

- Retry backoff jitter
- Random ID / slug generation in code under test
- Any shuffle or sampling that must produce predictable output in tests

## When NOT to use

- Cryptographic randomness — never make `crypto.randomBytes` injectable; use real entropy
- Simple unit tests that only check success/failure (not delay values) — bound assertions suffice

## Alternative: spy on Math.random

`vi.spyOn(Math, 'random').mockReturnValue(0.5)` works but has two downsides:
1. Affects ALL code calling `Math.random` in that test, not just your function.
2. Requires `vi.restoreAllMocks()` discipline to avoid cross-test leakage.

The injectable seam is scoped — it only affects the function you're testing.
