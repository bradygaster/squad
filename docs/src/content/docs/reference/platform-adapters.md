# Platform Adapters

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to switch from GitHub to Azure DevOps:**
```
Switch your platform adapter in .squad/config.json
```

**Try this to create work items and branches:**
```
Use PlatformAdapter to manage pull requests and work items
```

Platform adapters handle pull requests, work items, and branches across GitHub, Azure DevOps, and Planner. Same code, different platforms.

---

## What is PlatformAdapter?

`PlatformAdapter` is Squad's normalized interface for platform operations. It maps GitHub Issues → ADO Work Items, GitHub PRs → ADO PRs, and provides a uniform API for tagging, branching, and commenting.

```typescript
export interface PlatformAdapter {
  readonly type: PlatformType;

  // Work Items / Issues
  listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]>;
  getWorkItem(id: number): Promise<WorkItem>;
  createWorkItem(options: {
    title: string;
    description?: string;
    tags?: string[];
    assignedTo?: string;
    type?: string;
  }): Promise<WorkItem>;
  addTag(workItemId: number, tag: string): Promise<void>;
  removeTag(workItemId: number, tag: string): Promise<void>;
  addComment(workItemId: number, comment: string): Promise<void>;
  ensureTag?(tag: string, options?: { color?: string; description?: string }): Promise<void>;
  ensureAuth?(preferredUser?: string): Promise<void>;

  // Pull Requests
  listPullRequests(options: { status?: string; limit?: number }): Promise<PullRequest[]>;
  createPullRequest(options: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
  }): Promise<PullRequest>;
  mergePullRequest(id: number): Promise<void>;

  // Branches
  createBranch(name: string, fromBranch?: string): Promise<void>;
}
```

**Key types:**

```typescript
type PlatformType = 'github' | 'azure-devops' | 'planner';

interface WorkItem {
  id: number;
  title: string;
  state: string;
  tags: string[];
  assignedTo?: string;
  url: string;
}

interface PullRequest {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'active' | 'completed' | 'abandoned' | 'draft';
  reviewStatus?: 'approved' | 'changes-requested' | 'pending';
  author: string;
  url: string;
}
```

---

## Built-in Adapters

### GitHubAdapter

**What it is:** GitHub via REST and GraphQL APIs.

**When to use it:**
- Public or private GitHub repositories
- GitHub Issues for work items
- GitHub PRs for code review

**Configuration:**

The GitHub adapter is **auto-detected** from your git remote URL — no manual configuration needed.

```bash
# Squad detects GitHub from your remote:
git remote -v
# origin  https://github.com/my-org/my-repo.git (fetch)
```

**How it works:** Auto-detects owner/repo from the git remote `origin` URL. Uses the `gh` CLI for all operations (issues, PRs, branches). Authenticate with `gh auth login` — no tokens in config files.

---

### AzureDevOpsAdapter

**What it is:** Azure DevOps via the `az` CLI.

**When to use it:**
- Azure DevOps projects and organizations
- ADO Work Items for backlog
- ADO Pull Requests for code review

**Configuration:**

The ADO adapter is **auto-detected** from your git remote URL. Optionally, add an `ado` section in `.squad/config.json` for cross-org scenarios:

```json
{
  "ado": {
    "org": "different-org",
    "project": "different-project",
    "defaultWorkItemType": "User Story",
    "areaPath": "MyProject\\Team A",
    "iterationPath": "MyProject\\Sprint 1"
  }
}
```

**How it works:** Wraps the `az devops` CLI (requires `az extension add --name azure-devops`). Authenticate with `az login`. The org, project, and repo are auto-detected from the git remote; the optional `ado` config section overrides work item targeting for cross-org setups.

---

### PlannerAdapter

**What it is:** Microsoft Planner for task management (partial adapter — work items only).

**When to use it:**
- Microsoft 365 environments
- Plan-based task tracking
- Integration with Teams
- Use alongside a repo adapter (GitHub/ADO) in a hybrid config — Planner has no concept of PRs or branches

**Configuration:**

The Planner adapter requires only a `planId`. Authentication uses the Azure CLI:

```bash
# Login first:
az login
# Verify Graph access:
az account get-access-token --resource-type ms-graph
```

```typescript
import { PlannerAdapter } from '@bradygaster/squad-sdk';

const planner = new PlannerAdapter('your-plan-id');
```

**How it works:** Uses Microsoft Graph API via an access token obtained from `az account get-access-token --resource-type ms-graph`. Only needs the Planner plan ID — no tenant ID or group ID required.

| Feature | GitHubAdapter | AzureDevOpsAdapter | PlannerAdapter |
|---------|---|---|---|
| Platform | GitHub | Azure DevOps | Microsoft Planner |
| Work Items | GitHub Issues | ADO Work Items | Planner Tasks |
| PRs | GitHub PRs | ADO Pull Requests | N/A (work items only) |
| Tags | GitHub Labels | ADO Tags | Planner Buckets |
| Auth | `gh` CLI (`gh auth login`) | `az` CLI (`az login`) | `az` CLI (`az account get-access-token`) |
| Auto-detect | Yes (from git remote) | Yes (from git remote) | No (needs `planId`) |

---

## Create a Custom Adapter

Implement `PlatformAdapter` to support any platform. Here's a skeleton:

```typescript
import type { PlatformAdapter, WorkItem, PullRequest } from '@bradygaster/squad-sdk';

export class MyCustomPlatformAdapter implements PlatformAdapter {
  // PlatformType is a closed union: 'github' | 'azure-devops' | 'planner'
  // To add a new type, you must extend the PlatformType union in the SDK.
  readonly type = 'github' as const; // Use an existing type, or extend PlatformType in the SDK

  async listWorkItems(options: {
    tags?: string[];
    state?: string;
    limit?: number;
  }): Promise<WorkItem[]> {
    // Query your platform for work items
    const items = await this.queryMyPlatform({
      labels: options.tags,
      status: options.state,
      limit: options.limit,
    });
    return items.map(item => ({
      id: item.id,
      title: item.name,
      state: item.status,
      tags: item.labels || [],
      assignedTo: item.owner,
      url: item.webUrl,
    }));
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    const item = await this.fetchWorkItem(id);
    return {
      id: item.id,
      title: item.name,
      state: item.status,
      tags: item.labels || [],
      assignedTo: item.owner,
      url: item.webUrl,
    };
  }

  async createWorkItem(options: {
    title: string;
    description?: string;
    tags?: string[];
    assignedTo?: string;
    type?: string;
  }): Promise<WorkItem> {
    const created = await this.createOnMyPlatform({
      name: options.title,
      description: options.description,
      type: options.type || 'story',
      labels: options.tags,
      owner: options.assignedTo,
    });
    return {
      id: created.id,
      title: created.name,
      state: created.status,
      tags: created.labels || [],
      assignedTo: created.owner,
      url: created.webUrl,
    };
  }

  async addTag(workItemId: number, tag: string): Promise<void> {
    await this.updateWorkItem(workItemId, { addLabel: tag });
  }

  async removeTag(workItemId: number, tag: string): Promise<void> {
    await this.updateWorkItem(workItemId, { removeLabel: tag });
  }

  async addComment(workItemId: number, comment: string): Promise<void> {
    await this.postComment(workItemId, comment);
  }

  async listPullRequests(options: {
    status?: string;
    limit?: number;
  }): Promise<PullRequest[]> {
    const prs = await this.queryMyPlatform({
      status: options.status || 'open',
      limit: options.limit,
    });
    return prs.map(pr => ({
      id: pr.id,
      title: pr.title,
      sourceBranch: pr.source,
      targetBranch: pr.target,
      status: pr.status,
      reviewStatus: pr.reviewState,
      author: pr.createdBy,
      url: pr.webUrl,
    }));
  }

  async createPullRequest(options: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
  }): Promise<PullRequest> {
    const pr = await this.createPROnMyPlatform({
      title: options.title,
      source: options.sourceBranch,
      target: options.targetBranch,
      description: options.description,
    });
    return {
      id: pr.id,
      title: pr.title,
      sourceBranch: pr.source,
      targetBranch: pr.target,
      status: pr.status,
      author: pr.createdBy,
      url: pr.webUrl,
    };
  }

  async mergePullRequest(id: number): Promise<void> {
    await this.mergeOnMyPlatform(id);
  }

  async createBranch(name: string, fromBranch?: string): Promise<void> {
    await this.createBranchOnMyPlatform(name, fromBranch || 'main');
  }

  // Stub out your platform-specific methods
  private async queryMyPlatform(query: unknown): Promise<unknown[]> {
    throw new Error('Implement this');
  }

  private async fetchWorkItem(id: number): Promise<unknown> {
    throw new Error('Implement this');
  }

  private async createOnMyPlatform(item: unknown): Promise<unknown> {
    throw new Error('Implement this');
  }

  private async updateWorkItem(id: number, update: unknown): Promise<void> {
    throw new Error('Implement this');
  }

  private async postComment(id: number, comment: string): Promise<void> {
    throw new Error('Implement this');
  }

  private async createPROnMyPlatform(pr: unknown): Promise<unknown> {
    throw new Error('Implement this');
  }

  private async mergeOnMyPlatform(id: number): Promise<void> {
    throw new Error('Implement this');
  }

  private async createBranchOnMyPlatform(name: string, from: string): Promise<void> {
    throw new Error('Implement this');
  }
}
```

Register it in `.squad/config.json`:

```json
{
  "platform": {
    "adapter": "my-platform",
    "config": {
      "apiUrl": "https://api.my-platform.com",
      "token": "your-token"
    }
  }
}
```

---

## Related

- [Pluggable Interfaces](pluggable-interfaces.md) — Overview of all pluggable interfaces
- [CommunicationAdapter](communication-adapters.md) — Post updates and read replies
- [StateBackend](state-backends.md) — Track state in Git
- [API Reference](api-reference.md) — All public SDK exports
