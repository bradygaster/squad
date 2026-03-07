# Enterprise Platforms

Squad supports Azure DevOps and Microsoft Planner in addition to GitHub. When your git remote points to Azure DevOps, Squad automatically detects the platform and adapts its commands. For work-item tracking, Squad also supports a hybrid model where code lives in one platform and tasks live in Microsoft Planner.

## Prerequisites

1. **Azure CLI** — Install from [https://aka.ms/install-az-cli](https://aka.ms/install-az-cli)
2. **Azure DevOps extension** — `az extension add --name azure-devops`
3. **Login** — `az login`
4. **Set defaults** — `az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG project=YOUR_PROJECT`

Verify setup:

```bash
az devops configure --list
# Should show organization and project
```

## How It Works

Squad auto-detects the platform from your git remote URL:

| Remote URL pattern | Detected platform |
|---|---|
| `github.com` | GitHub |
| `dev.azure.com` | Azure DevOps |
| `*.visualstudio.com` | Azure DevOps |
| `ssh.dev.azure.com` | Azure DevOps |

## Differences from GitHub

### Work Items vs Issues

| GitHub | Azure DevOps |
|---|---|
| Issues | Work Items |
| Labels (e.g., `squad:alice`) | Tags (e.g., `squad:alice`) |
| `gh issue list --label X` | WIQL query via `az boards query` |
| `gh issue edit --add-label` | `az boards work-item update --fields "System.Tags=..."` |

### Pull Requests

| GitHub | Azure DevOps |
|---|---|
| `gh pr list` | `az repos pr list` |
| `gh pr create` | `az repos pr create` |
| `gh pr merge` | `az repos pr update --status completed` |
| Review: Approved / Changes Requested | Vote: 10 (approved) / -10 (rejected) |

### Branch Operations

Branch operations use the same `git` commands on both platforms. Squad creates branches with the naming convention `squad/{id}-{slug}`.

## Ralph on Azure DevOps

Ralph works identically on ADO — he scans for untriaged work items using WIQL queries instead of GitHub label filters:

```
# GitHub
gh issue list --label "squad:untriaged" --json number,title,labels

# Azure DevOps
az boards query --wiql "SELECT [System.Id],[System.Title],[System.Tags] FROM WorkItems WHERE [System.Tags] Contains 'squad:untriaged'"
```

Tag assignment uses the same `squad:{member}` convention, stored as ADO work item tags separated by `;`.

## Configuration

Squad auto-detects ADO from the git remote URL. For basic use, no extra configuration is needed.

### Work Item Configuration

When your ADO environment has custom work item types, area paths, iterations, or when work items live in a **different project or org** than the git repo, configure the `ado` section in `.squad/config.json`:

```json
{
  "version": 1,
  "teamRoot": "/path/to/repo",
  "platform": "azure-devops",
  "ado": {
    "org": "my-org",
    "project": "my-work-items-project",
    "defaultWorkItemType": "Scenario",
    "areaPath": "MyProject\\Team Alpha",
    "iterationPath": "MyProject\\Sprint 5"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `ado.org` | *(from git remote)* | ADO org for work items — set when work items are in a different org than the repo |
| `ado.project` | *(from git remote)* | ADO project for work items — set when work items are in a different project |
| `ado.defaultWorkItemType` | `"User Story"` | Default type for new work items. Some orgs use `"Scenario"`, `"Bug"`, or custom types |
| `ado.areaPath` | *(project default)* | Area path for new work items — controls which team's backlog they appear in |
| `ado.iterationPath` | *(project default)* | Iteration/sprint path — controls which sprint board work items appear on |

All fields are optional. Omitted fields use the defaults shown above.

### Authentication

Squad uses the Azure CLI for ADO authentication — **no Personal Access Tokens (PATs) needed.** Run `az login` once, and Squad agents use your authenticated session for all operations.

Alternatively, if the Azure DevOps MCP server is configured in your environment, Squad will use it automatically for richer API access. Add it to `.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@azure/devops-mcp-server"]
    }
  }
}
```

Squad prefers MCP tools when available, falling back to `az` CLI when not.

To explicitly check which platform Squad detects:

```typescript
import { detectPlatform } from '@bradygaster/squad/platform';

const platform = detectPlatform('/path/to/repo');
// Returns 'github', 'azure-devops', or 'planner'
```

---

## Microsoft Planner Support (Hybrid Model)

Squad supports a hybrid model where your **repository** lives in GitHub or Azure DevOps, but **work items** are tracked in Microsoft Planner. This is common in enterprise environments where project management uses Planner while engineering uses ADO or GitHub for code.

### How It Works

- Planner **buckets** map to squad assignments: `squad:untriaged`, `squad:riker`, `squad:data`, etc.
- Moving a task between buckets = reassigning to a team member
- Task completion = 100% complete or move to "Done" bucket
- PRs and branches still go through the repo adapter (GitHub or Azure DevOps)

### Prerequisites

1. **Azure CLI** — `az login`
2. **Graph API access** — `az account get-access-token --resource-type ms-graph`
3. **Plan ID** — Found in the Planner URL or via Graph API

### Configuration

In `squad.config.ts`, specify the hybrid model:

```typescript
const config: SquadConfig = {
  // ... other config
  platform: {
    repo: 'azure-devops',     // where code lives
    workItems: 'planner',     // where tasks live
    planId: 'rYe_WFgqUUqnSTZfpMdKcZUAER1P',
  },
};
```

### Ralph with Planner

Ralph scans Planner tasks via the Microsoft Graph API instead of GitHub labels or ADO WIQL:

```
# List untriaged tasks
GET /planner/plans/{planId}/tasks  →  filter by "squad:untriaged" bucket

# Assign to member (move to their bucket)
PATCH /planner/tasks/{taskId}  →  { "bucketId": "{squad:member bucket ID}" }
```

PR operations still use the repo adapter:

```
# Repo on Azure DevOps
az repos pr list --status active
az repos pr create --source-branch ... --target-branch ...

# Repo on GitHub
gh pr list --state open
gh pr create --head ... --base ...
```
