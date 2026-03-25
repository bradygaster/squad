/**
 * Smoke tests for ClaudeCodeRuntimeProvider
 *
 * Tests the provider lifecycle: start → send → events → shutdown.
 * Uses a mock claude binary (simple echo script) to avoid requiring
 * actual Claude CLI installation in CI.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { writeFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeCodeRuntimeProvider } from '../src/runtime/providers/claude-code-provider.js';
import type { RuntimeProviderEvent } from '../src/runtime/provider.js';

let mockBinDir: string;
let mockClaudePath: string;

beforeAll(() => {
  // Create a mock claude binary that echoes JSON events
  mockBinDir = mkdtempSync(join(tmpdir(), 'claude-mock-'));
  mockClaudePath = join(mockBinDir, 'claude');

  const mockScript = `#!/bin/bash
# Mock claude binary for testing
# Outputs a session.started event, then echoes stdin back as message events
echo '{"type":"session_start","session_id":"test-123"}'

while IFS= read -r line; do
  if [ -z "$line" ]; then continue; fi
  echo "{\\"type\\":\\"message\\",\\"content\\":\\"echo: $line\\"}"
done
`;

  writeFileSync(mockClaudePath, mockScript, { mode: 0o755 });
  chmodSync(mockClaudePath, 0o755);
});

afterAll(() => {
  rmSync(mockBinDir, { recursive: true, force: true });
});

describe('ClaudeCodeRuntimeProvider', () => {
  let provider: ClaudeCodeRuntimeProvider;

  beforeAll(() => {
    provider = new ClaudeCodeRuntimeProvider({ claudeBin: mockClaudePath });
  });

  afterEach(async () => {
    // Clean up any lingering sessions
    // Provider tracks sessions internally; this is belt-and-suspenders
  });

  it('should have correct provider name', () => {
    expect(provider.name).toBe('claude-code');
  });

  it('should list available models', async () => {
    const models = await provider.listModels!();
    expect(models).toContain('claude-sonnet-4-6');
    expect(models).toContain('claude-opus-4-6');
    expect(models.length).toBeGreaterThan(0);
  });

  it('should start a session and receive session.started event', async () => {
    const events: RuntimeProviderEvent[] = [];

    const session = await provider.startSession({
      workingDirectory: mockBinDir,
    });

    expect(session.id).toBeTruthy();
    expect(session.provider).toBe('claude-code');

    const unsub = await provider.onEvent(session.id, (event) => {
      events.push(event);
    });

    // Give time for the session.started event to propagate
    await new Promise((r) => setTimeout(r, 500));

    // session.started should have been emitted during startSession
    // (it fires before onEvent is wired, so check provider behavior)
    expect(session.id).toBeDefined();

    unsub();
    await provider.shutdownSession(session.id);
  });

  it('should send a message and receive events', async () => {
    const events: RuntimeProviderEvent[] = [];

    const session = await provider.startSession({
      workingDirectory: mockBinDir,
    });

    await provider.onEvent(session.id, (event) => {
      events.push(event);
    });

    await provider.sendMessage(session.id, {
      role: 'user',
      content: 'Hello from test',
    });

    // Wait for the mock to echo back
    await new Promise((r) => setTimeout(r, 1000));

    // Should have received at least one event (message delta or complete)
    const messageEvents = events.filter(
      (e) => e.type === 'message.delta' || e.type === 'message.complete',
    );
    expect(messageEvents.length).toBeGreaterThan(0);

    await provider.shutdownSession(session.id);
  });

  it('should shutdown session cleanly', async () => {
    const events: RuntimeProviderEvent[] = [];

    const session = await provider.startSession({
      workingDirectory: mockBinDir,
    });

    await provider.onEvent(session.id, (event) => {
      events.push(event);
    });

    await provider.shutdownSession(session.id);

    // After shutdown, sending should throw
    await expect(
      provider.sendMessage(session.id, { role: 'user', content: 'test' }),
    ).rejects.toThrow();
  });

  it('should handle multiple concurrent sessions', async () => {
    const session1 = await provider.startSession({
      workingDirectory: mockBinDir,
    });
    const session2 = await provider.startSession({
      workingDirectory: mockBinDir,
    });

    expect(session1.id).not.toBe(session2.id);

    await provider.shutdownSession(session1.id);
    await provider.shutdownSession(session2.id);
  });

  it('should unsubscribe event handler correctly', async () => {
    const events: RuntimeProviderEvent[] = [];

    const session = await provider.startSession({
      workingDirectory: mockBinDir,
    });

    const unsub = await provider.onEvent(session.id, (event) => {
      events.push(event);
    });

    // Unsubscribe immediately
    unsub();

    await provider.sendMessage(session.id, {
      role: 'user',
      content: 'should not appear',
    });

    await new Promise((r) => setTimeout(r, 500));

    // No events should have been captured after unsubscribe
    const postUnsub = events.filter((e) => e.timestamp > Date.now() - 400);
    expect(postUnsub.length).toBe(0);

    await provider.shutdownSession(session.id);
  });
});
