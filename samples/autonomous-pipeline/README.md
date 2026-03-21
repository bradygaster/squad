# Autonomous pipeline

Showcase sample that demonstrates a complete autonomous multi-agent development pipeline. A team of agents picks up tasks, routes follow-ups to teammates, records architectural decisions, accumulates learnings, and orchestrates the full run with cost tracking, telemetry collection, and real-time dashboards.

## Prerequisites

- Node.js >= 20.0.0
- npm
- TypeScript >= 5.0

## Quick start

From the repository root:

```bash
cd samples/autonomous-pipeline
npm install
npm run dev
```

## What you'll learn

- How `CastingEngine` creates a themed team with unique personalities
- How the `CostTracker` accumulates per-agent and per-session cost data across the entire run
- How `TelemetryCollector` gathers opt-in telemetry events for monitoring and analytics
- How `SkillRegistry` matches domain skills to tasks by keyword and role
- How `StreamingPipeline` processes simulated message deltas and usage events per session
- How `selectResponseTier` routes tasks to the right model tier based on complexity
- How agents use `squad_route`, `squad_decide`, and `squad_memory` to coordinate work
- How OpenTelemetry metrics export agent spawn, duration, destroy, and token usage data

## How it works

The sample casts four agents from The Usual Suspects universe: Keyser (Lead), McManus (Developer), Fenster (Tester), Verbal (Scribe). Each agent has skills in different domains. A task queue with ten diverse tasks is distributed: API design, auth implementation, testing, documentation, security audit, and more. Agents autonomously pick up tasks matching their role. For each task, an appropriate response tier is selected based on complexity. Agents can route follow-up tasks to teammates, record decisions in a shared decision log, and save learnings for future sessions. The streaming pipeline simulates message deltas. The cost tracker accumulates spending. Telemetry events are collected and optionally exported via OpenTelemetry to an Aspire dashboard. At the end, a scoreboard shows task completion, total cost, token usage, and which agents contributed most.

## Expected output

```
╔════════════════════════════════════════════════════════════╗
║   🎭 Autonomous Pipeline — Squad SDK Showcase              ║
║   Casting · Routing · Decision Recording · Telemetry       ║
╚════════════════════════════════════════════════════════════╝

  Cast:
    🎭 Keyser    — Lead
    🎭 McManus   — Developer
    🎭 Fenster   — Tester
    🎭 Verbal    — Scribe

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    TASK QUEUE — 10 tasks
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [1/10] ✅ API Design             — McManus (STANDARD tier)
  [2/10] ✅ Auth Implementation    — McManus (STANDARD tier)
  [3/10] ✅ Unit Tests             — Fenster (LIGHTWEIGHT tier)
  [4/10] ✅ Integration Tests      — Fenster (STANDARD tier)
  [5/10] ✅ Security Audit         — Keyser (FULL tier)
  ...

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    AGENT COST BREAKDOWN
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Agent           Model                    Tokens In    Cost
  ──────────────────────────────────────────────────────────
  McManus         gpt-4o-mini                 18,240  $0.0274
  Fenster         gpt-4o                      12,540  $0.0628
  Keyser          gpt-4o-turbo                 8,320  $0.0834
  Verbal          gpt-4o-mini                  5,120  $0.0077
  ──────────────────────────────────────────────────────────
  TOTAL                                       44,220  $0.1813

  ✓ Telemetry exported to OTEL_EXPORTER_OTLP_ENDPOINT
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main application with task loop, agent dispatch, and reporting |
| `package.json` | Dependencies (squad-sdk, chalk) and scripts |
| `tsconfig.json` | TypeScript configuration (ES2022, ESM) |
| `tests/autonomous-pipeline.test.ts` | Vitest tests for all major components |

## Squad tool patterns

The sample demonstrates three key SDK tools for agent coordination:

- **`squad_route`** — Agents route follow-up tasks to teammates (e.g., developer → tester for QA)
- **`squad_decide`** — Agents record architectural decisions (e.g., "Use JWT with RS256")
- **`squad_memory`** — Agents save learnings for future sessions (e.g., "Pool size 20 optimal")

## OpenTelemetry integration

To view traces and metrics in the .NET Aspire dashboard:

```bash
# Start Aspire dashboard
docker run -d \
  -p 18888:18888 \
  -p 4317:18889 \
  -e DASHBOARD__FRONTEND__AUTHMODE=Unsecured \
  -e DASHBOARD__OTLP__AUTHMODE=Unsecured \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest

# Run with OTel export
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 npm run dev

# Open http://localhost:18888 to view traces and metrics
```

Metrics exported:

- `squad.agent.spawns` — Agent spawn counter
- `squad.agent.duration` — Task execution duration histogram
- `squad.tokens.input` / `squad.tokens.output` — Token usage counters
- `squad.sessions.created` / `squad.sessions.closed` — Session lifecycle

## Running tests

```bash
npm test
```

Tests validate:

- CastingEngine team composition
- CostTracker accumulation and formatting
- TelemetryCollector consent and event collection
- SkillRegistry keyword matching and role affinity
- StreamingPipeline session attachment and event processing
- selectResponseTier routing for different task types
- Full integration wiring of all components

## Next steps

- See [azure-function-squad](../azure-function-squad/README.md) for deployment on Azure Functions
- Check the [Squad SDK documentation](../../README.md) for more patterns and best practices
- Review individual sample READMEs for focused concepts
