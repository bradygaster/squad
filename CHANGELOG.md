# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added — Full Work Monitor for squad watch (#708)
- `--execute` flag spawns Copilot sessions to work on actionable issues autonomously
- `--monitor-teams` / `--monitor-email` scan Teams/email for actionable items via WorkIQ
- `--board` enables project board lifecycle (In Progress → Done/Blocked + reconciliation)
- `--two-pass` lightweight scan then hydrate only actionable issues (saves API quota)
- `--wave-dispatch` parallel sub-task execution within issues (dependency-aware)
- `--retro` enforces retrospective checks (Fridays or when missed >7 days)
- `--decision-hygiene` auto-merges decision inbox when >5 files
- `--max-concurrent N` controls parallel issue execution (default: 1)
- `--timeout N` sets per-issue execution timeout in minutes (default: 30)
- `--copilot-flags "..."` passes extra flags to Copilot CLI sessions
- SubSquad discovery: automatically detects `.squad/subsquads/` for routing
- All features disabled by default — existing `squad watch` behavior unchanged

### Added — StorageProvider Abstraction Layer
- **StorageProvider interface** (#640) — pluggable I/O contract decoupling the runtime from `node:fs`
- **FSStorageProvider** (#640) — Node.js `fs` wrapper, default provider for CLI and local workflows
- **InMemoryStorageProvider** (#640) — Map-backed, test-friendly provider for deterministic unit tests
- **SQLiteStorageProvider** (#640) — portable single-file provider using WASM-based sql.js
- **StorageError** (#640) — typed error handling with `operation` and `code` fields for structured diagnostics
- **24-method async + sync API** (#640) — full file-system surface (read, write, list, mkdir, stat, etc.); sync variants deprecated, Wave 2 removal
- **Contract test suite** (#640) — provider conformance tests ensuring all implementations satisfy the StorageProvider interface
- **Sample projects** (#640) — `storage-provider-azure` and `storage-provider-sqlite` in `samples/`

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


