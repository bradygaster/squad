/**
 * Tests for the mcp-spec helper.
 *
 * The resolver prefers direct installed entry points and never emits a
 * registry dist-tag. Source/dev fallback is the exact running version.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  resolveSquadStateMcpSpec,
  projectSquadStateMcpSpec,
  detectInstalledCliEntry,
  detectStandaloneLauncher,
  STANDALONE_HOME_ENV,
  _resetMcpSpecCache,
} from '../packages/squad-cli/src/cli/core/mcp-spec.js';
import { describeMcpSpec } from '../packages/squad-cli/src/cli/core/upgrade.js';
describe('resolveSquadStateMcpSpec', () => {
  beforeEach(() => {
    _resetMcpSpecCache();
  });

  it('detects the in-repo built cli entry for source-driven init and doctor runs', () => {
    expect(detectInstalledCliEntry()).toBe(
      path.resolve('packages/squad-cli/dist/cli-entry.js'),
    );
  });

  it('returns an exact pinned npx fallback when no installed entry is available', async () => {
    const spec = await resolveSquadStateMcpSpec('0.9.6-preview.42', {
      standaloneCheck: () => null,
      localEntryCheck: () => null,
    });
    expect(spec.source).toBe('pinned');
    expect(spec.command).toBe('npx');
    expect(spec.args).toEqual([
      '-y',
      '@bradygaster/squad-cli@0.9.6-preview.42',
      'state-mcp',
    ]);
  });

  it('keeps placeholder versions deterministic and never substitutes a dist-tag', async () => {
    const spec = await resolveSquadStateMcpSpec('0.0.0', {
      standaloneCheck: () => null,
      localEntryCheck: () => null,
    });
    expect(spec.source).toBe('pinned');
    expect(spec.args[1]).toBe('@bradygaster/squad-cli@0.0.0');
  });

  it('uses the installed cli entry directly without npx or cmd wrappers', async () => {
    const entry = path.resolve('node_modules/@bradygaster/squad-cli/dist/cli-entry.js');
    const spec = await resolveSquadStateMcpSpec('2.0.0-preview.1', {
      standaloneCheck: () => null,
      localEntryCheck: () => entry,
    });
    expect(spec).toEqual({
      command: process.execPath,
      args: [entry, 'state-mcp'],
      source: 'local-entry',
      fallback: {
        command: 'npx',
        args: ['-y', '@bradygaster/squad-cli@2.0.0-preview.1', 'state-mcp'],
      },
    });
  });
});

describe('resolveSquadStateMcpSpec — standalone bundle tier (#1593)', () => {
  beforeEach(() => {
    _resetMcpSpecCache();
  });

  it('spawns the bundle launcher by absolute path instead of npx', async () => {
    const launcher = '/opt/squad/squad';
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => launcher,
    });
    expect(spec.source).toBe('standalone');
    expect(spec.command).toBe(launcher);
    expect(spec.args).toEqual(['state-mcp']);
  });

  it('never touches the npm registry when running from a bundle', async () => {
    // The whole point: a machine installed from a bundle may have no route to
    // registry.npmjs.org at all, so the probe must not fire.
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
      localEntryCheck: () => { throw new Error('local entry check must not run in standalone mode'); },
    });
    expect(spec.source).toBe('standalone');
  });

  it('takes precedence over a local installed entry', async () => {
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
      localEntryCheck: () => '/opt/npm/squad-cli/dist/cli-entry.js',
    });
    expect(spec.source).toBe('standalone');
    expect(spec.command).not.toBe('npx');
  });

  it('falls through to the exact npx pin when no local entry is available', async () => {
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => null,
      localEntryCheck: () => null,
    });
    expect(spec.source).toBe('pinned');
    expect(spec.command).toBe('npx');
  });

  it('emits a spec Copilot can spawn without PATH or env help', async () => {
    // Copilot launches the MCP server in its own environment, so the written
    // command has to be self-sufficient — no bare `squad`, no env expansion.
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
    });
    expect(path.isAbsolute(spec.command)).toBe(true);
    expect(spec.command).not.toContain('$');
    expect(spec.command).not.toContain('%');
  });
});

describe('detectStandaloneLauncher (#1593)', () => {
  const ORIGINAL = process.env[STANDALONE_HOME_ENV];

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[STANDALONE_HOME_ENV];
    else process.env[STANDALONE_HOME_ENV] = ORIGINAL;
  });

  it('returns null when the env var is unset (normal npm install)', () => {
    delete process.env[STANDALONE_HOME_ENV];
    expect(detectStandaloneLauncher()).toBeNull();
  });

  it('returns null when the env var points at a directory with no launcher', () => {
    process.env[STANDALONE_HOME_ENV] = mkdtempSync(path.join(tmpdir(), 'squad-nolauncher-'));
    expect(detectStandaloneLauncher()).toBeNull();
  });

  it('finds the launcher when the env var points at a real bundle', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'squad-bundle-'));
    const name = process.platform === 'win32' ? 'squad.cmd' : 'squad';
    writeFileSync(path.join(dir, name), '#!/bin/sh\n');
    process.env[STANDALONE_HOME_ENV] = dir;
    expect(detectStandaloneLauncher()).toBe(path.join(dir, name));
  });

  it.runIf(process.platform === 'win32')('prefers squad.exe over squad.cmd on Windows', () => {
    // Since the fix for CVE-2024-27980 Node refuses to spawn a .cmd without
    // shell:true, so an MCP client spawning the command directly would fail.
    // The .exe must win whenever the bundle ships one.
    const dir = mkdtempSync(path.join(tmpdir(), 'squad-bundle-exe-'));
    writeFileSync(path.join(dir, 'squad.cmd'), '@echo off\n');
    writeFileSync(path.join(dir, 'squad.exe'), 'MZ');
    process.env[STANDALONE_HOME_ENV] = dir;
    expect(detectStandaloneLauncher()).toBe(path.join(dir, 'squad.exe'));
  });
});

describe('describeMcpSpec — standalone specs (#1593)', () => {
  it('reports the launcher path rather than <unknown>', () => {
    // Standalone specs have no package name at args[1]; the describer must
    // not fall through to the npx-shaped branch.
    const described = describeMcpSpec({
      command: '/opt/squad/squad',
      args: ['state-mcp'],
      source: 'standalone',
    });

    expect(described).toContain('/opt/squad/squad');
    expect(described).not.toContain('<unknown>');
  });
});

describe('project MCP launch portability', () => {
  it.each(['win32', 'linux', 'darwin'] as const)('keeps the direct machine-local executable on %s', (platform) => {
    const local = { command: 'C:\\example\\bundle\\squad.exe', args: ['state-mcp'], source: 'standalone' as const };
    expect(projectSquadStateMcpSpec(local, platform)).toEqual(local);
    expect(local.command).toBe('C:\\example\\bundle\\squad.exe');
    expect(projectSquadStateMcpSpec({
      command: 'npx', args: ['-y', '@bradygaster/squad-cli@1.0.1', 'state-mcp'], source: 'pinned',
    }, platform)).toEqual({
      command: 'npx', args: ['-y', '@bradygaster/squad-cli@1.0.1', 'state-mcp'], source: 'pinned',
    });
  });

  it.runIf(process.platform === 'win32')('resolves squad.exe through subprocess PATH without a shell or shim', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'squad-mcp-path-'));
    try {
      const bin = path.join(root, 'bin');
      const cwd = path.join(root, 'project');
      mkdirSync(bin);
      mkdirSync(cwd);
      // A real PE executable, not a PowerShell alias or CMD wrapper.
      copyFileSync(process.execPath, path.join(bin, 'squad.exe'));
      writeFileSync(path.join(bin, 'squad.cmd'), '@echo off\r\nexit /b 99\r\n');
      writeFileSync(path.join(bin, 'squad.ps1'), 'exit 99\r\n');
      const spec = projectSquadStateMcpSpec({
        command: path.join(bin, 'squad.exe'), args: ['state-mcp'], source: 'standalone',
      });
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
      env.PATH = bin;
      const result = spawnSync(spec.command, ['--version'], { cwd, env, shell: false, encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(process.version);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('init.ts uses resolveSquadStateMcpSpec (asymmetry fix)', () => {
  // Source-level architectural check: init.ts must reference the shared
  // resolver to keep the npm-registry fallback consistent with upgrade.ts.
  it('packages/squad-cli/src/cli/core/init.ts imports and calls resolveSquadStateMcpSpec', () => {
    const initPath = path.join(
      process.cwd(),
      'packages',
      'squad-cli',
      'src',
      'cli',
      'core',
      'init.ts',
    );
    const src = readFileSync(initPath, 'utf-8');
    expect(src).toMatch(/resolveSquadStateMcpSpec/);
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });

  it('upgrade.ts re-exports resolveSquadStateMcpSpec from mcp-spec (compat)', () => {
    const upgradePath = path.join(
      process.cwd(),
      'packages',
      'squad-cli',
      'src',
      'cli',
      'core',
      'upgrade.ts',
    );
    const src = readFileSync(upgradePath, 'utf-8');
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });
});

describe('isLocalOrUnpublishedVersion guard (#1204)', () => {
  // Import the guard function directly
  let isLocalOrUnpublishedVersion: (version: string) => boolean;

  beforeEach(async () => {
    const mod = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    isLocalOrUnpublishedVersion = mod.isLocalOrUnpublishedVersion;
  });

  it('returns true for empty string', () => {
    expect(isLocalOrUnpublishedVersion('')).toBe(true);
  });

  it('returns true for 0.0.0 placeholder', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0')).toBe(true);
  });

  it('returns true for 0.0.0-development sentinel', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0-development')).toBe(true);
  });

  it('returns true for versions with + build metadata (local builds)', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0+local.1234')).toBe(true);
    expect(isLocalOrUnpublishedVersion('1.0.0+build.42')).toBe(true);
  });

  it('returns false for normal published versions', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0')).toBe(false);
    expect(isLocalOrUnpublishedVersion('0.9.6-preview.42')).toBe(false);
    expect(isLocalOrUnpublishedVersion('1.0.0-rc.1')).toBe(false);
  });
});
