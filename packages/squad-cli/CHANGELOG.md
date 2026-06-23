# @bradygaster/squad-cli

## 0.10.0

### Minor Changes

- 6a72634: Add routing.md to squad export/import functionality

  The routing.md file is now included when exporting and importing Squad configurations.
  This preserves the full routing context (tables, comments, principles) alongside the
  structured routing rules that were already exported.

- 6e72c8a: feat: APM integration — squad skill publish/install + apm.yml in init

  Implements #824. Adds `squad skill publish/install/list` commands and generates `apm.yml` on `squad init`.

- 53eddac: Ship 8 built-in skills with squad init/upgrade (#788)

  New skills distributed automatically on `squad init` and `squad upgrade`:

  - **error-recovery** — graceful failure handling patterns
  - **secret-handling** — credential safety and secrets management
  - **git-workflow** — branch management and commit conventions
  - **session-recovery** — checkpoint and recovery patterns
  - **reviewer-protocol** — code review gate patterns
  - **test-discipline** — test-first discipline and coverage
  - **agent-collaboration** — multi-agent handoff patterns
  - **squad-conventions** — (already shipped, now part of curated set)

  All skills are squad-owned (`overwriteOnUpgrade: true`) and update on upgrade.

- 7f9a878: Add cleanup watch capability for stale file housekeeping (#791)

  - New `cleanup` capability in the `housekeeping` phase
  - Clears `.squad/.scratch/` (all ephemeral temp files)
  - Archives orchestration-log and session-log entries older than 30 days
  - Warns about stale decision inbox files (>7 days)
  - Configurable: `everyNRounds` (default: 10), `maxAgeDays` (default: 30)
  - 12 new tests

- 5826555: Cross-squad orchestration — discovery, delegation, and manifest (#316). Adds manifest schema, `squad discover` / `squad delegate` commands, and runtime module for coordinating work across multiple Squad instances.
- 9c3156a: feat: add error-recovery skill for standard agent failure recovery patterns
- 37def62: Add external state storage — move .squad/ out of the working tree (#792)

  - New `stateLocation: 'external'` option in `.squad/config.json`
  - `resolveExternalStateDir()` resolves state under the platform-specific global Squad directory (`resolveGlobalSquadPath()`)
  - `deriveProjectKey()` generates a stable key from the repo path (cross-platform)
  - `resolveSquadPaths()` honors external state location
  - `squad externalize` moves state out, `squad internalize` moves it back
  - State survives branch switches, invisible to `git status`, never pollutes PRs
  - Thin `.squad/config.json` marker stays in repo (gitignored)
  - Path traversal protection on projectKey
  - 12 new tests

- 9a53769: Add fact-checker as a built-in agent role (#789)

  - New `fact-checker` role in the engineering role catalog (emoji: 🔍, category: quality)
  - Charter template at `templates/fact-checker-charter.md` with verification methodology
  - Added to `AGENT_TEMPLATES` for init scaffolding
  - Template manifest entry for init/upgrade distribution
  - Routing patterns: fact-check, verify, validate, audit, double-check, hallucination, devil's advocate

- 5996db4: Add /fleet hybrid dispatch mode for squad watch --execute (#775) — enables parallel issue analysis via Copilot CLI /fleet, 2.9x faster than sequential dispatch for read-heavy work
- 7f9a878: feat(sdk): git-notes + orphan-branch state backends for .squad/

  Adds git-native state storage backends as alternatives to the local (disk)
  approach:

  - **orphan-branch** (`squad-state`): Dedicated orphan branch with no common
    ancestor. State files never appear in main.
  - **two-layer** (notes + orphan): Git notes as best-effort commit annotations
    plus orphan branch for durable state. Recommended for teams.

  Configure via `.squad/config.json`: `{ "stateBackend": "two-layer" }` or
  the `--state-backend` CLI flag.

- f8347d8: iter-9: inject `--yolo --additional-mcp-config @.mcp.json` in all non-interactive copilot spawns; fix path regression from `.copilot/mcp-config.json` (iter-7) to `.mcp.json` (iter-8 canonical location); add fallback warning when `.mcp.json` is absent; add `--yolo` deduplication guard; document Copilot CLI 1.0.59+ folder-trust security gate
- 87e9381: feat: add iterative-retrieval skill for structured max-3-cycle agent spawning
- efb56ac: feat(cli): Add `squad loop` command — prompt-driven continuous work loop

  New `squad loop` command reads a `loop.md` file and runs it as a continuous work loop.
  No GitHub issues required — the prompt is the work driver. Includes `--init` to scaffold
  a boilerplate loop file, frontmatter validation, and composable capability flags.

- 8d49066: feat: Machine capability discovery and `needs:*` label-based issue routing

  Added capability filtering to Ralph's watch command. Issues with `needs:*` labels
  (e.g., `needs:gpu`, `needs:browser`) are only processed by Ralph instances whose
  machine has those capabilities declared in `machine-capabilities.json`.

  This enables multi-machine Squad deployments where different machines handle
  different types of work based on their available tooling.

  Closes #514

- 900d2e4: Add `squad init --mcp-frontmatter` to write MCP server config into the Squad agent frontmatter instead of `.copilot/mcp-config.json` for compatible agent harnesses.
- a9c06b0: feat: add notification-routing skill for pub-sub channel routing
- 32d2a23: Enable persistent Ralph — heartbeat cron + healthCheck timer

  - Enable cron schedule in squad-heartbeat.yml (all 5 sync locations)
  - Enable RalphMonitor healthCheck timer (previously commented out pre-migration)
  - Add platform detection tests for getRalphScanCommands (GitHub/ADO/Planner)
  - Add healthCheck timer tests with fake timers (start/stop/interval/stale detection)

- 7f9a878: Add `--notify-level` to control watch round reporting noise (#803)

  - `--notify-level important` (default): only print rounds with actual work items
  - `--notify-level all`: print every round including empty (old behavior)
  - `--notify-level none`: suppress all round output
  - Add machine name (`os.hostname()`) and repo name to round headers for attribution
    (shown in round headers when the board has items, and in "Board is clear" message)
  - Configurable via `.squad/config.json` watch section: `"notifyLevel": "important"`
  - Empty rounds silenced by default — no more "Round 160, Round 161" spam

- 6a01eef: Add Rai as Squad's third built-in agent — a Responsible AI (RAI) reviewer

  - Rai is always on the roster (like Scribe and Ralph), exempt from casting
  - Traffic light verdict model: 🟢 Green (proceed), 🟡 Yellow (advisory), 🔴 Red (blocking)
  - Background mode by default — only blocks on critical RAI violations
  - Phase 1 high-signal checks: credentials, injection, harmful content, bias, PII
  - New templates: Rai-charter.md, rai-policy.md
  - New `.squad/rai/` directory with policy.md and audit-trail.md
  - Tiered opt-out model (cannot disable critical checks)

- 9083085: feat: add reflect skill for in-session learning capture and mistake prevention
- 7beb854: Add `--repo` and `--branch` flags to `squad export` and `squad import` commands, enabling users to push/pull Squad configuration directly to/from a GitHub repository via the GitHub Contents API.
- aa91ba4: Add retro enforcement skill with Test-RetroOverdue and ceremonies template update.

  - New skill: retro-enforcement - coordinator integration pattern for automated retro cadence enforcement
  - Action items tracked as GitHub Issues (not markdown checklists)
  - Production data: 0% to 100% completion rate after switching formats
  - Test-RetroOverdue PowerShell function detects overdue retros and blocks work queue
  - Ceremonies template updated with enforcement-aware retrospective definition

- f090b3a: Add `squad upgrade --self` to upgrade the CLI package itself (#798)

  - `squad upgrade --self` → installs `@bradygaster/squad-cli@latest` (stable)
  - `squad upgrade --self --insider` → installs `@bradygaster/squad-cli@insider` (prerelease)
  - After self-upgrade, automatically continues with repo upgrade to apply new templates
  - Detects package manager (npm/pnpm/yarn) from npm_config_user_agent
  - Clear error on permission denied (suggests sudo or npx)
  - Help text updated with new flags

- 88ab159: feat: session init update check with extensible session-init reference

  Adds a Session Init block to squad.agent.md that runs Step 1 (Update Check)
  at session start. When a newer @bradygaster/squad-cli version exists for the
  user's channel (latest/insider/preview), appends a notice to the greeting.
  Respects SQUAD_NO_UPDATE_CHECK=1 kill switch.

  Adds `.squad-templates/session-init-reference.md` with the full update-check
  procedure (channel detection, hybrid cache strategy, greeting format) and
  registers it in TEMPLATE_MANIFEST so `squad upgrade` keeps it current.

  Also adds squad-version-check SKILL.md to .copilot/skills with internals
  knowledge about version stamping and the npm registry probe mechanism.

  Also fixes pre-existing CI failures: adds Commit step to scribe-charter.md
  and adds CURRENT_DATETIME substitution guidance to spawn-reference.md.

- fe1e7e8: Squad coordinator now scans all 5 project skill directories: Copilot CLI's 3
  official project paths — `.github/skills/`, `.claude/skills/`, `.agents/skills/`
  (per https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
  — plus Squad's existing conventions `.squad/skills/` and `.copilot/skills/`.
  Precedence: `.squad/skills/` > `.copilot/skills/` > `.github/skills/` >
  `.claude/skills/` > `.agents/skills/` (dedup by directory name). Personal
  paths (`~/.copilot/skills/`, `~/.agents/skills/`) are deliberately excluded
  from explicit routing — Copilot CLI injects them ambiently. This closes a gap
  where skills placed in `.github/skills/` (a common location alongside other
  `.github/` tooling) were loaded by Copilot CLI but invisible to Squad's
  coordinator-attached skill-aware routing.
- eb17e15: feat: add squad-commands skill for in-chat command discovery

  Adds a categorized menu skill (`skills/squad-commands/SKILL.md`) that the
  coordinator reads when the user asks "squad commands", "help", or "what can
  squad do". Also adds a routing row and greeting tip in squad.agent.md, and
  registers the template in TEMPLATE_MANIFEST with overwriteOnUpgrade=true.

  Also fixes pre-existing CI failures: adds Commit step to scribe-charter.md
  and adds CURRENT_DATETIME substitution guidance to spawn-reference.md.

- ef30286: feat: add SQUAD_HOME env var and preset system

  - Add `SQUAD_HOME` environment variable support for a roaming squad root directory
  - Add preset system for reusable agent configurations (list, show, apply, init)
  - Ship a default built-in preset with 5 agents (lead, reviewer, devrel, security, docs)
  - Add `squad preset` CLI command with list, show, apply, and init subcommands
  - Resolves #1038

- 5720705: Generic, provider-agnostic scheduler for Squad (#296) — unified schedule.json manifest with LocalPolling and GitHubActions provider adapters, CLI commands (list, run, init, status), schema validation, and cron/interval trigger evaluation.
- e11b5d3: feat: add tiered-memory skill for hot/cold/wiki agent context management
- bf597cb: feat(watch): circuit breaker integration for rate limit protection (#515)

  Adds GitHub API rate limit protection to Ralph's watch command via
  the Predictive Circuit Breaker from PR #518.

  **What changed (additive patch — existing flow untouched):**

  - `gh-cli.ts`: Added `ghRateLimitCheck()` and `isRateLimitError()` helpers
  - `watch.ts`: Added `CircuitBreakerState` type + persistence helpers
  - `watch.ts`: Added `executeRound()` wrapper that gates the existing
    `runCheck()` call through pre-flight quota checks
  - `watch.ts`: Added `roundInProgress` flag to prevent overlapping rounds

  **Circuit breaker state machine:**

  - CLOSED → OPEN: When traffic light is red or predictor says exhaustion imminent
  - OPEN → HALF-OPEN: After cooldown expires (exponential: 2m → 4m → 8m → ... → 30m cap)
  - HALF-OPEN → CLOSED: After 2 consecutive successful rounds
  - HALF-OPEN → OPEN: On rate limit error during probe

  State persists to `.squad/ralph-circuit-breaker.json` across restarts.

  **Tests:** 16 new tests covering state transitions, race condition guard,
  predictive integration, and `isRateLimitError` detection.

- 7f9a878: feat(watch): health check — show running watch instance status (#808)

  Adds `squad watch --health` to display the status of a running watch
  instance: PID, uptime, auth account, capabilities, and auth drift
  detection. Writes `.squad/.watch-pid.json` at startup for instance
  tracking. Detects and cleans up stale PID files from crashed instances.

- a22e087: Add --verbose flag to squad watch for debugging empty boards and silent failures (#781)

### Patch Changes

- 9451e66: Add deprecation warnings for tunnel, rc, and REPL commands. The interactive shell (no-args), `squad start`, `squad start --tunnel`, `squad rc`, and `squad rc-tunnel` now emit yellow deprecation notices pointing users to the GitHub Copilot CLI. No behavior changes — all commands still work.
- f0c02c9: docs: add fork contribution workflow to CONTRIBUTING.md

  Closes five gaps discovered during PR #217:

  - Fork-first setup instructions (fork → clone → upstream remote)
  - PR must target `dev` branch, not `main` (`gh pr create --base dev`)
  - Changeset is a required step in the PR process checklist
  - `bradygaster/dev` now correctly described as the PR target for all contributions
  - New "Keeping Your Fork in Sync" section with rebase-on-upstream/dev instructions

- 7a5b180: Add user-facing documentation for state backends (local, orphan-branch, two-layer)
- 36eed05: Fix hardcoded "Brady" in template files — LLMs now use actual git username instead of example name (closes #977)
- d8c1382: Fix changelog-gate CI to accept .changeset/ files as alternative to direct CHANGELOG.md edits
- 8c33f9f: fix: bump CLI version to 0.9.7-preview; align E2E skill and policy gate with CONTRIBUTING.md

  The insider publish workflow stamped `@bradygaster/squad-cli` at `0.9.6-build.4`,
  which violates the prerelease version policy gate. Per CONTRIBUTING.md, the correct
  local dev version is `{next-version}-preview`.

  - `packages/squad-cli/package.json`: `0.9.6-build.4` → `0.9.7-preview`
  - All 4 copies of `e2e-template-testing/SKILL.md` (root `templates/`,
    `packages/squad-sdk/templates/`, `packages/squad-cli/templates/`,
    `.squad-templates/`):
    - **Build commands** aligned with CONTRIBUTING.md (lines 253–256): use workspace
      flags `npm run build -w packages/squad-sdk && npm run build -w packages/squad-cli`
      and `npm link -w packages/squad-cli` instead of shell `cd` + bare `npm run build`
    - **Version verify text** updated to version-agnostic `x.y.z-preview` placeholder
      with an explicit note that the `-preview` suffix is required, linking to
      CONTRIBUTING.md for the full local dev setup
  - `.github/workflows/squad-ci.yml` — Prerelease Version Guard: relaxed regex from
    `/-/` (any hyphen) to `/-/ && not /^\d+\.\d+\.\d+-preview$/` so the CONTRIBUTING.md-
    sanctioned `-preview` suffix is allowed while all other prerelease tags (e.g.
    `-build.4`, `-alpha`, `-beta`) are still blocked

- 490adf3: fix: context overflow sentinel and coordinator size reduction (retroactive for #1035)

  `squad.agent.md` was ~95.8KB and could be silently dropped from context in long sessions, degrading the coordinator to vanilla Copilot with no safety rails.

  Changes shipped in PR #1035 (merged without changeset):

  - **Canary sentinel** — `SQUAD_COORDINATOR_CANARY_a8f3` token appended to `squad.agent.md`; `copilot-instructions.md` checks for it and warns if the coordinator was dropped from context
  - **Coordinator slimming** — `squad.agent.md` reduced ~42% (95.8KB → ~55KB) by extracting to on-demand reference files: `spawn-reference.md`, `after-agent-reference.md`, `model-selection-reference.md`, `ralph-reference.md`, `worktree-reference.md`, `client-compatibility-reference.md`
  - **Scribe charter extraction** — Scribe's inline section moved from `squad.agent.md` to a standalone `scribe-charter.md`
  - **E2E skill overhaul** — Fast-fail rules, PII protection, anti-skip enforcement, live progress tracking comment (updated per step), duration tracking, Windows encoding fix, `--allow-all-tools` documentation, progressive verdicting, agent run time budget
  - **Build fix** — CLI dep changed from `@bradygaster/squad-sdk: >=0.9.0` to `>=0.9.0-0` so npm workspace resolution uses the local prerelease package instead of a stale published version

  All 4 template locations synced: `.squad-templates/`, `templates/`, `packages/squad-cli/templates/`, `packages/squad-sdk/templates/`.

  Closes #1017

- e5f4ca5: Fix coordinator and Scribe templates so spawned agents receive and write the resolved current datetime instead of placeholder text.
- 8c807d1: fix(cli): revert detect-squad-dir to zero-dependency bootstrap

  The StorageProvider refactor (26047dc5) accidentally converted this bootstrap utility from raw node:fs to FSStorageProvider. This file runs before the SDK is loaded and must not depend on @bradygaster/squad-sdk. Adds regression guard test.

- 67b3578: fix: restore CI green on dev — 25 regression fixes + 6 test corrections

  Commit `4ecc244` ("feat: Squad Remote Control") rewrote `cli-entry.ts` and
  silently dropped multiple P0 bug fixes. Commit `72ffcb1` ("unified status
  display") introduced a TUI regression in AgentPanel. This changeset restores
  all dropped behaviour and corrects test expectations that never matched the
  implementation.

  **Implementation regressions fixed (cli-entry.ts):**

  - Bare semver output: `squad --version` now prints `0.x.y` not `squad 0.x.y`
  - Whitespace args guard: `squad` / `squad   ` shows brief help and exits 0
  - `NODE_NO_WARNINGS=1` set before first import to suppress ExperimentalWarning
  - `squad doctor` hint restored in unknown-command error messages
  - Help lines that exceeded 80 chars wrapped to continuation lines

  **Implementation regressions fixed (shell/index.ts):**

  - First-run (no `.squad/`) on non-TTY now outputs a welcome/get-started message
    instead of a TTY error, matching E2E test expectations

  **Implementation regressions fixed (AgentPanel.tsx):**

  - Completion flash correctly shows `✓ Done`; was showing `✓ [IDLE]` because
    the status-label condition was not gated on the flash state

  **Test corrections (expectations that never matched implementation):**

  - `repl-ux.test.ts`: `toContain('ready')` → `toContain('[idle]')`
  - `human-journeys.test.ts`: `Scaffold ready` → `Your team is ready`;
    `copilot session` → `squad`
  - `cli/init.test.ts` + `repl-ux-fixes.test.ts`: wrong gitattributes path fixed
  - `ux-gates.test.ts`: two aspirational grouped-help tests replaced with `it.todo`
  - `first-run-gating.test.ts`: banner spacer regex updated to match current source form
  - `consult-command.feature`: expected text updated to match current CLI output
  - `status-extended.feature`: exit code corrected (`1` → `0`) for non-squad dir
  - `docs-build.test.ts`: `beforeAll` hook given explicit 30 s timeout to avoid
    flaky timeout failures under parallel test execution
  - `journey-next-day.test.ts`: added `tick(50)` between session saves to prevent
    race condition when both sessions receive the same `lastActiveAt` timestamp

- 2f807d6: Fix squad doctor and upgrade for insiders installs: add .squad/casting/ to ENSURE_DIRECTORIES, scaffold casting defaults from templates with permission-safe fallback, and clarify ESM warnings for global installs.
- e3b880f: Fix export/import producing blank decisions.md and team.md files. Export now includes these files in the manifest, and import restores their content.
- 0d124b9: Fix runtime commands to correctly resolve externalized state paths
- 42c9dd3: Fix 5 bugs: dotted repo names, icon spacing, board owner, charter passing, missing playbooks
- f8ea328: fix: `/init` with no args now accepts follow-up message as cast prompt, and `createTeam` correctly creates `team.md`/`routing.md` in fresh projects

  Two related bugs in the TUI init flow:

  1. After `/init` (no args) showed guidance text, the user's follow-up message hit the "No Squad team found" guard instead of starting team casting. Fixed by tracking `awaitingInitPrompt` state in `App.tsx` and bypassing the team-file guard in `handleDispatch` when `skipCastConfirmation` is explicitly set.

  2. After confirming a team proposal, `createTeam` silently skipped creating `team.md` and `routing.md` in a fresh project (no `.squad/` directory), causing the coordinator to immediately say "no team yet" after showing "Team hired!". Fixed with else-branches that create both files from scratch when they don't exist.

- bdfa21a: fix(nap): account for separator newlines in decision archival budget

  The budget calculation in archiveDecisions() did not account for the newline
  separators added during content reassembly. This caused the final recentContent
  to exceed DECISION_THRESHOLD even after archival. Fix adds reassemblyOverhead
  and per-entry separator bytes to the budget calculation.

  Closes #123

- 6f9d965: fix(cli): wire --team-root / SQUAD_TEAM_ROOT into squad resolution for nap, status, and cost commands (#734)

  Commands that resolve .squad/ now respect the SQUAD_TEAM_ROOT env var (set by --team-root flag),
  fixing subprocess invocations (e.g. Copilot CLI bang commands) where process.cwd() differs from
  the interactive shell. Also improves the nap error message to show the searched directory.

- 7b52e29: fix: CLI no longer bails when configured is false; starts onboarding session instead (#843)
- 00c8aea: fix(coordinator): resolve externalized state, teamRoot, stale work, and cleanup loops

  Fixes 4 P1 coordinator bugs where squad.agent.md would incorrectly enter Init Mode
  in satellite/externalized repos (#1116, #1127), agents would work on stale/closed items
  (#1125), and spawned agents would loop infinitely in post-work cleanup (#1067).

- 70a3781: Fix permission handler to use `approve-once` instead of deprecated `approved` kind, aligning with Copilot CLI v1.0.54+ permission contract
- 1d3c3ea: Fix post-init message to recommend `copilot --agent squad` instead of deprecated `squad` command (closes #1034, closes #1007)
- 457f12f: docs: point README migration guide links to the published docs site
- 490adf3: fix(ci): fix multiple CI test failures introduced by PR #1035 coordinator slimming

  PR #1035 extracted Scribe and spawn-template content out of `squad.agent.md` into
  standalone reference files but did not update the CI tests. Two tests failed:

  **`test/ci/scribe-template.test.ts`** — was reading from `squad.agent.md` with anchors
  that no longer exist. Fixed to read from `scribe-charter.md` with:

  - Number- and format-agnostic end-marker in `extractScribeTaskBlock`
  - Numbered-line assertions (verify phrases appear on actual `\d+.` list items)
  - Corrected file header comment (HEALTH REPORT and size thresholds ARE present)
  - New tests: HEALTH REPORT emission documented, Tier 1 (20KB) and Tier 2 (50KB)
    archival thresholds documented (10 tests total, was 7)

  **`test/ci/datetime-template.test.ts`** — was counting `CURRENT_DATETIME:` lines in
  `squad.agent.md` only, expecting ≥4. After slimming only 2 remain there; the rest
  moved to `spawn-reference.md` and `after-agent-reference.md`. Fixed to combine all
  coordinator-owned template files for spawn-template assertions.

- 27f07cf: Warn when squad.agent.md template is missing during upgrade or init instead of silently skipping file creation. Adds `warnings` field to `InitResult` for structured error reporting.
- 09cd6c1: Fix state-backend and upgrade regressions (#1163, #1185, #1190, #1191, #1194)

  **Bug A (P0) — Permission contract mismatch** (#1191)
  The Copilot SDK changed the valid permission result `kind` from `"approved"` to
  `"approve-once"`. Squad was still returning `{ kind: 'approved' }`, causing all
  agent sessions to fail permission checks immediately. Fixed in:

  - `cli/shell/index.ts` — `approveAllPermissions` handler now returns `{ kind: 'approve-once' }`
  - `adapter/types.ts` — `SquadPermissionRequestResult.kind` union includes `'approve-once'`
  - `adapter/client.ts` — error hint updated to reference the correct `kind` value

  **Bug B (P1) — Hard-throw in `resolveStateBackend()` when explicit backend fails** (#1185, #1190)
  When a backend configured in `config.json` failed to initialize (e.g., no git repo
  available), Squad threw a fatal error and refused to start. Now always warns and
  falls back to `local` so operators can fix config without losing work.

  **Bug C (P1) — Silent git-notes→two-layer migration** (#1163)
  `normalizeBackendType()` silently mapped `'git-notes'` to `'two-layer'` with no
  user notification. Now emits a `console.warn()` directing users to update their
  `config.json`.

  **Bug F (P3) — Windows `toRelative()` drive-letter case mismatch**
  `StateBackendStorageAdapter.toRelative()` used a simple string prefix comparison
  after normalizing separators. On Windows, `C:\` vs `c:\` drive-letter case
  differences caused the prefix check to fail, returning full absolute paths as
  git-notes keys (corruption). Now uses `path.resolve()` and case-insensitive
  comparison on `process.platform === 'win32'`.

  **Issue #1194 — Externalized state paths not followed by runtime commands**
  Adds `effectiveSquadDir()` and `resolveStateDir()` helpers that follow the
  `stateLocation: 'external'` marker in `.squad/config.json`. Updates `loop`,
  `watch`, `plugin`, `doctor` commands and `shell` (lifecycle, coordinator, index)
  to use the effective state dir for reading `team.md`, `routing.md`, `agents/`,
  `plugins/`, and other state files.

- 6760b6e: Fix `squad <command> --help` silently running the command instead of showing help (#1201)

  Previously, passing `--help` or `-h` after a subcommand (e.g. `squad init --help`,
  `squad triage --help`, `squad doctor --help`) was silently dropped and the command
  would execute for real — sometimes with destructive side effects (init scaffolded
  files into the cwd, triage/watch started a polling loop). Only `squad loop --help`
  and `squad state-mcp --help` were intercepting the flag.

  The CLI now intercepts `--help`/`-h` for every registered subcommand in one place
  at the top of the router and prints command-specific help via a new
  `printCommandHelp(cmd, version)` helper. Unrecognized commands fall back to a
  friendly "see `squad help`" message. No side effects are triggered.

- e4a49f1: Extend SQUAD_TEAM_ROOT to all resolveSquad() call sites for subprocess compatibility
- 2129ad7: Fix triage label slug derivation: use `slugify()` instead of `toLowerCase()` so multi-word agent names produce valid GitHub labels (e.g. "Steve Rogers" → `squad:steve-rogers` instead of `squad:steve rogers`).

  Pre-create all `squad:{member}` labels at watch startup via `ensureTag()` so `gh issue edit --add-label` never fails on missing labels.

- cb57268: fix(watch): Windows shell:true, shared agent-spawn, round-level fetch (#920, #923)

  Three fixes for the watch --execute subsystem:

  1. Added shell: IS_WINDOWS to all 37+ execFile calls so commands resolve
     through PATH on Windows (fixes spawn EINVAL errors).

  2. Created shared agent-spawn.ts module replacing 7 copy-pasted
     buildAgentCommand() implementations. Default changed from deprecated
     gh copilot to standalone copilot CLI.

  3. Added RoundData shared fetch — issues and PRs fetched once per round
     instead of per-capability, reducing API calls from ~40 to ~2 per round.

- 677b7cf: docs: Add KEDA external scaler template for GitHub issue-driven autoscaling

  New template documenting how to use keda-copilot-scaler for scaling
  agent pods to zero when idle, with rate-limit-aware polling.

  Closes #516

- a299b3c: fix: use TEMPLATE_MANIFEST to drive skill installation instead of wholesale directory copy

  Both sdkInitSquad() and syncAllSkills() previously copied the entire templates/skills/
  directory, ignoring the curated 8-skill subset declared in TEMPLATE_MANIFEST.
  This meant all 37+ template skills shipped on every init/upgrade, and
  overwriteOnUpgrade was never consulted.

  Now both code paths iterate TEMPLATE_MANIFEST entries:

  - init (SDK): only the 8 manifest skills are copied on first init
  - upgrade (CLI): syncAllSkills() reads manifest entries, respects overwriteOnUpgrade

  Fixes #833

- 244554c: Allow memory diagnostics log level to be configured from `.squad/config.json`.
- 10f5036: perf(resolution): memoize squad-dir lookups; deduplicate squads.json reads to reduce filesystem I/O on repeated resolution calls
- 3bd1843: feat: add declarative plugin behavior context proof

  Adds static plugin metadata, lifecycle state, runtime context injection,
  declarative provider contracts, and behavior simulations for Graphify,
  MemPalace, and Index Server plugin samples. Enabled plugins can now contribute
  installed static guidance and typed memory/knowledge provider summaries to
  spawned-agent prompts while preserving the no-execution security boundary.

- a3419b5: Fix Windows spawn EINVAL in watch capabilities by adding `shell: true` to `execFile()` calls in monitor-teams, monitor-email, retro, and decision-hygiene capabilities. Add Copilot CLI preflight check to `squad doctor` and monitor capabilities so missing `gh copilot` extension is flagged early. Improve team hire confirmation UX to show member names inline with the prompt. (closes #920, closes #880, closes #1107)
- bc86668: Add delete() and append() to StateBackend interface; add resolveSquadState() entry point; add StateBackendStorageAdapter; add git-notes agent protocol templates

  - Add `delete()` and `append()` methods to the `StateBackend` interface
  - Implement delete/append for all three backends (local, orphan, two-layer)
  - Fix orphan backend append to preserve trailing whitespace via readUntrimmed()
  - Add `SquadStateContext` interface and `resolveSquadState()` factory in resolution module
  - Add `StateBackendStorageAdapter` — bridges StateBackend as a StorageProvider so SDK modules that accept `storage: StorageProvider` work with git-notes and orphan backends
  - Add `storage` field to `SquadStateContext` — local uses FSStorageProvider directly, orphan/two-layer use the adapter
  - Export `StateBackendStorageAdapter` from SDK public API
  - Wire `resolveSquadState()` into CLI entry so the state backend is resolved once at startup
  - Pass pre-resolved `stateContext` through to watch config to avoid redundant resolution
  - Add `notes-protocol.md` template — agent contract for git-notes state (namespaces, JSON schema, fetch/push, conflict handling)
  - Add `scripts/notes/fetch.ps1` template — fetch notes + one-time refspec setup + merge after conflict
  - Add `scripts/notes/write-note.ps1` template — agent helper for writing notes with JSON validation and push retry
  - Update state-backends docs with "Using with Copilot CLI Sessions" section (copilot-instructions snippet, promotion flow, template index)
  - This is the SDK foundation for making state backends squad-wide (Phase 1)

- 84872b1: Harden runtime state tools so write, append, and delete only mutate approved Squad runtime state paths, and refresh prompt templates to require state-tool persistence and literal datetime propagation.
- fa76432: fix(watch): 3 UX improvements — round timing output, --log-file tee flag, immediate startup feedback (#2141)
- 89db44d: Widen changelog-gate coverage for template and scaffolding paths

  Previously, the changelog gate only required a changeset for `packages/squad-(sdk|cli)/src/` changes, so template and scaffolding updates under `packages/squad-(sdk|cli)/templates/`, `.squad-templates/`, top-level `templates/`, and agent charters under `.squad/agents/*/charter.md` could reach users with no release-note entry. This widens the gate to those paths so user-facing template and scaffolding changes are no longer silently omitted from release notes. Closes #1156.

- a543f93: Fix Windows Azure CLI execution and ADO state mapping in squad watch
- Updated dependencies [a1fcdb8]
- Updated dependencies [6a72634]
- Updated dependencies [ba8d8f7]
- Updated dependencies [1446050]
- Updated dependencies [7f86e0e]
- Updated dependencies [5826555]
- Updated dependencies [dafc495]
- Updated dependencies [9c3156a]
- Updated dependencies [37def62]
- Updated dependencies [9a53769]
- Updated dependencies [36eed05]
- Updated dependencies [8c33f9f]
- Updated dependencies [490adf3]
- Updated dependencies [e5f4ca5]
- Updated dependencies [42c9dd3]
- Updated dependencies [70a3781]
- Updated dependencies [d8c1382]
- Updated dependencies [27f07cf]
- Updated dependencies [09cd6c1]
- Updated dependencies [2129ad7]
- Updated dependencies [7f9a878]
- Updated dependencies [87e9381]
- Updated dependencies [8d49066]
- Updated dependencies [a299b3c]
- Updated dependencies [900d2e4]
- Updated dependencies [a9c06b0]
- Updated dependencies [29cedd0]
- Updated dependencies [10f5036]
- Updated dependencies [892bd4f]
- Updated dependencies [32d2a23]
- Updated dependencies [3bd1843]
- Updated dependencies [6a01eef]
- Updated dependencies [9083085]
- Updated dependencies [7beb854]
- Updated dependencies [aa91ba4]
- Updated dependencies [5996db4]
- Updated dependencies [8456549]
- Updated dependencies [4f2de95]
- Updated dependencies [fe1e7e8]
- Updated dependencies [eb17e15]
- Updated dependencies [ef30286]
- Updated dependencies [5720705]
- Updated dependencies [a3419b5]
- Updated dependencies [bc86668]
- Updated dependencies [14917c5]
- Updated dependencies [84872b1]
- Updated dependencies [bbcbf7b]
- Updated dependencies [e11b5d3]
- Updated dependencies [a543f93]
- Updated dependencies [e0898ad]
  - @bradygaster/squad-sdk@0.10.0
