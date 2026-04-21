# Kickstart → Squad Sync Proposal

**Date:** 2026-04-20  
**Author:** Flight (Lead)  
**Status:** DRAFT — Awaiting Ahmed's review  
**Source:** Analysis of https://github.com/sabbour/kickstart `.squad/` and `.github/` against `packages/squad-cli/templates/`

---

## Executive Summary

Ahmed's `kickstart` repo has accumulated seven months of Squad process improvements that haven't been ported back to the Squad product source. The most impactful changes are behavioral: a worktree mandate that prevents agents from clobbering each other's work, a PR review feedback-loop protocol that enforces explicit comment resolution, and a `squad-review-gate` CI status check that converts approval labels into a hard merge gate. Together these three changes dramatically improve multi-agent reliability and would benefit every project that installs Squad.

---

## Findings

### 1. Worktree Mandate in `copilot-instructions.md`

**What kickstart changed:**  
Added a full `## Worktrees` section to `.github/copilot-instructions.md`:

```
Never run `git checkout -b` in the top-level working tree. Every piece of issue
work happens inside its own worktree under `.worktrees/`. ...
```

Also included a worked example with `git worktree add .worktrees/{issue-number-or-slug} -b squad/{issue-number}-{slug} origin/main` and cleanup instructions.

**Problem it solves:**  
When multiple agents work concurrently (or a human and an agent work simultaneously), branching from the top-level checkout causes dirty diffs, wrong-base branches, and mixed PRs. This was the root cause of several multi-agent incidents observed in kickstart.

**Belongs in Squad?** ✅ Yes — generic pattern, applies to every project using Squad.

**Target file:** `packages/squad-cli/templates/copilot-instructions.md`

**Priority:** CRITICAL  
**Effort:** small

---

### 2. PR Review Feedback Loop in `copilot-instructions.md`

**What kickstart changed:**  
Added `## PR Review Feedback — Required Loop` section to `.github/copilot-instructions.md`:

> 1. Fix the code (or decide not to and explain why)  
> 2. Reply to the specific comment with what you did: "Addressed in {sha}: {description}"  
> 3. Resolve the thread via GitHub GraphQL API (resolveReviewThread mutation)  
> 4. Verify 0 unresolved threads before attempting merge

Also points to `ceremonies.md` for the full protocol.

**Problem it solves:**  
Without this, agents silently fix code and re-push without closing review threads. PRs pile up with stale comments that look unaddressed. Reviewers can't tell what's been fixed. This was the "silent success mitigation" gap identified in the routing decisions doc.

**Belongs in Squad?** ✅ Yes — generic quality protocol, applicable everywhere.

**Target file:** `packages/squad-cli/templates/copilot-instructions.md`

**Priority:** CRITICAL  
**Effort:** small

---

### 3. New Workflow: `squad-review-gate.yml`

**What kickstart changed:**  
Introduced a new GitHub Actions workflow that creates a `squad/review-gate` commit status on every PR event. It checks for `leela:approved` + `zapp:approved` labels (approval labels matching the project's reviewer roles). Supports:
- **Standard path:** requires both approval labels
- **Low-risk path:** `squad:chore-auto` label → only Lead approval required (unless sensitive paths or security signals detected)
- **Trusted retro-log bypass:** automated retro-log PRs from known bots get auto-approved
- Sensitive path detection: `.github/workflows/`, auth/guardrail paths always require full dual approval

**Problem it solves:**  
Without a commit status check, approval labels are advisory only — GitHub's branch protection can't enforce them. This workflow converts the approval label system into a real merge gate that branch protections can reference. Before this, the auto-merge workflow had no trusted CI signal to wait for.

**Belongs in Squad?** ✅ Yes — this is the missing enforcement layer for the approval label pattern Squad already uses. The role names in the label check need to be configurable (or use a `SQUAD_REVIEWER_LABEL` / `SQUAD_SECURITY_LABEL` variable), but the pattern is generic.

**Target file:** New `packages/squad-cli/templates/workflows/squad-review-gate.yml`

**Note:** Kickstart uses `leela:approved` / `zapp:approved` because those are Leela's and Zapp's names. The template should either be parameterized (e.g. `SQUAD_LEAD_LABEL`, `SQUAD_SECURITY_LABEL`) or use a generic fallback like `squad:lead-approved` + `squad:security-approved` with documentation on how to customize for your team's names.

**Priority:** HIGH  
**Effort:** medium

---

### 4. New Workflow: `squad-auto-merge.yml` (major upgrade)

**What kickstart changed:**  
Kickstart's `squad-auto-merge.yml` is a substantially more sophisticated version of a simple auto-merge trigger. Key additions over what Squad currently ships:

- **Stale approval label clearing on new commits:** When a PR is synchronized (new commits pushed), old `*:approved` labels are automatically removed. The opposite reviewer's approval is preserved if their counterpart is already in a rejection loop (prevents double-jeopardy).
- **XL threshold blocking:** PRs > 1,000 changed lines are blocked from auto-merge.
- **Refactor title blocking:** PRs with "refactor" in the title require manual merge.
- **Trusted signals validation:** Before enabling auto-merge, verifies that the CI and review-gate workflows ran on the actual head SHA from trusted workflow paths (prevents spoofed status checks).
- **Dependabot bypass:** Dependabot PRs that pass CI get auto-merged without approval labels.
- **Trusted retro-log bypass:** Retro-log PRs from known bots touching only `.squad/retro-log.md` get auto-merged.
- **`squad:chore-auto` low-risk label:** Opt-in label for low-risk PRs that reduces required approvals to Lead-only (unless sensitive paths).
- **Audit comment:** Upserts a `<!-- squad-auto-merge -->` comment explaining why auto-merge was armed or disarmed.
- Triggers on both `pull_request_target` and `workflow_run` (CI/Review Gate completion).

**Problem it solves:**  
The current Squad template's auto-merge is brittle — it doesn't clear stale approvals when new commits arrive, doesn't block XL PRs from sneaking through auto-merge, and doesn't verify that the CI signals it relies on came from trusted workflow runs.

**Belongs in Squad?** ✅ Yes — all of these are generic reliability improvements. The approval label names need to be parameterized (same as #3).

**Target file:** New `packages/squad-cli/templates/workflows/squad-auto-merge.yml`

**Priority:** HIGH  
**Effort:** medium

---

### 5. `issue-lifecycle.md` — Token-Resolved Git Operations + Time Tracking

**What kickstart changed:**  
Every `git push`, `gh pr create`, `gh pr merge`, and `gh pr ready` command in the lifecycle is now fail-closed:

```bash
TOKEN=$(node "{team_root}/.squad/scripts/resolve-token.mjs" --required "{role_slug}") || exit 1
[ -n "$TOKEN" ] || exit 1
git push https://x-access-token:${TOKEN}@github.com/{owner}/{repo}.git squad/{issue-number}-{slug}
```

Additional additions:
- **Spawn prompt additions block:** The template now includes a full `## ISSUE CONTEXT` spawn block that coordinators should paste into agent spawn prompts, including project board IDs for moving issues on the board.
- **`## WORK START PROTOCOL`:** Agents must post a start comment and move the issue to "In Progress" via GraphQL before writing code.
- **`## TIME TRACKING`:** Agents emit `⏱️ STARTED:` / `⏱️ COMPLETED:` timestamps and include a `## Time Spent` section in PRs.
- **`## FEEDBACK ACKNOWLEDGMENT PROTOCOL`:** When addressing review feedback, agents post "addressing" and "addressed" comments via bot identity before and after.
- PR description template now includes `🤖 Created by [{app_slug}]` attribution and time tracking section.

**Problem it solves:**  
Agents using ambient `gh` auth post comments and PRs under the human user's identity. Fail-closed token resolution ensures agent-authored commits and PRs appear under the bot identity and fail loudly if the token isn't available rather than silently using human credentials.

**Belongs in Squad?** ✅ Yes — the `resolve-token.mjs` pattern exists in Squad's `.squad/scripts/`. The spawn prompt additions and time tracking are broadly useful. The bot identity sections should reference Squad's own token mechanism.

**Target file:** `packages/squad-cli/templates/issue-lifecycle.md`

**Priority:** HIGH  
**Effort:** medium

---

### 6. `squad-triage.yml` — Project Board Sync + Dependency Upgrades

**What kickstart changed:**  
- Added `repository-projects: write` permission
- Upgraded to `actions/checkout@v5` and `actions/github-script@v8`
- Added explicit `github-token: ${{ secrets.GITHUB_TOKEN }}` to script steps
- Added a second step "Add issue to project board" that uses `COPILOT_ASSIGN_TOKEN || GITHUB_TOKEN` and calls GitHub Projects GraphQL API to add the triaged issue to the configured project board

**Problem it solves:**  
Triaged issues weren't automatically added to the project board. The new step closes this gap. The v7→v8 upgrade resolves known GitHub Actions issues with the older version.

**Belongs in Squad?** ✅ Yes — but the project board number is hardcoded to `3` in kickstart. Squad should use `vars.SQUAD_PROJECT_NUMBER` (the same variable approach used in kickstart's separate `squad-project-sync.yml`) so the step is no-ops gracefully when no project is configured.

**Target file:** `packages/squad-cli/templates/workflows/squad-triage.yml`

**Priority:** HIGH  
**Effort:** small

---

### 7. `squad-label-enforce.yml` — Add `estimate:` Namespace

**What kickstart changed:**  
Added `estimate:` to the list of mutually exclusive label namespaces (`EXCLUSIVE_PREFIXES`). Now enforces that only one `estimate:S/M/L/XL` label can be active at a time, posting a comment when the estimate changes.

Also upgraded to `actions/checkout@v5`, `actions/github-script@v8`, and added explicit `github-token`.

**Problem it solves:**  
Without enforcement, an issue can accidentally carry both `estimate:S` and `estimate:L`, making velocity calculations incorrect.

**Belongs in Squad?** ✅ Yes — Squad already ships `squad-label-enforce.yml` with `go:`, `release:`, `type:`, `priority:` namespaces. This is a straight additive improvement.

**Target file:** `packages/squad-cli/templates/workflows/squad-label-enforce.yml`

**Priority:** MEDIUM  
**Effort:** small

---

### 8. New Workflow: `squad-visible-trail.yml` + `squad-visible-trail.cjs` Script

**What kickstart changed:**  
Introduced a two-job workflow (`issue-trail` and `pr-trail`) that upserts a "visible trail" comment on issues and PRs whenever they're labeled/unlabeled or opened/synchronized. The script (`.github/scripts/squad-visible-trail.cjs`) maintains a summary comment showing current squad label, assigned member, and status.

**Problem it solves:**  
Issues and PRs can accumulate many automated comments, making it hard to see current state at a glance. The visible trail creates a single pinned summary that updates in-place, showing current assignment and status without comment spam.

**Belongs in Squad?** ✅ Yes — this is a generic UX improvement for any Squad project.

**Target files:**  
- New `packages/squad-cli/templates/workflows/squad-visible-trail.yml`
- New `packages/squad-cli/templates/scripts/squad-visible-trail.cjs` (or `.github/scripts/`)

**Priority:** MEDIUM  
**Effort:** medium

---

### 9. New Workflow: `squad-project-sync.yml` — Configurable Project Board Sync

**What kickstart changed:**  
Introduced a standalone `squad-project-sync.yml` workflow that adds squad-labeled issues and PRs to a GitHub Projects v2 board using a `SQUAD_PROJECT_NUMBER` **repo variable** (not hardcoded). Falls back gracefully if the variable isn't set. Supports `COPILOT_ASSIGN_TOKEN` for cross-repo project access.

**Problem it solves:**  
The project board sync in heartbeat/triage was hardcoded and removed in v0.9.1. This re-introduces it in a decoupled, configurable way — install it, set one repo variable, and your issues auto-populate the board.

**Belongs in Squad?** ✅ Yes. This is the cleaner solution for project board integration, and resolves the hardcoded-`3` issue flagged in #6 above.

**Target file:** New `packages/squad-cli/templates/workflows/squad-project-sync.yml`

**Priority:** MEDIUM  
**Effort:** small

---

### 10. New Workflow: `squad-shipping-forecast.yml` — Milestone Velocity Forecasting

**What kickstart changed:**  
Introduced a weekly workflow that reads `.squad/velocity.md` (the existing velocity report output) and `estimate:*` labels on open issues, then computes P10/median/P90 shipping dates for each open milestone. Posts a forecast comment on a rolling issue.

**Problem it solves:**  
Teams have velocity data in `velocity.md` but no automatic connection to milestone delivery dates. This closes the loop from "how fast are we going" to "when will this milestone ship."

**Belongs in Squad?** ✅ Yes — Squad already ships the velocity report workflow. This is a natural downstream consumer of it.

**Target file:** New `packages/squad-cli/templates/workflows/squad-shipping-forecast.yml`

**Priority:** MEDIUM  
**Effort:** medium

---

### 11. New Template: `ralph-circuit-breaker.md`

**What kickstart changed:**  
Added a detailed reference document describing a classic three-state circuit breaker (CLOSED → OPEN → HALF-OPEN) for Copilot model rate limits. When the preferred model (e.g. `claude-sonnet-4.6`) hits quota, Ralph degrades gracefully through free-tier models (`gpt-5.4-mini`, `gpt-5-mini`, `gpt-4.1`) and self-heals after a cooldown. Includes a `.squad/ralph-circuit-breaker.json` state file format and implementation TypeScript.

**Problem it solves:**  
Multiple Ralphs running simultaneously across projects burn the preferred model's quota simultaneously, causing cascading failures. The circuit breaker prevents this by making degradation explicit and automatic.

**Belongs in Squad?** ✅ Yes — this is a generic reliability pattern for any multi-project Squad deployment. Squad already ships `ralph-reference.md`; circuit breaker is a companion doc.

**Target file:** New `packages/squad-cli/templates/ralph-circuit-breaker.md`

**Priority:** MEDIUM  
**Effort:** small (just a template doc, no code)

---

### 12. New Template: `machine-capabilities.md`

**What kickstart changed:**  
Introduced a `machine-capabilities.md` reference doc that describes a `~/.squad/machine-capabilities.json` manifest allowing Ralph to skip issues that require capabilities (browser, GPU, Docker, etc.) the current machine doesn't have. Uses `needs:*` label routing.

**Problem it solves:**  
When running Squad across multiple machines (laptop, DevBox, GPU server), an issue requiring browser automation shouldn't be picked up by a headless server. This enables capability-based routing without code changes.

**Belongs in Squad?** ✅ Yes — generic enough for any multi-machine Squad deployment. Low implementation cost (just labels + a JSON manifest).

**Target file:** New `packages/squad-cli/templates/machine-capabilities.md`

**Priority:** LOW  
**Effort:** small (template doc only)

---

### 13. New Template: `cooperative-rate-limiting.md`

**What kickstart changed:**  
A detailed 6-pattern architecture reference for coordinating GitHub API quota across multiple Ralph instances: Traffic Light (RAAS), Cooperative Token Pool (CMARP), Predictive Circuit Breaker (PCB), Priority Retry Windows (PWJG), Resource Epoch Tracker (RET), and Cascade Dependency Detector (CDD). Includes TypeScript implementations and Kubernetes/KEDA integration notes.

**Problem it solves:**  
The circuit breaker handles single-instance rate limiting. Cooperative rate limiting handles the multi-instance/multi-project case where multiple Ralphs compete for the same API quota.

**Belongs in Squad?** ✅ Yes — the patterns are valuable reference material for power users. This is an advanced companion to `ralph-circuit-breaker.md`.

**Target file:** New `packages/squad-cli/templates/cooperative-rate-limiting.md`

**Priority:** LOW  
**Effort:** small (template doc only)

---

### 14. New Template: `loop.md`

**What kickstart changed:**  
Added a `loop.md` template with YAML frontmatter (`configured`, `interval`, `timeout`) for the `squad loop` command. It documents how to configure what the loop does each cycle, with optional monitoring and personality sections.

**Problem it solves:**  
New Squad users have no scaffold or documentation for configuring the loop feature.

**Belongs in Squad?** ✅ Yes — if `squad loop` is a shipped command, this template should ship with it.

**Target file:** New `packages/squad-cli/templates/loop.md`

**Priority:** LOW  
**Effort:** small

---

## Anti-List: Do NOT Port

| Item | Reason |
|------|--------|
| `keda-scaler.md` | AKS/KEDA-specific infrastructure; not a generic Squad pattern |
| `squad-release-cadence.yml` (kickstart version) | Kickstart's release cadence uses `main` as pre-prod; Squad has a separate three-branch model and its own release cadence |
| `squad-release.yml`, `squad-promote.yml`, `squad-preview.yml`, `squad-insider-release.yml` | Kickstart's CI/CD deployment pipeline is specific to its SWA/Bicep/Azure architecture |
| `.github/prompts/add-component.prompt.md` | Kickstart-specific UI component scaffolding prompt |
| Futurama team names (Leela, Fry, Bender, Hermes, Zapp, Nibbler) | Kickstart's cast; Squad's templates use generic `{Name}` placeholders |
| Architecture references in ceremonies.md DP structure (`v2-implementation-brief.md`, pack boundaries, harness contract) | These ceremony DP fields are kickstart-specific; Squad's ceremonies.md already has its own DP structure (confirmed identical template) |
| Hardcoded `projectNumber = 3` in triage and heartbeat | Kickstart-specific board number; Squad should use `SQUAD_PROJECT_NUMBER` variable (covered in #6 and #9) |
| `schedule.json` | Kickstart's loop schedule; project-specific |
| `squad-ci.yml` (kickstart version) | Kickstart's own CI pipeline; not a Squad template |

---

## Recommended Execution Order

The changes form a dependency graph. Recommended order:

### Phase 1 — Behavioral foundations (unblock everything else)
1. **#1 — Worktree mandate in `copilot-instructions.md`** (CRITICAL, small): The most impactful single change. All subsequent multi-agent work assumes this.
2. **#2 — PR Review Feedback Loop in `copilot-instructions.md`** (CRITICAL, small): Pairs with #1 to close the agent quality loop.

### Phase 2 — CI enforcement layer (these require Phase 1 to be meaningful)
3. **#3 — `squad-review-gate.yml`** (HIGH, medium): Needed before `squad-auto-merge.yml` can use trusted signals.
4. **#4 — `squad-auto-merge.yml`** (HIGH, medium): Depends on review gate existing. Also needs decision on label names (`leela:approved` → generic `squad:lead-approved`?).

### Phase 3 — Workflow upgrades (independent, can parallelize)
5. **#6 — `squad-triage.yml` upgrades** (HIGH, small): Actions version bumps + project board step.
6. **#7 — `squad-label-enforce.yml` `estimate:` namespace** (MEDIUM, small): Trivial additive change.
7. **#9 — `squad-project-sync.yml`** (MEDIUM, small): Standalone, no deps.

### Phase 4 — Template enrichment
8. **#5 — `issue-lifecycle.md` token operations** (HIGH, medium): Can happen in parallel with Phase 3. Needs Squad's app token mechanism confirmed.
9. **#8 — `squad-visible-trail.yml` + script** (MEDIUM, medium): Standalone.
10. **#10 — `squad-shipping-forecast.yml`** (MEDIUM, medium): Requires velocity.md workflow to already be shipping (it is).
11. **#11 — `ralph-circuit-breaker.md`** (MEDIUM, small): Doc-only, any time.

### Phase 5 — Advanced reference docs (low urgency)
12. **#12 — `machine-capabilities.md`** (LOW, small)
13. **#13 — `cooperative-rate-limiting.md`** (LOW, small)
14. **#14 — `loop.md`** (LOW, small): Ship when `squad loop` is confirmed stable.

---

## Open Questions for Ahmed

1. **Approval label names:** Kickstart uses role-specific labels (`leela:approved`, `zapp:approved`). Should Squad's templates use generic names (`squad:lead-approved`, `squad:security-approved`) with documentation on how to rename for your team's cast? Or should the labels be configurable via repo variables?

2. **`resolve-token.mjs` in templates:** The bot-identity / fail-closed token pattern in `issue-lifecycle.md` references `.squad/scripts/resolve-token.mjs`. This script exists in kickstart's `.squad/scripts/` but may need Squad install/upgrade to stamp it. Is this script ready to be a first-class shipped template?

3. **`squad:chore-auto` label:** The auto-merge workflow introduces a new opt-in label for low-risk PRs. Should this be added to the `sync-squad-labels.yml` label sync list in Squad?

4. **`squad-visible-trail.cjs`:** This script lives in `.github/scripts/` in kickstart. Squad templates currently don't ship files into `.github/scripts/`. Should Squad add a `scripts/` directory to its template stamping? Or should the script be inlined into the workflow?
