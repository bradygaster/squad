---
title: Using Squad across clients
description: Step-by-step guidance for projecting one Squad team into GitHub Copilot, Claude Code, Kiro, OpenCode, Cursor, OpenAI Codex, and Google Antigravity with the --client adapters.
---

# Using Squad across clients

Squad 2.0 adds host-native client projections across all 7 supported hosts — GitHub Copilot, Claude Code, Kiro, OpenCode, Cursor, OpenAI Codex, and Google Antigravity (`copilot|claude|kiro|opencode|cursor|codex|antigravity|all`) — through `squad init --client ...` and `squad upgrade --client ...`.

One `.squad/` team projects into multiple client hosts without changing the underlying team state or backend contract. Programmatic host projections live in `@bradygaster/squad-sdk/client` (with `@bradygaster/squad-sdk/clients` kept as a deprecated alias).

## Quick commands

```bash
npx squad init --client copilot
npx squad init --client claude
npx squad init --client kiro
npx squad init --client opencode
npx squad init --client cursor
npx squad init --client codex
npx squad init --client antigravity
npx squad init --client all
```

For an existing repo:

```bash
npx squad upgrade --client copilot,claude,cursor
```

## What each adapter generates

| Client (`ClientId`) | Generated files |
|---|---|
| GitHub Copilot (`copilot`) | `.github/agents/squad.agent.md` plus `.mcp.json` |
| Claude Code (`claude`) | `.claude/agents/squad.md`, `.mcp.json`, `CLAUDE.md` managed block, `.gitignore` block for `.claude/worktrees/` |
| Kiro (`kiro`) | `.kiro/steering/squad.md` (`inclusion: manual`), `.kiro/agents/squad.json`, `.kiro/settings/mcp.json` |
| OpenCode (`opencode`) | `.opencode/agent/squad.md`, `opencode.json` |
| Cursor (`cursor`) | `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc` (`alwaysApply: false`), `.cursor/mcp.json` |
| OpenAI Codex (`codex`) | `.codex/agents/squad.toml` (Codex custom agent with `developer_instructions`), `AGENTS.md` (short pointer block), `.codex/config.toml` (`[mcp_servers.squad_state]`) |
| Google Antigravity (`antigravity`) | `.agents/agents/squad.md` (with `squad_state` MCP server in frontmatter), `GEMINI.md` (pointer block) |

Every host gets one coordinator file. Team members are not projected as separate host agents: the coordinator spawns each specialist as a generic subagent with that member's `.squad/agents/<name>/charter.md` inlined, exactly as Copilot does.

## Claude Code walkthrough

1. Run `npx squad init --client claude`.
2. Open `.claude/agents/squad.md` to inspect the coordinator prompt.
3. Confirm `.mcp.json` contains `squad_state` and `.gitignore` contains the managed `.claude/worktrees/` block.
4. Check `CLAUDE.md` for the managed Squad marker block (`<!-- squad:begin ... -->` / `<!-- squad:end -->`); your notes outside the block are preserved.
5. Run `claude --agent squad --mcp-config .mcp.json` or delegate to the `squad` subagent. Claude Code does not load project-scoped `.mcp.json` servers until they are approved (`claude mcp list` shows `squad_state … Pending approval`); approve them once interactively, or always pass the config explicitly. **Headless runs (`claude -p …`, CI, scripts) must pass `--mcp-config .mcp.json`:** without it the coordinator has no `squad_state_*` tools, falls back to reading `.squad/team.md` directly, and halts on the state-backend handshake for `orphan` / `two-layer` backends. Squad deliberately does not write `enableAllProjectMcpServers: true` into `.claude/settings.json` for you.

## Kiro walkthrough

1. Run `npx squad init --client kiro`.
2. Verify `.kiro/steering/squad.md` (`inclusion: manual`) and `.kiro/agents/squad.json` (pointing at `file://../steering/squad.md`) were created.
3. Confirm `.kiro/settings/mcp.json` contains the additive `squad_state` entry.
4. Open the repo in Kiro and select the generated `squad` agent; manual steering inclusion keeps non-Squad sessions clean while loading the coordinator prompt when `squad` is active.

## OpenCode walkthrough

1. Run `npx squad init --client opencode`.
2. Verify `.opencode/agent/squad.md` exists (`mode: primary`).
3. Check `opencode.json` for the additive `mcp.squad_state` entry (`type: "local"`, `command: ["squad", "state-mcp"]`).
4. Invoke Squad with `@squad` or the host `task` flow.

## Cursor walkthrough

1. Run `npx squad init --client cursor`.
2. Verify `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc` (`alwaysApply: false`), and `.cursor/mcp.json` exist.
3. Open Cursor and select the `squad` agent (or invoke the rule on demand without forcing coordinator instructions into unrelated chats).
4. Let the coordinator route work from there.

## Codex walkthrough

1. Run `npx squad init --client codex`.
2. Verify `.codex/agents/squad.toml` defines the `squad` custom agent (`name`, `description`, `developer_instructions`), `AGENTS.md` contains the short discovery pointer block (`<!-- squad:begin:codex ... -->`), and `.codex/config.toml` has `[mcp_servers.squad_state]`. Keeping full coordinator instructions in `.codex/agents/squad.toml` prevents other tools that auto-load `AGENTS.md` from being flooded.
3. Mark the project trusted in your Codex home config (use the full path, not an 8.3 short path).
4. Start `codex` in the repo; the coordinator spawns one Codex agent per specialist.

## Antigravity walkthrough

1. Run `npx squad init --client antigravity`.
2. Verify `.agents/agents/squad.md` (which declares the `squad_state` MCP server in its YAML frontmatter under `mcpServers:`) and the `GEMINI.md` pointer block.
3. Run `agy --agent squad` (dismiss the first-run verbosity banner with Esc).
4. Quota is per model: if one model is exhausted, start with another via `--model`.

## Troubleshooting

- **`squad cast --name` writes nothing:** an old published `squad` is first on `PATH`. Put the current build first.
- **Cursor:** run `cursor-agent mcp enable squad_state` once so the generated MCP server is approved.
- **Models:** each host needs its own model access (a Copilot license covers Copilot and, through the GitHub Copilot provider, OpenCode; Kiro, Antigravity and Cursor need their own sign-in).

## Polyglot repo walkthrough

If you want one repo to work across all 7 hosts, either:

```bash
npx squad init --client all
```

or incrementally:

```bash
npx squad upgrade --client copilot,claude,cursor
```

Squad persists only canonical client ids in `.squad/config.json`:

```json
{
  "clients": ["copilot", "claude", "cursor"]
}
```

That list is projection metadata only, validated by `normalizeClientIds()` and `assertPortableClients()` from `@bradygaster/squad-sdk/client`. It never carries secrets, machine paths, URLs, thread ids, lease tokens, or checkpoint state.

## Why the merge behavior and rollback matter

Every client adapter uses additive config merging for shared JSON and TOML files (`.mcp.json`, `.kiro/settings/mcp.json`, `opencode.json` / `opencode.jsonc`, `.cursor/mcp.json`, and `.codex/config.toml`). Existing MCP servers, formatting, line endings, and top-level settings are preserved, and malformed config (or `opencode.jsonc` files with comments) is refused instead of overwritten.

To remove a client projection and restore shared files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.gitignore`, and shared MCP configs) byte-for-byte outside Squad's managed sections, call `uninstallClients`:

```ts
import { uninstallClients } from '@bradygaster/squad-sdk/client';

uninstallClients(['claude', 'codex'], {
  root: process.cwd(),
  mcp: { command: 'squad', args: ['state-mcp'] },
});
```

## Static team config vs. mutable runtime state

Across all 7 hosts, the generated coordinator prompt enforces a strict boundary:

- **Mutable runtime state** (decisions, memories, session state) flows through the `squad_state` MCP tools (`squad_decide`, `squad_state_*`, `memory.*`).
- **Static team configuration** (`.squad/team.md`, `.squad/routing.md`, `.squad/config.json`, `.squad/agents/<name>/charter.md`) is read and edited through workspace files and CLI commands (`npx squad cast --name <Name> --role "<Role>"`), never written via `squad_state_write` or hand-edited under `.squad/casting/`.

## Read next

- [Squad 2.0 architecture](../concepts/squad-2-0-architecture.md)
- [Client compatibility](./client-compatibility.md)
- [Upgrading Squad](./upgrading.md)
- [SDK Reference](../reference/sdk.md)
