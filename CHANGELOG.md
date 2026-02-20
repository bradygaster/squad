# Changelog

## [0.5.0] — 2026-02-20

### Added

- **`.ai-team/` renamed to `.squad/`** — Full directory rename with backward-compatible migration utilities for existing installations
- **Decision lifecycle management** — Archival and versioning support for design decisions across the agent lifecycle
- **Identity layer** — New `wisdom.md` and `now.md` files for agent context and temporal awareness
- **ISO 8601 UTC timestamps** — Standardized timestamp format throughout (decision dates, agent updates, metadata)
- **Cold-path extraction** — Refactored `squad.agent.md` to separate active decision paths from historical logic
- **Skills export/import verification** — Enhanced import/export validation and documentation for agent skill extension
- **Email scrubbing** — Automatic email removal during migration to prevent accidental PII commits

## [0.4.2] — 2026-02-20

### Fixed

- **`/agents` vs `/agent` CLI command** (#93) — README and install output now correctly reference `/agent` (the actual CLI command) instead of `/agents` (PR #100)

### Added

- **Insider Program infrastructure** (#94) — `insider` branch created with guard workflow enforcement; forbidden paths (`.ai-team/`, `.ai-team-templates/`, `team-docs/`, `docs/proposals/`) blocked from protected branches
- **Branch content policy** — Formal decision document defining which files belong on main, preview, and insider branches; includes 5-step branch creation checklist
- **Guard workflow update** — Added `docs/proposals/` to forbidden paths in `squad-main-guard.yml` (both `.github/workflows/` and `templates/workflows/`)
- **Custom universe support** (#97) — Star Trek universe added by community contributor @codebytes

## [0.4.1] — 2026-02-16

### Fixed

- **Ralph heartbeat workflow syntax** (#78) — Removed duplicate `issues:` trigger keys in `squad-heartbeat.yml`; combined into single trigger with both `closed` and `labeled` event types
- **Community page links** (#77) — Fixed broken GitHub Discussions links (Discussions now enabled on repo)
- **Task spawn UI** (#73) — Added role emoji to task description fields for visual consistency; 11 role patterns mapped to emoji (🏗️ Lead, 🔧 Backend, ⚛️ Frontend, 🧪 Tester, etc.)
- **Stale workflow references in docs** — Updated all documentation to reference correct `squad-heartbeat.yml` filename (previously `ralph-heartbeat.yml`)
- **Source repo .ai-team/ refreshed** (#67) — Squad's own team state updated to match current templates

### Added

- **Role emoji mapping** — Coordinator now includes role-based emoji in task descriptions for at-a-glance task list scanning
- **Deprecation banner for .ai-team/ → .squad/ rename** (#70) — CLI and coordinator now warn users that v0.5.0 will rename `.ai-team/` to `.squad/`; links to migration tracking issue #69
- **`squad upgrade --self` command** (#68) — New flag for refreshing squad repo's own `.ai-team/` from templates; preserves agent history, updates templates and skills

## [0.4.0] — 2026-02-15

### Added

- **MCP tool discovery and use** (PR #11 by @csharpfritz) — Auto-discover available MCP tools, graceful degradation if service unavailable, tool usage in agent workflows
- **User documentation improvements** (PR #16 by @csharpfritz) — Expanded guides, sample prompts, troubleshooting sections, release process documentation
- **VS Code client compatibility** (PR #17 by @spboyer) — Full support for VS Code Copilot without code changes; runSubagent parallel execution, zero-change deployment
- **Plugin marketplace concept** — Community skills from GitHub repos, auto-discover plugins, sandbox isolation
- **Agent notifications system** — Trello cards, Teams webhooks, GitHub Discussions posts; agents can emit lifecycle events
- **MCP integration for external services** — Auto-discover and integrate Trello, Azure, Notion, GitHub, Slack MCP tools; graceful degradation
- **Progress signals for long-running work** — `[MILESTONE]` markers in agent output, coordinator relays progress to user
- **Notification channels** — Trello cards for work items, Teams webhooks for milestones, GitHub Discussions for team updates
- **Earned skills improvements** — Better confidence scoring, export/import polish, skill discovery from real work
- **Universe expansion** — 11 new universes (Futurama, Seinfeld, The Office, Cowboy Bebop, FMA, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune, Adventure Time); casting universe now 31 total (up from 20)
- **Branch protection guard** (squad-main-guard.yml) — Prevents `.ai-team/` and internal `team-docs/` from shipping on main and preview branches
- **Release process documentation** (docs/scenarios/release-process.md) — Complete step-by-step guide for maintainers: preview builds, PR workflows, full release lifecycle, guard testing, troubleshooting

### Changed

- VS Code is now fully compatible — zero code changes required; agents run identically on CLI and VS Code
- Agent progress signals use `[MILESTONE]` markers for coordinator relay
- 6 new GitHub Actions workflows added: squad-main-guard.yml, squad-heartbeat.yml, squad-issue-assign.yml, squad-label-enforce.yml, squad-triage.yml, sync-squad-labels.yml
- Universe count: 20 → 31 (added 11 new universes)

### Community

- @csharpfritz: MCP tool discovery (#11), user documentation improvements (#16)
- @spboyer: VS Code client compatibility (#17)
- @essenbee2, @miketsui3a, @londospark: Issue contributions and feedback
- External universe contributions: Futurama, Seinfeld, The Office, Cowboy Bebop, Full Metal Alchemist, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune, Adventure Time casting universes

## [0.3.0] — 2026-02-11

### Added

- **Per-agent model selection** — Cost-first model routing with 16-model catalog, role-to-model mapping, task-aware auto-selection, fallback chains, user overrides
- **Ralph — Work Monitor** (PR #15 by @spboyer) — Built-in squad member with self-chaining work loop, heartbeat workflow (`squad-heartbeat.yml`), board status reporting, never-stop semantics
- **@copilot Coding Agent integration** (PR #13 by @spboyer) — Three-tier capability profile, auto-assign workflow, `squad copilot` CLI subcommand
- **Universe expansion** — Casting universe allowlist expanded from 14 to 20 (added Succession, Severance, Lord of the Rings, Attack on Titan, Doctor Who, Monty Python)
- **"Milestones" rename** — Release planning units renamed from "sprints" to "milestones", aligning with GitHub Milestones

### Changed

- Test suite expanded from 92 to 118 tests
- Emoji encoding fixes in test suite (8 mojibake strings corrected)
- `squad.agent.md` significantly expanded with model selection, Ralph, @copilot sections
- `index.js` updated with upgrade early-exit fix (refreshes workflows and agent.md)

### Community

- Two PRs from @spboyer (Shayne Boyer): Ralph work monitor (#15) and @copilot coding agent (#13)
- New issues from @csharpfritz (#11 MCP, #16 user docs), @essenbee2 (#8 platform lock-in), @miketsui3a (#9 task tool naming), @londospark (#6 project boards)

## [0.2.0] — 2026-02-09

### Added

#### Wave 2
- **Tiered response modes** — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead; agents can now be invoked with lightweight templates for simple tasks
- **Smart upgrade with migrations** — `upgrade` detects installed version, reports delta, runs additive migrations (e.g., creating `.ai-team/skills/`); idempotent and safe to re-run
- **Skills Phase 1** — agents read `SKILL.md` files from `.ai-team/skills/` before working; starter skills bundled on init
- **Export CLI** (`squad export`) — exports squad to a portable `squad-export.json` snapshot including agents, casting state, and skills
- **Ceremonies** — `.ai-team/ceremonies.md` config copied on init for team ritual definitions
- **Worktree awareness** — coordinator documents worktree interaction for parallel issue work
- **Scribe auto-commit** — decisions inbox pattern with Scribe agent for persistent memory management
- **Decision consolidation** — shared `decisions.md` with inbox merge workflow
- **Context caching** — coordinator optimizes context reads to reduce redundant file loads

#### Wave 2.5 (PR #2 — @shayneboyer)
- **GitHub Issues Mode** — `gh` CLI integration for issue-driven development with branch naming, PR submission, and review handling
- **PRD Mode** — product requirements documents stored in `team.md`, decomposed into work items by Lead agent
- **Human Team Members** — non-AI team members with badge, pause-on-route, stale reminders, and reviewer integration

#### Wave 3
- **Import CLI** (`squad import <file>`) — imports squad from export files with collision detection, `--force` archiving, and portable knowledge markers
- **Skills Phase 2 (earned skills)** — agents can write `SKILL.md` files from real work; confidence lifecycle: low → medium → high
- **Progressive history summarization** — agent histories split into portable knowledge vs. project-specific learnings during import
- **Lightweight spawn template** — reduced-overhead agent invocation for simple tasks (no charter/history/decisions reads)

### Changed
- Test suite expanded from 27 to 92 tests covering all new features (export, import, smart upgrade, migrations, skills, prompt content validation)
- `index.js` grew from 88 to 529 lines — now handles init, upgrade, export, import, migrations, and version stamping
- `--help` output updated with export and import commands

### Community
- First external PR integrated (PR #2 by Shayne Boyer) — GitHub Issues Mode, PRD Mode, Human Team Members

## [0.1.0] — 2026-02-08

### Added
- Coordinator agent (`squad.agent.md`) — orchestrates team formation and parallel work
- Init command (`npx github:bradygaster/squad`) — copies agent file and templates, creates placeholder directories
- Upgrade command (`npx github:bradygaster/squad upgrade`) — updates Squad-owned files without touching team state
- Template system — charter, history, roster, routing, orchestration-log, run-output, raw-agent-output, scribe-charter, casting config (policy, registry, history)
- Persistent thematic casting — agents get named from film universes (The Usual Suspects, Alien, Ocean's Eleven)
- File ownership model — Squad owns `squad.agent.md` and `.ai-team-templates/`; users own `.ai-team/`
- Parallel agent execution — coordinator fans out work to multiple specialists simultaneously
- Memory architecture — per-agent `history.md`, shared `decisions.md`, session `log/`
- Reviewer protocol — agents with review authority can reject work and reassign
- Scribe agent — silent memory manager, merges decisions, maintains logs
- `--version` / `-v` flag
- `--help` / `-h` flag and `help` subcommand
- CI pipeline (GitHub Actions) — tests on push/PR to main and dev
- Test suite — 27 tests covering init, re-init, upgrade, flags, error handling, and edge cases

### What ships
- `index.js` — the CLI entry point
- `.github/agents/squad.agent.md` — the coordinator agent
- `templates/**/*` — 11 template files (charter.md, history.md, roster.md, routing.md, orchestration-log.md, run-output.md, raw-agent-output.md, scribe-charter.md, casting-policy.json, casting-registry.json, casting-history.json)

These are the only files distributed via `npx github:bradygaster/squad`. Defined by the `files` array in `package.json`.

### What doesn't ship
- `.ai-team/` is NOT in the package — it is created by Copilot at runtime when agents form a team
- `test/`, `.ai-team/`, `.github/workflows/` — development and team artifacts stay in the source repo only
- Agent knowledge (history, decisions, casting state) — generated per-project, never bundled
