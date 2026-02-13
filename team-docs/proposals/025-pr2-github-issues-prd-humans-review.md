# Proposal 025: PR #2 Review — GitHub Issues, PRD Mode, Human Team Members

**Status:** Approved ✅ Shipped
**Author:** Keaton
**Date:** 2026-02-08
**PR:** bradygaster/squad#2 by @spboyer

## Summary

PR #2 adds three new features to `squad.agent.md` — all prompt-only, zero CLI code changes:

1. **GitHub Issues Mode** (~120 lines) — Connect to a repo's issues, full lifecycle: connect → list backlog → route to agents → branch → PR → review → merge.
2. **PRD Mode** (~100 lines) — Ingest a PRD, Lead decomposes into work items, approval gate, dependency-aware routing.
3. **Human Team Members** (~80 lines) — Humans on the roster with `👤` badge, coordinator pauses for their input, stale reminders.

Plus Init Mode updates (3 new questions), routing table additions (3 new signals), and 27 new tests (all prompt content validation, bringing total to 55).

This is a thoughtful PR from someone who clearly read the codebase deeply. The design decisions are overwhelmingly correct. But the scope, integration gaps, and interaction with in-flight architecture decisions require careful review.

## Architecture Fit

### What fits well

All three features are **prompt-only additions** — they extend `squad.agent.md` without touching `index.js`, templates, or the casting system. This is exactly right. Squad's architecture is coordinator-instruction-driven; new workflow modes belong in the coordinator prompt. The PR respects the file ownership model: `squad.agent.md` is Squad-owned code, and these additions ship via the forwardability/upgrade mechanism.

**GitHub Issues Mode** fits the existing spawn pattern naturally. Issues are work items; work items get routed to agents via `routing.md`. The spawn prompt template includes `ISSUE CONTEXT` — same structure as the existing spawn template with additional context injected. The branch convention (`squad/{issue-number}-{slug}`) is well-chosen — namespaced to Squad, easily identifiable, grep-able.

**PRD Mode** correctly uses the Lead agent for decomposition (sync spawn, which is right — this is an approval-gated decision). The work item table format (WI-{number}, agent assignment, dependencies, size) is the kind of structured output that LLMs are good at and humans can quickly scan.

**Human Team Members** fills a genuine gap. Real teams have humans. The `👤` badge vs `✅ Active` distinction is clean. The "no charter, no history, no casting" decision is correct — humans don't need agent infrastructure, they need to appear in routing.

### What doesn't fit

**Init Mode changes alter the numbering of all subsequent steps.** Steps 3-7 become 4-9, and a new step 3 and step 9 are inserted. This is fragile — any other PR touching Init Mode will conflict. More importantly, three additional questions during init ("Do you have a PRD?", "Is there a GitHub repo with issues?", "Are any humans joining?") risks making init feel like a questionnaire. Squad's init is currently tight: identify user → ask what you're building → cast team → confirm → create files → done. Adding three more questions dilutes the "fast to value" experience McManus identified as critical (Proposal 014).

**The `gh` CLI dependency is undocumented.** GitHub Issues Mode assumes `gh issue list`, `gh pr create`, `gh pr merge` are available. These require the GitHub CLI to be installed and authenticated. This is a runtime dependency that affects whether features work at all — not a nice-to-have. If `gh` isn't installed, the coordinator will fail with a confusing error. The PR doesn't add any detection, fallback, or user-facing documentation for this requirement.

## What's Good

Genuinely well-done aspects of this PR:

1. **Deep codebase reading.** The PR integrates with existing patterns correctly — routing table format, spawn prompt structure, team.md storage, drop-box pattern. The Init Mode changes preserve the existing flow and add to it rather than replacing it.

2. **Issue → PR → Merge lifecycle is complete.** This isn't a half-implementation. Branch creation, PR with issue linking (`Closes #N`), review feedback handling (re-spawn agent with review comments), merge via squash — the full loop is covered. The detail about `gh issue close` as a fallback if auto-close didn't fire shows practical thinking.

3. **PR Review Handling is thoughtful.** The PR correctly notes that review feedback should be routed to the appropriate agent (or a different one per the reviewer rejection protocol), and injects review comments into the spawn prompt. This demonstrates understanding of the reviewer rejection protocol.

4. **Human member design is minimal and correct.** No over-engineering. Humans get a roster entry, routing entries, and the coordinator pauses. That's it. No charter files, no history files, no casting — just the minimum to make routing work. The "stale reminder" after one conversation turn is a nice UX touch.

5. **Tests are structural, not behavioral.** The 27 new tests validate that `squad.agent.md` contains expected sections, triggers, and formats. This is the right testing approach for prompt content — you can't test LLM behavior deterministically, but you can test that the instructions are present.

6. **Work item format is well-designed.** `WI-{number}` with size (S/M/L), deps, and agent assignment is a practical decomposition format. The approval gate before routing is correct — PRD decomposition is a decision that affects the whole team.

7. **Mid-project PRD updates.** The diff-based approach (unchanged / modified / new / removed work items) is the right design for PRD evolution. Most implementations forget this case entirely.

## Integration Gaps

### 1. Ceremonies × GitHub Issues Mode

**Gap:** When the user says "work on all issues" or routes multiple issues simultaneously, this is a multi-agent task involving 2+ agents modifying shared systems. The ceremony system has an auto-triggered Design Review with exactly this condition. But GitHub Issues Mode doesn't mention ceremonies at all.

**Expected behavior:** If 5 issues are routed and they touch overlapping systems, the Design Review ceremony should fire before agents start working. The PR's batch routing flow should acknowledge this: "Check `ceremonies.md` for `when: 'before'` ceremonies before spawning the batch."

**Severity:** Medium. The existing routing table already has `Multi-agent task (auto) | Check ceremonies.md for when: "before" ceremonies`. So the coordinator *should* handle this through the existing routing table entry. But the GitHub Issues Mode section describes its own routing flow independently — an implementer reading only that section would miss the ceremony gate.

### 2. PRD Mode × GitHub Issues Mode

**Gap:** These two features are natural complements but the PR doesn't describe their interaction. A very common workflow would be: ingest PRD → decompose into work items → create GitHub issues from work items → work issues via the Issues Mode lifecycle.

**Missing:** PRD work items (WI-1, WI-2, etc.) should have an optional "create as GitHub issue" step. If the team is connected to a GitHub repo's issues, the Lead's decomposition could create issues from work items, bridging the two modes. Without this, users must manually create issues from the work item table, losing the automation value.

**Severity:** Low for v1 (both modes work independently), Medium for v2 (the gap will become obvious to users who adopt both).

### 3. Human Members × Reviewer Rejection Protocol

**Gap:** The Reviewer Rejection Protocol (lines 925-947 of squad.agent.md) has strict lockout semantics: rejected author is locked out, a *different* agent must revise. But what if the reviewer is a human? Or what if the revision should be done by a human?

**Scenarios not covered:**
- Human reviewer rejects AI agent's work → lockout applies normally, but how does the human's rejection get into the system? The PR says "User relays on their behalf" but doesn't specify the format.
- AI reviewer says "this needs human review" → should route to a human member. But the lockout protocol assumes all participants are spawnables.
- All AI agents locked out → currently escalates to "the user." With human team members, should it escalate to a specific human member based on routing?

**Severity:** Medium. The reviewer protocol is one of Squad's most carefully designed mechanisms. Human integration with it needs explicit handling, not implicit "it'll work out."

### 4. Branch Convention × Worktree Awareness

**Gap:** The branch convention `squad/{issue-number}-{slug}` creates branches via `git checkout -b`. In a worktree setup, this creates the branch in the current worktree. But if the user is using the worktree-local strategy (each worktree has its own `.ai-team/` state), multiple issues being worked on in the same worktree will compete for the same branch checkout.

**Expected interaction:** The PR should specify whether issue work should create new worktrees (one worktree per issue — the cleanest parallel model) or whether `git checkout -b` within the current worktree is intentional (serialized issue work). The existing worktree awareness section describes the resolution strategy but GitHub Issues Mode doesn't reference it.

**Severity:** Low for single-issue work. Medium-High for "work on all issues" batch mode — parallel agents in the same worktree all running `git checkout -b` will conflict.

### 5. `gh` CLI Dependency

**Gap:** GitHub Issues Mode requires `gh` (GitHub CLI) for `gh issue list`, `gh pr create`, `gh pr merge`, `gh pr view`, `gh pr ready`, `gh issue view`, `gh issue close`. This is a hard dependency — not a nice-to-have.

**What's needed:**
- Detection: before connecting to a repo, check if `gh` is available (`gh --version`). If not, tell the user how to install it.
- Authentication: `gh` requires `gh auth login`. If not authenticated, the coordinator should detect and guide.
- Fallback: the PR also mentions "or equivalent GitHub MCP tools" — this is the right instinct but needs to be formalized. If the MCP GitHub server is configured, use that; if `gh` is available, use that; if neither, tell the user.
- User-facing docs: at minimum, the README or a docs page should note that GitHub Issues Mode requires `gh` CLI.

**Severity:** High. A feature that silently fails because of an undocumented dependency is a trust violation.

### 6. Model Selection × PRD Decomposition

**Gap:** Proposal 024 (Per-Agent Model Selection) designs a model selection algorithm with role-based defaults and task complexity bumps. PRD Mode spawns the Lead agent (sync) for decomposition. The decomposition prompt is a structured analytical task that produces a work item table — this is exactly the kind of task that should get a model bump.

**Specific interactions:**
- PRD decomposition by Lead → task contains "architecture" and "proposal" signals → should bump to Opus per Proposal 024's complexity override table.
- Subsequent work item spawns → each agent gets its own model per charter/role. This works correctly.
- But the PR's PRD spawn template hardcodes `agent_type: "general-purpose"` without a `model` parameter. When Proposal 024 ships, this template will need updating to include model selection.

**Recommendation:** Not a blocker for this PR, but the PRD spawn template should include a comment like `{model selection per charter/auto-selection}` so Proposal 024's implementation doesn't miss it.

### 7. GitHub Issues Mode Agent Spawns × Model Selection

**Gap:** Similar to #6 — when spawning agents for issue work, the model should be selected per the agent's charter preference or role-based default. The PR's spawn template doesn't include a `model` parameter. This is consistent with the current codebase (no spawn template includes `model` today), but should be noted as a Proposal 024 integration point.

**Severity:** Low. Proposal 024 will update all spawn templates when it ships. These new templates just need to be included in that sweep.

## Scope Assessment

### Is this too much for one PR?

**Yes, but not fatally so.** Three features, each ~100 lines, is a lot of prompt surface area to review. But they're independent sections appended to `squad.agent.md` — they don't interleave with existing code. The blast radius of a bug in any one section is limited to that feature.

### Should it be split?

**Ideally, yes.** The natural split:

1. **PR #2a: Human Team Members** — smallest, most independent, no external dependencies. Merge first.
2. **PR #2b: GitHub Issues Mode** — depends on `gh` CLI, needs dependency documentation. Merge second with the `gh` detection added.
3. **PR #2c: PRD Mode** — depends on Lead agent decomposition pattern. Most value from being last because it can reference Issues Mode for PRD→issue bridge.
4. **PR #2d: Init Mode updates** — depends on all three above. Merge last.

Each would carry its own tests.

### Dependency order if kept as one PR

If merged as-is: Human Members is independent. GitHub Issues and PRD modes are independent of each other but both depend on the routing table additions. Init Mode depends on all three.

## Recommendations

### Verdict: Request Changes — Minimum Set to Merge

This PR demonstrates strong codebase understanding and the features are strategically valuable. But there are gaps that should be addressed before merge.

**Must-fix (blocking merge):**

1. **Add `gh` CLI detection.** Before the first `gh` command, the coordinator should check for `gh` availability and authentication. Add a subsection to GitHub Issues Mode: "Prerequisites — verify `gh` is installed and authenticated before connecting." This is 5-10 lines of prompt.

2. **Add worktree interaction note.** In the "Branch creation" step, add: "If running in a worktree, create the branch in the current worktree. For parallel issue work, consider creating separate worktrees per issue." This acknowledges the existing architecture without over-engineering.

3. **Init Mode questions should be asked AFTER team confirmation, not before casting.** Move the three new questions from step 3 (before casting) to step 9 (post-setup wiring) — or better, make them part of the first Team Mode interaction. Init should stay fast. The PRD, issues, and human questions can be asked after the team exists, when the coordinator has routing context to act on the answers.

**Should-fix (non-blocking but recommended):**

4. **Add a note on ceremony interaction.** In the "Routing to agents" subsection of GitHub Issues Mode, add: "For multi-issue batches, the coordinator checks `ceremonies.md` for auto-triggered ceremonies before spawning (per existing routing table rules)."

5. **Add model selection placeholder.** In both the PRD spawn template and the issue spawn template, include a comment noting that `model` parameter will be added per Proposal 024.

6. **Document human reviewer integration.** Add a sentence to the Human Team Members section: "When work routes to a human reviewer for approval or rejection, the coordinator presents the work and waits. The user relays the human's verdict using the same format as the reviewer rejection protocol."

7. **Add PRD × Issues bridge note.** In the PRD Mode section, add a forward-looking note: "If a GitHub repo is connected (see GitHub Issues Mode), work items can optionally be created as GitHub issues for full lifecycle tracking. This integration is planned for a future iteration."

**Nice-to-have (not for this PR):**

8. Consider whether batch issue routing should create worktrees (one per issue) for true parallelism.
9. PRD work items → GitHub issues automation.
10. Human member integration with the deadlock handling in the reviewer protocol.

### Model Selection Interaction (Proposal 024)

The PRD decomposition spawn is the most interesting interaction. Lead + "decompose a PRD" is a structured analytical task — exactly the kind that Proposal 024's complexity override would bump from Sonnet to Opus. When 024 ships:

- PRD decomposition spawn → Lead → charter model or role-based default (Sonnet) → task complexity bump ("architecture" signal) → Opus. This is the correct resolution.
- Issue work spawns → per agent, per charter. Normal flow.
- Human routing → no spawn, no model selection. Correct by design.

The PR doesn't need to implement model selection (024 isn't shipped yet), but it should be aware that its spawn templates will be updated. The `agent_type: "general-purpose"` without `model` is consistent with current codebase.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `gh` CLI not installed → confusing failure | High | Add detection (must-fix) |
| Init becomes a questionnaire → slower time-to-value | Medium | Move questions post-init (must-fix) |
| Parallel issue branches conflict in worktrees | Medium | Document worktree interaction (must-fix) |
| Ceremonies not triggered on multi-issue batch | Medium | Add ceremony note (should-fix) |
| PRD and Issues modes don't bridge | Low (v1) | Future iteration (nice-to-have) |
| Model selection needs template updates | Low | Proposal 024 sweep will handle |

## Final Note

@spboyer clearly read the codebase deeply — the spawn template format, the routing table structure, the team.md storage pattern, even the reviewer rejection protocol. The three features are well-scoped for prompt-only implementation and don't introduce architectural debt. With the must-fixes addressed, this is a strong contribution to Squad's feature surface.
