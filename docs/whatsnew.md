# What's New

Full release history for Squad. For the latest version, see [README](../README.md).

## v0.5.3

### Bug Fixes
- **Windows EPERM fallback** — `safeRename()` catches EPERM/EACCES errors (VS Code file watchers hold handles on Windows), falls back to copy+delete. Fixes #135, PR #149.
- **`--version` now shows installed version** — `npx github:bradygaster/squad --version` now shows both the installed Squad version AND the Copilot CLI version on separate lines. Fixes #137, PR #149.
- **Content replacement in migrate-directory** — When migrating from `.ai-team/` to `.squad/`, file contents (not just paths) now get `.ai-team/` references replaced with `.squad/`. Fixes #134, PR #151.

### Behavior Change
- **Guard workflow removed** — The `squad-main-guard.yml` workflow that blocked `.squad/` files from reaching main/preview has been removed. `.squad/` files now flow freely to all branches. Users who want to exclude `.squad/` can use `.gitignore`. Existing installations get the guard auto-deleted on next `squad upgrade` (v0.5.4 migration). Fixes #150, PR #152.

### Community
- Responded to and closed community issues #146, #145, #139
- Filed 4 port issues on squad-pr (#548-551) for cross-repo parity

### Looking Ahead
The next release of Squad will be more significant than prior releases, bringing Squad to NPM for easier installation. The package will still ship from this repository, so existing users will see a transparent change. Issues or PRs filed between now and that release may be held until the next update is complete. We appreciate the community's continued support and look forward to sharing what's coming.

## v0.5.2

- **`upgrade --migrate-directory` exits early fix** — The directory rename step no longer calls `process.exit(0)`, so the full upgrade (squad.agent.md, workflows, .ai-team-templates) now runs after migration in one command
- **`.slnx`, `.fsproj`, `.vbproj` not detected as .NET** — Proper Visual Studio solution files and F#/VB.NET project files now detected; repos using these get proper dotnet stub CI workflows
- **Migrations use detected squad directory** — Migration steps and `.gitattributes` rules now use the detected squad directory (`.squad/` or `.ai-team/`) so they work correctly after `--migrate-directory` runs

## v0.5.1

- [**`squad watch` — Local Watchdog**](../docs/features/ralph.md#watch-mode) — Persistent polling for unattended work processing. Run `npx github:bradygaster/squad watch` to check GitHub every 10 minutes for untriaged squad work; use `--interval` flag to customize polling (e.g., `squad watch --interval 5` for 5-minute polling). Runs until Ctrl+C.
- **Project type detection** — Squad now detects your project's language and stack (JavaScript, Python, Java, Go, Rust, .NET, etc.) to intelligently configure workflows
- **Git safety rules** — Guardrails enforced based on detected project type to prevent common mistakes and state corruption

## v0.5.0 — The `.squad/` Rename Release

- [**`.ai-team/` renamed to `.squad/`**](../docs/migration/v0.5.0-squad-rename.md) — Full directory rename with backward-compatible migration utilities. Existing repos continue to work; migration required by v1.0.0.
- [**Decision lifecycle management**](../docs/features/decision-lifecycle.md) — Archival and versioning support for design decisions across the agent lifecycle
- **Identity layer** — New `wisdom.md` and `now.md` files for agent context and temporal awareness
- **ISO 8601 UTC timestamps** — Standardized timestamp format throughout (decision dates, agent updates, metadata)
- **Cold-path extraction** — Refactored `squad.agent.md` into active decision paths and on-demand satellite files, reducing coordinator size from ~30KB to ~17KB
- **Skills export/import verification** — Enhanced validation and documentation for agent skill extension
- **Email scrubbing** — Automatic PII removal during migration to prevent accidental email commits

## v0.4.2

- **`/agent` vs `/agents` CLI command fix** — README and install output now correctly reference `/agent` (the CLI command) instead of `/agents` (VS Code shortcut)
- [**Insider Program infrastructure**](../docs/insider-program.md) — `insider` branch with guard workflow enforcement; forbidden paths blocked from protected branches to maintain code safety
- **Branch content policy** — Formal decision document defining which files belong on main, preview, and insider branches; includes 5-step branch creation checklist
- **Custom universe support** — Star Trek universe added by community contributor @codebytes

## v0.4.1

- **Task spawn UI** — Added role emoji to task descriptions for visual consistency; 11 role patterns mapped to emoji (🏗️ Lead, 🔧 Backend, ⚛️ Frontend, 🧪 Tester, etc.)
- **Ralph heartbeat workflow syntax fix** — Removed duplicate `issues:` trigger keys in `squad-heartbeat.yml`; combined into single trigger
- **Community page links fixed** — GitHub Discussions links now work correctly (Discussions enabled on repo)
- [**`squad upgrade --self` command**](../docs/scenarios/upgrading.md) — New flag for refreshing squad repo's own `.ai-team/` from templates; preserves agent history
- **Deprecation banner for .ai-team/ → .squad/ rename** — CLI and coordinator warn users that v0.5.0 will rename `.ai-team/` to `.squad/`
- **Stale workflow references fixed** — All documentation updated to reference correct `squad-heartbeat.yml` filename

## v0.4.0

- [**Client Compatibility**](../docs/scenarios/client-compatibility.md) — Full platform support matrix. Squad now works on CLI and VS Code with graceful degradation.
- [**VS Code Support**](../docs/features/vscode.md) — First-class VS Code guide. `runSubagent` parallel spawning, platform detection, feature degradation table.
- [**Project Boards**](../docs/features/project-boards.md) — GitHub Projects V2 integration. Board + Kanban views synced from labels. `gh auth refresh -s project` required.
- [**Label Taxonomy**](../docs/features/labels.md) — 7-namespace label system (status:, type:, priority:, squad:, go:, release:, era:). Labels are the state machine; boards are projections.
- [**Notifications**](../docs/features/notifications.md) — Your squad pings you on Teams, iMessage, or Discord when they need input. Zero infrastructure in Squad — bring your own MCP notification server.
- [**MCP Setup Guide**](../docs/features/mcp.md) — Step-by-step MCP configuration for CLI and VS Code. Examples: GitHub, Trello, Aspire dashboard.
- [**Plugin Marketplace**](../docs/features/plugins.md) — Discover and install curated agent templates and skills from community repositories. Auto-recommend plugins when adding team members.
- **Universe Expansion** — 20 → 33 casting universes (MCU, DC, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune, Cowboy Bebop, Fullmetal Alchemist, Seinfeld, The Office, Adventure Time, Futurama, + 2 more)
- **Docs Growth** — 49 docs across features, scenarios, and guides
- **Context Optimization** — decisions.md pruned from ~80K to ~33K tokens (251 → 78 blocks). Spawn templates deduplicated. Per-agent context usage dropped from 41–46% to 17–23%. Agents now have 78–83% of their context window for actual work.
- **Core Growth** — squad.agent.md: 1,100 → 1,771 lines; index.js: 654 lines; 188+ total commits

## v0.3.0

- [**Per-Agent Model Selection**](../docs/features/model-selection.md) — Cost-first routing: code work gets standard-tier models (claude-sonnet-4.5), non-code tasks use fast/cheap models (claude-haiku-4.5). 16-model catalog with fallback chains.
- [**Ralph — Work Monitor**](../docs/features/ralph.md) — Built-in squad member that autonomously processes backlogs. Self-chaining work loop: scan GitHub → spawn agents → collect results → repeat.
- [**@copilot Coding Agent**](../docs/features/copilot-coding-agent.md) — GitHub's Copilot agent as a squad member. Three-tier capability profile. Auto-assign with workflow.
- **Universe Expansion** — 14 → 20 casting universes (Succession, Severance, Lord of the Rings, Attack on Titan, Doctor Who, Monty Python)
- **Milestones Rename** — "Sprints" → "Milestones" (GitHub-native alignment)
- **Test Growth** — 92 → 118 tests
- **Emoji Fixes** — Test suite encoding standardized

## v0.2.0

- [**Export & Import CLI**](../docs/features/export-import.md) — Portable team snapshots for moving squads between repos
- [**GitHub Issues Mode**](../docs/features/github-issues.md) — Issue-driven development with `gh` CLI integration
- [**PRD Mode**](../docs/features/prd-mode.md) — Product requirements decomposition into work items
- [**Human Team Members**](../docs/features/human-team-members.md) — Mixed AI/human teams with routing
- [**Skills System**](../docs/features/skills.md) — Earned knowledge with confidence lifecycle
- [**Tiered Response Modes**](../docs/features/response-modes.md) — Direct/Lightweight/Standard/Full response depth
- [**Smart Upgrade**](../docs/scenarios/upgrading.md) — Version-aware upgrades with migrations

## v0.1.0

- **Coordinator agent** — Orchestrates team formation and parallel work across specialized agents
- **Init command** — `npx github:bradygaster/squad` copies agent file and templates, creates placeholder directories
- **Upgrade command** — `npx github:bradygaster/squad upgrade` updates Squad-owned files without touching team state
- **Template system** — Charter, history, roster, routing, orchestration-log, run-output, raw-agent-output, scribe-charter, casting config
- **Persistent thematic casting** — Agents get named from film universes (The Usual Suspects, Alien, Ocean's Eleven)
- **Parallel agent execution** — Coordinator fans out work to multiple specialists simultaneously
- **Memory architecture** — Per-agent `history.md`, shared `decisions.md`, session `log/`
- **Reviewer protocol** — Agents with review authority can reject work and reassign
- **Scribe agent** — Silent memory manager, merges decisions, maintains logs
