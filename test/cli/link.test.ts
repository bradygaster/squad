/**
 * Link Command Tests — CLI command for linking project to remote team root
 *
 * Tests the runLink function's validation and file-system operations.
 * Uses real temp directories, no mocks needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-link-${randomBytes(4).toString('hex')}`);
const PROJECT_DIR = join(TEST_ROOT, 'project');
const TEAM_DIR = join(TEST_ROOT, 'team-repo');

describe('CLI: link command', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(PROJECT_DIR, { recursive: true });
    mkdirSync(join(TEAM_DIR, '.squad'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('module exports runLink function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/link');
    expect(typeof mod.runLink).toBe('function');
  });

  it('creates .squad/config.json with relative teamRoot', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    runLink(PROJECT_DIR, TEAM_DIR);

    const configPath = join(PROJECT_DIR, '.squad', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.teamRoot).toBeTruthy();
    expect(config.projectKey).toBeNull();
  });

  it('creates .squad directory if it does not exist', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    expect(existsSync(join(PROJECT_DIR, '.squad'))).toBe(false);

    runLink(PROJECT_DIR, TEAM_DIR);

    expect(existsSync(join(PROJECT_DIR, '.squad'))).toBe(true);
  });

  it('adds .squad/config.json to .gitignore', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    runLink(PROJECT_DIR, TEAM_DIR);

    const gitignorePath = join(PROJECT_DIR, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.squad/config.json');
  });

  it('does not duplicate .gitignore entry on re-link', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    runLink(PROJECT_DIR, TEAM_DIR);
    runLink(PROJECT_DIR, TEAM_DIR);

    const content = readFileSync(join(PROJECT_DIR, '.gitignore'), 'utf-8');
    const matches = content.match(/\.squad\/config\.json/g);
    expect(matches?.length).toBe(1);
  });

  it('preserves existing .gitignore content', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    writeFileSync(join(PROJECT_DIR, '.gitignore'), 'node_modules/\n');

    runLink(PROJECT_DIR, TEAM_DIR);

    const content = readFileSync(join(PROJECT_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.squad/config.json');
  });

  it('throws on non-existent target path', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    const bogus = join(TEST_ROOT, 'does-not-exist');
    expect(() => runLink(PROJECT_DIR, bogus)).toThrow(/does not exist/i);
  });

  it('throws when target is a file, not a directory', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    const filePath = join(TEST_ROOT, 'a-file.txt');
    writeFileSync(filePath, 'not a dir');
    expect(() => runLink(PROJECT_DIR, filePath)).toThrow(/not a directory/i);
  });

  it('throws when target has no .squad/ or .ai-team/ directory', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    const emptyDir = join(TEST_ROOT, 'empty-team');
    mkdirSync(emptyDir, { recursive: true });
    expect(() => runLink(PROJECT_DIR, emptyDir)).toThrow(/does not contain/i);
  });

  it('accepts target with .ai-team/ directory', async () => {
    const { runLink } = await import('@bradygaster/squad-cli/commands/link');
    const aiTeamDir = join(TEST_ROOT, 'ai-team-repo');
    mkdirSync(join(aiTeamDir, '.ai-team'), { recursive: true });

    runLink(PROJECT_DIR, aiTeamDir);

    const configPath = join(PROJECT_DIR, '.squad', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });
});
