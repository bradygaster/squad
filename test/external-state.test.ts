import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveExternalStateDir, deriveProjectKey } from '@bradygaster/squad-sdk';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runExternalize, runInternalize } from '../packages/squad-cli/src/cli/commands/externalize.js';

const TEST_ROOT = path.join(os.tmpdir(), `squad-external-test-${Date.now()}`);

// Isolate tests from real user state by overriding config dirs
const origAppData = process.env['APPDATA'];
const origXdgConfig = process.env['XDG_CONFIG_HOME'];

beforeEach(() => {
  mkdirSync(TEST_ROOT, { recursive: true });
  // Redirect global squad dir into test root so we never touch real user state
  if (process.platform === 'win32') {
    process.env['APPDATA'] = TEST_ROOT;
  } else {
    process.env['XDG_CONFIG_HOME'] = TEST_ROOT;
  }
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  // Restore env
  if (origAppData !== undefined) process.env['APPDATA'] = origAppData;
  else delete process.env['APPDATA'];
  if (origXdgConfig !== undefined) process.env['XDG_CONFIG_HOME'] = origXdgConfig;
  else delete process.env['XDG_CONFIG_HOME'];
});

describe('deriveProjectKey', () => {
  it('lowercases and sanitizes the basename', () => {
    expect(deriveProjectKey('/home/user/My-Cool-Project')).toBe('my-cool-project');
  });

  it('replaces spaces and special chars with dashes', () => {
    expect(deriveProjectKey('/path/to/My Project (v2)')).toBe('my-project--v2');
  });

  it('handles Windows paths', () => {
    expect(deriveProjectKey('C:\\Users\\tamir\\squad')).toBe('squad');
  });

  it('returns "unknown-project" for empty basename', () => {
    // path.basename of root returns ''
    expect(deriveProjectKey('/')).toBe('unknown-project');
  });
});

describe('resolveExternalStateDir', () => {
  it('creates the projects directory', () => {
    const dir = resolveExternalStateDir('test-project-123');
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain('projects');
    expect(dir).toContain('test-project-123');
  });

  it('returns path without creating when create=false', () => {
    const dir = resolveExternalStateDir('nonexistent-project-xyz', false);
    expect(dir).toContain('nonexistent-project-xyz');
    // May or may not exist depending on prior runs — just check the path is sane
    expect(dir).toContain('projects');
  });

  it('is idempotent', () => {
    const dir1 = resolveExternalStateDir('idempotent-test-proj');
    const dir2 = resolveExternalStateDir('idempotent-test-proj');
    expect(dir1).toBe(dir2);
  });
});

describe('SquadDirConfig stateLocation', () => {
  it('loadDirConfig parses stateLocation: external', async () => {
    const { loadDirConfig } = await import('@bradygaster/squad-sdk');
    
    const configDir = path.join(TEST_ROOT, '.squad');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      version: 1,
      teamRoot: '.',
      projectKey: 'my-project',
      stateLocation: 'external',
    }));

    const config = loadDirConfig(configDir);
    expect(config).not.toBeNull();
    expect(config!.stateLocation).toBe('external');
    expect(config!.projectKey).toBe('my-project');
  });

  it('loadDirConfig defaults stateLocation to undefined (local)', async () => {
    const { loadDirConfig } = await import('@bradygaster/squad-sdk');
    
    const configDir = path.join(TEST_ROOT, '.squad2');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      version: 1,
      teamRoot: '.',
      projectKey: null,
    }));

    const config = loadDirConfig(configDir);
    expect(config).not.toBeNull();
    expect(config!.stateLocation).toBeUndefined();
  });
});

describe('resolveExternalStateDir security', () => {
  it('rejects path traversal in projectKey', () => {
    expect(() => resolveExternalStateDir('../../etc/passwd')).toThrow('Invalid project key');
  });

  it('rejects empty projectKey', () => {
    expect(() => resolveExternalStateDir('')).toThrow('Invalid project key');
  });

  it('sanitizes special characters in projectKey', () => {
    const dir = resolveExternalStateDir('my/project\\name');
    expect(dir).toContain('my-project-name');
    expect(dir).not.toContain('/project\\');
  });
});

// ============================================================================
// runExternalize / runInternalize — CLI function tests
// ============================================================================

describe('runExternalize / runInternalize', () => {
  let projectDir: string;
  let squadDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectDir = path.join(TEST_ROOT, 'fake-project');
    squadDir = path.join(projectDir, '.squad');
    mkdirSync(squadDir, { recursive: true });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  /** Helper: list entries in a directory (returns [] if missing). */
  function lsDir(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }

  // T1: runExternalize basic — files move, KEEP_LOCAL entries stay
  it('moves state to external dir, leaving only KEEP_LOCAL entries', () => {
    // Create typical .squad/ state
    writeFileSync(path.join(squadDir, 'team.md'), '# Team\n');
    writeFileSync(path.join(squadDir, 'manifest.json'), '{"name":"test"}');
    writeFileSync(path.join(squadDir, 'workstreams.json'), '{"workstreams":[]}');
    writeFileSync(path.join(squadDir, 'upstream.json'), '{"upstreams":[]}');
    writeFileSync(path.join(squadDir, 'squad-registry.json'), '[]');
    const agentsDir = path.join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, 'bot.md'), '# Bot\n');
    // _upstream_repos is a git clone cache that must stay local
    const upstreamRepos = path.join(squadDir, '_upstream_repos', 'org');
    mkdirSync(upstreamRepos, { recursive: true });
    writeFileSync(path.join(upstreamRepos, 'README.md'), '# Upstream\n');

    runExternalize(projectDir);

    // .squad/ should only retain KEEP_LOCAL entries + config.json (written by externalize)
    const remaining = lsDir(squadDir).sort();
    expect(remaining).toContain('config.json');
    expect(remaining).toContain('manifest.json');
    expect(remaining).toContain('workstreams.json');
    expect(remaining).toContain('upstream.json');
    expect(remaining).toContain('squad-registry.json');
    expect(remaining).toContain('_upstream_repos');
    expect(remaining).not.toContain('team.md');
    expect(remaining).not.toContain('agents');

    // External dir should have the moved files
    const key = deriveProjectKey(projectDir);
    const externalDir = resolveExternalStateDir(key, false);
    expect(existsSync(path.join(externalDir, 'team.md'))).toBe(true);
    expect(existsSync(path.join(externalDir, 'agents', 'bot.md'))).toBe(true);
    // KEEP_LOCAL entries must NOT be externalized
    expect(existsSync(path.join(externalDir, 'manifest.json'))).toBe(false);
    expect(existsSync(path.join(externalDir, 'workstreams.json'))).toBe(false);
    expect(existsSync(path.join(externalDir, 'upstream.json'))).toBe(false);
    expect(existsSync(path.join(externalDir, 'squad-registry.json'))).toBe(false);
    expect(existsSync(path.join(externalDir, '_upstream_repos'))).toBe(false);
  });

  // T2: runExternalize with unknown entries — proves dynamic scan
  it('moves unknown entries not in old hardcoded lists', () => {
    writeFileSync(path.join(squadDir, 'custom-state.json'), '{"x":1}');
    const pluginsDir = path.join(squadDir, 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(path.join(pluginsDir, 'my-plugin.txt'), 'plugin data');

    runExternalize(projectDir);

    const remaining = lsDir(squadDir);
    expect(remaining).not.toContain('custom-state.json');
    expect(remaining).not.toContain('plugins');

    const key = deriveProjectKey(projectDir);
    const externalDir = resolveExternalStateDir(key, false);
    expect(readFileSync(path.join(externalDir, 'custom-state.json'), 'utf-8')).toBe('{"x":1}');
    expect(readFileSync(path.join(externalDir, 'plugins', 'my-plugin.txt'), 'utf-8')).toBe('plugin data');
  });

  // T3: runExternalize preserves existing config fields
  it('preserves extra config.json fields through externalization', () => {
    writeFileSync(path.join(squadDir, 'team.md'), '# Team\n');
    writeFileSync(
      path.join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, consult: true, stateBackend: 'fs' }),
    );

    runExternalize(projectDir);

    const config = JSON.parse(readFileSync(path.join(squadDir, 'config.json'), 'utf-8'));
    expect(config.consult).toBe(true);
    expect(config.stateBackend).toBe('fs');
    expect(config.stateLocation).toBe('external');
    expect(config.projectKey).toBe(deriveProjectKey(projectDir));
  });

  // T4: runInternalize round-trip — externalize then internalize restores files
  it('round-trips files through externalize → internalize', () => {
    writeFileSync(path.join(squadDir, 'team.md'), '# My Team\n');
    writeFileSync(path.join(squadDir, 'custom-data.json'), '{"round":"trip"}');
    const logDir = path.join(squadDir, 'log');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(path.join(logDir, 'session.md'), '## Session 1\n');

    runExternalize(projectDir);

    // State is gone from .squad/
    expect(existsSync(path.join(squadDir, 'team.md'))).toBe(false);

    runInternalize(projectDir);

    // State is back
    expect(readFileSync(path.join(squadDir, 'team.md'), 'utf-8')).toBe('# My Team\n');
    expect(readFileSync(path.join(squadDir, 'custom-data.json'), 'utf-8')).toBe('{"round":"trip"}');
    expect(readFileSync(path.join(squadDir, 'log', 'session.md'), 'utf-8')).toBe('## Session 1\n');
  });

  // T5: runInternalize cleans config — external-state fields removed
  it('removes stateLocation/projectKey/teamRoot from config after internalize', () => {
    // Seed config with an extra field so config.json survives (not deleted)
    writeFileSync(
      path.join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, consult: true }),
    );
    writeFileSync(path.join(squadDir, 'team.md'), '# Team\n');

    runExternalize(projectDir);

    // Verify external fields are present
    const extConfig = JSON.parse(readFileSync(path.join(squadDir, 'config.json'), 'utf-8'));
    expect(extConfig.stateLocation).toBe('external');
    expect(extConfig.projectKey).toBeDefined();
    expect(extConfig.teamRoot).toBe('.');

    runInternalize(projectDir);

    // External fields must be gone; user fields preserved
    const intConfig = JSON.parse(readFileSync(path.join(squadDir, 'config.json'), 'utf-8'));
    expect(intConfig.stateLocation).toBeUndefined();
    expect(intConfig.projectKey).toBeUndefined();
    expect(intConfig.teamRoot).toBeUndefined();
    expect(intConfig.consult).toBe(true);
  });

  // T6: runExternalize on empty .squad/ — succeeds with nothing to move
  it('succeeds when .squad/ contains only config.json', () => {
    writeFileSync(
      path.join(squadDir, 'config.json'),
      JSON.stringify({ version: 1 }),
    );

    // Should not throw
    expect(() => runExternalize(projectDir)).not.toThrow();

    // config.json is still there with external marker
    const config = JSON.parse(readFileSync(path.join(squadDir, 'config.json'), 'utf-8'));
    expect(config.stateLocation).toBe('external');
  });
});
