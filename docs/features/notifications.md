# Squad Pings You

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

### Option A: Teams Incoming Webhook (No Auth Setup)

Teams webhooks are the fastest setup — just a URL.

1. **In Teams, create a channel for your squad:**
   - Create a new Team called "My Squads" (or reuse an existing one)
   - Add a channel, e.g., `#squad-myproject`

2. **Set up the webhook:**
   - Right-click the channel → "Manage channel" → "Connectors"
   - Search "Incoming Webhook" → "Configure"
   - Give it a name (e.g., "Squad Notifications")
   - Copy the webhook URL

3. **Configure Squad:**
   - Create or edit `.vscode/mcp.json` in your workspace:
   ```json
   {
     "mcpServers": {
       "notifications": {
         "command": "node",
         "args": ["path/to/teams-webhook-mcp.js"],
         "env": {
           "TEAMS_WEBHOOK_URL": "https://outlook.webhook.office.com/webhookb2/..."
         }
       }
     }
   }
   ```

4. **Use it:**
   - Start a Squad session with `copilot squad`
   - When an agent needs input, your Teams channel lights up

### Option B: Microsoft's Official Teams MCP Server (Full Auth)

For integration with your Azure tenant and full Teams API access:

1. **Register an Azure AD app:**
   - Go to https://portal.azure.com → "Azure Active Directory" → "App registrations"
   - New registration: name it "Squad Notifications"
   - Copy the **Application (client) ID**

2. **Set up credentials:**
   - "Certificates & secrets" → "New client secret"
   - Copy the secret value

3. **Grant permissions:**
   - "API permissions" → "Add a permission" → "Microsoft Graph"
   - Add `Chat.Send`, `ChannelMessage.Send`
   - Grant admin consent

4. **Configure Squad:**
   - Install Microsoft's Teams MCP server: https://github.com/microsoft/IF-MCP-Server-for-Microsoft-Teams
   - Configure in `.vscode/mcp.json`:
   ```json
   {
     "mcpServers": {
       "teams": {
         "command": "node",
         "args": ["path/to/teams-mcp.js"],
         "env": {
           "AZURE_CLIENT_ID": "your-client-id",
           "AZURE_CLIENT_SECRET": "your-secret",
           "AZURE_TENANT_ID": "your-tenant-id"
         }
       }
     }
   }
   ```

---

## Quick Start: iMessage (Mac Only)

iMessage is built into macOS. If you're on a Mac, this is the fastest personal setup.

1. **Check requirements:**
   - macOS with Messages.app
   - Copilot running on the same Mac
   - System allows Copilot to control Messages (grant permission when prompted)

2. **Install the iMessage MCP server:**
   - Get it from https://mcpmarket.com/server/imessage
   - Follow its setup steps

3. **Configure Squad:**
   - Edit `.vscode/mcp.json`:
   ```json
   {
     "mcpServers": {
       "imessage": {
         "command": "node",
         "args": ["path/to/imessage-mcp.js"],
         "env": {
           "IMESSAGE_TARGET": "your-phone-number-or-email"
         }
       }
     }
   }
   ```

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
    * Command: `npx -y mcp-notifications`
    * Environment Variables: `{ "WEBHOOK_URL": "https://discord.com/api/webhooks/...", "WEBHOOK_TYPE": "discord" }`

#### Add MCP Server in VSCode

1. From the command palette, search for MCP: Add Server
1. When you run MCP: Add Server, enter the following information

    * Type: Command (stdio)
    * Command: `npx -y mcp-notifications`
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
         "args": ["path/to/webhook-mcp.js"],
         "env": {
           "WEBHOOK_URL": "https://your-service.com/notify"
         }
       }
     }
   }
   ```

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

The `human-notification` skill lives in `.ai-team/skills/squad-human-notification/SKILL.md`. Agents read it before working and decide whether to ping you. You can edit the skill directly if you want to:

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
      "args": ["path/to/teams-webhook-mcp.js"],
      "env": {
        "TEAMS_WEBHOOK_URL": "https://outlook.webhook.office.com/webhookb2/YOUR_WEBHOOK_URL_HERE"
      }
    }
  }
}
```

**Setup:** Get your webhook URL from Teams channel settings (right-click channel → Manage → Connectors → Incoming Webhook).

---

### iMessage (Mac Only)

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["path/to/imessage-mcp.js"],
      "env": {
        "IMESSAGE_TARGET": "+1234567890"
      }
    }
  }
}
```

Replace `+1234567890` with your phone number or email address registered in iCloud.

---

### Discord Webhook

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["path/to/discord-webhook-mcp.js"],
      "env": {
        "DISCORD_WEBHOOK_URL": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
      }
    }
  }
}
```

**Setup:** In Discord, right-click channel → Edit Channel → Integrations → Webhooks → New Webhook → copy the URL.

---

### Generic Webhook (Zapier, Custom Endpoint, etc.)

```json
{
  "mcpServers": {
    "notifications": {
      "command": "node",
      "args": ["path/to/webhook-mcp.js"],
      "env": {
        "WEBHOOK_URL": "https://your-service.com/notify",
        "WEBHOOK_AUTH_HEADER": "Authorization: Bearer YOUR_API_KEY",
        "WEBHOOK_CONTENT_TYPE": "application/json"
      }
    }
  }
}
```

Your endpoint receives POST requests with agent name, message, and context.

---

## See Also

- [MCP Setup Guide](./mcp.md) — detailed MCP configuration walkthrough
- [Skills System](./skills.md) — learn how skills encode reusable knowledge
- [Copilot Environment Setup](../guide.md) — how to configure MCP
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
