# Power BI Remote MCP Server — Setup & Usage

## Purpose
Use the remote Power BI MCP server to query Power BI reports directly from Copilot (VS Code or CLI). Provides access to all reports you normally access via the web — way better than wrestling with web views.

## Confidence: high
Source: Karl Erickson (Teams, 2026-03-13 8:27 AM), validated by Dina Berry same day and 2026-03-16.

## Source
- **Karl Erickson** shared setup instructions and tips in Teams on 2026-03-13
- **Jon Burchel** asked about write capabilities (Karl: "Could you elaborate? Do you mean build a web-based dashboard?")
- **Dina Berry** confirmed success after auth troubleshooting

## Installation

### Step 1: Install in VS Code first
1. Go to the Microsoft Learn article: [Get started with the remote Power BI MCP server](https://learn.microsoft.com/power-bi/mcp-server)
2. Use the **"quick installation" button** on that page to install to VS Code
3. Complete auth in VS Code — you MUST see the **explicit web-based auth dialogue** (if you don't see it, it's not working)

### Step 2: Install in Copilot CLI
1. After VS Code auth succeeds, use the config from VS Code to install to Copilot CLI via `/mcp add`
2. Use the same JSON config info that VS Code generated

**⚠️ CRITICAL ORDER:** You MUST do VS Code first, then CLI. Karl: "FWIW I couldn't get it to work in Copilot CLI at all until I first did the one-click install in VS Code, and then get it to auth in VS Code. Then I could add the MCP server to Copilot CLI using the same info from the JSON config, and it worked."

## Auth Troubleshooting

| Problem | Solution |
|---------|----------|
| Auth expiration errors in Copilot CLI | Exit and resume Copilot to force re-auth |
| MCP server not connecting | Try: Ctrl+Shift+P → MCP: List Servers → powerbi-remote → Start Server (or Restart Server, or Disconnect Account then Start Server) |
| Not clear why it's not working | If you don't see the explicit web-based auth dialogue, it's NOT working. Must see the browser auth popup. |
| "Error fetching authorization server metadata" 404 | This is the OAuth metadata discovery failing — restart the MCP server and re-auth |

## Usage — Example Prompts

After auth, you can access any report you normally access via the web:

- **Content Quality Report queries:**
  ```
  Using the Content Quality Report, show me all articles where the Author is '<ms-alias>' 
  that are past their freshness date. Show the Days til Stale, Title, and the raw GitHub URL.
  ```

- **Content Engagement Report queries:**
  ```
  Using the Content Engagement Report, show me engagement metrics for articles authored by '<ms-alias>'.
  ```

- **Report by URL:** Start by pasting a report URL and the MCP server figures out the report name and structure. This is a great way to discover what's available.

- **Report by name:** After initial auth, you can reference reports by display name (e.g., "Content Quality Report", "Content Engagement Report") — no URL needed.

- **General access:** After auth, you should be able to get anything that you normally have access to via the web

## Capabilities

- ✅ **READ reports** — query any Power BI report you have web access to
- ❓ **WRITE reports** — unclear. Jon Burchel asked; Karl asked for clarification ("Do you mean build a web-based dashboard?"). Status: unresolved as of 2026-03-13.

## Configuration

The MCP server config lives in `.copilot/mcp-config.json` (for CLI) or VS Code MCP settings. The server identifier is `powerbi-remote`.

## Known Reports

These Power BI reports are confirmed accessible and useful for content work:

| Report Name | Use Case |
|-------------|----------|
| Content Quality Report | Freshness dates, stale articles, author lookup, GitHub URLs |
| Content Engagement Report | Page views, engagement metrics, content performance |

> Tip: If you know a report exists but aren't sure of the exact name, paste the report URL first. The MCP server resolves it to the report name + schema automatically.

## Related
- Microsoft Learn article: "Get started with the remote Power BI MCP server"
- This is useful for the daily content metrics workflow — can query Content Quality Report and Content Engagement Report directly
- Potential integration with `.squad/skills/pbi-report-analysis/SKILL.md` if that skill exists

## People
- **Karl Erickson** — original tip, setup expertise, troubleshooting knowledge
- **Jon Burchel** — interested in write capabilities
- **Dina Berry** — confirmed working after setup
