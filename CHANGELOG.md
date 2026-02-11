# Changelog

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
