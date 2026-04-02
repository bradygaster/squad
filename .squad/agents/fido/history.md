# FIDO History

# FIDO

> Flight Dynamics Officer

## Core Context

Quality gate authority for all PRs. Test assertion arrays (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS, etc.) MUST stay in sync with files on disk. When reviewing PRs with CI failures, always check if dev branch has the same failures — don't block PRs for pre-existing issues. 3,931 tests passing, 149 test files, ~89s runtime.

📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Community PR Review):** Post-CLI crash recovery completed: Round 1 baseline verified (5,038 tests ✅ green), Round 2 executed duplicate closures (#605/#604/#602) and 9-PR community batch review. FIDO approved 3 PRs (#625 notification-routing, #603 Challenger agent, #608 security policy—merged via Coordinator) and issued change requests on 6 PRs identifying systemic issues: changeset package naming (4 PRs used unscoped `squad-cli` instead of `@bradygaster/squad-cli`); file paths (2 PRs placed files at root instead of correct package structure). Quality gate result: high-bar community acceptance—approved 3/9 (33%), change-request 6/9 (67%), 0 rejections. PR #592 (legacy, high-quality) also merged. All actions complete; dev branch remains green. Decision inbox merged and deleted. Next: Monitor 6 change-request PRs for author responses.

📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review Batch):** FIDO reviewed 10 open PRs for quality and merge readiness. Identified 3 duplicate/overlap pairs consolidating 6 PRs into 4: #607 (retro enforcement, comprehensive) approved for merge, #605 closed as duplicate (less comprehensive). #603 (Challenger agent, correct paths) approved for merge, #604 closed as duplicate (wrong file paths). #606 (tiered memory superset, 3-tier model) approved for merge, #602 closed as duplicate (narrower 2-tier scope). Merge-ready PRs identified: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). Draft #567 not ready. Impact: reduces PR count from 10 to 7, eliminates file conflicts, preserves unique value. All other PRs (#611, #608, #592, #567) can proceed independently. Decisions merged to decisions.md and decisions inbox deleted.

## Learnings

### Test Assertion Sync Discipline
EXPECTED_* arrays in docs-build.test.ts must match filesystem reality. When PRs add new content files, verify the corresponding test arrays are updated. Consider dynamic discovery pattern (used for blog posts) for resilience against content additions. Stale assertions that block CI are FIDO's responsibility.

### PR Quality Gate Pattern
Verdict scale: GO (merge), FAIL (block until fixed), NO-GO (reject). Always verify: test discipline (assertions synced), CI status (distinguish pre-existing vs new failures), content accuracy, cross-reference validity. When detecting CI failures, run baseline comparison (dev branch vs PR branch) to isolate regressions.

### Name-Agnostic Testing
Tests reading live .squad/ files must assert structure/behavior, not specific agent names. Names change during team rebirths. Two test classes: live-file tests (survive rebirths, property checks) and inline-fixture tests (self-contained, can hardcode).

### Dynamic Content Discovery
Blog tests use filesystem discovery (readdirSync) instead of hardcoded arrays. Pattern: discover from disk, sort, validate build output exists.

### Command Wiring Regression Test
cli-command-wiring.test.ts prevents "unwired command" bug: verifies every .ts file in commands/ is imported in cli-entry.ts. Bidirectional validation.

### CLI Packaging Smoke Test
cli-packaging-smoke.test.ts validates packaged CLI artifact (npm pack → install → execute). Tests 27 commands + 3 aliases. Catches: missing imports, broken exports, bin misconfiguration, ESM resolution failures. Complements source-level wiring test.

### CastingEngine Integration Review
CastingEngine augments LLM casting with curated names for recognized universes. Unrecognized universes preserve LLM names. Import from `@bradygaster/squad-sdk/casting`, use casting-engine.ts AgentRole type (9 roles). Partial mapping: unmapped roles skip engine casting.

### PR #331 Quality Gate Review — NO-GO (Blocking Issues Found) (2026-03-10T14:13:00Z)

**CRITICAL VIOLATIONS DETECTED:**

1. **Stale Test Assertions (Hard Rule Violation)** — EXPECTED_SCENARIOS array in test/docs-build.test.ts contains only 7 values ['issue-driven-dev', 'existing-repo', 'ci-cd-integration', 'solo-dev', 'monorepo', 'team-of-humans', 'cross-org-auth'], but 25 scenario files exist on disk (aspire-dashboard, client-compatibility, disaster-recovery, keep-my-squad, large-codebase, mid-project, multi-codespace, multiple-squads, new-project, open-source, private-repos, release-process, scaling-workstreams, switching-models, team-portability, team-state-storage, troubleshooting, upgrading, + 7 in array). My charter: "When I add test count assertions, I MUST keep them in sync with the actual files on disk. Stale assertions that block CI are MY responsibility to prevent." This is MY responsibility to catch.

2. **Missing EXPECTED_FEATURES Array** — PR adds 'features' to the sections list in test/docs-build.test.ts (line 46), but NO EXPECTED_FEATURES array exists. Test line 171 "all expected doc pages produce HTML in dist/" will skip features entirely. 32 feature files exist (.md files in docs/src/content/docs/features/).

📌 **Team update (2026-03-11T01:27:57Z):** PR #331 quality gate resolved. FIDO fixed test assertion sync in docs-build.test.ts: EXPECTED_SCENARIOS updated to 25 entries, EXPECTED_FEATURES array created with 32 entries, test assertions updated for features validation. Tests: 6/6 passing. Commit: 6599db6. Blocking NO-GO converted to approval gate cleared. Lesson reinforced: test assertions must be synced to filesystem state; CI passing ≠ coverage.

3. **Incomplete Test Coverage Sync** — PAO's history (line 41) states "Updated EXPECTED_SCENARIOS in docs-build.test.ts to match remaining files" after deleting ralph-operations.md and proactive-communication.md. But the diff shows ONLY a single-line change (adding 'features' to sections array). The full test update was not committed.

**POSITIVE FINDINGS:**
- ✅ CI passed (test run completed successfully on GitHub)
- ✅ Markdown structure tests pass (6/6 syntax checks)
- ✅ Docs are well-written: sentence-case headings, active voice, present tense, second person
- ✅ Cross-references valid (labels.md link verified)
- ✅ No duplicate "How It Works" heading in reviewer-protocol.md
- ✅ Content intact (no accidental loss)
- ✅ Microsoft Style Guide compliance confirmed

**ROOT CAUSE:** PAO staged the boundary review changes but the test update commit was incomplete. The assertion arrays must be synchronized before merge.

**REQUIRED FIX:** Update test/docs-build.test.ts:
1. EXPECTED_SCENARIOS = [ all 25 actual scenario files, sorted ]
2. EXPECTED_FEATURES = [ all 32 actual feature files, sorted ]
3. Regenerate to match disk reality (use filesystem discovery if the project wants test-resilience)

**VERDICT:** 🔴 **NO-GO** — Merge blocked until test assertions sync with disk state. This is a quality gate violation.

### Test Assertion Sync Fix (2026-03-10T14:20:00Z)

**Issue resolved:** Fixed stale test assertions in test/docs-build.test.ts identified during PR #331 review.

**Changes made:**
1. Expanded EXPECTED_SCENARIOS from 7 to 25 entries (matched all .md files in docs/src/content/docs/scenarios/)
2. Added EXPECTED_FEATURES array with 32 entries (matched all .md files in docs/src/content/docs/features/)
3. Updated test logic to include features section in HTML build validation

**Validation:** All structure validation tests passing (6/6). Build tests skipped as expected (Astro not installed). Arrays now accurately reflect disk state.

**Commit:** 6599db6 on branch squad/289-squad-dir-explainer

**Learning:** When test assertions reference file counts, they MUST be kept in sync with disk reality. The principle applies to ALL assertion arrays (EXPECTED_SCENARIOS, EXPECTED_FEATURES, EXPECTED_GUIDES, EXPECTED_REFERENCE, etc.). Consider dynamic discovery pattern (used in EXPECTED_BLOG) for resilience against content additions.

📌 **Team update (2026-03-10T14-44-23Z):** PR #310 scroll flicker fix merged. 4 root causes identified: Ink clearTerminal issue, timer amplification, log-update trailing newline, unstable Static keys. Postinstall patch pattern adopted for Ink internals. Version pin recommended for stability gate. Build: 3,931 tests pass, zero regressions.
### PR #331 Quality Gate Review — NO-GO (Blocking Issues Found) (2026-03-10T14:13:00Z)

**CRITICAL VIOLATIONS DETECTED:**

1. **Stale Test Assertions (Hard Rule Violation)** — EXPECTED_SCENARIOS array in test/docs-build.test.ts contains only 7 values ['issue-driven-dev', 'existing-repo', 'ci-cd-integration', 'solo-dev', 'monorepo', 'team-of-humans', 'cross-org-auth'], but 25 scenario files exist on disk (aspire-dashboard, client-compatibility, disaster-recovery, keep-my-squad, large-codebase, mid-project, multi-codespace, multiple-squads, new-project, open-source, private-repos, release-process, scaling-workstreams, switching-models, team-portability, team-state-storage, troubleshooting, upgrading, + 7 in array). My charter: "When I add test count assertions, I MUST keep them in sync with the actual files on disk. Stale assertions that block CI are MY responsibility to prevent." This is MY responsibility to catch.

2. **Missing EXPECTED_FEATURES Array** — PR adds 'features' to the sections list in test/docs-build.test.ts (line 46), but NO EXPECTED_FEATURES array exists. Test line 171 "all expected doc pages produce HTML in dist/" will skip features entirely. 32 feature files exist (.md files in docs/src/content/docs/features/).

📌 **Team update (2026-03-11T01:27:57Z):** PR #331 quality gate resolved. FIDO fixed test assertion sync in docs-build.test.ts: EXPECTED_SCENARIOS updated to 25 entries, EXPECTED_FEATURES array created with 32 entries, test assertions updated for features validation. Tests: 6/6 passing. Commit: 6599db6. Blocking NO-GO converted to approval gate cleared. Lesson reinforced: test assertions must be synced to filesystem state; CI passing ≠ coverage.

3. **Incomplete Test Coverage Sync** — PAO's history (line 41) states "Updated EXPECTED_SCENARIOS in docs-build.test.ts to match remaining files" after deleting ralph-operations.md and proactive-communication.md. But the diff shows ONLY a single-line change (adding 'features' to sections array). The full test update was not committed.

**POSITIVE FINDINGS:**
- ✅ CI passed (test run completed successfully on GitHub)
- ✅ Markdown structure tests pass (6/6 syntax checks)
- ✅ Docs are well-written: sentence-case headings, active voice, present tense, second person
- ✅ Cross-references valid (labels.md link verified)
- ✅ No duplicate "How It Works" heading in reviewer-protocol.md
- ✅ Content intact (no accidental loss)
- ✅ Microsoft Style Guide compliance confirmed

**ROOT CAUSE:** PAO staged the boundary review changes but the test update commit was incomplete. The assertion arrays must be synchronized before merge.

**REQUIRED FIX:** Update test/docs-build.test.ts:
1. EXPECTED_SCENARIOS = [ all 25 actual scenario files, sorted ]
2. EXPECTED_FEATURES = [ all 32 actual feature files, sorted ]
3. Regenerate to match disk reality (use filesystem discovery if the project wants test-resilience)

**VERDICT:** 🔴 **NO-GO** — Merge blocked until test assertions sync with disk state. This is a quality gate violation.

### Test Assertion Sync Fix (2026-03-10T14:20:00Z)

**Issue resolved:** Fixed stale test assertions in test/docs-build.test.ts identified during PR #331 review.

**Changes made:**
1. Expanded EXPECTED_SCENARIOS from 7 to 25 entries (matched all .md files in docs/src/content/docs/scenarios/)
2. Added EXPECTED_FEATURES array with 32 entries (matched all .md files in docs/src/content/docs/features/)
3. Updated test logic to include features section in HTML build validation

**Validation:** All structure validation tests passing (6/6). Build tests skipped as expected (Astro not installed). Arrays now accurately reflect disk state.

**Commit:** 6599db6 on branch squad/289-squad-dir-explainer

**Learning:** When test assertions reference file counts, they MUST be kept in sync with disk reality. The principle applies to ALL assertion arrays (EXPECTED_SCENARIOS, EXPECTED_FEATURES, EXPECTED_GUIDES, EXPECTED_REFERENCE, etc.). Consider dynamic discovery pattern (used in EXPECTED_BLOG) for resilience against content additions.

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

FIDO assigned:
- **#477 (Code Quality Linting PRD)** → squad:fido (monorepo async/promise quality, ESLint 9 PoC ready)

Pattern: Quality tooling gap identified. ESLint 9 modernization + async/promise pattern enforcement for monorepo.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. FIDO owns Code Quality Linting PRD (#477). ESLint 9 PoC already drafted; ready for implementation planning.

### Agent Name Extraction Test Coverage (#577)

Extracted inline regex-based agent name parsing from `shell/index.ts` into a testable pure function `parseAgentFromDescription` in `shell/agent-name-parser.ts`. Created 30 tests across 7 categories: happy path, emoji variations, case insensitivity, fuzzy fallback, no-match, edge cases, and adversarial inputs. The function uses a 3-tier matching strategy: (1) leading emoji+name+colon regex, (2) name+colon anywhere regex, (3) fuzzy word-boundary match against known agent names. Shell index.ts now imports and delegates to this function. Build and tests green.

**Learning:** Inline regex logic in UI code is untestable and fragile. Extracting to a pure function with explicit inputs (description string + known names array) makes it trivially testable and enables VOX's parallel fix to land cleanly.

📌 **Team update (2026-03-23T23:15Z):** Orchestration complete. Agent name extraction refactor shipped: FIDO's parser module (30 tests, all passing), VOX's 3-tier cascading patterns, Procedures' spawn template standardization. All decisions merged to decisions.md. Agent IDs now display correctly in Copilot CLI. Canonical patterns: `agent-name-parser.ts` is source of truth for extraction logic.
### Init Scaffolding Completeness Tests (#579)

Added `test/init-scaffolding.test.ts` — 15 tests covering three gaps exposed by issue #579:

1. **Casting directory scaffolding** — After `initSquad()` and `runInit()`, verifies `.squad/casting/` directory and all three JSON files (registry.json, policy.json, history.json) exist and parse as valid JSON. Also confirms re-init does not overwrite existing casting files.

2. **No-remote resilience** — Confirms init succeeds without errors when: git repo has no remote configured, brand-new `git init` repo, or no git at all. Uses `execFileSync` to create isolated git repos in temp dirs.

3. **Doctor validation after init** — Runs `runDoctor()` against a freshly-initialized directory and asserts zero failures, specifically that `casting/registry.json exists` check passes. Also tests negative cases (missing file → fail, corrupt JSON → fail).

Pattern: Tests follow existing `test/cli/init.test.ts` and `test/cli/doctor.test.ts` conventions — vitest, `randomBytes` temp dirs in cwd, imports from compiled dist via package exports (`@bradygaster/squad-cli/core/init`, `@bradygaster/squad-cli/commands/doctor`, `@bradygaster/squad-sdk`).

Commit: 7660a27 on branch squad/579-init-scaffolding-hardening.

### Personal Squad Init Discovery Tests (#576)

**Task:** Write tests for personal squad discovery and init flows (Issue #576 — npx init --global not discovering personal squad).

**Test file:** `test/personal-squad-init.test.ts` — 35 tests, 10 describe blocks, all passing.

**Coverage areas:**
1. `resolveGlobalSquadPath()` — platform-specific path resolution (Windows APPDATA, Linux XDG_CONFIG_HOME, consistency)
2. `resolvePersonalSquadDir()` — kill-switch (SQUAD_NO_PERSONAL), directory existence, npx-agnostic discovery
3. `personalInit` contract — directory structure creation, config.json shape, idempotency
4. `resolveSquadPaths()` — personalDir field inclusion, null when disabled
5. Edge: empty personal-squad dir (exists but no agents/)
6. Edge: partial state (agent dirs without charter.md, missing Role metadata defaults to "personal", stray files skipped)
7. `mergeSessionCast()` — project-wins precedence, case-insensitive collision, empty inputs
8. `ensureSquadPathTriple()` — personal dir in allowed roots, null personalDir graceful handling
9. Charter metadata parsing edge cases (whitespace trimming, sourceDir correctness, multi-agent discovery)

**Key finding:** `resolvePersonalSquadDir()` is install-method-agnostic — it resolves from env vars and `os.homedir()`, never from `process.argv`. The npx issue (#576) is therefore NOT in path resolution but likely in the CLI command wiring or the `--global` flag routing. Tests confirm the SDK layer works correctly.

**Commit:** c307187 on branch squad/576-personal-squad-init-npx
### Publish Policy CI Gate (#557)

Added `publish-policy` job to squad-ci.yml — lightweight lint that scans all `.github/workflows/*.yml` for bare `npm publish` commands missing `-w`/`--workspace`. Catches the incident class where root package.json gets published instead of a workspace package. Also wrote `test/publish-policy.test.ts` (36 tests) covering: workspace-scoped passes, bare publish fails, comment/echo/grep/YAML-name line skipping, findViolations line numbering, and live validation of all 15 workflow files. Key pattern: meta-references (echo, grep, YAML name keys containing "npm publish") must be excluded from lint — the CI script's own text would otherwise self-trigger.

📌 **Team update (2026-03-24T06-release-hardening):** Publish policy CI gate (#557) implemented. Added `publish-policy` job to squad-ci.yml: lightweight lint scans `.github/workflows/*.yml` for bare `npm publish` commands, rejects non-workspace-scoped invocations. Wrote test/publish-policy.test.ts (36 tests) validating: workspace-scoped passes, bare publish fails, meta-reference (echo/grep/YAML-name) skipping, live validation of 15 workflow files. Pattern: catch "publish root package.json" incident class before merge. Both lint + playbook docs create enforcement + education loop.

### PR Review Batch — 10 Open PRs (2026-03-24)

Reviewed all 10 open PRs for quality, test coverage, and merge readiness.

**Critical finding — Duplicate/overlapping PRs (tamirdresher):**
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

