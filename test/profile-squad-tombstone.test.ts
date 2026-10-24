/**
 * Tombstone: Squad 2.0 removed the user-profile squads (Squad 1.x kept a
 * `personal-squad/` directory and an optional global `.squad/` under the platform
 * config directory). Nothing in Squad may read, write, move or delete those
 * directories any more, and no project may be linked to them.
 *
 * These tests seed a realistic 1.x profile tree, then run every command that used
 * to touch it (`init`, `cast`, `upgrade`, client projection + rollback) and prove:
 *  - the whole profile tree is sha256-identical afterwards (no writes, moves, deletes);
 *  - no `node:fs` call ever targets a path inside it (no reads either);
 *  - the project roster lands in the project `.squad/`, `teamRoot` is never set;
 *  - two side-by-side projects do not share an ambient roster;
 *  - the profile squad is never resolved as a fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { runCastAdd } from '@bradygaster/squad-cli/commands/cast';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { installClients, uninstallClients } from '@bradygaster/squad-sdk/client';
import { clearResolveSquadCache, resolveGlobalSquadPath, resolveSquad, resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

let tmp: string;
let configHome: string;

/** Point every platform's config-dir lookup at a scratch directory. */
function stubConfigHome(dir: string): void {
  vi.stubEnv('APPDATA', dir);
  vi.stubEnv('LOCALAPPDATA', dir);
  vi.stubEnv('XDG_CONFIG_HOME', dir);
  if (process.platform === 'darwin') vi.stubEnv('HOME', dir);
}

/** The 1.x profile layout: `<config>/squad/personal-squad/` roster + a global `<config>/squad/.squad/`. */
function seedLegacyProfileTree(): { root: string; personal: string; global: string } {
  const root = resolveGlobalSquadPath();
  const personal = path.join(root, 'personal-squad');
  const global = path.join(root, '.squad');
  fs.mkdirSync(path.join(personal, 'agents', 'ghostwriter'), { recursive: true });
  fs.writeFileSync(path.join(personal, 'config.json'), JSON.stringify({ defaultModel: 'auto' }, null, 2) + '\n');
  fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'charter.md'), '# Ghostwriter\n\n## Identity\n- **Name:** Ghostwriter\n- **Role:** Advisor\n');
  fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'history.md'), '# History\n\n- learned something\n');
  fs.mkdirSync(path.join(global, 'agents', 'globetrotter'), { recursive: true });
  fs.writeFileSync(path.join(global, 'config.json'), JSON.stringify({ version: 1 }, null, 2) + '\n');
  fs.writeFileSync(path.join(global, 'team.md'), '# Global Squad\n\n## Members\n\n| Name | Role |\n|---|---|\n| Globetrotter | Advisor |\n');
  fs.writeFileSync(path.join(global, 'agents', 'globetrotter', 'charter.md'), '# Globetrotter\n');
  return { root, personal, global };
}

/** Stable fingerprint of a directory tree: relative path + sha256 of every file. */
function fingerprint(dir: string): string {
  const entries: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).replace(/\\/g, '/');
      if (e.isSymbolicLink()) entries.push(`${rel}:link:${fs.readlinkSync(p)}`);
      else if (e.isDirectory()) walk(p);
      else entries.push(`${rel}:${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return entries.join('\n');
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
}

function silence(): () => void {
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
  ];
  return () => spies.forEach((s) => s.mockRestore());
}

/**
 * Record every file-system access whose path argument points inside `forbidden`,
 * at both layers Squad uses: the `FSStorageProvider` (all SDK/CLI state I/O) and the
 * default `node:fs` export (client adapters, init helpers). The sha256 fingerprint is
 * the authoritative proof for writes/moves/deletes; this watch additionally catches
 * reads and existence probes. Fingerprinting runs while the watch is off.
 */
function watchForbiddenFsAccess(forbidden: string): { hits: string[]; stop: () => void } {
  const hits: string[] = [];
  const prefix = path.resolve(forbidden).toLowerCase();
  const inside = (p: unknown) => typeof p === 'string' && path.resolve(p).toLowerCase().startsWith(prefix);
  type AnyFn = (...a: unknown[]) => unknown;
  const wrap = (target: Record<string, AnyFn>, name: string, label: string) => {
    const original = target[name];
    if (typeof original !== 'function') return null;
    return vi.spyOn(target, name).mockImplementation(function (this: unknown, ...a: unknown[]) {
      if (inside(a[0]) || inside(a[1])) hits.push(`${label}.${name}(${String(a[0])})`);
      return original.apply(this ?? target, a);
    });
  };
  const fsNames = [
    'readFileSync', 'readdirSync', 'existsSync', 'statSync', 'lstatSync', 'openSync', 'accessSync',
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
    'copyFileSync', 'cpSync', 'opendirSync', 'realpathSync',
  ];
  const providerNames = [
    'readSync', 'writeSync', 'appendSync', 'existsSync', 'listSync', 'deleteSync', 'deleteDirSync',
    'isDirectorySync', 'mkdirSync', 'renameSync', 'copySync', 'statSync',
    'read', 'write', 'append', 'exists', 'list', 'delete', 'deleteDir', 'isDirectory', 'mkdir', 'rename', 'copy', 'stat', 'createIfAbsent',
  ];
  const spies = [
    ...fsNames.map((n) => wrap(fs as unknown as Record<string, AnyFn>, n, 'fs')),
    ...providerNames.map((n) => wrap(FSStorageProvider.prototype as unknown as Record<string, AnyFn>, n, 'storage')),
  ].filter((s): s is NonNullable<typeof s> => s !== null);
  return { hits, stop: () => spies.forEach((s) => s.mockRestore()) };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-profile-tombstone-'));
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

describe('user-profile squads are never read, written, moved or deleted (tombstone)', () => {
  it('init → cast → upgrade ×2 → client install/rollback leaves the 1.x profile tree sha256-identical, never touches it, and populates the project roster', async () => {
    const { root, personal, global } = seedLegacyProfileTree();
    const before = fingerprint(root);
    const project = path.join(tmp, 'project');
    fs.mkdirSync(project, { recursive: true });

    const restore = silence();
    const watch = watchForbiddenFsAccess(root);
    try {
      await runInit(project);
      clearResolveSquadCache();
      await runCastAdd(project, { name: 'Probe', role: 'developer' });
      await runUpgrade(project, { force: true });
      await runUpgrade(project, { force: true }); // idempotent second pass
      const ctx = { root: project, mcp: { command: 'squad', args: ['state-mcp'] } };
      const installed = installClients(['claude'], ctx);
      expect(installed.filter((r) => r.action === 'error')).toEqual([]);
      uninstallClients(['claude'], ctx);
    } finally {
      watch.stop();
      restore();
    }

    expect(watch.hits, 'no fs call may target the profile squad directories').toEqual([]);
    expect(fingerprint(root), 'profile tree must be byte-identical').toBe(before);
    expect(fs.existsSync(path.join(personal, 'agents', 'probe')), 'cast must not write into the 1.x roster').toBe(false);
    expect(fs.existsSync(path.join(global, 'agents', 'probe')), 'cast must not write into the global squad').toBe(false);

    const config = readJson(path.join(project, '.squad', 'config.json'));
    expect(config['teamRoot'], 'init must never link the project to a profile directory').toBeUndefined();
    expect(resolveSquadPaths(project)?.mode, 'a fresh project resolves in local mode').toBe('local');
    expect(fs.existsSync(path.join(project, '.squad', 'agents', 'probe', 'charter.md')), 'cast writes the charter into the project').toBe(true);
    expect(fs.readFileSync(path.join(project, '.squad', 'team.md'), 'utf8'), 'project roster is populated').toMatch(/Probe/);
    expect(fs.readFileSync(path.join(project, '.squad', 'team.md'), 'utf8'), 'no profile agent leaks into the project').not.toMatch(/Ghostwriter|Globetrotter/);
    expect(fs.existsSync(path.join(project, '.claude')), 'rollback removes the projection').toBe(false);
  }, 180_000);

  it('two projects initialised side by side with a 1.x profile tree present are independent (no ambient shared roster)', async () => {
    const { root } = seedLegacyProfileTree();
    const before = fingerprint(root);
    const a = path.join(tmp, 'alpha');
    const b = path.join(tmp, 'beta');
    fs.mkdirSync(a); fs.mkdirSync(b);
    const restore = silence();
    try {
      await runInit(a);
      clearResolveSquadCache();
      await runInit(b);
      clearResolveSquadCache();
      await runCastAdd(a, { name: 'Alpha-Only', role: 'developer' });
    } finally { restore(); }
    expect(fs.readFileSync(path.join(a, '.squad', 'team.md'), 'utf8')).toMatch(/Alpha-Only/);
    expect(fs.readFileSync(path.join(b, '.squad', 'team.md'), 'utf8'), 'beta must not see alpha\'s member').not.toMatch(/Alpha-Only/);
    expect(fs.readFileSync(path.join(b, '.squad', 'team.md'), 'utf8'), 'neither project inherits a profile agent').not.toMatch(/Ghostwriter|Globetrotter/);
    for (const p of [a, b]) {
      expect(readJson(path.join(p, '.squad', 'config.json'))['teamRoot']).toBeUndefined();
      expect(resolveSquadPaths(p)?.mode).toBe('local');
    }
    expect(fingerprint(root)).toBe(before);
  }, 180_000);

  it('resolveSquad never returns ~/.squad or SQUAD_HOME, and stops at the home directory even with no .git on the way up (LC-2)', () => {
    const fakeHome = path.join(tmp, 'fake-home');
    const homeSquad = path.join(fakeHome, '.squad');
    fs.mkdirSync(homeSquad, { recursive: true });
    fs.writeFileSync(path.join(homeSquad, 'team.md'), '# Home\n');
    const work = path.join(fakeHome, 'work', 'proj');
    fs.mkdirSync(work, { recursive: true });
    vi.stubEnv('HOME', fakeHome);
    vi.stubEnv('USERPROFILE', fakeHome);
    vi.stubEnv('SQUAD_HOME', homeSquad);
    clearResolveSquadCache();
    expect(os.homedir()).toBe(fakeHome);
    const watch = watchForbiddenFsAccess(homeSquad);
    try {
      expect(resolveSquad(work), 'no .git on the way up: the walk must stop at the home dir, not pick ~/.squad').toBeNull();
      expect(resolveSquad(fakeHome), 'cwd = home dir').toBeNull();
    } finally { watch.stop(); }
    expect(watch.hits).toEqual([]);

    // SQUAD_HOME somewhere else, laid out so the walk would hit it: still ignored.
    const roam = path.join(tmp, 'roam');
    fs.mkdirSync(path.join(roam, '.squad'), { recursive: true });
    fs.writeFileSync(path.join(roam, '.squad', 'team.md'), '# roam\n');
    fs.mkdirSync(path.join(roam, 'inner'), { recursive: true });
    vi.stubEnv('SQUAD_HOME', path.join(roam, '.squad'));
    clearResolveSquadCache();
    expect(resolveSquad(path.join(roam, 'inner')), 'SQUAD_HOME is never a project squad').toBeNull();

    // A real project under the fake home still resolves.
    const proj = path.join(fakeHome, 'src', 'real');
    fs.mkdirSync(path.join(proj, '.squad'), { recursive: true });
    clearResolveSquadCache();
    expect(resolveSquad(path.join(proj))).toBe(path.join(proj, '.squad'));
  });

  it('a directory without .squad/ never resolves to the profile squad', () => {
    const { root } = seedLegacyProfileTree();
    const before = fingerprint(root);
    // A fresh clone: the .git/ marker stops the parent walk at the repo root.
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(path.join(empty, '.git'), { recursive: true });
    const watch = watchForbiddenFsAccess(root);
    try {
      expect(resolveSquad(empty), 'no fallback to a user-profile squad').toBeNull();
    } finally { watch.stop(); }
    expect(watch.hits).toEqual([]);
    expect(fingerprint(root)).toBe(before);
  });
});
