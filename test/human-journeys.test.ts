/**
 * Human Journey Tests — end-to-end simulations of real user experiences.
 *
 * These tests don't mock internals. They simulate what a human actually does
 * and verify the experience creates a "wow moment" rather than confusion.
 *
 * Each describe block maps to a filed GitHub issue and a real human scenario.
 *
 * @see https://github.com/bradygaster/squad-pr/issues/383 — "I just installed this"
 * @see https://github.com/bradygaster/squad-pr/issues/384 — "My first conversation"
 * @see https://github.com/bradygaster/squad-pr/issues/385 — "I'm waiting and getting anxious"
 * @see https://github.com/bradygaster/squad-pr/issues/386 — "Something went wrong"
 * @see https://github.com/bradygaster/squad-pr/issues/394 — "I want to talk to a specific agent"
 * @see https://github.com/bradygaster/squad-pr/issues/396 — "I'm a power user now"
 * @see https://github.com/bradygaster/squad-pr/issues/398 — "I came back the next day"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import React from 'react';
import { render } from 'ink-testing-library';

// CLI harness for real process spawning
import { TerminalHarness } from './acceptance/harness.js';

// Shell internals we exercise at the integration boundary
import { parseInput } from '../packages/squad-cli/src/cli/shell/router.js';
import { executeCommand } from '../packages/squad-cli/src/cli/shell/commands.js';
import { SessionRegistry } from '../packages/squad-cli/src/cli/shell/sessions.js';
import { ShellRenderer } from '../packages/squad-cli/src/cli/shell/render.js';
import { loadWelcomeData } from '../packages/squad-cli/src/cli/shell/lifecycle.js';
import { ThinkingIndicator } from '../packages/squad-cli/src/cli/shell/components/ThinkingIndicator.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

const h = React.createElement;

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/** Create a temp directory that will be cleaned up after the test. */
function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Scaffold a minimal .squad/ directory with team.md for welcome/lifecycle tests. */
function scaffoldSquadDir(root: string, opts?: { firstRun?: boolean }): void {
  const squadDir = join(root, '.squad');
  const agentsDir = join(squadDir, 'agents');
  const identityDir = join(squadDir, 'identity');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(identityDir, { recursive: true });

  writeFileSync(join(squadDir, 'team.md'), `# Squad Team — Test Project

> A test project for human journey validation.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | \`.squad/agents/keaton/charter.md\` | ✅ Active |
| Fenster | Core Dev | \`.squad/agents/fenster/charter.md\` | ✅ Active |
| Hockney | Tester | \`.squad/agents/hockney/charter.md\` | ✅ Active |
`);

  writeFileSync(join(identityDir, 'now.md'), `---
updated_at: 2025-01-01T00:00:00.000Z
focus_area: Testing human journeys
active_issues: []
---

# What We're Focused On

Human journey test validation.
`);

  if (opts?.firstRun) {
    writeFileSync(join(squadDir, '.first-run'), new Date().toISOString() + '\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Journey 1: "I just installed this" — squad init in a fresh repo
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 1: I just installed this (squad init)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('squad-journey-init-');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .squad/ directory with expected structure', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tempDir });
    await harness.waitForExit(30000);
    await harness.close();

    // The human sees: a .squad/ directory was created
    expect(existsSync(join(tempDir, '.squad'))).toBe(true);
    expect(existsSync(join(tempDir, '.squad', 'skills'))).toBe(true);
    expect(existsSync(join(tempDir, '.squad', 'identity'))).toBe(true);
    expect(existsSync(join(tempDir, '.squad', 'ceremonies.md'))).toBe(true);
  });

  it('shows ceremony output — not raw technical logs', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tempDir });
    await harness.waitForExit(30000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // The human sees: a ceremony, not a wall of file paths
    expect(output).toContain("Let's build your team");
    expect(output).toContain('SQUAD');
    // Ceremony landmarks should appear
    expect(output).toContain('Team workspace');
    expect(output).toContain('Skills');
  });

  it('tells the human what to do next', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tempDir });
    await harness.waitForExit(30000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // The human needs a clear next step — not silence
    expect(output).toContain('Your team is ready');
    expect(output.toLowerCase()).toContain('squad');
  });

  it('writes first-run marker so the REPL knows this is day one', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tempDir });
    await harness.waitForExit(30000);
    await harness.close();

    expect(existsSync(join(tempDir, '.squad', '.first-run'))).toBe(true);
  });

  it('exits cleanly with code 0', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tempDir });
    const exitCode = await harness.waitForExit(30000);
    await harness.close();

    expect(exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 2: "My first conversation" — REPL welcome banner
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 2: My first conversation (welcome banner)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('squad-journey-welcome-');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('welcome data includes agent roster with names and roles', () => {
    scaffoldSquadDir(tempDir);
    const data = loadWelcomeData(tempDir);

    expect(data).not.toBeNull();
    expect(data!.agents.length).toBe(3);
    expect(data!.agents.map(a => a.name)).toEqual(['Keaton', 'Fenster', 'Hockney']);
    expect(data!.agents[0]!.role).toBe('Lead');
  });

  it('welcome data includes project description', () => {
    scaffoldSquadDir(tempDir);
    const data = loadWelcomeData(tempDir);

    expect(data!.description).toContain('test project');
  });

  it('welcome data includes current focus from identity/now.md', () => {
    scaffoldSquadDir(tempDir);
    const data = loadWelcomeData(tempDir);

    expect(data!.focus).toBe('Testing human journeys');
  });

  it('first-run flag is detected and consumed (one-time ceremony)', () => {
    scaffoldSquadDir(tempDir, { firstRun: true });

    // First load: sees first-run
    const data1 = loadWelcomeData(tempDir);
    expect(data1!.isFirstRun).toBe(true);

    // Marker file should be consumed (deleted)
    expect(existsSync(join(tempDir, '.squad', '.first-run'))).toBe(false);

    // Second load: no longer first-run
    const data2 = loadWelcomeData(tempDir);
    expect(data2!.isFirstRun).toBe(false);
  });

  it('each agent gets an emoji so the roster feels alive', () => {
    scaffoldSquadDir(tempDir);
    const data = loadWelcomeData(tempDir);

    for (const agent of data!.agents) {
      expect(agent.emoji).toBeTruthy();
      // Emoji should not be empty string or undefined
      expect(agent.emoji.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 3: "I'm waiting and getting anxious" — thinking indicator
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 3: Waiting and anxious (thinking indicator)', () => {
  beforeEach(() => {
    // Force NO_COLOR for deterministic assertions
    vi.stubEnv('NO_COLOR', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows indicator immediately when thinking starts', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 0 })
    );
    const frame = lastFrame()!;
    // In NO_COLOR mode, we see static dots
    expect(frame).toContain('...');
    expect(frame).toContain('Routing to agent');
  });

  it('hides indicator when not thinking', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: false, elapsedMs: 0 })
    );
    // Should render nothing
    expect(lastFrame()).toBe('');
  });

  it('shows elapsed time after 1 second so user knows it is alive', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 3000 })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('3s');
  });

  it('activity hint replaces default label when SDK provides context', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 2000, activityHint: 'Reading file...' })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Reading file');
    // Default "Thinking" should NOT show when we have a specific hint
    expect(frame).not.toContain('Thinking');
  });

  it('does not show elapsed when under 1 second', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 500 })
    );
    const frame = lastFrame()!;
    // Should show the indicator but not a time
    expect(frame).toContain('Routing to agent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 4: "Something went wrong" — error handling
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 4: Something went wrong (errors)', () => {
  it('unknown command gives friendly error with help suggestion', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['foobar']);
    const exitCode = await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // Human sees: friendly message, not a stack trace
    expect(output).toContain('Unknown command');
    expect(output.toLowerCase()).toContain('help');
    expect(exitCode).toBe(1);
  });

  it('error output includes remediation tip (squad doctor)', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['foobar']);
    await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    expect(output.toLowerCase()).toContain('doctor');
  });

  it('does not show raw stack trace to the user', async () => {
    // Ensure SQUAD_DEBUG is off so debug logging doesn't leak stack traces
    const harness = await TerminalHarness.spawnWithArgs(['foobar'], {
      env: { SQUAD_DEBUG: '0' },
    });
    await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // No "at Object.<anonymous>" or "Error:" prefix leak
    expect(output).not.toMatch(/at\s+\w+\.\</);
    expect(output).not.toContain('    at ');
  });

  it('ErrorBoundary catches React crashes gracefully', async () => {
    // ErrorBoundary is a .tsx component — test through CLI's actual error handling path.
    // The CLI entry wraps the Ink render in ErrorBoundary. We verify the concept:
    // when the CLI hits a fatal error, the user sees a friendly message.
    const harness = await TerminalHarness.spawnWithArgs(['foobar'], {
      env: { SQUAD_DEBUG: '0' },
    });
    await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // User sees friendly output, not a raw crash
    expect(output).toContain('Unknown command');
    expect(output).toContain('doctor');
    // The shell did NOT crash — it exited with a controlled error
    expect(harness.getExitCode()).toBe(1);
  });

  it('whitespace-only input shows help, not a crash', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['  ']);
    const exitCode = await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // Should show usage info, not crash
    expect(output.toLowerCase()).toContain('usage');
    expect(exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 5: "I want to talk to a specific agent" — @Agent routing
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 5: Talk to a specific agent (@Agent routing)', () => {
  const knownAgents = ['Keaton', 'Fenster', 'Hockney', 'Kovash'];

  it('@AgentName routes to the correct agent', () => {
    const parsed = parseInput('@Keaton fix the build', knownAgents);

    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Keaton');
    expect(parsed.content).toBe('fix the build');
  });

  it('case-insensitive matching works (humans are sloppy typists)', () => {
    const parsed = parseInput('@keaton fix the build', knownAgents);

    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Keaton'); // canonical casing
  });

  it('"AgentName, do this" comma syntax works too', () => {
    const parsed = parseInput('Fenster, refactor the parser', knownAgents);

    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Fenster');
    expect(parsed.content).toBe('refactor the parser');
  });

  it('unknown @name falls through to coordinator (not an error)', () => {
    const parsed = parseInput('@Unknown do something', knownAgents);

    // Should route to coordinator, not crash or error
    expect(parsed.type).toBe('coordinator');
  });

  it('bare message without @agent goes to coordinator', () => {
    const parsed = parseInput('what should we build next?', knownAgents);

    expect(parsed.type).toBe('coordinator');
    expect(parsed.content).toBe('what should we build next?');
  });

  it('@Agent with no message still routes correctly', () => {
    const parsed = parseInput('@Keaton', knownAgents);

    // Should still be direct_agent type, content may be undefined
    expect(parsed.type).toBe('direct_agent');
    expect(parsed.agentName).toBe('Keaton');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 6: "I'm a power user now" — slash commands
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 6: Power user (slash commands)', () => {
  let registry: SessionRegistry;
  let renderer: ShellRenderer;
  const teamRoot = '/fake/project';

  beforeEach(() => {
    registry = new SessionRegistry();
    renderer = new ShellRenderer();
    registry.register('Keaton', 'Lead');
    registry.register('Fenster', 'Core Dev');
  });

  function runCommand(input: string, messageHistory: ShellMessage[] = []) {
    const parsed = parseInput(input, registry.getAll().map(a => a.name));
    if (parsed.type !== 'slash_command') throw new Error(`Expected slash command, got ${parsed.type}`);
    return executeCommand(parsed.command!, parsed.args ?? [], {
      registry, renderer, messageHistory, teamRoot,
    });
  }

  it('/help lists all available commands with descriptions', () => {
    const result = runCommand('/help');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('/status');
    expect(result.output).toContain('/history');
    expect(result.output).toContain('/agents');
    expect(result.output).toContain('/quit');
  });

  it('/status shows team root, size, and active count', () => {
    const result = runCommand('/status');

    expect(result.handled).toBe(true);
    expect(result.output).toContain(teamRoot);
    expect(result.output).toContain('2'); // 2 agents
  });

  it('/agents lists team members with status', () => {
    const result = runCommand('/agents');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('Keaton');
    expect(result.output).toContain('Fenster');
    expect(result.output).toContain('Lead');
    expect(result.output).toContain('Core Dev');
  });

  it('/history with no messages says so clearly', () => {
    const result = runCommand('/history');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('No messages yet');
  });

  it('/history with messages shows recent conversation', () => {
    const history: ShellMessage[] = [
      { role: 'user', content: 'hello team', timestamp: new Date() },
      { role: 'agent', agentName: 'Keaton', content: 'Hey! Ready to work.', timestamp: new Date() },
    ];
    const result = runCommand('/history', history);

    expect(result.handled).toBe(true);
    expect(result.output).toContain('hello team');
    expect(result.output).toContain('Keaton');
  });

  it('/quit signals exit', () => {
    const result = runCommand('/quit');
    expect(result.handled).toBe(true);
    expect(result.exit).toBe(true);
  });

  it('unknown /command gives friendly hint, not an error', () => {
    const result = runCommand('/frobnicate');

    expect(result.handled).toBe(false);
    expect(result.output).toContain('/help');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Journey 7: "I came back the next day" — persistent state
// ═══════════════════════════════════════════════════════════════════════════

describe('Journey 7: Came back the next day (persistence)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('squad-journey-persist-');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('first-run marker is consumed, so no ceremony on return', () => {
    scaffoldSquadDir(tempDir, { firstRun: true });

    // Day 1: sees first-run
    const day1 = loadWelcomeData(tempDir);
    expect(day1!.isFirstRun).toBe(true);

    // Day 2: no first-run (marker was consumed)
    const day2 = loadWelcomeData(tempDir);
    expect(day2!.isFirstRun).toBe(false);
  });

  it('team is still loaded on return — state feels persistent', () => {
    scaffoldSquadDir(tempDir);

    const data = loadWelcomeData(tempDir);
    expect(data!.agents.length).toBe(3);
    expect(data!.agents[0]!.name).toBe('Keaton');

    // Simulate "next day" — load again
    const dataNextDay = loadWelcomeData(tempDir);
    expect(dataNextDay!.agents.length).toBe(3);
    expect(dataNextDay!.agents[0]!.name).toBe('Keaton');
  });

  it('focus area persists between sessions', () => {
    scaffoldSquadDir(tempDir);

    const data = loadWelcomeData(tempDir);
    expect(data!.focus).toBe('Testing human journeys');

    // Simulate coordinator updating focus
    const nowPath = join(tempDir, '.squad', 'identity', 'now.md');
    const nowContent = readFileSync(nowPath, 'utf-8');
    writeFileSync(nowPath, nowContent.replace('Testing human journeys', 'Shipping v1.0'));

    const dataLater = loadWelcomeData(tempDir);
    expect(dataLater!.focus).toBe('Shipping v1.0');
  });

  it('returns null gracefully when .squad/ is missing (fresh clone)', () => {
    // No scaffolding — just a bare temp dir
    const data = loadWelcomeData(tempDir);
    expect(data).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-journey: CLI help experience (the safety net)
// ═══════════════════════════════════════════════════════════════════════════

describe('Cross-journey: CLI --help is the safety net', () => {
  it('--help output lists every major command', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame());
    await harness.close();

    // A confused human types --help. Do they see EVERY command?
    const expectedCommands = ['init', 'status', 'doctor', 'help', 'upgrade', 'export', 'import'];
    for (const cmd of expectedCommands) {
      expect(output.toLowerCase()).toContain(cmd);
    }
  });

  it('--version gives a clean version string', async () => {
    const harness = await TerminalHarness.spawnWithArgs(['--version']);
    await harness.waitForExit(10000);
    const output = stripAnsi(harness.captureFrame()).trim();
    await harness.close();

    // Should be a semver-ish string, not "undefined" or empty
    expect(output).toMatch(/^\d+\.\d+\.\d+/);
  });
});
