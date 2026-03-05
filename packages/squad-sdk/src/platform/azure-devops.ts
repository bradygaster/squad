/**
 * Azure DevOps platform adapter — wraps az CLI for work item/PR/branch operations.
 *
 * @module platform/azure-devops
 */

import { execFileSync, execSync } from 'node:child_process';
import type { PlatformAdapter, PlatformType, WorkItem, PullRequest } from './types.js';

const EXEC_OPTS: { encoding: 'utf-8'; stdio: ['pipe', 'pipe', 'pipe'] } = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

/** Check whether the az CLI with devops extension is available */
function assertAzCliAvailable(): void {
  try {
    execSync('az devops -h', EXEC_OPTS);
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

/** Escape a value for safe interpolation into a WIQL string (double single-quotes). */
function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Safely parse JSON output, including raw text in error messages */
function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON from CLI output: ${(err as Error).message}\nRaw output: ${raw}`);
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

  /** Common az CLI default args */
  private get defaultArgs(): string[] {
    return ['--org', this.orgUrl, '--project', this.project];
  }

  private az(args: string[]): string {
    return execFileSync('az', args, EXEC_OPTS).trim();
  }

  async listWorkItems(options: { tags?: string[]; state?: string; limit?: number }): Promise<WorkItem[]> {
    const conditions: string[] = [];
    if (options.state) {
      conditions.push(`[System.State] = '${escapeWiql(options.state)}'`);
    }
    if (options.tags?.length) {
      for (const tag of options.tags) {
        conditions.push(`[System.Tags] Contains '${escapeWiql(tag)}'`);
      }
    }
    conditions.push(`[System.TeamProject] = '${escapeWiql(this.project)}'`);

    const where = conditions.join(' AND ');
    const top = options.limit ?? 50;
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${where} ORDER BY [System.CreatedDate] DESC`;

    const output = this.az([
      'boards', 'query', '--wiql', wiql, ...this.defaultArgs, '--output', 'json',
    ]);
    const items = parseJson<Array<{ id: number; fields?: Record<string, unknown> }>>(output);

    // Fetch full details for each work item (limited by top)
    const results: WorkItem[] = [];
    for (const item of items.slice(0, top)) {
      const wi = await this.getWorkItem(item.id);
      results.push(wi);
    }
    return results;
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    const output = this.az([
      'boards', 'work-item', 'show', '--id', String(id), ...this.defaultArgs, '--output', 'json',
    ]);
    const wi = parseJson<{
      id: number;
      fields: Record<string, unknown>;
      url: string;
      _links?: { html?: { href?: string } };
    }>(output);

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

  async createWorkItem(options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string }): Promise<WorkItem> {
    const wiType = options.type ?? 'User Story';
    const fields: string[] = [
      `System.Title=${options.title}`,
    ];
    if (options.description) {
      fields.push(`System.Description=${options.description}`);
    }
    if (options.tags?.length) {
      fields.push(`System.Tags=${options.tags.join('; ')}`);
    }
    if (options.assignedTo) {
      fields.push(`System.AssignedTo=${options.assignedTo}`);
    }

    const output = this.az([
      'boards', 'work-item', 'create', '--type', wiType, '--fields', ...fields, ...this.defaultArgs, '--output', 'json',
    ]);
    const created = parseJson<{
      id: number;
      fields: Record<string, unknown>;
      url: string;
      _links?: { html?: { href?: string } };
    }>(output);

    const createdFields = created.fields;
    const tags = typeof createdFields['System.Tags'] === 'string'
      ? (createdFields['System.Tags'] as string).split(';').map((t) => t.trim()).filter(Boolean)
      : [];

    return {
      id: created.id,
      title: (createdFields['System.Title'] as string) ?? '',
      state: (createdFields['System.State'] as string) ?? '',
      tags,
      url: created._links?.html?.href ?? created.url,
    };
  }

  async addTag(workItemId: number, tag: string): Promise<void> {
    // Get current tags, append the new one
    const wi = await this.getWorkItem(workItemId);
    const currentTags = wi.tags.filter((t) => t !== tag);
    currentTags.push(tag);
    const tagsStr = currentTags.join('; ');
    this.az([
      'boards', 'work-item', 'update', '--id', String(workItemId),
      '--fields', `System.Tags=${tagsStr}`, ...this.defaultArgs, '--output', 'json',
    ]);
  }

  async removeTag(workItemId: number, tag: string): Promise<void> {
    const wi = await this.getWorkItem(workItemId);
    const updatedTags = wi.tags.filter((t) => t !== tag);
    const tagsStr = updatedTags.join('; ');
    this.az([
      'boards', 'work-item', 'update', '--id', String(workItemId),
      '--fields', `System.Tags=${tagsStr}`, ...this.defaultArgs, '--output', 'json',
    ]);
  }

  async addComment(workItemId: number, comment: string): Promise<void> {
    this.az([
      'boards', 'work-item', 'update', '--id', String(workItemId),
      '--discussion', comment, ...this.defaultArgs, '--output', 'json',
    ]);
  }

  async listPullRequests(options: { status?: string; limit?: number }): Promise<PullRequest[]> {
    const args = [
      'repos', 'pr', 'list',
      '--repository', this.repo,
      ...this.defaultArgs,
      '--output', 'json',
    ];
    if (options.status) args.push('--status', options.status);
    if (options.limit) args.push('--top', String(options.limit));

    const output = this.az(args);
    const prs = parseJson<Array<{
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
    }>>(output);

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
      'repos', 'pr', 'create',
      '--repository', this.repo,
      '--source-branch', options.sourceBranch,
      '--target-branch', options.targetBranch,
      '--title', options.title,
      ...this.defaultArgs,
      '--output', 'json',
    ];
    if (options.description) {
      args.push('--description', options.description);
    }

    const output = this.az(args);
    const pr = parseJson<{
      pullRequestId: number;
      title: string;
      sourceRefName: string;
      targetRefName: string;
      status: string;
      isDraft: boolean;
      reviewers: Array<{ vote: number }>;
      createdBy: { displayName: string; uniqueName: string };
      url: string;
    }>(output);

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
    this.az([
      'repos', 'pr', 'update', '--id', String(id),
      '--status', 'completed', ...this.defaultArgs, '--output', 'json',
    ]);
  }

  async createBranch(name: string, fromBranch?: string): Promise<void> {
    const base = fromBranch ?? 'main';
    execFileSync('git', ['checkout', base], EXEC_OPTS);
    execFileSync('git', ['pull'], EXEC_OPTS);
    execFileSync('git', ['checkout', '-b', name], EXEC_OPTS);
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
