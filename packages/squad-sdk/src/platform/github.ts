/**
 * GitHub platform adapter — wraps gh CLI for issue/PR/branch operations.
 *
 * @module platform/github
 */

import { execSync } from 'node:child_process';
import type { PlatformAdapter, PlatformType, WorkItem, PullRequest } from './types.js';

export class GitHubAdapter implements PlatformAdapter {
  readonly type: PlatformType = 'github';

  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  private get repoFlag(): string {
    return `${this.owner}/${this.repo}`;
  }

  private exec(cmd: string): string {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }

  async listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]> {
    const args = ['gh', 'issue', 'list', '--repo', this.repoFlag, '--json', 'number,title,state,labels,assignees,url'];
    if (options.state) args.push('--state', options.state);
    if (options.limit) args.push('--limit', String(options.limit));
    if (options.tags?.length) {
      for (const tag of options.tags) {
        args.push('--label', tag);
      }
    }

    const output = this.exec(args.join(' '));
    const issues = JSON.parse(output) as Array<{
      number: number;
      title: string;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      url: string;
    }>;

    return issues.map((issue) => ({
      id: issue.number,
      title: issue.title,
      state: issue.state.toLowerCase(),
      tags: issue.labels.map((l) => l.name),
      assignedTo: issue.assignees[0]?.login,
      url: issue.url,
    }));
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    const output = this.exec(
      `gh issue view ${id} --repo ${this.repoFlag} --json number,title,state,labels,assignees,url`,
    );
    const issue = JSON.parse(output) as {
      number: number;
      title: string;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      url: string;
    };

    return {
      id: issue.number,
      title: issue.title,
      state: issue.state.toLowerCase(),
      tags: issue.labels.map((l) => l.name),
      assignedTo: issue.assignees[0]?.login,
      url: issue.url,
    };
  }

  async createWorkItem(options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string }): Promise<WorkItem> {
    const args = [
      'gh', 'issue', 'create',
      '--repo', this.repoFlag,
      '--title', `"${options.title.replace(/"/g, '\\"')}"`,
      '--json', 'number,title,state,labels,assignees,url',
    ];
    if (options.description) {
      args.push('--body', `"${options.description.replace(/"/g, '\\"')}"`);
    }
    if (options.tags?.length) {
      for (const tag of options.tags) {
        args.push('--label', `"${tag}"`);
      }
    }
    if (options.assignedTo) {
      args.push('--assignee', options.assignedTo);
    }

    const output = this.exec(args.join(' '));
    const issue = JSON.parse(output) as {
      number: number;
      title: string;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
      url: string;
    };

    return {
      id: issue.number,
      title: issue.title,
      state: issue.state.toLowerCase(),
      tags: issue.labels.map((l) => l.name),
      assignedTo: issue.assignees[0]?.login,
      url: issue.url,
    };
  }

  async addTag(workItemId: number, tag: string): Promise<void> {
    this.exec(`gh issue edit ${workItemId} --repo ${this.repoFlag} --add-label "${tag}"`);
  }

  async removeTag(workItemId: number, tag: string): Promise<void> {
    this.exec(`gh issue edit ${workItemId} --repo ${this.repoFlag} --remove-label "${tag}"`);
  }

  async addComment(workItemId: number, comment: string): Promise<void> {
    this.exec(`gh issue comment ${workItemId} --repo ${this.repoFlag} --body "${comment.replace(/"/g, '\\"')}"`);
  }

  async listPullRequests(options: { status?: string; limit?: number }): Promise<PullRequest[]> {
    const args = ['gh', 'pr', 'list', '--repo', this.repoFlag, '--json', 'number,title,headRefName,baseRefName,state,isDraft,reviewDecision,author,url'];
    if (options.status) args.push('--state', options.status);
    if (options.limit) args.push('--limit', String(options.limit));

    const output = this.exec(args.join(' '));
    const prs = JSON.parse(output) as Array<{
      number: number;
      title: string;
      headRefName: string;
      baseRefName: string;
      state: string;
      isDraft: boolean;
      reviewDecision: string;
      author: { login: string };
      url: string;
    }>;

    return prs.map((pr) => ({
      id: pr.number,
      title: pr.title,
      sourceBranch: pr.headRefName,
      targetBranch: pr.baseRefName,
      status: mapGitHubPrStatus(pr.state, pr.isDraft),
      reviewStatus: mapGitHubReviewStatus(pr.reviewDecision),
      author: pr.author.login,
      url: pr.url,
    }));
  }

  async createPullRequest(options: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
  }): Promise<PullRequest> {
    const args = [
      'gh', 'pr', 'create',
      '--repo', this.repoFlag,
      '--head', options.sourceBranch,
      '--base', options.targetBranch,
      '--title', `"${options.title.replace(/"/g, '\\"')}"`,
      '--json', 'number,title,headRefName,baseRefName,state,isDraft,reviewDecision,author,url',
    ];
    if (options.description) {
      args.push('--body', `"${options.description.replace(/"/g, '\\"')}"`);
    }

    const output = this.exec(args.join(' '));
    const pr = JSON.parse(output) as {
      number: number;
      title: string;
      headRefName: string;
      baseRefName: string;
      state: string;
      isDraft: boolean;
      reviewDecision: string;
      author: { login: string };
      url: string;
    };

    return {
      id: pr.number,
      title: pr.title,
      sourceBranch: pr.headRefName,
      targetBranch: pr.baseRefName,
      status: mapGitHubPrStatus(pr.state, pr.isDraft),
      reviewStatus: mapGitHubReviewStatus(pr.reviewDecision),
      author: pr.author.login,
      url: pr.url,
    };
  }

  async mergePullRequest(id: number): Promise<void> {
    this.exec(`gh pr merge ${id} --repo ${this.repoFlag} --merge`);
  }

  async createBranch(name: string, fromBranch?: string): Promise<void> {
    const base = fromBranch ?? 'main';
    this.exec(`git checkout ${base} && git pull && git checkout -b ${name}`);
  }
}

function mapGitHubPrStatus(state: string, isDraft: boolean): PullRequest['status'] {
  if (isDraft) return 'draft';
  switch (state.toUpperCase()) {
    case 'OPEN': return 'active';
    case 'CLOSED': return 'abandoned';
    case 'MERGED': return 'completed';
    default: return 'active';
  }
}

function mapGitHubReviewStatus(decision: string): PullRequest['reviewStatus'] {
  switch (decision?.toUpperCase()) {
    case 'APPROVED': return 'approved';
    case 'CHANGES_REQUESTED': return 'changes-requested';
    case 'REVIEW_REQUIRED': return 'pending';
    default: return undefined;
  }
}
