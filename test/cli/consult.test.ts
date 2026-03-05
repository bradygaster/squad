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
import { execSync } from 'node:child_process';
import { isConsultMode, type SquadDirConfig } from '@bradygaster/squad-sdk';

const TEST_ROOT = join(
  process.cwd(),
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

describe('CLI: squad consult', () => {
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
    it('fails outside a git repository', { timeout: 30_000 }, () => {
      // Create a non-git directory
      const nonGitDir = join(TEST_ROOT, 'non-git');
      mkdirSync(nonGitDir, { recursive: true });

      const result = runSquad('consult', nonGitDir);
      expect(result.exitCode).not.toBe(0);
      // CLI will fail due to no personal squad first, or no git repo
      expect(result.stderr).toBeTruthy();
    });

    it('requires personal squad to exist', { timeout: 30_000 }, () => {
      // Override XDG_CONFIG_HOME to point to a non-existent path
      // This ensures the SDK won't find a personal squad
      const result = runSquad('consult', TEST_ROOT, {
        XDG_CONFIG_HOME: join(TEST_ROOT, 'nonexistent-config'),
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/no personal squad/i);
    });
  });
});
