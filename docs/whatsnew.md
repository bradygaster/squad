# What's New

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Full release history for Squad — from beta through the v1 TypeScript replatform. Jump to the version you're looking for, or read top-down to see how the project evolved.

---

## v0.8.21 — Current Release

- **`squad migrate` command** — New automated migration command that backs up, cleans, and reinitialises `.squad/` in one step. Supports `--dry-run`, `--backup-dir`, and `--restore [path]` flags. Auto-rollback on failure.
- **Shell re-init fix** — After `squad migrate`, the interactive shell no longer incorrectly treats a migrated install as brand-new (deletes stale `.first-run` / `.init-prompt` markers post-reinit).
- **Casting registry fix** — `squad migrate` now restores or synthesises `casting/registry.json` after reinit. Handles both v0.8.x repos (restore from backup) and v0.5.x repos (generate from restored `agents/` directory).
- **Cast overwrite guard** — `createTeam()` no longer overwrites existing `charter.md` or non-empty `history.md` when re-casting after a migration.

---

## v0.8.2

- **Version alignment** — CLI (0.8.1) and SDK (0.8.0) snapped to 0.8.2 across all packages
- **Published to npm** — `@bradygaster/squad-sdk@0.8.2` and `@bradygaster/squad-cli@0.8.2`
- **Remote squad mode** (ported from @spboyer's [PR #131](https://github.com/bradygaster/squad/pull/131)):
  - `resolveSquadPaths()` dual-root resolver for project-local vs team identity directories (#311)
  - [`squad doctor` command](reference/cli.md) — 9-check setup validation with emoji output (#312)
  - [`squad link` command](reference/cli.md) — link a project to a remote team root (#313)
  - `squad init --mode remote` — initialize with remote team config (#313)
  - `ensureSquadPathDual()` and `ensureSquadPathResolved()` dual-root write guards (#314)
- **CopilotSessionAdapter** (#315) — Wraps `@github/copilot-sdk` CopilotSession to map `sendMessage`→`send`, `on`→unsubscribe tracking, `destroy`→`close`. Fixed P0 "sendMessage is not a function" Codespace bug.
- **Adapter hardening** (#316–#322) — 7 issues fixed:
  - EVENT_MAP with 10 event type mappings and REVERSE_EVENT_MAP for normalization
  - Typed field mapping replacing all `as unknown as` casts
  - Per-event-type unsubscribe tracking
  - Zero unsafe casts remaining in adapter layer
- **Docs restructure** — 85 pages across 6 sections:
  - Getting Started (10), CLI (3), SDK (3), Features (25), Scenarios (21), Blog (23)
  - Ported all 44 scenario + feature docs from beta
  - 8 new blog posts covering the replatform arc
  - Custom static site generator with markdown-it, frontmatter, search index
- **GitHub Pages** — Live docs site with dark mode, client-side search, sidebar nav, beta site UI
- **Test baseline** — 2232 tests across 85 test files

## v0.6.0 — The TypeScript Replatform

The big rewrite. Everything moved to TypeScript with a clean SDK + CLI split.

- **Full rewrite** — JavaScript → TypeScript with strict mode, ESM modules, Node.js ≥20
- **SDK + CLI split** — Two npm packages: `@bradygaster/squad-sdk` (runtime, adapter, resolution) and `@bradygaster/squad-cli` (commands, shell, REPL)
- **npm workspace** — Monorepo with `packages/squad-sdk` and `packages/squad-cli`
- **Interactive shell** — `squad` with no args launches rich REPL with streaming, welcome banner, session registry
- **OpenTelemetry integration** — 3-layer API (low-level otel.ts, bridge otel-bridge.ts, init otel-init.ts), SquadObserver file watcher, Aspire dashboard support
- **Adapter layer** — `CopilotSessionAdapter` bridging `@github/copilot-sdk` to Squad's session interface
- **Constants extraction** — `MODELS`, `TIMEOUTS`, `AGENT_ROLES` centralized in constants.ts
- **Security** — `execFileSync` with array args replacing `execSync` template strings (CWE-78 fix)
- **Wave-based development** — 3 waves of parallel fan-out:
  - Wave 1: OTel, Aspire, SquadObserver, upstream docs
  - Wave 2: REPL polish, CWE-78 fix, config extraction, 119 new tests, Aspire E2E
  - Wave 3: Docs migration, site engine, 5 guides
- **CLI entry point** — Moved from `dist/index.js` to `dist/cli-entry.js`
- **CRLF normalization** — All 8 parsers normalize line endings; Windows users with `core.autocrlf=true` work correctly

### Breaking Changes (v0.6.0)

| Change | Migration |
|--------|-----------|
| Config file: `squad.agent.md` → `squad.config.ts` | Run `squad init` to generate typed config |
| Team dir: `.squad/` | Standard directory for all team state |
| Routing: markdown rules → typed `RoutingRule[]` | Export existing rules with `squad export` |
| Models: string names → tier-based `ModelConfig` | Use `defaultTier` + `fallbackChains` in config |

## v0.6.0-alpha.0

- **Initial replatform** — First working TypeScript build
- **CLI commands** — init, upgrade, shell, doctor, link
- **npm distribution** — `npm install @bradygaster/squad-cli`
- **Branch protection** — `main` requires PR + build check
- **Changesets** — Infrastructure for independent package versioning

## v0.5.2

- **`upgrade --migrate-directory` exits early fix** — The directory rename step no longer calls `process.exit(0)`, so the full upgrade now runs in one command
- **`.slnx`, `.fsproj`, `.vbproj` not detected as .NET** — Proper Visual Studio solution files and F#/VB.NET project files now detected
- **Migrations use detected squad directory** — Migration steps and `.gitattributes` rules now use the detected squad directory

## v0.5.1

- **`squad watch` — Local Watchdog** — Persistent polling for unattended work processing. Run `squad watch` to check GitHub every 10 minutes for untriaged squad work; use `--interval` flag to customize polling
- **Project type detection** — Squad detects your project's language and stack to intelligently configure workflows
- **Git safety rules** — Guardrails enforced based on detected project type

## v0.5.0 — The `.squad/` Rename Release

- **`.squad/` directory** — Full directory rename with backward-compatible migration utilities. Existing repos continue to work; migration required by v1.0.0.
- **Decision lifecycle management** — Archival and versioning support for design decisions
- **Identity layer** — New `wisdom.md` and `now.md` files for agent context and temporal awareness
- **ISO 8601 UTC timestamps** — Standardized timestamp format throughout
- **Cold-path extraction** — Refactored coordinator from ~30KB to ~17KB
- **Skills export/import verification** — Enhanced validation for agent skill extension
- **Email scrubbing** — Automatic PII removal during migration

## v0.4.2

- **`/agent` vs `/agents` CLI command fix** — Correctly reference `/agent` (CLI) and `/agents` (VS Code)
- **Insider Program infrastructure** — `insider` branch with guard workflow enforcement
- **Branch content policy** — Formal decision document for branch safety
- **Custom universe support** — Star Trek universe added by community contributor @codebytes

## v0.4.1

- **Task spawn UI** — Role emoji for visual consistency (🏗️ Lead, 🔧 Backend, ⚛️ Frontend, 🧪 Tester, etc.)
- **`squad upgrade --self` command** — Refresh `.squad/` from templates while preserving agent history
- **Deprecation banner** — CLI and coordinator warn about the `.squad/` rename

## v0.4.0

- **Client Compatibility** — Full platform support matrix for CLI and VS Code
- **VS Code Support** — First-class VS Code guide with `runSubagent` parallel spawning
- **Project Boards** — GitHub Projects V2 integration with board + Kanban views
- **Label Taxonomy** — 7-namespace label system (status:, type:, priority:, squad:, go:, release:, era:)
- **Notifications** — Squad pings you on Teams, iMessage, or Discord when input is needed
- **MCP Setup Guide** — Step-by-step MCP configuration for CLI and VS Code
- **Plugin Marketplace** — Discover and install curated agent templates and skills
- **Universe Expansion** — 20 → 33 casting universes
- **Context Optimization** — decisions.md pruned from ~80K to ~33K tokens; per-agent context usage dropped from 41–46% to 17–23%

## v0.3.0

- **Per-Agent Model Selection** — Cost-first routing with 16-model catalog and fallback chains
- **Ralph — Work Monitor** — Built-in squad member that autonomously processes backlogs
- **@copilot Coding Agent** — GitHub's Copilot agent as a squad member with three-tier capability profile
- **Universe Expansion** — 14 → 20 casting universes

## v0.2.0

- **Export & Import CLI** — Portable team snapshots for moving squads between repos
- **GitHub Issues Mode** — Issue-driven development with `gh` CLI integration
- **PRD Mode** — Product requirements decomposition into work items
- **Human Team Members** — Mixed AI/human teams with routing
- **Skills System** — Earned knowledge with confidence lifecycle
- **Tiered Response Modes** — Direct/Lightweight/Standard/Full response depth
- **Smart Upgrade** — Version-aware upgrades with migrations

## v0.1.0

- **Coordinator agent** — Orchestrates team formation and parallel work
- **Init command** — `squad` copies agent file and templates
- **Upgrade command** — `squad upgrade` updates Squad-owned files without touching team state
- **Template system** — Charter, history, roster, routing, and more
- **Persistent thematic casting** — Agents named from film universes
- **Parallel agent execution** — Coordinator fans out work to multiple specialists simultaneously
- **Memory architecture** — Per-agent `history.md`, shared `decisions.md`, session `log/`
- **Reviewer protocol** — Agents with review authority can reject work and reassign
- **Scribe agent** — Silent memory manager, merges decisions, maintains logs
