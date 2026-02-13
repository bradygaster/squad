# Proposal 033: GitHub Project Boards for Squad

**Author:** Keaton (Lead)  
**Date:** 2026-02-10  
**Status:** Draft  
**Requested by:** @londospark via GitHub Issue #6  
**Builds on:** Proposal 032 (GitHub-Native Proposals), 032a (Provider Abstraction), 032c (Label Taxonomy), PR #5 (Issue Assignment & Triage Workflows)  
**Version target:** v0.4.0 (not v0.3.0 — see rationale below)

---

## 1. Vision

Issue #6 proposes that Squad agents autonomously create and manage GitHub Project Boards (V2) to give humans a persistent, visual dashboard of what the squad is doing. This is a natural extension of the GitHub-native strategy: issues are the work items, labels are the state machine, and project boards are the dashboard.

**The pitch is sound.** Project boards are another GitHub-native surface. They complement — not compete with — our label-driven workflow (032c). Labels drive automation; boards provide visualization. An issue tagged `status:implementing` with `squad:fenster` appears in the "In Progress" column. When the label swaps to `status:done`, the card moves to "Done." The board is a projection of label state, not a parallel tracking system.

**But this is a v0.4.0 feature, not v0.3.0.** Brady's directive is clear: v0.3.0 is ONE feature — proposals as GitHub Issues (032). Everything else defers. Project boards layer on top of the issue/label infrastructure we're building in v0.3.0. Shipping them before that foundation is solid would be premature. The right sequence: labels and issues first (v0.3.0), boards as a dashboard on top (v0.4.0).

---

## 2. Technical Assessment

### 2.1 Strategic Alignment

| Factor | Assessment |
|--------|-----------|
| v0.3.0 alignment | Complementary but not in scope — Brady declared v0.3.0 is ONE feature (032) |
| PR #5 interaction | Additive — triaged/assigned issues from PR #5 workflows gain visual tracking |
| Label taxonomy (032c) | Natural mapping — `status:*` labels → board columns. No conflict. |
| Provider abstraction (032a) | **Critical concern** — Projects V2 is GitHub-only. Must design behind provider interface. |
| Zero-dependency constraint | **Blocker for GraphQL approach** — see §2.3 |

### 2.2 How This Interacts With What We've Shipped

PR #5 shipped three GitHub Actions workflows:
1. **squad-triage.yml** — auto-routes issues to squad members via `squad:{member}` labels
2. **squad-issue-assign.yml** — posts assignment acknowledgment when `squad:{member}` label is applied
3. **sync-squad-labels.yml** — syncs `squad:{name}` labels from `.ai-team/team.md`

Project boards sit ON TOP of this. The flow becomes:

```
Issue created → squad label → triage workflow → squad:{member} label → assignment workflow
                                                         ↓
                                                   Board card created
                                                   Column: "Todo"
                                                         ↓
                                                   status:implementing label
                                                   Column: "In Progress"
                                                         ↓
                                                   status:done label
                                                   Column: "Done"
```

The board card positioning is driven entirely by label state. No new state tracking needed — we reuse the 032c state machine.

### 2.3 The GraphQL Problem

**This is the hardest technical decision in this proposal.**

GitHub Projects V2 has no REST API support. The only path is the GraphQL API (`https://api.github.com/graphql`). This has three implications:

**1. Dependency question.** Squad is currently zero-dependency (no `node_modules`). The issue proposes a GraphQL client. Options:

| Option | Dependency | Complexity |
|--------|-----------|------------|
| A. `gh api graphql` CLI | None (uses existing `gh` CLI) | Low — shell out to `gh api graphql -f query='...'` |
| B. Native `https` module | None | Medium — hand-roll GraphQL HTTP calls |
| C. `graphql-request` npm package | New dependency | Low complexity, breaks zero-dep |
| D. `@octokit/graphql` npm package | New dependency | Low complexity, breaks zero-dep |

**My call: Option A — `gh api graphql`.** This is the only option that preserves zero-dependency. The `gh` CLI already handles authentication, rate limiting, and GraphQL. The coordinator can shell out:

```bash
gh api graphql -f query='
  mutation {
    createProjectV2(input: {ownerId: "$OWNER_ID", title: "Squad Board"}) {
      projectV2 { id number url }
    }
  }
'
```

This fits our architecture. The coordinator is a prompt that executes shell commands (032a §3). It already uses `gh` CLI for everything. GraphQL through `gh api graphql` is the natural extension.

**Trade-off:** GraphQL queries are verbose in shell. The coordinator prompt will grow. But this is preferable to adding npm dependencies — that's a bigger architectural change than a few extra prompt lines.

**2. Token scope.** The `project` scope is required for Projects V2 API access. This is an **additional permission** beyond the standard `repo` scope. The `gh` CLI's default auth may not include it.

**Graceful degradation strategy:**
- Board operations attempt to run and catch permission errors
- If `project` scope is missing, the coordinator informs the user: "Project board features require the `project` scope. Run `gh auth refresh -s project` to enable."
- All board features are additive — Squad works perfectly without them
- No board operation should block issue/label/PR workflows

**3. Board ownership.** Who creates and manages the board?

| Option | Pros | Cons |
|--------|------|------|
| Coordinator creates on init | Automatic, zero user intervention | Creates boards users may not want |
| User requests explicitly | Opt-in, no surprise | Extra step |
| First issue creation triggers | Natural, contextual | Implicit behavior can confuse |

**My call: User-triggered, coordinator-executed.** The user says "set up a project board" or "create a board for this squad." The coordinator creates it. This matches our pattern — the coordinator is the intermediary for all platform operations (032 §3). No Octomember needed. No automatic board creation on init.

### 2.4 Provider Abstraction Impact

032a defines the provider abstraction as command-template-level, not code-level. Project boards need new entries in the capability negotiation interface:

```js
function getCapabilities() {
  return {
    // ... existing capabilities from 032a §2.8 ...
    projectBoards: boolean,     // Can create/manage project boards
    projectBoardColumns: boolean // Can configure board columns/statuses
  };
}
```

**Provider mapping:**

| Operation | GitHub (V2) | ADO | GitLab |
|-----------|------------|-----|--------|
| Create board | `gh api graphql` — `createProjectV2` | `az boards create` (REST) | GitLab Boards (REST API) |
| Add item to board | `gh api graphql` — `addProjectV2ItemById` | Automatic (backlog items appear) | `glab` — boards auto-populate from labels |
| Move item status | `gh api graphql` — `updateProjectV2ItemFieldValue` | `az boards work-item update --state` | Label-driven (no separate API) |
| Query board items | `gh api graphql` — `projectV2` query | `az boards query --wiql` | Board API query |

**Key insight:** ADO and GitLab boards are fundamentally different from GitHub Projects V2. ADO boards are tightly coupled to work item states. GitLab boards are label-driven projections (similar to what we want). GitHub Projects V2 is the most flexible but also the most API-complex. The provider abstraction must be capability-based — if `projectBoards === false`, skip all board operations.

### 2.5 Column-to-Label Mapping

The issue proposes "Todo / In Progress / Done" columns. Our label taxonomy (032c) has 8 status labels. The mapping:

| Board Column | Status Labels | Rationale |
|-------------|---------------|-----------|
| **Backlog** | `status:draft` | Not yet ready for work |
| **Ready** | `status:reviewing`, `status:approved` | Approved or awaiting review |
| **In Progress** | `status:implementing` | Active work |
| **Blocked** | `status:blocked` | Cannot proceed |
| **Done** | `status:done` | Complete |

`status:shelved` and `status:superseded` correspond to closed/archived — not shown on the active board.

This is a 5-column board, not 3. The issue's "Todo / In Progress / Done" is too simple for our workflow. But we default to the 5 columns and let users customize.

---

## 3. Work Items

### WI-1: GraphQL Command Templates for Projects V2

**Agent:** Fenster (Core Dev)  
**Size:** Medium (4-6h)  
**Priority:** P2  
**Dependencies:** 032a provider abstraction design (approved)

Define and validate the `gh api graphql` command templates for all Projects V2 operations:
- `createProjectV2` — create a new project board
- `addProjectV2ItemById` — add an issue to a board
- `updateProjectV2ItemFieldValue` — move an item between columns (status field)
- `projectV2` query — read board state, list items, get field IDs
- `deleteProjectV2Item` — remove an item from a board

Validate each command against the GitHub GraphQL API. Document error responses for missing `project` scope. Write as a SKILL.md so other agents can reference the patterns.

**Acceptance criteria:**
- [ ] All 5 mutations/queries documented with exact `gh api graphql` syntax
- [ ] Error handling for missing `project` scope documented
- [ ] Field ID discovery flow documented (status field IDs are project-specific)
- [ ] SKILL.md created at `.ai-team/skills/github-projects-v2/SKILL.md`

---

### WI-2: Provider Abstraction — Board Capabilities

**Agent:** Fenster (Core Dev)  
**Size:** Small (2-3h)  
**Priority:** P2  
**Dependencies:** WI-1, 032a provider abstraction design

Extend the provider abstraction interface (032a §2.8) with board capabilities:
- Add `projectBoards` and `projectBoardColumns` to `getCapabilities()`
- Define board operations in the provider interface: `createBoard`, `addItemToBoard`, `updateItemStatus`, `queryBoard`
- GitHub implementation uses WI-1 command templates
- ADO/GitLab stubs return `ProviderUnsupportedError` (future work)

**Acceptance criteria:**
- [ ] Board operations defined in provider interface spec
- [ ] GitHub provider implementation documented
- [ ] Capability negotiation updated — coordinator skips board ops when `projectBoards === false`
- [ ] 032a updated with board operations section

---

### WI-3: Board Initialization Flow

**Agent:** Verbal (Prompt Engineer)  
**Size:** Medium (3-5h)  
**Priority:** P2  
**Dependencies:** WI-1

Design the coordinator prompt additions for board initialization:
- User trigger detection: "set up a project board", "create a board", "I want a board for tracking"
- Board creation flow: check if board exists → create if missing → configure default columns → confirm to user
- Column configuration: 5-column default (Backlog, Ready, In Progress, Blocked, Done) mapped to `status:*` labels
- Store board ID and project number in `.ai-team/team.md` under `## Project Board`
- Graceful degradation: if `project` scope missing, inform user and skip

**Acceptance criteria:**
- [ ] Prompt additions defined for squad.agent.md
- [ ] Trigger patterns documented
- [ ] Board metadata storage format defined for team.md
- [ ] Graceful degradation path defined for missing permissions

---

### WI-4: Label-to-Board Sync Workflow

**Agent:** Fenster (Core Dev)  
**Size:** Medium (4-6h)  
**Priority:** P2  
**Dependencies:** WI-1, WI-3

Create a GitHub Action (`squad-board-sync.yml`) that syncs label changes to board column positions:
- Trigger on `issues: [labeled, unlabeled]` for `status:*` labels
- When a `status:*` label changes, update the corresponding board item's status field
- When a new issue gets the `squad` label and a board exists, add it to the board
- Read board ID from `.ai-team/team.md`
- Skip gracefully if no board is configured

This workflow ships via `templates/workflows/` and is installed on `squad init` / `squad upgrade`.

**Acceptance criteria:**
- [ ] Workflow triggers on `status:*` label changes
- [ ] Board item status updates match column mapping from §2.5
- [ ] New `squad`-labeled issues auto-added to board
- [ ] Graceful skip when no board configured
- [ ] Uses `gh api graphql` (no npm dependencies)

---

### WI-5: Board Query & Display

**Agent:** Verbal (Prompt Engineer)  
**Size:** Small (2-3h)  
**Priority:** P3  
**Dependencies:** WI-1, WI-3

Design coordinator prompt additions for querying board state:
- User asks "what's on the board?" / "show me the board" / "what's in progress?"
- Coordinator queries the board via `gh api graphql` and displays a summary
- Summary grouped by column with issue numbers, titles, and assignees
- Link to the board URL for full visual view

**Acceptance criteria:**
- [ ] Query prompt additions defined for squad.agent.md
- [ ] Display format defined (terminal-friendly summary)
- [ ] Board URL included in output

---

### WI-6: Documentation & Skill

**Agent:** McManus (DevRel)  
**Size:** Small (2-3h)  
**Priority:** P3  
**Dependencies:** WI-3, WI-5

Document the project boards feature:
- User-facing docs in `docs/` explaining how to enable project boards
- Token scope requirements (the `project` scope)
- Board column customization (future — document as "coming soon")
- Update README if project boards are a shipped feature

**Acceptance criteria:**
- [ ] User-facing documentation for project boards
- [ ] Token scope requirements documented
- [ ] Troubleshooting section for permission errors

---

## 4. Implementation Plan

### Phase 1: Foundation (v0.4.0 Wave 1) — WI-1, WI-2

Validate GraphQL commands work via `gh api graphql`. Define provider interface extensions. This is pure research and specification — no prompt changes, no workflows.

**Gate:** Can we reliably create boards, add items, and move items between columns using only `gh api graphql`? If the `gh` CLI GraphQL support is insufficient (e.g., variable handling, auth issues), we reassess Option B (native `https`).

### Phase 2: Integration (v0.4.0 Wave 2) — WI-3, WI-4

Build the coordinator prompt additions and the sync workflow. This is where the feature becomes real — users can create boards, and label changes propagate to board columns.

**Dependency:** 032c label taxonomy must be shipped. The board sync relies on `status:*` labels existing and being used consistently.

### Phase 3: Polish (v0.4.0 Wave 3) — WI-5, WI-6

Query/display capabilities and documentation. This is the user experience layer — making boards discoverable and useful from the CLI.

### Total Estimated Effort

| Phase | Hours | Agents |
|-------|-------|--------|
| Phase 1 | 6-9h | Fenster |
| Phase 2 | 7-11h | Verbal, Fenster |
| Phase 3 | 4-6h | Verbal, McManus |
| **Total** | **17-26h** | 3 agents |

---

## 5. What We're NOT Doing

1. **No npm dependencies.** The `gh api graphql` approach keeps Squad zero-dependency. If this proves impractical, we revisit — but the bar for adding `node_modules` is high.

2. **No automatic board creation.** Boards are opt-in. The user requests them. We don't create boards on `squad init` — that's a surprise side effect in repos where boards aren't wanted.

3. **No custom column configuration (v0.4.0).** The 5-column default covers our label taxonomy. Custom columns are a v0.5.0 concern.

4. **No Octomember.** The coordinator handles board operations directly, same as all other platform operations (032 §3). If board operations bloat the coordinator prompt beyond the 2% context budget, we revisit the Octomember concept (Redfoot).

5. **No cross-project boards.** Each repo gets its own board. Organization-level or cross-repo boards are a different feature entirely.

6. **No board-to-label reverse sync.** Labels are authoritative. The board is a projection. If someone moves a card on the board UI, it does NOT change labels. This is one-way: labels → board. Reverse sync creates state conflicts and is architecturally unsound until we have a clear conflict resolution strategy.

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `gh api graphql` insufficient for Projects V2 mutations | Low | High | Phase 1 gate validates this before any prompt work |
| `project` scope not granted by most users | Medium | Medium | Graceful degradation — feature is additive, not required |
| Board sync workflow creates noise (too many comment/status updates) | Medium | Low | Sync is silent — no issue comments, just board column moves |
| GraphQL field IDs are project-specific (not stable) | High | Medium | Discovery flow in WI-1 queries field IDs at runtime, caches in team.md |
| Provider abstraction insufficient for ADO/GitLab boards | Low (v0.4.0) | Low | Capability negotiation — boards are optional. ADO/GitLab support is future work. |

---

## 7. Relationship to Issue #6

@londospark's proposal in Issue #6 is well-structured and aligns with Squad's GitHub-native direction. This assessment:

1. **Validates the core concept** — project boards as visual dashboards for squad activity.
2. **Rejects the GraphQL client dependency** — uses `gh api graphql` instead of an npm package.
3. **Expands the column model** — 5 columns instead of 3, mapped to the existing label taxonomy.
4. **Defers to v0.4.0** — respects Brady's v0.3.0 scope constraint.
5. **Adds provider abstraction** — designs for ADO/GitLab from the start, even though Day 1 is GitHub-only.
6. **Makes boards opt-in** — user-triggered, not automatic.

The original issue's three-layer architecture (GraphQL integration → Board initialization → Task management) maps cleanly to our work items. Layer 1 = WI-1, Layer 2 = WI-3, Layer 3 = WI-4 + WI-5.

---

## 8. Decision Required

**For Brady:** Should this be v0.4.0 scope as proposed, or does the community interest (Issue #6) warrant pulling it into v0.3.0?

My recommendation: v0.4.0. The label/issue infrastructure (032, 032c) must ship first. Boards without labels are just empty columns. But I'll defer to Brady's read on community engagement vs. engineering sequence.

---

*This proposal was created by Squad in response to GitHub Issue #6 by @londospark.*
