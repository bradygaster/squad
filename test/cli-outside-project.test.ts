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

async function runSquad(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFileAsync('node', [cliEntry, ...args], {
      cwd,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        NO_COLOR: '1',
        APPDATA: configHome,
        LOCALAPPDATA: configHome,
        XDG_CONFIG_HOME: configHome,
        ...(process.platform === 'darwin' ? { HOME: configHome } : {}),
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
  // A fully formed squad where 1.x would have looked for a global fallback.
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
  const cases: Array<[string, string[]]> = [
    ['status', ['status']],
    ['doctor', ['doctor']],
    ['cast', ['cast', '--name', 'Probe', '--role', 'developer']],
    ['cost', ['cost']],
  ];

  for (const [name, args] of cases) {
    it(`squad ${name}: non-zero exit, "No squad … squad init" message, profile squad untouched and unmentioned`, async () => {
      const before = fingerprint(profileSquadRoot);
      const r = await runSquad(args);
      const output = `${r.stdout}\n${r.stderr}`;
      expect(r.code, `squad ${name} must fail outside a project; output:\n${output}`).not.toBe(0);
      expect(output, `squad ${name} must name the problem and the fix`).toMatch(/No squad (in this directory|found)[\s\S]*squad init/i);
      expect(output, `squad ${name} must not resolve or mention the profile squad`).not.toContain(profileSquadRoot);
      expect(output).not.toMatch(/Globetrotter|Active squad: *global/i);
      expect(existsSync(join(cwd, '.squad')), `squad ${name} must not create .squad/ as a side effect`).toBe(false);
      expect(fingerprint(profileSquadRoot), 'profile squad must be byte-identical').toBe(before);
    }, 90_000);
  }

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
