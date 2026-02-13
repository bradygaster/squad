---
name: "mcp-tool-discovery"
description: "Teaches agents how to detect, evaluate, and use MCP tools available in their Copilot session. Covers discovery patterns, domain-specific tool usage (Trello, Aspire, GitHub, Azure), graceful degradation, and coordinator-level routing."
domain: "agent-infrastructure"
confidence: "medium"
source: "manual"
tools:
  - name: "trello_*"
    description: "Trello board/card/list operations (create, move, update, archive)"
    when: "When Trello MCP server is configured and user requests project management work"
  - name: "aspire_*"
    description: "Aspire dashboard queries (metrics, logs, traces, health checks)"
    when: "When Aspire MCP server is configured and deployment validation is needed"
  - name: "github-mcp-server-*"
    description: "GitHub API operations (issues, PRs, repos, actions, code search)"
    when: "When GitHub MCP server is configured (often pre-configured in Copilot)"
  - name: "azure_*"
    description: "Azure resource management and monitoring operations"
    when: "When Azure MCP server is configured"
  - name: "notion_*"
    description: "Notion page/database operations"
    when: "When Notion MCP server is configured"
---

# MCP Tool Discovery Skill

## Context

MCP (Model Context Protocol) servers extend what Squad agents can do by providing tools for external services — Trello boards, Aspire dashboards, GitHub APIs, Azure resources, Notion databases, and anything else with an MCP server. These tools are configured by the USER in their Copilot environment, not by Squad. Squad's job is to teach agents how to discover what's available and use it effectively.

**Use this skill when:**
- Starting any task that might benefit from external service integration
- The user mentions Trello, Aspire, Azure, Notion, or any external service
- Work involves deployment validation, project management, or cross-platform coordination
- The coordinator needs to decide whether to route work through MCP tools or CLI fallbacks

**Key architectural fact:** Squad does NOT own MCP server lifecycle. Users bring their own MCP servers. Squad teaches agents awareness and usage patterns.

## Platform Reality

### MCP Tool Availability by Agent Type

| Agent Context | MCP Access | Notes |
|--------------|------------|-------|
| Coordinator (parent session) | ✅ Full access | All configured MCP tools are available |
| `general-purpose` sub-agents | ⚠️ Platform-dependent | May or may not inherit MCP tools — check at spawn time |
| `task` sub-agents | ⚠️ Platform-dependent | Same inheritance uncertainty |
| `explore` sub-agents | ❌ No MCP access | Read-only local files only |

**Implication for Squad:** The coordinator should handle MCP-dependent operations directly when possible, or verify tool availability in the sub-agent's context before relying on MCP tools.

### Configuration Locations

MCP servers can be configured at multiple levels (checked in order):

1. **Repository-level:** `.copilot/mcp-config.json` (team-shared, committed to repo)
2. **Workspace-level:** `.vscode/mcp.json` (VS Code workspaces)
3. **User-level:** `~/.copilot/mcp-config.json` (personal)
4. **CLI override:** `--additional-mcp-config` flag (session-specific)

## Patterns

### Pattern 1: Tool Discovery at Task Start

Before using any MCP tool, verify it exists in your current context:

```
1. Review your available tools list (provided in system context)
2. Search for tool names matching the target service:
   - Trello: tools containing "trello"
   - Aspire: tools containing "aspire"  
   - GitHub: tools containing "github-mcp-server"
   - Azure: tools containing "azure"
3. If tools exist → use them directly
4. If tools don't exist → fall back to CLI or inform the user
```

### Pattern 2: Graceful Degradation

When an expected MCP tool is NOT available:

```
Priority 1: Use CLI equivalent if one exists
  - GitHub MCP missing → use `gh` CLI
  - Azure MCP missing → use `az` CLI
Priority 2: Inform the user what's needed
  - "Trello integration requires the Trello MCP server. Add it to .copilot/mcp-config.json"
Priority 3: Continue without the integration
  - Log what would have been done, proceed with available tools
```

Never crash or halt because an MCP tool is missing. MCP tools are enhancements.

### Pattern 3: Coordinator MCP Routing

The coordinator should include MCP tool context when spawning agents:

```
MCP TOOLS AVAILABLE IN THIS SESSION:
- GitHub MCP: ✅ (issues, PRs, code search, actions)
- Trello MCP: ✅ (boards, cards, lists)
- Aspire MCP: ❌ (not configured)

Use available MCP tools when they serve your task. Fall back to CLI 
equivalents when MCP tools are not available.
```

This tells the agent what's available WITHOUT requiring the agent to discover tools itself.

### Pattern 4: Domain-Specific MCP Usage

#### Trello Integration
```
Use Case: Sync GitHub Issues with Trello cards
Tools: trello_create_card, trello_move_card, trello_get_board, trello_list_cards
Pattern:
  1. Read Trello board state: trello_get_board → understand current columns
  2. Map GitHub issue status to Trello columns (e.g., "in progress" → "Doing")
  3. Create/move cards: trello_create_card or trello_move_card
  4. Add GitHub issue link to card description
```

#### Aspire Dashboard Monitoring
```
Use Case: Validate deployment health
Tools: aspire_get_metrics, aspire_get_logs, aspire_check_health
Pattern:
  1. After deployment, query health: aspire_check_health
  2. Check error rates: aspire_get_metrics(metric="error_rate", window="5m")
  3. If errors elevated: aspire_get_logs(level="error", limit=20)
  4. Report: "Deployment healthy — error rate 0.1%, p99 latency 45ms"
     OR: "⚠️ Deployment shows elevated errors — see logs"
```

#### GitHub MCP (Often Pre-Configured)
```
Use Case: Structured issue/PR reads
Tools: github-mcp-server-list_issues, github-mcp-server-pull_request_read, etc.
Pattern:
  - Reads: Prefer MCP tools (structured, parseable)
  - Writes: Use `gh` CLI (MCP may not support all write operations)
  - This is already established Squad convention (see decisions.md)
```

### Pattern 5: MCP Configuration Guidance

When a user asks about connecting a service, guide them to the right config:

```json
// .copilot/mcp-config.json (for Copilot CLI)
{
  "mcpServers": {
    "trello": {
      "command": "npx",
      "args": ["-y", "@trello/mcp-server"],
      "env": {
        "TRELLO_API_KEY": "${TRELLO_API_KEY}",
        "TRELLO_TOKEN": "${TRELLO_TOKEN}"
      }
    }
  }
}
```

```json
// .vscode/mcp.json (for VS Code)
{
  "servers": {
    "trello": {
      "command": "npx",
      "args": ["-y", "@trello/mcp-server"],
      "env": {
        "TRELLO_API_KEY": "${TRELLO_API_KEY}",
        "TRELLO_TOKEN": "${TRELLO_TOKEN}"
      }
    }
  }
}
```

## Examples

### Example 1: Agent discovers Trello tools and uses them

**Scenario:** User asks "Move the completed issues to the Done column on Trello."

**Agent behavior:**
1. Check available tools → finds `trello_get_board`, `trello_move_card`
2. `trello_get_board` → identifies board columns and card IDs
3. Cross-reference with GitHub issues marked as closed
4. `trello_move_card` for each matching card → Done column
5. Report: "Moved 3 cards to Done: #12 Auth module, #15 API tests, #18 Docs update"

### Example 2: Agent handles missing MCP gracefully

**Scenario:** User asks "Check the Aspire dashboard for deployment health."

**Agent behavior:**
1. Check available tools → no `aspire_*` tools found
2. Response: "Aspire MCP server isn't configured in this session. To add it, create or update `.copilot/mcp-config.json` with the Aspire MCP server configuration. In the meantime, I can check deployment status using other available tools if you point me to the endpoint."

### Example 3: Coordinator passes MCP context to spawned agent

**Coordinator spawn prompt includes:**
```
MCP TOOLS AVAILABLE IN THIS SESSION:
- GitHub MCP: ✅ (github-mcp-server-list_issues, github-mcp-server-pull_request_read, ...)
- Trello MCP: ✅ (trello_get_board, trello_create_card, trello_move_card, ...)

When working with GitHub issues, prefer MCP tools for reads and `gh` CLI for writes.
When syncing with Trello, use Trello MCP tools directly.
```

## Anti-Patterns

**DO NOT attempt to start MCP servers.** Squad is prompt-level architecture. It does not launch processes, install packages, or manage server lifecycle. If an MCP server isn't configured, tell the user — don't try to fix it.

**DO NOT assume MCP tools exist.** Always check before using. Never hardcode MCP tool names into prompts that fail if the tool isn't available.

**DO NOT parse mcp.json yourself.** The Copilot platform handles MCP server lifecycle. Squad agents should discover tools through their available tool list, not by reading config files.

**DO NOT send credentials through MCP tool parameters.** MCP servers handle their own auth via environment variables in the config. Never pass API keys, tokens, or secrets as tool call arguments.

**DO NOT block on MCP failures.** If an MCP tool call fails (server down, auth expired, timeout), log the failure, try a CLI fallback if available, and continue. MCP is an enhancement, not a dependency.
