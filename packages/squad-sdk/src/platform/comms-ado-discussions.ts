/**
 * Azure DevOps Work Item Discussion communication adapter.
 *
 * Posts updates as work item comments and reads replies via `az boards`.
 * Phone-capable via ADO mobile app.
 *
 * @module platform/comms-ado-discussions
 */

import { execFileSync } from 'node:child_process';
import type { CommunicationAdapter, CommunicationChannel, CommunicationReply } from './types.js';

const EXEC_OPTS: { encoding: 'utf-8'; stdio: ['pipe', 'pipe', 'pipe'] } = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

/** Safely parse JSON output */
function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${(err as Error).message}\nRaw: ${raw}`);
  }
}

export class ADODiscussionCommunicationAdapter implements CommunicationAdapter {
  readonly channel: CommunicationChannel = 'ado-work-items';

  constructor(
    private readonly org: string,
    private readonly project: string,
  ) {}

  private get orgUrl(): string {
    return `https://dev.azure.com/${this.org}`;
  }

  async postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }> {
    const prefix = options.author ? `**${options.author}:** ` : '';
    const categoryTag = options.category ? ` [${options.category}]` : '';
    const fullTitle = `[Squad${categoryTag}] ${options.title}`;
    const comment = `${prefix}${options.body}`;

    // Create a work item to serve as the discussion thread
    const output = execFileSync('az', [
      'boards', 'work-item', 'create',
      '--type', 'Task',
      '--title', fullTitle,
      '--fields', `System.Tags=squad; squad:comms`,
      '--discussion', comment,
      '--org', this.orgUrl,
      '--project', this.project,
      '--output', 'json',
    ], EXEC_OPTS);

    const wi = parseJson<{
      id: number;
      _links?: { html?: { href?: string } };
      url: string;
    }>(output);

    return {
      id: String(wi.id),
      url: wi._links?.html?.href ?? wi.url,
    };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    // Read work item comments (discussion history)
    const output = execFileSync('az', [
      'boards', 'work-item', 'show',
      '--id', options.threadId,
      '--org', this.orgUrl,
      '--project', this.project,
      '--expand', 'all',
      '--output', 'json',
    ], EXEC_OPTS);

    const wi = parseJson<{
      id: number;
      fields: Record<string, unknown>;
      comments?: Array<{
        id: number;
        text: string;
        createdDate: string;
        createdBy: { displayName: string };
      }>;
    }>(output);

    // ADO work item show doesn't include comments directly in basic output.
    // The discussion is in the System.History field as HTML.
    // For a production adapter, use the REST API for comments.
    // This is a simplified implementation.
    const history = wi.fields['System.History'] as string | undefined;
    if (!history) return [];

    return [{
      author: 'ado-user',
      body: history,
      timestamp: new Date(),
      id: `${options.threadId}-history`,
    }];
  }

  getNotificationUrl(threadId: string): string | undefined {
    return `${this.orgUrl}/${this.project}/_workitems/edit/${threadId}`;
  }
}
