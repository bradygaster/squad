# Demo: The Agentic SDLC — From Intent to Execution

> **Duration:** 10–15 minutes  
> **Audience:** Developers familiar with GitHub and .NET Aspire  
> **Scenario:** Add real-time notifications via SignalR to a .NET Aspire app using the Squad agentic SDLC  
> **Prerequisite:** The presenter has a fresh .NET Aspire app (AppHost, ServiceDefaults, WebFrontend, ApiService) and has installed the Squad workflow via `gh aw add bradygaster/squad/workflows/squad.md@latest`

---

## Step 1: Set the stage — The intent

**Say:** "I've got a standard .NET Aspire app — AppHost, ServiceDefaults, a Blazor frontend, and an API service. I want to add real-time notifications using SignalR. Rather than jumping straight into code, I'm going to use the Squad agentic SDLC to plan this work. I've already installed the workflow with one command — `gh aw add` — and now I'll open an issue describing what I want."

**Do:** Open a new GitHub issue titled "Add real-time notifications via SignalR" with this body:

```markdown
## Goal
Add real-time notification support to the Aspire app so that API events
(order placed, payment processed, shipment dispatched) push live updates
to connected browser clients via SignalR.

## Success Criteria
- SignalR hub hosted in ApiService, registered in AppHost
- WebFrontend Blazor components receive and display notifications in real-time
- ServiceDefaults includes health checks for SignalR connectivity
- Works locally via Aspire orchestration and in deployed Azure Container Apps

## Constraints
- Must use .NET 9 SignalR (not third-party)
- Keep existing REST endpoints intact — SignalR supplements, doesn't replace
- No new microservice — hub lives alongside the existing API
```

**Screen shows:** A clean GitHub issue with structured intent — goal, success criteria, constraints.

**Key point:** The issue body IS the intent. Structured input produces better output at every downstream step.

---

## Step 2: Research — Deep-dive analysis

**Say:** "Now I ask Squad to research my codebase in the context of this issue. It's going to analyze my project structure, dependencies, patterns, and gaps — then report back what it finds."

**Do:** Type `/squad research` in a comment on the issue.

**Screen shows:** *(after ~30 seconds, a structured comment appears)*

```markdown
<!-- squad-research-v1 -->
## 🔬 Squad Research — SignalR Notifications for Aspire App

### Summary
The Aspire app uses the standard template structure with AppHost orchestration,
but has no real-time infrastructure. SignalR integration requires changes across
all four projects with careful registration in the AppHost resource model.

### Current State
- **AppHost:** Registers ApiService and WebFrontend as container resources.
  No SignalR or pub/sub resources configured.
- **ApiService:** ASP.NET Core Minimal APIs. Uses `AddServiceDefaults()`.
  No hub classes or WebSocket middleware.
- **WebFrontend:** Blazor Server app. Uses HttpClient to call ApiService.
  No HubConnection references.
- **ServiceDefaults:** Standard health checks (liveness + readiness).
  No SignalR-specific probes.

### Gap Analysis
| Gap | Current | Needed |
|-----|---------|--------|
| Hub infrastructure | None | SignalR hub + endpoint mapping |
| Client connectivity | HTTP only | HubConnection in Blazor components |
| Service discovery | REST endpoints only | Hub URL via Aspire service references |
| Health monitoring | Basic HTTP checks | SignalR connectivity probe |

### Risk & Complexity Assessment
| Area | Risk | Complexity | Notes |
|------|------|-----------|-------|
| Hub registration in AppHost | 🟢 Low | S | Standard Aspire pattern |
| Blazor client integration | 🟡 Medium | M | State management for live updates |
| Azure Container Apps deployment | 🟡 Medium | M | WebSocket/long-poll transport config |
| ServiceDefaults health checks | 🟢 Low | S | Straightforward IHealthCheck impl |

### Key Findings
1. `AppHost/Program.cs` uses `AddProject<T>()` — hub endpoint needs exposure
   via `WithEndpoint()` or service binding.
2. `WebFrontend` already references ApiService via `AddServiceReference()` —
   SignalR client can use the same service discovery.
3. No existing pub/sub pattern — this is greenfield for real-time.
4. Aspire 9.0 supports WebSocket transport in Container Apps with sticky sessions.

### Recommendations
- Start with the hub infrastructure in ApiService (lowest risk, unblocks everything)
- Use Aspire's built-in service discovery for hub URL resolution
- Add a typed notification model shared between API and frontend
- Defer Azure-specific transport config to a later phase

### Next Step
> Reply `/squad triage` to classify these findings into work items, decisions,
> and exclusions.
```

**Key point:** Research produces evidence, not backlog. It tells you what exists, what's missing, and what's risky — but it doesn't commit you to anything yet. Notice the "Next Step" guidance at the bottom.

---

## Step 3: Triage — Classify the findings

**Say:** "Research gave us findings. Now triage classifies each one: Is it work? Does it need a decision? Or is it out of scope? This is where the human stays in the loop — nothing becomes work without your consent."

**Do:** Type `/squad triage` in a comment.

**Screen shows:**

```markdown
<!-- squad-triage-v1 -->
## 🔍 Squad Triage — Dispositions

> Intent: Add real-time SignalR notifications to Aspire app
> Based on: Research from 2026-08-10

### Work Items (4)
| # | Finding | Scope Sketch | Effort | Rationale |
|---|---------|-------------|--------|-----------|
| 1 | No hub infrastructure | Create SignalR hub, models, DI registration in ApiService | M | Core capability — nothing works without this |
| 2 | No client connectivity | Add HubConnection to Blazor components, notification UI | M | User-facing feature delivery |
| 3 | Hub not registered in AppHost | Wire SignalR endpoint into Aspire orchestration model | S | Required for service discovery |
| 4 | No SignalR health checks | IHealthCheck for hub connectivity in ServiceDefaults | S | Operational readiness |

### Decisions Needed (1)
| # | Finding | Question | Impact | Blocks |
|---|---------|----------|--------|--------|
| 1 | Azure transport config | Should we configure sticky sessions now or defer to deployment phase? | Deployment strategy | None (can proceed with local-first) |

### Excluded (1)
| # | Finding | Reason |
|---|---------|--------|
| 1 | Replacing REST endpoints | Explicitly excluded by constraints — SignalR supplements only |

### Summary
- **6** findings triaged
- **4** ready for planning | **1** needs decision | **1** excluded
- Decisions blocking planning: none (decision is deferrable)

> Reply `/squad plan program` to create a program plan from these dispositions,
> or `/squad triage revise <feedback>` to adjust.
```

**Key point:** Triage is a human-in-the-loop gate. You can reclassify anything with `/squad triage revise`. The agent defers to you on ambiguous items by defaulting them to "decision needed."

---

## Step 4: Program plan — Strategic decomposition

**Say:** "Now we go from classified findings to a strategic plan. This is the WHAT — initiatives, epics, user stories, milestones. Watch how the triage work items transform into a structured program with delivery milestones."

**Do:** Type `/squad plan program` in a comment.

**Screen shows:**

```markdown
<!-- squad-program-v1 -->
## 📋 Squad Program Plan

> Intent: Add real-time SignalR notifications to Aspire app
> Based on: Triage from 2026-08-10 (4 work items, 1 decision)

### Milestones (2)
| # | Milestone | Outcome | Target Contains |
|---|-----------|---------|-----------------|
| M1 | Hub Online | SignalR hub runs locally via Aspire, clients can connect | E1, E2 |
| M2 | Notifications Live | End-to-end notifications visible in Blazor UI with health monitoring | E3, E4 |

### Initiatives & Epics

#### Initiative 1: Real-Time Notification Infrastructure
> Outcome: API events push live updates to connected browser clients

| Epic | Description | Stories | Milestone | Depends On |
|------|-------------|---------|-----------|-----------|
| E1 | SignalR Hub Infrastructure | 3 | M1 | — |
| E2 | Aspire Orchestration Integration | 2 | M1 | E1 |
| E3 | Blazor Client Notification UI | 3 | M2 | E2 |
| E4 | Operational Readiness | 2 | M2 | E1 |

<details>
<summary>E1: SignalR Hub Infrastructure</summary>

**Outcome:** A working SignalR hub in ApiService that accepts connections and broadcasts notifications.
**Stories:**
1. As a developer, I want a NotificationHub class so that clients have an endpoint to connect to.
2. As a developer, I want typed notification models so that hub messages are strongly typed.
3. As a developer, I want DI registration so that other services can inject IHubContext to send notifications.

**Acceptance criteria (epic-level):**
- [ ] Hub accepts WebSocket connections at `/hubs/notifications`
- [ ] At least one notification type (OrderPlaced) flows end-to-end
- [ ] Unit tests cover hub method invocation
</details>

<details>
<summary>E2: Aspire Orchestration Integration</summary>

**Outcome:** The hub is discoverable via Aspire service references and the AppHost model.
**Stories:**
1. As a developer, I want the hub endpoint registered in AppHost so that other services discover it.
2. As a developer, I want WebFrontend to resolve the hub URL via service reference so that no hardcoded URLs exist.

**Acceptance criteria (epic-level):**
- [ ] `dotnet run --project AppHost` starts hub alongside API
- [ ] WebFrontend resolves hub URL via service discovery
</details>

### Dependency Graph
```
E1 (Hub) ──→ E2 (Aspire) ──→ E3 (Blazor UI)
   │
   └──────────────────────────→ E4 (Health)
```

### Program Metadata
- **Total epics:** 4
- **Total stories:** 10
- **Milestones:** 2
- **Unresolved decisions:** 1 (deferrable — Azure transport config)
- **Estimated GitHub artifacts on activation:** ~12 issues, 2 milestones

> Reply `/squad plan accept scope` to approve this scope,
> or `/squad plan program revise <feedback>` to adjust.
```

**Key point:** This isn't code generation — it's strategic planning. Milestones represent demonstrable outcomes ("Hub Online" means you can show a connected client). The dependency graph shows what blocks what. And again — the "Next Step" tells you exactly what to do.

---

## Step 5: Implementation plan — PR-sized tasks

**Say:** "Scope looks good. Now I accept it and ask for the implementation plan — the HOW. This breaks every epic into PR-sized tasks with dependencies, sizing, and agent assignments."

**Do:** Type `/squad plan accept scope`, wait for confirmation, then type `/squad plan implementation`.

**Screen shows:** *(first, scope acceptance)*

```markdown
<!-- squad-scope-accepted-v1 -->
## ✅ Scope Accepted

- **Program plan version:** [comment link]
- **Accepted by:** @bradygaster
- **Date:** 2026-08-10T00:35:00Z
- **What was approved:**
  - 1 initiative, 4 epics
  - Scope boundary: SignalR hub, Aspire wiring, Blazor UI, health checks
```

*(then, the implementation plan)*

```markdown
<!-- squad-implementation-v1 -->
## 🔧 Squad Implementation Plan

> Program: Real-Time Notification Infrastructure
> Traces to: #1

### Tasks (7) — Dependency Order

#### Phase 1 — Foundation
| # | Title | Size | Depends On | Agent | Epic |
|---|-------|------|-----------|-------|------|
| 1 | Create notification models and contracts | S | — | EECOM | E1 |
| 2 | Implement NotificationHub with DI registration | M | #1 | EECOM | E1 |
| 3 | Register hub endpoint in AppHost | S | #2 | EECOM | E2 |

#### Phase 2 — Integration
| # | Title | Size | Depends On | Agent | Epic |
|---|-------|------|-----------|-------|------|
| 4 | Configure service discovery for hub URL | S | #3 | EECOM | E2 |
| 5 | Build Blazor NotificationFeed component | M | #4 | EECOM | E3 |
| 6 | Add toast/badge notification display | S | #5 | EECOM | E3 |

#### Phase 3 — Operational
| # | Title | Size | Depends On | Agent | Epic |
|---|-------|------|-----------|-------|------|
| 7 | Implement SignalR health check in ServiceDefaults | S | #2 | FIDO | E4 |

### Dependency Graph
```
#1 → #2 → #3 → #4 → #5 → #6
           │
           └→ #7
```

### Sizing Summary
| Size | Count |
|------|-------|
| S | 5 |
| M | 2 |
| **Total** | **7 tasks** |

> Reply `/squad plan validate` to run formal validation,
> or `/squad plan accept implementation` to approve.
```

**Key point:** Every task is PR-sized (nothing bigger than M here), has explicit dependencies, and traces back to a program plan epic. The agent knows what to suggest next at every step.

---

## Step 6: Validate — Structural integrity check

**Say:** "Before I accept this, I run validation. Think of it as a linter for your plan — it checks for circular dependencies, orphaned items, sizing violations, and traceability gaps. It's a safety net before you commit to creating real issues."

**Do:** Type `/squad plan validate` in a comment.

**Screen shows:**

```markdown
<!-- squad-validation-v1 -->
## ✅ Squad Plan Validation — PASSED

> Validated: Program Plan + Implementation Plan
> Run at: 2026-08-10T00:37:00Z

### Results

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Unresolved temporary IDs | ✅ Pass | — |
| 2 | Traceability (impl → program) | ✅ Pass | All 7 tasks trace to program items |
| 3 | Hierarchy validity | ✅ Pass | All epics have stories |
| 4 | Dependency cycles | ✅ Pass | DAG validated, no cycles |
| 5 | Work sizing | ✅ Pass | All tasks ≤ M |
| 6 | Unresolved decisions | ✅ Pass | 1 deferrable decision, blocks nothing |
| 7 | Metadata completeness | ✅ Pass | — |
| 8 | Orphaned items | ✅ Pass | All triage items represented |
| 9 | Milestone coverage | ✅ Pass | All epics assigned to milestones |

### Summary
- **Checks run:** 9
- **Passed:** 9 | **Warnings:** 0 | **Failed:** 0
- **Verdict:** ✅ Plan validated — ready for acceptance.

> Run `/squad plan accept implementation` to approve,
> or `/squad plan activate` after acceptance.
```

**Key point:** Nine structural checks, all passing. If something failed — say a circular dependency — it would tell you exactly what to fix before you can proceed. The plan is machine-verified.

---

## Step 7: Accept and activate — Creating real issues

**Say:** "Plan is validated. Now I accept the implementation and activate. This is the irreversible step — it creates real GitHub issues with full hierarchy, milestones, sub-issue relationships, and blocked-by dependencies. Watch the issue count."

**Do:** Type `/squad plan accept implementation`, then `/squad plan activate`.

**Screen shows:** *(activation record)*

```markdown
<!-- squad-activated-v1 -->
## ✅ Plan Activated — 4 epics, 7 tasks created

- **Activated by:** @bradygaster
- **Date:** 2026-08-10T00:39:00Z
- **Milestone(s):** Hub Online, Notifications Live
- **Hierarchy:** Root #1 → 4 epics → 7 tasks
- **Assigned agents:** EECOM, FIDO

### Created Epics
| # | Title | Issue | Milestone | Tasks |
|---|-------|-------|-----------|-------|
| E1 | SignalR Hub Infrastructure | #2 | Hub Online | 2 |
| E2 | Aspire Orchestration Integration | #3 | Hub Online | 2 |
| E3 | Blazor Client Notification UI | #4 | Notifications Live | 2 |
| E4 | Operational Readiness | #5 | Notifications Live | 1 |

### Created Tasks
| # | Title | Issue | Size | Agent | Parent Epic |
|---|-------|-------|------|-------|-------------|
| 1 | Create notification models and contracts | #6 | S | EECOM | #2 |
| 2 | Implement NotificationHub with DI registration | #7 | M | EECOM | #2 |
| 3 | Register hub endpoint in AppHost | #8 | S | EECOM | #3 |
| 4 | Configure service discovery for hub URL | #9 | S | EECOM | #3 |
| 5 | Build Blazor NotificationFeed component | #10 | M | EECOM | #4 |
| 6 | Add toast/badge notification display | #11 | S | EECOM | #4 |
| 7 | Implement SignalR health check | #12 | S | FIDO | #5 |

---
The squad is ready to begin work. Issues are created in dependency order
with full hierarchy (Root → Epics → Tasks) and assigned to their respective agents.
```

**Key point:** Eleven GitHub issues created with proper hierarchy: root → epics → tasks. Each has a milestone, labels (`squad:eecom`, `squad:fido`), native `blocked-by` dependency edges, and sub-issue relationships. The GitHub project board lights up with a fully structured backlog.

---

## Step 8: The lifecycle tracker — Your progress dashboard

**Say:** "Throughout this entire flow, there's been a single comment on the issue that updates itself at every step — the lifecycle state tracker. Let me show you what it looks like now."

**Do:** Scroll to the lifecycle state comment on the issue.

**Screen shows:**

```markdown
<!-- squad-lifecycle-state -->
## Planning Lifecycle

| Phase | Status | Artifact | Updated |
|-------|--------|----------|---------|
| Intent | ✅ Done | (issue body) | 2026-08-10 |
| Research | ✅ Done | [comment link] | 2026-08-10 |
| Triage | ✅ Done | [comment link] | 2026-08-10 |
| Program Plan | ✅ Done | [comment link] | 2026-08-10 |
| Implementation Plan | ✅ Done | [comment link] | 2026-08-10 |
| Validation | ✅ Done | [comment link] | 2026-08-10 |
| Scope Accepted | ✅ Done | [comment link] | 2026-08-10 |
| Impl Accepted | ✅ Done | [comment link] | 2026-08-10 |
| Activated | ✅ Done | [comment link] | 2026-08-10 |

**Current state:** Activated
**Last command:** `/squad plan activate` by @bradygaster at 2026-08-10T00:39:00Z
```

**Key point:** This comment is a living progress bar. It updates itself at every transition. Any agent — human or AI — can look at this one comment and know exactly where in the SDLC this issue stands. No context lost, no ambiguity.

---

## Step 9: What just happened — The big picture

**Say:** "Let's zoom out. In about eight commands — typed as comments on a single GitHub issue — we went from a one-paragraph idea to a fully structured project backlog with:"

**Do:** Show the GitHub Issues list filtered by `label:squad`.

**Screen shows:** The issues list with hierarchy badges, milestone tags, and agent labels.

**Key point:** Highlight these wins:

| What you got | How it was built |
|---|---|
| 2 milestones with outcomes | `/squad plan program` |
| 4 epics with user stories | `/squad plan program` |
| 7 PR-sized tasks with acceptance criteria | `/squad plan implementation` |
| Full dependency graph (native `blocked-by`) | `/squad plan activate` |
| Sub-issue hierarchy (Root → Epic → Task) | `/squad plan activate` |
| Agent-routed labels (`squad:eecom`, `squad:fido`) | `/squad plan activate` |
| Structural validation before commitment | `/squad plan validate` |
| A living lifecycle tracker on the root issue | Updated at every step |

**Say:** "Every step is a comment. Every artifact is machine-readable. Every transition has a 'Next Steps' prompt that tells you — or the AI — what to do next. That's the agentic SDLC: structured enough for machines, legible enough for humans, and collaborative enough that you stay in control the whole time."

---

## Step 10: The "Next Steps" pattern — Why it matters

**Say:** "One more thing I want to call out. Did you notice that every single output ended with a 'Next Step' block? That's not just UX polish — it's how the system composes. When Copilot sees that guidance, it knows what command to suggest next. When another agent reads the issue, it knows what phase it's in. The SDLC is self-documenting and self-guiding."

**Do:** Quickly scroll through the research, triage, and program plan comments showing the "Next Step" / "Reply `/squad ...`" blocks at the bottom of each.

**Screen shows:** A rapid visual of the chain:

```
Research:  "Reply /squad triage..."
Triage:   "Reply /squad plan program..."
Program:  "Reply /squad plan accept scope..."
Scope:    "Reply /squad plan implementation..."
Impl:     "Reply /squad plan validate..."
Validate: "Reply /squad plan accept implementation..."
Accept:   "Reply /squad plan activate..."
```

**Key point:** The workflow is a state machine that guides itself. You never have to remember what comes next — the last output always tells you. That's what makes it agentic: it works whether a human is driving, an AI is driving, or you're collaborating.

---

## Closing

**Say:** "That's the Squad agentic SDLC. One workflow, installed with one command. Slash commands in issue comments. Research → Triage → Plan → Validate → Activate. Every step is reversible until activation. Every output is structured, machine-readable, and self-guiding. And the result is a production-ready GitHub backlog that any team — human, AI, or hybrid — can start executing immediately."

---

## Quick Reference

| Step | Command | What it produces |
|------|---------|-----------------|
| 1 | *(open issue)* | Intent |
| 2 | `/squad research` | Evidence-based findings |
| 3 | `/squad triage` | Work / decision / excluded classification |
| 4 | `/squad plan program` | Strategic program plan (milestones, epics, stories) |
| 5 | `/squad plan accept scope` | Locks the WHAT |
| 6 | `/squad plan implementation` | PR-sized task breakdown |
| 7 | `/squad plan validate` | Structural integrity check |
| 8 | `/squad plan accept implementation` | Locks the HOW |
| 9 | `/squad plan activate` | Creates real GitHub issues with hierarchy |

**Fast path alternative:** `/squad research` → `/squad plan` → `/squad plan accept` (combines steps 3–9 into three commands for simpler work)

---

*Demo created for the Squad project — [github.com/bradygaster/squad](https://github.com/bradygaster/squad)*
