---
title: Using Squad across clients
description: Step-by-step guidance for projecting one Squad team into Copilot, Claude Code, Kiro, OpenCode, and Cursor with the new --client adapters.
---

# Using Squad across clients

Squad 2.0 adds host-native client projections through `squad init --client ...` and `squad upgrade --client ...`.

The important idea is that one `.squad/` team can now project into multiple client hosts without changing the underlying backend contract.

## Quick commands

```bash
npx squad init --client claude
npx squad init --client kiro
npx squad init --client opencode
npx squad init --client cursor
npx squad init --client all
```

For an existing repo:

```bash
npx squad upgrade --client copilot,claude,cursor
```

## What each adapter generates

| Client | Generated files |
|---|---|
| Claude Code | `.claude/agents/squad.md`, optional `.claude/agents/squad-<member>.md`, `.mcp.json`, `CLAUDE.md` managed block |
| Kiro | `.kiro/steering/squad.md`, `.kiro/agents/squad.json`, `.kiro/settings/mcp.json` |
| OpenCode | `.opencode/agent/squad.md`, `opencode.json` |
| Cursor | `.cursor/rules/squad.mdc`, `.cursor/agents/squad.md`, `.cursor/mcp.json` |
| Copilot | `.github/agents/squad.agent.md` plus `.mcp.json` |

## Claude Code walkthrough

1. Run `npx squad init --client claude`.
2. Open `.claude/agents/squad.md` to inspect the coordinator prompt.
3. Confirm `.mcp.json` contains `squad_state`.
4. Check `CLAUDE.md` for the managed Squad marker block.
5. Run `claude --agent squad` or delegate to the `squad` subagent.

## Kiro walkthrough

1. Run `npx squad init --client kiro`.
2. Verify `.kiro/steering/squad.md` and `.kiro/agents/squad.json` were created.
3. Confirm `.kiro/settings/mcp.json` contains the additive `squad_state` entry.
4. Open the repo in Kiro and use the generated `squad` agent.

## OpenCode walkthrough

1. Run `npx squad init --client opencode`.
2. Verify `.opencode/agent/squad.md` exists.
3. Check `opencode.json` for `mcp.squad_state`.
4. Invoke Squad with the generated agent anchor or host task flow.

## Cursor walkthrough

1. Run `npx squad init --client cursor`.
2. Verify `.cursor/rules/squad.mdc`, `.cursor/agents/squad.md`, and `.cursor/mcp.json` exist.
3. Open Cursor and select the `squad` agent.
4. Let the coordinator route work from there.

## Polyglot repo walkthrough

If you want one repo to work everywhere, either:

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

That list is projection metadata only. It does not carry secrets, machine paths, URLs, thread ids, lease tokens, or checkpoint state.

## Why the merge behavior matters

Every client adapter uses additive config merging for shared JSON files. Existing MCP servers and top-level settings are preserved. Malformed JSON is refused instead of overwritten.

That means you can safely add Squad to a repo that already has GitHub, Azure, or other MCP servers configured.

## Read next

- [Squad 2.0 architecture](../concepts/squad-2-0-architecture.md)
- [Client compatibility](./client-compatibility.md)
