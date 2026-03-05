/**
 * Platform adapter tests — detection, parsing, commands, and type mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPlatformFromUrl,
  parseGitHubRemote,
  parseAzureDevOpsRemote,
} from '../packages/squad-sdk/src/platform/detect.js';
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
