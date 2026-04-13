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

## 2026-03-26: CI deletion guard and source tree canary

**By:** Booster (CI/CD)

**What:** Added two safety checks to squad-ci.yml: (1) source tree canary verifying critical files exist, (2) large deletion guard failing PRs that delete >50 files without 'large-deletion-approved' label. Branch protection on dev requested (may need manual setup).

**Why:** Incident #631 — @copilot deleted 361 files on dev with no CI gate catching it.

---

## 2026-03-26: Copilot git safety rules

**By:** RETRO (Security)

**What:** Added mandatory Git Safety section to copilot-instructions.md: prohibits `git add .`, requires feature branches and PRs, adds pre-push checklist, defines red-flag stop conditions.

**Why:** Incident #631 — @copilot used destructive staging on an incomplete working tree, deleting 361 files.

---

## 2026-03-29: Versioning Policy — No Prerelease Versions on dev/main

**By:** Flight (Lead)

**Date:** 2026-03-29

**Requested by:** Dina

**Status:** DECIDED

**Confidence:** Medium (confirmed by PR #640 incident, PR #116 prerelease leak, CI gate implementation)

### Decision

1. **All packages use strict semver** (`MAJOR.MINOR.PATCH`). No prerelease suffixes on `dev` or `main`.
2. **Prerelease versions are ephemeral.** `bump-build.mjs` creates `-build.N` for local testing only — never committed.
3. **SDK and CLI versions must stay in sync.** Divergence silently breaks npm workspace resolution.
4. **Surgeon owns version bumps.** Other agents must not modify `version` fields in `package.json` unless fixing a prerelease leak.
5. **CI enforcement via `prerelease-version-guard`** blocks PRs with prerelease versions. `skip-version-check` label is Surgeon-only.

### Why

The repo had no documented versioning policy. This caused two incidents:

- **PR #640:** Prerelease version `0.9.1-build.4` silently broke workspace resolution. The semver range `>=0.9.0` does not match prerelease versions, causing npm to install a stale registry package instead of the local workspace link. Four PRs (#637–#640) patched symptoms before the root cause was found.
- **PR #116:** Surgeon set versions to `0.9.1-build.1` instead of `0.9.1` on a release branch because there was no guidance on what constitutes a clean release version.

### Skill Reference

Full policy documented in `.squad/skills/versioning-policy/SKILL.md`.

### Impact

- All agents must follow the versioning policy when touching `package.json`
- Surgeon charter should reference this skill for release procedures
- CI pipeline enforces the policy via automated gate

---

## 2026-04-13: REPL removal strategy — extract first

**By:** Brady (via Copilot)

**What:** Brady chose Option 2 (extract first, then delete) for the REPL removal. The 20 mixed test files (~615 tests) that test product behaviors through the shell interface must be rewritten to test against CLI commands or SDK APIs BEFORE the shell code is deleted. This is the hardest path but the most-right path for the future. No test coverage gaps allowed.

**Why:** User decision — the REPL (interactive shell launched by bare `squad` with no args) is being removed. All 28 CLI commands are independent of the shell. The shell is 5,415 lines (27% of CLI), a clean leaf node with ONE import at `cli-entry.ts:104`. Removing it requires:

1. **Phase 1 (this decision):** Extract/rewrite the 615 mixed tests to call SDK/CLI directly instead of through the shell
2. **Phase 2:** Delete `shell/` directory, update `cli-entry.ts`, clean deps (ink, react), delete 5 REPL-only test files
3. **Phase 3:** Replace no-args handler with "use Copilot CLI" message

**Key context for crash recovery:**

- 5 test files (~70 tests) are REPL-only → safe to delete in Phase 2
- 20 test files (~615 tests) are MIXED → must be extracted first (Phase 1)
- 1 test file is INDEPENDENT → keep as-is
- Prior analysis by Flight, EECOM, FIDO, VOX is in decisions.md
- PR #675 (prior attempt) was closed as too broad — this is the surgical replacement

---

## 2026-04-13: Test Extraction Plan for REPL Removal

**By:** FIDO (Quality Owner)

**Date:** 2026-04-13

**Context:** Brady approved "extract first, then delete" strategy for REPL removal. This is the detailed extraction plan for all test files with shell/REPL dependencies.

---

### Methodology

Every `describe`/`it`/`test` block in each affected file was classified as:

- 🔴 **SHELL-ONLY** — Tests shell rendering, Ink components, TUI behavior. DELETE when shell is removed.
- 🟡 **EXTRACT** — Tests product behavior through shell APIs. Must be rewritten against CLI commands or SDK APIs.
- 🟢 **KEEP** — Already tests through CLI/SDK with no shell dependency.

Import analysis was used to distinguish files that test SDK modules directly (`@bradygaster/squad-sdk/*`) from files that test through shell modules (`@bradygaster/squad-cli/shell/*`).

---

### Summary Table

| # | File | Total | 🔴 Delete | 🟡 Extract | 🟢 Keep | Extraction Complexity |
|---|------|-------|-----------|-----------|---------|----------------------|
| 1 | cli-shell-comprehensive.test.ts | 174 | 41 | 133 | 0 | **Hard** — largest file, tests 8 shell modules |
| 2 | repl-ux.test.ts | 126 | 126 | 0 | 0 | **None** — pure delete |
| 3 | repl-dogfood.test.ts | 99 | 27 | 72 | 0 | **Hard** — covers agent lifecycle, routing, commands |
| 4 | repl-ux-fixes.test.ts | 61 | 16 | 45 | 0 | **Moderate** — init, coordinator guards, session gating |
| 5 | repl-streaming.test.ts | 50 | 9 | 41 | 0 | **Hard** — streaming pipeline, delta normalization |
| 6 | human-journeys.test.ts | 47 | 41 | 6 | 0 | **Trivial** — only 6 tests to extract |
| 7 | shell.test.ts | 43 | 25 | 11 | 0 | **Moderate** — SessionRegistry, coordinator parsing |
| 8 | journey-first-conversation.test.ts | 37 | 37 | 0 | 0 | **None** — pure delete |
| 9 | first-run-gating.test.ts | 35 | 9 | 7 | 19 | **Moderate** — first-run marker, /clear, archival |
| 10 | shell-integration.test.ts | 32 | 9 | 23 | 0 | **Hard** — lifecycle startup, parseInput, parseCoordinatorResponse |
| 11 | streaming.test.ts | 32 | 0 | 0 | 32 | **None** — 100% KEEP, already tests SDK |
| 12 | regression-368.test.ts | 30 | 6 | 24 | 0 | **Moderate** — ghost retry, error handling |
| 13 | repl-ux-e2e.test.ts | 29 | 7 | 22 | 0 | **Moderate** — CLI startup, exit codes, branding |
| 14 | journey-error-handling.test.ts | 28 | 28 | 0 | 0 | **None** — pure delete |
| 15 | error-messages.test.ts | 27 | 0 | 27 | 0 | **Moderate** — imports from shell/error-messages |
| 16 | shell-polish.test.ts | 27 | 8 | 19 | 0 | **Moderate** — /history validation, command suggestions, @agent routing |
| 17 | journey-next-day.test.ts | 26 | 3 | 5 | 18 | **Trivial** — session resume, TTL behavior |
| 18 | shell-metrics.test.ts | 23 | 1 | 22 | 0 | **Moderate** — telemetry opt-in, session/error metrics |
| 19 | e2e-shell.test.ts | 23 | 15 | 8 | 0 | **Trivial** — dispatch, /help localization |
| 20 | multiline-paste.test.ts | 23 | 23 | 0 | 0 | **None** — pure delete |
| 21 | e2e-integration.test.ts | 21 | 21 | 0 | 0 | **None** — pure delete (Ink rendering) |
| 22 | journey-power-user.test.ts | 19 | 17 | 2 | 0 | **Trivial** — @mention routing only |
| 23 | journey-specific-agent.test.ts | 23 | 9 | 14 | 0 | **Moderate** — multi-agent @mention extraction |
| 24 | ghost-response.test.ts | 18 | 0 | 15 | 3 | **Moderate** — imports shell/ghost-retry |
| 25 | hostile-integration.test.ts | 18 | 5 | 10 | 3 | **Moderate** — parseInput/executeCommand robustness |
| 26 | journey-waiting-anxious.test.ts | 14 | 13 | 1 | 0 | **Trivial** — cancel recovery only |
| 27 | speed-gates.test.ts | 21 | 10 | 5 | 0 | **Trivial** — performance gates for SDK functions |
| 28 | layout-anchoring.test.ts | 9 | 9 | 0 | 0 | **None** — pure delete |
| 29 | table-header-styling.test.ts | 7 | 7 | 0 | 0 | **None** — pure delete |
| 30 | cli-p0-regressions.test.ts | 11 | 11 | 0 | 0 | **None** — pure delete |
| — | **TOTALS** | **1,193** | **578** | **540** | **75** | — |

### Percentage Breakdown

- 🔴 DELETE: **578 tests (48%)** — delete with shell removal
- 🟡 EXTRACT: **540 tests (45%)** — must rewrite before deletion
- 🟢 KEEP: **75 tests (6%)** — no changes needed

---

### Files Already Safe (🟢 KEEP — No Shell Dependency)

These files were caught by the grep but actually import from `@bradygaster/squad-sdk/*` directly:

| File | Tests | Import Source | Status |
|------|-------|--------------|--------|
| hooks.test.ts | 51 | `@bradygaster/squad-sdk/hooks` | ✅ KEEP |
| hooks-security.test.ts | 50 | `@bradygaster/squad-sdk/hooks` | ✅ KEEP |
| feature-parity.test.ts | 61 | `@bradygaster/squad-sdk/*` (casting, config, tools, hooks, event-bus) | ✅ KEEP |
| feature-audit.test.ts | 26 | `@bradygaster/squad-sdk/config` | ✅ KEEP |
| integration.test.ts | 62 | `@bradygaster/squad-sdk/*` (tools, agents, client, event-bus) | ✅ KEEP |
| session-traces.test.ts | 23 | `@bradygaster/squad-sdk/client`, `squad-sdk/runtime/*` | ✅ KEEP |
| remote-control.test.ts | 81 | `@bradygaster/squad-sdk` (RemoteBridge, protocol) | ✅ KEEP |
| streaming.test.ts | 32 | `@bradygaster/squad-sdk/runtime/streaming` | ✅ KEEP |

These **386 tests** are already shell-free. No action required.

---

### P0 Behaviors — Product Logic ONLY Tested Through Shell

These are the must-extract items. If we delete the shell without extracting these, we lose all coverage for critical product behavior.

#### P0-1: Input Routing (`parseInput`)

- **Files:** cli-shell-comprehensive (17 tests), shell-integration (10 tests), shell-polish (5 tests), hostile-integration (5 tests), repl-dogfood (8 tests)
- **What:** @-mention routing, coordinator fallback, slash command detection, case-insensitive matching, unknown agent handling, comma syntax, multi-agent mention extraction
- **Target:** SDK function `parseInput()` — move to `@bradygaster/squad-sdk/runtime/router`
- **Complexity:** Moderate — function is pure logic, easy to test in isolation

#### P0-2: Coordinator Response Parsing (`parseCoordinatorResponse`)

- **Files:** cli-shell-comprehensive (25 tests), shell-integration (7 tests), repl-streaming (6 tests)
- **What:** DIRECT/ROUTE/MULTI format parsing, fallback for unknown formats, empty content handling, CONTEXT extraction
- **Target:** SDK function `parseCoordinatorResponse()` — move to `@bradygaster/squad-sdk/runtime/coordinator`
- **Complexity:** Moderate — pure string parsing

#### P0-3: Ghost Response Retry (`withGhostRetry`)

- **Files:** ghost-response (15 tests), regression-368 (6 tests), speed-gates (3 tests)
- **What:** Empty response detection, exponential backoff (1s/2s/4s), retry exhaustion, callback lifecycle, fallback content
- **Target:** SDK function `withGhostRetry()` — move to `@bradygaster/squad-sdk/runtime/ghost-retry`
- **Complexity:** Moderate — async retry logic with timers

#### P0-4: Shell Lifecycle / Agent Discovery (`ShellLifecycle`)

- **Files:** cli-shell-comprehensive (6 tests), shell-integration (7 tests), shell.test.ts (4 tests)
- **What:** Agent discovery from team.md, session registry, lifecycle state machine (initializing→ready→error), shutdown cleanup, .squad/ directory validation
- **Target:** SDK function — extract lifecycle/discovery to `@bradygaster/squad-sdk/runtime/lifecycle`
- **Complexity:** Hard — filesystem interactions + state machine

#### P0-5: Command Execution (`executeCommand`)

- **Files:** cli-shell-comprehensive (27 tests), repl-dogfood (12 tests), hostile-integration (3 tests)
- **What:** /help, /status, /agents, /exit, /history, /sessions, /resume, /clear, /nap, /version behavior
- **Target:** SDK/CLI command handlers — move to `@bradygaster/squad-sdk/runtime/commands`
- **Complexity:** Hard — diverse commands, each with distinct behavior

#### P0-6: Session Store (`SessionRegistry` + persistence)

- **Files:** cli-shell-comprehensive (10 tests), shell.test.ts (9 tests), session-store.test.ts (21 tests), journey-next-day (5 tests)
- **What:** Session CRUD, TTL enforcement (24h), session resume by ID, message history preservation, file persistence
- **Target:** Partially covered by `session-traces.test.ts` (SDK). Session-store.test.ts imports from `squad-cli/shell/session-store` — needs module relocation
- **Complexity:** Moderate — file I/O + data structures

#### P0-7: Memory Management (`MemoryManager`)

- **Files:** cli-shell-comprehensive (13 tests), first-run-gating (1 test)
- **What:** Buffer size limits, message archival, key stability, MAX_BUFFER_SIZE truncation
- **Target:** SDK function — move to `@bradygaster/squad-sdk/runtime/memory`
- **Complexity:** Moderate — buffer management

#### P0-8: First-Run Detection

- **Files:** first-run-gating (3 tests), repl-dogfood (2 tests), repl-ux-fixes (2 tests)
- **What:** `.first-run` marker detection, marker consumption (one-time), session restore skip during first-run
- **Target:** SDK function — `@bradygaster/squad-sdk/runtime/lifecycle`
- **Complexity:** Trivial — file existence check + delete

#### P0-9: Streaming Pipeline (Shell Bridge)

- **Files:** repl-streaming (41 tests), shell.test.ts (7 tests), shell-polish (2 tests)
- **What:** Delta field priority, event normalization, buffer accumulation, usage tracking, session status during streaming
- **Target:** SDK `StreamingPipeline` already exists in `@bradygaster/squad-sdk/runtime/streaming`. The shell `StreamBridge` adds UI-specific buffering. Extract the delta normalization logic.
- **Complexity:** Hard — async event streams, multiple delta formats

#### P0-10: Shell Metrics / Telemetry

- **Files:** shell-metrics.test.ts (22 tests)
- **What:** Telemetry opt-in gate (SQUAD_TELEMETRY env), session count, session duration histogram, agent response latency, error rate counter
- **Target:** Move metrics functions to `@bradygaster/squad-sdk/runtime/otel-metrics` (already has `recordTimeToFirstToken` etc.)
- **Complexity:** Moderate — OTel instrumentation

#### P0-11: Error Guidance Messages

- **Files:** error-messages.test.ts (27 tests)
- **What:** Recovery guidance for SDK disconnect, team config, agent session failures, rate limits, retry-after parsing
- **Target:** Move `error-messages.ts` from `squad-cli/shell/` to `@bradygaster/squad-sdk/runtime/`
- **Complexity:** Trivial — pure functions, no dependencies

---

### Extraction Batches

Grouped by dependency order and logical coherence. Each batch is one commit/PR.

#### Batch 1: Pure Functions — No Dependencies (Trivial)

**~65 tests, 1-2 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| Error guidance messages | 27 | `shell/error-messages.ts` | `squad-sdk/runtime/error-messages.ts` |
| `parseCoordinatorResponse()` | 38 | `shell/coordinator.ts` | `squad-sdk/runtime/coordinator.ts` |

These are pure string-parsing functions with zero dependencies. Copy the function, copy the tests, update imports.

#### Batch 2: Input Routing (Moderate)

**~45 tests, 2-3 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| `parseInput()` | 35 | `shell/router.ts` | `squad-sdk/runtime/router.ts` |
| Multi-agent @mention extraction | 10 | `shell/router.ts` | `squad-sdk/runtime/router.ts` |

Depends on agent roster for @-mention matching. Need to define a clean interface for agent name lookup.

#### Batch 3: Ghost Retry + First-Run (Moderate)

**~30 tests, 2 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| `withGhostRetry()` | 24 | `shell/ghost-retry.ts` | `squad-sdk/runtime/ghost-retry.ts` |
| First-run marker detection | 7 | `shell/lifecycle.ts` | `squad-sdk/runtime/lifecycle.ts` |

Ghost retry is self-contained async logic. First-run detection is a simple file check.

#### Batch 4: Session Store (Moderate)

**~45 tests, 3-4 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| `SessionRegistry` | 19 | `shell/sessions.ts` | `squad-sdk/runtime/sessions.ts` |
| Session persistence (CRUD) | 21 | `shell/session-store.ts` | `squad-sdk/runtime/session-store.ts` |
| Session resume + TTL | 5 | journey-next-day | merged into session-store tests |

Session store depends on filesystem and types. Need to move `ShellMessage` type to SDK.

#### Batch 5: Command Execution + Memory (Hard)

**~43 tests, 4-6 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| `executeCommand()` | 30 | `shell/commands.ts` | `squad-sdk/runtime/commands.ts` |
| `MemoryManager` | 13 | `shell/memory.ts` | `squad-sdk/runtime/memory.ts` |

Commands depend on SessionRegistry, agent roster, and message history. This is the hardest batch because commands interact with multiple subsystems.

#### Batch 6: Lifecycle + Agent Discovery (Hard)

**~17 tests, 3-4 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| `ShellLifecycle` state machine | 10 | `shell/lifecycle.ts` | `squad-sdk/runtime/lifecycle.ts` |
| Agent discovery from team.md | 7 | `shell/lifecycle.ts` | `squad-sdk/runtime/lifecycle.ts` |

Lifecycle depends on filesystem (team.md, .squad/ directory), SessionRegistry, and agent charter loading. Needs clean separation from Ink rendering.

#### Batch 7: Streaming + Metrics (Hard)

**~72 tests, 4-6 hours**

| Extract | Tests | From | To |
|---------|-------|------|----|
| StreamBridge delta normalization | 50 | `shell/stream-bridge.ts` | `squad-sdk/runtime/streaming.ts` |
| Shell metrics functions | 22 | `shell/shell-metrics.ts` | `squad-sdk/runtime/otel-metrics.ts` |

Streaming logic partially duplicates SDK's `StreamingPipeline`. Merge the delta normalization into the existing SDK module. Metrics need OTel provider setup.

#### Batch 8: Hostile/Adversarial Tests (Moderate)

**~10 tests, 1 hour**

| Extract | Tests | From | To |
|---------|-------|------|----|
| Hostile input parsing | 5 | hostile-integration | sdk-hostile-inputs.test.ts |
| Hostile command execution | 3 | hostile-integration | merged into command tests |
| Cancel recovery | 2 | journey-waiting-anxious + journey-power-user | merged into lifecycle tests |

These are adversarial edge cases that should be added to the SDK test suites from Batches 2 and 5.

#### Batch 9: Performance Gates (Trivial)

**~5 tests, 30 minutes**

| Extract | Tests | From | To |
|---------|-------|------|----|
| SDK function speed gates | 5 | speed-gates.test.ts | sdk-speed-gates.test.ts |

Move the `parseInput()`, `loadWelcomeData()`, and `withGhostRetry()` performance assertions to new SDK-level speed gate tests.

#### Batch 10: Pure Delete — Shell-Only Files

**~578 tests, 0 extraction effort**

After all extractions are complete, delete these files entirely:

| File | Tests | Reason |
|------|-------|--------|
| repl-ux.test.ts | 126 | Pure Ink component rendering |
| journey-first-conversation.test.ts | 37 | Shell welcome/input UX flow |
| journey-error-handling.test.ts | 28 | Error message display tests |
| multiline-paste.test.ts | 23 | Multiline input rendering |
| e2e-integration.test.ts | 21 | Ink rendering round-trips |
| journey-waiting-anxious.test.ts | 13 | Thinking indicator UX |
| journey-power-user.test.ts | 17 | Tab completion / command output |
| cli-p0-regressions.test.ts | 11 | CLI output format validation |
| layout-anchoring.test.ts | 9 | Viewport anchoring |
| table-header-styling.test.ts | 7 | Markdown table rendering |
| *Shell-only portions of mixed files* | ~286 | Remaining 🔴 blocks in mixed files |

---

### Extraction Order Rationale

1. **Batches 1-3 first** (pure functions, no cross-dependencies) — builds confidence, validates the pattern
2. **Batch 4** (session store) — unlocks Batch 5 (commands depend on sessions)
3. **Batch 5-6** (commands + lifecycle) — the hardest work, but most of the dependencies are resolved by now
4. **Batch 7** (streaming + metrics) — can run in parallel with 5-6, no dependencies
5. **Batches 8-9** (adversarial + perf) — cleanup, adds to existing SDK tests
6. **Batch 10** (delete) — only after all extractions verified green

---

### Risks and Mitigations

1. **Shell module coupling:** Some shell modules import from each other (lifecycle→sessions→registry). Extraction order matters — follow the batch sequence.
2. **Type leakage:** `ShellMessage`, `SessionData`, `ParsedInput` types live in `shell/types.ts`. Must be moved to SDK types first.
3. **Test fixture dependency:** Many tests use `test-fixtures/.squad/` directory. Verify fixtures work with SDK test paths.
4. **CI regression:** Run full test suite after each batch. Gate: no test count regression until Batch 10 (delete).
5. **Ink testing library removal:** After Batch 10, `ink-testing-library` and `react` can be removed from devDependencies. Verify no other tests need them.

---

### Quality Gates

- [ ] Each batch PR must pass `npm run build && npm test`
- [ ] Test count after extraction ≥ test count before (no silent drops)
- [ ] P0 behaviors must have ≥1 SDK-level test before any shell test is deleted
- [ ] FIDO reviews every batch PR for coverage completeness
- [ ] Final delete batch (10) must be a separate PR with explicit sign-off

---

### Estimated Total Effort

| Category | Tests | Effort |
|----------|-------|--------|
| Extract + rewrite | 540 | ~20-25 hours |
| Pure delete | 578 | ~1 hour |
| Already safe (no action) | 75 | 0 |
| **Total** | **1,193** | **~22-26 hours** |

Recommend splitting across 2-3 team members over 3-4 working sessions.

