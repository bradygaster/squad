# FIDO

> Flight Dynamics Officer

## Core Context

Quality gate authority for all PRs. Test assertion arrays (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS, etc.) MUST stay in sync with files on disk. When reviewing PRs with CI failures, always check if dev branch has the same failures — don't block PRs for pre-existing issues. 3,931 tests passing, 149 test files, ~89s runtime.

📌 **Team update (2026-04-14T03:14:58Z — Identity Regression Test Session Complete):** FIDO wrote 5 regression test files addressing PR #970 review feedback: resolve-token root derivation, manifest timeout cleanup, identity menu choices, gitignore keys, no token disclosure. 107 total identity tests passing. Coordinator validated E2E workflow with real GitHub App: 23/23 tests passed including full git workflow (branch → commit → push → draft PR → cleanup). Identity system ready for release. Committed and pushed.

📌 **Team update (2026-04-14T03:05:00Z — PR #970 Review Feedback Fixes):** FIDO completed 1 review feedback fix for PR #970 (identity e2e test): replaced unsafe `token.substring(0,8)` logging with safe `token.length` call to avoid leaking sensitive token data in test output. Change committed and pushed to dev. Impact: test suite no longer logs token fragments; diagnostic output remains functional.

📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Community PR Review):** Post-CLI crash recovery completed: Round 1 baseline verified (5,038 tests ✅ green), Round 2 executed duplicate closures (#605/#604/#602) and 9-PR community batch review. FIDO approved 3 PRs (#625 notification-routing, #603 Challenger agent, #608 security policy—merged via Coordinator) and issued change requests on 6 PRs identifying systemic issues: changeset package naming (4 PRs used unscoped `squad-cli` instead of `@bradygaster/squad-cli`); file paths (2 PRs placed files at root instead of correct package structure). Quality gate result: high-bar community acceptance—approved 3/9 (33%), change-request 6/9 (67%), 0 rejections. PR #592 (legacy, high-quality) also merged. All actions complete; dev branch remains green. Decision inbox merged and deleted. Next: Monitor 6 change-request PRs for author responses.

📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review Batch):** FIDO reviewed 10 open PRs for quality and merge readiness. Identified 3 duplicate/overlap pairs consolidating 6 PRs into 4: #607 (retro enforcement, comprehensive) approved for merge, #605 closed as duplicate (less comprehensive). #603 (Challenger agent, correct paths) approved for merge, #604 closed as duplicate (wrong file paths). #606 (tiered memory superset, 3-tier model) approved for merge, #602 closed as duplicate (narrower 2-tier scope). Merge-ready PRs identified: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). Draft #567 not ready. Impact: reduces PR count from 10 to 7, eliminates file conflicts, preserves unique value. All other PRs (#611, #608, #592, #567) can proceed independently. Decisions merged to decisions.md and decisions inbox deleted.

## Learnings

### Identity Module Regression Test Patterns (2026-04-14)
For review-fix regression tests on the identity module, three patterns proved effective: (1) **Script-execution tests** — copy standalone .mjs scripts to temp dirs, run with `execFile` from a different cwd to verify path derivation behavior. (2) **Source-code scanning tests** — read source files and assert absence/presence of patterns (e.g., no `token.substring`, no `choice === '3'`). Fast, zero-mock, catches re-introduction of removed code. (3) **Behavioral pattern tests** — reproduce internal logic patterns (e.g., HTTP server + timeout + clearTimeout) in test-local code when the original function isn't exported.

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

### Community Contributor Patterns
Two recurring issues: (1) Changesets use unscoped `squad-cli` instead of `@bradygaster/squad-cli`. (2) File placement assumes flat tree, not monorepo structure. Both preventable via CONTRIBUTING.md guidance.

📌 **Team update (2026-04-21 — resolve-token Canonicalization):** FIDO eliminated the 4-copy drift risk on `resolve-token.mjs` (283 LoC, byte-identical across `packages/squad-cli/templates/scripts/`, `packages/squad-sdk/templates/scripts/`, `templates/scripts/`, `.squad-templates/scripts/`). New single source at `packages/squad-cli/scripts/resolve-token.source.mjs`; new generator `packages/squad-cli/scripts/sync-resolve-token.mjs` with `--check` mode propagates to the 4 targets with a `GENERATED FILE` banner. Wired `sync:resolve-token` + `:check` npm scripts, chained into `prebuild` so builds always ship in-sync. Updated `scripts/sync-templates.mjs` to skip `scripts/resolve-token.mjs` (new generator is exclusive owner). Added vitest CI guard `test/scripts/resolve-token-sync.test.ts`, docs `docs/identity/maintaining-resolve-token.md`, changeset (patch, squad-cli only), and decision inbox entry. Zero-deps marker preserved. No SDK/runtime change.

