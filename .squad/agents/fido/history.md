# FIDO

> Flight Dynamics Officer

## Core Context

Quality gate authority for all PRs. Test assertion arrays (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS, etc.) MUST stay in sync with files on disk. When reviewing PRs with CI failures, always check if dev branch has the same failures — don't block PRs for pre-existing issues. 3,931 tests passing, 149 test files, ~89s runtime.

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

