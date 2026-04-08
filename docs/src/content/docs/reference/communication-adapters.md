# Communication Adapters

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to post agent updates to a team channel:**
```
Configure a Teams communication adapter
```

**Try this to read human replies from GitHub Discussions:**
```
Set up GitHub Discussions for agent feedback
```

Communication adapters let agents post session summaries, ask for human input, and read replies from multiple channels: Teams, GitHub Discussions, Azure DevOps, or simple file logs.

---

## What is CommunicationAdapter?

`CommunicationAdapter` is Squad's I/O contract for agent-to-human messaging. The interface abstracts the communication channel so Squad can work with any service — the same agent code posts to Teams in one environment and GitHub Discussions in another.

```typescript
export interface CommunicationAdapter {
  readonly channel: CommunicationChannel;

  /**
   * Post an update to the communication channel.
   * Used by Scribe (session summaries), Ralph (board status), and agents (escalations).
   */
  postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }>;

  /**
   * Poll for replies since a given timestamp.
   * Returns new replies from humans on the channel.
   */
  pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]>;

  /**
   * Get a URL that humans can open on any device.
   * Returns undefined if the channel has no web UI (e.g., file-log).
   */
  getNotificationUrl(threadId: string): string | undefined;
}
```

**Key types:**

```typescript
type CommunicationChannel = 'github-discussions' | 'ado-work-items' | 'teams-graph' | 'file-log';

interface CommunicationReply {
  author: string;
  body: string;
  timestamp: Date;
  id: string;  // Platform-specific identifier
}

interface CommunicationConfig {
  channel: CommunicationChannel;
  postAfterSession?: boolean;      // Post summaries after agent work
  postDecisions?: boolean;         // Post decisions that need review
  postEscalations?: boolean;       // Post when agents are blocked
  adapterConfig?: Record<string, unknown>;  // Channel-specific config
}
```

---

## Built-in Adapters

### TeamsAdapter

**What it is:** Microsoft Teams via Microsoft Graph API.

**When to use it:**
- Enterprise environments with Teams
- Post updates to a private channel or conversation
- Read replies from team members

**Configuration:**

```json
{
  "communication": {
    "channel": "teams-graph",
    "postAfterSession": true,
    "postDecisions": true,
    "adapterConfig": {
      "tenantId": "your-tenant-id",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "teamId": "team-guid",
      "channelId": "channel-guid"
    }
  }
}
```

**How it works:** Uses Teams Graph API to post messages and read replies. Requires Teams application registration in Azure AD.

---

### GitHubDiscussionsAdapter

**What it is:** GitHub Discussions in your repository.

**When to use it:**
- Public or private GitHub projects
- Discussions are naturally threaded and searchable
- Team members already monitor GitHub

**Configuration:**

```json
{
  "communication": {
    "channel": "github-discussions",
    "postAfterSession": true,
    "adapterConfig": {
      "repo": "owner/repo",
      "category": "Agent Updates"
    }
  }
}
```

**How it works:** Queries GitHub GraphQL API to post in a discussion category. Polls for replies via Discussion comments.

---

### ADOAdapter

**What it is:** Azure DevOps work item discussions.

**When to use it:**
- Azure DevOps organizations
- Post updates in work item comments
- Discussions are tied to backlog items

**Configuration:**

```json
{
  "communication": {
    "channel": "ado-work-items",
    "postAfterSession": true,
    "adapterConfig": {
      "organization": "dev.azure.com/my-org",
      "project": "my-project",
      "pat": "your-pat-token"
    }
  }
}
```

**How it works:** Uses ADO REST API to comment on work items. Polls for replies via work item comment history.

---

### FileLogAdapter

**What it is:** Simple file-based log (JSON lines format).

**When to use it:**
- Local development or testing
- Offline scenarios (no API access)
- Debugging agent behavior

**Configuration:**

```json
{
  "communication": {
    "channel": "file-log",
    "adapterConfig": {
      "logPath": ".squad/communication.jsonl"
    }
  }
}
```

**How it works:** Appends updates as JSON lines to a file. Perfect for examining agent-human interactions locally.

| Feature | TeamsAdapter | GitHubDiscussionsAdapter | ADOAdapter | FileLogAdapter |
|---------|---|---|---|---|
| Platform | Microsoft Teams | GitHub | Azure DevOps | Filesystem |
| Multi-threaded | Yes | Yes | Yes | Single log |
| Web UI | Teams | GitHub | ADO | None |
| Polling support | Yes | Yes | Yes | File read |
| Requires auth | Graph API token | PAT + repo access | PAT + org access | None |

---

## Create a Custom Adapter

Implement `CommunicationAdapter` to plug in any channel. Here's a skeleton:

```typescript
import type { CommunicationAdapter, CommunicationReply } from '@bradygaster/squad-sdk';

export class MyCustomCommunicationAdapter implements CommunicationAdapter {
  readonly channel = 'my-channel' as const;

  async postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }> {
    // Post to your service (Slack, Discord, webhook, etc.)
    // Return thread ID and optional URL
    const threadId = await this.sendToMyService({
      title: options.title,
      body: options.body,
      author: options.author,
    });
    return {
      id: threadId,
      url: `https://my-service.com/threads/${threadId}`,
    };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    // Query for new replies since the timestamp
    const replies = await this.fetchRepliesSince(options.threadId, options.since);
    return replies.map(r => ({
      author: r.senderName,
      body: r.message,
      timestamp: new Date(r.sentAt),
      id: r.replyId,
    }));
  }

  getNotificationUrl(threadId: string): string | undefined {
    // Return a link humans can click to see the thread
    return `https://my-service.com/threads/${threadId}`;
  }

  private async sendToMyService(options: unknown): Promise<string> {
    // Implementation details...
    throw new Error('Implement this');
  }

  private async fetchRepliesSince(threadId: string, since: Date): Promise<unknown[]> {
    // Implementation details...
    throw new Error('Implement this');
  }
}
```

Register it in `.squad/config.json`:

```json
{
  "communication": {
    "channel": "my-channel",
    "adapterConfig": {
      "serviceUrl": "https://my-service.com",
      "apiKey": "your-api-key"
    }
  }
}
```

---

## Related

- [Pluggable Interfaces](pluggable-interfaces.md) — Overview of all pluggable interfaces
- [PlatformAdapter](platform-adapters.md) — Work with GitHub, ADO, or Planner
- [StateBackend](state-backends.md) — Track state in Git
- [API Reference](api-reference.md) — All public SDK exports
