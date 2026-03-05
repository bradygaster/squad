/**
 * Platform-agnostic interfaces for multi-platform support.
 * Allows Squad to work with GitHub and Azure DevOps interchangeably.
 *
 * @module platform/types
 */

export type PlatformType = 'github' | 'azure-devops' | 'planner';

/** Where work items are tracked — may differ from where code lives */
export type WorkItemSource = 'github' | 'azure-devops' | 'planner';

/** Hybrid config: repo on one platform, work items on another */
export interface HybridPlatformConfig {
  repo: PlatformType;
  workItems: WorkItemSource;
}

/** Normalized work item — maps to GitHub Issues or ADO Work Items */
export interface WorkItem {
  id: number;
  title: string;
  state: string;
  tags: string[];
  assignedTo?: string;
  url: string;
}

/** Normalized pull request — maps to GitHub PRs or ADO PRs */
export interface PullRequest {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'active' | 'completed' | 'abandoned' | 'draft';
  reviewStatus?: 'approved' | 'changes-requested' | 'pending';
  author: string;
  url: string;
}

/** Platform adapter interface — implemented by GitHub and ADO adapters */
export interface PlatformAdapter {
  readonly type: PlatformType;

  // Work Items / Issues
  listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]>;
  getWorkItem(id: number): Promise<WorkItem>;
  createWorkItem(options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string }): Promise<WorkItem>;
  addTag(workItemId: number, tag: string): Promise<void>;
  removeTag(workItemId: number, tag: string): Promise<void>;
  addComment(workItemId: number, comment: string): Promise<void>;

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
