/**
 * UX Gates Test Suite
 * Enforces UX quality rules for the Squad CLI.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { TerminalHarness } from './acceptance/harness.js';

describe('UX Gates', () => {
  let harness: TerminalHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = null;
    }
  });

  it('No overflow beyond terminal width (80 chars)', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(5000);
    
    const output = harness.captureFrame();
    const lines = output.split('\n');
    
    const longLines = lines.filter((line) => line.length > 80);
    expect(longLines, `Lines exceeding 80 chars:\n${longLines.join('\n')}`).toHaveLength(0);
  });

  it('Error states include remediation hints', async () => {
    harness = await TerminalHarness.spawnWithArgs(['nonexistent-command']);
    await harness.waitForExit(5000);
    
    const output = harness.captureFrame();
    
    expect(output).toMatch(/squad help/i);
    expect(output).toMatch(/Unknown command/i);
    expect(output).toMatch(/squad doctor/i);
  });

  it('Version output is bare semver (no prefix)', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--version']);
    await harness.waitForExit(5000);
    
    const output = harness.captureFrame().trim();
    const lines = output.split('\n').filter((line) => line.trim());
    
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^\d+\.\d+\.\d+/);
    expect(lines[0]).not.toMatch(/^squad/);
  });

  it('Help screen includes essential commands', async () => {
    harness = await TerminalHarness.spawnWithArgs(['--help']);
    await harness.waitForExit(5000);
    
    const output = harness.captureFrame();
    
    expect(output).toContain('init');
    expect(output).toContain('upgrade');
    expect(output).toContain('status');
    expect(output).toContain('help');
    expect(output).toContain('Usage:');
  });

  it('Status command shows clear output structure', async () => {
    harness = await TerminalHarness.spawnWithArgs(['status']);
    await harness.waitForExit(5000);
    
    const output = harness.captureFrame();
    
    expect(output).toMatch(/Squad Status/i);
    expect(output).toMatch(/Active squad:/i);
  });

  // TODO: grouped help categories are aspirational — not yet implemented in cli-entry.ts (#accessibility-audit)
  it.todo('Help groups commands into categories');

  // TODO: per-command help footer is aspirational — not yet implemented (#accessibility-audit)
  it.todo('Help footer directs to per-command help');
});
