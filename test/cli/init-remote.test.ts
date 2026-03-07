/**
 * Init-Remote Command Tests — CLI command for writing remote mode config
 *
 * Tests the writeRemoteConfig function's file-system operations.
 * Uses real temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-init-remote-${randomBytes(4).toString('hex')}`);
const PROJECT_DIR = join(TEST_ROOT, 'project');
const TEAM_DIR = join(TEST_ROOT, 'team-repo');

describe('CLI: init-remote command', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(PROJECT_DIR, { recursive: true });
    mkdirSync(TEAM_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('module exports writeRemoteConfig function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/init-remote');
    expect(typeof mod.writeRemoteConfig).toBe('function');
  });

  it('creates .squad/config.json with correct structure', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const configPath = join(PROJECT_DIR, '.squad', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.teamRoot).toBeTruthy();
    expect(config.projectKey).toBeNull();
  });

  it('creates .squad directory if missing', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    expect(existsSync(join(PROJECT_DIR, '.squad'))).toBe(false);

    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    expect(existsSync(join(PROJECT_DIR, '.squad'))).toBe(true);
  });

  it('stores a relative path from project to team repo', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const config = JSON.parse(
      readFileSync(join(PROJECT_DIR, '.squad', 'config.json'), 'utf-8'),
    );
    // Relative path should not be absolute
    expect(config.teamRoot).not.toMatch(/^[A-Z]:\\/i);
    expect(config.teamRoot).not.toMatch(/^\//);
  });

  it('adds .squad/config.json to .gitignore', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const gitignorePath = join(PROJECT_DIR, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.squad/config.json');
  });

  it('does not duplicate gitignore entry', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const content = readFileSync(join(PROJECT_DIR, '.gitignore'), 'utf-8');
    const matches = content.match(/\.squad\/config\.json/g);
    expect(matches?.length).toBe(1);
  });

  it('overwrites existing config.json on re-run', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const secondTeam = join(TEST_ROOT, 'second-team');
    mkdirSync(secondTeam, { recursive: true });
    writeRemoteConfig(PROJECT_DIR, secondTeam);

    const config = JSON.parse(
      readFileSync(join(PROJECT_DIR, '.squad', 'config.json'), 'utf-8'),
    );
    expect(config.teamRoot).toContain('second-team');
  });

  it('preserves existing .gitignore content', async () => {
    const { writeRemoteConfig } = await import('@bradygaster/squad-cli/commands/init-remote');
    writeFileSync(join(PROJECT_DIR, '.gitignore'), 'dist/\n');
    writeRemoteConfig(PROJECT_DIR, TEAM_DIR);

    const content = readFileSync(join(PROJECT_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('dist/');
    expect(content).toContain('.squad/config.json');
  });
});
