/**
 * File-based communication adapter — zero-config fallback.
 *
 * Writes updates to `.squad/comms/` as markdown files.
 * Always available, no external dependencies. Works on every platform.
 * Replies are read from the same directory (humans edit files manually or via git).
 *
 * @module platform/comms-file-log
 */

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import { safeTimestamp } from '../utils/safe-timestamp.js';
import type { CommunicationAdapter, CommunicationChannel, CommunicationReply } from './types.js';

export class FileLogCommunicationAdapter implements CommunicationAdapter {
  readonly channel: CommunicationChannel = 'file-log';
  private readonly commsDir: string;

  constructor(
    private readonly squadRoot: string,
    private readonly storage: StorageProvider = new FSStorageProvider(),
  ) {
    this.commsDir = join(squadRoot, '.squad', 'comms');
    // TODO: StorageProvider lacks mkdirSync — residual fs mkdirSync (#481)
    mkdirSync(this.commsDir, { recursive: true });
  }

  async postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }> {
    const timestamp = safeTimestamp();
    const slug = options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `${timestamp}-${slug}.md`;
    const filepath = join(this.commsDir, filename);

    const content = [
      `# ${options.title}`,
      '',
      `**Posted by:** ${options.author ?? 'Squad'}`,
      `**Category:** ${options.category ?? 'update'}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      '',
      '---',
      '',
      options.body,
      '',
      '---',
      '',
      '<!-- Replies: add your response below this line -->',
      '',
    ].join('\n');

    await this.storage.write(filepath, content);

    return { id: filename.replace(/\.md$/, ''), url: undefined };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    const filepath = join(this.commsDir, `${options.threadId}.md`);
    const content = await this.storage.read(filepath);
    if (!content) return [];
    const replyMarker = '<!-- Replies: add your response below this line -->';
    const markerIdx = content.indexOf(replyMarker);
    if (markerIdx === -1) return [];

    const repliesSection = content.slice(markerIdx + replyMarker.length).trim();
    if (!repliesSection) return [];

    // Parse simple reply format: lines after the marker are replies
    return [{
      author: 'human',
      body: repliesSection,
      timestamp: new Date(),
      id: `${options.threadId}-reply`,
    }];
  }

  getNotificationUrl(_threadId: string): string | undefined {
    return undefined; // File-based has no web UI
  }
}
