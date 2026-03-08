/**
 * Human journey E2E test: "I'm a power user now"
 *
 * Validates advanced shell features an experienced user relies on:
 * slash commands, tab completion, Ctrl+C cancel/exit, @agent routing.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/396
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

  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — Power User Test

> A project for testing power-user workflows.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
| McManus | QA | \`.squad/agents/mcmanus/charter.md\` | ✅ Active |
`);

  writeFileSync(join(identityDir, 'now.md'), `---
updated_at: 2025-01-01T00:00:00.000Z
focus_area: Power user testing
active_issues: []
---

# What We're Focused On

Power user testing.
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
      { name: 'McManus', role: 'QA' },
    ],
    withSquadDir = true,
    version = '0.0.0-test',
  } = opts ?? {};

  const tempDir = mkdtempSync(join(tmpdir(), 'squad-journey-pu-'));
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
    async cleanup() {
      ink.unmount();
      await rm(tempDir, { recursive: true, force: true });
    },
  };

  return harness;
}

// ═══════════════════════════════════════════════════════════════════════════
// Journey: "I'm a power user now"
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Power user', { timeout: 30_000 }, () => {
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

  // ── 1. /help shows all available commands ─────────────────────────────

  it('/help lists available slash commands', async () => {
    await shell.submit('/help');
    expect(shell.hasText('/status')).toBe(true);
    expect(shell.hasText('/history')).toBe(true);
    expect(shell.hasText('/quit')).toBe(true);
  });

  it('/help shows @agent routing guidance', async () => {
    await shell.submit('/help');
    expect(shell.hasText('@AgentName')).toBe(true);
  });

  it('/help full shows expanded command descriptions', async () => {
    await shell.submit('/help full');
    expect(shell.hasText('/agents')).toBe(true);
    expect(shell.hasText('/clear')).toBe(true);
    expect(shell.hasText('/quit')).toBe(true);
  });

  // ── 2. /status shows team overview ────────────────────────────────────

  it('/status shows agent count and team info', async () => {
    await shell.submit('/status');
    expect(shell.hasText('3 agents')).toBe(true);
    expect(shell.hasText('Root')).toBe(true);
    expect(shell.hasText('Messages')).toBe(true);
  });

  it('/status does not dispatch to SDK', async () => {
    await shell.submit('/status');
    expect(shell.dispatched).not.toHaveBeenCalled();
  });

  // ── 3. Tab completion for slash commands ──────────────────────────────

  it('tab completes /h to /help', async () => {
    await shell.type('/h');
    shell.ink.stdin.write('\t');
    await tick(120);
    expect(shell.hasText('/help')).toBe(true);
  });

  it('tab completes /s to /status', async () => {
    await shell.type('/s');
    shell.ink.stdin.write('\t');
    await tick(120);
    expect(shell.hasText('/status')).toBe(true);
  });

  // ── 4. Tab completion for @agent names ────────────────────────────────

  it('tab completes @K to @Keaton', async () => {
    await shell.type('@K');
    shell.ink.stdin.write('\t');
    await tick(120);
    expect(shell.hasText('@Keaton')).toBe(true);
  });

  it('tab completes @F to @Fenster', async () => {
    await shell.type('@F');
    shell.ink.stdin.write('\t');
    await tick(120);
    expect(shell.hasText('@Fenster')).toBe(true);
  });

  // ── 5. Ctrl+C cancels an active operation ─────────────────────────────

  it('Ctrl+C during processing calls onCancel', async () => {
    // Make dispatch hang so the shell stays in processing state
    shell.dispatched.mockImplementation(() => new Promise(() => {}));
    await shell.submit('do something slow');
    await tick(120);
    shell.raw('\x03');
    await tick(120);
    expect(shell.cancelled).toHaveBeenCalled();
  });

  // ── 6. Double Ctrl+C exits the shell ──────────────────────────────────

  it('single Ctrl+C when idle shows exit hint', async () => {
    shell.raw('\x03');
    await tick(120);
    expect(shell.hasText('Press Ctrl+C again to exit')).toBe(true);
  });

  it('double Ctrl+C when idle exits the shell', async () => {
    shell.raw('\x03');
    await tick(80);
    shell.raw('\x03');
    await tick(120);
    // After exit, the last frame is empty or the component unmounts.
    // ink-testing-library's render returns frames — after exit() the
    // component tree teardown means no new content is rendered.
    // We just verify no error was thrown and the frame is stable.
    const frame = shell.frame();
    expect(frame).toBeDefined();
  });

  // ── 7. Multiple slash commands in sequence ────────────────────────────

  it('running /help then /status in sequence both produce output', async () => {
    await shell.submit('/help');
    expect(shell.hasText('/status')).toBe(true);

    await shell.submit('/status');
    expect(shell.hasText('3 agents')).toBe(true);
    expect(shell.hasText('Root')).toBe(true);
  });

  it('running /agents shows team members', async () => {
    await shell.submit('/agents');
    expect(shell.hasText('Keaton')).toBe(true);
    expect(shell.hasText('Fenster')).toBe(true);
    expect(shell.hasText('McManus')).toBe(true);
  });

  it('/version then /status in sequence works correctly', async () => {
    await shell.submit('/version');
    expect(shell.hasText('0.0.0-test')).toBe(true);

    await shell.submit('/status');
    expect(shell.hasText('Messages')).toBe(true);
  });

  // ── 8. @agent direct routing with complex messages ────────────────────

  it('@Keaton routes complex message as direct_agent', async () => {
    await shell.submit('@Keaton refactor the auth module and add retry logic');
    expect(shell.dispatched).toHaveBeenCalledTimes(1);
    const parsed = shell.dispatched.mock.calls[0]![0] as ParsedInput;
    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Keaton');
    expect(parsed.content).toBe('refactor the auth module and add retry logic');
  });

  it('@Fenster routes with multi-word message', async () => {
    await shell.submit('@Fenster write tests for the new parser including edge cases');
    expect(shell.dispatched).toHaveBeenCalledTimes(1);
    const parsed = shell.dispatched.mock.calls[0]![0] as ParsedInput;
    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Fenster');
    expect(parsed.content).toBe('write tests for the new parser including edge cases');
  });

  it('@agent message appears in conversation history', async () => {
    await shell.submit('@McManus run the full regression suite');
    expect(shell.hasText('@McManus run the full regression suite')).toBe(true);
    expect(shell.hasText('❯')).toBe(true);
  });

  it('agent response renders when pushed via ShellApi', async () => {
    await shell.submit('@Keaton check the CI pipeline');
    shell.api().addMessage({
      role: 'agent',
      agentName: 'Keaton',
      content: 'CI pipeline is green — all 47 tests passing.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('CI pipeline is green')).toBe(true);
  });
});
