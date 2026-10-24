---
title: Host Feature Matrix
description: Which Squad features work on which host (Copilot, Claude Code, Kiro, OpenCode, Cursor, Codex, Antigravity), what each depends on, and how each cell has been validated.
order: 16
---

# Host Feature Matrix

<!-- GENERATED from test-fixtures/spec/suite-v0.2/host-feature-matrix.json by scripts/render-host-feature-matrix.mjs. Edit the JSON, then re-run the script. -->

> 🔗 Related: [Squad 2.0 Architecture](/squad/docs/concepts/squad-2-0-architecture/) · [Using Squad Across Clients](/squad/docs/scenarios/using-squad-across-clients/) · [Client Compatibility](/squad/docs/scenarios/client-compatibility/)

Squad features fall into five dependency classes. Features that depend only on the `squad` CLI (class **a**) behave identically everywhere because the host is not involved. Everything else depends on what the host's coordinator file contains, whether the `squad_state` MCP bridge is reachable, and what the host runtime can do. The machine-readable source is `test-fixtures/spec/suite-v0.2/host-feature-matrix.json` (protocol `squad-protocol-v2.0-rc1`).

## Dependency classes

| Class | Depends on |
|-------|------------|
| **a** | squad CLI only (host-agnostic; the host is not involved) |
| **b** | coordinator-prompt behavior (the section must be present in the host's coordinator file or reachable on demand) |
| **c** | squad_state / memory.* MCP tools (state-mcp bridge reachable from the host) |
| **d** | host runtime capability (subagent spawn, background tasks, shell, file ops, sql, per-spawn model, MCP inheritance by subagents) |
| **e** | platform CLI or MCP availability in the host (gh / glab / az / ADO MCP / GitHub MCP) |

## Legend

Every cell has two independent values. **Capability** says what the host can do; **validation** says how that claim was established. Neither implies the other: a `supported` cell may be only `static-only`, and an `unsupported` cell can be `validated-test` (a test proves the gap).

| Capability | Meaning |
|------------|---------|
| ✅ `supported` | The host can do this through the stated mechanism, with no known limitation. |
| ⚠️ `degraded` | The host does this partially: it works, but with the stated limitation (for example a synchronous fallback, an on-demand path, or a host runtime gap). |
| ❌ `unsupported` | The host cannot do this today — including every case where the coordinator section the feature relies on is absent from the host's projected digest. Stays unsupported until the section ships. |
| — `n/a` | Not applicable to this host (a Copilot-only surface or something that runs outside the host). |

| Validation | Meaning |
|------------|---------|
| 🧪 `validated-test` | An automated test in this repository asserts the cell (see `evidence`; CLI/SDK tests are host-independent). For `unsupported` digest-gap cells this is the per-host `it.fails` that proves the section is absent. |
| 🖥️ `validated-live` | A recorded headless run of the real host CLI against a real model passed on the reference machine (Claude Code and OpenCode only, 2026-10-22); the test-level evidence also applies. |
| 📄 `static-only` | Only the projected/canonical text or the source was inspected; no automated or live evidence for this cell. |
| ❔ `untested` | Nothing beyond static reading, and no live attempt was made for this host. |
| ⛔ `blocked` | A live run was attempted for this host and could not complete for an external reason (`blockedReason`); confidence is the same as `untested`. |

| Evidence entry | Meaning |
|----------------|---------|
| `validated-test:<file>::<name>` | Automated test (name `*` = the whole file). The title must appear literally in the file. |
| `validated-manual:lab:<scenario>@<date>` | A recorded live run (see the live run log) for this host and scenario. |
| `static-only` | Marker: the cell was (also) read statically. |

Each matrix cell shows **capability validation** (for example `✅ 🧪` = supported, covered by an automated test; `❌ 🧪` = unsupported, proven by an expected-failure test; `✅ 📄` = supported, statically inspected only; `✅ ⛔` = supported on paper, the live attempt for this host was blocked).

## Hosts

| Host | CLI | Coordinator file | MCP config | Subagents | Background | Per-spawn model | Subagents inherit MCP |
|------|-----|------------------|------------|-----------|------------|-----------------|-----------------------|
| **GitHub Copilot (CLI / app / VS Code)** (`copilot`) | `copilot` | .github/agents/squad.agent.md (canonical) | .mcp.json | yes | yes | yes | yes |
| **Claude Code** (`claude`) | `claude` | .claude/agents/squad.md (digest) + CLAUDE.md block | .mcp.json | yes | yes | no | yes |
| **Kiro CLI** (`kiro`) | `kiro-cli` | .kiro/agents/squad.json + .kiro/steering/squad.md (manual) | .kiro/settings/mcp.json | yes | no | no | yes |
| **OpenCode** (`opencode`) | `opencode` | .opencode/agents/squad.md (primary) | opencode.json (mcp.squad_state) | yes | yes | no | yes |
| **Cursor** (`cursor`) | `cursor-agent` (installed; the live smoke run was blocked by a usage limit (see live run log), so cells without a dedicated test are untested) | .cursor/rules/squad.mdc (alwaysApply: false) + .cursor/agents/squad.md | .cursor/mcp.json | yes | no | no | yes |
| **OpenAI Codex** (`codex`) | `codex` (not on the reference machine → static-only) | .codex/agents/squad.toml (developer_instructions) + AGENTS.md pointer | .codex/config.toml (mcp_servers.squad_state) | yes | no | no | yes |
| **Google Antigravity** (`antigravity`) | `agy` | .agents/agents/squad.md + GEMINI.md block | agent frontmatter mcpServers (or `agy mcp add`) | yes | no | no | no |

## Summary

Capability counts and validation counts are independent breakdowns of the same cells (each row sums to the feature count twice).

| Host | ✅ supported | ⚠️ degraded | ❌ unsupported | — n/a | 🖥️ validated-live | 🧪 validated-test | 📄 static-only | ❔ untested | ⛔ blocked | of which expected-failure gaps |
|------|-------------|-------------|----------------|-------|-------------------|-------------------|----------------|------------|------------|--------------------------------|
| `copilot` | 45 | 0 | 6 | 0 | 0 | 49 | 2 | 0 | 0 | 6 |
| `claude` | 41 | 1 | 6 | 3 | 18 | 30 | 3 | 0 | 0 | 6 |
| `kiro` | 40 | 2 | 6 | 3 | 0 | 47 | 3 | 0 | 1 | 6 |
| `opencode` | 41 | 1 | 6 | 3 | 18 | 30 | 3 | 0 | 0 | 6 |
| `cursor` | 40 | 2 | 6 | 3 | 0 | 47 | 3 | 0 | 1 | 6 |
| `codex` | 40 | 2 | 6 | 3 | 0 | 47 | 3 | 1 | 0 | 6 |
| `antigravity` | 39 | 3 | 6 | 3 | 0 | 47 | 3 | 0 | 1 | 6 |

## Expected failures (`it.fails`)

These digest gaps are pinned as expected failures, one test per host and gap: the `[<host>]` test turns red the moment a stack adds the section for that host. Until then the cell is **unsupported** for that host (validated by the failing test), never degraded or supported.

| Feature | Test (title; each generated test appends the host as `[<host>]`) | Hosts | Meaning |
|---------|-----------------------------|-------|---------|
| [monorepo-team-root](#monorepo-team-root) | `test/clients.test.ts::digest gap (expected until the stack adds it): team-root resolution (teamRoot / stateLocation / TEAM_ROOT)` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |
| [dual-root-remote-mode](#dual-root-remote-mode) | `test/clients.test.ts::digest gap (expected until the stack adds it): team-root resolution (teamRoot / stateLocation / TEAM_ROOT)` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |
| [azure-devops](#azure-devops) | `test/clients.test.ts::digest gap (expected until the stack adds it): Azure DevOps issue tracking (az boards / ADO)` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |
| [gitlab-issues](#gitlab-issues) | `test/clients.test.ts::digest gap (expected until the stack adds it): GitLab issue tracking (glab)` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |
| [model-selection](#model-selection) | `test/clients.test.ts::digest gap (expected until the stack adds it): per-agent model / reasoning / context-tier selection` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |
| [marketplace-plugins](#marketplace-plugins) | `test/clients.test.ts::digest gap (expected until the stack adds it): plugin marketplace browse on cast` (it.fails, per host) | `copilot` `claude` `kiro` `opencode` `cursor` `codex` `antigravity` | The projected digest lacks this canonical section on the listed hosts; one it.fails per host (title suffixed `[<host>]`) turns red the moment a stack adds it. Every listed cell is `unsupported` for that host until then. |

## Known limitations of this evidence

- Capability and validation are separate axes: a `supported` cell may be only `static-only`, and an `unsupported` digest-gap cell is `validated-test` because an `it.fails` proves the gap. Read both columns.
- Expected failures are pinned per host and per gap (one `it.fails` per `<gap> [<host>]` pair); a section landing for one host turns exactly that host's test red. Those cells are `unsupported`, never `degraded`.
- Live evidence exists for Claude Code and OpenCode only (reference machine, 2026-10-22). Kiro, Codex, Antigravity and Cursor have no passing live run: their cells are `validated-test` only through host-independent tests, otherwise `static-only`, `untested` or `blocked`.
- The opt-in headless coordinator tests (`SQUAD_REAL_MODEL_TESTS=1`) verify the MCP bridge through a tee'd `squad state-mcp` transcript (a successful `tools/call` of `squad_state_read` with `key: "team.md"`), not by matching stdout. No other cell claims bridge-level verification.

## Matrix

### Core

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Init Mode & casting (`squad init`, `squad cast --name`, casting registry)](#init-mode-casting) | a, b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Work routing by ownership (`routing.md`, one accountable owner, named requests)](#routing-ownership) | b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Response modes (Direct / Lightweight / Standard / Full) + "feels heard" acknowledgement](#response-modes) | b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Model / reasoning-effort / context-tier selection per spawn](#model-selection) | b, d | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |
| [Parallel fan-out of independent specialists](#parallel-fanout) | b, d | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Background agents (Scribe/Rai run non-blocking)](#background-agents) | d | ✅ 🧪 | ✅ 🖥️ | ⚠️ 🧪 | ✅ 🖥️ | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [Skills (5 roots, precedence, untrusted-data rule)](#skills-precedence) | b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Standalone install (no npm; `squad.exe state-mcp` launch spec)](#standalone-install) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [VS Code (`runSubagent`, settings default agent)](#vscode) | d | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |
| [SDK-first mode (`squad.config.ts`, `squad build`, `squad migrate`)](#sdk-first-mode) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Maintenance CLIs (`squad doctor`, `squad health`, `squad nap`, `squad upgrade`)](#doctor-health-nap) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Process hygiene (never kill by image name; PID-only)](#process-hygiene) | b | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |

### Memory

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Scribe, decisions drop-box, agent history, orchestration log](#scribe-decisions-history) | b, c | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Directive capture ("always…/never…" → `squad_decide`)](#directive-capture) | b, c | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Memory governance (`memory.*` tools, classes, promote/audit)](#memory-governance) | c | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [State backends (`local` / `orphan` / `two-layer`) + handshake](#state-backends) | a, c, b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |

### Quality

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Reviewer rejection protocol & strict author lockout](#reviewer-lockout) | b | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Rai — Responsible-AI reviewer (🟢/🟡/🔴)](#rai) | b, d | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Fact Checker — verification & devil's advocate](#fact-checker) | b | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |

### Advanced

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Ceremonies (before/after/manual, cooldowns)](#ceremonies) | b, c | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Human team members (never spawned; routed as requests)](#human-members) | b | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [PRD mode (decompose → approve → dependency-aware dispatch)](#prd-mode) | b | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Git worktrees & worktree mode (issue worktrees, `WORKTREE_PATH`)](#git-worktrees) | a, b, d | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Export / import (`squad export`, `squad import`, team portability)](#export-import) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Marketplace & plugins (`squad plugin marketplace …`, skill install on cast)](#marketplace-plugins) | a, b | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |
| [MCP integration (user MCP servers discovered; MCP → CLI fallback)](#mcp-integration) | b, d | ✅ 📄 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Squad RC / `squad start` (remote control bridge, tunnels)](#squad-rc-start) | a, d | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |

### GitHub

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [@copilot coding agent member (`squad copilot`, GitHub assignment)](#copilot-coding-agent) | a, b, e | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Ralph — interactive work monitor ("Ralph, go")](#ralph-coordinator-loop) | b, e | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Ralph CLI (`squad triage` / `watch` / `loop` --execute)](#ralph-cli-triage-watch) | a, e (host-independent) | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [GitHub Issues mode (connect, list, route, branch → PR → merge)](#github-issues-mode) | b, e | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Labels & triage (`squad` / `squad:<member>` taxonomy)](#labels-triage) | a, b, e | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Project boards (`squad triage --board`)](#project-boards) | a, e (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [GitHub Agentic Workflows (gh-aw) integration](#gh-aw) | e | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |

### Platforms

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [GitLab Issues mode (experimental, `glab`)](#gitlab-issues) | b, e | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |
| [Azure DevOps platform (work items, PRs, `az boards`, ADO MCP)](#azure-devops) | a, b, e | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |

### Multi-squad

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Upstream inheritance (`squad upstream add\|sync`, inherited skills/decisions/wisdom/routing)](#upstream-inheritance) | a, b | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Multiple squads / cross-squad (`squad registry\|discover\|delegate`, cross-squad skills)](#cross-squad-registry) | a, b, e | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [SubSquads / workstreams (`squad subsquads`, multi-Codespace)](#subsquads) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Monorepo / team-root resolution (`--team-root`, `SQUAD_TEAM_ROOT`, launch from a subfolder)](#monorepo-team-root) | a, b, c, d | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |
| [Dual-root remote mode (`squad init --mode remote`, `link`, `externalize` / `internalize`)](#dual-root-remote-mode) | a, b, c | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 | ❌ 🧪 |

### Infrastructure

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Storage provider abstraction (FS / SQLite / external state)](#storage-provider) | a, c (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Notifications (`watch --notify-level`, Teams/email monitors)](#notifications) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Enterprise platforms (ADO + Planner work items, Teams/ADO discussions)](#enterprise-platforms) | a, e (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Distributed mesh, capability routing, rate limiting, KEDA autoscaling](#distributed-mesh) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Aspire dashboard / OTel observability (`squad aspire`)](#aspire-dashboard) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |

### Squad 2.0

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Squad 2.0 `--client` projection (coordinator file + MCP config per host, rollback)](#client-projection) | a, d | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [`squad_state` MCP bridge reachable from the host (stdio, host-prefixed tool names)](#squad-state-mcp-bridge) | c, d | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🖥️ | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Capability negotiation (client ∩ backend ∩ policy)](#capability-negotiation) | c | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Experimental conversation backend (`squad_backend_*`, durable-http, approvals, resume)](#experimental-backend) | c | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Specialists (subagents) can reach `squad_state` tools themselves](#subagent-mcp-inheritance) | d | ✅ 📄 | ✅ 🖥️ | ✅ ⛔ | ✅ 🖥️ | ✅ ⛔ | ✅ ❔ | ⚠️ ⛔ |

## Per-feature detail

### init-mode-casting

**Init Mode & casting (`squad init`, `squad cast --name`, casting registry)**

Depends on: **a, b** · docs: [features/team-setup](/squad/docs/features/team-setup/) · [concepts/your-team](/squad/docs/concepts/your-team/) · canonical sections: `Init Mode`, `Casting & Persistent Naming`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _Live: cast 4 members via `squad cast --name` (registry pair valid); ignored the requested descriptive universe and used Apollo 13 names._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`validated-manual:lab:init-mode@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _Live: cast 4 members via `squad cast --name` with descriptive names; registry pair valid._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`validated-manual:lab:init-mode@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |

### routing-ownership

**Work routing by ownership (`routing.md`, one accountable owner, named requests)**

Depends on: **b** · docs: [features/routing](/squad/docs/features/routing/) · canonical sections: `Routing`, `Scope Control`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:smoke-roster@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:smoke-roster@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### response-modes

**Response modes (Direct / Lightweight / Standard / Full) + "feels heard" acknowledgement**

Depends on: **b** · docs: [features/response-modes](/squad/docs/features/response-modes/) · canonical sections: `Response Mode Selection`, `Acknowledge Immediately — "Feels Heard"`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:smoke-roster@2026-10-22`<br>`validated-manual:lab:ralph-no-repo@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §10 carries all four modes and the acknowledge-then-spawn rule. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:smoke-roster@2026-10-22`<br>`validated-manual:lab:ralph-no-repo@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §10 carries all four modes and the acknowledge-then-spawn rule. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §10 carries all four modes and the acknowledge-then-spawn rule. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §10 carries all four modes and the acknowledge-then-spawn rule. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### model-selection

**Model / reasoning-effort / context-tier selection per spawn**

Depends on: **b, d** · docs: [features/model-selection](/squad/docs/features/model-selection/) · [scenarios/switching-models](/squad/docs/scenarios/switching-models/) · canonical sections: `Per-Agent Model Selection`, `Per-Agent Reasoning Effort`, `Per-Agent Context Tier`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | Canonical §Model Selection + `task` tool `model`/`reasoning_effort`/`context_tier` params; `.squad/config.json` overrides. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The CLI/SDK side works, but the projected digest carries no section for it, so the coordinator is not told about it on this host. Unsupported on this host until the section ships._ | `validated-test:test/model-selector-policy.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | `Task` has no per-call model; only subagent-definition `model:` frontmatter. Digest lacks the model-selection section. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform. Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | Model is set per agent in `opencode.json` (`agent.squad.model`), not per `task` call; reasoning/context tiers unsupported. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform. Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform. No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform. Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### parallel-fanout

**Parallel fan-out of independent specialists**

Depends on: **b, d** · docs: [features/parallel-execution](/squad/docs/features/parallel-execution/) · [concepts/parallel-work](/squad/docs/concepts/parallel-work/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |

### background-agents

**Background agents (Scribe/Rai run non-blocking)**

Depends on: **d** · docs: [features/parallel-execution](/squad/docs/features/parallel-execution/) · canonical sections: `Shared Decision Architecture — Drop-Box Pattern`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `background-runs` token; `task` mode=background / `read_agent`. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `claude` | ✅ supported | 🖥️ validated-live | `background-runs` token declared (F7): Claude Code runs `Agent` spawns in the background (`subagent_stats.started_in_background` in the parallel-fanout live run). _F7 fixed: token added to capability-matrix.json and CAPABILITY_TOKENS_BY_HOST after the 2026-10-22 live run showed background subagents._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `kiro` | ⚠️ degraded | 🧪 validated-test | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `opencode` | ✅ supported | 🖥️ validated-live | `background-runs` token declared; `task` subagents run as child sessions. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `cursor` | ⚠️ degraded | 🧪 validated-test | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `codex` | ⚠️ degraded | 🧪 validated-test | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `antigravity` | ⚠️ degraded | 🧪 validated-test | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |

### scribe-decisions-history

**Scribe, decisions drop-box, agent history, orchestration log**

Depends on: **b, c** · docs: [features/memory](/squad/docs/features/memory/) · [concepts/memory-and-knowledge](/squad/docs/concepts/memory-and-knowledge/) · canonical sections: `Shared Decision Architecture — Drop-Box Pattern`, `Built-in Support Agents`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-manual:lab:parallel-fanout@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |

### directive-capture

**Directive capture ("always…/never…" → `squad_decide`)**

Depends on: **b, c** · docs: [features/directives](/squad/docs/features/directives/) · canonical sections: `Directive Capture`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:directive-capture@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:directive-capture@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### memory-governance

**Memory governance (`memory.*` tools, classes, promote/audit)**

Depends on: **c** · docs: [features/memory](/squad/docs/features/memory/) · canonical sections: `Memory Governance Tools`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`validated-manual:lab:state-orphan@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`validated-manual:lab:state-orphan@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |

### state-backends

**State backends (`local` / `orphan` / `two-layer`) + handshake**

Depends on: **a, c, b** · docs: [features/state-backends](/squad/docs/features/state-backends/) · [reference/state-backend-selection](/squad/docs/reference/state-backend-selection/) · canonical sections: `State & Team Root Resolution (before mode check)`, `Memory Governance Tools`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |
| `claude` | ✅ supported | 🖥️ validated-live | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. _F6 fixed: `squad_state_health` now reports `State backend: local\|orphan\|two-layer` plus the storage class and team squad dir. F8 fixed: `squad_state_list` without `dir` lists the root on orphan/two-layer._ | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-manual:lab:state-orphan@2026-10-22`<br>`validated-manual:lab:state-twolayer@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |
| `kiro` | ✅ supported | 🧪 validated-test | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |
| `opencode` | ✅ supported | 🖥️ validated-live | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. _F6 fixed: `squad_state_health` now reports `State backend: local\|orphan\|two-layer` plus the storage class and team squad dir. F8 fixed: `squad_state_list` without `dir` lists the root on orphan/two-layer._ | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-manual:lab:state-orphan@2026-10-22`<br>`validated-manual:lab:state-twolayer@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |
| `cursor` | ✅ supported | 🧪 validated-test | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |
| `antigravity` | ✅ supported | 🧪 validated-test | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree` |

### skills-precedence

**Skills (5 roots, precedence, untrusted-data rule)**

Depends on: **b** · docs: [features/skills](/squad/docs/features/skills/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`validated-manual:lab:skills-precedence@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`validated-manual:lab:skills-precedence@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |

### reviewer-lockout

**Reviewer rejection protocol & strict author lockout**

Depends on: **b** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Reviewer Rejection Protocol`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:reviewer-lockout@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §12: REJECT locks out the author; revision reassigned; re-review required. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:reviewer-lockout@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §12: REJECT locks out the author; revision reassigned; re-review required. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §12: REJECT locks out the author; revision reassigned; re-review required. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §12: REJECT locks out the author; revision reassigned; re-review required. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### rai

**Rai — Responsible-AI reviewer (🟢/🟡/🔴)**

Depends on: **b, d** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Rai — RAI Reviewer`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Canonical §Rai; background by default. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §13; runs in the background (`background-runs` declared since F7). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §13; background capable. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### fact-checker

**Fact Checker — verification & devil's advocate**

Depends on: **b** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Fact Checker — Verification & Devil's Advocate`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### ceremonies

**Ceremonies (before/after/manual, cooldowns)**

Depends on: **b, c** · docs: [features/ceremonies](/squad/docs/features/ceremonies/) · canonical sections: `Ceremonies`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### human-members

**Human team members (never spawned; routed as requests)**

Depends on: **b** · docs: [features/human-team-members](/squad/docs/features/human-team-members/) · [scenarios/team-of-humans](/squad/docs/scenarios/team-of-humans/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §21. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §21. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §21. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §21. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### copilot-coding-agent

**@copilot coding agent member (`squad copilot`, GitHub assignment)**

Depends on: **a, b, e** · docs: [features/copilot-coding-agent](/squad/docs/features/copilot-coding-agent/) · canonical sections: `Copilot Coding Agent Member`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |

### ralph-coordinator-loop

**Ralph — interactive work monitor ("Ralph, go")**

Depends on: **b, e** · docs: [features/ralph](/squad/docs/features/ralph/) · canonical sections: `Ralph — Work Monitor`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:ralph-no-repo@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:ralph-no-repo@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### ralph-cli-triage-watch

**Ralph CLI (`squad triage` / `watch` / `loop` --execute)**

Depends on: **a, e** (host-independent) · docs: [features/ralph](/squad/docs/features/ralph/) · [features/labels](/squad/docs/features/labels/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Default `agentCmd` is the Copilot CLI (`copilot -p …`). | `validated-test:test/ralph-triage.test.ts::*`<br>`validated-test:test/ralph-monitor.test.ts::*`<br>`validated-test:test/watch-fleet-dispatch.test.ts::*` |
| `claude` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | 🧪 validated-test | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |

### prd-mode

**PRD mode (decompose → approve → dependency-aware dispatch)**

Depends on: **b** · docs: [features/prd-mode](/squad/docs/features/prd-mode/) · canonical sections: `PRD Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §19; `prd-intake.md` template on demand. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### github-issues-mode

**GitHub Issues mode (connect, list, route, branch → PR → merge)**

Depends on: **b, e** · docs: [features/github-issues](/squad/docs/features/github-issues/) · [concepts/github-workflow](/squad/docs/concepts/github-workflow/) · [scenarios/issue-driven-dev](/squad/docs/scenarios/issue-driven-dev/) · canonical sections: `GitHub Issues Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:github-issues-readonly@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-manual:lab:github-issues-readonly@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### labels-triage

**Labels & triage (`squad` / `squad:<member>` taxonomy)**

Depends on: **a, b, e** · docs: [features/labels](/squad/docs/features/labels/) · canonical sections: `GitHub Issues Mode`, `Ralph — Work Monitor`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`validated-manual:lab:github-issues-readonly@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`validated-manual:lab:github-issues-readonly@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |

### project-boards

**Project boards (`squad triage --board`)**

Depends on: **a, e** (host-independent) · docs: [features/project-boards](/squad/docs/features/project-boards/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |

### gitlab-issues

**GitLab Issues mode (experimental, `glab`)**

Depends on: **b, e** · docs: [features/gitlab-issues](/squad/docs/features/gitlab-issues/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2. Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### azure-devops

**Azure DevOps platform (work items, PRs, `az boards`, ADO MCP)**

Depends on: **a, b, e** · docs: [features/enterprise-platforms](/squad/docs/features/enterprise-platforms/) · canonical sections: `GitHub Issues Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | `squad triage\|watch` auto-detect ADO from the remote (or `config.platform: azure-devops`) and use `az`; `squad upgrade` seeds an `EXAMPLE-azure-devops` MCP server in `.mcp.json`. The coordinator section is GitHub-only (`gh`); ADO commands exist only in `issue-lifecycle.md`. _Finding F3: interactive Issues mode has no ADO branch in the prompt. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. Live: detected ADO from the remote, read `issue-lifecycle.md`, proposed `az boards` commands, noted the template has no backlog-list command. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-manual:lab:ado-platform@2026-10-22`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. Live: detected ADO from the remote, read `issue-lifecycle.md`, proposed `az boards` commands, noted the template has no backlog-list command. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-manual:lab:ado-platform@2026-10-22`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3. Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### upstream-inheritance

**Upstream inheritance (`squad upstream add|sync`, inherited skills/decisions/wisdom/routing)**

Depends on: **a, b** · docs: [features/upstream-inheritance](/squad/docs/features/upstream-inheritance/) · canonical sections: `Upstream Inheritance`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. Live (Claude, pre-fix): found the inherited decision and skill only when prompted toward `upstream.json`; the tool now returns both unprompted._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`validated-manual:lab:upstream@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. Live (OpenCode, pre-fix, partial): missed `.copilot/skills/org-logging`; the bridge test now proves that skill is served with provenance._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`validated-manual:lab:upstream@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | Runtime inheritance: `squad_state_upstreams` (state-mcp bridge, all hosts) resolves `upstream.json` from local snapshots only (never fetches), with deterministic precedence (local `.squad/` wins, then declared order, depth-first, depth limit 3), cycle detection, soft failure for missing/stale/unavailable sources and `upstream:<name>@<ref>` provenance; canonical §Upstream Inheritance + digest §16a tell the coordinator to call it once per session. `squad doctor`/`squad status` surface the same resolution. _F1 fixed in Squad 2.0. Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/upstream-runtime.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches`<br>`validated-test:test/clients.test.ts::digest carries the host-specific sections the live runs relied on`<br>`validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*` |

### cross-squad-registry

**Multiple squads / cross-squad (`squad registry|discover|delegate`, cross-squad skills)**

Depends on: **a, b, e** · docs: [scenarios/multiple-squads](/squad/docs/scenarios/multiple-squads/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`validated-manual:lab:cross-squad@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`validated-manual:lab:cross-squad@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |

### subsquads

**SubSquads / workstreams (`squad subsquads`, multi-Codespace)**

Depends on: **a** (host-independent) · docs: [scenarios/multi-codespace](/squad/docs/scenarios/multi-codespace/) · [scenarios/scaling-workstreams](/squad/docs/scenarios/scaling-workstreams/) · [features/streams](/squad/docs/features/streams/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |

### monorepo-team-root

**Monorepo / team-root resolution (`--team-root`, `SQUAD_TEAM_ROOT`, launch from a subfolder)**

Depends on: **a, b, c, d** · docs: [scenarios/monorepo](/squad/docs/scenarios/monorepo/) · [features/worktrees](/squad/docs/features/worktrees/) · canonical sections: `State & Team Root Resolution (before mode check)`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI honours `--team-root`/`SQUAD_TEAM_ROOT`; state-mcp walks up from cwd (`findSquadDir`); canonical §State & Team Root Resolution + `worktree-reference.md` resolve `TEAM_ROOT` and pass it to every spawn. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | Claude discovers `.claude/agents/squad.md` and `.mcp.json` from a package subfolder; state-mcp walks up to the root `.squad/`. Headless (`-p`) runs need `--mcp-config <root>/.mcp.json` or a prior per-project approval (F5). _Validate per host: does the host find root-level projections from a subfolder cwd? Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-manual:lab:mono-subfolder@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::claude lists the root .mcp.json squad_state server from packages/api`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd? Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | OpenCode resolves `opencode.json` (agent + MCP) from the repo root when launched in a package subfolder; state-mcp walks up to the root `.squad/`. _Validate per host: does the host find root-level projections from a subfolder cwd? Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-manual:lab:mono-subfolder@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::opencode resolves the squad primary agent and the squad_state MCP entry from packages/api`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd? Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd? No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd? Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp resolves the root .squad when launched from a monorepo subfolder`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### dual-root-remote-mode

**Dual-root remote mode (`squad init --mode remote`, `link`, `externalize` / `internalize`)**

Depends on: **a, b, c** · docs: [features/dual-mode-deployment](/squad/docs/features/dual-mode-deployment/) · [scenarios/team-state-storage](/squad/docs/scenarios/team-state-storage/) · canonical sections: `State & Team Root Resolution (before mode check)`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI writes `config.json.teamRoot`; state-mcp resolves `mode: remote`; canonical step 3 loads `team.md` from the team root. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | The state bridge follows `config.json.teamRoot`, so the host coordinator read the team-root roster via `squad_state_read` and did not enter Init Mode, even though the digest has no team-root section. _Live: roster served from `..\base`; no casting attempted. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-manual:lab:satellite-remote@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate. Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | The state bridge follows `config.json.teamRoot`, so the host coordinator read the team-root roster via `squad_state_read` and did not enter Init Mode, even though the digest has no team-root section. _Live: roster served from `..\base`; no casting attempted. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The runtime path works (state-mcp walks up to the root `.squad/` / follows `teamRoot`; see the live run where recorded), but the projected digest carries no team-root section, so the coordinator is not told how resolution works. Unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-manual:lab:satellite-remote@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate. Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate. No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate. Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/resolution.test.ts::*`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::state-mcp follows config.json teamRoot from a satellite repo (remote mode)`<br>`validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### git-worktrees

**Git worktrees & worktree mode (issue worktrees, `WORKTREE_PATH`)**

Depends on: **a, b, d** · docs: [features/worktrees](/squad/docs/features/worktrees/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`validated-manual:lab:worktree-spawn@2026-10-22` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`validated-manual:lab:worktree-spawn@2026-10-22` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |

### export-import

**Export / import (`squad export`, `squad import`, team portability)**

Depends on: **a** (host-independent) · docs: [features/export-import](/squad/docs/features/export-import/) · [scenarios/team-portability](/squad/docs/scenarios/team-portability/) · [concepts/portability](/squad/docs/concepts/portability/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `claude` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `kiro` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `opencode` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `cursor` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `codex` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `antigravity` | ✅ supported | 🧪 validated-test | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |

### storage-provider

**Storage provider abstraction (FS / SQLite / external state)**

Depends on: **a, c** (host-independent) · docs: [features/storage-provider](/squad/docs/features/storage-provider/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |

### notifications

**Notifications (`watch --notify-level`, Teams/email monitors)**

Depends on: **a** (host-independent) · docs: [features/notifications](/squad/docs/features/notifications/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |

### marketplace-plugins

**Marketplace & plugins (`squad plugin marketplace …`, skill install on cast)**

Depends on: **a, b** · docs: [features/marketplace](/squad/docs/features/marketplace/) · [features/plugins](/squad/docs/features/plugins/) · canonical sections: `Team Mode`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI + canonical "check plugin marketplaces when adding a member" step. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): The CLI/SDK side works, but the projected digest carries no section for it, so the coordinator is not told about it on this host. Unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `claude` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `kiro` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `opencode` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `cursor` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `codex` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _No Codex binary or ChatGPT/API auth on the reference machine; static-only. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |
| `antigravity` | ❌ unsupported | 🧪 validated-test (expected failure) | CLI works; the digest Init/cast flow does not include the marketplace-browse step. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine. Expected-fail digest gap (per-host it.fails in test/clients.test.ts): unsupported on this host until the section ships._ | `validated-test:test/clients.test.ts::coordinator digest vs. host feature matrix`<br>`static-only` |

### mcp-integration

**MCP integration (user MCP servers discovered; MCP → CLI fallback)**

Depends on: **b, d** · docs: [features/mcp](/squad/docs/features/mcp/) · canonical sections: `MCP Integration`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 📄 static-only | Canonical §MCP Integration with tool-prefix discovery and `gh`/`az` fallbacks; `.mcp.json`. | `static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |

### standalone-install

**Standalone install (no npm; `squad.exe state-mcp` launch spec)**

Depends on: **a** (host-independent) · docs: [features/standalone-install](/squad/docs/features/standalone-install/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |

### vscode

**VS Code (`runSubagent`, settings default agent)**

Depends on: **d** · docs: [features/vscode](/squad/docs/features/vscode/) · canonical sections: `Client Compatibility`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Canonical §Client Compatibility micro-playbook; `squad init` writes `.vscode/settings.json`. | `validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `claude` | — n/a | 📄 static-only | Copilot-specific surface. | `static-only` |
| `kiro` | — n/a | 📄 static-only | Copilot-specific surface. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `static-only` |
| `opencode` | — n/a | 📄 static-only | Copilot-specific surface. | `static-only` |
| `cursor` | — n/a | 📄 static-only | Copilot-specific surface. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `static-only` |
| `codex` | — n/a | 📄 static-only | Copilot-specific surface. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `static-only` |
| `antigravity` | — n/a | 📄 static-only | Copilot-specific surface. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `static-only` |

### squad-rc-start

**Squad RC / `squad start` (remote control bridge, tunnels)**

Depends on: **a, d** · docs: [features/squad-rc](/squad/docs/features/squad-rc/) · [scenarios/remote-qa](/squad/docs/scenarios/remote-qa/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `squad start\|rc` wrap the Copilot CLI with phone/browser access. | `validated-test:test/cli/rc.test.ts::*`<br>`static-only` |
| `claude` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `kiro` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `static-only` |
| `opencode` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `cursor` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `static-only` |
| `codex` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `static-only` |
| `antigravity` | — n/a | 📄 static-only | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `static-only` |

### enterprise-platforms

**Enterprise platforms (ADO + Planner work items, Teams/ADO discussions)**

Depends on: **a, e** (host-independent) · docs: [features/enterprise-platforms](/squad/docs/features/enterprise-platforms/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |

### distributed-mesh

**Distributed mesh, capability routing, rate limiting, KEDA autoscaling**

Depends on: **a** (host-independent) · docs: [features/distributed-mesh](/squad/docs/features/distributed-mesh/) · [features/capability-routing](/squad/docs/features/capability-routing/) · [features/rate-limiting](/squad/docs/features/rate-limiting/) · [features/keda-scaling](/squad/docs/features/keda-scaling/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |

### aspire-dashboard

**Aspire dashboard / OTel observability (`squad aspire`)**

Depends on: **a** (host-independent) · docs: [scenarios/aspire-dashboard](/squad/docs/scenarios/aspire-dashboard/) · [scenarios/production-observability](/squad/docs/scenarios/production-observability/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |

### gh-aw

**GitHub Agentic Workflows (gh-aw) integration**

Depends on: **e** · docs: [guide/gh-aw](/squad/docs/guide/gh-aw/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Workflows in `workflows/*.md`; verifier + e2e scripts. | `validated-test:test/gh-aw-enlistment-skill.test.ts::*`<br>`static-only` |
| `claude` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `kiro` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `static-only` |
| `opencode` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `cursor` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `static-only` |
| `codex` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `static-only` |
| `antigravity` | — n/a | 📄 static-only | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `static-only` |

### sdk-first-mode

**SDK-first mode (`squad.config.ts`, `squad build`, `squad migrate`)**

Depends on: **a** (host-independent) · docs: [sdk-first-mode](/squad/docs/sdk-first-mode/) · [reference/sdk](/squad/docs/reference/sdk/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `claude` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `kiro` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `opencode` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `cursor` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `codex` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `antigravity` | ✅ supported | 🧪 validated-test | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |

### doctor-health-nap

**Maintenance CLIs (`squad doctor`, `squad health`, `squad nap`, `squad upgrade`)**

Depends on: **a** (host-independent) · docs: [reference/cli](/squad/docs/reference/cli/) · [scenarios/upgrading](/squad/docs/scenarios/upgrading/) · [scenarios/troubleshooting](/squad/docs/scenarios/troubleshooting/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `claude` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `kiro` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `opencode` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `cursor` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `codex` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `antigravity` | ✅ supported | 🧪 validated-test | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |

### client-projection

**Squad 2.0 `--client` projection (coordinator file + MCP config per host, rollback)**

Depends on: **a, d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/) · [scenarios/using-squad-across-clients](/squad/docs/scenarios/using-squad-across-clients/) · [scenarios/client-compatibility](/squad/docs/scenarios/client-compatibility/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts` |
| `claude` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::claude discovers the squad subagents and parses .mcp.json` |
| `kiro` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::kiro validates and lists the squad agent` |
| `opencode` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::opencode loads squad as a primary agent and connects the MCP server` |
| `cursor` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::cursor-agent lists the squad_state server from .cursor/mcp.json (read-only)` |
| `codex` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::codex loads the project config (trusted), sees squad_state MCP, discovers the squad TOML role, and activates coordinator instructions on spawn` |
| `antigravity` | ✅ supported | 🧪 validated-test | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::antigravity discovers the squad agent` |

### squad-state-mcp-bridge

**`squad_state` MCP bridge reachable from the host (stdio, host-prefixed tool names)**

Depends on: **c, d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/) · [reference/tools-and-hooks](/squad/docs/reference/tools-and-hooks/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::claude discovers the squad subagents and parses .mcp.json`<br>`validated-manual:lab:smoke-roster@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::claude --agent squad reads the roster through mcp__squad_state__squad_state_read`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises` |
| `kiro` | ✅ supported | 🧪 validated-test | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::kiro validates and lists the squad agent`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::opencode loads squad as a primary agent and connects the MCP server`<br>`validated-manual:lab:smoke-roster@2026-10-22`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::opencode --agent squad reads the roster through squad_state_squad_state_read`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises` |
| `cursor` | ✅ supported | 🧪 validated-test | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::cursor-agent lists the squad_state server from .cursor/mcp.json (read-only)`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::codex loads the project config (trusted), sees squad_state MCP, discovers the squad TOML role, and activates coordinator instructions on spawn`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::antigravity discovers the squad agent`<br>`validated-test:test/squad-20-host-feature-matrix.test.ts::squad_state_health names the configured backend (orphan) as the coordinator digest promises`<br>`static-only` |

### capability-negotiation

**Capability negotiation (client ∩ backend ∩ policy)**

Depends on: **c** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `claude` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `kiro` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `opencode` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `cursor` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `codex` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `antigravity` | ✅ supported | 🧪 validated-test | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |

### experimental-backend

**Experimental conversation backend (`squad_backend_*`, durable-http, approvals, resume)**

Depends on: **c** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `claude` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `kiro` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `opencode` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `cursor` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `codex` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `antigravity` | ✅ supported | 🧪 validated-test | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |

### process-hygiene

**Process hygiene (never kill by image name; PID-only)**

Depends on: **b** · docs: [scenarios/troubleshooting](/squad/docs/scenarios/troubleshooting/) · canonical sections: `Constraints`

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 🧪 validated-test | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | 🧪 validated-test | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `kiro` | ✅ supported | 🧪 validated-test | Digest §22–23. _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `opencode` | ✅ supported | 🧪 validated-test | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `cursor` | ✅ supported | 🧪 validated-test | Digest §22–23. _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | 🧪 validated-test | Digest §22–23. _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `antigravity` | ✅ supported | 🧪 validated-test | Digest §22–23. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |

### subagent-mcp-inheritance

**Specialists (subagents) can reach `squad_state` tools themselves**

Depends on: **d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Capability | Validation | Mechanism | Evidence |
|------|------------|------------|-----------|----------|
| `copilot` | ✅ supported | 📄 static-only | `task` subagents inherit the session MCP servers. | `static-only` |
| `claude` | ✅ supported | 🖥️ validated-live | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). _Live: Galois/Fermat/Scribe each called `squad_state_*` tools from inside their spawn (history appended, inbox drained)._ | `validated-manual:lab:parallel-fanout@2026-10-22` |
| `kiro` | ✅ supported | ⛔ blocked — live run blocked on the reference machine: kiro-cli chat failed: "The monthly usage limit has been reached". | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). _Live run blocked on 2026-10-22: kiro quota/usage limit reached on the reference machine._ | `static-only` |
| `opencode` | ✅ supported | 🖥️ validated-live | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). _Live: Galois/Fermat/Scribe each called `squad_state_*` tools from inside their spawn (history appended, inbox drained)._ | `validated-manual:lab:parallel-fanout@2026-10-22` |
| `cursor` | ✅ supported | ⛔ blocked — live run blocked on the reference machine: cursor-agent -p failed: "You've hit your usage limit". | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). _Live run blocked on 2026-10-22: cursor quota/usage limit reached on the reference machine._ | `static-only` |
| `codex` | ✅ supported | ❔ untested | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). _No Codex binary or ChatGPT/API auth on the reference machine; static-only._ | `static-only` |
| `antigravity` | ⚠️ degraded | ⛔ blocked — live run blocked on the reference machine: agy -p failed: RESOURCE_EXHAUSTED 429 "Individual quota reached" (resets in ~75h). | `invoke_subagent` starts with a clean context; MCP attached via agent frontmatter may not propagate — specialists return results for the coordinator to persist. _Live run blocked on 2026-10-22: antigravity quota/usage limit reached on the reference machine._ | `static-only` |

## Live run log

Headless real-CLI runs behind the `validated-manual:lab:<scenario>` evidence entries above (only `pass`/`partial` runs raise a cell to `validated-live`). Each run drove the host's projected Squad coordinator against a real model in a throwaway repository; transcripts are kept outside the repository.

| Date | Host | Scenario | Outcome | Observed tools | Notes |
|------|------|----------|---------|----------------|-------|
| 2026-10-22 | `claude` | smoke-roster | ✅ pass | `mcp__squad_state__squad_state_read` | Roster + testing owner from team.md/routing.md via host-reported squad_state tool events (observed in the host transcript, not a JSON-RPC assertion). |
| 2026-10-22 | `claude` | init-mode | ✅ pass | `mcp__squad_state__squad_state_read`, `Bash` | Empty roster → proposed 4 specialists, cast each with `squad cast --name`, stopped after reporting the roster. |
| 2026-10-22 | `claude` | upstream | ✅ pass | `mcp__squad_state__squad_state_read`, `Bash` | Found SEVEN-SECOND-TIMEOUT decision and ORG-LOG-PREFIX skill by reading the upstream path from upstream.json. |
| 2026-10-22 | `claude` | cross-squad | ✅ pass | `Read`, `Bash` | Loaded cross-squad + cross-squad-communication skills, read squad-registry.json and peer manifest, prepared `squad delegate peer-b …`, no issue created, no ad-hoc subagents. |
| 2026-10-22 | `claude` | mono-subfolder | ✅ pass | `mcp__squad_state__squad_state_read` | From packages/api with --mcp-config <root>/.mcp.json; natively the server is "Pending approval" (F5). |
| 2026-10-22 | `claude` | satellite-remote | ✅ pass | `mcp__squad_state__squad_state_read`, `Read` | Roster served from teamRoot ..\base; no Init Mode. |
| 2026-10-22 | `claude` | ado-platform | ✅ pass | `Bash`, `Read` | Detected Azure DevOps from the remote; consulted issue-lifecycle.md; proposed az boards/az repos commands; ran only read-only checks. |
| 2026-10-22 | `claude` | github-issues-readonly | ✅ pass | `Bash`, `mcp__squad_state__squad_state_read` | gh prerequisites checked; 5 squad-labelled issues listed read-only and routed via routing.md (Lead triages unknown squad:* labels). |
| 2026-10-22 | `claude` | state-orphan | ✅ pass | `mcp__squad_state__squad_state_health`, `mcp__squad_state__squad_decide`, `mcp__squad_state__squad_state_list` | Decision committed to the squad-state orphan branch; working tree untouched; health reported the storage class, not "orphan" (F6). |
| 2026-10-22 | `claude` | state-twolayer | ✅ pass | `mcp__squad_state__squad_state_health`, `mcp__squad_state__squad_decide`, `mcp__squad_state__squad_state_list` | Decision committed to the squad-state branch (two-layer); health reported the storage class, not "two-layer" (F6). |
| 2026-10-22 | `claude` | skills-precedence | ✅ pass | `Bash` | .squad/skills/deploy-rules (DEPLOY-ALPHA) won over .github and .claude copies; no spawn in the dry run. |
| 2026-10-22 | `claude` | directive-capture | ✅ pass | `mcp__squad_state__squad_decide` | Persistent "always use tabs" directive recorded via squad_decide and acknowledged. |
| 2026-10-22 | `claude` | reviewer-lockout | ✅ pass | `Agent`, `mcp__squad_state__squad_decide` | Galois authored, Fermat REJECTed ("missing tests"), Galois locked out, revision assigned to Noether, verdict recorded via squad_decide. |
| 2026-10-22 | `claude` | ralph-no-repo | ✅ pass | `Bash` | No git remote → Ralph reported it and stopped without routing work. |
| 2026-10-22 | `claude` | worktree-spawn | ✅ pass | `Bash`, `Read` | Created sibling worktree base-12 on squad/12-add-health per worktree-reference.md. |
| 2026-10-22 | `claude` | parallel-fanout | ✅ pass | `Agent`, `mcp__squad_state__squad_state_append`, `mcp__squad_state__squad_state_health` | Two specialists spawned in one turn (Claude: background subagents), each appended its own history via host-reported squad_state tool events (observed in the host transcript, not a JSON-RPC assertion); Scribe drained the inbox. |
| 2026-10-22 | `opencode` | smoke-roster | ✅ pass | `squad_state_squad_state_read` | Roster + testing owner from team.md/routing.md via host-reported squad_state tool events (observed in the host transcript, not a JSON-RPC assertion). |
| 2026-10-22 | `opencode` | init-mode | ✅ pass | `squad_state_squad_state_read`, `Bash` | Empty roster → proposed 4 specialists, cast each with `squad cast --name`, stopped after reporting the roster. |
| 2026-10-22 | `opencode` | upstream | ⚠️ partial | `squad_state_squad_state_read`, `Bash` | Found the upstream decision; missed the `.copilot/skills` skill living beside the upstream `.squad/`. |
| 2026-10-22 | `opencode` | cross-squad | ✅ pass | `Read`, `Bash` | Loaded cross-squad + cross-squad-communication skills, read squad-registry.json and peer manifest, prepared `squad delegate peer-b …`, no issue created, no ad-hoc subagents. |
| 2026-10-22 | `opencode` | mono-subfolder | ✅ pass | `squad_state_squad_state_read` | From packages/api; opencode.json and agent resolved from the repo root. |
| 2026-10-22 | `opencode` | satellite-remote | ✅ pass | `squad_state_squad_state_read`, `Read` | Roster served from teamRoot ..\base; no Init Mode. |
| 2026-10-22 | `opencode` | ado-platform | ✅ pass | `Bash`, `Read` | Detected Azure DevOps from the remote; consulted issue-lifecycle.md; proposed az boards/az repos commands; ran only read-only checks. |
| 2026-10-22 | `opencode` | github-issues-readonly | ✅ pass | `Bash`, `squad_state_squad_state_read` | gh prerequisites checked; 5 squad-labelled issues listed read-only and routed via routing.md (Lead triages unknown squad:* labels). |
| 2026-10-22 | `opencode` | state-orphan | ✅ pass | `squad_state_squad_state_health`, `squad_state_squad_decide`, `squad_state_squad_state_list` | Decision committed to the squad-state orphan branch; working tree untouched; health reported the storage class, not "orphan" (F6). |
| 2026-10-22 | `opencode` | state-twolayer | ✅ pass | `squad_state_squad_state_health`, `squad_state_squad_decide`, `squad_state_squad_state_list` | Decision committed to the squad-state branch (two-layer); health reported the storage class, not "two-layer" (F6). |
| 2026-10-22 | `opencode` | skills-precedence | ✅ pass | `Bash` | .squad/skills/deploy-rules (DEPLOY-ALPHA) won over .github and .claude copies; no spawn in the dry run. |
| 2026-10-22 | `opencode` | directive-capture | ✅ pass | `squad_state_squad_decide` | Persistent "always use tabs" directive recorded via squad_decide and acknowledged. |
| 2026-10-22 | `opencode` | reviewer-lockout | ✅ pass | `task`, `squad_state_squad_decide` | Galois authored, Fermat REJECTed ("missing tests"), Galois locked out, revision assigned to Noether, verdict recorded via squad_decide. |
| 2026-10-22 | `opencode` | ralph-no-repo | ✅ pass | `Bash` | No git remote → Ralph reported it and stopped without routing work. |
| 2026-10-22 | `opencode` | worktree-spawn | ✅ pass | `Bash`, `Read` | Created sibling worktree base-12 on squad/12-add-health per worktree-reference.md. |
| 2026-10-22 | `opencode` | parallel-fanout | ✅ pass | `task`, `squad_state_squad_state_append`, `squad_state_squad_state_health` | Two specialists spawned in one turn (Claude: background subagents), each appended its own history via host-reported squad_state tool events (observed in the host transcript, not a JSON-RPC assertion); Scribe drained the inbox. |
| 2026-10-22 | `kiro` | smoke-roster | ⛔ blocked | — | kiro-cli chat failed: "The monthly usage limit has been reached". |
| 2026-10-22 | `antigravity` | smoke-roster | ⛔ blocked | — | agy -p failed: RESOURCE_EXHAUSTED 429 "Individual quota reached" (resets in ~75h). |
| 2026-10-22 | `cursor` | smoke-roster | ⛔ blocked | — | cursor-agent -p failed: "You've hit your usage limit". |

