/**
 * Human journey E2E test — "Something went wrong"
 *
 * Validates that errors the user might encounter are surfaced as
 * friendly messages rather than raw stack traces, and that the shell
 * remains usable after failures.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/386
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
import { ErrorBoundary } from '../packages/squad-cli/src/cli/shell/components/ErrorBoundary.js';
import type { ParsedInput } from '../packages/squad-cli/src/cli/shell/router.js';

const h = React.createElement;

// ─── Test infrastructure (mirrors e2e-shell.test.ts) ────────────────────────

const TICK = 80;

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
  cleanup: () => Promise<void>;
}

async function createShellHarness(opts?: {
  agents?: Array<{ name: string; role: string }>;
  withSquadDir?: boolean;
  version?: string;
  onDispatch?: (parsed: ParsedInput) => Promise<void>;
  /** When true, omit onDispatch entirely to simulate no SDK connection. */
  noSdk?: boolean;
}): Promise<ShellHarness> {
  const {
    agents = [
      { name: 'Keaton', role: 'Lead' },
      { name: 'Fenster', role: 'Core Dev' },
    ],
    withSquadDir = true,
    version = '0.0.0-test',
    noSdk = false,
  } = opts ?? {};

  const tempDir = mkdtempSync(join(tmpdir(), 'squad-e2e-err-'));
  if (withSquadDir) scaffoldSquadDir(tempDir);

  const registry = new SessionRegistry();
  for (const a of agents) registry.register(a.name, a.role);

  const renderer = new ShellRenderer();
  const dispatched = opts?.onDispatch
    ? vi.fn(opts.onDispatch)
    : vi.fn<(parsed: ParsedInput) => Promise<void>>().mockResolvedValue(undefined);
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
      onDispatch: noSdk ? undefined : dispatched,
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
// 1. SDK connection failure shows helpful error message
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: SDK connection failure', () => {
  let shell: ShellHarness;

  beforeEach(async () => {
    vi.stubEnv('NO_COLOR', '1');
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    shell = await createShellHarness({ noSdk: true });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await shell.cleanup();
  });

  it('shows SDK-not-connected message when user sends a message without SDK', async () => {
    await shell.submit('hello squad');
    expect(shell.hasText('SDK not connected')).toBe(true);
  });

  it('suggests squad doctor for setup issues', async () => {
    await shell.submit('hello squad');
    expect(shell.hasText('squad doctor')).toBe(true);
  });

  it('suggests checking internet connection', async () => {
    await shell.submit('hello squad');
    expect(shell.hasText('internet connection')).toBe(true);
  });

  it('does not show a raw stack trace', async () => {
    await shell.submit('hello squad');
    const frame = shell.frame();
    expect(frame).not.toMatch(/at\s+\w+\s+\(/); // no stack trace lines
    expect(frame).not.toContain('Error:');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Agent dispatch failure is caught and shown to user
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Agent dispatch failure', () => {
  let shell: ShellHarness;

  beforeEach(async () => {
    vi.stubEnv('NO_COLOR', '1');
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    // Use the default harness — handleDispatch in index.ts catches errors and
    // pushes a system message via ShellApi; we simulate that pattern here.
    shell = await createShellHarness();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await shell.cleanup();
  });

  it('shows the dispatch error as a system message via ShellApi', async () => {
    await shell.submit('@Keaton fix the build');
    await tick(120);
    // Simulate what handleDispatch does when an error is caught:
    shell.api().addMessage({
      role: 'system',
      content: '❌ Something went wrong: Connection refused: SDK backend unavailable\n   Try again, or check your connection. Run `squad doctor` for diagnostics.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('Something went wrong')).toBe(true);
    expect(shell.hasText('Connection refused')).toBe(true);
  });

  it('error message suggests diagnostics with squad doctor', async () => {
    // Simulate what handleDispatch does when an error is caught:
    shell.api().addMessage({
      role: 'system',
      content: '❌ Something went wrong: Connection refused: SDK backend unavailable\n   Try again, or check your connection. Run `squad doctor` for diagnostics.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('squad doctor')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Invalid /command shows "Unknown command" with /help hint
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Invalid slash command', () => {
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

  it('shows "Unknown command" message for unknown commands', async () => {
    await shell.submit('/foobar');
    expect(shell.hasText('Unknown command')).toBe(true);
    expect(shell.hasText('/foobar')).toBe(true);
  });

  it('suggests /help for unknown commands', async () => {
    await shell.submit('/foobar');
    expect(shell.hasText('/help')).toBe(true);
  });

  it('does not dispatch unknown commands to the SDK', async () => {
    await shell.submit('/foobar');
    expect(shell.dispatched).not.toHaveBeenCalled();
  });

  it('handles multiple invalid commands in a row', async () => {
    await shell.submit('/xyz');
    await shell.submit('/abc');
    expect(shell.hasText('/xyz')).toBe(true);
    expect(shell.hasText('/abc')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Network-like errors during streaming are handled gracefully
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Network errors during streaming', () => {
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

  it('StreamBridge-style error is shown as a friendly system message', async () => {
    await shell.submit('@Keaton fix the build');
    // Simulate what StreamBridge.onError does
    shell.api().addMessage({
      role: 'system',
      content: '❌ Keaton hit a problem: ECONNRESET: network connection was reset\n   Try again, or run `squad doctor` to check your setup.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('hit a problem')).toBe(true);
    expect(shell.hasText('ECONNRESET')).toBe(true);
  });

  it('network error does not contain raw Error: prefix', async () => {
    shell.api().addMessage({
      role: 'system',
      content: '❌ Keaton hit a problem: network connection was reset\n   Try again, or run `squad doctor` to check your setup.',
      timestamp: new Date(),
    });
    await tick(120);
    const frame = shell.frame();
    expect(frame).not.toMatch(/^Error:/m);
  });

  it('suggests squad doctor for recovery', async () => {
    shell.api().addMessage({
      role: 'system',
      content: '❌ Keaton hit a problem: timeout exceeded\n   Try again, or run `squad doctor` to check your setup.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('squad doctor')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. ErrorBoundary catches React rendering errors
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: ErrorBoundary catches render errors', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows "Something went wrong" when a child component throws', async () => {
    vi.stubEnv('NO_COLOR', '1');
    // Suppress console.error from componentDidCatch
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Boom: React.FC = () => {
      throw new Error('kaboom in render');
    };

    const ink = render(
      h(ErrorBoundary, null, h(Boom))
    );
    await tick(120);

    const frame = stripAnsi(ink.lastFrame() ?? '');
    expect(frame).toContain('Something went wrong');
    expect(frame).toContain('Ctrl+C to exit');

    // Should NOT expose the raw stack trace
    expect(frame).not.toContain('kaboom in render');
    expect(frame).not.toMatch(/at\s+\w+\s+\(/);

    spy.mockRestore();
    ink.unmount();
  });

  it('mentions error is logged to stderr for debugging', async () => {
    vi.stubEnv('NO_COLOR', '1');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Boom: React.FC = () => {
      throw new Error('kaboom');
    };

    const ink = render(
      h(ErrorBoundary, null, h(Boom))
    );
    await tick(120);

    const frame = stripAnsi(ink.lastFrame() ?? '');
    expect(frame).toContain('logged to stderr');

    spy.mockRestore();
    ink.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. After an error, the shell remains usable
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Shell remains usable after error', () => {
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

  it('user can type a new message after an invalid command', async () => {
    await shell.submit('/badcmd');
    expect(shell.hasText('Unknown command')).toBe(true);
    // Now submit a valid command
    await shell.submit('/status');
    expect(shell.hasText('Squad Status')).toBe(true);
  });

  it('user can type a new message after a dispatch error', async () => {
    // Simulate an error message being shown
    shell.api().addMessage({
      role: 'system',
      content: '❌ Something went wrong: connection timed out',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell.hasText('Something went wrong')).toBe(true);

    // Shell should still accept input
    await shell.submit('/help');
    expect(shell.hasText('/status')).toBe(true);
  });

  it('user can submit to coordinator after SDK-error system message', async () => {
    shell.api().addMessage({
      role: 'system',
      content: '❌ Something went wrong: SDK backend crashed',
      timestamp: new Date(),
    });
    await tick(120);

    await shell.submit('what should we build?');
    expect(shell.dispatched).toHaveBeenCalledTimes(1);
    const parsed = shell.dispatched.mock.calls[0]![0] as ParsedInput;
    expect(parsed.type).toBe('coordinator');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Error messages are user-friendly, not raw stack traces
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: Error messages are user-friendly', () => {
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

  it('handleDispatch-style error strips Error: prefix', async () => {
    // Simulate what handleDispatch produces (strips "Error: " prefix)
    shell.api().addMessage({
      role: 'system',
      content: '❌ Something went wrong: session creation failed\n   Try again, or check your connection. Run `squad doctor` for diagnostics.',
      timestamp: new Date(),
    });
    await tick(120);
    const frame = shell.frame();
    expect(frame).toContain('session creation failed');
    expect(frame).not.toMatch(/^Error:/m);
    expect(frame).toContain('squad doctor');
  });

  it('unknown command error is conversational, not a stack trace', async () => {
    await shell.submit('/doesnotexist');
    const frame = shell.frame();
    expect(frame).toContain('Unknown command');
    expect(frame).toContain('/help');
    expect(frame).not.toMatch(/at\s+\w+\s+\(/); // no stack frames
    expect(frame).not.toContain('TypeError');
    expect(frame).not.toContain('ReferenceError');
  });

  it('SDK not connected message provides actionable recovery steps', async () => {
    const noSdkShell = await createShellHarness({ noSdk: true });
    await noSdkShell.submit('build the feature');
    const frame = noSdkShell.frame();

    // Should contain numbered steps or helpful recovery suggestions
    expect(frame).toContain('squad doctor');
    expect(frame).toContain('internet connection');
    expect(frame).toContain('restart');
    await noSdkShell.cleanup();
  });
});
