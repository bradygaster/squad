# Platform Adapter — Design Spec

## Overview

The Platform Adapter abstraction allows Squad to work with multiple source code hosting platforms (GitHub, Azure DevOps) through a unified interface. This enables Ralph and the coordinator to use the same triage/assignment logic regardless of the underlying platform.

## Design Decisions

### 1. Interface-based abstraction

We use a TypeScript interface (`PlatformAdapter`) rather than an abstract class. This keeps the contract pure and allows each adapter to manage its own dependencies independently.

### 2. CLI-based implementations

Both adapters wrap CLI tools (`gh` for GitHub, `az` for ADO) rather than using REST APIs directly. This:
- Leverages existing authentication (users are already logged into `gh`/`az`)
- Avoids managing OAuth tokens, PATs, or refresh flows
- Matches how Squad already interacts with GitHub

### 3. Auto-detection from git remote

Platform detection reads the `origin` remote URL. This is zero-config — users don't need to specify which platform they're on.

### 4. Graceful failure

If the required CLI is not installed, the adapter throws a descriptive error with installation instructions rather than a cryptic exec failure.

## Mapping Table

| Concept | GitHub | Azure DevOps |
|---|---|---|
| Work item | Issue | Work Item |
| Work item query | `gh issue list --label X` | WIQL via `az boards query` |
| Work item tags | Labels | Tags (`;`-separated) |
| Pull request list | `gh pr list` | `az repos pr list` |
| Pull request create | `gh pr create` | `az repos pr create` |
| Pull request merge | `gh pr merge` | `az repos pr update --status completed` |
| Branch create | `git checkout -b` | `git checkout -b` |
| Review status | `reviewDecision` field | `vote` field on reviewers |
| Authentication | `gh auth login` | `az login` |

## Module Structure

```
packages/squad-sdk/src/platform/
├── types.ts          # PlatformType, WorkItem, PullRequest, PlatformAdapter
├── detect.ts         # detectPlatform, parseGitHubRemote, parseAzureDevOpsRemote
├── github.ts         # GitHubAdapter
├── azure-devops.ts   # AzureDevOpsAdapter
├── ralph-commands.ts # getRalphScanCommands
└── index.ts          # Factory + barrel exports
```

## Future Work

- **GitLab adapter** — Same interface, wrapping `glab` CLI
- **Bitbucket adapter** — Same interface, wrapping Bitbucket APIs
- **REST API fallback** — Direct API calls when CLI tools aren't available
- **Token-based auth** — Support PAT/token auth for CI environments
- **Pipelines abstraction** — Normalize GitHub Actions and Azure Pipelines
- **Board view** — Normalize GitHub Projects and ADO Boards
