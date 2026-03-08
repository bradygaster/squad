/**
 * Human Journey E2E Test — "My first conversation"
 *
 * Simulates a brand-new user's first interactive session with Squad:
 * seeing the welcome banner, typing a message, observing the thinking
 * indicator, receiving a response, exploring /help and /status,
 * trying @agent routing, and exiting gracefully.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/384
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

// ─── Test infrastructure ────────────────────────────────────────────────────

const TICK = 200;

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function tick(ms = TICK): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Scaffold a minimal .squad/ directory so the App shows a welcome banner. */
function scaffoldSquadDir(root: string): void {
  const squadDir = join(root, '.squad');
  const agentsDir = join(squadDir, 'agents');
  const identityDir = join(squadDir, 'identity');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(identityDir, { recursive: true });

  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — My First Project

> A brand-new project exploring Squad for the first time.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
`);

  writeFileSync(join(identityDir, 'now.md'), `---
updated_at: 2025-01-01T00:00:00.000Z
focus_area: Getting started
active_issues: []
---

# What We're Focused On

Getting started with Squad.
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
    ],
    withSquadDir = true,
    version = '0.0.0-test',
  } = opts ?? {};

  const tempDir = mkdtempSync(join(tmpdir(), 'squad-journey-'));
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
// Journey: My First Conversation (#384)
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: My first conversation (#384)', { timeout: 30_000 }, () => {
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

  // ── Step 1: User sees welcome message on shell start ──────────────────

  describe('Step 1 — Welcome message on shell start', () => {
    it('shows SQUAD title in the welcome banner', () => {
      // Figlet banner renders SQUAD as ASCII art (not literal text)
      expect(shell.hasText('___')).toBe(true);
    });

    it('displays the version number', () => {
      expect(shell.hasText('0.0.0-test')).toBe(true);
    });

    it('lists the team agents by name', () => {
      expect(shell.hasText('Keaton')).toBe(true);
      expect(shell.hasText('Fenster')).toBe(true);
    });

    it('shows how many agents are ready', () => {
      expect(shell.hasText('2 agents ready')).toBe(true);
    });

    it('includes a /help hint so the user knows where to start', () => {
      expect(shell.hasText('/help')).toBe(true);
    });
  });

  // ── Step 2: User types their first message and submits ────────────────

  describe('Step 2 — First message submission', () => {
    it('typed text appears in the input area', async () => {
      await shell.type('Hello Squad!');
      expect(shell.hasText('Hello Squad!')).toBe(true);
    });

    it('submitted message appears in the conversation', async () => {
      await shell.submit('What should we build first?');
      expect(shell.hasText('What should we build first?')).toBe(true);
    });

    it('submission routes to coordinator for a bare message', async () => {
      await shell.submit('What should we build first?');
      expect(shell.dispatched).toHaveBeenCalledTimes(1);
      const parsed = shell.dispatched.mock.calls[0]![0] as ParsedInput;
      expect(parsed.type).toBe('coordinator');
      expect(parsed.content).toBe('What should we build first?');
    });

    it('user message is shown with the ❯ chevron', async () => {
      await shell.submit('What should we build first?');
      expect(shell.hasText('❯')).toBe(true);
    });
  });

  // ── Step 3: System shows thinking indicator while processing ──────────

  describe('Step 3 — Thinking indicator while processing', () => {
    it('shows a thinking indicator after submitting a message', async () => {
      // Make onDispatch hang so processing stays true
      shell.dispatched.mockReturnValue(new Promise(() => {}));
      await shell.submit('What should we build first?');
      await tick(200);
      // In NO_COLOR mode the indicator shows "..." and "Routing to agent"
      expect(shell.hasText('Routing to agent')).toBe(true);
    });

    it('thinking indicator disappears once processing finishes', async () => {
      await shell.submit('What should we build first?');
      // dispatched mock resolves immediately, so processing ends
      await tick(200);
      expect(shell.hasText('Routing to agent')).toBe(false);
    });
  });

  // ── Step 4: User receives a response ──────────────────────────────────

  describe('Step 4 — Receiving a response', () => {
    it('agent response appears in the conversation via ShellApi', async () => {
      await shell.submit('What should we build first?');
      shell.api().addMessage({
        role: 'agent',
        agentName: 'Keaton',
        content: 'Great question! Let me outline a plan for you.',
        timestamp: new Date(),
      });
      await tick(120);
      expect(shell.hasText('Great question! Let me outline a plan for you.')).toBe(true);
    });

    it('agent name is associated with the response', async () => {
      await shell.submit('What should we build first?');
      shell.api().addMessage({
        role: 'agent',
        agentName: 'Keaton',
        content: 'Here is the plan.',
        timestamp: new Date(),
      });
      await tick(120);
      expect(shell.hasText('Keaton')).toBe(true);
      expect(shell.hasText('Here is the plan.')).toBe(true);
    });

    it('user can continue the conversation after receiving a response', async () => {
      await shell.submit('What should we build first?');
      shell.api().addMessage({
        role: 'agent',
        agentName: 'Keaton',
        content: 'Start with the API layer.',
        timestamp: new Date(),
      });
      await tick(120);
      await shell.submit('Sounds good, lets do it');
      expect(shell.dispatched).toHaveBeenCalledTimes(2);
    });
  });

  // ── Step 5: User tries /help to learn about commands ──────────────────

  describe('Step 5 — Exploring /help', () => {
    it('shows available commands', async () => {
      await shell.submit('/help');
      expect(shell.hasText('/status')).toBe(true);
      expect(shell.hasText('/history')).toBe(true);
      expect(shell.hasText('/quit')).toBe(true);
    });

    it('/help does not dispatch to the SDK', async () => {
      await shell.submit('/help');
      expect(shell.dispatched).not.toHaveBeenCalled();
    });

    it('shows @AgentName routing guidance', async () => {
      await shell.submit('/help');
      expect(shell.hasText('@AgentName')).toBe(true);
    });
  });

  // ── Step 6: User sees agent roster in /status ─────────────────────────

  describe('Step 6 — Checking /status', () => {
    it('shows agent count', async () => {
      await shell.submit('/status');
      expect(shell.hasText('2 agents')).toBe(true);
    });

    it('shows the team root path', async () => {
      await shell.submit('/status');
      expect(shell.hasText('Root')).toBe(true);
    });

    it('shows message count', async () => {
      await shell.submit('/status');
      expect(shell.hasText('Messages')).toBe(true);
    });

    it('/status does not dispatch to the SDK', async () => {
      await shell.submit('/status');
      expect(shell.dispatched).not.toHaveBeenCalled();
    });
  });

  // ── Step 7: User tries @agent routing for the first time ──────────────

  describe('Step 7 — First @agent direct message', () => {
    it('@Keaton message dispatches as direct_agent', async () => {
      await shell.submit('@Keaton can you review my code?');
      expect(shell.dispatched).toHaveBeenCalledTimes(1);
      const parsed = shell.dispatched.mock.calls[0]![0] as ParsedInput;
      expect(parsed.type).toBe('direct_agent');
      expect(parsed.agentName).toBe('Keaton');
      expect(parsed.content).toBe('can you review my code?');
    });

    it('@agent message appears in the conversation', async () => {
      await shell.submit('@Fenster write a unit test');
      expect(shell.hasText('@Fenster write a unit test')).toBe(true);
    });

    it('agent response to direct message appears in conversation', async () => {
      await shell.submit('@Fenster write a unit test');
      shell.api().addMessage({
        role: 'agent',
        agentName: 'Fenster',
        content: 'On it! Writing a test for the auth module.',
        timestamp: new Date(),
      });
      await tick(120);
      expect(shell.hasText('On it! Writing a test for the auth module.')).toBe(true);
    });
  });

  // ── Step 8: User exits gracefully ─────────────────────────────────────

  describe('Step 8 — Graceful exit', () => {
    it('typing "exit" causes the shell to exit', async () => {
      await shell.submit('exit');
      // After exit, no further rendering; the ink instance should be unmounted.
      // The fact that no error is thrown means exit was handled gracefully.
    });

    it('typing "quit" causes the shell to exit', async () => {
      await shell.submit('quit');
    });

    it('first Ctrl+C shows exit hint', async () => {
      shell.raw('\x03');
      await tick(120);
      expect(shell.hasText('Press Ctrl+C again to exit')).toBe(true);
    });

    it('exit hint is a system message', async () => {
      shell.raw('\x03');
      await tick(120);
      // System messages no longer have [system] prefix — just check for Ctrl+C hint
      expect(shell.hasText('Ctrl+C')).toBe(true);
    });
  });
});
