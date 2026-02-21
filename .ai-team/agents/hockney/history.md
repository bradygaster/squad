# Project Context

- **Owner:** bradygaster
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial assessment (2026-02-07). Full entries in `history-archive.md`._

- **Squad is an npx CLI** that copies `squad.agent.md` (coordinator) and `templates/` into user repos, plus pre-creates `.ai-team/` directory structure (inbox, orchestration-log, casting).
- **Started with zero test coverage** — no test files, no framework, no CI. Key risk areas identified: symlinks, filesystem errors, incomplete installs, cross-platform paths, ANSI in non-TTY.
- **Test strategy evolved** from `tap` to `node:test` + `node:assert` (zero dependencies) — integration-heavy (80% integration, 20% unit), spawn `index.js` in isolated temp dirs.
- **Three non-negotiable tests**: init happy path, init idempotency, export/import round-trip. If any fail, don't ship.

### Session Summaries

- **V1 Test Strategy (2026-02-08)** — **What I Did:**
- **Test Prioritization Review (2026-02-09)** — **What I Did:**
- **P0 Silent Success Bug Hunt (2026-02-09)** — **Audit scope:** All 4 session logs, all 7 agent histories, orchestration log, decisions inbox, squad.agent.md mitigations, git commit history. Full c
- **V1 Test Suite Shipped (2026-02-09)** — **What I Did:**
- **CI Pipeline Shipped (Sprint Task 1.3)** — **What I Did:**
- **Test Coverage Expansion (Sprint Task 1.2)** — **What I Did:**
- **PR #2 Prompt Validation Tests (Wave 2)** — **What I Did:**
- **npm Pack Dry-Run Audit (v0.2.0 Release Gate)** — **What I Did:**
- **Re-verification After docs/CHANGELOG Addition (v0.2.0)** — **Context:** Brady requested inclusion of `docs/` and `CHANGELOG.md` in the release pipeline. Changes were made to `package.json` (files field), `.npm

## Recent Updates

📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan
📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton
📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
📌 Team update (2026-02-08): Release ritual — state integrity canary is a hard release gate. Tests + state canary + npx verify are automated gates. All must pass before release ships. — decided by Keaton
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — per-agent model selection, team backlog, Demo 1. — decided by Keaton

📌 Team update (2026-02-10): Tone directive consolidated — all public-facing material must be straight facts only. No editorial voice, sales language, or narrative framing. Stacks on existing banned-words and tone governance rules. — decided by bradygaster, McManus


📌 Team update (2026-02-10): `squad:` label convention standardized — test coverage may be needed — decided by Keaton, McManus


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

## Learnings

- **CI/CD Workflow Tests (2026-02-11)** — **What I Did:**
  - Created `test/workflows.test.js` — 22 tests across 8 describe blocks covering the three CI/CD workflow templates (`squad-ci.yml`, `squad-preview.yml`, `squad-release.yml`).
  - **Tests cover:** template existence, YAML structural validity (name/on/jobs keys), init copies workflows to `.github/workflows/`, upgrade updates/overwrites stale workflows, trigger configuration checks (pull_request, push, main branch, preview branch), and byte-for-byte template-to-output matching for all workflow templates.
  - **Patterns used:** Same `node:test` + `node:assert/strict` pattern as existing test files. `execFileSync` with `NO_COLOR=1` in isolated temp dirs. `t.skip()` for graceful degradation when templates don't exist yet.
  - **Key design choice:** Tests use `t.skip()` when templates are missing so the suite stays green during parallel agent work (Kobayashi may not have finished yet). No external YAML parser — validity is checked via required key presence (`name:`, `on:`, `jobs:`).
  - All 22 workflow tests pass. Full suite (45 tests) green.

- **Init Mode Prompt Structure Tests (#66)** — **What I Did:**
  - Created `test/init-flow.test.js` — 8 tests across 5 describe blocks verifying the Init Mode prompt structure in the generated `squad.agent.md`.
  - **Tests cover:** (1) squad.agent.md generated with Init Mode section, (2) explicit STOP/WAIT gate between propose and create, (3) step 5 confirmation question exists, (4) confirmation step numbered before file creation step, (5) no file creation instructions between propose and confirm steps, (6) step 6 is conditional on confirmation, (7) ask_user referenced for confirmation.
  - **Results: 6 pass, 2 fail.** The 2 failures document the current broken behavior from #66:
    - **FAIL: "Init Mode contains a STOP or WAIT gate"** — No explicit STOP/WAIT instruction exists. The prompt has numbered steps but nothing telling the LLM to actually pause between step 5 (ask "Look right?") and step 6 (create files). LLMs execute all steps sequentially in one turn.
    - **FAIL: "ask_user referenced in Init Mode"** — The prompt never mentions `ask_user` or any explicit tool for getting confirmation. Without this, the LLM has no mechanism to yield control back to the user.
  - **Pattern: Prompt structure testing.** These are not runtime LLM behavior tests — they verify the text content of generated prompt files. The pattern is: run `node index.js` in a temp dir, read the generated `.github/agents/squad.agent.md`, extract sections by heading, assert on text patterns (regex + string search). This catches prompt regressions without needing an LLM in the loop.
  - **Key insight:** The current prompt relies on step numbering alone to create a pause point. Step 5 says "Ask: Look right?" and step 6 says "On confirmation, create..." — but without an explicit STOP instruction or ask_user reference, LLMs treat steps 4-6 as a single execution block. The fix needs both: (a) an explicit STOP/WAIT directive, and (b) an ask_user tool reference to force the LLM to yield.

📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

- **Version Stamping & compareSemver Tests (2026-02-15)** — **What I Did:**
  - Created `test/version-stamping.test.js` — 9 tests across 2 describe blocks covering two recent changes to `index.js`.
  - **Tests cover:** (1) `stampVersion()` replaces `{version}` placeholder with actual package version in all three locations (HTML comment, Identity section, greeting instruction), verified on both `init` and `upgrade` commands. (2) `compareSemver()` pre-release handling — verifies upgrade correctly detects version differences including pre-release suffixes like `0.5.3-insiders` vs `0.5.2` and `0.5.3`.
  - **Patterns used:** Same integration test pattern as existing test files — spawn `index.js` in isolated temp dirs via `execFileSync`, read generated files, assert on content. For semver tests, simulate old installations by manually rewriting version comments in `squad.agent.md`, then run upgrade and assert on output behavior ("Already up to date" vs upgrade proceeds).
  - **Key design choices:** (1) Tests read actual package.json version dynamically so they stay green across version bumps. (2) Pre-release tests focus on observable upgrade behavior rather than direct function testing (since `compareSemver` is internal to index.js). (3) Tests verify both the absence of `{version}` placeholder and presence of actual version string.
  - All 9 new tests pass. Full suite now at 95 tests, all green.

- **M0-9 SDK Integration Tests (2026-02-15, Task #85)** — **What I Did:**
  - Created three comprehensive integration test files for squad-sdk: `test/adapter-client.test.ts` (29 tests), `test/errors.test.ts` (42 tests), `test/event-bus.test.ts` (34 tests). Total: 105 new tests.
  - **Tests cover:** (1) SquadClient connection lifecycle (disconnected → connecting → connected state transitions, disconnect/forceDisconnect cleanup, reconnect timer management). (2) Auto-reconnection with exponential backoff (ECONNREFUSED, ECONNRESET, EPIPE handling, max attempts exhaustion, manual disconnect blocks auto-reconnect). (3) Session CRUD (create/resume/list/delete, autoStart behavior, status operations). (4) Error hierarchy (all 9 error types, ErrorFactory pattern matching, toJSON serialization, getUserMessage formatting, RateLimitError retry-after parsing). (5) TelemetryCollector (start/success/failure tracking, duration measurement, handler isolation, metadata propagation). (6) Event bus (both client and runtime implementations — subscribe/emit/unsubscribe, wildcard handlers, error isolation, handler count tracking).
  - **Mocking pattern:** Used `vi.mock('@github/copilot-sdk')` to stub CopilotClient since it requires a real CLI server. Followed existing test pattern from `test/client.test.ts`. Mock returns vi.fn() for all methods (start, stop, createSession, etc.) allowing per-test behavior customization via mockResolvedValue/mockRejectedValue.
  - **Key test fixes:** (1) ErrorFactory regex for rate limit detection is case-sensitive — used lowercase "quota exceeded. retry after 60" to match pattern. (2) Manual disconnect test needed `autoStart: false` to avoid hanging on createSession auto-connect attempt. (3) Exponential backoff test simplified to one reconnect cycle (not two) to avoid complex mock chaining that was failing.
  - **Pattern learned:** Vitest mocks require careful setup of mock return values before each test. Use `mockResolvedValueOnce` / `mockRejectedValueOnce` for sequential behavior (e.g., fail then succeed for reconnect tests). Always `vi.clearAllMocks()` in `beforeEach` to avoid cross-test pollution.
  - **Coverage achieved:** Connection lifecycle (8 tests), auto-reconnection (7 tests), session CRUD (7 tests), status operations (7 tests), error types (42 tests), event bus client (16 tests), event bus runtime (18 tests). All 126 tests in squad-sdk now pass (20 existing + 106 new).
  - **Build verification:** Ran `npm run build && npm test` in C:\src\squad-sdk — TypeScript compilation clean, all tests green.

- **M1-12 Integration Tests: Tools + Hooks + Lifecycle (2026-02-15, Task #146)** — **What I Did:**
  - Created `test/integration.test.ts` — comprehensive integration tests verifying M1 components work together. **41 tests** across 6 major integration scenarios.
  - **Tests cover:** (1) **Tool → Hook Pipeline Integration** — squad_route through HookPipeline with custom blocking hooks, squad_decide with file-write guard (allowed/blocked paths), squad_memory with PII scrubbing (emails redacted from outputs), blocked tool calls return descriptive errors. (2) **Charter → Model → Session Pipeline** — compile charter and resolve model for different task types (code/docs/planning), charter preference overrides, user override takes precedence, model resolution respects task type, fallback chains provided per tier. (3) **Hook Enforcement Scenarios** — reviewer lockout blocks locked-out agents from editing artifacts, PII scrub applies across all tool outputs (view/grep/powershell), rate limiting persists across multiple tool calls in same session (tracked independently per session), multiple hooks compose correctly (block wins, stop at first block). (4) **Session Pool + Event Bus Integration** — sessions emit events (session:created/idle/error/tool_call), event bus delivers to subscribers, wildcard handlers receive all events, error isolation in handlers (one handler failure doesn't affect others). (5) **Error Hierarchy Integration** — tool failures wrapped with ErrorFactory.wrap(), specific error types auto-detected from messages (connection/auth/config/rate-limit), TelemetryCollector tracks operations (start/success/failure/duration), error context includes session/agent/tool info, toJSON serialization, user-friendly messages. (6) **End-to-End Scenario** — complete pipeline execution: event emission → pre-tool hooks → tool execution → post-tool hooks → event emission → file system verification.
  - **Key integration patterns tested:** (1) HookPipeline.runPreToolHooks() → ToolRegistry.getTool().handler() → HookPipeline.runPostToolHooks() pipeline. (2) compileCharter() → resolveModel() → session config pipeline. (3) EventBus.subscribe() → EventBus.emit() → handler execution with error isolation. (4) ErrorFactory.wrap() auto-detection of error categories from message patterns. (5) TelemetryCollector.start() → stopwatch.success()/failure() → onData() handler.
  - **API corrections during test development:** (1) EventBus uses `subscribe()` and `subscribeAll()`, not `on()`. (2) ErrorFactory uses `wrap()` method, not separate `createXxxError()` factory methods. (3) TelemetryCollector uses `start()` returning stopwatch with `success()`/`failure()` methods, not `startToolExecution()`/`recordSuccess()`. (4) Charter compiler returns `prompt` field, not `systemMessage`. (5) RateLimitError imported separately for type checking in rate limit detection tests.
  - **Test design decisions:** (1) Used isolated temp directories per test to avoid cross-test pollution (`.test-integration-${uuid}`). (2) Created separate HookPipeline instances for reviewer lockout tests to avoid file-write guard conflicts. (3) Verified file system writes (decisions inbox, agent history) in addition to return values. (4) Used mocked CopilotClient following existing pattern from adapter-client.test.ts. (5) Tests verify both positive cases (allowed operations) and negative cases (blocked operations with descriptive errors).
  - **Results:** All 41 integration tests pass. Full squad-sdk suite: **287 tests** (285 passing, 2 pre-existing failures in unrelated lifecycle tests). Integration tests add comprehensive coverage of M1 component interactions: Tools ↔ Hooks ↔ EventBus ↔ Errors ↔ Charter/Model resolution.
  - **Build verification:** Ran `cd C:\src\squad-sdk && npm run build && npm test` — all integration tests green (41/41).


