# MCP Setup Guide for Squad

**Try this to discover available integrations:**
```
Show me which MCP servers are available
```

**Try this to enable a specific service:**
```
Configure the GitHub MCP server
```

MCP (Model Context Protocol) servers extend Squad with external services — GitHub, notifications, deployments, Trello, and more. Agents discover and use MCP tools automatically.

---

## What MCP Means for Squad

**MCP (Model Context Protocol) servers extend your Squad environment.** Agents use MCP tools to send notifications, query GitHub, monitor deployments, integrate with Trello, and more. This guide walks you through configuring MCP services step-by-step.

---

## What MCP Means for Squad

MCP bridges Squad agents and external services. When your agents work, they can call any MCP-exposed tool — send notifications, check project status, update boards, or fetch live data. You define which services are available; agents discover and use them automatically.

---

## MCP Configuration Files

There are two places to configure MCP, depending on your platform:

| Platform | Config File | How to Edit | Startup |
|----------|------------|-----------|---------|
| **Copilot CLI** | `.copilot/mcp-config.json` | Text editor | Add to shell initialization (`~/.bashrc`, `~/.zshrc`, etc.) |
| **VS Code** | `.vscode/settings.json` | VS Code Settings GUI or JSON editor | Built-in; restarts Copilot extension |

This guide covers both. Pick the one that matches your workflow.

---

## Step-by-Step: CLI Setup

### Step 1: Create the `.copilot` directory and config file

Open your terminal:

```bash
mkdir -p ~/.copilot
touch ~/.copilot/mcp-config.json
```

### Step 2: Add your first MCP server

Open `~/.copilot/mcp-config.json` in your editor:

```bash
# macOS/Linux
nano ~/.copilot/mcp-config.json

# Windows (PowerShell)
notepad $PROFILE\..\mcp-config.json
```

Paste this base structure:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["path/to/github-mcp.js"],
      "env": {
        "GITHUB_TOKEN": "your-github-token-here"
      }
    }
  }
}
```

Replace `path/to/github-mcp.js` with the actual path to your MCP server script. The `env` object passes environment variables to the server.

### Step 3: Add your GitHub token

If you already ran `gh auth login`, your token lives in `~/.config/gh/hosts.yml` (macOS/Linux) or `%APPDATA%\GitHub CLI\hosts.yml` (Windows).

Instead of pasting your token directly into the config file, **use an environment variable**:

```bash
# macOS/Linux: Add to ~/.bashrc or ~/.zshrc
export GITHUB_TOKEN=$(gh auth token)

# Windows PowerShell: Add to your profile
$env:GITHUB_TOKEN = $(gh auth token)
```

Then reference it in your config:

```json
"env": {
  "GITHUB_TOKEN": "$GITHUB_TOKEN"
}
```

### Step 4: Restart Copilot and verify

```bash
# Restart the CLI
copilot
```

In your Squad session, ask:

```
> Show me available MCP tools
```

If configured correctly, you'll see your GitHub server and its available tools (e.g., `github.list_issues`, `github.get_commit`).

---

## Step-by-Step: VS Code Setup

### Step 1: Open VS Code Settings

- **macOS:** Code → Preferences → Settings
- **Windows:** File → Preferences → Settings

Or use the keyboard shortcut: `Cmd+,` (macOS) or `Ctrl+,` (Windows).

### Step 2: Search for "MCP"

In the settings search box, type `MCP` to find Copilot extension settings.

### Step 3: Add an MCP server

Look for the **"Copilot MCP Servers"** section (or similar — naming varies by Copilot version).

Click **"Edit in settings.json"** to see the raw configuration:

```json
"copilot.mcp.servers": {
  "github": {
    "command": "node",
    "args": ["path/to/github-mcp.js"],
    "env": {
      "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
    }
  }
}
```

The `${env:GITHUB_TOKEN}` syntax reads from your shell environment.

### Step 4: Add environment variables

Open your VS Code integrated terminal (`` Ctrl+` `` or `` Cmd+` ``):

```bash
export GITHUB_TOKEN=$(gh auth token)
```

This sets the token for the current terminal session. To make it permanent, add it to your shell profile (see CLI Step 3 above).

### Step 5: Reload VS Code

Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows) and select **"Copilot: Reload Copilot Servers"**.

---

## Example: GitHub MCP (Already Included)

Most Squad installs come with GitHub MCP pre-configured. Here's what it looks like:

### CLI: `.copilot/mcp-config.json`

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/path/to/github-mcp.js"],
      "env": {
        "GITHUB_TOKEN": "$GITHUB_TOKEN"
      }
    }
  }
}
```

### VS Code: `.vscode/settings.json`

```json
{
  "copilot.mcp.servers": {
    "github": {
      "command": "node",
      "args": ["/path/to/github-mcp.js"],
      "env": {
        "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

**What it does:**
- List issues, PRs, and branches in your repo
- Create, update, and search issues
- Fetch commit history and diff info
- Post and edit PR comments

Agents automatically discover these tools and use them during work.

---

## Example: Trello MCP

Trello MCP lets agents interact with your Trello boards — create cards, move them between lists, and update descriptions.

### Step 1: Get your Trello API key and token

1. Visit https://trello.com/app-key
2. Copy your **API Key**
3. Click "Tokens" and generate a new token (grant read/write permissions)
4. Copy the **Token**

### Step 2: Add to `.copilot/mcp-config.json`

```json
{
  "mcpServers": {
    "trello": {
      "command": "node",
      "args": ["/path/to/trello-mcp.js"],
      "env": {
        "TRELLO_API_KEY": "your-api-key",
        "TRELLO_TOKEN": "your-token",
        "TRELLO_BOARD_ID": "your-board-id"
      }
    }
  }
}
```

Find your **board ID** by opening any card on Trello and looking at the URL: `trello.com/c/{{CARD_ID}}/{{BOARD_ID}}/`.

### Step 3: Test it

In your Squad session:

```
> Keaton, create a Trello card for the auth refactor
```

Agents will now automatically propose Trello tasks for tracking work items.

---

## Example: Aspire Dashboard MCP (Deployment Monitoring)

For projects using .NET Aspire, the Aspire Dashboard MCP lets agents monitor deployments, check service health, and log errors.

### Step 1: Start Aspire Dashboard

Your project should have a dashboard running (usually `http://localhost:18888`).

### Step 2: Configure MCP

```json
{
  "mcpServers": {
    "aspire": {
      "command": "node",
      "args": ["/path/to/aspire-mcp.js"],
      "env": {
        "ASPIRE_URL": "http://localhost:18888",
        "ASPIRE_API_KEY": "optional-api-key"
      }
    }
  }
}
```

### Step 3: Use it

Agents can now ask:

```
> Squad, check the Aspire dashboard — any service errors?
```

The monitoring agent (or any agent) pulls live deployment status and alerts you to issues.

---

## How Agents Discover and Use MCP Tools

Agents don't need special setup to discover tools. Here's the flow:

1. **At spawn time**, the agent receives the MCP configuration
2. **Agent lists available tools** — it reads what's configured and knows what's available
3. **Agent uses tools naturally** — when working, if a tool matches the task (e.g., "create a GitHub issue"), agents call it automatically
4. **Tools return results** — the agent receives structured data back (e.g., issue ID, status, etc.) and continues working

**See also:** [Skills System](./skills.md) — how agents learn reusable patterns for complex MCP workflows.

---

## Troubleshooting

### MCP Server Not Starting

**Symptom:** "MCP server failed to start" error in Copilot logs.

**Fix:**

1. **Verify the command path:**
   ```bash
   ls -la /path/to/mcp-server.js
   ```
   The file must exist and be executable.

2. **Verify Node.js is installed:**
   ```bash
   node --version
   ```
   Must be Node 18+.

3. **Check environment variables:**
   ```bash
   echo $GITHUB_TOKEN
   ```
   Should print your token (not empty). If empty, set it:
   ```bash
   export GITHUB_TOKEN=$(gh auth token)
   ```

4. **Restart Copilot:**
   ```bash
   copilot quit
   copilot
   ```

### Tools Not Appearing in Agent Responses

**Symptom:** Agent says "I don't have access to GitHub tools" even though you configured MCP.

**Fix:**

1. **Verify config syntax:**
   ```bash
   # CLI
   cat ~/.copilot/mcp-config.json | jq .
   # Should be valid JSON; if not, `jq` will error
   ```

2. **Restart Copilot to reload config:**
   ```bash
   copilot quit
   copilot
   ```

3. **Test the MCP server directly:**
   ```bash
   node /path/to/mcp-server.js
   ```
   It should start without errors. If it crashes, there's a server-side issue.

### Authentication Errors

**Symptom:** "Authentication failed" or "401 Unauthorized" when an agent tries to use a tool.

**Fix:**

1. **Verify the token is valid:**
   ```bash
   # For GitHub
   gh auth status
   ```
   Should show "Logged in as {username}".

2. **For other services (Trello, Discord, etc.):**
   - Manually test the API key by calling the service:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" https://api.service.com/test
   ```

3. **Check token expiration:**
   Some services (Discord, Slack) rotate tokens. Regenerate if old.

4. **Update the config with the new token:**
   ```bash
   export TRELLO_TOKEN="new-token"
   copilot quit
   copilot
   ```

### Too Many MCP Servers = Startup Lag

**Symptom:** Copilot takes 30+ seconds to start after adding 5+ MCP servers.

**Fix:**

1. **Only configure servers you actually use:**
   Remove unused MCP servers from your config.

2. **Use lazy loading (if your MCP framework supports it):**
   ```json
   {
     "mcpServers": {
       "github": {
         "command": "node",
        "args": ["/path/to/github-mcp.js"],
        "lazy": true
      }
    }
  }
   ```
   This starts the server only when its first tool is called.

---

## Sample Prompts

### Setting up notifications

```
I want to get pinged on Teams when agents need input. Walk me through it.
```

Squad will guide you through Teams webhook setup and MCP configuration.

### Adding Trello integration

```
Connect my Trello board so agents can create cards. My board is at https://trello.com/b/YOUR_BOARD_ID
```

Agents will ask for your API key and set up the Trello MCP server.

### Checking MCP health

```
Show me all configured MCP servers and which ones are working.
```

Agents will test each server and report status.

### Using GitHub data in work

```
Before building the feature, check GitHub for related open issues and PRs.
```

Agents automatically use the GitHub MCP to search and report findings.

### Monitoring deployments (Aspire)

```
Aspire dashboard is running at localhost:18888. Set up monitoring so you can tell me about deployment issues.
```

Agents configure Aspire MCP and start checking service health automatically.

---

## See Also

- [Notifications Guide](./notifications.md) — set up agent notifications via MCP
- [Skills System](./skills.md) — how agents learn complex MCP workflows
- [GitHub Issues Integration](./github-issues.md) — already configured GitHub MCP in action
