/**
 * Personal squads were removed in Squad 2.0 (finding F9).
 *
 * These tests pin the safety contract of the removal:
 *  - `squad init` / `cast` / `upgrade` / client rollback never read from, write to, move or
 *    delete a leftover 1.x personal squad directory (byte-identical before/after), and never
 *    point a new project's `teamRoot` at the global squad root.
 *  - The project roster is populated in the project `.squad/`, not in the legacy directory.
 *  - Two projects initialised side by side stay self-contained (no shared ambient roster).
 *  - `squad upgrade` and `squad doctor` print an explicit, reversible migration notice; the dead
 *    subcommands print it too and exit non-zero; detection never creates the legacy directory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { runCastAdd } from '@bradygaster/squad-cli/commands/cast';
import { checkLegacyPersonalSquad } from '@bradygaster/squad-cli/commands/doctor';
import { printPersonalSquadRemovedNotice, printPersonalSquadMigrationNoticeIfNeeded, PERSONAL_SQUAD_REMOVED_HEADLINE } from '../packages/squad-cli/src/cli/core/personal-squad-notice.js';
import { installClients, uninstallClients } from '@bradygaster/squad-sdk/client';
import { clearResolveSquadCache, detectLegacyPersonalSquad, legacyPersonalSquadPath, resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

let tmp: string;
let configHome: string;

/** Point every platform's config-dir lookup at a scratch directory. */
function stubConfigHome(dir: string): void {
  vi.stubEnv('APPDATA', dir);
  vi.stubEnv('LOCALAPPDATA', dir);
  vi.stubEnv('XDG_CONFIG_HOME', dir);
  if (process.platform === 'darwin') vi.stubEnv('HOME', dir);
}

function seedLegacyPersonalSquad(): string {
  const dir = legacyPersonalSquadPath();
  fs.mkdirSync(path.join(dir, 'agents', 'ghostwriter'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ defaultModel: 'auto', ghostProtocol: true }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'agents', 'ghostwriter', 'charter.md'), '# Ghostwriter\n\n## Identity\n- **Name:** Ghostwriter\n- **Role:** Personal advisor\n');
  fs.writeFileSync(path.join(dir, 'agents', 'ghostwriter', 'history.md'), '# History\n\n- learned something personal\n');
  fs.writeFileSync(path.join(dir, 'team.md'), '# Personal Squad\n\n## Members\n\n| Name | Role |\n|---|---|\n| Ghostwriter | Personal advisor |\n');
  return dir;
}

/** Stable fingerprint of a directory tree: relative path + sha256 of every file. */
function fingerprint(dir: string): string {
  const entries: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else entries.push(`${path.relative(dir, p).replace(/\\/g, '/')}:${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return entries.join('\n');
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
  return { lines, restore: () => { log.mockRestore(); err.mockRestore(); warn.mockRestore(); } };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-personal-removal-'));
  configHome = path.join(tmp, 'config-home');
  fs.mkdirSync(configHome, { recursive: true });
  stubConfigHome(configHome);
  vi.stubEnv('SQUAD_INIT_NO_COLOR', '1');
  clearResolveSquadCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  clearResolveSquadCache();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('personal squad removal: legacy data is never touched, projects stay self-contained', () => {
  it('init → cast → upgrade → client install/rollback leaves a legacy personal squad byte-identical and populates the project roster', async () => {
    const legacy = seedLegacyPersonalSquad();
    const before = fingerprint(legacy);
    const project = path.join(tmp, 'project');
    fs.mkdirSync(project, { recursive: true });

    const io = captureConsole();
    try {
      await runInit(project);
    } finally { io.restore(); }
    clearResolveSquadCache();

    const config = readJson(path.join(project, '.squad', 'config.json'));
    expect(config['teamRoot'], 'init must not link the project to the global squad root anymore').toBeUndefined();
    expect(resolveSquadPaths(project)?.mode, 'a fresh project resolves in local mode').toBe('local');
    expect(fingerprint(legacy), 'init must not write into the legacy personal squad').toBe(before);
    expect(io.lines.join('\n'), 'init no longer advertises personal agents').not.toMatch(/[Pp]ersonal squad detected/);

    const io2 = captureConsole();
    try {
      await runCastAdd(project, { name: 'Probe', role: 'developer' });
    } finally { io2.restore(); }
    expect(fs.existsSync(path.join(project, '.squad', 'agents', 'probe', 'charter.md')), 'cast writes the charter into the project').toBe(true);
    expect(fs.readFileSync(path.join(project, '.squad', 'team.md'), 'utf8'), 'project roster is populated').toMatch(/Probe/);
    expect(fs.existsSync(path.join(legacy, 'agents', 'probe')), 'cast must not write into the legacy personal squad').toBe(false);
    expect(fingerprint(legacy)).toBe(before);

    const io3 = captureConsole();
    try {
      await runUpgrade(project, { force: true });
    } finally { io3.restore(); }
    expect(fingerprint(legacy), 'upgrade must not touch the legacy personal squad').toBe(before);
    const upgradeOut = io3.lines.join('\n');
    expect(upgradeOut, 'upgrade prints the one-time migration notice').toContain(PERSONAL_SQUAD_REMOVED_HEADLINE);
    expect(upgradeOut).toContain(legacy);
    expect(upgradeOut).toMatch(/untouched/);
    expect(upgradeOut).toMatch(/squad export/);
    expect(upgradeOut).toMatch(/squad import/);

    // Idempotent: a second upgrade changes nothing in the legacy dir and still only informs.
    const io4 = captureConsole();
    try {
      await runUpgrade(project, { force: true });
    } finally { io4.restore(); }
    expect(fingerprint(legacy)).toBe(before);

    // Client projection + byte-preserving rollback never reach outside the project either.
    const ctx = { root: project, mcp: { command: 'squad', args: ['state-mcp'] } };
    const installed = installClients(['claude'], ctx);
    expect(installed.filter((r) => r.action === 'error')).toEqual([]);
    uninstallClients(['claude'], ctx);
    expect(fs.existsSync(path.join(project, '.claude')), 'rollback removes the projection').toBe(false);
    expect(fingerprint(legacy), 'install/rollback must not touch the legacy personal squad').toBe(before);
    expect(readJson(path.join(project, '.squad', 'config.json'))['teamRoot']).toBeUndefined();
  }, 180_000);

  it('two projects initialised side by side with a legacy personal squad present are independent (no ambient shared roster)', async () => {
    const legacy = seedLegacyPersonalSquad();
    const before = fingerprint(legacy);
    const a = path.join(tmp, 'alpha');
    const b = path.join(tmp, 'beta');
    fs.mkdirSync(a); fs.mkdirSync(b);
    const io = captureConsole();
    try {
      await runInit(a);
      clearResolveSquadCache();
      await runInit(b);
      clearResolveSquadCache();
      await runCastAdd(a, { name: 'Alpha-Only', role: 'developer' });
    } finally { io.restore(); }
    expect(fs.readFileSync(path.join(a, '.squad', 'team.md'), 'utf8')).toMatch(/Alpha-Only/);
    expect(fs.readFileSync(path.join(b, '.squad', 'team.md'), 'utf8'), 'beta must not see alpha\'s member').not.toMatch(/Alpha-Only/);
    expect(fs.readFileSync(path.join(b, '.squad', 'team.md'), 'utf8'), 'neither project inherits the legacy personal agent').not.toMatch(/Ghostwriter/);
    for (const p of [a, b]) {
      expect(readJson(path.join(p, '.squad', 'config.json'))['teamRoot']).toBeUndefined();
      expect(resolveSquadPaths(p)?.mode).toBe('local');
    }
    expect(fingerprint(legacy)).toBe(before);
  }, 180_000);
});

describe('personal squad removal: explicit, read-only migration notice', () => {
  it('detection is read-only: it never creates the legacy directory and returns null when nothing is left over', () => {
    const legacy = legacyPersonalSquadPath();
    expect(legacy.startsWith(configHome), `legacy path must live under the stubbed config home: ${legacy}`).toBe(true);
    expect(detectLegacyPersonalSquad()).toBeNull();
    expect(detectLegacyPersonalSquad('../team')).toBeNull();
    expect(fs.existsSync(legacy), 'detectLegacyPersonalSquad must not mkdir').toBe(false);
    expect(fs.existsSync(path.dirname(legacy)), 'nor its parent').toBe(false);
    expect(printPersonalSquadMigrationNoticeIfNeeded(null), 'nothing to say when nothing is left over').toBe(false);
  });

  it('squad doctor warns about the legacy directory and about a teamRoot that 1.x pointed at the global squad root, naming both paths', () => {
    const legacy = seedLegacyPersonalSquad();
    const globalRoot = path.dirname(legacy);
    const project = path.join(tmp, 'project', '.squad');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'config.json'), JSON.stringify({ version: 1, teamRoot: globalRoot, projectKey: null }));

    const check = checkLegacyPersonalSquad(project)!;
    expect(check, 'doctor must surface the leftover').toBeDefined();
    expect(check.status).toBe('warn');
    expect(check.message).toContain('removed in Squad 2.0');
    expect(check.message).toContain(legacy);
    expect(check.message).toMatch(/untouched/);
    expect(check.message).toContain(`teamRoot (${globalRoot})`);
    expect(check.message).toMatch(/remove the key .* or keep it/);

    // Only the directory, no teamRoot: the teamRoot sentence must not appear.
    fs.writeFileSync(path.join(project, 'config.json'), JSON.stringify({ version: 1, teamRoot: '.', projectKey: null }));
    const dirOnly = checkLegacyPersonalSquad(project)!;
    expect(dirOnly.message).toContain(legacy);
    expect(dirOnly.message).not.toContain('teamRoot (');

    // Clean project, no legacy dir: nothing to report.
    fs.rmSync(legacy, { recursive: true, force: true });
    expect(checkLegacyPersonalSquad(project)).toBeUndefined();
  });

  it('squad personal|consult|extract print the removal notice (with the legacy path when present) and point at squad export/import', () => {
    const io = captureConsole();
    try {
      printPersonalSquadRemovedNotice('personal');
    } finally { io.restore(); }
    expect(io.lines.join('\n')).toMatch(/squad personal.*was removed in Squad 2\.0/);
    expect(io.lines.join('\n')).toMatch(/squad export/);

    const legacy = seedLegacyPersonalSquad();
    const before = fingerprint(legacy);
    const io2 = captureConsole();
    try {
      printPersonalSquadRemovedNotice('consult');
    } finally { io2.restore(); }
    const out = io2.lines.join('\n');
    expect(out).toContain(PERSONAL_SQUAD_REMOVED_HEADLINE);
    expect(out).toContain(legacy);
    expect(out).toMatch(/squad import/);
    expect(fingerprint(legacy), 'printing a notice must not touch the directory').toBe(before);
  });
});
