# EECOM

> Environmental, Electrical, and Consumables Manager


### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

EECOM assigned:
- **#481 (StorageProvider PRD)** → squad:control + squad:eecom (type system abstraction + runtime integration)
- **#479 (history-shadow race condition)** → squad:eecom + squad:retro (production bug; mitigation through StorageProvider atomicity)

Pattern: Three architectural gaps identified (agent spec, state abstraction, quality tooling) + one production bug. StorageProvider abstraction critical for #479 atomicity fix.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. EECOM owns StorageProvider PRD spec (#481) + history-shadow race mitigation (#479). Ready to begin implementation on next sprint.

### PR #483 Review & Merge — Platform Adapter Timeout Fix (2026-03-22)

Reviewed and merged diberry's fix for platform-adapter test timeouts that were blocking all 8 open PRs. Root cause: `getAvailableWorkItemTypes()` called `execFileSync('az', ...)` with no timeout — in CI where az CLI is installed but no real ADO org exists, it hangs indefinitely until Vitest kills it at 5s.

**Fix pattern:** `{ ...EXEC_OPTS, timeout: 3_000 }` — spread existing exec options and add a 3-second timeout. The existing catch block already returns sensible default work item types, so timeout errors fall through gracefully. This is the correct pattern for any external CLI call that might hang: add a timeout to execFileSync and ensure the catch block has a fallback.

**Rebase note:** Branch was already clean on top of dev (1 commit ahead, no divergence). No rebase was needed.

📌 **Team update:** PR #483 merged (squash). This unblocks CI for all open PRs that were failing on platform-adapter test timeouts. The remaining CI failure across PRs is the broken docs link (separate issue).

### PR #480 Review & Merge — History Race Condition Fix (2026-03-22)

Reviewed and merged PR #480 (async mutex + atomic writes + 14 tests). Addresses race condition in history-shadow file operations under concurrent load.

**Fix pattern:** Race conditions in history operations require three-layer defense: (1) async mutex for write serialization, (2) atomic file operations (write-then-rename), (3) comprehensive test coverage (14 tests for edge cases). This pattern applies to any persistent state under concurrent access.

**Key learning:** File system race conditions aren't just "add a lock" — need atomicity guarantees (rename is atomic), serialization (mutex), and exhaustive test coverage to validate edge cases (concurrent writes, stale reads, partial failures).

### PR #486 Review & Merge — SIGINT Handling (2026-03-22)

Reviewed and merged PR #486 (two-layer signal handling + 22 tests). Improves graceful shutdown under SIGINT (Ctrl+C) by cleaning up both parent and child processes.

**Fix pattern:** Signal handling in Node.js requires two layers: (1) parent process SIGINT handler that triggers graceful shutdown, (2) child process cleanup (kill child processes, close file handles, flush buffers). Incomplete cleanup leaves zombie processes or orphaned file locks. Test coverage essential: 22 tests verify process tree cleanup, signal propagation, and edge cases (nested children, immediate re-signals).

**Key learning:** SIGINT handling is more complex than "add a signal handler" — need explicit child process cleanup logic + comprehensive tests. Pattern applies to any process spawning child processes (CLI spawning subshells, REPL spawning child REPL instances, etc.).
### Economy Mode Implementation (#500) (2026-03-20)

**Context:** Issue #500 requested economy mode — a session-level and persistent modifier that shifts model selection to cheaper alternatives.

**Architecture decision:** Economy mode is a Layer 3/4 modifier only. Layers 0–2 (explicit user preferences: config.json, session directive, charter) are never downgraded. This preserves user intent while enabling cost savings on auto-selected tasks.

**Implementation:**
1. `ECONOMY_MODEL_MAP` + `applyEconomyMode()` in `config/models.ts` — pure mapping function for premium→standard and standard→fast downgrades
2. `readEconomyMode()` + `writeEconomyMode()` — config.json read/write functions (same merge-without-clobber pattern as `writeModelPreference()`)
3. `resolveModel()` in `config/models.ts` updated with `economyMode?: boolean` option; falls back to reading from `squadDir` if not provided
4. `resolveModel()` in `agents/model-selector.ts` updated with `economyMode?: boolean` — both SDK resolvers are economy-aware
5. `squad economy [on|off]` command in CLI for persistent toggle
6. `--economy` global flag in `cli-entry.ts` sets `SQUAD_ECONOMY_MODE=1` env var for session scope
7. 34 new tests in `test/economy-mode.test.ts` — all pass

**Key pattern:** Both resolveModel implementations follow identical principle: explicit overrides (user choice) are sacred; economy only affects computed auto-selection.

**PR:** #500 branch `squad/500-economy-mode`

### node:sqlite Hard-Fail Fix (#502) (2026-03-21)

**Context:** Workshop participants (reported by Doron Ben Elazar) were blocked by `ERR_UNKNOWN_BUILTIN_MODULE` crashes. `node:sqlite` (used by Copilot SDK for session storage) requires Node 22.5.0+. The existing soft-warn-and-continue approach let users limp into a cryptic crash.

**Root cause:** `engines.node` said `>=20` but `node:sqlite` needs `>=22.5.0`. The pre-flight check warned but didn't exit, so users saw confusing failures deep in SDK code.

**Fix:**
1. **cli-entry.ts:** Replaced `try { await import('node:sqlite') } catch { warn }` with a synchronous version check that calls `process.exit(1)` immediately with a clear upgrade message. Removed the now-dead `checkNodeSqlite()` function and its call site.
2. **doctor.ts:** Added `checkNodeVersion()` to `squad doctor` — exported with optional version param for testability.
3. **package.json (×3):** Corrected `engines.node` to `>=22.5.0` so npm/npx warn at install time.
4. **Tests:** 5 new tests for `checkNodeVersion()` (Node 20.x fail, 22.4.x fail, 22.5.0 pass, 24.x pass, current env pass). Updated check-count assertion.

**Pattern:** git branch confusion — `git checkout -b` switches HEAD but edits to files on wrong branch are lost when switching. Always confirm `git branch` before making file edits. File edits don't follow you to a new branch if you forgot to switch first.

**PR:** #506 branch `squad/502-node-sqlite-dependency`

### Rate Limit Recovery UX (#464) (2026-03-22)

**Context:** Rate limit errors showed generic message with no actionable recovery. Brady directive: offer model switching + economy mode as recovery options.

**Implementation:**
1. `error-messages.ts` — `rateLimitGuidance()` shows actual reason + 3 recovery options (retry time, `squad economy on`, config.json model override)
2. `shell/index.ts` — Detects rate limits via `instanceof RateLimitError` or regex; writes `.squad/rate-limit-status.json`
3. `doctor.ts` — `checkRateLimitStatus()` reads status file and warns if recent
4. 36 new tests — all pass

**PR:** #505 `squad/464-rate-limit-ux` — merged (rebased after #504)

### Session 2 Summary (2026-03-22)

Executed 3 tasks across 2 waves: economy mode (#500, PR #504), node:sqlite fix (#502, PR #506), rate limit UX (#464, PR #505). All PRs merged to dev.


### Personal Squad Init via npx (#576) (2026-03-23)

**Context:** `init --global` (used via npx to set up personal squad) created a full `.squad/` structure at `~/.config/squad/` but never created the `personal-squad/` subdirectory. `resolvePersonalSquadDir()` looks for `personal-squad/`, so subsequent repo-level `init` couldn't discover the user's personal agents.

**Root cause:** Two separate concepts - `init --global` scaffolds a full squad, `personal init` creates `personal-squad/`. The `--global` flag never bridged between them.

**Fix:**
1. `resolution.ts` - Added `ensurePersonalSquadDir()` idempotent helper to SDK.
2. `cli-entry.ts` - `init --global` now suppresses workflows and passes `isGlobal` flag.
3. `init.ts` - After global init, calls `ensurePersonalSquadDir()`. After repo init, detects personal squad.
4. `personal.ts` - Refactored to reuse `ensurePersonalSquadDir()`.
5. `resolution.test.ts` - Added 3 tests.

**Pattern:** `resolveGlobalSquadPath()` returns the container; `ensurePersonalSquadDir()` creates the subdirectory the rest of the system looks for.
📌 **Team update (2026-03-25T18:11Z):** Fixed #590 personal squad path regression — getPersonalSquadRoot() now uses canonical personal-squad/ subdirectory like esolvePersonalSquadDir() and nsurePersonalSquadDir(). Committed on squad/590-fix-personal-squad-root. FIDO found same bug in shell/index.ts → work passed to CONTROL for full sweep revision. Awaiting FIDO re-review.


### Batch 10 — Shell Removal & SDK Extraction (2026-04-13)
📌 **Team update:** Batch 10 completed successfully. Deleted shell directory (27 files), removed REPL infrastructure (33 tests, patch-ink-rendering.mjs), cleaned package.json and tsconfig.json. Extracted team-manifest parsing to SDK (parseTeamManifest, getRoleEmoji, loadWelcomeData) with 14 new tests. Net: -22,023 LoC, +159 LoC across 70 files. CLI now shell-free. FIDO wrote 63 adversarial + performance gate tests. Status: SUCCESS.


