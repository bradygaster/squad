/**
 * Smaller 2.0.0-preview.2 CLI fixes (#2298, #2299):
 *  - `squad client list` / `client add --dry-run`;
 *  - `squad doctor` mode detection for a relative `teamRoot` that is this project;
 *  - `squad update-check` stale-cache handling;
 *  - dry-run header shows the project label, never `undefined`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { teamRootIsThisProject, getDoctorMode } from '@bradygaster/squad-cli/commands/doctor';
import { runClientCommand, listClients } from '../../packages/squad-cli/src/cli/commands/client.js';
import { runUpdateCheck, UPDATE_CHECK_MAX_CACHE_AGE_MS } from '@bradygaster/squad-cli/commands/update-check';
import { getCachePath } from '../../packages/squad-cli/src/cli/self-update.js';
import { readProjectLabel, runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { runInit } from '@bradygaster/squad-cli/core/init';

describe('squad doctor mode for a relative teamRoot pointing at this project (#2299)', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'squad-doctor-mode-'));
    mkdirSync(join(cwd, '.squad'));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it.each(['.squad', '.', './.squad', '.squad/'])('teamRoot %j is local', (teamRoot) => {
    expect(teamRootIsThisProject(cwd, teamRoot)).toBe(true);
    writeFileSync(join(cwd, '.squad', 'config.json'), JSON.stringify({ teamRoot }));
    expect(getDoctorMode(cwd)).toBe('local');
  });

  it('an absolute path to this project is local; another directory is remote', () => {
    expect(teamRootIsThisProject(cwd, path.resolve(cwd, '.squad'))).toBe(true);
    expect(teamRootIsThisProject(cwd, '../other-team')).toBe(false);
    writeFileSync(join(cwd, '.squad', 'config.json'), JSON.stringify({ teamRoot: '../other-team' }));
    expect(getDoctorMode(cwd)).toBe('remote');
  });
});

describe('squad update-check stale cache (#2299)', () => {
  const cachePath = getCachePath();
  let saved: string | null = null;
  beforeEach(() => {
    saved = existsSync(cachePath) ? readFileSync(cachePath, 'utf8') : null;
    mkdirSync(path.dirname(cachePath), { recursive: true });
  });
  afterEach(() => {
    if (saved === null) rmSync(cachePath, { force: true }); else writeFileSync(cachePath, saved);
  });

  it('a cache older than 24h is flagged stale and does not claim an update', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '0.9.4', checkedAt: Date.now() - 169 * 24 * 3600 * 1000 }));
    const result = await runUpdateCheck('2.0.0-preview.1');
    expect(result.stale).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.cacheAge).toMatch(/^PT\d+H/);
  });

  it('a fresh cache is not stale', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '99.0.0', checkedAt: Date.now() - UPDATE_CHECK_MAX_CACHE_AGE_MS / 2 }));
    const result = await runUpdateCheck('2.0.0-preview.1');
    expect(result.stale).toBe(false);
    expect(result.updateAvailable).toBe(true);
  });
});

describe('squad client list / add --dry-run (#2299)', () => {
  const root = join(tmpdir(), `.test-client-cmd-${randomBytes(4).toString('hex')}`);
  const home = join(tmpdir(), `.test-client-cmd-home-${randomBytes(4).toString('hex')}`);
  const logs: string[] = [];

  function snapshot(dir: string): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const f = join(d, e);
        if (statSync(f).isDirectory()) walk(f);
        else out.set(path.relative(dir, f), createHash('sha256').update(readFileSync(f)).digest('hex'));
      }
    };
    walk(dir);
    return out;
  }

  beforeEach(async () => {
    for (const d of [root, home]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
    process.env.SQUAD_HOME_DIR_OVERRIDE = home;
    logs.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runInit(root);
    logs.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    for (const d of [root, home]) rmSync(d, { recursive: true, force: true });
  });

  it('lists the default Copilot host when clients[] is empty and reports its projection status', async () => {
    const result = await listClients(root);
    expect(result.configured).toEqual([]);
    expect(result.clients.map((c) => c.id)).toEqual(['copilot']);
    expect(result.clients[0]!.configured).toBe(false);
    expect(result.clients[0]!.label).toBe('GitHub Copilot');
    expect(result.clients[0]!.files.map((f) => f.path)).toEqual(expect.arrayContaining(['.github/agents/squad.agent.md', '.mcp.json']));
    expect(result.clients[0]!.status).toBe('projected');

    expect(await runClientCommand(root, ['list'])).toBe(0);
    const text = logs.join('\n');
    expect(text).toContain('copilot');
    expect(text).toContain('(default)');
    expect(text).toContain('clients[] is empty');
  });

  it('--json emits the structured report and `squad client` with no subcommand lists', async () => {
    logs.length = 0;
    expect(await runClientCommand(root, ['--json'])).toBe(0);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.clients[0].id).toBe('copilot');
  });

  it('add --dry-run computes the set and writes nothing; add persists clients[] and projects files', async () => {
    const before = snapshot(root);
    expect(await runClientCommand(root, ['add', 'claude', '--dry-run'])).toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(logs.join('\n')).toMatch(/Would project client host files for: claude.*--dry-run/);

    expect(await runClientCommand(root, ['add', 'claude'])).toBe(0);
    const cfg = JSON.parse(readFileSync(join(root, '.squad', 'config.json'), 'utf8'));
    expect(cfg.clients).toEqual(['claude']);
    const listed = await listClients(root);
    expect(listed.clients.map((c) => c.id)).toEqual(['claude']);
    expect(listed.clients[0]!.status).toBe('projected');
  });

  it('unknown subcommand and missing list are usage errors', async () => {
    expect(await runClientCommand(root, ['frobnicate'])).toBe(1);
    expect(await runClientCommand(root, ['add'])).toBe(1);
  });
});

describe('upgrade dry-run header (#2299)', () => {
  const root = join(tmpdir(), `.test-dry-header-${randomBytes(4).toString('hex')}`);
  const home = join(tmpdir(), `.test-dry-header-home-${randomBytes(4).toString('hex')}`);
  beforeEach(async () => {
    for (const d of [root, home]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
    process.env.SQUAD_HOME_DIR_OVERRIDE = home;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runInit(root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    for (const d of [root, home]) rmSync(d, { recursive: true, force: true });
  });

  it('uses the project name from config or the repository directory name, never "undefined"', async () => {
    expect(readProjectLabel(path.join(tmpdir(), 'repos', 'my-squad'), {})).toBe('my-squad');
    expect(readProjectLabel('/repos/my-squad', { projectName: 'Squad Squad' })).toBe('Squad Squad');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    await runUpgrade(root, { dryRun: true });
    const header = logs.find((l) => l.includes('previewing upgrade'))!;
    expect(header).toBeDefined();
    expect(header).toContain(`— ${path.basename(root)}: previewing upgrade from`);
    expect(header).not.toContain('undefined');
  });
});
