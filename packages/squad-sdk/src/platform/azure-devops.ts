/**
 * Azure DevOps platform adapter — wraps az CLI for work item/PR/branch operations.
 *
 * @module platform/azure-devops
 */

import { execSync } from 'node:child_process';
import type { PlatformAdapter, PlatformType, WorkItem, PullRequest } from './types.js';

/** Check whether the az CLI with devops extension is available */
function assertAzCliAvailable(): void {
  try {
    execSync('az devops -h', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    throw new Error(
      'Azure DevOps CLI not found. Install it with:\n' +
      '  1. Install Azure CLI: https://aka.ms/install-az-cli\n' +
      '  2. Add DevOps extension: az extension add --name azure-devops\n' +
      '  3. Login: az login\n' +
      '  4. Set defaults: az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG project=YOUR_PROJECT',
    );
  }
}

export class AzureDevOpsAdapter implements PlatformAdapter {
  readonly type: PlatformType = 'azure-devops';

  constructor(
    private readonly org: string,
    private readonly project: string,
    private readonly repo: string,
  ) {
    assertAzCliAvailable();
  }

  private get orgUrl(): string {
    return `https://dev.azure.com/${this.org}`;
  }

  private get defaults(): string {
    return `--org "${this.orgUrl}" --project "${this.project}"`;
  }

  private exec(cmd: string): string {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }

  async listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]> {
    const conditions: string[] = [];
    if (options.state) {
      conditions.push(`[System.State] = '${options.state}'`);
    }
    if (options.tags?.length) {
      for (const tag of options.tags) {
        conditions.push(`[System.Tags] Contains '${tag}'`);
      }
    }
    conditions.push(`[System.TeamProject] = '${this.project}'`);

    const where = conditions.join(' AND ');
    const top = options.limit ?? 50;
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${where} ORDER BY [System.CreatedDate] DESC`;

    const output = this.exec(
      `az boards query --wiql "${wiql}" ${this.defaults} --output json`,
    );
    const items = JSON.parse(output) as Array<{ id: number; fields?: Record<string, unknown> }>;

    // Fetch full details for each work item (limited by top)
    const results: WorkItem[] = [];
    for (const item of items.slice(0, top)) {
      const wi = await this.getWorkItem(item.id);
      results.push(wi);
    }
    return results;
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    const output = this.exec(
      `az boards work-item show --id ${id} ${this.defaults} --output json`,
    );
    const wi = JSON.parse(output) as {
      id: number;
      fields: Record<string, unknown>;
      url: string;
      _links?: { html?: { href?: string } };
    };

    const fields = wi.fields;
    const tags = typeof fields['System.Tags'] === 'string'
      ? (fields['System.Tags'] as string).split(';').map((t) => t.trim()).filter(Boolean)
      : [];
    const assignedTo = fields['System.AssignedTo'] as { displayName?: string; uniqueName?: string } | undefined;

    return {
      id: wi.id,
      title: (fields['System.Title'] as string) ?? '',
      state: (fields['System.State'] as string) ?? '',
      tags,
      assignedTo: assignedTo?.displayName ?? assignedTo?.uniqueName,
      url: wi._links?.html?.href ?? wi.url,
    };
  }

  async addTag(workItemId: number, tag: string): Promise<void> {
    // Get current tags, append the new one
    const wi = await this.getWorkItem(workItemId);
    const currentTags = wi.tags.filter((t) => t !== tag);
    currentTags.push(tag);
    const tagsStr = currentTags.join('; ');
    this.exec(
      `az boards work-item update --id ${workItemId} --fields "System.Tags=${tagsStr}" ${this.defaults} --output json`,
    );
  }

  async removeTag(workItemId: number, tag: string): Promise<void> {
    const wi = await this.getWorkItem(workItemId);
    const updatedTags = wi.tags.filter((t) => t !== tag);
    const tagsStr = updatedTags.join('; ');
    this.exec(
      `az boards work-item update --id ${workItemId} --fields "System.Tags=${tagsStr}" ${this.defaults} --output json`,
    );
  }

  async addComment(workItemId: number, comment: string): Promise<void> {
    // az boards work-item update --id ID --discussion "comment"
    this.exec(
      `az boards work-item update --id ${workItemId} --discussion "${comment.replace(/"/g, '\\"')}" ${this.defaults} --output json`,
    );
  }

  async listPullRequests(options: { status?: string; limit?: number }): Promise<PullRequest[]> {
    const args = [
      'az', 'repos', 'pr', 'list',
      '--repository', `"${this.repo}"`,
      this.defaults,
      '--output', 'json',
    ];
    if (options.status) args.push('--status', options.status);
    if (options.limit) args.push('--top', String(options.limit));

    const output = this.exec(args.join(' '));
    const prs = JSON.parse(output) as Array<{
      pullRequestId: number;
      title: string;
      sourceRefName: string;
      targetRefName: string;
      status: string;
      isDraft: boolean;
      reviewers: Array<{ vote: number }>;
      createdBy: { displayName: string; uniqueName: string };
      url: string;
      repository?: { webUrl?: string };
    }>;

    return prs.map((pr) => ({
      id: pr.pullRequestId,
      title: pr.title,
      sourceBranch: stripRefsHeads(pr.sourceRefName),
      targetBranch: stripRefsHeads(pr.targetRefName),
      status: mapAdoPrStatus(pr.status, pr.isDraft),
      reviewStatus: mapAdoReviewStatus(pr.reviewers),
      author: pr.createdBy.displayName ?? pr.createdBy.uniqueName,
      url: pr.repository?.webUrl
        ? `${pr.repository.webUrl}/pullrequest/${pr.pullRequestId}`
        : pr.url,
    }));
  }

  async createPullRequest(options: {
    title: string;
    sourceBranch: string;
    targetBranch: string;
    description?: string;
  }): Promise<PullRequest> {
    const args = [
      'az', 'repos', 'pr', 'create',
      '--repository', `"${this.repo}"`,
      '--source-branch', options.sourceBranch,
      '--target-branch', options.targetBranch,
      '--title', `"${options.title.replace(/"/g, '\\"')}"`,
      this.defaults,
      '--output', 'json',
    ];
    if (options.description) {
      args.push('--description', `"${options.description.replace(/"/g, '\\"')}"`);
    }

    const output = this.exec(args.join(' '));
    const pr = JSON.parse(output) as {
      pullRequestId: number;
      title: string;
      sourceRefName: string;
      targetRefName: string;
      status: string;
      isDraft: boolean;
      reviewers: Array<{ vote: number }>;
      createdBy: { displayName: string; uniqueName: string };
      url: string;
    };

    return {
      id: pr.pullRequestId,
      title: pr.title,
      sourceBranch: stripRefsHeads(pr.sourceRefName),
      targetBranch: stripRefsHeads(pr.targetRefName),
      status: mapAdoPrStatus(pr.status, pr.isDraft),
      reviewStatus: mapAdoReviewStatus(pr.reviewers),
      author: pr.createdBy.displayName ?? pr.createdBy.uniqueName,
      url: pr.url,
    };
  }

  async mergePullRequest(id: number): Promise<void> {
    this.exec(
      `az repos pr update --id ${id} --status completed ${this.defaults} --output json`,
    );
  }

  async createBranch(name: string, fromBranch?: string): Promise<void> {
    const base = fromBranch ?? 'main';
    this.exec(`git checkout ${base} && git pull && git checkout -b ${name}`);
  }
}

function stripRefsHeads(ref: string): string {
  return ref.replace(/^refs\/heads\//, '');
}

function mapAdoPrStatus(status: string, isDraft: boolean): PullRequest['status'] {
  if (isDraft) return 'draft';
  switch (status.toLowerCase()) {
    case 'active': return 'active';
    case 'completed': return 'completed';
    case 'abandoned': return 'abandoned';
    default: return 'active';
  }
}

function mapAdoReviewStatus(reviewers: Array<{ vote: number }> | undefined): PullRequest['reviewStatus'] {
  if (!reviewers?.length) return 'pending';
  // ADO vote: 10 = approved, -10 = rejected, 5 = approved with suggestions, -5 = waiting, 0 = no vote
  const hasReject = reviewers.some((r) => r.vote <= -5);
  if (hasReject) return 'changes-requested';
  const hasApproval = reviewers.some((r) => r.vote >= 5);
  if (hasApproval) return 'approved';
  return 'pending';
}
