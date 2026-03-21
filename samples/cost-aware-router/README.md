# Cost-aware router

Demonstrates how the Squad SDK selects response tiers based on task complexity, routes tasks to the cheapest model that can handle them, tracks costs per agent and session, and provides budget warnings and final cost reports.

## Prerequisites

- Node.js >= 20
- npm
- The SDK must be built first: `cd ../../ && npm run build`

## Quick start

1. Install dependencies: `npm install`
2. Run the sample: `npm run dev`

## What you'll learn

- How `selectResponseTier()` routes tasks to tiers based on complexity (direct, lightweight, standard, full)
- How `getTier()` retrieves tier definitions including model, timeout, and concurrency limits
- How `CostTracker` accumulates token counts and cost data per agent and session
- How to estimate costs based on token usage and model pricing
- How to display budget warnings when spending approaches limits

## How it works

The sample processes five tasks with increasing complexity. For each task, `selectResponseTier()` analyzes the task description and selects an appropriate tier: a simple typo fix routes to `direct` (no model needed), documentation updates route to `lightweight` (fast model), feature implementation routes to `standard` (balanced model), and architecture reviews and security audits route to `full` (premium model). The `CostTracker` accumulates token counts and cost estimates for each agent. As spending approaches 70% of the budget, a warning is displayed; at 90%, a critical warning appears. After all tasks complete, a final report shows tier distribution, per-agent cost breakdown, and overall budget consumption.

## Expected output

```
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │   Squad SDK — Cost-Aware Router Demo                        │
  │   Tier selection · Budget tracking · Cost breakdowns         │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    BUDGET: $0.50
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ████████████████████░░░░░░░░░░  45.2% / $0.50

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    TIER DISTRIBUTION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚡ DIRECT        ██████░░░░ 1
  🔹 LIGHTWEIGHT   ████░░░░░░ 1
  🔶 STANDARD      ████░░░░░░ 1
  🔴 FULL          ██████████ 2
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main demo showing tier selection, cost tracking, and budget warnings |
| `package.json` | Dependencies (squad-sdk) and scripts |
| `tsconfig.json` | TypeScript configuration (ESM, strict) |
| `tests/cost-aware-router.test.ts` | Tests for tier selection and cost calculations |

## SDK imports

The sample uses these SDK exports:

```typescript
import {
  CostTracker,
  selectResponseTier,
  getTier,
  MODELS,
} from '@bradygaster/squad-sdk';
```

## Next steps

- See [skill-discovery](../skill-discovery/README.md) to learn how agents discover and share domain knowledge
- Check [autonomous-pipeline](../autonomous-pipeline/README.md) for a showcase combining multiple SDK components
- Read the [Cost Management Guide](../../README.md#cost-tracking) in the main documentation
