# Procedures history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/procedures/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- Preserved 231 original line(s) in the archive.
- Detected 16 heading(s) and 19 dated reference line(s).
- This file now keeps a compact index plus the most recent tail so active context remains visible.

## Notable retained signals

- **#485 (Agent Specification PRD)** → squad:flight + squad:procedures (architecture decision + formal spec structure)
- Pattern: Agent specification gap identified. Procedures owns formal spec structure and documentation; Flight owns architecture decisions.
- 📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Model Catalog Merge):** Procedures executed Round 2 PR merge action: rebased PR #619 (model catalog refresh, issue #588) onto dev branch from main, resolved 3 merge conflicts, and successfully merged. Model catalog now current: default model bumped to `claude-sonnet-4.6` (latest standard-tier Claude), specialist bumped to `gpt-5.3-codex` (latest code-writing specialist), fallback chains restructured to include new models (`gpt-5.4`, `gpt-5.4-mini`) and removed dead models (`claude-opus-4.6-fast`). All 6 original merge-plan PRs (#620, #627, #624, #611, #617, #619) now ✅ complete. Dev branch green (5,038 tests). Decision inbox merged to decisions.md and deleted. Next: Ready for follow-on feature PRs.
- 📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. Procedures owns Agent Specification PRD structure (#485). Architecture decisions from Flight. Coordinate on formal spec format and standard structure for future agent definitions.
- **Deterministic skill pattern (2026-03-10):** Skills must have explicit SCOPE (what they produce/don't) and AGENT WORKFLOW (deterministic steps with STOP condition). Same input → same output, every time.
- **Three governance policies (2026-03-15):** Agent Error Lockout (2 errors → reassign), Product Isolation Rule (tests/CI/code never depend on squad names), Peer Quality Check (run tests before finishing). Applied to all 19 charters.
- **Team-wide reskill (2026-03-16):** 17.4% size reduction — NEVER/ALWAYS sections compress to single-paragraph summaries; essential workflow details stay verbose.
- **Personal squad governance (2026-03-22):** `CONSULT_MODE: true` as spawn signal. Governance changes go to `decisions/inbox/` for Flight review — don't edit squad.agent.md directly.
- **VS Code routing investigation (2026-03-25):** CLI-centric enforcement language causes coordinator to work inline in VS Code. Fix: platform-neutral dispatch language + reinforcement at prompt bottom.
- **VS Code routing fix (2026-07):** Fix 1 + Fix 2 shipped. CRITICAL RULE rewritten to dispatcher-identity framing ("DISPATCHER, not a DOER") with dispatch mechanism table. Routing Enforcement Reminder added as final section. Remaining P1 fixes (template renaming, prompt slimming) deferred.
- **PR #619 rebase (2026-07):** When a PR has accumulated dev merge commits, use `git rebase --onto dev <parent-of-first-PR-commit>` to cherry-pick only relevant commits.
- **Trim copilot-instructions.md (#999, 2026-04-17):** 1300w/9KB → 397w/3KB. Extracted Protected Files to skill, consolidated Git Safety, removed duplication. Pattern: main instructions = routing/workflow; skills = domain-specific reference (lazy-loaded on demand).
- 📌 **Team update (2026-03-22T09-35Z — Wave 1):** Economy mode governance proposal and personal squad consult-mode governance proposal authored for squad.agent.md — both DRAFT, awaiting Flight review before merging. Economy mode adds Layer 3 table + spawn convention (`💰 economy`) + model catalog audit. Personal squad adds consult mode detection, path reference table, spawn guidance. Persistent model preference (Layer 0) documented. Proposed new skill: `.squad/skills/consult-mode/SKILL.md` (post-approval). Deterministic skill pattern proven effective. PR #503 open with skills module. Next: Flight review → merge governance to squad.agent.md. No blocking issues.
- **Problem:** Skills were too loose. The distributed-mesh skill was tested in a real project (mesh-demo), and agents generated 76 lines of validator code, 5 test files with 43 tests, regenerated sync scripts that should have been copied from templates, and left decision files empty. The skill document let agents interpret intent instead of following explicit steps.
- ❌ THIS SKILL DOES NOT PRODUCE — explicit negative list to prevent scope creep
- 2. **AGENT WORKFLOW section** — Step-by-step deterministic instructions
- WRITE: exactly which decision entry to write, with template
- STOP: explicit stopping condition, with negative list of what NOT to do
- Phase descriptions → note that phases are project-level decisions, not auto-advanced
- 4. **Decision template** — inline markdown showing exactly what to write
- 5. **Anti-patterns for code generation** — explicit list of things NOT to build
- **Pattern for other skills:** All skills should have SCOPE (what it produces, what it doesn't) and AGENT WORKFLOW (deterministic steps with STOP condition). Same input → same output, every time. Zero ambiguity.
- 📌 Team update (2026-03-14T22-01-14Z): Distributed mesh integrated with deterministic skill pattern — decided by Procedures, PAO, Flight, Network
- 2. **Update SKILL.md workflow:**

## Recent preserved tail

- Scribe spawn template (hardcoded `name: "scribe"`)

Also updated: examples section (showing `name` + `description` pairs), anti-pattern #4 (now covers both `name` and `description`), and Constraints section (requiring `name` on every spawn).

**Pattern:** Every `task` tool spawn MUST include `name` set to the agent's lowercase cast name. Without it, the platform defaults to generic slugs. The `description` parameter is for the human-readable summary; `name` is for the agent ID.

📌 **Team update (2026-03-23T23:15Z):** Orchestration complete. Agent name display refactor shipped: spawn templates updated with mandatory `name` parameter across all 4 template variants. VOX and FIDO coordinated on parser extraction and cascading pattern strategies. All decisions merged to decisions.md. Canonical source: `.squad-templates/squad.agent.md` (all derived copies secondary).

📌 **Team update (2026-03-25T18:11Z):** Model catalog updated to current platform offerings — removed 2 stale models (claude-opus-4.6-fast, gpt-5), added 5 new models (claude-sonnet-4.6, claude-opus-4.6-1m, gpt-5.4, gpt-5.3-codex, gpt-5.4-mini), bumped defaults (code: claude-sonnet-4.6, specialist: gpt-5.3-codex), restructured fallbacks. All 5 squad.agent.md template copies synchronized. Merged in #588.

### 2025-07: Model catalog refresh (#588)

**Problem:** The valid models catalog, fallback chains, role-to-model mappings, and default model references in `squad.agent.md` were stale — missing `claude-sonnet-4.6`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, `claude-opus-4.6-1m` and still referencing removed models `claude-opus-4.6-fast` and standalone `gpt-5`.

**Fix:** Full catalog refresh across all model-referencing sections:
- Catalog: added 5 new models, removed 2 stale ones
- Defaults: code-writing tasks bumped to `claude-sonnet-4.6` (newest standard); code specialist bumped to `gpt-5.3-codex`
- Fallback chains: restructured with new models in sensible positions (e.g., `gpt-5.4-mini` in fast tier, `gpt-5.4` in standard)
- All 5 copies synced via `sync-templates.mjs`

**Pattern:** Model catalogs drift. When the platform adds/removes models, every section referencing models needs updating — not just the catalog list. Search for all model name strings before considering the refresh complete.
### 2026-03-25: VS Code routing enforcement investigation (#613)

**Problem:** In VS Code, the coordinator reads routing rules but doesn't enforce them — continues working inline instead of dispatching via `runSubagent`. Andreas (andikrueger) reproduced and the agent itself admitted it violated the rules.

**Root cause (dominant):** CLI-centric enforcement language. The CRITICAL RULE says "MUST use the `task` tool" — but in VS Code the dispatch tool is `runSubagent`. When `task` isn't available, the coordinator falls through Platform Detection's "Fallback mode" (work inline) instead of using `runSubagent`. The VS Code adaptations section is buried 360 lines below the CRITICAL RULE and reads as optional, not mandatory.

**Amplifying factors:**
1. Prompt saturation: 950 lines / 80KB. Routing constraint competes with 900+ lines of governance, lifecycle, and reference material. Core dispatch loop is ~200 lines; rest is noise.
2. Template duplication: CLI 1.0.11 discovers all `*.agent.md` from cwd to git root. Squad has 5 copies — only `.github/agents/squad.agent.md` should be discoverable.

**Proposed fixes (5 total, prioritized):**
- P0: Rewrite enforcement language to be platform-neutral ("dispatch tool" not "`task` tool")
- P0: Add routing reinforcement at bottom of prompt (LLMs weight start/end more than middle)
- P1: Rename template copies to `.agent.md.template` to prevent CLI discovery
- P1: Extract ~350 lines to lazy-loaded reference files (worktree, Ralph, casting, MCP)
- P1: Move VS Code dispatch block immediately after CRITICAL RULE

**Key pattern learned:** Enforcement language must name ALL dispatch mechanisms, not just the CLI one. Platform-specific instructions buried deep in a long prompt get lost — they need to be co-located with the constraint they modify. LLM attention patterns favor prompt boundaries (top/bottom) over the middle.

**Proposal filed:** `.squad/decisions/inbox/procedures-vscode-routing-fix.md`

### 2026-08-20: Long-path lifecycle repairs (#1758, #1759, #1756)

Fixed three defects in `workflows/squad.md`, all gating the 2026-08-21 e2e series. Every touched stage was in Sims' "NEVER EXERCISED" bucket, so I anchored each fix in a readable source of truth rather than inference.

- **#1758.1 (dead-code routing):** `squad-plan-accept` Step 1 unconditionally hard-failed "No plan found" on a missing `plan` artifact, so the Behavior note's `program`/`implementation` routing could never run. Rewrote Step 1 as "Find Plan and Route": check `program`/`implementation` first → run Accept Scope → Accept Impl → Activate; only reply "No plan found" when none of `program`/`implementation`/`plan` exist.
- **#1758.2 (epics dispatched as tasks):** Implement mode found immediate children of root — Epics in a 3-level hierarchy — and dispatched implementation workers on them. Changed Step 1 + Epic Dispatch to descend the sub-issue hierarchy recursively and dispatch only **leaf tasks** (open issues with no open sub-issues). Kept the 3-slot cap and worker contract intact (I do NOT own `squad-implement-worker.md`).
- **#1758.3 (validate ordering):** PROVABLE, not speculative. The planning ontology (`shared/squad-planning-ontology.md:48-87`) is the authoritative state machine and sequences `program → implementation → validate → accept scope → accept implementation → activate`. `squad.md`'s `next=` hints had drifted (program→accept-scope, validate→accept-impl, accept-scope→implementation). Corrected all hints to match the ontology, so validate precedes BOTH accept steps.
- **#1759 (Role strings in Owner/Agent):** Added an explicit Owner/Agent binding rule (resolve to the `Name` column of `.squad/team.md`, never a Role string) at every emission site (squad-plan Step 1/Step 3, squad-plan-implementation Step 2/3/4) and made `squad:{owner}` label minting use the lowercased cast Name, forbidding `squad:lead`.
- **#1756 (char floor → structural contract):** Replaced the research artifact's `≥200-char` floor with a structural contract (required sections: Evidence table, Goals, Non-goals, Load-bearing assumptions, Open decisions, Acceptance framing; `Rn` traceability IDs; one citation token per evidence row) enforced via the MANDATORY verify step. Shipped ONLY the structural half — the "well-formatted bad plan should FAIL" taste-judgment (#1757) stays deferred.

Tests: `test/gh-aw-plan-lifecycle.test.ts` (23 assertions), incl. a role-leak detector that parses a plan's Owner column against team.md and flags Role strings (`lead`) while passing cast Names (`Procedures`). Build green; gh-aw-quality suite unaffected. No changeset (no `packages/*/src/` touched).

**Proposal filed:** `.squad/decisions/inbox/procedures-long-path-lifecycle-fix.md`

### 2026-07: VS Code routing enforcement — Fix 1 + Fix 2 shipped (#613)

**Implemented** P0 fixes from the VS Code routing proposal:

- **Fix 1 (Platform-Neutral Enforcement):** Rewrote CRITICAL RULE from CLI-specific "`task` tool" language to dispatcher-identity framing ("You are a DISPATCHER, not a DOER") with explicit dispatch mechanism table (CLI → `task`, VS Code → `runSubagent`, fallback → inline as last resort). Updated all 7 enforcement-context references throughout squad.agent.md: anti-patterns #1/#2/#3, constraints block, and spawn template header.

- **Fix 2 (Top-and-Bottom Reinforcement):** Added `## ⚠️ Routing Enforcement Reminder` as final section, exploiting LLM prompt-boundary attention bias. Reinforces dispatcher identity at both top and bottom of the prompt.

**Branch:** `squad/613-vscode-routing-enforcement` — canonical source edited, synced to all 5 copies via `scripts/sync-templates.mjs`, build verified clean.

**Remaining P1 fixes** (template renaming, prompt slimming, VS Code block relocation) deferred to separate PRs per the proposal's ship order.

### 2026-07: PR #619 rebase and merge — model catalog final sync

**Problem:** PR #619 (model catalog update, #588) was the last of 6 PRs in the pre-crash triage merge plan. It had accumulated old dev merge commits and was behind after PRs #620, #627, #624, #611, and #617 merged first. Template renames from #624 (`.agent.md` → `.agent.md.template`) changed which files needed updating.

**Fix:** Used targeted `git rebase --onto dev <base>` to replay only the 2 actual PR commits (skipping accumulated dev merge noise). Rebase applied cleanly — one commit landed, one was auto-dropped as already upstream. After rebase, only `packages/squad-sdk/templates/squad.agent.md.template` and `templates/squad.agent.md.template` needed changes since the canonical and other copies already had the model updates from earlier merges.

**Pattern:** When a PR branch has accumulated merge commits from dev, use `git rebase --onto dev <parent-of-first-PR-commit>` to cherry-pick only the relevant commits. This avoids conflict noise from old merge commits that are already in dev. Also: after template renames, the sync script may overwrite version stamps in the canonical file — revert those before pushing.

### 2026-04-17: Trim copilot-instructions.md (#999)

**Task:** Reduce `.github/copilot-instructions.md` from ~1,300 words / 9KB to ≤750 words / ≤4KB to reduce attention dilution for the Copilot coding agent.

**Key decisions:**
- Extracted Protected Files (file list, rules, SDK/CLI boundary, anti-patterns) to `.copilot/skills/protected-files/SKILL.md` — replaced with 2-sentence pointer
- Consolidated Git Safety from 4 sub-sections (Staging, Pushing, Pre-Push Checklist, Branch Contamination Prevention) into a single 7-item flat list; resolved contradictory `git fetch upstream` vs `git fetch origin` (kept `origin`)
- Compacted Changeset Requirement from 7 lines + code block to 2 sentences
- Reordered: Team Context, Capability Self-Check, Branch Naming now appear before Git Safety (essential workflow first, safety rules second)
- Removed duplication with `.squad/copilot-instructions.md` (5 sections were verbatim copies; kept compact versions since both files load)
- Sweeping Refactor Rules condensed from 5-step list to 2-sentence pointer

**Result:** 397 words / 3KB — well within target. PR #1002.

**Files modified:** `.github/copilot-instructions.md`, `.copilot/skills/protected-files/SKILL.md` (new).

**Pattern:** When trimming agent instructions, extract domain-specific reference content to skills (lazy-loaded on demand) and keep the main instructions file as a routing/workflow document. Skills are the right abstraction for "read this when you touch X" — they don't consume tokens until needed.
