/**
 * Profile boundary (Squad 2.0): `resolveSquad()` / `resolveSquadPaths()` never treat the user
 * profile as a project — `<home>/.squad` itself, `SQUAD_HOME`, and the platform config dir are
 * rejected — while legitimate projects that merely live UNDER the home directory
 * (`<home>/src/proj/.squad`) resolve normally.
 *
 * Variants: long and 8.3 short paths (Windows; skipped loudly when 8.3 names are disabled on the
 * volume), case and separator variants, a junction/symlink to the profile root, and the
 * HOME/USERPROFILE/APPDATA/SQUAD_HOME environment variants.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearResolveSquadCache, isRetiredProfileTeamRoot, resolveGlobalSquadPath, resolveSquad, resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

let tmp: string;
let fakeHome: string;

const canon = (p: string) => fs.realpathSync.native(p);
const same = (a: string, b: string) => expect(canon(a).toLowerCase()).toBe(canon(b).toLowerCase());

function mkSquad(dir: string): string {
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.squad', 'team.md'), `# ${path.basename(dir)}\n`);
  return path.join(dir, '.squad');
}

function shortPath(p: string): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/c', `for %I in ("${p}") do @echo %~sI`], { encoding: 'utf8', windowsVerbatimArguments: true }).trim();
    return out && out.toLowerCase() !== p.toLowerCase() ? out : null;
  } catch { return null; }
}

function tryLink(target: string, link: string): boolean {
  try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); return true; } catch { return false; }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-profile-boundary-'));
  fakeHome = path.join(tmp, 'fake-home');
  fs.mkdirSync(fakeHome, { recursive: true });
  vi.stubEnv('HOME', fakeHome);
  vi.stubEnv('USERPROFILE', fakeHome);
  vi.stubEnv('SQUAD_HOME', path.join(fakeHome, '.squad'));
  clearResolveSquadCache();
  expect(os.homedir()).toBe(fakeHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearResolveSquadCache();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('profile boundary: only the profile itself is rejected', () => {
  it('<home>/.squad is never a project; <home>/src/proj/.squad is; the walk stops at home without a .git', () => {
    mkSquad(fakeHome);
    const proj = path.join(fakeHome, 'src', 'proj');
    const projSquad = mkSquad(proj);
    fs.mkdirSync(path.join(proj, 'packages', 'api'), { recursive: true });
    const work = path.join(fakeHome, 'work', 'nothing-here');
    fs.mkdirSync(work, { recursive: true });

    expect(resolveSquad(proj)).toBe(projSquad);
    expect(resolveSquad(path.join(proj, 'packages', 'api')), 'subfolder of a legit project').toBe(projSquad);
    expect(resolveSquadPaths(proj)?.mode).toBe('local');
    expect(resolveSquad(work), 'no .git on the way up: stops at home, never ~/.squad').toBeNull();
    expect(resolveSquad(fakeHome), 'cwd = home').toBeNull();
    expect(resolveSquad(path.join(fakeHome, '.squad')), 'cwd = ~/.squad itself').toBeNull();
    expect(resolveSquadPaths(work)).toBeNull();
  });

  it('case and separator variants of the same paths behave identically', () => {
    const proj = path.join(fakeHome, 'src', 'proj');
    const projSquad = mkSquad(proj);
    mkSquad(fakeHome);
    const variants = process.platform === 'win32'
      ? [proj.toUpperCase(), proj.replace(/\\/g, '/'), proj.replace(/^([a-z]):/i, (m) => m.toLowerCase()) + '\\']
      : [proj + '/', proj.replace(/\/+/g, '//')];
    for (const v of variants) {
      clearResolveSquadCache();
      const got = resolveSquad(v);
      expect(got, v).not.toBeNull();
      same(got!, projSquad);
    }
    const homeVariants = process.platform === 'win32' ? [fakeHome.toUpperCase(), fakeHome.replace(/\\/g, '/'), path.join(fakeHome, 'work')] : [fakeHome + '/', path.join(fakeHome, 'work')];
    fs.mkdirSync(path.join(fakeHome, 'work'), { recursive: true });
    for (const v of homeVariants) {
      clearResolveSquadCache();
      expect(resolveSquad(v), `${v} must not resolve ~/.squad`).toBeNull();
    }
  });

  it.skipIf(process.platform !== 'win32')('8.3 short paths resolve the same project and respect the same boundary [Windows]', (ctx) => {
    mkSquad(fakeHome);
    const proj = path.join(fakeHome, 'source-projects', 'long-project-name');
    const projSquad = mkSquad(proj);
    const shortProj = shortPath(proj);
    const shortHome = shortPath(fakeHome);
    if (!shortProj || !shortHome) {
      ctx.skip(); // 8.3 name generation is disabled on this volume (fsutil 8dot3name); nothing to compare
      return;
    }
    expect(shortProj.toLowerCase()).not.toBe(proj.toLowerCase());
    clearResolveSquadCache();
    const got = resolveSquad(shortProj);
    expect(got, 'short-form project path').not.toBeNull();
    same(got!, projSquad);
    fs.mkdirSync(path.join(fakeHome, 'work'), { recursive: true });
    clearResolveSquadCache();
    expect(resolveSquad(path.join(shortHome, 'work')), 'short-form path under home must still stop at home').toBeNull();
    expect(isRetiredProfileTeamRoot(path.join(shortHome, '.squad'))).toBe(true);
    expect(isRetiredProfileTeamRoot(shortProj)).toBe(false);
  });

  it('a junction/symlink to the profile root is canonicalized: paths through it hit the boundary, projects through it still resolve', (ctx) => {
    mkSquad(fakeHome);
    const proj = path.join(fakeHome, 'src', 'proj');
    const projSquad = mkSquad(proj);
    fs.mkdirSync(path.join(fakeHome, 'work'), { recursive: true });
    const link = path.join(tmp, 'link-home');
    if (!tryLink(fakeHome, link)) { ctx.skip(); return; } // no symlink/junction privilege on this host
    clearResolveSquadCache();
    expect(resolveSquad(path.join(link, 'work')), 'through the link, the home boundary still applies').toBeNull();
    expect(resolveSquad(link), 'the link itself is the home dir').toBeNull();
    clearResolveSquadCache();
    const got = resolveSquad(path.join(link, 'src', 'proj'));
    expect(got, 'a legit project reached through the link resolves').not.toBeNull();
    same(got!, projSquad);
  });

  it('SQUAD_HOME elsewhere is rejected as a project but a sibling project is fine; APPDATA/XDG config dir is retired', () => {
    const roam = path.join(tmp, 'roaming');
    fs.mkdirSync(path.join(roam, '.squad'), { recursive: true });
    fs.writeFileSync(path.join(roam, '.squad', 'team.md'), '# roam\n');
    fs.mkdirSync(path.join(roam, 'inner'), { recursive: true });
    vi.stubEnv('SQUAD_HOME', path.join(roam, '.squad'));
    clearResolveSquadCache();
    expect(resolveSquad(path.join(roam, 'inner')), 'SQUAD_HOME is never a project squad').toBeNull();
    const sibling = path.join(tmp, 'sibling-project');
    const sibSquad = mkSquad(sibling);
    expect(resolveSquad(sibling)).toBe(sibSquad);
    expect(isRetiredProfileTeamRoot(path.join(roam, '.squad'))).toBe(true);
    expect(isRetiredProfileTeamRoot(sibling)).toBe(false);

    const cfg = resolveGlobalSquadPath(); // under the redirected APPDATA / XDG_CONFIG_HOME
    expect(isRetiredProfileTeamRoot(cfg)).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(cfg, '.squad'))).toBe(true);
    // a project that happens to live next to the config dir is not retired
    const neighbour = path.join(path.dirname(cfg), 'my-project');
    mkSquad(neighbour);
    expect(isRetiredProfileTeamRoot(neighbour)).toBe(false);
    clearResolveSquadCache();
    expect(resolveSquad(neighbour)).toBe(path.join(neighbour, '.squad'));
  });

  it('the platform config dir (%APPDATA%\\squad, ~/.config/squad) is never admitted as a project, at any spelling (LC-11)', () => {
    const cfg = resolveGlobalSquadPath(); // redirected by the test profile guard
    const legacyGlobal = mkSquad(cfg); // a leftover team directory under the platform config dir
    fs.mkdirSync(path.join(cfg, 'projects', 'abc'), { recursive: true });
    for (const start of [cfg, path.join(cfg, 'projects', 'abc'), legacyGlobal, cfg.toUpperCase(), cfg.replace(/\\/g, '/')]) {
      clearResolveSquadCache();
      expect(resolveSquad(start), `${start} must not resolve a team from the platform config dir`).toBeNull();
      expect(resolveSquadPaths(start), `${start} (resolveSquadPaths)`).toBeNull();
    }
    expect(isRetiredProfileTeamRoot(cfg)).toBe(true);
    expect(isRetiredProfileTeamRoot(legacyGlobal)).toBe(true);
    // a project whose cwd is UNDER the config dir's parent but not inside <config>/squad is fine
    const neighbour = mkSquad(path.join(path.dirname(cfg), 'neighbour'));
    clearResolveSquadCache();
    expect(resolveSquad(path.dirname(neighbour))).toBe(neighbour);
  });

  it('canonicalization failure is fail-closed: the resolver refuses instead of comparing lexically (LC-12)', () => {
    const proj = path.join(fakeHome, 'src', 'proj');
    const projSquad = mkSquad(proj);
    clearResolveSquadCache();
    expect(resolveSquad(proj)).toBe(projSquad);
    // Make canonicalization of this project fail (broken reparse point / EACCES on a parent in real life).
    const native = fs.realpathSync.native;
    const spy = vi.spyOn(fs.realpathSync, 'native').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
      if (String(p).toLowerCase().startsWith(proj.toLowerCase())) throw Object.assign(new Error('EACCES: cannot canonicalize'), { code: 'EACCES' });
      return (native as (...a: unknown[]) => string)(p, ...rest);
    }) as typeof fs.realpathSync.native);
    try {
      clearResolveSquadCache();
      expect(resolveSquad(proj), 'unresolvable path must not be admitted lexically').toBeNull();
      expect(resolveSquadPaths(proj)).toBeNull();
      expect(isRetiredProfileTeamRoot(proj), 'an unresolvable teamRoot is never followed').toBe(true);
    } finally {
      spy.mockRestore();
    }
    clearResolveSquadCache();
    expect(resolveSquad(proj), 'back to normal once canonicalization works').toBe(projSquad);
  });

  it('USERPROFILE/HOME pointing at a different directory moves the boundary with it', () => {
    const otherHome = path.join(tmp, 'other-home');
    fs.mkdirSync(path.join(otherHome, 'work'), { recursive: true });
    mkSquad(otherHome);
    vi.stubEnv('HOME', otherHome);
    vi.stubEnv('USERPROFILE', otherHome);
    vi.stubEnv('SQUAD_HOME', path.join(otherHome, '.squad'));
    clearResolveSquadCache();
    expect(os.homedir()).toBe(otherHome);
    expect(resolveSquad(path.join(otherHome, 'work'))).toBeNull();
    // the previous fake home is now an ordinary directory: its .squad resolves like any project
    const prevSquad = mkSquad(fakeHome);
    expect(resolveSquad(fakeHome)).toBe(prevSquad);
  });
});
