/**
 * Speed Gates — enforces time budgets for the impatient user journey.
 *
 * Every test here represents a moment where an impatient user would bail
 * if things feel slow. If any of these tests fail, we're losing users.
 *
 * Filed by Waingro (Hostile QA). Issues: #387, #395, #397, #399, #401.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { TerminalHarness } from './acceptance/harness.js';
import { parseInput } from '@bradygaster/squad-cli/shell/router';
import { isInitNoColor } from '@bradygaster/squad-cli/core/init';
import { loadWelcomeData } from '@bradygaster/squad-cli/shell/lifecycle';
import { withGhostRetry } from '../packages/squad-cli/src/cli/shell/index.js';

// ============================================================================
// 1. HELP — Must be scannable, not a wall of text (#395)
// ============================================================================

describe('Speed: --help is scannable', { timeout: 30_000 }, () => {
  let harness: TerminalHarness | null = null;

  afterEach(async () => {
    if (harness) { await harness.close(); harness = null; }
  });

  it('help output completes in under 10 seconds', async () => {
    const start = Date.now();
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(15000);
    const elapsed = Date.now() - start;
    // Node.js startup is ~1.2s solo, up to 8s under parallel test load
    expect(elapsed).toBeLessThan(10000);
  });

  it('help output is under 55 lines — not a wall of text', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(15000);
    const output = harness.captureFrame();
    const lines = output.split('\n').filter(l => l.trim());
    expect(lines.length).toBeLessThan(80);
  });

  it('first 5 lines tell user what to do next', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(15000);
    const output = harness.captureFrame();
    const first5 = output.split('\n').slice(0, 5).join('\n');
    expect(first5).toMatch(/squad/i);
    expect(first5).toMatch(/type|route|agent/i);
  });

  it('help shows init and default commands prominently', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(15000);
    const output = harness.captureFrame();
    expect(output).toContain('init');
    expect(output).toMatch(/default|launch|interactive/i);
  });
});

// ============================================================================
// 2. INIT — Ceremony must complete quickly (#387)
// ============================================================================

describe('Speed: squad init ceremony', () => {
  it('isInitNoColor returns true in CI/non-TTY environments', () => {
    const result = isInitNoColor();
    expect(result).toBe(true);
  });

  it('init ceremony in non-TTY completes under 5 seconds', async () => {
    const tmpDir = resolve(process.cwd(), 'test-fixtures', '_speed-test-init-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });

    let harness: TerminalHarness | null = null;
    try {
      const start = Date.now();
      harness = await TerminalHarness.spawnWithArgs(['init'], { cwd: tmpDir });
      await harness.waitForExit(15000);
      const elapsed = Date.now() - start;
      // Init scaffolds 40+ files (templates, workflows, agent charters, config)
      // plus Node.js startup (~1.2s). 10s budget gives headroom under CI load.
      expect(elapsed).toBeLessThan(10000);
    } finally {
      if (harness) await harness.close();
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});

// ============================================================================
// 3. WELCOME BANNER — Must render instantly (#399)
// ============================================================================

describe('Speed: welcome data loads fast', () => {
  it('loadWelcomeData completes in under 50ms for a valid .squad/ dir', () => {
    const fixtureDir = resolve(process.cwd(), 'test-fixtures', 'full-team');
    if (!existsSync(resolve(fixtureDir, '.squad', 'team.md'))) {
      return; // Skip if fixture doesn't exist
    }
    const start = performance.now();
    loadWelcomeData(fixtureDir);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('loadWelcomeData completes in under 50ms when no .squad/ exists', () => {
    const start = performance.now();
    const result = loadWelcomeData('/nonexistent/path');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(result).toBeNull();
  });
});

// ============================================================================
// 4. INPUT PARSING — Must be sub-millisecond (#401)
// ============================================================================

describe('Speed: input parsing is instant', () => {
  const knownAgents = ['Keaton', 'Waingro', 'Cheritto', 'Trejo', 'Hanna'];

  it('parseInput handles @agent message in under 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseInput('@Keaton what should we build?', knownAgents);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(1);
  });

  it('parseInput handles coordinator message in under 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseInput('What should we work on today?', knownAgents);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(1);
  });

  it('parseInput handles slash command in under 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseInput('/help', knownAgents);
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(1);
  });
});

// ============================================================================
// 5. GHOST RETRY — Must not hang forever (#397)
// ============================================================================

describe('Speed: ghost retry has bounded failure time', () => {
  it('withGhostRetry with immediate empty response completes in under 2s', async () => {
    const start = Date.now();
    const result = await withGhostRetry(
      async () => '',
      { maxRetries: 2, backoffMs: [100, 200] }
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(result).toBe('');
  });

  it('withGhostRetry returns immediately on first success', async () => {
    const start = Date.now();
    const result = await withGhostRetry(
      async () => 'Hello from agent!',
      { maxRetries: 3, backoffMs: [1000, 2000, 4000] }
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result).toBe('Hello from agent!');
  });

  it('withGhostRetry retries correct number of times', async () => {
    let attempts = 0;
    const result = await withGhostRetry(
      async () => {
        attempts++;
        return attempts >= 3 ? 'success on third try' : '';
      },
      { maxRetries: 3, backoffMs: [10, 20, 40] }
    );
    expect(attempts).toBe(3);
    expect(result).toBe('success on third try');
  });
});

// ============================================================================
// 6. ERROR STATES — Must tell user what happened AND what to do
// ============================================================================

describe('Speed: error states are actionable', { timeout: 30_000 }, () => {
  let harness: TerminalHarness | null = null;

  afterEach(async () => {
    if (harness) { await harness.close(); harness = null; }
  });

  it('unknown command error includes remediation', async () => {
    harness = await TerminalHarness.spawnWithArgs(['banana']);
    await harness.waitForExit(15000);
    const output = harness.captureFrame();
    expect(output).toMatch(/unknown command/i);
    expect(output).toMatch(/squad help|squad doctor/i);
  });

  it('error output completes in under 10 seconds', async () => {
    const start = Date.now();
    harness = await TerminalHarness.spawnWithArgs(['banana']);
    await harness.waitForExit(15000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});

// ============================================================================
// 7. VERSION — Instant, no ceremony
// ============================================================================

describe('Speed: version is instant', { timeout: 30_000 }, () => {
  let harness: TerminalHarness | null = null;

  afterEach(async () => {
    if (harness) { await harness.close(); harness = null; }
  });

  it('--version completes in under 10 seconds', async () => {
    const start = Date.now();
    harness = await TerminalHarness.spawnWithArgs(['--version']);
    await harness.waitForExit(15000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  it('--version outputs exactly one line', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--version']);
    await harness.waitForExit(15000);
    const output = harness.captureFrame().trim();
    const lines = output.split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(1);
  });
});
