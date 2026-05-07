# FIDO History Archive

> Flight Dynamics Officer — Quality Gate Authority

## Summary of Archived Content (through 2026-04-01)

### Major Quality Gate Reviews

- **PR #331 Blocking Issue (2026-03-10):** Detected stale test assertions — EXPECTED_SCENARIOS array had 7 entries vs 25 files on disk. Enforced test sync discipline as per FIDO charter. Issue resolved in commit 6599db6.
- **Community PR Review Round 2 (2026-03-25):** Reviewed 10 open PRs, identified 3 duplicate pairs, consolidated 6 PRs into 4 recommendations.
- **Crash Recovery (2026-03-26):** Post-CLI incident baseline verified 5,038 tests ✅ green; approved 3/9 community PRs; issued change requests on 6 identifying systemic package naming and file path issues (0 rejections).

### Core Patterns Established

1. **Test Assertion Sync Discipline:** EXPECTED_* arrays must match filesystem reality. When PRs add new content files, test arrays must be updated. Consider dynamic discovery pattern for resilience.
2. **PR Quality Verdict Scale:** GO (merge), FAIL (block until fixed), NO-GO (reject). Pre-existing failures must be distinguished from PR regressions via baseline comparison.
3. **Name-Agnostic Testing:** Tests reading live .squad/ files assert structure/behavior, not specific agent names. Two classes: live-file tests (survive rebirths, property checks) and inline-fixture tests (self-contained, hardcoded).
4. **Dynamic Content Discovery:** Blog tests use filesystem discovery (readdirSync) instead of hardcoded arrays. Pattern: discover from disk, sort, validate build output exists.
5. **Command Wiring Regression Prevention:** cli-command-wiring.test.ts prevents "unwired command" bug by verifying every .ts file in commands/ is imported in cli-entry.ts.
6. **CLI Packaging Smoke Test:** cli-packaging-smoke.test.ts validates packaged CLI (npm pack → install → execute) across 27 commands + 3 aliases.
7. **CastingEngine Integration:** Uses AgentRole type (9 roles) imported from `@bradygaster/squad-sdk/casting`. Partial mapping acceptable; unmapped roles skip engine casting.

### Test Infrastructure

- 3,931 tests passing
- 149 test files
- ~89s runtime
- Dynamic blog discovery + hardcoded arrays for docs sections
- Bidirectional command wiring validation
- Packaging smoke test coverage

---

*Archive created 2026-04-19 by Scribe during history size management (23KB → baseline reduction)*
