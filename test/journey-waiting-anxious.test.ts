/**
 * Human Journey E2E Test — "I'm waiting and getting anxious"
 *
 * Validates the user experience while waiting for agent responses:
 * thinking indicators, activity hints, streaming content, /status
 * visibility, Ctrl+C cancellation, and recovery after cancel.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/385
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import React from 'react';
import { render, type RenderResponse } from 'ink-testing-library';
import { SessionRegistry } from '../packages/squad-cli/src/cli/shell/sessions.js';
import { ShellRenderer } from '../packages/squad-cli/src/cli/shell/render.js';
import { App, type ShellApi } from '../packages/squad-cli/src/cli/shell/components/App.js';
import type { ParsedInput } from '../packages/squad-cli/src/cli/shell/router.js';

const h = React.createElement;

// ─── Test infrastructure (mirrors e2e-shell.test.ts) ────────────────────────

const TICK = 200;

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function tick(ms = TICK): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function scaffoldSquadDir(root: string): void {
  const squadDir = join(root, '.squad');
  const agentsDir = join(squadDir, 'agents');
  const identityDir = join(squadDir, 'identity');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(identityDir, { recursive: true });

  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — E2E Test Project

> An end-to-end test project for shell integration.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
`);

  writeFileSync(join(identityDir, 'now.md'), `---
updated_at: 2025-01-01T00:00:00.000Z
focus_area: E2E test coverage
active_issues: []
---

# What We're Focused On

E2E test coverage.
`);
}

interface ShellHarness {
  ink: RenderResponse;
  api: () => ShellApi;
  type: (text: string) => Promise<void>;
  submit: (text: string) => Promise<void>;
  frame: () => string;
  waitFor: (text: string, timeoutMs?: number) => Promise<void>;
  hasText: (text: string) => boolean;
  raw: (bytes: string) => void;
  dispatched: ReturnType<typeof vi.fn>;
  cancelled: ReturnType<typeof vi.fn>;
  registry: SessionRegistry;
  cleanup: () => Promise<void>;
}

async function createShellHarness(opts?: {
  agents?: Array<{ name: string; role: string }>;
  withSquadDir?: boolean;
  version?: string;
}): Promise<ShellHarness> {
  const {
    agents = [
      { name: 'Keaton', role: 'Lead' },
      { name: 'Fenster', role: 'Core Dev' },
    ],
    withSquadDir = true,
    version = '0.0.0-test',
  } = opts ?? {};

  const tempDir = mkdtempSync(join(tmpdir(), 'squad-e2e-'));
  if (withSquadDir) scaffoldSquadDir(tempDir);

  const registry = new SessionRegistry();
  for (const a of agents) registry.register(a.name, a.role);

  const renderer = new ShellRenderer();
  const dispatched = vi.fn<(parsed: ParsedInput) => Promise<void>>().mockResolvedValue(undefined);
  const cancelled = vi.fn();

  let shellApi: ShellApi | undefined;
  const onReady = (api: ShellApi) => { shellApi = api; };

  const ink = render(
    h(App, {
      registry,
      renderer,
      teamRoot: tempDir,
      version,
      onReady,
      onDispatch: dispatched,
      onCancel: cancelled,
    })
  );

  await tick(120);

  const harness: ShellHarness = {
    ink,
    api: () => {
      if (!shellApi) throw new Error('ShellApi not ready — did the App mount?');
      return shellApi;
    },
    async type(text: string) {
      for (const ch of text) {
        ink.stdin.write(ch);
        await tick();
      }
    },
    async submit(text: string) {
      await harness.type(text);
      ink.stdin.write('\r');
      await tick(120);
    },
    frame() {
      return stripAnsi(ink.lastFrame() ?? '');
    },
    async waitFor(text: string, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (harness.frame().includes(text)) return;
        await tick(50);
      }
      throw new Error(`Timed out waiting for "${text}" in frame:\n${harness.frame()}`);
    },
    hasText(text: string) {
      return harness.frame().includes(text);
    },
    raw(bytes: string) {
      ink.stdin.write(bytes);
    },
    dispatched,
    cancelled,
    registry,
    async cleanup() {
      ink.unmount();
      await rm(tempDir, { recursive: true, force: true });
    },
  };

  return harness;
}

// ═══════════════════════════════════════════════════════════════════════════
// Journey: "I'm waiting and getting anxious"
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: I\'m waiting and getting anxious', { timeout: 30_000 }, () => {
  let shell: ShellHarness;

  beforeEach(async () => {
    vi.stubEnv('NO_COLOR', '1');
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    shell = await createShellHarness();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await shell.cleanup();
  });

  // ─── 1. Thinking indicator appears after submission ──────────────────────

  it('shows thinking indicator after submitting a message', async () => {
    // Make dispatch hang so processing stays true
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('build the login page');
    await tick(300);

    expect(shell.hasText('Routing to agent')).toBe(true);

    resolve();
    await tick(120);
  });

  // ─── 2. Phase labels display correctly ───────────────────────────────────

  it('shows "Routing to agent..." phase label by default', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('what should we build?');
    await tick(300);

    // In NO_COLOR mode ThinkingIndicator shows: "... Routing to agent..."
    expect(shell.hasText('Routing to agent...')).toBe(true);

    resolve();
    await tick(120);
  });

  it('shows activity hint from @agent mention', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('@Keaton fix the build');
    await tick(300);

    // MessageStream resolves activity hint from @mention: "Keaton is thinking..."
    expect(shell.hasText('Keaton is thinking...')).toBe(true);

    resolve();
    await tick(120);
  });

  // ─── 3. Activity hints for agents ────────────────────────────────────────

  it('shows explicit activity hint pushed via ShellApi', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('refactor the auth module');
    await tick(200);

    shell.api().setActivityHint('Analyzing auth module...');
    await tick(200);

    expect(shell.hasText('Analyzing auth module...')).toBe(true);

    resolve();
    await tick(120);
  });

  it('shows agent activity in the activity feed', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('review the codebase');
    await tick(200);

    shell.api().setAgentActivity('Keaton', 'reading src/auth.ts');
    await tick(200);

    expect(shell.hasText('Keaton is reading src/auth.ts')).toBe(true);

    resolve();
    await tick(120);
  });

  // ─── 4. Streaming content updates ────────────────────────────────────────

  it('shows streaming content from an agent', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('@Fenster write the tests');
    await tick(200);

    shell.api().setStreamingContent({
      agentName: 'Fenster',
      content: 'I\'ll start by creating the test file...',
    });
    await tick(200);

    expect(shell.hasText('Fenster:')).toBe(true);
    expect(shell.hasText('I\'ll start by creating the test file...')).toBe(true);

    // Streaming indicator shows agent name
    expect(shell.hasText('Fenster streaming')).toBe(true);

    resolve();
    await tick(120);
  });

  it('shows updated streaming content as it grows', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('@Fenster explain the architecture');
    await tick(200);

    shell.api().setStreamingContent({
      agentName: 'Fenster',
      content: 'The system uses',
    });
    await tick(200);
    expect(shell.hasText('The system uses')).toBe(true);

    shell.api().setStreamingContent({
      agentName: 'Fenster',
      content: 'The system uses a layered architecture with clean separation.',
    });
    await tick(200);
    expect(shell.hasText('layered architecture')).toBe(true);

    resolve();
    await tick(120);
  });

  // ─── 5. /status shows which agent is working ────────────────────────────

  it('/status shows active agent status', async () => {
    // Mark agent as working in the registry
    shell.registry.updateStatus('Keaton', 'working');
    shell.api().refreshAgents();
    await tick(120);

    await shell.submit('/status');
    await tick(200);

    expect(shell.hasText('Keaton')).toBe(true);
    expect(shell.hasText('1 active')).toBe(true);
  });

  it('/status shows activity hint for working agent', async () => {
    shell.registry.updateStatus('Keaton', 'working');
    shell.registry.updateActivityHint('Keaton', 'editing src/main.ts');
    shell.api().refreshAgents();
    await tick(120);

    await shell.submit('/status');
    await tick(200);

    expect(shell.hasText('editing src/main.ts')).toBe(true);
  });

  // ─── 6. Ctrl+C cancels a long operation ──────────────────────────────────

  it('Ctrl+C during processing calls onCancel', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('build the entire app');
    await tick(200);

    // Ctrl+C while processing
    shell.raw('\x03');
    await tick(120);

    expect(shell.cancelled).toHaveBeenCalledTimes(1);

    resolve();
    await tick(120);
  });

  it('shows cancellation message after Ctrl+C', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('run all the tests');
    await tick(200);

    shell.raw('\x03');
    await tick(120);

    // Simulate coordinator pushing cancel message (as the real system does)
    shell.api().addMessage({
      role: 'system',
      content: 'Operation cancelled.',
      timestamp: new Date(),
    });
    await tick(200);

    expect(shell.hasText('Operation cancelled')).toBe(true);

    resolve();
    await tick(120);
  });

  // ─── 7. After cancel, user can submit a new message ──────────────────────

  it('user can submit a new message after cancellation', async () => {
    let resolve!: () => void;
    shell.dispatched.mockImplementation(() => new Promise<void>(r => { resolve = r; }));

    await shell.submit('deploy to production');
    await tick(200);

    // Cancel
    shell.raw('\x03');
    await tick(120);

    // Resolve the pending dispatch so processing ends
    resolve();
    await tick(200);

    // Reset mock to resolve immediately for the next submission
    shell.dispatched.mockResolvedValue(undefined);

    await shell.submit('check the logs instead');
    await tick(200);

    expect(shell.dispatched).toHaveBeenCalledTimes(2);
    expect(shell.hasText('check the logs instead')).toBe(true);
  });

  // ─── Bonus: AgentPanel shows active status for working agents ──────────────

  it('AgentPanel shows agent name when agent is working', async () => {
    shell.registry.updateStatus('Keaton', 'working');
    shell.api().refreshAgents();
    await tick(200);

    expect(shell.hasText('Keaton')).toBe(true);
    // Active agents show with pulsing dot and activity info, not [WORK] tag
    expect(shell.hasText('working')).toBe(true);
  });

  it('AgentPanel shows agent name when agent is streaming', async () => {
    shell.registry.updateStatus('Fenster', 'streaming');
    shell.api().refreshAgents();
    await tick(200);

    expect(shell.hasText('Fenster')).toBe(true);
    // Active agents show with pulsing dot and activity info, not [STREAM] tag
    expect(shell.hasText('working')).toBe(true);
  });
});
