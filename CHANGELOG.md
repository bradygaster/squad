# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.10.0] — 2026-06-07

First stable release since v0.9.4 (April 25). Consumes 97 changesets (sdk: 50, cli: 71).

### Security
- (cli) iter-9: inject `--yolo --additional-mcp-config @.mcp.json` in all non-interactive copilot spawns; fix path regression from `.copilot/mcp-config.json` (iter-7) to `.mcp.json` (iter-8 canonical location); add fallback warning when `.mcp.json` is absent; add `--yolo` deduplication guard; document Copilot CLI 1.0.59+ folder-trust security gate

### Performance
- (cli) Add /fleet hybrid dispatch mode for squad watch --execute (#775) — enables parallel issue analysis via Copilot CLI /fleet, 2.9x faster than sequential dispatch for read-heavy work
- (sdk) perf(agents): parallelize charter discovery with concurrency limit to reduce multi-agent load time
- (sdk+cli) perf(resolution): memoize squad-dir lookups; deduplicate squads.json reads to reduce filesystem I/O on repeated resolution calls
- (sdk) perf(scheduler): convert sequential async execution to concurrent with bounded concurrency to improve multi-agent dispatch throughput

### Added
- (sdk) Add rework rate OTEL metrics (#265) — tracks PR revision patterns as the emerging 5th DORA metric
- (sdk+cli) Add routing.md to squad export/import functionality
- (sdk) Add SkillScriptLoader, handler types, and applySkillHandlers for executable skill handler scripts
- (cli) feat: APM integration — squad skill publish/install + apm.yml in init
- (sdk) feat: Cooperative rate limiting with predictive circuit breaker
- (sdk+cli) Cross-squad orchestration — discovery, delegation, and manifest (#316). Adds manifest schema, `squad discover` / `squad delegate` commands, and runtime module for coordinating work across multiple Squad instances.
- (cli) Add deprecation warnings for tunnel, rc, and REPL commands. The interactive shell (no-args), `squad start`, `squad start --tunnel`, `squad rc`, and `squad rc-tunnel` now emit yellow deprecation notices pointing users to the GitHub Copilot CLI. No behavior changes — all commands still work.
- (cli) docs: add fork contribution workflow to CONTRIBUTING.md
- (cli) Add user-facing documentation for state backends (local, orphan-branch, two-layer)
- (sdk) Add dual-mode deployment support for capabilities routing.
- (sdk+cli) feat: add error-recovery skill for standard agent failure recovery patterns
- (sdk+cli) Add external state storage — move .squad/ out of the working tree (#792)
- (sdk+cli) Add fact-checker as a built-in agent role (#789)
- (cli) Fix squad doctor and upgrade for insiders installs: add .squad/casting/ to ENSURE_DIRECTORIES, scaffold casting defaults from templates with permission-safe fallback, and clarify ESM warnings for global installs.
- (sdk) Sync squad.agent.md roster when agents added to team.md
- (cli) fix(ci): fix multiple CI test failures introduced by PR #1035 coordinator slimming
- (sdk+cli) Warn when squad.agent.md template is missing during upgrade or init instead of silently skipping file creation. Adds `warnings` field to `InitResult` for structured error reporting.
- (sdk+cli) feat(sdk): git-notes + orphan-branch state backends for .squad/
- (sdk+cli) feat: add iterative-retrieval skill for structured max-3-cycle agent spawning
- (cli) docs: Add KEDA external scaler template for GitHub issue-driven autoscaling
- (cli) feat(cli): Add `squad loop` command — prompt-driven continuous work loop
- (sdk+cli) feat: Machine capability discovery and `needs:*` label-based issue routing
- (sdk+cli) Add `squad init --mcp-frontmatter` to write MCP server config into the Squad agent frontmatter instead of `.copilot/mcp-config.json` for compatible agent harnesses.
- (sdk+cli) feat: add notification-routing skill for pub-sub channel routing
- (sdk+cli) feat: add declarative plugin behavior context proof
- (cli) Add `--notify-level` to control watch round reporting noise (#803)
- (sdk+cli) Add Rai as Squad's third built-in agent — a Responsible AI (RAI) reviewer
- (sdk+cli) feat: add reflect skill for in-session learning capture and mistake prevention
- (sdk+cli) Add `--repo` and `--branch` flags to `squad export` and `squad import` commands, enabling users to push/pull Squad configuration directly to/from a GitHub repository via the GitHub Contents API.
- (sdk+cli) Add retro enforcement skill with Test-RetroOverdue and ceremonies template update.
- (sdk) Add `.squad/.scratch/` directory for organized temp file management (#790)
- (sdk) Add SDK feature parity batch 2 — 64 tests covering manual ceremonies (#27), ceremony cooldown (#28), human team members (#36), constraint budget enforcement (#49 — rate limiter, file-write guards, shell restrictions, PII scrubbing), multi-agent artifact coordination (#50), and builder validation edge cases.
- (sdk) test: SDK feature parity batch 3 — 46 tests for #31, #47, #45, #46
- (cli) Add `squad upgrade --self` to upgrade the CLI package itself (#798)
- (cli) feat: session init update check with extensible session-init reference
- (cli) feat: add squad-commands skill for in-chat command discovery
- (sdk+cli) feat: add SQUAD_HOME env var and preset system
- (cli) Fix Windows spawn EINVAL in watch capabilities by adding `shell: true` to `execFile()` calls in monitor-teams, monitor-email, retro, and decision-hygiene capabilities. Add Copilot CLI preflight check to `squad doctor` and monitor capabilities so missing `gh copilot` extension is flagged early. Improve team hire confirmation UX to show member names inline with the prompt. (closes #920, closes #880, closes #1107)
- (sdk) Bump `@github/copilot-sdk` from `^0.1.32` to `^0.3.0` to fix ESM module resolution error (ERR_MODULE_NOT_FOUND for vscode-jsonrpc/node). Add explicit GitHub repo config support in `.squad/config.json` (`{ "github": { "owner": "...", "repo": "..." } }`) so platform adapter prefers user-specified repo over auto-detection from origin remote. (closes #1062, closes #905)
- (sdk+cli) Add delete() and append() to StateBackend interface; add resolveSquadState() entry point; add StateBackendStorageAdapter; add git-notes agent protocol templates
- (sdk) feat(sdk): Add Microsoft Teams communication adapter
- (sdk+cli) feat: add tiered-memory skill for hot/cold/wiki agent context management
- (cli) feat(watch): circuit breaker integration for rate limit protection (#515)
- (cli) feat(watch): health check — show running watch instance status (#808)
- (cli) Add --verbose flag to squad watch for debugging empty boards and silent failures (#781)

### Fixed
- (sdk+cli) Fix hardcoded "Brady" in template files — LLMs now use actual git username instead of example name (closes #977)
- (cli) Fix changelog-gate CI to accept .changeset/ files as alternative to direct CHANGELOG.md edits
- (sdk+cli) fix: bump CLI version to 0.9.7-preview; align E2E skill and policy gate with CONTRIBUTING.md
- (sdk+cli) fix: context overflow sentinel and coordinator size reduction (retroactive for #1035)
- (sdk+cli) Fix coordinator and Scribe templates so spawned agents receive and write the resolved current datetime instead of placeholder text.
- (cli) fix(cli): revert detect-squad-dir to zero-dependency bootstrap
- (cli) fix: restore CI green on dev — 25 regression fixes + 6 test corrections
- (cli) Fix export/import producing blank decisions.md and team.md files. Export now includes these files in the manifest, and import restores their content.
- (cli) Fix runtime commands to correctly resolve externalized state paths
- (sdk+cli) Fix 5 bugs: dotted repo names, icon spacing, board owner, charter passing, missing playbooks
- (cli) fix: `/init` with no args now accepts follow-up message as cast prompt, and `createTeam` correctly creates `team.md`/`routing.md` in fresh projects
- (cli) fix(nap): account for separator newlines in decision archival budget
- (cli) fix(cli): wire --team-root / SQUAD_TEAM_ROOT into squad resolution for nap, status, and cost commands (#734)
- (cli) fix: CLI no longer bails when configured is false; starts onboarding session instead (#843)
- (cli) fix(coordinator): resolve externalized state, teamRoot, stale work, and cleanup loops
- (sdk+cli) Fix permission handler to use `approve-once` instead of deprecated `approved` kind, aligning with Copilot CLI v1.0.54+ permission contract
- (cli) Fix post-init message to recommend `copilot --agent squad` instead of deprecated `squad` command (closes #1034, closes #1007)
- (sdk+cli) Fix state-backend and upgrade regressions (#1163, #1185, #1190, #1191, #1194)
- (cli) Fix `squad <command> --help` silently running the command instead of showing help (#1201)
- (cli) Extend SQUAD_TEAM_ROOT to all resolveSquad() call sites for subprocess compatibility
- (sdk+cli) Fix triage label slug derivation: use `slugify()` instead of `toLowerCase()` so multi-word agent names produce valid GitHub labels (e.g. "Steve Rogers" → `squad:steve-rogers` instead of `squad:steve rogers`).
- (cli) fix(watch): Windows shell:true, shared agent-spawn, round-level fetch (#920, #923)
- (sdk+cli) fix: use TEMPLATE_MANIFEST to drive skill installation instead of wholesale directory copy
- (sdk) Fix squad-commands skill routing and configuration for Copilot integration
- (sdk) State backend hardening: retry with exponential backoff for transient git errors, circuit-breaker to prevent cascading failures, read-only startup verification, and observable error surfacing replacing silent swallowing.
- (cli) fix(watch): 3 UX improvements — round timing output, --log-file tee flag, immediate startup feedback (#2141)
- (sdk+cli) Fix Windows Azure CLI execution and ADO state mapping in squad watch
- (sdk) fix(sdk): wire `squad_route` tool handler to actually create target sessions

### Changed
- **Communications:** `createCommunicationAdapter` is now async. Downstream consumers building custom adapters must `await` the factory call. Not flagged as breaking per pre-1.0 SemVer.
- (sdk) ADO configurable work item types, area paths, and iteration support (#240)
- (cli) Ship 8 built-in skills with squad init/upgrade (#788)
- (cli) Allow memory diagnostics log level to be configured from `.squad/config.json`.
- (sdk+cli) Enable persistent Ralph — heartbeat cron + healthCheck timer
- (sdk+cli) Squad coordinator now scans all 5 project skill directories: Copilot CLI's 3
- (sdk+cli) Generic, provider-agnostic scheduler for Squad (#296) — unified schedule.json manifest with LocalPolling and GitHubActions provider adapters, CLI commands (list, run, init, status), schema validation, and cron/interval trigger evaluation.
- (sdk+cli) Harden runtime state tools so write, append, and delete only mutate approved Squad runtime state paths, and refresh prompt templates to require state-tool persistence and literal datetime propagation.
- (cli) Widen changelog-gate coverage for template and scaffolding paths

### Internal / Tests / Docs
- (cli) docs: point README migration guide links to the published docs site

## [0.1.0-preview] - 2026-06-02

### Added — Squad.Agents.AI NuGet preview
- Added `Squad.Agents.AI`, a `net10.0` Microsoft Agent Framework package that exposes a Squad team as an `AIAgent`.
- Public surface: `SquadAgent`, `SquadAgentOptions`, `SquadConnectionFactory`, and `SquadServiceCollectionExtensions`.
- Added DI registration, PATH/URI connection-string parsing, GitHub token/provider options, and XML documentation for the public preview surface.
- Added README documentation for the `Squad.Agents.AI` package in `src/Squad.Agents.AI/README.md`.

## [0.9.0] - 2026-03-23

### Added — Personal Squad Governance Layer
- **Personal Squad concept** (#508) — isolated developer workspace with own team.md, routing.md, and agent roster
- **Ambient discovery** — automatic detection of personal squad at `~/.squad/` via environment variables and fallback paths
- **CLI commands** (#508) — `squad personal init`, `squad personal list`, `squad personal use`, `squad personal remove`
- **Governance integration** (#508) — hooks, ceremonies, telemetry isolated per personal squad
- **Unit & integration tests** (#508) — full test coverage for personal squad flows

### Added — Worktree Spawning & Orchestration
- **Worktree creation** (#529) — coordinator spawns managed worktrees for parallel agent work via `squad worktree spawn`
- **Cross-squad orchestration** (#446) — agents coordinate work across multiple squads and worktrees
- **Persistent Ralph — watch + heartbeat** (#443) — long-running Ralph daemon with health monitoring
- **Regression guard** (#521) — worktree .git detection (file vs directory) with full test coverage

### Added — Machine Capability Discovery
- **Capability inference** (#514) — automatic detection of available tools, models, and hardware specs at session start
- **needs:* Label Routing** (#514) — agents self-route based on discovered capabilities vs work requirements

### Added — Cooperative Rate Limiting
- **Predictive circuit breaker** (#515) — model token budget forecasting to prevent runtime exhaustion
- **Rate limit recovery** (#464) — surface errors with actionable recovery options
- **Circuit breaker for Ralph** (#451) — graceful degradation under model quota pressure

### Added — Economy Mode
- **Cost-conscious model selection** (#500) — automatic selection of cheaper models when quality thresholds permit
- **Economy mode skill** (#503) — governance proposals for balanced cost/quality tradeoffs
- **Token usage tracking** (#453) — visibility into per-agent token consumption and costs

### Added — Auto-Wire Telemetry
- **Auto-wire in initSquadTelemetry()** (#281) — telemetry initialization no longer requires manual wiring
- **OpenTelemetry integration** — automatic context propagation across squad sessions

### Added — Issue Lifecycle Template
- **Template document** (#527) — standardized issue lifecycle workflow (creation → triage → assignment → completion)
- **Integrated into squad init** — available to all new teams via `.squad/templates/issue-lifecycle.md`

### Added — KEDA External Scaler Template
- **Agent autoscaling template** (#516) — KEDA-based horizontal scaling for compute-intensive agent work
- **Documentation** (#519) — setup guide for Kubernetes-based squad deployments

### Added — GAP Analysis Verification Loop
- **After Agent Work flow** (#473) — gap analysis verification loop ensures all requirements are met before task completion
- **Checklist-driven completion** — structured validation to prevent incomplete deliverables

### Added — Session Recovery Skill
- **Session recovery** (#442) — find and resume lost sessions without restarting work
- **Integration** — available as a core team skill via `.squad/skills/session-recovery/SKILL.md`

### Added — Token Usage Visibility
- **Per-agent cost tracking** (#453) — token consumption and estimated costs per agent
- **Dashboard integration** — visible in session UI for cost-conscious workflows

### Added — GitHub Auth Isolation Skill
- **Multi-account GitHub workflows** (#470) — safely switch GitHub identities within a squad session
- **Integration** — available as `.squad/skills/gh-auth-isolation/SKILL.md`

### Added — Docs Site Improvements (Astro)
- **10 Astro feature items** (#524) — implemented search tuning, section badges, test coverage indicators
- **Autonomous agents guide** (#492) — comprehensive guide for building autonomous agents with Squad SDK
- **Blog posts** (#029) — upgrade cross-testing at scale post
- **Expanded search** (#482) — Pagefind tuning with section badges for better discoverability
- **CLI README expansion** (#487) — detailed CLI reference with workflow examples
- **Teams MCP integration refresh** (#496) — updated Workflows webhook documentation
- **Migration guide updates** (#320, #468) — @latest installation instructions and heartbeat config

### Added — ESLint Runtime Anti-Pattern Detection
- **ESLint with TypeScript support** (#493) — static analysis for common runtime anti-patterns
- **Integration** — available in CLI pre-flight checks

### Fixed — CLI Terminal Rendering
- Eliminated scroll-to-top flicker caused by Ink's fullscreen `clearTerminal` path firing on every render cycle
- Reduced re-render churn via memoized elapsed-time display (one-second granularity gate) and consolidated animation intervals
- Stabilized component keys (timestamp-based instead of shifting array indices) to prevent Ink remounts
- Pinned live viewport height to keep input prompt above fold on all terminal sizes

### Fixed — Upgrade Path & Installation
- **P0 upgrade gaps** (#544) — context-aware footer and EPERM handling for permission issues
- **Gitignore parent coverage** (#549) — `.gitignore` updates for nested squad directories
- **ADO configurable work item types** (#444) — flexible schema for Azure DevOps work items
- **Template directory audit** (#461) — all template references aligned with `.squad/templates/`
- **Package template sync** (#462) — monorepo workspace templates now in sync

### Fixed — ESM Compatibility
- **Complete exports check** — verify all ESM exports before applying patch
- **Dual-layer ESM fix** (#449) — Node 22/24 compatibility for vscode-jsonrpc resolution
- **Node 24+ hard-fail** (#502) — clear error message for Node <22.5.0 with upgrade guidance

### Fixed — Runtime Stability
- **SIGINT/SIGTERM handling** (#486) — graceful shutdown with 22+ tests for signal handling
- **Read-modify-write race condition** (#480) — fixed history-shadow.ts file access race
- **az CLI timeout** (#483) — 2s timeout for getAvailableWorkItemTypes to prevent hangs
- **Memory safety caps** (#259) — file watcher filtering and memory limits
- **User model preference persistence** (#284) — model selection now persists across sessions
- **Repository auto-detection** (#437) — auto-detect repo owner/name at session start

### Fixed — GitHub Integration
- **CI hardening** — stale lockfile handling, manual rerun workflow, merge ref fixes
- **Casting universe alignment** (#459) — align casting universe count with reality

### Changed — npm Distribution & Installation
- **npm-only distribution** — removed GitHub-native distribution channel
- **Installation:** `npm install -g @bradygaster/squad-cli` (standard npm registry)
- **Verified upgrade path** — tested at scale across 100+ projects

### Documentation — Guides & References
- **Agent anatomy & hiring checklist** (#439) — detailed guide for building team rosters
- **Behavior documentation** (#448) — nap, reskill, and compact behavior reference
- **Content gap fill** — 7 recent PRs documented
- **PAO external communications** (#426) — Phase 1 infrastructure for multi-channel squad updates
- **Casting reference** (#814133d) — comprehensive casting configuration guide

### By the Numbers
- **40+ commits** merged since v0.8.25
- **6+ major features** (Personal Squad, Worktree Spawning, Capability Discovery, Cooperative Rate Limiting, Economy Mode, Auto-wire Telemetry)
- **10+ docs site improvements** via Astro
- **15+ stability & compatibility fixes**
- **Tested at scale** — upgrade process verified across 100+ projects
- **Governance layer** — new Personal Squad feature enables distributed developer workflows

## [0.8.24] - 2026-03-08

### Added — Azure DevOps Platform Adapter
- **PlatformAdapter interface** — unified API for GitHub, ADO, and Microsoft Planner
- **AzureDevOpsAdapter** — `az boards` CLI for work items, `az repos` for PRs
- **GitHubAdapter** — `gh` CLI wrapper implementing PlatformAdapter
- **PlannerAdapter** — Microsoft Graph API for hybrid work-item tracking
- **Cross-project ADO config** via `.squad/config.json` — work items can live in a different org/project than the repo

### Added — CommunicationAdapter
- **Pluggable agent-human messaging** — Scribe/Ralph can post updates through platform-appropriate channels
- **Four adapters:** FileLog (zero-config), GitHub Discussions, ADO Work Item Discussions, Teams Webhook (stub)
- **Factory auto-detection** — `createCommunicationAdapter(repoRoot)` selects the right adapter

### Added — SubSquads (Community-Voted Rename)
- Workstreams → SubSquads across CLI, types, and docs
- CLI: `squad subsquads` (with `workstreams` and `streams` as deprecated aliases)
- Old names preserved as `@deprecated` re-exports for backward compatibility

### Fixed — Security Hardening
- `execSync` → `execFileSync` (prevents shell injection)
- `escapeWiql()` helper (prevents WIQL injection in ADO queries)
- `curl --config stdin` (hides bearer tokens from process listing)
- Case-insensitive URL detection for ADO remotes
- Cross-platform draft filter (`findstr` → JMESPath)
- PR status mapping (`active` → `open` for `gh` CLI)
- `gh issue create` fix (parse URL from stdout, not `--json`)

### Fixed — ESM Runtime Patch + Secret Guardrails
- Runtime `Module._resolveFilename` intercept for Node 24+ ESM compatibility
- 5-layer secret defense architecture
- 59 TDD security hook tests
- `.squad/skills/secret-handling/SKILL.md` team reference

### Added — Docs Site Improvements
- Contributor Guide page in docs site Guide section
- Squad Contributors Guide page (36+ contributors honored)
- Concepts and Cookbook sections wired into docs build
- Broken links fixed across docs site

### By the Numbers
- 8 PRs merged (#191, #263, #268, #270, #272, #275, #277, #266)
- 153 new tests (92 platform + 15 comms + 46 SubSquads)
- 59 security tests
- 8 issues closed
- 3 new docs pages, 6+ broken links fixed

## [0.8.23] - 2026-03-12

### Fixed — Node 24+ ESM Import Crash
- **Node 24+ `squad init` crash fix (#XXX)** — v0.8.23 resolves `ERR_MODULE_NOT_FOUND: Cannot find module 'vscode-jsonrpc/node'` crash that occurs on Node.js 24+ and GitHub Codespaces. Root cause: upstream ESM import issue in `@github/copilot-sdk`. Two-layer defense implemented:
  - **Lazy imports** — Commands `init`, `build`, `link`, `migrate` no longer eagerly load copilot-sdk at startup
  - **Postinstall patch** — Automatically fixes broken ESM import at install time
  - Side benefit: Faster CLI startup for non-session commands

### Added — Squad RC Documentation
- Comprehensive guide for `squad rc` (Remote Control) covering:
  - ACP (Azure Communication Platform) passthrough architecture
  - 7-layer security model for session isolation and encryption
  - Mobile keyboard shortcuts and accessibility features
  - Troubleshooting guide for common connection issues

### By the Numbers
- 2 issues closed
- 3 PRs merged
- 3,811 tests passing (3,840 total, 0 logic failures)
- 1 critical crash fix (Node 24+ compatibility)

## [0.8.22] - 2026-03-11

### Added — SDK-First Mode (Phase 1)
- **Builder functions** — Type-safe team configuration with runtime validation
  - `defineTeam()` — Team metadata, project context, member roster
  - `defineAgent()` — Agent definition with role, model, tools, capabilities
  - `defineRouting()` — Routing rules with pattern matching and priority
  - `defineCeremony()` — Ceremony scheduling (standups, retros, etc.)
  - `defineHooks()` — Governance hooks (write paths, blocked commands, PII scrubbing)
  - `defineCasting()` — Casting configuration (universe allowlists, overflow strategy)
  - `defineTelemetry()` — OpenTelemetry configuration
  - `defineSquad()` — Top-level composition builder
- **`squad build` command** — Compile TypeScript definitions to `.squad/` markdown
  - Generates `.squad/team.md`, `.squad/routing.md`, agent charters, ceremonies
  - Supports `--check` (validation), `--dry-run` (preview), `--watch` (file monitoring stub)
  - Protected files (decisions.md, history.md) never overwritten
- **SDK Mode Detection** — Coordinator prompt includes SDK-First mode awareness
- **Documentation**
  - New guide: [SDK-First Mode](docs/sdk-first-mode.md) — concepts, builder reference, examples
  - Updated [SDK Reference](docs/reference/sdk.md) — builder function signatures and types
  - README quick reference for SDK-First teams

### Added — Remote Squad Mode (ported from @spboyer's [bradygaster/squad#131](https://github.com/bradygaster/squad/pull/131))
- `resolveSquadPaths()` dual-root resolver — project-local vs team identity directories
- `squad doctor` command — 9-check setup validation with emoji output
- `squad link <path>` command — link a project to a remote team root
- `squad init --mode remote` — initialize with remote team root config
- `ensureSquadPathDual()` / `ensureSquadPathResolved()` — dual-root write guards

### Fixed — Critical Crash & Stability Issues
- **Installation crash fix (#247)** — `npx @bradygaster/squad-cli` was failing on fresh installs due to hard dependency on `@opentelemetry/api` that couldn't resolve in isolated npm environments. Created `otel-api.ts` resilient wrapper with full no-op fallbacks. Moved OTel to optional dependencies. Telemetry now gracefully degrades when absent.
- **CLI command wiring (#244)** — Commands `rc`, `copilot-bridge`, `init-remote`, `rc-tunnel` were implemented but never wired into CLI entry point. Now properly connected and discoverable.
- **Model config round-trip (#245)** — `AgentDefinition.model` now accepts `string | ModelPreference` for structured model configuration. Charter compiler updated to emit and parse the new format correctly.
- **ExperimentalWarning suppression** — Node's `ExperimentalWarning` for `node:sqlite` no longer leaks into terminal output. Suppressed via process.emit override in cli-entry.ts.
- **Blankspace fix (#239)** — Idle blank space below agent panel removed. Conditional height constraint only active during processing.
- **Windows race condition (EBUSY)** — `fs.rm` with retry logic and exponential backoff. Tests now pass reliably on Windows.
- **Test hardening** — Speed gate threshold adjustments for growing CLI codebase. 25 regression tests fixed (PR #221).
- **CI stabilization** — GitHub Actions pipeline fixed and green (PRs #232, #228).

### Changed — Distribution & Versioning
- **Distribution:** npm-only distribution channel. No more GitHub-native distribution (`npx github:bradygaster/squad`). Users now install via `npm install -g @bradygaster/squad-cli` or `npx @bradygaster/squad-cli` from npm registry.
- **Semantic Versioning fix (#692):** Version format changed from `X.Y.Z.N-preview` to `X.Y.Z-preview.N` to comply with semantic versioning spec (prerelease identifier after patch, build metadata after prerelease). Example: `0.8.6-preview.1` instead of `0.8.6.1-preview`.
- **Version transition:** Public repo final version was `0.8.5.1`. Private repo continues at `0.8.x` cadence (next publish after 0.8.17 is 0.8.18), following semver prerelease convention for development.

### Community
- Thanks to **Shayne Boyer** ([@spboyer](https://github.com/spboyer)) for the original remote mode design.
- PR #199 (migration command) received, reviewed, and feedback captured as issue #231 for future implementation.
- PR #243 (blankspace fix) — community contribution cherry-picked and credited.

### By the Numbers
- 26 issues closed
- 16 PRs merged
- 3,724 tests passing (3,740 total, 13 known Windows timeout flakes, 0 logic failures)
- 8 builder functions shipped
- 4 CLI commands wired
- 1 critical crash fix (OTel dependency)
- 25 regression tests fixed

## [Unreleased]

## [0.8.20] - 2025-01-08

### Fixed
- **Template path fix (#190):** Corrected all references from `.squad-templates/` to `.squad/templates/` to align with the project's directory structure. This ensures the CLI correctly resolves team member charters and other template resources.
- **Init test templates:** Updated initialization tests to reference the corrected `.squad/templates/` directory path.

## [0.8.18-preview] - TBD

### Added — Remote Squad Mode (ported from @spboyer's [bradygaster/squad#131](https://github.com/bradygaster/squad/pull/131))
- `resolveSquadPaths()` dual-root resolver — project-local vs team identity directories (#311)
- `squad doctor` command — 9-check setup validation with emoji output (#312)
- `squad link <path>` command — link a project to a remote team root (#313)
- `squad init --mode remote` — initialize with remote team root config (#313)
- `ensureSquadPathDual()` / `ensureSquadPathResolved()` — dual-root write guards (#314)

### Changed — npm Distribution & Monorepo Structure
- **Distribution:** Migrated from GitHub-native (`npx github:bradygaster/squad`) to npm packages (`npm install -g @bradygaster/squad-cli` / `npx @bradygaster/squad-cli`)
- **Packages:** Independent versioning via @changesets/cli — `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` evolve on separate cadences
- **Structure:** Monorepo layout with workspace packages (SDK + CLI)
- **Directory:** `.squad/` directory structure (migration from `.ai-team/`)
- **Semantic Versioning:** All versions now comply with semver spec (prerelease format `X.Y.Z-preview.N`)

### Fixed
- CLI entry point moved from `dist/index.js` to `dist/cli-entry.js`. If you reference the binary directly, update your path. `npx` and `npm` bin resolution is unchanged. (#187)
- CRLF normalization: All parsers now normalize line endings before parsing. Windows users with `core.autocrlf=true` no longer get `\r`-tainted values. (#220, #221)
- `process.exit()` removed from library-consumable functions. VS Code extensions can now safely import CLI functions without risking extension host termination. (#189)
- Removed `.squad` branch protection guard (`squad-main-guard.yml`) — no longer needed with npm workspace `files` field exclusions

### Internal
- New utility: `normalizeEol()` in `src/utils/normalize-eol.ts`
- New entry point: `src/cli-entry.ts` (CLI bootstrap separated from library exports)
- Migrated to npm workspace publishing (`@bradygaster/squad-sdk`, `@bradygaster/squad-cli`)
- Changesets infrastructure for independent package versioning



