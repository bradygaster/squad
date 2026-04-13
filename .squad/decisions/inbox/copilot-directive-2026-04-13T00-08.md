### 2026-04-13T00:08:42Z: REPL removal strategy — extract first

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
