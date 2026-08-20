# Fido history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/fido/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## 2026-08-20 — #1732 compile gate shipped

- **Defect confirmed:** `gh aw compile` was never a real CI gate. `test/gh-aw-quality.test.ts:978` uses `it.skipIf(!ghAwAvailable)` and `squad-ci.yml` never installed `gh-aw`, so the test always skipped in CI.
- **Fix:** Added `gh extension install github/gh-aw` step to the `test` job in `.github/workflows/squad-ci.yml`, immediately before Build. Reason: the test lives in `npm test` — wiring it into `squad-workflow-lint.yml` (which never runs `npm test`) would accomplish nothing.
- **Non-skippability verified locally:** (1) passing case: `gh aw compile --strict` on intact workflows exits 0; (2) break test: removed `squad-implement-worker.md` from temp workspace → compile exited 1 with "dispatch-workflow validation failed: workflow 'squad-implement-worker' not found" → gate fails as expected.
- **Issue split noted:** Prompt-budget gate already shipped (test:637-669). String-assertion replacement too vague — both closed without implementing.
- **Rule 5:** This gate fails if `gh aw compile --strict` exits non-zero — e.g., missing dispatch target, invalid frontmatter, or any `gh-aw` strict validation error.

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
