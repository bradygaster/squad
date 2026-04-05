# Teams Communication Adapter

**Try this to enable Teams messaging:**
```
squad config set communications.channel teams-graph
```

**Try this to send a test message:**
```
squad test-notification --agent Keaton --reason blocked
```

**Try this to configure the recipient:**
```
squad config set communications.adapterConfig.teams-graph.recipientUpn "user@company.com"
```

Bidirectional Microsoft Teams messaging via the Graph API. Squad agents post updates, poll for human replies, and maintain a live conversation thread — all without webhooks or MCP servers.

---

## What the Teams Adapter Does

The Teams adapter is a built-in `CommunicationAdapter` that connects your squad directly to Microsoft Teams using the Microsoft Graph API:

1. **Post updates** — Agents send HTML-formatted messages to a 1:1 chat or Teams channel
2. **Poll for replies** — Agents read human responses from the chat thread
3. **Deep links** — Every message includes a clickable Teams URL so you can jump straight into the conversation

Unlike the webhook-based approach in [Notifications](../src/content/docs/features/notifications.md), this adapter uses OAuth to authenticate as you and chat directly — no Power Automate, no MCP server, no webhook URLs.

---

## Quick Start

### 1. Configure your squad

Add Teams as the communication channel in `.squad/config.json`:

```json
{
  "communications": {
    "channel": "teams-graph",
    "adapterConfig": {
      "teams-graph": {
        "recipientUpn": "your-colleague@company.com"
      }
    }
  }
}
```

### 2. Run your squad

```bash
copilot --agent squad --yolo
```

On first run, the adapter opens your browser for a one-time OAuth sign-in (PKCE flow). After that, tokens are cached at `~/.squad/teams-tokens.json` and refreshed automatically.

### 3. Agents start chatting

When agents need to post updates or ask for input, they send messages to the configured recipient via Teams. You reply in Teams; agents pick up your replies on the next poll.

---

## Configuration Reference

All configuration lives in `.squad/config.json` under `communications.adapterConfig["teams-graph"]`:

```json
{
  "communications": {
    "channel": "teams-graph",
    "adapterConfig": {
      "teams-graph": {
        "tenantId": "organizations",
        "clientId": "14d82eec-204b-4c2f-b7e8-296a70dab67e",
        "recipientUpn": "user@company.com",
        "chatId": "19:abc123@thread.v2",
        "teamId": "team-guid",
        "channelId": "19:channel@thread.tacv2"
      }
    }
  }
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `recipientUpn` | For 1:1 chat | — | UPN of the person to chat with (e.g., `bradyg@microsoft.com`). Use `"me"` to message yourself. |
| `chatId` | No | — | Existing chat ID. If omitted, the adapter creates a new 1:1 chat with the recipient. |
| `teamId` | For channels | — | Team ID (required when using `channelId`). |
| `channelId` | For channels | — | Channel ID. When set with `teamId`, posts go to the team channel instead of a 1:1 chat. |
| `tenantId` | No | `"organizations"` | Entra ID tenant. Default works for any multi-tenant org. |
| `clientId` | No | `"14d82eec-..."` | OAuth app ID. Default uses the Microsoft Graph PowerShell first-party app, which works in any tenant without Entra app registration. |

### Two messaging modes

- **1:1 chat** — Set `recipientUpn`. The adapter creates (or reuses) a direct chat.
- **Channel** — Set `teamId` + `channelId`. Messages go to a team channel visible to all members.

---

## Authentication

The adapter authenticates via OAuth 2.0 with a 4-tier fallback strategy:

### 1. Cached token
If a valid (non-expired) access token exists in `~/.squad/teams-tokens.json`, it is reused immediately.

### 2. Token refresh
If the cached token is expired but a refresh token exists, the adapter silently refreshes without user interaction.

### 3. Browser PKCE flow (interactive)
If no cached tokens exist, the adapter:
- Opens your default browser to the Microsoft login page
- Uses PKCE (Proof Key for Code Exchange) — no client secret needed
- Spins up a temporary localhost server to receive the redirect
- Exchanges the auth code for tokens
- Stores tokens securely at `~/.squad/teams-tokens.json`

### 4. Device code flow (headless fallback)
If the browser cannot be opened (SSH, CI, headless server):
- Displays a user code (e.g., `ABCD1234`) and a URL
- You visit the URL on any device and enter the code
- The adapter polls until you complete the sign-in

### Token storage security

Tokens are stored at `~/.squad/teams-tokens.json` with restricted permissions:
- **Linux/macOS:** `0600` (owner read/write only)
- **Windows:** ICACLS restricted to the current user

### Required Graph API permissions

The default client ID requests these scopes:
- `Chat.ReadWrite` — Create and read chats
- `ChatMessage.Send` — Send messages
- `ChatMessage.Read` — Read replies
- `User.Read` — Identify the signed-in user
- `offline_access` — Obtain refresh tokens

No admin consent is required when using the default first-party client ID.

---

## How It Works

### Posting a message

```
Agent (e.g., Keaton) calls postUpdate()
  → adapter.ensureAuthenticated()
  → adapter.ensureChat(accessToken)    // creates 1:1 chat if needed
  → POST /chats/{chatId}/messages      // sends HTML message
  → returns { id, url }               // chat ID + Teams deep link
```

Messages are formatted as HTML with the agent's name as author and category as a prefix label.

### Polling for replies

```
Agent calls pollForReplies({ threadId, since })
  → GET /chats/{chatId}/messages?$top=50
  → filter: only messages from other users, after `since`
  → strip HTML tags from reply body
  → return CommunicationReply[]
```

### Retry logic

All Graph API calls use 3 retries with exponential backoff for transient errors (HTTP 429, 503, 504).

---

## Comparison with Webhook Notifications

| | Teams Adapter (this) | Webhook Notifications |
|---|---|---|
| **Direction** | Bidirectional (send + receive) | One-way (send only) |
| **Setup** | Just config + OAuth sign-in | Webhook URL + MCP server + Power Automate |
| **Auth** | OAuth 2.0 (PKCE / device code) | Webhook URL |
| **Infrastructure** | None (built-in) | External MCP server required |
| **Reply detection** | Yes (polls for human replies) | No |
| **Best for** | Interactive agent–human conversations | Fire-and-forget alerts |

---

## Troubleshooting

### "Token expired" or repeated sign-in prompts
Delete the cached tokens and re-authenticate:
```bash
rm ~/.squad/teams-tokens.json
```

### "Chat creation failed"
- Verify `recipientUpn` is a valid UPN in your tenant
- Ensure both you and the recipient have Teams licenses
- Check that the Graph API scopes are consented

### Browser doesn't open (PKCE flow fails)
The adapter falls back to device code automatically. If neither works:
- Ensure you have network access to `login.microsoftonline.com`
- Check that port binding on localhost is not blocked by a firewall

### Channel messages not appearing
- Verify both `teamId` and `channelId` are set (both are required for channel mode)
- Ensure you are a member of the team

---

## See Also

- [Notifications](../src/content/docs/features/notifications.md) — Webhook-based one-way notifications (Teams, Discord, Slack)
- [Cross-Squad Orchestration](./cross-squad-orchestration.md) — Delegate work across squads
- [Persistent Ralph](./persistent-ralph.md) — Monitor work with continuous polling
