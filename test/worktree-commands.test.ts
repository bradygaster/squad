/**
 * Tests for worktree command generation functions in ralph-commands.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import {
  isWorktreeEnabled,
  resolveWorktreePath,
  createWorktreeCommand,
  removeWorktreeCommand,
  setupWorktreeDepsCommand,
  generateWorktreeVariant,
} from '../packages/squad-sdk/src/platform/ralph-commands.js';

describe('worktree commands', () => {
  describe('isWorktreeEnabled', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.SQUAD_WORKTREES;
      delete process.env.SQUAD_WORKTREES;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.SQUAD_WORKTREES = originalEnv;
      } else {
        delete process.env.SQUAD_WORKTREES;
      }
    });

    it('returns false by default', () => {
      expect(isWorktreeEnabled()).toBe(false);
      expect(isWorktreeEnabled({})).toBe(false);
    });

    it('returns true when SQUAD_WORKTREES=1', () => {
      process.env.SQUAD_WORKTREES = '1';
      expect(isWorktreeEnabled()).toBe(true);
    });

    it('returns true when SQUAD_WORKTREES=true', () => {
      process.env.SQUAD_WORKTREES = 'true';
      expect(isWorktreeEnabled()).toBe(true);
    });

    it('returns false when SQUAD_WORKTREES=0', () => {
      process.env.SQUAD_WORKTREES = '0';
      expect(isWorktreeEnabled()).toBe(false);
      expect(isWorktreeEnabled({ worktrees: true })).toBe(false);
    });

    it('returns false when SQUAD_WORKTREES=false', () => {
      process.env.SQUAD_WORKTREES = 'false';
      expect(isWorktreeEnabled()).toBe(false);
      expect(isWorktreeEnabled({ worktrees: true })).toBe(false);
    });

    it('respects config when no env var', () => {
      expect(isWorktreeEnabled({ worktrees: true })).toBe(true);
      expect(isWorktreeEnabled({ worktrees: false })).toBe(false);
    });

    it('env var takes precedence over config', () => {
      process.env.SQUAD_WORKTREES = '1';
      expect(isWorktreeEnabled({ worktrees: false })).toBe(true);

      process.env.SQUAD_WORKTREES = '0';
      expect(isWorktreeEnabled({ worktrees: true })).toBe(false);
    });
  });

  describe('resolveWorktreePath', () => {
    it('creates sibling directory path', () => {
      const repoRoot = '/home/user/project';
      const issueNumber = 42;
      const expected = path.join('/home/user', 'project-42');
      expect(resolveWorktreePath(repoRoot, issueNumber)).toBe(expected);
    });

    it('uses repo name and issue number', () => {
      const repoRoot = 'C:\\src\\squad';
      const issueNumber = 528;
      const expected = path.join('C:\\src', 'squad-528');
      expect(resolveWorktreePath(repoRoot, issueNumber)).toBe(expected);
    });

    it('handles string issue numbers', () => {
      const repoRoot = '/repos/myapp';
      const issueNumber = '123';
      const expected = path.join('/repos', 'myapp-123');
      expect(resolveWorktreePath(repoRoot, issueNumber)).toBe(expected);
    });

    it('works with nested repo paths', () => {
      const repoRoot = '/home/dev/work/my-project';
      const issueNumber = 1;
      const expected = path.join('/home/dev/work', 'my-project-1');
      expect(resolveWorktreePath(repoRoot, issueNumber)).toBe(expected);
    });
  });

  describe('createWorktreeCommand', () => {
    it('generates correct git worktree add command', () => {
      const repoRoot = '/home/user/project';
      const branch = 'feature/new-thing';
      const baseBranch = 'main';
      const issueNumber = 42;

      const result = createWorktreeCommand(repoRoot, branch, baseBranch, issueNumber);
      const expectedPath = path.join('/home/user', 'project-42');

      expect(result.worktreePath).toBe(expectedPath);
      expect(result.command).toContain('git worktree add');
      expect(result.command).toContain('feature/new-thing');
      expect(result.command).toContain('main');
    });

    it('includes branch and base branch', () => {
      const repoRoot = 'C:\\repos\\squad';
      const branch = 'squad/528-worktree-ralph';
      const baseBranch = 'dev';
      const issueNumber = 528;

      const result = createWorktreeCommand(repoRoot, branch, baseBranch, issueNumber);

      expect(result.command).toContain('-b squad/528-worktree-ralph');
      expect(result.command).toContain(' dev');
    });

    it('returns both command and path', () => {
      const result = createWorktreeCommand('/repos/test', 'fix/bug', 'main', 99);
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('worktreePath');
      expect(typeof result.command).toBe('string');
      expect(typeof result.worktreePath).toBe('string');
    });
  });

  describe('removeWorktreeCommand', () => {
    it('generates worktree remove command', () => {
      const worktreePath = '/home/user/project-42';
      const commands = removeWorktreeCommand(worktreePath);

      expect(commands).toHaveLength(1);
      expect(commands[0]).toBe('git worktree remove "/home/user/project-42"');
    });

    it('includes branch delete when branch provided', () => {
      const worktreePath = '/home/user/project-42';
      const branch = 'feature/test';
      const commands = removeWorktreeCommand(worktreePath, branch);

      expect(commands).toHaveLength(2);
      expect(commands[0]).toBe('git worktree remove "/home/user/project-42"');
      expect(commands[1]).toBe('git branch -d feature/test');
    });

    it('does not include branch delete when branch not provided', () => {
      const commands = removeWorktreeCommand('/repos/test-1');
      expect(commands).toHaveLength(1);
      expect(commands[0]).toContain('git worktree remove');
    });
  });

  describe('setupWorktreeDepsCommand', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      // Restore original platform (note: can't actually change it in tests)
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('uses mklink /J on Windows', () => {
      if (process.platform !== 'win32') {
        // Skip this test on non-Windows
        return;
      }

      const mainRepo = 'C:\\repos\\squad';
      const worktreePath = 'C:\\repos\\squad-42';
      const command = setupWorktreeDepsCommand(mainRepo, worktreePath);

      expect(command).toContain('mklink /J');
      expect(command).toContain('C:\\repos\\squad-42\\node_modules');
      expect(command).toContain('C:\\repos\\squad\\node_modules');
    });

    it('uses ln -s on Unix', () => {
      if (process.platform === 'win32') {
        // Skip this test on Windows
        return;
      }

      const mainRepo = '/home/user/squad';
      const worktreePath = '/home/user/squad-42';
      const command = setupWorktreeDepsCommand(mainRepo, worktreePath);

      expect(command).toContain('ln -s');
      expect(command).toContain('/home/user/squad/node_modules');
      expect(command).toContain('/home/user/squad-42/node_modules');
    });

    it('generates valid symlink command structure', () => {
      const mainRepo = '/repos/main';
      const worktreePath = '/repos/main-1';
      const command = setupWorktreeDepsCommand(mainRepo, worktreePath);

      expect(command).toBeTruthy();
      expect(typeof command).toBe('string');
      expect(command.length).toBeGreaterThan(0);
    });
  });

  describe('generateWorktreeVariant', () => {
    it('generates complete worktree variant object', () => {
      const repoRoot = '/home/user/project';
      const branchName = 'feature/test';
      const baseBranch = 'main';
      const issueNumber = 42;

      const variant = generateWorktreeVariant(repoRoot, branchName, baseBranch, issueNumber);

      expect(variant).toHaveProperty('create');
      expect(variant).toHaveProperty('path');
      expect(variant).toHaveProperty('setupDeps');
      expect(variant).toHaveProperty('cleanup');

      expect(typeof variant.create).toBe('string');
      expect(typeof variant.path).toBe('string');
      expect(typeof variant.setupDeps).toBe('string');
      expect(Array.isArray(variant.cleanup)).toBe(true);
    });

    it('returns correct path', () => {
      const variant = generateWorktreeVariant('/repos/squad', 'fix/bug', 'dev', 100);
      const expectedPath = path.join('/repos', 'squad-100');
      expect(variant.path).toBe(expectedPath);
    });

    it('create command includes all parameters', () => {
      const variant = generateWorktreeVariant('/repos/test', 'my-branch', 'develop', 5);
      expect(variant.create).toContain('git worktree add');
      expect(variant.create).toContain('my-branch');
      expect(variant.create).toContain('develop');
    });

    it('cleanup includes both worktree remove and branch delete', () => {
      const variant = generateWorktreeVariant('/repos/app', 'feature/x', 'main', 10);
      expect(variant.cleanup).toHaveLength(2);
      expect(variant.cleanup[0]).toContain('git worktree remove');
      expect(variant.cleanup[1]).toContain('git branch -d');
    });

    it('setupDeps command is platform-appropriate', () => {
      const variant = generateWorktreeVariant('/repos/test', 'branch', 'main', 1);
      if (process.platform === 'win32') {
        expect(variant.setupDeps).toContain('mklink /J');
      } else {
        expect(variant.setupDeps).toContain('ln -s');
      }
    });
  });
});
