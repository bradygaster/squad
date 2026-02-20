# PRD 10: MCP Server Integration

**Owner:** Kujan (Copilot SDK Expert)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1 (v0.6.0 — per-agent MCP config) / Phase 2 (v0.7.0 — Squad as MCP server)
**Dependencies:** PRD 1 (SDK Integration Core), PRD 2 (Session Management)

## Problem Statement

Squad agents currently have no structured access to external tools and services. All external interactions (GitHub API, databases, project management) are done via `gh` CLI commands embedded in prompts — fragile, untyped, and impossible to scope per agent. The SDK provides native MCP (Model Context Protocol) server management with per-agent configuration, tool filtering, and both local (stdio) and remote (HTTP/SSE) transports. Additionally, Squad's own team state (roster, decisions, backlog) is locked in filesystem files that external tools can't query — exposing them as MCP resources would make Squad interoperable with the broader MCP ecosystem.

## Goals

1. Per-agent MCP server routing: each agent gets exactly the MCP servers relevant to their role
2. Third-party MCP integration patterns for common enterprise tools (Trello, Azure DevOps, Notion, Slack)
3. Squad as MCP server: expose team roster, decisions, and backlog as MCP resources
4. MCP tool filtering per agent for security (tester can't deploy, designer can't write to production DB)
5. Graceful degradation when MCP servers are unavailable
6. Replace custom tool implementations with MCP resources where appropriate

## Non-Goals

- Building MCP servers for third-party services (use existing community servers)
- MCP server hosting/deployment (servers run locally or are user-managed remotes)
- Authentication broker for MCP servers (each server manages its own auth)
- MCP protocol implementation (SDK handles protocol; Squad configures)

## Background

The SDK's MCP server configuration (verified in `nodejs/src/types.ts:487-539`) supports two server types:

```typescript
// Local/stdio server
interface MCPLocalServerConfig {
  type?: "local" | "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  tools: string[];  // [] = none, ["*"] = all, or specific tool names
  timeout?: number;  // ms
}

// Remote HTTP/SSE server
interface MCPRemoteServerConfig {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
  tools: string[];
  timeout?: number;
}
```

Key facts:
- **Per-agent MCP config:** `CustomAgentConfig.mcpServers` (verified in types.ts:573) — each custom agent can have its own MCP server set. This is the SDK feature that makes per-agent tool routing native.
- **Per-session MCP config:** `SessionConfig.mcpServers` — session-level config for servers shared across all agents in that session.
- **Tool filtering:** The `tools` array on each server config controls which tools from that server are exposed. `["*"]` = all tools, `[]` = no tools (server still connected but tools hidden), or specific tool names.
- **SDK manages server lifecycle:** For local/stdio servers, the SDK spawns the process, manages stdio transport, and handles cleanup. Squad doesn't manage processes.
- **No health monitoring:** SDK doesn't expose server health status. If a server fails, tool calls to it will error. Squad must detect failures via `onPostToolUse` or `tool.execution_complete` events.
- **No auto-discovery:** Servers must be explicitly configured. No "scan for available MCP servers" capability.

From Proposal 028a: GitHub MCP tools are read-only for Issues (17 tools identified). All writes require `gh` CLI. Projects V2 has zero MCP tools.

From Proposal 033a: Provider abstraction should be SDK MCP config, not prompt-level command templates. This PRD implements that vision.

## Proposed Solution

### 1. Per-Agent MCP Configuration

Define MCP server sets per agent role in `.squad/mcp-config.json`:

```json
{
  "servers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" },
      "tools": ["*"]
    },
    "filesystem": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_ROOT}"],
      "tools": ["*"]
    },
    "postgres": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" },
      "tools": ["query", "list_tables", "describe_table"]
    },
    "slack": {
      "type": "http",
      "url": "${SLACK_MCP_URL}",
      "headers": { "Authorization": "Bearer ${SLACK_BOT_TOKEN}" },
      "tools": ["send_message", "list_channels"]
    }
  },
  "agentServers": {
    "lead": ["github", "filesystem"],
    "backend-dev": ["github", "filesystem", "postgres"],
    "frontend-dev": ["github", "filesystem"],
    "tester": ["github", "filesystem"],
    "designer": ["github", "filesystem", "slack"],
    "scribe": ["filesystem"]
  },
  "toolRestrictions": {
    "tester": {
      "github": { "exclude": ["create_pull_request", "merge_pull_request"] },
      "filesystem": { "exclude": ["delete_file"] }
    },
    "scribe": {
      "filesystem": { "include": ["read_file", "write_file", "list_directory"] }
    }
  }
}
```

At session creation, Squad resolves the agent's MCP config:

```typescript
function resolveMcpServers(agentRole: string): Record<string, MCPServerConfig> {
  const serverNames = config.agentServers[agentRole] || [];
  const resolved: Record<string, MCPServerConfig> = {};

  for (const name of serverNames) {
    const server = { ...config.servers[name] };
    
    // Apply tool restrictions
    const restrictions = config.toolRestrictions?.[agentRole]?.[name];
    if (restrictions?.include) {
      server.tools = restrictions.include;
    } else if (restrictions?.exclude) {
      // SDK doesn't support exclude lists natively — must resolve to include list
      // Get full tool list from server manifest, subtract excluded
      server.tools = getServerTools(name).filter(t => !restrictions.exclude.includes(t));
    }

    // Resolve ${VAR} in env, headers, urls
    resolved[name] = resolveEnvVars(server);
  }

  return resolved;
}

// Used in session creation:
const session = await client.createSession({
  customAgents: [{
    name: agent.name,
    prompt: agent.charter,
    mcpServers: resolveMcpServers(agent.role)  // Per-agent MCP config
  }],
  mcpServers: commonServers  // Shared servers (filesystem always)
});
```

### 2. Squad as MCP Server

Expose Squad's internal state as MCP resources, making Squad queryable by external tools and other agents:

```typescript
// squad-mcp-server.ts — runs as local stdio MCP server
const server = new MCPServer({
  name: "squad",
  version: "0.6.0",
  resources: {
    "squad://roster": {
      description: "Current team roster with roles and status",
      handler: () => loadTeamRoster()
    },
    "squad://decisions": {
      description: "Active team decisions",
      handler: () => loadDecisions()
    },
    "squad://decisions/latest": {
      description: "Most recent 10 decisions",
      handler: () => loadDecisions({ limit: 10 })
    },
    "squad://backlog": {
      description: "Current team backlog items",
      handler: () => loadBacklog()
    },
    "squad://agents/{name}/status": {
      description: "Current status of a specific agent",
      handler: (params) => getAgentStatus(params.name)
    },
    "squad://agents/{name}/history": {
      description: "Recent history for a specific agent",
      handler: (params) => loadAgentHistory(params.name)
    },
    "squad://metrics": {
      description: "Current session metrics (tokens, cost, duration)",
      handler: () => getCurrentMetrics()
    }
  },
  tools: {
    "squad_status": {
      description: "Get current Squad status (active agents, pending tasks)",
      handler: () => getSquadStatus()
    },
    "squad_decision_search": {
      description: "Search decisions by keyword",
      parameters: { query: "string" },
      handler: (args) => searchDecisions(args.query)
    }
  }
});
```

The Squad MCP server would be automatically started by the coordinator and available to all agent sessions:

```json
{
  "squad": {
    "type": "local",
    "command": "node",
    "args": ["./node_modules/@bradygaster/squad/mcp-server.js"],
    "cwd": "${SQUAD_ROOT}",
    "tools": ["*"]
  }
}
```

This replaces the need for custom tools like `squad_status` — agents can query Squad state via standard MCP protocol instead of Squad-specific tool implementations.

### 3. Third-Party MCP Integration Patterns

Document standard patterns for common enterprise integrations:

**Pattern A: Project Management (Trello, Azure DevOps, Linear)**
```json
{
  "trello": {
    "type": "http",
    "url": "${TRELLO_MCP_URL}",
    "headers": { "Authorization": "Bearer ${TRELLO_API_KEY}" },
    "tools": ["list_boards", "list_cards", "create_card", "move_card"]
  }
}
```
Route to: Lead (all tools), Scribe (read-only: `["list_boards", "list_cards"]`)

**Pattern B: Database (PostgreSQL, MongoDB)**
```json
{
  "postgres": {
    "type": "local",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "DATABASE_URL": "${DATABASE_URL}" },
    "tools": ["query", "list_tables", "describe_table"]
  }
}
```
Route to: Backend Dev only. Tester gets read-only subset. Designer gets nothing.

**Pattern C: Communication (Slack, Discord)**
```json
{
  "slack": {
    "type": "http",
    "url": "${SLACK_MCP_URL}",
    "headers": { "Authorization": "Bearer ${SLACK_BOT_TOKEN}" },
    "tools": ["send_message", "list_channels", "search_messages"]
  }
}
```
Route to: Lead and Scribe only. Agents shouldn't spam Slack.

**Pattern D: Documentation (Notion, Confluence)**
```json
{
  "notion": {
    "type": "http",
    "url": "${NOTION_MCP_URL}",
    "headers": { "Authorization": "Bearer ${NOTION_API_KEY}" },
    "tools": ["search_pages", "read_page", "create_page", "update_page"]
  }
}
```
Route to: Scribe (all tools), others (read-only: `["search_pages", "read_page"]`)

### 4. Graceful Degradation

When an MCP server is unavailable:

```typescript
// In onPostToolUse hook — detect MCP failures
onPostToolUse: async (input, { sessionId }) => {
  if (input.toolResult.resultType === 'failure' && isMcpTool(input.toolName)) {
    const serverName = getMcpServerForTool(input.toolName);
    
    // Mark server as unhealthy
    mcpHealth.set(serverName, { healthy: false, lastFailure: Date.now() });
    
    // Return helpful context to agent
    return {
      additionalContext: `MCP server "${serverName}" is unavailable. ` +
        `Fallback: use gh CLI for GitHub operations, or skip this tool call. ` +
        `Server will be retried automatically in 60s.`
    };
  }
}
```

Degradation hierarchy:
1. **MCP tool fails** → `onPostToolUse` adds context suggesting CLI alternative
2. **MCP server unreachable at session start** → Skip server, log warning, agent works without those tools
3. **All MCP servers down** → Agent works with built-in tools only (edit, powershell, grep, etc.)

The SDK doesn't provide MCP server health probing — Squad detects failures reactively through tool execution errors. A 60-second cooldown before retry avoids hammering a down server.

### 5. Tool Security Model

MCP tool filtering is the primary security mechanism:

| Agent Role | GitHub MCP | Filesystem MCP | Database MCP | Deploy Tools |
|-----------|-----------|---------------|-------------|-------------|
| Lead | Full access | Full access | Read-only | Approve only |
| Backend Dev | Issues, PRs | Full access | Full access | None |
| Frontend Dev | Issues, PRs | Full access | None | None |
| Tester | Issues (read) | Read + Write tests | Read-only | None |
| Designer | Issues (read) | Read + Write assets | None | None |
| Scribe | Issues (read) | Read + Write docs | None | None |

Implementation: The `tools` array in `MCPServerConfig` is the enforcement mechanism. SDK applies this filter before tools reach the agent — the agent literally cannot see or call tools not in its list.

For finer-grained control, `onPreToolUse` hooks validate MCP tool calls:

```typescript
onPreToolUse: async (input, { sessionId }) => {
  if (isMcpTool(input.toolName)) {
    const agent = getAgentForSession(sessionId);
    const allowed = isToolAllowedForAgent(agent, input.toolName, input.toolArgs);
    if (!allowed) {
      return { permissionDecision: 'deny', permissionDecisionReason: `${agent.role} cannot use ${input.toolName}` };
    }
  }
}
```

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Per-agent MCP via `customAgents[].mcpServers` | ✅ Decided | SDK natively supports this. Zero custom code for routing. |
| Tool filtering via `tools` array (include-list) | ✅ Decided | SDK only supports include-list. Exclude-lists must be resolved to include-lists by Squad. |
| Squad MCP server as local stdio | ✅ Decided | Simplest deployment — no HTTP server to manage. SDK spawns and manages the process. |
| MCP config in `.squad/mcp-config.json` | ✅ Decided | Separate from `providers.json` — different concern (tools vs. models). |
| `${VAR}` for secrets in MCP config | ✅ Decided | Consistent with providers.json, existing security policy. |
| Reactive health detection (not proactive) | ✅ Decided | SDK doesn't expose health probes. Detect on first failure, cooldown, retry. |

## Implementation Notes

### SDK MCP Server Lifecycle

The SDK manages local MCP server processes:
1. On `createSession()` with `mcpServers` config, SDK spawns each local server process
2. SDK connects via stdio (stdin/stdout pipes)
3. SDK discovers available tools from server manifest
4. Tools become available to the agent automatically
5. On session destroy, SDK terminates server processes

Squad doesn't manage any server processes — just provides config. This is a major simplification over manual `gh` CLI orchestration.

### MCP Tool Naming

MCP tools from servers are namespaced: `{serverName}_{toolName}`. For example, the GitHub MCP server's `list_issues` tool appears as `github_list_issues` (or similar — SDK handles namespacing). Squad's tool restrictions must use the namespaced names.

### Per-Session vs. Per-Agent MCP Config

Two levels of MCP config:
- `SessionConfig.mcpServers` — available to all agents in the session
- `CustomAgentConfig.mcpServers` — only available to that specific custom agent

Squad uses per-agent config (`customAgents[].mcpServers`) for role-specific servers (postgres for backend-dev) and session-level config for shared servers (filesystem, Squad MCP server).

### MCP Server Timeout

The `timeout` field in server config (in ms) controls how long the SDK waits for a tool response. Default is unspecified (SDK's internal default). For database queries, set higher timeout (30s). For simple API calls, lower (10s).

```json
{
  "postgres": {
    "type": "local",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "tools": ["*"],
    "timeout": 30000
  }
}
```

### Replacing Custom Tools with MCP

Several Squad custom tools can be replaced by MCP resources:

| Current Custom Tool | MCP Replacement | Benefit |
|--------------------|----------------|---------|
| `squad_status` (planned) | `squad://metrics` resource | Standard MCP protocol, external tool compatible |
| `squad_list_active_agents` (planned) | `squad://agents` resource | Queryable by any MCP client |
| Manual `gh issue list` in prompts | GitHub MCP `list_issues` tool | Typed, filtered, no prompt engineering |
| Manual `gh pr list` in prompts | GitHub MCP `list_pull_requests` tool | Same |

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP server ecosystem is immature — community servers may be buggy | Medium | Test each server in Squad's CI. Document verified servers. Provide fallback patterns. |
| Per-agent MCP config multiplies running processes (N agents × M servers) | High | SDK may share server processes across sessions (unverified). If not, limit concurrent agents or use remote HTTP servers (single process, multiple clients). |
| Tool name conflicts across MCP servers | Low | SDK namespaces tools by server name. Document naming convention. |
| MCP server auth token expiry | Medium | Same as BYOK — `${VAR}` pattern, refresh externally. `onPostToolUse` detects 401 errors. |
| Squad MCP server exposes internal state to all agents | Medium | Squad MCP server is read-only (resources, not write tools). Agents can't mutate Squad state via MCP — only via filesystem. |
| Remote MCP servers add network latency | Medium | Use local stdio servers when possible. Set appropriate timeouts. Cache resource responses where safe. |

## Success Metrics

1. **Per-agent tool isolation:** Backend Dev sees database tools; Designer doesn't. Verified in test suite.
2. **MCP server availability:** >95% uptime for configured MCP servers during Squad sessions.
3. **Graceful degradation:** Agent completes task even when 1+ MCP servers are down (with reduced capability).
4. **Setup simplicity:** New MCP server configured in `.squad/mcp-config.json` in <2 minutes.
5. **Custom tool reduction:** ≥3 custom Squad tools replaced by MCP resources/tools.
6. **External interoperability:** Squad MCP server queryable from Claude Desktop, VS Code, or any MCP client.

## Open Questions

1. **MCP server sharing across sessions:** Does the SDK share a single MCP server process across multiple sessions with the same config, or spawn one per session? Critical for resource usage with 5+ concurrent agents.
2. **Dynamic MCP server config:** Can MCP servers be added/removed mid-session, or only at session creation? If only at creation, agents can't dynamically discover new servers.
3. **MCP resource caching:** Should Squad cache MCP resource responses (e.g., `squad://roster` doesn't change mid-session)? Reduces latency but risks stale data.
4. **GitHub MCP server authentication:** Does the GitHub MCP server at `api.githubcopilot.com/mcp/` require Copilot auth, or can it use `GITHUB_TOKEN`? If Copilot-only, BYOK users lose GitHub MCP access.
5. **MCP server discovery from IDE:** VS Code and JetBrains have their own MCP server configs. Should Squad read IDE MCP config and merge with its own? Would avoid duplicate configuration.
