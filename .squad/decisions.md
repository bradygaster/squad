# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

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

The routing constraint is expressed exclusively in CLI terms. The CRITICAL RULE references 	ask tool only. When the coordinator reads this in VS Code, where the tool is unSubagent, it doesn't reliably make the substitution. It falls through to Platform Detection's Fallback mode: 'work inline.' This enforcement language creates a logical gap.

#### 2. 🟡 Prompt Saturation (AMPLIFYING)

The coordinator prompt is 950 lines / ~80KB. The routing constraint is buried at line 1010 under irrelevant sections (Init Mode, ceremonies, Ralph work monitor, worktree lifecycle). The core dispatch loop accounts for ~200 lines, competing for attention with ~750 lines of governance and reference material.

#### 3. 🟡 Template Duplication (AMPLIFYING)

CLI 1.0.11 discovers all \*.agent.md\ files from cwd to git root. Squad has 5 copies: .squad-templates, templates/, packages/squad-cli/templates, packages/squad-sdk/templates, and .github/agents/. Only .github/agents/ should be discoverable. CLI 1.0.11 merges ALL of them, multiplying the coordinator instructions by 5x and diluting the routing constraint.

### Proposed Fixes

**Fix 1: Platform-Neutral Enforcement Language (P0)**
- Rewrite CRITICAL RULE to be platform-neutral: 'You are a DISPATCHER, not a DOER. Every task that needs domain expertise MUST be dispatched to a specialist agent.'
- List dispatch mechanisms: CLI (\	ask\ tool), VS Code (\unSubagent\ tool), or fallback (work inline)
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
- Make clear: if \unSubagent\ is available, it MUST be used for domain work

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
3. Verify: coordinator dispatches via \unSubagent\ instead of working inline
4. Verify: coordinator cites the routing rule when dispatching

FIDO should own the test scenario. GUIDO should validate the VS Code runtime behavior.

### Open Questions

1. Does CLI 1.0.11 support exclusion patterns (.copilotignore)? If yes, Fix 4 becomes simpler.
2. Should we version-gate the VS Code adaptations (detect CLI version)?
3. Is \unSubagent\ still the correct tool name, or has it changed?
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

### 2026-03-26: CI deletion guard and source tree canary
**By:** Booster (CI/CD)
**What:** Added two safety checks to squad-ci.yml: (1) source tree canary verifying critical files exist, (2) large deletion guard failing PRs that delete >50 files without 'large-deletion-approved' label. Branch protection on dev requested (may need manual setup).
**Why:** Incident #631 — @copilot deleted 361 files on dev with no CI gate catching it.

---

### 2026-03-26: Copilot git safety rules
**By:** RETRO (Security)
**What:** Added mandatory Git Safety section to copilot-instructions.md: prohibits `git add .`, requires feature branches and PRs, adds pre-push checklist, defines red-flag stop conditions.
**Why:** Incident #631 — @copilot used destructive staging on an incomplete working tree, deleting 361 files.

---

### 2026-03-29: Versioning Policy — No Prerelease Versions on dev/main
**By:** Flight (Lead)
**Date:** 2026-03-29
**Requested by:** Dina
**Status:** DECIDED
**Confidence:** Medium (confirmed by PR #640 incident, PR #116 prerelease leak, CI gate implementation)

## Decision

1. **All packages use strict semver** (`MAJOR.MINOR.PATCH`). No prerelease suffixes on `dev` or `main`.
2. **Prerelease versions are ephemeral.** `bump-build.mjs` creates `-build.N` for local testing only — never committed.
3. **SDK and CLI versions must stay in sync.** Divergence silently breaks npm workspace resolution.
4. **Surgeon owns version bumps.** Other agents must not modify `version` fields in `package.json` unless fixing a prerelease leak.
5. **CI enforcement via `prerelease-version-guard`** blocks PRs with prerelease versions. `skip-version-check` label is Surgeon-only.

## Why

The repo had no documented versioning policy. This caused two incidents:

- **PR #640:** Prerelease version `0.9.1-build.4` silently broke workspace resolution. The semver range `>=0.9.0` does not match prerelease versions, causing npm to install a stale registry package instead of the local workspace link. Four PRs (#637–#640) patched symptoms before the root cause was found.
- **PR #116:** Surgeon set versions to `0.9.1-build.1` instead of `0.9.1` on a release branch because there was no guidance on what constitutes a clean release version.

## Skill Reference

Full policy documented in `.squad/skills/versioning-policy/SKILL.md`.

## Impact

- All agents must follow the versioning policy when touching `package.json`
- Surgeon charter should reference this skill for release procedures
- CI pipeline enforces the policy via automated gate

---

### 2026-04-13: User directive — PR body link to GitHub App
**By:** Ahmed Sabbour (via Copilot)
**What:** PR body should link to the GitHub App that created it
**Why:** User request — captured for team memory

---

### 2026-04-13: Identity parallel bug — three fixes from live testing
**By:** Ahmed Sabbour (via Copilot)
**What:**
1. gh pr create with bot token needs --repo {owner}/{repo} — without it gh tries to fork
2. GitHub App manifest needs checks: read and actions: read permissions — bots cannot see CI results without them
3. Parallel token scoping: chained TOKEN assignments lose values in backgrounded subshells. Use newline-separated statements instead.
**Why:** Discovered during live E2E testing on sabbour/kickstart PR #140. Single-token spawn template is safe; multi-token batch operations are affected.

---

