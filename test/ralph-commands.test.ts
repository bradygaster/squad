/**
 * Tests for platform-specific Ralph commands — getRalphScanCommands()
 *
 * Validates that each supported platform returns the correct CLI commands
 * for triage, work management, and PR operations.
 */

import { describe, it, expect } from 'vitest';
import {
  getRalphScanCommands,
  type RalphCommands,
} from '../packages/squad-sdk/src/platform/ralph-commands.js';

const COMMAND_KEYS: (keyof RalphCommands)[] = [
  'listUntriaged',
  'listAssigned',
  'listOpenPRs',
  'listDraftPRs',
  'createBranch',
  'createWorktree',
  'removeWorktree',
  'createPR',
  'mergePR',
  'createWorkItem',
];

describe('getRalphScanCommands', () => {
  // --- GitHub ---

  describe('github platform', () => {
    const cmds = getRalphScanCommands('github');

    it('returns all required command keys', () => {
      for (const key of COMMAND_KEYS) {
        expect(cmds).toHaveProperty(key);
        expect(typeof cmds[key]).toBe('string');
        expect(cmds[key].length).toBeGreaterThan(0);
      }
    });

    it('uses gh CLI for issue and PR commands', () => {
      expect(cmds.listUntriaged).toContain('gh issue list');
      expect(cmds.listOpenPRs).toContain('gh pr list');
      expect(cmds.listDraftPRs).toContain('gh pr list');
      expect(cmds.createPR).toContain('gh pr create');
      expect(cmds.mergePR).toContain('gh pr merge');
      expect(cmds.createWorkItem).toContain('gh issue create');
    });

    it('filters untriaged issues by squad:untriaged label', () => {
      expect(cmds.listUntriaged).toContain('squad:untriaged');
    });
  });

  // --- Azure DevOps ---

  describe('azure-devops platform', () => {
    const cmds = getRalphScanCommands('azure-devops');

    it('returns all required command keys', () => {
      for (const key of COMMAND_KEYS) {
        expect(cmds).toHaveProperty(key);
        expect(typeof cmds[key]).toBe('string');
        expect(cmds[key].length).toBeGreaterThan(0);
      }
    });

    it('uses az CLI for board and repo operations', () => {
      expect(cmds.listUntriaged).toContain('az boards');
      expect(cmds.listAssigned).toContain('az boards');
      expect(cmds.listOpenPRs).toContain('az repos pr list');
      expect(cmds.listDraftPRs).toContain('az repos pr list');
      expect(cmds.createPR).toContain('az repos pr create');
      expect(cmds.mergePR).toContain('az repos pr update');
      expect(cmds.createWorkItem).toContain('az boards work-item create');
    });

    it('uses WIQL queries for work item filtering', () => {
      expect(cmds.listUntriaged).toContain('wiql');
      expect(cmds.listUntriaged).toContain('squad:untriaged');
    });
  });

  // --- Planner ---

  describe('planner platform', () => {
    const cmds = getRalphScanCommands('planner');

    it('returns all required command keys', () => {
      for (const key of COMMAND_KEYS) {
        expect(cmds).toHaveProperty(key);
        expect(typeof cmds[key]).toBe('string');
        expect(cmds[key].length).toBeGreaterThan(0);
      }
    });

    it('uses Graph API via az token for planner tasks', () => {
      expect(cmds.listUntriaged).toContain('graph.microsoft.com');
      expect(cmds.listUntriaged).toContain('planner');
      expect(cmds.createWorkItem).toContain('graph.microsoft.com');
    });

    it('indicates PRs are not managed by Planner', () => {
      expect(cmds.listOpenPRs).toContain('Planner does not manage PRs');
      expect(cmds.listDraftPRs).toContain('Planner does not manage PRs');
      expect(cmds.createPR).toContain('Planner does not manage PRs');
      expect(cmds.mergePR).toContain('Planner does not manage PRs');
    });
  });

  // --- Default / unknown platform ---

  describe('default platform fallback', () => {
    it('falls back to GitHub commands for unknown platform', () => {
      const cmds = getRalphScanCommands('unknown' as any);
      expect(cmds.listUntriaged).toContain('gh issue list');
      expect(cmds.listOpenPRs).toContain('gh pr list');
    });
  });

  // --- Cross-platform contract ---

  describe('cross-platform command contract', () => {
    it('all platforms share the same command interface', () => {
      const ghCmds = getRalphScanCommands('github');
      const adoCmds = getRalphScanCommands('azure-devops');
      const plannerCmds = getRalphScanCommands('planner');

      const ghKeys = Object.keys(ghCmds).sort();
      const adoKeys = Object.keys(adoCmds).sort();
      const plannerKeys = Object.keys(plannerCmds).sort();

      expect(ghKeys).toEqual(adoKeys);
      expect(ghKeys).toEqual(plannerKeys);
    });

    it('all platforms support createBranch with git checkout', () => {
      const platforms = ['github', 'azure-devops', 'planner'] as const;
      for (const platform of platforms) {
        const cmds = getRalphScanCommands(platform);
        expect(cmds.createBranch).toContain('git checkout');
      }
    });

    it('all platforms support createWorktree with git worktree add', () => {
      const platforms = ['github', 'azure-devops', 'planner'] as const;
      for (const platform of platforms) {
        const cmds = getRalphScanCommands(platform);
        expect(cmds.createWorktree).toContain('git worktree add');
        expect(cmds.createWorktree).toContain('{worktreePath}');
        expect(cmds.createWorktree).toContain('{branchName}');
        expect(cmds.createWorktree).toContain('{baseBranch}');
      }
    });

    it('all platforms support removeWorktree with git worktree remove', () => {
      const platforms = ['github', 'azure-devops', 'planner'] as const;
      for (const platform of platforms) {
        const cmds = getRalphScanCommands(platform);
        expect(cmds.removeWorktree).toContain('git worktree remove');
        expect(cmds.removeWorktree).toContain('{worktreePath}');
        expect(cmds.removeWorktree).toContain('git worktree prune');
      }
    });
  });
});
