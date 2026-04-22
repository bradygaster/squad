/**
 * Azure DevOps platform adapter — wraps az CLI for work item/PR/branch operations.
 *
 * @module platform/azure-devops
 */

import { execFileSync } from 'node:child_process';
import type { PlatformAdapter, PlatformType, WorkItem, PullRequest } from './types.js';

const IS_WINDOWS = process.platform === 'win32';
const EXEC_OPTS: { encoding: 'utf-8'; stdio: ['pipe', 'pipe', 'pipe'] } = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };
const AZ_OPTS = { ...EXEC_OPTS, shell: IS_WINDOWS };

/** Descriptor for a work item type returned by process template introspection. */
export interface WorkItemTypeInfo {
  /** Display name — e.g. "User Story", "Bug", "Task", "Scenario" */
  name: string;
  /** Description of the work item type (may be empty) */
  description: string;
  /** Whether this type is disabled in the current process */
  disabled: boolean;
}

/** Check whether the az CLI with devops extension is available */
function assertAzCliAvailable(): void {
  try {
    execFileSync('az', ['devops', '-h'], AZ_OPTS);
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

/**
 * Query the ADO process template for available work item types.
 *
 * Uses `az boards work-item type list` which returns the types configured
 * for the project's process template (Agile, Scrum, CMMI, custom, etc.).
 *
 * Falls back to a minimal default list when the az CLI call fails
 * (e.g. no auth, no devops extension, offline).
 */
export function getAvailableWorkItemTypes(org: string, project: string): WorkItemTypeInfo[] {
  const orgUrl = `https://dev.azure.com/${org}`;
  try {
    // Timeout after 3 s so tests and CI aren't blocked when az CLI is slow
    // or tries to reach a non-existent org.  The catch block returns defaults.
    const raw = execFileSync('az', [
      'boards', 'work-item', 'type', 'list',
      '--org', orgUrl,
      '--project', project,
      '--output', 'json',
    ], { ...AZ_OPTS, timeout: 3_000 }).trim();

    const types = parseJson<Array<{
      name?: string;
      description?: string;
      isDisabled?: boolean;
    }>>(raw);

    return types.map((t) => ({
      name: t.name ?? '',
      description: t.description ?? '',
      disabled: t.isDisabled === true,
    }));
  } catch {
    // Fallback: return common defaults so callers aren't empty-handed
    return [
      { name: 'User Story', description: 'Tracks user-facing functionality', disabled: false },
      { name: 'Bug', description: 'Tracks a defect', disabled: false },
      { name: 'Task', description: 'Tracks a unit of work', disabled: false },
    ];
  }
}

/**
 * Validate that a work item type name exists in the project's process template.
 *
 * Returns `true` when the type is valid and not disabled, or when the type list
 * cannot be retrieved (fail-open so offline/CI scenarios aren't blocked).
 */
export function validateWorkItemType(org: string, project: string, typeName: string): { valid: boolean; available: string[] } {
  const types = getAvailableWorkItemTypes(org, project);
  const enabledTypes = types.filter((t) => !t.disabled);
  const names = enabledTypes.map((t) => t.name);

  // Case-insensitive match — ADO type names are case-insensitive
  const valid = names.some((n) => n.toLowerCase() === typeName.toLowerCase());
  return { valid, available: names };
}

/** ADO-specific configuration for work items that may live in a different org/project than the repo. */
export interface AdoWorkItemConfig {
  /** Azure DevOps org for work items (if different from repo org) */
  org?: string;
  /** Azure DevOps project for work items (if different from repo project) */
  project?: string;
  /** Default work item type — e.g. "User Story", "Scenario", "Bug" (default: "User Story") */
  defaultWorkItemType?: string;
  /** Default area path for new work items — e.g. "MyProject\\Team A" */
  areaPath?: string;
  /** Default iteration path for new work items — e.g. "MyProject\\Sprint 1" */
  iterationPath?: string;
}

export class AzureDevOpsAdapter implements PlatformAdapter {
  readonly type: PlatformType = 'azure-devops';

  constructor(
    private readonly org: string,
    private readonly project: string,
    private readonly repo: string,
    private readonly workItemConfig?: AdoWorkItemConfig,
  ) {
    assertAzCliAvailable();
  }

  private get orgUrl(): string {
    return `https://dev.azure.com/${this.org}`;
  }

  /** Org URL for work item operations (may differ from repo org). */
  private get wiOrgUrl(): string {
    const wiOrg = this.workItemConfig?.org ?? this.org;
    return `https://dev.azure.com/${wiOrg}`;
  }

  /** Project for work item operations (may differ from repo project). */
  private get wiProject(): string {
    return this.workItemConfig?.project ?? this.project;
  }

  /** Common az CLI default args for repo operations */
  private get defaultArgs(): string[] {
    return ['--org', this.orgUrl, '--project', this.project];
  }

  /** Common az CLI default args for work item operations */
  private get workItemArgs(): string[] {
    return ['--org', this.wiOrgUrl, '--project', this.wiProject];
  }

  private az(args: string[]): string {
    return execFileSync('az', args, AZ_OPTS).trim();
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
    conditions.push(`[System.TeamProject] = '${escapeWiql(this.wiProject)}'`);

    const where = conditions.join(' AND ');
    const top = options.limit ?? 50;
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${where} ORDER BY [System.CreatedDate] DESC`;

    const output = this.az([
      'boards', 'query', '--wiql', wiql, ...this.workItemArgs, '--output', 'json',
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
      'boards', 'work-item', 'show', '--id', String(id), ...this.workItemArgs, '--output', 'json',
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

  /**
   * Query the available work item types for this adapter's work item project.
   * Delegates to the module-level `getAvailableWorkItemTypes`.
   */
  getAvailableWorkItemTypes(): WorkItemTypeInfo[] {
    const wiOrg = this.workItemConfig?.org ?? this.org;
    const wiProj = this.workItemConfig?.project ?? this.project;
    return getAvailableWorkItemTypes(wiOrg, wiProj);
  }

  /**
   * Validate a work item type against the project's process template.
   */
  validateWorkItemType(typeName: string): { valid: boolean; available: string[] } {
    const wiOrg = this.workItemConfig?.org ?? this.org;
    const wiProj = this.workItemConfig?.project ?? this.project;
    return validateWorkItemType(wiOrg, wiProj, typeName);
  }

  async createWorkItem(options: { title: string; description?: string; tags?: string[]; assignedTo?: string; type?: string; areaPath?: string; iterationPath?: string; validateType?: boolean }): Promise<WorkItem> {
    const wiType = options.type ?? this.workItemConfig?.defaultWorkItemType ?? 'User Story';

    // Optional validation: check if the type exists in the project's process template
    if (options.validateType) {
      const result = this.validateWorkItemType(wiType);
      if (!result.valid) {
        throw new Error(
          `Work item type "${wiType}" is not available in this project. ` +
          `Available types: ${result.available.join(', ')}`,
        );
      }
    }

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
    // Area path: explicit > config > omit (uses project default)
    const areaPath = options.areaPath ?? this.workItemConfig?.areaPath;
    if (areaPath) {
      fields.push(`System.AreaPath=${areaPath}`);
    }
    // Iteration path: explicit > config > omit (uses project default)
    const iterationPath = options.iterationPath ?? this.workItemConfig?.iterationPath;
    if (iterationPath) {
      fields.push(`System.IterationPath=${iterationPath}`);
    }

    const output = this.az([
      'boards', 'work-item', 'create', '--type', wiType, '--fields', ...fields, ...this.workItemArgs, '--output', 'json',
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
      '--fields', `System.Tags=${tagsStr}`, ...this.workItemArgs, '--output', 'json',
    ]);
  }

  async removeTag(workItemId: number, tag: string): Promise<void> {
    const wi = await this.getWorkItem(workItemId);
    const updatedTags = wi.tags.filter((t) => t !== tag);
    const tagsStr = updatedTags.join('; ');
    this.az([
      'boards', 'work-item', 'update', '--id', String(workItemId),
      '--fields', `System.Tags=${tagsStr}`, ...this.workItemArgs, '--output', 'json',
    ]);
  }

  async addComment(workItemId: number, comment: string): Promise<void> {
    this.az([
      'boards', 'work-item', 'update', '--id', String(workItemId),
      '--discussion', comment, ...this.workItemArgs, '--output', 'json',
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

  async ensureAuth(preferredOrg?: string): Promise<void> {
    try {
      let targetOrg = preferredOrg || '';

      if (!targetOrg) {
        // Auto-detect from remote URL
        const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], EXEC_OPTS).trim();
        const adoMatch = remoteUrl.match(/dev\.azure\.com\/([^/]+)\//);
        const vstsMatch = remoteUrl.match(/([^/]+)\.visualstudio\.com\//);
        if (adoMatch?.[1]) targetOrg = adoMatch[1];
        else if (vstsMatch?.[1]) targetOrg = vstsMatch[1];
      }

      if (!targetOrg) return;

      try {
        const orgUrl = `https://dev.azure.com/${targetOrg}`;
        execFileSync('az', ['devops', 'configure', '--defaults', `organization=${orgUrl}`], AZ_OPTS);
      } catch {
        // az CLI might not be installed — non-fatal
      }
    } catch {
      // Non-fatal
    }
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
