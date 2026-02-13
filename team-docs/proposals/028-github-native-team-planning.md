# Proposal 028: GitHub-Native Team Planning

**Author:** Keaton (Lead)  
**Date:** 2026-02-10  
**Status:** Phase 1 Approved for v0.3.0 ✅  
**Requested by:** bradygaster — *"think of the backlog becoming a github project. and proposals written to disk as markdown files written to github as issues instead. and use your imagination, team."*  
**Builds on:** Proposal 023 (Incoming Queue), Proposal 025 (PR #2 — GitHub Issues Mode), Proposal 027 (v0.3.0 Sprint Plan)  
**Door opened by:** @spboyer (PR #2 — GitHub Issues Mode)  
**Reference implementation:** [spboyer/slidemaker](https://github.com/spboyer/slidemaker) — Shayne Boyer (@spboyer) validated this design end-to-end  
**Contributors:** Shayne Boyer (@spboyer) — label conventions, issue structure, PRD→Issues pipeline validation

---

## The Vision

Squad's planning tools today are filesystem-native. Proposals are markdown files in `team-docs/proposals/`. The backlog (Proposal 023) will be `.ai-team/backlog.md`. Decisions live in `.ai-team/decisions/`. All of this works — it's fast, durable, agent-readable, git-tracked, and requires zero external dependencies.

But it's also invisible. An external contributor like Shayne can't see what the team is planning without checking out a branch. Brady can't scan open proposals from his phone. Nobody can comment on a backlog item without editing a markdown file and pushing a commit. The planning surface is powerful for agents and opaque for humans.

Brady's insight: **what if Squad's internal planning tools are also GitHub's collaboration tools?**

Shayne already opened the door. PR #2 added GitHub Issues Mode — the ability to connect Squad to a repo's issues and work them through a full lifecycle (list → route → branch → PR → review → merge). That capability points inward. What if proposals ARE GitHub Issues? What if the team backlog IS a GitHub Project board? What if agents update the board as they work?

This proposal designs that world.

---

## The Problem

### For humans

1. **Proposals are invisible.** A proposal exists as a markdown file on a feature branch. To see it, you must check out that branch and read the file. There's no way to browse proposals, comment on them, or track their status without git access.

2. **The backlog is local.** Proposal 023's `backlog.md` is agent-readable and durable — but only if you have the filesystem. Brady can't glance at the team's intent queue from a browser.

3. **Collaboration requires commits.** To comment on a proposal or suggest a priority change, you must edit a file and push. GitHub Issues give you comments, reactions, labels, assignees, and milestones — all without touching git.

4. **External contributors are blind.** Shayne contributed PR #2 by reading the codebase deeply. But he couldn't see the sprint plan, the backlog, or in-flight proposals without checking out the working branch. Making planning visible makes contribution easier.

### For agents

5. **No structured metadata on proposals.** A proposal's status ("Draft", "Approved ✅", "Cancelled") is a string in a markdown file. There's no queryable field. GitHub Issues give you labels, state (open/closed), milestones, and project board columns — all API-queryable.

6. **Backlog items have no external surface.** An agent captures "add connection pooling" to `backlog.md`. That item has no URL, no comment thread, no way for a human to say "actually, let's prioritize this." A GitHub Issue does.

7. **No cross-repo visibility.** If Squad is used on multiple projects, each has its own `backlog.md`. A GitHub Project can aggregate across repos.

---

## The Design

### Principle: Filesystem remains authoritative. GitHub is a synchronized view.

Proposal 023 established: "Filesystem always wins. SQL is a queryable cache." This principle extends. GitHub becomes an external cache — richer than SQL (comments, labels, project boards) but still secondary to the filesystem.

Why? Because:
- Agents read files, not APIs. Changing this is a deep architectural shift we don't need.
- Filesystem operations are instant and offline. API calls are slow and require connectivity.
- Git history is the audit trail. GitHub Issue history is supplementary.
- If the GitHub API is down, Squad still works. If the filesystem is corrupted, nothing works regardless.

**The filesystem is the database. GitHub is the dashboard.**

### Architecture: One-way push with selective pull-back

```
┌──────────────────────┐         ┌─────────────────────────┐
│   FILESYSTEM (auth)  │────────▶│   GITHUB (view + collab) │
│                      │         │                          │
│  proposals/*.md      │──push──▶│  Issues (label:proposal) │
│  backlog.md          │──push──▶│  Project Board columns   │
│  decisions/          │──push──▶│  Issue comments (log)    │
│                      │         │                          │
│                      │◀─pull───│  Human comments          │
│                      │◀─pull───│  Priority changes        │
│                      │◀─pull───│  New issues from humans  │
└──────────────────────┘         └─────────────────────────┘
```

**Push (filesystem → GitHub):**
- Agent writes a proposal → coordinator also creates a GitHub Issue with label `proposal` and the proposal body as the issue description.
- Backlog item captured → coordinator creates a GitHub Issue with label `backlog` and adds it to the Project board in the "Captured" column.
- Agent completes work → coordinator moves the issue to "Done" on the Project board and closes it.
- Proposal status changes → coordinator updates the issue (close it, add label `approved` or `cancelled`).

**Pull-back (GitHub → filesystem):**
- Human comments on a proposal issue → next session, coordinator reads new comments and appends them to the proposal file's `## Discussion` section or includes them in agent context.
- Human changes priority (moves card on Project board) → coordinator reads the board state on session start and updates `backlog.md` ordering.
- Human creates a new issue → coordinator detects it on session start and adds it to `backlog.md` (same as Proposal 023's rehydration, but from GitHub instead of just the filesystem).

**Conflict resolution:** If a backlog item exists in `backlog.md` but not on GitHub (or vice versa), the filesystem record is created/updated to match the union. Filesystem structure is authoritative for format; GitHub is authoritative for human-added comments and priority signals.

---

## What This Unlocks

### 1. Proposals become collaborative

A proposal created by an agent appears as a GitHub Issue. Brady can read it on his phone, comment "I love this but cut Phase 3," and the next session, the agent sees that feedback. No branch checkout, no file editing, no commit required.

Labels provide structure using the `squad:` prefix convention (validated by Shayne Boyer's slidemaker implementation):

**Team labels:**
- `squad` — marks any issue as squad-managed (base label on every squad issue)
- `squad:{agent-name}` — routes to a specific agent (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`)

**Planning labels:**
- `proposal` — it's a proposal
- `sprint:0.3.0` — it's scoped to a sprint  
- `status:draft`, `status:approved`, `status:cancelled` — lifecycle tracking
- `area:architecture`, `area:devrel`, `area:testing` — domain routing

### 2. The backlog becomes a Project board

GitHub Projects gives the backlog a Kanban surface:

| Captured | Open | In Progress | Done |
|----------|------|-------------|------|
| WebSocket support | Connection pooling | Auth refactor (Fenster) | Database module ✅ |
| Rate limiting | Caching layer | | Migration tests ✅ |

Agents move cards as they work. The coordinator updates column positions. Humans can drag cards to reprioritize. The board is the team's shared intent — visible to everyone, updateable by anyone.

### 3. External contributors can see the roadmap

Shayne could have seen the sprint plan, the backlog, and the open proposals before contributing PR #2. He would have known which areas needed help, what the team's priorities were, and where his contribution fit. Making planning visible makes the project more inviting.

### 4. Sprint planning gets GitHub milestones

A sprint like v0.3.0 becomes a GitHub Milestone. Work items from Proposal 027 become issues assigned to that milestone. Progress is visible: "v0.3.0: 8/14 items complete." Brady can see sprint health from the GitHub UI without reading a markdown file.

### 5. Discussion has a home

Today, "discussion" on a proposal means Brady talks to the team in a Copilot CLI session. That discussion is ephemeral — it exists in terminal history and sometimes gets captured to decisions. With proposals as issues, discussion lives in the comment thread. Agents can read those comments. Humans can react with 👍 or 👎. The conversation has a URL.

### 6. Cross-session continuity deepens

Proposal 023 gives the backlog cross-session persistence via the filesystem. This proposal gives it cross-platform persistence. Close your laptop, open GitHub on your phone, see the board, add a comment, and the next session picks it up. The team's memory isn't trapped in a terminal.

---

## What This Risks

### 1. GitHub API coupling

Squad currently has zero runtime dependencies on external APIs. Adding GitHub sync means: network calls that can fail, rate limits, authentication requirements (`gh` CLI or MCP GitHub server), and a new failure mode ("Squad can't update the board — GitHub is down").

**Mitigation:** GitHub sync is always optional. If no repo is connected, Squad works exactly as it does today. Sync failures are logged but never block agent work. The filesystem is always consistent, even if GitHub is stale.

### 2. Sync drift

The filesystem says a backlog item is "Open." The GitHub board says it's "In Progress." Who's right?

**Mitigation:** Filesystem wins on structure (item exists, status). GitHub wins on supplementary data (comments, reactions, manual priority). On session start, the coordinator reconciles by reading both sources. Drift is resolved, not accumulated.

### 3. Complexity creep

Proposal 023 is elegant: extract → capture → acknowledge. This proposal adds: extract → capture → push to GitHub → reconcile on pull. Each additional step is a potential failure point and a maintenance surface.

**Mitigation:** Phase the rollout aggressively. Phase 1 is one-way push only (write-and-forget). Phase 2 adds pull-back for comments only. Phase 3 adds full reconciliation. Each phase is independently valuable and independently revertible.

### 4. Losing the speed of "just write a file"

Today, an agent writes a proposal in 2 seconds (create file, done). With GitHub sync, it's 2 seconds + an API call (create issue). If the API call takes 3 seconds, we've more than doubled the overhead.

**Mitigation:** GitHub push is asynchronous and non-blocking. The agent writes the file (done — agent can proceed) and the coordinator pushes to GitHub in the background or at the end of the session. The file write is never slower.

### 5. Scope gravity

"We're syncing proposals? Let's sync decisions too. And history. And skills. And the charter." Feature gravity pulls everything into the sync surface. Suddenly Squad is a GitHub-to-filesystem bidirectional sync engine, which is not what we're building.

**Mitigation:** Explicit scope boundary: **only proposals and backlog items sync.** Decisions, history, skills, and charters remain filesystem-only. These are agent-internal state — syncing them to GitHub adds noise, not value. If we ever reconsider, it requires a new proposal.

---

## Shayne's Door

PR #2 added GitHub Issues Mode — the ability to connect Squad to a repo's issues and work them. That capability currently points outward: "here are issues that exist; let's work them."

This proposal turns that capability inward: "here are planning artifacts that Squad creates; let's make them issues too."

The implementation reuses Shayne's patterns:
- `gh issue create` / GitHub MCP `create_issue` — for pushing proposals and backlog items
- `gh issue list` / GitHub MCP `list_issues` — for reading human-added issues on session start
- `gh project` / GitHub MCP — for board management
- Labels, milestones, assignees — for structured metadata

The difference: Shayne's mode is "work external issues." This proposal adds "manage internal planning artifacts on GitHub." Same tools, different direction.

---

## Reference Implementation: spboyer/slidemaker

> **Credit:** Shayne Boyer ([@spboyer](https://github.com/spboyer)) validated this proposal's design patterns end-to-end by using Squad to decompose a PRD into GitHub Issues on his [slidemaker](https://github.com/spboyer/slidemaker) project. The patterns documented here are extracted from that real-world usage. Shayne is a contributor to this design.

### What Shayne built

Squad decomposed a slidemaker PRD into 9 GitHub Issues ([#1](https://github.com/spboyer/slidemaker/issues/1)–[#9](https://github.com/spboyer/slidemaker/issues/9)), proving the full PRD → GitHub Issues pipeline works. 8 of 9 issues were completed and closed. The patterns that emerged are now the standard for Proposal 028.

### Pattern 1: `squad:` label convention

Every issue gets two labels:
- **`squad`** — the base label marking any issue as squad-managed. Applied to all 9 issues.
- **`squad:{agent-name}`** — routes the issue to a specific agent. Examples from slidemaker:
  - `squad:verbal` (6 issues — frontend work)
  - `squad:mcmanus` (2 issues — backend APIs)
  - `squad:fenster` (1 issue — build verification and smoke tests)

This convention is simple, scannable, and filterable. `gh issue list --label squad` shows all squad-managed issues. `gh issue list --label squad:verbal` shows one agent's workload. **This is now the standard label convention for Proposal 028's Phase 1.**

### Pattern 2: User story format with acceptance criteria

All 9 issues follow the same structure:

```markdown
## User Story
**As a** {persona}, **I want** {capability}, **so that** {benefit}.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Notes
- Squad member: {Name} ({Role})
- Primary work: {file paths}
- Dependencies: {inline dependency notes}
```

Key properties:
- **Consistent format** — every issue is parseable by agents and readable by humans
- **Testable criteria** — checkbox acceptance criteria define "done" unambiguously
- **Agent-readable metadata** — the Notes section tells the agent who owns the work and which files to touch

### Pattern 3: Agent metadata injection

Each issue's Notes section includes:
- **`Squad member: {Name} ({Role})`** — e.g., "Squad member: Verbal (Frontend Dev)", "Squad member: McManus (Backend Dev)", "Squad member: Fenster (Tester)"
- **`Primary work: {file paths}`** — e.g., "Primary work: `src/app/api/generate/route.ts`, `src/lib/openai.ts`"

This metadata injection serves two purposes: it tells agents what to work on when they pick up the issue, and it tells humans which agent is responsible.

### Pattern 4: Inline dependency tracking

Issues note dependencies directly in the body:
- **"No dependencies — can start immediately"** (Issues #2, #7, #8) — signals parallel-safe work
- **"Dependencies will be added after all issues are created"** (Issues #1, #3, #4, #5, #6, #9) — deferred dependency linking

This is lightweight and practical. For Phase 1 (one-way push), inline text dependencies are sufficient. Structured dependency tracking (sub-issues, issue links) is a Phase 2–3 concern.

### Pattern 5: PRD → Issues decomposition pipeline

The 9 issues were decomposed from a single PRD, proving the end-to-end flow:

```
PRD (product requirements) → Squad agent decomposition → 9 GitHub Issues
```

| # | Issue | Agent | Role |
|---|-------|-------|------|
| 1 | US-1: Generate a presentation via AI | Verbal | Frontend |
| 2 | US-2: View and navigate slides | Verbal | Frontend |
| 3 | US-3: Edit slide content | Verbal | Frontend |
| 4 | US-4: Add slides to existing presentation | Verbal | Frontend |
| 5 | US-5: Delete and reorder slides | Verbal | Frontend |
| 6 | US-6: List and manage presentations | Verbal | Frontend |
| 7 | US-8: AI slide generation API | McManus | Backend |
| 8 | US-7: Presentation CRUD API | McManus | Backend |
| 9 | US-9: Build verification and smoke tests | Fenster | Tester |

The work decomposition naturally maps agents to their roles: Verbal handles all 6 frontend stories, McManus handles both backend APIs, Fenster handles the verification story. This role-based routing is exactly what the `squad:{agent-name}` label convention enables.

### What this validates for 028

1. **Phase 1 (one-way push) is proven.** The PRD→Issues flow works today. Squad agents can create well-structured, labeled, agent-routed GitHub Issues from planning artifacts.
2. **The `squad:` label convention scales.** With 9 issues across 3 agents, filtering by `squad:verbal` instantly shows workload. This will work at 50+ issues.
3. **Agent metadata in issue bodies works.** Agents can read their assignment and file targets from the issue body — no external routing logic needed.
4. **User story format is the right template.** Consistent, testable, human-readable, agent-parseable. This should be the default issue template for squad-generated issues.

---

## Implementation Layers

### Phase 1: One-Way Push (High Value, Low Risk)

**Scope:** When an agent creates a proposal or the coordinator captures a backlog item, also create a GitHub Issue. No pull-back, no reconciliation.

**What ships:**
- Coordinator prompt addition: after writing a proposal file, create a GitHub Issue with the proposal title, body (first 200 lines), and labels (`proposal`, `squad`, `sprint:{version}`).
- After capturing a backlog item to `backlog.md`, create a GitHub Issue with labels (`squad`, `backlog`, `captured`).
- Agent-routed issues get `squad:{agent-name}` labels (e.g., `squad:verbal`, `squad:fenster`) matching the slidemaker convention.
- Issue bodies follow the validated user story format: "As a {persona}, I want {capability}, so that {benefit}" with checkbox acceptance criteria and agent metadata in Notes.
- When a proposal is approved or cancelled, close the corresponding issue with a comment noting the outcome.
- When an agent marks a backlog item done, close the corresponding issue.
- Issue numbers are stored as metadata in the markdown files (e.g., `**GitHub Issue:** #42`).

**What doesn't ship:**
- No reading from GitHub. No pull-back. No reconciliation.
- No Project board (just issues and labels).
- Sync is best-effort — if the API call fails, log it and move on.

**Dependencies:** `gh` CLI or GitHub MCP server (same as PR #2's GitHub Issues Mode). If neither is available, skip sync silently.

**Effort estimate:** 3-4 hours (prompt engineering, no code changes to index.js)

**Value:** Proposals and backlog items are immediately visible on GitHub. Brady can see them from his phone. Contributors can browse them. Discussion can happen in issue comments. This alone is transformative.

### Phase 2: Comment Pull-Back

**Scope:** On session start, read GitHub Issue comments on proposal and backlog issues. Inject them into agent context.

**What ships:**
- Coordinator reads proposal issues with label `proposal` and checks for new comments since last sync timestamp.
- New comments are appended to the proposal file's `## Discussion` section (or a new `## GitHub Discussion` section if Discussion doesn't exist).
- New comments on backlog issues are included in the coordinator's context when the backlog item is relevant to the current work.
- A sync timestamp is stored in `.ai-team/github-sync-state.json` (last sync time per issue).

**What doesn't ship:**
- No Project board sync.
- No priority reconciliation.
- No new issue detection (humans create issues on GitHub, but they don't flow into `backlog.md` yet).

**Effort estimate:** 4-5 hours

**Value:** Two-way conversation. Brady comments on a proposal issue; the agent sees that feedback next session. The proposal evolves through GitHub's collaboration UI.

### Phase 3: GitHub Project Board + Full Reconciliation

**Scope:** Create and maintain a GitHub Project board that mirrors the team backlog. Detect human-created issues and bring them into `backlog.md`. Full two-way sync.

**What ships:**
- A GitHub Project named "Squad — {team-name}" is created (or connected) during init or on first sync.
- Board columns: Captured → Open → In Progress → Done (matching Proposal 023's lifecycle).
- Backlog items map to cards. Agents move cards as they work.
- Humans can drag cards to reprioritize. On session start, coordinator reads the board state and updates `backlog.md` ordering.
- New issues created by humans on GitHub (with label `backlog`) are detected and added to `backlog.md`.
- Sprint milestones created from sprint plan proposals.
- Conflict resolution: union merge — items in either source are preserved. Filesystem wins on status; GitHub wins on priority ordering and comments.

**Effort estimate:** 8-12 hours

**Value:** The full vision. The team's planning surface is GitHub. Agents update it as they work. Humans interact with it naturally. The backlog is a living board, not a static file.

### Phase 4 (Aspirational): Cross-Repo Planning

**Scope:** If Squad is used across multiple repositories, a single GitHub Project aggregates planning across all of them.

**What ships:**
- Multi-repo Project board with repo-scoped columns or views.
- Backlog items tagged by repository.
- Cross-repo sprint milestones.

**Effort estimate:** Unknown — depends on GitHub Projects API maturity for multi-repo scenarios.

**Value:** For teams using Squad on a portfolio of projects, a single planning dashboard. This is far-future, but the architecture should not preclude it.

---

## How This Fits v0.3.0

**Phase 1 is shipping in v0.3.0.** Brady overrode Keaton's recommendation to defer to Horizon. His directive: "go with 0.3.0. brady and shayne want this."

Phase 1 (one-way push, 3-4h prompt engineering, no index.js changes) is added to v0.3.0 Wave 2 as item 5.9. It depends on backlog capture (4.5, 4.6) for backlog→Issue push; proposal→Issue push can start independently.

v0.3.0 creates the preconditions:
- **Proposal 023 (backlog capture)** gives us the `backlog.md` that Phase 1 pushes to GitHub.
- **Proposal 024 (model selection)** is orthogonal but doesn't conflict.
- **PR #2 (GitHub Issues Mode)** gives us the `gh` CLI patterns that Phase 1 reuses.
- **Proposal 028a (Kujan's API assessment)** confirms all write tools are working via `gh` CLI.

**Updated timing:**

| Phase | Version | Rationale |
|-------|---------|-----------|
| Phase 1 (one-way push) | **v0.3.0** ✅ | Brady's directive — ships in Wave 2 as item 5.9 |
| Phase 2 (comment pull-back) | v0.4.0 | Needs Phase 1 proven first |
| Phase 3 (full Project board) | v0.5.0 or v1.0 | Significant complexity; needs Phase 1-2 proven |
| Phase 4 (cross-repo) | v1.0+ | Aspirational; not designed in detail yet |

Phase 1 delivers 80% of the human-facing value: proposals and backlog items visible on GitHub, no branch checkout required, comments possible from a phone. The remaining phases build on that proven foundation.

---

## Decision: Filesystem vs. GitHub as Source of Truth

This is the architectural question Brady surfaced. Three options:

### Option A: Filesystem authoritative, GitHub as view (RECOMMENDED)

GitHub is a projection of filesystem state, enriched with comments and priority signals. Agents never read from GitHub to determine what to work on — they read files. GitHub adds a collaboration layer on top.

**Pro:** Zero architectural change to Squad's core. Agents work the same way. Offline works.  
**Con:** GitHub state can be stale. Human edits on GitHub require a sync cycle to reach agents.

### Option B: GitHub authoritative, filesystem as cache

GitHub Issues are the source of truth. `backlog.md` is generated from GitHub state on session start. Agents read the generated file.

**Pro:** GitHub is the single source. No sync drift — one direction only.  
**Con:** Requires internet on every session start. Breaks offline mode. Makes Squad dependent on GitHub API availability. Contradicts Proposal 023's "filesystem always wins." If GitHub is down, the team can't see its backlog.

### Option C: True bidirectional sync (eventual consistency)

Both sources are authoritative. A reconciliation algorithm merges changes from both sides. Conflicts are resolved by timestamp or by explicit rules.

**Pro:** Maximum flexibility.  
**Con:** Maximum complexity. Bidirectional sync is a product in itself (ask Notion, Obsidian, or any sync engine). Conflicts are inevitable. This is the wrong investment for a CLI tool.

**Decision: Option A.** The filesystem is the database. GitHub is the dashboard. This preserves Squad's core simplicity while adding the collaboration surface Brady envisions. If we ever need Option C, the filesystem-first architecture makes migration possible. Option B burns the bridge.

---

## Interaction with Existing Proposals

| Proposal | Interaction |
|----------|-------------|
| **023 (Incoming Queue)** | Phase 1 depends on 023's backlog.md existing. GitHub sync extends 023's capture: extract → write to backlog.md → push to GitHub Issue. |
| **025 (PR #2 Review)** | Reuses the same `gh` CLI / MCP patterns. GitHub Issues Mode connects to external issues; this connects internal planning. Same tools, different direction. |
| **024 (Model Selection)** | Orthogonal. No interaction. |
| **027 (Sprint Plan)** | Not in v0.3.0 scope. Sprint plan items could become GitHub milestones in Phase 3. |
| **008 (Portable Squads)** | Export/import would need to handle `github-sync-state.json` — either export it (sync reconnects to same repo) or strip it (fresh start). Probably strip it. |

---

## Alternatives Considered

### A. Use GitHub Discussions instead of Issues

**Why considered:** Discussions have threaded conversations, categories, and are designed for open-ended topics (like proposals).  
**Why rejected:** Issues have labels, milestones, Project board integration, and API maturity that Discussions lack. Proposals need lifecycle tracking (draft → approved → shipped), which maps to issue state better than discussion state. Issues also integrate with PRs (`Closes #N`), which means proposal issues can be closed when the implementing PR merges.

### B. Use a third-party project management tool (Linear, Notion, etc.)

**Why considered:** More powerful project management features.  
**Why rejected:** Adds a non-GitHub dependency. Squad is a GitHub-native tool — its users are on GitHub, its code is on GitHub, its distribution is GitHub-only. Adding Linear would be a strategic misalignment. GitHub Projects is "good enough" and zero-dependency for existing users.

### C. Skip the filesystem entirely — go GitHub-only for planning

**Why considered:** Simpler — no sync, no dual storage.  
**Why rejected:** Breaks the core architectural principle. Agents read files. Offline mode matters. Git history is the audit trail. The filesystem is Squad's superpower — we extend it, not replace it.

### D. Build a custom web UI for planning

**Why considered:** Full control over the experience.  
**Why rejected:** Not what we're building. Squad is a CLI tool with a filesystem brain. A web UI is a second product. GitHub already built the UI — we just need to push data to it.

---

## Success Criteria

### Phase 1
1. Every proposal created by an agent also exists as a labeled GitHub Issue.
2. Every backlog item captured to `backlog.md` also exists as a labeled GitHub Issue.
3. Proposal/backlog status changes (approved, done, cancelled) are reflected as issue state changes.
4. If `gh` CLI / GitHub MCP is unavailable, Squad works identically to today — no errors, no degradation.
5. Issue number metadata is stored in the markdown file for traceability.

### Phase 2
6. Human comments on proposal issues appear in agent context on next session.
7. Comment sync is timestamped — no duplicate injection.
8. Agents can reference GitHub discussion in their responses: "Brady commented on #42: 'cut Phase 3.'"

### Phase 3
9. A GitHub Project board exists with columns matching the backlog lifecycle.
10. Agent work updates the board (items move from Open → In Progress → Done).
11. Human-created issues with appropriate labels appear in `backlog.md` on next session.
12. Priority changes on the board (drag-to-reorder) are reflected in `backlog.md` ordering.

---

## Review Requested

- **Brady:** Does this match the vision? Is Option A (filesystem authoritative) the right call, or do you want GitHub to own the data?
- **Verbal:** Prompt engineering assessment — how much coordinator instruction does Phase 1 require? Does it fit in the context budget?
- **Kujan:** Platform assessment — `gh` CLI vs. GitHub MCP for issue/project operations. Which is more reliable? Can we abstract over both?
- **Fenster:** Implementation review — `github-sync-state.json` design, metadata injection into markdown files.
- **Shayne (@spboyer):** You opened this door. How does this extend your GitHub Issues Mode? Where do you see overlap or conflict?

---

**This is a "what could be" proposal. Brady asked us to use our imagination. Here's what we see: Squad's planning tools — proposals, backlog, sprint plans — living on GitHub where humans can see them, comment on them, and collaborate with their AI team in the open. The filesystem stays authoritative. GitHub becomes the window.**

**Phase 1 is 3-4 hours of prompt engineering and delivers 80% of the value. Shipping in v0.3.0 Wave 2 — Brady's call.**
