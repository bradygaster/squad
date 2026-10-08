import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../packages/squad-cli/src/cli/core/init.js';
import { runUpgrade } from '../../packages/squad-cli/src/cli/core/upgrade.js';
import { getPackageVersion } from '../../packages/squad-cli/src/cli/core/version.js';
import { STANDALONE_HOME_ENV } from '../../packages/squad-cli/src/cli/core/mcp-spec.js';
import { getTemplatesDir } from '../../packages/squad-cli/src/cli/core/templates.js';
import { copyManagedFile, writeManagedText } from '../../packages/squad-cli/src/cli/core/managed-file.js';
import { TEAM_CAPABILITIES_BEGIN } from '@bradygaster/squad-sdk/config';

vi.mock('../../packages/squad-cli/src/cli/core/npm-registry.js', () => ({
  isSquadCliVersionPublished: vi.fn(async () => true),
}));

let root: string;
const originalStandalone = process.env[STANDALONE_HOME_ENV];
const originalHome = process.env.SQUAD_HOME_DIR_OVERRIDE;
const portableCommand = process.platform === 'win32' ? 'squad.exe' : 'squad';

function write(relative: string, body: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function bundled(): void {
  const bundle = path.join(root, 'example-bundle');
  mkdirSync(bundle);
  writeFileSync(path.join(bundle, portableCommand), 'standalone detection fixture');
  process.env[STANDALONE_HOME_ENV] = bundle;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'squad-upgrade-portability-'));
  delete process.env[STANDALONE_HOME_ENV];
  process.env.SQUAD_HOME_DIR_OVERRIDE = path.join(root, 'home');
});

afterEach(() => {
  if (originalStandalone === undefined) delete process.env[STANDALONE_HOME_ENV];
  else process.env[STANDALONE_HOME_ENV] = originalStandalone;
  if (originalHome === undefined) delete process.env.SQUAD_HOME_DIR_OVERRIDE;
  else process.env.SQUAD_HOME_DIR_OVERRIDE = originalHome;
  rmSync(root, { recursive: true, force: true });
});

describe('upgrade portability and destination newlines', () => {
  it.each(['packaged', 'npm'])('%s init and upgrade publish portable MCP specs and preserve other servers', async mode => {
    if (mode === 'packaged') bundled();
    const custom = { command: 'node', args: ['./custom-server.js'], env: { MODE: 'user' } };
    write('.mcp.json', JSON.stringify({
      mcpServers: { custom, squad_state: { command: 'npx', args: ['old'], env: { EXTRA: 'keep' }, tools: ['*'] } },
    }, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    await runInit(root);
    for (const operation of [async () => {}, async () => { await runUpgrade(root); }]) {
      await operation();
      const raw = readFileSync(path.join(root, '.mcp.json'), 'utf8');
      const config = JSON.parse(raw);
      expect(config.mcpServers.custom).toEqual(custom);
      expect(config.mcpServers.squad_state.env).toEqual({ EXTRA: 'keep' });
      expect(config.mcpServers.squad_state.command).toBe(mode === 'packaged' ? portableCommand : 'npx');
      expect(config.mcpServers.squad_state.args).toEqual(mode === 'packaged'
        ? ['state-mcp'] : ['-y', `@bradygaster/squad-cli@${getPackageVersion()}`, 'state-mcp']);
      expect(raw).not.toContain('example-bundle');
      expect(raw).not.toMatch(/(?<!\r)\n/);
    }
  });

  it.each([
    ['old', 'npm'], ['current', 'npm'], ['old', 'python'], ['current', 'python'],
  ])('preserves CRLF for %s upgrades of %s projects, including workflow stubs and capabilities', async (version, project) => {
    bundled();
    if (project === 'npm') write('package.json', '{"name":"example-project","private":true}');
    else write('pyproject.toml', '[project]\nname = "example-project"\n');
    await runInit(root);
    const agent = path.join('.github', 'agents', 'squad.agent.md');
    const existingAgent = readFileSync(path.join(root, agent), 'utf8')
      .replace(/<!-- version: [^>]+ -->/, `<!-- version: ${version === 'old' ? '0.13.0' : getPackageVersion()} -->`);
    write(agent, existingAgent.replace(/\r?\n/g, '\r\n'));
    const agentBefore = readFileSync(path.join(root, agent), 'utf8');
    const managed = [
      path.join('.github', 'workflows', 'squad-ci.yml'),
      path.join('.github', 'skills', 'secret-handling', 'SKILL.md'),
      path.join('.squad', 'templates', 'charter.md'),
      path.join('.squad', 'templates', 'scripts', 'notes', 'fetch.ps1'),
      path.join('.github', 'copilot-instructions.md'),
    ];
    for (const file of managed) write(file, 'OLD-MANAGED-BODY\r\nreplace this\r\n');
    write(path.join('.squad', 'ralph-instructions.md'), 'Keep user-owned Ralph instructions.\r\n');
    const team = path.join(root, '.squad', 'team.md');
    writeFileSync(team, readFileSync(team, 'utf8') + '\n🤖 Coding Agent\n');
    await runUpgrade(root);
    for (const file of [agent, ...managed]) {
      const body = readFileSync(path.join(root, file), 'utf8');
      expect(body, file).toContain('\r\n');
      expect(body, file).not.toMatch(/(?<!\r)\n/);
      if (version === 'current' && file === path.join('.github', 'copilot-instructions.md')) {
        expect(body).toBe('OLD-MANAGED-BODY\r\nreplace this\r\n');
      } else {
        expect(body, file).not.toContain('OLD-MANAGED-BODY');
      }
    }
    expect(readFileSync(path.join(root, agent), 'utf8')).toContain(`<!-- version: ${getPackageVersion()} -->`);
    expect(readFileSync(path.join(root, agent), 'utf8')).toContain(TEAM_CAPABILITIES_BEGIN);
    expect(readFileSync(path.join(root, agent + '.local-backup'), 'utf8')).toBe(agentBefore);
    expect(readFileSync(path.join(root, '.squad', 'ralph-instructions.md'), 'utf8')).toBe('Keep user-owned Ralph instructions.\r\n');
    const template = path.join(root, '.squad', 'templates', 'charter.md');
    expect(readFileSync(template, 'utf8').replace(/\r\n/g, '\n'))
      .toBe(readFileSync(path.join(getTemplatesDir(), 'charter.md'), 'utf8').replace(/\r\n/g, '\n'));
    const filesBefore = Object.fromEntries([agent, ...managed].map(file => [file, readFileSync(path.join(root, file), 'utf8')]));
    utimesSync(template, new Date(0), new Date(0));
    const mtime = statSync(template).mtimeMs;
    await runUpgrade(root);
    for (const file of [agent, ...managed]) expect(readFileSync(path.join(root, file), 'utf8')).toBe(filesBefore[file]);
    expect(statSync(template).mtimeMs).toBe(mtime);
  });
});

describe('managed text updates', () => {
  it.each(['\n', '\r\n'])('keeps existing %j newlines while applying real content changes', eol => {
    const file = path.join(root, 'managed.md');
    writeFileSync(file, `old${eol}body${eol}`);
    expect(writeManagedText(file, 'new\nbody\n')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(`new${eol}body${eol}`);
  });

  it('does not rewrite or normalize a newline-only difference', () => {
    const source = path.join(root, 'source.md');
    const destination = path.join(root, 'destination.md');
    writeFileSync(source, 'same\nbody\n');
    writeFileSync(destination, 'same\r\nbody\r\n');
    utimesSync(destination, new Date(0), new Date(0));
    const before = statSync(destination).mtimeMs;
    copyManagedFile(source, destination);
    expect(statSync(destination).mtimeMs).toBe(before);
    expect(readFileSync(destination, 'utf8')).toBe('same\r\nbody\r\n');
  });

  it('keeps source newlines when creating a new file without a destination style', () => {
    const file = path.join(root, 'new.md');
    writeManagedText(file, 'new\r\nfile\r\n');
    expect(readFileSync(file, 'utf8')).toBe('new\r\nfile\r\n');
  });

  it('copies binary bytes unchanged rather than applying text transformations', () => {
    const source = path.join(root, 'asset.bin');
    const destination = path.join(root, 'copied.bin');
    const bytes = Buffer.from([0, 10, 13, 255, 128, 1]);
    writeFileSync(source, bytes);
    copyManagedFile(source, destination);
    expect(readFileSync(destination)).toEqual(bytes);
  });
});
