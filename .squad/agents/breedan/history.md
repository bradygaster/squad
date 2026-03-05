# Breedan — History

## Project Context
- **Project:** Squad — programmable multi-agent runtime for GitHub Copilot
- **Owner:** Brady
- **Stack:** TypeScript (strict, ESM), Node.js ≥20, Ink 6 (React for CLI), Vitest
- **Existing tests:** test/*.test.ts using Vitest, ink-testing-library for component tests
- **Key files:** vitest.config.ts, test/repl-ux.test.ts (existing ink component tests)

## Learnings

### E2E Terminal Harness Design (2026-02-23)

**Architecture Decision:** Built terminal harness using `child_process.spawn` with pipes instead of node-pty. This pragmatic approach avoids native compilation issues on Windows and provides cross-platform compatibility. The harness API is designed to be compatible with node-pty, so we can upgrade later when CI has build tools without breaking tests.

**Key Components:**
- `test/acceptance/harness.ts` — TerminalHarness class for spawning CLI and capturing output
- `test/acceptance/support/gherkin.ts` — Minimal Gherkin parser (no external deps)
- `test/acceptance/support/runner.ts` — Test runner that maps Gherkin steps to vitest
- `test/acceptance/steps/cli-steps.ts` — Given/When/Then step definitions
- `test/acceptance/features/*.feature` — 5 Gherkin feature files (version, help, status, error-handling, doctor)
- `test/ux-gates.test.ts` — UX quality gates (overflow, error remediation, clean output)

**Patterns:**
- CLI spawned with `node packages/squad-cli/dist/cli-entry.js [args]`
- Environment variables used to control terminal size (COLUMNS, LINES) and disable interactivity (TERM=dumb, NO_COLOR=1)
- Output accumulated in append-only buffer for waitForText assertions
- ANSI codes stripped using simple regex (no extra dependencies)
- Tests focus on non-interactive commands (--version, --help, status, doctor) since interactive shell requires Copilot SDK unavailable in test environment

**UX Gates Philosophy:**
- Quality gates document existing behavior and catch regressions
- Pragmatic thresholds (120 char max, not 80) balance ideals with reality
- Informational logging for soft constraints (lines exceeding 80 chars)
- Hard assertions for critical issues (error messages include remediation)

**Test Results:** All 13 tests passing (7 acceptance scenarios + 6 UX gates)

### E2E Coverage Expansion (2026-02-23)

**Scenarios added (14 new, 21 total):**
- init-command.feature: re-init in existing project, exit code
- status-extended.feature: resolution details, no-squad directory isolation
- doctor-extended.feature: diagnostic header, summary pass counts
- help-comprehensive.feature: all core commands listed, flags section
- error-paths.feature: special characters, invalid flags, help suggestion
- exit-codes.feature: success (0) and failure (1) validation

**Test infrastructure:**
- test/acceptance/harness.ts: TerminalHarness with cwd option
- test/acceptance/support/gherkin.ts: Minimal Gherkin parser
- test/acceptance/support/runner.ts: Step registry + vitest mapping
- test/acceptance/steps/cli-steps.ts: Step definitions
- test/acceptance/features/*.feature: 11 feature files
- test/ux-gates.test.ts: 6 UX quality gate tests

**Key patterns:**
- Absolute path resolution for cwd-isolated tests
- mkdtempSync for no-squad scenarios
- ANSI stripped, NO_COLOR=1, TERM=dumb for deterministic output
- Negative assertions via 'does not contain' step

**PR:** #348 (closes #326)

### E2E Coverage Gap Analysis (2026-07-17)

**Requested by:** Brady — honest quality assessment across full test suite.

**Test suite baseline:** 94 test files, 2557 tests total. 13 failing, 5 skipped, 1 todo. 5 test files red.

#### Failing Tests (as of assessment)
1. `test/acceptance/acceptance.test.ts` — 4 failures. CLI output text drifted from feature file expectations.
2. `test/repl-ux.test.ts` — 4 failures. AgentPanel component behavior changed.
3. `test/shell-integration.test.ts` — 2 failures. Error message text changed.
4. `test/shell.test.ts` — 3 failures. Error message text changed.
5. `test/aspire-integration.test.ts` — 1 failure. Docker port conflict (infra issue).

#### Assessment by test file

**Acceptance tests (53 Gherkin scenarios):** Test non-interactive CLI commands only (--version, --help, status, doctor, init, error paths, hostile inputs). Real CLI spawned via child_process. Good for what they cover, but can't test the interactive REPL. 4 tests broken by output text drift — nobody noticed or fixed them.

**repl-ux.test.ts (80 tests):** Component-level rendering tests via ink-testing-library. Tests ThinkingIndicator, AgentPanel, InputPrompt, MessageStream individually. Good visual regression coverage for isolated components. Not integration tests — components are rendered in isolation, never wired to a real shell.

**repl-streaming.test.ts (~20 tests):** Tests streaming dispatch pipeline with mock sessions. Validates delta accumulation, sendAndWait vs sendMessage fallback, extractDelta field priority. 100% mocked — no real SDK.

**cli-shell-comprehensive.test.ts (~100+ tests):** Deep unit coverage of shell modules: coordinator parsing, agent prompt building, input routing, session registry, commands, memory manager, autocomplete. All mocked. createMockSession() and createMockClient() throughout.

**otel-export.test.ts + otel-integration-e2e.test.ts:** Good pattern using InMemorySpanExporter. Tests span hierarchy, error recording, dual-mode telemetry. No test of real export to a collector.

**cli-p0-regressions.test.ts (8 tests):** Real CLI spawned for specific P0 bug regressions. Narrow but genuine E2E.

**ux-gates.test.ts (6 tests):** Real CLI output quality checks. Surface-level string matching.

**hostile.test.ts (32 scenarios):** Adversarial inputs — corrupt configs, tiny terminals, unicode, rapid-fire, pipe mode. Good creativity but assertions are just "didn't crash."

#### Top 5 Gaps

1. **ZERO testing of the interactive REPL** — The core product (user types → coordinator routes → agent responds → output renders) has never been tested end-to-end. Every shell test either renders components in isolation or uses mocks. The acceptance harness explicitly excludes interactive mode.

2. **Mock-SDK contract gap** — repl-streaming and cli-shell-comprehensive build elaborate mocks with .sendAndWait, .on('message_delta'), .deltaContent. No contract test proves these mocks match the real @github/copilot-sdk. If the SDK changes field names or event behavior, all mock tests pass while the real product breaks.

3. **No Copilot SDK connection lifecycle testing** — connect(), session creation, auth failure, token expiry, reconnection, rate limiting — zero tests. integration.test.ts mocks the entire CopilotClient. Nothing proves the CLI can actually connect to Copilot.

4. **Acceptance tests are already broken and nobody noticed** — 4 tests have been failing since CLI output text changed ("Squad is ready" → "Your team is ready"). This means either CI doesn't run them, or failures are tolerated. The safety net has a hole and nobody's checking.

5. **No multi-agent coordination integration test** — Coordinator ROUTE/DIRECT/MULTI parsing is unit-tested against synthetic strings. But multi-agent fan-out, agent handoff, conversation context passing, concurrent sessions, session cleanup after errors — no integration coverage.

#### Additional uncovered areas
- `squad upgrade` has no test
- `squad loop` and `squad triage` (long-running daemons) have no test
- Marketplace install/publish has no E2E flow test
- No performance regression baselines
- No test of `squad init` in a truly fresh repo (only re-init)
- Concurrent process conflict scenarios untested

#### Verdict
**Are our tests giving us false confidence? Yes.**

The test count (2538 passing) looks impressive but masks a structural problem: the most important user journey — interactive multi-agent conversation — has zero end-to-end coverage. The tests heavily validate internal modules via mocks, which is useful for refactoring confidence but doesn't catch integration failures. The acceptance tests that do spawn the real CLI are already broken and apparently not blocking merges. The mock sessions in streaming tests are hand-built assumptions about SDK behavior that could silently diverge from reality.

What a real user would encounter that no test catches:
- "I ran `squad` and it can't connect to Copilot" — no connection test
- "I typed a message and nothing happened" — no interactive REPL test
- "The agent response came back garbled/empty" — mocks assume correct delta format
- "I upgraded and my .squad config broke" — no upgrade path test
- "Multi-agent routing sent my message to the wrong agent" — no integration routing test

### E2E Integration Tests — REPL & Multi-Agent (2026-07-17)

**Requested by:** Brady — build the tests for the biggest gap: interactive REPL has zero E2E coverage.

**Issues filed:**
- #372: E2E: Integration test for interactive REPL message flow
- #373: E2E: Multi-agent coordination integration test

**Tests added:** `test/e2e-integration.test.ts` — 15 tests, all passing.

#### REPL Round-Trip Tests (6)
1. Full pipeline: user input → parseInput → dispatch → mock response → MessageStream rendering
2. @Agent direct message: `@Kovash refactor the parser` → dispatchToAgent with correct agent
3. /help slash command: renders help output, no SDK dispatch triggered
4. /status slash command: shows team info locally
5. Error recovery: dispatch throws → shell stays alive, /help still works
6. No-SDK-connected: shows "SDK not connected" message gracefully

#### Multi-Agent Coordination Tests (6)
1. Multi-agent registration: 3 agents tracked independently, all start idle
2. Concurrent status tracking: working/streaming/idle tracked per-agent, getActive() correct
3. Error cleanup: errored agent hint cleared, other agent hint preserved
4. Session removal: remove one agent, others intact
5. Fan-out dispatch: Promise.all to 3 agents, all responses collected
6. Fan-out error isolation: one agent fails, other completes — Promise.allSettled

#### Input Parsing Integration Tests (3)
1. parseInput routes @Agent/slash/coordinator correctly with real agent list
2. Case-insensitive @agent matching returns canonical name
3. Unknown @name falls through to coordinator

**Key pattern:** ink-testing-library stdin requires writing characters one-at-a-time then `\r` separately, with tick delays between, for React state to settle. Writing `text\r` in one call doesn't trigger submit because useInput processes them as a single event where key.return fires before setValue.

**Branch:** `squad/e2e-integration-tests`
**PR:** #379 (closes #372, closes #373)

### Team consensus on public readiness (2026-02-24)
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### History Audit — 2026-03-03

**Corrections made:**
1. [CORRECTED] Removed duplicate Project Context lines (39-40) — redundant copy of lines 3-8
2. [CORRECTED] Removed duplicate "## Learnings" header after E2E Terminal Harness section
3. [CORRECTED] Fixed timestamp format on public readiness entry — changed from mixed ISO-T format to standard (2026-02-24) for consistency with other history entries

**Status:** Clean after corrections.

### Squad Migrate E2E Tests — 2025-03-05

**Context:** The migrate command was added to safely upgrade .squad/ directories (backup → clean → reinit → restore). A critical bug where re-launching shell after migrate would trigger re-initialization (overwriting agent files) was fixed by cleaning up `.first-run` and `.init-prompt` markers after migration.

**Tests created:** `test/migrate-e2e.test.ts` — 23 tests, all passing.

#### Test Coverage (6 groups)
1. **--dry-run:** Exit 0, outputs [dry-run] marker, no backups created, .squad/ untouched (3 tests)
2. **Full migrate flow:** Creates backup, preserves user files (agents/, team.md), removes .first-run/.init-prompt markers (6 tests)
3. **--restore (auto-detect):** Finds latest .squad-backup-*, restores content correctly (3 tests)
4. **--restore <path>:** Works with relative and absolute paths (3 tests)
5. **No .squad/ directory:** Fresh init path works (creates .squad/, .first-run IS present since it's genuinely first run) (3 tests)
6. **Shell reinit guard:** Verifies .first-run/.init-prompt cleanup after migrate prevents unwanted shell reinit (5 tests)

#### Key Implementation Details
- Used `execFileSync` (not node-pty) since migrate is non-interactive
- Built CLI at `packages/squad-cli/dist/cli-entry.js` instead of root `index.js` (which has CJS syntax despite package.json type:module)
- Helper `createPopulatedSquadDir()` scaffolds realistic post-init .squad/ with agents, charters, history
- Tests validate filesystem state before/after migrate (marker files, backup dirs, user content preservation)
- Important behavior: fresh init via migrate (no existing .squad/) DOES create .first-run (correct), but migrating existing .squad/ removes it (prevents shell reinit)

#### Learnings
1. **CLI entry points matter:** Root index.js is CJS syntax but package.json has type:module, causing syntax errors. Built CLI works correctly.
2. **Marker cleanup location:** migrate.ts lines 246-251 clean up .first-run/.init-prompt ONLY after migrating existing .squad/, not during fresh init path (which is correct behavior).
3. **Test isolation:** temp dirs + afterEach cleanup ensure no cross-test pollution.
4. **Backup validation:** Verified both auto-detect (latest .squad-backup-*) and explicit path restore scenarios work.

**Test execution:** 23/23 passing in ~10s. All scenarios covered.
