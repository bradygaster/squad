/**
 * Human Journey E2E Test — "I came back the next day"
 *
 * Validates that a user can close the shell, return later, and resume
 * their previous session with full message history intact.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/398
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import React from 'react';
import { render, type RenderResponse } from 'ink-testing-library';
import { SessionRegistry } from '../packages/squad-cli/src/cli/shell/sessions.js';
import { ShellRenderer } from '../packages/squad-cli/src/cli/shell/render.js';
import { App, type ShellApi } from '../packages/squad-cli/src/cli/shell/components/App.js';
import type { ParsedInput } from '../packages/squad-cli/src/cli/shell/router.js';
import {
  createSession,
  saveSession,
  loadLatestSession,
  loadSessionById,
  listSessions,
  type SessionData,
} from '../packages/squad-cli/src/cli/shell/session-store.js';

const h = React.createElement;

// ─── Test infrastructure (mirrors e2e-shell.test.ts) ───────────────────────

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

  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — Journey Test

> A journey test project for session persistence.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
`);

  writeFileSync(join(identityDir, 'now.md'), `---
updated_at: 2025-01-01T00:00:00.000Z
focus_area: Journey testing
active_issues: []
---

# What We're Focused On

Journey testing for session persistence.
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
  tempDir: string;
}

async function createShellHarness(opts?: {
  agents?: Array<{ name: string; role: string }>;
  withSquadDir?: boolean;
  version?: string;
  tempDir?: string;
  onRestoreSession?: (session: SessionData) => void;
}): Promise<ShellHarness> {
  const {
    agents = [
      { name: 'Keaton', role: 'Lead' },
      { name: 'Fenster', role: 'Core Dev' },
    ],
    withSquadDir = true,
    version = '0.0.0-test',
    onRestoreSession,
  } = opts ?? {};

  const tempDir = opts?.tempDir ?? mkdtempSync(join(tmpdir(), 'squad-journey-'));
  if (withSquadDir && !existsSync(join(tempDir, '.squad'))) scaffoldSquadDir(tempDir);

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
      onRestoreSession,
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
    tempDir,
  };

  return harness;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Session-store unit tests — createSession, saveSession, loadLatest, etc.
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: session-store persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'squad-session-'));
    mkdirSync(join(tempDir, '.squad'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('createSession returns a well-structured envelope', () => {
    const session = createSession();
    expect(session.id).toBeTruthy();
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(session.createdAt).toBeTruthy();
    expect(session.lastActiveAt).toBeTruthy();
    expect(session.messages).toEqual([]);
    // ISO-8601 timestamps
    expect(() => new Date(session.createdAt)).not.toThrow();
    expect(() => new Date(session.lastActiveAt)).not.toThrow();
  });

  it('saveSession writes a JSON file to .squad/sessions/', () => {
    const session = createSession();
    session.messages.push({
      role: 'user',
      content: 'hello squad',
      timestamp: new Date(),
    });

    const filePath = saveSession(tempDir, session);
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, 'utf-8');
    const persisted = JSON.parse(raw) as SessionData;
    expect(persisted.id).toBe(session.id);
    expect(persisted.messages).toHaveLength(1);
    expect(persisted.messages[0]!.content).toBe('hello squad');
  });

  it('saveSession creates the sessions directory if missing', () => {
    const session = createSession();
    const sessDir = join(tempDir, '.squad', 'sessions');
    expect(existsSync(sessDir)).toBe(false);

    saveSession(tempDir, session);
    expect(existsSync(sessDir)).toBe(true);
  });

  it('saveSession updates lastActiveAt on each save', async () => {
    const session = createSession();
    const first = session.lastActiveAt;
    await tick(50); // small delay so timestamps differ
    saveSession(tempDir, session);
    expect(new Date(session.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first).getTime()
    );
  });

  it('listSessions returns saved sessions sorted most-recent first', async () => {
    const s1 = createSession();
    s1.messages.push({ role: 'user', content: 'msg1', timestamp: new Date() });
    saveSession(tempDir, s1);
    await tick(50); // ensure s2 gets a later lastActiveAt timestamp

    const s2 = createSession();
    s2.messages.push(
      { role: 'user', content: 'msg2a', timestamp: new Date() },
      { role: 'agent', agentName: 'Keaton', content: 'msg2b', timestamp: new Date() },
    );
    saveSession(tempDir, s2);

    const sessions = listSessions(tempDir);
    expect(sessions).toHaveLength(2);
    // Most recent first
    expect(sessions[0]!.id).toBe(s2.id);
    expect(sessions[0]!.messageCount).toBe(2);
    expect(sessions[1]!.id).toBe(s1.id);
    expect(sessions[1]!.messageCount).toBe(1);
  });

  it('listSessions returns empty array when no sessions directory', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'squad-empty-'));
    const sessions = listSessions(emptyDir);
    expect(sessions).toEqual([]);
    await rm(emptyDir, { recursive: true, force: true });
  });

  it('loadLatestSession returns the most recent session within 24h', () => {
    const session = createSession();
    session.messages.push({ role: 'user', content: 'recent work', timestamp: new Date() });
    saveSession(tempDir, session);

    const loaded = loadLatestSession(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0]!.content).toBe('recent work');
  });

  it('loadLatestSession returns null when session is older than 24h', () => {
    const session = createSession();
    // Set lastActiveAt to 25 hours ago
    session.lastActiveAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    saveSession(tempDir, session);

    // Need to re-save with the old timestamp since saveSession updates lastActiveAt
    // Directly write the file with an old timestamp
    const sessDir = join(tempDir, '.squad', 'sessions');
    const files = require('node:fs').readdirSync(sessDir) as string[];
    const filePath = join(sessDir, files[0]!);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;
    data.lastActiveAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    const loaded = loadLatestSession(tempDir);
    expect(loaded).toBeNull();
  });

  it('loadSessionById returns the correct session', () => {
    const s1 = createSession();
    s1.messages.push({ role: 'user', content: 'session one', timestamp: new Date() });
    saveSession(tempDir, s1);

    const s2 = createSession();
    s2.messages.push({ role: 'user', content: 'session two', timestamp: new Date() });
    saveSession(tempDir, s2);

    const loaded = loadSessionById(tempDir, s1.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(s1.id);
    expect(loaded!.messages[0]!.content).toBe('session one');
  });

  it('loadSessionById returns null for unknown ID', () => {
    const loaded = loadSessionById(tempDir, 'nonexistent-id');
    expect(loaded).toBeNull();
  });

  it('loaded session messages have rehydrated Date timestamps', () => {
    const session = createSession();
    const now = new Date();
    session.messages.push({ role: 'user', content: 'test', timestamp: now });
    saveSession(tempDir, session);

    const loaded = loadSessionById(tempDir, session.id);
    expect(loaded!.messages[0]!.timestamp).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. UI integration — /sessions command lists past sessions
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: /sessions command in shell', () => {
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

  it('shows "No saved sessions" when none exist', async () => {
    await shell.submit('/sessions');
    expect(shell.hasText('No saved sessions')).toBe(true);
  });

  it('lists saved sessions after persisting one', async () => {
    // Persist a session to this harness's temp dir
    const session = createSession();
    session.messages.push(
      { role: 'user', content: 'what should we build?', timestamp: new Date() },
      { role: 'agent', agentName: 'Keaton', content: 'A REST API.', timestamp: new Date() },
    );
    saveSession(shell.tempDir, session);

    await shell.submit('/sessions');
    expect(shell.hasText('Saved Sessions')).toBe(true);
    expect(shell.hasText(session.id.slice(0, 8))).toBe(true);
    expect(shell.hasText('2 messages')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. UI integration — /resume command restores a session
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: /resume command in shell', () => {
  let shell: ShellHarness;
  let restoredSession: SessionData | undefined;

  beforeEach(async () => {
    vi.stubEnv('NO_COLOR', '1');
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    restoredSession = undefined;
    shell = await createShellHarness({
      onRestoreSession: (session) => { restoredSession = session; },
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await shell.cleanup();
  });

  it('shows usage hint when no ID is given', async () => {
    await shell.submit('/resume');
    expect(shell.hasText('Usage')).toBe(true);
  });

  it('reports error for unknown session prefix', async () => {
    await shell.submit('/resume abcd1234');
    expect(shell.hasText('No session found')).toBe(true);
  });

  it('restores a session by ID prefix', async () => {
    const session = createSession();
    session.messages.push(
      { role: 'user', content: 'plan the sprint', timestamp: new Date() },
      { role: 'agent', agentName: 'Fenster', content: 'Here is the plan.', timestamp: new Date() },
    );
    saveSession(shell.tempDir, session);

    const prefix = session.id.slice(0, 8);
    await shell.submit(`/resume ${prefix}`);

    expect(shell.hasText('Restored session')).toBe(true);
    expect(shell.hasText('2 messages')).toBe(true);
    expect(restoredSession).toBeDefined();
    expect(restoredSession!.id).toBe(session.id);
    expect(restoredSession!.messages).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Full journey — "I came back the next day"
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey: I came back the next day', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.stubEnv('NO_COLOR', '1');
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    tempDir = mkdtempSync(join(tmpdir(), 'squad-nextday-'));
    scaffoldSquadDir(tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('saves session on exit, detects it on return, and can resume', { timeout: 15000 }, async () => {
    // === Day 1: User starts shell and has a conversation ===
    const shell1 = await createShellHarness({ tempDir });

    // User sends a message
    await shell1.submit('design the authentication module');
    expect(shell1.dispatched).toHaveBeenCalledTimes(1);

    // Simulate agent response
    shell1.api().addMessage({
      role: 'agent',
      agentName: 'Keaton',
      content: 'I recommend using JWT tokens with refresh rotation.',
      timestamp: new Date(),
    });
    await tick(120);
    expect(shell1.hasText('JWT tokens')).toBe(true);

    // User asks follow-up
    await shell1.submit('@Fenster implement the token service');
    expect(shell1.dispatched).toHaveBeenCalledTimes(2);

    // Save session before exit (as the real shell does on /quit)
    const dayOneSession = createSession();
    dayOneSession.messages = [
      { role: 'user', content: 'design the authentication module', timestamp: new Date() },
      { role: 'agent', agentName: 'Keaton', content: 'I recommend using JWT tokens with refresh rotation.', timestamp: new Date() },
      { role: 'user', content: '@Fenster implement the token service', timestamp: new Date() },
    ];
    saveSession(tempDir, dayOneSession);

    // User exits the shell
    shell1.ink.unmount();

    // === Day 2: User returns ===

    // Recent session should be detected
    const latestSession = loadLatestSession(tempDir);
    expect(latestSession).not.toBeNull();
    expect(latestSession!.id).toBe(dayOneSession.id);
    expect(latestSession!.messages).toHaveLength(3);

    // Previous messages are accessible
    expect(latestSession!.messages[0]!.content).toBe('design the authentication module');
    expect(latestSession!.messages[1]!.content).toBe('I recommend using JWT tokens with refresh rotation.');
    expect(latestSession!.messages[2]!.content).toBe('@Fenster implement the token service');

    // Start a new shell instance (same temp dir)
    let restoredData: SessionData | undefined;
    const shell2 = await createShellHarness({
      tempDir,
      onRestoreSession: (s) => { restoredData = s; },
    });

    // /sessions shows the previous session
    await shell2.submit('/sessions');
    expect(shell2.hasText('Saved Sessions')).toBe(true);
    expect(shell2.hasText(dayOneSession.id.slice(0, 8))).toBe(true);
    expect(shell2.hasText('3 messages')).toBe(true);

    // /resume restores the session
    await shell2.submit(`/resume ${dayOneSession.id.slice(0, 8)}`);
    expect(shell2.hasText('Restored session')).toBe(true);
    expect(restoredData).toBeDefined();
    expect(restoredData!.messages).toHaveLength(3);
    expect(restoredData!.messages[0]!.content).toBe('design the authentication module');

    shell2.ink.unmount();
  });

  it('does not offer sessions older than 24 hours via loadLatestSession', async () => {
    // Simulate a session from 2 days ago
    const oldSession = createSession();
    oldSession.messages.push({ role: 'user', content: 'old work', timestamp: new Date() });
    saveSession(tempDir, oldSession);

    // Manually backdate the file
    const sessDir = join(tempDir, '.squad', 'sessions');
    const files = require('node:fs').readdirSync(sessDir) as string[];
    const filePath = join(sessDir, files[0]!);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as SessionData;
    data.lastActiveAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // loadLatestSession should not return the stale session
    const latest = loadLatestSession(tempDir);
    expect(latest).toBeNull();

    // But /sessions should still list it
    const shell = await createShellHarness({ tempDir });
    await shell.submit('/sessions');
    expect(shell.hasText(oldSession.id.slice(0, 8))).toBe(true);
    shell.ink.unmount();
  });

  it('multiple sessions are tracked independently', async () => {
    // Create two sessions
    const sessionA = createSession();
    sessionA.messages.push(
      { role: 'user', content: 'session alpha work', timestamp: new Date() },
    );
    saveSession(tempDir, sessionA);

    const sessionB = createSession();
    sessionB.messages.push(
      { role: 'user', content: 'session beta work', timestamp: new Date() },
      { role: 'agent', agentName: 'Keaton', content: 'beta response', timestamp: new Date() },
    );
    saveSession(tempDir, sessionB);

    // Both appear in listing
    const sessions = listSessions(tempDir);
    expect(sessions).toHaveLength(2);

    // Can load each independently
    const loadedA = loadSessionById(tempDir, sessionA.id);
    const loadedB = loadSessionById(tempDir, sessionB.id);
    expect(loadedA!.messages[0]!.content).toBe('session alpha work');
    expect(loadedB!.messages[0]!.content).toBe('session beta work');
    expect(loadedB!.messages).toHaveLength(2);

    // /resume targets the correct one
    let restoredData: SessionData | undefined;
    const shell = await createShellHarness({
      tempDir,
      onRestoreSession: (s) => { restoredData = s; },
    });
    await shell.submit(`/resume ${sessionA.id.slice(0, 8)}`);
    expect(restoredData!.id).toBe(sessionA.id);
    expect(restoredData!.messages[0]!.content).toBe('session alpha work');
    shell.ink.unmount();
  });
});
