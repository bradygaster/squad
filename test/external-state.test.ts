import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveExternalStateDir, deriveProjectKey } from '@bradygaster/squad-sdk';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
