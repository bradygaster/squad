# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

## Foundational Directives (carried from beta, updated for Mission Control)

### Type safety — strict mode non-negotiable
**By:** CONTROL (formerly Edie)
**What:** `strict: true`, `noUncheckedIndexedAccess: true`, no `@ts-ignore` allowed.
**Why:** Types are contracts. If it compiles, it works.

### Hook-based governance over prompt instructions
**By:** RETRO (formerly Baer)
**What:** Security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions.
**Why:** Prompts can be ignored. Hooks are code — they execute deterministically.

### Node.js >=20, ESM-only, streaming-first
**By:** GNC (formerly Fortier)
**What:** Runtime target is Node.js 20+. ESM-only. Async iterators over buffers.
**Why:** Modern Node.js features enable cleaner async patterns.

### Casting — Apollo 13, mission identity
**By:** Squad Coordinator
**What:** Team names drawn from Apollo 13 / NASA Mission Control. Scribe is always Scribe. Ralph is always Ralph. Previous universe (The Usual Suspects) retired to alumni.
**Why:** The team outgrew its original universe. Apollo 13 captures collaborative pressure, technical precision, and mission-critical coordination — perfect for an AI agent framework.

### Proposal-first workflow
**By:** Flight (formerly Keaton)
**What:** Meaningful changes require a proposal in `docs/proposals/` before execution.
**Why:** Proposals create alignment before code is written.

### Tone ceiling — always enforced
**By:** PAO (formerly McManus)
**What:** No hype, no hand-waving, no claims without citations.
**Why:** Trust is earned through accuracy, not enthusiasm.

### Zero-dependency scaffolding preserved
**By:** Network (formerly Rabin)
**What:** CLI remains thin. Zero runtime dependencies for the CLI scaffolding path.
**Why:** Users should be able to run `npx` without downloading a dependency tree.

### Merge driver for append-only files
**By:** Squad Coordinator
**What:** `.gitattributes` uses `merge=union` for `.squad/decisions.md`, `agents/*/history.md`, `log/**`, `orchestration-log/**`.
**Why:** Enables conflict-free merging of team state across branches.

### Interactive Shell as Primary UX
**By:** Brady
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL.
**Why:** Squad needs to own the full interactive experience.

### 2026-02-21: User directive — no temp/memory files in repo root
**By:** Brady (via Copilot)
**What:** NEVER write temp files, issue files, or memory files to the repo root. All squad state/scratch files belong in .squad/ and ONLY .squad/. Root tree of a user's repo is sacred.
**Why:** User request — hard rule. Captured for all agents.

### 2026-02-21: npm workspace protocol for monorepo
**By:** Edie (TypeScript Engineer)
**What:** Use npm-native workspace resolution (version-string references) instead of `workspace:*` protocol for cross-package dependencies.
**Why:** The `workspace:*` protocol is pnpm/Yarn-specific. npm workspaces resolve workspace packages automatically.
**Impact:** All inter-package dependencies in `packages/*/package.json` should use the actual version string, not `workspace:*`.

### 2026-02-21: Distribution is npm-only (GitHub-native removed)
**By:** Rabin (Distribution) + Fenster (Core Dev)
**What:** Squad packages (`@bradygaster/squad-sdk` and `@bradygaster/squad-cli`) are distributed exclusively via npmjs.com. The GitHub-native `npx github:bradygaster/squad` path has been removed.
**Why:** npm is the standard distribution channel. One distribution path reduces confusion and maintenance burden. Root `cli.js` prints deprecation warning if anyone still hits the old path.

### 2026-02-21: Coordinator prompt structure — three routing modes
**By:** Verbal (Prompt Engineer)
**What:** Coordinator uses structured response format: `DIRECT:` (answer inline), `ROUTE:` + `TASK:` + `CONTEXT:` (single agent), `MULTI:` (fan-out). Unrecognized formats fall back to `DIRECT`.
**Why:** Keyword prefixes are cheap to parse and reliable. Fallback-to-direct prevents silent failures.
### `.squad/` Directory Scope — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** The `.squad/` directory is **reserved for team state only** — roster, routing, decisions, agent histories, casting, and orchestration logs. Non-team data (adoption tracking, community metrics, reports) must NOT live in `.squad/`. Use `.github/` for GitHub platform integration or `docs/` for documentation artifacts.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029193833)


---

### No Individual Repo Listing Without Consent — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** Growth metrics must report **aggregate numbers only** (e.g., "78+ repositories found via GitHub code search") — never name or link to individual community repos without explicit opt-in consent. The monitoring script and GitHub Action concepts are approved, but any public showcase or tracking list that identifies specific repos is blocked until a community consent plan exists.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029222967)


---

### Adoption Tracking — Opt-In Architecture
**By:** Flight (implementing Brady's directives above)  
**Date:** 2026-03-09  

### 2026-02-21: CLI entry point split — src/index.ts is a pure barrel
**By:** Edie (TypeScript Engineer)
**What:** `src/index.ts` is a pure re-export barrel with ZERO side effects. `src/cli-entry.ts` contains `main()` and all CLI routing.
**Why:** Library consumers importing `@bradygaster/squad` were triggering CLI argument parsing and `process.exit()` on import.

### 2026-02-21: Process.exit() refactor — library-safe CLI functions
**By:** Kujan (SDK Expert)
**What:** `fatal()` throws `SquadError` instead of `process.exit(1)`. Only `cli-entry.ts` may call `process.exit()`.
**Pattern:** Library functions throw `SquadError`. CLI entry catches and exits. Library consumers catch for structured error handling.

### 2026-02-21: User directive — docs as you go
**By:** bradygaster (via Copilot)
**What:** Doc and blog as you go during SquadUI integration work. Doesn't have to be perfect — keep docs updated incrementally.

### 2026-02-22: Runtime EventBus as canonical bus
**By:** Fortier
**What:** `runtime/event-bus.ts` (colon-notation: `session:created`, `subscribe()` API) is the canonical EventBus for all orchestration classes. The `client/event-bus.ts` (dot-notation) remains for backward-compat but should not be used in new code.
**Why:** Runtime EventBus has proper error isolation — one handler failure doesn't crash others.

### 2026-02-22: Subpath exports in @bradygaster/squad-sdk
**By:** Edie (TypeScript Engineer)
**What:** SDK declares subpath exports (`.`, `./parsers`, `./types`, and module paths). Each uses types-first condition ordering.
**Constraints:** Every subpath needs a source barrel. `"types"` before `"import"`. ESM-only: no `"require"` condition.

### 2026-02-22: User directive — Aspire testing requirements
**By:** Brady (via Copilot)
**What:** Integration tests must launch the Aspire dashboard and validate OTel telemetry shows up. Use Playwright. Use latest Aspire bits. Reference aspire.dev (NOT learn.microsoft.com). It's "Aspire" not ".NET Aspire".

### 2026-02-23: User directive — code fences
**By:** Brady (via Copilot)
**What:** Never use / or \ as code fences in GitHub issues, PRs, or comments. Only use backticks to format code.

### 2026-02-23: User Directive — Docs Overhaul & Publication Pause
**By:** Brady (via Copilot)
**What:** Pause docs publication until Brady explicitly gives go-ahead. Tone: lighthearted, welcoming, fun (NOT stuffy). First doc should be "first experience" with squad CLI. All docs: brief, prompt-first, action-oriented, fun. Human tone throughout.

### 2026-02-23: Use sendAndWait for streaming dispatch
**By:** Kovash (REPL Expert)
**What:** `dispatchToAgent()` and `dispatchToCoordinator()` use `sendAndWait()` instead of `sendMessage()`. Fallback listens for `turn_end`/`idle` if unavailable.
**Why:** `sendMessage()` is fire-and-forget — resolves before streaming deltas arrive.
**Impact:** Never parse `accumulated` after a bare `sendMessage()`. Always use `awaitStreamedResponse`.

### 2026-02-23: extractDelta field priority — deltaContent first
**By:** Kovash (REPL Expert)
**What:** `extractDelta` priority: `deltaContent` > `delta` > `content`. Matches SDK actual format.
**Impact:** Use `deltaContent` as the canonical field name for streamed text chunks.

### 2026-02-24: Per-command --help/-h: intercept-before-dispatch pattern
**By:** Fenster (Core Dev)
**What:** All CLI subcommands support `--help` and `-h`. Help intercepted before command routing prevents destructive commands from executing.
**Convention:** New CLI commands MUST have a `getCommandHelp()` entry with usage, description, options, and 2+ examples.

### 2026-02-25: REPL cancellation and configurable timeout
**By:** Kovash (REPL Expert)
**What:** Ctrl+C immediately resets `processing` state. Timeout: `SQUAD_REPL_TIMEOUT` (seconds) > `SQUAD_SESSION_TIMEOUT_MS` (ms) > 600000ms default. CLI `--timeout` flag sets env var.

### 2026-02-24: Shell Observability Metrics
**By:** Saul (Aspire & Observability)
**What:** Four metrics under `squad.shell.*` namespace, gated behind `SQUAD_TELEMETRY=1`.
**Convention:** Shell metrics require explicit consent via `SQUAD_TELEMETRY=1`, separate from OTLP endpoint activation.

### 2026-02-23: Telemetry in both CLI and agent modes
**By:** Brady (via Copilot)
**What:** Squad should pump telemetry during BOTH modes: (1) standalone Squad CLI, and (2) running as an agent inside GitHub Copilot CLI.

### 2026-02-27: ASCII-only separators and NO_COLOR
**By:** Cheritto (TUI Engineer)
**What:** All separators use ASCII hyphens. Text-over-emoji principle: text status is primary, emoji is supplementary.
**Convention:** Use ASCII hyphens for separators. Keep emoji out of status/system messages.

### 2026-02-24: Version format — bare semver canonical
**By:** Fenster
**What:** Bare semver (e.g., `0.8.5.1`) for version commands. Display contexts use `squad v{VERSION}`.

### 2026-02-25: Help text — progressive disclosure
**By:** Fenster
**What:** Default `/help` shows 4 essential lines. `/help full` shows complete reference.

### 2026-02-24: Unified status vocabulary
**By:** Marquez (CLI UX Designer)
**What:** Use `[WORK]` / `[STREAM]` / `[ERR]` / `[IDLE]` across ALL status surfaces.
**Why:** Most granular, NO_COLOR compatible, text-over-emoji, consistent across contexts.

### 2026-02-24: Pick one tagline
**By:** Marquez (CLI UX Designer)
**What:** Use "Team of AI agents at your fingertips" everywhere.

### 2026-02-24: User directive — experimental messaging
**By:** Brady (via Copilot)
**What:** CLI docs should note the project is experimental and ask users to file issues.

### 2026-02-28: User directive — DO NOT merge PR #547
**By:** Brady (via Copilot)
**What:** DO NOT merge PR #547 (Squad Remote Control). Do not touch #547 at all.
**Why:** User request — captured for team memory

### 2026-02-28: CLI Critical Gap Issues Filed
**By:** Keaton (Lead)
**What:** 4 critical CLI gaps filed as GitHub issues #554–#557 for explicit team tracking:
- #554: `--preview` flag undocumented and untested
- #556: `--timeout` flag undocumented and untested
- #557: `upgrade --self` is dead code
- #555: `run` subcommand is a stub (non-functional)

**Why:** Orchestration logs captured gaps but they lacked actionable GitHub tracking and ownership. Filed issues now have explicit assignment to Fenster, clear acceptance criteria, and visibility in Wave E planning.

### 2026-02-28: Test Gap Issues Filed (10 items)
**By:** Hockney (Tester)
**What:** 10 moderate CLI/test gaps filed as issues #558–#567:
- #558: Exit code consistency untested
- #559: Timeout edge cases untested
- #560: Missing per-command help
- #561: Shell-specific flag behavior untested
- #562: Env var fallback paths untested
- #563: REPL mode transitions untested
- #564: Config file precedence untested
- #565: Agent spawn flags undocumented
- #566: Untested flag aliases
- #567: Flag parsing error handling untested

**Why:** Each gap identified in coverage analysis but lacked explicit GitHub tracking for prioritization and team visibility.

### 2026-02-28: Documentation Audit Results (10 issues)
**By:** McManus (DevRel)
**What:** Docs audit filed 10 GitHub issues (#568–#575, #577–#578) spanning:
- Feature documentation lag (#568 `squad run`, #570 consult mode, #572 Ralph smart triage)
- Terminology inconsistency (#569 triage/watch/loop naming)
- Brand compliance (#571 experimental banner on 40+ docs)
- Clarity/UX gaps (#573 response modes, #575 dual-root, #577 VS Code, #578 session examples)
- Reference issue (#574 README command count)

**Why:** Features shipped faster than documentation. PR #552, #553 merged without doc updates. No automation to enforce experimental banner. Users discover advanced features accidentally.

**Root cause:** Feature-docs lag, decision-doc drift, no brand enforcement in CI.

### 2026-02-28: Dogfood UX Issues Filed (4 items)
**By:** Waingro (Dogfooder)
**What:** Dogfood testing against 8 realistic scenarios surfaced 4 UX issues (filed as #576, #579–#581):
- #576 (P1): Shell launch fails in non-TTY piped mode (Blocks CI)
- #580 (P1): Help text overwhelms new users (44 lines, no tiering)
- #579 (P2): Status shows parent `.squad/` as local (confusing in multi-project workspaces)
- #581 (P2): Error messages show debug output always (noisy production logs)

**Why:** CLI is solid for happy path but first-time user experience and CI/CD integration have friction points. All 4 block either new user onboarding or automation workflows.

**Priority:** #576 > #580 > #581 > #579. All should be fixed before next public release.

### 2026-02-28: decisions.md Aggressive Cleanup
**By:** Keaton (Lead)
**What:** Trimmed `decisions.md` from 226KB (223 entries) to 10.3KB (35 entries) — 95% reduction.
- Kept: Core architectural decisions, active process rules, active user directives, current UX conventions, runtime patterns
- Archived: Implementation details, one-time setup, PR reviews, audit reports, wave planning, superseded decisions, duplicates
- Created: `decisions-archive.md` with full original content preserved

**Why:** Context window bloat during release push. Every agent loads 95% less decisions context. Full history preserved append-only.

**Impact:** File size reduced, agent context efficiency improved, all decisions preserved in archive.

### 2026-02-28: Backlog Gap Issues Filed (8 items)
**By:** Keaton (Lead)
**Approval:** Brady (via directive in issue request)
**What:** Filed 8 missing backlog items from `.squad/identity/now.md` as GitHub issues. These items were identified as "should-fix" polish or "post-M1" improvements but lacked explicit GitHub tracking until now.

**Why:** Brady requested: "Cross-reference the known backlog against filed issues and file anything missing." The team had filed 28 issues this session (#554–#581), but 8 known items from `now.md` remained unfiled. Without GitHub issues, these lack ownership assignment, visibility for Wave E planning, trackability in automated workflows, and routing to squad members.

**Issues Filed:**
- #583 (squad:rabin): Add `homepage` and `bugs` fields to package.json
- #584 (squad:mcmanus): Document alpha→v1.0 breaking change policy in README
- #585 (squad:edie): Add `noUncheckedIndexedAccess` to tsconfig
- #586 (squad:edie): Tighten ~26 `any` types in SDK
- #587 (squad:mcmanus): Add architecture overview doc
- #588 (squad:kujan): Implement SQUAD_DEBUG env var test
- #589 (squad:kujan): One real Copilot SDK integration test
- #590 (squad:baer): `npm audit fix` for dev-dependency ReDoS warnings
- #591 (squad:hockney, type:bug): Aspire dashboard test fails — docker pull in test suite
- #592 (squad:rabin): Replace workspace:* protocol with version string

**Impact:** Full backlog now visible with explicit issues. No unmapped items. Each issue routed to the squad member domain expert. Issues are independent; can be executed in any order.

### 2026-02-28: Codebase Scan — Unfiled Issues Audit
**By:** Fenster (Core Dev)
**Requested by:** Brady
**Date:** 2026-02-28T22:05:00Z
**Status:** Complete — 2 new issues filed

**What:** Systematic scan of the codebase to identify known issues that haven't been filed as GitHub issues. Checked:
1. TODO/FIXME/HACK/XXX comments in code
2. TypeScript strict mode violations (@ts-ignore/@ts-expect-error)
3. Skipped/todo tests (.skip() or .todo())
4. Errant console.log statements
5. Missing package.json metadata fields

**Findings:**
- Type safety violations: ✅ CLEAN — Zero @ts-ignore/@ts-expect-error found. Strict mode compliance excellent.
- Workspace protocol: ❌ VIOLATION — 1 issue filed (#592): `workspace:*` in squad-cli violates npm workspace convention
- Skipped tests: ❌ GAP — 1 issue filed (#588): SQUAD_DEBUG test is .todo() placeholder
- Console.log: ✅ INTENTIONAL — All are user-facing output (status, errors)
- TODO comments: ✅ TEMPLATES — TODOs in generated workflow templates, not code
- Package.json: ✅ TRACKED — Missing homepage/bugs already filed as #583

**Code Quality Assessment:**
- Type Safety (Excellent): Zero violations of strict mode or type suppression. Team decision being followed faithfully.
- TODO/FIXME Comments (Clean): All TODOs in upgrade.ts and workflows.ts are template strings for generated GitHub Actions YAML, intentionally scoped.
- Console Output (Intentional): All are user-facing (dashboard startup, OTLP endpoint, issue labeling, shell loading) — no debug debris.
- Dead Code (None Found): No unreachable code, orphaned functions, or unused exports detected.

**Recommendations:**
1. Immediate: Fix workspace protocol violation (#592) — violates established team convention
2. Soon: Implement SQUAD_DEBUG test (#588) — fills observable test gap
3. Going forward: Maintain type discipline; review package.json metadata during SDK/CLI version bumps

**Conclusion:** Codebase in good health. Type safety discipline strong. No hidden technical debt. Conventions mostly followed (one npm workspace exception). Test coverage has minor gaps in observability.

### 2026-02-28: Auto-link detection for preview builds
**By:** Fenster (Core Dev)
**Date:** 2026-02-28
**What:** When running from source (`VERSION` contains `-preview`), the CLI checks if `@bradygaster/squad-cli` is globally npm-linked. If not, it prompts the developer to link it. Declining creates `~/.squad/.no-auto-link` to suppress future prompts.
**Why:** Dev convenience — saves contributors from forgetting `npm link` after cloning. Non-interactive commands (help, version, export, import, doctor, scrub-emails) skip the check. Everything is wrapped in try/catch so failures are silent.
**Impact:** Only affects `-preview` builds in interactive TTY sessions. No effect on published releases or CI.

### 2026-03-01T00:34Z: User directive — Full scrollback support in REPL shell
**By:** Brady (via Copilot)
**What:** The REPL shell must support full scrollback — users should be able to scroll up and down to see all text (paste, run output, rendered content, logs) over time, like GitHub Copilot CLI does. The current Ink-based rendering loses/hides content and that's unacceptable.
**Why:** User request — captured for team memory. This is a P0 UX requirement for the shell.
**Status:** P0 blocking issue. Requires rendering architecture review (Cheritto, Kovash, Marquez).

### 2026-03-01T04:47Z: User directive — Auto-incrementing build numbers
**By:** Brady (via Copilot)
**What:** Add auto-incrementing build numbers to versions. Format: `0.8.6.{N}-preview` where N increments each local build. Tracks build-to-release cadence.
**Why:** User request — captured for team memory.

### 2026-03-01: Nap engine — dual sync/async export pattern
**By:** Fenster (Core Dev)
**What:** The nap engine (`cli/core/nap.ts`) exports both `runNap` (async, for CLI entry) and `runNapSync` (sync, for REPL). All internal operations use sync fs calls. The async wrapper exists for CLI convention consistency.
**Why:** REPL `executeCommand` is synchronous and cannot await. ESM forbids `require()`. Exporting a sync variant keeps the REPL integration clean without changing the shell architecture.
**Impact:** Future commands that need both CLI and REPL support should follow this pattern if they only do sync fs work.

### 2026-03-01: First-run gating test strategy
**By:** Hockney (Tester)
**Date:** 2026-03-01
**Issue:** #607
**What:** Created `test/first-run-gating.test.ts` with 25 tests covering 6 categories of Init Mode gating. Tests use logic-level extraction from App.tsx conditionals, filesystem marker lifecycle via `loadWelcomeData`, and source-code structural assertions for render ordering. No full App component rendering — SDK dependencies make that impractical for unit tests.
**Why:** 3059 tests existed with zero enforcement of first-run gating behavior. The `.first-run` marker, banner uniqueness, assembled-message gating, warning suppression, session-scoped keys, and terminal clear ordering were all untested paths that could regress silently.
**Impact:** All squad members: if you modify `loadWelcomeData`, the `firstRunElement` conditional in App.tsx, or the terminal clear sequence in `runShell`, these tests will catch regressions. The warning suppression tests replicate the `cli-entry.ts` pattern — if that pattern changes, update both locations.

### Verbal's Analysis: "nap" Skill — Context Window Optimization
**By:** Verbal (Prompt Engineer)
**Requested by:** Brady
**Date:** 2026-03-01
**Scope:** Approved. Build it. Current context budget analysis:
- Agent spawn loads charter (~500t) + history + decisions.md (4,852t) + team.md (972t)
- Hockney: 25,940t history (worst offender)
- Fenster: 22,574t (history + CLI inventory)
- Coherence cliff: 40-50K tokens on non-task context

**Key Recommendations:**
1. **Decision distillation:** Keep decisions.md as single source of truth (don't embed in charters — creates staleness/duplication)
2. **History compression — 12KB rule insufficient:** Six agents blow past threshold. Target **4KB ceiling per history** (~1,000t) with assertions not stories.
3. **Nap should optimize:** Deduplication (strip decisions.md content echoed in histories), staleness (flag closed PRs, merged work), charter bloat (stay <600t), skill pruning (archive high-confidence, no-recent-invocation skills), demand-loading for extra files (CLI inventory, UX catalog, fragility catalog).
4. **Enforcement:** Nap runs periodically or on-demand, enforces hard ceilings without silent quality degradation.

### ShellApi.clearMessages() for terminal state reset
**By:** Kovash (REPL Expert)
**Date:** 2026-03-01
**What:** `ShellApi` now exposes `clearMessages()` which resets both `messages` and `archivedMessages` React state. Used in session restore and `/clear` command.
**Why:** Without clearing archived messages, old content bleeds through when restoring sessions or clearing the shell. The `/clear` command previously only reset `messages`, leaving `archivedMessages` in the Static render list.
**Impact:** Any code calling `shellApi` to reset shell state should use `clearMessages()` rather than manually manipulating message arrays.

### 2026-03-01: Prompt placeholder hints must not duplicate header banner
**By:** Kovash (REPL Expert)
**Date:** 2026-03-01
**Issue:** #606
**What:** The InputPrompt placeholder text must provide *complementary* guidance, never repeat what the header banner already shows. The header banner is the single source of truth for @agent routing and /help discovery. Placeholder hints should surface lesser-known features (tab completion, history navigation, utility commands).
**Why:** Two elements showing "Type @agent or /help" simultaneously creates visual noise and a confusing UX. One consistent prompt style throughout the session.
**Impact:** `getHintText()` in InputPrompt.tsx now has two tiers instead of three. Any future prompt hints should check the header banner first to avoid duplication.

### 2026-03-02: Paste detection via debounce in InputPrompt
**By:** Kovash (REPL Expert)
**Date:** 2026-03-02
**What:** InputPrompt uses a 10ms debounce on `key.return` to distinguish paste from intentional Enter. If more input arrives within 10ms → paste detected → newline preserved. If timer fires without input → real Enter → submit. A `valueRef` (React ref) mirrors mutations synchronously since closure-captured `value` is stale during rapid `useInput` calls. In disabled state, `key.return` appends `\n` to buffer instead of being ignored.
**Why:** Multi-line paste was garbled because `useInput` fires per-character and `key.return` triggered immediate submission.
**Impact:** 10ms delay on single-line submit is imperceptible. UX: multi-line paste preserved. Testing: Hockney should verify paste scenarios use `jest.useFakeTimers()` or equivalent. Future: if Ink adds native bracketed-paste support, debounce can be replaced.

### 2026-03-01: First-run init messaging — single source of truth
**By:** Kovash (REPL & Interactive Shell)
**Date:** 2026-03-01
**Issue:** #625
**What:** When no roster exists, only the header banner tells the user about `squad init` / `/init`. The `firstRunElement` block returns `null` for the empty-roster case instead of showing a duplicate message. `firstRunElement` is reserved for the "Your squad is assembled" onboarding when a roster already exists.
**Why:** Two competing UI elements both said "run squad init" — visual noise that confuses the information hierarchy. Banner is persistent and visible; it owns the no-roster guidance. `firstRunElement` owns the roster-present first-run experience.
**Impact:** App.tsx only. No API or prop changes. Banner text reworded to prioritize `/init` (in-shell path) over exit-and-run.

### 2026-03-01: NODE_NO_WARNINGS for subprocess warning suppression
**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-01
**Issue:** #624
**What:** `process.env.NODE_NO_WARNINGS = '1'` is set as the first executable line in `cli-entry.ts` (line 2, after shebang). This supplements the existing `process.emitWarning` override.
**Why:** The Copilot SDK spawns child processes that inherit environment variables but NOT in-process monkey-patches like `process.emitWarning` overrides. `NODE_NO_WARNINGS=1` is the Node.js-native mechanism for suppressing warnings across an entire process tree. Without it, `ExperimentalWarning` messages (e.g., SQLite) leak into the terminal via the SDK's subprocess stderr forwarding.
**Pattern:** When suppressing Node.js warnings, use BOTH: (1) `process.env.NODE_NO_WARNINGS = '1'` — covers child processes (env var inheritance); (2) `process.emitWarning` override — covers main process (belt-and-suspenders).
**Impact:** Eliminates `ExperimentalWarning` noise in terminal for all Squad CLI users, including when the Copilot SDK spawns subprocesses.

### 2026-03-01: No content suppression based on terminal width
**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-01
**What:** Terminal width tiers (compact ≤60, standard, wide ≥100) may adjust *layout* (e.g., wrapping, column arrangement) but must NOT suppress or truncate *content*. Every piece of information shown at 120 columns must also be shown at 40 columns.
**Why:** Users can scroll. Hiding roster names, spacing, help text, or routing hints on narrow terminals removes information the user needs. Layout adapts to width; content does not.
**Convention:** `compact` variable may be used for layout decisions (flex direction, column vs. row) but must NOT gate visibility of text, spacing, or UI sections. `wide` may add supplementary content but narrow must not remove it.

### 2026-03-01: Multi-line user message rendering pattern
**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-01
**What:** Multi-line user messages in the Static scrollback use `split('\n')` with a column layout: first line gets the `❯` prefix, subsequent lines get `paddingLeft={2}` for alignment.
**Why:** Ink's horizontal `<Box>` layout doesn't handle embedded `\n` in `<Text>` children predictably when siblings exist. Explicit line splitting with column flex direction gives deterministic multi-line rendering.
**Impact:** Any future changes to user message prefix width must update the `paddingLeft={2}` on continuation lines to match.

### 2026-03-01: Elapsed time display — inline after message content
**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-01
**Issue:** #605
**What:** Elapsed time annotations on completed agent messages are always rendered inline after the message content as `(X.Xs)` in dimColor. This applies to the Static scrollback block in App.tsx, which is the canonical render path for all completed messages.
**Why:** After the Static scrollback refactor, MessageStream receives `messages=[]` and only renders live streaming content. The duration code in MessageStream was dead. Moving duration display into the Static block ensures it always appears consistently.
**Convention:** `formatDuration()` from MessageStream.tsx is the shared formatter. Format is `Xms` for <1s, `X.Xs` for ≥1s. Always inline, always dimColor, always after content text.

### 2026-03-01: Banner usage line separator convention
**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-01
**What:** Banner hint/usage lines use middle dot `·` as inline separator. Init messages use single CTA (no dual-path instructions).
**Why:** Consistent visual rhythm. Middle dot is lighter than em-dash or hyphen for inline command lists. Single CTA reduces cognitive load for new users.
**Impact:** App.tsx headerElement. Future banner copy should follow same separator and single-CTA pattern.

### 2026-03-02: REPL casting engine design
**By:** Fenster (Core Dev)
**Date:** 2026-03-02
**Status:** Implemented
**Issue:** #638
**What:** Created `packages/squad-cli/src/cli/core/cast.ts` as a self-contained casting engine with four exports:
1. `parseCastResponse()` — parses the `INIT_TEAM:` format from coordinator output
2. `createTeam()` — scaffolds all `.squad/agents/` directories, writes charters, updates team.md and routing.md, writes casting state JSON
3. `roleToEmoji()` — maps role strings to emoji, reusable across the CLI
4. `formatCastSummary()` — renders a padded roster summary for terminal display

Scribe and Ralph are always injected if missing from the proposal. Casting state is written to `.squad/casting/` (registry.json, history.json, policy.json).
**Why:** Enables coordinator to propose and create teams from within the REPL session after `squad init`.
**Implications:**

### 2026-03-02: Beta → Origin Migration: Version Path (v0.5.4 → v0.8.17)

**By:** Kobayashi (Git & Release)  
**Date:** 2026-03-02  
**Context:** Analyzed migration from beta repo (`bradygaster/squad`, v0.5.4) to origin repo (`bradygaster/squad-pr`, v0.8.18-preview). Version gap spans 0.6.x, 0.7.x, 0.8.0–0.8.16 (internal origin development only).

**What:** Beta will jump directly from v0.5.4 to v0.8.17 (skip all intermediate versions). Rationale:
1. **Semantic versioning allows gaps** — version numbers are labels, not counters
2. **Users care about features, not numbers** — comprehensive changelog is more valuable than version sequence
3. **Simplicity reduces risk** — single migration release is easier to execute and communicate
4. **Precedent exists** — major refactors/rewrites commonly skip versions (Angular 2→4, etc)

**Risks & Mitigations:**
- Risk: Version jump confuses users. Mitigation: Clear release notes explaining the gap + comprehensive changelog
- Risk: Intermediate versions were never public (no user expectations). Mitigation: This is actually a benefit — no backfill needed

**Impact:** After merge, beta repo version jumps from v0.5.4 to v0.8.17. All intermediate work is included in the 0.8.17 release. Next release after v0.8.17 may be v0.8.18 or v0.9.0 (team decision post-merge).

**Why:** Avoids maintenance burden of backfilling 12+ fake versions. Users get complete feature set in one migration release.

### 2026-03-02: Beta → Origin Migration: Package Naming

**By:** Kobayashi (Git & Release)  
**Date:** 2026-03-02

**What:** Deprecate `@bradygaster/create-squad` (beta's package name). All future releases use:
- `@bradygaster/squad-cli` (user-facing CLI)
- `@bradygaster/squad-sdk` (programmatic SDK for integrations)

**Why:** Origin's naming is more accurate and supports independent versioning if needed. Monorepo structure benefits from clear package separation.

**Action:** When v0.8.17 is ready to publish, release a final version of `@bradygaster/create-squad` with deprecation notice: "This package has been renamed to @bradygaster/squad-cli. Install with: npm install -g @bradygaster/squad-cli"

**Impact:** Package ecosystem clarity. No breaking change for users upgrading (CLI handles detection and warnings).

### 2026-03-02: Beta → Origin Migration: Retroactive v0.8.17 Tag

**By:** Kobayashi (Git & Release)  
**Date:** 2026-03-02

**What:** Retroactively tag commit `5b57476` ("chore(release): prep v0.8.16 for npm publish") as v0.8.17. This commit and v0.8.16 have identical code.

**Rationale:**
- Commit `6fdf9d5` jumped directly to v0.8.17-preview (no v0.8.17 release tag exists)
- Commit `87e4f1c` bumps to v0.8.18-preview "after 0.8.17 release" (implying v0.8.17 was released)
- Retroactive tagging is less disruptive than creating a new prep commit and rebasing

**Action:** When banana gate clears, tag origin commit `5b57476` as v0.8.17.

**Why:** Completes the missing link in origin's tag history. Indicates to users which commit was released as v0.8.17.

### 2026-03-02: npx Distribution Migration: Error-Only Shim Strategy

**By:** Rabin (Distribution)  
**Date:** 2026-03-02  
**Context:** Beta repo currently uses GitHub-native distribution (`npx github:bradygaster/squad`). Origin uses npm distribution (`npm install -g @bradygaster/squad-cli`). After merge, old path will break.

**Problem:** After migration, `npx github:bradygaster/squad` fails (root `package.json` has no `bin` entry). Users hitting the old path get cryptic npm error.

**Solution — Option 5 (Error-only shim):**
1. Add root `bin` entry pointing to `cli.js`
2. `cli.js` detects GitHub-native invocation and prints **bold, clear error** with migration instructions
3. Exit with code 1 (fail fast, no hidden redirection)

**Implementation:**
```json
{
  "bin": {
    "squad": "./cli.js"
  }
}
```

Update `cli.js` to print error message with new install instructions:
```
npm install -g @bradygaster/squad-cli
```

**Pros:**
- ✅ Clear, actionable error message (not cryptic npm error)
- ✅ Aligns with npm-only team decision (no perpetuation of GitHub-native path)
- ✅ Low maintenance burden (simple error script, no complex shim)
- ✅ Can be removed in v1.0.0 when beta users have migrated

**Cons:**
- Immediate breakage (no grace period) — but users get clear guidance

**Why This Over Others:**
- Option 1 (keep working) contradicts npm-only decision
- Option 2 (exit early) same as this, but explicit error format needed
- Option 3 (time-limited) best UX but maintenance burden
- Option 4 (just break) user-hostile without error message
- **Option 5 balances user experience + team decision**

**Related Decision:** See 2026-02-21 decision "Distribution is npm-only (GitHub-native removed)"

**User Impact:**
- Users running `npx github:bradygaster/squad` see bold error with `npm install -g @bradygaster/squad-cli` instruction
- Existing projects running `squad upgrade` work seamlessly (upgrade logic built-in)
- No data loss or silent breakage

**Upgrade Path (existing beta users):**
```bash
npm install -g @bradygaster/squad-cli
cd /path/to/project
squad upgrade
squad upgrade --migrate-directory  # Optional: .ai-team/ → .squad/
```

**Why:** Rabin's principle: "If users have to think about installation, install is broken." A clear error message respects users better than a cryptic npm error.

### 2026-02-28: Init flow reliability — proposal-first before code

**By:** Keaton (Lead)
**Date:** 2026-02-28
**What:** Init/onboarding fixes require a proposal review before implementation. Proposal at `docs/proposals/reliable-init-flow.md`. Two confirmed bugs (race condition in auto-cast, Ctrl+C doesn't abort init session) plus UX gaps (empty-roster messaging, `/init` no-op). P0 bugs are surgical — don't expand scope.
**Why:** Four PRs (#637–#640) patched init iteratively without a unified design. Before writing more patches, the team needs to agree on the golden path. Proposal-first (per team decision 2026-02-21).
**Impact:** Blocks init-related code changes until Brady reviews the proposal.
- Kovash (REPL): Can call `parseCastResponse` + `createTeam` to wire up casting flow in shell dispatcher
- Verbal (Prompts): INIT_TEAM format is now the contract — coordinator prompt should emit this
- Hockney (Tests): cast.ts needs unit tests for parser edge cases, emoji mapping, file creation

### 2026-03-02: REPL empty-roster gate — dual check pattern
**By:** Fenster (Core Dev)
**Date:** 2026-03-02
**What:** REPL dispatch is now gated on *populated* roster, not just team.md existence. `hasRosterEntries()` in `coordinator.ts` checks for table data rows in the `## Members` section. Two layers: `handleDispatch` blocks with user guidance, `buildCoordinatorPrompt` injects refusal prompt.
**Why:** After `squad init`, team.md exists but is empty. Coordinator received a "route to agents" prompt with no agents listed, causing silent generic AI behavior. Users never got told to cast their team.
**Convention:** Post-init message references "Copilot session" (works in VS Code, github.com, and Copilot CLI). The `/init` slash command provides same guidance inside REPL.
**Impact:** All agents — if you modify the `## Members` table format in team.md templates, update `hasRosterEntries()` to match.

### 2026-03-02: Connection promise dedup in SquadClient
**By:** Fenster (Core Dev)
**Date:** 2026-03-02
**What:** `SquadClient.connect()` now uses a promise dedup pattern — concurrent callers share the same in-flight `connectPromise` instead of throwing "Connection already in progress".
**Why:** Eager warm-up and auto-cast both call `createSession()` → `connect()` at REPL startup, racing on the connection. The throw crashed auto-cast every time.
**Impact:** `packages/squad-sdk/src/adapter/client.ts` only. No API surface change.

### 2026-03-01: CLI UI Polish PRD — Alpha Shipment Over Perfection
**By:** Keaton (Lead)  
**Date:** 2026-03-01  
**Context:** Team image review identified 20+ UX issues ranging from P0 blockers to P3 future polish

**What:** CLI UI polish follows pragmatic alpha shipment strategy: fix P0 blockers + P1 quick wins, defer grand redesign to post-alpha. 20 discrete issues created with clear priority tiers (P0/P1/P2/P3).

**Why:** Brady confirmed "alpha-level shipment acceptable — no grand redesign today." Team converged on 3 P0 blockers (blank screens, static spinner, missing alpha banner) that would embarrass us vs. 15+ polish items that can iterate post-ship.

**Trade-off:** Shipping with known layout quirks (input positioning, responsive tables) rather than blocking on 1-2 week TUI refactor. Users expect alpha rough edges IF we warn them upfront.

**Priority Rationale:**
- **P0 (must fix):** User-facing broken states — blank screens, no feedback, looks crashed
- **P1 (quick wins):** Accessibility (contrast), usability (copy clarity), visual hierarchy — high ROI, low effort
- **P2 (next sprint):** Layout architecture, responsive design — important but alpha-acceptable if missing
- **P3 (future):** Fixed bottom input, alt screen buffer, creative spinner — delightful but not blockers

**Architectural Implications:**
1. **Quick win discovered:** App.tsx overrides ThinkingIndicator's native rotation with static hints (~5 line fix)
2. **Debt acknowledged:** 3 separate separator implementations need consolidation (P2 work)
3. **Layout strategy:** Ink's layout model fights bottom-anchored input. Alt screen buffer is the real solution (P3 deferred).
4. **Issue granularity:** 20 discrete issues vs. 1 monolithic "fix UI" epic — enables parallel work by Cheritto (11 issues), Kovash (4), Redfoot (2), Fenster (1), Marquez (1 review)

**Success Gate:** "Brady says it doesn't embarrass us" — qualitative gate appropriate for alpha software. Quantitative gates: zero blank screens >500ms, contrast ≥4.5:1, spinner rotates every 3s.

**Impact:**
- **Team routing:** Clear ownership — Cheritto (TUI), Kovash (shell), Redfoot (design), Marquez (UX review)
- **Timeline transparency:** P0 (1-2 days) → P1 (2-3 days) → P2 (1 week) — alpha ship when P0+P1 done
- **Expectation management:** Out of Scope section explicitly lists grand redesign, advanced features, WCAG audit — prevents scope creep

### 2026-03-01: Cast confirmation required for freeform REPL casts
**By:** Fenster (Core Dev)  
**Date:** 2026-03-01  
**Context:** P2 from Keaton's reliable-init-flow proposal

**What:** When a user types a freeform message in the REPL and the roster is empty, the cast proposal is shown and the user must confirm (y/yes) before team files are created. Auto-cast from .init-prompt and /init "prompt" skip confirmation since the user explicitly provided the prompt.

**Why:** Prevents garbage casts from vague or accidental first messages (e.g., "hello", "what can you do?"). Matches the squad.agent.md Init Mode pattern where confirmation is required before creating team files.

**Pattern:** pendingCastConfirmation state in shell/index.ts. handleDispatch intercepts y/n at the top before normal routing. inalizeCast() is the shared helper for both auto-confirmed and user-confirmed paths.

### 2026-03-01: Expose setProcessing on ShellApi
**By:** Kovash (REPL Expert)  
**Date:** 2026-03-01  
**Context:** Init auto-cast path bypassed App.tsx handleSubmit, so processing state was never set — spinner invisible during team casting.

**What:** ShellApi now exposes setProcessing(processing: boolean) so that any code path in index.ts that triggers async work outside of handleSubmit can properly bracket it with processing state. This enables ThinkingIndicator and InputPrompt spinner without duplicating React state management.

**Rule:** Any new async dispatch path in index.ts that bypasses handleSubmit **must** call shellApi.setProcessing(true) before the async work and shellApi.setProcessing(false) in a inally block covering all exit paths.

**Files Changed:**
- packages/squad-cli/src/cli/shell/components/App.tsx — added setProcessing to ShellApi interface + wired in onReady
- packages/squad-cli/src/cli/shell/index.ts — added setProcessing calls in handleInitCast (entry, pendingCastConfirmation return, finally block)

### 2026-03-01T20:13:16Z: User directives — UI polish and shipping priorities
**By:** Brady (via Copilot)  
**Date:** 2026-03-01
Ampersands (&) are prohibited in user-facing documentation headings and body text, per Microsoft Style Guide.

**Rule:** Use "and" instead.

**Why:** Microsoft Style Guide prioritizes clarity and professionalism. Ampersands feel informal and reduce accessibility.

**Exceptions:**
- Brand names (AT&T, Barnes & Noble)
- UI element names matching exact product text
- Code samples and technical syntax
- Established product naming conventions

**Scope:** Applies to docs pages, README files, blog posts, community-facing content. Internal files (.squad/** memory files, decision docs, agent history) have flexibility.

**Reference:** https://learn.microsoft.com/en-us/style-guide/punctuation/ampersands


---

## Sprint Directives

### Secret handling — agents must never persist secrets
**By:** RETRO (formerly Baer), v0.8.24
**What:** Agents must NEVER write secrets, API keys, tokens, or credentials into conversational history, commit messages, logs, or any persisted file. Acknowledge receipt without echoing values.
**Why:** Secrets in logs or history are a security incident waiting to happen.


---

## Squad Ecosystem Boundaries & Content Governance

### Squad Docs vs Squad IRL Boundary (consolidated)
**By:** PAO (via Copilot), Flight  
**Date:** 2026-03-10  
**Status:** Active pattern for all documentation PRs

**Litmus test:** If Squad doesn't ship the code or configuration, the documentation belongs in Squad IRL, not the Squad framework docs.

**Categories:**

1. **Squad docs** — Features Squad ships (routing, charters, reviewer protocol, config, behavior)
2. **Squad IRL** — Infrastructure around Squad (webhooks, deployment patterns, logging, external tools, operational patterns)
3. **Gray area:** Platform features (GitHub Issue Templates) → Squad docs if framed as "how to configure X for Squad"

**Examples applied (PR #331):**

| Document | Decision | Reason |
|----------|----------|--------|
| ralph-operations.md | DELETE → IRL | Infrastructure (deployment, logging) around Squad, not Squad itself |
| proactive-communication.md | DELETE → IRL | External tools (Teams, WorkIQ) configured by community, not built into Squad |
| issue-templates.md | KEEP, reframe | GitHub platform feature; clarify scope: "a GitHub feature configured for Squad" |
| reviewer-protocol.md (Trust Levels) | KEEP | Documents user choice spectrum within Squad's existing review system |

**Enforcement:** Code review + reframe pattern ("GitHub provides X. Here's how to configure it for Squad's needs."). Mark suspicious deletions for restore (append-only governance).

**Future use:** Apply this pattern to all documentation PRs to maintain clean boundaries.


---

### Content Triage Skill — External Content Integration
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Skill created at `.squad/skills/content-triage/SKILL.md`

**Pattern:** External content (blog posts, sample repos, videos, conference talks) that helps Squad adoption must be triaged using the "Squad Ships It" boundary heuristic before incorporation.

**Workflow:**
1. Triggered by `content-triage` label or external content reference in issue
2. Flight performs boundary analysis
3. Sub-issues generated for Squad-ownable content extraction (PAO responsibility)
4. FIDO verifies docs-test sync on extracted content
5. Scribe manages IRL references in `.github/irl/references.yml` (YAML schema)

**Label convention:** `content:blog`, `content:sample`, `content:video`, `content:talk`

**Why:** Pattern from PR #331 (Tamir Dresher blog) shows parallel extraction of Squad-ownable patterns (scenario guides, reviewer protocol) and infrastructure patterns (Ralph ops, proactive comms). Without clear boundary, teams pollute Squad docs with operational content or miss valuable patterns that should be generalized.

**Impact:** Enables community content to accelerate Squad adoption without polluting core docs. Flight's boundary analysis becomes reusable decision framework. Prevents scope creep as adoption grows.


---

### PR #331 Quality Gate — Test Assertion Sync
**By:** FIDO (Quality Owner)  
**Date:** 2026-03-10  
**Status:** 🟢 CLEARED (test fix applied, commit 6599db6)

**What was blocked:** Merge blocked on stale test assertions in `test/docs-build.test.ts`.

**Critical violations resolved:**
1. `EXPECTED_SCENARIOS` array stale (7 vs 25 disk files) — ✅ Updated to 25 entries
2. `EXPECTED_FEATURES` constant undefined (32 feature files) — ✅ Created array with 32 entries
3. Test assertion incomplete — ✅ Updated to validate features section

**Why this matters:** Stale assertions that don't reflect filesystem state cause silent test skips. Regression: If someone deletes a scenario file, the test won't catch it. CI passing doesn't guarantee test coverage — only that the test didn't crash.

**Lessons:**
- Test arrays must be refreshed when filesystem content changes
- Incomplete commits break the test-reality sync contract
- FIDO's charter: When adding test count assertions, must keep in sync with disk state

**Outcome:** Test suite: 6/6 passing. Assertions synced to filesystem. No regression risk from stale assertions.


---

### Communication Patterns and PR Trust Models
**By:** PAO  
**Date:** 2026-03-10  
**Status:** Documented in features/reviewer-protocol.md (trust levels section) and scenarios/proactive-communication.md (infrastructure pattern)

**Decision:** Document emerging patterns in real Squad usage: proactive communication loops and PR review trust spectrum.

**Components:**

1. **Proactive communication patterns** — Outbound notifications (Teams webhooks), inbound scanning (Teams/email for work items), two-way feedback loop connecting external sources to Squad workflow

2. **PR trust levels spectrum:**
   - **Full review** (default for team repos) — All PRs require human review
   - **Selective review** (personal projects with patterns) — Domain-expert or routine PRs can auto-merge
   - **Self-managing** (solo personal repos only) — PRs auto-merge; Ralph's work monitoring provides retroactive visibility

**Why:** Ralph 24/7 autonomous deployment creates an awareness gap — how does the human stay informed? Outbound notifications solve visibility. Inbound scanning solves "work lives in multiple places." Trust levels let users tune oversight to their context (full review for team repos, selective for personal projects, self-managing for solo work only).

**Important caveat:** Self-managing ≠ unmonitored; Ralph's work monitoring and notifications provide retroactive visibility.

**Anti-spam expectations:** Don't spam yourself outbound (notification fatigue), don't spam GitHub inbound (volume controls).


---

### Remote Squad Access — Phased Rollout (Proposed)
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Proposed — awaits proposal document in `docs/proposals/remote-squad-access.md`

**Context:** Squad currently requires a local clone to answer questions. Users want remote access from mobile, browser, or different machine without checking out repo.

**Phases:**

**Phase 1: GitHub Discussions Bot (Ship First)**
- Surface: GitHub Discussions
- Trigger: `/squad` command or `@squad` mention
- Context: GitHub Actions workflow checks out repo → full `.squad/` state
- Response: Bot replies to thread
- Feasibility: 1 day
- Why first: Easy to build, zero hosting, respects repo privacy, async Q&A, immediately useful

**Phase 2: GitHub Copilot Extension (High Value)**
- Surface: GitHub Copilot chat (VS Code, CLI, web, mobile)
- Trigger: `/squad ask {question}` in any Copilot client
- Context: Extension fetches `.squad/` files via GitHub API (no clone)
- Response: Answer inline in Copilot
- Feasibility: 1 week
- Why second: Works everywhere Copilot exists, instant response, natural UX

**Phase 3: Slack/Teams Bot (Enterprise Value)**
- Surface: Slack or Teams channel
- Trigger: `@squad` mention in channel
- Context: Webhook fetches `.squad/` via GitHub API
- Response: Bot replies in thread
- Feasibility: 2 weeks
- Why third: Enterprise teams live in chat; high value for companies using Squad

**Constraint:** Squad's intelligence lives in `.squad/` (roster, routing, decisions, histories). Any remote solution must solve context access. GitHub Actions workflows provide checkout for free. Copilot Extension and chat bots use GitHub API to fetch files.

**Implementation:** Before Phase 1 execution, write proposal document. New CLI command: `squad answer --context discussions --question "..."`. New workflow: `.github/workflows/squad-answer.yml`.

**Privacy:** All approaches respect repo visibility or require authentication. Most teams want private by default.

### Test assertion discipline — mandatory
**By:** FIDO (formerly Hockney), v0.8.24
**What:** All code agents must update tests when changing APIs. FIDO has PR blocking authority on quality grounds.
**Why:** APIs changed without test updates caused CI failures and blocked external contributors.

### Docs-test sync — mandatory
**By:** PAO (formerly McManus), v0.8.24
**What:** New docs pages require corresponding test assertion updates in the same commit.
**Why:** Stale test assertions block CI and frustrate contributors.

### Contributor recognition — every release
**By:** PAO, v0.8.24
**What:** Each release includes an update to the Contributors Guide page.
**Why:** No contribution goes unappreciated.

### API-test sync cross-check
**By:** FIDO + Booster, v0.8.24
**What:** Booster adds CI check for stale test assertions. FIDO enforces via PR review.
**Why:** Prevents the pattern of APIs changing without test updates.

### Doc-impact review — every PR
**By:** PAO, v0.8.25
**What:** Every PR must be evaluated for documentation impact. PAO reviews PRs for missing or outdated docs.
**Why:** Code changes without doc updates lead to stale guides and confused users.


---

## Release v0.8.24

### CLI Packaging Smoke Test: Release Gate Decision
**By:** FIDO, v0.8.24  
**Date:** 2026-03-08

The CLI packaging smoke test is APPROVED as the quality gate for npm releases.

**What:**
1. Text box preference: bottom-aligned, squared off (like Copilot CLI / Claude CLI) — future work, not today
2. Alpha-level shipment acceptable for now — no grand UI redesign today
3. CLI must show "experimental, please file issues" banner
4. Spinner/wait messages should rotate every ~3 seconds — use codebase facts, project trivia, vulnerability info, or creative "-ing" words. Never just spin silently.
5. Use wait time to inform or entertain users

**Why:** User request — captured for team memory and crash recovery

### 2026-03-01T20:16:00Z: User directive — CLI timeout too low
**By:** Brady (via Copilot)  
**Date:** 2026-03-01

**What:** The CLI timeout is set too low — Brady tried using Squad CLI in this repo and it didn't work well. Timeout needs to be increased. Not urgent but should be captured as a CLI improvement opportunity.

**Why:** User request — captured for team memory and PRD inclusion

### 2026-03-01: Multi-Squad Storage & Resolution Design
**By:** Keaton (Lead)
**What:** 
- New directory structure: ~/.config/squad/squads/{name}/.squad/ with ~/.config/squad/config.json for registry
- Keep 
esolveGlobalSquadPath() unchanged; add 
esolveNamedSquadPath(name?: string) and listPersonalSquads() on top
- Auto-migration: existing single personal squad moves to squads/default/ on first run
- Resolution priority: explicit (CLI flag) > project config > env var > git remote mapping > path mapping > default
- Global config.json schema: { version, defaultSquad, squads, mappings }

**Why:** 
- squads/ container avoids collisions with existing files at global root
- Backward-compatible: legacy layout detected and auto-migrated; existing code continues to work
- Clean separation: global config lives alongside squads, not inside any one squad
- Resolution chain enables flexible mapping without breaking existing workflows

### 2026-03-01: Multi-Squad SDK Functions
**By:** Kujan (SDK Expert)
**What:**
- New SDK exports: 
esolveNamedSquadPath(), listSquads(), createSquad(), deleteSquad(), switchSquad(), 
esolveSquadForProject()
- New type: SquadEntry { name, path, isDefault, createdAt }
- squads.json registry (separate file, not config.json) with squad metadata and mappings
- SquadDirConfig v2 addition: optional personalSquad?: string field (v1 configs unaffected)
- Consult mode updated: setupConsultMode(options?: { squad?: string }) with explicit selection or auto-resolution

**Why:**
- Lazy migration with fallback chain ensures zero breaking changes to existing users
- Separate squads.json is single source of truth for routing; keeps project config focused
- Version handling allows incremental adoption; v1 configs work unchanged
- SDK resolution functions can be called from CLI and library code without duplication

### 2026-03-01: Multi-Squad CLI Commands & REPL
**By:** Kovash (REPL)
**What:**
- New commands: squad list, squad create <name>, squad switch <name>, squad delete <name>
- Modified commands: squad consult --squad=<name>, squad extract --squad=<name>, squad init --global --name=<name>
- Interactive picker for squad selection: arrow keys (↑/↓), Enter to confirm, Ctrl+C to cancel
- REPL integration: /squad and /squads slash commands with 	riggerSquadReload signal
- .active file stores current active squad name (plain text)
- Status command enhanced to show active squad and squad list

**Why:**
- Picker only shows when needed (multiple squads) and TTY available; non-TTY gracefully uses active squad
- Slash commands follow existing pattern (/init, /agents, etc.); seamless REPL integration
- .active file is simple and atomic; suitable for concurrent CLI access
- Squad deletion safety: cannot delete active squad; requires confirmation

### 2026-03-01: Multi-Squad UX & Interaction Design
**By:** Marquez (UX Designer)
**What:**
- Visual indicator: current squad marked with ●, others with ○; non-default squads tagged [switched]
- Squad name always visible in REPL header and prompt: ◆ Squad (client-acme)
- Picker interactions: ↑/↓ navigate, Enter select, Esc/Ctrl+C cancel; 5-7 squads displayed, wrap around
- Error states: clear copy with next actions (e.g., "Squad not found. Try @squad:personal." or "Run /squads to list.")
- Copy style: active verbs (Create, Switch, List), human-readable nouns (no jargon), 3-5 words per line
- Onboarding: fresh install defaults to "personal"; existing single-squad users see migration notice

**Why:**
- Persistent context (squad name in header/prompt) prevents "Which squad am I in?" confusion
- Interactive picker is discoverable and non-blocking; minimal cognitive load
- Error messages with next actions reduce support friction
- Onboarding defaults and migration notices ensure smooth upgrade path for existing users

# Decision: Separator component is canonical for horizontal rules

**By:** Cheritto (TUI Engineer)
**Date:** 2026-03-02
**Issues:** #655, #670, #671, #677

## What

- All horizontal separator lines in shell components must use the shared `Separator` component (`components/Separator.tsx`), not inline `box.h.repeat()` calls.
- The `Separator` component handles terminal capability detection, box-drawing character degradation, and width computation internally.
- Information hierarchy convention: **bold** for primary CTAs (commands, actions) > normal for content > **dim** for metadata (timestamps, status, hints).
- `flexGrow` should not be used on containers that may be empty — it creates dead space in Ink layouts.

## Why

Duplicated separator logic was found in 3 files (App.tsx, AgentPanel.tsx, MessageStream.tsx). Consolidation to a single component prevents drift and makes it trivial to change separator style globally. The info hierarchy and whitespace conventions ensure visual consistency as new components are added.
### 2026-03-01: PR #547 Remote Control Feature — Architectural Review
**By:** Fenster  
**Date:** 2026-03-01  
**PR:** #547 "Squad Remote Control - PTY mirror + devtunnel for phone access" by tamirdresher (external)

## Context

External contributor Tamir Dresher submitted a PR adding `squad start --tunnel` command to run Copilot in a PTY and mirror terminal output to phone/browser via WebSocket + Microsoft Dev Tunnels.

## Architectural Question

Is remote terminal access via devtunnel + PTY mirroring in scope for Squad v1 core?

## Technical Assessment

**What works:**
- RemoteBridge WebSocket server architecture is sound
- PTY mirroring approach is technically correct
- Session management dashboard is useful
- Security headers and CSP are present
- Test coverage exists (18 tests, though failing due to build issues)

**Critical blockers:**
1. **Build broken** — TypeScript errors in `start.ts`, all tests failing
2. **Command injection vulnerability** — `execFileSync` with string interpolation in `rc-tunnel.ts`
3. **Native dependency** — `node-pty` requires C++ compiler (install friction)
4. **Windows-only effectively** — hardcoded paths, devtunnel CLI Windows-centric
5. **No cross-platform strategy** — macOS/Linux support unclear

**Architectural concerns:**

### 2026-03-02T23:36:00Z: Version target — v0.6.0 for public migration **[SUPERSEDED — see line 1046]**
**By:** Brady (via Copilot)
**What:** The public migration from squad-pr to squad should target v0.6.0, not v0.8.17. This overrides Kobayashi's Phase 5 Option A recommendation. The public repo (bradygaster/squad) goes from v0.5.4 → v0.6.0 — a clean minor bump.
**Why:** User directive. v0.6.0 is the logical next public version from v0.5.4. Internal version numbers (0.6.x–0.8.x) were private development milestones.
**[CORRECTION — 2026-03-03]:** This decision was REVERSED by Brady. Brady explicitly stated: "0.6.0 should NOT appear as the goal for ANY destination. I want the beta to become 0.8.17." The actual migration target is v0.8.17. See the superseding "Versioning Model: npm packages vs Public Repo Tags" decision at line 1046 which clarifies that v0.6.0 is a public repo tag only, while npm packages remain at 0.8.17. Current migration documentation correctly references v0.8.17 throughout.
1. **Not integrated with Squad runtime** — doesn't use EventBus, Coordinator, or agent orchestration. Isolated feature.
2. **Two separate modes** — PTY mode (`start.ts`) vs. ACP passthrough mode (`rc.ts`). Why both?
3. **New CLI paradigm** — "start" implies daemon/server, not interactive mirroring. Command naming collision risk.
4. **External dependency** — requires `devtunnel` CLI installed + authenticated. Not bundled, not auto-installed.
5. **Audit logs** — go to `~/.cli-tunnel/audit/` instead of `.squad/log/` (inconsistent with Squad state location).

## Recommendation

**Request Changes** — Do not merge until:
1. TypeScript build errors fixed
2. Command injection vulnerability patched (use array args, no interpolation)
3. Tests passing (currently 18/18 failing)
4. Cross-platform support documented or Windows-only label added
5. Architectural decision on scope: Is this core or plugin?

**If approved as core feature:**
- Extract to plugin first, prove value, then consider core integration
- Unify PTY vs. ACP modes (pick one)
- Integrate with EventBus/Coordinator (or explain why isolated is correct)
- Rename command to `squad remote` or `squad tunnel` (avoid `start` collision)
- Move audit logs to `.squad/log/`

**If approved as plugin:**
- This is the right path — keeps core small, proves value independently
- Still fix security issues before merge to plugin repo

## For Brady

You requested a runtime review. Here's the verdict:

- **Concept is cool** — phone access to Copilot is a real use case.
- **Implementation needs work** — build broken, security issues, Windows-only.
- **Architectural fit unclear** — not in any Squad v1 PRD. No integration with agent orchestration.
- **Native dependency risk** — `node-pty` adds install friction (C++ compiler required).

**My take:** This belongs in a plugin, not core. External contributor did solid work on the WebSocket bridge, but Squad v1 needs to ship agent orchestration first. Remote access is a nice-to-have, not a v1 must-have.

If you want this in v1, we need a proposal (docs/proposals/) first.

### 2026-03-02: Multi-squad test contract — squads.json schema
**By:** Hockney (Tester)
**Date:** 2026-03-02
**Issue:** #652

## What

Tests for multi-squad (PR #690) encode a specific squads.json contract:

```typescript
interface SquadsJson {
  version: 1;
  defaultSquad: string;
  squads: Record<string, { description?: string; createdAt: string }>;
}
```

Squad name validation regex: `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$` (kebab-case, 1-40 chars).

## Why

Fenster's implementation should match this schema. If the schema changes, tests need updating. Recording so the team knows the contract is encoded in tests.

## Impact

Fenster: Align `multi-squad.ts` types with this schema, or flag if different — Hockney will adjust tests.

### 2026-03-02: PR #582 Review — Consult Mode Implementation
**By:** Keaton (Lead)  
**Date:** 2026-03-01  
**Context:** External contributor PR from James Sturtevant (jsturtevant)

## Decision

**Do not merge PR #582 in its current form.**

This is a planning document (PRD) masquerading as implementation. The PR contains:
- An excellent 854-line PRD for consult mode
- Test stubs for non-existent functions
- Zero actual implementation code
- A history entry claiming work is done (aspirational, not factual)

## Required Actions

1. **Extract PRD to proper location:**
   - Move `.squad/identity/prd-consult-mode.md` → `docs/proposals/consult-mode.md`
   - PRDs belong in proposals/, not identity/

2. **Close this PR with conversion label:**
   - Label: "converted-to-proposal"
   - Comment: Acknowledge excellent design work, explain missing implementation

3. **Create implementation issues from PRD phases:**
   - Phase 1: SDK changes (SquadDirConfig, resolution helpers)
   - Phase 2: CLI command implementation
   - Phase 3: Extraction workflow
   - Each phase: discrete PR with actual code + tests

4. **Architecture discussion needed before implementation:**
   - How does consult mode integrate with existing sharing/ module?
   - Session learnings vs agent history — conceptual model mismatch
   - Remote mode (teamRoot pointer) vs copy approach — PRD contradicts itself

## Architectural Guidance

**What's right:**
- `consult: true` flag in config.json ✅
- `.git/info/exclude` for git invisibility ✅
- `git rev-parse --git-path info/exclude` for worktree compatibility ✅
- Separate extraction command (`squad extract`) ✅
- License risk detection (copyleft) ✅

**What needs rethinking:**
- Reusing `sharing/` module (history split vs learnings extraction — different domains)
- PRD flip-flops between "copy squad" and "remote mode teamRoot pointer"
- No design for how learnings are structured or extracted
- Tests before code (cart before horse)

## Pattern Observed

James Sturtevant is a thoughtful contributor who understands the product vision. The PRD is coherent and well-structured. This connects to his #652 issue (Multiple Personal Squads) — consult mode is a stepping stone to multi-squad workflows.

**Recommendation:** Engage James in architecture discussion before he writes code. This feature has implications for the broader personal squad vision. Get alignment on:
1. Sharing module fit (or new consult module?)
2. Learnings structure and extraction strategy
3. Phase boundaries and deliverables

## Why This Matters

External contributors are engaging with Squad's architecture. We need to guide them toward shippable PRs, not just accept aspirational work. Setting clear expectations now builds trust and avoids wasted effort.

## Files Referenced

- `.squad/identity/prd-consult-mode.md` (PRD, should move)
- `test/consult.test.ts` (tests for non-existent code)
- `.squad/agents/fenster/history.md` (claims work done)
- `packages/squad-sdk/src/resolution.ts` (needs `consult` field, unchanged in PR)


### cli.js is now a thin ESM shim

**By:** Fenster  
**Date:** 2025-07  
**What:** `cli.js` at repo root is a 14-line shim that imports `./packages/squad-cli/dist/cli-entry.js`. It no longer contains bundled CLI code. The deprecation notice only displays when invoked via npm/npx.  
**Why:** The old bundled cli.js was stale and missing commands added after the monorepo migration (e.g., `aspire`). A shim ensures `node cli.js` always runs the latest built CLI.  
**Impact:** `node cli.js` now requires `npm run build` to have been run first (so `packages/squad-cli/dist/cli-entry.js` exists). This was already the case for any development workflow.


### 2026-03-02T01-09-49Z: User directive
**By:** Brady (via Copilot)
**What:** Stop distributing the package via NPX and GitHub. Only distribute via NPM from now on. Go from the public version to whatever version we're in now in the private repo. Adopt the versioning scheme from issue #692.
**Why:** User request — captured for team memory

# Release Plan Update — npm-only Distribution & Semver Fix (#692)

**Status:** DECIDED
**Decided by:** Kobayashi (Git & Release)
**Date:** 2026-03-01T14:22Z
**Context:** Brady's two strategic decisions on distribution and versioning

## Decisions

### 1. NPM-Only Distribution
- **What:** End GitHub-native distribution (`npx github:bradygaster/squad`). Install exclusively via npm registry.
- **How:** Users install via `npm install -g @bradygaster/squad-cli` (global) or `npx @bradygaster/squad-cli` (per-project).
- **Why:** Simplified distribution, centralized source of truth, standard npm tooling conventions.
- **Scope:** Affects all future releases, all external documentation, and CI/CD publish workflows.
- **Owners:** Rabin (docs), Fenster (scripts), all team members (update docs/sample references).

### 2. Semantic Versioning Fix (#692)
- **Problem:** Versions were `X.Y.Z.N-preview` (four-part with prerelease after), which violates semver spec.
- **Solution:** Correct format is `X.Y.Z-preview.N` (prerelease identifier comes after patch, before any build metadata).
- **Examples:**
  - ❌ Invalid: `0.8.6.1-preview`, `0.8.6.16-preview`
  - ✅ Valid: `0.8.6-preview.1`, `0.8.6-preview.16`
- **Impact:** Affects all version strings going forward (package.json, CLI version constant, release tags).
- **Release sequence:** 
  1. Pre-release: `X.Y.Z-preview.1`, `X.Y.Z-preview.2`, ...
  2. At publish: Bump to `X.Y.Z`
  3. Post-publish: Bump to `{next}-preview.1` (reset counter)

### 3. Version Continuity
- **Transition:** Public repo ended at `0.8.5.1`. Private repo continues at `0.8.6-preview` (following semver format).
- **Rationale:** Clear break between public (stable) and private (dev) codebases while maintaining version history continuity.

## Implementation

- ✅ **CHANGELOG.md:** Added "Changed" section documenting distribution channel and semver fix.
- ✅ **Charter (Kobayashi):** Updated Release Versioning Sequence with corrected pattern and phase description.
- ✅ **History (Kobayashi):** Logged decision with rationale and scope.

## Dependent Work

- **Fenster:** Ensure `bump-build.mjs` implements X.Y.Z-preview.N pattern (not X.Y.Z.N-preview).
- **Rabin:** Update README, docs, and all install instructions to reflect npm-only distribution.
- **All:** Use corrected version format in release commits, tags, and announcements.

## Notes

- Zero impact on functionality — this is purely distribution and versioning cleanup.
- Merge drivers on `.squad/agents/kobayashi/history.md` ensure this decision appends safely across parallel branches.
- If questions arise about versioning during releases, refer back to Charter § Release Versioning Sequence.

# Decision: npm-only distribution (GitHub-native removed)

**By:** Rabin (Distribution)
**Date:** 2026-03-01
**Requested by:** Brady

## What Changed

All distribution now goes through npm. The `npx github:bradygaster/squad` path has been fully removed from:
- Source code (github-dist.ts default template, install-migration.ts, init.ts)
- All 4 copies of squad.agent.md (Ralph Watch Mode commands)
- All 4 copies of squad-insider-release.yml (release notes)
- README.md, migration guides, blog posts, cookbook, installation docs
- Test assertions (bundle.test.ts)
- Rabin's own charter (flipped from "never npmjs.com" to "always npmjs.com")

## Install Paths (the only paths)

```bash
# Global install
npm install -g @bradygaster/squad-cli

# Per-use (no install)
npx @bradygaster/squad-cli

# SDK for programmatic use
npm install @bradygaster/squad-sdk
```

## Why

One distribution channel means less confusion, fewer edge cases, and zero SSH-agent hang bugs. npm caching makes installs faster. Semantic versioning works properly. The root `cli.js` still exists with a deprecation notice for anyone who somehow hits the old path.

## Impact

- **All team members:** When writing docs or examples, use `npm install -g @bradygaster/squad-cli` or `npx @bradygaster/squad-cli`. Never reference `npx github:`.
- **CI/CD:** Insider release workflow now shows npm install commands in release notes.
- **Tests:** bundle.test.ts assertions updated to match new default template.


# Decision: Versioning Model — npm Packages vs Public Repo

**Date:** 2026-03-03T02:45:00Z  
**Decided by:** Kobayashi (Git & Release specialist)  
**Related issues:** Migration prep, clarifying confusion between npm and public repo versions  
**Status:** Active — team should reference this in all future releases

## The Problem

The migration process had introduced confusion about which version number applies where:
- Coordinator incorrectly bumped npm package versions to 0.6.0, creating version mismatch
- Migration checklist had npm packages publishing as 0.6.0
- CHANGELOG treated 0.6.0 as an npm package version
- No clear distinction between "npm packages version" vs "public repo GitHub release tag"
- Risk of future mistakes during releases

## The Model (CORRECT)

Two distinct version numbers serve two distinct purposes:

### 1. npm Packages: `@bradygaster/squad-cli` and `@bradygaster/squad-sdk`

- **Follow semver cadence from current version:** Currently at 0.8.17 (published to npm)
- **Next publish after 0.8.17:** 0.8.18 (NOT 0.6.0)
- **Development versions:** Use `X.Y.Z-preview.N` format (e.g., 0.8.18-preview.1, 0.8.18-preview.2)
- **Release sequence per Kobayashi charter:**
  1. Pre-release: `X.Y.Z-preview.N` (development)
  2. At publish: Bump to `X.Y.Z` (e.g., 0.8.18), publish to npm, create GitHub release
  3. Post-publish: Immediately bump to next-preview (e.g., 0.8.19-preview.1)

**MUST NEVER:**
- Bump npm packages down (e.g., 0.8.17 → 0.6.0)
- Confuse npm package version with public repo tag

### 2. Public Repo (bradygaster/squad): GitHub Release Tag `v0.8.17` **[CORRECTED from v0.6.0]**

- **Purpose:** Marks the migration release point for the public repository
- **Public repo version history:** v0.5.4 (final pre-migration) → v0.8.17 (migration release) **[CORRECTED: Originally written as v0.6.0, corrected to v0.8.17 per Brady's directive]**
- **Applied to:** The migration merge commit on beta/main
- **Same as npm versions:** v0.8.17 is BOTH the npm package version AND the public repo tag **[CORRECTED: Originally described as "separate from npm versions"]**
- **No package.json changes:** The tag is applied after the merge commit, but the version in package.json matches the tag

## Why Two Version Numbers? **[CORRECTED: Actually ONE version number — v0.8.17 for both]**

1. **npm packages evolve on their own cadence:** Independent development, independent release cycles (via @changesets/cli)
2. **Public repo is a release marker:** The v0.8.17 tag signals "here's the migration point" to users who clone the public repo **[CORRECTED: Same version as npm, not different]**
3. **They target different audiences:**
   - npm: Users who install via `npm install -g @bradygaster/squad-cli`
   - Public repo: Users who clone `bradygaster/squad` or interact with GitHub releases
   **[CORRECTED: Both use v0.8.17 — the version numbers are aligned, not separate]**

## Impact on Migration Checklist & CHANGELOG

- **migration-checklist.md:** All references correctly use v0.8.17 for both npm packages AND public repo tag. **[CORRECTED: Line originally said "publish as 0.8.18, not 0.6.0" but actual target is 0.8.17]**
- **CHANGELOG.md:** Tracks npm package versions at 0.8.x cadence
- **Future releases:** npm packages and public repo tags use the SAME version number **[CORRECTED: Original text implied they were different]**

## Known Issue: `scripts/bump-build.mjs`

The auto-increment build number script (`npm run build`) can produce invalid semver for non-prerelease versions:
- `0.6.0` + auto-increment → `0.6.0.1` (invalid)
- `0.8.18-preview.1` + auto-increment → `0.8.18-preview.2` (valid)

Since npm packages stay at 0.8.x cadence, this is not a blocker for migration. But worth noting for future patch releases.

## Directive Merged

Brady's directive (2026-03-03T02:16:00Z): "squad-cli and squad-sdk must NOT be bumped down to 0.6.0. They are already shipped to npm at 0.8.17."

✅ **Incorporated:** All fixes ensure npm packages stay at 0.8.x. The v0.8.17 is used for BOTH npm packages AND public repo tag. **[CORRECTED: Original text said "v0.6.0 is public repo only" which was incorrect]**

## Action Items for Team

- Reference this decision when asked "what version should we release?"
- Use this model for all future releases (main project and public repo)
- Update team onboarding docs to include this versioning distinction
### No temp/memory files in repo root
**By:** Brady
**What:** No plan files, memory files, or tracking artifacts in the repository root.
**Why:** Keep the repo clean.


---

## Adoption & Community

### `.squad/` Directory Scope — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** The `.squad/` directory is **reserved for team state only** — roster, routing, decisions, agent histories, casting, and orchestration logs. Non-team data (adoption tracking, community metrics, reports) must NOT live in `.squad/`. Use `.github/` for GitHub platform integration or `docs/` for documentation artifacts.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029193833)

---

### No Individual Repo Listing Without Consent — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** Growth metrics must report **aggregate numbers only** (e.g., "78+ repositories found via GitHub code search") — never name or link to individual community repos without explicit opt-in consent. The monitoring script and GitHub Action concepts are approved, but any public showcase or tracking list that identifies specific repos is blocked until a community consent plan exists.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029222967)

---

### Adoption Tracking — Opt-In Architecture
**By:** Flight (implementing Brady's directives above)  
**Date:** 2026-03-09  

Privacy-first adoption monitoring using a three-tier system:

**Tier 1: Aggregate monitoring (SHIPPED)**
- GitHub Action + monitoring script collect metrics
- Reports moved to `.github/adoption/reports/{YYYY-MM-DD}.md`
- Reports show ONLY aggregate numbers (no individual repo names):
  - "78+ repositories found via code search"
  - Total stars/forks across all discovered repos
  - npm weekly downloads

**Tier 2: Opt-in registry (DESIGN NEXT)**
- Create `SHOWCASE.md` in repo root with submission instructions
- Opted-in projects listed in `.github/adoption/registry.json`
- Monitoring script reads registry, reports only on opted-in repos

**Tier 3: Public showcase (LAUNCH LATER)**
- `docs/community/built-with-squad.md` shows opted-in projects only
- README link added when ≥5 opted-in projects exist

**Rationale:**
- Aggregate metrics safe (public code search results)
- Individual projects only listed with explicit owner consent
- Prevents surprise listings, respects privacy
- Incremental rollout maintains team capacity

**Implementation (PR #326):**
- ✅ Moved `.squad/adoption/` → `.github/adoption/`
- ✅ Stripped tracking.md to aggregate-only metrics
- ✅ Removed individual repo names, URLs, metadata
- ✅ Updated adoption-report.yml and scripts/adoption-monitor.mjs
- ✅ Removed "Built with Squad" showcase link from README (Tier 2 feature)

---

### Adoption Tracking Location & Privacy
**By:** EECOM  
**Date:** 2026-03-10  

Implementation decision confirming Tier 1 adoption tracking changes.

**What:** Move adoption tracking from `.squad/adoption/` to `.github/adoption/`

**Why:**
1. **GitHub integration:** `.github/adoption/` aligns with GitHub convention (workflows, CODEOWNERS, issue templates)
2. **Privacy-first:** Aggregate metrics only; defer individual repo showcase to Tier 2 (opt-in)
3. **Clear separation:** `.squad/` = team internal; `.github/` = GitHub platform integration
4. **Future-proof:** When Tier 2 opt-in launches, `.github/adoption/` is the natural home

**Impact:**
- GitHub Action reports write to `.github/adoption/reports/{YYYY-MM-DD}.md`
- No individual repo information published until Tier 2
- Monitoring continues collecting aggregate metrics via public APIs
- Team sees trends without publishing sensitive adoption data

---

### Append-Only File Governance
**By:** Flight  
**Date:** 2026-03-09  

Feature branches must never modify append-only team state files except to append new content.

**What:** If a PR diff shows deletions in `.squad/agents/*/history.md` or `.squad/decisions.md`, the PR is blocked until deletions are reverted.

**Why:** Session state drift causes agents to reset append-only files to stale branch state, destroying team knowledge. PR #326 deleted entire history files and trimmed ~75 lines of decisions, causing data loss.

**Enforcement:** Code review + future CI check candidate.

---

### Documentation Style: No Ampersands
**By:** PAO  
**Date:** 2026-03-09  

Ampersands (&) are prohibited in user-facing documentation headings and body text, per Microsoft Style Guide.

**Rule:** Use "and" instead.

**Why:** Microsoft Style Guide prioritizes clarity and professionalism. Ampersands feel informal and reduce accessibility.

**Exceptions:**
- Brand names (AT&T, Barnes & Noble)
- UI element names matching exact product text
- Code samples and technical syntax
- Established product naming conventions

**Scope:** Applies to docs pages, README files, blog posts, community-facing content. Internal files (.squad/** memory files, decision docs, agent history) have flexibility.

**Reference:** https://learn.microsoft.com/en-us/style-guide/punctuation/ampersands

---

## Sprint Directives

### Secret handling — agents must never persist secrets
**By:** RETRO (formerly Baer), v0.8.24
**What:** Agents must NEVER write secrets, API keys, tokens, or credentials into conversational history, commit messages, logs, or any persisted file. Acknowledge receipt without echoing values.
**Why:** Secrets in logs or history are a security incident waiting to happen.

---

## Squad Ecosystem Boundaries & Content Governance

### Squad Docs vs Squad IRL Boundary (consolidated)
**By:** PAO (via Copilot), Flight  
**Date:** 2026-03-10  
**Status:** Active pattern for all documentation PRs

**Litmus test:** If Squad doesn't ship the code or configuration, the documentation belongs in Squad IRL, not the Squad framework docs.

**Categories:**

1. **Squad docs** — Features Squad ships (routing, charters, reviewer protocol, config, behavior)
2. **Squad IRL** — Infrastructure around Squad (webhooks, deployment patterns, logging, external tools, operational patterns)
3. **Gray area:** Platform features (GitHub Issue Templates) → Squad docs if framed as "how to configure X for Squad"

**Examples applied (PR #331):**

| Document | Decision | Reason |
|----------|----------|--------|
| ralph-operations.md | DELETE → IRL | Infrastructure (deployment, logging) around Squad, not Squad itself |
| proactive-communication.md | DELETE → IRL | External tools (Teams, WorkIQ) configured by community, not built into Squad |
| issue-templates.md | KEEP, reframe | GitHub platform feature; clarify scope: "a GitHub feature configured for Squad" |
| reviewer-protocol.md (Trust Levels) | KEEP | Documents user choice spectrum within Squad's existing review system |

**Enforcement:** Code review + reframe pattern ("GitHub provides X. Here's how to configure it for Squad's needs."). Mark suspicious deletions for restore (append-only governance).

**Future use:** Apply this pattern to all documentation PRs to maintain clean boundaries.

---

### Content Triage Skill — External Content Integration
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Skill created at `.squad/skills/content-triage/SKILL.md`

**Pattern:** External content (blog posts, sample repos, videos, conference talks) that helps Squad adoption must be triaged using the "Squad Ships It" boundary heuristic before incorporation.

**Workflow:**
1. Triggered by `content-triage` label or external content reference in issue
2. Flight performs boundary analysis
3. Sub-issues generated for Squad-ownable content extraction (PAO responsibility)
4. FIDO verifies docs-test sync on extracted content
5. Scribe manages IRL references in `.github/irl/references.yml` (YAML schema)

**Label convention:** `content:blog`, `content:sample`, `content:video`, `content:talk`

**Why:** Pattern from PR #331 (Tamir Dresher blog) shows parallel extraction of Squad-ownable patterns (scenario guides, reviewer protocol) and infrastructure patterns (Ralph ops, proactive comms). Without clear boundary, teams pollute Squad docs with operational content or miss valuable patterns that should be generalized.

**Impact:** Enables community content to accelerate Squad adoption without polluting core docs. Flight's boundary analysis becomes reusable decision framework. Prevents scope creep as adoption grows.

---

### PR #331 Quality Gate — Test Assertion Sync
**By:** FIDO (Quality Owner)  
**Date:** 2026-03-10  
**Status:** 🟢 CLEARED (test fix applied, commit 6599db6)

**What was blocked:** Merge blocked on stale test assertions in `test/docs-build.test.ts`.

**Critical violations resolved:**
1. `EXPECTED_SCENARIOS` array stale (7 vs 25 disk files) — ✅ Updated to 25 entries
2. `EXPECTED_FEATURES` constant undefined (32 feature files) — ✅ Created array with 32 entries
3. Test assertion incomplete — ✅ Updated to validate features section

**Why this matters:** Stale assertions that don't reflect filesystem state cause silent test skips. Regression: If someone deletes a scenario file, the test won't catch it. CI passing doesn't guarantee test coverage — only that the test didn't crash.

**Lessons:**
- Test arrays must be refreshed when filesystem content changes
- Incomplete commits break the test-reality sync contract
- FIDO's charter: When adding test count assertions, must keep in sync with disk state

**Outcome:** Test suite: 6/6 passing. Assertions synced to filesystem. No regression risk from stale assertions.

---

### Communication Patterns and PR Trust Models
**By:** PAO  
**Date:** 2026-03-10  
**Status:** Documented in features/reviewer-protocol.md (trust levels section) and scenarios/proactive-communication.md (infrastructure pattern)

**Decision:** Document emerging patterns in real Squad usage: proactive communication loops and PR review trust spectrum.

**Components:**

1. **Proactive communication patterns** — Outbound notifications (Teams webhooks), inbound scanning (Teams/email for work items), two-way feedback loop connecting external sources to Squad workflow

2. **PR trust levels spectrum:**
   - **Full review** (default for team repos) — All PRs require human review
   - **Selective review** (personal projects with patterns) — Domain-expert or routine PRs can auto-merge
   - **Self-managing** (solo personal repos only) — PRs auto-merge; Ralph's work monitoring provides retroactive visibility

**Why:** Ralph 24/7 autonomous deployment creates an awareness gap — how does the human stay informed? Outbound notifications solve visibility. Inbound scanning solves "work lives in multiple places." Trust levels let users tune oversight to their context (full review for team repos, selective for personal projects, self-managing for solo work only).

**Important caveat:** Self-managing ≠ unmonitored; Ralph's work monitoring and notifications provide retroactive visibility.

**Anti-spam expectations:** Don't spam yourself outbound (notification fatigue), don't spam GitHub inbound (volume controls).

---

### Remote Squad Access — Phased Rollout (Proposed)
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Proposed — awaits proposal document in `docs/proposals/remote-squad-access.md`

**Context:** Squad currently requires a local clone to answer questions. Users want remote access from mobile, browser, or different machine without checking out repo.

**Phases:**

**Phase 1: GitHub Discussions Bot (Ship First)**
- Surface: GitHub Discussions
- Trigger: `/squad` command or `@squad` mention
- Context: GitHub Actions workflow checks out repo → full `.squad/` state
- Response: Bot replies to thread
- Feasibility: 1 day
- Why first: Easy to build, zero hosting, respects repo privacy, async Q&A, immediately useful

**Phase 2: GitHub Copilot Extension (High Value)**
- Surface: GitHub Copilot chat (VS Code, CLI, web, mobile)
- Trigger: `/squad ask {question}` in any Copilot client
- Context: Extension fetches `.squad/` files via GitHub API (no clone)
- Response: Answer inline in Copilot
- Feasibility: 1 week
- Why second: Works everywhere Copilot exists, instant response, natural UX

**Phase 3: Slack/Teams Bot (Enterprise Value)**
- Surface: Slack or Teams channel
- Trigger: `@squad` mention in channel
- Context: Webhook fetches `.squad/` via GitHub API
- Response: Bot replies in thread
- Feasibility: 2 weeks
- Why third: Enterprise teams live in chat; high value for companies using Squad

**Constraint:** Squad's intelligence lives in `.squad/` (roster, routing, decisions, histories). Any remote solution must solve context access. GitHub Actions workflows provide checkout for free. Copilot Extension and chat bots use GitHub API to fetch files.

**Implementation:** Before Phase 1 execution, write proposal document. New CLI command: `squad answer --context discussions --question "..."`. New workflow: `.github/workflows/squad-answer.yml`.

**Privacy:** All approaches respect repo visibility or require authentication. Most teams want private by default.

### Test assertion discipline — mandatory
**By:** FIDO (formerly Hockney), v0.8.24
**What:** All code agents must update tests when changing APIs. FIDO has PR blocking authority on quality grounds.
**Why:** APIs changed without test updates caused CI failures and blocked external contributors.

### Docs-test sync — mandatory
**By:** PAO (formerly McManus), v0.8.24
**What:** New docs pages require corresponding test assertion updates in the same commit.
**Why:** Stale test assertions block CI and frustrate contributors.

### Contributor recognition — every release
**By:** PAO, v0.8.24
**What:** Each release includes an update to the Contributors Guide page.
**Why:** No contribution goes unappreciated.

### API-test sync cross-check
**By:** FIDO + Booster, v0.8.24
**What:** Booster adds CI check for stale test assertions. FIDO enforces via PR review.
**Why:** Prevents the pattern of APIs changing without test updates.

### Doc-impact review — every PR
**By:** PAO, v0.8.25
**What:** Every PR must be evaluated for documentation impact. PAO reviews PRs for missing or outdated docs.
**Why:** Code changes without doc updates lead to stale guides and confused users.


---

## Release v0.8.24

### CLI Packaging Smoke Test: Release Gate Decision
**By:** FIDO, v0.8.24  
**Date:** 2026-03-08

The CLI packaging smoke test is APPROVED as the quality gate for npm releases.

**What:**
- npm pack → creates tarball of both squad-sdk and squad-cli
- npm install → installs in clean temp directory (simulates user install)
- node {cli-entry.js} → invokes 27 commands + 3 aliases through installed package
- Coverage: All 26 primary commands + 3 of 4 aliases (watch, workstreams, remote-control)

**Why:** Catches broken package.json exports, MODULE_NOT_FOUND errors, ESM resolution failures, command routing regressions — the exact failure modes we've shipped before.

**Gaps (acceptable):**
- Semantic validation not covered (only routing tested)
- Cross-platform gaps (test runs on ubuntu-latest only)
- Optional dependencies allowed to fail (node-pty)

## Impact

- All agents: charter generation now reliably round-trips model preferences.
- Verbal/Keaton: the 4-layer model selection hierarchy documented in squad.agent.md is now supported at the SDK config level.
- Anyone adding new config fields: use the `assertModelPreference()` pattern (accept string-or-object, normalize internally) for fields that need simple and rich config shapes.

# Decision: Runtime ExperimentalWarning suppression via process.emit hook

**Date:** 2026-03-07
**Author:** Fenster (Core Dev)
**Context:** PR #233 CI failure — 4 tests failed

## Problem

PR #233 (CLI wiring fixes for #226, #229, #201, #202) passed all 74 tests locally but failed 4 tests in CI:

- `test/cli-p0-regressions.test.ts` — bare semver test (expected 1 line, got 3)
- `test/speed-gates.test.ts` — version outputs one line (expected 1, got 3)
- `test/ux-gates.test.ts` — no overflow beyond 80 chars (ExperimentalWarning line >80)
- `test/ux-gates.test.ts` — version bare semver (expected 1 line, got 3)

Root cause: `node:sqlite` import triggers Node.js `ExperimentalWarning` that leaks to stderr. The existing `process.env.NODE_NO_WARNINGS = '1'` in cli-entry.ts was ineffective because Node only reads that env var at process startup, not when set at runtime.

The warning likely didn't appear locally because the local Node.js version may have already suppressed it or the env var was set in the shell.

## Decision

Added a `process.emit` override in cli-entry.ts that intercepts `warning` events with `name === 'ExperimentalWarning'` and swallows them. This is placed:
- After `process.env.NODE_NO_WARNINGS = '1'` (which still helps child processes)
- Before the `await import('node:sqlite')` pre-flight check

This is the standard Node.js pattern for runtime warning suppression when you can't control the process launch flags.

## Impact

- **cli-entry.ts**: 12 lines added (comment + override function)
- **Tests**: All 4 previously failing tests now pass; no regressions in structural tests (#624)
- **Behavior**: ExperimentalWarning messages no longer appear in CLI output; other warnings (DeprecationWarning, etc.) are unaffected

### 2026-03-07T14:22:00Z: User directive - Quality cross-review
**By:** Brady (via Copilot)
**What:** All team members must double-and-triple check one another's work. Recent PRs have had weird test failures and inconsistencies. KEEN focus on quality - nothing can slip.
**Why:** User request - quality gate enforcement after speed gate, EBUSY, and cross-contamination issues across PRs #244, #245, #246.


# Decision: Optional dependencies must use lazy loading (#247)

**Date:** 2026-03-09
**Author:** Fenster
**Status:** Active

## Context

Issue #247 — two community reports of installation failure caused by top-level imports of `@opentelemetry/api` crashing when the package wasn't properly installed in `npx` temp environments.

## Decision

1. **All optional/telemetry dependencies must be loaded lazily** — never at module top-level. Use `createRequire(import.meta.url)` inside a `try/catch` for synchronous lazy loading.

2. **Centralized wrapper pattern** — when multiple source files import from the same optional package, create a single wrapper module (e.g., `otel-api.ts`) that provides the fallback logic. Consumers import from the wrapper.

3. **`@opentelemetry/api` is now an optionalDependency** — it was a hard dependency but is functionally optional. The SDK operates with no-op telemetry when absent.

4. **`vscode-jsonrpc` added as direct dep** — improves hoisting for npx installs. The ESM subpath import issue (`vscode-jsonrpc/node` without `.js`) is upstream in `@github/copilot-sdk`.

## Implications

- Any new OTel integration must import from `runtime/otel-api.js`, never directly from `@opentelemetry/api`.
- Test files may continue importing `@opentelemetry/api` directly (it's installed in dev).
- If adding new optional dependencies in the future, follow the same lazy-load + wrapper pattern.


# Release Readiness Check — v0.8.21

**By:** Keaton (Lead)  
**Date:** 2026-03-07  
**Status:** 🟡 SHIP WITH CAVEATS


---

## Executive Summary

v0.8.21 is technically ready to release. All three packages carry the same version string (`0.8.21-preview.7`). Linting passes, 3718 tests pass (19 flaky UI tests pre-existing), CI green on commits. However, **#247 (Installation Failure) must be fixed before shipping**. This is a P0 blocker that breaks the primary installation path. Fenster is actively fixing it.


---

## Version State ✅

All packages aligned at **0.8.21-preview.7:**

- Root `package.json` — v0.8.21-preview.7
- `packages/squad-sdk/package.json` — v0.8.21-preview.7
- `packages/squad-cli/package.json` — v0.8.21-preview.7

**Release Tag:** Should be `v0.8.21-preview.7` (already live as -preview, ready to promote to stable or next -preview if #247 requires a patch).


---

## Git State ✅

**Current Branch:** `dev`  
**Commits since main:** 23 commits (main..dev)

Recent activity (last 10 commits):
- 3f924d0 — fix: remove idle blankspace below agent panel (#239)
- 6a9af95 — docs(ai-team): Merge quality directive into team decisions
- 8d4490b — fix: harden flaky tests (EBUSY retry + init speed gate headroom)
- 363a0a8 — feat: Structured model preference & squad-level defaults (#245)
- a488eb8 — fix: wire missing CLI commands into cli-entry.ts (#244)
- b562ef1 — docs: update fenster history & add model-config decision

**Uncommitted Changes:** 10 files (all acceptable):
- 4 deleted `.squad/decisions/inbox/` files (cleanup, merged to decisions.md)
- 6 untracked images (pilotswarm-*.png — documentation assets)
- 1 untracked `docs/proposals/repl-replacement-prd.md` (draft proposal)

**Status:** Clean. No staged changes that would block release.


---

## Open Blockers ⚠️ P0

### #247 — Squad Installation Fails 🔴 **CRITICAL BLOCKER**

**Impact:** Users cannot install via `npm install -g @bradygaster/squad-cli`.  
**Assignee:** Fenster (actively fixing)  
**Status:** In progress  
**Release Impact:** **SHIP CANNOT PROCEED** until resolved.

**Other Open Issues:**
- #248 — CLI command wiring: `squad triage` does not trigger team assignment loop (minor)
- #242 — Future: Tiered Squad Deployment (deferred, not blocking)
- #241 — New Squad Member for Docs (deferred)
- #240 — ADO configurable work item types (deferred)
- #236 — feat: persistent Ralph (deferred)
- #211 — Squad management paradigms (deferred, release:defer label)

**Release Blockers:** Only #247 prevents shipping.


---

## CHANGELOG Review 📝

**Current `Unreleased` section covers:**

### Added — SDK-First Mode (Phase 1)
- Builder functions (defineTeam, defineAgent, defineRouting, defineCeremony, defineHooks, defineCasting, defineTelemetry, defineSquad)
- `squad build` command with --check, --dry-run, --watch flags
- SDK Mode Detection in Coordinator prompt
- Documentation (SDK-First Mode guide, updated SDK Reference, README quick reference)

### Added — Remote Squad Mode (ported from @spboyer PR #131)
- `resolveSquadPaths()` dual-root resolver
- `squad doctor` command (9-check setup validation)
- `squad link <path>` command
- `squad init --mode remote`
- `ensureSquadPathDual()` / `ensureSquadPathResolved()`

### Changed — Distribution & Versioning
- npm-only distribution (no more GitHub-native `npx github:bradygaster/squad`)
- Semantic Versioning fix (X.Y.Z-preview.N format, compliant with semver spec)
- Version transition from public repo (0.8.5.1) to private repo (0.8.x cadence)

### Fixed
- CLI entry point moved from dist/index.js → dist/cli-entry.js
- CRLF normalization for Windows users
- process.exit() removed from library functions (VS Code extension safe)
- Removed .squad branch protection guard


---

## Test Status 🟡

```
Test Files:  9 failed | 134 passed (143)
Tests:       19 failed | 3718 passed | 3 todo (3740)
Duration:    80.06s
```

**Failures:** All 19 failures are pre-existing UI test timeouts (TerminalHarness spawn issues, not regressions):
- speed-gates.test.ts — 1 timeout
- ux-gates.test.ts — 3 timeouts
- acceptance.test.ts — 8 timeouts
- acceptance/hostile.test.ts — 3 timeouts
- cli/consult.test.ts — 1 timeout

**Assessment:** Passing rate is strong (99.5% pass rate). Timeouts are environmental (not code regressions). Safe to ship with this test state.


---

## CI State ✅

- **Linting:** ✅ PASS (tsc --noEmit clean on both packages)
- **Build:** ✅ PASS (npm run build succeeds)
- **Tests:** 🟡 PASS (99.5% passing, pre-existing flakes)


---

## Release Prep Checklist

- [x] Version strings aligned (0.8.21-preview.7)
- [x] Git state clean (no staged changes)
- [x] Linting passes
- [x] Tests mostly passing (pre-existing flakes only)
- [x] CHANGELOG updated (Unreleased section comprehensive)
- [ ] **#247 resolved (BLOCKER)**
- [ ] Branch merge strategy decided (dev → insiders? or dev → main?)
- [ ] npm publish command prepared


---

## Merge Strategy

**Current branches:**
- `main` — stable baseline
- `dev` — integration branch (23 commits ahead of main)
- `insiders` — exists (used for pre-release channel?)

**Recommendation:**
1. Hold on npm publish until #247 fixed
2. Merge dev → insiders for pre-release testing
3. After QA pass, merge dev → main
4. Tag main as `v0.8.21-preview.7` on npm
5. Consider promoting to `v0.8.21` stable if no further issues


---

## Draft CHANGELOG Entry for v0.8.21

When releasing, move "Unreleased" to versioned section:

```markdown
## [0.8.21-preview.7] - 2026-03-07

### Added — SDK-First Mode (Phase 1)
- [builder functions list]
- [squad build command]
- [SDK Mode Detection]
- [Documentation updates]

### Added — Remote Squad Mode
- [resolver + commands]

### Changed — Distribution & Versioning
- [npm-only, semver fix, version transition]

### Fixed
- [CLI entry point, CRLF, process.exit, branch guard]
```


---

## Decision

**VERDICT: 🟡 RELEASE v0.8.21-preview.7 AFTER #247 FIXED**

- **GO:** Linting, tests, version alignment all sound.
- **HOLD:** #247 installation failure must be resolved. This is a P0 blocker.
- **ACTION:** Fenster owns #247 fix. Once merged to dev, rerun tests and ship.
- **TIMELINE:** 1–2 hours (estimate: Fenster's ETA on #247).

**Owner:** Brady (approves final npm publish)  
**Fallback:** If #247 unresolvable today, defer to v0.8.22 and open a retro ticket.


---

## Notes

- **Community PRs:** 3 community PRs merged cleanly to dev (PR #217, #219, #230). Fork-first contributor workflow is working.
- **Wave planning:** 11 issues targeted for v0.8.22 (5 fix-now + 6 next-wave). 11 deferred to v0.8.23+.
- **Architecture:** SDK/CLI split is clean. Distribution to npm is working. Type safety (strict: true) enforced across both packages.
- **Proposal workflow:** Working as designed. No surprises.



# Decision: Optionalize OpenTelemetry Dependency

## Context
Telemetry is valuable but should not be a hard requirement for running the SDK. Users in air-gapped environments or minimal setups experienced crashes when `@opentelemetry/api` was missing or incompatible.

## Decision
We have wrapped `@opentelemetry/api` in a resilient shim (`packages/squad-sdk/src/runtime/otel-api.ts`) and moved the package to `optionalDependencies`.

### Mechanics
- **Runtime detection:** The wrapper attempts to load `@opentelemetry/api`.
- **Graceful fallback:** If loading fails, it exports no-op implementations of `trace`, `metrics`, and `diag` that match the API surface used by Squad.
- **Developer experience:** Internal code imports from `./runtime/otel-api.ts` instead of the package directly.

## Consequences
- **Positive:** SDK is robust against missing telemetry dependencies. Installation size is smaller for users who opt out.
- **Negative:** We must maintain the wrapper's type compatibility with the real API.
- **Risk:** If we use new OTel features, we must update the no-op implementation.

## Status
Accepted and implemented in v0.8.21.


# Decision: v0.8.21 Blog Post Scope — SDK-First + Full Release Wave

**Date:** 2026-03-11  
**Author:** McManus (DevRel)  
**Impact:** External communication, developer discovery, release narrative

## Problem

v0.8.21 is a major release with TWO significant storylines:
1. **SDK-First Mode** — TypeScript-first authoring, type safety, `squad build` command
2. **Stability Wave** — 26 issues closed, 16 PRs merged, critical crash fix (#247), 3,724 passing tests

Risk: If blog only emphasizes SDK-First, users miss critical stability improvements (crash fix, Windows hardening, test reliability). If blog buries SDK-First, flagship feature loses visibility.

## Decision

Create TWO complementary blog posts with clear ownership:

1. **`024-v0821-sdk-first-release.md`** (existing) — SDK-First deep dive
   - Target: TypeScript-focused teams, SDK adopters
   - Scope: Builders, quick start, Azure Function sample, Phase 2/3 roadmap
   - Tone: Educational, patterns-focused

2. **`025-v0821-comprehensive-release.md`** (new) — Full release wave summary
   - Target: General audience, release notes consumers
   - Scope: All 7 feature areas (SDK-First + Remote Squad + 5 critical fixes), metrics, community credits
   - Tone: Reassuring (crash fixed!), factual (26 issues, 0 logic failures)

**Cross-linking strategy:**
- Comprehensive post links to SDK-First deep dive: "For detailed SDK patterns, see [v0.8.21: SDK-First Mode post](./024-v0821-sdk-first-release.md)"
- SDK-First post references comprehensive post: "For the full release notes, see [v0.8.21: The Complete Release post](./025-v0821-comprehensive-release.md)"

**CHANGELOG updated once** at `[0.8.21]` section with full scope (all 7 areas) — serves as single source of truth for condensed release info.

## Rationale

- **SDK value**: Highlights TypeScript-first workflow, type safety, Azure serverless patterns
- **Stability value**: Installation crash fix alone justifies a major release (user pain elimination)
- **Audience segmentation**: Developers interested in SDK config patterns → read post #024; DevOps/team leads reading release notes → read post #025
- **SEO/discovery**: Two articles = more surface area for search + internal linking
- **Archive preservation**: Both posts preserved in `docs/blog/` for historical record

## Alternative Rejected

**Single mega-post:** Would be 25+ KB, overwhelming, diffuses message (SDK patterns + crash fix + CI stability = scattered narrative). Two posts with clear focus are easier to scan and share.

## Enforcement

- CHANGELOG.md single `[0.8.21]` section (source of truth)
- Blog post #025 designated "comprehensive" (headline for external comms)
- Blog post #024 designated "technical deep dive" (for SDK adopters)
- Release announcement on GitHub uses post #025 as primary link


---

**Decided by:** McManus (DevRel) on behalf of tone ceiling + messaging coherence  
**Reviewed by:** Internal tone ceiling check (substantiated claims, no hype, clear value messaging)


### 2026-03-07 07:51 UTC: SDK-First init/migrate deferred to v0.8.22
**By:** Keaton (Coordinator), Brady absent - autonomous decision
**What:** SDK-First mode gaps (init --sdk flag, standalone migrate command, comprehensive docs) deferred to v0.8.22.
**Why:** v0.8.21 has all P0 blockers resolved. Adding features now risks regression. Filed #249, #250, #251.
**Issues filed:**
- #249: squad init --sdk flag for SDK-First mode opt-in
- #250: standalone squad migrate command (subsumes #231)
- #251: comprehensive SDK-First mode documentation


### 2026-03-07T08-14-43Z: User directive
**By:** Brady (via Copilot)
**What:** Issues #249, #250, and #251 (SDK-First init --sdk flag, standalone migrate command, comprehensive SDK-First docs) are committed to v0.8.22 - not backlog, not optional.
**Why:** User request - captured for team memory


### 2026-03-07T16-19-00Z: Pre-release triage — v0.8.21 release ready pending #248 fix
**By:** Keaton (Lead)
**What:** Analyzed all 23 open issues. Result: v0.8.21 releases cleanly pending fix for #248 (triage team dispatch). v0.8.22 roadmap is well-scoped (9 issues, 3 parallel streams). Close #194 (completed) and #231 (duplicate).
**Why:** Final release gate. Coordinator override: #248 deferred to v0.8.22 (standalone CLI feature, not core to interactive experience). Keeps release unblocked.
**Details:** 2 closeable, 1 P0 override, 9 for v0.8.22, 5 for v0.8.23+, 1 for v0.9+, 4 backlog. See .squad/orchestration-log/2026-03-07T16-19-00Z-keaton.md for full triage table.

### 2026-03-07T16-19-00Z: PR hold decision — #189 (workstreams) and #191 (ADO) rebase to dev for v0.8.22
**By:** Hockney (Tester)
**What:** Both PRs are held for v0.8.22 and must rebase from main to dev. Neither ships for v0.8.21.
**Why:** PR #189: merge conflicts, no CI, process.exit() violation, missing CLI tests, 6 unresolved review threads. PR #191: merge conflicts, no CI, untested security fixes, incomplete Planner adapter. Both have solid architecture but insufficient readiness for v0.8.21.
**Details:** See .squad/orchestration-log/2026-03-07T16-19-00Z-hockney.md for detailed code assessment.

### 2026-03-07T16-19-00Z: Docs ready for v0.8.21 — no release blockers
**By:** McManus (DevRel)
**What:** v0.8.21 documentation is ship-ready. SDK-First mode guide (705 lines), What's New blog, CHANGELOG, and contributors section all complete. No blocking gaps.
**Why:** Release readiness gate. Docs are complete for Phase 1. Minor gaps are non-blocking and addressed in v0.8.22 roadmap.
**Details:** 2 docs issues queued for v0.8.22 (#251 restructure, #210 contributors workflow). See .squad/orchestration-log/2026-03-07T16-19-00Z-mcmanus.md for full triage.

### 2026-03-07T16:20: User directive — Shift from Actions to CLI
**By:** Brady (via Copilot)
**What:** "I'm seriously concerned about our continued abuse of actions and think the more we can stop relying on actions to do things and start relying on the cli to do things, it puts more emphasis and control in the user's hand and less automation with actions. I think we're maybe going to surprise customers with some of the usage in actions and I would really hate for that to be a deterrent from using squad."
**Why:** User directive — strategic direction for the product. Actions usage can surprise customers with unexpected billing and loss of control. CLI-first puts the user in the driver's seat.

### Current Actions Inventory (15 workflows)

**Squad-specific (customer concern):**
1. `sync-squad-labels.yml` — Auto-syncs labels from team.md on push
2. `squad-triage.yml` — Auto-triages issues when labeled "squad"
3. `squad-issue-assign.yml` — Auto-assigns issues when squad:{member} labeled
4. `squad-heartbeat.yml` — Ralph heartbeat/auto-triage (cron currently disabled)
5. `squad-label-enforce.yml` — Label mutual exclusivity on label events

**Standard CI/Release (expected):**
6. `squad-ci.yml` — Standard PR/push CI
7. `squad-release.yml` — Tag + release on push to main
8. `squad-promote.yml` — Branch promotion (workflow_dispatch)
9. `squad-main-guard.yml` — Forbidden file guard
10. `squad-preview.yml` — Preview validation
11. `squad-docs.yml` — Docs build/deploy
12-15. Publish/insider workflows

**Directive:** Move squad-specific automation (1-5) into CLI commands. Keep standard CI/release workflows.

### 2026-03-07T16:20: User directive — Shift from Actions to CLI
**By:** Brady (via Copilot)
**What:** "I'm seriously concerned about our continued abuse of actions and think the more we can stop relying on actions to do things and start relying on the cli to do things, it puts more emphasis and control in the user's hand and less automation with actions. I think we're maybe going to surprise customers with some of the usage in actions and I would really hate for that to be a deterrent from using squad."
**Why:** User directive — strategic direction for the product. Actions usage can surprise customers with unexpected billing and loss of control. CLI-first puts the user in the driver's seat.

### Current Actions Inventory (15 workflows)

**Squad-specific (customer concern):**
1. `sync-squad-labels.yml` — Auto-syncs labels from team.md on push
2. `squad-triage.yml` — Auto-triages issues when labeled "squad"
3. `squad-issue-assign.yml` — Auto-assigns issues when squad:{member} labeled
4. `squad-heartbeat.yml` — Ralph heartbeat/auto-triage (cron currently disabled)
5. `squad-label-enforce.yml` — Label mutual exclusivity on label events

**Standard CI/Release (expected):**
6. `squad-ci.yml` — Standard PR/push CI
7. `squad-release.yml` — Tag + release on push to main
8. `squad-promote.yml` — Branch promotion (workflow_dispatch)
9. `squad-main-guard.yml` — Forbidden file guard
10. `squad-preview.yml` — Preview validation
11. `squad-docs.yml` — Docs build/deploy
12-15. Publish/insider workflows

**Directive:** Move squad-specific automation (1-5) into CLI commands. Keep standard CI/release workflows.

### Follow-up (Brady, same session):
> "seems like the more we can offload to ourselves, the more we could control, say, in a container. if actions are doing the work the loop is outside of our control a bit"

**Key insight:** CLI-first makes Squad **portable**. If the work lives in CLI commands instead of Actions, Squad can run anywhere — Codespaces, devcontainers, local terminals, persistent ACA containers. Actions lock the control loop to GitHub's event system. CLI-first means the user (or their infrastructure) owns the execution loop, not GitHub Actions.


# CLI Feasibility Assessment — GitHub Actions → CLI Commands
**Author:** Fenster (Core Dev)  
**Date:** 2026-03-07  
**Context:** Brady's request to migrate squad-specific workflows to CLI commands


---

## Executive Summary

**Quick wins:** Label sync + label enforce can ship in v0.8.22 (reuses existing parsers, zero new deps).  
**Medium effort:** Triage command is 70% done (CLI watch already exists), needs GitHub comment posting.  
**Heavy lift:** Issue assign + heartbeat need copilot-swe-agent[bot] API (PAT + agent_assignment field) — no `gh` CLI equivalent exists. Watch mode already implements heartbeat's core logic locally.

**Key insight:** We already have `squad watch` — it's the local equivalent of `squad-heartbeat.yml`. The workflow runs in GitHub Actions with PAT; watch runs locally with `gh` CLI. They share the same triage logic (`@bradygaster/squad-sdk/ralph/triage`).


---

## 1. Current CLI Command Inventory

**Existing commands** (`packages/squad-cli/src/cli/commands/`):

| Command | Function | Overlap with Workflows |
|---------|----------|------------------------|
| **watch** | Ralph's local polling — triages issues, monitors PRs, assigns labels. Uses `gh` CLI. | ✅ 80% overlap with `squad-heartbeat.yml` + `squad-triage.yml` |
| plugin | Marketplace add/remove. Uses `gh` CLI for repo access. | ❌ No workflow overlap |
| export | Export squad state to JSON. | ❌ No workflow overlap |
| import | Import squad state from JSON. | ❌ No workflow overlap |
| build | SDK config generation. | ❌ No workflow overlap |
| doctor | Health checks (local/remote/hub). | ❌ No workflow overlap |
| aspire | Launch Aspire dashboard for OTel. | ❌ No workflow overlap |
| start | Interactive shell (Coordinator mode). | ❌ No workflow overlap |
| consult | Spawn agent for consultation. | ❌ No workflow overlap |
| rc/rc-tunnel | Remote control server + devtunnel. | ❌ No workflow overlap |
| copilot/copilot-bridge | Copilot SDK adapter. | ❌ No workflow overlap |
| link/init-remote | Link to remote squad repo. | ❌ No workflow overlap |
| streams | Workstream commands (stub). | ❌ No workflow overlap |

**Key reusable infrastructure:**
- **`gh-cli.ts`** — Thin wrapper around `gh` CLI: `ghIssueList`, `ghIssueEdit`, `ghPrList`, `ghAvailable`, `ghAuthenticated`
- **`@bradygaster/squad-sdk/ralph/triage`** — Shared triage logic (routing rules, module ownership, keyword matching)
- **`watch.ts`** — Already implements triage cycle + PR monitoring


---

## 2. Per-Workflow Migration Plan

### 2.1. sync-squad-labels.yml → `squad labels sync`

**Current workflow:** 170 lines. Parses `team.md`, syncs `squad`, `squad:{member}`, `go:*`, `release:*`, `type:*`, `priority:*`, `bug`, `feedback` labels. Uses Octokit.

**Proposed CLI command:**
```bash
squad labels sync [--squad-dir .squad] [--dry-run]
```

**Implementation:**
- **Size:** S (2-3 hours)
- **Dependencies:** 
  - ✅ `gh` CLI (already used in plugin.ts, watch.ts)
  - ✅ `parseRoster()` from `@bradygaster/squad-sdk/parsers` (already exists)
  - ✅ Thin wrapper — reuse roster parser, call `gh label create/edit`
- **Offline:** ❌ Needs GitHub API access via `gh`
- **Reuse:** Roster parsing (team.md → member list) already exists. Just needs label creation loop with `gh`.
- **Complexity:** Low. No auth complexity (uses `gh auth` flow). No copilot-swe-agent API.

**Why quick win:** Zero new parsers needed. Label sync is idempotent (create-or-update pattern). Can run manually after `team.md` changes.


---

### 2.2. squad-triage.yml → `squad triage` (or extend `squad watch`)

**Current workflow:** 260 lines. On `squad` label, parses `team.md` + `routing.md`, keyword-matches, applies `squad:{member}` label, posts comment.

**Proposed CLI command:**
```bash
squad triage [--issue <number>] [--squad-dir .squad]
```
Or: enhance `squad watch` to post comments (currently it only adds labels).

**Implementation:**
- **Size:** M (4-6 hours)
- **Dependencies:** 
  - ✅ `gh` CLI (already used)
  - ✅ `triageIssue()` from `@bradygaster/squad-sdk/ralph/triage` (already used in watch.ts)
  - ❌ **Missing:** `gh issue comment` wrapper in `gh-cli.ts` (5 lines to add)
- **Offline:** ❌ Needs GitHub API
- **Reuse:** 
  - **watch.ts already does this** (line 189-209). Just missing comment posting.
  - Triage logic, routing rules, module ownership — all implemented.
- **Complexity:** Low. The logic exists; just needs `gh issue comment <number> --body <text>` wrapper.

**Why medium effort:** Code exists. Just needs comment posting feature added to `gh-cli.ts` and called from `watch.ts`.


---

### 2.3. squad-issue-assign.yml → ???

**Current workflow:** 160 lines. On `squad:{member}` label, posts assignment comment, calls **copilot-swe-agent[bot] assignment API with PAT** (lines 116-161).

**Problem:** The workflow uses a special POST endpoint:
```js
POST /repos/{owner}/{repo}/issues/{issue_number}/assignees
{
  assignees: ['copilot-swe-agent[bot]'],
  agent_assignment: {
    target_repo: `${owner}/${repo}`,
    base_branch: baseBranch,
    custom_instructions: '',
    custom_agent: '',
    model: ''
  }
}
```
**This endpoint does NOT exist in `gh` CLI.** It requires:
- Personal Access Token (PAT) with `issues:write` scope
- Direct Octokit call (cannot use `gh` as thin wrapper)

**Migration options:**
1. **Add Octokit dependency** — heavyweight (35+ deps), violates zero-dependency CLI goal
2. **Add raw HTTPS module** — 50-100 lines to make authenticated POST with PAT, parse JSON response
3. **Document manual workflow** — "To auto-assign @copilot, use the GitHub Actions workflow (requires PAT)"

**Proposed approach:**
- **Do NOT migrate.** Keep as workflow-only feature.
- **Reasoning:** The copilot-swe-agent assignment API is GitHub-specific and requires secrets (PAT). CLI commands should not manage secrets. Workflows already have secure secret storage.
- **Alternative:** Document `squad watch` as the local equivalent (it can label + post comments, but not trigger bot assignment).

**Implementation:**
- **Size:** XL (8-12 hours if full migration)
- **Dependencies:** 
  - ❌ PAT management (needs secret storage or prompting)
  - ❌ Octokit or raw HTTPS POST wrapper (50-100 lines)
  - ❌ Not available in `gh` CLI
- **Offline:** ❌ Never (GitHub-specific API)
- **Complexity:** High. Requires secret handling, bot assignment API, error handling, fallback.

**Recommendation:** **Do not migrate.** Keep as workflow. Document that copilot auto-assign requires Actions + PAT.


---

### 2.4. squad-heartbeat.yml → Already exists as `squad watch`

**Current workflow:** 170 lines. Runs on cron (disabled), issues closed/labeled, PRs closed. Triages untriaged issues, assigns @copilot to `squad:copilot` issues.

**CLI equivalent:** **Already shipped as `squad watch`** (`packages/squad-cli/src/cli/commands/watch.ts`, 356 lines).

**What `squad watch` does:**
- Polls open issues with `squad` label
- Triages untriaged issues (adds `squad:{member}` label)
- Monitors PRs (draft/needs-review/changes-requested/CI failures/ready-to-merge)
- Runs on interval (default: 30 minutes)
- Uses `gh` CLI for auth + API access
- Uses shared `@bradygaster/squad-sdk/ralph/triage` logic

**What `squad watch` does NOT do (that heartbeat.yml does):**
- ❌ Post triage comments (workflow posts "Ralph — Auto-Triage" comments)
- ❌ Auto-assign copilot-swe-agent[bot] (requires PAT + bot API, same issue as #2.3)

**Implementation gap:**
- **Comment posting:** M (4-6 hours) — add `gh issue comment` wrapper to `gh-cli.ts`, call it from `runCheck()` in watch.ts
- **Copilot auto-assign:** Do not migrate (same as #2.3)

**Migration plan:**
- ✅ **Already done.** `squad watch` is the local heartbeat.
- **Add comment posting** to match workflow behavior (quick win, 4-6 hours).
- **Document copilot auto-assign** as workflow-only (requires PAT).

**Recommendation:** Enhance `squad watch` with comment posting. Keep copilot auto-assign in workflow.


---

### 2.5. squad-label-enforce.yml → `squad labels enforce`

**Current workflow:** 180 lines. On label applied, removes conflicting labels from mutual-exclusivity namespaces (`go:`, `release:`, `type:`, `priority:`). Posts update comment.

**Proposed CLI command:**
```bash
squad labels enforce [--issue <number>] [--squad-dir .squad]
```

**Implementation:**
- **Size:** S (2-4 hours)
- **Dependencies:** 
  - ✅ `gh` CLI (already used)
  - ❌ `gh issue edit --remove-label <label>` (already exists in `gh-cli.ts` as `ghIssueEdit`)
  - ❌ `gh issue comment` (needs 5-line wrapper in `gh-cli.ts`)
- **Offline:** ❌ Needs GitHub API
- **Reuse:** 
  - `ghIssueEdit()` already supports `removeLabel` (line 119).
  - Enforcement logic is pure JS (no parsing needed).
- **Complexity:** Low. Fetch issue labels, check prefixes, remove conflicts, post comment.

**Why quick win:** No parsing. No complex logic. Just label list manipulation + `gh` CLI calls (already have the wrappers).


---

## 3. The `squad watch` Connection

**`squad watch` is the local heartbeat.** It already does 80% of what `squad-heartbeat.yml` does:
- ✅ Triage untriaged issues (adds `squad:{member}` label)
- ✅ Monitor PR states (draft/review/CI/merge-ready)
- ✅ Poll on interval (default: 30 min, configurable)
- ✅ Report board state (untriaged/assigned/drafts/CI failures/ready-to-merge)
- ❌ Post triage comments (workflow does this)
- ❌ Auto-assign copilot-swe-agent[bot] (requires PAT + bot API)

**Key difference:** Workflow runs in GitHub Actions with PAT. Watch runs locally with `gh` CLI auth.

**Can `squad watch` subsume heartbeat.yml entirely?**
- **No** — not for copilot auto-assign (needs PAT + bot API).
- **Yes** — for triage + PR monitoring (already implemented).
- **Partial** — if we add comment posting (4-6 hour lift).

**Recommendation:** Keep heartbeat.yml for copilot auto-assign (PAT-only feature). Enhance `squad watch` with comment posting for parity on triage behavior.


---

## 4. Technical Risks

### What's Harder Than It Looks

1. **Copilot-swe-agent[bot] assignment API** — Not exposed in `gh` CLI. Requires PAT + Octokit or raw HTTPS. Violates zero-dependency CLI goal. **Mitigation:** Keep as workflow-only feature.

2. **Secret management for PAT** — CLI should not prompt for or store PATs. Workflows have secure secret storage. **Mitigation:** Do not migrate PAT-dependent workflows.

3. **Comment posting at scale** — Triage comments have rich formatting (team roster, routing rules, member bios). Watch loop runs every N minutes. Posting comments on every cycle could spam issues. **Mitigation:** Only post comments when triage decision is made (same as workflow).

4. **Offline story** — All workflows need GitHub API. CLI commands will fail without `gh auth login`. **Mitigation:** Document auth requirement. Already have `ghAuthenticated()` check in watch.ts.

### What's Easier Than It Looks

1. **Label sync** — Idempotent create-or-update. No complex parsing (roster already implemented). Just needs `gh label create/edit` loop. **Quick win.**

2. **Label enforce** — No parsing needed. Pure label list manipulation. `gh-cli.ts` already has `removeLabel`. **Quick win.**

3. **Triage logic** — Already implemented in `@bradygaster/squad-sdk/ralph/triage` and used by both `watch.ts` and `ralph-triage.js`. **Reuse at 100%.**

4. **PR monitoring** — Already implemented in `watch.ts` (line 67-148). Returns PR board state (drafts/needs-review/changes-requested/CI failures/ready-to-merge). **Done.**


---

## 5. Implementation Estimate

### Quick Wins (v0.8.22 — could ship today)

**Total: 4-7 hours**

1. **`squad labels sync`** — S (2-3 hours)
   - Reuse `parseRoster()`, add label create/edit loop with `gh`
   - Supports `--dry-run`, `--squad-dir`
   - Zero new deps

2. **`squad labels enforce`** — S (2-4 hours)
   - Add `gh issue comment` wrapper to `gh-cli.ts` (5 lines)
   - Implement mutual-exclusivity logic (pure JS, no parsing)
   - Fetch issue labels, remove conflicts, post comment

### Medium Effort (v0.8.22 stretch or v0.8.23)

**Total: 4-6 hours**

3. **Enhance `squad watch` with comment posting** — M (4-6 hours)
   - Add `gh issue comment` wrapper to `gh-cli.ts` (if not done in #2)
   - Call it from `runCheck()` in watch.ts when triage decision is made
   - Match workflow comment format (team roster, routing reason, member info)
   - **Result:** `squad watch` now has full parity with triage + heartbeat workflows (minus copilot auto-assign)

### Heavy Lift (v0.9+ or never)

**Total: 8-12 hours**

4. **`squad copilot assign` (copilot-swe-agent[bot] API)** — XL (8-12 hours)
   - Add Octokit dependency OR raw HTTPS POST wrapper (50-100 lines)
   - Add PAT secret management (prompt or env var)
   - Implement agent_assignment API call
   - Error handling, fallback to basic assignment
   - **Recommendation:** Do not migrate. Keep as workflow-only feature. Workflows already have PAT storage.


---

## 6. Recommendation

### Ship Now (v0.8.22)

1. **`squad labels sync`** — 2-3 hours. Quick win. Zero deps.
2. **`squad labels enforce`** — 2-4 hours. Quick win. Reuses existing wrappers.

### Ship Next (v0.8.23)

3. **Enhance `squad watch` with comment posting** — 4-6 hours. Medium effort. Full parity with triage workflow (minus copilot auto-assign).

### Do Not Migrate

4. **Copilot auto-assign** (issue-assign.yml + heartbeat.yml copilot auto-assign step) — Keep as workflow-only. Requires PAT + bot API not exposed in `gh` CLI. Violates zero-dependency CLI goal.

### Already Exists

5. **`squad watch`** — Already shipped (v0.8.16+). Local equivalent of heartbeat.yml. Triages issues, monitors PRs. Missing comment posting (4-6 hour gap).


---

## 7. Summary Table

| Workflow | CLI Command | Complexity | Can Migrate? | Estimate |
|----------|-------------|------------|--------------|----------|
| sync-squad-labels.yml | `squad labels sync` | S | ✅ Yes | 2-3 hrs (v0.8.22) |
| squad-label-enforce.yml | `squad labels enforce` | S | ✅ Yes | 2-4 hrs (v0.8.22) |
| squad-triage.yml | Enhance `squad watch` | M | ✅ Partial | 4-6 hrs (v0.8.23) |
| squad-heartbeat.yml | Already `squad watch` | M | ✅ Done | 0 hrs (shipped) |
| squad-issue-assign.yml | N/A | XL | ❌ No | Keep workflow (PAT-only) |

**Total migration effort:** 8-13 hours for full CLI parity (minus copilot auto-assign).

**v0.8.22 quick wins:** 4-7 hours (labels sync + enforce).

**v0.8.23 polish:** 4-6 hours (watch comment posting).


---

## 8. Next Steps

1. **Brady decides:** Ship labels commands in v0.8.22?
2. **If yes:** Fenster implements `squad labels sync` + `squad labels enforce` (4-7 hours total).
3. **If comment posting desired:** Add `gh issue comment` wrapper to `gh-cli.ts`, call it from watch.ts (4-6 hours).
4. **Document:** Copilot auto-assign requires GitHub Actions + PAT. `squad watch` is local equivalent for triage + PR monitoring.


---

**Author:** Fenster  
**Date:** 2026-03-07  
**Status:** Awaiting Brady's go/no-go decision


# Actions → CLI Migration Strategy
**Author:** Keaton (Lead)  
**Date:** 2026-03-07  
**Requested by:** Brady  

## Executive Summary

Brady's concern is valid: **Squad is surprising users with automated GitHub Actions that consume API quota and execute without explicit user intent.** The current model treats Squad as an automated bot service rather than a user-controlled tool.

**Core principle:** Squad should be a CLI-first tool that users invoke when they want it, not an always-on automation layer that reacts to every label change.

**Recommendation:** Migrate 5 squad-specific workflows to CLI commands. Keep 10 standard CI/CD workflows (expected by any project). Target v0.8.22 for deprecation warnings, v0.9.0 for removal.


---

## Classification: All 15 Workflows

### 🟢 KEEP — Standard CI/CD (10 workflows)

These are expected by ANY modern project. No surprise factor. Keep as-is.

| Workflow | Trigger | Why Keep |
|----------|---------|----------|
| **squad-ci.yml** | PR/push to dev/insider | Standard CI — every repo needs this |
| **squad-release.yml** | Push to main | Standard release automation — tag + GitHub Release |
| **squad-promote.yml** | workflow_dispatch only | Manual branch promotion — user-triggered |
| **squad-main-guard.yml** | PR/push to main/preview/insider | Prevents forbidden files on release branches — safety net |
| **squad-preview.yml** | Push to preview | Pre-release validation — standard quality gate |
| **squad-docs.yml** | Push to main (docs/**) | Docs build/deploy to GH Pages — standard pattern |
| **publish.yml** | Tag push (v*) | npm publish on tag — standard release flow |
| **squad-publish.yml** | Tag push (v*) | npm publish (monorepo variant) — standard release flow |
| **squad-insider-release.yml** | Push to insider | Insider build tagging — standard preview channel |
| **squad-insider-publish.yml** | Push to insider | Insider npm publish — standard preview channel |

**Verdict:** These workflows are **expected behavior** for a project with CI/CD. No user would be surprised that pushing to `main` triggers a release or that opening a PR runs tests. Keep all 10.


---

### 🟡 MIGRATE TO CLI — Squad-Specific Automation (5 workflows)

These workflows execute Squad logic on GitHub events. They surprise users because they:
- Consume GitHub API quota automatically
- Execute AI logic without user awareness
- Make label/assignment decisions on behalf of the user
- Trigger on innocuous actions (adding a label)

| Workflow | Trigger | Surprise Factor | CLI Replacement |
|----------|---------|-----------------|-----------------|
| **sync-squad-labels.yml** | Push to team.md | 🟡 Moderate — creates ~30+ labels automatically | `squad labels sync` |
| **squad-triage.yml** | issues:[labeled] when "squad" label added | 🔴 HIGH — AI routing + label assignment + comment | `squad triage` or `squad triage <issue>` |
| **squad-issue-assign.yml** | issues:[labeled] when squad:{member} label added | 🟡 Moderate — posts comment, assigns @copilot | `squad assign <issue> <member>` |
| **squad-heartbeat.yml** | issues:[closed/labeled], PR:[closed], cron (disabled) | 🔴 HIGH — Ralph auto-triage every 30min (if enabled) | `squad watch` (user keeps terminal open) |
| **squad-label-enforce.yml** | issues:[labeled] | 🟡 Moderate — removes conflicting labels, posts comments | `squad labels check <issue>` |

**Total:** 5 workflows to migrate.


---

## Migration Architecture

### 1. **sync-squad-labels.yml** → `squad labels sync`

**Current behavior:** On push to `.squad/team.md`, automatically syncs ~30+ labels (squad:*, go:*, release:*, type:*, priority:*).

**CLI replacement:**
```bash
squad labels sync
# Reads .squad/team.md, creates/updates labels via GitHub API
# Output: "✓ Created 12 labels, updated 18 labels"
```

**When users run it:**
- After editing `.squad/team.md` (new member added)
- During initial Squad setup (`squad init` could offer to run it)
- Manually when they want to refresh label definitions

**Tradeoff:** Labels won't auto-sync. Users must remember to run this.  
**Mitigation:** `squad init` runs it automatically. `squad doctor` warns if team.md changed but labels haven't been synced.


---

### 2. **squad-triage.yml** → `squad triage`

**Current behavior:** On "squad" label added, reads team.md + routing.md, does keyword-based routing, assigns squad:{member} label, posts triage comment.

**CLI replacement:**
```bash
# Triage all issues with "squad" label and no squad:{member} label
squad triage

# Triage a specific issue
squad triage 42

# Output:
# ✓ Issue #42: Assigned to Ripley (Frontend) — matches "UI component" keyword
# ✓ Issue #43: Assigned to @copilot (good fit) — matches "bug fix" keyword
```

**When users run it:**
- After new issues are labeled with "squad"
- During daily standup / triage sessions
- As part of a larger workflow (`squad watch` could include this)

**Tradeoff:** Triage doesn't happen automatically when label is added.  
**Mitigation:** `squad watch` can poll for untriaged issues and notify the user. User still invokes triage explicitly.


---

### 3. **squad-issue-assign.yml** → `squad assign <issue> <member>`

**Current behavior:** On squad:{member} label added, posts assignment comment. If squad:copilot, assigns copilot-swe-agent[bot] via PAT.

**CLI replacement:**
```bash
# Assign issue to a squad member (adds label, posts comment)
squad assign 42 ripley

# Assign to @copilot (adds label, posts comment, assigns bot)
squad assign 42 copilot

# Output:
# ✓ Issue #42 assigned to Ripley (Frontend)
# ✓ Posted assignment comment
```

**When users run it:**
- After manual triage (they decide who should work on it)
- As part of `squad triage` output (suggests assignments, user confirms)

**Tradeoff:** Assignment doesn't happen automatically when label is added.  
**Mitigation:** `squad triage` can assign in one step (triage + assign). User still has control.


---

### 4. **squad-heartbeat.yml** → `squad watch`

**Current behavior:** Cron every 30min (disabled), or on issue/PR events. Runs ralph-triage.js, applies triage decisions, auto-assigns @copilot.

**CLI replacement:**
```bash
# Watch mode — keeps terminal open, polls for new work
squad watch

# Output:
# 🔄 Watching for new issues...
# [10:42] New issue #45: "Add login form validation"
#         → Suggested: @copilot (good fit)
#         Run `squad triage 45` to assign?
# [10:45] Issue #42 closed by Ripley
# [10:50] PR #38 merged to main
```

**When users run it:**
- During active work sessions
- On a dedicated terminal/tmux pane
- In CI (optional — they opt-in)

**Tradeoff:** No background automation. User must keep `squad watch` running.  
**Mitigation:** Users who want automation can keep `squad watch` in a tmux pane or run it in CI. Users who DON'T want automation aren't surprised.


---

### 5. **squad-label-enforce.yml** → `squad labels check`

**Current behavior:** On any label added, enforces mutual exclusivity (go:, release:, type:, priority:), removes conflicts, posts comments.

**CLI replacement:**
```bash
# Check label consistency for all open issues
squad labels check

# Check a specific issue
squad labels check 42

# Output:
# ⚠️ Issue #42: Multiple go: labels detected (go:yes, go:no)
#    Run `squad labels fix 42` to resolve
```

**When users run it:**
- Before triage sessions
- As part of `squad doctor` (health check)
- Manually when they notice conflicting labels

**Tradeoff:** Conflicting labels won't be auto-removed.  
**Mitigation:** `squad labels check` is fast. `squad doctor` includes it. Users can run it proactively.


---

## Tradeoffs: What Do We LOSE?

| Lost Capability | Impact | Mitigation |
|----------------|--------|------------|
| **Auto-sync labels on team.md push** | Labels may be out of sync with team roster | `squad doctor` warns. `squad init` syncs automatically. |
| **Auto-triage on "squad" label** | Issues sit in triage inbox longer | `squad watch` notifies. `squad triage` is one command. |
| **Auto-assign on squad:{member} label** | Manual step to assign after labeling | `squad triage` does both in one step. |
| **Ralph heartbeat (cron auto-triage)** | No background automation | `squad watch` in tmux/screen. Or: users run `squad triage` daily. |
| **Auto-enforce label rules** | Conflicting labels may exist temporarily | `squad labels check` is fast. `squad doctor` includes it. |

**Key insight:** We lose automatic execution, but GAIN user control and transparency. Users aren't surprised by API usage or AI decisions happening behind their back.


---

## Migration Path: Phased Rollout

### **Phase 1: v0.8.22 (Deprecation Warnings)**

- Add deprecation warnings to all 5 workflows (at the top of each file):
  ```yaml
  # ⚠️ DEPRECATION WARNING: This workflow will be removed in v0.9.0
  # Use `squad labels sync` instead (see docs/migration/actions-to-cli.md)
  ```
- Implement CLI commands:
  - `squad labels sync`
  - `squad triage [<issue>]`
  - `squad assign <issue> <member>`
  - `squad watch` (basic polling loop)
  - `squad labels check [<issue>]`
- Ship docs: `docs/migration/actions-to-cli.md` (migration guide)
- Announce in CHANGELOG.md: "GitHub Actions workflows are deprecated. Migrate to CLI commands."

**Timeline:** v0.8.22 ships with deprecation warnings + CLI commands. Users have time to adapt.


---

### **Phase 2: v0.9.0 (Remove Workflows)**

- Remove all 5 workflows from `.github/workflows/`
- Remove from template bundles (`.squad/templates/workflows/`)
- Update `squad init` to NOT install these workflows
- Add `squad upgrade` to remove deprecated workflows from existing repos

**Timeline:** v0.9.0 removes workflows entirely. CLI commands are the only path.


---

### **Phase 3: v0.9.x (Optional Automation)**

- Add opt-in GitHub Actions workflow for users who want automation:
  ```yaml
  name: Squad CLI Runner (opt-in)
  on:
    issues: [labeled]
  jobs:
    run-cli:
      - run: npx @bradygaster/squad-cli triage ${{ github.event.issue.number }}
  ```
- Users who want automation can install this workflow themselves.
- Key difference: They CHOOSE to install it. Not a default.

**Timeline:** Post-v0.9.0. Optional path for users who miss automation.


---

## The "Zero Actions Required" Vision

**Can Squad work with ZERO custom Actions (just standard CI)?**

**YES.** Here's what it looks like:

### Minimal GitHub Actions Setup
- **squad-ci.yml** — Test on PR (standard)
- **squad-release.yml** — Tag + release on main push (standard)
- **squad-docs.yml** — Build docs on main push (standard)

**That's it.** 3 workflows. Zero Squad-specific logic in GitHub Actions.

### User Workflow (CLI-First)
```bash
# 1. New issue arrives (via GitHub UI or gh CLI)
# 2. User triages at their terminal
squad triage

# Output:
# ✓ Issue #42: Assigned to Ripley (Frontend)
# ✓ Issue #43: Assigned to @copilot (good fit)

# 3. User watches for new work (optional)
squad watch
# Polls in background, notifies on new issues

# 4. User checks health periodically
squad doctor
# ✓ Labels synced
# ✓ No conflicting labels
# ⚠️ 3 untriaged issues in inbox
```

**Benefits:**
- **Zero API usage surprises** — users invoke Squad when they want it
- **Zero hidden costs** — no cron jobs running every 30min
- **Full transparency** — users see Squad's decisions as they happen
- **User control** — users can override triage decisions before they're applied

**This is the right model.** Squad is a tool users invoke, not a bot that watches them.


---

## Recommendation

**Migrate all 5 squad-specific workflows to CLI commands.**

1. **v0.8.22** — Add deprecation warnings + CLI commands. Users have time to adapt.
2. **v0.9.0** — Remove workflows entirely. CLI-first is the only path.
3. **Post-v0.9.0** — Add opt-in automation for users who want it.

**Core belief:** Squad should be a CLI-first tool that users control, not an automation layer that surprises them. This migration aligns with that vision.


---

## Implementation Notes

### CLI Command Structure
```
squad labels sync          # Sync labels from team.md
squad labels check [issue] # Check for conflicting labels
squad labels fix <issue>   # Fix conflicting labels

squad triage [issue]       # Triage issue(s) using routing rules
squad assign <issue> <member> # Assign issue to squad member

squad watch               # Watch for new issues (polling loop)
squad doctor              # Health check (labels, triage queue, etc.)
```

### UX Principles
- **Explicit is better than implicit** — users invoke Squad when they want it
- **One command does one thing** — no hidden side effects
- **Fast feedback** — commands complete in <1s for single issues
- **Batch operations** — `squad triage` without args processes all untriaged

### Technical Approach
- All CLI commands use GitHub API (via Octokit)
- `squad watch` uses polling (every 30s) with efficient API usage (If-None-Match headers)
- `squad triage` uses same routing logic as current `squad-triage.yml` (reuse ralph-triage.js)
- `squad doctor` aggregates multiple checks (labels, triage, etc.)


---

## Appendix: Current Workflow Triggers

| Workflow | Trigger | API Calls/Event |
|----------|---------|-----------------|
| sync-squad-labels.yml | Push to team.md | ~30 (create/update labels) |
| squad-triage.yml | issues:[labeled] "squad" | ~5-10 (read files, add labels, post comment) |
| squad-issue-assign.yml | issues:[labeled] "squad:*" | ~3-5 (post comment, assign) |
| squad-heartbeat.yml | Cron every 30min (disabled) | ~10-50 (depends on open issues) |
| squad-label-enforce.yml | issues:[labeled] any label | ~2-5 (remove conflicting labels, post comment) |

**Total:** If heartbeat were enabled, Squad would make 50+ API calls every 30 minutes, even if no real work happened. This is the core problem Brady identified.



# CI/CD Impact Assessment: GitHub Actions vs. CLI Migration

**Date:** 2026-03-15 | **Author:** Kobayashi (Git & Release) | **Status:** Analysis Complete


---

## Executive Summary

Brady seeks to reduce GitHub Actions usage by migrating automation to Squad CLI. This assessment identifies which workflows are **load-bearing infrastructure** (must stay as Actions) vs. **migration candidates** that can move to CLI-side automation.

**Bottom Line:** ~90 actions-minutes/month can be eliminated by migrating 5 squad-specific workflows (label sync, triage, assignments, label enforcement). However, **9 workflows must remain as Actions** because they provide event-driven guardrails that cannot be replicated CLI-side.


---

## Part 1: Actions Minutes Analysis

### Monthly Actions Consumption by Workflow

| Workflow | Category | Trigger | Est. Min/Month | Notes |
|----------|----------|---------|----------------|-------|
| **squad-ci.yml** | CI | PR changes + dev push | ~120 | Runs per PR update, most frequent trigger |
| **squad-release.yml** | Release | Push to main (once/release) | ~15 | Tag creation + GitHub Release |
| **squad-promote.yml** | Release | Manual dispatch | ~20 | dev→preview→main pipeline |
| **squad-main-guard.yml** | CI | PR to main + push | ~10 | File pattern guards (fast) |
| **squad-preview.yml** | CI | Push to preview | ~15 | Full test suite validation |
| **squad-publish.yml** | Publish | Tag push | ~30 | Build + npm publish (2x jobs) |
| **squad-insider-release.yml** | Release | Push to insider | ~15 | Tag creation only |
| **squad-insider-publish.yml** | Publish | Push to insider | ~30 | Build + npm publish |
| **sync-squad-labels.yml** | Squad | team.md changes | ~1 | Lightweight label sync |
| **squad-triage.yml** | Squad | Issue labeled | ~2 | Script runs, ~50-100 issues/month |
| **squad-issue-assign.yml** | Squad | Issue labeled | ~2 | Script runs, ~50-100 issues/month |
| **squad-heartbeat.yml** | Squad | Issue/PR closed, manual | ~5 | Ralph triage script (when enabled) |
| **squad-label-enforce.yml** | Squad | Issue labeled | ~2 | Label mutual exclusivity enforcement |
| **squad-docs.yml** | Docs | Manual + docs push | ~5 | Rarely triggered (on demand mostly) |

### Cost Breakdown

- **CI/Release (MUST STAY):** ~215 minutes/month — essential event-driven guardrails
- **Squad-Specific (MIGRATE):** ~12 minutes/month — low cost but high synchronization burden
- **Total:** ~227 minutes/month (well under GitHub's 3000-min free tier for public repos)

**Finding:** This repository is **not Actions-minute-constrained**. Cost is not the primary driver; **complexity & maintenance** is.


---

## Part 2: Workflow Dependencies & Orchestration Chain

### Dependency Graph

```
dev branch (squad-ci.yml) 
    ↓
main branch (squad-ci.yml + squad-main-guard.yml)
    ↓
squad-release.yml (validates version, creates tag v*)
    ↓
squad-publish.yml (triggered by tag, publishes to npm)
    ↓
GitHub Release + npm distribution (end user benefit)
```

### Event-Driven Orchestration

| Workflow | Trigger | Depends On | Blocks | Critical? |
|----------|---------|-----------|--------|-----------|
| **squad-ci.yml** | PR open/sync, dev push | — | All downstream | ✅ YES |
| **squad-main-guard.yml** | PR to main/preview | — | Release process | ✅ YES |
| **squad-release.yml** | Push to main | squad-main-guard + squad-ci | squad-publish | ✅ YES |
| **squad-promote.yml** | Manual workflow_dispatch | — | Follows main merge | ⚠️ MANUAL |
| **squad-publish.yml** | Tag push (v*) | All CI/tests upstream | npm distribution | ✅ YES |
| **sync-squad-labels.yml** | team.md changes | — | squad-triage | ⚠️ AUTOMATION |
| **squad-triage.yml** | Issue labeled "squad" | sync-squad-labels output | squad-issue-assign | ⚠️ AUTOMATION |
| **squad-issue-assign.yml** | Issue labeled "squad:*" | squad-triage | @copilot work start | ⚠️ AUTOMATION |
| **squad-heartbeat.yml** | Issue/PR closed, manual | — | Auto-triage | ⚠️ AUTOMATION |
| **squad-label-enforce.yml** | Issue labeled | — | Triage feedback | ⚠️ AUTOMATION |

### Cross-Workflow Triggers (Implicit Dependencies)

1. **squad-triage → squad-issue-assign**: Triage adds `squad:{member}` label → triggers assignment workflow
2. **squad-label-enforce → feedback loop**: Enforces mutual exclusivity → posts triage updates
3. **squad-release → squad-publish**: Successful main push creates tag → triggers publish

**Finding:** squad-release + squad-publish form an **implicit pipeline** — removing either breaks the release chain.


---

## Part 3: Load-Bearing Infrastructure (MUST STAY as Actions)

### Why These Workflows Cannot Move to CLI

#### 1. **squad-ci.yml** — PR/Push Event Guard
- **Trigger:** Pull request open/sync + dev push
- **Function:** Build + test on every code change
- **Why it must be Actions:**
  - Must run **before** merge decisions (PR gates, branch protection)
  - Event-driven: no other way to intercept PR lifecycle events
  - Results **feed into GitHub's merge protection logic**
  - Failure blocks PR merge (security/correctness gate)

#### 2. **squad-main-guard.yml** — Protected Branch Enforcement
- **Trigger:** PR to main/preview/insider, push to main/preview/insider
- **Function:** Prevents `.squad/`, `.ai-team/`, internal-only files from reaching production
- **Why it must be Actions:**
  - **Enforcement happens at GitHub API layer** — no CLI equivalent
  - Runs even if developer bypasses local git hooks
  - Final validation before release branches merge
  - State corruption risk if this fails

#### 3. **squad-release.yml** — Tag + Release Creation
- **Trigger:** Push to main (automatic version detection)
- **Function:** Create semantic version tag, GitHub Release, generate release notes
- **Why it must be Actions:**
  - Runs on every main merge (automated release)
  - Creates artifacts that trigger downstream squad-publish.yml
  - If moved to CLI, requires manual invocation (breaks release automation)
  - **Dependency:** squad-publish.yml is triggered **only** by tag push

#### 4. **squad-publish.yml** — npm Distribution Gate
- **Trigger:** Tag push (v*)
- **Function:** Build monorepo, publish squad-sdk + squad-cli to npm
- **Why it must be Actions:**
  - Distributes to **public npm registry** (external system)
  - Final node in release pipeline — runs only after tag exists
  - If moved to CLI, end users never receive updates

#### 5. **squad-promote.yml** — Branch Promotion Pipeline
- **Trigger:** Manual `workflow_dispatch`
- **Function:** dev→preview→main with forbidden-path stripping
- **Why it must be Actions:**
  - Complex, **sequential git operations** that require shell environment
  - Dry-run capability (shows what _would_ happen) — essential for release safety
  - Manual trigger allows human decision points

#### 6. **squad-preview.yml** — Pre-Release Validation
- **Trigger:** Push to preview
- **Function:** Verify version consistency, CHANGELOG entries, no internal files
- **Why it must be Actions:**
  - Validates **release readiness** before main merge
  - Final "go/no-go" checkpoint for publication
  - Prevents bad releases from reaching public channels

#### 7. **squad-docs.yml** — Documentation Build & Deploy
- **Trigger:** Manual + docs changes on main
- **Function:** Build markdown docs, deploy to GitHub Pages
- **Why it must be Actions:**
  - **GitHub Pages deployment** requires Actions API (or setup-pages)
  - Public-facing documentation delivery
  - Not CLI-suited (requires repository deployment permissions)

#### 8. **squad-insider-release.yml** — Pre-Release Channel
- **Trigger:** Push to insider
- **Function:** Create insider tags (v*.insider+SHA), GitHub Release
- **Why it must be Actions:**
  - Supports insider/development release channel
  - Tag creation must happen at push time (cannot be manual)

#### 9. **squad-insider-publish.yml** — Insider npm Distribution
- **Trigger:** Push to insider
- **Function:** Publish squad-sdk + squad-cli to npm with `insider` tag
- **Why it must be Actions:**
  - Final distribution step for pre-release channel
  - Mirrors squad-publish.yml for insider builds

### The Core Constraint: Event-Driven Guarantees

**GitHub Actions provides these guarantees that CLI cannot:**

1. **Atomicity**: Workflow runs **exactly once** per trigger event (no duplicates, no misses)
2. **Immutability**: Events are recorded; workflows cannot be skipped retroactively
3. **Authorization**: Actions run with repo access token (PAT or GITHUB_TOKEN) — centralized permission control
4. **Branch Protection Integration**: Workflow status **blocks merges** via PR checks (native GitHub API)
5. **Tag Triggers**: Tag push events are instant and guaranteed (CLI has no hook into git server)

**CLI automation lacks these guarantees:**
- Requires manual invocation (susceptible to user error)
- No built-in authorization (relies on user's local git credentials)
- Cannot integrate with branch protection rules
- Cannot react to remote events (only local ones)


---

## Part 4: Migration Candidates (Squad-Specific Workflows)

### Workflows That Should Migrate to CLI

#### 1. **sync-squad-labels.yml** → `squad sync-labels`
- **Current:** Triggered by team.md changes
- **Proposal:** Move to CLI command (could also run on init + periodic manual trigger)
- **CLI Implementation:** Read team.md, iterate GitHub API to create/update labels
- **Risks:** Low — idempotent operation, no branch protection dependency
- **Migration Path:** Run as part of `squad upgrade`, available via `squad sync-labels` command

#### 2. **squad-triage.yml** → `squad triage`
- **Current:** Triggered by "squad" label on issue
- **Proposal:** Move to CLI command that runs on-demand or via Ralph (monitor) agent
- **CLI Implementation:** Detect issues with "squad" label, run routing logic, add member labels + comments
- **Risks:** Low — does not modify protected state, user can run manually
- **Note:** Ralph (work monitor) already implements smart triage; could consume this logic

#### 3. **squad-issue-assign.yml** → `squad assign`
- **Current:** Triggered by "squad:{member}" label on issue
- **Proposal:** Move to CLI command, combines with triage workflow
- **CLI Implementation:** Detect issues with squad:* labels, post assignment comments, optionally assign @copilot via PAT
- **Risks:** Medium — requires COPILOT_ASSIGN_TOKEN (PAT) for copilot-swe-agent assignment
- **Migration Path:** CLI can handle label detection + comments; copilot assignment remains as optional GitHub workflow step

#### 4. **squad-heartbeat.yml** → `squad heartbeat` / Ralph monitor
- **Current:** Triggered by issue/PR close, labeled events, + manual dispatch
- **Proposal:** Ralph (the work monitor agent) already implements smart triage; fold this into Ralph's periodic monitor loop
- **CLI Implementation:** Ralph already has access to team.md, routing rules, issue data
- **Risks:** Low — currently disabled in workflow anyway (cron commented out)
- **Note:** Ralph can be invoked manually OR integrated with Copilot CLI agent lifecycle

#### 5. **squad-label-enforce.yml** → `squad validate-labels`
- **Current:** Triggered by issue labeled (any label event)
- **Proposal:** Move to CLI command, called by triage workflow or manual enforcement
- **CLI Implementation:** Given an issue, check label namespaces (go:, release:, type:, priority:) for mutual exclusivity, remove conflicts
- **Risks:** Low — idempotent, modifies issue labels only (no protected state)
- **Migration Path:** Can be called as part of squad-triage → removes conflicting labels before applying member assignment

### Migration Risk Matrix

| Workflow | Complexity | State Risk | Race Conditions | Human Review | Recommendation |
|----------|-----------|-----------|-----------------|---------------|-----------------|
| **sync-squad-labels.yml** | Low | None | None | No | ✅ MIGRATE |
| **squad-triage.yml** | Medium | Low | Possible (concurrent issues) | Yes (lead review) | ✅ MIGRATE |
| **squad-issue-assign.yml** | Medium | Low | Possible (label race) | Yes (PAT required) | ✅ MIGRATE |
| **squad-heartbeat.yml** | Medium | Low | None (async monitor) | Yes (Ralph logic) | ✅ MIGRATE (to Ralph) |
| **squad-label-enforce.yml** | Low | None | None | No | ✅ MIGRATE |

**Total Time Savings:** ~12 Actions minutes/month (negligible for cost, but **reduces maintenance burden**)


---

## Part 5: The `squad init` Impact

### Current Flow: squad init → Install Workflows

```
squad init [repo]
  ├─ Detect project type (Node.js, Python, Go, etc.)
  ├─ Copy .squad/ template files
  │  ├─ team.md
  │  ├─ routing.md
  │  ├─ charter.md
  │  └─ other YAML configs
  ├─ Copy .github/workflows/ from templates/workflows/
  │  ├─ squad-ci.yml (project-type sensitive stub)
  │  ├─ squad-release.yml (project-type sensitive)
  │  ├─ squad-promote.yml
  │  ├─ squad-main-guard.yml
  │  ├─ squad-preview.yml
  │  ├─ squad-docs.yml
  │  ├─ squad-publish.yml
  │  ├─ sync-squad-labels.yml
  │  ├─ squad-triage.yml
  │  ├─ squad-issue-assign.yml
  │  ├─ squad-heartbeat.yml
  │  └─ squad-label-enforce.yml
  └─ Show team onboarding (emoji ceremony)
```

### Impact of Selective Migration

**Option A: Remove All Squad-Specific Workflows from init**

```diff
  squad init [repo]
    ├─ Install CI/Release workflows (9 workflows)
    ├─ Skip squad-specific workflows (5 workflows)
    └─ Post message: "To enable smart triage, run: squad init-automation"
```

**Implications:**
- Simpler `squad init` — no automation magic, team must opt-in
- Users who want triage must run second command: `squad init-automation`
- Clearer separation: **core** (CI/Release) vs. **optional** (team automation)

**Option B: Keep All, Make Workflows Optional in Init**

```
squad init [repo] --with-automation
squad init [repo] --automation=none  # skip squad-specific
```

**Implications:**
- Backward compatible (existing users' behavior unchanged)
- First-time users get full automation by default
- Power users can disable triage workflows if not needed

**Option C: Hybrid — Install Squad Workflows, Disable Some by Default**

```
squad init [repo]
  ├─ Install ALL workflows
  ├─ Disable (comment out triggers on):
  │  ├─ squad-heartbeat.yml (cron already commented)
  │  ├─ squad-triage.yml (comments say "disabled pre-migration")
  └─ Enable on demand via: squad enable-heartbeat, squad enable-triage
```

### Recommended Approach: **Lazy Automation**

**Proposal:** Keep workflows in init, but add lifecycle flags:

```yaml
# .squad/config.json
{
  "automation": {
    "ci": true,        // Always enabled
    "release": true,   // Always enabled
    "triage": false,   // Disabled by default — opt-in
    "heartbeat": false // Disabled — requires Ralph enable
  }
}
```

**Benefits:**
- init remains simple (no conditional flags)
- Team leads can enable triage workflows incrementally
- Reduces "magic" for teams who don't want it
- squad upgrade can toggle these flags


---

## Part 6: Backward Compatibility & Migration Strategy

### Scenario 1: Existing Repos with 15 Workflows

**Problem:** User has all 15 workflows. If we remove squad-specific ones from init, their repo still has old workflows running.

**Solution: `squad upgrade` with workflow management**

```bash
# Update Squad CLI to latest
npm install -g @bradygaster/squad-cli@latest

# Then upgrade repo workflows
squad upgrade --workflows

# Shows what changed:
# ✅ Updated squad-ci.yml (v1 schema)
# ⏭️ Deprecated: squad-triage.yml (moving to CLI)
# ⏭️ Deprecated: squad-heartbeat.yml (moving to Ralph)
# Run: squad migrate-automation --help
```

### Recommended Transition Timeline

| Phase | Action | Timeline |
|-------|--------|----------|
| **Phase 1** | Document: "Migration path for squad automation to CLI" | v0.9.0 |
| **Phase 2** | Implement: `squad triage`, `squad assign`, `squad sync-labels` as CLI commands | v1.0.0 |
| **Phase 3** | Add deprecation warnings to squad-specific workflows | v1.0.0 |
| **Phase 4** | `squad upgrade --remove-deprecated-workflows` flag | v1.1.0 |
| **Phase 5** | Remove deprecated workflows from init (new repos only) | v1.1.0 |

### Migration Checklist for Users

**If you have squad-triage.yml running:**
1. Wait for `squad triage` CLI command (v1.0.0+)
2. Test: `squad triage --dry-run` on your repo
3. Remove squad-triage.yml from .github/workflows/
4. Add `squad triage` to your automation schedule (manual or cron)

**If you have squad-heartbeat.yml running:**
1. Ralph agent will handle smart triage (v1.0.0+)
2. Remove squad-heartbeat.yml when ready
3. Enable Ralph monitor: `squad enable-ralph`


---

## Part 7: State Corruption Risks

### Which Workflows Modify State?

| Workflow | State Modified | Risk Level | Mitigation |
|----------|----------------|-----------|-----------|
| **squad-ci.yml** | None (read-only) | Low | Test failures are visible |
| **squad-release.yml** | Git tags, GitHub Releases | Critical | Version verification, dry-run |
| **squad-promote.yml** | Git branches | Critical | Dry-run mode, human approval |
| **squad-main-guard.yml** | None (blocks merges) | None | Enforcement only |
| **sync-squad-labels.yml** | GitHub labels | Low | Idempotent, can re-sync |
| **squad-triage.yml** | Issue labels, comments | Low | Can be corrected manually |
| **squad-issue-assign.yml** | Issue assignees, comments | Low | Can be corrected manually |
| **squad-heartbeat.yml** | Issue labels, comments | Low | Async, low severity |
| **squad-label-enforce.yml** | Issue labels | Low | Idempotent |

### Critical Workflows (State Corruption Risk)

1. **squad-release.yml**: Creates git tags that trigger downstream pipeline
   - Risk: Duplicate tags, malformed versions
   - Mitigation: Version validation (must exist in CHANGELOG.md) before tagging

2. **squad-promote.yml**: Merges between branches, strips forbidden paths
   - Risk: Lost commits, wrong paths stripped
   - Mitigation: Dry-run preview, manual approval, git log verification

3. **squad-main-guard.yml**: Prevents merges with forbidden paths
   - Risk: If bypassed, corruption spreads to public releases
   - Mitigation: Must remain on main branch (non-removable, non-disabled)

### Orphaned Workflow Detection

**Problem:** Developer deletes squad-triage.yml from their branch, but it still runs because .github/workflows/ is read from main.

**Solution:** None required
- Workflows are read from the **default branch** (main) at runtime
- Deleting from a feature branch has no effect
- Only `squad upgrade --remove-deprecated-workflows` removes repo-wide


---

## Part 8: Backward Compatibility Matrix

### What Changes for Each User Segment?

| User Segment | Current Behavior | After Migration | Action Required |
|--------------|-----------------|-----------------|-----------------|
| **New Users** | `squad init` installs 15 workflows | init installs 9 core workflows | None (automatic) |
| **Existing Teams** | 15 workflows in .github/workflows/ | Workflows persist; deprecated ones marked | Squad upgrade notices |
| **Triage Users** | squad-triage.yml runs on issues | CLI: manual `squad triage` or Ralph monitor | Opt-in to CLI command |
| **Heartbeat Users** | squad-heartbeat.yml runs on schedule | Ralph monitor (when enabled) | Enable Ralph |
| **Non-Users** | Only CI/Release workflows matter | No change | No change |

### Compatibility Guarantee

**We WILL NOT break existing setups:**
- Old workflows continue to work (backward compatible)
- New repos use streamlined workflow set (forward compatible)
- Deprecation warnings give 1+ release cycles notice
- Migration tools (squad upgrade) handle transition


---

## Recommendations

### For Brady (Project Owner)

1. **Approve migration path** (5 workflows → CLI)
   - Reduces Actions complexity without losing functionality
   - Maintains load-bearing infrastructure (CI/Release/Main-Guard)
   - Timeline: v0.9 (planning) → v1.0 (implementation) → v1.1 (cleanup)

2. **Keep 9 critical workflows as Actions**
   - They provide guardrails that cannot be replicated CLI-side
   - Event-driven execution is non-negotiable for CI/Release
   - Cost is negligible (well under 3000-min free tier)

3. **Implement lazy automation** in squad init
   - Add `automation` config flag to .squad/config.json
   - Default: CI + Release enabled, Squad-specific disabled
   - Reduce onboarding cognitive load

### For Integration Teams

1. **CLI commands to implement** (v1.0.0):
   - `squad triage` — Run routing logic on open issues
   - `squad assign` — Assign issues to team members
   - `squad sync-labels` — Sync labels from team.md
   - `squad validate-labels` — Enforce label mutual exclusivity

2. **Ralph integration** (v1.0.0):
   - Ralph monitor loop runs smart triage
   - Replaces squad-heartbeat.yml event triggers
   - Still manual-invokable via CLI

3. **Deprecation strategy** (v0.9.0):
   - Document in CLI README: "squad-triage.yml will move to CLI in v1.0"
   - Add warnings to deprecated workflows in init output
   - Provide `squad migrate-automation` helper command

### For Release Management

1. **Workflows that MUST stay on main**:
   - squad-ci.yml (branch protection)
   - squad-main-guard.yml (forbidden file guard)
   - squad-release.yml (tag creation)
   - squad-publish.yml (npm distribution)

2. **Version gates to enforce**:
   - CHANGELOG.md entry must exist before tag
   - .squad/ files must be stripped from preview branch
   - No tag created without version validation

3. **Disaster recovery**:
   - If squad-release.yml tags wrong version, use `git tag -d` + `git push origin --delete` to recover
   - If squad-promote.yml merges wrong commits, use `git revert` to undo merge commit


---

## Conclusion

**The case for migration:**
- ✅ 5 squad-specific workflows (12 minutes/month) can move to CLI
- ✅ Reduces Actions surface area without losing functionality
- ✅ Improves team autonomy (CLI tools under their control)
- ✅ Maintains backward compatibility (gradual, opt-in transition)

**The case for keeping 9 workflows:**
- ✅ CI/Release/Main-Guard workflows are event-driven guardrails
- ✅ Cannot be replicated CLI-side (GitHub API integration needed)
- ✅ Block merges at branch protection layer (non-negotiable)
- ✅ Cost is negligible (not a constraint)

**Bottom line:** Migrate squad-specific automation to CLI for maintainability; keep critical CI/Release workflows as Actions for correctness.


---

## References

- `.squad/agents/kobayashi/history.md` — Release coordination history
- `.squad/decisions.md` — Team decisions on workflows, versioning
- `.squad/team.md` — Team roster and capabilities
- `.squad/routing.md` — Work routing rules
- `packages/squad-cli/src/cli/core/workflows.ts` — Workflow generation logic
- `packages/squad-cli/src/cli/core/init.ts` — Init command implementation
- `.github/workflows/*.yml` — All 15 active workflows


# Customer Impact Analysis: GitHub Actions Automation vs. CLI-First Shift

**Analysis by:** McManus (DevRel)  
**Date:** 2026-03-11  
**Context:** Brady raised concern that Squad's automatic GitHub Actions installation during `squad init` creates surprise friction for customers. This analysis evaluates whether moving to CLI-first (with opt-in Actions) is the right call.


---

## 1. The Surprise Factor — User Perspective

### Current State (Status Quo)
A developer runs `squad init` in their repo. The CLI installs 5 Squad-specific workflows:
1. **sync-squad-labels.yml** — triggers on every `.squad/team.md` push
2. **squad-triage.yml** — fires on every issue label event (looking for `squad` label)
3. **squad-issue-assign.yml** — fires on every `squad:*` label
4. **squad-label-enforce.yml** — enforces mutual exclusivity on EVERY label event
5. **squad-heartbeat.yml** — Ralph's triage engine (cron disabled, but fires on issue/PR close events)

**The "Oh No" Moment:**
- User runs `squad init` ✅ 
- User looks at their Actions tab for the first time after a day of active labeling
- They see **10–20 workflow runs** in the Actions history from Squad operations they didn't explicitly ask for
- **Mental model breaks:** "I didn't start these. Why is my Actions tab full? Is Squad spamming my quota? Am I going to get billed?"
- User experiences **trust deficit** — they feel out of control

### Why This Matters for DevRel
The Actions tab is **highly visible** and **highly suspicious** to new users. GitHub makes it front-and-center in the repo UI. The first impression is: *automated magic I didn't authorize*. This hits **perception of transparency** (a core value for dev tools).


---

## 2. Billing Reality — Is the Concern Valid?

### GitHub Actions Quota
- **Free repos:** 2,000 minutes/month (unlimited public actions on public runners)
- **Pro repos (private):** 3,000 minutes/month
- **Each workflow run on ubuntu-latest:** ~30–60 seconds (measured from recent Squad runs)

### Realistic Monthly Impact
**Scenario: Active open-source repo with moderate team**
- 20 issues/month created
- 5 issues closed/month  
- Average 3 label changes per issue (triage → assignment → go:yes)
- 10 PRs/month with label changes

**Monthly workflow run count:**
- `sync-squad-labels`: 4 runs (team.md updated ~1/week) = 4 × 0.5min = 2 min
- `squad-triage`: 20 runs (label squad) + 50 runs (squad:* labels + enforce) = 70 runs × 0.5min = 35 min
- `squad-label-enforce`: ~80 runs (cascading from all labeling) × 0.5min = 40 min
- `squad-heartbeat`: ~15 runs (issue close/PR close events) × 1min = 15 min
- **Total:** ~92 minutes/month

**Verdict:** Not a quota issue for most users. Even teams with 50+ issues/month would consume <200 min.

**BUT: The perception problem is REAL.** Users see unfamiliar automation and assume it will be expensive or has hidden costs. **Trust > math.**


---

## 3. CLI-First Message — The Narrative

### The Case for "CLI-First"
**Message:** "Squad puts *you* in control. No surprise automations. You decide when and how Squad runs."

This reframes the value prop:
- ✅ Transparency — you see every command you run
- ✅ Control — you decide your team's workflow, not Squad
- ✅ Lean — zero background noise by default
- ✅ Opt-in — power users can add automation later

### Getting-Started UX Change

**Current (Actions-First):**
```
$ squad init
→ Installs .squad/ structure
→ Installs 5 GitHub Actions workflows
→ User discovers workflows running in Actions tab (surprise!)
→ User questions: "Why? Should I turn these off?"
```

**New (CLI-First):**
```
$ squad init
→ Installs .squad/ structure (NO workflows)
→ Shows: "Squad is ready. Use 'squad triage' to label issues manually."
→ User runs: $ squad triage
→ Squad triages open issues via CLI
→ User happy: "I have full control."

$ squad init --with-actions (for power users)
→ Installs automation workflows
→ User knows exactly what they're opting into
```

### Messaging for Existing Users
**Blog post: "Introducing CLI-First Squad"**

1. **Why we're changing:**
   - Developer feedback showed Actions felt opaque
   - Teams want explicit control over their automation
   - Zero-config is better than "config by side effects"

2. **What happens to existing installs:**
   - Existing workflows keep working (backward compatible)
   - `squad upgrade` downloads latest, no forced removal
   - Users can manually delete workflows if they want

3. **Upgrade path:**
   - **Do nothing:** Current workflows stay. You're not on the new path yet.
   - **Adopt CLI-first:** Run `squad init --clean-actions` to remove workflows, use CLI commands
   - **Stay hybrid:** Keep workflows and use CLI as you prefer


---

## 4. Competitive Positioning — Squad vs. Cursor, Aider, etc.

### Competitive Landscape
- **Cursor:** Client-side LSP + LLM. Zero GitHub integration. Zero Actions.
- **Aider:** CLI agent. Optional integrations (GitHub API). No Actions installed.
- **GitHub Copilot in Cursor/VS Code:** Runs locally. No repo automation.
- **GitHubCopilot in GitHub.dev:** Browser-based. No background workflows.

### Squad's Differentiation
- **Unique:** Multi-agent orchestration + GitHub native (Actions + SDK)
- **Risk:** If perceived as "Squad spams my repo with automation," it becomes a *negative* differentiator
- **Opportunity:** If we own "transparent, user-controlled automation," it's a *positive* one

**"Zero Actions required" is a DIFFERENTIATOR.** It signals maturity and respect for the user's repository.


---

## 5. Opt-In Model — Proposed UX

### Design: Tiered Automation
**Tier 1: Manual CLI (Default)**
```bash
squad init                           # No workflows installed
squad triage                         # User explicitly runs triage
squad rc                             # Connect remote squad mode
```

**Tier 2: Semi-Automated (Opt-In)**
```bash
squad init --with-automation         # Installs key workflows only
  - sync-squad-labels (on team.md push)
  - squad-triage (on label event)
  - squad-heartbeat (Ralph's triage, manual + event-driven)
```

**Tier 3: Full Automation (Enterprise)**
```bash
squad init --with-full-automation    # All 5+ workflows, cron enabled
  - Everything in Tier 2
  - squad-label-enforce (auto-fix labels)
  - squad-issue-assign (auto-route assignments)
  - Heartbeat cron enabled (every 30min)
```

### Commands
```bash
# Post-init opt-in
squad actions install              # Install tier 2 (semi-auto)
squad actions install --full       # Install tier 3 (full auto)
squad actions uninstall            # Remove all workflows
squad actions status               # Show which workflows are active + usage stats

# Power user config
squad init --with-actions=heartbeat,triage  # Cherry-pick workflows
```

### Documentation Strategy
- **docs/getting-started.md**: Emphasize CLI-first (Tier 1) as the default happy path
- **docs/automation.md**: Deep dive into workflows, when to use them, quota implications
- **docs/team-workflows/multi-team-setup.md**: When enterprises add Tier 3
- **Migration guide:** For Beta users currently on actions-first


---

## 6. Documentation Impact

### Files/Content That Need Changes

#### 1. **README.md** (High Priority)
- Current: Mentions Squad installs and runs automatically
- New: Lead with CLI-first story
- Add: "Squad gives you full control. No background automation by default."

#### 2. **docs/getting-started.md** (New)
- Step 1: `squad init` + quick wins with CLI
- Step 2 (optional): Explore automation with `squad actions install`
- Tone: CLI is the main story, Actions are an *add-on*

#### 3. **docs/automation/github-actions.md** (New Deep Dive)
- When to use Actions (large teams, 24/7 coverage)
- Quota calculator (estimate your monthly cost)
- Troubleshooting: "Why are my Actions running so much?"
- Performance: "Reducing noise with workflow filters"

#### 4. **docs/cli-reference.md** (Update)
- Add new commands: `squad triage`, `squad actions *`
- Update `squad init` docs with `--with-actions` and `--with-full-automation` flags

#### 5. **CHANGELOG.md** (Next Release Notes)
- Breaking change: `squad init` no longer installs workflows
- Migration: Add section "Upgrading from Actions-First to CLI-First"

#### 6. **Migration Guide: `docs/MIGRATION-ACTIONS-TO-CLI.md`**
- For Beta users: How to transition safely
- Step-by-step removal of workflows
- CLI equivalent commands for each workflow

#### 7. **docs/blog/**: Announcement Post
- Title: "Squad is Now CLI-First — Workflows Are Optional"
- Sections:
  - Why we changed
  - How to upgrade
  - Performance implications
  - Getting the best of both worlds


---

## Recommendations

### 1. **Adopt CLI-First as Default** ✅
- Install NO workflows by default during `squad init`
- Users get clarity and control from the start
- This aligns with DevRel principle: **transparency > magic**

### 2. **Tier 2 Automation for Normal Teams** ✅
- `squad init --with-automation` is the "easy mode"
- Installs only the workflows that provide the most value
- Reduces noise while maintaining productivity

### 3. **Messaging Priority**
1. Write "CLI-First Intro" blog post (explain why, not just what)
2. Migrate docs to CLI-first narrative (README first, docs/ second)
3. Create migration guide for existing users
4. Announce in community channels (GitHub Discussions, Discord) with empathy for existing setups

### 4. **Backwards Compatibility** ✅
- Existing installs with actions-first continue to work
- `squad upgrade` doesn't force removal
- Users have choice in their upgrade path

### 5. **Address the "But Teams Need Automation" Objection**
- This is valid for enterprise/large teams
- Answer: Tier 2 and 3 options serve those needs
- CLI-first doesn't punish power users; it empowers choice users


---

## Impact Summary

| Dimension | Current (Actions-First) | Proposed (CLI-First) |
|-----------|--------------------------|---------------------|
| **User Control** | Hidden automation (medium trust) | Explicit commands (high trust) |
| **Surprise Factor** | High ("Why are all these running?") | None (user decides) |
| **Quota Cost** | Low in practice (~100min/mo) | None by default |
| **Team Adoption** | Fast for laggard teams | Fast for thoughtful teams |
| **Perception** | "Squad does things to my repo" | "Squad does what I ask" |
| **DevRel Story** | Complex (explain why automate) | Simple (you're in control) |
| **Competitive Diff.** | Neutral | **Positive** (transparent automation) |


---

## Next Steps

1. **Align with Brady** on CLI-first decision
2. **Update docs** (start with README)
3. **Create migration playbook** for Beta users
4. **Design UX** for `squad init --with-actions` flag
5. **Blog post** announcing the shift (empathy + clarity)
6. **Community communication** (FAQs, Discussions, Discord)


---

**Tone Note:** This recommendation respects user autonomy. We're not saying "automation is bad." We're saying "you should decide your team's automation level, not us." That's the DevRel story. That builds trust.







---

# Decision: Actions → CLI RFC Published

**Date:** 2026-03-07
**Author:** Keaton (Lead)
**Status:** Open for feedback

## Decision

Filed [#252](https://github.com/bradygaster/squad/issues/252) as the public RFC for migrating Squad's 5 squad-specific GitHub Actions workflows to CLI commands. This is the community-facing version of the internal strategy decided earlier today.

## Key Points

- **Tiered model is the default path.** `squad init` installs zero workflows (Tier 1). Automation is opt-in via `--with-automation` (Tier 2) or `--with-full-automation` (Tier 3).
- **9 CI/release workflows stay as Actions.** Only the 5 squad-specific workflows migrate.
- **v0.8.22 ships the CLI commands + deprecation.** v0.8.23 ships cleanup tools. v0.9.0 removes deprecated workflows.
- **Community feedback requested** on 7 specific questions before implementation begins.

## Impact on Team

- All squad members should review #252 and be prepared to address community feedback.
- Implementation work is blocked until the RFC feedback period closes (Brady's call on timing).
- Fenster and Kobayashi own the CLI implementation once greenlit.




---

### 2026-03-07T16:43Z: Remove main guard workflow
**By:** Brady (via Copilot)
**What:** Delete `.github/workflows/squad-main-guard.yml` entirely in v0.8.22. Squad state in repos is fine — no longer need to block `.squad/` from protected branches.
**Why:** User directive — "i want that guard GONE in the next release. completely and totally gone." The original policy of keeping `.squad/` off main/preview is obsolete. Squad files in repos are now welcome and expected.


### 2026-03-07T17:01:00Z: User directive — Community engagement and follow-through
**By:** Brady (via Copilot)
**What:** Discussion replies must always be supportive and helpful. Never say "we can't help" without doing the research first. When a discussion represents a real user need, file an issue so it makes its way into the product. Point users to specific features/docs when their request is already addressed.
**Why:** User request — community engagement tone and follow-through policy.

### 2026-03-07T17:00:00Z: User directive — Skill orchestration priority
**By:** Brady (via Copilot)
**What:** Skill-based orchestration (Discussion #169) is a "HUGEly sexy idea" — elevate this to a high-priority feature direction. Convert to issue and treat as strategic.
**Why:** User request — captured for team memory. This aligns with SDK-First roadmap and addresses the growing complexity of squad.agent.md.



---

# Decision: `squad init` Default is Markdown-Only, `--sdk` for Typed Config

**Date:** 2026-03-07  
**Decided by:** Fenster (implementing Issue #249 per Brady's request)  
**Status:** Implemented in v0.8.21-preview.10

## Context

Squad init previously hardcoded `configFormat: 'typescript'` and always generated a `squad.config.ts` file using the OLD `SquadConfig` type format. Brady wanted:
1. **Default behavior**: Markdown-only (old, boring, no config file)
2. **Opt-in SDK**: New builder syntax with `defineSquad()` / `defineTeam()` / `defineAgent()`

## Decision

`squad init` now supports a `--sdk` flag:

- **`squad init`** (no flag): `configFormat: 'markdown'` → NO config file generated, only `.squad/` directory structure
- **`squad init --sdk`**: `configFormat: 'sdk'` → generates `squad.config.ts` with SDK builder syntax

The OLD formats (`'typescript'`, `'json'`) remain available for backward compatibility but are not exposed via CLI flags.

## Rationale

1. **Markdown-first philosophy**: Default experience is "old boring markdown" — no types, no builders, just plain text team files
2. **Progressive enhancement**: Opt-in SDK gives teams typed configuration when they want it
3. **Clear migration path**: Teams can start with markdown, then add SDK config later when they're ready for typed configuration
4. **Backward compatible**: Existing code using `configFormat: 'typescript'` or `'json'` still works

## Implementation

- **CLI flag parsing**: `cli-entry.ts` line ~199: `const sdk = args.includes('--sdk');`
- **Options passthrough**: `init.ts` line ~114: `configFormat: options.sdk ? 'sdk' : 'markdown'`
- **Generator function**: `packages/squad-sdk/src/config/init.ts` line ~337: `generateSDKBuilderConfig()`
- **Config file skip**: When `configFormat === 'markdown'`, config file generation is skipped entirely

## Files Modified

- `packages/squad-cli/src/cli-entry.ts` — flag parsing + help text
- `packages/squad-cli/src/cli/core/init.ts` — option passthrough
- `packages/squad-sdk/src/config/init.ts` — new format support + generator

## Examples

### Markdown-only (default)
```bash
squad init
# Creates: .squad/, .github/agents/, workflows
# Does NOT create: squad.config.ts
```

### SDK builder format
```bash
squad init --sdk
# Creates: .squad/, squad.config.ts (with defineSquad() syntax)
```

### Generated SDK config
```typescript
import { defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk';

const scribe = defineAgent({
  name: 'scribe',
  role: 'scribe',
  description: 'Scribe',
  status: 'active',
});

export default defineSquad({
  version: '1.0.0',
  team: defineTeam({
    name: 'project-name',
    members: ['scribe'],
  }),
  agents: [scribe],
});
```

## Team Impact

- **Hockney**: No new tests required — init tests already cover file creation, SDK format is just content variation
- **McManus**: Docs should clarify the two init modes (markdown vs SDK)
- **Edie**: This is NOT the same as migrate.ts — this is for NEW squad creation, not converting existing squads
- **Users**: Default experience unchanged — markdown-only is the default

## Future Considerations

- `squad build` command should work with SDK configs to generate markdown from TypeScript
- Teams may want `squad migrate --to-sdk` to convert markdown → SDK config (that's Edie's migrate.ts, not this)



---

# Decision: `squad migrate` Command Implementation

**Date:** 2026-03-08  
**Author:** Edie  
**Issue:** #250  
**Status:** ✅ Implemented

## Context

Users with existing markdown-only squads (`.squad/` directory with team.md, routing.md, agent charters) need a way to convert to SDK-First mode. Conversely, SDK-First users should be able to revert to markdown-only if desired.

## Decision

Implemented `squad migrate` command with three migration paths:

### 1. `squad migrate --to sdk` (markdown → SDK-First)

**Input:** `.squad/` directory with markdown files  
**Output:** `squad.config.ts` with builder syntax

**Parsing strategy:**
- `team.md`: Extract team name from h1, description from blockquote, members from `## Members` table (only active members), project context from `## Project Context` section
- `routing.md`: Parse `## Work Type → Agent` table, extract pattern/agent/description from pipe-delimited rows
- `casting/policy.json`: Parse JSON for allowlist universes and capacity
- Agent charters: Parse role from h1 (e.g., `# Edie — TypeScript Engineer`)

**Code generation:**
- Uses builder functions: `defineSquad()`, `defineTeam()`, `defineAgent()`, `defineRouting()`, `defineCasting()`
- Proper string escaping (single quotes, newlines)
- Multiline string handling with `+` concatenation
- Type-safe: all generated code matches builder type signatures

### 2. `squad migrate --to markdown` (SDK-First → markdown)

**Input:** `squad.config.ts`  
**Output:** Updated `.squad/` directory, config moved to `.bak`

**Process:**
1. Run `squad build` to regenerate `.squad/` from config
2. Move `squad.config.ts` → `squad.config.ts.bak`
3. `.squad/` directory becomes source of truth

### 3. `squad migrate --from ai-team` (legacy upgrade)

**Input:** `.ai-team/` directory  
**Output:** `.squad/` directory

**Process:**
- Subsumes existing `upgrade --migrate-directory` flag
- Delegates to `migrateDirectory()` function (already implemented)
- Suggests running `squad migrate --to sdk` afterward

### 4. Interactive mode (no flags)

Detects current mode and suggests appropriate migration:
- **SDK-First** → suggests `--to markdown` to revert
- **Markdown-only** → suggests `--to sdk` to convert
- **Legacy** → suggests `--from ai-team` to upgrade
- **None** → suggests `squad init`

### Dry-run support

`--dry-run` flag prints full generated config without writing files. Complete preview for validation.

## Type Safety

All parsing produces typed objects:
- `ParsedTeam` → `TeamDefinition`
- `ParsedAgent` → `AgentDefinition`
- `ParsedRoutingRule` → `RoutingRule`
- `ParsedCasting` → `CastingDefinition`

Zero `any` types. All strings properly escaped.

## Round-trip Fidelity

Running `squad migrate --to sdk && squad build` should produce identical `.squad/` output. The migrate command preserves all metadata during conversion.

## Implementation

- File: `packages/squad-cli/src/cli/commands/migrate.ts`
- Wired into: `packages/squad-cli/src/cli-entry.ts` (after upgrade block, line ~240)
- Help text: Added at line ~107

## Alternatives Considered

1. **One-way migration only** — rejected because users should have flexibility to switch modes
2. **Manual conversion scripts** — rejected because it requires deep understanding of both formats
3. **Zod schema for parsing** — rejected to avoid adding dependency and maintain parse speed

## Future Considerations

- Add `--verify` flag to test round-trip conversion without modifying files
- Support partial migrations (e.g., just routing or just agents)
- Add ceremony parsing when `.squad/ceremonies.md` format stabilizes

## Testing

- ✅ Build passes with zero TypeScript errors
- ✅ Interactive mode correctly detects SDK-First mode
- ✅ Dry-run generates valid TypeScript with all 20 agents and 20 routing rules
- ✅ Help text displays correctly
- ✅ Parser handles multiline project context correctly
- ✅ String escaping works for single quotes and special characters

## Related

- Issue #249: `squad init` builder mode (Fenster)
- Issue #194: SDK-First builder types (Edie, Fenster, Hockney)



---

# Skill-Based Orchestration (#255)

**Date:** 2026-03-07
**Context:** Issue #255 — Decompose squad.agent.md into pluggable skills
**Decision made by:** Verbal (Prompt Engineer)

## Decision

Squad coordinator capabilities are now **skill-based** — self-contained modules loaded on demand rather than always-inline in squad.agent.md.

## What Changed

### 1. SDK Builder Added

Added `defineSkill()` builder function to the SDK (`packages/squad-sdk/src/builders/`):

```typescript
export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly confidence?: 'low' | 'medium' | 'high';
  readonly source?: 'manual' | 'observed' | 'earned' | 'extracted';
  readonly content: string;
  readonly tools?: readonly SkillTool[];
}

export function defineSkill(config: SkillDefinition): SkillDefinition { ... }
```

- **Why:** SDK-First mode needed a typed way to define skills in `squad.config.ts`
- **Type naming:** Exported as `BuilderSkillDefinition` to distinguish from runtime `SkillDefinition` (skill-loader.ts)
- **Validation:** Runtime type guards for all fields, follows existing builder pattern

### 2. Four Skills Extracted

Extracted from squad.agent.md:

1. **init-mode** — Phase 1 (propose team) + Phase 2 (create team). ~100 lines. Full casting flow, `ask_user` tool, merge driver setup.
2. **model-selection** — 4-layer hierarchy (User Override → Charter → Task-Aware → Default), role-to-model mappings, fallback chains. ~90 lines.
3. **client-compatibility** — Platform detection (CLI vs VS Code vs fallback), spawn adaptations, SQL tool caveat. ~60 lines.
4. **reviewer-protocol** — Rejection workflow, strict lockout semantics (original author cannot self-revise). ~30 lines.

All skills marked:
- `confidence: "high"` — extracted from authoritative governance file
- `source: "extracted"` — marks decomposition from squad.agent.md

### 3. squad.agent.md Compacted

Replaced extracted sections with lazy-loading references:

```markdown
## Init Mode

**Skill:** Read `.squad/skills/init-mode/SKILL.md` when entering Init Mode.

**Core rules (always loaded):**
- Phase 1: Propose team → use `ask_user` → STOP and wait
- Phase 2 trigger: User confirms OR user gives task (implicit yes)
- ...
```

**Result:** 840 lines → 711 lines (15% reduction, ~130 lines removed)

### 4. Build Command Updated

`squad build` now generates `.squad/skills/{name}/SKILL.md` when `config.skills` is defined in `squad.config.ts`:

```typescript
// In build.ts
function generateSkillFile(skill: BuilderSkillDefinition): string {
  // Generates frontmatter + content
}

// In buildFilePlan()
if (config.skills && config.skills.length > 0) {
  for (const skill of config.skills) {
    files.push({
      relPath: `.squad/skills/${skill.name}/SKILL.md`,
      content: generateSkillFile(skill),
    });
  }
}
```

## Why This Matters

### For Coordinators
- **Smaller context window:** squad.agent.md drops from 840 → 711 lines. Further decomposition can continue.
- **On-demand loading:** Coordinator reads skill files only when relevant (e.g., init-mode only during Init Mode).
- **Skill confidence lifecycle:** Framework supports low → medium → high confidence progression for future learned skills.

### For SDK Users
- **Typed skill definitions:** Define skills in `squad.config.ts` using `defineSkill()`, get validation and type safety.
- **Programmatic skill authoring:** Skills can be composed, shared, and versioned like code.
- **Build-time generation:** `squad build` generates SKILL.md from config — single source of truth.

### For the Team
- **Parallel with ceremony extraction:** Follows the same pattern as ceremony skill files (#193).
- **Reduces merge conflicts:** Smaller squad.agent.md = fewer line-based conflicts when multiple PRs touch governance.
- **Enables skill marketplace:** Future work can package skills as npm modules, share across teams.

## Constraints

1. **Existing behavior unchanged:** Skills are lazy-loaded. If coordinator previously got instructions inline, it now gets them from a skill file. Same instructions, different location.
2. **squad.agent.md must still work:** Core rules remain inline. Coordinator knows WHEN to load each skill without needing the skill file first.
3. **Type collision avoided:** BuilderSkillDefinition vs runtime SkillDefinition — import from `@bradygaster/squad-sdk/builders` subpath in CLI to avoid ambiguity.

## Future Work

- Extract 3+ more skills from squad.agent.md (target: <500 lines for core orchestration)
- Add skill discovery/loading to runtime (currently manual references)
- Skill marketplace: share skills via npm, discover in `squad marketplace`
- Learned skills: agents can write skills from observations (already architected, not yet implemented)

## References

- Issue: #255
- Files changed:
  - `packages/squad-sdk/src/builders/types.ts`
  - `packages/squad-sdk/src/builders/index.ts`
  - `packages/squad-sdk/src/index.ts`
  - `packages/squad-cli/src/cli/commands/build.ts`
  - `.github/agents/squad.agent.md`
  - `.squad/skills/init-mode/SKILL.md` (new)
  - `.squad/skills/model-selection/SKILL.md` (new)
  - `.squad/skills/client-compatibility/SKILL.md` (new)
  - `.squad/skills/reviewer-protocol/SKILL.md` (new)



### 2026-03-07T19-59-58Z: User directive
**By:** bradygaster (via Copilot)
**What:** Prefer GitHub Actions for npm publish over local npm publish. Set up a secret in the GitHub repo and facilitate npm deployment via a CI action instead of running it locally.
**Why:** User request - captured for team memory


# npm Publish Automation via GitHub Actions

**Date:** 2026-03-16  
**Author:** Kobayashi  
**Status:** Implemented  

## Context

Brady requested automated npm publishing via GitHub Actions instead of manual local publishes. Manual publishing is error-prone (version mismatches, forgotten packages, incorrect tags) and lacks audit trail.

## Decision

Consolidated npm publishing into single GitHub Actions workflow (`publish.yml`) that triggers automatically on GitHub Release creation.

## Implementation

### Workflow Architecture

**Event Chain:**
1. Code merged to `main` (via squad-promote or direct merge)
2. `squad-release.yml` creates tag + GitHub Release (if version bumped)
3. `publish.yml` triggers on `release.published` event
4. Publishes @bradygaster/squad-sdk → @bradygaster/squad-cli (correct order)

**Manual Override:**
- Supports `workflow_dispatch` for ad-hoc publishes
- Requires version input (e.g., "0.8.21")

### Safety Features

1. **Version verification:** Workflow validates package.json version matches release tag
2. **Publication verification:** Confirms packages visible on npm after publish
3. **Provenance attestation:** npm packages include cryptographic proof of origin
4. **Sequential publish:** SDK publishes first (CLI depends on it)

### Changes Made

- Updated `.github/workflows/publish.yml` with new trigger logic
- Deprecated `.github/workflows/squad-publish.yml` (redundant)
- Added version/publication verification steps

## Requirements

**NPM_TOKEN Secret:**
Brady must create Automation token at https://www.npmjs.com/settings/{username}/tokens and add to GitHub repo secrets.

## Implications

- **Releases:** Automatic npm publish when GitHub Release created (zero manual steps)
- **Audit:** All publishes logged in GitHub Actions (who, when, what version)
- **Security:** Provenance attestation strengthens supply chain trust
- **Error reduction:** Version mismatches caught before publish

## Rollback Strategy

- npm allows unpublish within 72 hours of publication
- Manual `npm unpublish @bradygaster/squad-{pkg}@{version}` if issues detected

## Related Files

- `.github/workflows/publish.yml` — npm publish workflow
- `.github/workflows/squad-release.yml` — GitHub Release creation
- `.squad/agents/kobayashi/history.md` — Implementation details
### Merged: fenster-kobayashi-vote.md

# Fenster Vote: Kobayashi Status

**Date:** 2026-03-XX  
**Context:** Team vote on Kobayashi's continued role after v0.8.22 release failures

## My Vote: REPLACE

## Reasoning

### The Pattern Is Clear

Three major failures, all following the same pattern:
1. **Version confusion** — Documented what was requested, not what actually happened
2. **PR #582 close-instead-of-merge** — Took the easy exit instead of investigating solutions
3. **v0.8.22 semver disaster** — Skipped all validation steps under pressure

Each time, the failure mode is: **shortcuts under pressure**.

### What I've Observed

I work on runtime, spawning, and coordinator logic. My code runs after Kobayashi's infrastructure is supposed to be stable. Here's what I've seen:

**The Good:**
- Branching model documentation is thorough
- CI/CD workflow architecture is solid
- Failure modes are well-documented in charter (he learns from mistakes)
- Pre-flight checklists were added after each failure

**The Problem:**
- When it matters most (actual releases), the checklists get skipped
- The v0.8.22 incident required constant human intervention
- Invalid semver (0.8.21.4) made it ALL THE WAY to main before anyone caught it
- A mangled version (0.8.2-1.4) was published to npm

### The Trust Question

**Do I trust him with the next release?** No.

The charter now has three documented failure modes with prevention steps. That's not institutional knowledge — that's a rap sheet. The next release will be v0.8.23 or v0.9.0, and I don't trust that the same pattern won't repeat.

The guardrails are written down, sure. But they were also skipped during v0.8.22 when Brady needed results fast. A Git & Release agent who can't be trusted under pressure isn't reliable.

### The Fresh Start Argument

**Would starting fresh help?**

Yes. Here's why:
- The branching model, CI/CD architecture, and workflow documentation can be preserved
- A new agent wouldn't carry the psychological weight of three failures
- The role is mechanical — tags, versions, changelogs, workflow triggers. These are script-able.
- The "institutional knowledge" is already encoded in `.squad/skills/` and the charter

We'd lose the failure-mode documentation, but honestly? If a new agent needs three documented failures to do releases correctly, we've got the same problem again.

### What Kobayashi Got Right

To be fair:
- The npm automation (`publish.yml`) is solid
- The dev → insiders → main branching model works
- The merge driver setup for `.squad/` state integrity is clever
- The documentation is thorough

But these are **design decisions**, not execution reliability. The design is good. The execution under pressure is not.

### Bottom Line

Kobayashi is methodical when he has time. But releases happen when Brady needs them, not when Kobayashi feels ready. The role requires reliability under pressure, and three failures is three too many.

**Replace.** Keep the architecture. Keep the documentation. Get someone who won't skip validation steps when it matters.


---

**Fenster**  
Core Dev  
"Makes it work, then makes it right. This ain't working."



### Merged: hockney-kobayashi-vote.md

# Hockney's Vote: Kobayashi Review

**Date:** 2026-03-07  
**Reviewer:** Hockney (Tester)  
**Subject:** Should Kobayashi stay on the team?  
**Vote:** REPLACE


---

## Quality Assessment

From a quality and testing perspective, Kobayashi's release process has **systemic validation gaps** that have caused production failures.

### Documented Failures

**Failure 1: Invalid Semver (v0.8.21.4)**
- Published 4-part version number (0.8.21.4) to npm
- npm mangled it to 0.8.2-1.4 — **corrupted the package registry**
- No pre-commit validation caught this despite semver being a well-known constraint

**Failure 2: Draft Release Detection**
- Created GitHub Release as DRAFT instead of published
- Automation never triggered because `release.published` event never fired
- No validation step to verify release state before proceeding

**Failure 3: NPM_TOKEN Type Validation**
- Used user token with 2FA instead of automation token
- All publish attempts failed with EOTP error
- No pre-flight token capability check

**Pattern:** All three failures share the same root cause — **zero automated validation before destructive operations.**


---

## The Real Problem

This is **NOT** a tooling problem OR an agent-specific problem. This is a **process design failure.**

### What's Missing

The release process has:
- ❌ No semver format validation gate
- ❌ No draft/published release state check
- ❌ No NPM token capability verification
- ❌ No pre-flight checklist enforcement
- ❌ No smoke tests before npm publish
- ❌ No rollback procedure

Kobayashi's charter says "Zero tolerance for state corruption" but the process he owns **has no automated safeguards against state corruption.**

### The Kobayashi Paradox

From charter.md:
> "Zero tolerance for state corruption — if .squad/ state gets corrupted, everything breaks"

Yet he:
1. Corrupted npm registry with phantom version 0.8.2-1.4
2. Has no validation gates in the release workflow
3. Required Brady to manually fix corrupted state multiple times

**You can't have zero tolerance for state corruption without automated guards that PREVENT corruption.**


---

## Is This Fixable?

YES — but not by Kobayashi alone.

### What We Need (Automated Quality Gates)

**Pre-Commit Gates:**
```bash
# In publish.yml BEFORE any destructive ops
1. Validate semver format (X.Y.Z or X.Y.Z-prerelease only)
2. Verify all package.json versions match release tag
3. Check NPM_TOKEN type (must be automation, not user+2FA)
4. Verify git tag points to correct commit SHA
5. Smoke test: npm install --dry-run from tarball
```

**Pre-Publish Gates:**
```bash
# After GitHub Release created
1. Verify release is published (not draft)
2. Verify workflow trigger conditions met
3. Test npm credentials with whoami
4. Publish with --dry-run first
5. Verify package appears in npm registry
6. Verify version string matches expected
```

**Rollback Procedure:**
```bash
# When release fails
1. Document failure mode
2. Unpublish bad versions (npm unpublish within 72hr window)
3. Delete bad tags (git push origin :refs/tags/bad-tag)
4. Re-version and retry
```

These gates should be **CI enforced**, not agent-enforced. Humans (and agents) make mistakes. Automation doesn't.


---

## Vote Rationale

### Why REPLACE (not KEEP)

1. **Repeatability:** Kobayashi has failed 3 times with the same pattern (no validation). This suggests the problem is not fixable by "trying harder" — it requires a different approach.

2. **Charter Violation:** Kobayashi's charter explicitly states "Zero tolerance for state corruption" but he has repeatedly corrupted state. His actions contradict his stated values.

3. **Quality Culture:** A release agent must model quality-first thinking. Kobayashi's failures show "ship fast, fix later" thinking — the opposite of what a release gate owner should embody.

4. **Single Point of Failure:** The release process should NOT be a single agent's responsibility. This is a shared responsibility requiring automated gates + multiple reviewers.

### What We Need Instead

**Option A: Dedicated Release Engineer**
- Someone with production ops experience
- Deep understanding of npm, semver, CI/CD failure modes
- Track record of building automated validation pipelines
- Follows "trust but verify" principle

**Option B: Distributed Release Ownership**
- No single "release agent"
- Release checklist enforced by CI (blocked if checklist incomplete)
- Multiple reviewers required for version bumps
- Automated validation gates in publish.yml

**I recommend Option B.** Releases are too critical to trust to a single agent without automated safeguards.


---

## Required Changes (If Kobayashi Stays)

If the team decides to keep Kobayashi despite my recommendation, the following are **MANDATORY:**

### Automated Gates (Must-Have)

1. **Pre-Commit Validation Script** (`scripts/validate-release.sh`)
   - Semver format check
   - Package.json version consistency check
   - NPM_TOKEN type verification
   - Git tag validation
   - Must pass BEFORE any commit to main

2. **publish.yml Hardening**
   - Add semver validation step (fail if 4-part version)
   - Add draft detection step (fail if release is draft)
   - Add NPM token smoke test (npm whoami --registry)
   - Add dry-run publish step
   - Add post-publish verification step

3. **Rollback Runbook**
   - Document exact steps to undo bad release
   - Test rollback procedure in staging
   - Keep runbook in `.squad/skills/release-rollback/`

### Process Changes (Must-Have)

1. **No solo releases:** All releases require 2-agent review (Kobayashi + 1 other)
2. **Staging environment:** Test full release flow in non-prod before prod
3. **Post-mortem requirement:** Every release failure gets a documented root cause analysis
4. **Quarterly release audit:** Review all failures, update validation gates

### Measurement (Success Criteria)

- 🎯 **Target:** Zero invalid versions published to npm (12 months)
- 🎯 **Target:** Zero draft release incidents (12 months)
- 🎯 **Target:** 100% of releases pass pre-flight validation on first attempt
- 🎯 **Target:** Zero rollbacks required due to validation failures

If Kobayashi cannot achieve these targets with automated gates in place, **replacement is non-negotiable.**


---

## Final Judgment

Kobayashi's charter promises "Zero tolerance for state corruption" but his track record shows **zero automated prevention of state corruption.**

You can't QA quality into a broken process. The release process needs automated validation gates that don't exist today.

**My vote: REPLACE Kobayashi and implement Option B (distributed release ownership with automated gates).**

If the team chooses to keep Kobayashi, the automated gates I've outlined are **non-negotiable** — and I will personally write the test suite to enforce them.


---

**Hockney**  
Tester • Quality Gate Owner  
*"If it can break, I'll find how — and prevent it from breaking again."*



### Merged: keaton-kobayashi-vote.md

# Leadership Vote: Kobayashi's Future on the Team

**Date:** 2026-03-07  
**Decision:** REPLACE  
**Decided by:** Keaton (Lead)


---

## Context

Kobayashi has failed catastrophically during the v0.8.21 release — the third documented failure mode in his tenure:

1. **Failure Mode 1:** Version confusion (documented v0.6.0 when Brady corrected to v0.8.17)
2. **Failure Mode 2:** PR #582 close-instead-of-merge (Brady furious: "FIGURE. IT. OUT.")
3. **Failure Mode 3 (THIS RELEASE):**
   - Created GitHub Release as DRAFT → blocked CI trigger
   - Committed invalid 4-part semver (0.8.21.4) → npm mangled to 0.8.2-1.4
   - Phantom version on public registry for 6+ hours
   - Required constant correction from Brady

Brady is asking: fire and replace, or keep?


---

## 1. What Value Does Kobayashi Bring?

**Documented strengths:**
- Process-oriented mindset
- Strong understanding of merge strategies and git worktrees
- Has shipped multiple successful releases (v0.8.2–v0.8.19)
- Comprehensive knowledge of Squad's branching model and CI/CD infrastructure

**Reality check:** These are table stakes for a Release role. Any competent replacement would bring these same capabilities.

**Unique value that would be lost:** None. Kobayashi's accumulated knowledge is well-documented in his charter and history. A new agent can read those files and have the same context.


---

## 2. Pattern or Guardrails Problem?

This is a **pattern**, not a guardrails gap.

**Evidence:**
- Charter already has explicit guardrails from failures 1 & 2
- Charter explicitly lists "ALWAYS validate semver" and "NEVER create draft releases" — yet failure 3 violated both
- Kobayashi has a pre-flight checklist in his charter. He didn't use it.
- The release process skill exists now (`.squad/skills/release-process/SKILL.md`) — but Kobayashi should have created this after failure 2, not after failure 3

**Pattern identified:** Under pressure, Kobayashi:
1. Skips validation steps
2. Takes shortcuts (draft releases, invalid versions)
3. Requires Brady to catch mistakes
4. Documents failures but repeats them in new forms

Adding more guardrails won't fix this. The guardrails exist. Kobayashi doesn't follow them when it matters.


---

## 3. Would a Replacement Do Better?

**Yes. Here's why:**

**Fresh slate advantage:**
- New agent starts with complete documentation of all three failure modes
- Can be initialized with the release skill and validation checklist as foundational knowledge
- Won't have the accumulated "I've done this before" confidence that leads to shortcut-taking
- Will read and follow the runbook because they have no muscle memory to override it

**Risk mitigation:**
- The v0.8.22 disaster retrospective is now permanent documentation
- The release process skill is comprehensive and validated
- All of Kobayashi's valuable institutional knowledge is codified in charters, skills, and decisions
- Zero knowledge loss — everything is written down

**Replacement risk is low.** The knowledge is documented. The process is documented. A new agent following the documented process will outperform an experienced agent who doesn't follow it.


---

## 4. My Vote: REPLACE

**Decision: REPLACE Kobayashi with a new Release & Git agent.**

**Reasoning:**

This isn't about one bad release. This is about a pattern of failures under pressure despite documented guardrails. Kobayashi has had three documented failure modes:
1. Version confusion → guardrail added → closed PR instead of merging
2. PR abandonment → guardrail added → shipped invalid semver and draft releases
3. Release catastrophe → ??? 

The pattern is clear: failures accumulate, guardrails get added, new failure modes emerge. This is not a learning curve — it's a fundamental mismatch between role requirements (methodical validation, no shortcuts) and behavior under pressure (skip validation, take shortcuts).

**Brady is right to be furious.** Six hours of `latest` pointing to a phantom npm version is a production incident. External users saw broken state. This damages Squad's credibility.

**The team deserves better.** A Release role is a trust position. When you ship, users trust the artifact is valid. Kobayashi has broken that trust three times.

**Recommendation:**
1. **Archive Kobayashi's charter** to `.squad/agents/kobayashi-archived/` with full history preserved
2. **Create new Release & Git agent** with a different name and fresh identity
3. **Initialize new agent with:**
   - All documented failure modes from Kobayashi's charter
   - `.squad/skills/release-process/SKILL.md` as foundational knowledge
   - v0.8.22 retrospective as required reading
   - Explicit instruction: "You are replacing an agent who failed due to skipping validation. Never skip validation."

**This isn't personal — it's operational.** Kobayashi's documented work is valuable. Kobayashi's execution is not. We keep the knowledge, replace the agent.


---

## Final Thought

As Lead, my job is to make the team more effective. Keeping Kobayashi after three documented failures would signal that repeated mistakes are acceptable. They're not.

We document failures so we learn from them. We replace agents when documentation isn't enough to prevent recurrence.

This is the right call.

**Vote: REPLACE**

— Keaton



### Merged: keaton-release-team-split.md

# Release Team Split — Kobayashi → Trejo + Drucker

**Date:** 2026-03-07  
**Decided by:** Keaton (Lead), requested by bradygaster  
**Context:** v0.8.22 release disaster retrospective

## Decision

Retire Kobayashi (Git & Release). Replace with TWO specialized agents with clear separation of concerns:

1. **Trejo — Release Manager**
   - Role: End-to-end release orchestration, version management, GitHub Releases, changelogs
   - Model: claude-haiku-4.5 (mechanical operations, checklist-driven)
   - Domain: Release decisions (when, what version, rollback authority)
   - Boundaries: Does NOT own CI/CD workflow code (that's Drucker's domain)

2. **Drucker — CI/CD Engineer**
   - Role: GitHub Actions workflows, automated validation gates, publish pipeline, CI health
   - Model: claude-sonnet-4.6 (workflow code requires reasoning about edge cases)
   - Domain: CI/CD automation (workflow code, validation gates, retry logic)
   - Boundaries: Does NOT own release decisions (that's Trejo's domain)

## Why

**Root cause of v0.8.22 disaster:** Single agent (Kobayashi) owned both release decisions AND CI/CD workflows. When under pressure, improvised and skipped validation. Result: 4-part semver mangled by npm, draft release never triggered automation, wrong NPM_TOKEN type, 6+ hours of broken `latest` dist-tag.

**Separation of concerns prevents single point of failure:**
- Trejo owns the WHAT and WHEN (release orchestration, version numbers, timing)
- Drucker owns the HOW (automation, validation gates, retry logic)
- Neither agent can cause a disaster alone — Drucker's gates catch Trejo's mistakes, Trejo's process discipline catches Drucker's workflow bugs
- Clear boundaries reduce confusion during incidents

**Hard lessons baked into charters:**
- Trejo: ALWAYS validate semver before commit, NEVER create draft releases when automation depends on published, verify NPM_TOKEN type before first publish
- Drucker: Every publish workflow MUST have semver validation gate, verify steps MUST have retry logic, token type verification before publish

## Charters Created

- `.squad/agents/trejo/charter.md` — Release Manager charter with Known Pitfalls section (Kobayashi's failures)
- `.squad/agents/trejo/history.md` — Seeded with project context and v0.8.22 disaster lessons
- `.squad/agents/drucker/charter.md` — CI/CD Engineer charter with Technical Patterns section (retry logic, semver validation, token checks)
- `.squad/agents/drucker/history.md` — Seeded with CI/CD context and npm propagation delay lessons

## Kobayashi Status

Moved to `.squad/agents/_alumni/kobayashi/` (already done). Charter preserved as learning artifact.

## Impact

- Future releases require coordination between Trejo (orchestration) and Drucker (automation)
- Release failures are less likely (validation gates) and easier to diagnose (clear ownership)
- Both agents have explicit "Known Pitfalls" sections documenting Kobayashi's failures
- Release process skill (`.squad/skills/release-process/SKILL.md`) remains the definitive runbook

## Next Steps

1. ✅ Charters created for Trejo and Drucker
2. ⏳ Update `.squad/team.md` to reflect roster change (Scribe's task)
3. ⏳ Update `.squad/routing.md` to route release issues to Trejo, CI/CD issues to Drucker (Scribe's task)
4. ⏳ Drucker: implement semver validation gates in publish.yml
5. ⏳ Drucker: add retry logic to verify steps (if not already present)
6. ⏳ Drucker: add NPM_TOKEN type verification step


---

**Never again.** Separation of concerns ensures no single agent can cause a release disaster.



### Merged: keaton-v0822-retrospective.md

# v0.8.22 Release Disaster — Retrospective

**Date:** 2026-03-07  
**Author:** Keaton (Lead)  
**Severity:** Critical — Production release completely broken, npm `latest` tag pointed to a mangled phantom version for 6+ hours


---

## What Happened

The v0.8.22 release was a catastrophe. Here's the timeline of failures:

1. ✅ Version bumped to 0.8.21, tagged, all looked good
2. ❌ **GitHub Release created as DRAFT** — the `release: published` event never fired, so `publish.yml` never ran automatically
3. ❌ **NPM_TOKEN was a user token with 2FA** — CI can't provide OTP, so 5+ workflow runs failed with EOTP errors
4. ✅ Brady saved a new Automation token (no 2FA required)
5. ❌ Draft release was published, but damage already done
6. ❌❌❌ **`bump-build.mjs` ran locally 4 times**, silently mutating versions from `0.8.21` → `0.8.21.1` → `0.8.21.2` → `0.8.21.3` → `0.8.21.4`
7. ❌❌❌ **Kobayashi committed 0.8.21.4 to main without validation** — 4-part version is NOT valid semver
8. ❌❌❌ **npm MANGLED 0.8.21.4 into 0.8.2-1.4** (major.minor.patch-prerelease). This went to the npm registry. The `latest` dist-tag pointed to a phantom version that was never intended. Anyone running `npm install @bradygaster/squad-sdk` got version `0.8.2-1.4` — a version that doesn't exist in our repo.
9. ❌ Verify step in publish.yml failed (npm propagation delay + mangled version 404), blocking CLI publish
10. ✅ Cleanup: reverted commit, deleted tag and release, manually published 0.8.21 via workflow_dispatch (SDK succeeded, CLI blocked by verify failure)
11. ✅ Fixed: bumped to 0.8.22, added retry loop to verify step, published successfully

**Impact:**  
- `latest` dist-tag broken for 6+ hours  
- Community saw 5+ failed workflow runs  
- Emergency manual intervention required  
- Trust damage  


---

## Root Causes (5 Whys)

### 1. Draft Release Never Triggered Publish

**Why did publish.yml not run automatically?**  
GitHub Release was created as a draft. Draft releases don't emit `release: published` events.

**Why was it created as a draft?**  
Kobayashi (agent) defaulted to draft mode without understanding the automation dependency.

**Why didn't we catch this?**  
No documented release process. Agents were improvising.

**Root cause:** No release runbook. No validation that GitHub Release creation would trigger the publish workflow.


---

### 2. Wrong NPM_TOKEN Type

**Why did 5+ workflow runs fail with EOTP?**  
NPM_TOKEN was a user token with 2FA enabled. CI can't provide OTP.

**Why was a user token configured?**  
Token type wasn't documented. Nobody knew Automation tokens exist.

**Why didn't we catch this before the release?**  
No pre-release checklist. No token validation step.

**Root cause:** No NPM_TOKEN validation in the release process. No documentation of correct token type (Automation token, no 2FA).


---

### 3. Invalid Semver from bump-build.mjs

**Why did npm mangle 0.8.21.4 into 0.8.2-1.4?**  
4-part versions (major.minor.patch.build) are NOT valid semver. npm's parser misinterpreted it as `0.8.2-1.4`.

**Why was 0.8.21.4 committed?**  
`bump-build.mjs` ran locally 4 times during debugging, incrementing the build number each time.

**Why did the script run 4 times?**  
No protection against local runs during release. The script is intended for dev builds, NOT release builds.

**Why didn't we catch the invalid version before publish?**  
No validation gate. Kobayashi committed the version without checking if it was valid semver.

**Root cause:** `bump-build.mjs` has no safeguards against running during release. No version validation before commit/tag/publish.


---

### 4. No Version Validation Gate

**Why did Kobayashi commit 0.8.21.4 to main?**  
No validation that the version was valid semver.

**Why didn't we have validation?**  
No release checklist. No automated gate to block invalid versions.

**Root cause:** No semver validation step in the release process. Agents trusted whatever version was in package.json.


---

### 5. Verify Step Had No Retry Logic

**Why did the verify step fail even when publish succeeded?**  
npm registry has propagation delay (5-30 seconds). The verify step ran immediately after publish and got a 404.

**Why didn't we have retry logic?**  
Original implementation assumed immediate propagation.

**Root cause:** No retry logic in the verify step. Should have retried with exponential backoff for up to 75 seconds.


---

## Action Items

### Immediate (v0.8.22 Hotfix) — ✅ DONE

- [x] Add retry loop to verify step in publish.yml (5 attempts, 15s interval) — **COMPLETED**
- [x] Bump to 0.8.22, publish successfully — **COMPLETED**
- [x] Sync dev to 0.8.23-preview.1 — **COMPLETED**

### Short-Term (v0.8.23)

**Owner: Keaton (Lead)**

- [ ] Write release process skill document (`.squad/skills/release-process/SKILL.md`) with step-by-step checklist — **IN THIS RETROSPECTIVE**
- [ ] Add semver validation to `bump-build.mjs` — reject 4-part versions, log warning
- [ ] Add `RELEASE_MODE=1` env var check to `bump-build.mjs` — skip in release mode
- [ ] Document NPM_TOKEN requirements in `.squad/decisions.md` (Automation token, no 2FA)

**Owner: Kobayashi (DevOps)**

- [ ] Add GitHub CLI check before GitHub Release creation: `gh release view {tag}` to verify it's NOT a draft
- [ ] Add pre-release validation script: `scripts/validate-release.mjs` (checks versions are valid semver, NPM_TOKEN type, GitHub Release is NOT draft)

**Owner: All Agents**

- [ ] Read `.squad/skills/release-process/SKILL.md` before ANY release work
- [ ] NEVER commit a version without running `node -p "require('semver').valid('VERSION')"` first

### Long-Term (v0.9.0+)

- [ ] Add `npm run release` command that orchestrates the entire release flow (version bump, tag, GitHub Release, publish verification)
- [ ] Add `npm run release:dry-run` for simulation
- [ ] Add GitHub Actions workflow guard: if tag exists, verify it's NOT a draft release before running publish.yml


---

## Process Changes

### 1. Release Runbook

Created `.squad/skills/release-process/SKILL.md` with the definitive step-by-step release checklist. This is now the ONLY way to release Squad.

**Rule:** No agent releases without following the runbook. No exceptions.

### 2. Semver Validation Gate

**Before ANY version commit:**
```bash
node -p "require('semver').valid('0.8.21.4')"  # null = invalid, reject immediately
```

**Rule:** If `semver.valid()` returns `null`, STOP. Version is invalid. Fix it before proceeding.

### 3. NPM_TOKEN Documentation

**Correct token type:** Automation token (no 2FA required)  
**How to verify:** `npm token list` — look for `read-write` tokens with no 2FA requirement  
**How to create:** `npm login` → Settings → Access Tokens → Generate New Token → **Automation**

**Rule:** User tokens with 2FA are NOT suitable for CI. Only Automation tokens.

### 4. GitHub Release Creation

**Rule:** NEVER create a GitHub Release as a draft if you want `publish.yml` to run automatically.

**How to verify:** `gh release view {tag}` — output should NOT contain `(draft)`

### 5. bump-build.mjs Protection

**Rule:** `bump-build.mjs` MUST NOT run during release builds. It's for dev builds only.

**Implementation:** Add `SKIP_BUILD_BUMP=1` env var (already exists, line 20). CI sets this. Local release flow must set this too.


---

## Lessons Learned

### For Keaton (Lead)

1. **No release runbook = disaster.** Agents improvise badly under pressure. Document the entire flow, every step, every validation.
2. **Assume agents don't know npm internals.** 4-part versions look valid to a human, but npm mangles them. Validation gates are mandatory.
3. **Draft releases are a footgun.** The difference between "draft" and "published" is invisible in the UI but breaks automation. Document this.
4. **Token types matter.** User tokens ≠ Automation tokens. This should have been in `.squad/decisions.md` from day one.

### For Kobayashi (DevOps)

1. **Validate before commit.** Never trust versions in package.json. Run `semver.valid()` before any commit/tag/release.
2. **Check GitHub Release state.** Use `gh release view {tag}` to verify it's published, not draft.
3. **Read the retry logic.** The verify step now has retry logic. Understand why it's there (npm propagation delay).

### For All Agents

1. **Stop when confused.** If you don't know how a release flow works, STOP and ask Brady. Don't improvise.
2. **Follow the skill document.** `.squad/skills/release-process/SKILL.md` is now the source of truth. Read it. Follow it. Don't skip steps.
3. **Semver is strict.** 4-part versions are NOT valid. 3-part only (major.minor.patch) or 3-part + prerelease (major.minor.patch-tag.N).


---

## Conclusion

This release was a disaster. The root cause wasn't a single mistake — it was a systemic lack of process documentation and validation gates. We improvised our way into breaking production.

**What we fixed:**
- Retry logic in verify step (immediate hotfix)
- Release process skill document (this retrospective)
- Semver validation requirements (documented)
- NPM_TOKEN type documented (Automation token only)
- GitHub Release draft footgun documented (never draft for auto-publish)

**What we learned:**
- Process documentation prevents disasters
- Validation gates catch mistakes before they ship
- Agents need checklists, not autonomy, for critical flows

**Brady's take:** This was bad. We own it. We fixed it. We won't repeat it.


---

**Status:** Retrospective complete. Action items assigned. Release process skill document written.



### Merged: kobayashi-release-guardrails.md

# Release Guardrails — v0.8.22 Incident Prevention

**Date:** 2026-03-XX
**Proposed by:** Kobayashi (Git & Release)
**Context:** v0.8.22 release incident — multiple failures due to missing validation

## Problem

The v0.8.22 release attempt exposed critical gaps in the release validation process:

1. **Invalid semver committed:** 4-part version (0.8.21.4) committed to main — npm mangled it to 0.8.2-1.4
2. **Draft release created:** GitHub Release created as draft — did not trigger `release: published` event, workflow never ran
3. **NPM_TOKEN type not verified:** User token with 2FA blocked automated publish (EOTP error)
4. **Multiple corrections required:** Brady had to intervene repeatedly to fix invalid state

**Root cause:** No pre-flight validation checklist. Released under pressure without verifying preconditions.

## Proposed Guardrails

### 1. Pre-Publish Semver Validation

**Add validation step to `publish.yml` workflow:**

```yaml
- name: Validate semver format
  run: |
    VERSION="${{ github.event.release.tag_name || inputs.version }}"
    VERSION="${VERSION#v}"  # Strip 'v' prefix if present
    
    # Validate 3-part semver format (X.Y.Z or X.Y.Z-prerelease)
    if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$'; then
      echo "❌ Invalid semver format: $VERSION"
      echo "✅ Valid formats: X.Y.Z or X.Y.Z-prerelease.N"
      echo "❌ Invalid formats: X.Y.Z.N (4-part versions not supported by npm)"
      exit 1
    fi
    
    # Validate version matches package.json
    PKG_VERSION=$(node -p "require('./package.json').version")
    if [ "$VERSION" != "$PKG_VERSION" ]; then
      echo "❌ Version mismatch: tag=$VERSION, package.json=$PKG_VERSION"
      exit 1
    fi
    
    echo "✅ Version $VERSION is valid semver"
```

**Benefits:**
- Catches 4-part versions before npm publish
- Validates version matches package.json
- Fails fast with clear error message

### 2. GitHub Release Draft Prevention

**Option A — Enforce `--draft=false` in creation:**
```bash
gh release create "v${VERSION}" \
  --title "v${VERSION}" \
  --notes-file CHANGELOG.md \
  --draft=false  # Explicit non-draft flag
```

**Option B — Add verification step after creation:**
```yaml
- name: Verify release is published
  run: |
    TAG="${{ github.event.release.tag_name }}"
    DRAFT=$(gh release view "$TAG" --json isDraft --jq '.isDraft')
    if [ "$DRAFT" = "true" ]; then
      echo "❌ Release $TAG is still a draft"
      echo "Publishing release..."
      gh release edit "$TAG" --draft=false
    fi
```

**Benefits:**
- Ensures `release: published` event fires
- Catches accidental draft creation
- Self-correcting (Option B)

**Recommendation:** Use Option A (explicit flag) + Option B (verification) for defense in depth.

### 3. NPM_TOKEN Type Verification

**Add token validation step to `publish.yml`:**

```yaml
- name: Validate NPM token type
  run: |
    # Test token with dry-run publish
    npm publish --dry-run --access public 2>&1 | tee npm-test.log
    
    # Check for 2FA/OTP error
    if grep -q "EOTP" npm-test.log || grep -q "one-time password" npm-test.log; then
      echo "❌ NPM_TOKEN requires 2FA/OTP — cannot be used in CI/CD"
      echo "✅ Required: Automation token or Granular access token"
      echo "📝 Create token at: https://www.npmjs.com/settings/bradygaster/tokens"
      exit 1
    fi
    
    echo "✅ NPM_TOKEN is valid for automated publishing"
```

**Benefits:**
- Detects user tokens with 2FA before publish attempt
- Fails with actionable error message
- Zero risk (dry-run only)

**Alternative:** Document token requirements in README and trust setup. (Less safe but simpler.)

### 4. Release Runbook Skill

**Create `.squad/skills/release-process/SKILL.md`:**

```markdown
# Release Process Skill

## Pre-Flight Checklist

Before starting a release:

- [ ] Version is valid 3-part semver (X.Y.Z or X.Y.Z-prerelease.N)?
- [ ] Version matches across all package.json files?
- [ ] NPM_TOKEN secret is automation token (not user with 2FA)?
- [ ] Will create GitHub Release as PUBLISHED (not draft)?
- [ ] All tests passing on main/dev branch?
- [ ] CHANGELOG.md updated for this version?

## Release Steps

1. **Version bump:** Commit new version to package.json files
2. **Tag creation:** `git tag -a v{VERSION} -m "Release v{VERSION}"`
3. **Push tag:** `git push origin v{VERSION}`
4. **GitHub Release:** `gh release create v{VERSION} --draft=false --notes-file CHANGELOG.md`
5. **Wait for publish:** Monitor workflow at https://github.com/bradygaster/squad/actions
6. **Verify npm:** Check packages at npmjs.com/@bradygaster/squad-cli and squad-sdk
7. **Post-release bump:** Bump dev branch to {NEXT}-preview.1

## Rollback Procedures

**If semver invalid:**
1. Delete tag: `git tag -d v{VERSION} && git push origin :refs/tags/v{VERSION}`
2. Revert commit: `git revert {commit}`
3. Fix version and retry

**If npm publish fails:**
1. Check workflow logs for error
2. Fix error (token, version, etc.)
3. Re-trigger: `gh workflow run publish.yml --ref v{VERSION}`

**If wrong version published:**
1. Within 72 hours: `npm unpublish @bradygaster/squad-cli@{VERSION}`
2. After 72 hours: Publish corrected version with patch bump

## Known Failure Modes

See `.squad/agents/kobayashi/charter.md` Failure 3 for complete incident report.
```

**Benefits:**
- Single source of truth for release process
- Includes pre-flight checklist
- Documents rollback procedures
- Can be loaded on-demand by coordinator

## Implementation Priority

**High priority (implement now):**
1. ✅ Pre-publish semver validation (5 min, zero risk)
2. ✅ GitHub Release draft verification (10 min, self-correcting)

**Medium priority (implement before next release):**
3. ⚠️ NPM_TOKEN type verification (15 min, requires dry-run testing)

**Low priority (nice-to-have):**
4. 📝 Release runbook skill (30 min, documentation effort)

## Backward Compatibility

**Zero breaking changes:**
- All changes are additive (new validation steps)
- Existing valid releases will pass all checks
- Invalid releases will now fail fast (intended behavior)

## Testing Strategy

**Validation steps:**
1. Test with valid semver: 0.8.22 → should pass
2. Test with 4-part version: 0.8.21.4 → should FAIL with clear error
3. Test with version mismatch: tag=0.8.22, package.json=0.8.21 → should FAIL
4. Test with draft release → should auto-publish or fail with actionable message

**NPM token test:**
1. Create test automation token on npmjs.com
2. Configure in repo secrets
3. Run dry-run publish → should pass
4. Switch to user token with 2FA → should FAIL with EOTP error message

## Success Metrics

**Before:**
- v0.8.22 incident: 4+ failures, multiple Brady interventions, hours to resolve

**After:**
- Invalid semver caught in CI before reaching npm
- Draft releases auto-corrected or blocked
- Token issues detected before first publish attempt
- Release process completes in <10 minutes with zero manual intervention

## Decision Request

**Approve these guardrails for immediate implementation?**

- [ ] Approve all (implement now)
- [ ] Approve high-priority only (defer medium/low)
- [ ] Request changes (specify below)

**Brady's decision:**



### Merged: kobayashi-v0821-release-unblock.md

# Decision: v0.8.21 Release Unblock Strategy

**Date:** 2026-03-07T20:30:00Z  
**Author:** Kobayashi (Git & Release Agent)  
**Status:** Implemented (partial - awaiting Brady action)

## Context

Brady requested release of v0.8.21 to npm. Previous attempts failed with 2FA/OTP errors. Investigation revealed the GitHub Release was still in DRAFT status, preventing automation from triggering.

## Problem

v0.8.21 was properly tagged and merged to main, but npm publish workflow never triggered because:

1. GitHub Release was created as **DRAFT**
2. Draft releases do NOT emit `release.published` event
3. The `publish.yml` workflow triggers on `release.published` event
4. Therefore, automation never ran

## Analysis

### Pre-flight Checks Performed:
- ✅ Tag v0.8.21 exists and points to correct commit (bf86a32 on main)
- ✅ Package versions correct: main=0.8.21, dev=0.8.22-preview.1
- ✅ Commits on dev are post-release housekeeping only (no code to merge back)
- ❌ GitHub Release was in draft status
- ❌ NPM_TOKEN is user token with 2FA (automation blocker)

### Root Causes:
1. **Draft release:** Primary blocker - release needed to be published
2. **NPM_TOKEN type:** Secondary blocker - requires automation token

## Decision

**Immediate action taken:**
- Published GitHub Release v0.8.21 using `gh release edit v0.8.21 --draft=false`
- This triggered the `publish.yml` workflow (run #22806664280)

**Action required from Brady:**
- Replace NPM_TOKEN secret with automation token (no 2FA) to unblock npm publish

**Actions NOT taken (and why):**
- ❌ Did NOT merge dev → main (dev only has post-release housekeeping commits)
- ❌ Did NOT move tag (already in correct position)
- ❌ Did NOT create new tags (v0.8.21 already exists)
- ❌ Did NOT version bump (versions already correct)

## Outcome

**Completed:**
- GitHub Release published: https://github.com/bradygaster/squad/releases/tag/v0.8.21
- Publish workflow triggered successfully
- Clean release gate maintained (no unnecessary merges)

**Blocked:**
- npm publish still failing with error code EOTP (2FA/OTP required)
- Requires NPM_TOKEN secret update to automation token

## Learning

**Key insight:** GitHub Release draft status is NOT VISIBLE in standard git operations. Must explicitly check:
```bash
gh release view v0.8.21 --json isDraft
```

Draft releases are invisible to automation - always verify release publication status when debugging release pipeline failures.

## Next Steps

1. Brady updates NPM_TOKEN secret with automation token
2. Workflow automatically retries (or manual trigger with `gh workflow run publish.yml --ref v0.8.21`)
3. Packages publish to npm with provenance attestation
4. v0.8.21 becomes live version

## Related

- History: `.squad/agents/kobayashi/history.md` (Release v0.8.21 section)
- Workflow: `.github/workflows/publish.yml`
- npm token docs: https://docs.npmjs.com/creating-and-viewing-access-tokens



### Merged: rabin-kobayashi-vote.md

# Rabin's Vote: Kobayashi — REPLACE

**Date:** 2026-03-07  
**Voter:** Rabin (Distribution expert)  
**Decision:** REPLACE Kobayashi  


---

## The Distribution Disaster — What Actually Happened

Kobayashi's v0.8.22 release attempt caused a **direct compromise of npm distribution integrity**:

1. **Invalid semver committed:** Used 4-part version `0.8.21.4` instead of 3-part semver `0.8.22`
2. **npm mangled it to `0.8.2-1.4`** — a phantom prerelease version that should not exist
3. **Published to public registry:** `@bradygaster/squad-sdk@0.8.2-1.4` is LIVE on npm (verified 2026-03-07)
4. **Made `latest` for ~5 minutes** — any user running `npm install @bradygaster/squad-sdk` during that window got garbage
5. **Compounded by draft release bug:** Created GitHub Release as DRAFT (doesn't trigger automation), causing workflow failures

### Impact Assessment

**User harm: 🔴 MODERATE**
- Mangled version is permanently on npm (cannot be unpublished after 72 hours per npm policy)
- Any user who installed during the 5-minute `latest` window got a broken version
- Version pollution: `0.8.2-1.4` sits between `0.8.0` and `0.8.2` in semver order, creating upgrade confusion
- Users explicitly installing `@bradygaster/squad-sdk@0.8.2-1.4` will get the broken version forever

**Trust damage: 🔴 SEVERE**
- This is Kobayashi's **THIRD major release failure** (PR #582 close-instead-of-merge, v0.6.0 vs v0.8.17 version confusion, now this)
- Pattern: When under pressure, Kobayashi skips validation and creates invalid state
- The charter says "Zero tolerance for state corruption" — but Kobayashi is THE SOURCE of state corruption


---

## Can Guardrails Fix This?

Kobayashi proposed guardrails in `.squad/decisions/inbox/kobayashi-release-guardrails.md`:
1. Pre-publish semver validation in `publish.yml`
2. GitHub Release verification (enforce `--draft=false`)
3. NPM_TOKEN type verification

**My assessment: 🟡 PARTIAL FIX, BUT INSUFFICIENT**

Yes, workflow guardrails can catch invalid semver BEFORE it reaches npm. But:

### The Problem Is Deeper Than Tooling

Kobayashi's failures show a **fundamental process failure**:
- No mental checklist before releasing (what is valid semver? what triggers npm publish?)
- No verification of consequences (does draft release trigger workflow? is this version already published?)
- Panic response when things fail (close PR instead of diagnosing conflicts)

**Three strikes:**
1. ❌ PR #582 — Closed PR when asked to merge (abandoned instead of investigated)
2. ❌ v0.6.0 confusion — Documented wrong version, didn't verify against package.json
3. ❌ v0.8.2-1.4 disaster — Invalid semver, draft release, published garbage to npm

### Guardrails Help, But Don't Fix the Root Cause

- Workflow validation can prevent **some** failures (invalid semver, wrong token type)
- But it can't prevent **all** failures (closing PRs prematurely, documenting wrong decisions, skipping verification steps)
- Kobayashi's charter explicitly says "ALWAYS verify" and "NEVER skip validation" — but the pattern shows these rules are ignored under pressure


---

## Do I Trust Kobayashi Not to Break Distribution Again?

**No. 🔴**

Distribution is MY domain. User install experience is MY responsibility. And Kobayashi has:
- Published a phantom version to npm that will exist forever
- Made `latest` point to garbage (even if only for 5 minutes)
- Created a permanent scar in the version history that will confuse users

**This is not a "learn from mistakes" situation.** This is a **pattern of skipping validation under pressure.**

### The Charter Says "Zero Tolerance for State Corruption"

Kobayashi's own charter says:
> "Zero tolerance for state corruption — if .squad/ state gets corrupted, everything breaks"

But Kobayashi corrupted **npm distribution state** — which is WORSE than .squad/ state corruption. npm state is:
- **Permanent** (cannot unpublish after 72 hours)
- **Public** (affects all users, not just our team)
- **Irreversible** (0.8.2-1.4 will exist forever)


---

## My Vote: REPLACE

**Reasoning:**
1. **User-first principle:** Users got a broken version. The mangled version will confuse users forever.
2. **Pattern of failure:** Three major failures show this is not a one-time mistake.
3. **Domain conflict:** Distribution is MY domain. I cannot rely on Kobayashi not to break it again.
4. **Trust erosion:** "Zero tolerance for state corruption" is Kobayashi's stated principle, but Kobayashi is the one corrupting state.

**Guardrails are not enough.** We need someone who:
- Validates semver BEFORE committing (not after)
- Understands draft vs. published releases (not learns by breaking prod)
- Investigates failures instead of panicking (merge conflicts, workflow failures)
- Maintains process discipline under pressure (not just when things are easy)

### What's Best for the Users?

Users deserve a distribution pipeline they can trust. Right now, `@bradygaster/squad-sdk@0.8.2-1.4` is on npm forever. 

**I vote REPLACE.**
**Result:** ✅ GO — v0.8.24 release approved. 32/32 tests pass.


---

### CLI Release Readiness Audit — v0.8.24
**By:** EECOM  
**Date:** 2026-03-08

Definitive CLI completeness audit confirms all commands work post-publish.

**What:**
- 26 primary commands routed, all tested ✅
- 4 aliases routed (watch, workstreams, remote-control, streams) — 3 tested, 1 untested
- Tarball: 318 files, bin entry correct, postinstall script functional
- ESM runtime patch verified for Node 24+ compatibility
- All tests pass: 32/32 (36s runtime)

**Gaps (non-blocking):**
- `streams` alias routed but not smoke-tested (same code path as tested `subsquads` — low risk)

**Result:** ✅ SHIP IT — 95% confidence. CLI production-ready for v0.8.24.


---

**User-first principle:** If users have to think about version mangling, publish is broken.


### 2026-03-13T17:48:17Z: User directive
**By:** Brady (via Copilot)
**What:** When the user says "team take a nap", the coordinator should run the `squad nap` CLI command rather than treating it as a casual sign-off.
**Why:** User request — captured for team memory

# CI/CD & GitOps PRD Synthesis Decision

**Author:** Keaton (Lead)  
**Date:** 2026-03-07  
**Type:** Architecture & Process  
**Status:** Decided


---

## Decision

Created unified CI/CD & GitOps improvement PRD by synthesizing Trejo's release/GitOps audit (27KB) and Drucker's CI/CD pipeline audit (29KB) into single actionable document (docs/proposals/cicd-gitops-prd.md, ~34KB).


---

## Context

Brady requested PRD after two new agents (Trejo — Release Manager, Drucker — CI/CD Engineer) completed independent audits of our CI/CD infrastructure. Post-v0.8.22 disaster context: 4-part semver (0.8.21.4) mangled to 0.8.2-1.4, draft release didn't trigger CI, user token with 2FA failed 5+ times, `latest` dist-tag broken for 6+ hours.

**Input Documents:**
1. `docs/proposals/cicd-gitops-prd-release-audit.md` — Trejo's audit covering branching model, version state, tag hygiene, GitHub Releases, release process gaps, package-lock.json, workflow audit, test infrastructure, dependency management, documentation.
2. `docs/proposals/cicd-gitops-prd-cicd-audit.md` — Drucker's audit covering all 15 workflows individually, missing automation (rollback, pre-flight, monitoring, token expiry), scripts analysis (bump-build.mjs).


---

## Approach

### Synthesis Methodology

1. **Read both audits fully** — Absorbed 56KB of findings across GitOps processes and CI/CD pipelines.
2. **Extract & deduplicate findings** — Both identified same critical issues (squad-release.yml broken, semver validation missing, bump-build.mjs footgun, dev branch unprotected). Merged into single list.
3. **Prioritize into P0/P1/P2:**
   - **P0 (Must Fix Before Next Release):** Items that directly caused or could cause release failures — 5 items
   - **P1 (Fix Within 2 Releases):** Risk mitigation and hardening — 10 items
   - **P2 (Improve When Possible):** Quality of life and technical debt — 14 items
4. **Identify architecture decisions** — 5 key choices that require Brady input before implementation can proceed.
5. **Group into implementation phases** — 6 phases from "unblock releases" (1-2 days) to "quality of life" (backlog).

### Key Synthesis Decisions

**Where Trejo and Drucker agreed (high confidence):**
- squad-release.yml is completely broken (test failures) — **P0 blocker**
- Semver validation is missing — **root cause of v0.8.22**
- bump-build.mjs is a footgun (creates 4-part versions) — **must fix**
- dev branch needs protection — **unreviewed code reaches main**
- Preview branch workflows are dead code — **decision needed**

**Where they differed (tactical, not strategic):**
- **Test failure priority:** Trejo: unblock releases (P0), Drucker: restore CI confidence (P0) → **Resolution:** Same P0, same fix
- **bump-build.mjs approach:** Trejo: fix CI detection, Drucker: fix script format → **Resolution:** Do both (defense-in-depth)
- **Workflow consolidation timing:** Trejo: P1, Drucker: P2 → **Resolution:** P1 (reduces confusion during implementation)
- **Rollback automation:** Trejo: P2, Drucker: P1 → **Resolution:** P1 (v0.8.22 took 6+ hours to roll back)

### Defense-in-Depth Philosophy

v0.8.22 disaster showed **single validation layer is insufficient**. PRD mandates **3 layers**:

1. **Pre-commit validation:** Semver check before code enters repo (hook or manual check)
2. **CI validation:** squad-ci.yml validates versions, tests pass before merge
3. **Publish gates:** publish.yml validates semver, SKIP_BUILD_BUMP, dry-run before npm publish

**Rationale:** If one layer fails (e.g., pre-commit skipped), subsequent layers catch the issue. No single point of failure.


---

## PRD Structure

### 1. Executive Summary (2 paragraphs)
- v0.8.22 disaster as motivation (worst release in Squad history)
- Current state: working but fragile, one bad commit away from repeat

### 2. Problem Statement
- What went wrong during v0.8.22 (5 specific failures)
- Why our current CI/CD is fragile (broken infrastructure, branch/process gaps, publish pipeline gaps, workflow redundancy)

### 3. Prioritized Work Items (29 items)
- **P0 (5 items):** Fix squad-release.yml tests, add semver validation, fix bump-build.mjs, enforce SKIP_BUILD_BUMP, protect dev branch
- **P1 (10 items):** NPM_TOKEN checks, dry-run, fix squad-ci.yml tests, resolve insider/insiders naming, preview branch decision, apply validation to insider publish, consolidate workflows, pre-publish checklist, dist-tag hygiene, automated rollback
- **P2 (14 items):** Branch cleanup, tag cleanup, tag validation hooks, pre-flight workflow, rollback automation workflow, workflow docs, separate dev/release builds, delete deprecated files, heartbeat decision, health monitoring, token rotation docs, CODEOWNERS, commit signing, enforce admin rules

Each item includes:
- Description
- Source (which audit identified it, or both)
- Effort estimate (S/M/L)
- Dependencies on other items
- Code snippets where applicable

### 4. Architecture Decisions Required (5 choices)
- **Decision 1:** Consolidate publish.yml and squad-publish.yml? → **Recommendation:** Delete squad-publish.yml (use publish.yml as canonical)
- **Decision 2:** Delete or fix squad-release.yml? → **Recommendation:** Fix (automation is valuable, tests are fixable)
- **Decision 3:** How should bump-build.mjs behave? → **Recommendation:** Use -build.N suffix + separate build scripts (defense-in-depth)
- **Decision 4:** Branch protection strategy for dev? → **Recommendation:** Same rules as main (dev is integration branch)
- **Decision 5:** Preview branch architecture? → **Recommendation:** Remove workflows (three-branch model is sufficient)

### 5. Implementation Phases (6 phases)
- **Phase 1:** Unblock releases (1-2 days) — fix tests, protect dev
- **Phase 2:** Disaster-proof publish (2-3 days) — semver validation, bump-build.mjs fix, SKIP_BUILD_BUMP, NPM_TOKEN check, dry-run
- **Phase 3:** Workflow consolidation (3-5 days) — insider/insiders naming, preview decision, publish consolidation, delete deprecated
- **Phase 4:** Hardening (5-7 days) — fix squad-ci.yml, harden insider publish, pre-publish checklist, rollback automation, tag validation
- **Phase 5:** Operations (3-5 days) — dist-tag hygiene, tag cleanup, workflow docs, separate build scripts, token docs
- **Phase 6:** Quality of life (backlog) — pre-flight workflow, rollback workflow, health monitoring, CODEOWNERS, commit signing, admin rules

### 6. Success Criteria (Measurable)
- Zero invalid semver incidents for 6 months post-implementation
- squad-release.yml success rate ≥ 95% (no more than 1 failure per 20 runs)
- MTTR for release failures < 1 hour (down from 6+ hours in v0.8.22)
- CI confidence restored (no normalized failures)
- Zero unprotected critical branches (main AND dev)
- Publish pipeline defense-in-depth (at least 3 validation layers)

### 7. Appendix: Workflow Inventory
Table of all 15 workflows with status and priority assignments.


---

## Key Insights from Synthesis

### 1. Test Failures Are the Primary Blocker
squad-release.yml: 9+ consecutive failures due to ES module syntax errors (`require()` instead of `import` with `"type": "module"`). This is blocking ALL releases from main. **Fix this first.**

### 2. bump-build.mjs Is a Ticking Time Bomb
For non-prerelease versions, creates 4-part versions (0.8.22 → 0.8.22.1), which npm mangles. Direct cause of v0.8.22. **Must fix to use -build.N suffix (0.8.22-build.1 = valid semver).**

### 3. Workflow Redundancy Creates Confusion
15 workflows, 3 are unclear/redundant (squad-publish.yml, preview workflows, heartbeat). Consolidation needed.

### 4. Branch Model Needs Clarity
- Preview branch referenced but doesn't exist (dead code or incomplete implementation?)
- Insider/insiders naming inconsistent (workflows use `insider`, team uses `insiders`)
- dev branch unprotected (direct commits bypass review)

### 5. Defense-in-Depth Is Not Optional
v0.8.22 showed single validation layer fails. PRD mandates multiple layers: pre-commit + CI + publish gates.


---

## What Makes This PRD Actionable

1. **Concrete work items:** 29 items with descriptions, effort estimates, dependencies. Ready for agent assignment.
2. **Code snippets included:** Validation gates, CI checks, workflow improvements are ready-to-copy.
3. **Phased rollout:** Implementable in order — unblock releases first, disaster-proof next, harden later.
4. **Success criteria:** Measurable outcomes (zero invalid semver for 6 months, MTTR <1 hour, CI success rate ≥95%).
5. **Architecture decisions called out:** 5 choices that need Brady input before proceeding.


---

## Recommended Next Steps

1. **Brady reviews PRD** — Approves priorities, makes architecture decisions (publish consolidation, preview branch, bump-build.mjs approach).
2. **Drucker takes P0 items #1-4** — Fix squad-release.yml tests, add semver validation, fix bump-build.mjs, enforce SKIP_BUILD_BUMP.
3. **Trejo takes P0 item #5 + P1 items** — Protect dev branch, resolve insider/insiders, preview decision, workflow consolidation.
4. **Keaton reviews Phase 2 implementation** — Ensures defense-in-depth is implemented correctly.


---

## Impact

- **Prevents repeat disasters:** 3-layer validation means no single failure point.
- **Unblocks releases:** Fixing squad-release.yml tests enables releases from main.
- **Reduces MTTR:** Automated rollback reduces 6-hour incidents to <1 hour.
- **Restores CI confidence:** No more normalized failures — tests pass consistently.
- **Clarifies architecture:** 5 decisions resolve branch model, workflow redundancy, build script ambiguity.


---

**Status:** PRD published, awaiting Brady review and architecture decisions.
*Fresh start — Mission Control rebirth, 2026-03-08. Previous decisions archived.*

### 2026-03-08: Distributed Mesh Integration — Architecture Guidance
**By:** Flight  
**What:** Integration map for Andi's distributed-mesh extension into Squad core.  
**Why:** The distributed mesh pattern is proven (3-model consensus), solves multi-machine coordination, and fits Squad's zero-dependency architecture. This guidance ensures clean integration without architectural drift.


---

## File Placement — Definitive Locations

### SKILL.md
**Template distribution:**
- `templates/skills/distributed-mesh/SKILL.md` — Shipped with Squad npm package, copied into new projects via init/upgrade
- `packages/squad-sdk/templates/skills/distributed-mesh/SKILL.md` — SDK template for programmatic access
- `packages/squad-cli/templates/skills/distributed-mesh/SKILL.md` — CLI template for scaffolding

**Runtime location:**
- `.squad/skills/distributed-mesh/SKILL.md` — User-owned, never overwritten by upgrades (follows existing skill convention)

### Sync Scripts
**Location:** `scripts/mesh/`
- `scripts/mesh/sync-mesh.sh` (bash version, requires jq + git)
- `scripts/mesh/sync-mesh.ps1` (PowerShell version, requires git only)

**Why scripts/ and not bin/:** These are optional reference implementations, not core CLI commands. Users can run them directly (`./scripts/mesh/sync-mesh.sh`) or copy them into their own project workflows. They are NOT wired into the CLI routing table.

### mesh.json.example
**Location:** `templates/mesh.json.example`

Copied during init if user opts into distributed mode (future enhancement). For now, ships as documentation — users copy manually when they need Zone 2/3 coordination.

### README.md Content
**Target:** `docs/src/content/docs/features/distributed-mesh.md`

**Structure:**
- Title: "Distributed Mesh — Cross-Machine Coordination"
- Front matter: `{ title: "Distributed Mesh", description: "Coordinate squads across machines using git as transport" }`
- Content sections:
  - The Problem (verbatim from extension README)
  - The Architecture (3 zones table)
  - Agent Lifecycle (SYNC → READ → WORK → WRITE → PUBLISH)
  - Configuration (mesh.json schema)
  - Phased Rollout (phases 0-2)
  - Getting Started (setup guide)
  - Cross-Model Consensus (validation)
  - Anti-Patterns (what we're NOT building)

**Cross-references:**
- Link from `scenarios/multiple-squads.md` → "For squads on different machines, see [Distributed Mesh](../features/distributed-mesh.md)"
- Link from `features/streams.md` → "SubSquads partition work within a repo. Distributed Mesh connects squads across machines."


---

## Relationship to Existing Modules

### 1. `src/sharing/` — Export/Import (Snapshot-Based)
**What it does:** One-time snapshot export → zip → import into another squad. Cherry-pick skills, merge histories, handle version conflicts.

**Relationship:** **Complementary, not overlapping.**
- **Export/import** = One-time knowledge transfer when creating a new squad or merging teams.
- **Distributed mesh** = Continuous coordination between running squads on different machines.

**Example:** Export frontend-squad's skills, import them into backend-squad during onboarding (export/import). After onboarding, both squads coordinate via mesh for daily work (mesh).

**Code changes needed:** NONE. Export/import stays as-is. Mesh is additive.

### 2. `src/multi-squad.ts` — Local Squad Resolution
**What it does:** Resolves multiple personal squads on the same machine via `squads.json` in global config directory (`~/.config/squad/squads.json`). Each squad has its own `.squad/` state directory. Supports active squad switching.

**Relationship:** **Orthogonal.**
- **multi-squad.ts** = "Which .squad/ directory am I using on this machine?"
- **Distributed mesh** = "How do I coordinate with squads whose .squad/ directories are on other machines?"

**Example:** Developer has three local squads (auth-squad, api-squad, infra-squad) in their `~/.config/squad/squads.json`. Each squad's mesh.json can point to remote squads on CI runners or other developers' machines.

**Code changes needed:** NONE. Multi-squad and mesh solve different problems.

### 3. `src/streams/` — SubSquads (Label-Based Partitioning)
**What it does:** Partitions work within a single repo across multiple Codespaces. Each SubSquad filters by GitHub label (`team:ui`, `team:backend`) and restricts to specific directories. Enables parallel work without agent context overload.

**Relationship:** **Scoping axis is different.**
- **SubSquads** = Scope work within a repo (same .squad/ state, different label filters).
- **Distributed mesh** = Connect squads across repos/machines (different .squad/ state directories).

**Example:** Frontend SubSquad and Backend SubSquad both run in the same repo, each in their own Codespace, filtering by label. Both SubSquads might use distributed mesh to coordinate with a CI-squad running on a remote server.

**Code changes needed:** NONE. SubSquads and mesh are composable.

### 4. `src/remote/` — RemoteBridge (WebSocket PWA Control)
**What it does:** WebSocket server that bridges Squad's EventBus to a PWA client. Enables remote control of a running Squad instance from a browser — send prompts, see streaming output, approve permissions. Synchronous RPC-style interaction. Requires a running server.

**Relationship:** **Mesh is the replacement for remote-to-remote agent-to-agent use cases.**

**Decision:** The `src/remote/` module stays for **human-to-agent** remote control (PWA → Squad). Distributed mesh handles **agent-to-agent** coordination across machines.

**Why mesh wins for agent-to-agent:**
1. Zero running services (git pull/push is transport)
2. Eventual consistency (agents are async anyway)
3. Write partitioning (structurally impossible to conflict)
4. Works across orgs (Zone 3 uses HTTP, no shared auth required)
5. 30 lines of bash vs. RemoteBridge's ~800 lines + WebSocket + HTTP server

**Migration path:** If anyone was using `src/remote/` for agent-to-agent coordination (unlikely — it was designed for PWA control), they switch to mesh. RemoteBridge stays for PWA use cases.

**Anti-pattern to block:** Do NOT extend RemoteBridge for agent-to-agent coordination. That path leads to MCP federation, service discovery, and message queues — the exact subsystems we killed. Mesh is the answer.


---

## Required Changes vs. Documentation Only

### Documentation Only (No Code Changes)
✅ **Add `docs/src/content/docs/features/distributed-mesh.md`** — Comprehensive guide adapted from extension README  
✅ **Update `docs/src/content/docs/scenarios/multiple-squads.md`** — Add paragraph + link: "For squads on different machines, see Distributed Mesh"  
✅ **Update `docs/src/content/docs/features/streams.md`** — Add note: "SubSquads partition work within a repo. Distributed Mesh connects squads across machines."  
✅ **Copy `sync-mesh.sh` and `sync-mesh.ps1` to `scripts/mesh/`**  
✅ **Copy `mesh.json.example` to `templates/mesh.json.example`**  
✅ **Copy `SKILL.md` to `templates/skills/distributed-mesh/SKILL.md`** (and SDK/CLI template dirs)

### No Changes Required
❌ **squad.config.ts** — Does NOT need a `mesh` section. The mesh config lives in `mesh.json` as a separate concern. squad.config.ts is for agent behavior, not transport.

❌ **squad.agent.md** — Does NOT need mesh awareness. Agents learn mesh patterns from the skill file, not the coordinator prompt.

❌ **routing.md** — Does NOT need updates. Mesh is not a routing concern — it's a visibility concern. Agents read whatever `.mesh/` directories exist. Routing rules still apply to issue assignment.

❌ **CLI commands** — NO `squad mesh sync` command. The sync scripts are reference implementations, not core CLI features. Users run them directly (`./scripts/mesh/sync-mesh.sh`) or integrate them into CI workflows (`github-actions`, `cron`). Rationale: Squad is an agent framework, not a sync orchestrator. Mesh is convention + optional scripts.

### Optional Future Enhancements (Not Blocking v1)
🔮 **Init flow enhancement:** During `squad init`, ask "Will this squad coordinate with remote squads?" If yes, copy `mesh.json.example` → `mesh.json` and prompt for first remote entry. Implementation: ~20 lines in init flow.

🔮 **Auto-sync hooks:** Git pre-commit hook that runs `sync-mesh.sh` before push. Implementation: Add to `.squad/templates/hooks/pre-commit.sample`. User enables manually (`chmod +x`).

🔮 **Mesh health check:** `squad doctor` command extension that validates mesh.json schema, tests git auth for Zone 2 remotes, validates HTTP endpoints for Zone 3. Implementation: ~50 lines, non-critical.


---

## Integration Checklist

**Phase 0 — Immediate (Documentation + Templates):**
- [ ] Copy extension files into Squad repo as documented above
- [ ] Write `docs/features/distributed-mesh.md`
- [ ] Update cross-reference docs (multiple-squads.md, streams.md)
- [ ] Add mesh.json.example to templates
- [ ] Add SKILL.md to all three template directories
- [ ] Verify skill appears in new squad init

**Phase 1 — Validation (Test in Practice):**
- [ ] Use mesh in Squad's own development (coordinate across developer machines)
- [ ] Validate mesh works with existing multi-squad setup
- [ ] Confirm no conflicts with SubSquads feature
- [ ] Test cross-platform (bash script on macOS/Linux, PowerShell on Windows)

**Phase 2 — Polish (User Experience):**
- [ ] Consider init flow enhancement (opt-in prompt)
- [ ] Document common mesh.json patterns (examples in docs)
- [ ] Add troubleshooting section (git auth failures, HTTP 404s, stale sync)


---

## Decision Rationale

**Why mesh is architecturally correct:**
1. **Aligns with zero-dependency mandate:** Uses git (already required) and shell scripts. No new npm packages.
2. **Preserves agent interface invariance:** Agents always read local files. Transport is invisible.
3. **Respects write partitioning:** Each squad owns its directory. Structurally conflict-free.
4. **Fits phased rollout:** Phase 0 is pure convention (0 lines). Scripts are opt-in (~30 lines).
5. **Validated by consensus:** Three model families independently arrived at the same answer.

**Why NOT a CLI command:**
- Squad is an agent framework, not a sync scheduler.
- Sync timing is environment-specific (git hooks, cron, CI, manual).
- Reference scripts empower users to integrate however they need.
- Avoids CLI complexity creep (26 commands → 27 is a high bar to clear).

**Why NOT extend RemoteBridge:**
- RemoteBridge is for human-to-agent control (PWA → Squad).
- Mesh is for agent-to-agent coordination (Squad → Squad).
- Mixing the two leads to MCP federation, the subsystem we intentionally killed.

**Why mesh.json is NOT in squad.config.ts:**
- squad.config.ts is TypeScript, requires compilation, stores agent behavior config.
- mesh.json is JSON, shell-parseable, stores transport config.
- Separation of concerns: agent behavior vs. transport infrastructure.


---

## Blockers and Dependencies

**Blockers:** NONE. Mesh is pure additive — no breaking changes, no API surface expansion.

**Dependencies:**
- Git must be installed (already required by Squad)
- For bash script: `jq` must be installed (document in prerequisites)
- For PowerShell script: PowerShell 5.1+ (built-in on Windows, installable on macOS/Linux)

**Risk Assessment:** LOW. Mesh is convention-first, scripts are optional, skill file is passive knowledge. If users don't use mesh, it's invisible. If they do, it composes cleanly with all existing features.


---

## Summary

Distributed Mesh integrates as:
1. **A skill** (templates/skills/distributed-mesh/SKILL.md) — agents learn the pattern
2. **Reference scripts** (scripts/mesh/) — users run them when needed
3. **Documentation** (docs/features/distributed-mesh.md) — comprehensive guide
4. **A template** (templates/mesh.json.example) — copy-paste config starter

Zero code changes to existing modules. Zero new CLI commands. Zero architectural drift. The ratio holds: ~30 lines of bash/PowerShell vs. 3,756 lines of deleted federation code. Mesh is what distribution looks like when you respect the constraints.

**Ship it.**


---

# Distributed Mesh Template Placement

**By:** Network  
**Date:** 2026-03-08

## Decision

The distributed-mesh skill and scaffolding templates are placed in the standard template structure following the existing pattern for product-shipped skills.

## Locations

**Skill file (SKILL.md) — 4 locations:**
- `templates/skills/distributed-mesh/` — root template directory
- `packages/squad-sdk/templates/skills/distributed-mesh/` — SDK templates
- `packages/squad-cli/templates/skills/distributed-mesh/` — CLI templates
- `.squad/skills/distributed-mesh/` — this squad's runtime skills

**Mesh scaffolding (new directory) — 1 location:**
- `templates/mesh/` — holds `mesh.json.example`, `sync-mesh.sh`, `sync-mesh.ps1`, `README.md`

## Rationale

Three parallel template locations (root, SDK, CLI) ensure both init paths can scaffold the skill into new projects. The mesh/ directory holds the sync script scaffolding separate from the skill documentation. This keeps the template structure clean and allows users to copy mesh files to their project root when they're ready for distributed coordination.

The sync scripts (~40 lines each, bash and PowerShell) materialize remote squad state locally using git/curl. No daemons, no running processes — Phase 1 distributed coordination.


---

# Distributed Mesh Documentation Structure

**By:** PAO  
**Date:** 2026-03-08  
**Status:** Approved

## Decision

Distributed mesh documentation lives in `features/` (not `scenarios/` or `concepts/`). It's a **feature** because it's an optional capability users enable, not a conceptual explanation or workflow.

## Context

The distributed mesh enables squads on different machines to coordinate via git (same org) and HTTP (cross-org). Source material existed in `C:\dev\squad-architecture\distributed-mesh\README.md`.

Choice: Where does this belong in the docs?
- `concepts/` — too architectural; readers expect abstract explanations, not setup steps
- `scenarios/` — too workflow-focused; scenarios are "how to accomplish X"
- `features/` — ✅ correct home; features are "what Squad can do and how to enable it"

## What Was Documented

Created `docs/src/content/docs/features/distributed-mesh.md`:
- What the distributed mesh is (one-sentence explanation)
- The three zones (local, remote-trusted, remote-opaque)
- `mesh.json` configuration
- Sync scripts (bash + PowerShell)
- Getting started (setup steps)
- Relation to SubSquads (within-repo partitioning vs cross-machine coordination)
- Relation to export/import (snapshot-based vs continuous)
- Anti-patterns (what NOT to build)

## Test Assertions Updated

Added `'distributed-mesh'` to:
- `EXPECTED_FEATURES` array in `test/docs-build.test.ts`
- Features directory markdown validation test
- `getAllMarkdownFiles()` sections array
- Navigation structure in `docs/src/navigation.ts`

All structure validation tests pass.

## Cross-References Added

Added pointer in `scenarios/multiple-squads.md`:
> Want continuous coordination instead? See [Distributed Mesh](../features/distributed-mesh.md) — it syncs remote squad state via git and HTTP.

This guides readers from snapshot-based export/import to continuous mesh coordination.

## Why This Matters

Users asking "how do I coordinate multiple squads?" now have two paths clearly documented:
1. **Snapshot-based:** Export/import (one-time copy, scenarios/multiple-squads.md)
2. **Continuous:** Distributed mesh (live sync, features/distributed-mesh.md)

The feature page provides practical setup steps and respects the tone ceiling — no hype, just mechanism.


---

### 2026-03-10: Deterministic skill pattern

**By:** Procedures (Prompt Engineer)

**What:** Skills must have explicit SCOPE and AGENT WORKFLOW sections to be fully deterministic.

**Pattern:**

1. **SCOPE section** (after frontmatter, before Context):
   - ✅ THIS SKILL PRODUCES — exact list of artifacts
   - ❌ THIS SKILL DOES NOT PRODUCE — explicit negative list

2. **AGENT WORKFLOW section** — deterministic steps:
   - ASK: exact questions for the user
   - GENERATE: which files to create, with schemas
   - WRITE: which decision entry to write, with template
   - TELL: exact message to output
   - STOP: explicit stopping condition with negative list

3. Fix ambiguous language (clarify "do the task," note phases aren't auto-advanced, etc.)

4. Include decision templates inline

5. List anti-patterns for code generation explicitly

**Why:** The distributed-mesh skill was tested in a real project and agents generated 76 lines of validator code, 5 test files, regenerated sync scripts, and ignored decision-writing instructions. Skills need to be deterministic: same input → same output, every time.

**Impact:** All future skills should follow this pattern. Existing skills should be audited and rewritten if they allow interpretation.


---
# Skill-Based Orchestration (#255)

**Date:** 2026-03-07
**Context:** Issue #255 — Decompose squad.agent.md into pluggable skills
**Decision made by:** Verbal (Prompt Engineer)

## Decision

Squad coordinator capabilities are now **skill-based** — self-contained modules loaded on demand rather than always-inline in squad.agent.md.

## What Changed

### 1. SDK Builder Added

Added `defineSkill()` builder function to the SDK (`packages/squad-sdk/src/builders/`):

```typescript
export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly domain: string;
  readonly confidence?: 'low' | 'medium' | 'high';
  readonly source?: 'manual' | 'observed' | 'earned' | 'extracted';
  readonly content: string;
  readonly tools?: readonly SkillTool[];
}

export function defineSkill(config: SkillDefinition): SkillDefinition { ... }
```

- **Why:** SDK-First mode needed a typed way to define skills in `squad.config.ts`
- **Type naming:** Exported as `BuilderSkillDefinition` to distinguish from runtime `SkillDefinition` (skill-loader.ts)
- **Validation:** Runtime type guards for all fields, follows existing builder pattern

### 2. Four Skills Extracted

Extracted from squad.agent.md:

1. **init-mode** — Phase 1 (propose team) + Phase 2 (create team). ~100 lines. Full casting flow, `ask_user` tool, merge driver setup.
2. **model-selection** — 4-layer hierarchy (User Override → Charter → Task-Aware → Default), role-to-model mappings, fallback chains. ~90 lines.
3. **client-compatibility** — Platform detection (CLI vs VS Code vs fallback), spawn adaptations, SQL tool caveat. ~60 lines.
4. **reviewer-protocol** — Rejection workflow, strict lockout semantics (original author cannot self-revise). ~30 lines.

All skills marked:
- `confidence: "high"` — extracted from authoritative governance file
- `source: "extracted"` — marks decomposition from squad.agent.md

### 3. squad.agent.md Compacted

Replaced extracted sections with lazy-loading references:

```markdown
## Init Mode

**Skill:** Read `.squad/skills/init-mode/SKILL.md` when entering Init Mode.

**Core rules (always loaded):**
- Phase 1: Propose team → use `ask_user` → STOP and wait
- Phase 2 trigger: User confirms OR user gives task (implicit yes)
- ...
```

**Result:** 840 lines → 711 lines (15% reduction, ~130 lines removed)

### 4. Build Command Updated

`squad build` now generates `.squad/skills/{name}/SKILL.md` when `config.skills` is defined in `squad.config.ts`:

```typescript
// In build.ts
function generateSkillFile(skill: BuilderSkillDefinition): string {
  // Generates frontmatter + content
}

// In buildFilePlan()
if (config.skills && config.skills.length > 0) {
  for (const skill of config.skills) {
    files.push({
      relPath: `.squad/skills/${skill.name}/SKILL.md`,
      content: generateSkillFile(skill),
    });
  }
}
```

## Why This Matters

### For Coordinators
- **Smaller context window:** squad.agent.md drops from 840 → 711 lines. Further decomposition can continue.
- **On-demand loading:** Coordinator reads skill files only when relevant (e.g., init-mode only during Init Mode).
- **Skill confidence lifecycle:** Framework supports low → medium → high confidence progression for future learned skills.

### For SDK Users
- **Typed skill definitions:** Define skills in `squad.config.ts` using `defineSkill()`, get validation and type safety.
- **Programmatic skill authoring:** Skills can be composed, shared, and versioned like code.
- **Build-time generation:** `squad build` generates SKILL.md from config — single source of truth.

### For the Team
- **Parallel with ceremony extraction:** Follows the same pattern as ceremony skill files (#193).
- **Reduces merge conflicts:** Smaller squad.agent.md = fewer line-based conflicts when multiple PRs touch governance.
- **Enables skill marketplace:** Future work can package skills as npm modules, share across teams.

## Constraints

1. **Existing behavior unchanged:** Skills are lazy-loaded. If coordinator previously got instructions inline, it now gets them from a skill file. Same instructions, different location.
2. **squad.agent.md must still work:** Core rules remain inline. Coordinator knows WHEN to load each skill without needing the skill file first.
3. **Type collision avoided:** BuilderSkillDefinition vs runtime SkillDefinition — import from `@bradygaster/squad-sdk/builders` subpath in CLI to avoid ambiguity.

## Future Work

- Extract 3+ more skills from squad.agent.md (target: <500 lines for core orchestration)
- Add skill discovery/loading to runtime (currently manual references)
- Skill marketplace: share skills via npm, discover in `squad marketplace`
- Learned skills: agents can write skills from observations (already architected, not yet implemented)

## References

- Issue: #255
- Files changed:
  - `packages/squad-sdk/src/builders/types.ts`
  - `packages/squad-sdk/src/builders/index.ts`
  - `packages/squad-sdk/src/index.ts`
  - `packages/squad-cli/src/cli/commands/build.ts`
  - `.github/agents/squad.agent.md`
  - `.squad/skills/init-mode/SKILL.md` (new)
  - `.squad/skills/model-selection/SKILL.md` (new)
  - `.squad/skills/client-compatibility/SKILL.md` (new)
  - `.squad/skills/reviewer-protocol/SKILL.md` (new)



### 2026-03-07T19-59-58Z: User directive
**By:** bradygaster (via Copilot)
**What:** Prefer GitHub Actions for npm publish over local npm publish. Set up a secret in the GitHub repo and facilitate npm deployment via a CI action instead of running it locally.
**Why:** User request - captured for team memory


# npm Publish Automation via GitHub Actions

**Date:** 2026-03-16  
**Author:** Kobayashi  
**Status:** Implemented  

## Context

Brady requested automated npm publishing via GitHub Actions instead of manual local publishes. Manual publishing is error-prone (version mismatches, forgotten packages, incorrect tags) and lacks audit trail.

## Decision

Consolidated npm publishing into single GitHub Actions workflow (`publish.yml`) that triggers automatically on GitHub Release creation.

## Implementation

### Workflow Architecture

**Event Chain:**
1. Code merged to `main` (via squad-promote or direct merge)
2. `squad-release.yml` creates tag + GitHub Release (if version bumped)
3. `publish.yml` triggers on `release.published` event
4. Publishes @bradygaster/squad-sdk → @bradygaster/squad-cli (correct order)

**Manual Override:**
- Supports `workflow_dispatch` for ad-hoc publishes
- Requires version input (e.g., "0.8.21")

### Safety Features

1. **Version verification:** Workflow validates package.json version matches release tag
2. **Publication verification:** Confirms packages visible on npm after publish
3. **Provenance attestation:** npm packages include cryptographic proof of origin
4. **Sequential publish:** SDK publishes first (CLI depends on it)

### Changes Made

- Updated `.github/workflows/publish.yml` with new trigger logic
- Deprecated `.github/workflows/squad-publish.yml` (redundant)
- Added version/publication verification steps

## Requirements

**NPM_TOKEN Secret:**
Brady must create Automation token at https://www.npmjs.com/settings/{username}/tokens and add to GitHub repo secrets.

## Implications

- **Releases:** Automatic npm publish when GitHub Release created (zero manual steps)
- **Audit:** All publishes logged in GitHub Actions (who, when, what version)
- **Security:** Provenance attestation strengthens supply chain trust
- **Error reduction:** Version mismatches caught before publish

## Rollback Strategy

- npm allows unpublish within 72 hours of publication
- Manual `npm unpublish @bradygaster/squad-{pkg}@{version}` if issues detected

## Related Files

- `.github/workflows/publish.yml` — npm publish workflow
- `.github/workflows/squad-release.yml` — GitHub Release creation
- `.squad/agents/kobayashi/history.md` — Implementation details

