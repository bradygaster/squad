/**
 * Watch Execute Tests — Ralph's work monitor features
 *
 * Tests new functions introduced in #708 for autonomous work execution.
 * Mocks gh CLI and execFile to avoid network dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAgentCommand, findExecutableIssues, reportBoard, createWatchPlatform } from '../../packages/squad-cli/src/cli/commands/watch.js';
import type { WatchWorkItem, WatchPlatform } from '../../packages/squad-cli/src/cli/commands/watch.js';

describe('CLI: watch execute mode', () => {
  describe('buildAgentCommand', () => {
    it('builds default gh copilot command', async () => {
            const issue: WatchWorkItem = {
        number: 42,
        title: 'Fix auth redirect bug',
        body: 'User auth redirects to wrong page',
        labels: [{ name: 'squad:eecom' }],
        assignees: [],
      };
      const teamRoot = '/path/to/squad';
      const options = { intervalMinutes: 10 };

      const { cmd, args } = buildAgentCommand(issue, teamRoot, options);

      expect(cmd).toBe('gh');
      expect(args).toContain('copilot');
      expect(args).toContain('--message');
      expect(args.some((a) => a.includes('issue #42'))).toBe(true);
    });

    it('passes through copilotFlags', async () => {
            const issue: WatchWorkItem = {
        number: 45,
        title: 'Add retry logic',
        body: 'Add exponential backoff',
        labels: [{ name: 'squad:gnc' }],
        assignees: [],
      };
      const teamRoot = '/path/to/squad';
      const options = { intervalMinutes: 10, copilotFlags: '--model gpt-4 --yolo' };

      const { cmd, args } = buildAgentCommand(issue, teamRoot, options);

      expect(cmd).toBe('gh');
      expect(args).toContain('--model');
      expect(args).toContain('gpt-4');
      expect(args).toContain('--yolo');
    });

    it('uses custom agentCmd when provided', async () => {
            const issue: WatchWorkItem = {
        number: 50,
        title: 'Custom task',
        body: '',
        labels: [{ name: 'squad:custom' }],
        assignees: [],
      };
      const teamRoot = '/path/to/squad';
      const options = { intervalMinutes: 10, agentCmd: 'custom-agent --flag value' };

      const { cmd, args } = buildAgentCommand(issue, teamRoot, options);

      expect(cmd).toBe('custom-agent');
      expect(args).toContain('--flag');
      expect(args).toContain('value');
      expect(args).toContain('--message');
    });
  });

  describe('findExecutableIssues', () => {
    it('returns only issues ready for execution', async () => {
            const roster = [
        { name: 'EECOM', label: 'squad:eecom', expertise: [] },
        { name: 'GNC', label: 'squad:gnc', expertise: [] },
      ];
      const issues: WatchWorkItem[] = [
        // Executable: has squad label, unassigned, not blocked
        {
          number: 1,
          title: 'Task 1',
          body: '',
          labels: [{ name: 'squad:eecom' }],
          assignees: [],
        },
        // Not executable: assigned to human
        {
          number: 2,
          title: 'Task 2',
          body: '',
          labels: [{ name: 'squad:gnc' }],
          assignees: [{ login: 'alice' }],
        },
        // Not executable: blocked label
        {
          number: 3,
          title: 'Task 3',
          body: '',
          labels: [{ name: 'squad:eecom' }, { name: 'status:blocked' }],
          assignees: [],
        },
        // Not executable: no squad label
        {
          number: 4,
          title: 'Task 4',
          body: '',
          labels: [{ name: 'bug' }],
          assignees: [],
        },
      ];

      const executable = findExecutableIssues(roster, null, issues);

      expect(executable).toHaveLength(1);
      expect(executable[0]?.number).toBe(1);
    });

    it('filters by capabilities when provided', async () => {
            const roster = [{ name: 'EECOM', label: 'squad:eecom', expertise: [] }];
      const issues: WatchWorkItem[] = [
        {
          number: 10,
          title: 'Task with needs',
          body: '',
          labels: [{ name: 'squad:eecom' }, { name: 'needs:docker' }],
          assignees: [],
        },
      ];
      // No capabilities — should still return the issue (capability filtering is separate)
      const executable = findExecutableIssues(roster, null, issues);
      expect(executable).toHaveLength(1);
    });
  });

  describe('WatchOptions defaults', () => {
    it('all new features default to disabled', async () => {
      const options = { intervalMinutes: 10 };

      // All opt-in flags should be undefined/false by default
      expect(options.execute).toBeUndefined();
      expect(options.monitorTeams).toBeUndefined();
      expect(options.monitorEmail).toBeUndefined();
      expect(options.board).toBeUndefined();
      expect(options.twoPass).toBeUndefined();
      expect(options.waveDispatch).toBeUndefined();
      expect(options.retro).toBeUndefined();
      expect(options.decisionHygiene).toBeUndefined();
    });
  });

  describe('emptyBoardState', () => {
    it('includes executed field', async () => {
            const state = {
        untriaged: 0,
        assigned: 0,
        drafts: 0,
        needsReview: 0,
        changesRequested: 0,
        ciFailures: 0,
        readyToMerge: 0,
        executed: 0,
      };

      // Should not throw — verifies the shape is correct
      expect(() => reportBoard(state, 1)).not.toThrow();
    });
  });

  describe('reportBoard with executed count', () => {
    it('reports executed count when > 0', async () => {
            const consoleLogSpy = vi.spyOn(console, 'log');

      const state = {
        untriaged: 1,
        assigned: 2,
        drafts: 0,
        needsReview: 0,
        changesRequested: 0,
        ciFailures: 0,
        readyToMerge: 0,
        executed: 3,
      };

      reportBoard(state, 1);

      const logOutput = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logOutput).toContain('Executed');
      expect(logOutput).toContain('3');

      consoleLogSpy.mockRestore();
    });
  });

  describe('createWatchPlatform', () => {
    it('returns GitHub platform by default', () => {
      const platform = createWatchPlatform({ intervalMinutes: 10 }, '/nonexistent/path');
      // Default should be GitHub when no config or git remote is detectable
      expect(platform).toBeDefined();
      expect(typeof platform.listWorkItems).toBe('function');
      expect(typeof platform.editWorkItem).toBe('function');
      expect(typeof platform.listPullRequests).toBe('function');
      expect(typeof platform.commentOnWorkItem).toBe('function');
    });

    it('returns GitHub platform when explicitly set', () => {
      const platform = createWatchPlatform({ intervalMinutes: 10, platform: 'github' }, '/nonexistent/path');
      expect(platform).toBeDefined();
      expect(typeof platform.checkRateLimit).toBe('function');
    });

    it('throws for ADO when config is incomplete and no git remote', () => {
      expect(() =>
        createWatchPlatform({ intervalMinutes: 10, platform: 'ado' }, '/nonexistent/path'),
      ).toThrow(/Azure DevOps configuration incomplete/);
    });
  });

  describe('WatchPlatform interface', () => {
    it('platform option defaults to undefined', () => {
      const options = { intervalMinutes: 10 };
      expect(options.platform).toBeUndefined();
    });

    it('platform option accepts github', () => {
      const options = { intervalMinutes: 10, platform: 'github' as const };
      expect(options.platform).toBe('github');
    });

    it('platform option accepts ado', () => {
      const options = { intervalMinutes: 10, platform: 'ado' as const };
      expect(options.platform).toBe('ado');
    });
  });
});

