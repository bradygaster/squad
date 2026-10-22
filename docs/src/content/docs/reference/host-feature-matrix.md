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
| **b** | coordinator-prompt behaviour (the section must be present in the host's coordinator file or reachable on demand) |
| **c** | squad_state / memory.* MCP tools (state-mcp bridge reachable from the host) |
| **d** | host runtime capability (subagent spawn, background tasks, shell, file ops, sql, per-spawn model, MCP inheritance by subagents) |
| **e** | platform CLI or MCP availability in the host (gh / glab / az / ADO MCP / GitHub MCP) |

## Legend

| Status | Meaning |
|--------|---------|
| ✅ `supported` | Works on this host through the stated mechanism. |
| ⚠️ `degraded` | Works with a documented limitation or only via an on-demand/manual path. |
| ❌ `unsupported` | Cannot work on this host. |
| — `n/a` | Not applicable to this host. |

| Validation | Meaning |
|------------|---------|
| 🧪 `validated-test:<file>::<name>` | An automated test (name `*` = the whole file) covers the cell. CLI-only evidence is host-independent. |
| 🖥️ `validated-manual:<evidence>` | Validated by a recorded headless real-CLI run (artifact path or demo index). |
| 📄 `static-only` | Only the projected/canonical text or source code was inspected. |
| ❔ `untested` | No evidence beyond static inspection for this host; candidate for the real-CLI lane. |
| 🔴 `failing` | A real run showed the cell does not behave as the mechanism claims. |

Each cell below shows **status / strongest evidence**, plus ❔ when the cell still lacks any live-host run (e.g. `✅ 🧪` = supported and covered by an automated test; `✅ 🧪 ❔` = the projection is tested but the host has not been driven for real; `⚠️ 📄` = degraded, only statically inspected). The **❔ untested** column in the summary counts every cell that still carries that marker.

## Hosts

| Host | CLI | Coordinator file | MCP config | Subagents | Background | Per-spawn model | Subagents inherit MCP |
|------|-----|------------------|------------|-----------|------------|-----------------|-----------------------|
| **GitHub Copilot (CLI / app / VS Code)** (`copilot`) | `copilot` | .github/agents/squad.agent.md (canonical) | .mcp.json | yes | yes | yes | yes |
| **Claude Code** (`claude`) | `claude` | .claude/agents/squad.md (digest) + CLAUDE.md block | .mcp.json | yes | no | no | yes |
| **Kiro CLI** (`kiro`) | `kiro-cli` | .kiro/agents/squad.json + .kiro/steering/squad.md (manual) | .kiro/settings/mcp.json | yes | no | no | yes |
| **OpenCode** (`opencode`) | `opencode` | .opencode/agents/squad.md (primary) | opencode.json (mcp.squad_state) | yes | yes | no | yes |
| **Cursor** (`cursor`) | `cursor-agent` (not on the reference machine → static-only) | .cursor/rules/squad.mdc (alwaysApply: false) + .cursor/agents/squad.md | .cursor/mcp.json | yes | no | no | yes |
| **OpenAI Codex** (`codex`) | `codex` | .codex/agents/squad.toml (developer_instructions) + AGENTS.md pointer | .codex/config.toml (mcp_servers.squad_state) | yes | no | no | yes |
| **Google Antigravity** (`antigravity`) | `agy` | .agents/agents/squad.md + GEMINI.md block | agent frontmatter mcpServers (or `agy mcp add`) | yes | no | no | no |

## Summary

| Host | ✅ supported | ⚠️ degraded | ❌ unsupported | — n/a | 🧪 test | 🖥️ manual | 📄 static | ❔ untested | 🔴 failing |
|------|-------------|-------------|----------------|-------|---------|-----------|-----------|------------|------------|
| `copilot` | 49 | 3 | 0 | 0 | 48 | 0 | 4 | 21 | 0 |
| `claude` | 39 | 10 | 0 | 3 | 45 | 0 | 6 | 23 | 0 |
| `kiro` | 39 | 10 | 0 | 3 | 45 | 0 | 6 | 23 | 0 |
| `opencode` | 40 | 9 | 0 | 3 | 45 | 0 | 6 | 24 | 0 |
| `cursor` | 39 | 10 | 0 | 3 | 45 | 0 | 7 | 0 | 0 |
| `codex` | 39 | 10 | 0 | 3 | 45 | 0 | 6 | 23 | 0 |
| `antigravity` | 38 | 11 | 0 | 3 | 45 | 0 | 6 | 23 | 0 |

## Matrix

### Core

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Init Mode & casting (`squad init`, `squad cast --name`, casting registry)](#init-mode-casting) | a, b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Work routing by ownership (`routing.md`, one accountable owner, named requests)](#routing-ownership) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Response modes (Direct / Lightweight / Standard / Full) + "feels heard" acknowledgement](#response-modes) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Model / reasoning-effort / context-tier selection per spawn](#model-selection) | b, d | ✅ 🧪 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 |
| [Parallel fan-out of independent specialists](#parallel-fanout) | b, d | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Background agents (Scribe/Rai run non-blocking)](#background-agents) | d | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ✅ 🧪 ❔ | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [Skills (5 roots, precedence, untrusted-data rule)](#skills-precedence) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Standalone install (no npm; `squad.exe state-mcp` launch spec)](#standalone-install) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [VS Code (`runSubagent`, settings default agent)](#vscode) | d | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |
| [SDK-first mode (`squad.config.ts`, `squad build`, `squad migrate`)](#sdk-first-mode) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Maintenance CLIs (`squad doctor`, `squad health`, `squad nap`, `squad upgrade`)](#doctor-health-nap) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Process hygiene (never kill by image name; PID-only)](#process-hygiene) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |

### Memory

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Scribe, decisions drop-box, agent history, orchestration log](#scribe-decisions-history) | b, c | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Directive capture ("always…/never…" → `squad_decide`)](#directive-capture) | b, c | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Memory governance (`memory.*` tools, classes, promote/audit)](#memory-governance) | c | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [State backends (`local` / `orphan` / `two-layer`) + handshake](#state-backends) | a, c, b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |

### Quality

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Reviewer rejection protocol & strict author lockout](#reviewer-lockout) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Rai — Responsible-AI reviewer (🟢/🟡/🔴)](#rai) | b, d | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Fact Checker — verification & devil's advocate](#fact-checker) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |

### Advanced

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Ceremonies (before/after/manual, cooldowns)](#ceremonies) | b, c | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Human team members (never spawned; routed as requests)](#human-members) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Personal squad & consult mode (`squad personal`, `squad consult`, `squad extract`)](#consult-personal-squad) | a, b | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [PRD mode (decompose → approve → dependency-aware dispatch)](#prd-mode) | b | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Git worktrees & worktree mode (issue worktrees, `WORKTREE_PATH`)](#git-worktrees) | a, b, d | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Export / import (`squad export`, `squad import`, team portability)](#export-import) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Marketplace & plugins (`squad plugin marketplace …`, skill install on cast)](#marketplace-plugins) | a, b | ✅ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 |
| [MCP integration (user MCP servers discovered; MCP → CLI fallback)](#mcp-integration) | b, d | ✅ 📄 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Squad RC / `squad start` (remote control bridge, tunnels)](#squad-rc-start) | a, d | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |

### GitHub

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [@copilot coding agent member (`squad copilot`, GitHub assignment)](#copilot-coding-agent) | a, b, e | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Ralph — interactive work monitor ("Ralph, go")](#ralph-coordinator-loop) | b, e | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Ralph CLI (`squad triage` / `watch` / `loop` --execute)](#ralph-cli-triage-watch) | a, e (host-independent) | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [GitHub Issues mode (connect, list, route, branch → PR → merge)](#github-issues-mode) | b, e | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Labels & triage (`squad` / `squad:<member>` taxonomy)](#labels-triage) | a, b, e | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Project boards (`squad triage --board`)](#project-boards) | a, e (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [GitHub Agentic Workflows (gh-aw) integration](#gh-aw) | e | ✅ 🧪 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 | — 📄 |

### Platforms

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [GitLab Issues mode (experimental, `glab`)](#gitlab-issues) | b, e | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 | ⚠️ 📄 |
| [Azure DevOps platform (work items, PRs, `az boards`, ADO MCP)](#azure-devops) | a, b, e | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |

### Multi-squad

| Feature | Deps | `copilot` | `claude` | `kiro` | `opencode` | `cursor` | `codex` | `antigravity` |
|---------|------|---|---|---|---|---|---|---|
| [Upstream inheritance (`squad upstream add|sync`, inherited skills/decisions/wisdom/routing)](#upstream-inheritance) | a, b | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [Multiple squads / cross-squad (`squad registry|discover|delegate`, cross-squad skills)](#cross-squad-registry) | a, b, e | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [SubSquads / workstreams (`squad subsquads`, multi-Codespace)](#subsquads) | a (host-independent) | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Monorepo / team-root resolution (`--team-root`, `SQUAD_TEAM_ROOT`, launch from a subfolder)](#monorepo-team-root) | a, b, c, d | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |
| [Dual-root remote mode (`squad init --mode remote`, `link`, `externalize` / `internalize`)](#dual-root-remote-mode) | a, b, c | ✅ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 | ⚠️ 🧪 |

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
| [`squad_state` MCP bridge reachable from the host (stdio, host-prefixed tool names)](#squad-state-mcp-bridge) | c, d | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 ❔ | ✅ 🧪 | ✅ 🧪 ❔ | ✅ 🧪 ❔ |
| [Capability negotiation (client ∩ backend ∩ policy)](#capability-negotiation) | c | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Experimental conversation backend (`squad_backend_*`, durable-http, approvals, resume)](#experimental-backend) | c | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| [Specialists (subagents) can reach `squad_state` tools themselves](#subagent-mcp-inheritance) | d | ✅ 📄 | ✅ ❔ | ✅ ❔ | ✅ ❔ | ✅ 📄 | ✅ ❔ | ⚠️ ❔ |

## Per-feature detail

### Init Mode & casting (`squad init`, `squad cast --name`, casting registry) {#init-mode-casting}

Depends on: **a, b** · docs: [features/team-setup](/squad/docs/features/team-setup/) · [concepts/your-team](/squad/docs/concepts/your-team/) · canonical sections: `Init Mode`, `Casting & Persistent Naming`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | CLI scaffolds `.squad/`; coordinator Init Mode (digest §0) uses `squad_state_read team.md`, auto-confirms headless, casts via `squad cast --name`, never hand-edits `.squad/casting/`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::field findings from the live demo: Init Mode, scratch files, casting registry`<br>`validated-test:test/cli/init.test.ts::*`<br>`untested` |

### Work routing by ownership (`routing.md`, one accountable owner, named requests) {#routing-ownership}

Depends on: **b** · docs: [features/routing](/squad/docs/features/routing/) · canonical sections: `Routing`, `Scope Control`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §2–3: route by `routing.md`, exactly one owner, explicit deliverables/exclusions. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Response modes (Direct / Lightweight / Standard / Full) + "feels heard" acknowledgement {#response-modes}

Depends on: **b** · docs: [features/response-modes](/squad/docs/features/response-modes/) · canonical sections: `Response Mode Selection`, `Acknowledge Immediately — "Feels Heard"`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §10 carries all four modes and the acknowledge-then-spawn rule. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Model / reasoning-effort / context-tier selection per spawn {#model-selection}

Depends on: **b, d** · docs: [features/model-selection](/squad/docs/features/model-selection/) · [scenarios/switching-models](/squad/docs/scenarios/switching-models/) · canonical sections: `Model Selection`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Canonical §Model Selection + `task` tool `model`/`reasoning_effort`/`context_tier` params; `.squad/config.json` overrides. | `validated-test:test/model-selector-policy.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | `Task` has no per-call model; only subagent-definition `model:` frontmatter. Digest lacks the model-selection section. | `static-only` |
| `kiro` | ⚠️ degraded | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform._ | `static-only` |
| `opencode` | ⚠️ degraded | Model is set per agent in `opencode.json` (`agent.squad.model`), not per `task` call; reasoning/context tiers unsupported. | `static-only` |
| `cursor` | ⚠️ degraded | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform._ | `static-only` |
| `codex` | ⚠️ degraded | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform._ | `static-only` |
| `antigravity` | ⚠️ degraded | Digest has no model-selection section (only `model-selection-reference.md` on demand); host dispatch primitive has no per-spawn model parameter, so the session model is inherited. _Record as a host limitation, not a bug: `squad.agent.md` already says not to rely on per-spawn model control cross-platform._ | `static-only` |

### Parallel fan-out of independent specialists {#parallel-fanout}

Depends on: **b, d** · docs: [features/parallel-execution](/squad/docs/features/parallel-execution/) · [concepts/parallel-work](/squad/docs/concepts/parallel-work/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |
| `claude` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |
| `kiro` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |
| `opencode` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |
| `cursor` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`static-only` |
| `codex` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |
| `antigravity` | ✅ supported | Digest §6 + every dispatch adapter says to issue independent spawns in one turn; all hosts declare the `subagents` token. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`untested` |

### Background agents (Scribe/Rai run non-blocking) {#background-agents}

Depends on: **d** · docs: [features/parallel-execution](/squad/docs/features/parallel-execution/) · canonical sections: `Shared Decision Architecture — Drop-Box Pattern`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `background-runs` token; `task` mode=background / `read_agent`. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `claude` | ⚠️ degraded | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `kiro` | ⚠️ degraded | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `opencode` | ✅ supported | `background-runs` token declared; `task` subagents run as child sessions. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`untested` |
| `cursor` | ⚠️ degraded | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`static-only` |
| `codex` | ⚠️ degraded | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |
| `antigravity` | ⚠️ degraded | No `background-runs` token: Scribe/Rai run synchronously as the last spawn of the turn instead of in the background. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts` |

### Scribe, decisions drop-box, agent history, orchestration log {#scribe-decisions-history}

Depends on: **b, c** · docs: [features/memory](/squad/docs/features/memory/) · [concepts/memory-and-knowledge](/squad/docs/concepts/memory-and-knowledge/) · canonical sections: `Shared Decision Architecture — Drop-Box Pattern`, `Built-in Support Agents`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |
| `claude` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |
| `kiro` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |
| `opencode` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |
| `cursor` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`static-only` |
| `codex` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |
| `antigravity` | ✅ supported | Digest §5/§11; writes go through `squad_decide` / `squad_state_append`; Scribe merges inbox → `decisions.md`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`untested` |

### Directive capture ("always…/never…" → `squad_decide`) {#directive-capture}

Depends on: **b, c** · docs: [features/directives](/squad/docs/features/directives/) · canonical sections: `Directive Capture`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §16 captures persistent directives via `squad_decide` and dispatches implementation separately. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Memory governance (`memory.*` tools, classes, promote/audit) {#memory-governance}

Depends on: **c** · docs: [features/memory](/squad/docs/features/memory/) · canonical sections: `Memory Governance Tools`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | `memory.*` aliases live in the same `squad_state` MCP server; digest §16 prefers them when exposed. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/memory-governance.test.ts::*`<br>`untested` |

### State backends (`local` / `orphan` / `two-layer`) + handshake {#state-backends}

Depends on: **a, c, b** · docs: [features/state-backends](/squad/docs/features/state-backends/) · [reference/state-backend-selection](/squad/docs/reference/state-backend-selection/) · canonical sections: `State & Team Root Resolution (before mode check)`, `Memory Governance Tools`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | `squad init\|upgrade --state-backend`; state-mcp resolves the backend from `config.json`; digest §16 requires `squad_state_health` before writes and halts without the bridge. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend`<br>`validated-test:test/state-backend.test.ts::*`<br>`validated-test:test/upgrade-state-backend.test.ts::*`<br>`untested` |

### Skills (5 roots, precedence, untrusted-data rule) {#skills-precedence}

Depends on: **b** · docs: [features/skills](/squad/docs/features/skills/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | Digest §17 lists `.squad/skills/` → `.copilot/skills/` → `.github/skills/` → `.claude/skills/` → `.agents/skills/` with earlier-wins precedence. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/skills.test.ts::*`<br>`untested` |

### Reviewer rejection protocol & strict author lockout {#reviewer-lockout}

Depends on: **b** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Reviewer Rejection Protocol`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §12: REJECT locks out the author; revision reassigned; re-review required. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Rai — Responsible-AI reviewer (🟢/🟡/🔴) {#rai}

Depends on: **b, d** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Rai — RAI Reviewer`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Canonical §Rai; background by default. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `claude` | ✅ supported | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §13; background capable. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §13; runs synchronously where `background-runs` is absent (see background-agents). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Fact Checker — verification & devil's advocate {#fact-checker}

Depends on: **b** · docs: [features/reviewer-protocol](/squad/docs/features/reviewer-protocol/) · canonical sections: `Fact Checker — Verification & Devil's Advocate`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §14 with ✅/⚠️/❌/🔍 ratings, steelman and pre-mortem. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Ceremonies (before/after/manual, cooldowns) {#ceremonies}

Depends on: **b, c** · docs: [features/ceremonies](/squad/docs/features/ceremonies/) · canonical sections: `Ceremonies`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §15 reads `ceremonies.md`, spawns a facilitator, records via `squad_decide`. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Human team members (never spawned; routed as requests) {#human-members}

Depends on: **b** · docs: [features/human-team-members](/squad/docs/features/human-team-members/) · [scenarios/team-of-humans](/squad/docs/scenarios/team-of-humans/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §21. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### @copilot coding agent member (`squad copilot`, GitHub assignment) {#copilot-coding-agent}

Depends on: **a, b, e** · docs: [features/copilot-coding-agent](/squad/docs/features/copilot-coding-agent/) · canonical sections: `Copilot Coding Agent Member`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `claude` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `kiro` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `opencode` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `cursor` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |
| `antigravity` | ✅ supported | CLI toggles the member; digest §21 says never spawn it, review its PRs. Assignment happens on GitHub, independent of the local host. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/team-capabilities-lifecycle.test.ts::*`<br>`static-only` |

### Ralph — interactive work monitor ("Ralph, go") {#ralph-coordinator-loop}

Depends on: **b, e** · docs: [features/ralph](/squad/docs/features/ralph/) · canonical sections: `Ralph — Work Monitor`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §9: coordinator runs the loop itself via `gh`; circuit breaker template. Requires `gh` authenticated inside the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Ralph CLI (`squad triage` / `watch` / `loop` --execute) {#ralph-cli-triage-watch}

Depends on: **a, e** (host-independent) · docs: [features/ralph](/squad/docs/features/ralph/) · [features/labels](/squad/docs/features/labels/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Default `agentCmd` is the Copilot CLI (`copilot -p …`). | `validated-test:test/ralph-triage.test.ts::*`<br>`validated-test:test/ralph-monitor.test.ts::*`<br>`validated-test:test/watch-fleet-dispatch.test.ts::*` |
| `claude` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | Scanning/routing is host-agnostic, but `--execute` dispatches through the Copilot CLI unless `agentCmd` (`--agent-cmd "<host> … {prompt}"`) is configured; no built-in preset for this host. | `validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |

### Personal squad & consult mode (`squad personal`, `squad consult`, `squad extract`) {#consult-personal-squad}

Depends on: **a, b** · docs: [features/consult-mode](/squad/docs/features/consult-mode/) · [guide/personal-squad](/squad/docs/guide/personal-squad/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI manages the personal squad; canonical §Personal Squad (Ambient Discovery) + §Consult Mode Detection route personal agents as advisors. | `validated-test:test/personal-squad.test.ts::*`<br>`validated-test:test/sdk/consult.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | CLI side works everywhere; the digest has no Personal-Squad / Consult-Mode section, so ambient discovery of `~/.squad` personal agents depends on the host reading the canonical file on demand. | `validated-test:test/personal-squad.test.ts::*`<br>`static-only` |

### PRD mode (decompose → approve → dependency-aware dispatch) {#prd-mode}

Depends on: **b** · docs: [features/prd-mode](/squad/docs/features/prd-mode/) · canonical sections: `PRD Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §19; `prd-intake.md` template on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### GitHub Issues mode (connect, list, route, branch → PR → merge) {#github-issues-mode}

Depends on: **b, e** · docs: [features/github-issues](/squad/docs/features/github-issues/) · [concepts/github-workflow](/squad/docs/concepts/github-workflow/) · [scenarios/issue-driven-dev](/squad/docs/scenarios/issue-driven-dev/) · canonical sections: `GitHub Issues Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §18 with `gh` prerequisites, `squad/{issue}-{slug}` branches, `gh pr create`; `issue-lifecycle.md` on demand. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Labels & triage (`squad` / `squad:<member>` taxonomy) {#labels-triage}

Depends on: **a, b, e** · docs: [features/labels](/squad/docs/features/labels/) · canonical sections: `GitHub Issues Mode`, `Ralph — Work Monitor`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | Digest §9/§18 route by `squad:<member>` labels; CLI triage applies the same taxonomy. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/ralph-triage.test.ts::*`<br>`untested` |

### Project boards (`squad triage --board`) {#project-boards}

Depends on: **a, e** (host-independent) · docs: [features/project-boards](/squad/docs/features/project-boards/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `claude` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `kiro` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `opencode` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `cursor` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `codex` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |
| `antigravity` | ✅ supported | CLI capability, GitHub Projects via `gh`; the local host is not involved. | `validated-test:test/ralph-board.test.ts::*` |

### GitLab Issues mode (experimental, `glab`) {#gitlab-issues}

Depends on: **b, e** · docs: [features/gitlab-issues](/squad/docs/features/gitlab-issues/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `claude` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `kiro` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `opencode` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `cursor` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `codex` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |
| `antigravity` | ⚠️ degraded | Docs-only: no `gitlab` PlatformType in the SDK, no `glab` path in `squad triage\|watch`, and neither the canonical agent nor the digest has a GitLab section. Works only if the model follows the docs page ad hoc with `glab`. _Finding F2._ | `static-only` |

### Azure DevOps platform (work items, PRs, `az boards`, ADO MCP) {#azure-devops}

Depends on: **a, b, e** · docs: [features/enterprise-platforms](/squad/docs/features/enterprise-platforms/) · canonical sections: `GitHub Issues Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ⚠️ degraded | `squad triage\|watch` auto-detect ADO from the remote (or `config.platform: azure-devops`) and use `az`; `squad upgrade` seeds an `EXAMPLE-azure-devops` MCP server in `.mcp.json`. The coordinator section is GitHub-only (`gh`); ADO commands exist only in `issue-lifecycle.md`. _Finding F3: interactive Issues mode has no ADO branch in the prompt._ | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | CLI triage/watch on ADO is host-agnostic. In-host Issues mode: digest §18 is `gh`-only and the ADO MCP example is only seeded into Copilot's `.mcp.json`; ADO commands reachable only via `issue-lifecycle.md` on demand. _Finding F3._ | `validated-test:test/platform-adapter.test.ts::*`<br>`static-only` |

### Upstream inheritance (`squad upstream add|sync`, inherited skills/decisions/wisdom/routing) {#upstream-inheritance}

Depends on: **a, b** · docs: [features/upstream-inheritance](/squad/docs/features/upstream-inheritance/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | CLI config/clone/sync is host-agnostic and tested. Runtime inheritance is not wired: `resolveUpstreams()` has no CLI/MCP caller, and neither the canonical agent nor the digest tells the coordinator to read `upstream.json` (only the `cross-squad` skill mentions it). _Finding F1: docs promise "coordinator reads upstreams at session start" but no prompt/CLI path implements it on any host._ | `validated-test:test/upstream.test.ts::*`<br>`validated-test:test/upstream-e2e.test.ts::*`<br>`static-only` |

### Multiple squads / cross-squad (`squad registry|discover|delegate`, cross-squad skills) {#cross-squad-registry}

Depends on: **a, b, e** · docs: [scenarios/multiple-squads](/squad/docs/scenarios/multiple-squads/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | Digest §20 routes peer-squad requests through the `cross-squad` / `cross-squad-communication` skills; CLI registry + delegate (GitHub issue handoff via `gh`). | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`validated-test:test/cross-squad-registry.test.ts::*`<br>`validated-test:test/cross-squad.test.ts::*`<br>`untested` |

### SubSquads / workstreams (`squad subsquads`, multi-Codespace) {#subsquads}

Depends on: **a** (host-independent) · docs: [scenarios/multi-codespace](/squad/docs/scenarios/multi-codespace/) · [scenarios/scaling-workstreams](/squad/docs/scenarios/scaling-workstreams/) · [features/streams](/squad/docs/features/streams/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `claude` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `kiro` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `opencode` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `cursor` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `codex` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |
| `antigravity` | ✅ supported | CLI + watch discovery; host not involved. | `validated-test:test/watch-subsquad-discovery.test.ts::*` |

### Monorepo / team-root resolution (`--team-root`, `SQUAD_TEAM_ROOT`, launch from a subfolder) {#monorepo-team-root}

Depends on: **a, b, c, d** · docs: [scenarios/monorepo](/squad/docs/scenarios/monorepo/) · [features/worktrees](/squad/docs/features/worktrees/) · canonical sections: `State & Team Root Resolution (before mode check)`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI honours `--team-root`/`SQUAD_TEAM_ROOT`; state-mcp walks up from cwd (`findSquadDir`); canonical §State & Team Root Resolution + `worktree-reference.md` resolve `TEAM_ROOT` and pass it to every spawn. | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | CLI/MCP resolution is host-agnostic, but the digest has no team-root section (only `worktree-reference.md` on demand) and the host discovers its projected agent/MCP config from its own project root, so launching from a package subfolder may not load the Squad coordinator at all. _Validate per host: does the host find root-level projections from a subfolder cwd?_ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |

### Dual-root remote mode (`squad init --mode remote`, `link`, `externalize` / `internalize`) {#dual-root-remote-mode}

Depends on: **a, b, c** · docs: [features/dual-mode-deployment](/squad/docs/features/dual-mode-deployment/) · [scenarios/team-state-storage](/squad/docs/scenarios/team-state-storage/) · canonical sections: `State & Team Root Resolution (before mode check)`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI writes `config.json.teamRoot`; state-mcp resolves `mode: remote`; canonical step 3 loads `team.md` from the team root. | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `claude` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `kiro` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `opencode` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `cursor` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `codex` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |
| `antigravity` | ⚠️ degraded | State tools follow `teamRoot` transparently, but the digest reads `.squad/team.md` literally and never mentions `teamRoot`/`stateLocation`, so a satellite repo may look like Init Mode to the host coordinator. _Finding F4 candidate — validate._ | `validated-test:test/resolution.test.ts::*`<br>`static-only` |

### Git worktrees & worktree mode (issue worktrees, `WORKTREE_PATH`) {#git-worktrees}

Depends on: **a, b, d** · docs: [features/worktrees](/squad/docs/features/worktrees/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |
| `claude` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |
| `kiro` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |
| `opencode` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |
| `cursor` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`static-only` |
| `codex` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |
| `antigravity` | ✅ supported | Digest §9/§18 prefer an isolated worktree per issue and point to `worktree-reference.md`; needs shell access in the host. | `validated-test:test/clients.test.ts::coordinator Ralph mode`<br>`validated-test:test/worktree.test.ts::*`<br>`untested` |

### Export / import (`squad export`, `squad import`, team portability) {#export-import}

Depends on: **a** (host-independent) · docs: [features/export-import](/squad/docs/features/export-import/) · [scenarios/team-portability](/squad/docs/scenarios/team-portability/) · [concepts/portability](/squad/docs/concepts/portability/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `claude` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `kiro` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `opencode` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `cursor` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `codex` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |
| `antigravity` | ✅ supported | Pure CLI; portable `clients[]` hygiene strips host secrets. | `validated-test:test/cli/export-import.test.ts::*`<br>`validated-test:test/clients.test.ts::portable clients[] hygiene` |

### Storage provider abstraction (FS / SQLite / external state) {#storage-provider}

Depends on: **a, c** (host-independent) · docs: [features/storage-provider](/squad/docs/features/storage-provider/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `claude` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `kiro` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `opencode` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `cursor` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `codex` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |
| `antigravity` | ✅ supported | SDK/CLI layer under state-mcp; host not involved. | `validated-test:test/state-backend.test.ts::*` |

### Notifications (`watch --notify-level`, Teams/email monitors) {#notifications}

Depends on: **a** (host-independent) · docs: [features/notifications](/squad/docs/features/notifications/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `claude` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `kiro` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `opencode` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `cursor` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `codex` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |
| `antigravity` | ✅ supported | CLI watch capability. | `validated-test:test/watch-notify-level.test.ts::*` |

### Marketplace & plugins (`squad plugin marketplace …`, skill install on cast) {#marketplace-plugins}

Depends on: **a, b** · docs: [features/marketplace](/squad/docs/features/marketplace/) · [features/plugins](/squad/docs/features/plugins/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI + canonical "check plugin marketplaces when adding a member" step. | `static-only` |
| `claude` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |
| `kiro` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |
| `opencode` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |
| `cursor` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |
| `codex` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |
| `antigravity` | ⚠️ degraded | CLI works; the digest Init/cast flow does not include the marketplace-browse step. | `static-only` |

### MCP integration (user MCP servers discovered; MCP → CLI fallback) {#mcp-integration}

Depends on: **b, d** · docs: [features/mcp](/squad/docs/features/mcp/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Canonical §MCP Integration with tool-prefix discovery and `gh`/`az` fallbacks; `.mcp.json`. | `static-only` |
| `claude` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `kiro` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `opencode` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `cursor` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `codex` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |
| `antigravity` | ✅ supported | Host loads its own MCP config; `squad_state` is merged without clobbering user servers. Digest lacks the discovery/fallback table but hosts expose MCP tools natively. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`static-only` |

### Standalone install (no npm; `squad.exe state-mcp` launch spec) {#standalone-install}

Depends on: **a** (host-independent) · docs: [features/standalone-install](/squad/docs/features/standalone-install/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `claude` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `kiro` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `opencode` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `cursor` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `codex` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |
| `antigravity` | ✅ supported | `mcp-spec.ts` picks the standalone binary for the state-mcp launch spec in every projection. | `validated-test:test/cli/upgrade.test.ts::*` |

### VS Code (`runSubagent`, settings default agent) {#vscode}

Depends on: **d** · docs: [features/vscode](/squad/docs/features/vscode/) · canonical sections: `Team Mode`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Canonical §Client Compatibility micro-playbook; `squad init` writes `.vscode/settings.json`. | `validated-test:test/cli/init.test.ts::*`<br>`static-only` |
| `claude` | — n/a | Copilot-specific surface. | `static-only` |
| `kiro` | — n/a | Copilot-specific surface. | `static-only` |
| `opencode` | — n/a | Copilot-specific surface. | `static-only` |
| `cursor` | — n/a | Copilot-specific surface. | `static-only` |
| `codex` | — n/a | Copilot-specific surface. | `static-only` |
| `antigravity` | — n/a | Copilot-specific surface. | `static-only` |

### Squad RC / `squad start` (remote control bridge, tunnels) {#squad-rc-start}

Depends on: **a, d** · docs: [features/squad-rc](/squad/docs/features/squad-rc/) · [scenarios/remote-qa](/squad/docs/scenarios/remote-qa/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `squad start\|rc` wrap the Copilot CLI with phone/browser access. | `validated-test:test/cli/rc.test.ts::*`<br>`static-only` |
| `claude` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `kiro` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `opencode` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `cursor` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `codex` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |
| `antigravity` | — n/a | Bridges the Copilot CLI (ACP stdio); other hosts are not wrapped. | `static-only` |

### Enterprise platforms (ADO + Planner work items, Teams/ADO discussions) {#enterprise-platforms}

Depends on: **a, e** (host-independent) · docs: [features/enterprise-platforms](/squad/docs/features/enterprise-platforms/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `claude` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `kiro` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `opencode` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `cursor` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `codex` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |
| `antigravity` | ✅ supported | Platform adapters in `@bradygaster/squad-sdk/platform`, consumed by `squad triage\|watch`. | `validated-test:test/platform-adapter.test.ts::*`<br>`validated-test:test/ralph-commands.test.ts::*` |

### Distributed mesh, capability routing, rate limiting, KEDA autoscaling {#distributed-mesh}

Depends on: **a** (host-independent) · docs: [features/distributed-mesh](/squad/docs/features/distributed-mesh/) · [features/capability-routing](/squad/docs/features/capability-routing/) · [features/rate-limiting](/squad/docs/features/rate-limiting/) · [features/keda-scaling](/squad/docs/features/keda-scaling/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `claude` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `kiro` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `opencode` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `cursor` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `codex` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |
| `antigravity` | ✅ supported | Fleet/watch-side features; the interactive host is not involved. | `validated-test:test/watch-fleet-dispatch.test.ts::*`<br>`validated-test:test/rate-limiting.test.ts::*`<br>`validated-test:test/watch-rate-limit.test.ts::*` |

### Aspire dashboard / OTel observability (`squad aspire`) {#aspire-dashboard}

Depends on: **a** (host-independent) · docs: [scenarios/aspire-dashboard](/squad/docs/scenarios/aspire-dashboard/) · [scenarios/production-observability](/squad/docs/scenarios/production-observability/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `claude` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `kiro` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `opencode` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `cursor` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `codex` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |
| `antigravity` | ✅ supported | CLI launches the dashboard; OTel export from the SDK runtime. | `validated-test:test/aspire-command.test.ts::*`<br>`validated-test:test/otel-export.test.ts::*` |

### GitHub Agentic Workflows (gh-aw) integration {#gh-aw}

Depends on: **e** · docs: [guide/gh-aw](/squad/docs/guide/gh-aw/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Workflows in `workflows/*.md`; verifier + e2e scripts. | `validated-test:test/gh-aw-enlistment-skill.test.ts::*`<br>`static-only` |
| `claude` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `kiro` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `opencode` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `cursor` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `codex` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |
| `antigravity` | — n/a | Runs in GitHub Actions with the Copilot engine; the local host is irrelevant. | `static-only` |

### SDK-first mode (`squad.config.ts`, `squad build`, `squad migrate`) {#sdk-first-mode}

Depends on: **a** (host-independent) · docs: [sdk-first-mode](/squad/docs/sdk-first-mode/) · [reference/sdk](/squad/docs/reference/sdk/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `claude` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `kiro` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `opencode` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `cursor` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `codex` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |
| `antigravity` | ✅ supported | Compiles to the same `.squad/` markdown every host consumes. | `validated-test:test/migrate.test.ts::*` |

### Maintenance CLIs (`squad doctor`, `squad health`, `squad nap`, `squad upgrade`) {#doctor-health-nap}

Depends on: **a** (host-independent) · docs: [reference/cli](/squad/docs/reference/cli/) · [scenarios/upgrading](/squad/docs/scenarios/upgrading/) · [scenarios/troubleshooting](/squad/docs/scenarios/troubleshooting/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `claude` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `kiro` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `opencode` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `cursor` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `codex` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |
| `antigravity` | ✅ supported | Pure CLI; `upgrade --client` refreshes every configured host projection. | `validated-test:test/cli/doctor.test.ts::*`<br>`validated-test:test/cli/upgrade.test.ts::*`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::RC1→stable exit 1: upgrade and rollback from a v0.1 workspace` |

### Squad 2.0 `--client` projection (coordinator file + MCP config per host, rollback) {#client-projection}

Depends on: **a, d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/) · [scenarios/using-squad-across-clients](/squad/docs/scenarios/using-squad-across-clients/) · [scenarios/client-compatibility](/squad/docs/scenarios/client-compatibility/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts` |
| `claude` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::claude discovers the squad subagents and parses .mcp.json` |
| `kiro` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::kiro validates and lists the squad agent` |
| `opencode` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::opencode loads squad as a primary agent and connects the MCP server` |
| `cursor` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::cursor-agent lists the squad_state server from .cursor/mcp.json (read-only)`<br>`static-only` |
| `codex` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::codex loads the project config (trusted), sees squad_state MCP, discovers the squad TOML role, and activates coordinator instructions on spawn` |
| `antigravity` | ✅ supported | `installClients()` writes host-native files idempotently; real CLIs load them. | `validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 1: client projections and --client`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients.test.ts::Reviewer gate (@Bubu): /client <-> /clients export identity (===), pure projection boundary, and byte-exact rollback across all 7 hosts`<br>`validated-test:test/clients-real-cli.test.ts::antigravity discovers the squad agent` |

### `squad_state` MCP bridge reachable from the host (stdio, host-prefixed tool names) {#squad-state-mcp-bridge}

Depends on: **c, d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/) · [reference/tools-and-hooks](/squad/docs/reference/tools-and-hooks/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested` |
| `claude` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested`<br>`validated-test:test/clients-real-cli.test.ts::claude discovers the squad subagents and parses .mcp.json` |
| `kiro` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested`<br>`validated-test:test/clients-real-cli.test.ts::kiro validates and lists the squad agent` |
| `opencode` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested`<br>`validated-test:test/clients-real-cli.test.ts::opencode loads squad as a primary agent and connects the MCP server` |
| `cursor` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`validated-test:test/clients-real-cli.test.ts::cursor-agent lists the squad_state server from .cursor/mcp.json (read-only)`<br>`static-only` |
| `codex` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested`<br>`validated-test:test/clients-real-cli.test.ts::codex loads the project config (trusted), sees squad_state MCP, discovers the squad TOML role, and activates coordinator instructions on spawn` |
| `antigravity` | ✅ supported | Projected launch spec `npx -y @bradygaster/squad-cli@<ver> state-mcp` (or standalone binary); digest §4 documents the host prefixes. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::executes squad_state tools against the workspace .squad directory`<br>`validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::writes the host config and agent files each client reads`<br>`untested`<br>`validated-test:test/clients-real-cli.test.ts::antigravity discovers the squad agent` |

### Capability negotiation (client ∩ backend ∩ policy) {#capability-negotiation}

Depends on: **c** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `claude` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `kiro` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `opencode` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `cursor` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `codex` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |
| `antigravity` | ✅ supported | `CAPABILITY_TOKENS_BY_HOST` 1:1 with `capability-matrix.json`; negotiated over real JSON-RPC. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::negotiates capabilities for the client per capability-matrix.json`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::12. capability tokens match capability-matrix.json for all 7 hosts`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 2: cross-plane capability intersection` |

### Experimental conversation backend (`squad_backend_*`, durable-http, approvals, resume) {#experimental-backend}

Depends on: **c** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `claude` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `kiro` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `opencode` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `cursor` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `codex` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |
| `antigravity` | ✅ supported | Opt-in tools over the same MCP server; backend semantics are host-independent. | `validated-test:test/squad-20-real-clients-stdio.e2e.test.ts::completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Scenario 4: DurableHttpSquadBackend full HTTP lifecycle`<br>`validated-test:test/squad-20-all-scenarios.e2e.test.ts::Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect` |

### Process hygiene (never kill by image name; PID-only) {#process-hygiene}

Depends on: **b** · docs: [scenarios/troubleshooting](/squad/docs/scenarios/troubleshooting/) · canonical sections: `Constraints`

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `claude` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `kiro` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `opencode` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `cursor` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`static-only` |
| `codex` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |
| `antigravity` | ✅ supported | Digest §22–23. | `validated-test:test/clients.test.ts::coordinator behavioral-contract parity`<br>`untested` |

### Specialists (subagents) can reach `squad_state` tools themselves {#subagent-mcp-inheritance}

Depends on: **d** · docs: [concepts/squad-2-0-architecture](/squad/docs/concepts/squad-2-0-architecture/)

| Host | Status | Mechanism | Validation |
|------|--------|-----------|------------|
| `copilot` | ✅ supported | `task` subagents inherit the session MCP servers. | `static-only` |
| `claude` | ✅ supported | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). | `untested` |
| `kiro` | ✅ supported | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). | `untested` |
| `opencode` | ✅ supported | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). | `untested` |
| `cursor` | ✅ supported | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). | `static-only` |
| `codex` | ✅ supported | Subagents inherit MCP servers (Claude `Task`, Codex `spawn_agent`, OpenCode child sessions, Kiro subagents). | `untested` |
| `antigravity` | ⚠️ degraded | `invoke_subagent` starts with a clean context; MCP attached via agent frontmatter may not propagate — specialists return results for the coordinator to persist. | `untested` |

