# Squad pings you

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to get notified on completion:**
```
Notify me when the build finishes
```

**Try this to stay in the loop:**
```
Ping me on Teams when you need my input
```

Your squad sends you instant messages when they need input, hit an error, or complete work. Works with Teams, Discord, Slack, webhooks — whatever you configure.

---

## How It Works

Your squad can send you instant messages when they need your input. Leave your terminal, get pinged on your phone.

---

## How It Works

Squad ships zero notification infrastructure. Instead, it uses **skills** — reusable knowledge files — to teach agents when and how to ping you. You bring your own notification delivery by configuring an MCP notification server in your Copilot environment.

The flow:
1. **Skill** (`human-notification`) tells agents when to ping — blocked waiting for input, decision needed, error hit, work complete
2. **Agent** calls the skill, which invokes your configured MCP server
3. **Your MCP server** (Teams, iMessage, Discord, webhook, etc.) sends the actual message to your device

This means Squad works with any notification service. Pick your favorite messaging platform, configure it once, and your squad has a direct line to you.

---

## Quick Start: Teams (Simplest Path)

### What you need to know

Squad doesn't ship a Teams MCP server. You bring your own — either a community implementation or one you build yourself. Squad agents discover the configured MCP server at spawn time and call it automatically when they need to notify you.

### Teams Workflows webhook

Teams Workflows (Power Automate) webhooks are the recommended approach. Office 365 Connectors were [retired by Microsoft](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/) — use Workflows instead.

1. **Create a channel for your squad:**
   - Create a new Team called "My Squads" (or reuse an existing one)
   - Add a channel, e.g., `#squad-myproject`

2. **Create a Workflows webhook:**
   - Open the channel, select the **+** (add a tab) or go to the **Workflows** app in Teams
   - Choose **"Post to a channel when a webhook request is received"**
   - Follow the prompts to name the workflow and select your channel
   - Copy the generated webhook URL (it starts with `https://prod-...logic.azure.com/...`)

3. **Get a Teams webhook MCP server:**
   
   You need an MCP server that can POST to your webhook URL. Options:
   
   - **Community reference:** [benleane83's teams-webhook-mcp.js](https://gist.github.com/benleane83/f37b5bc1ed3d00e320ba48886109b82a) — a working implementation that sends MessageCard payloads (compatible with Workflows webhooks)
   - **Build your own:** Use the community reference as a starting point
   - **Search the MCP marketplace:** Look for Teams-compatible servers at https://mcpmarket.com

4. **Configure Squad:**
   
   Create or edit `.vscode/mcp.json` in your workspace:
   ```json
   {
     "mcpServers": {
       "notifications": {
         "command": "node",
         "args": ["/absolute/path/to/teams-webhook-mcp.js"],
         "env": {
           "TEAMS_WEBHOOK_URL": "https://prod-XX.westus.logic.azure.com:443/workflows/..."
         }
       }
     }
   }
   ```
   
   Replace `/absolute/path/to/teams-webhook-mcp.js` with the path to your downloaded or created MCP server script. Replace the `TEAMS_WEBHOOK_URL` value with the URL from step 2.

5. **Use it:**
   - Start a Squad session with `copilot squad`
   - When an agent needs input, your Teams channel lights up

---

## Quick Start: iMessage (Mac Only)

iMessage is built into macOS. If you're on a Mac, this is the fastest personal setup.

1. **Check requirements:**
   - macOS with Messages.app
   - Copilot running on the same Mac
   - System allows Copilot to control Messages (grant permission when prompted)

2. **Install the iMessage MCP server:**
   - Search https://mcpmarket.com for "imessage" or compatible MCP servers
   - Follow its setup steps

3. **Configure Squad:**
   - Edit `.vscode/mcp.json`:
   ```json
   {
     "mcpServers": {
       "imessage": {
         "command": "node",
         "args": ["/absolute/path/to/imessage-mcp.js"],
         "env": {
           "IMESSAGE_TARGET": "your-phone-number-or-email"
         }
       }
     }
   }
   ```
   
   Replace `/absolute/path/to/imessage-mcp.js` with the actual path to your downloaded MCP server script.

4. **Test:**
   - Start a Squad session
   - When agents need input, it appears in Messages on your phone

**Limitation:** iMessage only works on Mac. If you use Windows, Linux, or CI environments, use Teams or webhook instead.

---

## Quick Start: Discord

Discord is flexible and works everywhere (web, mobile, desktop).

### Option A: Using mcp-notifications (Simplest)

https://www.npmjs.com/package/mcp-notifications supports Discord, Slack, Teams, and custom webhooks.

1. Install mcp-notifications

   ```bash
   npm install -g mcp-notifications
   ```

1. **Get your Discord webhook:**
   - In Discord, right-click a channel → "Edit channel" → "Integrations" → "Webhooks"
   - "New Webhook" → name it "Squad"
   - Copy the webhook URL

#### Add MCP Server for Github Copilot CLI

1. **Configure Squad from Github Copilot CLI:**

    ```bash
    /mcp add notifications
    ```

    * Server Type: [2] stdio
    * Command: `mcp-notifications`
    * Environment Variables: `{ "WEBHOOK_URL": "https://discord.com/api/webhooks/...", "WEBHOOK_TYPE": "discord" }`

#### Add MCP Server in VSCode

1. From the command palette, search for MCP: Add Server
1. When you run MCP: Add Server, enter the following information

    * Type: Command (stdio)
    * Command: `mcp-notifications`
    * Server Id: notifications
    * Configuration target: Global
    * When the mcp.json file in your user profile opens, add the following to the mcp server configuration

        ```bash
        "env": { "WEBHOOK_URL": "https://discord.com/api/webhooks/...", "WEBHOOK_TYPE": "discord" }
        ```

### Option B: Using Discord Official MCP

For more advanced Discord integrations, search Discord's MCP marketplace.

---

## Quick Start: Custom Webhook

For any HTTP endpoint (custom service, Zapier, IFTTT, etc.):

1. **Get your webhook URL** from your service

2. **Use mcp-notifications or build a thin wrapper:**
   ```json
   {
     "mcpServers": {
       "notifications": {
         "command": "node",
         "args": ["/absolute/path/to/webhook-mcp.js"],
         "env": {
           "WEBHOOK_URL": "https://your-service.com/notify"
         }
       }
     }
   }
   ```
   
   Replace `/absolute/path/to/webhook-mcp.js` with the actual path to your MCP server script.

3. **Your endpoint receives POST:**
   ```json
   {
     "agent": "Keaton",
     "message": "Blocked: waiting for your decision on architecture approach",
     "context": {
       "reason": "decision_needed",
       "issue": "123",
       "link": "https://github.com/..."
     }
   }
   ```

---

## What Triggers a Notification

Agents ping you when:

| Trigger | Example |
|---------|---------|
| **Blocked on input** | "Keaton needs your decision on which API approach to use (Issue #42)" |
| **Decision needed** | "Verbal hit a design choice and needs your call on error handling strategy" |
| **Error hit** | "McManus got an authentication error and needs credentials for the staging API" |
| **Work complete** | "Fenster finished the test suite — 142 tests passing, 3 flaky (check the logs)" |
| **Review feedback** | "Your PR review on #78 needs a response before Keaton can merge" |

You control which triggers send notifications (see Configuration below).

---

## Notification Format

Notifications are **agent-branded, context-rich, and actionable.**

Example notification message:

```
🏗️ Keaton needs your input

Blocked: Design decision required for API error handling strategy.
Follow the conversation in Issue #42.

→ Review issue: github.com/myorg/myrepo/issues/42
```

Another example:

```
✅ Fenster finished the test suite

142 tests passing. 3 marked as flaky — review them in the terminal output.

Session still running. Come back to the terminal to decide next steps.
```

**Anatomy:**
- **Agent emoji + name** — who pinged you (matches your squad's cast)
- **Context** — why (decision, blocked, complete, etc.)
- **What to do** — specific action (check issue, review logs, come back to terminal)
- **Link** — clickable GitHub issue, PR, or breadcrumb to your session

---

## Configuration

### Choosing What Triggers Notifications

By default, agents ping on all triggers. To be selective, set environment variables:

```json
{
  "mcpServers": {
    "notifications": {
      "env": {
        "NOTIFY_BLOCKED": "true",
        "NOTIFY_DECISION": "true",
        "NOTIFY_ERROR": "false",
        "NOTIFY_COMPLETE": "false"
      }
    }
  }
}
```

This is useful if you only care about being pinged when blocked (not for every decision or completion).

### Quiet Hours (Optional)

If your MCP server supports it, configure quiet hours to suppress notifications during off-hours:

```json
{
  "env": {
    "QUIET_HOURS_START": "18:00",
    "QUIET_HOURS_END": "09:00",
    "QUIET_HOURS_TZ": "America/New_York"
  }
}
```

During quiet hours, notifications queue locally and are batched into a morning digest instead of waking you up.

### Testing Your Setup

To test without running a full Squad session:

```bash
# Once your MCP server is configured, trigger a test notification:
copilot squad test-notification --agent Keaton --reason blocked
```

This fires a sample notification through your configured server so you can verify delivery and formatting.

---

## Troubleshooting

### Notifications aren't arriving

1. **Verify the MCP server is running:**
   - Check your `.vscode/mcp.json` syntax
   - Restart Copilot

2. **Check the webhook URL:**
   - Paste the URL in your browser (or `curl`). If it 404s, the webhook is invalid or expired.
   - For Teams/Discord webhooks, regenerate them if they're old

3. **Verify environment variables:**
   - Ensure all secrets (API keys, webhook URLs) are set in your shell before starting Copilot
   - Copilot reads `.vscode/mcp.json` at startup — changes require a restart

4. **Check agent logs:**
   - In your Squad session, ask agents to log the notification call: `check the human-notification skill logs`
   - This surfaces any errors from the MCP server

### Notifications are too frequent

Use the `NOTIFY_*` environment variables (see Configuration above) to disable notifications for non-critical triggers like `NOTIFY_COMPLETE` or `NOTIFY_DECISION`.

### Wrong channel or user receiving notifications

- **Teams webhook:** Ensure the webhook points to the correct channel
- **iMessage:** Verify the `IMESSAGE_TARGET` phone number or email matches your device
- **Discord:** Double-check the webhook URL points to your intended channel

### "MCP server failed to start"

1. Ensure the MCP server command in `.vscode/mcp.json` points to a valid executable
2. Check that all `env` variables are set and accessible
3. Review the Copilot startup logs for the actual error

---

## Architecture Notes

The `human-notification` skill lives in `.squad/skills/squad-human-notification/SKILL.md`. Agents read it before working and decide whether to ping you. You can edit the skill directly if you want to:

- Add custom notification logic for your team
- Change when agents decide to ping (e.g., always notify on errors)
- Add metadata to notifications (e.g., priority levels)

For advanced use cases, you can also:

- Create a custom MCP server that combines multiple notification channels (Teams + Slack)
- Route notifications based on agent and trigger type (errors to you, completions to your manager)
- Add intelligent rate limiting (don't ping for 30 minutes if already pinged once)

---

## Sample MCP Configs

Below are complete, copy-pasteable `.copilot/mcp-config.json` examples for each notification platform. Pick the one that matches your setup and copy the entire `mcpServers` block into your config file.

### Teams Webhook (Simplest)

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["/absolute/path/to/teams-webhook-mcp.js"],
      "env": {
        "TEAMS_WEBHOOK_URL": "https://prod-XX.westus.logic.azure.com:443/workflows/YOUR_WORKFLOW_URL_HERE"
      }
    }
  }
}
```

**Setup:** 
1. Create a Workflows webhook in your Teams channel (Workflows app → "Post to a channel when a webhook request is received")
2. Download a Teams webhook MCP server (see [community reference implementation](https://gist.github.com/benleane83/f37b5bc1ed3d00e320ba48886109b82a))
3. Replace `/absolute/path/to/teams-webhook-mcp.js` with the actual path to your MCP server script

---

### iMessage (Mac Only)

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["/absolute/path/to/imessage-mcp.js"],
      "env": {
        "IMESSAGE_TARGET": "+1234567890"
      }
    }
  }
}
```

**Setup:**
1. Download an iMessage MCP server from https://mcpmarket.com
2. Replace `/absolute/path/to/imessage-mcp.js` with the actual path to your MCP server script
3. Replace `+1234567890` with your phone number or email address registered in iCloud

---

### Discord Webhook

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["/absolute/path/to/discord-webhook-mcp.js"],
      "env": {
        "DISCORD_WEBHOOK_URL": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
      }
    }
  }
}
```

**Setup:** 
1. In Discord, right-click channel → Edit Channel → Integrations → Webhooks → New Webhook → copy the URL
2. Download or create a Discord webhook MCP server (see mcp-notifications package or build your own)
3. Replace `/absolute/path/to/discord-webhook-mcp.js` with the actual path to your MCP server script

---

### Generic Webhook (Zapier, Custom Endpoint, etc.)

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["/absolute/path/to/webhook-mcp.js"],
      "env": {
        "WEBHOOK_URL": "https://your-service.com/notify",
        "WEBHOOK_AUTH_HEADER": "Authorization: Bearer YOUR_API_KEY",
        "WEBHOOK_CONTENT_TYPE": "application/json"
      }
    }
  }
}
```

**Setup:**
1. Create or download a generic webhook MCP server
2. Replace `/absolute/path/to/webhook-mcp.js` with the actual path to your MCP server script
3. Your endpoint receives POST requests with agent name, message, and context

---

## See Also

- [MCP Setup Guide](./mcp.md) — detailed MCP configuration walkthrough
- [Skills System](./skills.md) — learn how skills encode reusable knowledge
- [MCP Documentation](./mcp.md) — how to configure Model Context Protocol
- [Model Selection](./model-selection.md) — customize agent behavior per role

## Sample Prompts

```
configure Teams webhook for notifications
```

Guides you through setting up Microsoft Teams as the notification channel.

```
test my notification setup
```

Sends a sample notification to verify your MCP server configuration is working.

```
disable completion notifications
```

Configures the notification system to only ping on blocks and errors, not completions.

```
what's my current notification status?
```

Shows which notification triggers are enabled and what channel is configured.

```
set quiet hours from 6pm to 9am
```

Configures the notification system to queue messages during off-hours instead of sending immediately.
