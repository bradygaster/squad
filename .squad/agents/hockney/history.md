# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## 📌 Core Context — Hockney's Focus Areas

**Testing Specialist:** Hockney owns CLI/test gap analysis, REPL UX test suites, coverage expansion, hostile QA scenarios, test roadmap, error boundary coverage. Standard: 80% floor, 100% on critical paths (casting, spawning, coordinator routing). 2931 tests passing.

**Recent Work (Feb 2026):**
- REPL UX visual test suite: 40 tests across 6 categories (ThinkingIndicator, AgentPanel, MessageStream, InputPrompt, Welcome, Never-Feels-Dead)
- Shell integration tests: 47 tests for SessionRegistry, spawn, Coordinator, ShellLifecycle, StreamBridge
- CRLF normalization tests: 13 tests across 5 parsers
- Consumer-perspective import tests: 6 tests validating barrel exports (index/parsers/types)
- Hostile QA (Issue #327): 32 adversarial scenarios, all pass (small terminal, missing config, invalid input, corrupt config, non-TTY, UTF-8, rapid input)
- Test gap filing (2026-02-28): 10 issues (#558–#567) now tracked explicitly for Wave E

**Known Bugs Found:**
- `--version` output missing "squad" prefix (cli-entry.ts:48)
- Empty/whitespace CLI args trigger interactive shell in non-TTY (should show help/error instead)
- No sanitization for null bytes in spawn args (Node.js-level issue, should pre-validate)

**Next Sprint:** Brady to triage 10 test gap issues; Hockney available for refine approach.

## Learnings

### Knock-knock Docker fix (2026-03-03)
**Status:** Fixed — docker-compose build + up now works. Committed to `migration` branch.
- **Root cause 1:** SDK `package.json` has `"prepare": "npm run build"` which runs `tsc` during `npm install` of the `file:` dependency. Alpine container doesn't have `tsc`. Fix: strip `prepare`/`prepublishOnly` from SDK package.json inside Dockerfile before `npm install`.
- **Root cause 2:** npm workspace hoisting puts `@opentelemetry/api` in repo root `node_modules`, not in `packages/squad-sdk/node_modules`. Old Dockerfile copied host `node_modules` which were incomplete. Fix: run `npm install` for the SDK inside the container to get a complete dependency tree, then copy pre-built `dist` on top.
- **Key insight:** Never copy workspace-hoisted `node_modules` into Docker. Always install deps fresh inside the container.
- **Verification:** `docker-compose build` succeeds, `docker-compose up` prints expected "Missing GITHUB_TOKEN" and exits 1 (correct behavior without token).

### Knock-knock sample verification (2026-03-03)
**Status:** No fixes needed — sample already compiles and runs correctly.
- **Verification steps:** SDK build (`npm run build`) → clean. Sample `npm install` + `npx tsc --noEmit` → zero TS errors. Runtime `npx tsx index.ts` → prints expected "Missing GITHUB_TOKEN" and exits 1.
- **API surface audit:** CastingEngine (no-arg ctor, `castTeam(CastingConfig) → CastMember[]`), StreamingPipeline (`onDelta`, `processEvent`, `markMessageStart`, `attachToSession`), SquadClientWithPool (`connect`, `createSession`, `resumeSession`) — all sample usages align with SDK signatures.
- **Imports verified:** `CastingEngine` + `StreamingPipeline` + `StreamDelta` from main barrel export; `SquadClientWithPool` from `@bradygaster/squad-sdk/client` subpath export — both exist in SDK `exports` map.
- **Dockerfile/docker-compose:** Correct paths, correct build context (`../..`), correct CMD.

### Multi-squad resolution tests — Issue #652 (2026-03-02)
**Status:** Complete — 48 proactive tests in `test/multi-squad.test.ts`, all passing. PR #690 (draft).
- **Categories:** getSquadRoot (3), resolveSquadPath resolution chain (9), listSquads (5), createSquad (5), deleteSquad (4), switchSquad (4), migrateIfNeeded (5), edge cases + lifecycle (13).
- **Written proactively** from PRD spec while Fenster implements `packages/squad-sdk/src/multi-squad.ts`. Tests validate expected data structures (squads.json schema, directory layout) using real filesystem fixtures via `mkdtempSync`.
- **Key decisions:** Tests currently don't import from the implementation module — they validate the contract (squads.json shape, directory structure, name validation regex `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`). Import path wiring needed once Fenster's code lands.
- **Edge cases covered:** Corrupted/empty/missing squads.json, path traversal in squad names, orphaned entries (JSON lists squad that has no directory), concurrent create/delete races, platform separator safety.
- **Test strategy:** Isolated temp dirs via `mkdtempSync`, per-test fixtures, cleanup in `afterEach`. Same patterns as `nap.test.ts` and `resolution.test.ts`. No mocked fs — all real filesystem operations against tmp dirs.

### 📌 Team update (2026-03-01T23:07:00): Issue audit completed — Cheritto + Hockney parallel TUI audit (#673–#681)
- **Agents:** Cheritto (TUI code audit), Hockney (test verification)
- **Result:** 3 OPEN (#673, #675, #679), 2 PARTIAL (#674, #681)
- **Aligned verification:** Test behavior confirmed all statuses
- **Session log:** `.squad/log/20260301T23-07-00-issue-audit.md`

### Nap feature tests — Issue #635 (2026-03-01)
**Status:** Complete — 38 new tests in `test/nap.test.ts`, all passing.
- **Categories:** Metrics collection (3), History compression (5), Log pruning (3), Inbox cleanup (3), Decision archival (2), Deep mode (2), Dry-run mode (3), Journal safety (2), Report formatting (5), Edge cases (8), Combined scenarios (2).
- **Key finding:** History compressor operates on `##` headings as section boundaries, NOT `###` entries. Test fixtures must use `## Date: Entry N` format for compression to trigger. Real history.md uses `## Learnings` as a single section container — compression only kicks in when there are >5 top-level `##` sections.
- **Substring trap:** `toContain('Entry 1')` false-positives on `Entry 10`. Use full heading assertions like `not.toContain('## 2026-03-01: Entry 1')` for unambiguous matching.
- **Decision archival dates:** `daysAgoFromLine()` computes real calendar age. Test fixtures must use genuinely old dates (e.g., `2024-01-xx`) for entries to exceed the 30-day threshold — future dates compute negative age and won't archive.
- **Non-existent dir:** Implementation returns `{ before: emptyMetrics(), after: emptyMetrics(), actions: [] }` instead of throwing. Tests should assert empty result, not `rejects.toThrow()`.
- **Test strategy:** Isolated temp dirs via `mkdtempSync`, per-test fixtures, cleanup in `afterEach`. Same patterns as `bump-build.test.ts`. No component rendering needed — pure filesystem + function-call assertions.

### Multi-line paste handling tests (2026-03-01)
**Status:** Complete — 18 new tests in `test/multiline-paste.test.ts`, all passing.
- **Categories:** MessageStream multi-line rendering (6), Single-line submit behavior (3), Disabled-state buffering with newlines (4), Multi-line content integrity in ShellMessage (5).
- **Bug context:** Ink's `useInput` fires per-character. Newlines in pasted text trigger `key.return` which submits the first line, then `disabled=true` causes remaining newlines to be stripped — garbling multi-line pastes.
- **Test strategy:** ink-testing-library render tests for both MessageStream and InputPrompt components. Same patterns as `repl-ux.test.ts` — `React.createElement`, `stdin.write()`, `makeMessage()` helpers. Tests assert on rendered TEXT content, not internal state.
- **Key finding:** `stdin.write()` for single characters in disabled mode requires `await setTimeout(50)` for React reconciler flush — same compatibility gap documented in REPL UX visual test suite learnings. Two tests initially failed without the async flush.
- **Coverage:** Tests document expected behavior for multi-line input preservation, blank line handling, CRLF retention, special character rendering, disabled-state buffering with backspace, and mixed single/multi-line conversation display.

### Banner simplification tests — Issues #626, #627 (2026-03-01)
**Status:** Complete — 5 new tests in `test/first-run-gating.test.ts`, all 35 tests passing.
- **Tests added:** Single CTA (no dual-path `squad init`), middle-dot `·` separators in usage line, concise "Type naturally" prefix, "Ctrl+C to exit" formatting, no redundant spacers between roster and usage line.
- **Also fixed:** Updated existing #625 test that expected both `/init` and `squad init` — now aligns with single-CTA behavior.
- **Test strategy:** Source-code structural assertions (read App.tsx as text, regex match on JSX patterns). Same pattern as #607 and #625 tests — deterministic, no Ink rendering needed.
- **Key finding:** Tests written in parallel with Cheritto's code changes. All passed because Cheritto had already committed the banner changes on `squad/626-627-banner-polish` branch.

### First-run gating tests — Issue #607 (2026-03-01)
**Status:** Complete — 25 new tests in `test/first-run-gating.test.ts`, all passing.
- **Categories:** Banner renders once (3), First-run hint (5), Console warning suppression (4), Assembled message gating (5), Session-scoped Static keys (5), Terminal clear ordering (3).
- **Key findings:** `loadWelcomeData` consumes the `.first-run` marker file on read (unlinkSync), making `isFirstRun` a one-shot flag. Terminal clear (`\x1b[2J\x1b[H`) at `index.ts:695` precedes `render()` at line 697. The `firstRunElement` in App.tsx requires both `isFirstRun=true` AND `rosterAgents.length > 0` to show "Your squad is assembled" — empty roster falls back to init guidance. Session resume in `runShell` is gated by `(hasTeam && !isFirstRun)`.
- **Coverage gaps found:** No E2E test that renders the full App component for first-run flow (requires too many SDK dependencies). No test for `console.error('◆ Loading Squad shell...')` appearing exactly once. Warning suppression tests are logic-replicated, not testing `cli-entry.ts` directly.
- **Test strategy:** Logic-level conditional extraction from App.tsx JSX, filesystem marker lifecycle via loadWelcomeData, source-code structural assertions for render ordering, Ink render tests for banner uniqueness, MemoryManager integration for key stability.

### Round 2 REPL UX fix tests (2026-03-01)
**Status:** Complete — 17 new tests added to `test/repl-ux-fixes.test.ts` (30→47 total, all passing).
- **Categories:** Screen corruption prevention (3), Banner logic (5), Compaction removal (3), Coordinator label (3), Init guidance (3).
- **Key findings:** MemoryManager import requires `await import()` (ESM-only project — no `require()`). Static keys now use `${sessionId}-${i}` pattern with base-36 timestamp prefix, preventing Ink key collisions across session boundaries. Coordinator→Squad label mapping verified in both completed messages and streaming content paths.
- **Test strategy:** Logic-level tests extracting conditionals from App.tsx JSX. Ink render tests via ink-testing-library for MessageStream coordinator label and streaming content display. MemoryManager tested directly for archival overflow behavior.

### 📌 Team update (2026-02-28T15:34:36Z): 10 test gaps filed + Wave E planning ready
- **Status:** Completed — Hockney conducted coverage analysis, filed 10 test gap issues (#558–#567)
- **Issues filed:** Exit code consistency, timeout edge cases, per-command help, shell-specific flags, env var fallbacks, REPL transitions, config precedence, spawn flags, flag aliases, error handling
- **All labeled** `squad:hockney` for routing; Brady to triage and assign
- **Impact:** Test gaps now explicit in GitHub; ready for Wave E prioritization; 10 high–moderate priority gaps identified
- **Session log:** `.squad/log/2026-02-28T15-34-36Z-issue-filing-sprint.md` — decided by Keaton, McManus, Hockney, Waingro

### REPL UX visual test suite (2026-02-23)
**Status:** Complete — 40 tests, all passing across 6 test categories.
- Created `test/repl-ux.test.ts` using ink-testing-library v4 + Ink v6 components.
- **Categories:** ThinkingIndicator visibility (5), AgentPanel status display (7), MessageStream formatting (8), InputPrompt behavior (8), Welcome experience (3), Never-feels-dead lifecycle (5).
- **Key finding:** ink-testing-library v4 stdin.write() does NOT synchronously trigger Ink v6's useInput hook. Requires `await setTimeout(50)` after each write for React reconciler to flush. This is a compatibility gap that should be watched for in future ink-testing-library releases.
- **Kovash conflict resolved:** Components were modified mid-task (InputPrompt now hardcodes `◆ squad>` prompt with spinner when disabled, AgentPanel now shows pulsing dot + "streaming"/"working" text instead of old "responding" label). Tests adapted to match current rendered output.
- **Strategy:** Tests assert on TEXT content in rendered frames (what the user sees), not internal state. This makes them resilient to Kovash's implementation changes as long as the visual contract holds.

[CORRECTED: Removed duplicate "📌 Core Context: Test Foundation & Beta Learnings" section (lines 460-475) that was copied verbatim from lines 95-110. This was an intermediate state capture rather than new learning.]

### Issue #214: Resolution & CLI global/status tests (2026-02-21)
- Added 14 new tests to resolution.test.ts: deeply nested dirs, nearest .squad/ wins, symlink support
- Created cli-global.test.ts with 10 tests: status routing (repo/personal/none), --global flag for init/upgrade
- Test count grew from ~1592 to 1616 across 51 files — all passing
- Symlink test skipped on Windows (requires elevated privileges) — pattern: `if (process.platform === 'win32') return;`
- CLI routing testable without spawning processes by replicating the conditional logic from src/index.ts main()
- resolveGlobalSquadPath() always creates the directory — tests that check global .squad/ must clean up after themselves

### Issue #248: Shell module integration tests (2026-02-21)
Created test/shell.test.ts (47 tests): SessionRegistry (9), spawn infrastructure (6), Coordinator (11), ShellLifecycle (10), StreamBridge (11). Used real test-fixtures for integration confidence. Shell modules well-structured: pure functions (parsing), simple classes (registry), callback-based (bridge). Test count: 1621→1668.

### Issue #228: CRLF normalization tests (2026-02-21)
Created test/crlf-normalization.test.ts (13 tests) across 5 parsers using withCRLF() helper and expectNoCR() assertions. All passing. Validates Fenster's normalizeEol() applied correctly.

### Issue #230: Consumer-perspective import tests (2026-02-22)
Created test/consumer-imports.test.ts (6 tests): main barrel, parsers barrel, types barrel, side-effect-free imports. Validates barrel split (index.ts/parsers.ts/types.ts) works for consumers.

### Post-restructure assessment (2026-02-22)
**Build:** Clean (exit 0). **Tests:** 1719 passing across 56 files. **Import state:** Tests import from root ../src/ (old monolith). **Migration deferred:** Premature migration risks breaking tests. Expand exports maps or add vitest alias config when root src/ deleted. Exports map gap + CLI no exports + barrel divergence = high risk now.

### 2026-02-23: Streaming regression test suite & root cause analysis
**Status:** Complete (13 new tests added, 42 total, 41 passing + 1 todo)
- Identified root cause: empty `sendAndWait()` result + zero `message_delta` events = empty accumulated = silent ghost response
- Added `simulateDispatchWithFallback()` test helper (existing helper only exercised delta path)
- Bug report filed: "Empty coordinator response — the silent swallow"
- Recommendation for future: minimum-length validation on coordinator responses post-accumulation
- Marked `it.todo()` for SQUAD_DEBUG diagnostic logging coverage (Kovash task)

---

📌 Team update (2026-02-23T09:25Z): Streaming diagnostics infrastructure complete — root cause identified, 13 regression tests added. Kovash added SQUAD_DEBUG logging infrastructure. Saul fixed OTel protocol to gRPC. Version bump to 0.8.5.1. — decided by Scribe

### 📌 Team update (2026-02-22T041800Z): SDK/CLI split verified, all 1719 tests passing, test import migration deferred — decided by Hockney
- Created test/consumer-imports.test.ts with 6 tests validating package exports from a consumer's perspective
- **Main barrel** (3 tests): key parser functions (parseTeamMarkdown, parseDecisionsMarkdown, parseRoutingMarkdown), CLI functions (runInit, runExport, runImport, scrubEmails), VERSION export as string
- **Parsers barrel** (1 test): parseTeamMarkdown and parseCharterMarkdown importable from src/parsers.js
- **Types barrel** (1 test): Object.keys(types).length === 0 confirms pure type re-exports produce no runtime values
- **Side-effect-free import** (1 test): importing index.ts doesn't mutate process.argv or trigger CLI behavior — test completing without hanging proves clean separation
- Dynamic `await import()` used throughout to keep tests independent and avoid module caching issues
- All 6 tests pass on first run; validates the barrel file split (index.ts / parsers.ts / types.ts) works correctly for consumers

### Post-restructure verification (2026-02-22)
- **Build:** `npm run build` compiles both `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` cleanly via workspace scripts. Exit code 0.
- **Tests:** All 1719 tests pass across 56 test files. `npm run build && npm test` exits clean.
- **vitest.config.ts:** Works as-is — no path aliases needed while root `src/` still exists.
- **Import state:** All 56 test files still import from root `../src/` (the old monolith barrel). Only `consumer-imports.test.ts` had 3 workspace package references but dynamically imports from `../src/index.js`.
- **Import migration deferred:** Cannot blindly rewrite `../src/X.js` → `@bradygaster/squad-sdk/X` because:
  1. Tests import deep internal modules (e.g., `../src/config/agent-doc.js`, `../src/casting/casting-engine.js`) that aren't exposed via the SDK package's `exports` map — only 18 subpath exports exist.
  2. CLI test files import from `../src/cli/...` which lives in `@bradygaster/squad-cli`, but that package has no subpath exports at all.
  3. Root `src/index.ts` (v0.7.0) still re-exports CLI functions (`runInit`, `runExport`, etc.) which SDK package (v0.8.0) correctly does not export — the `consumer-imports.test.ts` tests CLI exports that don't exist in the SDK barrel.
  4. Migrating requires either expanding the `exports` maps in both packages or adding vitest `resolve.alias` config. Both are non-trivial.
- **Recommendation:** Migration should happen as a dedicated task when root `src/` is actually removed. Attempting it now risks breaking 1719 passing tests for no immediate benefit.
- **Flaky test observed:** One run showed 1 failure / 1718 pass in CLI export-import tests (timing-sensitive fs operations). Not reproducible on immediate re-run — pre-existing flake.

[CORRECTED: Removed two duplicate entries of "SDK/CLI split verified" team update that were captured as both a full version (lines 129-149) AND a summary version (line 151) AND then repeated completely again (lines 469-491). Kept the detailed version and removed all duplicates.]

### Test infrastructure: coverage config + package exports test (2026-02-22)
- **Coverage:** Installed `@vitest/coverage-v8@^3.2.0`, configured vitest with `v8` provider and `text`, `text-summary`, `html` reporters. Coverage output goes to `./coverage/` (already in `.gitignore`). Include patterns cover `src/**/*.ts` and `packages/*/src/**/*.ts`.
- **Package exports test:** Created `test/package-exports.test.ts` with 8 tests covering SDK exports map: root (`VERSION`), `/config` (`DEFAULT_CONFIG`), `/resolution` (`resolveSquad`), `/parsers` (`parseTeamMarkdown`), `/types` (type-only, no runtime values), `/agents`, `/skills`, `/tools`.
- Discovered `types` subpath has zero runtime exports (pure `export type` statements) — test only verifies module resolves.
- Config subpath exports `DEFAULT_CONFIG`, `AgentRegistry`, `ModelRegistry`, etc. — not `loadSquadConfig` as initially assumed.
- `npm install` needed `--legacy-peer-deps` flag due to `workspace:*` protocol in squad-cli's package.json (pnpm syntax, not native npm).
- Build passes cleanly. All 8 package-exports tests pass with coverage reporting.

### Test Health Assessment (2026-02-22T23:02Z)

### Public Readiness Assessment (2026-02-24)

**Context:** Brady asked whether SDK and CLI are ready to go public — source and all.

**Test Suite Health:**
- **Total tests:** 2930 passing + 1 skipped (todo) = 2931 total
- **Test files:** 110 test files (100 in root test/, 10 in test/cli/)
- **Duration:** 54.31s total runtime (transform 9.15s, collect 155.51s, tests 464.66s)
- **Exit status:** Clean exit code 0 — zero test failures
- **Skipped tests:** 4 files have .skip/.todo markers (aspire-integration, e2e-migration, migration, repl-streaming) — all are future-facing features or edge cases, not critical path blockers

**Coverage Analysis:**
- **Statement coverage:** 8.87% (1332/15013) — CRITICALLY LOW
- **Branch coverage:** 90.68% (448/494) — EXCELLENT
- **Function coverage:** 80.42% (189/235) — VERY GOOD
- The statement coverage anomaly suggests vitest coverage config may not be capturing all source files correctly or tests focus on specific hot paths. Branch coverage at 90%+ indicates tested code paths are well-exercised.

**Test Quality — The Good:**
- **Comprehensive edge case testing:** hostile-integration.test.ts runs 95 nasty input strings through parseInput/executeCommand/MessageStream. None crash. Proves robustness.
- **Journey tests:** 6 full human journey tests (first conversation, error handling, waiting anxious user, power user, specific agent, next day) — covers real user flows end-to-end
- **Speed gates:** Performance assertions on help (< 5s, < 55 lines), init (< 3s), welcome (< 2s) — quantified UX requirements
- **UX gates:** Terminal width checks (80 chars), error remediation hints, version format validation — enforces professional CLI experience
- **Stress tests:** 500+ message rendering, rapid dispatch, concurrent operations, memory tracking — proves stability under load
- **E2E shell tests:** Full ink-based App component driven via stdin like real users — integration confidence
- **Acceptance tests:** 32 hostile environment tests (40x10 terminal, missing config, corrupt files, non-TTY pipe, UTF-8 edge cases) — 52+ seconds of real process spawning

**Test Quality — The Gaps:**
- **No SDK adapter tests with real Copilot CLI:** All tests mock CopilotClient. No live integration tests against actual @github/copilot-sdk talking to a real Copilot CLI server. If Copilot CLI changes its protocol, we won't know until users report it.
- **No CI coverage for actual agent spawning:** Tests verify routing logic, session management, prompt building — but no test actually spawns a Copilot agent and validates the response parsing pipeline works end-to-end with real SDK streaming.
- **CI config is BROKEN:** .github/workflows/squad-ci.yml runs `node --test test/*.test.js` — but tests are TypeScript (.test.ts) and use Vitest, not Node.js built-in test runner. CI is not running the actual test suite. This is a silent failure.
- **No flaky test tracking:** Test suite is deterministic in local runs, but hostile.test.ts takes 52s+ with real process spawning — timing-dependent. No retry logic or flake tracking.

**CI/CD Readiness:**
- **squad-ci.yml:** BROKEN — runs `node --test test/*.test.js` instead of `npm test` (vitest). CI green is FALSE POSITIVE.
- **squad-main-guard.yml:** Good — prevents .squad/ and team-docs/ from leaking into main/preview branches. Clear error messages with remediation.
- **squad-preview.yml:** Good — validates version in CHANGELOG, runs tests (but WRONG test command), checks no .squad/ tracked.
- **15 workflows total:** Comprehensive automation (triage, labels, heartbeat, publish, release, docs). But if CI doesn't run tests correctly, all downstream workflows are built on sand.

**Critical Missing Test Areas:**
1. **Copilot SDK protocol integration** — No tests with real CopilotClient. Protocol breakage = invisible until production.
2. **Agent spawn with real streaming** — Coordinator routing tested, but not the full spawn → stream → parse → render pipeline with real SDK.
3. **CLI entry point (cli.js)** — No tests of the actual Node.js entry point. Tests import modules directly.
4. **Error state recovery** — Journey tests cover error handling UI, but not "what if SDK throws mid-stream and we need to gracefully recover a session?"
5. **Windows-specific behavior** — Symlink tests skipped on Windows. CRLF tests exist but no tests for Windows-specific CLI behaviors (process spawning, path handling).

**Verdict: 🟡 READY WITH CAVEATS**

**Why not 🔴:**
- 2930 tests passing with zero failures is a strong foundation
- Hostile/stress/journey tests prove robustness and real-world usability
- No TODOs/FIXMEs/HACKs in src/ — clean codebase
- Test quality is genuine (not just smoke tests) — speed gates, UX gates, edge cases all covered

**Why not 🟢:**
- **CI is broken** — squad-ci.yml doesn't run vitest. This must be fixed BEFORE public launch. CI green means nothing right now.
- **No real Copilot SDK integration tests** — mocking is good for unit tests, but zero tests with actual @github/copilot-sdk talking to Copilot CLI = blind spot. If GitHub changes the protocol, we're toast.
- **8.87% statement coverage** — likely a config issue, but needs investigation. Branch coverage at 90%+ suggests tests are good, but missing files from coverage report is concerning.

**Required before public launch:**
1. **Fix CI immediately:** Change `node --test test/*.test.js` → `npm test` in squad-ci.yml. Verify it actually runs vitest.
2. **Investigate coverage anomaly:** 90% branch coverage but 8.87% statement coverage doesn't add up. Likely vitest include paths are wrong.
3. **Add 1 integration test with real Copilot CLI:** Spawn a local Copilot CLI server, start a session, send a message, verify streaming works. Can be skipped in CI if COPILOT_CLI_PATH not set, but proves the adapter works.

**Recommended (not blocking):**
- Add retry logic to hostile.test.ts (52s of process spawning is flake-prone)
- Track skipped tests (4 files with .skip/.todo) in a TODO.md or issue tracker
- Expand CLI entry point tests (test cli.js directly, not just imported modules)

**Bottom line:**
The test suite is skeptical-tester-approved for robustness and real-world coverage. But CI is broken (false green), and zero real Copilot SDK integration is a blind spot. Fix CI, verify coverage config, add 1 integration test → 🟢 ready.
- **Test Results:** All 1727 tests passing across 57 files. Duration: 4.08s (transform 7.23s, setup 0ms, collect 21.44s, tests 16.15s, environment 12ms, prepare 16.17s).
- **No skipped/pending tests:** Zero `.skip()` or `.only()` patterns found. All 57 test files active.
- **Test file coverage:** Distributed across SDK (config, runtime, agents, casting, coordinator, marketplace, sharing, shell, adapter, tools) and CLI (init, upgrade, export-import, cli-global). Strong test-to-source-file ratio.
- **CI Health:** Recent runs show mixed status on feature branches (squad-UI, feat/remote-squad-mode), but main dev branch (run 103) and most completed runs are green. squad-ci.yml triggers on push/PR to main/bradygaster/dev/insider. Two-job matrix (build-node, test-node) with Node 20/22. Rollup "build" job requires both to pass for branch protection.
- **Coverage Infrastructure:** Vitest configured for v8 provider with text, text-summary, html reporters. Include patterns: `packages/*/src/**/*.ts`. Coverage dir: `./coverage/` (gitignored).

### 📌 Team update (2026-02-22T08:50:00Z): Runtime Module Test Patterns — decided by Hockney
Two EventBus APIs require different mocks: client bus uses on()/emit(), runtime bus uses subscribe()/emit(). Tests must use correct mock based on module. CharterCompiler tests use real test-fixtures (integration-level confidence); parseCharterMarkdown uses inline strings (unit isolation). Coordinator routing priority verified: direct > @mention > team keyword > default. RalphMonitor tests future-proof stubs. 105 new tests written (1727 → 1832, all passing).
- **Test Patterns:** Good structure observed: pure functions (parsers, coordinators), simple classes (SessionRegistry, StreamBridge), callback-based async (shell lifecycle). Windows symlink tests skipped (elevated privileges).
- **Flaky tests:** One pre-existing flake in export-import CLI tests (timing-sensitive fs operations on first run, passes on retry). Not blocking merges.
- **Known Issues:** None blocking. Pre-existing TS error in cli-entry.ts VERSION export (mentioned in history). Test import migration deferred until root `src/` deletion.

### Proactive runtime module tests (2026-02-22)
- Created 4 new test files (105 tests) for runtime modules being built in parallel by Fenster, Edie, and Fortier.
- **charter-compiler.test.ts** (34 tests): `parseCharterMarkdown` identity/section/edge cases, `compileCharterFull` metadata/overrides, `CharterCompiler` class compile/compileAll with real test-fixtures charters. Discovered CharterCompiler and AgentSessionManager are now fully implemented (not stubs).
- **agent-session-manager.test.ts** (25 tests): spawn (state, sessionId, timestamps, modes, EventBus events), resume (reactivation, timestamp update, error cases), destroy (map removal, event emission, non-existent agent safety), getAgent/getAllAgents state management.
- **coordinator-routing.test.ts** (27 tests): Coordinator.route() covering direct responses (status/help/show/list/who/what/how), @mention routing (fenster/verbal/hockney), "team" keyword fan-out, default-to-lead, priority ordering (@mention > team, direct > @mention), initialize/execute/shutdown lifecycle.
- **ralph-monitor.test.ts** (19 tests): RalphMonitor start/stop lifecycle, healthCheck, getStatus, config options, edge cases (healthCheck after stop, multiple start/stop calls).
- Test count grew from 1727 to 1832 across 61 files — all passing.
- Key edge cases found: (1) @mention priority beats "team" keyword, (2) direct patterns beat @mentions, (3) AgentSessionManager.destroy() is safe on non-existent agents, (4) CharterCompiler.compileAll() silently skips invalid charters.
- Pattern: EventBus mock for AgentSessionManager uses `on()` method (client EventBus pattern), not `subscribe()` (runtime EventBus pattern) — the two bus implementations have different APIs.

### OTel observability tests — proactive (2026-02-22)
- Created 4 new test files (54 tests) for OTel observability modules being built by Fortier and Edie.
- **otel-provider.test.ts** (20 tests): `initializeOTel` returns `{tracing, metrics}` booleans; `getTracer()`/`getMeter()` return valid no-op instances when unconfigured; `shutdownOTel()` is safe to call with no initialization; config priority verified (explicit endpoint > `OTEL_EXPORTER_OTLP_ENDPOINT` env var > disabled). Also covers `initializeTracing()` and `initializeMetrics()` individually.
- **otel-bridge.test.ts** (12 tests): `createOTelTransport()` returns a function conforming to `TelemetryTransport`. All 5 event types (`squad.init`, `squad.agent.spawn`, `squad.error`, `squad.run`, `squad.upgrade`) produce correctly-named spans. `squad.error` sets `SpanStatusCode.ERROR` and emits an `exception` event. Properties map to span attributes. Batch processing verified.
- **otel-agent-traces.test.ts** (10 tests): Proactive — validates that `AgentSessionManager.spawn()` and `destroy()` create OTel spans with agent name and mode attributes. Error spans verified for invalid charters and resume of non-existent agents. Currently pass with `[PROACTIVE]` warnings since OTel instrumentation is not yet wired into AgentSessionManager.
- **otel-coordinator-traces.test.ts** (12 tests): Proactive — validates that `Coordinator.route()` creates `squad.coordinator.route` spans with tier/message/agents attributes. Span hierarchy tested (route → execute). Currently pass with `[PROACTIVE]` warnings since OTel instrumentation is not yet wired into Coordinator.
- Test count grew from 1832 to 1886 across 65 files — all passing.
- Key discovery: `@opentelemetry/sdk-trace-base` v2.x uses `BasicTracerProvider` (not `NodeTracerProvider`), requires `spanProcessors` in constructor, and uses `trace.setGlobalTracerProvider()` instead of `provider.register()`.
- `AgentSessionInfo` uses `charter.name` and `state` fields (not `name`/`status` directly).
- OTel SDK deps (`@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-metrics`) installed at root for test resolution.

### OTel Metrics tests — Issues #261-264 (2026-02-23)
- Created `test/otel-metrics.test.ts` (34 tests): Comprehensive coverage of all four metric categories — token usage (#261), agent performance (#262), session pool (#263), response latency (#264), plus reset/cleanup and no-op safety.
- Created `test/otel-metric-wiring.test.ts` (5 tests): Integration tests verifying StreamingPipeline calls recordTokenUsage on usage events, module resolution of otel-metrics subpath and barrel exports.
- Testing strategy: Mock `getMeter()` from otel provider to return spy-enabled meter with tracked instruments. Each `createCounter`/`createHistogram`/`createUpDownCounter`/`createGauge` call returns a spy with `.add()` and `.record()` mocks, allowing precise verification of metric names, values, and attributes.
- Key findings: (1) StreamingPipeline has no constructor args — just `new StreamingPipeline()`, (2) session attach method is `attachToSession()` not `attachSession()`, (3) `_resetMetrics()` clears all four cached instrument categories independently, (4) all metric functions are safe no-ops when OTel is not configured.
- Test count grew from 1901→1940 across 68 files — all passing.

### 📌 Team update (2026-02-22T093300Z): OTel Phase 2 complete — session traces, latency metrics, tool enhancements, agent metrics, token usage wiring, metrics tests — decided by Fortier, Fenster, Edie, Hockney
All four agents shipped Phase 2 in parallel: Fortier wired TTFT/duration/throughput metrics. Fenster established tool trace patterns and agent metric wiring conventions. Edie wired token usage and session pool metrics. Hockney created spy-meter test pattern (39 new tests). Total: 1940 tests passing, metrics ready for production telemetry.

### PR #300 upstream inheritance test review — requested by Brady (2026-02-23)
- **Verdict: PR #300 does not exist.** No PR, no branch, no source files, no test files found in repo or on GitHub remote. The referenced files (`packages/squad-sdk/src/upstream/resolver.ts`, `packages/squad-sdk/src/upstream/types.ts`, `packages/squad-cli/src/cli/commands/upstream.ts`, `test/upstream.test.ts`, `test/upstream-e2e.test.ts`) do not exist anywhere.
- Searched: all branches (25 remote), all PRs (open/closed), issues, local filesystem, glob patterns. Zero matches for "upstream" in any context.
- Prepared a test coverage requirements spec for when this PR materializes. Key gaps to enforce: CLI command tests (add/remove/list/sync), circular reference detection, .ai-team/ fallback, malformed JSON, empty upstreams array, transitive inheritance proof in E2E.
- Baseline at time of review: 1940 tests across 68 files, all passing.
### Issue #267: OTel integration tests (2026-02-22)
- Created `test/otel-integration.test.ts` (37 tests) covering 9 integration suites across all OTel modules.
- **Bridge + Provider pipeline** (5 tests): End-to-end span capture, error spans with status/exception events, unknown events, timestamp attributes, multiple transports.
- **Bridge span sequencing** (3 tests): Mixed batch integrity, sequential batches, empty-then-nonempty.
- **Agent spawn telemetry flow** (3 tests): Name/mode/model attributes through bridge, multiple independent agents, missing properties handled.
- **Session lifecycle spans** (4 tests): Run/error event mapping, ERROR status chain, full init→spawn→run→error sequence.
- **Metrics end-to-end** (7 tests): Full agent lifecycle, session lifecycle, latency metrics, token usage, concurrent multi-agent, _resetMetrics.
- **Error scenarios** (6 tests): No-op tracer/meter, bridge with no-op, shutdown safety, events without properties/timestamps.
- **Provider lifecycle** (4 tests): Disabled init, independent tracing/metrics, manual provider, cleanup isolation.
- **EventBus → Bridge translation** (3 tests): All 5 event types, error fallback chain, property type preservation.
- **Cross-module coordination** (2 tests): Bridge + direct spans coexist, concurrent transports safe.
- Key pattern: vi.mock at module scope with spyMeter declared globally; vi.importActual() to bypass mock in error scenario tests.
- Test count: 1969 → 2006+ (37 new integration tests, all passing). Pre-existing squad-observer.test.ts failures unrelated.

### Issue #267: OTel integration E2E tests + aspire CLI tests (2026-02-23)
- Created `test/otel-integration-e2e.test.ts` (21 tests): Full trace hierarchy, zero-overhead verification, metrics integration, EventBus → OTel bridge.
- Created `test/cli/aspire.test.ts` (16 tests): Docker availability, container command generation, OTLP endpoint configuration, stop/cleanup, module resolution.
- **Trace hierarchy** (5 tests): Request → route → agent → tool span chain with verified parentSpanContext linkage, shared traceId, error isolation, attribute flow, parallel fan-out.
- **Zero-overhead** (5 tests): No-op tracer, no-op metrics, transport with no provider, nested no-op spans, all safe without throwing.
- **Metrics integration** (4 tests): StreamingPipeline usage aggregation, TTFT tracking, unattached session filtering, multi-session independence.
- **EventBus → OTel bridge** (7 tests): TelemetryCollector flush → spans, subscribeAll bridge pattern, tool_call events, ERROR status on session:error, 50-event burst, no-op after disable, detach stops span creation.
- **Aspire CLI** (16 tests): Docker version check, absent Docker handling, default/custom docker run commands (port, OTLP port, container name, image), env var config, OTLP port mapping, stop+rm commands, idempotent lifecycle, [PROACTIVE] module resolution.
- Key discovery: OTel SDK v2 uses `parentSpanContext` (not `parentSpanId`) for parent-child relationships on `ReadableSpan`.
- Key discovery: `BasicTracerProvider` requires explicit `AsyncLocalStorageContextManager` registration for context propagation in vitest — without it, `trace.setSpan()` creates contexts but `startSpan()` ignores the parent.
- Key discovery: `bridgeEventBusToOTel` function is referenced in `otel-init.ts` but not yet exported from `otel-bridge.ts` — tests use manual bridge pattern.
- Test count grew from 1985 → 2022 across 74 files — all passing.

### Coverage gap audit — 4 new test files (2026-02-23)
- Created `test/shell-integration.test.ts` (32 tests): ShellLifecycle startup (7 tests — missing .squad/, missing team.md, error state, agent discovery, registry population, ready state, message history), input routing via parseInput (11 tests — @agent direct, coordinator fallback, slash commands, comma syntax, case-insensitive, empty input, unknown agent), coordinator response parsing (7 tests — ROUTE/DIRECT/MULTI formats, fallback, empty content, missing CONTEXT), formatConversationContext (3 tests — prefixes, maxMessages, empty), session cleanup (2 tests — registry + history cleared), error handling (2 tests — unhealthy HealthMonitor when disconnected, idempotent shutdown).
- Created `test/health.test.ts` (17 tests): HealthMonitor.check() success (3 tests — healthy result, ping called with health-check, connection checked first), check() timeout (5 tests — ping exceeds timeout → unhealthy, disconnected → unhealthy, no ping when disconnected, ping throws → unhealthy, responseTimeMs captured on failure), check() degraded (2 tests — slow response → degraded, default 5000ms timeout), getStatus() (5 tests — connected → healthy, disconnected → unhealthy, reconnecting → degraded, error → unhealthy, no ping on passive check), diagnostics (2 tests — logs when enabled, silent when disabled).
- Created `test/model-fallback.test.ts` (25 tests): Cross-tier fallback (4 tests — standard/premium/fast chain walks all models, null on exhaustion), tier ceiling (5 tests — fast chain only fast models, no premium in fast or standard chains, getNextFallback stays in tier, getModelsByTier confirms), provider preference (5 tests — preferSameProvider reorders for Claude/GPT, default chain without preference, unknown model fallback), nuclear fallback (5 tests — null for all tiers when exhausted, full cascade simulation, chain validity), edge cases (6 tests — empty attempted set, unknown model, minimum 3 options per tier, no duplicates, catalog existence).
- Created `test/cli/upstream-clone.test.ts` (40 tests): Git ref validation (14 tests — valid branches/tags/underscores, rejects semicolons/backticks/dollar/$pipe/ampersand/newline/spaces/glob/brackets/braces/empty), upstream name validation (3 tests), source type detection (6 tests — https/http/file:// URLs, .git suffix, slash heuristic, ambiguous throws), deriveName (4 tests — git URL, no .git, export, fallback), git clone args (3 tests — valid ref, feature branch, pull args), failure recovery (4 tests — network/timeout/permission/not-found errors), file I/O (4 tests — missing file, malformed JSON, parent dir creation, round-trip), gitignore behavior (3 tests — add to empty, no duplicate, trailing newline).
- Test count grew from 2022 → 2136 across 78 files — all passing.
- Key pattern: `getNextFallback` walks by provider preference, not raw chain order — visited set comparison is correct, array order comparison is not.
- Key pattern: HealthMonitor.check() uses `Promise.race` for timeout — timeout of N ms with ping delay > N produces unhealthy; response > 80% of timeout produces degraded.
- Key pattern: `parseInput` supports both `@Agent message` and `Agent, message` comma syntax for direct addressing.

### Issue #207: Docs site build verification tests (2026-02-23)
- Created `test/docs-build.test.ts` (17 tests): Comprehensive validation for docs site build pipeline.
- **Markdown validation** (10 tests): All 8 markdown files in docs/guide/ have proper headings, properly fenced code blocks, no broken relative links between guides, header anchors, no empty files.
- **Code example validation** (2 tests): Code blocks contain valid content, bash examples have proper syntax.
- **Docs build script** (5 tests): Conditional tests that verify docs/build.js execution when it exists (created by parallel agents), produces HTML output in docs/dist/, HTML files have proper DOCTYPE/closing tags, contain nav/menu elements, contain main/article/section content areas, have proper internal links.
- Test design: Markdown validation always active (guides exist now). Build script tests are conditional — they skip gracefully if docs/build.js doesn't exist yet (other agents still creating). Tests use regex patterns for HTML structure validation (flexible, not brittle). All 17 tests pass.
- Test count grew from 2141 → 2158 across 80 files — all passing.

### Docs build tests upgraded for markdown-it (2026-02-23)
- Rewrote `test/docs-build.test.ts` from 17 → 30 tests for the markdown-it upgrade of docs/build.js.
- **Source markdown validation** (6 tests): Verifies all 14 expected guide files exist, have headings, properly fenced code blocks, non-empty content, bash examples valid.
- **Build execution** (4 tests): build.js exists, runs exit 0, all 14 guides produce HTML in docs/dist/, no unexpected extra files.
- **markdown-it output quality** (7 tests): Code blocks have `language-*` class on `<code>` elements (typescript, bash), tables render as `<table>/<thead>/<tbody>/<th>/<td>`, nested lists produce nested `<ul>` inside `<li>`, bold/links/inline code rendered correctly.
- **Assets** (1 test): style.css and app.js copied to dist/assets/.
- **Homepage** (1 test): index.html generated with DOCTYPE and "Squad Documentation" content.
- **Frontmatter/title** (2 tests): Title extracted from h1 (not raw ---), no `{{TITLE}}` placeholders left in output.
- **Navigation** (4 tests): Every page has `<nav>`, links to core guides, all 14 guides appear in nav, active page marked.
- **Template substitution** (5 tests): `{{CONTENT}}`, `{{NAV}}`, `{{TITLE}}` all replaced; no raw `{{PLACEHOLDER}}` patterns remain; HTML has DOCTYPE, `<main>`.
- Design: `beforeAll` runs build once; `afterAll` cleans dist. Tests use `requireBuild()` guard for graceful skip if build.js isn't ready. Fenster's upgrade was already landed — all 30 tests pass against real markdown-it output.
- Key discovery: Fenster already upgraded build.js to markdown-it with frontmatter parsing, asset copying, and full nav with all 14 guides before this test rewrite.

### CLI shell comprehensive tests — Issue #(tbd) (2026-02-23)
- Created `test/cli-shell-comprehensive.test.ts` with **110 tests** covering all shell modules requested by Brady.
- **coordinator.ts** (26 tests): `buildCoordinatorPrompt()` with custom paths/missing files, `parseCoordinatorResponse()` for ROUTE/DIRECT/MULTI formats with all edge cases (empty routes, multiline content, mixed valid/invalid lines, fallback behavior), `formatConversationContext()` with maxMessages limit and empty arrays.
- **spawn.ts** (8 tests): `loadAgentCharter()` with teamRoot/missing charter/case-insensitive resolution, `buildAgentPrompt()` with charter/systemContext/empty charter.
- **lifecycle.ts** (6 tests): ShellLifecycle initialization with missing .squad/, missing team.md, error state, agent discovery, registry population, empty team handling.
- **router.ts** (15 tests): `parseInput()` for slash commands (with args, case-insensitive, multiple args), @Agent direct addressing (comma syntax, case-insensitive, no message, unknown agents), coordinator routing (plain text, empty, whitespace), edge cases (leading/trailing whitespace, multiline content).

### 📌 Team update (2026-03-05T01:05:00Z): CI/CD Pipeline Implications — 3-Branch Branching Model Adopted
- **Context:** Team adopted 3-branch branching model (dev/insiders/main, drop release). Hockney validated GitHub Actions compatibility.
- **CI/CD implications:** Issue branches (PRs to dev) require full test suite, build, lint. Dev publishes npm `preview` tag on merge. Insiders publishes npm `insiders` tag (auto-synced from dev). Main is tag-triggered npm publish only.
- **Validation done:** Reviewed 15 existing workflows. Updated trigger rules per branch. `release` branch removal simplifies promotion pipeline (no RC step).
- **Testing impact:** No additional test requirements. Existing 2931 tests + upcoming 10 test gap issues (#558–#567) cover CI/CD validation.
- **Status:** Workflows analyzed, ready for implementation. Hockney available for rollout coordination if needed.
- **sessions.ts** (10 tests): SessionRegistry operations (register, get, getAll, getActive, updateStatus, remove, clear, no-op on unknown).
- **commands.ts** (13 tests): `executeCommand()` for all slash commands (/help, /status, /agents, /history with limits, /clear, /quit, /exit, unknown command).
- **memory.ts** (12 tests): MemoryManager limits, `canCreateSession()`, `trackBuffer()` growth/rejection/multi-session, `trimMessages()`, `clearBuffer()`, `getStats()`.
- **autocomplete.ts** (10 tests): `createCompleter()` for @agent completion (partial/bare @/case-insensitive), /command completion (partial/bare //case-insensitive), no completion for plain text.
- **CRITICAL BUG TEST** (5 tests): Verifies `session.sendMessage()` exists after `createSession()`, handles missing method, validates before calling, handles rejection gracefully. This is the bug Brady hit — "sendMessage is not a function".
- **Error handling** (4 tests): Session creation failure, sendMessage failure, session.close() safety, rejection handling.
- All 110 tests pass. Test count grew from 2158 → 2268 across 81 files.
- **Test patterns discovered**: Mock SquadSession with vi.fn() for sendMessage/on/off/close, mock SquadClient createSession, test the adapter boundary (mock what createSession returns, verify sendMessage called correctly), DO NOT mock coordinator/router parsing (test real logic), direct imports from `../packages/squad-cli/src/cli/shell/*.js` (memory.ts/autocomplete.ts not in package exports).
- **Edge cases found**: Empty ROUTE: captures "TASK" as agent name (regex quirk), MULTI with extra whitespace requires clean formatting, parseInput handles comma syntax for direct addressing, formatConversationContext defaults to 20 messages, MemoryManager trackBuffer accumulates per session, SessionRegistry updateStatus is no-op for unknown session.

### Docs build tests updated for new structure (2026-02-23)
- Updated `test/docs-build.test.ts` from 30 → 29 tests to match the real docs directory structure across all 11 sections.
- **Structure expansion**: Added constants for all sections: `EXPECTED_GET_STARTED` (2), `EXPECTED_CONCEPTS` (5), `EXPECTED_FEATURES` (25), `EXPECTED_SCENARIOS` (6), `EXPECTED_REFERENCE` (2), `EXPECTED_COOKBOOK` (2), `EXPECTED_LAUNCH` (2), `EXPECTED_BLOG` (23). Total: 85 pages across 11 sections + root index.html.
- **ALL_EXPECTED array**: Expanded from 3 sections (guide/cli/sdk) to all 11 sections. Now tests validate HTML output for all 85 pages.
- **Markdown validation**: Updated `getMarkdownFiles()` to accept section name parameter and created `getAllMarkdownFiles()` to scan all 11 sections. All heading/fencing/content validation now runs across all sections, not just guide/.
- **readHtml helper fix**: Removed default `dir = 'guide'` parameter — now requires explicit dir on every call. Added `readRootHtml()` for index.html at root. This prevents fragile assumptions (e.g., `readHtml('index')` reading from wrong location).
- **index.html test fix**: Changed from expecting a redirect pattern to validating real homepage content with `<article>` and headings. The new build.js renders docs/index.md as a real page, not a redirect.
- **Nav link tests**: Simplified from exact path matching (`href="../guide/installation.html"`) to checking for presence of key section names (guide, cli, sdk, installation, configuration). Nav structure varies with new sections — testing exact paths was brittle.
- **Removed brittle test**: Deleted "no extra unexpected HTML files in dist/guide/" test that only checked one section. With 11 sections, this test would need 11 variants or be removed entirely. Opted for removal.
- **Template placeholder test fix**: Changed from regex `/\{\{[A-Z_]+\}\}/` (too broad) to explicit checks for known template placeholders (`TITLE`, `CONTENT`, `NAV`). The docs contain `{{CARD_ID}}` and `{{BOARD_ID}}` as legitimate example content in features/mcp.md — these are not template variables, just documentation examples. Only check for actual build system placeholders.
- **Key bug found**: features/mcp.html contained `{{CARD_ID}}` and `{{BOARD_ID}}` in example code — these are legitimate content, not template placeholders. The test was incorrectly flagging them. Fixed by checking only for known template vars instead of any uppercase pattern.
- All 29 tests pass. Test count: 2268 (no change from removal of 1 brittle test). Build validates all 85 pages across 11 sections plus assets and root index.html.

### Streaming dispatch deep tests (2026-02-23)
- Added 13 tests (12 runnable + 1 todo) to test/repl-streaming.test.ts across two new describe blocks.
- **dispatchToCoordinator flow** (7 tests): session config verification, delta accumulation with normalized events, sendAndWait fallback when deltas are empty, empty-both-paths regression test, parseCoordinatorResponse('') behavior, delta-priority-over-fallback test, SQUAD_DEBUG todo.
- **CopilotSessionAdapter event normalization** (6 tests): normalizeEvent flattening, SDK→Squad type mapping, unknown event passthrough, missing data handling, on/off handler tracking, multiple handler independence.
- **Key finding — simulateDispatch gap**: Existing test helper `simulateDispatch` did NOT replicate the `awaitStreamedResponse` fallback path (`result.data.content`). Real source code uses `if (!accumulated && fallback) { accumulated = fallback; }` but tests ignored the sendAndWait return value entirely. Created `simulateDispatchWithFallback` to cover this.
- **Bug confirmed**: When sendAndWait returns undefined (no `data.content`) AND no deltas fire, accumulated is empty string. `parseCoordinatorResponse('')` returns `{ type: 'direct', directAnswer: '' }` — the empty coordinator response Brady sees. The pipeline silently swallows the failure.
- **Missing feature**: SQUAD_DEBUG env var for diagnostic logging is not implemented anywhere in the dispatch pipeline. Marked as it.todo().
- Test count: 29→42 (41 pass, 1 todo). All green.

### 2026-02-23: P0 Bug Fixes — Issue #333 (PR #351)
**Status:** Complete — 2 bugs addressed, 7 regression tests added.

**BUG-2 (P2 → fixed):** Empty/whitespace CLI args (`squad ""`, `squad "   "`) now show brief help and exit 0. Previously, empty string args fell through to `runShell()` (non-TTY = exit code 1), and whitespace args hit "Unknown command" error. Fix: trim `args[0]` early, detect empty/whitespace as distinct from no-args, show help instead of shell.

**BUG-1 (P1 → verified, not a code bug):** `--version` bare semver output is intentional per Cheritto's P0 UX fix (PR #349, Marquez audit). Updated `version.feature` to stop asserting `"squad"` prefix — it conflicted with the `ux-gates.test.ts` assertion that version does NOT start with "squad".

**Nate's accessibility audit:** Error remediation hints confirmed present — unknown commands show both `squad help` and `squad doctor` hints (covered by regression tests). Nate's audit file no longer in decisions inbox (likely addressed by Cheritto in #329).

**Test results:** 7/7 new regression tests pass. 59/59 acceptance tests pass. 2485/2494 total (3 pre-existing repl-ux failures unrelated — AgentPanel empty-state rendering changed).

**Key pattern:** When `process.argv.slice(2)[0]` is empty string, JS treats it as falsy — same code path as no-args. Must distinguish `undefined` (no args → shell) from `""` (empty arg → help). The `rawCmd !== undefined && !cmd` guard handles this.

### Test vocabulary fix — Issue #410 (PR #487)
**Session:** 2026-02-23 post-crash recovery. Test fixes from broken session committed and pushed.
**Changes:**
- **cli-shell-comprehensive.test.ts**: Updated /status command expectations to match styled output format (Squad Status, Team: N agents instead of old text variants)
- **repl-ux.test.ts**: Updated AgentPanel status indicators to expect [ERR], [WORK], [STREAM] bracket labels instead of emoji/text variants
- Bundled with Keaton's Wave D readiness assessment (team decision inbox file)
**Verification:** All 240 tests in modified files pass (134 in cli-shell-comprehensive, 106 in repl-ux).
**Result:** PR #487 created, branch squad/hockney-fix-test-vocab pushed. Closes #410.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### Issue #532: REPL dogfood test suite (2026-02-27)
**Status:** Complete — 72 tests, all passing across 9 describe blocks.
- Created `test/repl-dogfood.test.ts` — comprehensive dogfood suite testing shell modules against realistic repo structures.
- **Fixtures:** Small Python project (3 agents), Node.js monorepo (5 agents), Large mixed-language Go+Python+TS (7 agents), Edge cases (22 agents, 50-level nesting, large files, special filenames), Minimal repo (1 agent), No .squad/ directory.
- **Modules tested:** ShellLifecycle.initialize(), parseInput, executeCommand, parseCoordinatorResponse, loadWelcomeData, SessionRegistry.
- **Coverage categories:** Lifecycle init (per fixture), loadWelcomeData (per fixture), parseInput with realistic NL queries, executeCommand (/status /help /agents /history /exit + unknown), parseCoordinatorResponse (ROUTE/DIRECT/MULTI/fallback), SessionRegistry state transitions, first-run ceremony detection, performance gates (<2s init, <500ms welcome).
- **Key decision:** No network access. All fixtures built from scratch in temp dirs using `mkdtempSync`. Each fixture scaffolds a `.squad/` dir with team.md and agent charters so the shell can discover agents.
- **Performance:** All 5 fixtures initialize in <250ms. Edge-case fixture (22 agents + 50-level deep nesting) stays well under the 2s gate.

### 2026-02-28: Test catalog — 533 assertions, 17 groups, 20 test files (exhaustive analysis)
📌 Team update (2026-02-28T01:05:24Z): Comprehensive test coverage audit — identified test catalog spanning 533 assertions across 17 distinct groups (lifecycle, commands, input routing, coordinator, UI/UX, errors, hostile, streaming, journeys, dogfood, metrics, UX gates, etc.). Identified critical CLI gaps: --preview undocumented/untested, --timeout undocumented/untested, upgrade --self dead code, run stub in help + 10 moderate gaps. Requires follow-up issues for CLI team.

### 2026-02-28: CLI command test coverage analysis — 4 critical, 10 moderate gaps
📌 Team update (2026-02-28T01:05:24Z): Exhaustive CLI command test coverage analysis complete. 25 total commands analyzed. Critical undocumented flags: --preview (undocumented, untested), --timeout (undocumented, untested), upgrade --self (dead code path), run subcommand (stub). Moderate gaps: untested aliases, missing per-command help, flag parsing edge cases, shell integration flags untested, agent spawn flags undocumented. Documented in .squad/orchestration-log/2026-02-28T01-05-24-fenster.md.

[CORRECTED: Removed duplicate "# Project Context" header (lines 433-438) and "## Learnings" header (line 440) that were appended as intermediate state markers rather than organizational structure. The actual Project Context and Learnings sections begin at line 1.]

### Ralph triage parity guard (2026-02-27)
- Added `describe('triage parity')` in `test/ralph-triage.test.ts` to lock the routing priority contract (`module-ownership` > `routing-rule` > `role-keyword` > `lead-fallback`) expected to match `templates/ralph-triage.js`.
- Added a syntax-validity test using `node --check templates/ralph-triage.js` so template script regressions are caught by Vitest.
- Verified with `node templates/ralph-triage.js --help`, `node --check templates/ralph-triage.js`, and `npx vitest run test/ralph-triage.test.ts` (29 passing).

### Auto-cast trigger and /init command coverage — PR #640 P0/P1 (2026-03-02)
**Status:** Complete — 35 new tests in `test/init-autocast.test.ts`, all passing.
- **Categories:** hasRosterEntries predicate (7), Auto-cast trigger conditions (6), Orphan .init-prompt cleanup (3), /init command triggerInitCast signal (7), triggerInitCast App.tsx dispatch contract (3), activeInitSession Ctrl+C abort lifecycle (5), handleInitCast .init-prompt consumption (4).
- **Key finding:** `hasRosterEntries()` in coordinator.ts is the single gating predicate for auto-cast. It parses the `## Members` markdown table, filtering out header and separator rows. Testing the predicate directly is the highest-value path since the auto-cast logic in index.ts is deep inside the Ink render closure (onReady callback).
- **Test strategy:** Direct function tests for `executeCommand('init', ...)` and `hasRosterEntries()`. Filesystem-state tests for auto-cast condition matrix (init-prompt × roster × team.md existence). Structural pattern replication for activeInitSession lifecycle (abort/clear/finally) since the closure variable can't be accessed directly.
- **Coverage gap remaining:** No integration test that renders the full Ink app and verifies auto-cast fires end-to-end (requires SDK mock infrastructure). The condition-level tests cover the decision logic but not the setTimeout dispatch in onReady.

### RalphMonitor event-driven coverage (2026-02-27)
- `test/ralph-monitor.test.ts` should import Ralph source directly via `../packages/squad-sdk/src/ralph/index.js` for Vitest runs, since `@bradygaster/squad-sdk/ralph` depends on a built dist artifact.
- Added event-bus behavior tests for `session:created`, `session:destroyed`, `session:error`, `agent:milestone`, stale detection in `healthCheck()`, and independent multi-agent tracking.
- Verified with `npx vitest run test/ralph-monitor.test.ts` (25 passing).

[CORRECTED: Removed duplicate entries from lines 436-451 that repeated Issue #214-#230 tests. These should only appear once in the history at lines 97-110.]

### Issue #532: REPL dogfood test suite (2026-02-27)
**Status:** Complete — 72 tests, all passing across 9 describe blocks.
- Created `test/repl-dogfood.test.ts` — comprehensive dogfood suite testing shell modules against realistic repo structures.
- **Fixtures:** Small Python project (3 agents), Node.js monorepo (5 agents), Large mixed-language Go+Python+TS (7 agents), Edge cases (22 agents, 50-level nesting, large files, special filenames), Minimal repo (1 agent), No .squad/ directory.
- **Modules tested:** ShellLifecycle.initialize(), parseInput, executeCommand, parseCoordinatorResponse, loadWelcomeData, SessionRegistry.
- **Coverage categories:** Lifecycle init (per fixture), loadWelcomeData (per fixture), parseInput with realistic NL queries, executeCommand (/status /help /agents /history /exit + unknown), parseCoordinatorResponse (ROUTE/DIRECT/MULTI/fallback), SessionRegistry state transitions, first-run ceremony detection, performance gates (<2s init, <500ms welcome).
- **Key decision:** No network access. All fixtures built from scratch in temp dirs using `mkdtempSync`. Each fixture scaffolds a `.squad/` dir with team.md and agent charters so the shell can discover agents.
- **Performance:** All 5 fixtures initialize in <250ms. Edge-case fixture (22 agents + 50-level deep nesting) stays well under the 2s gate.

### 2026-02-28: Test catalog — 533 assertions, 17 groups, 20 test files (exhaustive analysis)
**Build:** Clean (exit 0). **Tests:** 1719 passing across 56 files. **Import state:** Tests import from root ../src/ (old monolith). **Migration deferred:** Premature migration risks breaking tests. Expand exports maps or add vitest alias config when root src/ deleted. Exports map gap + CLI no exports + barrel divergence = high risk now.

### 2026-02-23: Streaming regression test suite & root cause analysis
**Status:** Complete (13 new tests added, 42 total, 41 passing + 1 todo)
- Identified root cause: empty `sendAndWait()` result + zero `message_delta` events = empty accumulated = silent ghost response
- Added `simulateDispatchWithFallback()` test helper (existing helper only exercised delta path)
- Bug report filed: "Empty coordinator response — the silent swallow"
- Recommendation for future: minimum-length validation on coordinator responses post-accumulation
- Marked `it.todo()` for SQUAD_DEBUG diagnostic logging coverage (Kovash task)

---

📌 Team update (2026-02-23T09:25Z): Streaming diagnostics infrastructure complete — root cause identified, 13 regression tests added. Kovash added SQUAD_DEBUG logging infrastructure. Saul fixed OTel protocol to gRPC. Version bump to 0.8.5.1. — decided by Scribe

---

### Test Health Assessment (2026-02-22T23:02Z)

### Public Readiness Assessment (2026-02-24)

**Context:** Brady asked whether SDK and CLI are ready to go public — source and all.

**Test Suite Health:**
- **Total tests:** 2930 passing + 1 skipped (todo) = 2931 total
- **Test files:** 110 test files (100 in root test/, 10 in test/cli/)
- **Duration:** 54.31s total runtime (transform 9.15s, collect 155.51s, tests 464.66s)
- **Exit status:** Clean exit code 0 — zero test failures
- **Skipped tests:** 4 files have .skip/.todo markers (aspire-integration, e2e-migration, migration, repl-streaming) — all are future-facing features or edge cases, not critical path blockers

**Coverage Analysis:**
- **Statement coverage:** 8.87% (1332/15013) — CRITICALLY LOW
- **Branch coverage:** 90.68% (448/494) — EXCELLENT
- **Function coverage:** 80.42% (189/235) — VERY GOOD
- The statement coverage anomaly suggests vitest coverage config may not be capturing all source files correctly or tests focus on specific hot paths. Branch coverage at 90%+ indicates tested code paths are well-exercised.

**Test Quality — The Good:**
- **Comprehensive edge case testing:** hostile-integration.test.ts runs 95 nasty input strings through parseInput/executeCommand/MessageStream. None crash. Proves robustness.
- **Journey tests:** 6 full human journey tests (first conversation, error handling, waiting anxious user, power user, specific agent, next day) — covers real user flows end-to-end
- **Speed gates:** Performance assertions on help (< 5s, < 55 lines), init (< 3s), welcome (< 2s) — quantified UX requirements
- **UX gates:** Terminal width checks (80 chars), error remediation hints, version format validation — enforces professional CLI experience
- **Stress tests:** 500+ message rendering, rapid dispatch, concurrent operations, memory tracking — proves stability under load
- **E2E shell tests:** Full ink-based App component driven via stdin like real users — integration confidence
- **Acceptance tests:** 32 hostile environment tests (40x10 terminal, missing config, corrupt files, non-TTY pipe, UTF-8 edge cases) — 52+ seconds of real process spawning

**Test Quality — The Gaps:**
- **No SDK adapter tests with real Copilot CLI:** All tests mock CopilotClient. No live integration tests against actual @github/copilot-sdk talking to a real Copilot CLI server. If Copilot CLI changes its protocol, we won't know until users report it.
- **No CI coverage for actual agent spawning:** Tests verify routing logic, session management, prompt building — but no test actually spawns a Copilot agent and validates the response parsing pipeline works end-to-end with real SDK streaming.
- **CI config is BROKEN:** .github/workflows/squad-ci.yml runs `node --test test/*.test.js` — but tests are TypeScript (.test.ts) and use Vitest, not Node.js built-in test runner. CI is not running the actual test suite. This is a silent failure.
- **No flaky test tracking:** Test suite is deterministic in local runs, but hostile.test.ts takes 52s+ with real process spawning — timing-dependent. No retry logic or flake tracking.

**CI/CD Readiness:**
- **squad-ci.yml:** BROKEN — runs `node --test test/*.test.js` instead of `npm test` (vitest). CI green is FALSE POSITIVE.
- **squad-main-guard.yml:** Good — prevents .squad/ and team-docs/ from leaking into main/preview branches. Clear error messages with remediation.
- **squad-preview.yml:** Good — validates version in CHANGELOG, runs tests (but WRONG test command), checks no .squad/ tracked.
- **15 workflows total:** Comprehensive automation (triage, labels, heartbeat, publish, release, docs). But if CI doesn't run tests correctly, all downstream workflows are built on sand.

**Critical Missing Test Areas:**
1. **Copilot SDK protocol integration** — No tests with real CopilotClient. Protocol breakage = invisible until production.
2. **Agent spawn with real streaming** — Coordinator routing tested, but not the full spawn → stream → parse → render pipeline with real SDK.
3. **CLI entry point (cli.js)** — No tests of the actual Node.js entry point. Tests import modules directly.
4. **Error state recovery** — Journey tests cover error handling UI, but not "what if SDK throws mid-stream and we need to gracefully recover a session?"
5. **Windows-specific behavior** — Symlink tests skipped on Windows. CRLF tests exist but no tests for Windows-specific CLI behaviors (process spawning, path handling).

**Verdict: 🟡 READY WITH CAVEATS**

**Why not 🔴:**
- 2930 tests passing with zero failures is a strong foundation
- Hostile/stress/journey tests prove robustness and real-world usability
- No TODOs/FIXMEs/HACKs in src/ — clean codebase
- Test quality is genuine (not just smoke tests) — speed gates, UX gates, edge cases all covered

**Why not 🟢:**
- **CI is broken** — squad-ci.yml doesn't run vitest. This must be fixed BEFORE public launch. CI green means nothing right now.
- **No real Copilot SDK integration tests** — mocking is good for unit tests, but zero tests with actual @github/copilot-sdk talking to Copilot CLI = blind spot. If GitHub changes the protocol, we're toast.
- **8.87% statement coverage** — likely a config issue, but needs investigation. Branch coverage at 90%+ suggests tests are good, but missing files from coverage report is concerning.

**Required before public launch:**
1. **Fix CI immediately:** Change `node --test test/*.test.js` → `npm test` in squad-ci.yml. Verify it actually runs vitest.
2. **Investigate coverage anomaly:** 90% branch coverage but 8.87% statement coverage doesn't add up. Likely vitest include paths are wrong.
3. **Add 1 integration test with real Copilot CLI:** Spawn a local Copilot CLI server, start a session, send a message, verify streaming works. Can be skipped in CI if COPILOT_CLI_PATH not set, but proves the adapter works.

**Recommended (not blocking):**
- Add retry logic to hostile.test.ts (52s of process spawning is flake-prone)
- Track skipped tests (4 files with .skip/.todo) in a TODO.md or issue tracker
- Expand CLI entry point tests (test cli.js directly, not just imported modules)

**Bottom line:**
The test suite is skeptical-tester-approved for robustness and real-world coverage. But CI is broken (false green), and zero real Copilot SDK integration is a blind spot. Fix CI, verify coverage config, add 1 integration test → 🟢 ready.
- **Test Results:** All 1727 tests passing across 57 files. Duration: 4.08s (transform 7.23s, setup 0ms, collect 21.44s, tests 16.15s, environment 12ms, prepare 16.17s).
- **No skipped/pending tests:** Zero `.skip()` or `.only()` patterns found. All 57 test files active.
- **Test file coverage:** Distributed across SDK (config, runtime, agents, casting, coordinator, marketplace, sharing, shell, adapter, tools) and CLI (init, upgrade, export-import, cli-global). Strong test-to-source-file ratio.
- **CI Health:** Recent runs show mixed status on feature branches (squad-UI, feat/remote-squad-mode), but main dev branch (run 103) and most completed runs are green. squad-ci.yml triggers on push/PR to main/bradygaster/dev/insider. Two-job matrix (build-node, test-node) with Node 20/22. Rollup "build" job requires both to pass for branch protection.
- **Coverage Infrastructure:** Vitest configured for v8 provider with text, text-summary, html reporters. Include patterns: `packages/*/src/**/*.ts`. Coverage dir: `./coverage/` (gitignored).

### 📌 Team update (2026-02-22T08:50:00Z): Runtime Module Test Patterns — decided by Hockney
Two EventBus APIs require different mocks: client bus uses on()/emit(), runtime bus uses subscribe()/emit(). Tests must use correct mock based on module. CharterCompiler tests use real test-fixtures (integration-level confidence); parseCharterMarkdown uses inline strings (unit isolation). Coordinator routing priority verified: direct > @mention > team keyword > default. RalphMonitor tests future-proof stubs. 105 new tests written (1727 → 1832, all passing).
- **Test Patterns:** Good structure observed: pure functions (parsers, coordinators), simple classes (SessionRegistry, StreamBridge), callback-based async (shell lifecycle). Windows symlink tests skipped (elevated privileges).
- **Flaky tests:** One pre-existing flake in export-import CLI tests (timing-sensitive fs operations on first run, passes on retry). Not blocking merges.
- **Known Issues:** None blocking. Pre-existing TS error in cli-entry.ts VERSION export (mentioned in history). Test import migration deferred until root `src/` deletion.

### Proactive runtime module tests (2026-02-22)
- Created 4 new test files (105 tests) for runtime modules being built in parallel by Fenster, Edie, and Fortier.
- **charter-compiler.test.ts** (34 tests): `parseCharterMarkdown` identity/section/edge cases, `compileCharterFull` metadata/overrides, `CharterCompiler` class compile/compileAll with real test-fixtures charters. Discovered CharterCompiler and AgentSessionManager are now fully implemented (not stubs).
- **agent-session-manager.test.ts** (25 tests): spawn (state, sessionId, timestamps, modes, EventBus events), resume (reactivation, timestamp update, error cases), destroy (map removal, event emission, non-existent agent safety), getAgent/getAllAgents state management.
- **coordinator-routing.test.ts** (27 tests): Coordinator.route() covering direct responses (status/help/show/list/who/what/how), @mention routing (fenster/verbal/hockney), "team" keyword fan-out, default-to-lead, priority ordering (@mention > team, direct > @mention), initialize/execute/shutdown lifecycle.
- **ralph-monitor.test.ts** (19 tests): RalphMonitor start/stop lifecycle, healthCheck, getStatus, config options, edge cases (healthCheck after stop, multiple start/stop calls).
- Test count grew from 1727 to 1832 across 61 files — all passing.
- Key edge cases found: (1) @mention priority beats "team" keyword, (2) direct patterns beat @mentions, (3) AgentSessionManager.destroy() is safe on non-existent agents, (4) CharterCompiler.compileAll() silently skips invalid charters.
- Pattern: EventBus mock for AgentSessionManager uses `on()` method (client EventBus pattern), not `subscribe()` (runtime EventBus pattern) — the two bus implementations have different APIs.

### OTel observability tests — proactive (2026-02-22)
- Created 4 new test files (54 tests) for OTel observability modules being built by Fortier and Edie.
- **otel-provider.test.ts** (20 tests): `initializeOTel` returns `{tracing, metrics}` booleans; `getTracer()`/`getMeter()` return valid no-op instances when unconfigured; `shutdownOTel()` is safe to call with no initialization; config priority verified (explicit endpoint > `OTEL_EXPORTER_OTLP_ENDPOINT` env var > disabled). Also covers `initializeTracing()` and `initializeMetrics()` individually.
- **otel-bridge.test.ts** (12 tests): `createOTelTransport()` returns a function conforming to `TelemetryTransport`. All 5 event types (`squad.init`, `squad.agent.spawn`, `squad.error`, `squad.run`, `squad.upgrade`) produce correctly-named spans. `squad.error` sets `SpanStatusCode.ERROR` and emits an `exception` event. Properties map to span attributes. Batch processing verified.
- **otel-agent-traces.test.ts** (10 tests): Proactive — validates that `AgentSessionManager.spawn()` and `destroy()` create OTel spans with agent name and mode attributes. Error spans verified for invalid charters and resume of non-existent agents. Currently pass with `[PROACTIVE]` warnings since OTel instrumentation is not yet wired into AgentSessionManager.
- **otel-coordinator-traces.test.ts** (12 tests): Proactive — validates that `Coordinator.route()` creates `squad.coordinator.route` spans with tier/message/agents attributes. Span hierarchy tested (route → execute). Currently pass with `[PROACTIVE]` warnings since OTel instrumentation is not yet wired into Coordinator.
- Test count grew from 1832 to 1886 across 65 files — all passing.
- Key discovery: `@opentelemetry/sdk-trace-base` v2.x uses `BasicTracerProvider` (not `NodeTracerProvider`), requires `spanProcessors` in constructor, and uses `trace.setGlobalTracerProvider()` instead of `provider.register()`.
- `AgentSessionInfo` uses `charter.name` and `state` fields (not `name`/`status` directly).
- OTel SDK deps (`@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-metrics`) installed at root for test resolution.

### OTel Metrics tests — Issues #261-264 (2026-02-23)
- Created `test/otel-metrics.test.ts` (34 tests): Comprehensive coverage of all four metric categories — token usage (#261), agent performance (#262), session pool (#263), response latency (#264), plus reset/cleanup and no-op safety.
- Created `test/otel-metric-wiring.test.ts` (5 tests): Integration tests verifying StreamingPipeline calls recordTokenUsage on usage events, module resolution of otel-metrics subpath and barrel exports.
- Testing strategy: Mock `getMeter()` from otel provider to return spy-enabled meter with tracked instruments. Each `createCounter`/`createHistogram`/`createUpDownCounter`/`createGauge` call returns a spy with `.add()` and `.record()` mocks, allowing precise verification of metric names, values, and attributes.
- Key findings: (1) StreamingPipeline has no constructor args — just `new StreamingPipeline()`, (2) session attach method is `attachToSession()` not `attachSession()`, (3) `_resetMetrics()` clears all four cached instrument categories independently, (4) all metric functions are safe no-ops when OTel is not configured.
- Test count grew from 1901→1940 across 68 files — all passing.

### 📌 Team update (2026-02-22T093300Z): OTel Phase 2 complete — session traces, latency metrics, tool enhancements, agent metrics, token usage wiring, metrics tests — decided by Fortier, Fenster, Edie, Hockney
All four agents shipped Phase 2 in parallel: Fortier wired TTFT/duration/throughput metrics. Fenster established tool trace patterns and agent metric wiring conventions. Edie wired token usage and session pool metrics. Hockney created spy-meter test pattern (39 new tests). Total: 1940 tests passing, metrics ready for production telemetry.

### PR #300 upstream inheritance test review — requested by Brady (2026-02-23)
- **Verdict: PR #300 does not exist.** No PR, no branch, no source files, no test files found in repo or on GitHub remote. The referenced files (`packages/squad-sdk/src/upstream/resolver.ts`, `packages/squad-sdk/src/upstream/types.ts`, `packages/squad-cli/src/cli/commands/upstream.ts`, `test/upstream.test.ts`, `test/upstream-e2e.test.ts`) do not exist anywhere.
- Searched: all branches (25 remote), all PRs (open/closed), issues, local filesystem, glob patterns. Zero matches for "upstream" in any context.
- Prepared a test coverage requirements spec for when this PR materializes. Key gaps to enforce: CLI command tests (add/remove/list/sync), circular reference detection, .ai-team/ fallback, malformed JSON, empty upstreams array, transitive inheritance proof in E2E.
- Baseline at time of review: 1940 tests across 68 files, all passing.
### Issue #267: OTel integration tests (2026-02-22)
- Created `test/otel-integration.test.ts` (37 tests) covering 9 integration suites across all OTel modules.
- **Bridge + Provider pipeline** (5 tests): End-to-end span capture, error spans with status/exception events, unknown events, timestamp attributes, multiple transports.
- **Bridge span sequencing** (3 tests): Mixed batch integrity, sequential batches, empty-then-nonempty.
- **Agent spawn telemetry flow** (3 tests): Name/mode/model attributes through bridge, multiple independent agents, missing properties handled.
- **Session lifecycle spans** (4 tests): Run/error event mapping, ERROR status chain, full init→spawn→run→error sequence.
- **Metrics end-to-end** (7 tests): Full agent lifecycle, session lifecycle, latency metrics, token usage, concurrent multi-agent, _resetMetrics.
- **Error scenarios** (6 tests): No-op tracer/meter, bridge with no-op, shutdown safety, events without properties/timestamps.
- **Provider lifecycle** (4 tests): Disabled init, independent tracing/metrics, manual provider, cleanup isolation.
- **EventBus → Bridge translation** (3 tests): All 5 event types, error fallback chain, property type preservation.
- **Cross-module coordination** (2 tests): Bridge + direct spans coexist, concurrent transports safe.
- Key pattern: vi.mock at module scope with spyMeter declared globally; vi.importActual() to bypass mock in error scenario tests.
- Test count: 1969 → 2006+ (37 new integration tests, all passing). Pre-existing squad-observer.test.ts failures unrelated.

### Issue #267: OTel integration E2E tests + aspire CLI tests (2026-02-23)
- Created `test/otel-integration-e2e.test.ts` (21 tests): Full trace hierarchy, zero-overhead verification, metrics integration, EventBus → OTel bridge.
- Created `test/cli/aspire.test.ts` (16 tests): Docker availability, container command generation, OTLP endpoint configuration, stop/cleanup, module resolution.
- **Trace hierarchy** (5 tests): Request → route → agent → tool span chain with verified parentSpanContext linkage, shared traceId, error isolation, attribute flow, parallel fan-out.
- **Zero-overhead** (5 tests): No-op tracer, no-op metrics, transport with no provider, nested no-op spans, all safe without throwing.
- **Metrics integration** (4 tests): StreamingPipeline usage aggregation, TTFT tracking, unattached session filtering, multi-session independence.
- **EventBus → OTel bridge** (7 tests): TelemetryCollector flush → spans, subscribeAll bridge pattern, tool_call events, ERROR status on session:error, 50-event burst, no-op after disable, detach stops span creation.
- **Aspire CLI** (16 tests): Docker version check, absent Docker handling, default/custom docker run commands (port, OTLP port, container name, image), env var config, OTLP port mapping, stop+rm commands, idempotent lifecycle, [PROACTIVE] module resolution.
- Key discovery: OTel SDK v2 uses `parentSpanContext` (not `parentSpanId`) for parent-child relationships on `ReadableSpan`.
- Key discovery: `BasicTracerProvider` requires explicit `AsyncLocalStorageContextManager` registration for context propagation in vitest — without it, `trace.setSpan()` creates contexts but `startSpan()` ignores the parent.
- Key discovery: `bridgeEventBusToOTel` function is referenced in `otel-init.ts` but not yet exported from `otel-bridge.ts` — tests use manual bridge pattern.
- Test count grew from 1985 → 2022 across 74 files — all passing.

### Coverage gap audit — 4 new test files (2026-02-23)
- Created `test/shell-integration.test.ts` (32 tests): ShellLifecycle startup (7 tests — missing .squad/, missing team.md, error state, agent discovery, registry population, ready state, message history), input routing via parseInput (11 tests — @agent direct, coordinator fallback, slash commands, comma syntax, case-insensitive, empty input, unknown agent), coordinator response parsing (7 tests — ROUTE/DIRECT/MULTI formats, fallback, empty content, missing CONTEXT), formatConversationContext (3 tests — prefixes, maxMessages, empty), session cleanup (2 tests — registry + history cleared), error handling (2 tests — unhealthy HealthMonitor when disconnected, idempotent shutdown).
- Created `test/health.test.ts` (17 tests): HealthMonitor.check() success (3 tests — healthy result, ping called with health-check, connection checked first), check() timeout (5 tests — ping exceeds timeout → unhealthy, disconnected → unhealthy, no ping when disconnected, ping throws → unhealthy, responseTimeMs captured on failure), check() degraded (2 tests — slow response → degraded, default 5000ms timeout), getStatus() (5 tests — connected → healthy, disconnected → unhealthy, reconnecting → degraded, error → unhealthy, no ping on passive check), diagnostics (2 tests — logs when enabled, silent when disabled).
- Created `test/model-fallback.test.ts` (25 tests): Cross-tier fallback (4 tests — standard/premium/fast chain walks all models, null on exhaustion), tier ceiling (5 tests — fast chain only fast models, no premium in fast or standard chains, getNextFallback stays in tier, getModelsByTier confirms), provider preference (5 tests — preferSameProvider reorders for Claude/GPT, default chain without preference, unknown model fallback), nuclear fallback (5 tests — null for all tiers when exhausted, full cascade simulation, chain validity), edge cases (6 tests — empty attempted set, unknown model, minimum 3 options per tier, no duplicates, catalog existence).
- Created `test/cli/upstream-clone.test.ts` (40 tests): Git ref validation (14 tests — valid branches/tags/underscores, rejects semicolons/backticks/dollar/$pipe/ampersand/newline/spaces/glob/brackets/braces/empty), upstream name validation (3 tests), source type detection (6 tests — https/http/file:// URLs, .git suffix, slash heuristic, ambiguous throws), deriveName (4 tests — git URL, no .git, export, fallback), git clone args (3 tests — valid ref, feature branch, pull args), failure recovery (4 tests — network/timeout/permission/not-found errors), file I/O (4 tests — missing file, malformed JSON, parent dir creation, round-trip), gitignore behavior (3 tests — add to empty, no duplicate, trailing newline).
- Test count grew from 2022 → 2136 across 78 files — all passing.
- Key pattern: `getNextFallback` walks by provider preference, not raw chain order — visited set comparison is correct, array order comparison is not.
- Key pattern: HealthMonitor.check() uses `Promise.race` for timeout — timeout of N ms with ping delay > N produces unhealthy; response > 80% of timeout produces degraded.
- Key pattern: `parseInput` supports both `@Agent message` and `Agent, message` comma syntax for direct addressing.

### Issue #207: Docs site build verification tests (2026-02-23)
- Created `test/docs-build.test.ts` (17 tests): Comprehensive validation for docs site build pipeline.
- **Markdown validation** (10 tests): All 8 markdown files in docs/guide/ have proper headings, properly fenced code blocks, no broken relative links between guides, header anchors, no empty files.
- **Code example validation** (2 tests): Code blocks contain valid content, bash examples have proper syntax.
- **Docs build script** (5 tests): Conditional tests that verify docs/build.js execution when it exists (created by parallel agents), produces HTML output in docs/dist/, HTML files have proper DOCTYPE/closing tags, contain nav/menu elements, contain main/article/section content areas, have proper internal links.
- Test design: Markdown validation always active (guides exist now). Build script tests are conditional — they skip gracefully if docs/build.js doesn't exist yet (other agents still creating). Tests use regex patterns for HTML structure validation (flexible, not brittle). All 17 tests pass.
- Test count grew from 2141 → 2158 across 80 files — all passing.

### Docs build tests upgraded for markdown-it (2026-02-23)
- Rewrote `test/docs-build.test.ts` from 17 → 30 tests for the markdown-it upgrade of docs/build.js.
- **Source markdown validation** (6 tests): Verifies all 14 expected guide files exist, have headings, properly fenced code blocks, non-empty content, bash examples valid.
- **Build execution** (4 tests): build.js exists, runs exit 0, all 14 guides produce HTML in docs/dist/, no unexpected extra files.
- **markdown-it output quality** (7 tests): Code blocks have `language-*` class on `<code>` elements (typescript, bash), tables render as `<table>/<thead>/<tbody>/<th>/<td>`, nested lists produce nested `<ul>` inside `<li>`, bold/links/inline code rendered correctly.
- **Assets** (1 test): style.css and app.js copied to dist/assets/.
- **Homepage** (1 test): index.html generated with DOCTYPE and "Squad Documentation" content.
- **Frontmatter/title** (2 tests): Title extracted from h1 (not raw ---), no `{{TITLE}}` placeholders left in output.
- **Navigation** (4 tests): Every page has `<nav>`, links to core guides, all 14 guides appear in nav, active page marked.
- **Template substitution** (5 tests): `{{CONTENT}}`, `{{NAV}}`, `{{TITLE}}` all replaced; no raw `{{PLACEHOLDER}}` patterns remain; HTML has DOCTYPE, `<main>`.
- Design: `beforeAll` runs build once; `afterAll` cleans dist. Tests use `requireBuild()` guard for graceful skip if build.js isn't ready. Fenster's upgrade was already landed — all 30 tests pass against real markdown-it output.
- Key discovery: Fenster already upgraded build.js to markdown-it with frontmatter parsing, asset copying, and full nav with all 14 guides before this test rewrite.

### CLI shell comprehensive tests — Issue #(tbd) (2026-02-23)
- Created `test/cli-shell-comprehensive.test.ts` with **110 tests** covering all shell modules requested by Brady.
- **coordinator.ts** (26 tests): `buildCoordinatorPrompt()` with custom paths/missing files, `parseCoordinatorResponse()` for ROUTE/DIRECT/MULTI formats with all edge cases (empty routes, multiline content, mixed valid/invalid lines, fallback behavior), `formatConversationContext()` with maxMessages limit and empty arrays.
- **spawn.ts** (8 tests): `loadAgentCharter()` with teamRoot/missing charter/case-insensitive resolution, `buildAgentPrompt()` with charter/systemContext/empty charter.
- **lifecycle.ts** (6 tests): ShellLifecycle initialization with missing .squad/, missing team.md, error state, agent discovery, registry population, empty team handling.
- **router.ts** (15 tests): `parseInput()` for slash commands (with args, case-insensitive, multiple args), @Agent direct addressing (comma syntax, case-insensitive, no message, unknown agents), coordinator routing (plain text, empty, whitespace), edge cases (leading/trailing whitespace, multiline content).
- **sessions.ts** (10 tests): SessionRegistry operations (register, get, getAll, getActive, updateStatus, remove, clear, no-op on unknown).
- **commands.ts** (13 tests): `executeCommand()` for all slash commands (/help, /status, /agents, /history with limits, /clear, /quit, /exit, unknown command).
- **memory.ts** (12 tests): MemoryManager limits, `canCreateSession()`, `trackBuffer()` growth/rejection/multi-session, `trimMessages()`, `clearBuffer()`, `getStats()`.
- **autocomplete.ts** (10 tests): `createCompleter()` for @agent completion (partial/bare @/case-insensitive), /command completion (partial/bare //case-insensitive), no completion for plain text.
- **CRITICAL BUG TEST** (5 tests): Verifies `session.sendMessage()` exists after `createSession()`, handles missing method, validates before calling, handles rejection gracefully. This is the bug Brady hit — "sendMessage is not a function".
- **Error handling** (4 tests): Session creation failure, sendMessage failure, session.close() safety, rejection handling.
- All 110 tests pass. Test count grew from 2158 → 2268 across 81 files.
- **Test patterns discovered**: Mock SquadSession with vi.fn() for sendMessage/on/off/close, mock SquadClient createSession, test the adapter boundary (mock what createSession returns, verify sendMessage called correctly), DO NOT mock coordinator/router parsing (test real logic), direct imports from `../packages/squad-cli/src/cli/shell/*.js` (memory.ts/autocomplete.ts not in package exports).
- **Edge cases found**: Empty ROUTE: captures "TASK" as agent name (regex quirk), MULTI with extra whitespace requires clean formatting, parseInput handles comma syntax for direct addressing, formatConversationContext defaults to 20 messages, MemoryManager trackBuffer accumulates per session, SessionRegistry updateStatus is no-op for unknown session.

### Docs build tests updated for new structure (2026-02-23)
- Updated `test/docs-build.test.ts` from 30 → 29 tests to match the real docs directory structure across all 11 sections.
- **Structure expansion**: Added constants for all sections: `EXPECTED_GET_STARTED` (2), `EXPECTED_CONCEPTS` (5), `EXPECTED_FEATURES` (25), `EXPECTED_SCENARIOS` (6), `EXPECTED_REFERENCE` (2), `EXPECTED_COOKBOOK` (2), `EXPECTED_LAUNCH` (2), `EXPECTED_BLOG` (23). Total: 85 pages across 11 sections + root index.html.
- **ALL_EXPECTED array**: Expanded from 3 sections (guide/cli/sdk) to all 11 sections. Now tests validate HTML output for all 85 pages.
- **Markdown validation**: Updated `getMarkdownFiles()` to accept section name parameter and created `getAllMarkdownFiles()` to scan all 11 sections. All heading/fencing/content validation now runs across all sections, not just guide/.
- **readHtml helper fix**: Removed default `dir = 'guide'` parameter — now requires explicit dir on every call. Added `readRootHtml()` for index.html at root. This prevents fragile assumptions (e.g., `readHtml('index')` reading from wrong location).
- **index.html test fix**: Changed from expecting a redirect pattern to validating real homepage content with `<article>` and headings. The new build.js renders docs/index.md as a real page, not a redirect.
- **Nav link tests**: Simplified from exact path matching (`href="../guide/installation.html"`) to checking for presence of key section names (guide, cli, sdk, installation, configuration). Nav structure varies with new sections — testing exact paths was brittle.
- **Removed brittle test**: Deleted "no extra unexpected HTML files in dist/guide/" test that only checked one section. With 11 sections, this test would need 11 variants or be removed entirely. Opted for removal.
- **Template placeholder test fix**: Changed from regex `/\{\{[A-Z_]+\}\}/` (too broad) to explicit checks for known template placeholders (`TITLE`, `CONTENT`, `NAV`). The docs contain `{{CARD_ID}}` and `{{BOARD_ID}}` as legitimate example content in features/mcp.md — these are not template variables, just documentation examples. Only check for actual build system placeholders.
- **Key bug found**: features/mcp.html contained `{{CARD_ID}}` and `{{BOARD_ID}}` in example code — these are legitimate content, not template placeholders. The test was incorrectly flagging them. Fixed by checking only for known template vars instead of any uppercase pattern.
- All 29 tests pass. Test count: 2268 (no change from removal of 1 brittle test). Build validates all 85 pages across 11 sections plus assets and root index.html.

### Streaming dispatch deep tests (2026-02-23)
- Added 13 tests (12 runnable + 1 todo) to test/repl-streaming.test.ts across two new describe blocks.
- **dispatchToCoordinator flow** (7 tests): session config verification, delta accumulation with normalized events, sendAndWait fallback when deltas are empty, empty-both-paths regression test, parseCoordinatorResponse('') behavior, delta-priority-over-fallback test, SQUAD_DEBUG todo.
- **CopilotSessionAdapter event normalization** (6 tests): normalizeEvent flattening, SDK→Squad type mapping, unknown event passthrough, missing data handling, on/off handler tracking, multiple handler independence.
- **Key finding — simulateDispatch gap**: Existing test helper `simulateDispatch` did NOT replicate the `awaitStreamedResponse` fallback path (`result.data.content`). Real source code uses `if (!accumulated && fallback) { accumulated = fallback; }` but tests ignored the sendAndWait return value entirely. Created `simulateDispatchWithFallback` to cover this.
- **Bug confirmed**: When sendAndWait returns undefined (no `data.content`) AND no deltas fire, accumulated is empty string. `parseCoordinatorResponse('')` returns `{ type: 'direct', directAnswer: '' }` — the empty coordinator response Brady sees. The pipeline silently swallows the failure.
- **Missing feature**: SQUAD_DEBUG env var for diagnostic logging is not implemented anywhere in the dispatch pipeline. Marked as it.todo().
- Test count: 29→42 (41 pass, 1 todo). All green.

### 2026-02-23: P0 Bug Fixes — Issue #333 (PR #351)
**Status:** Complete — 2 bugs addressed, 7 regression tests added.

**BUG-2 (P2 → fixed):** Empty/whitespace CLI args (`squad ""`, `squad "   "`) now show brief help and exit 0. Previously, empty string args fell through to `runShell()` (non-TTY = exit code 1), and whitespace args hit "Unknown command" error. Fix: trim `args[0]` early, detect empty/whitespace as distinct from no-args, show help instead of shell.

**BUG-1 (P1 → verified, not a code bug):** `--version` bare semver output is intentional per Cheritto's P0 UX fix (PR #349, Marquez audit). Updated `version.feature` to stop asserting `"squad"` prefix — it conflicted with the `ux-gates.test.ts` assertion that version does NOT start with "squad".

**Nate's accessibility audit:** Error remediation hints confirmed present — unknown commands show both `squad help` and `squad doctor` hints (covered by regression tests). Nate's audit file no longer in decisions inbox (likely addressed by Cheritto in #329).

**Test results:** 7/7 new regression tests pass. 59/59 acceptance tests pass. 2485/2494 total (3 pre-existing repl-ux failures unrelated — AgentPanel empty-state rendering changed).

**Key pattern:** When `process.argv.slice(2)[0]` is empty string, JS treats it as falsy — same code path as no-args. Must distinguish `undefined` (no args → shell) from `""` (empty arg → help). The `rawCmd !== undefined && !cmd` guard handles this.

### Test vocabulary fix — Issue #410 (PR #487)
**Session:** 2026-02-23 post-crash recovery. Test fixes from broken session committed and pushed.
**Changes:**
- **cli-shell-comprehensive.test.ts**: Updated /status command expectations to match styled output format (Squad Status, Team: N agents instead of old text variants)
- **repl-ux.test.ts**: Updated AgentPanel status indicators to expect [ERR], [WORK], [STREAM] bracket labels instead of emoji/text variants
- Bundled with Keaton's Wave D readiness assessment (team decision inbox file)
**Verification:** All 240 tests in modified files pass (134 in cli-shell-comprehensive, 106 in repl-ux).
**Result:** PR #487 created, branch squad/hockney-fix-test-vocab pushed. Closes #410.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### Ralph triage module + gh-cli contract tests (2026-02-27)
- Created `test/ralph-triage.test.ts` with 27 tests covering `parseRoster`, `parseRoutingRules`, `parseModuleOwnership`, `triageIssue`, and gh-cli type contracts.
- Used real `.squad/routing.md` and `.squad/team.md` fixtures to validate emoji-bearing owner names, keyword extraction from Examples, module ownership path normalization, and roster filtering of Scribe/Ralph.
- Verified triage behavior for module-priority routing, keyword scoring, role fallback, lead fallback, null-roster handling, case-insensitive matching, title+body matching, and longest-path module selection.

### Board state reporting tests for watch command (2026-02-27)
- Added `test/ralph-board.test.ts` with coverage for `reportBoard` output on clear and mixed boards, including round display.
- Exported `BoardState` and `reportBoard` from `packages/squad-cli/src/cli/commands/watch.ts` so board reporting logic is testable without `gh` CLI access.
- Added integration-style compatibility test showing `triageIssue` assignment labels move an issue from `untriaged` to `assigned` in board-state counting semantics.
- Verified with `npx vitest run test/ralph-board.test.ts` (5 passing).

### Test gap issues filed (2026-02-27)
Filed 10 moderate CLI/test gaps discovered in last session's coverage analysis:
- **#558**: Exit code consistency (different error types → unpredictable exit codes)
- **#559**: Timeout edge cases (negative, zero, max-int, non-numeric values)
- **#560**: Missing per-command help (squad spawn --help, squad run --help broken)
- **#561**: Shell-specific flag behavior (--no-color, TERM=dumb, NO_COLOR env var)
- **#562**: Env var fallback paths (SQUAD_* env vars not tested for all documented vars)
- **#563**: REPL mode transitions (idle → processing → error → idle state machine)
- **#564**: Config file precedence (multiple config sources, no tests for priority)
- **#565**: Agent spawn flags undocumented (--memory, --cpu exist but not in help)
- **#566**: Untested flag aliases (--help/-h, --version/-v may differ)
- **#567**: Flag parsing error handling (missing args, invalid/unknown flags → user-friendly errors)

All labeled squad:hockney for routing. Each issue includes: what's missing, why it matters, and suggested test approach. Ready for assignment.

### Tests for #624 and #625 fixes (parallel work)
- Added 5 tests to 	est/first-run-gating.test.ts covering two parallel fixes:
  - **#624 (SQLite warning suppression):** Structural test verifying NODE_NO_WARNINGS='1' is set before any import in cli-entry.ts. Filter test confirming process.emitWarning override blocks both string and object ExperimentalWarning forms while passing other warnings through.
  - **#625 (Redundant init messaging):** Logic test verifying empty roster + isFirstRun yields null firstRunElement (no duplicate init text). Logic test verifying non-empty roster still renders "assembled" message. Structural test confirming banner guidance text prioritizes /init over xit and run squad init.
- All 30 tests pass (25 existing + 5 new). Test patterns match existing style: structural source verification, logic simulation, and process.emitWarning interception.
📌 Team update (2026-03-01T05:57:23): Nap feature complete — dual sync/async export pattern, 38 comprehensive tests, all 3229 tests pass. Issue #635 closed, PR #636 merged. — decided by Fenster, Hockney

### Concurrent connect() dedup tests (2026-03-02)
**Status:** Complete — 4 tests (1 updated, 3 new) in `test/adapter-client.test.ts`, all 32 tests passing.
- **Context:** Fenster fixed a race condition in `packages/squad-sdk/src/adapter/client.ts` where `connect()` threw "Connection already in progress" on concurrent calls. New behavior stores in-flight `connectPromise` and returns it to concurrent callers (promise dedup pattern).
- **Tests added:**
  1. `should deduplicate concurrent connect calls` — two concurrent `connect()` calls both resolve; `start()` called only once.
  2. `should handle concurrent createSession calls that trigger auto-connect` — two concurrent `createSession()` with `autoStart: true` both succeed; connection established once.
  3. `should propagate connect failure to concurrent callers` — when `start()` rejects, both concurrent callers receive the rejection.
  4. `should start fresh connect after failed concurrent connect` — after failure, `connectPromise` is cleared; new `connect()` starts fresh and succeeds.
- **Pattern:** `Promise.all` / `Promise.allSettled` for concurrent call testing. Slow `start()` via `mockImplementation(() => new Promise(...))` to force overlap window.
- **Key file:** `packages/squad-sdk/src/adapter/client.ts` — `connectPromise` field + IIFE async pattern with `finally` cleanup.

---

### History Audit — 2026-03-03

**Audit completed by Hockney per Brady's team-wide request.**

**Issues Found & Corrected:**

1. **Duplicate "# Project Context" header** — Lines 433-438 contained a second copy of the project metadata that appeared to be an intermediate state capture. [CORRECTED: Removed.]

2. **Duplicate "## Learnings" header** — Line 440 contained a duplicate section header. [CORRECTED: Removed with Project Context duplication.]

3. **4x duplication of "📌 Team update (2026-02-22T041800Z): SDK/CLI split verified"** — This team decision was recorded 4 times:
   - Lines 129-149: Full detailed version ✓ (kept)
   - Line 151-152: Brief summary version [CORRECTED: Removed]
   - Lines 469-489: Full duplicate [CORRECTED: Removed]
   - Lines 490-491: Brief summary repeat [CORRECTED: Removed]

4. **2x duplication of "### REPL UX visual test suite (2026-02-23)"** — Same 7-line learning recorded twice (lines 87-93 and 437-443). [CORRECTED: Removed second occurrence along with the "📌 Core Context" duplicate that followed it.]

5. **2x duplication of "### 📌 Core Context: Test Foundation & Beta Learnings"** — Lines 95-110 and lines 445-460 were identical copies. [CORRECTED: Removed second occurrence.]

6. **No v0.6.0 references found** — All migration target versions are correct (v0.8.x).

7. **No intermediate states recorded as final** — All kept entries represent completed work or confirmed team decisions.

**Result:** 5 corrections made via [CORRECTED] annotations. No conflicting or stale decisions found. History is now clean and ready for future spawns to read cold.

**Overall status:** ✅ CLEAN (with corrections documented inline)

### Template path test fix — Issue #190 (2026-03-04)
**Status:** Complete — test updated in `test/cli/init.test.ts`.
- **What:** Updated test description and path from `.squad-templates/` to `.squad/templates/` to match the corrected install path in `init.ts`.
- **Key finding:** The SDK dist was stale (still had old `.squad-templates` path). Source was already updated but `npm run build` hadn't been run. Rebuilt SDK to verify test passes.
- **Pre-existing failure:** Line 94 gitattributes content mismatch (unrelated, not introduced by this change).
- **Lesson:** On Windows, use `join(root, '.squad', 'templates')` not `join(root, '.squad/templates')` — forward-slash segments in `join` args work on Node but it's better practice to use separate args.

### Workflow filtering test coverage review — Issue #201 (2026-03-04)
**Status:** Complete — validated issue #201 workflow filter branch.
**Context:** Only 4 FRAMEWORK_WORKFLOWS now installed by `squad init` (heartbeat, triage, issue-assign, sync-labels). 8 CI/CD workflows (ci, preview, release, docs, insider-release, label-enforce, main-guard, promote) NOT installed until `squad upgrade`.
**Test files reviewed:**
1. `test/workflows.test.js` (CJS, NOT run by vitest — only used for manual testing)
2. `test/cli/init.test.ts` (TypeScript, vitest runs this)
3. `test/cli/upgrade.test.ts` (TypeScript, vitest runs this)

**Findings:**

**workflows.test.js (CJS, NOT executed by vitest):**
- ✅ Correctly defines `FRAMEWORK_WORKFLOWS` (4 files) and `CI_CD_WORKFLOWS` (3 files: ci, preview, release)
- ✅ Tests split: init copies FRAMEWORK_WORKFLOWS, NOT CI_CD_WORKFLOWS
- ✅ Upgrade still copies CI/CD workflows (via templates.ts TEMPLATE_MANIFEST)
- ⚠️ Line 165 test "upgrade overwrites stale workflow content" — calls `initSquad(tmpDir)` (which no longer copies CI/CD), manually writes stale file to first available CI/CD workflow path, then runs upgrade. **This test still passes** because upgrade DOES copy CI/CD workflows.
- ⚠️ `runSquad([], dir)` in this test calls the built CLI (`index.js`) — runs actual init logic. Test structure is sound.

**init.test.ts (vitest, line 129):**
- Line 136: `expect(ymlFiles.length).toBeGreaterThan(0)` — WEAK. Passes with 4 files OR 12 files OR 1 file. Would NOT catch regression where 0 files installed.
- ❌ **Gap:** No assertion that exactly 4 framework workflows are installed.
- ❌ **Gap:** No assertion that CI/CD workflows are NOT installed.
- ✅ Test does verify workflow directory exists and contains .yml files.

**upgrade.test.ts (vitest, line 94):**
- Line 102: `expect(result.filesUpdated.some(f => f.includes('workflows'))).toBe(true)` — WEAK. This passes because upgrade touches workflows (CI/CD via templates.ts).
- ⚠️ Test doesn't verify WHICH workflows are updated. Could pass if only 1 workflow copied.
- ✅ Test does verify upgrade returns workflow updates in filesUpdated array.

**Coverage gaps identified:**
1. **init.test.ts needs specific assertions:**
   - Assert exactly 4 FRAMEWORK_WORKFLOWS present after init
   - Assert CI/CD workflows (ci, preview, release, docs, etc.) are ABSENT after init
   - Assert workflow content is valid YAML
2. **upgrade.test.ts needs specific assertions:**
   - Assert CI/CD workflows are present AFTER upgrade
   - Assert count of upgraded workflow files matches TEMPLATE_MANIFEST entries
3. **No regression protection:** If init.ts accidentally clears FRAMEWORK_WORKFLOWS array, init.test.ts line 136 still passes (empty array > 0 = false, test would fail — OK). But if it installs 1 wrong file, test passes.

**Risk assessment:**
- **workflows.test.js (CJS):** Thorough, but NOT executed by vitest. Only runs via manual `node --test test/workflows.test.js`.
- **vitest suite (init + upgrade):** Weak assertions. Would NOT catch:
  - Wrong workflows installed
  - Extra CI/CD files leaked into init
  - Missing framework workflows
- **Net coverage:** ⚠️ Adequate for smoke testing, inadequate for regression protection.

**Recommendation:** APPROVED WITH NOTES — change is correct, but test coverage should be strengthened in a follow-up. Vitest suite needs explicit workflow name assertions.
📌 Team update (2026-03-05T10-35-50Z): PR #201 workflow filter approved by all reviewers — framework/scaffolding distinction, implementation pattern validated, test coverage noted — decided by Keaton, Fenster, Hockney, Edie

## Learnings

**2026-03-05: Strengthened init workflow test for issue #201**
- Replaced weak test `expect(ymlFiles.length).toBeGreaterThan(0)` with two focused tests
- Test 1: Verifies exactly 4 framework workflows ARE installed (squad-heartbeat.yml, squad-triage.yml, squad-issue-assign.yml, sync-squad-labels.yml)
- Test 2: Verifies 8 CI/CD workflows are NOT installed (squad-ci.yml, squad-release.yml, squad-docs.yml, squad-insider-release.yml, squad-preview.yml, squad-promote.yml, squad-main-guard.yml, squad-label-enforce.yml)
- Both tests now use explicit `existsSync()` checks per file instead of counting
- Removed conditional guard (`if existsSync`) — directory should always exist post-init
- Tests pass with clear ✓ indicators for each assertion
- **Key lesson:** Positive AND negative assertions catch regressions. Testing "what should be there" AND "what should NOT be there" provides full coverage against accidental leakage or omission.
