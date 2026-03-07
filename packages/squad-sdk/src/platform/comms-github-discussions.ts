/**
 * GitHub Discussions communication adapter.
 *
 * Posts updates and reads replies via GitHub Discussions using `gh api`.
 * Phone-capable (browser-based), not corp-only.
 *
 * @module platform/comms-github-discussions
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

export class GitHubDiscussionsCommunicationAdapter implements CommunicationAdapter {
  readonly channel: CommunicationChannel = 'github-discussions';

  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }> {
    const category = options.category ?? 'General';

    // Get category ID
    const categoryQuery = `query { repository(owner: "${this.owner}", name: "${this.repo}") { discussionCategories(first: 25) { nodes { id name } } } }`;
    const catOutput = execFileSync('gh', ['api', 'graphql', '-f', `query=${categoryQuery}`], EXEC_OPTS);
    const catData = parseJson<{
      data: { repository: { discussionCategories: { nodes: Array<{ id: string; name: string }> } } }
    }>(catOutput);

    const catNode = catData.data.repository.discussionCategories.nodes.find(
      (n) => n.name.toLowerCase() === category.toLowerCase(),
    );
    if (!catNode) {
      throw new Error(`Discussion category "${category}" not found in ${this.owner}/${this.repo}. Available: ${catData.data.repository.discussionCategories.nodes.map((n) => n.name).join(', ')}`);
    }

    // Get repo ID
    const repoQuery = `query { repository(owner: "${this.owner}", name: "${this.repo}") { id } }`;
    const repoOutput = execFileSync('gh', ['api', 'graphql', '-f', `query=${repoQuery}`], EXEC_OPTS);
    const repoData = parseJson<{ data: { repository: { id: string } } }>(repoOutput);

    // Create discussion
    const prefix = options.author ? `*Posted by ${options.author}*\n\n` : '';
    const mutation = `mutation { createDiscussion(input: { repositoryId: "${repoData.data.repository.id}", categoryId: "${catNode.id}", title: "${options.title.replace(/"/g, '\\"')}", body: "${(prefix + options.body).replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }) { discussion { id number url } } }`;
    const output = execFileSync('gh', ['api', 'graphql', '-f', `query=${mutation}`], EXEC_OPTS);
    const result = parseJson<{
      data: { createDiscussion: { discussion: { id: string; number: number; url: string } } }
    }>(output);

    const disc = result.data.createDiscussion.discussion;
    return { id: String(disc.number), url: disc.url };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    const query = `query { repository(owner: "${this.owner}", name: "${this.repo}") { discussion(number: ${options.threadId}) { comments(first: 50) { nodes { id body createdAt author { login } } } } } }`;
    const output = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], EXEC_OPTS);
    const data = parseJson<{
      data: { repository: { discussion: { comments: { nodes: Array<{ id: string; body: string; createdAt: string; author: { login: string } }> } } } }
    }>(output);

    const comments = data.data.repository.discussion.comments.nodes;
    return comments
      .filter((c) => new Date(c.createdAt) > options.since)
      .map((c) => ({
        author: c.author.login,
        body: c.body,
        timestamp: new Date(c.createdAt),
        id: c.id,
      }));
  }

  getNotificationUrl(threadId: string): string | undefined {
    return `https://github.com/${this.owner}/${this.repo}/discussions/${threadId}`;
  }
}
