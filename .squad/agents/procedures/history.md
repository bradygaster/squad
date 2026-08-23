# Procedures history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/procedures/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archive at `.squad/agents/procedures/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- **Deterministic skill pattern:** Skills must have explicit SCOPE and AGENT WORKFLOW (deterministic steps + STOP condition). Same input → same output, every time. No ambiguity.
- **Three governance policies (2026-03-15):** Agent Error Lockout (2 errors → reassign), Product Isolation Rule (tests/CI never depend on squad names), Peer Quality Check (run tests before finishing). Applied to all charters.
- **Team-wide reskill (2026-03-16):** 17.4% size reduction — NEVER/ALWAYS compress to single-paragraph summaries.
- **Personal squad governance:** `CONSULT_MODE: true` as spawn signal. Governance changes go to `decisions/inbox/` for Flight review.
- **VS Code routing fix (2026-07):** Fix 1 + Fix 2 shipped. CRITICAL RULE rewritten to dispatcher-identity framing. Routing Enforcement Reminder added as final section.
- **PR #619 rebase pattern:** When PR has accumulated dev merge commits, use `git rebase --onto dev <parent-of-first-PR-commit>` to cherry-pick only relevant commits.
- **Trim copilot-instructions.md (#999):** 1300w/9KB → 397w/3KB. Extract domain-specific reference to skills (lazy-loaded); main instructions = routing/workflow only.
- **Model catalog refresh (#588, 2026-03-25):** default model → `claude-sonnet-4.6`; specialist → `gpt-5.3-codex`; added `gpt-5.4`, `gpt-5.4-mini`, `claude-opus-4.6-1m`; removed stale models. All 5 squad.agent.md copies synchronized.
- **Spawn template pattern:** Every `task` tool spawn MUST include `name` set to the agent's lowercase cast name. `description` is human-readable summary; `name` is the agent ID.

## Recent preserved tail — gh-aw pre-E2E triage (2026-08-20)

Audited 4 gh-aw issues (#1759, #1756, #1757, #1608) against `workflows/squad.md`.

- **#1759 — SHIP-NOW.** Live bug confirmed. `squad-plan` Step 3 (L637) and `squad-plan-implementation` (L851/L863) emit Owner/Agent columns with no rule binding them to cast names. Fix = explicit "Owner/Agent MUST be a cast name from `.squad/team.md`" in both skills. Breaks `squad:{owner}` label at L670.
- **#1756 — SHARPEN, ship structural contract.** Ship emitted-artifact required-sections contract (evidence table, goals/non-goals, load-bearing assumptions, open decisions, traceability IDs R1..Rn). Defer insight-quality tuning to E2E-informed.
- **#1757 — DEFER (wave:4).** "Catches a bad plan" is taste-based; needs golden corpus; E2E should inform.
- **#1608 — DEFER (wave:3).** p2 outer-coordinator integration, off critical path.
- **Lesson:** For quality-of-output issues, split the verifiable structural contract (ship) from subjective judgment (E2E-informed). Never write success criteria as "works correctly."

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.

## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. Shipped #1759 (cast name binding), structural contract for #1756, all 3 #1758 defects, and empty-dispatch guard in PR #1778. Key pattern: before deferring a fix as unverifiable, look for a spec the code should already conform to — `squad-planning-ontology.md:48-87` was that spec for #1758.3. Empty-probe failure uses `::warning::` annotation (not a comment) because there is no triggering issue to post to. PR #1778 green, awaiting Flight gate.

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

## 2026-08-22 — gh-aw triage team update

📌 Team update (2026-08-22T17:10:52-07:00): Procedures completed Tier 3 #1729 prompt-architecture triage: sequence #1730+#1731 → #1733 → #1734 → #1736, with #1735 optional. Tier 1 false-green work blocks #1734 and enforcement-facing #1736. Prompt budget remains under the 100 KB ceiling.

## 📌 Team update — 2026-08-22T19:42:25-07:00

Issue #1824 closed. Authored /squad parser hardening (PR #1832) with explicit NO_COMMAND → fail contract. Mutation tests proved load-bearing cases (indented command, mid-sentence). Mutation 2 proved status-only gates miss bad diagnostics.

FIDO's Pass 2 found BLOCKING dispatch regression (bare command:"implement" → NO_COMMAND → fail; pre-fix worked). Reviewer Rejection Protocol applied: Procedures locked out, EECOM revised. Commit 6e7628c5 added PC-0 normalization layer before PC-1. FIDO Pass 3 verified all mutations green.

**Lesson:** Mutation testing in isolation can miss callers. FIDO's first pass shared the same frame; the blind spot was enumeration of all parser call paths (command-dispatch path was unexercised in new suite).

PR #1832 merged; issue #1824 closed. Decision records merged to .squad/decisions.md.

## 📌 Team update — 2026-08-22T21:20:17-07:00

**#1812 — Roster provenance fix shipped.** Implemented Team Guard Step TG-2 in `workflows/squad.md`: reads git-committed HEAD `.squad/team.md`, finds `Name` column by header, emits `ROSTER_MEMBER: {name}` per row (lowercased) or `ROSTER_UNREADABLE: {reason}`. All five minting/binding sites rewired to TG-2's certified stdout — provenance true by construction, not prose. 7 mutations (M1–M7) proven RED and naming input. 172 tests passed / 13 skipped. PR #1837 +531/−61 across 3 files, squash-merged as `4b32f7be`.

FIDO adversarial review: APPROVE WITH NITS. Found L1117 nit (Step 3 validator still named `.squad/team.md`). Fixed in follow-up commit `ab8649e3` — validator now TG-2-bound, consistent with L1111 and Check 10. Issue #1812 auto-closed.

Decision record merged to `.squad/decisions.md`.