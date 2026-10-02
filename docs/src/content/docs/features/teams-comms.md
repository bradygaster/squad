---
title: Microsoft Teams Comms Adapter
description: Bidirectional chat integration between Squad and Microsoft Teams via Microsoft Graph API — 1:1 chats and channel messaging with PKCE browser auth or device code fallback.
---

# Microsoft Teams Comms Adapter

The Teams adapter lets your squad post updates and read replies through Microsoft Teams, alongside the existing file-based, email, and other comm channels. It ships in `@bradygaster/squad-sdk` as a `CommunicationAdapter` implementation and uses Microsoft Graph API for both 1:1 chats and channel messaging.

> **⚠️ Breaking change in v0.10:** `createCommunicationAdapter` is now async (returns `Promise<CommunicationAdapter>`). Callers must `await` the result.

---

## What you can do with it

| Action | Supported |
|--------|-----------|
| Post a message to a 1:1 chat | ✅ |
| Post a message to a Teams channel | ✅ |
| Read replies / new messages from a chat | ✅ |
| Post rich content (Adaptive Cards, attachments) | Partial (text + basic formatting) |
| Notify on agent-completed work | ✅ (via squad watch / notification routing) |
| Two-way conversation with an agent in Teams | ✅ (poll-based, not push) |

The adapter is one of several `CommunicationAdapter` implementations — see [Notifications](/squad/docs/features/notifications/) for the broader notification system.

---

## Authentication flow

The adapter tries auth methods in this order, falling through on failure:

1. **Cached token** — looks for a previously-saved token in the OS credential store
2. **Refresh token** — if cached refresh token is valid, silently re-issues an access token
3. **Browser PKCE** — opens a browser for the user to sign in; uses Authorization Code with PKCE; 120-second timeout
4. **Device code** — fallback when no browser is available (CI, remote shell); user enters a code on a different device

```
$ squad notify teams --to user@example.com --message "Build complete"
🔑 No cached token — opening browser for sign-in...
[browser opens, user signs in]
✓ Token cached. Sending message...
✓ Posted to user@example.com
```

The token cache persists across sessions. After the first sign-in, subsequent runs are silent unless the refresh token expires.

---

## Configuration

The adapter requires a Microsoft Entra (Azure AD) app registration with permissions for:

- `Chat.ReadWrite` (1:1 chat operations)
- `ChannelMessage.Send` (channel posts)
- `ChannelMessage.Read.All` (read channel replies)
- `User.Read` (basic profile)

Configure in `.squad/config.json`:

```json
{
  "comms": {
    "teams": {
      "tenantId": "00000000-0000-0000-0000-000000000000",
      "clientId": "00000000-0000-0000-0000-000000000000",
      "redirectUri": "http://localhost:8400/auth",
      "tokenCachePath": "~/.squad/.cache/teams-token.json"
    }
  }
}
```

The `redirectUri` is the local-only OAuth callback for browser PKCE — it never leaves your machine.

---

## Usage from the SDK

```typescript
import { createCommunicationAdapter } from '@bradygaster/squad-sdk/platform';

// IMPORTANT: this is async now (breaking change in v0.10)
const teams = await createCommunicationAdapter({ channel: 'teams' });

// Post a message
const post = await teams.postUpdate({
  title: 'CI passed',
  body: 'PR #1234 is green and ready for review.',
  category: 'pr-status',
  author: 'Squad',
});

// Poll for replies
const replies = await teams.pollForReplies({
  threadId: post.id,
  since: new Date(Date.now() - 60_000),
});
```

---

## Limitations

- **Polling, not push.** The adapter polls for replies; it doesn't subscribe to a websocket. Reply latency is the poll interval (default 30s).
- **No Adaptive Card builder.** You can send plain text and basic formatting today; for rich cards, use the underlying Graph SDK directly.
- **No bot-framework integration.** This adapter uses delegated user permissions, not a bot account. Each user sees the message as posted by themselves (or the configured app identity), not by a "Squad bot".
- **MSAL token cache shared across processes.** If you run multiple squads simultaneously with the same Entra app, they share the same cached token. Use distinct `tokenCachePath` if you need isolation.

---

## Security notes

- Tokens are stored in the OS credential store (Windows Credential Manager / macOS Keychain / Linux libsecret) where available, with a JSON file fallback at `tokenCachePath`
- The browser PKCE callback listens on `127.0.0.1` only — never exposed to the network
- The device code flow shows a verification URL + code; both are short-lived
- The adapter does NOT log message content; only metadata (post id, recipient, timestamp) is recorded in any audit trail

---

## See also

- [Notifications](/squad/docs/features/notifications/) — the broader notification system
- [Enterprise Platforms](/squad/docs/features/enterprise-platforms/) — Teams + ADO + other enterprise integrations
- [Notification Level](/squad/docs/features/notification-level/) — controlling noise across all channels
