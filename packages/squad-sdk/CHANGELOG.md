# @bradygaster/squad-sdk

## 0.10.0

### Minor Changes

- a1fcdb8: Add rework rate OTEL metrics (#265) — tracks PR revision patterns as the emerging 5th DORA metric
- 6a72634: Add routing.md to squad export/import functionality

  The routing.md file is now included when exporting and importing Squad configurations.
  This preserves the full routing context (tables, comments, principles) alongside the
  structured routing rules that were already exported.

- ba8d8f7: Add SkillScriptLoader, handler types, and applySkillHandlers for executable skill handler scripts
- 1446050: ADO configurable work item types, area paths, and iteration support (#240)

  - Add `getAvailableWorkItemTypes(org, project)` for process template introspection
  - Add `validateWorkItemType(org, project, typeName)` for pre-creation validation
  - Add `WorkItemTypeInfo` interface for type metadata
  - Enhance `AzureDevOpsAdapter` with instance-level `getAvailableWorkItemTypes()` and `validateWorkItemType()` methods
  - Support optional `validateType` flag in `createWorkItem()` to check type before creation
  - Enhance `squad init` to introspect available work item types and store `_availableTypes` hint in `.squad/config.json`
  - Support `adoConfig` in `InitOptions` for explicit work item type, area path, and iteration path during init
  - Graceful fallback to default types (User Story, Bug, Task) when az CLI is unavailable

- 7f86e0e: feat: Cooperative rate limiting with predictive circuit breaker

  Added cooperative rate limiting patterns for multi-agent deployments:

  - Traffic Light, Predictive Circuit Breaker, Priority Retry Windows
  - Cooperative Token Pool for shared quota management

  Closes #515

- 5826555: Cross-squad orchestration — discovery, delegation, and manifest (#316). Adds manifest schema, `squad discover` / `squad delegate` commands, and runtime module for coordinating work across multiple Squad instances.
- dafc495: Add dual-mode deployment support for capabilities routing.

  New features:

  - `SQUAD_POD_ID` env var for pod-specific capability manifests
  - `SQUAD_DEPLOYMENT_MODE` env var (`agent-per-node` | `squad-per-pod`)
  - Pod-specific manifest loading: `.squad/machine-capabilities-{podId}.json`
  - Fallback chain: pod-specific → shared → user-home → null (opt-in)
  - New exports: `getDeploymentMode()`, `getPodId()`, `DeploymentMode` type

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

- 7f9a878: feat(sdk): git-notes + orphan-branch state backends for .squad/

  Adds git-native state storage backends as alternatives to the local (disk)
  approach:

  - **orphan-branch** (`squad-state`): Dedicated orphan branch with no common
    ancestor. State files never appear in main.
  - **two-layer** (notes + orphan): Git notes as best-effort commit annotations
    plus orphan branch for durable state. Recommended for teams.

  Configure via `.squad/config.json`: `{ "stateBackend": "two-layer" }` or
  the `--state-backend` CLI flag.

- 87e9381: feat: add iterative-retrieval skill for structured max-3-cycle agent spawning
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
- 5996db4: Add `.squad/.scratch/` directory for organized temp file management (#790)

  - `scratchDir()` — resolve and optionally create the scratch directory
  - `scratchFile()` — create named temp files inside `.scratch/`
  - Init scaffolds `.squad/.scratch/` and adds it to `.gitignore`
  - Agents and CLI should use these utilities instead of writing temp files to repo root

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
- ef30286: feat: add SQUAD_HOME env var and preset system

  - Add `SQUAD_HOME` environment variable support for a roaming squad root directory
  - Add preset system for reusable agent configurations (list, show, apply, init)
  - Ship a default built-in preset with 5 agents (lead, reviewer, devrel, security, docs)
  - Add `squad preset` CLI command with list, show, apply, and init subcommands
  - Resolves #1038

- 5720705: Generic, provider-agnostic scheduler for Squad (#296) — unified schedule.json manifest with LocalPolling and GitHubActions provider adapters, CLI commands (list, run, init, status), schema validation, and cron/interval trigger evaluation.
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

- bbcbf7b: feat(sdk): Add Microsoft Teams communication adapter

  BREAKING: `createCommunicationAdapter` is now async (returns `Promise<CommunicationAdapter>`).
  Callers must await the result.

  New Teams adapter for bidirectional chat via Microsoft Graph API.
  Supports browser auth (PKCE), device code flow, token caching,
  1:1 chat and channel messaging.

- e11b5d3: feat: add tiered-memory skill for hot/cold/wiki agent context management
- e0898ad: fix(sdk): wire `squad_route` tool handler to actually create target sessions

  The `squad_route` tool is documented in `packages/squad-sdk/README.md`,
  `docs/src/content/docs/reference/sdk.md`,
  `docs/src/content/docs/reference/api-reference.md`, and the
  `build-autonomous-agent` guide as routing tasks and creating new sessions
  for the target agent. The previous implementation returned
  `resultType: 'success'` with the hard-coded text "Session creation will be
  implemented when session lifecycle is in place" without ever spawning a
  session. SDK embedders following the documented usage
  (`toolRegistry.getTool('squad_route').handler({ ... })`) received a
  confident "Task routed to X" success payload while no agent ever started —
  a silent no-op masquerading as success.

  This change:

  - Adds an optional 5th positional `fanOutDepsGetter` constructor parameter
    to `ToolRegistry`. Existing 4-arg constructions are unaffected.
  - When `fanOutDepsGetter` returns dependencies, `squad_route` calls
    `spawnParallel` with a single config (charter compile → model resolve →
    `createSession` → initial message), matching the SDK `Coordinator`
    fan-out path.
  - When `fanOutDepsGetter` is absent or returns `undefined`, the handler
    returns `resultType: 'failure'` with `error: 'fan-out-deps-unavailable'`
    and remediation guidance, replacing the previous false-success.
  - Normalizes `targetAgent` to lowercase (matching charter-loading convention).
  - Distinguishes roster "not found" errors from infrastructure I/O failures.
  - Updates `docs/src/content/docs/guide/build-autonomous-agent.md` with a
    note about the `fanOutDepsGetter` requirement and `fan-out-deps-unavailable`
    failure mode.

  Behavior change for embedders that relied on the stub's unconditional
  success: those calls now return an honest failure. Remediation is to
  either (a) construct `ToolRegistry` with a `fanOutDepsGetter`, or
  (b) intercept `squad_route` via `SquadSessionHooks.onPreToolUse`.

  Related: #1029 (named-agent delegation answering inline) — different code
  path (Copilot CLI `task` tool / coordinator prompt), not closed by this PR,
  but shares the same root-cause family of silent-no-op delegation primitives.

### Patch Changes

- 36eed05: Fix hardcoded "Brady" in template files — LLMs now use actual git username instead of example name (closes #977)
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
- 42c9dd3: Fix 5 bugs: dotted repo names, icon spacing, board owner, charter passing, missing playbooks
- 70a3781: Fix permission handler to use `approve-once` instead of deprecated `approved` kind, aligning with Copilot CLI v1.0.54+ permission contract
- d8c1382: Sync squad.agent.md roster when agents added to team.md
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

- 2129ad7: Fix triage label slug derivation: use `slugify()` instead of `toLowerCase()` so multi-word agent names produce valid GitHub labels (e.g. "Steve Rogers" → `squad:steve-rogers` instead of `squad:steve rogers`).

  Pre-create all `squad:{member}` labels at watch startup via `ensureTag()` so `gh issue edit --add-label` never fails on missing labels.

- a299b3c: fix: use TEMPLATE_MANIFEST to drive skill installation instead of wholesale directory copy

  Both sdkInitSquad() and syncAllSkills() previously copied the entire templates/skills/
  directory, ignoring the curated 8-skill subset declared in TEMPLATE_MANIFEST.
  This meant all 37+ template skills shipped on every init/upgrade, and
  overwriteOnUpgrade was never consulted.

  Now both code paths iterate TEMPLATE_MANIFEST entries:

  - init (SDK): only the 8 manifest skills are copied on first init
  - upgrade (CLI): syncAllSkills() reads manifest entries, respects overwriteOnUpgrade

  Fixes #833

- 29cedd0: perf(agents): parallelize charter discovery with concurrency limit to reduce multi-agent load time
- 10f5036: perf(resolution): memoize squad-dir lookups; deduplicate squads.json reads to reduce filesystem I/O on repeated resolution calls
- 892bd4f: perf(scheduler): convert sequential async execution to concurrent with bounded concurrency to improve multi-agent dispatch throughput
- 3bd1843: feat: add declarative plugin behavior context proof

  Adds static plugin metadata, lifecycle state, runtime context injection,
  declarative provider contracts, and behavior simulations for Graphify,
  MemPalace, and Index Server plugin samples. Enabled plugins can now contribute
  installed static guidance and typed memory/knowledge provider summaries to
  spawned-agent prompts while preserving the no-execution security boundary.

- aa91ba4: Add retro enforcement skill with Test-RetroOverdue and ceremonies template update.

  - New skill: retro-enforcement - coordinator integration pattern for automated retro cadence enforcement
  - Action items tracked as GitHub Issues (not markdown checklists)
  - Production data: 0% to 100% completion rate after switching formats
  - Test-RetroOverdue PowerShell function detects overdue retros and blocks work queue
  - Ceremonies template updated with enforcement-aware retrospective definition

- 8456549: Add SDK feature parity batch 2 — 64 tests covering manual ceremonies (#27), ceremony cooldown (#28), human team members (#36), constraint budget enforcement (#49 — rate limiter, file-write guards, shell restrictions, PII scrubbing), multi-agent artifact coordination (#50), and builder validation edge cases.
- 4f2de95: test: SDK feature parity batch 3 — 46 tests for #31, #47, #45, #46

  Adds 46 automated tests covering 4 SDK features from the #341 parity matrix:

  - RalphMonitor idle-watch mode (#31): construction, event handling, stale session detection
  - Platform detection (#47): GitHub/Azure DevOps URL parsing, detectPlatformFromUrl
  - Reviewer lockout (#45): rejection protocol, per-artifact scope, persistence
  - Deadlock handling (#46): all-agents-locked detection, clearLockout escalation, recovery

- eb17e15: Fix squad-commands skill routing and configuration for Copilot integration

  - **templates.ts**: Correct destination path for squad-commands SKILL.md from `skills/squad-commands/SKILL.md` to `../.copilot/skills/squad-commands/SKILL.md` to match other built-in skills
  - **init.ts**: Add `'squad-commands'` to MANIFEST_SKILL_NAMES array to include the skill in project initialization
  - **squad-commands SKILL.md**: Convert triggers from YAML list to inline array format and remove generic triggers ("help", "how do I") that conflict with other skills; retain: "squad commands", "what can squad do", "show me squad options", "slash commands"
  - **Template sync**: Regenerate all mirrors via sync-templates.mjs to propagate routing updates to .copilot and .squad templates

- a3419b5: Bump `@github/copilot-sdk` from `^0.1.32` to `^0.3.0` to fix ESM module resolution error (ERR_MODULE_NOT_FOUND for vscode-jsonrpc/node). Add explicit GitHub repo config support in `.squad/config.json` (`{ "github": { "owner": "...", "repo": "..." } }`) so platform adapter prefers user-specified repo over auto-detection from origin remote. (closes #1062, closes #905)
- 14917c5: State backend hardening: retry with exponential backoff for transient git errors, circuit-breaker to prevent cascading failures, read-only startup verification, and observable error surfacing replacing silent swallowing.
- 84872b1: Harden runtime state tools so write, append, and delete only mutate approved Squad runtime state paths, and refresh prompt templates to require state-tool persistence and literal datetime propagation.
- a543f93: Fix Windows Azure CLI execution and ADO state mapping in squad watch
