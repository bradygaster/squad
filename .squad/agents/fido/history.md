# Fido history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/fido/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed signals

- Quality gate authority for all PRs. Test assertion arrays (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS, etc.) MUST stay in sync with files on disk. When reviewing PRs with CI failures, always check if dev branch has the same failures — don't block PRs for pre-existing issues. 3,931 tests passing, 149 test files, ~89s runtime.
- 📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Community PR Review):** Post-CLI crash recovery completed: Round 1 baseline verified (5,038 tests ✅ green), Round 2 executed duplicate closures (#605/#604/#602) and 9-PR community batch review. FIDO approved 3 PRs (#625 notification-routing, #603 Challenger agent, #608 security policy—merged via Coordinator) and issued change requests on 6 PRs identifying systemic issues: changeset package naming (4 PRs used unscoped `squad-cli` instead of `@bradygaster/squad-cli`); file paths (2 PRs placed files at root instead of correct package structure). Quality gate result: high-bar community acceptance—approved 3/9 (33%), change-request 6/9 (67%), 0 rejections. PR #592 (legacy, high-quality) also merged. All actions complete; dev branch remains green.
- 📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review Batch):** FIDO reviewed 10 open PRs for quality and merge readiness. Identified 3 duplicate/overlap pairs consolidating 6 PRs into 4: #607 (retro enforcement, comprehensive) approved for merge, #605 closed as duplicate. #603 (Challenger agent, correct paths) approved, #604 closed as duplicate. #606 (tiered memory superset) approved, #602 closed as duplicate. Merge-ready: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). Decisions merged.
- ### Test Assertion Sync Discipline
- EXPECTED_* arrays in docs-build.test.ts must match filesystem reality. When PRs add new content files, verify the corresponding test arrays are updated. Consider dynamic discovery pattern (used for blog posts) for resilience against content additions. Stale assertions that block CI are FIDO's responsibility. **Fixed PR #331:** EXPECTED_SCENARIOS expanded to 25 entries, EXPECTED_FEATURES array created with 32 entries (commit 6599db6).
- 📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Community PR Review):** Post-CLI crash recovery completed: Round 1 baseline verified (5,038 tests ✅ green), Round 2 executed duplicate closures (#605/#604/#602) and 9-PR community batch review. FIDO approved 3 PRs (#625 notification-routing, #603 Challenger agent, #608 security policy—merged via Coordinator) and issued change requests on 6 PRs identifying systemic issues: changeset package naming (4 PRs used unscoped `squad-cli` instead of `@bradygaster/squad-cli`); file paths (2 PRs placed files at root instead of correct package structure). Quality gate result: high-bar community acceptance—approved 3/9 (33%), change-request 6/9 (67%), 0 rejections. PR #592 (legacy, high-quality) also merged. All actions complete; dev branch remains green. Decision inbox merged and deleted. Next: Monitor 6 change-request PRs for author responses.
- 📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review Batch):** FIDO reviewed 10 open PRs for quality and merge readiness. Identified 3 duplicate/overlap pairs consolidating 6 PRs into 4: #607 (retro enforcement, comprehensive) approved for merge, #605 closed as duplicate (less comprehensive). #603 (Challenger agent, correct paths) approved for merge, #604 closed as duplicate (wrong file paths). #606 (tiered memory superset, 3-tier model) approved for merge, #602 closed as duplicate (narrower 2-tier scope). Merge-ready PRs identified: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). Draft #567 not ready. Impact: reduces PR count from 10 to 7, eliminates file conflicts, preserves unique value. All other PRs (#611, #608, #592, #567) can proceed independently. Decisions merged to decisions.md and decisions inbox deleted.
- EXPECTED_* arrays in docs-build.test.ts must match filesystem reality. When PRs add new content files, verify the corresponding test arrays are updated. Consider dynamic discovery pattern (used for blog posts) for resilience against content additions. Stale assertions that block CI are FIDO's responsibility.
- Verdict scale: GO (merge), FAIL (block until fixed), NO-GO (reject). Always verify: test discipline (assertions synced), CI status (distinguish pre-existing vs new failures), content accuracy, cross-reference validity. When detecting CI failures, run baseline comparison (dev branch vs PR branch) to isolate regressions.
- Tests reading live .squad/ files must assert structure/behavior, not specific agent names. Names change during team rebirths. Two test classes: live-file tests (survive rebirths, property checks) and inline-fixture tests (self-contained, can hardcode).
- cli-command-wiring.test.ts prevents "unwired command" bug: verifies every .ts file in commands/ is imported in cli-entry.ts. Bidirectional validation.
- `test/init-scaffolding.test.ts` — 15 tests: casting directory scaffolding (verifies .squad/casting/ + all 3 JSON files), no-remote resilience (init succeeds without git remote), doctor validation after init (zero failures). Follows existing test conventions — vitest, randomBytes temp dirs in cwd, compiled dist imports.

## 2026-08-20: #1732 triage + E2E readiness gate analysis

- Audited #1732 ("Make gh aw compile non-skippable, add prompt-budget gate, replace string-assertion workflow tests") as part of gh-aw wave cleanup before E2E day.
- **Compile gate gap confirmed:** `gh aw compile` is completely absent from CI. The test at `test/gh-aw-quality.test.ts:978` uses `it.skipIf(!ghAwAvailable)` — `gh aw` is not installed in the CI `test` job, so this test always skips in CI. Zero lock.yml files exist in the repo.
- **Prompt-budget gate already done:** `test/gh-aw-quality.test.ts:637-669` enforces 100 KB ceiling + >5 KB headroom guard via `npm test`.
- **String-assertion concern is mostly resolved:** Tests use parser helpers (extractFrontmatter, extractSafeOutputs, extractModeTable, extractInlineSkills) throughout. Some `.toContain()` calls exist but target specific contract values, not fragile substrings.
- **`gh aw compile --no-emit --dir workflows` exits 1** (expected: dispatch-workflow cross-references require `.github/workflows/` layout; the test correctly mirrors that in a temp workspace).
- Verdict: Split #1732. Ship only the CI install step. Close prompt-budget item. Defer/close string-assertion item.
- Decision record filed: `.squad/decisions/inbox/fido-1732-compile-gate-triage.md`

## 2026-08-20 (second follow-up): Runbook corrected for post-#1777 dispatch semantics

- EECOM landed PR #1777 fixing #1772 via `dispatch-workflow: max: 2` in `squad-implement-worker.md`.
- Post-fix, **2 dispatch_workflow entries is the EXPECTED healthy state** — empty probe + real dispatch.
  Previous runbook said "2 entries = bug". That was inverted. Fixed.
- Verified empirically against real runs:
  - run 32394811753 (post-#1777): `{ "type": "dispatch_workflow" }` (empty probe) + `{ ..., "workflow_name": "squad", "inputs": { "command": "implement", "issue_number": "5" } }` → 1 well-formed, 1 malformed → ✅ PASS
  - run 32316227601 (wrong-schema failure): `{ "type": "dispatch_workflow", "command": "implement", "issue_number": "5" }` (fields at top level, no `inputs` wrapper, no `workflow_name`) → 0 well-formed, 1 malformed → ❌ FAIL
- Three empirically observed malformed shapes: empty probe (no fields besides `type`), wrong schema (top-level fields), 0 entries.
- Updated `e2e-capture-runbook.md` Step 3 to use well-formed/malformed classification instead of raw count.
- Conditional note added: if Procedures ships a guard in squad.md that rejects empty dispatches, a "dispatch rejected" comment will appear on the triggering issue — Brady should check for it, but it may not exist yet.
- All PowerShell one-liners smoke-tested against real downloaded artifacts; both verdicts printed correctly.

- Verified `gh aw logs` artifact sets: activation, agent, all, detection, evals, experiment, firewall, github-api, mcp, usage. Default (`usage`) is compact summary only — `--artifacts all` needed for full diagnostic.
- `gh aw audit <run-url> --parse` generates Markdown reports from agent logs. Key command for post-run diagnosis.
- `safe_output.jsonl` is the canonical artifact for verifying gh-aw structured data contracts. It's uploaded as a GH Actions artifact with default 90-day retention — survives but requires `gh run download` to persist locally.
- Confirmed: `gh run list` JSON fields are `databaseId`, `conclusion`, `url`, `startedAt`, `workflowName`. Flag is `--json fields` not `--json`.
- Wrote Part 2 (evidence capture protocol), Part 1 (what survives vs evaporates), Part 3 (measurability rubric + #1606 rewrite).
- Rubric: 5 rules for measurable criteria in this system. Anti-patterns named: floor-without-semantics, vibe assertions, non-binary criteria, tautological criteria, missing "compared to what."

## Recent preserved tail

- **PRs #607 / #605** overlap on retrospective ceremony — both add weekly retro ceremony with Ralph enforcement. #607 adds ceremony + enforcement skill + guide (444 lines), #605 modifies existing templates/ceremonies.md + ralph-reference.md (217 lines). Both solve the same problem (retro enforcement) with different file structures. #607 is more comprehensive (includes enforcement guide + pseudocode), #605 is more concise (inline in existing templates). **Verdict: Pick one** — recommend #607 (standalone ceremony file is more discoverable).
- **PRs #604 / #603** are complete duplicates — both add Challenger agent template + fact-checking skill. #604 has `templates/challenger.md` (153 lines), #603 has `.squad/templates/agents/challenger.md` + `.squad/skills/fact-checking/SKILL.md` (133 lines). File locations differ but content is nearly identical. **Verdict: Close one as duplicate** — recommend #603 (file locations match project conventions).
- **PRs #606 / #602** overlap on tiered memory/history — #606 adds tiered-memory skill (hot/cold/wiki tiers, 370 lines), #602 adds tiered-history skill (hot/cold split, 158 lines). #606 is broader (3 tiers, scribe integration, spawn templates), #602 is narrower (2 tiers, history.md only). Both cite same production data source. **Verdict: #606 supersedes #602** — recommend closing #602 as subset.

**Quality assessment:**
- **PR #611 (TypeDoc API):** CI passing, large well-scoped PR (1569 additions), includes tests (Playwright), screenshots provided, PAO reviewed. Ready to merge pending PAO's requested fixes (crosslink banner, nav URL simplification). Quality: HIGH.
- **PR #608 (Security policy):** Trivial (28 lines), no tests needed, no CI configured. Adds SECURITY.md with standard vulnerability reporting text. Quality: ACCEPTABLE (minor typo: "timely manor" → "timely manner").
- **PR #592 (Enforcement wiring):** Well-documented (549 additions), adds missing step to hiring process + 3 appendices. CI passing, no code changes, docs-only. Quality: HIGH.
- **PR #567 (StorageProvider):** DRAFT status, clean implementation (321 additions), 18 tests passing, Wave 1 foundation PR (no call-site migration yet). Quality: HIGH, but keep as DRAFT until Wave 2 ready.

**CI status:** 9/10 PRs have CI passing. #608 (security policy) has no CI configured on branch "patch-1" (external contributor branch).

**Test coverage:**
- #611: Playwright tests included (8 tests)
- #607, #605, #604, #603, #606, #602: All docs-only, no tests needed
- #592: Docs-only, no tests needed
- #567: 18 tests included, all passing

**Overlap resolution needed:** tamirdresher has 6 PRs, 3 pairs have significant overlap. Recommend: merge #607 (not #605), merge #603 (close #604), merge #606 (close #602).

**Blocking issues:**
- None for mergeability — all non-overlapping PRs are technically ready
- Deduplication decision needed for tamirdresher's PRs before merging any of them

### Community PR Batch Review — Post-Crash Recovery (2026-03-26)

Reviewed 9 community PRs (8 from tamirdresher, 1 from eric-vanartsdalen). Key findings:

1. **Changeset package name pattern:** 4 of 8 Tamir PRs (#623, #622, #621, #614) use unscoped `"squad-cli"` / `"squad-sdk"` instead of `"@bradygaster/squad-cli"` / `"@bradygaster/squad-sdk"`. Only #625 got this right. This is a recurring community contributor mistake — consider adding guidance to CONTRIBUTING.md or PR template.

2. **File path pattern:** PRs #607 and #606 place files at root `ceremonies/`, `skills/`, `docs/`, `templates/` directories that don't exist. Skills belong in `packages/squad-cli/templates/skills/` and SDK equivalent. Community contributors don't know the monorepo layout.

3. **Verdicts:** ✅ MERGE: #625 (notification-routing), #603 (Challenger agent), #608 (SECURITY.md). ⚠️ NEEDS CHANGES: #623, #622, #621, #614 (changeset fix), #607, #606 (path restructuring).

**Learning:** Community contributors consistently struggle with two things: (a) scoped npm package names in changesets, and (b) monorepo file placement. Both are preventable with better contributor docs.

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.


## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. (1) PR #1775: added `gh extension install github/gh-aw` to squad-ci.yml test job. CI run 32410579973 confirmed compile test ran 894ms, not skipped. (2) Runbook corrections: OneDrive path fixed, 9 `\` paths converted to Join-Path, `>` redirects replaced with Set-Content. Test bar principle applied: tests must fail against the pre-fix state — derived from #1766 incident.

