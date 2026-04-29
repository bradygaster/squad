# EECOM

> Environmental, Electrical, and Consumables Manager

## Learnings

### Batch 10 — Remove interactive shell (REPL) (2026-04-13)

**Context:** Final batch of REPL removal. Deleted the entire `packages/squad-cli/src/cli/shell/` directory (20 source files + components/), removed ink/react deps, removed shell/* package exports, cleaned tsconfig JSX settings, and deleted 33 REPL-only test files. Updated 3 KEEP test files (`shell.test.ts`, `error-messages.test.ts`, `session-store.test.ts`) to import from SDK runtime paths instead of shell paths. Trimmed `shell.test.ts` to only test SDK-available modules (SessionRegistry, coordinator parser) — removed spawn, lifecycle, and stream-bridge sections since those classes were never extracted to SDK. Also deleted `agent-name-extraction.test.ts` and `sdk-failure-scenarios.test.ts` since their primary imports (`parseAgentFromDescription`, shell/index.js) no longer exist and coverage is provided by SDK test files (`sdk-ghost-retry.test.ts`, `sdk-coordinator-parser.test.ts`, `sdk-session-registry.test.ts`).

**Key lesson:** When deleting a module that other test files import from, check each KEEP file's imports against the SDK barrel exports *before* deciding to keep it. If the imported symbols don't exist in the SDK (e.g. `ShellLifecycle`, `StreamBridge`, `ShellRenderer`, `parseAgentFromDescription`), the test must either be trimmed to SDK-available symbols or deleted entirely.

### SDK extraction Batch 6 — team-manifest (2026-04-13)

**Context:** Final extraction batch. Moved team.md parsing (parseTeamManifest, getRoleEmoji, loadWelcomeData + DiscoveredAgent/WelcomeData interfaces) from CLI shell/lifecycle.ts to SDK runtime/team-manifest.ts. Shell file became thin re-export wrapper. ShellLifecycle class stays in CLI — it depends on ShellRenderer and SessionRegistry.

**Key pattern:** getRoleEmoji does keyword matching in priority order — 'lead' matches before 'qa', so "QA Lead" returns the lead emoji (🏗️), not tester (🧪). Tests must respect the match ordering.

**FSStorageProvider import within SDK:** Other runtime files use `import { FSStorageProvider } from '../storage/fs-storage-provider.js'` (relative path, not the package name).

### SDK extraction Batch 1 — error-messages + coordinator-parser (2026-04-13)

**Context:** Phase 1 of REPL removal. Extracted pure functions from CLI shell into SDK runtime:
- `error-messages.ts`: All error guidance factories (sdkDisconnectGuidance, teamConfigGuidance, etc.)
- `coordinator-parser.ts`: parseCoordinatorResponse, hasRosterEntries, formatConversationContext + new MessageLike interface

Shell files became thin re-export wrappers so existing imports keep working. Created SDK-path test files (`test/sdk-error-messages.test.ts`, `test/sdk-coordinator-parser.test.ts`).

**Key pattern:** When extracting functions that depend on shell-specific types (e.g., `ShellMessage`), define a minimal interface (`MessageLike`) in the SDK with only the fields the function actually uses. This decouples the SDK from CLI types.

**Pre-existing build issues:** `comms-teams.ts` had a `TOKEN_PATH` typo (should be `tokenPath`), and `start.ts` has a missing `node-pty` module. Fixed the typo as a drive-by.

### PR #942 rebase — cherry-pick from insider-based fork branch (2026-04-12)

**Context:** PR #942 from tamirdresher's fork was retargeted from `insider` to `dev`, causing 29 files in the diff when only 3 commits (4 files relevant to dev) were the actual fix. Cherry-picked the 3 fix commits onto a clean `squad/942-rebase-type-safety` branch from dev, resolving conflicts where insider-only files (skill.ts, cross-package-exports.test.ts) didn't exist on dev. Dropped the `escapeYamlValue` import and APM YAML generation function from init.ts since skill.ts doesn't exist on dev. Opened #963 as the clean replacement, closed #942.

**Key lesson:** When cherry-picking from an insider-based branch to dev, expect modify/delete conflicts for files that only exist on insider. Always verify the base assumptions of each change — imports referencing insider-only modules must be dropped or adapted.

### Loop command: second-round review fixes (#767) (2025-07-26)

**Context:** Three Copilot review comments on PR #767: (1) `teamRoot` was set to `workTreeRoot` but `.squad/` may live in the main checkout when running inside a git worktree — should derive from `detectSquadDir().path`, (2) `generateLoopFile()` hardcoded the full loop.md scaffold inline, duplicating `templates/loop.md`, (3) docs said `gh` was optional but code hard-requires `gh copilot` unless `--agent-cmd` is passed.

**Fixes:**
1. **teamRoot:** Changed `const teamRoot = workTreeRoot` to `path.dirname(squadDirInfo.path)` — `.squad/`-relative operations now always use the directory where `.squad/` was actually found.
2. **Template dedup:** Replaced 48-line hardcoded template with `readFileSync` reading from `templates/loop.md`. Used `import.meta.url` + `fileURLToPath` to resolve the path from the compiled file (3 levels up to package root). Created `packages/squad-cli/templates/loop.md` since it was missing from the CLI package's templates dir.
3. **Docs:** Updated prerequisites to state `gh` + `gh copilot` are required by default, with `--agent-cmd` as the escape hatch.

**Test impact:** Tests mock `node:fs` globally, so `readFileSync` in `generateLoopFile()` needed mock setup. Added `beforeAll` using `vi.importActual('node:fs')` to read the REAL template file, then `beforeEach` to set the mock return value. This keeps tests validating the actual template content.

**Pattern:** When reading template files in code that has mocked `node:fs` tests, use `vi.importActual<typeof import('node:fs')>('node:fs')` in `beforeAll` to get real filesystem access for loading test fixtures.

### Loop command: streaming output, worktree CWD, docs alignment (#767) (2025-07-25)

**Context:** Copilot code review on PR #767 flagged three issues in the loop command: (1) `execFile` buffered stdout/stderr but never printed it — users saw no Copilot output during loop rounds, (2) `loop.md` was resolved relative to `dest` but execution used `teamRoot` (derived from `.squad/` parent), creating a CWD mismatch in worktree scenarios, (3) docs said `description` defaults to `""` but code uses `'Squad Loop'`.

**Fixes:**
1. **Streaming:** Added `.on('data')` listeners to `currentChild.stdout` and `currentChild.stderr` after `execFile` spawn. Since output streams in real-time, the callback no longer re-writes buffered stdout/stderr on error (would duplicate).
2. **Worktree CWD:** Introduced `workTreeRoot = path.resolve(dest)` and set `teamRoot = workTreeRoot`. Both file resolution and execution CWD now use the same root.
3. **Docs:** Updated `docs/src/content/docs/features/loop.md` description default from `""` to `"Squad Loop"`.

**Key file:** `packages/squad-cli/src/cli/commands/loop.ts` — `runLoop()` entry point (~line 302), `executeRound()` inner function (~line 427).

**Pattern:** When using Node's `execFile` for interactive/long-running child processes, always attach stream listeners for real-time output. The callback's `stdout`/`stderr` args are the same buffered content — writing both duplicates output.

### archiveDecisions() count-based fallback (#626) (2025-07-24)

**Context:** `archiveDecisions()` in `packages/squad-cli/src/cli/core/nap.ts` silently returned `null` when all `###` entries were <30 days old (`old.length === 0`), even if the file was well over 20KB. Active projects generating many decisions per session could hit 145KB+ — 35K tokens burned per agent spawn.

**Fix:** Added a count-based fallback after the age-based split. When `old.length === 0` and total file size exceeds `DECISION_THRESHOLD` (20KB), the fallback separates recent entries into dated vs undated, sorts dated by age (most recent first), keeps entries that fit under the threshold budget, and archives the rest. Undated entries are always preserved — they are foundational directives per Procedures' guidance.

**Key design choices:**
1. Undated entries (`daysAgo === null`) are never archived by the count-based fallback. They stay in `recent`.
2. Budget calculation accounts for header + undated entries + kept dated entries to guarantee the result fits under 20KB.
3. Entries are re-sorted into original document order after the split, so the output file preserves heading sequence.

**Tests:** Added 4 adversarial tests — 50 all-today entries >20KB, mixed dated/undated preservation, under-threshold no-op, exact-threshold boundary case.

**Pattern:** When a function has an early-return optimization (`if (old.length === 0) return null`), always consider whether the condition that triggered the function call (file size > threshold) can still be true when the early-return fires. If so, the early-return is a silent failure.

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

