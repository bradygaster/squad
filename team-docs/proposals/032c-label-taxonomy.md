# Proposal 032c: Label Taxonomy & Workflow Engine

**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-10  
**Status:** Draft  
**Requested by:** bradygaster — *"work in label usage for workflow, ALL OF IT. it should be REAL."*  
**Builds on:** Proposal 032 (GitHub-Native Proposals), Proposal 028 (GitHub-Native Team Planning), slidemaker reference implementation  
**Companion to:** 032 (lifecycle design), 028a (API capabilities)

---

## 1. Design Principles

Labels are not decoration. They are the execution surface of GitHub-native Squad.

1. **Labels are the state machine.** Status transitions = label swaps. An issue's lifecycle is fully expressed through label changes. No hidden state.
2. **Labels are the routing table.** Agent assignment = label application. `squad:fenster` means Fenster owns it. `squad:unassigned` means nobody does yet.
3. **Labels are the automation API.** GitHub Actions trigger on label events (`labeled`, `unlabeled`). CCA assignment triggers on `cca-eligible`. Stale detection triggers on inactivity.
4. **Labels must be human-readable AND machine-parseable.** The namespace prefix (`status:`, `type:`, `squad:`) is the parser. The suffix is the human label.
5. **The taxonomy works for Squad's own repo AND for any repo that uses Squad.** Generic enough for any project, specific enough to drive Squad workflows without customization.
6. **Provider-abstractable.** Label semantics map to Azure DevOps work item states, GitLab labels, and any future provider. The namespace convention is the portability layer — providers that don't support colons in labels can use dashes or native state fields.

---

## 2. Label Taxonomy

### 2.1 Status Labels (Lifecycle — Mutually Exclusive)

An issue has **exactly one** status label at any time. Status changes are **label swaps**: remove the old, apply the new. This is the state machine.

| Label | Color | Hex | Description | Use When |
|---|---|---|---|---|
| `status:draft` | 🟣 Purple | `#6E40C9` | Initial state — being written or shaped | Issue created, not yet ready for review |
| `status:reviewing` | 🔵 Blue | `#1D76DB` | Under active review and discussion | Analysis posted, awaiting team/owner feedback |
| `status:approved` | 🟢 Green | `#0E8A16` | Approved for implementation | Owner gave explicit approval |
| `status:implementing` | 🟡 Yellow | `#FBCA04` | Active work underway | Branch created, work in progress |
| `status:done` | ⬛ Dark Green | `#006B3F` | Complete — implemented and merged | All work items closed, PR merged |
| `status:blocked` | 🔴 Red | `#D73A4A` | Cannot proceed — dependency or external blocker | Waiting on something outside the issue's control |
| `status:shelved` | ⚪ Gray | `#BFD4F2` | Intentionally deferred — not cancelled, not dead | Parked for later; may return |
| `status:superseded` | ⚪ Light Gray | `#E4E669` | Replaced by a newer proposal/issue | Successor exists; this one is historical |

**Color logic:** Traffic-light semantics. Green = go/done. Yellow = in motion. Red = stopped. Blue = waiting for humans. Purple = early/forming. Gray = inactive.

#### Status Transitions (State Machine)

```
                    ┌─────────────────┐
                    │   status:draft  │ ← Issue created
                    └────────┬────────┘
                             │ Agent posts analysis
                             ▼
                    ┌─────────────────┐
                    │ status:reviewing│
                    └───┬────┬────┬───┘
            Owner       │    │    │   Owner says
           approves     │    │    │   "not now"
                ▼       │    │    ▼
    ┌──────────────┐    │    │  ┌──────────────┐
    │status:approved│   │    │  │status:shelved │
    └──────┬───────┘    │    │  └──────────────┘
           │            │    │
     Work  │            │    │  New proposal
     begins│            │    │  replaces this
           ▼            │    ▼
  ┌────────────────┐    │  ┌────────────────────┐
  │status:implement│    │  │ status:superseded   │
  │     ing        │    │  └────────────────────┘
  └───┬────────┬───┘    │
      │        │        │
  All work     │   Blocker
  done    ▼    │   found
      │  ┌─────────┐    │
      │  │ status:  │    │
      │  │ blocked  │◄───┘
      │  └────┬─────┘
      │       │ Blocker resolved
      │       ▼
      │  (returns to status:implementing)
      ▼
  ┌──────────────┐
  │  status:done │
  └──────────────┘
```

**Transition rules:**

| From | To | Trigger | Who/What |
|---|---|---|---|
| `status:draft` | `status:reviewing` | Agent posts initial analysis comment | Coordinator (automatic after agent analysis) |
| `status:reviewing` | `status:approved` | Owner approves (comment or label) | Human (Brady) or coordinator detecting approval language |
| `status:reviewing` | `status:shelved` | Owner says "not now", "defer", "park it" | Human |
| `status:reviewing` | `status:superseded` | New proposal replaces this one | Human or coordinator |
| `status:approved` | `status:implementing` | First work item branch created | Coordinator (detects branch or sub-issue creation) |
| `status:implementing` | `status:done` | All work items/sub-issues closed | Coordinator (detects all children closed) |
| `status:implementing` | `status:blocked` | Blocker identified | Human or agent |
| `status:blocked` | `status:implementing` | Blocker resolved | Human or agent |
| `status:draft` | `status:shelved` | Deferred before review begins | Human |
| `status:draft` | `status:superseded` | Replaced before review begins | Human or coordinator |
| Any open status | `status:done` | Direct close with "done" | Human (skip-to-end for simple issues) |

**Illegal transitions:** `status:done` → anything (terminal). `status:superseded` → anything (terminal). These states correspond to closed issues.

**Issue open/closed alignment:**
- **Open:** `status:draft`, `status:reviewing`, `status:approved`, `status:implementing`, `status:blocked`, `status:shelved`
- **Closed:** `status:done`, `status:superseded`
- When an issue is **closed**, it must have either `status:done` or `status:superseded`. If neither applies, the coordinator applies `status:done` on close.
- `status:shelved` keeps the issue **open** — shelved means "we might come back." If it's truly dead, close it with `status:superseded` or `status:done`.

### 2.2 Type Labels (Categorization — Exactly One)

Every issue gets exactly one type label. Types are not mutually exclusive with status — they describe *what* the issue is, not *where* it is in its lifecycle.

| Label | Color | Hex | Description |
|---|---|---|---|
| `type:proposal` | 🟠 Orange | `#D93F0B` | A proposal — design document, RFC, architectural decision |
| `type:feature` | 🔵 Teal | `#0075CA` | New capability or enhancement |
| `type:bug` | 🔴 Red | `#D73A4A` | Something broken that needs fixing |
| `type:chore` | ⚪ Gray | `#BFDADC` | Maintenance, refactoring, dependency updates |
| `type:spike` | 🟣 Purple | `#B60205` | Time-boxed research or investigation |
| `type:discussion` | 💬 Light Blue | `#C5DEF5` | Open question, no deliverable expected |
| `type:docs` | 📄 Blue-Gray | `#5319E7` | Documentation work |
| `type:test` | 🧪 Teal | `#1D7A8A` | Test coverage, test infrastructure |

### 2.3 Priority Labels (Urgency — At Most One)

Optional. Not every issue needs a priority. When assigned, exactly one.

| Label | Color | Hex | Description |
|---|---|---|---|
| `priority:p0` | 🔴 Red | `#B60205` | Critical — blocks release or breaks users. Do it NOW. |
| `priority:p1` | 🟠 Orange | `#D93F0B` | High — should be in the current sprint |
| `priority:p2` | 🟡 Yellow | `#FBCA04` | Medium — next sprint or when capacity allows |
| `priority:p3` | ⚪ Gray | `#C2E0C6` | Low — nice to have, backlog filler |

**Why p0-p3, not critical/high/medium/low?** Shorter labels. Machine-parseable severity level (sort by suffix). Consistent with industry convention (Google, Chromium, most bug trackers). Avoids subjective words — "critical" means different things to different people; "p0" means "fix it now" everywhere.

### 2.4 Squad Labels (Routing)

The routing table. These labels tell the system (and humans) who owns the work.

| Label | Color | Hex | Description |
|---|---|---|---|
| `squad` | 🟦 Blue | `#0366D6` | Base label — marks any issue as squad-managed. Every squad issue gets this. |
| `squad:{agent-name}` | 🟦 Blue | `#0366D6` | Routes to a specific agent. Examples: `squad:keaton`, `squad:verbal`, `squad:fenster`, `squad:mcmanus`, `squad:hockney`, `squad:kujan`, `squad:kobayashi` |
| `squad:unassigned` | ⚪ Light Gray | `#E4E669` | No agent assigned yet — needs routing |
| `squad:human` | 🟢 Green | `#0E8A16` | Routed to a human team member — not for AI agents |

**Relationship to GitHub assignees:** Labels are for Squad routing. GitHub assignees are for human accountability. They coexist:
- `squad:fenster` + no GitHub assignee = Fenster (the AI agent) owns it
- `squad:human` + assignee: @bradygaster = Brady owns it
- `squad:verbal` + assignee: @bradygaster = Verbal does the work, Brady is accountable

**Dynamic agent labels:** When `squad init` runs, it reads the team roster from `.ai-team/agents/` and creates `squad:{name}` labels for each agent. New agents get labels automatically. Removed agents keep their labels (historical issues reference them).

### 2.5 Sprint & Milestone Strategy

**Decision: Use GitHub Milestones for sprints, not labels.**

Milestones are GitHub's native sprint concept. They have:
- Due dates
- Progress bars (X/Y issues closed)
- Grouping on the Issues page
- API support for filtering

Labels like `sprint:current` would require constant relabeling as sprints change. Milestones are the right tool.

| Milestone | Description |
|---|---|
| `v0.1.0` | Initial release — agent orchestration, proposal-first workflow |
| `v0.2.0` | Quality + experience — tests, tiered responses, skills system |
| `v0.3.0` | GitHub-native — proposals as issues, label-driven workflow |
| `Horizon` | Future work — no timeline, aspirational |

**One exception:** The `era:` labels (see §2.7) mark which version of Squad a proposal *relates to* historically. These are categorization, not scheduling.

### 2.6 Automation Labels

Labels that trigger GitHub Actions workflows or signal automation needs.

| Label | Color | Hex | Description |
|---|---|---|---|
| `cca-eligible` | 🤖 Purple | `#6E40C9` | This issue can be assigned to Copilot Coding Agent (@copilot) |
| `needs-review` | 👀 Yellow | `#FBCA04` | Waiting for human or agent review |
| `needs-decomposition` | 🔨 Orange | `#D93F0B` | Approved proposal that needs work item breakdown |
| `stale` | 🕸️ Gray | `#BFD4F2` | No activity for N days — auto-applied by cleanup Action |
| `good-first-issue` | 🌱 Green | `#7057FF` | Good for new contributors (GitHub convention) |
| `help-wanted` | 🙋 Green | `#008672` | Extra attention needed (GitHub convention) |

### 2.7 Migration & Provenance Labels

For tracking where issues came from and what era they belong to.

| Label | Color | Hex | Description |
|---|---|---|---|
| `migrated:from-markdown` | 📋 Light Purple | `#D4C5F9` | This issue was migrated from a markdown proposal file |
| `era:v0.1` | ⚪ Light Gray | `#F9D0C4` | Relates to the v0.1.x era of Squad |
| `era:v0.2` | ⚪ Light Gray | `#FEF2C0` | Relates to the v0.2.x era of Squad |
| `era:v0.3` | ⚪ Light Gray | `#C2E0C6` | Relates to the v0.3.x era of Squad |

---

## 3. Complete State Machine

### 3.1 Proposal Lifecycle (Full Path)

```
User says "I'd like a proposal for X"
         │
         ▼
┌─────────────────────────────────────────────────┐
│ COORDINATOR creates issue:                       │
│   Labels: squad, type:proposal, status:draft     │
│   Milestone: {current version}                   │
│   Body: proposal template                        │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│ COORDINATOR routes to domain agent               │
│   Adds label: squad:{agent-name}                 │
│   Agent posts analysis as issue comment          │
│   Label swap: status:draft → status:reviewing    │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│ DISCUSSION in issue comments                     │
│   Other agents comment (spawned by coordinator)  │
│   Humans comment from GitHub UI                  │
│   May add: needs-review                          │
└──────┬──────────┬──────────┬────────────────────┘
       │          │          │
    Approved   Shelved    Superseded
       │          │          │
       ▼          ▼          ▼
  ┌──────────┐  ┌─────────┐  ┌─────────────┐
  │ status:  │  │ status: │  │ status:     │
  │ approved │  │ shelved │  │ superseded  │
  └────┬─────┘  └─────────┘  └─────────────┘
       │                     (close issue,
       │                      link successor)
       ▼
┌─────────────────────────────────────────────────┐
│ COORDINATOR decomposes into work items           │
│   Adds label: needs-decomposition (briefly)      │
│   Creates sub-issues with squad:{agent} labels   │
│   Label swap: status:approved → status:implement │
│   Removes: needs-decomposition                   │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│ NORMAL GIT FLOW                                  │
│   Agent picks up work item → branch → PR → merge │
│   Sub-issues close via "Closes #N" in PRs        │
│   When ALL sub-issues closed:                    │
│   Label swap: status:implementing → status:done  │
│   Close parent proposal issue                    │
└─────────────────────────────────────────────────┘
```

### 3.2 Bug/Feature Lifecycle (Simplified Path)

Non-proposal issues skip the review/approval ceremony:

```
status:draft → status:implementing → status:done
         │                │
         ▼                ▼
    status:blocked   status:blocked
    (then back to implementing)
```

Bugs and features can go straight from `status:draft` to `status:implementing` if they don't need team consensus.

### 3.3 Label Combinations (Valid Snapshots)

| Issue State | Labels | GitHub State |
|---|---|---|
| New proposal, just created | `squad`, `type:proposal`, `status:draft`, `squad:unassigned` | Open |
| Proposal under review by Verbal | `squad`, `type:proposal`, `status:reviewing`, `squad:verbal` | Open |
| Approved proposal, work starting | `squad`, `type:proposal`, `status:approved`, `squad:keaton`, `needs-decomposition` | Open |
| Implementation in progress | `squad`, `type:proposal`, `status:implementing`, `squad:fenster` | Open |
| Completed proposal | `squad`, `type:proposal`, `status:done`, `migrated:from-markdown` | Closed |
| Shelved proposal | `squad`, `type:proposal`, `status:shelved` | Open |
| Superseded proposal | `squad`, `type:proposal`, `status:superseded` | Closed |
| P0 bug, in progress | `squad`, `type:bug`, `status:implementing`, `priority:p0`, `squad:fenster` | Open |
| CCA-eligible chore | `squad`, `type:chore`, `status:draft`, `cca-eligible` | Open |

---

## 4. Label-Driven Automation

### 4.1 Action Triggers

| Label Event | Action Triggered | Implementation |
|---|---|---|
| `type:proposal` applied | Validate issue body against proposal template; assign to `squad:unassigned` if no squad label | GitHub Action: `on: issues: [labeled]` |
| `status:reviewing` applied | Post comment: "This proposal is under review. Team members will analyze and comment." Start tracking review age. | GitHub Action |
| `status:approved` applied | Post comment: "Proposal approved. Decomposing into work items." Add `needs-decomposition`. | GitHub Action |
| `needs-decomposition` applied | Notify coordinator to spawn Lead for work breakdown. Remove label after decomposition completes. | GitHub Action or CCA trigger |
| `cca-eligible` applied | Assign issue to `@copilot` (Copilot Coding Agent). Remove `squad:unassigned` if present. | GitHub Action: `on: issues: [labeled]` |
| `stale` applied | Post nudge comment: "This issue has had no activity for {N} days. Is it still relevant?" | GitHub Action (scheduled) |
| `status:done` applied | Close the issue if still open. Post completion summary. | GitHub Action |
| `status:superseded` applied | Close the issue. Validate body contains link to successor. | GitHub Action |
| Issue closed without status label | Auto-apply `status:done`. | GitHub Action: `on: issues: [closed]` |
| `priority:p0` applied | Post alert comment. Pin the issue if repo allows. | GitHub Action |

### 4.2 Scheduled Actions

| Schedule | Action | Labels Involved |
|---|---|---|
| Daily | Scan for issues with no `status:` label — apply `status:draft` | All `squad` issues |
| Weekly | Scan for issues with no activity in 30 days — apply `stale` | All open `squad` issues |
| Weekly | Scan for `stale` issues with no response in 14 days — post close warning | `stale` |
| On milestone due date | Report: open issues per milestone, blocked count, completion % | All issues in milestone |

### 4.3 CCA Integration

Copilot Coding Agent (CCA) integration runs through labels:

1. Human or coordinator applies `cca-eligible` to an issue
2. GitHub Action assigns the issue to `@copilot`
3. CCA creates a branch and PR
4. On PR merge, the Action removes `cca-eligible` and swaps `status:implementing` → `status:done`

The `cca-eligible` label is the **only** trigger for CCA assignment. No other automation path assigns to `@copilot`. This keeps CCA opt-in and auditable.

---

## 5. Migration Label Mapping — All Existing Proposals

Every proposal in `team-docs/proposals/` mapped to its GitHub Issue state. This is real — statuses pulled directly from each file's header.

| # | Proposal Title | Markdown Status | Issue State | Status Label | Type Label | Era | Extra Labels | Open/Closed |
|---|---|---|---|---|---|---|---|---|
| 001 | Proposal-First Workflow | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 001a | Proposal Lifecycle Amendment | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 002 | Messaging Overhaul | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 003 | Copilot Platform Optimization | Approved — Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 004 | Demo Script Overhaul | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 005 | Video Content Strategy | Approved — Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 006 | README Rewrite | Superseded — by Proposal 014/019 | Superseded | `status:superseded` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 007 | Agent Persistence and Latency | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 008 | Portable Squads (Architecture) | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 008-exp | Portable Squads — Experience | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 008-plat | Portable Squads — Platform | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 009 | V1 Sprint Plan | Superseded — by Proposal 019 | Superseded | `status:superseded` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 010 | Skills System | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 011 | Forwardability & Upgrade Path | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 012 | Skills Platform & Copilot Integration | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 013 | V1 Test Strategy | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 014 | V1 Messaging and Launch | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 014a | "Where Are We?" Messaging Beat | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 015 | P0 — Silent Success Bug | Approved ✅ Shipped | Implemented | `status:done` | `type:bug` | `era:v0.1` | `migrated:from-markdown`, `priority:p0` | **Closed** |
| 016 | The Squad Paper | Approved — Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 017 | Squad DM — Experience Design | Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 017-plat | Platform Feasibility — DM | Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 017-msg | Squad DM — Messaging Interface | Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 018 | Wave Execution Plan | Superseded — by Proposal 019 | Superseded | `status:superseded` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Closed** |
| 019 | Master Sprint Plan | Approved ✅ Shipped (Waves 1-3) | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 019a | Sprint Plan Amendments | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 020 | Blog and Packaging | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 021 | Release Plan & Distribution | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 022 | Squad Visual Identity | Draft — Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.1` | `migrated:from-markdown` | **Open** |
| 023 | Incoming Queue | Revised Draft — Deferred to Horizon | Deferred | `status:shelved` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Open** |
| 024 | Per-Agent Model Selection | Approved ✅ | Approved | `status:approved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 024a | Model Catalog | Research Complete | Research | `status:done` | `type:spike` | `era:v0.3` | `migrated:from-markdown` | **Closed** |
| 024b | Model Selection Algorithm | Draft | Draft | `status:shelved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 025 | PR #2 Review | Approved ✅ Shipped | Implemented | `status:done` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Closed** |
| 026 | Scripted E2E Demos | Draft | Draft | `status:shelved` | `type:proposal` | `era:v0.2` | `migrated:from-markdown` | **Open** |
| 027 | v0.3.0 Sprint Plan | Approved ✅ — REVISED | Active | `status:approved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 028 | GitHub-Native Team Planning | Phase 1 Approved for v0.3.0 ✅ | Active | `status:approved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 028a | GitHub API Capabilities | Assessment (Research Complete) | Research | `status:done` | `type:spike` | `era:v0.3` | `migrated:from-markdown` | **Closed** |
| 029 | Marketing Site | Draft | Draft | `status:shelved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 029a | Marketing Site Content | Proposed | Draft | `status:shelved` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 030 | Async Comms Feasibility | Active | Active | `status:reviewing` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 031 | CCA E2E Test Design | Draft | Draft | `status:draft` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |
| 032 | GitHub-Native Proposals | Draft | Draft | `status:reviewing` | `type:proposal` | `era:v0.3` | `migrated:from-markdown` | **Open** |

### Migration Summary

| Category | Count | Issue State |
|---|---|---|
| **Implemented** (shipped, done) | 22 | Closed + `status:done` |
| **Superseded** (replaced) | 3 | Closed + `status:superseded` |
| **Research Complete** (spikes) | 2 | Closed + `status:done` |
| **Shelved** (deferred to horizon) | 12 | Open + `status:shelved` |
| **Approved/Active** (v0.3.0 work) | 3 | Open + `status:approved` or `status:reviewing` |
| **Draft** (active drafts) | 2 | Open + `status:draft` or `status:reviewing` |
| **Total** | **44** | |

**Notes on honest classification:**
- Proposal 024 (Model Selection) is `status:approved` but NOT `status:done` — it was approved but v0.3.0 reprioritization deferred implementation. It stays open.
- Proposal 024b (Algorithm) is `status:shelved` — it's a draft companion document that lost priority when v0.3.0 scope narrowed.
- Proposals 026, 029, 029a are `status:shelved` — they're drafts that were never prioritized, not actively being worked.
- Proposal 030 (Async Comms) is `status:reviewing` — it's active research informing v0.3.0 decisions.
- Proposal 015 (Silent Success Bug) gets `type:bug` + `priority:p0` — it was a bug fix, not a feature proposal.

---

## 6. Label Setup Automation

### 6.1 `squad init` Label Creation

The `squad init` command creates all labels in the connected GitHub repo. This runs as part of the GitHub-native setup flow.

```bash
#!/bin/bash
# squad-labels.sh — Create the full Squad label taxonomy
# Idempotent: gh label create is a no-op if the label already exists (--force updates color/description)

REPO="${1:?Usage: squad-labels.sh owner/repo}"

# --- Status labels (lifecycle) ---
gh label create "status:draft"         --repo "$REPO" --color "6E40C9" --description "Initial state — being written or shaped" --force
gh label create "status:reviewing"     --repo "$REPO" --color "1D76DB" --description "Under active review and discussion" --force
gh label create "status:approved"      --repo "$REPO" --color "0E8A16" --description "Approved for implementation" --force
gh label create "status:implementing"  --repo "$REPO" --color "FBCA04" --description "Active work underway" --force
gh label create "status:done"          --repo "$REPO" --color "006B3F" --description "Complete — implemented and merged" --force
gh label create "status:blocked"       --repo "$REPO" --color "D73A4A" --description "Cannot proceed — dependency or external blocker" --force
gh label create "status:shelved"       --repo "$REPO" --color "BFD4F2" --description "Intentionally deferred — not cancelled" --force
gh label create "status:superseded"    --repo "$REPO" --color "E4E669" --description "Replaced by a newer proposal or issue" --force

# --- Type labels (categorization) ---
gh label create "type:proposal"   --repo "$REPO" --color "D93F0B" --description "Design document, RFC, or architectural decision" --force
gh label create "type:feature"    --repo "$REPO" --color "0075CA" --description "New capability or enhancement" --force
gh label create "type:bug"        --repo "$REPO" --color "D73A4A" --description "Something broken that needs fixing" --force
gh label create "type:chore"      --repo "$REPO" --color "BFDADC" --description "Maintenance, refactoring, dependency updates" --force
gh label create "type:spike"      --repo "$REPO" --color "B60205" --description "Time-boxed research or investigation" --force
gh label create "type:discussion" --repo "$REPO" --color "C5DEF5" --description "Open question, no deliverable expected" --force
gh label create "type:docs"       --repo "$REPO" --color "5319E7" --description "Documentation work" --force
gh label create "type:test"       --repo "$REPO" --color "1D7A8A" --description "Test coverage or test infrastructure" --force

# --- Priority labels ---
gh label create "priority:p0" --repo "$REPO" --color "B60205" --description "Critical — blocks release or breaks users" --force
gh label create "priority:p1" --repo "$REPO" --color "D93F0B" --description "High — should be in current sprint" --force
gh label create "priority:p2" --repo "$REPO" --color "FBCA04" --description "Medium — next sprint or when capacity allows" --force
gh label create "priority:p3" --repo "$REPO" --color "C2E0C6" --description "Low — nice to have, backlog filler" --force

# --- Squad labels (routing) ---
gh label create "squad"             --repo "$REPO" --color "0366D6" --description "Squad-managed issue" --force
gh label create "squad:unassigned"  --repo "$REPO" --color "E4E669" --description "No agent assigned yet" --force
gh label create "squad:human"       --repo "$REPO" --color "0E8A16" --description "Routed to a human team member" --force

# --- Dynamic agent labels (read from roster) ---
# In production, squad init reads .ai-team/agents/ and creates squad:{name} for each agent.
# For Squad's own repo:
gh label create "squad:keaton"    --repo "$REPO" --color "0366D6" --description "Routed to Keaton (Lead)" --force
gh label create "squad:verbal"    --repo "$REPO" --color "0366D6" --description "Routed to Verbal (Prompt Engineer)" --force
gh label create "squad:fenster"   --repo "$REPO" --color "0366D6" --description "Routed to Fenster (Core Dev)" --force
gh label create "squad:mcmanus"   --repo "$REPO" --color "0366D6" --description "Routed to McManus (DevRel)" --force
gh label create "squad:hockney"   --repo "$REPO" --color "0366D6" --description "Routed to Hockney (Tester)" --force
gh label create "squad:kujan"     --repo "$REPO" --color "0366D6" --description "Routed to Kujan (SDK Expert)" --force
gh label create "squad:kobayashi" --repo "$REPO" --color "0366D6" --description "Routed to Kobayashi (Release Eng)" --force

# --- Automation labels ---
gh label create "cca-eligible"          --repo "$REPO" --color "6E40C9" --description "Can be assigned to Copilot Coding Agent" --force
gh label create "needs-review"          --repo "$REPO" --color "FBCA04" --description "Waiting for human or agent review" --force
gh label create "needs-decomposition"   --repo "$REPO" --color "D93F0B" --description "Approved proposal needing work item breakdown" --force
gh label create "stale"                 --repo "$REPO" --color "BFD4F2" --description "No activity for extended period" --force
gh label create "good-first-issue"      --repo "$REPO" --color "7057FF" --description "Good for new contributors" --force
gh label create "help-wanted"           --repo "$REPO" --color "008672" --description "Extra attention needed" --force

# --- Migration & provenance labels ---
gh label create "migrated:from-markdown" --repo "$REPO" --color "D4C5F9" --description "Migrated from a markdown proposal file" --force
gh label create "era:v0.1"              --repo "$REPO" --color "F9D0C4" --description "Relates to Squad v0.1.x" --force
gh label create "era:v0.2"              --repo "$REPO" --color "FEF2C0" --description "Relates to Squad v0.2.x" --force
gh label create "era:v0.3"              --repo "$REPO" --color "C2E0C6" --description "Relates to Squad v0.3.x" --force

echo "✅ All Squad labels created/updated in $REPO"
```

### 6.2 Idempotency

The `--force` flag on `gh label create` handles idempotency:
- If the label doesn't exist → create it
- If the label exists with different color/description → update it
- If the label exists and matches → no-op

Running `squad init` twice produces the same result. Running it after adding new agents to the roster creates only the new `squad:{name}` labels.

### 6.3 Label Count

Total labels created by default: **39**
- Status: 8
- Type: 8
- Priority: 4
- Squad (base + meta): 3
- Squad (agents, this team): 7
- Automation: 6
- Migration/provenance: 4

This is within GitHub's practical limits (no hard cap, but >100 labels become unwieldy). A project with fewer agents would have fewer `squad:{name}` labels.

---

## 7. Provider Abstraction

### 7.1 The Abstraction Problem

Labels are GitHub's mechanism for structured metadata on issues. Other providers have different primitives:

| Concept | GitHub | Azure DevOps | GitLab |
|---|---|---|---|
| Issue/work item status | Labels (`status:X`) | Built-in State field (New, Active, Resolved, Closed) | Labels (same as GitHub) |
| Categorization | Labels (`type:X`) | Work Item Type (Bug, User Story, Task, Epic) | Labels |
| Priority | Labels (`priority:X`) | Built-in Priority field (1-4) | Labels or built-in weight |
| Agent routing | Labels (`squad:X`) | Tags (freeform) or custom fields | Labels |
| Sprint/milestone | Milestones | Iterations (built-in) | Milestones |
| Automation trigger | Label events → Actions | State transitions → Azure Pipelines | Label events → GitLab CI |

### 7.2 Mapping Strategy

The provider abstraction layer maps Squad's label taxonomy to each provider's native concepts:

**GitHub (native — no mapping needed):**
```
status:draft         → label "status:draft"
type:proposal        → label "type:proposal"
priority:p0          → label "priority:p0"
squad:verbal         → label "squad:verbal"
```

**Azure DevOps:**
```
status:draft         → State: "New"
status:reviewing     → State: "Active" + Tag: "reviewing"
status:approved      → State: "Active" + Tag: "approved"
status:implementing  → State: "Active"
status:done          → State: "Resolved" / "Closed"
status:blocked       → State: "Active" + Tag: "blocked"
status:shelved       → State: "New" + Tag: "shelved"
status:superseded    → State: "Closed" + Reason: "Superseded"
type:proposal        → Work Item Type: "User Story" + Tag: "proposal"
type:bug             → Work Item Type: "Bug"
type:feature         → Work Item Type: "User Story"
priority:p0          → Priority: 1
priority:p1          → Priority: 2
priority:p2          → Priority: 3
priority:p3          → Priority: 4
squad:verbal         → Tag: "squad:verbal"
```

**GitLab:**
```
status:draft         → label "status::draft" (scoped label — GitLab uses :: for mutual exclusion)
type:proposal        → label "type::proposal" (scoped label)
priority:p0          → label "priority::p0" (scoped label)
squad:verbal         → label "squad::verbal" (scoped label)
```

GitLab's **scoped labels** (using `::`) provide native mutual exclusion within a group — exactly what Squad needs. `status::draft` and `status::reviewing` cannot coexist on the same issue. This is better than GitHub's approach, where mutual exclusion must be enforced by automation.

### 7.3 Implementation Approach

The provider abstraction is a **mapping layer**, not a runtime abstraction:

1. Squad's internal model uses the label taxonomy as defined in this document (namespace:value format)
2. The provider adapter translates Squad labels to provider-native concepts on write
3. The provider adapter translates provider-native state back to Squad labels on read
4. The coordinator works exclusively with Squad labels — never with provider-specific concepts

```
Coordinator → "set status:approved on issue #42"
     │
     ▼
Provider Adapter (GitHub): gh label add "status:approved" #42 && gh label remove "status:reviewing" #42
Provider Adapter (ADO):    az boards work-item update --id 42 --state "Active" --tag "approved"
Provider Adapter (GitLab): glab issue label add "status::approved" 42 && glab issue label remove "status::reviewing" 42
```

This keeps the coordinator prompt clean and provider-agnostic. The adapter handles the translation. Today, only the GitHub adapter exists. ADO and GitLab adapters are future work — the taxonomy is designed to map cleanly to both when the time comes.

---

## 8. Design Decisions & Rationale

### Why namespaced labels (`status:X`) instead of flat labels (`draft`, `approved`)?

Flat labels collide. A project might already have a "bug" label. `type:bug` is unambiguous. The colon separator is parseable (`split(':')` gives `[namespace, value]`), scannable by humans, and follows conventions used by Kubernetes, Prometheus, and most label-heavy systems.

### Why not GitHub Projects board columns for status?

Projects columns are great for Kanban visualization but terrible as a state machine:
- No API events on column change (can't trigger Actions)
- Column names aren't labels (can't filter issues by column)
- Projects require additional permissions (`read:project` scope)
- Not all repos have Projects enabled

Labels are universally available, event-driven, API-queryable, and visible on every issue. Projects can be layered on top as a visualization, but labels are the source of truth.

### Why `status:shelved` keeps issues open?

Shelved ≠ dead. Shelved means "not now, maybe later." Closing a shelved issue hides it from default issue views, which means humans forget about it. Open shelved issues appear in filtered views (`label:status:shelved`) and serve as a visible backlog of deferred work. When the team is ready, they can unshelve (swap to `status:draft`) without reopening.

### Why only one status label at a time?

Multiple simultaneous states create ambiguity. Is an issue that is both `status:reviewing` and `status:blocked` being reviewed or blocked? The state machine is sequential — one state at a time, clear transitions. This is enforced by label swaps (remove old, apply new) rather than label accumulation.

### Why `squad:` labels AND GitHub assignees?

They serve different purposes. `squad:verbal` is routing — it tells the Squad system which agent handles this. GitHub assignee is accountability — it tells the GitHub ecosystem which human is responsible. An issue can be `squad:fenster` (Fenster does the work) with assignee @bradygaster (Brady is accountable). They're orthogonal.

---

*This proposal was authored by Verbal (Prompt Engineer & AI Strategist) for Squad.*
