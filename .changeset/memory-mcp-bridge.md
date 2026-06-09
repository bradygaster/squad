---
"@bradygaster/squad-cli": patch
---

feat(mcp): bridge governed memory tools (memory.classify, memory.write, memory.search, memory.promote, memory.delete, memory.audit) through the squad_state MCP server. Previously these tools were registered in the SDK ToolRegistry but not exposed via MCP, so autonomous agents running in Copilot CLI couldn't invoke them. Now `squad init` and `squad upgrade` produce a deck that includes the full governed-memory surface for agents.
