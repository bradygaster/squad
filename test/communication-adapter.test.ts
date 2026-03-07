/**
 * Communication adapter tests — interface contracts, factory, FileLog adapter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CommunicationAdapter, CommunicationChannel, CommunicationReply, CommunicationConfig } from '../packages/squad-sdk/src/platform/types.js';
import { FileLogCommunicationAdapter } from '../packages/squad-sdk/src/platform/comms-file-log.js';

const TEST_ROOT = join(__dirname, '..', 'test-fixtures', 'comms-test');

describe('CommunicationAdapter interface', () => {
  it('CommunicationChannel includes all expected values', () => {
    const channels: CommunicationChannel[] = ['github-discussions', 'ado-work-items', 'teams-webhook', 'file-log'];
    expect(channels).toHaveLength(4);
  });

  it('CommunicationReply has required fields', () => {
    const reply: CommunicationReply = {
      author: 'tamir',
      body: 'Looks good!',
      timestamp: new Date(),
      id: 'reply-1',
    };
    expect(reply.author).toBe('tamir');
    expect(reply.body).toBe('Looks good!');
    expect(reply.id).toBe('reply-1');
  });

  it('CommunicationConfig has correct shape', () => {
    const config: CommunicationConfig = {
      channel: 'github-discussions',
      postAfterSession: true,
      postDecisions: true,
      postEscalations: false,
    };
    expect(config.channel).toBe('github-discussions');
    expect(config.postAfterSession).toBe(true);
  });
});

describe('FileLogCommunicationAdapter', () => {
  let adapter: FileLogCommunicationAdapter;

  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    adapter = new FileLogCommunicationAdapter(TEST_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  });

  it('has channel type file-log', () => {
    expect(adapter.channel).toBe('file-log');
  });

  it('creates comms directory on construction', () => {
    expect(existsSync(join(TEST_ROOT, '.squad', 'comms'))).toBe(true);
  });

  it('postUpdate creates a markdown file', async () => {
    const result = await adapter.postUpdate({
      title: 'Session Summary',
      body: 'Completed auth module refactoring',
      category: 'standup',
      author: 'Scribe',
    });

    expect(result.id).toBeTruthy();
    expect(result.url).toBeUndefined(); // file-based has no URL

    const commsDir = join(TEST_ROOT, '.squad', 'comms');
    const files = require('fs').readdirSync(commsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);

    const content = readFileSync(join(commsDir, files[0]), 'utf-8');
    expect(content).toContain('# Session Summary');
    expect(content).toContain('Completed auth module refactoring');
    expect(content).toContain('Scribe');
    expect(content).toContain('standup');
  });

  it('postUpdate uses default category and author when not provided', async () => {
    await adapter.postUpdate({
      title: 'Quick Update',
      body: 'Something happened',
    });

    const commsDir = join(TEST_ROOT, '.squad', 'comms');
    const files = require('fs').readdirSync(commsDir);
    const content = readFileSync(join(commsDir, files[0]), 'utf-8');
    expect(content).toContain('Squad');
    expect(content).toContain('update');
  });

  it('pollForReplies returns empty when no thread exists', async () => {
    const replies = await adapter.pollForReplies({
      threadId: 'nonexistent',
      since: new Date(),
    });
    expect(replies).toEqual([]);
  });

  it('pollForReplies reads replies from thread file', async () => {
    const result = await adapter.postUpdate({
      title: 'Need Input',
      body: 'Should we use REST or GraphQL?',
    });

    // Simulate human reply by appending to the file
    const commsDir = join(TEST_ROOT, '.squad', 'comms');
    const filepath = join(commsDir, `${result.id}.md`);
    const content = readFileSync(filepath, 'utf-8');
    writeFileSync(filepath, content + '\nLet\'s go with GraphQL.\n', 'utf-8');

    const replies = await adapter.pollForReplies({
      threadId: result.id,
      since: new Date(0),
    });

    expect(replies.length).toBe(1);
    expect(replies[0]!.body).toContain('GraphQL');
  });

  it('getNotificationUrl returns undefined for file-log', () => {
    expect(adapter.getNotificationUrl('any-id')).toBeUndefined();
  });

  it('multiple postUpdates create separate files', async () => {
    await adapter.postUpdate({ title: 'First', body: 'One' });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await adapter.postUpdate({ title: 'Second', body: 'Two' });

    const commsDir = join(TEST_ROOT, '.squad', 'comms');
    const files = require('fs').readdirSync(commsDir);
    expect(files.length).toBe(2);
  });
});

describe('CommunicationAdapter contract', () => {
  it('FileLogCommunicationAdapter implements CommunicationAdapter', () => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });

    const adapter: CommunicationAdapter = new FileLogCommunicationAdapter(TEST_ROOT);
    expect(adapter.channel).toBeDefined();
    expect(typeof adapter.postUpdate).toBe('function');
    expect(typeof adapter.pollForReplies).toBe('function');
    expect(typeof adapter.getNotificationUrl).toBe('function');

    rmSync(TEST_ROOT, { recursive: true });
  });

  it('GitHubDiscussionsCommunicationAdapter exports correctly', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/comms-github-discussions.js');
    expect(mod.GitHubDiscussionsCommunicationAdapter).toBeDefined();
  });

  it('ADODiscussionCommunicationAdapter exports correctly', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/comms-ado-discussions.js');
    expect(mod.ADODiscussionCommunicationAdapter).toBeDefined();
  });

  it('createCommunicationAdapter factory exports correctly', async () => {
    const mod = await import('../packages/squad-sdk/src/platform/comms.js');
    expect(mod.createCommunicationAdapter).toBeDefined();
  });
});
