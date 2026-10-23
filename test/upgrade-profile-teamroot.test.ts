/**
 * Upgrade-matrix follow-ups (Data, #2282):
 *
 *  UM-F1 — projects initialised by Squad 0.13–1.1 while a profile squad existed carry
 *          `teamRoot: "<platform-config>/squad"` in `.squad/config.json`. Squad 2.0 removed
 *          profile squads, so that teamRoot must be stripped by `squad upgrade` (and never
 *          followed by resolution), while a genuine dual-root `teamRoot` is preserved.
 *  UM-F2 — `squad upgrade` must not read its own version stamps as a user customization:
 *          init → upgrade → upgrade prints no "local customizations" warning and leaves an
 *          existing `.local-backup` untouched; a genuine customization is backed up once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade, stripAgentStamps } from '@bradygaster/squad-cli/core/upgrade';
import { runDoctor } from '@bradygaster/squad-cli/commands/doctor';
import { stampVersion } from '@bradygaster/squad-cli/core/version';
import { clearResolveSquadCache, isRetiredProfileTeamRoot, resolveGlobalSquadPath, resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

let tmp: string;
let configHome: string;

function stubConfigHome(dir: string): void {
  vi.stubEnv('APPDATA', dir);
  vi.stubEnv('LOCALAPPDATA', dir);
  vi.stubEnv('XDG_CONFIG_HOME', dir);
  if (process.platform === 'darwin') vi.stubEnv('HOME', dir);
}

function fingerprint(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${path.relative(dir, p).replace(/\\/g, '/')}:${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return out.join('\n');
}

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spies = (['log', 'error', 'warn'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
  return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;

async function initProject(name: string): Promise<string> {
  const project = path.join(tmp, name);
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  const io = captureConsole();
  try { await runInit(project); } finally { io.restore(); }
  clearResolveSquadCache();
  return project;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-profile-'));
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

describe('UM-F1: stale teamRoot pointing at the removed profile squad', () => {
  function seedProfileSquad(): string {
    // What 1.x left behind: <config>/squad/.squad with a roster, plus personal-squad/.
    const root = resolveGlobalSquadPath();
    fs.mkdirSync(path.join(root, '.squad', 'agents', 'globetrotter'), { recursive: true });
    fs.writeFileSync(path.join(root, '.squad', 'team.md'), '# Global\n\n## Members\n\n| Name | Role |\n|---|---|\n| Globetrotter | Advisor |\n');
    fs.writeFileSync(path.join(root, '.squad', 'routing.md'), '# Routing\n');
    fs.writeFileSync(path.join(root, '.squad', 'agents', 'globetrotter', 'charter.md'), '# Globetrotter\n');
    fs.mkdirSync(path.join(root, 'personal-squad', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'personal-squad', 'config.json'), '{"defaultModel":"auto"}\n');
    return root;
  }

  it('isRetiredProfileTeamRoot recognises the platform config dir, ~/.squad, SQUAD_HOME and home, but not another repo', () => {
    const cfg = resolveGlobalSquadPath();
    expect(isRetiredProfileTeamRoot(cfg)).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(cfg, '.squad'))).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(cfg, 'personal-squad'))).toBe(true);
    expect(isRetiredProfileTeamRoot(os.homedir())).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(os.homedir(), '.squad'))).toBe(true);
    const roam = path.join(tmp, 'roam');
    vi.stubEnv('SQUAD_HOME', roam);
    expect(isRetiredProfileTeamRoot(roam)).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(roam, 'nested'))).toBe(true);
    expect(isRetiredProfileTeamRoot(path.join(tmp, 'shared-team'))).toBe(false);
    expect(isRetiredProfileTeamRoot(path.join(os.homedir(), 'src', 'shared-team'))).toBe(false);
  });

  it('squad upgrade removes the stale teamRoot, resolution is local, doctor passes, profile dir untouched', async () => {
    const profileRoot = seedProfileSquad();
    const project = await initProject('legacy-linked');
    const configPath = path.join(project, '.squad', 'config.json');
    // Exactly what a 1.x init wrote: an absolute teamRoot at the platform config dir.
    const cfg = readJson(configPath);
    cfg['teamRoot'] = profileRoot;
    cfg['customSetting'] = 'kept';
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
    clearResolveSquadCache();
    const before = fingerprint(profileRoot);

    // Resolution never follows the stale link, even before upgrade.
    const paths = resolveSquadPaths(project)!;
    expect(paths.mode, 'stale profile teamRoot must not produce remote mode').toBe('local');
    expect(paths.teamSquadDir).toBe(path.join(project, '.squad'));

    const io = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io.restore(); }
    const out = io.lines.join('\n');
    expect(out).toContain('Removed obsolete "teamRoot" setting from .squad/config.json.');
    expect(out, 'the message must not name the removed concept\'s location').not.toContain(profileRoot);
    const after = readJson(configPath);
    expect(after['teamRoot']).toBeUndefined();
    expect(after['customSetting'], 'only the teamRoot key is touched').toBe('kept');
    clearResolveSquadCache();
    expect(resolveSquadPaths(project)!.mode).toBe('local');

    const checks = await runDoctor(project);
    const failed = checks.filter((c) => c.status === 'fail').map((c) => `${c.name}: ${c.message}`);
    expect(failed, 'doctor must not report missing team files via a removed profile squad').toEqual([]);
    expect(fingerprint(profileRoot), 'the profile directory is never written').toBe(before);

    // Idempotent: a second upgrade prints nothing about teamRoot and leaves config as is.
    const io2 = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io2.restore(); }
    expect(io2.lines.join('\n')).not.toMatch(/obsolete "teamRoot"/);
    expect(readJson(configPath)['teamRoot']).toBeUndefined();
  }, 180_000);

  it('--dry-run only announces the removal and writes nothing', async () => {
    const profileRoot = seedProfileSquad();
    const project = await initProject('dry');
    const configPath = path.join(project, '.squad', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ ...readJson(configPath), teamRoot: profileRoot }, null, 2) + '\n');
    const before = fs.readFileSync(configPath, 'utf8');
    const io = captureConsole();
    try { await runUpgrade(project, { force: true, dryRun: true }); } finally { io.restore(); }
    expect(io.lines.join('\n')).toContain('Would remove obsolete "teamRoot" setting from .squad/config.json.');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
  }, 180_000);

  it('a config.json holding JSON null or an array does not crash the preflight (readSquadConfig tolerance is preserved)', async () => {
    for (const body of ['null\n', '[]\n', '"nope"\n']) {
      const project = await initProject(`odd-${Buffer.from(body).toString('hex')}`);
      const configPath = path.join(project, '.squad', 'config.json');
      fs.writeFileSync(configPath, body);
      const io = captureConsole();
      try {
        await expect(runUpgrade(project, { force: true, dryRun: true })).resolves.toBeDefined();
      } finally { io.restore(); }
      expect(fs.readFileSync(configPath, 'utf8'), 'dry-run must not rewrite an odd config.json').toBe(body);
    }
  }, 180_000);

  it('a genuine dual-root teamRoot (another repository) is preserved and still resolves in remote mode', async () => {
    const shared = await initProject('shared-team');
    const satellite = await initProject('satellite');
    const configPath = path.join(satellite, '.squad', 'config.json');
    const rel = path.relative(satellite, shared).replace(/\\/g, '/');
    fs.writeFileSync(configPath, JSON.stringify({ ...readJson(configPath), teamRoot: rel }, null, 2) + '\n');
    clearResolveSquadCache();
    expect(resolveSquadPaths(satellite)!.mode).toBe('remote');
    const io = captureConsole();
    try { await runUpgrade(satellite, { force: true }); } finally { io.restore(); }
    expect(io.lines.join('\n')).not.toMatch(/obsolete "teamRoot"/);
    expect(readJson(configPath)['teamRoot']).toBe(rel);
    clearResolveSquadCache();
    expect(resolveSquadPaths(satellite)!.mode).toBe('remote');
  }, 180_000);
});

describe('F4: a 0.9.x project (empty casting/) upgrades in ONE pass', () => {
  it('first upgrade writes the capabilities block; the second upgrade is a byte-identical no-op', async () => {
    const project = path.join(tmp, 'v091');
    fs.mkdirSync(path.join(project, '.git'), { recursive: true });
    // Faithful 0.9.1 shape: team.md + routing + agents, casting/ present but EMPTY, old stamps.
    fs.mkdirSync(path.join(project, '.squad', 'casting'), { recursive: true });
    fs.mkdirSync(path.join(project, '.squad', 'agents', 'data'), { recursive: true });
    fs.writeFileSync(path.join(project, '.squad', 'config.json'), JSON.stringify({ version: '0.9.1' }, null, 2) + '\n');
    fs.writeFileSync(path.join(project, '.squad', 'team.md'), '# Squad Team\n\n**Universe:** Star Trek\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n| Data | Framework Expert | .squad/agents/data/charter.md | ✅ Active |\n');
    fs.writeFileSync(path.join(project, '.squad', 'routing.md'), '# Routing Rules\n\n**Backend** → Data\n');
    fs.writeFileSync(path.join(project, '.squad', 'decisions.md'), '# Decisions\n');
    fs.writeFileSync(path.join(project, '.squad', 'agents', 'data', 'charter.md'), '# Data\n\n## Identity\n- **Name:** Data\n- **Role:** Framework Expert\n');
    fs.mkdirSync(path.join(project, '.github', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(project, '.github', 'agents', 'squad.agent.md'), '---\nname: squad\n---\n<!-- version: 0.9.1 -->\n\nOld coordinator.\n');

    const io1 = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io1.restore(); }
    const agent = path.join(project, '.github', 'agents', 'squad.agent.md');
    const afterFirst = fs.readFileSync(agent, 'utf8');
    expect(afterFirst, 'the FIRST upgrade must already carry the capabilities block').toContain('<!-- squad:capabilities');
    expect(fs.existsSync(path.join(project, '.squad', 'casting', 'registry.json'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.squad', 'casting', 'history.json'))).toBe(true);
    const treeAfterFirst = fingerprint(path.join(project, '.squad'));

    const io2 = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io2.restore(); }
    expect(fs.readFileSync(agent, 'utf8'), 'second upgrade must not change squad.agent.md').toBe(afterFirst);
    expect(fingerprint(path.join(project, '.squad')), 'second upgrade must not change .squad/').toBe(treeAfterFirst);
    expect(io1.lines.join('\n')).not.toMatch(/Cannot read a consistent casting registry/);
  }, 240_000);
});

describe('UM-F2: version stamps are not customizations', () => {
  it('stripAgentStamps normalizes only the version token on the Version line, so an edited instruction is still a customization', () => {
    const tpl = '- **Version:** 1.0.0 (see HTML comment above). Include it as `Squad v{version}` in your first response.\n';
    const restamped = '- **Version:** 2.0.0 (see HTML comment above). Include it as `Squad v{version}` in your first response.\n';
    const edited = '- **Version:** 2.0.0 (see HTML comment above). Never include it as `Squad v{version}` in your first response.\n';
    expect(stripAgentStamps(tpl)).toBe(stripAgentStamps(restamped));
    expect(stripAgentStamps(edited)).not.toBe(stripAgentStamps(tpl));
  });

  it('stripAgentStamps normalizes every stamp form the upgrader writes', () => {
    const a = '<!-- version: 1.0.0 -->\n- **Version:** 1.0.0\nRun `Squad v1.0.0`\n  pkg: @bradygaster/squad-cli@1.0.0\n<!-- squad-cli v1.0.0 -->\nbody\n';
    const b = '<!-- version: 2.0.0-preview.1 -->\n- **Version:** 2.0.0-preview.1\nRun `Squad v2.0.0-preview.1`\n  pkg: @bradygaster/squad-cli@2.0.0-preview.1\nbody\n';
    expect(stripAgentStamps(a)).toBe(stripAgentStamps(b));
    expect(stripAgentStamps(a + 'USER EDIT\n')).not.toBe(stripAgentStamps(b));
  });

  it('init (older stamps) → upgrade → upgrade: no "local customizations" warning and no .local-backup; a genuine edit is backed up once and the backup survives the next upgrade', async () => {
    const project = await initProject('stamps');
    const agent = path.join(project, '.github', 'agents', 'squad.agent.md');
    const backup = agent + '.local-backup';
    const AGENT_WARN = /squad\.agent\.md has local customizations/;

    // A real upgrade: the installed file carries the stamps of an older CLI.
    stampVersion(agent, '1.1.0');
    for (const pass of [1, 2]) {
      const io = captureConsole();
      try { await runUpgrade(project, { force: pass === 2 }); } finally { io.restore(); }
      expect(io.lines.join('\n'), `upgrade pass ${pass} must not see version stamps as a customization`).not.toMatch(AGENT_WARN);
      expect(fs.existsSync(backup), `upgrade pass ${pass} must not create a backup`).toBe(false);
    }
    // The non-forced "Already up to date" path too.
    const io0 = captureConsole();
    try { await runUpgrade(project); } finally { io0.restore(); }
    expect(io0.lines.join('\n')).not.toMatch(AGENT_WARN);
    expect(fs.existsSync(backup)).toBe(false);

    // Genuine customization: backed up exactly once, with the user's bytes.
    const customized = fs.readFileSync(agent, 'utf8') + '\n## My local rule\n\nAlways say hi.\n';
    fs.writeFileSync(agent, customized);
    const io1 = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io1.restore(); }
    expect(io1.lines.join('\n')).toMatch(/squad\.agent\.md has local customizations — backed up/);
    expect(fs.readFileSync(backup, 'utf8')).toBe(customized);
    const backupHash = createHash('sha256').update(fs.readFileSync(backup)).digest('hex');

    // Next upgrade (again from older stamps): the file is pristine apart from stamps, so the backup is left alone.
    stampVersion(agent, '1.1.0');
    const io2 = captureConsole();
    try { await runUpgrade(project, { force: true }); } finally { io2.restore(); }
    expect(io2.lines.join('\n')).not.toMatch(AGENT_WARN);
    expect(createHash('sha256').update(fs.readFileSync(backup)).digest('hex'), 'the genuine pre-upgrade backup must survive').toBe(backupHash);
  }, 240_000);
});
