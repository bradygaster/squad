# EECOM

> Environmental, Electrical, and Consumables Manager

## Learnings

### Init scaffolding: casting dir + no-remote stderr (#579) (2025-07-18)

**Context:** `squad init` in a fresh `git init` repo (no remote) printed `error: No such remote 'origin'` to stderr and `squad doctor` reported `casting/registry.json` missing. Two independent bugs in `packages/squad-sdk/src/config/init.ts`.

**Fix 1 — Stderr leak:** Three `execFileSync('git', ['remote', 'get-url', 'origin'])` calls in `initSquad()` were missing `stdio: ['pipe','pipe','pipe']`. The try/catch caught the error but git's stderr still leaked to the console. Added stdio piping to all three call sites (lines ~713, ~732, ~1039).

**Fix 2 — Missing casting files:** The init flow created the `.squad/casting/` directory but never populated it. Added a scaffolding block after directory creation that copies `casting-policy.json`, `casting-registry.json`, and `casting-history.json` from SDK templates (with inline fallbacks). Respects `skipExisting` — never overwrites user files.

**Pattern:** When calling `execFileSync` for a git command inside a try/catch, always add `stdio: ['pipe','pipe','pipe']` to suppress stderr. The catch prevents a crash, but without piped stdio the error message still prints to the user's terminal.

### CLI Version Subcommand Pattern (2026-03-23 Release Incident)
**Context:** `squad version` returned "Unknown command: version" even though `squad --version` and `squad -v` worked fine. Classic "unwired command" bug but for a flag-to-subcommand gap rather than a missing import.

**Pattern:** When a CLI flag works (`--foo`) but the equivalent subcommand doesn't (`foo`), the fix is almost always a single condition addition in `cli-entry.ts`. No separate command file needed for trivial handlers — inline alongside the flag handler. Added `cmd === 'version'` to the existing `--version`/`-v` condition. Also added `version` to help text command list.

**Why inline works:** Trivial handlers that just print a value don't warrant their own module. Same output, same code path — no reason to split. Avoids adding a file the wiring test would require an import for. Precedent: `help` is also handled inline.

### `squad version` subcommand (2026-07-15)

**Context:** Running `squad version` returned "Unknown command: version" because the subcommand was never routed in `cli-entry.ts`, even though `--version` and `-v` flags worked fine. Classic "unwired command" bug class, but for a flag-to-subcommand gap rather than a missing import.

**Fix:** Added `cmd === 'version'` to the existing `--version`/`-v` condition in `cli-entry.ts` (line ~130). Also added `version` to the help text command list. No new file in `cli/commands/` needed — this is a trivial inline handler, same as `--version`. The wiring test is unaffected since there's no separate command file.

**Pattern:** When a CLI flag (`--foo`) works but the equivalent subcommand (`foo`) doesn't, the fix is almost always a single condition addition in `cli-entry.ts`. No separate command file needed for trivial handlers.

### Privacy scrub messaging + EPERM + gitignore parent coverage (#549) (2026-07-14)

**Context:** Upgrade footer message always said "Preserves user state" even when the email privacy scrub had run — a direct contradiction of what just happened. Two related issues in the same function: EPERM on read-only `.gitattributes` would crash the upgrade, and `.gitignore` would add redundant entries already covered by parent paths (e.g. `.squad/log/` when `.squad/` was already present).

**Fix:**
1. `upgrade.ts` — `ensureGitattributes` catches EPERM/EACCES and returns `[]` with a console.warn, graceful degradation.
2. `upgrade.ts` — `ensureGitignore` skips an entry when any existing line is a parent prefix of it.
3. `upgrade.ts` — Footer logic checks whether the email scrub actually ran; shows "Privacy scrub applied" or "Preserves user state" accordingly.
4. `test/cli/upgrade.test.ts` — Added EPERM test using `chmodSync` (fix: `chmodSync` was missing from the `fs` import — added it).

**Pattern:** When adding a new fs function to a test, always verify the named import list at the top of the test file. Missing named imports from `'fs'` produce `ReferenceError` at runtime, not at type-check time (if the test file isn't part of the main tsconfig).

📌 **Team update (2026-03-22T09-35Z — Wave 1):** Economy mode fully implemented: ECONOMY_MODEL_MAP + resolveModel() integration in SDK, `squad economy on|off` CLI command, `--economy` flag, 34 tests passing. PR #504 open for review. Soft dependency: #464 rate limit UX should offer economy mode as recovery. Next: Phase 1 of ambient personal squad (T1–T5, T19) — ready to start immediately after merging current work. Procedures wrote governance proposals for squad.agent.md — awaiting Flight review.
### Rate Limit UX (#464) (2026-03-20)

**Context:** Users hitting Copilot rate limits saw generic "Something went wrong processing your message." Squad hid the actual error. `squad doctor` reported nothing — useless to diagnose.

**Root cause:** The catch block in `shell/index.ts` line ~1119 always emitted `genericGuidance()` unless `SQUAD_DEBUG=1`. Rate limit errors never got special treatment despite `RateLimitError` existing in `adapter/errors.ts`.

**Fix:**
1. `error-messages.ts` — Added `rateLimitGuidance({ retryAfter?, model? })` and `extractRetryAfter(message)` utilities. Rate limit guidance shows clear message + recovery options (retry time, `squad economy on`, config.json model override).
2. `shell/index.ts` — Catch block now detects rate limits via `instanceof RateLimitError` OR regex on the raw message. Writes `.squad/rate-limit-status.json` on detection.
3. `doctor.ts` — Added `checkRateLimitStatus()` check. Reads status file and warns if rate limit was recent.
4. `test/error-messages.test.ts` — Added 11 new tests covering `rateLimitGuidance` and `extractRetryAfter`.

**Pattern:** Rate limit status written to `.squad/rate-limit-status.json` as `{ timestamp, retryAfter, model, message }`. Doctor reads it on next run. File is never deleted automatically — doctor marks it `pass` when > 4h stale.

**Import path for `RateLimitError`:** `@bradygaster/squad-sdk/adapter/errors` (subpath export, not in main barrel).

**PR:** #464 fix — squad/464-rate-limit-ux

### CLI Entry Point Architecture
cli-entry.ts is the central router for ~30+ CLI commands using dynamic imports (lazy-loading). Commands are routed via if-else blocks. Has a recurring "unwired command" bug class — implementations exist in cli/commands/ but aren't routed in cli-entry.ts. The cli-command-wiring.test.ts regression test catches this by verifying every .ts file in cli/commands/ is imported.

### ESM Runtime Patch
Module._resolveFilename interceptor in cli-entry.ts (lines 47-54) patches broken ESM import in @github/copilot-sdk@0.1.32 (vscode-jsonrpc/node missing .js extension). Required for Node 24+ strict ESM enforcement. Works on npx cache hits where postinstall scripts don't run.

### Lazy Import Pattern
All command imports use `await import('./cli/commands/xxx.js')` to minimize startup time. Copilot SDK is lazily loaded only when shell is invoked. All .js extensions required for Node 24+ strict ESM.

### CLI Packaging & Distribution
`npm pack` produces a complete, installable tarball (~275KB packed, 1.2MB unpacked). Package includes dist/, templates/, scripts/, README.md per package.json "files" field. Postinstall script (patch-esm-imports.mjs) patches @github/copilot-sdk for Node 24+ compatibility. Tarball can be installed locally (`npm install ./tarball.tgz`) and commands execute via `node node_modules/@bradygaster/squad-cli/dist/cli-entry.js`. Both squad-cli and squad-sdk must be installed together — cli depends on sdk with "*" version specifier. All 27+ CLI commands are lazy-loaded at runtime; `--help` validates command routing without executing full logic.

### Packaging Smoke Test Strategy
test/cli-packaging-smoke.test.ts validates the packaged artifact (not source). Uses npm pack + install in temp dir + command routing verification. Commands are expected to fail (no .squad/ dir) — test verifies routing only (no "Unknown command", no MODULE_NOT_FOUND for the command itself). Exception: node-pty is an optional dependency for the `start` command and MODULE_NOT_FOUND for node-pty is allowed. Windows cleanup requires retry logic due to EBUSY errors — use rmSync with maxRetries + retryDelay options, wrap in try/catch to fail silently since tests have passed.

### v0.8.24 Release Readiness Audit
CLI completeness audit (2026-03-08) confirmed: 26 primary commands routed in cli-entry.ts, all present in smoke test. 4 aliases (watch→triage, workstreams→subsquads, remote-control→rc, streams→subsquads). 3 aliases tested, 1 untested ("streams"). Packaging verified: dist/, templates/, scripts/, README.md in tarball; bin entry points to dist/cli-entry.js; postinstall script included and working. All 32 smoke tests pass. Package.json files array correct. npm pack output shows 318 files, 275KB packed. No missing command implementations. Optional dep (node-pty) handled correctly. Only gap: "streams" alias not in smoke test (routed correctly but test coverage incomplete). Confidence: 95% — all critical paths covered, minor alias test gap non-blocking.

📌 **Team update (2026-03-08T21:18:00Z):** FIDO + EECOM released unanimous GO verdict for v0.8.24. Smoke test approved as release gate. FIDO confirmed 32/32 pass + publish.yml wired correctly. EECOM confirmed 26/26 commands + packaging complete (minor gap: "streams" alias untested, non-blocking).

### Cross-Platform Filename and Config Fixes (#348, #356) (2026-03-15T05:30:00Z)

**Context:** Two cross-platform bugs broke Squad on Windows: (1) log filenames contained colons in ISO 8601 timestamps (illegal on Windows), (2) `.squad/config.json` contained absolute machine-specific `teamRoot` path.

**Investigation:**
- Searched SDK for all timestamp usage in filenames — found `safeTimestamp()` utility already existed but wasn't consistently used
- `comms-file-log.ts` (line 32) used inline `toISOString().replace(/:/g, '-')` instead of utility
- `init.ts` (line 612) wrote absolute `teamRoot` to config.json on every init
- Session-store already used `safeTimestamp()` correctly (line 71)

**Fixes:**
1. **Bug #348:** Updated `comms-file-log.ts` to import and use `safeTimestamp()` utility instead of inline timestamp formatting
2. **Bug #356:** Removed `teamRoot` field from config.json (can be computed at runtime via `git rev-parse --show-toplevel`)
3. Updated live `.squad/config.json` in repo to remove machine-specific path

**Pattern:** Centralized timestamp formatting in `safeTimestamp()` utility (replaces colons + truncates milliseconds). Windows-safe format: `2026-03-15T05-30-00Z` instead of `2026-03-15T05:30:00.123Z`.

**Test Impact:** All 150 tests pass. Communication adapter test doesn't validate specific filename format (structural test, not behavioral).

**PR:** #404 opened targeting dev.

### CastingEngine CLI Integration (#342) (2026-03-15T11:20:00Z)

**Context:** CastingEngine class (Issue #138, M3-2) existed in SDK with curated universe templates (The Usual Suspects, Ocean's Eleven) but was completely bypassed during `squad init`. LLM picked arbitrary names, and charter generation used regex-based `personalityForRole()` instead of template backstories.

**Investigation:**
- CastingEngine.castTeam() was never called in CLI flow
- coordinator.ts buildInitModePrompt() let LLM pick any universe without guidance
- cast.ts generateCharter() used fallback personality logic instead of engine data
- SDK exports two AgentRole types: broad one in casting-engine.ts, restrictive one in runtime/constants.ts

**Integration Strategy (Augment, Not Replace):**
- LLM still proposes roles and team composition (the beloved casting experience)
- CastingEngine augments with curated names when universe is recognized
- Mapping: "The Usual Suspects" → 'usual-suspects', "Ocean's Eleven" → 'oceans-eleven'
- Unrecognized universes (Matrix, Alien, etc.) preserve LLM's arbitrary names

**Implementation:**
1. Added `augmentWithCastingEngine()` in cast.ts to replace LLM names with engine characters
2. Updated coordinator prompt to suggest preferred universes (Usual Suspects, Ocean's Eleven)
3. Extended `generateCharter()` to use engine personalities/backstories when available
4. Attached `_personality` and `_backstory` to CastMember objects for charter generation
5. Role mapping: CLI role strings → engine AgentRole enum (lead, developer, tester, etc.)

**Type Import Pattern:**
- Import CastingEngine from `@bradygaster/squad-sdk/casting` (not main barrel export)
- Use casting-engine.ts AgentRole type (9 roles) not runtime/constants.ts (6 roles)
- Partial mapping: unmapped roles log warning and skip engine casting

**Tests:**
- Created test/casting-engine-integration.test.ts (5 tests, all pass)
- Validates augmentation for both universes, case-insensitive matching, fallback behavior
- All 45 existing cast-parser/casting tests still pass

**PR:** #417 opened targeting dev.


### PR #427 Cross-Fork Rebase (2026-03-15T21:00:00Z)

**Context:** PR #427 (PAO external communications Phase 1) conflicted with upstream/dev after team recast (#423 Usual Suspects → Apollo 13) and model updates. Cross-repo PR (diberry/squad → bradygaster/squad). Initial rebase attempts failed due to git worktree confusion — main worktree was checked out to a different branch, causing git checkout commands to silently switch to wrong branches.

**Problem:** Git commands (checkout, rebase) kept switching to unrelated branches (squad/agent-on-disk-concept, squad/320-fix-migration-guide-version-local) mid-rebase. Root cause: main worktree at C:\Users\diberry\repos\project-squad\squad was checked out to squad/agent-on-disk-concept. Git was treating checkout commands as worktree operations and switching the main worktree's HEAD, aborting the rebase.

**Solution:** Created dedicated worktree (.worktrees/pao-rebase) for the rebase operation. This isolated the rebase from main worktree state and prevented branch switching.

**Conflict Resolution (3 files, 7 commits rebased):**
1. **.squad/agents/_alumni/mcmanus/charter.md** - Merged both rule sets: DOCS-TEST SYNC (from upstream reskill) and EXTERNAL COMMS, HUMANIZER, AUDIT TRAIL (from PR #427). Used PowerShell regex to extract and combine both sides.
2. **.squad/routing.md** - Accepted Apollo 13 team names (EECOM, PAO, FIDO) from upstream via `git checkout --ours` (in rebase context, "ours" = upstream, "theirs" = our branch). PAO external comms infrastructure is team-agnostic.
3. **.squad/agents/keaton/history.md** - Accepted deletion via `git rm` (file moved to _alumni in upstream recast).

**Rebase Commits:** 7 commits from squad/426-pao-external-comms rebased onto upstream/dev (f87a7a5), covering #423 team reskill, #424 SDK switch, #425/#428 test parity, #429 model updates.

**Force Push:** `git push origin squad/426-pao-external-comms --force-with-lease` succeeded. PR #427 comment posted via gh CLI.

**Pattern:** When working with git worktrees, always create a dedicated worktree for complex operations (rebase, cherry-pick) to avoid main worktree state interference. Use `git worktree list` to diagnose unexpected branch switching.
### SDK Init Flow Deep Dive (2026-03-08)
Traced complete `squad init --sdk` flow end-to-end for unified PRD. Key findings: (1) Init flow has two phases: CLI init creates skeleton files, REPL auto-cast creates team members. (2) Critical gap: squad.config.ts is never updated after auto-cast — members exist in .squad/ but not in config. (3) Ralph is inconsistently created (auto-cast yes, CLI init no). (4) No commands exist for adding/removing members post-init. (5) CastingEngine class exists but is never called during init — LLM-based Init Mode prompt is used instead. Roadmap written to .squad/identity/sdk-init-implementation-roadmap.md with 7 fixes prioritized by dependency graph. Critical path: sync utility → Ralph fixes → CastingEngine integration → hire/remove commands. High-risk items: squad.config.ts AST parsing (considered regex alternative). Open questions: AST vs regex for config sync, CastingEngine augment vs replace LLM, Ralph always-on vs opt-in.

📌 **Team update (2026-03-11T01:25:00Z):** SDK Init decisions finalized: Phase-based quality improvement program, CastingEngine canonical casting, squad.config.ts as source of truth, Ralph always-included, implementation priority order (sync utility first, then Ralph fixes, then CastingEngine integration). All decisions merged to decisions.md. Ready to start Phase 1 implementation.

### Adoption Tracking Tier 1 Implementation (2026-03-10)
Implemented Flight's privacy-first adoption monitoring strategy on PR #326 branch. Moved `.squad/adoption/` → `.github/adoption/` for better GitHub integration. Stripped tracking.md to aggregate-only metrics (removed all individual repo names/URLs). Updated GitHub Action workflow (adoption-report.yml) and monitoring script (scripts/adoption-monitor.mjs) to write reports to `.github/adoption/reports/`. Removed "Built with Squad" showcase link from README.md (deferred to Tier 2 opt-in feature). This honors the principle: collect aggregate metrics via public APIs, but never publish individual repo lists without explicit consent. Test discipline: verified npm run build passes; docs-build.test.ts passed structure tests (Astro build failure unrelated to changes). Committed with clear message explaining privacy rationale.

📌 **Team update (2026-03-10T12-55-49Z):** Adoption tracking Tier 1 complete and merged to decisions.md. Privacy-first architecture confirmed: aggregate metrics only, opt-in for individual repos, public showcase only when 5+ projects opt in. Append-only file governance enforced (no deletions in history.md or decisions.md). Microsoft ampersand style guide adopted for documentation.

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