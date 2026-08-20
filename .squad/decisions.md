# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

### 2026-08-19: Squad's responsibility matrix stops at this repo
**Date:** 2026-08-19
**Raised by:** bradygaster (via Copilot session)
**Status:** Decided

## Context

During follow-up planning after a live end-to-end Squad test, the coordinator
repeatedly proposed opening a pull request against `github/gh-aw` to refresh
that repo's copy of `workflows/squad.md`, on the theory that stale content
there was blocking `github/gh-aw#53498`.

Brady rejected this three times. The proposal came from misreading the
`source: bradygaster/squad/workflows/squad.md@dev` line in gh-aw's copy as
evidence of a vendoring relationship that obligated us to keep their copy
current.

## Decision

**All Squad work happens in `bradygaster/squad`.** We do not push code or
changes to `gh-aw` or any other external repository. The only work that
happens outside this repo is running tests in targeted test repos.

The gh-aw copy of `squad.md` is where some of their experimentation happens.
It is not ours to maintain, and no work item should be opened against it
until further notice.

## Relationship framing (corrected)

Squad and gh-aw are **not** vendors of each other's code in either direction.

- `workflows/squad.md` originated inside gh-aw and was **moved here**. This
  repo is where that file and its siblings live now.
- We depend on gh-aw only to do "Squad things using gh-aw" — it is a runtime
  we build on, not a downstream consumer we ship to.
- A `source:` pin appearing in another repo is their provenance metadata. It
  does not create an obligation on us.

## Consequences

- No follow-up item may be framed as "refresh / upstream / sync to gh-aw."
- Findings that appear to be gh-aw defects are theirs to triage. We may still
  investigate one to understand our own behavior, but investigation does not
  imply we open anything there.
- Test repos (e.g. `bradygaster/aspiregregator-squad-test`) remain in scope
  for verification work.

## Foundational Directives (carried from beta, updated for Mission Control)

### Type safety — strict mode non-negotiable
**By:** CONTROL (formerly Edie)
**What:** `strict: true`, `noUncheckedIndexedAccess: true`, no `@ts-ignore` allowed.
**Why:** Types are contracts. If it compiles, it works.

### Hook-based governance over prompt instructions
**By:** RETRO (formerly Baer)
**What:** Security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions.
**Why:** Prompts can be ignored. Hooks are code — they execute deterministically.

### Node.js >=20, ESM-only, streaming-first
**By:** GNC (formerly Fortier)
**What:** Runtime target is Node.js 20+. ESM-only. Async iterators over buffers.
**Why:** Modern Node.js features enable cleaner async patterns.

### Casting — Apollo 13, mission identity
**By:** Squad Coordinator
**What:** Team names drawn from Apollo 13 / NASA Mission Control. Scribe is always Scribe. Ralph is always Ralph. Previous universe (The Usual Suspects) retired to alumni.
**Why:** The team outgrew its original universe. Apollo 13 captures collaborative pressure, technical precision, and mission-critical coordination — perfect for an AI agent framework.

### Proposal-first workflow
**By:** Flight (formerly Keaton)
**What:** Meaningful changes require a proposal in `docs/proposals/` before execution.
**Why:** Proposals create alignment before code is written.

### Tone ceiling — always enforced
**By:** PAO (formerly McManus)
**What:** No hype, no hand-waving, no claims without citations.
**Why:** Trust is earned through accuracy, not enthusiasm.

### Zero-dependency scaffolding preserved
**By:** Network (formerly Rabin)
**What:** CLI remains thin. Zero runtime dependencies for the CLI scaffolding path.
**Why:** Users should be able to run `npx` without downloading a dependency tree.

### Merge driver for append-only files
**By:** Squad Coordinator
**What:** `.gitattributes` uses `merge=union` for `.squad/decisions.md`, `agents/*/history.md`, `log/**`, `orchestration-log/**`.
**Why:** Enables conflict-free merging of team state across branches.

### Interactive Shell as Primary UX
**By:** Brady
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL.
**Why:** Squad needs to own the full interactive experience.

### Root Cause Analysis

Three factors combine to create the VS Code routing failure. Ranked by dominance:

#### 1. 🔴 CLI-Centric Enforcement Language (DOMINANT)

The routing constraint is expressed exclusively in CLI terms. The CRITICAL RULE references `task` tool only. When the coordinator reads this in VS Code, where the tool is `runSubagent`, it doesn't reliably make the substitution. It falls through to Platform Detection's Fallback mode: 'work inline.' This enforcement language creates a logical gap.

#### 2. 🟡 Prompt Saturation (AMPLIFYING)

The coordinator prompt is 950 lines / ~80KB. The routing constraint is buried at line 1010 under irrelevant sections (Init Mode, ceremonies, Ralph work monitor, worktree lifecycle). The core dispatch loop accounts for ~200 lines, competing for attention with ~750 lines of governance and reference material.

#### 3. 🟡 Template Duplication (AMPLIFYING)

CLI 1.0.11 discovers all \*.agent.md\ files from cwd to git root. Squad has 5 copies: .squad-templates, templates/, packages/squad-cli/templates, packages/squad-sdk/templates, and .github/agents/. Only .github/agents/ should be discoverable. CLI 1.0.11 merges ALL of them, multiplying the coordinator instructions by 5x and diluting the routing constraint.

### Proposed Fixes

**Fix 1: Platform-Neutral Enforcement Language (P0)**
- Rewrite CRITICAL RULE to be platform-neutral: 'You are a DISPATCHER, not a DOER. Every task that needs domain expertise MUST be dispatched to a specialist agent.'
- List dispatch mechanisms: CLI (`task` tool), VS Code (`runSubagent` tool), or fallback (work inline)
- Update anti-patterns and constraints sections with same substitution

**Fix 2: Top-and-Bottom Reinforcement (P0)**
- Add reinforcement block at end of prompt (LLMs weight beginning/end more heavily than middle)
- Emphasize: Squad ROUTES, it does not BUILD. Do not produce domain artifacts inline.

**Fix 3: Prompt Slimming — Move to Lazy-Loaded References (P1)**
- Extract ~350 lines (~37%) to lazy-loaded templates: worktree-reference.md, ralph-reference.md, casting-reference.md, mcp-reference.md
- Reduce from 950→600 lines, making routing constraint a larger percentage of total prompt

**Fix 4: Template File Renaming (P1)**
- Rename template copies to .template extension to prevent CLI 1.0.11 discovery
- Update sync-templates.mjs and squad-cli/squad-sdk init code to reference new filenames

**Fix 5: VS Code-Specific Hardening Block (P1)**
- Move VS Code adaptations section higher (from line 458 to immediately after CRITICAL RULE)
- Restructure as active enforcement block with platform detection table
- Make clear: if `runSubagent` is available, it MUST be used for domain work

### Priority Ordering

| Priority | Fix | Impact | Effort | Ships In |
|---|---|---|---|---|
| **P0** | Fix 1: Platform-neutral enforcement | 🔴 Directly closes logical gap | Low | Next patch |
| **P0** | Fix 2: Top-and-bottom reinforcement | 🔴 Exploits LLM attention patterns | Trivial | Next patch |
| **P1** | Fix 4: Template file renaming | 🟡 Eliminates 4x duplication | Medium | Next minor |
| **P1** | Fix 3: Prompt slimming | 🟡 Reduces 950→600 lines | Medium | Next minor |
| **P1** | Fix 5: VS Code hardening block | 🟡 Makes VS Code dispatch prominent | Low | Next minor |

**Ship order:** Fix 1 + Fix 2 together (one PR, immediate). Fix 4 next (requires code changes). Fix 3 + Fix 5 together (prompt restructure PR).

### Validation

After implementing, test with Andreas's reproduction case:
1. Open VS Code with squadified project
2. Ask coordinator to do domain work that matches routing rule
3. Verify: coordinator dispatches via `runSubagent` instead of working inline
4. Verify: coordinator cites the routing rule when dispatching

FIDO should own the test scenario. GUIDO should validate the VS Code runtime behavior.

### Open Questions

1. Does CLI 1.0.11 support exclusion patterns (.copilotignore)? If yes, Fix 4 becomes simpler.
2. Should we version-gate the VS Code adaptations (detect CLI version)?
3. Is `runSubagent` still the correct tool name, or has it changed?
---

# Decision: PR Review Batch — Overlap Resolution

**Date:** 2026-03-25  
**Reviewer:** FIDO (Quality Owner)  
**Context:** 10 open PRs reviewed, 3 duplicate/overlap pairs identified

## Problem

tamirdresher opened 6 PRs addressing related concerns (retro enforcement, challenger agent, tiered memory). Three pairs have significant overlap:

1. **#607 vs #605** — Both add weekly retro ceremony with Ralph enforcement
2. **#604 vs #603** — Both add Challenger agent template (complete duplicates)
3. **#606 vs #602** — Both add tiered memory/history skills (superset/subset)

## Decision

**Merge these:**
- **#607** (retro enforcement) — comprehensive, standalone ceremony file
- **#603** (Challenger + fact-checking) — correct file locations, follows project conventions
- **#606** (tiered memory) — superset of #602, 3-tier model vs 2-tier

**Close as duplicate:**
- **#605** — same scope as #607, less comprehensive
- **#604** — duplicate of #603, different file locations
- **#602** — subset of #606, narrower scope

## Rationale

- **#607 vs #605:** #607 provides standalone ceremony file (`ceremonies/retrospective.md`) + enforcement guide + skill, while #605 inlines into existing templates. Standalone file is more discoverable and modular.
- **#604 vs #603:** Functionally identical. #603 uses `.squad/` paths matching project conventions; #604 uses `templates/` (non-standard for agents).
- **#606 vs #602:** #606 is a superset — 3-tier model (hot/cold/wiki) vs 2-tier (hot/cold). Both cite same production data. Broader scope is more useful.

## Impact

- Reduces PR count from 10 to 7 (close 3 duplicates)
- Eliminates conflicting file changes (e.g., both #607 and #605 modify `templates/ceremonies.md`)
- Preserves all unique value (no functionality lost)

## Affected PRs

| PR  | Action | Reason |
|-----|--------|--------|
| 607 | Merge  | Comprehensive retro enforcement |
| 605 | Close  | Duplicate of #607 (less comprehensive) |
| 604 | Close  | Duplicate of #603 (wrong file paths) |
| 603 | Merge  | Challenger template (correct paths) |
| 606 | Merge  | Tiered memory (superset) |
| 602 | Close  | Subset of #606 (narrower scope) |

## Next Steps

1. Comment on #605, #604, #602 explaining they are duplicates/subsets and will be closed
2. Merge #607, #603, #606 after author confirms deduplication is acceptable
3. All other PRs (#611, #608, #592, #567) can proceed independently

---

# Decision: Triage + Work Session Plan

**By:** Flight  
**Date:** 2026-03-25

## Context

Triaged 14 untriaged issues (3 docs, 6 community features, 3 bugs, 2 questions). Multiple overlap with existing P1 work. 10 open PRs (5 from tamirdresher, 2 from diberry, 1 from joniba, 1 from eric-vanartsdalen, 1 draft).

## Triage Decisions

### High-Value Quick Wins (P1)
- **#610** (docs broken link) → squad:pao, P1 — 5-minute fix blocking diberry's PR #611 CI
- **#590** (getPersonalSquadRoot bug) → squad:eecom, P0 — personal squad init broken for all users since v0.9.1
- **#591** (hiring wiring docs) → squad:procedures, P1 — matches PR #592 (joniba), docs-only, high clarity

### Community Feature Contributions (Defer to Review)
- **#601, #600, #598, #596, #595** (tamirdresher proposals) — all have matching PRs (#607, #606, #604, #602). Priority: review PRs first, triage issues after PR decisions.

### Maintenance Items (P2)
- **#597** (upgrade CLI docs) → squad:pao + squad:network, P2 — user confusion, docs fix + UX improvement
- **#588** (model list update) → squad:procedures, P2 — hardcoded model list in squad.agent.md + templates
- **#554** (broken external links) → squad:pao, P2 — automated link checker output, investigate failures

### Questions (No Squad Assignment)
- **#589** (skills placement) → community reply — clarify `.copilot/skills` vs `.github/skills` vs `.claude/skills`
- **#494** (model vs squad model) → community reply — clarify Copilot CLI `/models` vs squad.agent.md model preference

### Long-Horizon Feature Work (P2-P3)
- **#581** (ADO Support PRD) → squad:flight, P2 — comprehensive PRD, but blocked until SDK-first parity (#341) ships

## Work Session Priority (Top 5)

1. **#610** → PAO — fix broken link (5 min), unblocks #611
2. **#590** → EECOM — fix getPersonalSquadRoot(), critical user-facing bug
3. **PR #592** → Flight review — matches #591, validate joniba's wiring guide
4. **PR #611** → Flight review — diberry TypeDoc API reference (blocked on #610 fix)
5. **#588** → Procedures — update model lists in templates

## PR Review Strategy

**Merge-ready (after minimal validation):**
- #611 (diberry) — blocked on #610, then merge
- #592 (joniba) — high-quality wiring guide

**Tamir PRs (defer until proposal-first validated):**
- #607, #606, #605, #604, #603, #602 — all substantive feature proposals without prior proposals in `docs/proposals/`. Apply proposal-first policy: request `docs/proposals/{slug}.md` before reviewing implementation.

**Draft (not ready):**
- #567 (diberry) — explicitly marked DRAFT

## Patterns Noted

- **Tamir contributions:** High technical quality, but needs proposal-first discipline (6 PRs without proposals).
- **Joniba contributions:** Consistently high-quality, matches team standards (wiring guide is excellent).
- **Diberry contributions:** MSFT-level quality, merge-ready on delivery.

## Deferred

- #357, #336, #335, #334, #333, #332, #316 (A2A) — stays shelved per existing decision
- #581 (ADO PRD) — P2, blocked until #341 (SDK-first parity) ships

---

### 2026-07-29: Workflow templates linted via explicit actionlint file paths

**By:** Booster (CI/CD)
**What:** Templates under `packages/squad-cli/templates/workflows/` and `packages/squad-sdk/templates/workflows/` are now linted by actionlint via explicit file path arguments in the new `squad-workflow-lint.yml` CI job. SC2086 findings fixed across all `>> $GITHUB_OUTPUT` / `>> $GITHUB_STEP_SUMMARY` redirects in `.squad-templates/workflows/`, `templates/workflows/`, `.github/workflows/squad-heartbeat.yml`, `squad-repo-health.yml`, and `squad-ci.yml`. Actionlint pinned to tag `v1.7.12`; shellcheck 0.10.0 installed explicitly.
**Why:** Downstream repos running actionlint in their CI saw SC2086 errors in files generated by `squad upgrade` because Squad's own CI did not lint templates. The fix must live in Squad's templates — `squad upgrade` overwrites any downstream patches on every run. PR #1557.

### 2026-08-19: Finding D: slash_command plus bots concurrency warning
**Date:** 2026-08-19T13:30:18.326-07:00  
**By:** Booster  
**Area:** Squad workflow trigger/concurrency behavior

## Finding

Compiling `workflows/squad.md` with `gh aw compile workflows\squad.md --no-emit --no-check-update` reproduces the warning:

```text
workflows\squad.md: warning: Both slash_command and bots triggers are configured. If a bot listed in bots: posts a comment that starts with the slash command text (e.g., /command-name), it will trigger the workflow and occupy the concurrency slot, potentially blocking simultaneous manual invocations. To ensure the workflow only runs on explicit user commands, remove the 'bots:' field.
```

The compile also fails afterward because the local worktree does not have the referenced `squad-implement-worker` in the compiler's expected `.github\workflows` directory, but the warning is emitted before that unrelated failure.

gh-aw emits the warning in `pkg/workflow/compiler_validators.go` from `emitGeneralToolWarnings` when both `len(workflowData.Command) > 0` and `len(workflowData.Bots) > 0`.

## Mechanism

`workflows/squad.md` configures:

```yaml
on:
  bots: ["github-actions[bot]"]
  slash_command:
    name: squad
```

gh-aw command matching accepts comments that are exactly `/squad`, start with `/squad `, or start with `/squad\n`. For comment triggers, actors listed in `bots:` are exempted from the normal owner/member/collaborator author-association guard, so a `github-actions[bot]` comment beginning with `/squad` can pass activation.

The workflow has no explicit concurrency block, so gh-aw auto-generates command/slash-command workflow concurrency keyed by workflow plus issue/PR number, with `cancel-in-progress` disabled for command workflows. A bot-authored `/squad ...` comment on the same issue therefore shares the same concurrency slot as a human `/squad ...` comment on that issue.

GitHub Actions permits one running and one pending run per concurrency group by default. If the bot run is running, the human run is delayed as pending. If another run in the same group queues while the human run is pending, the older pending run can be canceled and replaced. The failure can be effectively silent from the issue thread; the signal is in Actions UI/logs, not necessarily a Squad comment.

## Assessment

This is a real but narrow hazard. Our current `bots:` entry is only `github-actions[bot]`. Our own gh-aw/Squad failure and status comments can be authored by that bot, but the observed `[aw]` failure-report class does not begin with `/squad`, so it does not match the slash-command predicate.

For the e2e chain we care about — `/squad implement` → epic → child PR → merge → worker dispatches Squad continuation — this warning is unlikely to bite unless one of our bot-authored comments begins with `/squad`. The continuation hop uses `dispatch-workflow` / `workflow_dispatch` inputs, not a bot issue comment, so it does not require `bots:` and does not depend on bot-authored slash-command comments.

## Options

1. **Remove `bots:` from `workflows/squad.md`.** Clears the warning and prevents bot-authored `/squad` comments from occupying the human command slot. Cost: any intentional GitHub Actions bot slash-command automation stops working. I found no evidence the implement continuation needs that.
2. **Narrow `bots:`.** Already as narrow as possible for this use case (`github-actions[bot]` only). No practical improvement unless there is a more specific bot identity.
3. **Custom concurrency group with bot isolation.** Could route bot actors to `github.run_id`, but gh-aw still emits this warning because the check only looks at `slash_command` plus non-empty `bots`. It also preserves bot-triggered `/squad` execution, which is the behavior creating risk.
4. **Restructure triggers / split bot handling.** Viable only if we need bot slash-command support. More complexity than warranted for the e2e path.
5. **Suppress or ignore.** Leaves warning noise and a narrow real hazard. Acceptable for immediate e2e only if no bot comments start with `/squad`.

## Recommendation

Address it, but do not block the immediate e2e rerun on it. The clean product configuration is to remove `bots:` from `workflows/squad.md` unless Flight identifies a required bot-authored slash-command scenario. The continuation hop we are proving uses workflow dispatch, so removing `bots:` should not weaken that path. If the team wants zero churn before the e2e rerun, doing nothing is operationally acceptable as long as the rerun issue avoids bot comments beginning with `/squad`.

### 2026-08-19: Finding F: protected-files request_review and signed commits
**Date:** 2026-08-19T13:11:34.130-07:00  
**By:** Booster  
**Area:** gh-aw safe-output protection for Squad Implement Worker

## Verdict

The hard refusal is real signed-commit behavior, not a missing protected-files lookup. gh-aw first classifies `protected-files: request_review` as a soft protected-file action, but the signed-commit replay path revalidates the synthesized GraphQL payload and rejects every file-protection action except `allow`.

That makes `request_review` effectively incompatible with signed `create-pull-request` writes that touch protected files. The user-visible soft-log/hard-fail sequence is an integration/documentation bug in gh-aw, but the signed path is deliberately fail-closed.

## Mechanism

1. `create_pull_request.cjs` calls `checkFileProtection(...)` with the configured policy defaulting to `request_review`.
2. For `request_review`, it logs that it will create the pull request with a caution and request-changes review.
3. The handler then calls `pushSignedCommits(...)` with the same validation config.
4. `push_signed_commits.cjs` synthesizes the GraphQL `createCommitOnBranch` file payload and calls `checkFileProtectionPostApply(...)`.
5. If the returned action is anything other than `allow`, it throws `Signed-commit payload violates file-protection policy (...)`.
6. `request_review` therefore soft-logs at PR-handler level, then hard-refuses at signed-push level.

`fallback-to-issue` follows a different route: the same signed-push validation still rejects the protected payload, but the PR handler has `manifestProtectionFallback` set, catches the push failure, and creates the protected-file review issue instead of trying to create the PR.

## Worker recommendation

For `workflows/squad-implement-worker.md`, keep the existing `excluded-files` list for structural no-write zones:

```yaml
excluded-files:
  - ".github/workflows/**"
  - "**/.github/workflows/**"
  - ".github/agents/**"
  - "**/.github/agents/**"
  - ".github/aw/**"
  - "**/.github/aw/**"
  - ".squad/**"
  - "**/.squad/**"
```

Change `protected-files: request_review` to:

```yaml
protected-files: fallback-to-issue
```

Do not set `protected-files: allowed` unless the worker is intentionally allowed to rewrite protected manifests, security docs, and other top-level dot folders. `excluded-files` and `protected-files` overlap only for the excluded protected directories. `excluded-files` strips those paths from the patch before commit creation; `protected-files` still protects package manifests, lockfiles, `CODEOWNERS`, `README.md`, `SECURITY.md`, `CHANGELOG.md`, and other non-excluded protected files.

## E2E rerun viability

This should unblock the e2e rerun for the worker path. A protected-file write will no longer produce the misleading `request_review` soft path followed by a signed-payload hard failure; it will be routed to the protected-file review issue path. Writes under `.github/workflows/`, `.github/agents/`, `.github/aw/`, and `.squad/` should be stripped before protected-file evaluation because of `excluded-files`.

Any workflow-source change must be recompiled into the installed `.lock.yml` used by `bradygaster/aspiregregator-squad-test`; editing this repo's Markdown source alone will not affect an already-compiled test workflow.

## Risk

The recommendation does not weaken the no-write zones covered by `excluded-files`; those files remain absent from the generated patch. It does change the protected-file outcome from failed/contradictory `request_review` to review-issue fallback. The worker does not gain ability to commit excluded directories, but it can still propose normal allowed source files. Protected non-excluded files will require manual review through an issue instead of being opened as a PR with requested changes.

### Files Updated
1. `.squad/skills/release-process/SKILL.md` (team-level skill)
2. `.copilot/skills/release-process/SKILL.md` (copilot-level skill)
3. `.squad/agents/booster/history.md` (learnings log)

### New Knowledge Added

| Issue | Root Cause | Fix PR | Skill Section |
|-------|-----------|--------|---------------|
| Root package.json version drift | squad-release.yml reads from root, not sub-packages | #1043 | Known Gotchas + v0.9.4 Incident Learnings |
| CHANGELOG missing `## [$VERSION]` | Workflow validates version entry exists | #1042 | Known Gotchas + Release Checklist |
| Lockfile integrity check rejects workspace packages | Check didn't filter for registry-only packages | #1044 | Known Gotchas + Common Failure Modes |
| GITHUB_TOKEN can't trigger downstream workflows | GitHub security feature prevents event propagation | N/A (design) | GITHUB_TOKEN section + Manual Publish |
| Prebuild bump breaks workspace linking | bump-build.mjs mutates versions breaking exact match | N/A (known) | Local Development section |

### Cross-References
- Added bidirectional cross-references between team-level and copilot-level skill files
- Added PR references (#1042, #1043, #1044) as source evidence throughout

## Rationale

These are high-impact, recurring failure modes. Documenting them in the skill files ensures every agent (human or AI) working on releases has the knowledge to avoid repeating the v0.9.4 delays. The GITHUB_TOKEN limitation in particular is non-obvious and would catch any future release.

### 2026-08-08: `/squad plan` Workflow Design
**Date:** 2026-08-08
**Raised by:** bradygaster (via Copilot session)
**Status:** Open
**Related:** `.squad/decisions/inbox/copilot-sdlc-workflows.md`

## Context

After casting (#8 → PR #9 on Aspiregregator), the natural next step is decomposing the issue into actionable sub-issues. Today this requires manual work. A `/squad plan` command would let the squad generate a plan from an issue, get approval, then create sub-issues.

## UX Flow (Proposed)

```
User writes issue #8 (big feature/epic)
  ↓
/squad cast → PR with team (already works ✅)
  ↓
/squad plan → Squad reads issue, posts structured plan as comment
  ↓
User reviews plan comment
  ↓
/squad plan accept → Squad creates sub-issues from the plan
```

## UX Options for the Accept Step

### Option A: `/squad plan accept` (recommended)

```
/squad plan              → generates plan comment
/squad plan accept       → creates sub-issues from last plan comment
/squad plan revise ...   → revises plan based on feedback, posts new comment
```

- **Pro:** Explicit, discoverable, follows the existing `/squad <mode>` pattern
- **Pro:** Feedback loop — user can `/squad plan revise "split the React work into 3 phases"` before accepting
- **Con:** User must type another comment to accept

### Option B: Checkbox-based acceptance

The plan comment includes GitHub task-list checkboxes:
```markdown
## Proposed Plan
- [x] Issue: Platform modernization (auto-checked = will be created)
- [x] Issue: Orleans architecture completion
- [ ] Issue: Security hardening (unchecked = skip)

Reply `/squad plan accept` to create the checked items.
```

- **Pro:** User can selectively approve individual items before accepting
- **Con:** More complex — agent must re-read the edited comment and parse checkbox state
- **Con:** Editing someone else's comment (bot's) feels weird; user would need to quote/copy

### Option C: Reaction-based acceptance (👍 on plan comment)

- **Pro:** Zero typing — just react to accept
- **Con:** gh-aw likely can't trigger on reactions (not in the events list)
- **Con:** Too easy to accidentally accept

### Option D: Draft PR as plan artifact

`/squad plan` creates a draft PR containing a `PLAN.md` with the proposed issues in markdown. Merge = accept.

- **Pro:** Native review workflow (comments, suggestions, approvals)
- **Con:** Plans aren't code — feels wrong to use a PR
- **Con:** Adds merge noise to the repo

## Workflow Architecture Options

### Option 1: Extend existing `squad.md` workflow (minimal)

Add `plan`, `plan accept`, `plan revise` to the existing modes table. No new workflow needed.

```yaml
# Just add to the Modes table:
| `/squad plan`          | Plan         | Decompose issue into sub-issues (proposes, doesn't create) |
| `/squad plan accept`   | Plan Accept  | Create sub-issues from last plan comment |
| `/squad plan revise`   | Plan Revise  | Revise plan based on feedback |
```

- **Pro:** Zero additional install — anyone with `/squad` already has planning
- **Pro:** Shares the same team context (squad state restored from activation)
- **Con:** `safe-outputs.create-issue.max: 5` is too low for planning decomposition
- **Con:** Workflow grows in complexity; permissions are shared across modes
- **Mitigation:** Bump `create-issue.max` to 20

### Option 2: Separate `workflows/plan.md` (composable)

New top-level workflow: `/plan` slash command, imports `shared/squad.md` for team state.

```yaml
name: Plan
on:
  slash_command:
    name: plan
    events: [issues, issue_comment]
permissions:
  contents: read
  copilot-requests: write
  issues: write          # needs write to create sub-issues
safe-outputs:
  create-issue:
    labels: [squad, planned]
    max: 20
  add-comment:
    max: 10
imports:
  - shared/squad.md
```

- **Pro:** Dedicated permissions (issues: write only when planning)
- **Pro:** Clean separation — cast and plan are independent workflows
- **Pro:** Users opt-in to planning separately: `gh aw add bradygaster/squad/workflows/plan.md@dev`
- **Con:** Extra install step for users
- **Con:** `/plan` is a separate namespace from `/squad` (less discoverable)

### Option 3: Hybrid — `shared/plan.md` component imported by `squad.md`

```yaml
# In workflows/squad.md:
imports:
  - shared/squad.md
  - shared/plan.md
```

- **Pro:** Single install, single `/squad` namespace, but planning logic lives in its own shared component
- **Pro:** Others can also import `shared/plan.md` into their own workflows
- **Con:** Permissions must cover both casting and planning in one workflow

## Recommendation

**Option A (UX) + Option 3 (architecture)** — Keep `/squad plan` under the existing `/squad` namespace (discoverability), implement planning logic in `shared/plan.md` (composability), and bump `create-issue.max` to 20.

The flow becomes:
1. `/squad plan` → reads issue body + repo context, generates structured plan comment with sub-issues, effort estimates, dependencies, and agent assignments
2. User reviews, optionally replies `/squad plan revise "merge items 3 and 4, add a migration step"`
3. `/squad plan accept` → creates sub-issues with labels, assignments, and dependency references

Plan comments should be structured with:
- Numbered work items with titles and scope descriptions
- Dependency order (which items block which)
- Agent assignments (which squad member owns each item)
- Effort signals (S/M/L)
- A summary of what `/squad plan accept` will create

## State Between Runs

gh-aw runs are stateless. The plan comment IS the state:
- `/squad plan` → posts a comment with a specific marker (e.g., `<!-- squad-plan-v1 -->`)
- `/squad plan accept` → searches issue comments for the latest plan marker, parses it, creates issues
- `/squad plan revise` → finds the latest plan, revises it, posts a new plan comment (supersedes the old one)

## Open Questions

1. Should `/squad plan accept` also assign the created issues to squad members (via labels like `squad:lead`)?
2. Should plan comments include task-list checkboxes for selective acceptance?
3. Should the plan reference the team from PR #9's `.squad/team.md`, or work without a cast team?
4. Max issues to create in one plan — 20? 30?

## Decision

*(Pending — to be resolved by the team)*

### 2026-08-08: Should Squad ship pre-baked SDLC workflows?
**Date:** 2026-08-08
**Raised by:** bradygaster (via Copilot session)
**Status:** Open

## Context

Squad currently owns team formation and coordination (`workflows/squad.md` + `shared/squad.md`). Once a squad is cast, the actual SDLC — plan, implement, test, review — happens through the agents but there's no pre-built gh-aw workflow for those phases. Users go from "I have a squad" to "now what?" with a gap.

The question: should Squad ship optional SDLC workflows (plan, implement, review), or leave that space to other tools/integrations?

## Options

### A — Squad stays team-only (status quo)

- Squad owns casting, coordination, and routing
- SDLC workflows are the user's responsibility or come from third parties
- Other tools can `imports: - shared/squad.md` to compose Squad into their own pipelines
- **Pro:** Tight scope, easier to maintain, no opinions on how teams should work
- **Con:** Biggest friction point ("I cast a squad… now what?") remains unsolved

### B — Ship optional SDLC workflows under `workflows/shared/`

- Add composable shared components: `shared/plan.md`, `shared/implement.md`, `shared/review.md`
- Each imports `shared/squad.md` for team state
- Ship a top-level `workflows/sdlc.md` that composes all phases as a batteries-included option
- Users who only want casting still use `workflows/squad.md` alone
- **Pro:** Closes the adoption gap, composable (not mandatory), demonstrates the `shared/` pattern
- **Con:** More surface area to maintain, risk of being too opinionated

### C — Ship a single "do work" workflow, not a full SDLC

- One additional workflow (e.g., `workflows/work.md`) that takes an issue and delegates it to the squad
- Lighter than a full SDLC pipeline — just "give an issue to the squad and let them figure it out"
- **Pro:** Minimal scope increase, high value, lets the squad's routing/coordination handle the rest
- **Con:** Doesn't cover structured SDLC phases (planning, review gates)

## Recommendation

Option B with a phased rollout — start with a single `shared/implement.md` component (the highest-value gap), then add plan and review later based on usage. This keeps the composable `shared/` pattern intact while solving the immediate "now what?" problem.

## Decision

*(Pending — to be resolved by the team)*

### 2026-08-13: Restore shared ancestry between dev and main via merge, dev-wins conflict policy

## Context

`dev` and `main` had unrelated git histories. `dev`'s root commit (`4c5772c5`, a
dependabot bump dated 2026-07-13) shares no ancestor with `main`'s root
(`f4830e48`, 1722 commits). `dev` itself has 196 commits. `git merge-base
upstream/dev upstream/main` returned nothing and `git merge-tree` refused
outright. This made the v0.12.0 promotion PR (#1698, `dev` -> `main`) flatly
unmergeable, with no way to review a normal diff. The v0.11.0 promotion
(2026-06-29) predates the July 13 reset, which is why it worked and why
#1698 was the first to hit this wall.

## Decision

Merge `upstream/main` into `dev` with `--allow-unrelated-histories`, resolving
every one of the 275 conflicts in `dev`'s favor, on a new branch
`squad/restore-main-ancestry`, landed via PR #1699 into `dev`.

Rejected alternative: rebasing `dev` onto `main`. `dev` carries a
`non_fast_forward` ruleset that blocks the force-push a rebase requires, and a
rebase would rewrite all 196 commits on `dev`, invalidating every PR currently
open against it. A merge is additive only and needs no force-push.

## Why dev-wins conflict resolution is safe

All 275 conflicts were `add/add` (identical path on both branches, no common
base to 3-way merge from). Resolved every one with `git checkout --ours` (dev's
content). This is safe because the only `main`-only code fix that mattered,
#1415 (`tools: ['*']` in `.github/agents/squad.agent.md`), was verified already
present on `dev` before starting the merge, so dev-wins loses zero code.
Verified the resolution was a true no-op against dev's pre-merge tree: diffing
all 275 resolved files plus the 48 removed changesets plus the 6 auto-merged
files against dev's HEAD showed only 18 real changes total, exactly the
files deliberately kept (see below). Confirmed unchanged post-merge:
`package.json` / `packages/squad-cli/package.json` / `packages/squad-sdk/package.json`
(all `0.12.0`), `CHANGELOG.md` (`## [0.12.0] - 2026-08-12` intact),
`test/gh-aw-quality.test.ts` (#1697 fix intact), `workflows/squad.md` and
`workflows/squad-implement-worker.md` (#1682 feature intact).

## What was restored (kept from main, lost in the July 13 reset)

7 docs pages:
- docs/src/content/blog/015-wave-2-the-repl-moment.md
- docs/src/content/blog/032-v010-stabilisation-insider.md
- docs/src/content/blog/033-swe-bench-lite-results.md
- docs/src/content/docs/features/remote-control.md
- docs/src/content/docs/get-started/choosing-your-path.md
- docs/src/content/docs/guide/personal-squad.md
- docs/src/content/docs/guide/shell.md

5 decision records:
- .squad/decisions/inbox/booster-ci-deletion-guard.md
- .squad/decisions/inbox/booster-release-skill-v094.md
- .squad/decisions/inbox/flight-versioning-policy.md
- .squad/decisions/inbox/procedures-fix-coordinator-inline-dispatch-gate.md
- .squad/decisions/inbox/retro-copilot-git-safety.md

Plus 6 files that auto-merged cleanly via a genuine 3-way merge (not a
conflict), appending older history from main onto dev's existing content with
no loss on either side: `.squad/agents/{eecom,fido,flight,pao,procedures}/history.md`
and `.squad/decisions.md`.

## What was dropped

48 `.changeset/*.md` files that arrived from `main`. These are spent: their
content is already consumed into `CHANGELOG.md`'s `[0.12.0]` entry, and
re-adding them risked tripping the Changeset Drift check. `.changeset/` after
this merge contains exactly what `dev` had before: `README.md`,
`config.json`, `max-reasoning-effort.md`.

## Validation

Static/diff verification was thorough (see above). Dynamic validation
(`npm run build`, `npx vitest run`) could **not** be executed in this sandbox:
the corporate npm proxy does not mirror `eslint-plugin-n@18.3.0` (its cache
tops out at 18.2.2) and there is no direct route to the public npm registry
from this environment. Confirmed unrelated to the merge:
`package-lock.json`'s staged content is byte-identical to dev's pre-merge
HEAD, and this exact dependency/version was already in dev's lockfile before
any of this work. CI (which has full registry access) is the source of truth
for build/test validation on PR #1699.

## Outcome

`git merge-base <this-branch> upstream/main` now succeeds, confirming `dev`
has a real common ancestor with `main` again. This unblocks PR #1698 and
prevents the same failure on future promotions, provided the new release-process
skill gate (verify `git merge-base dev main` before starting release-prep) is
followed going forward.

### 2026-07-27: Dispatch Enforcement — Stop Coordinator From Doing Domain Work Inline
**Status:** ACCEPTED (empirically validated in tamresearch1 worktree; ported to bradygaster/squad)
**Proposed by:** Picard, Data, Q (review chain)
**Validated by:** Ralph (E2E test report, 2026-07-27)
**PR:** See squad/dispatch-enforcement branch on tamirdresher_microsoft:squad-squad

## Decision

Squad coordinators MUST dispatch all domain work to specialist agents. Inline work by the coordinator is a contract violation. Three enforcement layers are being shipped:

### Layer A — Coordinator Tool Profile Restriction

Apply a `tools:` allowlist in the coordinator agent's frontmatter (`.github/agents/squad.agent.md`). The allowlist contains only dispatch-safe tools:

```yaml
tools:
  - agent
  - read
  - search
  - skill
  - squad_state/*
  - squad_state_c3c25b85/*
  - squad_state_e7f10a1f/*
  - github-mcp-server/*
```

**Effect:** Physical prevention — the Copilot runtime blocks any tool call outside this list with a hard error (`Unknown tool name in the tool allowlist: "create"`). Empirically verified across all 3 Test 1 turns.

**Meta-gap (accepted):** Because `create` and `edit` are blocked at the coordinator level, the DispatchGuard ledger (Layer B) cannot be written by the coordinator itself. Layer B becomes opt-in observation mode when Layer A is active. This is an accepted trade-off per Q Recommendation #6: unverifiable compliance ≠ free pass.

### Layer B — Scribe DispatchGuard Mechanical Audit

Scribe is spawned in DispatchGuard mode at every session start. It reads the coordinator's turn ledger (`.squad/orchestration-log/dispatchguard/ledger-{SESSION_ID}.jsonl`) and audits each turn via `.squad/hooks/dispatch-audit.ps1` / `.squad/hooks/dispatch-audit.sh`. Verdicts are appended to a verdicts file consumed by Ralph.

**Enforcement mode:** `dispatchEnforcement: "warn"` (see `.squad/config.json`). Can be escalated to `"block"` to halt coordinator work on violation.

**Infrastructure:** `.squad/hooks/dispatch-audit.ps1` (Windows/PowerShell 7+), `.squad/hooks/dispatch-audit.sh` (Linux/macOS, requires jq ≥ 1.6), test fixtures in `.squad/hooks/tests/`.

### Layer C v2 — Dispatch Contract Wording

The coordinator prompt (`squad.agent.md`) includes:
- An explicit **Direct-Mode whitelist** (5 exhaustive cases where inline work is permitted)
- The **Domain-Artifact rule** (everything not on the whitelist must dispatch)
- The **Narrow inbox exemption** (≤500-word `.squad/decisions/inbox/*.md` files only)
- **Verb triggers** (explicit list of verbs requiring dispatch when paired with domain-artifact objects)
- The **Read-Only Probe Budget** (max 2 reads before dispatch is required)
- The **Anti-pattern prohibition** (enumerated rationalizations that are explicitly NOT valid overrides)
- The **Session Init DispatchGuard Auto-Bootstrap** (mandatory Scribe spawn every session, first ack turn)
- The **Bootstrap Verification** (coordinator must confirm Scribe DispatchGuard is live before proceeding)

## Empirical Evidence

Tested in tamresearch1 worktree, 2026-07-27 (Ralph report `ralph-e2e-post-layer-a-report.md`):

| Turn | Verb | Pre-Layer-C | Layer-C only | Layer-A+B+C | Result |
|------|------|-------------|--------------|-------------|--------|
| 1 | analyze | drift | drift | DISPATCHED | ✅ Fixed |
| 2 | propose | drift | drift | DISPATCHED | ✅ Fixed |
| 3 | apply | dispatched | drift REGRESSED | DISPATCHED | ✅ Regression reversed |

Verbatim tool-block errors confirming Layer A enforcement:
```
● Unknown tool name in the tool allowlist: "create"
● Unknown tool name in the tool allowlist: "edit"
● Unknown tool name in the tool allowlist: "grep"
```

## Known Limitations

1. **Audit meta-gap** (HIGH): Layer A blocks `create`/`edit` → coordinator can't write DispatchGuard ledger → `dispatch-audit.ps1` always returns `indeterminate` for real sessions. Layer B and Layer A are mutually incompatible in Phase 1. Accepted trade-off.
2. **`grep` tool unintended casualty** (MED): `grep` is the CLI-native search tool, not in the allowlist. `read` and `search` are allowed. Scribe/sub-agents use `grep` from their own (unrestricted) tool context — not blocked.
3. **Coverage gap** (INFO): Layer A only applies when the coordinator is invoked via `agent` tool. External repos without squad routing labels don't trigger SquadShort/Squad coordinator → Layer A doesn't apply.
4. **Verbal override NOT supported**: `dispatchEnforcement: "off"` in `.squad/config.json` (committed diff) is the only valid override. Verbal in-turn overrides are NOT a supported path.

## Override Path

To disable enforcement: commit `dispatchEnforcement: "off"` in `.squad/config.json`. This is the ONLY valid override — a committed, reviewable diff, not a verbal in-session request.

## Files Added/Modified

- `.squad/config.json` — added `dispatchEnforcement: "warn"`
- `.squad/agents/scribe/charter.md` — added Tool Access section + DispatchGuard section
- `.squad/agents/ralph/charter.md` — replaced stub with full charter including Verdict Consumer + Skills
- `.squad/hooks/dispatch-audit.ps1` — 410-line PowerShell audit script
- `.squad/hooks/dispatch-audit.sh` — bash port (parity-verified)
- `.squad/hooks/README.md` — platform guide
- `.squad/hooks/tests/` — 7 JSONL fixtures + 2 parity test runners
- `.squad/templates/orchestration-log.md` — appended DispatchGuard ledger schema
- `.squad/routing.md` — extended Routing Principles with DispatchGuard notes
- `.github/copilot-instructions.md` — added identity lock + routing guard + adversarial input handling
- `.github/instructions/squad-routing-guard.instructions.md` — new file: explicit routing rules
- `.gitignore` — added `.squad/orchestration-log/dispatchguard/`
- `.github/agents/squad.agent.md` — Layer A frontmatter + Layer C v2 body prose

### 2026-08-19: Squad protected-files policy
**Date:** 2026-08-19T13:11:34.130-07:00  
**By:** Flight  
**Area:** Squad Implement Worker protected-file policy

## Recommendation

Choose **B**:

```yaml
protected-files:
  policy: fallback-to-issue
  exclude:
    - README.md
```

This should be Squad's shipped worker default for now. It fixes the `request_review`/signed-commit incompatibility without turning routine README work into a dead-end review issue. It keeps the genuinely load-bearing protected files protected: dependency manifests, lockfiles, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and top-level dot folders not already stripped by `excluded-files`.

Do not choose plain `fallback-to-issue` as the product default. It is mechanically safe but creates the wrong default UX for a core Squad use case: docs improvement by PAO. Do not choose the broader docs exclusion yet. `README.md` is special because it is both high-frequency and low-control-plane. `CONTRIBUTING.md` and `CHANGELOG.md` can be process/release-control files in adopting repositories.

## Threat model

The protected-file guard is not primarily protecting `dev` from an unreviewed merge; the PR review gate already does that. It is protecting reviewers and repo owners from high-leverage changes being normalized into routine agent output.

Protected status is load-bearing when a file can change:

- the dependency graph or supply-chain surface (`package.json`, lockfiles, `go.mod`, `pyproject.toml`, `Gemfile`, `Directory.Packages.props`, etc.);
- install/build/test execution (`scripts`, package manager config, SDK/toolchain pinning);
- repository governance (`CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`);
- release provenance or release automation assumptions (`CHANGELOG.md` in many repos);
- future automation behavior through top-level dot folders, where not already removed by `excluded-files`.

For those files, `fallback-to-issue` forces a human to explicitly acknowledge that the work is crossing a policy boundary before the patch becomes a normal PR. That extra friction is justified.

`README.md` does not carry the same default threat. It can mislead users, but that risk is visible in ordinary review and is exactly the kind of work Squad should handle. Protecting every basename `README.md` at every depth is inherited from gh-aw's generic manifest-safety model, not from Squad's product model.

## Unit of configuration

Ship B as the worker default, then surface protected-file policy as an adopting-repo configuration choice in the connect/adopt path.

The worker needs a safe, opinionated default because every adopter starts somewhere. But repo owners differ: regulated repos may want strict plain `fallback-to-issue`; docs-heavy repos may want additional exclusions; experimental repos may choose a looser profile. This belongs beside the finding E preflight for Actions PR permissions. Both are adoption-time repository capability/safety choices, so they should share one preflight/configuration surface rather than becoming scattered workflow footnotes.

The default should not wait for that surface. The current `request_review` value is broken with signed create-pull-request writes.

## User experience of fallback-to-issue

`fallback-to-issue` is acceptable as a policy-boundary escape hatch, not as the normal happy path.

For a legitimate manifest task such as "add the Serilog package," an issue instead of a PR is frustrating but defensible: adding a dependency is a supply-chain decision, and the repo owner should consciously turn that issue into a PR or configure a looser policy. That outcome must be documented clearly so users understand it is a safety handoff, not a failed worker.

For README work, the same experience is bad product behavior. It blocks common successful work, creates coordinator churn, and trains users that Squad cannot do basic docs tasks. That is why README should be excluded from protected-file defaults.

## CHANGELOG.md

Do not exclude `CHANGELOG.md` in the shipped default.

This repo uses changesets, so Squad should normally write `.changeset/*.md`, not `CHANGELOG.md`. Adopting repos may not. In many projects `CHANGELOG.md` is release provenance, may be generated, and may be validated by release automation. A false changelog entry can be materially worse than a README edit because it can misstate shipped behavior or satisfy a release gate. Repos that intentionally maintain changelogs by hand can opt out later through the adoption configuration surface.

## Follow-up

When implementation happens, update the workflow source and recompile the installed `.lock.yml` in any consuming/test repo used for validation. Keep the existing `excluded-files` rules; they solve a different problem and remain independent of this decision.

### 2026-03-26: Copilot git safety rules
**By:** RETRO (Security)
**What:** Added mandatory Git Safety section to copilot-instructions.md: prohibits staging the entire working tree with a bare-dot `git add` (i.e. `git add` followed by just `.`), requires feature branches and PRs, adds pre-push checklist, defines red-flag stop conditions.
**Why:** Incident #631 — @copilot used destructive staging on an incomplete working tree, deleting 361 files.