/**
 * The test profile guard is fail-closed: any `fs` / `fs/promises` access under the developer's
 * REAL profile roots throws (sync, callback and promise forms), in this worker and in every
 * child process (inherited through NODE_OPTIONS=--require). Redirection alone (temp
 * SQUAD_HOME/APPDATA/…) is not enough — a test that hardcodes `os.homedir()/.squad` must blow
 * up loudly instead of touching the profile.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = JSON.parse(process.env['SQUAD_TEST_FORBIDDEN_ROOTS'] ?? '[]') as string[];
const realHomeSquad = path.join(os.homedir(), '.squad');
const probe = path.join(realHomeSquad, `guard-probe-${process.pid}.txt`);

describe('fail-closed test profile guard', () => {
  it('knows the real profile roots and SQUAD_HOME is redirected away from them', () => {
    expect(roots.length).toBeGreaterThan(0);
    const norm = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
    expect(roots).toContain(norm(realHomeSquad));
    expect(norm(process.env['SQUAD_HOME']!).startsWith(norm(os.tmpdir()).replace(/[A-Z]:/, (m) => m.toLowerCase()).slice(0, 3)), 'SQUAD_HOME must be under the temp dir').toBe(true);
    expect(roots.some((r) => norm(process.env['SQUAD_HOME']!).startsWith(r))).toBe(false);
  });

  it('throws on sync access under the real ~/.squad (read and write), without touching the disk', () => {
    expect(() => fs.existsSync(probe)).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.readFileSync(probe, 'utf8')).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.writeFileSync(probe, 'x')).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.mkdirSync(path.join(realHomeSquad, 'guard-probe-dir'), { recursive: true })).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.readdirSync(realHomeSquad)).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.renameSync(path.join(os.tmpdir(), 'nope'), probe)).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    expect(() => fs.realpathSync.native(realHomeSquad)).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
  });

  it('throws on callback and promise access too', async () => {
    await expect(fsp.readFile(probe, 'utf8')).rejects.toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    await expect(fsp.writeFile(probe, 'x')).rejects.toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    await expect(fsp.stat(realHomeSquad)).rejects.toThrow(/SQUAD_TEST_PROFILE_GUARD/);
    const cbErr = await new Promise<Error | null>((resolve) => fs.readFile(probe, 'utf8', (err) => resolve(err)));
    expect(cbErr?.message).toMatch(/SQUAD_TEST_PROFILE_GUARD/);
  });

  it('the platform config dir is guarded as well', () => {
    const cfg = process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming', 'squad')
      : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'squad') : path.join(os.homedir(), '.config', 'squad');
    expect(() => fs.existsSync(path.join(cfg, 'projects'))).toThrow(/SQUAD_TEST_PROFILE_GUARD/);
  });

  it('leaves ordinary paths alone', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-ok-'));
    fs.writeFileSync(path.join(d, 'a.txt'), 'ok');
    expect(fs.readFileSync(path.join(d, 'a.txt'), 'utf8')).toBe('ok');
    fs.rmSync(d, { recursive: true, force: true });
  });

  it('child processes inherit the guard via NODE_OPTIONS even when HOME/APPDATA are faked', () => {
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-fake-home-'));
    const script = `const fs=require('node:fs'); try { fs.existsSync(${JSON.stringify(probe)}); console.log('NOT-GUARDED'); } catch (e) { console.log('GUARDED: ' + e.message.slice(0, 40)); }`;
    const out = execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, HOME: fake, USERPROFILE: fake, APPDATA: fake, LOCALAPPDATA: fake, XDG_CONFIG_HOME: fake },
    });
    expect(out, 'the child must refuse the REAL profile path although its HOME is faked').toContain('GUARDED: SQUAD_TEST_PROFILE_GUARD');
    expect(process.env['NODE_OPTIONS']).toMatch(/profile-fs-guard\.cjs/);
    fs.rmSync(fake, { recursive: true, force: true });
  });
});
