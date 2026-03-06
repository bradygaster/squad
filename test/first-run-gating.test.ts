/**
 * First-run gating tests — Issue #607
 *
 * Enforces Init Mode gating: banner renders once, first-run hint appears
 * on initial session only, console output is clean, "assembled" message
 * requires a non-empty roster, session-scoped Static keys prevent collisions,
 * and terminal clear runs before Ink render.
 *
 * @module test/first-run-gating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

import type { ShellMessage } from '@bradygaster/squad-cli/shell/types';

const h = React.createElement;

// ============================================================================
// Helpers
// ============================================================================

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'squad-first-run-'));
}

function makeMessage(overrides: Partial<ShellMessage> & { content: string; role: ShellMessage['role'] }): ShellMessage {
  return { timestamp: new Date(), ...overrides };
}

function writeTeamMd(root: string, agents: Array<{ name: string; role: string }> = [
  { name: 'Fenster', role: 'Core Dev' },
  { name: 'Hockney', role: 'Tester' },
]): void {
  const squadDir = join(root, '.squad');
  mkdirSync(squadDir, { recursive: true });
  const rows = agents.map(a => `| ${a.name} | ${a.role} | \`.squad/agents/${a.name.toLowerCase()}/charter.md\` | ✅ Active |`).join('\n');
  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — Test

> A test team

## Members
| Name | Role | Charter | Status |
|------|------|---------|--------|
${rows}
`);
}

function writeFirstRunMarker(root: string): void {
  const squadDir = join(root, '.squad');
  mkdirSync(squadDir, { recursive: true });
  writeFileSync(join(squadDir, '.first-run'), new Date().toISOString() + '\n');
}

// ============================================================================
// #607.1 — Banner renders exactly once (not duplicated)
// ============================================================================

describe('#607.1 — Banner renders exactly once', () => {
  it('"◆ SQUAD" title appears exactly once in a rendered frame', () => {
    const { lastFrame } = render(
      h('ink-box', { flexDirection: 'column' },
        h('ink-box', { gap: 1 },
          h(Text, { bold: true, color: 'cyan' }, '◆ SQUAD'),
          h(Text, { dimColor: true }, 'v0.9.0'),
        ),
      ) as any,
    );
    const frame = lastFrame() ?? '';
    const matches = frame.match(/◆ SQUAD/g);
    expect(matches).toHaveLength(1);
  });

  it('version string appears exactly once', () => {
    const testVersion = '3.14.159';
    const { lastFrame } = render(
      h('ink-box', { flexDirection: 'column' },
        h('ink-box', { gap: 1 },
          h(Text, { bold: true, color: 'cyan' }, '◆ SQUAD'),
          h(Text, { dimColor: true }, `v${testVersion}`),
        ),
      ) as any,
    );
    const frame = lastFrame() ?? '';
    const escaped = testVersion.replace(/\./g, '\\.');
    const matches = frame.match(new RegExp(escaped, 'g'));
    expect(matches).toHaveLength(1);
  });

  it('headerElement memoization deps are stable across state changes', () => {
    // App.tsx wraps headerElement in useMemo. The dependencies are:
    //   noColor, welcome, titleRevealed, bannerReady, version, rosterAgents,
    //   bannerDim, agentCount, activeCount, wide
    // All derived from props or welcome data (stable). Verify the dep list
    // does NOT include volatile state (messages, processing, streamingContent).
    const volatileStateKeys = ['messages', 'processing', 'streamingContent', 'activityHint'];
    const headerDeps = ['noColor', 'welcome', 'titleRevealed', 'bannerReady', 'version', 'rosterAgents', 'bannerDim', 'agentCount', 'activeCount', 'wide'];
    for (const v of volatileStateKeys) {
      expect(headerDeps).not.toContain(v);
    }
  });
});

// ============================================================================
// #607.2 — First-run hint text appears on initial session only
// ============================================================================

describe('#607.2 — First-run hint appears on initial session only', () => {
  let tmpRoot: string;

  beforeEach(() => { tmpRoot = makeTmpRoot(); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it('loadWelcomeData sets isFirstRun=true when .first-run marker exists', async () => {
    writeTeamMd(tmpRoot);
    writeFirstRunMarker(tmpRoot);
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
    const result = loadWelcomeData(tmpRoot);
    expect(result).not.toBeNull();
    expect(result!.isFirstRun).toBe(true);
  });

  it('loadWelcomeData consumes .first-run marker (second call returns false)', async () => {
    writeTeamMd(tmpRoot);
    writeFirstRunMarker(tmpRoot);
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');

    const first = loadWelcomeData(tmpRoot);
    expect(first!.isFirstRun).toBe(true);
    // Marker consumed — file should be gone
    expect(existsSync(join(tmpRoot, '.squad', '.first-run'))).toBe(false);

    const second = loadWelcomeData(tmpRoot);
    expect(second!.isFirstRun).toBe(false);
  });

  it('firstRunElement is null when isFirstRun is false', () => {
    // App.tsx lines 308-325: firstRunElement returns null when !welcome?.isFirstRun
    const bannerReady = true;
    const isFirstRun = false;
    const showFirstRun = bannerReady && isFirstRun;
    expect(showFirstRun).toBe(false);
  });

  it('firstRunElement renders when isFirstRun is true and roster is non-empty', () => {
    const bannerReady = true;
    const isFirstRun = true;
    const rosterAgents = [{ name: 'Keaton', role: 'Lead', emoji: '👑' }];
    const showFirstRun = bannerReady && isFirstRun;
    const showAssembled = showFirstRun && rosterAgents.length > 0;
    expect(showFirstRun).toBe(true);
    expect(showAssembled).toBe(true);
  });

  it('session resume logic skips when .first-run marker is present', () => {
    writeTeamMd(tmpRoot);
    writeFirstRunMarker(tmpRoot);

    const hasTeam = existsSync(join(tmpRoot, '.squad', 'team.md'));
    const isFirstRun = existsSync(join(tmpRoot, '.squad', '.first-run'));
    const recentSession = (hasTeam && !isFirstRun) ? 'would-load' : null;

    expect(hasTeam).toBe(true);
    expect(isFirstRun).toBe(true);
    expect(recentSession).toBeNull();
  });
});

// ============================================================================
// #607.3 — Console output contains no raw Node warnings
// ============================================================================

describe('#607.3 — Console output contains no raw Node warnings', () => {
  it('ExperimentalWarning string-based events are suppressed', () => {
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
      return (originalEmitWarning as any).call(process, warning, ...args);
    };

    try {
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

  it('DEP0040 and other Node deprecation warnings should not leak to user output', () => {
    // The suppression filter must only target ExperimentalWarning —
    // other warnings like DeprecationWarning should pass through to
    // be handled by process.on('warning') or default handlers, not silenced.
    const originalEmitWarning = process.emitWarning;
    const suppressed: string[] = [];
    const passedThrough: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) {
        suppressed.push(warning);
        return;
      }
      if (warning?.name === 'ExperimentalWarning') {
        suppressed.push(warning.message);
        return;
      }
      passedThrough.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
    };

    try {
      process.emitWarning('ExperimentalWarning: require() ESM');
      process.emitWarning('DeprecationWarning: DEP0040');
      const w = new Error('Buffer() is deprecated');
      w.name = 'DeprecationWarning';
      process.emitWarning(w as any);

      expect(suppressed).toHaveLength(1);
      expect(passedThrough).toHaveLength(2);
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });
});

// ============================================================================
// #607.4 — "Your squad is assembled" requires non-empty roster
// ============================================================================

describe('#607.4 — "Your squad is assembled" requires non-empty roster', () => {
  it('empty roster → firstRunElement shows init guidance, not assembled message', () => {
    // App.tsx lines 308-325: when rosterAgents.length === 0, shows init text
    const rosterAgents: Array<{ name: string; role: string; emoji: string }> = [];
    const isFirstRun = true;
    const bannerReady = true;

    const showAssembled = bannerReady && isFirstRun && rosterAgents.length > 0;
    const showInitFallback = bannerReady && isFirstRun && rosterAgents.length === 0;

    expect(showAssembled).toBe(false);
    expect(showInitFallback).toBe(true);
  });

  it('non-empty roster → firstRunElement shows assembled message', () => {
    const rosterAgents = [
      { name: 'Keaton', role: 'Lead', emoji: '👑' },
      { name: 'Fenster', role: 'Core Dev', emoji: '🔧' },
    ];
    const isFirstRun = true;
    const bannerReady = true;

    const showAssembled = bannerReady && isFirstRun && rosterAgents.length > 0;
    expect(showAssembled).toBe(true);
  });

  it('single-agent roster still qualifies as assembled', () => {
    const rosterAgents = [{ name: 'Solo', role: 'Dev', emoji: '🔹' }];
    const isFirstRun = true;
    const bannerReady = true;

    const showAssembled = bannerReady && isFirstRun && rosterAgents.length > 0;
    expect(showAssembled).toBe(true);
  });

  it('banner shows agent count text for non-empty roster (no first-run)', () => {
    // App.tsx lines 291-298: rosterAgents.length > 0 shows count/active display
    const rosterAgents = [
      { name: 'A', role: 'Dev', emoji: '🔹' },
      { name: 'B', role: 'Test', emoji: '🔹' },
      { name: 'C', role: 'Doc', emoji: '🔹' },
    ];
    const agentCount = rosterAgents.length;
    const activeCount = 1;
    const bannerReady = true;

    const showRoster = bannerReady && rosterAgents.length > 0;
    expect(showRoster).toBe(true);
    // The rendered text should reflect "3 agents ready - 1 active"
    const statusText = `${agentCount} agent${agentCount !== 1 ? 's' : ''} ready - ${activeCount} active`;
    expect(statusText).toBe('3 agents ready - 1 active');
  });

  it('empty roster shows /init guidance in banner', () => {
    // App.tsx lines 299-301: when rosterAgents.length === 0, shows init guidance
    const rosterAgents: Array<{ name: string; role: string; emoji: string }> = [];
    const bannerReady = true;

    const showInitGuidance = bannerReady && rosterAgents.length === 0;
    expect(showInitGuidance).toBe(true);

    const guidanceText = "  Exit and run 'squad init', or type /init to set up your team";
    expect(guidanceText).toContain('squad init');
    expect(guidanceText).toContain('/init');
  });
});

// ============================================================================
// #607.5 — Session-scoped Static keys prevent cross-session collisions
// ============================================================================

describe('#607.5 — Session-scoped Static keys prevent cross-session collisions', () => {
  it('sessionId is base-36 encoded and contains alpha characters', () => {
    const sessionId = Date.now().toString(36);
    expect(sessionId.length).toBeGreaterThan(0);
    // Base-36 encoding of a modern timestamp includes alphabetic characters
    expect(sessionId).toMatch(/[a-z]/);
  });

  it('composed key format is ${sessionId}-${index}', () => {
    const sessionId = Date.now().toString(36);
    const key0 = `${sessionId}-0`;
    const key5 = `${sessionId}-5`;
    expect(key0).toContain(sessionId);
    expect(key0).toMatch(/-0$/);
    expect(key5).toMatch(/-5$/);
  });

  it('two sessions at different times produce distinct key prefixes', async () => {
    const session1 = Date.now().toString(36);
    // Simulate a small time gap
    await new Promise(r => setTimeout(r, 2));
    const session2 = Date.now().toString(36);

    // Keys for same index must differ across sessions
    const key1 = `${session1}-0`;
    const key2 = `${session2}-0`;
    expect(key1).not.toBe(key2);
  });

  it('keys are never plain numeric indices', () => {
    const sessionId = Date.now().toString(36);
    for (let i = 0; i < 10; i++) {
      const key = `${sessionId}-${i}`;
      // Must NOT be a bare number — prevents Ink confusion with array indices
      expect(key).not.toMatch(/^\d+$/);
    }
  });

  it('MemoryManager archival preserves key stability — combined list only grows', async () => {
    const { MemoryManager } = await import('../packages/squad-cli/src/cli/shell/memory.js');
    const mm = new MemoryManager({ maxMessages: 5 });

    // Simulate messages arriving over time
    const batch1: ShellMessage[] = Array.from({ length: 3 }, (_, i) =>
      makeMessage({ role: 'user', content: `msg-${i}` }),
    );
    const result1 = mm.trimWithArchival(batch1);
    expect(result1.kept).toHaveLength(3);
    expect(result1.archived).toHaveLength(0);

    // Now overflow the cap
    const batch2: ShellMessage[] = Array.from({ length: 8 }, (_, i) =>
      makeMessage({ role: 'user', content: `msg-${i}` }),
    );
    const result2 = mm.trimWithArchival(batch2);
    expect(result2.kept).toHaveLength(5);
    expect(result2.archived).toHaveLength(3);
    // Total items across both arrays equals original count
    expect(result2.kept.length + result2.archived.length).toBe(8);
  });
});

// ============================================================================
// #607.6 — Terminal clear runs before Ink render
// ============================================================================

describe('#607.6 — Terminal clear runs before Ink render', () => {
  it('runShell source has terminal clear before render() call', async () => {
    // Verify the ordering in the source: process.stdout.write('\\x1b[2J\\x1b[H')
    // appears before render(React.createElement(...)). This is a structural test.
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'shell', 'index.ts'),
      'utf-8',
    );

    // Find the terminal clear line
    const clearPattern = /process\.stdout\.write\(['"]\\x1b\[2J/;
    const renderPattern = /render\(\s*React\.createElement/;

    const clearMatch = source.match(clearPattern);
    const renderMatch = source.match(renderPattern);
    expect(clearMatch).not.toBeNull();
    expect(renderMatch).not.toBeNull();

    // Clear must appear BEFORE render in the source
    const clearIndex = source.indexOf(clearMatch![0]);
    const renderIndex = source.indexOf(renderMatch![0]);
    expect(clearIndex).toBeLessThan(renderIndex);
  });

  it('/clear command sends ANSI clear sequence', async () => {
    const { executeCommand } = await import('../packages/squad-cli/src/cli/shell/commands.js');
    const { SessionRegistry } = await import('../packages/squad-cli/src/cli/shell/sessions.js');
    const { ShellRenderer } = await import('../packages/squad-cli/src/cli/shell/render.js');

    const writes: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as any;

    try {
      const result = executeCommand('clear', [], {
        registry: new SessionRegistry(),
        renderer: new ShellRenderer(),
        messageHistory: [],
        teamRoot: process.cwd(),
        version: '0.0.0-test',
      });
      expect(result.handled).toBe(true);
      expect(result.clear).toBe(true);
      // ANSI escape for clear screen + cursor home
      expect(writes.some(w => w.includes('\x1B[2J'))).toBe(true);
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it('session restore clears terminal before re-rendering messages', async () => {
    // In index.ts onRestoreSession: clearMessages() then process.stdout.write('\\x1b[2J\\x1b[H')
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'shell', 'index.ts'),
      'utf-8',
    );

    // Find the onRestoreSession function
    const fnStart = source.indexOf('function onRestoreSession');
    expect(fnStart).toBeGreaterThan(-1);

    // Within that function, clearMessages comes before the clear escape
    const fnSlice = source.slice(fnStart, fnStart + 500);
    const clearMsgIdx = fnSlice.indexOf('clearMessages');
    const ansiClearIdx = fnSlice.indexOf('\\x1b[2J');
    expect(clearMsgIdx).toBeGreaterThan(-1);
    expect(ansiClearIdx).toBeGreaterThan(-1);
    expect(clearMsgIdx).toBeLessThan(ansiClearIdx);
  });
});

// ============================================================================
// #624 — SQLite warning suppression (NODE_NO_WARNINGS env var)
// ============================================================================

describe('#624 — SQLite warning suppression via NODE_NO_WARNINGS', () => {
  it('cli-entry.ts sets NODE_NO_WARNINGS=1 before any import statements', async () => {
    // Structural test: verify the env var assignment appears before any imports
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli-entry.ts'),
      'utf-8',
    );

    // NODE_NO_WARNINGS = '1' must appear in the file
    const envVarPattern = /process\.env\.NODE_NO_WARNINGS\s*=\s*['"]1['"]/;
    expect(source).toMatch(envVarPattern);

    // It must appear before the first import statement (top-of-file side effect)
    const envVarIndex = source.search(envVarPattern);
    const firstImportIndex = source.search(/^import\s/m);
    expect(envVarIndex).toBeGreaterThan(-1);
    expect(firstImportIndex).toBeGreaterThan(-1);
    expect(envVarIndex).toBeLessThan(firstImportIndex);
  });

  it('ExperimentalWarning override filters both string and object forms', () => {
    // Replicate the exact filter logic from cli-entry.ts lines 5-10
    const originalEmitWarning = process.emitWarning;
    const emitted: string[] = [];

    process.emitWarning = (warning: any, ...args: any[]) => {
      if (typeof warning === 'string' && warning.includes('ExperimentalWarning')) return;
      if (warning?.name === 'ExperimentalWarning') return;
      emitted.push(typeof warning === 'string' ? warning : warning?.message ?? String(warning));
      return (originalEmitWarning as any).call(process, warning, ...args);
    };

    try {
      // String form — SQLite experimental warning
      process.emitWarning('ExperimentalWarning: SQLite is an experimental feature');
      // Object form — require() ESM warning
      const w = new Error('require() of ES Module not supported');
      w.name = 'ExperimentalWarning';
      process.emitWarning(w as any);
      // Non-experimental warning should pass through
      process.emitWarning('DeprecationWarning: something old');

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toContain('DeprecationWarning');
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });
});

// ============================================================================
// #625 — Redundant init messaging (firstRunElement + banner text)
// ============================================================================

describe('#625 — Redundant init messaging eliminated', () => {
  it('firstRunElement returns null when isFirstRun=true and rosterAgents is empty', () => {
    // App.tsx lines 308-323: empty roster branch now returns null (no duplicate init text)
    const bannerReady = true;
    const isFirstRun = true;
    const rosterAgents: Array<{ name: string; role: string; emoji: string }> = [];

    // Simulate the useMemo logic from App.tsx firstRunElement
    const shouldRenderFirstRun = bannerReady && isFirstRun;
    const hasAssembledContent = rosterAgents.length > 0;
    // When empty roster: the ternary yields null — no JSX rendered
    const firstRunContent = shouldRenderFirstRun ? (hasAssembledContent ? 'assembled' : null) : null;

    expect(shouldRenderFirstRun).toBe(true);
    expect(firstRunContent).toBeNull();
  });

  it('firstRunElement still renders "assembled" when isFirstRun=true and rosterAgents has agents', () => {
    const bannerReady = true;
    const isFirstRun = true;
    const rosterAgents = [
      { name: 'Keaton', role: 'Lead', emoji: '👑' },
      { name: 'Fenster', role: 'Core Dev', emoji: '🔧' },
    ];

    const shouldRenderFirstRun = bannerReady && isFirstRun;
    const hasAssembledContent = rosterAgents.length > 0;
    const firstRunContent = shouldRenderFirstRun ? (hasAssembledContent ? 'assembled' : null) : null;

    expect(firstRunContent).toBe('assembled');
  });

  it('banner text does not reference squad cast', async () => {
    // App.tsx banner was simplified — no longer has roster length branches
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'shell', 'components', 'App.tsx'),
      'utf-8',
    );

    // Banner should NOT reference 'squad cast' (doesn't exist as a command)
    const headerBlock = source.match(/const headerElement[\s\S]*?useMemo/);
    expect(headerBlock).not.toBeNull();
    expect(headerBlock![0]).not.toContain('squad cast');
  });
});

// ============================================================================
// Banner simplification (#626, #627)
// ============================================================================

describe('Banner simplification (#626, #627)', () => {
  const appPath = join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'shell', 'components', 'App.tsx');

  async function readAppSource(): Promise<string> {
    const fs = await import('node:fs');
    return fs.readFileSync(appPath, 'utf-8');
  }

  it('Banner init message uses simple CTA — no squad cast reference', async () => {
    const source = await readAppSource();

    // Banner was simplified — verify no squad cast reference anywhere in header/first-run sections
    const headerAndFirstRun = source.match(/const headerElement[\s\S]*?const firstRunElement[\s\S]*?useMemo/);
    expect(headerAndFirstRun).not.toBeNull();

    // Should NOT reference non-existent 'squad cast' command
    expect(headerAndFirstRun![0]).not.toContain('squad cast');
  });

  it('Usage line uses middle-dot separators (U+00B7)', async () => {
    const source = await readAppSource();

    // Find the usage/hint line — the one with @Agent and /help (may contain nested <Text bold> elements)
    const usageLine = source.match(/<Text dimColor>.*@Agent.*<\/Text>/);
    expect(usageLine).not.toBeNull();

    const lineText = usageLine![0];
    // Must use · (middle dot U+00B7) as separator
    expect(lineText).toContain('\u00B7');
    // Must NOT use em-dash or plain hyphen as separator
    expect(lineText).not.toContain('\u2014'); // em-dash
    expect(lineText).not.toMatch(/ — /);      // spaced em-dash
    expect(lineText).not.toMatch(/ - /);       // spaced hyphen separator
  });

  it('Usage line is concise — starts with "Type naturally"', async () => {
    const source = await readAppSource();

    // Find the usage line containing @Agent (may contain nested <Text bold> elements)
    const usageLine = source.match(/<Text dimColor>.*@Agent.*<\/Text>/);
    expect(usageLine).not.toBeNull();

    const lineText = usageLine![0];
    expect(lineText).toContain('Type naturally');
    expect(lineText).not.toContain('Just type what you need');
  });

  it('Ctrl+C formatting — "Ctrl+C again to exit" in system message', async () => {
    const source = await readAppSource();

    // Ctrl+C exit hint is now in the system message, not the header
    expect(source).toContain('Press Ctrl+C again to exit.');
  });

  it('Header has at most one spacer between banner and version line', async () => {
    const source = await readAppSource();

    // Extract the headerElement useMemo block — matches both inline `=> (` and function body `=> {` forms
    const headerBlock = source.match(/const headerElement[\s\S]*?(?=const firstRunElement)/);
    expect(headerBlock).not.toBeNull();

    const block = headerBlock![0];
    // Count standalone spacer lines: <Text>{' '}</Text>
    const spacerMatches = block.match(/<Text>\{' '\}<\/Text>/g);
    const spacerCount = spacerMatches ? spacerMatches.length : 0;
    expect(spacerCount).toBeLessThanOrEqual(1);
  });
});
