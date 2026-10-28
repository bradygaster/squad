# MCP Integration — Configuration and Samples

MCP (Model Context Protocol) servers extend Squad with tools for external services — Trello, Aspire dashboards, Azure, Notion, and more. The user configures MCP servers in their environment; Squad discovers and uses them.

## Config File Locations

Squad registers its own `squad_state` server in the repo-root `.mcp.json`. Users add other servers next to it, in the file their host reads:
1. **Repository-level:** `.mcp.json` at the repo root (team-shared, committed). Copilot CLI and Claude Code read it; Copilot CLI also reads `.github/mcp.json`. Copilot CLI loads project-level servers once the folder is trusted, and does not read a project-level `.copilot/mcp-config.json`.
2. **Workspace-level:** `.vscode/mcp.json` (VS Code workspaces; the top-level key is `servers`, not `mcpServers`)
3. **User-level:** `~/.copilot/mcp-config.json` (personal; Copilot CLI loads it in every project, and VS Code reads it as its Copilot global config)
4. **CLI override:** `--additional-mcp-config @<file>` flag (session-specific; `squad loop` and `squad watch` execute mode pass `@.mcp.json` this way)
5. **Other hosts** (`squad init --client ...`): Kiro `.kiro/settings/mcp.json`, Cursor `.cursor/mcp.json`, OpenCode `opencode.json` (`mcp`), Codex `.codex/config.toml` (`[mcp_servers.<name>]`). For Antigravity use `agy mcp add`, because Squad regenerates `.agents/agents/squad.md`.

## Sample Config — Trello

```json
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

## Sample Config — GitHub

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

## Sample Config — Azure

```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "@azure/mcp-server"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "${AZURE_SUBSCRIPTION_ID}",
        "AZURE_CLIENT_ID": "${AZURE_CLIENT_ID}",
        "AZURE_CLIENT_SECRET": "${AZURE_CLIENT_SECRET}",
        "AZURE_TENANT_ID": "${AZURE_TENANT_ID}"
      }
    }
  }
}
```

## Sample Config — Aspire

```json
{
  "mcpServers": {
    "aspire": {
      "command": "npx",
      "args": ["-y", "@aspire/mcp-server"],
      "env": {
        "ASPIRE_DASHBOARD_URL": "${ASPIRE_DASHBOARD_URL}"
      }
    }
  }
}
```

## Authentication Notes

- **GitHub MCP requires a separate token** from the `gh` CLI auth. Generate at https://github.com/settings/tokens
- **Trello requires API key + token** from https://trello.com/power-ups/admin
- **Azure requires service principal credentials** — see Azure docs for setup
- **Aspire uses the dashboard URL** — typically `http://localhost:18888` during local dev

Auth is a real blocker for some MCP servers. Users need separate tokens for GitHub MCP, Azure MCP, Trello MCP, etc. This is a documentation problem, not a code problem.
