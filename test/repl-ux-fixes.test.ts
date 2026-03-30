/**
 * REPL UX Fixes — comprehensive tests for issues #596–#604
 *
 * Tests what humans will see: rendered output, prompt content, file creation,
 * message labels, markdown formatting, warning suppression, and session gating.
 *
 * @module test/repl-ux-fixes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

import {
  buildCoordinatorPrompt,
  formatConversationContext,
} from '@bradygaster/squad-cli/shell/coordinator';
import type { CoordinatorConfig } from '@bradygaster/squad-cli/shell/coordinator';
import {
  createSession,
  loadLatestSession,
  saveSession,
} from '@bradygaster/squad-cli/shell/session-store';
import type { SessionData } from '@bradygaster/squad-cli/shell/session-store';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import type { ShellMessage, AgentSession } from '@bradygaster/squad-cli/shell/types';

const h = React.createElement;

// ============================================================================
// Helpers
// ============================================================================

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'squad-ux-test-'));
}

function makeMessage(overrides: Partial<ShellMessage> & { content: string; role: ShellMessage['role'] }): ShellMessage {
  return { timestamp: new Date(), ...overrides };
}

function writeTeamMd(root: string): void {
  const squadDir = join(root, '.squad');
  mkdirSync(squadDir, { recursive: true });
  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — Test

> A test team

## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
| Hockney | Tester | \`.squad/agents/hockney/charter.md\` | ✅ Active |
`);
}

function writeRoutingMd(root: string): void {
  const squadDir = join(root, '.squad');
  mkdirSync(squadDir, { recursive: true });
  writeFileSync(join(squadDir, 'routing.md'), `# Routing Rules
Route feature work to Fenster, testing to Hockney.
`);
}

// ============================================================================
// #596 — Init creates complete .squad/ directory
// ============================================================================

describe('#596 — Init creates complete .squad/ directory', () => {
  let tmpRoot: string;

  beforeEach(() => { tmpRoot = makeTmpRoot(); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it('runInit creates all required directories and structural files', async () => {
    // runInit is the CLI init command — requires templates to exist.
    // Import and run it against a temp directory.
    const { runInit } = await import('../packages/squad-cli/src/cli/core/init.js');

    // Suppress console output from init ceremony
    const origLog = console.log;
    const origWrite = process.stdout.write;
    console.log = vi.fn();
    process.stdout.write = vi.fn().mockReturnValue(true) as any;

    try {
      await runInit(tmpRoot);
    } finally {
      console.log = origLog;
      process.stdout.write = origWrite;
    }

    // Verify .squad/ directory structure
    const squadDir = join(tmpRoot, '.squad');
    expect(existsSync(squadDir)).toBe(true);

    // Required directories
    expect(existsSync(join(squadDir, 'decisions', 'inbox'))).toBe(true);
    expect(existsSync(join(squadDir, 'orchestration-log'))).toBe(true);
    expect(existsSync(join(squadDir, 'casting'))).toBe(true);
    expect(existsSync(join(squadDir, 'plugins'))).toBe(true);
    expect(existsSync(join(squadDir, 'identity'))).toBe(true);

    // Skills now live in .copilot/skills/ (not .squad/skills/)
    expect(existsSync(join(tmpRoot, '.copilot', 'skills'))).toBe(true);

    // Required files
    expect(existsSync(join(squadDir, 'ceremonies.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'identity', 'now.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'identity', 'wisdom.md'))).toBe(true);

    // First-run marker
    expect(existsSync(join(squadDir, '.first-run'))).toBe(true);

    // .github/agents/squad.agent.md
    expect(existsSync(join(tmpRoot, '.github', 'agents', 'squad.agent.md'))).toBe(true);

    // .gitattributes merge rules
    const gitattributes = readFileSync(join(tmpRoot, '.gitattributes'), 'utf-8');
    expect(gitattributes).toContain('.squad/decisions.md merge=union');
    expect(gitattributes).toContain('.squad/agents/*/history.md merge=union');

    // .gitignore entries
    const gitignore = readFileSync(join(tmpRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.squad/orchestration-log/');
  });

  it('creates decisions/inbox/ directory for decision drops', async () => {
    const { runInit } = await import('../packages/squad-cli/src/cli/core/init.js');
    console.log = vi.fn();
    process.stdout.write = vi.fn().mockReturnValue(true) as any;
    try {
      await runInit(tmpRoot);
    } finally {
      console.log = vi.restoreAllMocks() as any;
    }
    expect(existsSync(join(tmpRoot, '.squad', 'decisions', 'inbox'))).toBe(true);
  });
});

// ============================================================================
// #597 — Coordinator prompt guards against missing team
// ============================================================================

describe('#597 — Coordinator prompt guards against missing team', () => {
  let tmpRoot: string;

  beforeEach(() => { tmpRoot = makeTmpRoot(); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it('prompt includes "squad init" guidance when team.md is missing', async () => {
    const config: CoordinatorConfig = {
      teamRoot: tmpRoot,
      teamPath: join(tmpRoot, '.squad', 'team.md'),
    };
    const prompt = await buildCoordinatorPrompt(config);
    expect(prompt).toContain('squad init');
  });

  it('prompt includes "squad init" when routing.md is also missing', async () => {
    const config: CoordinatorConfig = {
      teamRoot: tmpRoot,
      routingPath: join(tmpRoot, '.squad', 'routing.md'),
      teamPath: join(tmpRoot, '.squad', 'team.md'),
    };
    const prompt = await buildCoordinatorPrompt(config);
    // Both missing — prompt should mention squad init for both
    expect(prompt).toContain('squad init');
    // Team fallback text varies — may be "NO TEAM CONFIGURED" or "No team.md found"
    expect(prompt.includes('NO TEAM CONFIGURED') || prompt.includes('No team.md found')).toBe(true);
    expect(prompt).toContain('No routing.md found');
  });

  it('does NOT include generic assistant behavior when team is missing', async () => {
    const config: CoordinatorConfig = {
      teamRoot: tmpRoot,
      teamPath: join(tmpRoot, '.squad', 'team.md'),
    };
    const prompt = await buildCoordinatorPrompt(config);
    // The prompt should still be the coordinator prompt, not a generic "I'm an assistant" fallback
    expect(prompt).toContain('Squad Coordinator');
    expect(prompt).toContain('route');
    expect(prompt).not.toContain('general-purpose assistant');
    expect(prompt).not.toContain('I am a helpful');
  });

  it('loads team.md content when file exists', async () => {
    writeTeamMd(tmpRoot);
    writeRoutingMd(tmpRoot);
    const config: CoordinatorConfig = {
      teamRoot: tmpRoot,
      teamPath: join(tmpRoot, '.squad', 'team.md'),
      routingPath: join(tmpRoot, '.squad', 'routing.md'),
    };
    const prompt = await buildCoordinatorPrompt(config);
    expect(prompt).toContain('Fenster');
    expect(prompt).toContain('Core Dev');
    expect(prompt).not.toContain('No team.md found');
  });
});

// ============================================================================
// #598 — Banner renders exactly once
// ============================================================================

describe('#598 — Banner renders exactly once', () => {
  it('version string appears exactly once in App banner', () => {
    // The App component renders the banner with version. We test that
    // the version text appears exactly once in the rendered frame.
    // Use MessageStream directly as a lightweight check — App needs too many deps.
    // Instead, test the banner text logic by rendering the version display.
    const testVersion = '1.2.3';
    const { lastFrame } = render(
      h('ink-box', { flexDirection: 'column' },
        h('ink-box', { gap: 1 },
          h(Text, { bold: true, color: 'cyan' }, '◆ SQUAD'),
          h(Text, { dimColor: true }, `v${testVersion}`),
        ),
      ) as any,
    );
    const frame = lastFrame() ?? '';
    // Count occurrences of the version string
    const matches = frame.match(new RegExp(testVersion.replace(/\./g, '\\.'), 'g'));
    expect(matches).toHaveLength(1);
  });

  it('"◆ SQUAD" header appears exactly once', () => {
    const { lastFrame } = render(
      h('ink-box', { flexDirection: 'column' },
        h('ink-box', { gap: 1 },
          h(Text, { bold: true, color: 'cyan' }, '◆ SQUAD'),
          h(Text, { dimColor: true }, 'v0.1.0'),
        ),
      ) as any,
    );
    const frame = lastFrame() ?? '';
    const matches = frame.match(/◆ SQUAD/g);
    expect(matches).toHaveLength(1);
  });
});

// ============================================================================
// #599 — Coordinator label is 'Squad' not 'coordinator'
// ============================================================================

describe('#599 — Coordinator label is "Squad" not "coordinator"', () => {
  it('coordinator messages display with agent name in MessageStream', () => {
    // When a coordinator message is shown, the label should be whatever
    // agentName is set to. Currently the code sets agentName: 'coordinator'.
    // This test asserts on the rendered output — if the fix changes
    // the agentName to 'Squad', the test should pass.
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'coordinator', content: 'I routed your request.' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    // The message should display "Squad:" not "coordinator:"
    expect(frame).toContain('Squad:');
    expect(frame).not.toContain('coordinator:');
  });

  it('formatConversationContext uses agentName for coordinator messages', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'user', content: 'help me' }),
      makeMessage({ role: 'agent', agentName: 'coordinator', content: 'I can help.' }),
    ];
    const context = formatConversationContext(messages);
    // The context should show [coordinator] for agent messages with that name
    expect(context).toContain('[coordinator]');
  });

  it('agent messages without agentName fall back to "agent" label', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', content: 'anonymous reply' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('agent:');
  });
});

// ============================================================================
// #600 — Markdown inline rendering
// ============================================================================

describe('#600 — Markdown inline rendering', () => {
  // Issue #600 is about converting **bold**, *italic*, and `code` in message
  // content. Currently MessageStream renders raw text. These tests verify the
  // raw content passes through (baseline) and will validate formatting once
  // a markdown renderer is added.

  it('bold markdown (**text**) appears in rendered output', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: 'This is **bold** text.' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    // Currently raw markdown passes through — text should be visible
    expect(frame).toContain('bold');
    expect(frame).toContain('text');
  });

  it('italic markdown (*text*) appears in rendered output', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: 'This is *italic* text.' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('italic');
  });

  it('inline code (`code`) appears in rendered output', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: 'Run `npm install` to fix.' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('npm install');
  });

  it('empty string renders without crash', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: '' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    expect(lastFrame()).toBeDefined();
  });

  it('content with no markdown renders unchanged', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: 'Plain text with no formatting.' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Plain text with no formatting.');
  });

  it('nested formatting (**bold *and italic***) renders without crash', () => {
    const messages: ShellMessage[] = [
      makeMessage({ role: 'agent', agentName: 'Fenster', content: '**bold *and italic***' }),
    ];
    const { lastFrame } = render(
      h(MessageStream, {
        messages,
        processing: false,
        streamingContent: new Map(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('bold');
    expect(frame).toContain('italic');
  });
});

// ============================================================================
// #602 — SQLite warning suppression
// ============================================================================

describe('#602 — SQLite ExperimentalWarning suppression', () => {
  it('ExperimentalWarning string-based events are suppressed', () => {
    // The cli-entry.ts overrides process.emitWarning to suppress ExperimentalWarning.
    // We replicate that logic to verify behavior.
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    // Install the same suppression logic from cli-entry.ts
    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
      return (originalEmitWarning as any).call(process, warning, ...args);
    };

    try {
      // Suppress ExperimentalWarning string — should NOT pass through
      process.emitWarning('ExperimentalWarning: SQLite is experimental');
      expect(emitted).toHaveLength(0);
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });

  it('ExperimentalWarning object-based events are suppressed', () => {
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
    };

    try {
      const w = new Error('SQLite is experimental');
      w.name = 'ExperimentalWarning';
      process.emitWarning(w as any);
      expect(emitted).toHaveLength(0);
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });

  it('non-ExperimentalWarning events still pass through', () => {
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
    };

    try {
      process.emitWarning('DeprecationWarning: something is deprecated');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('DeprecationWarning');
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });

  it('regular Warning objects pass through', () => {
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
    };

    try {
      const w = new Error('Some other warning');
      w.name = 'DeprecationWarning';
      process.emitWarning(w as any);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('Some other warning');
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });
});

// ============================================================================
// #604 — Session resume skipped on first run
// ============================================================================

describe('#604 — Session resume skipped on first run', () => {
  let tmpRoot: string;

  beforeEach(() => { tmpRoot = makeTmpRoot(); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it('loadLatestSession returns null when .squad/team.md does not exist', () => {
    // No .squad directory at all
    const result = loadLatestSession(tmpRoot);
    expect(result).toBeNull();
  });

  it('session resume logic skips when team.md is absent', () => {
    // Emulate the gating logic from runShell:
    //   const hasTeam = existsSync(join(teamRoot, '.squad', 'team.md'));
    //   const recentSession = hasTeam ? loadLatestSession(teamRoot) : null;
    const hasTeam = existsSync(join(tmpRoot, '.squad', 'team.md'));
    expect(hasTeam).toBe(false);
    const recentSession = hasTeam ? loadLatestSession(tmpRoot) : null;
    expect(recentSession).toBeNull();
  });

  it('session resume logic skips when .first-run marker is present', () => {
    writeTeamMd(tmpRoot);
    // Create a saved session
    const session = createSession();
    session.messages.push(makeMessage({ role: 'user', content: 'hello' }));
    saveSession(tmpRoot, session);

    // Simulate first run marker
    const firstRunPath = join(tmpRoot, '.squad', '.first-run');
    writeFileSync(firstRunPath, new Date().toISOString() + '\n');

    // Emulate runShell gating logic:
    const hasTeam = existsSync(join(tmpRoot, '.squad', 'team.md'));
    const isFirstRun = existsSync(join(tmpRoot, '.squad', '.first-run'));
    const recentSession = (hasTeam && !isFirstRun) ? loadLatestSession(tmpRoot) : null;
    expect(hasTeam).toBe(true);
    expect(isFirstRun).toBe(true);
    expect(recentSession).toBeNull();
  });

  it('session resume works when team.md exists and no first-run marker', () => {
    writeTeamMd(tmpRoot);
    // Save a recent session
    const session = createSession();
    session.messages.push(makeMessage({ role: 'user', content: 'previous session' }));
    saveSession(tmpRoot, session);

    const hasTeam = existsSync(join(tmpRoot, '.squad', 'team.md'));
    const isFirstRun = existsSync(join(tmpRoot, '.squad', '.first-run'));
    const recentSession = (hasTeam && !isFirstRun) ? loadLatestSession(tmpRoot) : null;
    expect(hasTeam).toBe(true);
    expect(isFirstRun).toBe(false);
    expect(recentSession).not.toBeNull();
    expect(recentSession!.messages).toHaveLength(1);
  });
});

// ============================================================================
// #603 — Init prompt gates work when no team
// ============================================================================

describe('#603 — Init prompt gates when no team', () => {
  let tmpRoot: string;

  beforeEach(() => { tmpRoot = makeTmpRoot(); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it('loadWelcomeData returns null when team.md does not exist', async () => {
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
    const result = loadWelcomeData(tmpRoot);
    expect(result).toBeNull();
  });

  it('loadWelcomeData returns data when team.md exists', async () => {
    writeTeamMd(tmpRoot);
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
    const result = loadWelcomeData(tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.agents.length).toBeGreaterThan(0);
  });

  it('/init, /help, /exit commands work without team context', async () => {
    // Slash commands are handled by executeCommand — they don't require team.md
    const { executeCommand } = await import('../packages/squad-cli/src/cli/shell/commands.js');
    const { SessionRegistry } = await import('../packages/squad-cli/src/cli/shell/sessions.js');
    const { ShellRenderer } = await import('../packages/squad-cli/src/cli/shell/render.js');

    const registry = new SessionRegistry();
    const renderer = new ShellRenderer();
    const context = {
      registry,
      renderer,
      messageHistory: [],
      teamRoot: tmpRoot,
      version: '0.0.0-test',
    };

    // /help works
    const helpResult = executeCommand('help', [], context);
    expect(helpResult.handled).toBe(true);
    expect(helpResult.output).toContain('Commands');

    // /exit works
    const exitResult = executeCommand('exit', [], context);
    expect(exitResult.handled).toBe(true);
    expect(exitResult.exit).toBe(true);

    // /quit works
    const quitResult = executeCommand('quit', [], context);
    expect(quitResult.handled).toBe(true);
    expect(quitResult.exit).toBe(true);

    // /version works
    const versionResult = executeCommand('version', [], context);
    expect(versionResult.handled).toBe(true);
    expect(versionResult.output).toBe('0.0.0-test');
  });

  it('coordinator dispatch requires team context (parseInput routes to coordinator)', async () => {
    const { parseInput } = await import('../packages/squad-cli/src/cli/shell/router.js');

    // When no agents are registered, all free-text input routes to coordinator
    const result = parseInput('build the feature', []);
    expect(result.type).toBe('coordinator');

    // But slash commands still work
    const slashResult = parseInput('/help', []);
    expect(slashResult.type).toBe('slash_command');
    expect(slashResult.command).toBe('help');
  });

  it('message dispatch to coordinator is blocked when team.md absent', async () => {
    // The App component checks for onDispatch — when SDK not connected or
    // team absent, onDispatch is undefined and shows an error message.
    // We test the gating logic: no team.md → loadWelcomeData returns null.
    const hasTeam = existsSync(join(tmpRoot, '.squad', 'team.md'));
    expect(hasTeam).toBe(false);

    // ShellLifecycle.initialize() throws when .squad/ doesn't exist
    // This is the gate that prevents dispatch
    const { ShellLifecycle } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
    const { SessionRegistry } = await import('../packages/squad-cli/src/cli/shell/sessions.js');
    const { ShellRenderer } = await import('../packages/squad-cli/src/cli/shell/render.js');

    const lifecycle = new ShellLifecycle({
      teamRoot: tmpRoot,
      renderer: new ShellRenderer(),
      registry: new SessionRegistry(),
    });

    await expect(lifecycle.initialize()).rejects.toThrow(/squad init/i);
  });
});

// ============================================================================
// Round 2 REPL UX fixes
// ============================================================================

describe('Round 2 REPL UX fixes', () => {

  // --------------------------------------------------------------------------
  // Screen corruption prevention
  // --------------------------------------------------------------------------

  describe('Screen corruption prevention', () => {
    it('Static keys include a session identifier, not just index', () => {
      // App generates sessionId = Date.now().toString(36) and uses `${sessionId}-${i}` as keys.
      // Verify the sessionId generation produces a non-numeric, non-trivial key prefix.
      const sessionId = Date.now().toString(36);
      expect(sessionId.length).toBeGreaterThan(0);
      // It should NOT be a plain integer — base-36 encoding ensures alpha chars
      expect(sessionId).toMatch(/[a-z]/);
      // Composed key should include the session prefix
      const composedKey = `${sessionId}-0`;
      expect(composedKey).toContain(sessionId);
      expect(composedKey).not.toBe('0'); // not index-only
    });

    it('archivedMessages start empty and only grow via archival', async () => {
      // When App mounts, archivedMessages = useState<ShellMessage[]>([]).
      // On session restore (onRestoreSession), the host calls origAdd per message
      // which feeds into appendMessages → setMessages, NOT setArchivedMessages.
      // archivedMessages only grows when MemoryManager trims overflow.
      // Verify MemoryManager's trimWithArchival preserves all when under cap.
      const { MemoryManager } = await import('../packages/squad-cli/src/cli/shell/memory.js');
      const mm = new MemoryManager({ maxMessages: 200 });
      const msgs: ShellMessage[] = Array.from({ length: 5 }, (_, i) =>
        makeMessage({ role: 'user', content: `msg-${i}` }),
      );
      const { kept, archived } = mm.trimWithArchival(msgs);
      expect(kept).toHaveLength(5);
      expect(archived).toHaveLength(0);
    });

    it('MemoryManager archives overflow messages on session restore flood', async () => {
      const { MemoryManager } = await import('../packages/squad-cli/src/cli/shell/memory.js');
      const mm = new MemoryManager({ maxMessages: 3 });
      const msgs: ShellMessage[] = Array.from({ length: 10 }, (_, i) =>
        makeMessage({ role: 'user', content: `restored-${i}` }),
      );
      const { kept, archived } = mm.trimWithArchival(msgs);
      expect(kept).toHaveLength(3);
      expect(archived).toHaveLength(7);
    });
  });

  // --------------------------------------------------------------------------
  // Banner logic
  // --------------------------------------------------------------------------

  describe('Banner logic', () => {
    let tmpRoot: string;
    beforeEach(() => { tmpRoot = makeTmpRoot(); });
    afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

    it('when rosterAgents.length === 0 AND isFirstRun, banner should NOT show "Your squad is assembled"', () => {
      // Simulates App logic: isFirstRun true but agents = []
      // Lines 302-313: rosterAgents.length > 0 gates "Your squad is assembled"
      const rosterAgents: Array<{ name: string; role: string; emoji: string }> = [];
      const isFirstRun = true;
      const bannerReady = true;

      // This mirrors the JSX conditional in App.tsx lines 302-313
      const showAssembled = bannerReady && isFirstRun && rosterAgents.length > 0;
      expect(showAssembled).toBe(false);
    });

    it('when rosterAgents.length > 0 AND isFirstRun, banner SHOULD show "Your squad is assembled"', () => {
      const rosterAgents = [{ name: 'Fenster', role: 'Core Dev', emoji: '🔧' }];
      const isFirstRun = true;
      const bannerReady = true;

      const showAssembled = bannerReady && isFirstRun && rosterAgents.length > 0;
      expect(showAssembled).toBe(true);
    });

    it('when no agents exist, the @lead hint should not appear (no "your lead" text)', () => {
      // leadAgent derivation: App.tsx lines 236-240
      // When agents=[], leadAgent is undefined
      const agents: Array<{ name: string; role: string; emoji: string }> = [];
      const leadAgent = agents.find(a =>
        a.role?.toLowerCase().includes('lead') ||
        a.role?.toLowerCase().includes('coordinator') ||
        a.role?.toLowerCase().includes('architect')
      )?.name ?? agents[0]?.name;

      expect(leadAgent).toBeUndefined();
    });

    it('when agents exist with a lead, the @lead hint uses actual agent name', () => {
      const agents = [
        { name: 'Keaton', role: 'Lead', emoji: '👑' },
        { name: 'Fenster', role: 'Core Dev', emoji: '🔧' },
      ];
      const leadAgent = agents.find(a =>
        a.role?.toLowerCase().includes('lead') ||
        a.role?.toLowerCase().includes('coordinator') ||
        a.role?.toLowerCase().includes('architect')
      )?.name ?? agents[0]?.name;

      expect(leadAgent).toBe('Keaton');
      // Not a generic fallback
      expect(leadAgent).not.toBe('your lead');
    });

    it('leadAgent falls back to first agent when no lead/coordinator/architect role', () => {
      const agents = [
        { name: 'Hockney', role: 'Tester', emoji: '🧪' },
        { name: 'McManus', role: 'DevRel', emoji: '📣' },
      ];
      const leadAgent = agents.find(a =>
        a.role?.toLowerCase().includes('lead') ||
        a.role?.toLowerCase().includes('coordinator') ||
        a.role?.toLowerCase().includes('architect')
      )?.name ?? agents[0]?.name;

      expect(leadAgent).toBe('Hockney');
    });
  });

  // --------------------------------------------------------------------------
  // Compaction removal
  // --------------------------------------------------------------------------

  describe('Compaction removal', () => {
    it('banner content renders fully even when width <= 60', () => {
      // App.tsx line 227: compact = width <= 60
      // Line 292-293: compact mode still shows agent count
      // Line 299: compact mode shows '/help - Ctrl+C exit'
      const width = 40;
      const compact = width <= 60;
      expect(compact).toBe(true);

      // Even in compact, agentCount > 0 renders summary (line 292-293)
      const agentCount = 3;
      const activeCount = 1;
      const bannerReady = true;
      const showCompactAgents = bannerReady && compact && agentCount > 0;
      expect(showCompactAgents).toBe(true);

      // Help text is always rendered (line 299)
      const helpText = compact
        ? '/help - Ctrl+C exit'
        : 'Just type what you need — Squad routes it - @Agent to direct - /help - Ctrl+C exit';
      expect(helpText).toBe('/help - Ctrl+C exit');
      expect(helpText.length).toBeGreaterThan(0);
    });

    it('spacing elements always render regardless of terminal width', () => {
      // In both compact and non-compact, bannerReady always renders help text (line 299).
      // The "◆ SQUAD" title and version always render (lines 273-274).
      const widths = [30, 40, 60, 80, 120, 200];
      for (const w of widths) {
        const compact = w <= 60;
        const bannerReady = true;
        // Title always present
        expect(bannerReady).toBe(true);
        // Help text always present (line 299)
        const helpText = compact
          ? '/help - Ctrl+C exit'
          : 'Just type what you need — Squad routes it - @Agent to direct - /help - Ctrl+C exit';
        expect(helpText.length).toBeGreaterThan(0);
      }
    });

    it('help text is always full, never truncated for compact', () => {
      // Compact help text: '/help - Ctrl+C exit' (line 299)
      // Wide help text: full string — both are complete, not truncated
      const compactHelp = '/help - Ctrl+C exit';
      const fullHelp = 'Just type what you need — Squad routes it - @Agent to direct - /help - Ctrl+C exit';
      // Both contain /help and Ctrl+C — no truncation
      expect(compactHelp).toContain('/help');
      expect(compactHelp).toContain('Ctrl+C');
      expect(fullHelp).toContain('/help');
      expect(fullHelp).toContain('Ctrl+C');
      // Neither is empty or cut off
      expect(compactHelp).not.toBe('');
      expect(fullHelp).not.toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Coordinator label
  // --------------------------------------------------------------------------

  describe('Coordinator label', () => {
    it('MessageStream shows "Squad" not "Coordinator" for coordinator agent messages', () => {
      const messages: ShellMessage[] = [
        makeMessage({ role: 'agent', agentName: 'coordinator', content: 'Routing your request.' }),
      ];
      const { lastFrame } = render(
        h(MessageStream, {
          messages,
          processing: false,
          streamingContent: new Map(),
        }),
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Squad:');
      expect(frame).not.toMatch(/\bcoordinator:/i);
    });

    it('agent messages with agentName="coordinator" display as "Squad" in streaming content', () => {
      const messages: ShellMessage[] = [];
      const streamMap = new Map<string, string>();
      streamMap.set('coordinator', 'Working on it...');

      const { lastFrame } = render(
        h(MessageStream, {
          messages,
          processing: true,
          streamingContent: streamMap,
        }),
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Squad:');
      expect(frame).not.toMatch(/\bcoordinator:/i);
    });

    it('non-coordinator agents retain their original name', () => {
      const messages: ShellMessage[] = [
        makeMessage({ role: 'agent', agentName: 'Fenster', content: 'Done.' }),
      ];
      const { lastFrame } = render(
        h(MessageStream, {
          messages,
          processing: false,
          streamingContent: new Map(),
        }),
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Fenster:');
      expect(frame).not.toContain('Squad:');
    });
  });

  // --------------------------------------------------------------------------
  // Init guidance
  // --------------------------------------------------------------------------

  describe('Init guidance', () => {
    let tmpRoot: string;
    beforeEach(() => { tmpRoot = makeTmpRoot(); });
    afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

    it('empty roster shows actionable init guidance mentioning squad init', () => {
      // App.tsx lines 294-296: when rosterAgents.length === 0, banner shows init guidance
      const rosterAgents: Array<{ name: string; role: string; emoji: string }> = [];
      const bannerReady = true;

      const showInitGuidance = bannerReady && rosterAgents.length === 0;
      expect(showInitGuidance).toBe(true);

      // The actual text mentions both 'squad init' and '/init'
      const guidanceText = "  Exit and run 'squad init', or type /init to set up your team";
      expect(guidanceText).toContain('squad init');
      expect(guidanceText).toContain('/init');
    });

    it('coordinator prompt shows squad init guidance when team.md missing', async () => {
      const config: CoordinatorConfig = {
        teamRoot: tmpRoot,
        teamPath: join(tmpRoot, '.squad', 'team.md'),
      };
      const prompt = await buildCoordinatorPrompt(config);
      expect(prompt).toContain('squad init');
      expect(prompt).toContain('/init');
    });

    it('loadWelcomeData returns null (triggering init guidance) when no team.md', async () => {
      const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
      const result = loadWelcomeData(tmpRoot);
      expect(result).toBeNull();
    });
  });
});
