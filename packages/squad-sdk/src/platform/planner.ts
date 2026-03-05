/**
 * Microsoft Planner adapter — uses Graph API via az CLI token for task management.
 * Planner buckets map to squad assignments (squad:untriaged, squad:riker, etc.)
 *
 * @module platform/planner
 */

import { execSync } from 'node:child_process';
import type { PlatformType, WorkItem } from './types.js';

/** Planner task shape from Graph API */
interface PlannerTask {
  id: string;
  title: string;
  percentComplete: number;
  bucketId: string;
  assignments: Record<string, unknown>;
}

/** Planner bucket shape from Graph API */
interface PlannerBucket {
  id: string;
  name: string;
}

/**
 * Get a Microsoft Graph access token via the az CLI.
 * Requires: `az login` completed beforehand.
 */
function getGraphToken(): string {
  try {
    const output = execSync(
      'az account get-access-token --resource-type ms-graph --query accessToken -o tsv',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    return output;
  } catch {
    throw new Error(
      'Could not obtain Microsoft Graph token. Ensure you are logged in:\n' +
      '  az login\n' +
      '  az account get-access-token --resource-type ms-graph',
    );
  }
}

/**
 * Map a Planner task + bucket name to a normalized WorkItem.
 */
export function mapPlannerTaskToWorkItem(
  task: PlannerTask,
  bucketName: string,
): WorkItem {
  return {
    id: hashTaskId(task.id),
    title: task.title,
    state: task.percentComplete === 100 ? 'done' : 'active',
    tags: [bucketName],
    url: `https://tasks.office.com/task/${task.id}`,
  };
}

/**
 * Convert a Planner string ID to a stable numeric hash.
 * WorkItem.id is a number, but Planner IDs are strings.
 */
function hashTaskId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Planner adapter — partial PlatformAdapter for work-item operations only.
 * Planner has no concept of PRs or branches, so those methods are not implemented.
 * Use alongside a repo adapter (GitHub/ADO) in a hybrid config.
 */
export class PlannerAdapter {
  readonly type: PlatformType = 'planner';
  private bucketCache: PlannerBucket[] | null = null;

  constructor(private readonly planId: string) {}

  private graphFetch(path: string, method = 'GET', body?: string): string {
    const token = getGraphToken();
    const curlArgs = [
      'curl', '-s',
      '-X', method,
      '-H', `"Authorization: Bearer ${token}"`,
      '-H', '"Content-Type: application/json"',
    ];
    if (body) {
      curlArgs.push('-d', `'${body}'`);
    }
    curlArgs.push(`"https://graph.microsoft.com/v1.0${path}"`);

    return execSync(curlArgs.join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }

  /** Fetch and cache buckets for this plan */
  async getBuckets(): Promise<PlannerBucket[]> {
    if (this.bucketCache) return this.bucketCache;

    const output = this.graphFetch(`/planner/plans/${this.planId}/buckets`);
    const data = JSON.parse(output) as { value: PlannerBucket[] };
    this.bucketCache = data.value;
    return this.bucketCache;
  }

  /** Resolve a bucket name to its ID */
  async getBucketId(bucketName: string): Promise<string | undefined> {
    const buckets = await this.getBuckets();
    return buckets.find((b) => b.name === bucketName)?.id;
  }

  /** Resolve a bucket ID to its name */
  async getBucketName(bucketId: string): Promise<string> {
    const buckets = await this.getBuckets();
    return buckets.find((b) => b.id === bucketId)?.name ?? 'unknown';
  }

  async listWorkItems(options: {
    tags?: string[];
    state?: string;
    limit?: number;
  }): Promise<WorkItem[]> {
    const output = this.graphFetch(`/planner/plans/${this.planId}/tasks`);
    const data = JSON.parse(output) as { value: PlannerTask[] };
    const buckets = await this.getBuckets();
    const bucketMap = new Map(buckets.map((b) => [b.id, b.name]));

    let tasks = data.value;

    // Filter by bucket name (tag)
    if (options.tags?.length) {
      const targetBucketIds = new Set<string>();
      for (const tag of options.tags) {
        const bucket = buckets.find((b) => b.name === tag);
        if (bucket) targetBucketIds.add(bucket.id);
      }
      tasks = tasks.filter((t) => targetBucketIds.has(t.bucketId));
    }

    // Filter by state
    if (options.state === 'done') {
      tasks = tasks.filter((t) => t.percentComplete === 100);
    } else if (options.state === 'active') {
      tasks = tasks.filter((t) => t.percentComplete < 100);
    }

    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    return tasks.map((task) =>
      mapPlannerTaskToWorkItem(task, bucketMap.get(task.bucketId) ?? 'unknown'),
    );
  }

  async createWorkItem(options: { title: string; description?: string; tags?: string[] }): Promise<WorkItem> {
    // Resolve target bucket from tags (first squad: tag), default to untriaged
    let bucketId: string | undefined;
    let bucketName = 'squad:untriaged';
    if (options.tags?.length) {
      for (const tag of options.tags) {
        const bid = await this.getBucketId(tag);
        if (bid) {
          bucketId = bid;
          bucketName = tag;
          break;
        }
      }
    }
    if (!bucketId) {
      bucketId = await this.getBucketId('squad:untriaged');
    }

    const taskBody: Record<string, unknown> = {
      planId: this.planId,
      title: options.title,
    };
    if (bucketId) {
      taskBody.bucketId = bucketId;
    }

    const output = this.graphFetch('/planner/tasks', 'POST', JSON.stringify(taskBody));
    const task = JSON.parse(output) as PlannerTask;

    // Add description if provided
    if (options.description) {
      this.graphFetch(
        `/planner/tasks/${task.id}/details`,
        'PATCH',
        JSON.stringify({ description: options.description, previewType: 'description' }),
      );
    }

    return mapPlannerTaskToWorkItem(task, bucketName);
  }

  async addTag(taskId: string, bucketName: string): Promise<void> {
    const bucketId = await this.getBucketId(bucketName);
    if (!bucketId) {
      throw new Error(`Bucket "${bucketName}" not found in plan ${this.planId}`);
    }
    // Moving a task to a different bucket = reassigning
    this.graphFetch(
      `/planner/tasks/${taskId}`,
      'PATCH',
      JSON.stringify({ bucketId }),
    );
  }

  async addComment(taskId: string, comment: string): Promise<void> {
    // Planner task comments go through the group conversation thread
    this.graphFetch(
      `/planner/tasks/${taskId}/details`,
      'PATCH',
      JSON.stringify({
        description: comment,
        previewType: 'description',
      }),
    );
  }
}
