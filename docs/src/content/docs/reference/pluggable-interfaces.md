# Pluggable Interfaces

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**For detailed how-to guides, jump to a specific interface:**
```
Learn how to switch platform adapters
Learn how to choose a storage backend
Learn how to route communication through different channels
Learn how to customize scheduling
Learn how to manage state backends
```

Squad's architecture is built on pluggable interfaces. Rather than hardcoding integrations for GitHub, Azure DevOps, SQLite, or any specific platform, Squad defines clean contracts that let you swap implementations without changing your code.

This page explains why pluggable interfaces matter, which ones exist, and how to configure them.

---

## Why Pluggable Interfaces?

Pluggable interfaces give you:

- **Multi-platform support** — Use GitHub one day, Azure DevOps the next. Switch at runtime.
- **Portable testing** — Replace file storage with in-memory storage for tests. No disk I/O.
- **Custom backends** — Deploy to your infrastructure. Use DynamoDB, cloud storage, or your own database.
- **No vendor lock-in** — Squad doesn't dictate your storage layer or communication channel.

The pattern is simple: define an interface, provide built-in implementations, let users implement their own.

---

## The 5 Interfaces

| Interface | Purpose | Built-in Implementations |
|-----------|---------|--------------------------|
| **StorageProvider** | Where squad state lives (files, decisions, session history) | FSStorageProvider, InMemoryStorageProvider, SQLiteStorageProvider |
| **StateBackend** | Git-based state storage (commit messages, notes, orphan branches) | WorktreeBackend, GitNotesBackend, OrphanBranchBackend |
| **PlatformAdapter** | Work item / pull request / branch operations (GitHub, ADO, Planner) | GitHubAdapter, AzureDevOpsAdapter, PlannerAdapter (partial — work items only) |
| **CommunicationAdapter** | Agent-to-human messaging (Teams, GitHub Discussions, ADO, file logs) | TeamsCommunicationAdapter, GitHubDiscussionsCommunicationAdapter, ADODiscussionCommunicationAdapter, FileLogCommunicationAdapter |
| **ScheduleProvider** | Schedule execution (polling, GitHub Actions, webhooks) | LocalPollingProvider, GitHubActionsProvider |

---

## Configuration-Driven Switching

All interfaces are configured in `.squad/config.json`. Here's a typical setup:

```json
{
  "team": {
    "name": "my-team",
    "root": ".squad"
  },
  "stateBackend": "worktree",
  "communications": {
    "channel": "github-discussions",
    "postAfterSession": true,
    "postDecisions": true
  }
}
```

> **Note:** Platform adapters (GitHub, ADO) are auto-detected from your git remote — no config needed. Schedule providers are configured in `.squad/schedule.json`, not in `config.json`.

---

## Which Interface Do I Need?

Use this decision table to pick the right interface for your use case:

| Question | Choose |
|----------|--------|
| **Where should squad state live?** | **StorageProvider** — file system, database, cloud, or in-memory |
| **How should state be tracked in Git?** | **StateBackend** — worktree, git-notes, orphan branches, or external |
| **What platform hosts my code?** | **PlatformAdapter** — GitHub, Azure DevOps, or Planner |
| **Where should agents post updates?** | **CommunicationAdapter** — Teams, GitHub Discussions, ADO, or file log |
| **How should recurring tasks run?** | **ScheduleProvider** — local polling or GitHub Actions |

---

## Auto-Detection & Factory Logic

Squad auto-detects some interfaces from your environment:

- **PlatformAdapter:** Inspects `.git/config` or `origin` URL. Detects GitHub (github.com) vs Azure DevOps (dev.azure.com).
- **StorageProvider:** Defaults to FSStorageProvider (filesystem) unless `.squad/config.json` specifies otherwise.
- **StateBackend:** Defaults to WorktreeBackend (stores state in `.squad/` directories).
- **CommunicationAdapter:** Requires explicit configuration (no safe default).
- **ScheduleProvider:** Defaults to LocalPollingProvider if schedules are defined.

To override auto-detection, set explicit values in `.squad/config.json`.

---

## See Also

- [StorageProvider](storage-provider.md) — Store squad state (files, sessions, decisions)
- [StateBackend](state-backends.md) — Track state in Git
- [PlatformAdapter](platform-adapters.md) — Work with GitHub, Azure DevOps, or Planner
- [CommunicationAdapter](communication-adapters.md) — Post updates and read replies
- [ScheduleProvider](schedule-providers.md) — Run scheduled tasks
- [API Reference](api-reference.md) — All public SDK exports
