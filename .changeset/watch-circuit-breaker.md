---
"@bradygaster/squad-cli": minor
---

feat(watch): circuit breaker integration for rate limit protection (#515)

Adds GitHub API rate limit protection to Ralph's watch command via
the Predictive Circuit Breaker from PR #518.

**What changed (additive patch — existing flow untouched):**
- `gh-cli.ts`: Added `ghRateLimitCheck()` and `isRateLimitError()` helpers
- `watch.ts`: Added `CircuitBreakerState` type + persistence helpers
- `watch.ts`: Added `executeRound()` wrapper that gates the existing
  `runCheck()` call through pre-flight quota checks
- `watch.ts`: Added `roundInProgress` flag to prevent overlapping rounds

**Circuit breaker state machine:**
- CLOSED → OPEN: When traffic light is red or predictor says exhaustion imminent
- OPEN → HALF-OPEN: After cooldown expires (exponential: 2m → 4m → 8m → ... → 30m cap)
- HALF-OPEN → CLOSED: After 2 consecutive successful rounds
- HALF-OPEN → OPEN: On rate limit error during probe

State persists to `.squad/ralph-circuit-breaker.json` across restarts.

**Tests:** 16 new tests covering state transitions, race condition guard,
predictive integration, and `isRateLimitError` detection.
