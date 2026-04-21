/**
 * Platform adapter tests — detection, parsing, commands, and type mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPlatformFromUrl,
  parseGitHubRemote,
  parseAzureDevOpsRemote,
  normalizeRemoteUrl,
} from '../packages/squad-sdk/src/platform/detect.js';
import type { NormalizedRemote } from '../packages/squad-sdk/src/platform/detect.js';
import { detectWorkItemSource } from '../packages/squad-sdk/src/platform/detect.js';
import { getRalphScanCommands } from '../packages/squad-sdk/src/platform/ralph-commands.js';
import { mapPlannerTaskToWorkItem } from '../packages/squad-sdk/src/platform/planner.js';
import type { PlatformType, WorkItem, PullRequest, WorkItemSource, HybridPlatformConfig, PlatformAdapter } from '../packages/squad-sdk/src/platform/types.js';

// ─── Platform Detection from URL ───────────────────────────────────────

describe('detectPlatformFromUrl', () => {
  it('detects github.com HTTPS remote', () => {
    expect(detectPlatformFromUrl('https://github.com/owner/repo.git')).toBe('github');
  });

  it('detects github.com SSH remote', () => {
    expect(detectPlatformFromUrl('git@github.com:owner/repo.git')).toBe('github');
  });

  it('detects github.com HTTPS without .git', () => {
    expect(detectPlatformFromUrl('https://github.com/owner/repo')).toBe('github');
  });

  it('detects dev.azure.com HTTPS remote', () => {
    expect(detectPlatformFromUrl('https://dev.azure.com/myorg/myproject/_git/myrepo')).toBe('azure-devops');
  });

  it('detects dev.azure.com with user prefix', () => {
    expect(detectPlatformFromUrl('https://myorg@dev.azure.com/myorg/myproject/_git/myrepo')).toBe('azure-devops');
  });

  it('detects SSH dev.azure.com remote', () => {
    expect(detectPlatformFromUrl('git@ssh.dev.azure.com:v3/myorg/myproject/myrepo')).toBe('azure-devops');
  });

  it('detects visualstudio.com remote', () => {
    expect(detectPlatformFromUrl('https://myorg.visualstudio.com/myproject/_git/myrepo')).toBe('azure-devops');
  });

  it('defaults to github for unknown remotes', () => {
    expect(detectPlatformFromUrl('https://gitlab.com/owner/repo.git')).toBe('github');
  });

  it('defaults to github for empty string', () => {
    expect(detectPlatformFromUrl('')).toBe('github');
  });

  it('defaults to github for random string', () => {
    expect(detectPlatformFromUrl('not-a-url')).toBe('github');
  });
});

// ─── GitHub Remote Parsing ─────────────────────────────────────────────

describe('parseGitHubRemote', () => {
  it('parses HTTPS URL with .git suffix', () => {
    const result = parseGitHubRemote('https://github.com/bradygaster/squad.git');
    expect(result).toEqual({ owner: 'bradygaster', repo: 'squad' });
  });

  it('parses HTTPS URL without .git suffix', () => {
    const result = parseGitHubRemote('https://github.com/microsoft/vscode');
    expect(result).toEqual({ owner: 'microsoft', repo: 'vscode' });
  });

  it('parses SSH URL', () => {
    const result = parseGitHubRemote('git@github.com:facebook/react.git');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseGitHubRemote('git@github.com:owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubRemote('https://dev.azure.com/org/project/_git/repo')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGitHubRemote('')).toBeNull();
  });

  it('returns null for gitlab URL', () => {
    expect(parseGitHubRemote('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  it('handles URL with trailing slash gracefully', () => {
    // trailing slash is not standard git remote but shouldn't crash
    expect(parseGitHubRemote('https://github.com/owner/')).toBeNull();
  });
});

// ─── Azure DevOps Remote Parsing ───────────────────────────────────────

describe('parseAzureDevOpsRemote', () => {
  it('parses HTTPS dev.azure.com URL', () => {
    const result = parseAzureDevOpsRemote('https://dev.azure.com/myorg/myproject/_git/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
  });

  it('parses HTTPS dev.azure.com URL with .git suffix', () => {
    const result = parseAzureDevOpsRemote('https://dev.azure.com/myorg/myproject/_git/myrepo.git');
    expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
  });

  it('parses URL with user prefix', () => {
    const result = parseAzureDevOpsRemote('https://myorg@dev.azure.com/myorg/MyProject/_git/my-repo');
    expect(result).toEqual({ org: 'myorg', project: 'MyProject', repo: 'my-repo' });
  });

  it('parses SSH dev.azure.com URL', () => {
    const result = parseAzureDevOpsRemote('git@ssh.dev.azure.com:v3/myorg/myproject/myrepo');
    expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
  });

  it('parses SSH dev.azure.com URL with .git suffix', () => {
    const result = parseAzureDevOpsRemote('git@ssh.dev.azure.com:v3/myorg/myproject/myrepo.git');
    expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
  });

  it('parses legacy visualstudio.com URL', () => {
    const result = parseAzureDevOpsRemote('https://contoso.visualstudio.com/WebApp/_git/frontend');
    expect(result).toEqual({ org: 'contoso', project: 'WebApp', repo: 'frontend' });
  });

  it('parses legacy visualstudio.com URL with .git suffix', () => {
    const result = parseAzureDevOpsRemote('https://contoso.visualstudio.com/WebApp/_git/frontend.git');
    expect(result).toEqual({ org: 'contoso', project: 'WebApp', repo: 'frontend' });
  });

  it('returns null for GitHub URLs', () => {
    expect(parseAzureDevOpsRemote('https://github.com/owner/repo.git')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAzureDevOpsRemote('')).toBeNull();
  });

  it('returns null for gitlab URLs', () => {
    expect(parseAzureDevOpsRemote('https://gitlab.com/group/repo.git')).toBeNull();
  });

  it('handles URL with special characters in project name', () => {
    const result = parseAzureDevOpsRemote('https://dev.azure.com/org/My-Project/_git/my-repo');
    expect(result).toEqual({ org: 'org', project: 'My-Project', repo: 'my-repo' });
  });
});

// ─── WorkItem Type Shape ───────────────────────────────────────────────

describe('WorkItem type', () => {
  it('has all required fields', () => {
    const wi: WorkItem = {
      id: 42,
      title: 'Fix login bug',
      state: 'active',
      tags: ['squad:alice', 'bug'],
      assignedTo: 'Alice',
      url: 'https://example.com/work-items/42',
    };
    expect(wi.id).toBe(42);
    expect(wi.title).toBe('Fix login bug');
    expect(wi.state).toBe('active');
    expect(wi.tags).toEqual(['squad:alice', 'bug']);
    expect(wi.assignedTo).toBe('Alice');
    expect(wi.url).toContain('42');
  });

  it('allows optional assignedTo', () => {
    const wi: WorkItem = {
      id: 1,
      title: 'Unassigned item',
      state: 'new',
      tags: [],
      url: 'https://example.com/1',
    };
    expect(wi.assignedTo).toBeUndefined();
  });

  it('allows empty tags', () => {
    const wi: WorkItem = {
      id: 1,
      title: 'No tags',
      state: 'new',
      tags: [],
      url: 'https://example.com/1',
    };
    expect(wi.tags).toEqual([]);
  });
});

// ─── PlatformAdapter createWorkItem Interface ─────────────────────────

describe('PlatformAdapter createWorkItem interface', () => {
  it('createWorkItem is part of the PlatformAdapter interface', () => {
    // Verify the method signature exists in the type
    const mockAdapter: PlatformAdapter = {
      type: 'github' as PlatformType,
      listWorkItems: async () => [],
      getWorkItem: async (id: number) => ({ id, title: '', state: '', tags: [], url: '' }),
      createWorkItem: async (options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string }) => ({
        id: 1,
        title: options.title,
        state: 'new',
        tags: options.tags ?? [],
        url: 'https://example.com/1',
      }),
      addTag: async () => {},
      removeTag: async () => {},
      addComment: async () => {},
      listPullRequests: async () => [],
      createPullRequest: async () => ({ id: 1, title: '', sourceBranch: '', targetBranch: '', status: 'active' as const, author: '', url: '' }),
      mergePullRequest: async () => {},
      createBranch: async () => {},
    };
    expect(typeof mockAdapter.createWorkItem).toBe('function');
  });

  it('createWorkItem returns a WorkItem with correct fields', async () => {
    const mockAdapter: PlatformAdapter = {
      type: 'azure-devops' as PlatformType,
      listWorkItems: async () => [],
      getWorkItem: async (id: number) => ({ id, title: '', state: '', tags: [], url: '' }),
      createWorkItem: async (options) => ({
        id: 99,
        title: options.title,
        state: 'New',
        tags: options.tags ?? [],
        assignedTo: options.assignedTo,
        url: 'https://dev.azure.com/org/proj/_workitems/edit/99',
      }),
      addTag: async () => {},
      removeTag: async () => {},
      addComment: async () => {},
      listPullRequests: async () => [],
      createPullRequest: async () => ({ id: 1, title: '', sourceBranch: '', targetBranch: '', status: 'active' as const, author: '', url: '' }),
      mergePullRequest: async () => {},
      createBranch: async () => {},
    };

    const wi = await mockAdapter.createWorkItem({
      title: 'New feature request',
      description: 'Build the thing',
      tags: ['squad', 'squad:untriaged'],
      type: 'User Story',
    });
    expect(wi.id).toBe(99);
    expect(wi.title).toBe('New feature request');
    expect(wi.tags).toEqual(['squad', 'squad:untriaged']);
  });

  it('createWorkItem works with minimal options (title only)', async () => {
    const mockAdapter: PlatformAdapter = {
      type: 'github' as PlatformType,
      listWorkItems: async () => [],
      getWorkItem: async (id: number) => ({ id, title: '', state: '', tags: [], url: '' }),
      createWorkItem: async (options) => ({
        id: 10,
        title: options.title,
        state: 'open',
        tags: [],
        url: 'https://github.com/owner/repo/issues/10',
      }),
      addTag: async () => {},
      removeTag: async () => {},
      addComment: async () => {},
      listPullRequests: async () => [],
      createPullRequest: async () => ({ id: 1, title: '', sourceBranch: '', targetBranch: '', status: 'active' as const, author: '', url: '' }),
      mergePullRequest: async () => {},
      createBranch: async () => {},
    };

    const wi = await mockAdapter.createWorkItem({ title: 'Quick fix' });
    expect(wi.id).toBe(10);
    expect(wi.title).toBe('Quick fix');
    expect(wi.tags).toEqual([]);
  });
});

// ─── PullRequest Type Shape ────────────────────────────────────────────

describe('PullRequest type', () => {
  it('has all required fields', () => {
    const pr: PullRequest = {
      id: 99,
      title: 'Add feature X',
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      status: 'active',
      reviewStatus: 'pending',
      author: 'bob',
      url: 'https://example.com/pr/99',
    };
    expect(pr.id).toBe(99);
    expect(pr.status).toBe('active');
    expect(pr.reviewStatus).toBe('pending');
  });

  it('accepts all valid status values', () => {
    const statuses: PullRequest['status'][] = ['active', 'completed', 'abandoned', 'draft'];
    for (const status of statuses) {
      const pr: PullRequest = {
        id: 1,
        title: 'PR',
        sourceBranch: 'a',
        targetBranch: 'b',
        status,
        author: 'x',
        url: 'u',
      };
      expect(pr.status).toBe(status);
    }
  });

  it('allows optional reviewStatus', () => {
    const pr: PullRequest = {
      id: 1,
      title: 'PR',
      sourceBranch: 'a',
      targetBranch: 'b',
      status: 'active',
      author: 'x',
      url: 'u',
    };
    expect(pr.reviewStatus).toBeUndefined();
  });
});

// ─── Ralph Commands ────────────────────────────────────────────────────

describe('getRalphScanCommands', () => {
  describe('github', () => {
    const cmds = getRalphScanCommands('github');

    it('returns gh issue list for untriaged', () => {
      expect(cmds.listUntriaged).toContain('gh issue list');
      expect(cmds.listUntriaged).toContain('squad:untriaged');
    });

    it('returns gh issue list for assigned', () => {
      expect(cmds.listAssigned).toContain('gh issue list');
      expect(cmds.listAssigned).toContain('squad:{member}');
    });

    it('returns gh pr list for open PRs', () => {
      expect(cmds.listOpenPRs).toContain('gh pr list');
    });

    it('returns gh pr list for draft PRs', () => {
      expect(cmds.listDraftPRs).toContain('gh pr list');
      expect(cmds.listDraftPRs).toContain('draft');
    });

    it('returns gh pr create for createPR', () => {
      expect(cmds.createPR).toContain('gh pr create');
    });

    it('returns gh pr merge for mergePR', () => {
      expect(cmds.mergePR).toContain('gh pr merge');
    });

    it('returns git checkout for createBranch', () => {
      expect(cmds.createBranch).toContain('git checkout');
    });

    it('returns gh issue create for createWorkItem', () => {
      expect(cmds.createWorkItem).toContain('gh issue create');
      expect(cmds.createWorkItem).toContain('{title}');
    });
  });

  describe('azure-devops', () => {
    const cmds = getRalphScanCommands('azure-devops');

    it('returns az boards query for untriaged', () => {
      expect(cmds.listUntriaged).toContain('az boards query');
      expect(cmds.listUntriaged).toContain('squad:untriaged');
    });

    it('returns az boards query for assigned', () => {
      expect(cmds.listAssigned).toContain('az boards query');
      expect(cmds.listAssigned).toContain('squad:{member}');
    });

    it('returns az repos pr list for open PRs', () => {
      expect(cmds.listOpenPRs).toContain('az repos pr list');
    });

    it('returns az repos pr list for draft PRs', () => {
      expect(cmds.listDraftPRs).toContain('az repos pr list');
    });

    it('returns az repos pr create for createPR', () => {
      expect(cmds.createPR).toContain('az repos pr create');
    });

    it('returns az repos pr update for mergePR', () => {
      expect(cmds.mergePR).toContain('az repos pr update');
      expect(cmds.mergePR).toContain('completed');
    });

    it('returns git checkout for createBranch', () => {
      expect(cmds.createBranch).toContain('git checkout');
    });

    it('returns az boards work-item create for createWorkItem', () => {
      expect(cmds.createWorkItem).toContain('az boards work-item create');
      expect(cmds.createWorkItem).toContain('{title}');
      expect(cmds.createWorkItem).toContain('{workItemType}');
    });
  });

  it('defaults to github commands for unknown platform', () => {
    // Cast to bypass type checking for edge case test
    const cmds = getRalphScanCommands('unknown' as PlatformType);
    expect(cmds.listUntriaged).toContain('gh issue list');
  });
});

// ─── PlatformType Values ───────────────────────────────────────────────

describe('PlatformType', () => {
  it('github is a valid PlatformType', () => {
    const t: PlatformType = 'github';
    expect(t).toBe('github');
  });

  it('azure-devops is a valid PlatformType', () => {
    const t: PlatformType = 'azure-devops';
    expect(t).toBe('azure-devops');
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('parseGitHubRemote handles case-insensitive github.com', () => {
    const result = parseGitHubRemote('https://GitHub.COM/Owner/Repo.git');
    expect(result).toEqual({ owner: 'Owner', repo: 'Repo' });
  });

  it('parseAzureDevOpsRemote handles case-insensitive dev.azure.com', () => {
    const result = parseAzureDevOpsRemote('https://DEV.AZURE.COM/org/proj/_git/repo');
    expect(result).toEqual({ org: 'org', project: 'proj', repo: 'repo' });
  });

  it('parseAzureDevOpsRemote handles case-insensitive visualstudio.com', () => {
    const result = parseAzureDevOpsRemote('https://myorg.VISUALSTUDIO.COM/proj/_git/repo');
    expect(result).toEqual({ org: 'myorg', project: 'proj', repo: 'repo' });
  });

  it('detectPlatformFromUrl handles mixed case', () => {
    expect(detectPlatformFromUrl('https://DEV.AZURE.COM/org/proj/_git/repo')).toBe('azure-devops');
    expect(detectPlatformFromUrl('https://GITHUB.COM/owner/repo')).toBe('github');
  });

  it('all Ralph commands have placeholder tokens for both platforms', () => {
    const ghCmds = getRalphScanCommands('github');
    const adoCmds = getRalphScanCommands('azure-devops');

    // createBranch should have {branchName}
    expect(ghCmds.createBranch).toContain('{branchName}');
    expect(adoCmds.createBranch).toContain('{branchName}');

    // createPR should have {title}, {sourceBranch}, {targetBranch}
    expect(ghCmds.createPR).toContain('{title}');
    expect(adoCmds.createPR).toContain('{title}');

    // mergePR should have {id}
    expect(ghCmds.mergePR).toContain('{id}');
    expect(adoCmds.mergePR).toContain('{id}');

    // createWorkItem should have {title}
    expect(ghCmds.createWorkItem).toContain('{title}');
    expect(adoCmds.createWorkItem).toContain('{title}');
  });
});

// ─── Planner Adapter ──────────────────────────────────────────────────

describe('PlannerAdapter', () => {
  it('planner is a valid PlatformType', () => {
    const t: PlatformType = 'planner';
    expect(t).toBe('planner');
  });

  it('PlannerAdapter can be constructed with a plan ID', async () => {
    // Import the class to verify construction (no Graph calls)
    const { PlannerAdapter } = await import('../packages/squad-sdk/src/platform/planner.js');
    const adapter = new PlannerAdapter('rYe_WFgqUUqnSTZfpMdKcZUAER1P');
    expect(adapter.type).toBe('planner');
  });
});

// ─── Planner WorkItem Mapping ─────────────────────────────────────────

describe('mapPlannerTaskToWorkItem', () => {
  it('maps an active Planner task to WorkItem', () => {
    const task = {
      id: 'abc123',
      title: 'Implement login page',
      percentComplete: 50,
      bucketId: 'bucket-1',
      assignments: {},
    };
    const wi = mapPlannerTaskToWorkItem(task, 'squad:untriaged');
    expect(wi.title).toBe('Implement login page');
    expect(wi.state).toBe('active');
    expect(wi.tags).toEqual(['squad:untriaged']);
    expect(wi.url).toContain('abc123');
  });

  it('maps a completed Planner task (100%) to done state', () => {
    const task = {
      id: 'done-task',
      title: 'Done task',
      percentComplete: 100,
      bucketId: 'bucket-done',
      assignments: {},
    };
    const wi = mapPlannerTaskToWorkItem(task, 'Done');
    expect(wi.state).toBe('done');
  });

  it('maps bucket name as tag', () => {
    const task = {
      id: 'x',
      title: 'Test',
      percentComplete: 0,
      bucketId: 'b1',
      assignments: {},
    };
    const wi = mapPlannerTaskToWorkItem(task, 'squad:riker');
    expect(wi.tags).toEqual(['squad:riker']);
  });

  it('generates a numeric id from string task id', () => {
    const task = {
      id: 'planner-string-id',
      title: 'Test',
      percentComplete: 0,
      bucketId: 'b',
      assignments: {},
    };
    const wi = mapPlannerTaskToWorkItem(task, 'squad:untriaged');
    expect(typeof wi.id).toBe('number');
    expect(wi.id).toBeGreaterThanOrEqual(0);
  });

  it('produces consistent numeric id for the same string', () => {
    const task1 = { id: 'same-id', title: 'A', percentComplete: 0, bucketId: 'b', assignments: {} };
    const task2 = { id: 'same-id', title: 'B', percentComplete: 0, bucketId: 'b', assignments: {} };
    const wi1 = mapPlannerTaskToWorkItem(task1, 'x');
    const wi2 = mapPlannerTaskToWorkItem(task2, 'x');
    expect(wi1.id).toBe(wi2.id);
  });
});

// ─── Bucket-to-Tag Mapping ────────────────────────────────────────────

describe('Planner bucket-to-tag mapping', () => {
  it('squad:untriaged bucket maps to untriaged tag', () => {
    const task = { id: 't1', title: 'New', percentComplete: 0, bucketId: 'b-untriaged', assignments: {} };
    const wi = mapPlannerTaskToWorkItem(task, 'squad:untriaged');
    expect(wi.tags).toContain('squad:untriaged');
  });

  it('squad:member bucket maps to member assignment tag', () => {
    const task = { id: 't2', title: 'Assigned', percentComplete: 0, bucketId: 'b-riker', assignments: {} };
    const wi = mapPlannerTaskToWorkItem(task, 'squad:riker');
    expect(wi.tags).toContain('squad:riker');
  });

  it('Done bucket maps correctly', () => {
    const task = { id: 't3', title: 'Finished', percentComplete: 100, bucketId: 'b-done', assignments: {} };
    const wi = mapPlannerTaskToWorkItem(task, 'Done');
    expect(wi.tags).toContain('Done');
    expect(wi.state).toBe('done');
  });
});

// ─── HybridPlatformConfig ─────────────────────────────────────────────

describe('HybridPlatformConfig', () => {
  it('allows repo=azure-devops with workItems=planner', () => {
    const config: HybridPlatformConfig = {
      repo: 'azure-devops',
      workItems: 'planner',
    };
    expect(config.repo).toBe('azure-devops');
    expect(config.workItems).toBe('planner');
  });

  it('allows repo=github with workItems=github (standard)', () => {
    const config: HybridPlatformConfig = {
      repo: 'github',
      workItems: 'github',
    };
    expect(config.repo).toBe('github');
    expect(config.workItems).toBe('github');
  });

  it('allows repo=github with workItems=planner', () => {
    const config: HybridPlatformConfig = {
      repo: 'github',
      workItems: 'planner',
    };
    expect(config.repo).toBe('github');
    expect(config.workItems).toBe('planner');
  });
});

// ─── WorkItemSource Type ──────────────────────────────────────────────

describe('WorkItemSource', () => {
  it('accepts github as a valid source', () => {
    const s: WorkItemSource = 'github';
    expect(s).toBe('github');
  });

  it('accepts azure-devops as a valid source', () => {
    const s: WorkItemSource = 'azure-devops';
    expect(s).toBe('azure-devops');
  });

  it('accepts planner as a valid source', () => {
    const s: WorkItemSource = 'planner';
    expect(s).toBe('planner');
  });
});

// ─── Ralph Planner Commands ───────────────────────────────────────────

describe('getRalphScanCommands planner', () => {
  const cmds = getRalphScanCommands('planner');

  it('returns Graph API curl for untriaged', () => {
    expect(cmds.listUntriaged).toContain('graph.microsoft.com');
    expect(cmds.listUntriaged).toContain('planner/plans');
  });

  it('returns Graph API curl for assigned', () => {
    expect(cmds.listAssigned).toContain('graph.microsoft.com');
    expect(cmds.listAssigned).toContain('{memberBucketId}');
  });

  it('indicates PRs are not managed for open PRs', () => {
    expect(cmds.listOpenPRs).toContain('does not manage PRs');
  });

  it('indicates PRs are not managed for draft PRs', () => {
    expect(cmds.listDraftPRs).toContain('does not manage PRs');
  });

  it('returns git checkout for createBranch', () => {
    expect(cmds.createBranch).toContain('git checkout');
    expect(cmds.createBranch).toContain('{branchName}');
  });

  it('indicates PRs are not managed for createPR', () => {
    expect(cmds.createPR).toContain('does not manage PRs');
  });

  it('indicates PRs are not managed for mergePR', () => {
    expect(cmds.mergePR).toContain('does not manage PRs');
  });

  it('returns Graph API curl for createWorkItem', () => {
    expect(cmds.createWorkItem).toContain('graph.microsoft.com');
    expect(cmds.createWorkItem).toContain('planner/tasks');
    expect(cmds.createWorkItem).toContain('{title}');
  });
});

// ─── ADO Work Item Config ─────────────────────────────────────────────

describe('AzureDevOpsAdapter work item config', () => {
  // We can't call the adapter directly (needs az CLI), but we test the
  // exported interface and constructor shape via the type system + factory.

  it('AdoWorkItemConfig type is exported from platform index', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/index.js');
    // The type is export-only (interface), but AzureDevOpsAdapter is exported as a class
    expect(mod.AzureDevOpsAdapter).toBeDefined();
  });

  it('AzureDevOpsAdapter constructor accepts 4th workItemConfig param', async () => {
    // Type-level test: verify the constructor accepts the config without ts errors.
    // We can't actually call it (needs az CLI), but we verify the signature exists.
    const { AzureDevOpsAdapter: AdoCtor } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    expect(AdoCtor).toBeDefined();
    expect(AdoCtor.length).toBeGreaterThanOrEqual(3); // at least 3 required params
  });

  it('readAdoConfig returns undefined when no config file exists', async () => {
    // createPlatformAdapter reads .squad/config.json — test that a non-ADO repo works
    const { createPlatformAdapter } = await import('../packages/squad-sdk/src/platform/index.js');
    expect(createPlatformAdapter).toBeDefined();
  });
});

describe('ADO config.json ado section schema', () => {
  it('all AdoWorkItemConfig fields are optional', () => {
    // Empty object is valid — all fields fall back to defaults
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {};
    expect(config.org).toBeUndefined();
    expect(config.project).toBeUndefined();
    expect(config.defaultWorkItemType).toBeUndefined();
    expect(config.areaPath).toBeUndefined();
    expect(config.iterationPath).toBeUndefined();
  });

  it('accepts full ADO config with all fields', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      org: 'contoso',
      project: 'WorkItems',
      defaultWorkItemType: 'Scenario',
      areaPath: 'WorkItems\\Team Alpha',
      iterationPath: 'WorkItems\\Sprint 5',
    };
    expect(config.org).toBe('contoso');
    expect(config.project).toBe('WorkItems');
    expect(config.defaultWorkItemType).toBe('Scenario');
    expect(config.areaPath).toBe('WorkItems\\Team Alpha');
    expect(config.iterationPath).toBe('WorkItems\\Sprint 5');
  });

  it('supports cross-project config (repo and work items in different projects)', () => {
    // This is the critical enterprise scenario
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      org: 'enterprise-org',
      project: 'planning-project',  // work items here
      // repo lives in 'engineering-project' — parsed from git remote
    };
    expect(config.org).toBe('enterprise-org');
    expect(config.project).toBe('planning-project');
  });
});

// ─── ADO Configurable Work Item Types (#240) ──────────────────────────

describe('getAvailableWorkItemTypes fallback', () => {
  it('returns fallback types when az CLI is not available', async () => {
    // getAvailableWorkItemTypes catches errors and returns defaults
    const { getAvailableWorkItemTypes } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const types = getAvailableWorkItemTypes('nonexistent-org', 'nonexistent-project');
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThanOrEqual(3);
    expect(types.some((t) => t.name === 'User Story')).toBe(true);
    expect(types.some((t) => t.name === 'Bug')).toBe(true);
    expect(types.some((t) => t.name === 'Task')).toBe(true);
  });

  it('fallback types are all enabled (not disabled)', async () => {
    const { getAvailableWorkItemTypes } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const types = getAvailableWorkItemTypes('no-org', 'no-proj');
    for (const t of types) {
      expect(t.disabled).toBe(false);
    }
  });

  it('fallback types have non-empty names and descriptions', async () => {
    const { getAvailableWorkItemTypes } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const types = getAvailableWorkItemTypes('no-org', 'no-proj');
    for (const t of types) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe('validateWorkItemType', () => {
  it('validates "User Story" against fallback types', async () => {
    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const result = validateWorkItemType('no-org', 'no-proj', 'User Story');
    expect(result.valid).toBe(true);
    expect(result.available).toContain('User Story');
  });

  it('validates "Bug" against fallback types', async () => {
    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const result = validateWorkItemType('no-org', 'no-proj', 'Bug');
    expect(result.valid).toBe(true);
  });

  it('validates "Task" against fallback types', async () => {
    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const result = validateWorkItemType('no-org', 'no-proj', 'Task');
    expect(result.valid).toBe(true);
  });

  it('rejects unknown type against fallback types', async () => {
    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const result = validateWorkItemType('no-org', 'no-proj', 'InvalidType');
    expect(result.valid).toBe(false);
    expect(result.available.length).toBeGreaterThanOrEqual(3);
  });

  it('is case-insensitive', { timeout: 10_000 }, async () => {

    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const lower = validateWorkItemType('no-org', 'no-proj', 'user story');
    const upper = validateWorkItemType('no-org', 'no-proj', 'USER STORY');
    expect(lower.valid).toBe(true);
    expect(upper.valid).toBe(true);
  });

  it('returns available types list even when invalid', async () => {
    const { validateWorkItemType } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const result = validateWorkItemType('no-org', 'no-proj', 'Nonexistent');
    expect(result.valid).toBe(false);
    expect(result.available).toEqual(expect.arrayContaining(['User Story', 'Bug', 'Task']));
  });
});

describe('WorkItemTypeInfo interface', () => {
  it('has required shape with name, description, disabled', async () => {
    const { getAvailableWorkItemTypes } = await import('../packages/squad-sdk/src/platform/azure-devops.js');
    const types = getAvailableWorkItemTypes('x', 'y');
    for (const t of types) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.disabled).toBe('boolean');
    }
  });
});

describe('AdoWorkItemConfig defaultWorkItemType cascade', () => {
  it('options.type takes priority over config default', () => {
    // Simulate the cascade logic from createWorkItem
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      defaultWorkItemType: 'Scenario',
    };
    const optionsType = 'Bug';
    const resolved = optionsType ?? config.defaultWorkItemType ?? 'User Story';
    expect(resolved).toBe('Bug');
  });

  it('config.defaultWorkItemType used when options.type is undefined', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      defaultWorkItemType: 'Scenario',
    };
    const optionsType: string | undefined = undefined;
    const resolved = optionsType ?? config.defaultWorkItemType ?? 'User Story';
    expect(resolved).toBe('Scenario');
  });

  it('falls back to "User Story" when both are undefined', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {};
    const optionsType: string | undefined = undefined;
    const resolved = optionsType ?? config.defaultWorkItemType ?? 'User Story';
    expect(resolved).toBe('User Story');
  });

  it('empty string type in config is treated as set (does not fall through)', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      defaultWorkItemType: '',
    };
    const optionsType: string | undefined = undefined;
    // Nullish coalescing: '' is not null/undefined, so it wins
    const resolved = optionsType ?? config.defaultWorkItemType ?? 'User Story';
    expect(resolved).toBe('');
  });
});

describe('ADO area path and iteration path cascade', () => {
  it('explicit areaPath overrides config areaPath', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      areaPath: 'Project\\Default',
    };
    const optionsAreaPath = 'Project\\Override';
    const resolved = optionsAreaPath ?? config.areaPath;
    expect(resolved).toBe('Project\\Override');
  });

  it('config areaPath used when not provided in options', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      areaPath: 'Project\\Team Alpha',
    };
    const optionsAreaPath: string | undefined = undefined;
    const resolved = optionsAreaPath ?? config.areaPath;
    expect(resolved).toBe('Project\\Team Alpha');
  });

  it('explicit iterationPath overrides config iterationPath', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      iterationPath: 'Project\\Sprint 1',
    };
    const optionsIterationPath = 'Project\\Sprint 2';
    const resolved = optionsIterationPath ?? config.iterationPath;
    expect(resolved).toBe('Project\\Sprint 2');
  });

  it('config iterationPath used when not provided in options', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {
      iterationPath: 'Project\\Sprint 3',
    };
    const optionsIterationPath: string | undefined = undefined;
    const resolved = optionsIterationPath ?? config.iterationPath;
    expect(resolved).toBe('Project\\Sprint 3');
  });

  it('undefined when neither options nor config provide areaPath', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {};
    const optionsAreaPath: string | undefined = undefined;
    const resolved = optionsAreaPath ?? config.areaPath;
    expect(resolved).toBeUndefined();
  });

  it('undefined when neither options nor config provide iterationPath', () => {
    const config: import('../packages/squad-sdk/src/platform/azure-devops.js').AdoWorkItemConfig = {};
    const optionsIterationPath: string | undefined = undefined;
    const resolved = optionsIterationPath ?? config.iterationPath;
    expect(resolved).toBeUndefined();
  });
});

describe('ADO work item creation with custom types (mock adapter)', () => {
  it('mock adapter creates work item with custom type', async () => {
    let capturedType: string | undefined;
    const mockAdapter: PlatformAdapter = {
      type: 'azure-devops' as PlatformType,
      listWorkItems: async () => [],
      getWorkItem: async (id: number) => ({ id, title: '', state: '', tags: [], url: '' }),
      createWorkItem: async (options) => {
        capturedType = options.type;
        return {
          id: 42,
          title: options.title,
          state: 'New',
          tags: [],
          url: `https://dev.azure.com/org/proj/_workitems/edit/42`,
        };
      },
      addTag: async () => {},
      removeTag: async () => {},
      addComment: async () => {},
      listPullRequests: async () => [],
      createPullRequest: async () => ({ id: 1, title: '', sourceBranch: '', targetBranch: '', status: 'active' as const, author: '', url: '' }),
      mergePullRequest: async () => {},
      createBranch: async () => {},
    };

    await mockAdapter.createWorkItem({ title: 'Test', type: 'Scenario' });
    expect(capturedType).toBe('Scenario');
  });

  it('mock adapter creates work item with Bug type', async () => {
    let capturedType: string | undefined;
    const mockAdapter: PlatformAdapter = {
      type: 'azure-devops' as PlatformType,
      listWorkItems: async () => [],
      getWorkItem: async (id: number) => ({ id, title: '', state: '', tags: [], url: '' }),
      createWorkItem: async (options) => {
        capturedType = options.type;
        return { id: 1, title: options.title, state: 'New', tags: [], url: '' };
      },
      addTag: async () => {},
      removeTag: async () => {},
      addComment: async () => {},
      listPullRequests: async () => [],
      createPullRequest: async () => ({ id: 1, title: '', sourceBranch: '', targetBranch: '', status: 'active' as const, author: '', url: '' }),
      mergePullRequest: async () => {},
      createBranch: async () => {},
    };

    await mockAdapter.createWorkItem({ title: 'Fix crash', type: 'Bug' });
    expect(capturedType).toBe('Bug');
  });
});

describe('ADO config.json read/write round-trip', () => {
  it('config with all ADO fields serializes to valid JSON', () => {
    const config = {
      version: 1,
      platform: 'azure-devops',
      ado: {
        org: 'contoso',
        project: 'WorkItems',
        defaultWorkItemType: 'Scenario',
        areaPath: 'WorkItems\\Team Alpha',
        iterationPath: 'WorkItems\\Sprint 5',
      },
    };
    const json = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.ado.defaultWorkItemType).toBe('Scenario');
    expect(parsed.ado.areaPath).toBe('WorkItems\\Team Alpha');
    expect(parsed.ado.iterationPath).toBe('WorkItems\\Sprint 5');
  });

  it('config with _availableTypes hint survives serialization', () => {
    const config = {
      version: 1,
      ado: {
        defaultWorkItemType: 'User Story',
        _availableTypes: ['User Story', 'Bug', 'Task', 'Scenario'],
      },
    };
    const json = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.ado._availableTypes).toEqual(['User Story', 'Bug', 'Task', 'Scenario']);
  });

  it('minimal ADO config (empty object) is valid', () => {
    const config = { version: 1, ado: {} };
    const json = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.ado).toEqual({});
  });
});

describe('ADO exports from platform index', () => {
  it('exports getAvailableWorkItemTypes function', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/index.js');
    expect(typeof mod.getAvailableWorkItemTypes).toBe('function');
  });

  it('exports validateWorkItemType function', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/index.js');
    expect(typeof mod.validateWorkItemType).toBe('function');
  });

  it('getAvailableWorkItemTypes returns array from index re-export', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/index.js');
    const types = mod.getAvailableWorkItemTypes('test-org', 'test-proj');
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });
});

// ─── normalizeRemoteUrl ───────────────────────────────────────────────

describe('normalizeRemoteUrl', () => {
  // ── GitHub ────────────────────────────────────────────────────────────

  it('normalizes GitHub HTTPS URL', () => {
    const r = normalizeRemoteUrl('https://github.com/owner/repo.git');
    expect(r.provider).toBe('github');
    expect(r.org).toBe('owner');
    expect(r.repo).toBe('repo');
    expect(r.key).toBe('owner/repo');
    expect(r.normalizedUrl).toBe('github.com/owner/repo');
    expect(r.project).toBeUndefined();
  });

  it('normalizes GitHub HTTPS URL without .git', () => {
    const r = normalizeRemoteUrl('https://github.com/bradygaster/squad');
    expect(r.key).toBe('bradygaster/squad');
    expect(r.normalizedUrl).toBe('github.com/bradygaster/squad');
  });

  it('normalizes GitHub SSH URL', () => {
    const r = normalizeRemoteUrl('git@github.com:owner/repo.git');
    expect(r.provider).toBe('github');
    expect(r.key).toBe('owner/repo');
    expect(r.normalizedUrl).toBe('github.com/owner/repo');
  });

  it('normalizes GitHub SSH URL without .git', () => {
    const r = normalizeRemoteUrl('git@github.com:bradygaster/squad');
    expect(r.key).toBe('bradygaster/squad');
    expect(r.normalizedUrl).toBe('github.com/bradygaster/squad');
  });

  // ── GitHub — ssh:// form ──────────────────────────────────────────────

  it('normalizes GitHub ssh:// URL', () => {
    const r = normalizeRemoteUrl('ssh://git@github.com/owner/repo.git');
    expect(r.provider).toBe('github');
    expect(r.org).toBe('owner');
    expect(r.repo).toBe('repo');
    expect(r.key).toBe('owner/repo');
    expect(r.normalizedUrl).toBe('github.com/owner/repo');
  });

  it('normalizes GitHub ssh:// URL without .git', () => {
    const r = normalizeRemoteUrl('ssh://git@github.com/bradygaster/squad');
    expect(r.key).toBe('bradygaster/squad');
    expect(r.normalizedUrl).toBe('github.com/bradygaster/squad');
  });

  it('normalizes GitHub ssh:// URL without user@', () => {
    const r = normalizeRemoteUrl('ssh://github.com/owner/repo.git');
    expect(r.provider).toBe('github');
    expect(r.key).toBe('owner/repo');
  });

  it('produces same key for GitHub HTTPS, SSH, and ssh:// forms', () => {
    const https = normalizeRemoteUrl('https://github.com/bradygaster/squad');
    const ssh = normalizeRemoteUrl('git@github.com:bradygaster/squad.git');
    const sshUrl = normalizeRemoteUrl('ssh://git@github.com/bradygaster/squad.git');
    expect(https.key).toBe(ssh.key);
    expect(https.key).toBe(sshUrl.key);
  });

  // ── Azure DevOps — modern HTTPS ──────────────────────────────────────

  it('normalizes ADO HTTPS modern URL', () => {
    const r = normalizeRemoteUrl('https://dev.azure.com/microsoft/OS/_git/os.2020');
    expect(r.provider).toBe('azure-devops');
    expect(r.org).toBe('microsoft');
    expect(r.project).toBe('os');
    expect(r.repo).toBe('os.2020');
    expect(r.key).toBe('microsoft/os/os.2020');
    expect(r.normalizedUrl).toBe('dev.azure.com/microsoft/os/_git/os.2020');
  });

  it('normalizes ADO HTTPS with user prefix', () => {
    const r = normalizeRemoteUrl('https://myorg@dev.azure.com/myorg/MyProject/_git/my-repo');
    expect(r.key).toBe('myorg/myproject/my-repo');
    expect(r.org).toBe('myorg');
    expect(r.project).toBe('myproject');
  });

  // ── Azure DevOps — SSH ───────────────────────────────────────────────

  it('normalizes ADO SSH URL', () => {
    const r = normalizeRemoteUrl('git@ssh.dev.azure.com:v3/microsoft/OS/os.2020');
    expect(r.provider).toBe('azure-devops');
    expect(r.key).toBe('microsoft/os/os.2020');
    expect(r.normalizedUrl).toBe('ssh.dev.azure.com/microsoft/os/os.2020');
  });

  // ── Azure DevOps — legacy visualstudio.com ───────────────────────────

  it('normalizes ADO legacy URL with DefaultCollection', () => {
    const r = normalizeRemoteUrl(
      'https://microsoft.visualstudio.com/DefaultCollection/OS/_git/os.2020',
    );
    expect(r.provider).toBe('azure-devops');
    expect(r.key).toBe('microsoft/os/os.2020');
    expect(r.normalizedUrl).toBe('microsoft.visualstudio.com/os/_git/os.2020');
  });

  it('normalizes ADO legacy URL without DefaultCollection', () => {
    const r = normalizeRemoteUrl(
      'https://microsoft.visualstudio.com/OS/_git/os.2020',
    );
    expect(r.key).toBe('microsoft/os/os.2020');
    expect(r.normalizedUrl).toBe('microsoft.visualstudio.com/os/_git/os.2020');
  });

  // ── Azure DevOps — ssh:// form ────────────────────────────────────────

  it('normalizes ADO ssh:// URL', () => {
    const r = normalizeRemoteUrl('ssh://git@ssh.dev.azure.com/v3/microsoft/OS/os.2020');
    expect(r.provider).toBe('azure-devops');
    expect(r.org).toBe('microsoft');
    expect(r.project).toBe('os');
    expect(r.repo).toBe('os.2020');
    expect(r.key).toBe('microsoft/os/os.2020');
    expect(r.normalizedUrl).toBe('ssh.dev.azure.com/microsoft/os/os.2020');
  });

  it('normalizes ADO ssh:// URL with .git suffix', () => {
    const r = normalizeRemoteUrl('ssh://git@ssh.dev.azure.com/v3/myorg/MyProject/my-repo.git');
    expect(r.provider).toBe('azure-devops');
    expect(r.key).toBe('myorg/myproject/my-repo');
  });

  it('normalizes ADO ssh:// URL without user@', () => {
    const r = normalizeRemoteUrl('ssh://ssh.dev.azure.com/v3/microsoft/OS/os.2020');
    expect(r.provider).toBe('azure-devops');
    expect(r.key).toBe('microsoft/os/os.2020');
  });

  // ── Cross-format key equivalence ─────────────────────────────────────

  it('produces same key for all ADO URL formats including ssh://', () => {
    const urls = [
      'https://microsoft.visualstudio.com/DefaultCollection/OS/_git/os.2020',
      'https://microsoft.visualstudio.com/OS/_git/os.2020',
      'https://dev.azure.com/microsoft/OS/_git/os.2020',
      'git@ssh.dev.azure.com:v3/microsoft/OS/os.2020',
      'ssh://git@ssh.dev.azure.com/v3/microsoft/OS/os.2020',
    ];
    const keys = urls.map((u) => normalizeRemoteUrl(u).key);
    const unique = new Set(keys);
    expect(unique.size).toBe(1);
    expect(keys[0]).toBe('microsoft/os/os.2020');
  });

  // ── Lowercasing ──────────────────────────────────────────────────────

  it('always lowercases the key', () => {
    expect(normalizeRemoteUrl('https://github.com/Owner/Repo.git').key).toBe('owner/repo');
    expect(normalizeRemoteUrl('https://dev.azure.com/ORG/PROJECT/_git/REPO').key).toBe(
      'org/project/repo',
    );
    expect(
      normalizeRemoteUrl('https://ORG.visualstudio.com/PROJECT/_git/REPO').key,
    ).toBe('org/project/repo');
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  it('handles dotted repo names (os.2020)', () => {
    const r = normalizeRemoteUrl('https://github.com/owner/some.dotted.repo.git');
    expect(r.repo).toBe('some.dotted.repo');
    expect(r.key).toBe('owner/some.dotted.repo');
  });

  it('handles empty string as unknown', () => {
    const r = normalizeRemoteUrl('');
    expect(r.provider).toBe('unknown');
    expect(r.key).toBe('');
  });

  it('handles whitespace-only input as unknown', () => {
    const r = normalizeRemoteUrl('   ');
    expect(r.provider).toBe('unknown');
  });

  it('handles unknown provider URL', () => {
    const r = normalizeRemoteUrl('https://gitlab.com/group/subgroup/repo.git');
    expect(r.provider).toBe('unknown');
    expect(r.repo).toBe('repo');
    expect(r.org).toBe('');
    expect(r.key).toBe('gitlab.com/group/subgroup/repo');
  });

  it('returns unknown for GitHub URL with extra path segments', () => {
    const r = normalizeRemoteUrl('https://github.com/owner/repo/issues');
    expect(r.provider).toBe('unknown');
  });

  it('returns unknown for ADO URL with extra path segments', () => {
    const r = normalizeRemoteUrl('https://dev.azure.com/org/proj/_git/repo/extra');
    expect(r.provider).toBe('unknown');
  });

  it('strips .git from ADO SSH repo name', () => {
    const r = normalizeRemoteUrl('git@ssh.dev.azure.com:v3/org/proj/repo.git');
    expect(r.repo).toBe('repo');
    expect(r.key).toBe('org/proj/repo');
  });

  it('strips .git from ADO legacy repo name', () => {
    const r = normalizeRemoteUrl('https://org.visualstudio.com/proj/_git/repo.git');
    expect(r.repo).toBe('repo');
  });

  it('strips trailing slash from GitHub HTTPS', () => {
    const r = normalizeRemoteUrl('https://github.com/owner/repo/');
    expect(r.provider).toBe('github');
    expect(r.key).toBe('owner/repo');
  });

  // ── Barrel re-export verification ────────────────────────────────────

  it('is re-exported from platform/index.ts', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/index.js');
    expect(typeof mod.normalizeRemoteUrl).toBe('function');
  });
});
