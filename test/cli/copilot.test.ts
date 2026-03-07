/**
 * Copilot Command Tests — Add/remove copilot agent from team roster
 *
 * Tests module exports and error handling for missing squad directory.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-copilot-${randomBytes(4).toString('hex')}`);

describe('CLI: copilot command', () => {
  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('module exports runCopilot function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/copilot');
    expect(typeof mod.runCopilot).toBe('function');
  });

  it('module exports CopilotFlags interface (verifiable via function)', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/copilot');
    // runCopilot(dest, flags) — 2 parameters
    expect(mod.runCopilot.length).toBe(2);
  });

  it('throws when no squad directory exists', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');
    mkdirSync(TEST_ROOT, { recursive: true });

    await expect(runCopilot(TEST_ROOT, {})).rejects.toThrow(/squad/i);
  });

  it('handles --off flag when copilot is not on team', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.squad', 'team.md'), '# Team\n\n## Members\n');

    // --off when copilot is not on team should print message and return (not throw)
    await expect(runCopilot(TEST_ROOT, { off: true })).resolves.toBeUndefined();
  });

  it('adds copilot section to team.md', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.squad', 'team.md'), '# Team\n\n## Members\n');

    await runCopilot(TEST_ROOT, {});

    const content = readFileSync(join(TEST_ROOT, '.squad', 'team.md'), 'utf-8');
    expect(content).toContain('opilot');
  });

  it('reports already-on-team when copilot exists without --auto-assign', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.squad', 'team.md'), '# Team\n\n## 🤖 Coding Agent\n@copilot\n');

    // Should return without throwing
    await expect(runCopilot(TEST_ROOT, {})).resolves.toBeUndefined();
  });
});
