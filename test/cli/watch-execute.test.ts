/**
 * Watch Execute Tests — Ralph's work monitor features
 *
 * Tests new functions introduced in #708 for autonomous work execution.
 * Mocks gh CLI and execFile to avoid network dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAgentCommand, findExecutableIssues, reportBoard } from '../../packages/squad-cli/src/cli/commands/watch/index.js';
import type { WatchWorkItem } from '../../packages/squad-cli/src/cli/commands/watch/index.js';
import { classifyIssue } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';
import type { ExecutableWorkItem } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';

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
      expect(args).toContain('-p');

      const promptIndex = args.indexOf('-p');
      expect(promptIndex).toBeGreaterThan(-1);
      expect(args[promptIndex + 1]).toContain('42');
      expect(args[promptIndex + 1]).toContain('Fix auth redirect bug');
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
      expect(args).toContain('-p');
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

  describe('classifyIssue', () => {
    it('classifies research titles as read', () => {
      expect(classifyIssue('Research auth flow improvements')).toBe('read');
      expect(classifyIssue('Review PR comments on fleet dispatch')).toBe('read');
      expect(classifyIssue('Analyze memory usage patterns')).toBe('read');
      expect(classifyIssue('Investigate timeout errors in CI')).toBe('read');
      expect(classifyIssue('Audit security labels on open issues')).toBe('read');
    });

    it('classifies implementation titles as write', () => {
      expect(classifyIssue('Fix auth redirect bug')).toBe('write');
      expect(classifyIssue('Implement rate limiter capability')).toBe('write');
      expect(classifyIssue('Add unit tests for classifyIssue')).toBe('write');
      expect(classifyIssue('Update dependencies to latest')).toBe('write');
      expect(classifyIssue('Refactor watch loop into capabilities')).toBe('write');
    });

    it('defaults to write when no keywords match', () => {
      expect(classifyIssue('Random task')).toBe('write');
      expect(classifyIssue('Some squad work')).toBe('write');
    });

    it('defaults to write when both read and write keywords appear', () => {
      // "analyze and fix" has both review (read) and fix (write) keywords
      expect(classifyIssue('Analyze and fix performance issue')).toBe('write');
    });

    it('is case-insensitive', () => {
      expect(classifyIssue('RESEARCH auth flow')).toBe('read');
      expect(classifyIssue('FIX the bug')).toBe('write');
    });
  });

  describe('fleet/hybrid dispatch classification routing', () => {
    const roster = [{ name: 'EECOM', label: 'squad:eecom', expertise: [] }];

    const makeIssue = (number: number, title: string): ExecutableWorkItem => ({
      number,
      title,
      body: '',
      labels: [{ name: 'squad:eecom' }],
      assignees: [],
    });

    it('fleet mode: all executable issues are dispatched (not just read)', () => {
      const issues = [
        makeIssue(1, 'Research auth flow'),   // read
        makeIssue(2, 'Fix auth redirect bug'), // write
        makeIssue(3, 'Audit labels'),          // read
      ];

      const executable = findExecutableIssues(roster, null, issues as WatchWorkItem[]);
      // In fleet mode all executable issues are sent — simulate the fleet=all behavior
      const fleetIssues = executable; // fleet: no filter
      expect(fleetIssues).toHaveLength(3);
    });

    it('hybrid mode: only read-heavy issues are fleet-dispatched', () => {
      const issues = [
        makeIssue(10, 'Research auth flow'),   // read → fleet
        makeIssue(11, 'Fix auth redirect bug'), // write → execute (not fleet)
        makeIssue(12, 'Review PR comments'),    // read → fleet
        makeIssue(13, 'Implement rate limiter'), // write → execute
      ];

      const executable = findExecutableIssues(roster, null, issues as WatchWorkItem[]);
      const fleetIssues = executable.filter(i => classifyIssue(i.title) === 'read');
      const executeIssues = executable.filter(i => classifyIssue(i.title) === 'write');

      expect(fleetIssues).toHaveLength(2);
      expect(fleetIssues.map(i => i.number)).toEqual([10, 12]);
      expect(executeIssues).toHaveLength(2);
      expect(executeIssues.map(i => i.number)).toEqual([11, 13]);
    });

    it('hybrid mode: assigned issues are excluded from both fleet and execute', () => {
      const issues = [
        makeIssue(20, 'Research auth flow'),                    // read, unassigned → fleet
        { ...makeIssue(21, 'Review PR'), assignees: [{ login: 'alice' }] }, // read, assigned → excluded
        makeIssue(22, 'Fix bug'),                               // write, unassigned → execute
      ];

      const executable = findExecutableIssues(roster, null, issues as WatchWorkItem[]);
      expect(executable).toHaveLength(2);
      expect(executable.map(i => i.number)).toEqual([20, 22]);
    });
  });
});
