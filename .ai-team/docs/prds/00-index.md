# PRD Index — Squad SDK Replatform

**Owner:** Keaton (Lead)
**Status:** Draft
**Created:** 2026-02-20
**Last Updated:** 2026-02-20

> This is the master index for Squad's SDK replatform plan. All 14 PRDs are listed here with owners, dependencies, phase assignments, and execution order. Start here.

---

## Strategic Context

Squad today is a scaffolding tool — `npx github:bradygaster/squad` copies templates into consumer repos. The agent intelligence lives entirely in `squad.agent.md`, a ~32KB prompt running inside Copilot CLI's native agent system. We have zero runtime code.

The team has unanimously approved replatforming Squad on `@github/copilot-sdk` (TypeScript). The SDK gives us programmatic session management, custom tools, hooks, MCP integration, infinite sessions, BYOK, and streaming — as a typed, event-driven Node.js library. Squad transforms from a "team template kit" into a **programmable multi-agent runtime**.

**Analysis phase complete.** Four analysis docs informed this plan:
- `sdk-replatforming-proposal.md` — Strategic assessment (Keaton)
- `sdk-technical-mapping.md` — Feature-by-feature SDK mapping (Fenster)
- `sdk-opportunity-analysis.md` — SDK capability inventory & gap analysis (Kujan)
- `sdk-agent-design-impact.md` — Agent architecture transformation (Verbal)

---

## PRD Registry

### Phase 1 — Core (v0.6.0 MVP)

The foundation. Every other PRD depends on these shipping first.

| # | PRD | Owner | Depends On | Description |
|---|-----|-------|------------|-------------|
| 1 | SDK Orchestration Runtime | Fenster (Core Dev) | — | `CopilotClient` wrapper, connection lifecycle, SDK initialization |
| 2 | Custom Tools API | Fenster (Core Dev) | PRD 1 | `squad_route`, `squad_decide`, `squad_memory`, `squad_status` tools |
| 3 | Hooks & Policy Enforcement | Baer (Security) | PRD 1, 2 | `onPreToolUse`/`onPostToolUse` for governance, reviewer lockouts |
| 4 | Agent Session Lifecycle | Verbal (Prompt Engineer) | PRD 1, 2 | Charters → `CustomAgentConfig`, session pool, persistent workspaces |
| 5 | Coordinator Replatform | Keaton (Lead) | PRD 1–4 | 32KB prompt → TypeScript orchestrator using PRDs 1–4 as building blocks |

### Phase 2 — Extensions (v0.7.x)

Capabilities enabled by the core. All can execute in parallel once PRD 5 ships.

| # | PRD | Owner | Depends On | Description |
|---|-----|-------|------------|-------------|
| 6 | Streaming Observability | Kujan (SDK Expert) | PRD 5 | Real-time event aggregation, token tracking, orchestration dashboard |
| 7 | Skills Migration | Verbal (Prompt Engineer) | PRD 4 | `.squad/skills/` → SDK `skillDirectories`, portable skill packs |
| 8 | Ralph SDK Migration | Fenster (Core Dev) | PRD 4 | Ralph's watch loop → persistent SDK session, event-driven monitoring |
| 9 | BYOK & Multi-Provider | Kujan (SDK Expert) | PRD 1 | Custom `ProviderConfig`, fallback chains, enterprise airgap support |
| 10 | MCP Server Integration | Kujan (SDK Expert) | PRD 1, 4 | Per-agent MCP servers, Squad state as MCP server, third-party MCP |

### Phase 3 — Identity & Distribution

Long-horizon work. Reshapes how Squad looks, feels, and ships.

| # | PRD | Owner | Depends On | Description |
|---|-----|-------|------------|-------------|
| 11 | Casting System v2 | Verbal (Prompt Engineer) | PRD 4 | Casting registry → runtime `customAgents` generation, dynamic agent identity |
| 12 | Distribution & In-Copilot Install | Kujan (SDK Expert) | PRD 1, 5 | `npm install` path, SDK bundling, Copilot Extensions marketplace |
| 13 | A2A Agent Communication | Verbal (Prompt Engineer) | PRD 4, 5 | Direct agent-to-agent messaging via SDK sessions, event-based handoff |
| 14 | Clean-Slate Architecture | Keaton (Lead) | PRD 1 | Ground-zero redesign — `.squad/` structure, bundling, config, state management |

---

## Dependency Graph

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                  PHASE 1 — CORE (v0.6.0)                │
                    │                                                          │
                    │   ┌───────────┐                                          │
                    │   │  PRD 1    │ SDK Orchestration Runtime                │
                    │   │ (Fenster) │ ← THE GATE                              │
                    │   └─────┬─────┘                                          │
                    │         │                                                │
                    │         ▼                                                │
                    │   ┌───────────┐                                          │
                    │   │  PRD 2    │ Custom Tools API                         │
                    │   │ (Fenster) │                                          │
                    │   └─────┬─────┘                                          │
                    │         │                                                │
                    │    ┌────┴────┐                                           │
                    │    ▼         ▼                                           │
                    │ ┌───────┐ ┌───────┐                                     │
                    │ │ PRD 3 │ │ PRD 4 │  ← parallel                         │
                    │ │(Baer) │ │(Verbal)│                                    │
                    │ └───┬───┘ └───┬───┘                                     │
                    │     └────┬────┘                                          │
                    │          ▼                                               │
                    │    ┌───────────┐                                         │
                    │    │  PRD 5    │ Coordinator Replatform                  │
                    │    │ (Keaton)  │ ← PHASE 1 EXIT                         │
                    │    └───────────┘                                         │
                    └──────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────┐
    │                    PHASE 2 — EXTENSIONS (v0.7.x)                        │
    │                    All parallel after PRD 5                              │
    │                                                                          │
    │   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
    │   │  PRD 6    │  │  PRD 7    │  │  PRD 8    │  │  PRD 9    │           │
    │   │ Streaming │  │  Skills   │  │  Ralph    │  │  BYOK     │           │
    │   │ (Kujan)   │  │ (Verbal)  │  │ (Fenster) │  │ (Kujan)   │           │
    │   └───────────┘  └───────────┘  └───────────┘  └───────────┘           │
    │                                                                          │
    │   ┌───────────┐                                                         │
    │   │  PRD 10   │                                                         │
    │   │  MCP      │                                                         │
    │   │ (Kujan)   │                                                         │
    │   └───────────┘                                                         │
    └──────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────┐
    │                PHASE 3 — IDENTITY & DISTRIBUTION                        │
    │                                                                          │
    │   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
    │   │  PRD 11   │  │  PRD 12   │  │  PRD 13   │  │  PRD 14   │           │
    │   │ Casting v2│  │  Distro   │  │  A2A      │  │ Clean     │           │
    │   │ (Verbal)  │  │ (Kujan)   │  │ (Verbal)  │  │  Slate    │           │
    │   └───────────┘  └───────────┘  └───────────┘  │ (Keaton)  │           │
    │                                                  └───────────┘           │
    │                                                  ↑ can start            │
    │                                                    early (design)       │
    └──────────────────────────────────────────────────────────────────────────┘
```

---

## Execution Order

**Critical path:** PRD 1 → PRD 2 → PRDs 3+4 (parallel) → PRD 5 → Extensions (all parallel)

```
Week 1-2:   PRD 1 — SDK Orchestration Runtime (Fenster)
            PRD 14 — Clean-Slate Architecture begins (Keaton, design-only, parallel)
Week 3-4:   PRD 2 — Custom Tools API (Fenster)
Week 5-6:   PRD 3 — Hooks & Policy Enforcement (Baer)        ┐
            PRD 4 — Agent Session Lifecycle (Verbal)          ┘ parallel
Week 7-9:   PRD 5 — Coordinator Replatform (Keaton)
            ─── v0.6.0 MVP SHIPS ───
Week 10+:   PRDs 6-13 — Extensions & Identity (all parallel, team-wide)
            PRD 14 — Clean-Slate implementation begins
```

### Phase Timeline

| Phase | Version | Duration | Gate |
|-------|---------|----------|------|
| Phase 1 | v0.6.0 | 7–9 weeks | PRD 1 viability proven (week 2), Brady reviews before PRD 5 |
| Phase 2 | v0.7.x | 6–10 weeks | PRD 5 shipped, coordinator stable on SDK |
| Phase 3 | v0.8+ / v1.0 | 8–12 weeks | Phase 2 features validated in production |

---

## De-Risking Strategy

### PRD 1 Is the Gate

Everything depends on PRD 1 (SDK Orchestration Runtime). If the SDK's event model doesn't support our orchestration patterns, or if latency is unacceptable, we stop.

**PRD 1 viability criteria:**
1. `CopilotClient` initializes in < 2 seconds
2. `createSession()` + `sendAndWait()` round-trip completes
3. Event streaming works (`tool.execution_start`, `assistant.message_delta`)
4. Multiple concurrent sessions function without interference
5. SDK version pinned, tests pass against pinned version

**If PRD 1 fails:** Squad continues on current prompt-only architecture. No sunk cost beyond ~2 days of Fenster's time.

### Rollback at Every Phase

- **Phase 1 rollback:** Template engine unchanged. `squad init` / `squad upgrade` / `squad watch` still work. SDK orchestrator is additive.
- **Phase 2 rollback:** Extensions are independent. Any one can be reverted without affecting others.
- **Phase 3 rollback:** Identity and distribution changes are behind feature flags until validated.

### SDK Version Pinning

SDK is Technical Preview (`v0.1.x`). Policy:
- Pin to exact version (no `^` or `~` ranges)
- Upgrade deliberately after running full test suite against new version
- CI runs weekly against pinned version to detect upstream breaks
- Adapter pattern isolates Squad code from SDK internals

### Brady Checkpoints

1. **After PRD 1:** Brady reviews SDK viability assessment before Phase 1 continues
2. **After PRD 5:** Brady reviews v0.6.0 MVP before Phase 2 begins
3. **After Phase 2:** Brady reviews before Phase 3 identity/distribution changes

---

## Owner Assignments

| Team Member | Role | PRDs | Load |
|-------------|------|------|------|
| **Fenster** | Core Dev | 1, 2, 8 | Heavy (critical path Weeks 1–4) |
| **Baer** | Security | 3 | Focused (Weeks 5–6) |
| **Verbal** | Prompt Engineer | 4, 7, 11, 13 | Sustained (Weeks 5+) |
| **Keaton** | Lead | 5, 14 | Strategic (Weeks 7–9, plus ongoing design) |
| **Kujan** | SDK Expert | 6, 9, 10, 12 | Extension phase (Weeks 10+) |

---

## Success Criteria

**v0.6.0 (Phase 1 complete):**
- Coordinator runs as TypeScript program on SDK, not as 32KB prompt
- Agent sessions are isolated, persistent, observable
- Custom tools replace convention-based file coordination
- Hooks enforce policies that were previously prompt-level rules
- Existing `squad init` / `squad upgrade` still work unchanged

**v0.7.x (Phase 2 complete):**
- Real-time streaming from all agents simultaneously
- Ralph monitors via SDK events, not polling
- BYOK enables enterprise/airgap deployments
- MCP servers integrate per-agent

**v0.8+ (Phase 3 complete):**
- Clean `.squad/` directory structure ships
- Distribution path simplified (npm install or Copilot Extensions)
- Agent-to-agent communication operational
- Casting system generates `customAgents` at runtime

---

## How to Read These PRDs

Each PRD follows a standard format:
- **Problem Statement** — Why this work exists
- **Goals / Non-Goals** — What's in and out of scope
- **Background** — Context from analysis phase
- **Proposed Solution** — Technical approach with SDK APIs and patterns
- **Key Decisions** — Made and still needed
- **Implementation Notes** — Code patterns, file structures
- **Risks & Mitigations** — What could go wrong
- **Success Metrics** — How we know it worked
- **Open Questions** — Unresolved items

PRDs reference each other by number (e.g., "PRD 1" or "see PRD 4 §Agent Session Lifecycle"). Analysis docs are referenced by filename.

---

*This index is maintained by Keaton (Lead). Last updated 2026-02-20.*
