# Token Usage & Cost Tracking

Squad can track token usage and estimated cost for each agent spawn, roll that data up by session, and expose it through orchestration logs, terminal summaries, and telemetry backends.

---

## Overview

- Squad tracks token usage (input/output tokens) and estimated cost per agent spawn
- Usage data is recorded in orchestration logs and available via `squad cost` CLI
- Optional budget limits can be configured per agent or per session

---

## How It Works

- The `CostTracker` class (`packages/squad-sdk/src/runtime/cost-tracker.ts`) accumulates token data
- Each orchestration log entry includes a **Token usage** row
- OTel metrics (`squad.tokens.input`, `squad.tokens.output`, `squad.tokens.cost`) are emitted when telemetry is enabled

The orchestration log template stores usage in a markdown table row like this:

```md
| **Token usage** | 12,450 in / 3,200 out — $0.0234 |
```

---

## Viewing Costs

```bash
squad cost                 # current session costs
squad cost --all           # all historical costs
squad cost --agent fenster # costs for specific agent
```

**Example output:**

```text
=== Squad Cost Summary ===
Total input tokens:  12,450
Total output tokens: 3,200
Estimated cost:      $0.0234

--- By Agent ---
  fenster: 12,450in / 3,200out ($0.0234) [1 turns, model: claude-sonnet-4.5]

--- By Session ---
  session-abc123: 12,450in / 3,200out ($0.0234) [1 turns]
```

---

## Budget Configuration

```typescript
import { defineSquad, defineAgent, defineBudget } from '@bradygaster/squad-sdk';

export default defineSquad({
  defaults: {
    budget: defineBudget({
      perAgentSpawn: 50000,
      perSession: 500000,
      warnAt: 0.8,
    }),
  },
  agents: [
    defineAgent({
      name: 'fenster',
      role: 'Core Dev',
      budget: defineBudget({ perAgentSpawn: 100000 }),
    }),
  ],
});
```

- `perAgentSpawn` limits an individual agent invocation
- `perSession` limits the total budget for the coordinator session
- `warnAt` emits warnings when usage reaches a fraction of the configured limit

---

## OTel Integration

- Token metrics are exported as OpenTelemetry counters when telemetry is enabled
- Compatible with Aspire dashboard, Grafana, and any OTel-compatible backend
- Metrics: `squad.tokens.input`, `squad.tokens.output`, `squad.tokens.cost`
