# Multi-client quickstart for Squad 2.0

> **Canonical Published Guide:** See [Using Squad across clients](../src/content/docs/scenarios/using-squad-across-clients.md) and [Squad 2.0 architecture](../src/content/docs/concepts/squad-2-0-architecture.md) on the published Astro docs site for the complete multi-client guide and architecture reference.

The `--client` flag on `squad init` and `squad upgrade` (backed by `@bradygaster/squad-sdk/client`; `@bradygaster/squad-sdk/clients` is a deprecated alias) projects native coordinator and MCP files for all **7 supported hosts**: GitHub Copilot, Claude Code, Kiro, OpenCode, Cursor, OpenAI Codex, and Google Antigravity (`copilot|claude|kiro|opencode|cursor|codex|antigravity|all`).

## Host projection summary

| Host (`--client`) | Generated files | How to launch |
|---|---|---|
| GitHub Copilot (`copilot`) | `.github/agents/squad.agent.md`, `.mcp.json` | `copilot --agent squad` |
| Claude Code (`claude`) | `.claude/agents/squad.md`, `CLAUDE.md` (managed block), `.mcp.json`, `.gitignore` block (`.claude/worktrees/`) | `claude --agent squad --mcp-config .mcp.json` |
| Kiro (`kiro`) | `.kiro/steering/squad.md` (`inclusion: manual`), `.kiro/agents/squad.json`, `.kiro/settings/mcp.json` | Select the `squad` agent in Kiro |
| OpenCode (`opencode`) | `.opencode/agent/squad.md`, `opencode.json` | `@squad` or OpenCode `task` flow |
| Cursor (`cursor`) | `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc` (`alwaysApply: false`), `.cursor/mcp.json` | Select the `squad` agent in Cursor |
| OpenAI Codex (`codex`) | `.codex/agents/squad.toml` (Codex custom agent with `developer_instructions`), `AGENTS.md` (short pointer block), `.codex/config.toml` (`[mcp_servers.squad_state]`) | Run `codex` in the repo |
| Google Antigravity (`antigravity`) | `.agents/agents/squad.md` (with `squad_state` MCP server in frontmatter), `GEMINI.md` (pointer block) | `agy --agent squad` |

---

## Quickstart by host

### 1. Claude Code

```bash
npx squad init --client claude
# or on an existing repo:
npx squad upgrade --client claude
```

- `.claude/agents/squad.md` is the coordinator entrypoint (dispatches specialists via `Task` with `.squad/agents/<member>/charter.md` inlined).
- `.mcp.json` wires `squad_state` additively; `CLAUDE.md` is updated only inside a managed `<!-- squad:begin ... -->` / `<!-- squad:end -->` block, and `.gitignore` gains `.claude/worktrees/` under a `# squad:claude` comment line.

### 2. Kiro

```bash
npx squad init --client kiro
```

- `.kiro/steering/squad.md` is generated with `inclusion: manual` so coordinator instructions are loaded on demand rather than injected into unrelated chats.
- `.kiro/agents/squad.json` points to `file://../steering/squad.md` and `.squad/team.md` / `.squad/routing.md`; `.kiro/settings/mcp.json` merges `squad_state` additively.

### 3. OpenCode

```bash
npx squad init --client opencode
```

- Writes `.opencode/agent/squad.md` (`mode: primary`) and merges `mcp.squad_state` into `opencode.json` without clobbering existing model or MCP settings.

### 4. Cursor

```bash
npx squad init --client cursor
```

- Writes `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc` (`alwaysApply: false`), and `.cursor/mcp.json`. Run `cursor-agent mcp enable squad_state` once to approve the MCP server.

### 5. OpenAI Codex

```bash
npx squad init --client codex
```

- Writes the coordinator as a Codex custom agent to `.codex/agents/squad.toml` (`name`, `description`, multi-line `developer_instructions`), a short discovery pointer block to `AGENTS.md` (so other tools that auto-load `AGENTS.md` are not flooded), and merges `[mcp_servers.squad_state]` into `.codex/config.toml`.

### 6. Google Antigravity

```bash
npx squad init --client antigravity
```

- Writes `.agents/agents/squad.md` (declaring `squad_state` under `mcpServers:` in YAML frontmatter) and a `GEMINI.md` pointer block. Run `agy --agent squad`.

---

## Polyglot repos and programmatic API

Initialize all 7 hosts at once or add hosts incrementally:

```bash
npx squad init --client all
npx squad upgrade --client copilot,claude,cursor,codex,antigravity
```

`.squad/config.json` stores only portable canonical slugs in `clients[]` (enforced by `normalizeClientIds()` and `assertPortableClients()` in `@bradygaster/squad-sdk/client`), and shared JSON/TOML MCP configs are merged additively without overwriting existing servers.

```ts
import { installClients, parseClients } from '@bradygaster/squad-sdk/client';

installClients(parseClients('claude,cursor,codex'), {
  root: process.cwd(),
  mcp: { command: 'squad', args: ['state-mcp'] },
});
```
