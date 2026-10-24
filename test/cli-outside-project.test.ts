/**
 * Outside a project (no `.squad/` in the directory tree) the state commands must fail
 * with a clear "no squad in this directory, run squad init" error instead of resolving
 * a squad from the user profile. Squad 1.x used to fall back to a global squad under
 * the platform config directory; Squad 2.0 removed that, so this spawns the built CLI
 * in an empty directory with a *seeded* profile squad and proves it is neither used
 * nor touched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cliEntry = resolve(process.cwd(), 'packages/squad-cli/dist/cli-entry.js');
const cliBuilt = existsSync(cliEntry);

let tmp = '';
let configHome = '';
let profileSquadRoot = '';
let cwd = '';

function fingerprint(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${relative(dir, p).replace(/\\/g, '/')}:${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return out.join('\n');
}

async function runSquad(args: string[], extraEnv: NodeJS.ProcessEnv = {}, workDir: string = cwd): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFileAsync('node', [cliEntry, ...args], {
      cwd: workDir,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        NO_COLOR: '1',
        APPDATA: configHome,
        LOCALAPPDATA: configHome,
        XDG_CONFIG_HOME: configHome, // honoured on Linux and macOS, so the child resolves configHome/squad everywhere
        ...extraEnv,
      },
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'squad-outside-project-'));
  configHome = join(tmp, 'config-home');
  // A fully formed squad where 1.x would have looked for a global fallback. With APPDATA (Windows)
  // and XDG_CONFIG_HOME (Linux, macOS) both set to configHome, the child resolves exactly this path.
  profileSquadRoot = join(configHome, 'squad');
  const profileSquad = join(profileSquadRoot, '.squad');
  mkdirSync(join(profileSquad, 'agents', 'globetrotter'), { recursive: true });
  writeFileSync(join(profileSquad, 'config.json'), JSON.stringify({ version: 1 }, null, 2) + '\n');
  writeFileSync(join(profileSquad, 'team.md'), '# Global Squad\n\n## Members\n\n| Name | Role |\n|---|---|\n| Globetrotter | Advisor |\n');
  writeFileSync(join(profileSquad, 'agents', 'globetrotter', 'charter.md'), '# Globetrotter\n');
  // A fresh clone with no .squad/: the .git/ marker stops the parent walk, so nothing
  // above the temp dir (for example a developer's own ~/.squad) is picked up by accident.
  cwd = join(tmp, 'empty-project');
  mkdirSync(join(cwd, '.git'), { recursive: true });
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe.skipIf(!cliBuilt)('state commands outside a project fail clearly and never fall back to a profile squad', () => {
  /** Q's canonical wording (LC-9): byte-identical across every project-scoped command. */
  const CANONICAL = 'No squad in this directory. Run "squad init" first.';
  const cases: Array<[string, string[]]> = [
    ['status', ['status']],
    ['doctor', ['doctor']],
    ['cast', ['cast', '--name', 'Probe', '--role', 'developer']],
    ['cost', ['cost']],
    ['upgrade', ['upgrade']],
    ['nap', ['nap', '--dry-run']],
    ['export', ['export']],
    ['notes', ['notes', 'promote']],
    ['upstream', ['upstream', 'list']],
    ['economy', ['economy', 'status']],
    ['config', ['config', 'get', 'defaultModel']],
  ];

  it('every project-scoped command prints the identical canonical message, exits 1 and creates nothing (LC-9)', async () => {
    const before = fingerprint(profileSquadRoot);
    const entriesBefore = readdirSync(cwd).sort();
    const messages = new Map<string, string>();
    for (const [name, args] of cases) {
      const r = await runSquad(args);
      const output = `${r.stdout}\n${r.stderr}`;
      expect(r.code, `squad ${name} must fail outside a project; output:\n${output}`).toBe(1);
      const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
      const line = plain.split(/\r?\n/).map((l) => l.replace(/^[✗×x]\s*/, '').trim()).find((l) => l.startsWith('No squad'));
      expect(line, `squad ${name} output:\n${plain}`).toBe(CANONICAL);
      messages.set(name, line!);
      expect(readdirSync(cwd).sort(), `squad ${name} must not create anything (no .squad mkdir before failing)`).toEqual(entriesBefore);
    }
    expect(new Set(messages.values()).size, `messages differ: ${JSON.stringify([...messages])}`).toBe(1);
    expect(fingerprint(profileSquadRoot)).toBe(before);
  }, 300_000);

  for (const [name, args] of cases.slice(0, 4)) {
    it(`squad ${name}: non-zero exit, canonical message, profile squad untouched and unmentioned`, async () => {
      const before = fingerprint(profileSquadRoot);
      const r = await runSquad(args);
      const output = `${r.stdout}\n${r.stderr}`;
      expect(r.code, `squad ${name} must fail outside a project; output:\n${output}`).not.toBe(0);
      expect(output, `squad ${name} must print the canonical message`).toContain(CANONICAL);
      expect(output, `squad ${name} must not resolve or mention the profile squad`).not.toContain(profileSquadRoot);
      expect(output).not.toMatch(/Globetrotter|Active squad: *global/i);
      expect(existsSync(join(cwd, '.squad')), `squad ${name} must not create .squad/ as a side effect`).toBe(false);
      expect(fingerprint(profileSquadRoot), 'profile squad must be byte-identical').toBe(before);
    }, 90_000);
  }

  it('with NO .git anywhere up the chain and HOME/USERPROFILE/SQUAD_HOME pointing at a seeded profile, cast/status fail and the profile is untouched (LC-2)', async () => {
    // A fake home directory holding ~/.squad (the roaming SQUAD_HOME root) with a full roster,
    // and a working directory beneath it with no repository marker anywhere on the way up.
    const fakeHome = join(tmp, 'fake-home');
    const homeSquad = join(fakeHome, '.squad');
    mkdirSync(join(homeSquad, 'agents', 'homebody'), { recursive: true });
    writeFileSync(join(homeSquad, 'config.json'), '{"version":1}\n');
    writeFileSync(join(homeSquad, 'team.md'), '# Home\n\n## Members\n\n| Name | Role |\n|---|---|\n| Homebody | Advisor |\n');
    writeFileSync(join(homeSquad, 'agents', 'homebody', 'charter.md'), '# Homebody\n');
    const work = join(fakeHome, 'work', 'proj');
    mkdirSync(work, { recursive: true });
    const env = { HOME: fakeHome, USERPROFILE: fakeHome, SQUAD_HOME: homeSquad };
    const before = fingerprint(fakeHome);

    // From a directory beneath the home dir, and directly from the home dir itself (where a bare
    // existence check for ./.squad would succeed and bypass the resolver's profile boundary).
    for (const dir of [work, fakeHome]) {
      for (const args of [['cast', '--name', 'Probe', '--role', 'developer'], ['status'], ['doctor'], ['cost']]) {
        const r = await runSquad(args, env, dir);
        const output = `${r.stdout}\n${r.stderr}`;
        expect(r.code, `squad ${args[0]} (cwd ${dir === fakeHome ? 'home' : 'below home'}) must fail; output:\n${output}`).not.toBe(0);
        expect(output).toContain(CANONICAL);
        expect(output).not.toMatch(/Homebody|Mode: /);
      }
    }
    expect(existsSync(join(homeSquad, 'agents', 'probe')), 'cast must never write into ~/.squad').toBe(false);
    expect(existsSync(join(work, '.squad'))).toBe(false);
    expect(fingerprint(fakeHome), 'the profile tree must be byte-identical').toBe(before);
  }, 240_000);

  it('squad init --global / squad upgrade --global are rejected as unknown options and run nothing (LC-3)', async () => {
    const dir = join(tmp, 'global-flag');
    mkdirSync(dir, { recursive: true });
    const before = fingerprint(profileSquadRoot);
    for (const args of [['init', '--global'], ['upgrade', '--global'], ['init', '--no-workflows', '--global']]) {
      const r = await runSquad(args, {}, dir);
      const output = `${r.stdout}\n${r.stderr}`;
      expect(r.code, `squad ${args.join(' ')} must fail; output:\n${output}`).not.toBe(0);
      expect(output).toMatch(/Unknown option: --global/);
      expect(existsSync(join(dir, '.squad')), `squad ${args.join(' ')} must not run the project form`).toBe(false);
    }
    expect(fingerprint(profileSquadRoot)).toBe(before);
  }, 180_000);

  it('squad status inside a project still reports the repo squad', async () => {
    const project = join(tmp, 'real-project');
    mkdirSync(join(project, '.git'), { recursive: true });
    mkdirSync(join(project, '.squad'), { recursive: true });
    writeFileSync(join(project, '.squad', 'team.md'), '# Team\n');
    writeFileSync(join(project, '.squad', 'config.json'), '{"version":1}\n');
    const saved = cwd;
    cwd = project;
    try {
      const r = await runSquad(['status']);
      expect(r.code, r.stderr).toBe(0);
      const plain = r.stdout.replace(/\u001b\[[0-9;]*m/g, '');
      expect(plain).toMatch(/Active squad: *repo/);
      expect(plain).toContain(join(project, '.squad'));
    } finally { cwd = saved; }
  }, 90_000);
});
