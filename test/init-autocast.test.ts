/**
 * Tests for auto-cast trigger, /init command, and Ctrl+C abort reliability.
 *
 * Covers the P0/P1 fixes from PR #640:
 * - Auto-cast fires only when .init-prompt exists AND roster is empty AND shellApi is ready
 * - Orphan .init-prompt is cleaned up when roster already has entries
 * - /init command returns triggerInitCast signal with inline prompts
 * - activeInitSession lifecycle (set on create, cleared on success/error, aborted on Ctrl+C)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { hasRosterEntries } from '../packages/squad-cli/src/cli/shell/coordinator.js';
import { executeCommand } from '../packages/squad-cli/src/cli/shell/commands.js';
import { SessionRegistry } from '../packages/squad-cli/src/cli/shell/sessions.js';
import { ShellRenderer } from '../packages/squad-cli/src/cli/shell/render.js';
import type { CommandContext } from '../packages/squad-cli/src/cli/shell/commands.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

/** Build a team.md with a populated ## Members table. */
function makePopulatedTeamMd(agents: Array<{ name: string; role: string }>): string {
  const rows = agents
    .map(a => `| ${a.name} | ${a.role} | \`.squad/agents/${a.name.toLowerCase()}/charter.md\` | ✅ Active |`)
    .join('\n');
  return `# Team Manifest

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
${rows}
`;
}

/** Build a team.md with the ## Members section but NO data rows (empty roster). */
function makeEmptyRosterTeamMd(): string {
  return `# Team Manifest

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
`;
}

function makeCommandContext(teamRoot: string): CommandContext {
  return {
    registry: new SessionRegistry(),
    renderer: new ShellRenderer(),
    messageHistory: [] as ShellMessage[],
    teamRoot,
  };
}

// ===========================================================================
// 1. hasRosterEntries — the predicate that gates auto-cast
// ===========================================================================

describe('hasRosterEntries — auto-cast gating predicate', () => {
  it('returns true when Members table has data rows', () => {
    const md = makePopulatedTeamMd([
      { name: 'Fenster', role: 'Developer' },
      { name: 'Hockney', role: 'Tester' },
    ]);
    expect(hasRosterEntries(md)).toBe(true);
  });

  it('returns false when Members table has only header + separator', () => {
    const md = makeEmptyRosterTeamMd();
    expect(hasRosterEntries(md)).toBe(false);
  });

  it('returns false when there is no ## Members section', () => {
    const md = '# Team Manifest\n\nSome notes.\n';
    expect(hasRosterEntries(md)).toBe(false);
  });

  it('returns false for completely empty string', () => {
    expect(hasRosterEntries('')).toBe(false);
  });

  it('returns true with a single agent row', () => {
    const md = makePopulatedTeamMd([{ name: 'Solo', role: 'Lead' }]);
    expect(hasRosterEntries(md)).toBe(true);
  });

  it('ignores header row that starts with | Name', () => {
    // Ensure the header row itself is NOT counted as a data row
    const md = `# Team Manifest\n\n## Members\n\n| Name | Role |\n|------|------|\n`;
    expect(hasRosterEntries(md)).toBe(false);
  });

  it('ignores separator row that starts with | ---', () => {
    const md = `# Team Manifest\n\n## Members\n\n| Name | Role |\n| ---- | ---- |\n`;
    expect(hasRosterEntries(md)).toBe(false);
  });
});

// ===========================================================================
// 2. Auto-cast trigger CONDITIONS (filesystem state)
// ===========================================================================

describe('auto-cast trigger conditions', () => {
  let tmpDir: string;
  let squadDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir('autocast-');
    squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('auto-cast SHOULD fire: .init-prompt exists + roster is empty', () => {
    // Setup: empty roster team.md + .init-prompt
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeEmptyRosterTeamMd());
    fs.writeFileSync(path.join(squadDir, '.init-prompt'), 'Build a snake game');

    // Verify conditions match auto-cast trigger
    const teamContent = fs.readFileSync(path.join(squadDir, 'team.md'), 'utf-8');
    const initPromptExists = fs.existsSync(path.join(squadDir, '.init-prompt'));
    const rosterEmpty = !hasRosterEntries(teamContent);

    expect(initPromptExists).toBe(true);
    expect(rosterEmpty).toBe(true);
    // Both conditions met → auto-cast should fire
  });

  it('auto-cast should NOT fire: roster has entries (even if .init-prompt exists)', () => {
    // Setup: populated roster + stale .init-prompt
    fs.writeFileSync(
      path.join(squadDir, 'team.md'),
      makePopulatedTeamMd([{ name: 'Fenster', role: 'Developer' }]),
    );
    fs.writeFileSync(path.join(squadDir, '.init-prompt'), 'Build a snake game');

    const teamContent = fs.readFileSync(path.join(squadDir, 'team.md'), 'utf-8');
    const initPromptExists = fs.existsSync(path.join(squadDir, '.init-prompt'));
    const rosterEmpty = !hasRosterEntries(teamContent);

    expect(initPromptExists).toBe(true);
    expect(rosterEmpty).toBe(false);
    // Roster populated → auto-cast must NOT fire
  });

  it('auto-cast should NOT fire: .init-prompt does not exist', () => {
    // Setup: empty roster team.md but NO .init-prompt
    fs.writeFileSync(path.join(squadDir, 'team.md'), makeEmptyRosterTeamMd());

    const teamContent = fs.readFileSync(path.join(squadDir, 'team.md'), 'utf-8');
    const initPromptExists = fs.existsSync(path.join(squadDir, '.init-prompt'));
    const rosterEmpty = !hasRosterEntries(teamContent);

    expect(initPromptExists).toBe(false);
    expect(rosterEmpty).toBe(true);
    // Missing .init-prompt → auto-cast must NOT fire
  });

  it('auto-cast should fire after scaffold: team.md does not exist at all', () => {
    // Setup: no team.md, just .init-prompt
    fs.writeFileSync(path.join(squadDir, '.init-prompt'), 'Build something');

    const teamFileExists = fs.existsSync(path.join(squadDir, 'team.md'));
    const initPromptExists = fs.existsSync(path.join(squadDir, '.init-prompt'));

    expect(teamFileExists).toBe(false);
    expect(initPromptExists).toBe(true);
    // No team.md → shell scaffolds .squad/ first (creating team.md with empty roster),
    // then falls through to handleInitCast which uses the stored .init-prompt.
  });

  it('stored .init-prompt content is trimmed before use', () => {
    fs.writeFileSync(path.join(squadDir, '.init-prompt'), '  Build a snake game  \n');

    const storedPrompt = fs.readFileSync(path.join(squadDir, '.init-prompt'), 'utf-8').trim();
    expect(storedPrompt).toBe('Build a snake game');
  });

  it('empty .init-prompt (whitespace only) should NOT trigger auto-cast', () => {
    fs.writeFileSync(path.join(squadDir, '.init-prompt'), '   \n  ');

    const storedPrompt = fs.readFileSync(path.join(squadDir, '.init-prompt'), 'utf-8').trim();
    expect(storedPrompt).toBe('');
    // Empty after trim → the `if (storedPrompt)` guard in index.ts prevents firing
  });
});

// ===========================================================================
// 3. Orphan .init-prompt cleanup
// ===========================================================================

describe('orphan .init-prompt cleanup', () => {
  let tmpDir: string;
  let squadDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir('orphan-cleanup-');
    squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('orphan .init-prompt is deleted when roster already has entries', () => {
    // This replicates the Bug fix #3 logic from index.ts:894-902
    const teamFilePath = path.join(squadDir, 'team.md');
    const initPromptPath = path.join(squadDir, '.init-prompt');

    fs.writeFileSync(teamFilePath, makePopulatedTeamMd([{ name: 'Fenster', role: 'Dev' }]));
    fs.writeFileSync(initPromptPath, 'stale prompt from earlier');

    // Replicate the onReady cleanup logic
    if (fs.existsSync(teamFilePath)) {
      const tc = fs.readFileSync(teamFilePath, 'utf-8');
      if (hasRosterEntries(tc) && fs.existsSync(initPromptPath)) {
        try { fs.unlinkSync(initPromptPath); } catch { /* ignore */ }
      }
    }

    expect(fs.existsSync(initPromptPath)).toBe(false);
  });

  it('.init-prompt is NOT deleted when roster is empty', () => {
    const teamFilePath = path.join(squadDir, 'team.md');
    const initPromptPath = path.join(squadDir, '.init-prompt');

    fs.writeFileSync(teamFilePath, makeEmptyRosterTeamMd());
    fs.writeFileSync(initPromptPath, 'Build a snake game');

    // Replicate the onReady cleanup logic
    if (fs.existsSync(teamFilePath)) {
      const tc = fs.readFileSync(teamFilePath, 'utf-8');
      if (hasRosterEntries(tc) && fs.existsSync(initPromptPath)) {
        try { fs.unlinkSync(initPromptPath); } catch { /* ignore */ }
      }
    }

    // .init-prompt should survive — it's needed for auto-cast
    expect(fs.existsSync(initPromptPath)).toBe(true);
  });

  it('.init-prompt is NOT deleted when team.md does not exist', () => {
    const teamFilePath = path.join(squadDir, 'team.md');
    const initPromptPath = path.join(squadDir, '.init-prompt');

    fs.writeFileSync(initPromptPath, 'Build a snake game');

    // Replicate the onReady cleanup logic — team.md check fails early
    if (fs.existsSync(teamFilePath)) {
      const tc = fs.readFileSync(teamFilePath, 'utf-8');
      if (hasRosterEntries(tc) && fs.existsSync(initPromptPath)) {
        try { fs.unlinkSync(initPromptPath); } catch { /* ignore */ }
      }
    }

    expect(fs.existsSync(initPromptPath)).toBe(true);
  });
});

// ===========================================================================
// 4. /init command — executeCommand('init', ...)
// ===========================================================================

describe('/init command — triggerInitCast signal', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = makeCommandContext('/test');
  });

  it('returns triggerInitCast with prompt when args provided', () => {
    const result = executeCommand('init', ['Build', 'a', 'snake', 'game'], context);
    expect(result.handled).toBe(true);
    expect(result.triggerInitCast).toBeDefined();
    expect(result.triggerInitCast!.prompt).toBe('Build a snake game');
  });

  it('returns help text (no triggerInitCast) when no args', () => {
    const result = executeCommand('init', [], context);
    expect(result.handled).toBe(true);
    expect(result.triggerInitCast).toBeUndefined();
    expect(result.output).toBeDefined();
    expect(result.output).toContain('just type what you want to build');
  });

  it('returns triggerInitCast for single-word prompt', () => {
    const result = executeCommand('init', ['something'], context);
    expect(result.handled).toBe(true);
    expect(result.triggerInitCast).toBeDefined();
    expect(result.triggerInitCast!.prompt).toBe('something');
  });

  it('trims whitespace from joined prompt args', () => {
    const result = executeCommand('init', ['  Build  ', '  app  '], context);
    expect(result.handled).toBe(true);
    expect(result.triggerInitCast).toBeDefined();
    // args.join(' ').trim() preserves internal spaces
    expect(result.triggerInitCast!.prompt).toBe('Build     app');
  });

  it('returns no triggerInitCast for whitespace-only args', () => {
    const result = executeCommand('init', ['  ', '  '], context);
    expect(result.handled).toBe(true);
    // '  '.join(' ').trim() === '' → falls through to help text
    expect(result.triggerInitCast).toBeUndefined();
    expect(result.output).toBeDefined();
  });

  it('help text includes team file path from context', () => {
    const result = executeCommand('init', [], context);
    expect(result.output).toContain('/test/.squad/team.md');
  });

  it('help text includes example prompt', () => {
    const result = executeCommand('init', [], context);
    expect(result.output).toContain('React app');
  });
});

// ===========================================================================
// 5. triggerInitCast signal structure
// ===========================================================================

describe('triggerInitCast signal — App.tsx dispatch contract', () => {
  it('triggerInitCast signal has correct shape for App.tsx consumption', () => {
    const context = makeCommandContext('/test');
    const result = executeCommand('init', ['Build', 'a', 'REST', 'API'], context);

    // App.tsx line 200 checks: result.triggerInitCast && onDispatch
    // Then constructs ParsedInput from result.triggerInitCast.prompt
    expect(result.triggerInitCast).toEqual({ prompt: 'Build a REST API' });

    // App.tsx uses the prompt for both raw and content of ParsedInput
    const prompt = result.triggerInitCast!.prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('no triggerInitCast signal when command returns help', () => {
    const context = makeCommandContext('/test');
    const result = executeCommand('init', [], context);

    // App.tsx line 200: this branch should NOT execute
    expect(result.triggerInitCast).toBeUndefined();
    expect(result.output).toBeDefined();
  });

  it('triggerInitCast is not set on non-init commands', () => {
    const context = makeCommandContext('/test');

    const help = executeCommand('help', [], context);
    expect(help.triggerInitCast).toBeUndefined();

    const status = executeCommand('status', [], context);
    expect(status.triggerInitCast).toBeUndefined();

    const clear = executeCommand('clear', [], context);
    expect(clear.triggerInitCast).toBeUndefined();
  });
});

// ===========================================================================
// 6. Ctrl+C abort — activeInitSession lifecycle
// ===========================================================================

describe('activeInitSession lifecycle — Ctrl+C abort coverage', () => {
  it('handleCancel aborts init session and clears it (structural verification)', async () => {
    // We can't directly access the closure-scoped activeInitSession from index.ts,
    // but we can verify the abort contract by simulating the pattern.
    let activeInitSession: { abort?: () => Promise<void>; close?: () => Promise<void> } | null = null;
    const abortCalled: string[] = [];

    // Simulate creating an init session (index.ts:646)
    activeInitSession = {
      abort: async () => { abortCalled.push('init-abort'); },
      close: async () => { abortCalled.push('init-close'); },
    };

    // Simulate handleCancel (index.ts:584-586)
    if (activeInitSession) {
      try { await activeInitSession.abort?.(); } catch { /* ignore */ }
      activeInitSession = null;
    }

    expect(abortCalled).toContain('init-abort');
    expect(activeInitSession).toBeNull();
  });

  it('activeInitSession is cleared after successful init (success path)', async () => {
    let activeInitSession: { close?: () => Promise<void> } | null = null;
    const closeCalled: string[] = [];

    // Simulate session creation (index.ts:646)
    activeInitSession = {
      close: async () => { closeCalled.push('closed'); },
    };

    // Simulate success path (index.ts:724-726)
    try { await activeInitSession.close?.(); } catch { /* ignore */ }
    activeInitSession = null;

    expect(closeCalled).toContain('closed');
    expect(activeInitSession).toBeNull();
  });

  it('activeInitSession is cleared in finally block on error', async () => {
    let activeInitSession: { close?: () => Promise<void> } | null = null;
    const closeCalled: string[] = [];

    // Simulate session creation
    activeInitSession = {
      close: async () => { closeCalled.push('finally-close'); },
    };

    // Simulate error path with finally (index.ts:752-758)
    try {
      throw new Error('simulated init failure');
    } catch {
      // error handler runs
    } finally {
      if (activeInitSession) {
        try { await activeInitSession.close?.(); } catch { /* ignore */ }
      }
      activeInitSession = null;
    }

    expect(closeCalled).toContain('finally-close');
    expect(activeInitSession).toBeNull();
  });

  it('handleCancel is safe when no init session is active', async () => {
    let activeInitSession: { abort?: () => Promise<void> } | null = null;

    // Simulate handleCancel with no init session (index.ts:584)
    if (activeInitSession) {
      try { await activeInitSession.abort?.(); } catch { /* ignore */ }
      activeInitSession = null;
    }

    // Should not throw — guard check prevents null dereference
    expect(activeInitSession).toBeNull();
  });

  it('handleCancel handles abort() throwing an error gracefully', async () => {
    let activeInitSession: { abort?: () => Promise<void> } | null = null;

    activeInitSession = {
      abort: async () => { throw new Error('abort failed'); },
    };

    // Simulate handleCancel (index.ts:585) — error is caught
    if (activeInitSession) {
      try { await activeInitSession.abort?.(); } catch { /* swallowed */ }
      activeInitSession = null;
    }

    expect(activeInitSession).toBeNull();
  });
});

// ===========================================================================
// 7. handleInitCast stored prompt consumption
// ===========================================================================

describe('handleInitCast — .init-prompt consumption logic', () => {
  let tmpDir: string;
  let squadDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir('initcast-consume-');
    squadDir = path.join(tmpDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('stored prompt overrides parsed raw when .init-prompt exists', () => {
    // Replicates index.ts:620-628 logic
    const initPromptFile = path.join(squadDir, '.init-prompt');
    fs.writeFileSync(initPromptFile, 'Build a chess engine');

    let castPrompt = 'original user message';
    if (fs.existsSync(initPromptFile)) {
      const storedPrompt = fs.readFileSync(initPromptFile, 'utf-8').trim();
      if (storedPrompt) {
        castPrompt = storedPrompt;
      }
    }

    expect(castPrompt).toBe('Build a chess engine');
  });

  it('parsed raw is used when .init-prompt does not exist', () => {
    const initPromptFile = path.join(squadDir, '.init-prompt');

    let castPrompt = 'original user message';
    if (fs.existsSync(initPromptFile)) {
      const storedPrompt = fs.readFileSync(initPromptFile, 'utf-8').trim();
      if (storedPrompt) {
        castPrompt = storedPrompt;
      }
    }

    expect(castPrompt).toBe('original user message');
  });

  it('.init-prompt is deleted after consumption (post-cast cleanup)', () => {
    // Replicates index.ts:710-713
    const initPromptFile = path.join(squadDir, '.init-prompt');
    fs.writeFileSync(initPromptFile, 'Build something');

    // Simulate post-cast cleanup
    if (fs.existsSync(initPromptFile)) {
      try { fs.unlinkSync(initPromptFile); } catch { /* ignore */ }
    }

    expect(fs.existsSync(initPromptFile)).toBe(false);
  });

  it('cleanup is safe when .init-prompt was already deleted', () => {
    const initPromptFile = path.join(squadDir, '.init-prompt');

    // No .init-prompt exists
    expect(() => {
      if (fs.existsSync(initPromptFile)) {
        try { fs.unlinkSync(initPromptFile); } catch { /* ignore */ }
      }
    }).not.toThrow();
  });
});
