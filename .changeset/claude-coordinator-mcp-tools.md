---
"@bradygaster/squad-sdk": patch
---

The Claude Code coordinator projection (`.claude/agents/squad.md`) no longer writes a `tools` allowlist. The allowlist named only `mcp__squad_state`, so any MCP server a user added next to `squad_state` in `.mcp.json` (for example a memory server) was hidden from the coordinator and its sub-agents, and `squad upgrade` reverted hand edits. Like the Copilot coordinator (`tools: ["*"]`), the Claude coordinator now inherits every tool in the session.
