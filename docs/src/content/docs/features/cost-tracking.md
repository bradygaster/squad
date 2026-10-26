# Token Usage & Cost Tracking

Squad records token usage and estimated cost for each turn in the interactive shell, summarizes it by session with `squad cost`, and can export token metrics to telemetry backends.

---

## Overview

- The interactive shell (`squad` with no arguments) records input tokens, output tokens and estimated cost for every coordinator and agent turn
- `squad cost` reports that usage for the current session, for every session, or for one agent
- Optional budget limits can be configured per agent or per session

---

## How It Works

- Each shell turn appends JSON Lines records to `.squad/log/usage.jsonl`: one when the turn starts and one with its usage when it completes
- Each record names the SDK session that ran the turn and the Squad session it belongs to. The Squad session is the shell session, the one `/resume` restores, so it covers the coordinator and every agent the shell talks to
- Hosts that run the coordinator themselves, such as Copilot CLI and VS Code, don't write this ledger
- The `CostTracker` class (`packages/squad-sdk/src/runtime/cost-tracker.ts`) accumulates token data for telemetry
- OTel metrics (`squad.tokens.input`, `squad.tokens.output`, `squad.tokens.cost`) are emitted when telemetry is enabled

When the ledger has no data, `squad cost` falls back to older orchestration log entries that contain a **Token usage** row and labels the totals as estimates.

---

## Viewing Costs

```bash
squad cost                 # current session costs
squad cost --all           # all recorded costs
squad cost --agent fenster # one agent's costs in the current session
```

The current session is the Squad session of the newest record in the ledger. If that record has no Squad session because an older Squad wrote it, `squad cost` counts the records after the newest timestamped session log in `.squad/log/` instead, or all records when there is none.

**Example output:**

```text
💰 Squad Cost Summary
━━━━━━━━━━━━━━━━━━━━

  Agent          Input Tokens    Output Tokens    Est. Cost
  ─────────────  ──────────────  ───────────────  ───────────
  EECOM                 7,000              100      $0.0700
  Control               5,000              100      $0.0500
  coordinator           1,000              100      $0.0100
  ─────────────  ──────────────  ───────────────  ───────────
  Total                13,000              300      $0.1300

  📊 3 agents across 3 turns in 1 session
  Models: claude-sonnet-5 (3 turns, $0.1300)
  Source: structured runtime usage ledger
  Coverage: 3 of 3 turn attempts with recorded usage (100.0%)
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
