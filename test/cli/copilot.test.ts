/**
 * Copilot Command Tests — Add/remove copilot agent from team roster
 *
 * Tests module exports and error handling for missing squad directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('CLI: copilot with externalized state (#1397)', () => {
  const EXT_GLOBAL = join(tmpdir(), `.test-cli-copilot-ext-global-${randomBytes(4).toString('hex')}`);
  const EXT_PROJECT_KEY = `test-copilot-ext-${randomBytes(4).toString('hex')}`;
  const externalStateDir = join(EXT_GLOBAL, 'squad', 'projects', EXT_PROJECT_KEY);
  const origAppData = process.env['APPDATA'];
  const origXdgConfig = process.env['XDG_CONFIG_HOME'];

  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    if (existsSync(EXT_GLOBAL)) rmSync(EXT_GLOBAL, { recursive: true, force: true });

    // Point resolveGlobalSquadPath() inside EXT_GLOBAL (not the real user dir)
    if (process.platform === 'win32') {
      process.env['APPDATA'] = EXT_GLOBAL;
    } else {
      process.env['XDG_CONFIG_HOME'] = EXT_GLOBAL;
    }

    // Local repo: thin .squad/ holding only the marker `squad externalize` leaves behind
    mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, '.squad', 'config.json'),
      JSON.stringify({ version: 1, teamRoot: '.', projectKey: EXT_PROJECT_KEY, stateLocation: 'external' }, null, 2)
    );

    // External state dir: the real roster
    mkdirSync(externalStateDir, { recursive: true });
    writeFileSync(join(externalStateDir, 'team.md'), '# Team\n\n## Members\n\n## Project Context\n');
  });

  afterEach(() => {
    if (origAppData === undefined) delete process.env['APPDATA'];
    else process.env['APPDATA'] = origAppData;
    if (origXdgConfig === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = origXdgConfig;

    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    if (existsSync(EXT_GLOBAL)) rmSync(EXT_GLOBAL, { recursive: true, force: true });
  });

  it('adds copilot to the external team.md, not a local copy', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');

    await runCopilot(TEST_ROOT, {});

    const external = readFileSync(join(externalStateDir, 'team.md'), 'utf-8');
    expect(external).toContain('Coding Agent');
    // The marker-only local .squad/ must not grow a team.md
    expect(existsSync(join(TEST_ROOT, '.squad', 'team.md'))).toBe(false);
  });

  it('removes copilot from the external team.md with --off', async () => {
    const { runCopilot } = await import('@bradygaster/squad-cli/commands/copilot');

    await runCopilot(TEST_ROOT, {});
    await runCopilot(TEST_ROOT, { off: true });

    const external = readFileSync(join(externalStateDir, 'team.md'), 'utf-8');
    expect(external).not.toContain('🤖 Coding Agent');
  });
});
