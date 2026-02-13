# PR #2 Prompt Engineering Review

**Reviewer:** Verbal (Prompt Engineer)
**PR:** #2 — GitHub Issues intake, PRD mode, and human team members
**Author:** @spboyer
**Date:** 2026-02-09
**Status:** Domain review (feeds into Keaton's architectural assessment)

---

## 1. Prompt Bloat — Context Window Impact

**Current state:** `squad.agent.md` is 981 lines, ~13.2K tokens (per our context budget table).

**After PR #2:** +316 lines → ~1,276 lines, estimated ~17–18K tokens. That's a **~35% increase** in coordinator prompt size.

**Is this dangerous?** Not yet, but we're approaching the bend in the curve.

- At 13.2K tokens, the coordinator uses ~10% of a 128K context window. At ~17.5K, it's ~14%. Both are well within the model's capacity for instruction following.
- But coordinator prompt isn't the full story. Add the user's message, the team.md roster, routing.md, registry.json, ceremonies.md, and any inline charters being pasted into spawn prompts — the coordinator's *working context* during a complex multi-agent spawn can hit 25-35K tokens before a single agent responds. PR #2 pushes that closer to 40K.
- The real risk isn't hard truncation — it's **instruction priority decay**. LLMs follow instructions at the top of a prompt more reliably than instructions buried deep. GitHub Issues Mode, PRD Mode, and Human Members are appended at the end (lines 997+). They will be the first sections to suffer from attention degradation.

**Recommendation:** This PR is fine for now, but it's the inflection point where we need to start thinking about **modular prompt loading**. The coordinator shouldn't load GitHub Issues instructions when the user is doing conversational work. PRD Mode instructions are only needed during PRD intake. The coordinator should conditionally load these sections based on what's stored in `team.md` — if `## Issue Source` doesn't exist, skip the GitHub Issues section entirely. This is a future optimization, not a blocker for this PR.

**Severity:** ⚠️ Watch — not blocking, but this is the last PR where "just append more sections" is acceptable.

---

## 2. Instruction Clarity & Trigger Reliability

### Trigger Tables

All three features use trigger tables (user says → action). Let me assess each.

**GitHub Issues Mode triggers — Mostly solid:**
- `"pull issues from {owner/repo}"` and `"work on issue #N"` — clear, unambiguous. The `{owner/repo}` placeholder is a strong structural signal LLMs reliably extract.
- `"there's feedback on PR #N"` — risky. Users will also say "PR #3 has comments", "check the review on #3", "address the feedback on my PR". The trigger is too specific. Should be broadened to a pattern description: "references PR feedback, review comments, or changes requested."
- `"merge it"` — dangerously ambiguous without context. "Merge it" after a PR discussion is clear. "Merge it" after discussing a branch strategy could mean something different. The coordinator needs recency-aware disambiguation here — check if a PR was discussed in the last 2-3 turns.

**PRD Mode triggers — Clean:**
- `"here's the PRD"` and `"read the PRD at {path}"` are clear intent signals.
- `(pastes large block of requirements text)` — this is the weak one. How does the coordinator distinguish a pasted PRD from a pasted error log, a pasted code snippet, or a pasted Slack conversation? There's no structural signal. The coordinator will need to apply judgment here, which is fine — but the trigger table implies it's deterministic. Should add: "Coordinator uses judgment — look for requirements-like language (user stories, acceptance criteria, feature lists) vs. other pasted content."

**Human Members triggers — Good:**
- `"add {Name} as {role}"` — clean extraction pattern.
- `"I'm on the team as {role}"` — good, handles the self-add case.
- `"{Name} is done"` — potentially ambiguous if a human and an AI agent share similar names, but the 👤 badge in routing.md disambiguates.

**Overall assessment:** The trigger tables follow the same pattern as existing routing signals, which work. The main gap is that they read as exact-match rules, but LLMs actually do fuzzy matching. This is mostly a strength (handles paraphrasing) but occasionally a weakness (false positives on "merge it"). Adding a note like "these are intent signals, not exact strings — match the user's meaning, not their exact words" would improve reliability.

**Severity:** 🟡 Minor — a few triggers need broadening, but the pattern is sound.

---

## 3. Parallel Execution — Serialization Risk in Issue Lifecycle

**The lifecycle creates implicit serialization per issue:** branch → work → commit → push → PR → wait for review → address feedback → merge. This is inherently serial for a *single issue*. That's correct — you can't open a PR before doing the work.

**But can multiple issues be worked in parallel?** The PR doesn't explicitly address this, and it matters a lot.

**Current gap:** When the user says "work on all issues" or picks multiple issues (#12, #15, #18), the coordinator should fan them out in parallel — each issue to a different agent on a different branch. The PR's "Backlog refresh" section implies sequential processing, but the Parallel Fan-Out section of the existing coordinator should handle this.

**The real problem: branch conflicts.** If two agents create branches from `main` and both modify overlapping files, we get merge conflicts at PR time. The existing coordinator's guidance ("check for hard data dependencies only") doesn't account for this because it was designed for agents working on the *same* branch. The issue workflow creates *separate* branches, which is actually better for isolation — but the PR should explicitly state:

> When routing multiple issues, spawn agents in parallel on separate `squad/{number}-{slug}` branches. Each agent works in isolation. Merge conflicts between PRs are the user's responsibility (or a future automation).

**Also missing: worktree interaction.** The issue workflow says `git checkout -b squad/{number}-{slug}`, but the agent is already working in a context. Does it stash? Does it need a worktree? The existing Worktree Awareness section handles this for the coordinator, but the *agent* spawn prompt for issue work doesn't reference worktree handling. If agents naively `git checkout -b` in the same worktree, only one agent can be on one branch at a time — serialization through the back door.

**Recommendation:** Add explicit guidance:
1. Multiple issues spawn in parallel on separate branches.
2. Each agent should be instructed to create and switch to its branch as the first step.
3. Acknowledge that concurrent `git checkout` in the same worktree is unsafe — either use worktrees or accept that issue work is one-at-a-time per worktree.

**Severity:** 🔴 Needs fix — the parallel story has a hidden serialization trap via git branching.

---

## 4. PRD Decomposition Quality

**The decomposition prompt is decent but underspecified.** Here's what the Lead gets:

```
Decompose this PRD into concrete work items. For each work item:
- ID: WI-{number}
- Title: Brief summary
- Description: What needs to be built/done
- Agent: Which team member should handle this
- Dependencies: Which other work items must complete first
- Size: S / M / L
```

**What's good:**
- The output format is structured (table). LLMs produce consistent tables.
- Agent assignment by name from routing.md is smart — forces the Lead to think about routing.
- Dependencies as references to other WIs enable the coordinator to build a DAG.

**What's underspecified:**

1. **Granularity guidance is missing.** "Concrete work items" means different things to different LLM runs. Without guidance like "each work item should be completable by one agent in one spawn" or "aim for 30-90 minutes of work per item," the Lead will sometimes produce 3 giant WIs and sometimes 25 tiny ones. The decomposition needs a size target.

2. **"Group by priority (must-have → nice-to-have)" is vague.** MoSCoW? P0/P1/P2? The grouping method should be explicit. Otherwise each decomposition invents its own priority scheme.

3. **No decomposition heuristics.** The Lead should be told: "Split along agent boundaries (if two agents would touch the same WI, split it), split along dependency boundaries (if part A blocks part B, they're separate WIs), and never create a WI that spans both frontend and backend."

4. **Consistency across re-runs.** If the user re-runs "decompose the PRD" twice, they'll likely get different WI counts, different granularity, and different agent assignments. The prompt should instruct the Lead to be deterministic: "If a previous decomposition exists in decisions.md, use it as the baseline and only add/modify/remove items."

**Recommendation:** Add 3-4 lines of decomposition heuristics to the Lead's spawn prompt. Target granularity ("one agent, one spawn, one PR" per WI), explicit priority scheme, and splitting rules.

**Severity:** 🟡 Medium — works but will produce inconsistent results without guardrails.

---

## 5. Human Member UX — Background Agent Interaction

**The "pause and wait" pattern is well-designed.** The coordinator presents work to the user, tracks what's blocked, and sends stale reminders. This is the right interaction model.

**But: what happens to the rest of the team while waiting on a human?**

The PR says: "Agents can reference humans: 'Waiting on {Name} for {thing}.' The coordinator respects this — it won't proceed with dependent work until the human responds."

This is correct for *dependent* work. But the PR doesn't explicitly say: **non-dependent work SHOULD proceed immediately.** The coordinator's existing eager execution philosophy ("launch aggressively, collect results later") should handle this, but the Human Members section doesn't reference it. A coordinator reading the Human Members section in isolation might interpret "pause" as "pause everything."

**Needed addition:** After the "Track the pending item" step, add:

> The coordinator continues routing non-dependent work immediately. Human blocks affect ONLY work items that depend on the human's output. All other agents proceed as normal. Reference the Eager Execution Philosophy — human blocks are NOT a reason to serialize the rest of the team.

**Another gap: what triggers "unblock"?** The triggers table has `"{Name} is done"` and `"here's what {Name} decided"`. But what about:
- The user providing the human's input without naming them? ("The design was approved" — is that from the human designer?)
- The user saying "skip {Name}, just proceed"? (Override the human gate)
- The human's decision contradicting an agent's work that already started?

These are edge cases, but the coordinator needs at least a "when in doubt, ask the user to confirm who this input is from" fallback.

**Severity:** 🟡 Medium — the core pattern works, needs explicit continuation guidance and edge case handling.

---

## 6. Model Selection Interaction (Proposal 024)

**My Proposal 024 designed per-agent model selection. Here's how it should interact with PR #2's features:**

### Issue Work — Agent Model from Charter
When an agent is spawned for issue work, the model should follow the standard resolution: user override → charter `## Model` → registry → auto-selection. The issue context doesn't change the agent's capability needs. If Fenster is spawned for an issue, Fenster gets Fenster's model. **No special handling needed.**

### PRD Decomposition — Lead Model, Maybe Bumped
The Lead decomposing a PRD is doing *architectural reasoning* — understanding a spec, identifying boundaries, assessing dependencies. This hits the task complexity signal "architecture" from the auto-selection table, which should bump the Lead from Sonnet to Opus.

**Recommendation:** The PRD decomposition spawn prompt should include a model selection note:

> Model: Use the Lead's charter model, with complexity bump for architectural decomposition. If Lead is on Sonnet, bump to Opus for this spawn.

This aligns with Proposal 024's Priority 4 (task complexity override) — PRD decomposition contains the signals "architecture" and multi-file coordination.

### PR Review Feedback — Same Agent, Same Model
When an agent addresses PR review comments, they're doing the same type of work they did originally. Same agent, same model. No change needed.

**Exception:** If the reviewer rejected the work and a *different* agent handles the revision (per Reviewer Rejection Protocol), the revision agent gets *their* model, not the original agent's. This already works correctly under Proposal 024's design.

### Issue Work at Scale — Cost Consideration
When the user says "work on all issues" and 10+ agents spawn simultaneously, the cost implications of model selection become visible. The auto-selection algorithm should apply per-agent — the tester working issue #15 gets Haiku, the backend dev on issue #12 gets Sonnet, the designer on issue #20 gets Opus. This is exactly how Proposal 024 was designed to work. **No changes needed.**

**Severity:** ✅ Green — Proposal 024's design handles all PR #2 scenarios without modification. The only addition is noting PRD decomposition as a complexity-bump signal.

---

## 7. Missing Prompt Patterns

**Several established patterns from the existing coordinator are not adopted by the new sections:**

### 7a. Silent Success Workaround — NOT included in Issue Agent Spawns
The existing spawn template includes the `⚠️ RESPONSE ORDER` block that mitigates the ~7-10% silent success bug. The PR's issue work spawn prompt (under "Include in spawn prompt") gives the agent an `ISSUE CONTEXT` and `WORKFLOW` block but doesn't include the RESPONSE ORDER instruction. If the agent hits the silent success bug after pushing a branch and opening a PR, the coordinator won't know the PR was created.

**Fix:** The issue spawn context should be *added to* the existing spawn template, not replace it. The PR's current wording looks like a standalone prompt, but it should be clear that `ISSUE CONTEXT` and `WORKFLOW` are injected into the standard spawn template.

### 7b. Scribe Spawn After Issue Work — NOT mentioned
After every agent work batch, the coordinator spawns Scribe to log the session and merge decisions. The GitHub Issues section doesn't mention Scribe. When an agent completes issue work (branch, commit, PR), that's a significant event that should be logged. The coordinator's existing "After Agent Work" section handles this, but the issue lifecycle section should at least reference it: "After issue work completes, follow the standard After Agent Work flow (including Scribe spawn)."

### 7c. Orchestration Logging — NOT mentioned in Issue or PRD flows
The existing coordinator writes orchestration log entries after each agent batch. Issue work produces rich metadata (issue number, branch name, PR number, review status) that should be captured in the orchestration log. Neither the issue nor PRD sections reference orchestration logging. This metadata is valuable for:
- Silent success detection (check if the PR was actually created)
- Backlog tracking (which issues have PRs, which are merged)
- Session catch-up ("what happened?" shows issue progress)

### 7d. Drop-Box Pattern — Partially adopted
The PRD decomposition correctly uses the decisions inbox (`{lead}-prd-decomposition.md`). Good. But the GitHub Issues section stores issue source in `team.md` directly, which is fine since only the coordinator writes to `team.md`. Consistent.

### 7e. Acknowledge Immediately — NOT referenced
The "Feels Heard" pattern (acknowledge before spawning) should apply to issue routing. When the user says "work on #12, #15, #18," the coordinator should immediately show a launch table:
```
📋 Routing 3 issues:
🔧 Fenster — #12: Add user authentication
⚛️ Dallas — #15: Fix mobile layout
📝 McManus — #18: Write API docs
```
The issue section doesn't reference this pattern. The existing Team Mode instruction covers it, but explicit reinforcement in the issue flow would improve reliability.

### 7f. Ceremony Integration — NOT addressed
What if a "before" ceremony is configured for multi-agent tasks, and the user says "work on all issues"? That's a multi-agent task that should trigger the ceremony check. The issue section doesn't mention ceremonies. The existing ceremony system should handle this automatically, but it's worth noting.

**Severity:** 🔴 Pattern gaps 7a and 7b need explicit fixes. The rest are reinforcement items.

---

## 8. What's Brilliant

Credit where it's due — @spboyer nailed several things:

### 8a. The branch naming convention: `squad/{issue-number}-{slug}`
This is smart. The `squad/` prefix makes Squad branches instantly identifiable in a repo. The issue number is machine-parseable. The slug is human-readable. This is better than `feature/`, `fix/`, or any generic prefix. It also enables tooling — you can grep for `squad/` branches to find all Squad-generated work.

### 8b. The PRD approval gate
Spawning the Lead sync to decompose, then presenting work items for user approval *before* routing — this is exactly the right interaction pattern. It prevents the runaway execution problem where a misunderstood PRD spawns 15 agents doing wrong work. The gate is cheap (one sync spawn) and prevents expensive mistakes.

### 8c. Human member UX — the "pause and present" pattern
Not trying to spawn a human. Not trying to simulate a human's response. Just presenting the work, saying "this one's for Brady," and waiting. This is the most honest and ergonomic approach. The stale reminder is a good touch — it prevents human blocks from becoming invisible blockers.

### 8d. Init Mode integration — additive, not blocking
The three new questions in Init Mode are all skippable. The team creation flow is unmodified if the user doesn't want these features. This is exactly how new features should integrate with existing flows — zero friction for users who don't need them, immediate value for those who do.

### 8e. The comparison table for humans vs. AI agents
The "How Humans Differ from AI Agents" table is a clean, scannable reference. Badge, casting, charter, spawnable, history, routing, decisions — every dimension covered. This is the kind of structured reference that helps the coordinator make correct decisions quickly.

### 8f. The test suite
27 prompt validation tests that verify section headers, trigger phrases, and format strings exist in `squad.agent.md`. This is infrastructure we didn't have before. These tests catch regressions when someone modifies the coordinator prompt — if a section gets accidentally deleted during a refactor, the test fails. Smart investment.

### 8g. "Agent prompt only" — no CLI changes
All three features live entirely in `squad.agent.md`. No new template files, no `index.js` changes, no new dependencies. This is the lightest possible implementation path and validates that the coordinator prompt is a powerful enough substrate for feature development.

---

## Summary of Recommendations

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | Context window growth | ⚠️ Watch | Consider modular prompt loading for future PRs. This one is fine. |
| 2 | Trigger ambiguity | 🟡 Minor | Broaden "there's feedback on PR #N" and "pastes PRD" triggers. |
| 3 | Parallel issue serialization | 🔴 Fix | Address git branching / worktree interaction for multi-issue work. |
| 4 | PRD decomposition consistency | 🟡 Medium | Add granularity guidance, priority scheme, splitting heuristics. |
| 5 | Human block continuation | 🟡 Medium | Explicitly state non-dependent work proceeds during human blocks. |
| 6 | Model selection | ✅ Green | Works with Proposal 024 as-is. Note PRD decomposition as complexity bump. |
| 7a | Silent success workaround | 🔴 Fix | Clarify issue spawn uses standard template (includes RESPONSE ORDER). |
| 7b | Scribe after issue work | 🔴 Fix | Reference standard After Agent Work flow in issue lifecycle. |
| 7c-f | Other pattern gaps | 🟡 Minor | Reinforce acknowledgment, orchestration logging, ceremony checks. |
| 8 | What's great | ✅ | Branch naming, PRD gate, human pause pattern, test suite, zero CLI changes. |

**Bottom line:** This PR is a strong prompt engineering contribution. The three features are well-designed and fill real user needs. The main risks are (a) hidden serialization in multi-issue parallel work, (b) missing established patterns in the new sections, and (c) approaching the point where the coordinator prompt needs modularization. All fixable. Ship with the fixes above.

— Verbal
