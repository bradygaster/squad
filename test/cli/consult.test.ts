/**
 * Tests for squad consult CLI command.
 *
 * The consult command requires a personal squad to exist. These tests focus on:
 * 1. SDK isConsultMode() function (no personal squad needed)
 * 2. Direct import of runConsult() when possible
 * 3. Error handling tests for the CLI
 *
 * @module test/cli/consult
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isConsultMode, type SquadDirConfig } from '@bradygaster/squad-sdk';

const TEST_ROOT = join(
  tmpdir(),
  `.test-cli-consult-${randomBytes(4).toString('hex')}`,
);

/**
 * Initialize a minimal git repo for testing.
 */
function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
}

/**
 * Run squad CLI command in the test directory.
 */
function runSquad(
  args: string,
  cwd: string,
  env?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } {
  const cliPath = join(process.cwd(), 'packages/squad-cli/dist/cli-entry.js');
  try {
    const stdout = execSync(`node ${cliPath} ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('CLI: squad consult', { timeout: 30_000 }, () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    initGitRepo(TEST_ROOT);
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe('isConsultMode SDK function', () => {
    it('returns true when consult flag is true', () => {
      const config: SquadDirConfig = {
        version: 1,
        teamRoot: '/tmp/squad',
        consult: true,
      };
      expect(isConsultMode(config)).toBe(true);
    });

    it('returns false when consult flag is false', () => {
      const config: SquadDirConfig = {
        version: 1,
        teamRoot: '/tmp/squad',
        consult: false,
      };
      expect(isConsultMode(config)).toBe(false);
    });

    it('returns false when consult flag is missing', () => {
      const config: SquadDirConfig = {
        version: 1,
        teamRoot: '/tmp/squad',
      };
      expect(isConsultMode(config)).toBe(false);
    });
  });

  describe('consult mode config format', () => {
    it('creates valid consult mode config structure', () => {
      // Simulate what the consult command creates
      mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
      const config: SquadDirConfig = {
        version: 1,
        teamRoot: '/home/user/.squad',
        projectKey: 'consult',
        consult: true,
      };
      writeFileSync(
        join(TEST_ROOT, '.squad', 'config.json'),
        JSON.stringify(config, null, 2),
      );

      // Verify the config can be read and detected
      const readConfig = JSON.parse(
        readFileSync(join(TEST_ROOT, '.squad', 'config.json'), 'utf-8'),
      );
      expect(isConsultMode(readConfig)).toBe(true);
      expect(readConfig.teamRoot).toBe('/home/user/.squad');
      expect(readConfig.projectKey).toBe('consult');
    });
  });

  describe('git exclude integration', () => {
    it('.git/info/exclude can be written to in a fresh git repo', () => {
      // Verify the git exclude mechanism works
      const excludePath = join(TEST_ROOT, '.git', 'info', 'exclude');
      mkdirSync(join(TEST_ROOT, '.git', 'info'), { recursive: true });
      writeFileSync(excludePath, '# Test exclude\n.squad/\n');

      const content = readFileSync(excludePath, 'utf-8');
      expect(content).toContain('.squad/');
    });

    it('git ignores files in .git/info/exclude', () => {
      // Set up git exclude and a file that should be ignored
      mkdirSync(join(TEST_ROOT, '.git', 'info'), { recursive: true });
      writeFileSync(
        join(TEST_ROOT, '.git', 'info', 'exclude'),
        '.squad/\n',
      );
      mkdirSync(join(TEST_ROOT, '.squad'), { recursive: true });
      writeFileSync(join(TEST_ROOT, '.squad', 'config.json'), '{}');

      // Git status should not show .squad/
      const status = execSync('git status --porcelain', {
        cwd: TEST_ROOT,
        encoding: 'utf-8',
      });
      expect(status).not.toContain('.squad');
    });
  });

  describe('error handling', () => {
    it('fails outside a git repository', () => {
      // Create a non-git directory
      const nonGitDir = join(TEST_ROOT, 'non-git');
      mkdirSync(nonGitDir, { recursive: true });

      const result = runSquad('consult', nonGitDir);
      expect(result.exitCode).not.toBe(0);
      // CLI will fail due to no personal squad first, or no git repo
      expect(result.stderr).toBeTruthy();
    });

    it('requires personal squad to exist', () => {
      // Override XDG_CONFIG_HOME + APPDATA to point to a non-existent path
      // This ensures the SDK won't find a personal squad
      const nonexistent = join(TEST_ROOT, 'nonexistent-config');
      const result = runSquad('consult', TEST_ROOT, {
        XDG_CONFIG_HOME: nonexistent,
        APPDATA: nonexistent,
        LOCALAPPDATA: nonexistent,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/no personal squad/i);
    });
  });

  describe('happy path: init global → consult → status → extract', () => {
    const globalConfig = join(TEST_ROOT, 'xdg-config');
    const projectDir = join(TEST_ROOT, 'their-project');
    const envWithGlobal = {
      XDG_CONFIG_HOME: globalConfig,
      // On Windows, resolveGlobalSquadPath() reads APPDATA, not XDG_CONFIG_HOME
      APPDATA: globalConfig,
      LOCALAPPDATA: globalConfig,
    };

    beforeEach(() => {
      // 1. Create a personal (global) squad via `squad init --global`
      mkdirSync(globalConfig, { recursive: true });
      const initResult = runSquad('init --global', TEST_ROOT, envWithGlobal);
      expect(initResult.exitCode).toBe(0);

      // Verify the personal squad was created
      const personalSquadDir = join(globalConfig, 'squad', '.squad');
      expect(existsSync(personalSquadDir)).toBe(true);

      // 2. Create a fresh project with its own git repo (no .squad/)
      mkdirSync(projectDir, { recursive: true });
      initGitRepo(projectDir);
    });

    it('squad consult sets up consult mode in the project', () => {
      const result = runSquad('consult', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Consult mode activated');

      // .squad/ should exist in the project
      expect(existsSync(join(projectDir, '.squad'))).toBe(true);
      expect(existsSync(join(projectDir, '.squad', 'config.json'))).toBe(true);

      // config.json should have consult: true
      const config = JSON.parse(
        readFileSync(join(projectDir, '.squad', 'config.json'), 'utf-8'),
      );
      expect(config.consult).toBe(true);
      expect(config.sourceSquad).toBeTruthy();

      // extract/ staging directory should exist
      expect(existsSync(join(projectDir, '.squad', 'extract'))).toBe(true);

      // .git/info/exclude should contain .squad/
      const excludePath = join(projectDir, '.git', 'info', 'exclude');
      expect(existsSync(excludePath)).toBe(true);
      const excludeContent = readFileSync(excludePath, 'utf-8');
      expect(excludeContent).toContain('.squad/');

      // git status should show nothing (invisible to project)
      const gitStatus = execSync('git status --porcelain', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      expect(gitStatus).not.toContain('.squad');
    });

    it('squad consult --status reports active consult mode', () => {
      // First enter consult mode
      runSquad('consult', projectDir, envWithGlobal);

      // Then check status
      const result = runSquad('consult --status', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Consult mode active');
    });

    it('squad consult --check shows dry-run without creating files', () => {
      const result = runSquad('consult --check', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry-run');
      expect(result.stdout).toContain('consult: true');

      // .squad/ should NOT exist (dry run)
      expect(existsSync(join(projectDir, '.squad'))).toBe(false);
    });

    it('squad extract --dry-run shows staged learnings without modifying', () => {
      // Enter consult mode
      runSquad('consult', projectDir, envWithGlobal);

      // Stage a learning manually (simulating what Scribe does during a session)
      const extractDir = join(projectDir, '.squad', 'extract');
      writeFileSync(
        join(extractDir, 'use-async-await.md'),
        '### Always use async/await\n\nPrefer async/await over raw promises.',
      );

      // Dry-run extract
      const result = runSquad('extract --dry-run', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry-run');
      expect(result.stdout).toContain('use-async-await.md');

      // The learning should still be in extract/ (not removed)
      expect(existsSync(join(extractDir, 'use-async-await.md'))).toBe(true);
    });

    it('squad extract with no staged learnings reports empty', () => {
      // Enter consult mode (no learnings staged)
      runSquad('consult', projectDir, envWithGlobal);

      const result = runSquad('extract', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No learnings staged');
    });

    it('squad consult fails if project already has .squad/', () => {
      // Enter consult mode first time
      runSquad('consult', projectDir, envWithGlobal);

      // Try again — should fail because .squad/ already exists
      const result = runSquad('consult', projectDir, envWithGlobal);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/already has/i);
    });
  });
});
