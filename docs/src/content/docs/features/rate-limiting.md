---
title: Rate Limiting
description: Cooperative rate limiting with a predictive circuit breaker that pauses before hitting API limits.
order: 36
---

# Rate Limiting

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to check rate limit status:**
```
What's our current API rate limit headroom?
```

**Try this to adjust pacing:**
```
Slow down — we're hitting rate limits on the LLM
```

Squad monitors API rate limit headroom in real time and pauses work before limits are reached — not after. This prevents cascading failures across concurrent agents.

---

## How It Works

Squad tracks the rate limit headers returned by every API call. Before dispatching the next request, it checks remaining headroom against a configurable threshold. If headroom is below the threshold, it pauses and waits for the window to reset.

This is cooperative: agents yield voluntarily rather than hammering the API and hitting hard errors.

## The RAAS Traffic-Light Pattern

Squad uses a three-state model for rate limit health:

| State | Meaning | Behavior |
|-------|---------|----------|
| 🟢 Green | Headroom is healthy | Proceed normally |
| 🟡 Amber | Headroom is low (below threshold) | Slow down, reduce concurrency |
| 🔴 Red | At or near limit | Pause all requests, wait for reset |

The system transitions between states automatically as headroom changes. You do not need to configure thresholds manually — defaults are tuned for typical LLM API quotas.

## When It Engages

Rate limiting engages when:

- Remaining requests in the current window drop below ~20% of the quota
- A `429 Too Many Requests` response is received (reactive fallback)
- Concurrent agent count is high and projected usage exceeds headroom

## Recovery Behavior

When the circuit is paused (🔴 Red):

1. All pending requests queue in memory.
2. Squad polls the rate limit reset timestamp from the API response headers.
3. At reset, Squad resumes from the queue — oldest requests first.
4. State transitions back to 🟢 Green automatically.

No work is dropped. Queued tasks resume without requiring user intervention.

## Concurrency and Pacing

In Amber state, Squad reduces the number of agents dispatching simultaneously. This distributes the remaining quota across a longer window rather than exhausting it instantly.

```
Green:  all agents active, full concurrency
Amber:  concurrency capped at 50% of normal
Red:    all requests paused until reset
```

## See Also

- [Model Selection](model-selection.md) — economy mode for cost and rate limit management
- [Parallel Execution](parallel-execution.md) — how concurrent agents share API quota
- [Cost Tracking](cost-tracking.md) — monitor spend alongside rate limit usage
