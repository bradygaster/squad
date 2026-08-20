# Eecom history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/eecom/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- Preserved 367 original line(s) in the archive.
- Detected 39 heading(s) and 26 dated reference line(s).
- This file now keeps a compact index plus the most recent tail so active context remains visible.

## Notable retained signals

- Replaced all hardcoded "Brady" in template examples with generic `{user}`/`{name}` placeholders. Canonical sources: `.squad-templates/squad.agent.md` and `.copilot/skills/init-mode/SKILL.md`. Template sync only covers `.squad-templates/`; init-mode SKILL.md package copies required manual edits. Key distinction: only files copied to user repos were changed; Brady references in project docs are legitimate content.
- ### PR #942 rebase — cherry-pick from insider-based fork branch (2026-04-12)
- When cherry-picking from an insider-based branch to dev, expect modify/delete conflicts for files that only exist on insider. Always verify the base assumptions of each change — imports referencing insider-only modules must be dropped or adapted. Opened #963 as clean replacement, closed #942.
- ### archiveDecisions() count-based fallback (#626) (2025-07-24)
- **Cross-platform filename & config fixes (#348, #356):** Use centralized `safeTimestamp()` everywhere. Removed machine-specific `teamRoot` from config.json (computed at runtime via `git rev-parse`).
- **PR #427 cross-fork rebase:** When rebasing with git worktrees, always create a dedicated worktree for complex operations. In rebase context, "ours" = upstream, "theirs" = your branch. Use `git worktree list` to diagnose unexpected branch switching.
- **PR #483 (platform-adapter timeout):** `{ ...EXEC_OPTS, timeout: 3_000 }` pattern for external CLI calls that might hang. Existing catch block with fallback handles timeout errors.
- **PR #480 (history race condition):** Three-layer defense: async mutex, atomic file operations (write-then-rename), 14 tests.
- **PR #486 (SIGINT handling):** Two layers: parent SIGINT handler + child process cleanup (kill children, close handles, flush buffers). 22 tests.
- **Fix:** Replaced all hardcoded "Brady" in template examples with generic `{user}` / `{name}` placeholders. Canonical sources: `.squad-templates/squad.agent.md` and `.copilot/skills/init-mode/SKILL.md`. Template sync (`node scripts/sync-templates.mjs`) propagated squad.agent.md to `.github/agents/` but did NOT sync init-mode SKILL.md to package templates — those required manual edits in both `packages/squad-cli/templates/skills/init-mode/SKILL.md` and `packages/squad-sdk/templates/skills/init-mode/SKILL.md`.
- **Context:** PR #942 from tamirdresher's fork was retargeted from `insider` to `dev`, causing 29 files in the diff when only 3 commits (4 files relevant to dev) were the actual fix. Cherry-picked the 3 fix commits onto a clean `squad/942-rebase-type-safety` branch from dev, resolving conflicts where insider-only files (skill.ts, cross-package-exports.test.ts) didn't exist on dev. Dropped the `escapeYamlValue` import and APM YAML generation function from init.ts since skill.ts doesn't exist on dev. Opened #963 as the clean replacement, closed #942.
- **Key lesson:** When cherry-picking from an insider-based branch to dev, expect modify/delete conflicts for files that only exist on insider. Always verify the base assumptions of each change — imports referencing insider-only modules must be dropped or adapted.
- **Context:** Three Copilot review comments on PR #767: (1) `teamRoot` was set to `workTreeRoot` but `.squad/` may live in the main checkout when running inside a git worktree — should derive from `detectSquadDir().path`, (2) `generateLoopFile()` hardcoded the full loop.md scaffold inline, duplicating `templates/loop.md`, (3) docs said `gh` was optional but code hard-requires `gh copilot` unless `--agent-cmd` is passed.
- **Context:** Copilot code review on PR #767 flagged three issues in the loop command: (1) `execFile` buffered stdout/stderr but never printed it — users saw no Copilot output during loop rounds, (2) `loop.md` was resolved relative to `dest` but execution used `teamRoot` (derived from `.squad/` parent), creating a CWD mismatch in worktree scenarios, (3) docs said `description` defaults to `""` but code uses `'Squad Loop'`.
- **Context:** `archiveDecisions()` in `packages/squad-cli/src/cli/core/nap.ts` silently returned `null` when all `###` entries were <30 days old (`old.length === 0`), even if the file was well over 20KB. Active projects generating many decisions per session could hit 145KB+ — 35K tokens burned per agent spawn.
- **Fix:** Added a count-based fallback after the age-based split. When `old.length === 0` and total file size exceeds `DECISION_THRESHOLD` (20KB), the fallback separates recent entries into dated vs undated, sorts dated by age (most recent first), keeps entries that fit under the threshold budget, and archives the rest. Undated entries are always preserved — they are foundational directives per Procedures' guidance.
- ### CLI Version Subcommand Pattern (2026-03-23 Release Incident)
- 📌 **Team update (2026-03-22T09-35Z — Wave 1):** Economy mode fully implemented: ECONOMY_MODEL_MAP + resolveModel() integration in SDK, `squad economy on|off` CLI command, `--economy` flag, 34 tests passing. PR #504 open for review. Soft dependency: #464 rate limit UX should offer economy mode as recovery. Next: Phase 1 of ambient personal squad (T1–T5, T19) — ready to start immediately after merging current work. Procedures wrote governance proposals for squad.agent.md — awaiting Flight review.
- **Root cause:** The catch block in `shell/index.ts` line ~1119 always emitted `genericGuidance()` unless `SQUAD_DEBUG=1`. Rate limit errors never got special treatment despite `RateLimitError` existing in `adapter/errors.ts`.
- `npm pack` produces a complete, installable tarball (~275KB packed, 1.2MB unpacked). Package includes dist/, templates/, scripts/, README.md per package.json "files" field. Postinstall script (patch-esm-imports.mjs) patches @github/copilot-sdk for Node 24+ compatibility. Tarball can be installed locally (`npm install ./tarball.tgz`) and commands execute via `node node_modules/@bradygaster/squad-cli/dist/cli-entry.js`. Both squad-cli and squad-sdk must be installed together — cli depends on sdk with "*" version specifier. All 27+ CLI commands are lazy-loaded at runtime; `--help` validates command routing without executing full logic.
- **Context:** Two cross-platform bugs broke Squad on Windows: (1) log filenames contained colons in ISO 8601 timestamps (illegal on Windows), (2) `.squad/config.json` contained absolute machine-specific `teamRoot` path.
- 3. Updated live `.squad/config.json` in repo to remove machine-specific path
- **Test Impact:** All 150 tests pass. Communication adapter test doesn't validate specific filename format (structural test, not behavioral).
- **Context:** CastingEngine class (Issue #138, M3-2) existed in SDK with curated universe templates (The Usual Suspects, Ocean's Eleven) but was completely bypassed during `squad init`. LLM picked arbitrary names, and charter generation used regex-based `personalityForRole()` instead of template backstories.

## Recent preserved tail

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
📌 **Team update (2026-03-25T18:11Z):** Fixed #590 personal squad path regression — getPersonalSquadRoot() now uses canonical personal-squad/ subdirectory like 
esolvePersonalSquadDir() and nsurePersonalSquadDir(). Committed on squad/590-fix-personal-squad-root. FIDO found same bug in shell/index.ts → work passed to CONTROL for full sweep revision. Awaiting FIDO re-review.
