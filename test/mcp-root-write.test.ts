/**
 * iter-8 tests for the repo-root `.mcp.json` squad_state writer + the
 * `.copilot/mcp-config.json` tombstone helper.
 *
 * Validates:
 *   - Missing `.mcp.json` is created with valid JSON containing exactly
 *     the desired squad_state entry.
 *   - Existing user `mcpServers.*` entries are preserved byte-for-byte.
 *   - Tombstone removes only `squad_state` from `.copilot/mcp-config.json`
 *     and preserves siblings.
 *   - Malformed `.mcp.json` is refused (throws) rather than overwritten.
 *   - Idempotency: re-writing the same spec is a no-op (written === false).
 *   - User-supplied `env` on the squad_state entry survives re-runs
 *     (bradygaster/squad#1893).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  ensureSquadStateMcpInRoot,
  getSquadStateUserConfigKey,
  normalizeDriveLetter,
  reconcileSquadStateUserConfig,
  tombstoneStaleSquadStateInProjectMcp,
  getProjectMcpJsonPath,
} from '../packages/squad-cli/src/cli/core/mcp-root.js';
import type { SquadStateMcpSpec } from '../packages/squad-cli/src/cli/core/mcp-spec.js';

const PINNED_SPEC: SquadStateMcpSpec = {
  source: 'pinned',
  command: 'npx',
  args: ['-y', '@bradygaster/squad-cli@0.9.6-preview.14', 'state-mcp'],
};

function legacySimpleHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function legacySimpleKey(dest: string): string {
  return `squad_state_${legacySimpleHash(path.resolve(dest))}`;
}

function legacySha256Key(dest: string): string {
  const hash = createHash('sha256').update(path.resolve(dest)).digest('hex').slice(0, 8);
  return `squad_state_${hash}`;
}

describe('iter-8 mcp-root: repo-root .mcp.json writer + project tombstone', () => {
  let tmpProject: string;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-proj-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it('creates .mcp.json with the squad_state entry when missing', () => {
    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);
    expect(result.key).toBe('squad_state');
    expect(result.path).toBe(getProjectMcpJsonPath(tmpProject));

    const parsed = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(parsed.mcpServers.squad_state.command).toBe('npx');
    expect(parsed.mcpServers.squad_state.args).toEqual(PINNED_SPEC.args);
    expect(parsed.mcpServers.squad_state.tools).toEqual(['*']);
    expect(parsed.mcpServers.squad_state.env).toEqual({});
    expect(parsed.mcpServers.squad_state['x-squad']).toEqual({
      managed: true,
      version: '0.9.6-preview.14',
      machineSpecific: false,
      source: 'pinned',
    });
  });

  it('preserves existing user mcpServers entries', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            github: { command: 'gh-mcp', args: ['--stdio'] },
            'custom-tool': { command: 'node', args: ['./tool.js'] },
          },
        },
        null,
        2,
      ),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.github).toEqual({ command: 'gh-mcp', args: ['--stdio'] });
    expect(parsed.mcpServers['custom-tool']).toEqual({ command: 'node', args: ['./tool.js'] });
    expect(parsed.mcpServers.squad_state.command).toBe('npx');
  });

  it('refuses to overwrite malformed .mcp.json', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(cfgPath, '{ this is : not json');
    expect(() =>
      ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC),
    ).toThrow(/Refusing to overwrite malformed/);

    // Original content untouched.
    expect(fs.readFileSync(cfgPath, 'utf8')).toBe('{ this is : not json');
  });

  it('is idempotent — second call with same spec returns written=false', () => {
    const first = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(first.written).toBe(true);

    const second = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(second.written).toBe(false);
  });

  it('preserves user-supplied env on the squad_state entry (#1893)', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            squad_state: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.0.1-old', 'state-mcp'],
              env: {
                npm_config_registry: 'https://internal-proxy.example/npm/',
                npm_config_allow_remote: 'all',
              },
              tools: ['*'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);

    const entry = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state;
    // env is user territory — carried forward verbatim.
    expect(entry.env).toEqual({
      npm_config_registry: 'https://internal-proxy.example/npm/',
      npm_config_allow_remote: 'all',
    });
    // command/args are Squad-managed — refreshed to the new pin.
    expect(entry.args).toEqual(PINNED_SPEC.args);
    expect(entry.tools).toEqual(['*']);
  });

  it('is idempotent when the entry carries a user env — no rewrite churn (#1893)', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);

    const withEnv = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    withEnv.mcpServers.squad_state.env = { npm_config_registry: 'https://internal-proxy.example/npm/' };
    fs.writeFileSync(cfgPath, JSON.stringify(withEnv, null, 2) + '\n');

    const second = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(second.written).toBe(false);

    // Untouched on disk.
    const entry = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state;
    expect(entry.env).toEqual({ npm_config_registry: 'https://internal-proxy.example/npm/' });
  });

  it('normalizes a malformed env on the squad_state entry to an empty object', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        mcpServers: {
          squad_state: { command: 'npx', args: [...PINNED_SPEC.args], env: 'nope', tools: ['*'] },
        },
      }),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state.env).toEqual({});
  });

  it.each(['npx', 'absolute'])('replaces an existing %s spec with a portable packaged command', previous => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    const launcher = 'C:\\Users\\example\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Example.Squad\\squad.exe';
    const custom = { command: 'node', args: ['./my-server.js'], env: { MODE: 'custom' } };
    fs.writeFileSync(cfgPath, JSON.stringify({
      mcpServers: {
        custom,
        squad_state: {
          command: previous === 'npx' ? 'npx' : launcher,
          args: previous === 'npx' ? PINNED_SPEC.args : ['state-mcp'],
          env: { npm_config_registry: 'https://packagefeedproxy.microsoft.io/npm/' },
          tools: ['read_state'],
          timeout: 60000,
        },
      },
    }, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    const spec: SquadStateMcpSpec = { command: launcher, args: ['state-mcp'], source: 'standalone' };
    expect(ensureSquadStateMcpInRoot(tmpProject, '1.0.1', spec).written).toBe(true);
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.squad_state).toEqual({
      command: launcher,
      args: ['state-mcp'],
      env: { npm_config_registry: 'https://packagefeedproxy.microsoft.io/npm/' },
      tools: ['read_state'],
      timeout: 60000,
      'x-squad': {
        managed: true,
        version: '1.0.1',
        machineSpecific: true,
        source: 'standalone',
      },
    });
    expect(parsed.mcpServers.custom).toEqual(custom);
    expect(raw).toContain('WinGet');
    expect(raw).not.toMatch(/(?<!\r)\n/);
    expect(ensureSquadStateMcpInRoot(tmpProject, '1.0.1', spec).written).toBe(false);
    expect(fs.readFileSync(cfgPath, 'utf8')).toBe(raw);
  });

  it('tombstone removes squad_state from .copilot/mcp-config.json while preserving siblings', () => {
    const copilotDir = path.join(tmpProject, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });
    const cfgPath = path.join(copilotDir, 'mcp-config.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            squad_state: { command: 'old-stale', args: [] },
            github: { command: 'gh-mcp', args: ['--stdio'] },
          },
        },
        null,
        2,
      ),
    );

    const result = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(result.removed).toBe(true);
    expect(result.path).toBe(cfgPath);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.squad_state).toBeUndefined();
    expect(parsed.mcpServers.github).toEqual({ command: 'gh-mcp', args: ['--stdio'] });
  });

  it('tombstone is a no-op when project mcp-config.json has no squad_state or is missing', () => {
    // missing file
    const r1 = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(r1.removed).toBe(false);

    // present without squad_state
    const copilotDir = path.join(tmpProject, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });
    const cfgPath = path.join(copilotDir, 'mcp-config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: { github: { command: 'gh' } } }));

    const r2 = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(r2.removed).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.github).toEqual({ command: 'gh' });
  });

  it('removes only this project legacy hashed entry, backs up first, and preserves siblings', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-home-'));
    try {
      const configDir = path.join(home, '.copilot');
      const configPath = path.join(configDir, 'mcp-config.json');
      fs.mkdirSync(configDir, { recursive: true });
      const key = getSquadStateUserConfigKey(tmpProject);
      const legacyKeys = [legacySimpleKey(tmpProject), legacySha256Key(tmpProject)]
        .filter(candidate => candidate !== key);
      const otherKey = 'squad_state_deadbeef';
      fs.writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          [key]: {
            command: 'npx',
            args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
            env: {},
            tools: ['*'],
          },
          ...Object.fromEntries(legacyKeys.map(legacyKey => [legacyKey, {
            command: 'npx',
            args: ['-y', '@bradygaster/squad-cli@0.9.6', 'state-mcp'],
          }])),
          [otherKey]: {
            command: 'npx',
            args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
          },
          custom: { command: 'custom-mcp', args: [] },
        },
      }, null, 2) + '\n');

      const result = reconcileSquadStateUserConfig(tmpProject, { homeDir: home });
      expect(result.action).toBe('removed');
      expect(fs.readFileSync(`${configPath}.squad-backup`, 'utf8')).toContain(`"${key}"`);
      const next = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(next.mcpServers[key]).toBeUndefined();
      for (const legacyKey of legacyKeys) expect(next.mcpServers[legacyKey]).toBeUndefined();
      expect(next.mcpServers[otherKey]).toBeDefined();
      expect(next.mcpServers.custom).toEqual({ command: 'custom-mcp', args: [] });
      expect(reconcileSquadStateUserConfig(tmpProject, { homeDir: home }).action).toBe('none');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    '[platform: win32] removes the legacy raw uppercase Windows drive hash while preserving unrelated entries',
    () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-home-win-legacy-'));
      try {
        const configDir = path.join(home, '.copilot');
        const configPath = path.join(configDir, 'mcp-config.json');
        fs.mkdirSync(configDir, { recursive: true });
        const resolved = path.resolve(tmpProject);
        expect(resolved).toMatch(/^[A-Z]:\\/);
        const legacyKey = legacySimpleKey(tmpProject);
        expect(legacyKey).not.toBe(getSquadStateUserConfigKey(tmpProject));
        const unrelatedKey = 'squad_state_deadbeef';
        fs.writeFileSync(configPath, JSON.stringify({
          mcpServers: {
            [legacyKey]: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
            },
            [unrelatedKey]: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
            },
          },
        }, null, 2) + '\n');

        expect(reconcileSquadStateUserConfig(tmpProject, { homeDir: home }).action).toBe('removed');
        const next = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(next.mcpServers[legacyKey]).toBeUndefined();
        expect(next.mcpServers[unrelatedKey]).toBeDefined();
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== 'win32')(
    '[platform: non-win32] removes the legacy raw POSIX symlink hash while preserving unrelated entries',
    () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-home-posix-legacy-'));
      const links = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-links-posix-legacy-'));
      try {
        const linkedProject = path.join(links, 'project');
        fs.symlinkSync(tmpProject, linkedProject, 'dir');
        const configDir = path.join(home, '.copilot');
        const configPath = path.join(configDir, 'mcp-config.json');
        fs.mkdirSync(configDir, { recursive: true });
        const legacyKey = legacySimpleKey(linkedProject);
        expect(legacyKey).not.toBe(getSquadStateUserConfigKey(linkedProject));
        const unrelatedKey = 'squad_state_deadbeef';
        fs.writeFileSync(configPath, JSON.stringify({
          mcpServers: {
            [legacyKey]: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
            },
            [unrelatedKey]: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
            },
          },
        }, null, 2) + '\n');

        expect(reconcileSquadStateUserConfig(linkedProject, { homeDir: home }).action).toBe('removed');
        const next = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(next.mcpServers[legacyKey]).toBeUndefined();
        expect(next.mcpServers[unrelatedKey]).toBeDefined();
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(links, { recursive: true, force: true });
      }
    },
  );

  it('normalizes Windows drive-letter case before hashing project identities', () => {
    expect(normalizeDriveLetter('C:\\Users\\Example\\Repo', 'win32'))
      .toBe('c:\\Users\\Example\\Repo');
    expect(normalizeDriveLetter('c:\\Users\\Example\\Repo', 'win32'))
      .toBe('c:\\Users\\Example\\Repo');
    expect(normalizeDriveLetter('/home/example/repo', 'linux'))
      .toBe('/home/example/repo');
  });

  it('uses the real project path so equivalent paths dedupe to one registration key', () => {
    const child = path.join(tmpProject, 'child');
    fs.mkdirSync(child);
    expect(getSquadStateUserConfigKey(path.join(child, '..')))
      .toBe(getSquadStateUserConfigKey(tmpProject));
  });

  it('supports dry-run without changing or backing up the user config', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-home-dry-'));
    try {
      const configDir = path.join(home, '.copilot');
      const configPath = path.join(configDir, 'mcp-config.json');
      fs.mkdirSync(configDir, { recursive: true });
      const key = getSquadStateUserConfigKey(tmpProject);
      const original = JSON.stringify({
        mcpServers: {
          [key]: {
            command: 'npx',
            args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
          },
        },
      }, null, 2) + '\n';
      fs.writeFileSync(configPath, original);

      expect(reconcileSquadStateUserConfig(tmpProject, { homeDir: home, dryRun: true }).action)
        .toBe('would-remove');
      expect(fs.readFileSync(configPath, 'utf8')).toBe(original);
      expect(fs.existsSync(`${configPath}.squad-backup`)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('keeps the original user config parseable when atomic replacement fails', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-home-atomic-'));
    try {
      const configDir = path.join(home, '.copilot');
      const configPath = path.join(configDir, 'mcp-config.json');
      fs.mkdirSync(configDir, { recursive: true });
      const key = legacySimpleKey(tmpProject);
      const original = JSON.stringify({
        mcpServers: {
          [key]: {
            command: 'npx',
            args: ['-y', '@bradygaster/squad-cli@0.10.0', 'state-mcp'],
          },
          custom: { command: 'custom-mcp', args: [] },
        },
      }, null, 2) + '\n';
      fs.writeFileSync(configPath, original);
      vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('simulated atomic replace failure'), { code: 'EACCES' });
      });

      expect(() => reconcileSquadStateUserConfig(tmpProject, { homeDir: home }))
        .toThrow(/simulated atomic replace failure/);
      expect(fs.readFileSync(configPath, 'utf8')).toBe(original);
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).mcpServers[key]).toBeDefined();
      expect(fs.readFileSync(`${configPath}.squad-backup`, 'utf8')).toBe(original);
      expect(fs.readdirSync(configDir).some(file => file.includes('.squad-tmp-'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
