/**
 * Watch Capabilities Tests — PR #709 coverage
 *
 * Tests the WatchCapability plugin classes: execute, cleanup,
 * decision-hygiene, self-pull, and board. Mocks external dependencies
 * (child_process, filesystem, SDK storage) to test pure logic.
 *
 * Prioritized by risk: execute > cleanup > decision-hygiene > self-pull > board.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';

// ── Shared mock state (hoisted alongside vi.mock) ───────────────────

const {
  mockStorage,
  mockExecFile,
  mockExecFileSync,
  mockFsExistsSync,
  mockRmSync,
} = vi.hoisted(() => ({
  mockStorage: {
    existsSync: vi.fn(() => true),
    listSync: vi.fn((): string[] => []),
  },
  mockExecFile: vi.fn((...args: unknown[]) => {
    const cb = args.find(a => typeof a === 'function') as
      | ((...cbArgs: unknown[]) => void)
      | undefined;
    if (cb) cb(null, '', '');
    return {};
  }),
  mockExecFileSync: vi.fn((): string => ''),
  mockFsExistsSync: vi.fn((): boolean => false),
  mockRmSync: vi.fn(),
}));

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@bradygaster/squad-sdk', () => ({
  FSStorageProvider: vi.fn(() => mockStorage),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
  existsSync: mockFsExistsSync,
  rmSync: mockRmSync,
}));

// ── Imports (resolved against mocks) ────────────────────────────────

import {
  ExecuteCapability,
  buildAgentPrompt,
  findExecutableIssues,
} from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';
import type { ExecutableWorkItem } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';
import { CleanupCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/cleanup.js';
import { DecisionHygieneCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/decision-hygiene.js';
import { BoardCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/board.js';
import { SelfPullCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/self-pull.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: '/fake/team',
    adapter: {
      type: 'github',
      listWorkItems: vi.fn().mockResolvedValue([]),
      getWorkItem: vi.fn(),
    } as unknown as WatchContext['adapter'],
    round: 1,
    roster: [{ name: 'EECOM', label: 'squad:eecom', expertise: [] }],
    config: {},
    ...overrides,
  };
}

function mockAdapter(items: Array<Record<string, unknown>>): WatchContext['adapter'] {
  return {
    type: 'github',
    listWorkItems: vi.fn().mockResolvedValue(items),
    getWorkItem: vi.fn(async (id: number) => items.find(i => i['id'] === id)),
  } as unknown as WatchContext['adapter'];
}

type CallbackFn = (...cbArgs: unknown[]) => void;

function findCallback(args: unknown[]): CallbackFn | undefined {
  return args.find(a => typeof a === 'function') as CallbackFn | undefined;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Watch Capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.existsSync.mockReturnValue(true);
    mockStorage.listSync.mockReturnValue([]);
    mockFsExistsSync.mockReturnValue(false);
    mockRmSync.mockReturnValue(undefined);
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = findCallback(args);
      if (cb) cb(null, '', '');
      return {};
    });
    mockExecFileSync.mockReturnValue('');
  });

  // ────────────────────────────────────────────────────────────────
  // Metadata — verify every capability declares correct identity
  // ────────────────────────────────────────────────────────────────

  describe('Capability metadata', () => {
    it('ExecuteCapability', () => {
      const cap = new ExecuteCapability();
      expect(cap.name).toBe('execute');
      expect(cap.phase).toBe('post-execute');
      expect(cap.requires).toContain('platform auth');
      expect(cap.configShape).toBe('boolean');
      expect(cap.description).toBeTruthy();
    });

    it('BoardCapability', () => {
      const cap = new BoardCapability();
      expect(cap.name).toBe('board');
      expect(cap.phase).toBe('post-execute');
      expect(cap.requires).toContain('gh');
      expect(cap.configShape).toBe('object');
    });

    it('CleanupCapability', () => {
      const cap = new CleanupCapability();
      expect(cap.name).toBe('cleanup');
      expect(cap.phase).toBe('housekeeping');
      expect(cap.requires).toEqual([]);
      expect(cap.configShape).toBe('object');
    });

    it('DecisionHygieneCapability', () => {
      const cap = new DecisionHygieneCapability();
      expect(cap.name).toBe('decision-hygiene');
      expect(cap.phase).toBe('housekeeping');
      expect(cap.requires).toContain('gh');
      expect(cap.configShape).toBe('boolean');
    });

    it('SelfPullCapability', () => {
      const cap = new SelfPullCapability();
      expect(cap.name).toBe('self-pull');
      expect(cap.phase).toBe('pre-scan');
      expect(cap.requires).toContain('git');
      expect(cap.configShape).toBe('boolean');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // ExecuteCapability — highest risk, spawns external processes
  // ────────────────────────────────────────────────────────────────

  describe('ExecuteCapability', () => {
    describe('buildAgentPrompt', () => {
      it('includes issue numbers and titles', () => {
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'Fix bug', labels: [{ name: 'squad:eecom' }], assignees: [] },
          { number: 2, title: 'Add tests', labels: [{ name: 'squad' }], assignees: [] },
        ];
        const prompt = buildAgentPrompt(issues, '/fake/team');
        expect(prompt).toContain('#1');
        expect(prompt).toContain('#2');
        expect(prompt).toContain('Fix bug');
        expect(prompt).toContain('Add tests');
      });

      it('uses ralph-instructions.md prompt when file exists', () => {
        mockFsExistsSync.mockReturnValue(true);
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'Task', labels: [{ name: 'squad' }], assignees: [] },
        ];
        const prompt = buildAgentPrompt(issues, '/fake/team');
        expect(prompt).toContain('ralph-instructions.md');
        expect(prompt).toContain('Ralph, Go!');
      });

      it('uses fallback prompt when ralph-instructions.md is missing', () => {
        mockFsExistsSync.mockReturnValue(false);
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'Task', labels: [{ name: 'squad' }], assignees: [] },
        ];
        const prompt = buildAgentPrompt(issues, '/fake/team');
        expect(prompt).toContain('autonomous work monitor');
        expect(prompt).not.toContain('Ralph, Go!');
      });

      it('formats labels and assignees in issue list', () => {
        const issues: ExecutableWorkItem[] = [{
          number: 42,
          title: 'Fix auth',
          labels: [{ name: 'squad:eecom' }, { name: 'P1' }],
          assignees: [{ login: 'alice' }],
        }];
        const prompt = buildAgentPrompt(issues, '/fake');
        expect(prompt).toContain('squad:eecom, P1');
        expect(prompt).toContain('alice');
      });
    });

    describe('findExecutableIssues (edge cases)', () => {
      const roster = [{ name: 'EECOM', label: 'squad:eecom', expertise: [] as string[] }];

      it('accepts bare "squad" label', () => {
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'T', labels: [{ name: 'squad' }], assignees: [] },
        ];
        expect(findExecutableIssues(roster, null, issues)).toHaveLength(1);
      });

      it('accepts "squad:" prefixed labels', () => {
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'T', labels: [{ name: 'squad:gnc' }], assignees: [] },
        ];
        expect(findExecutableIssues(roster, null, issues)).toHaveLength(1);
      });

      it('rejects all blocking label variants', () => {
        for (const label of ['status:blocked', 'status:wontfix', 'status:on-hold', 'blocked']) {
          const issues: ExecutableWorkItem[] = [{
            number: 1, title: 'T',
            labels: [{ name: 'squad' }, { name: label }],
            assignees: [],
          }];
          expect(
            findExecutableIssues(roster, null, issues),
            `should reject "${label}"`,
          ).toHaveLength(0);
        }
      });

      it('returns empty when all issues are filtered out', () => {
        const issues: ExecutableWorkItem[] = [
          { number: 1, title: 'Assigned', labels: [{ name: 'squad' }], assignees: [{ login: 'bob' }] },
          { number: 2, title: 'Blocked', labels: [{ name: 'squad' }, { name: 'status:blocked' }], assignees: [] },
          { number: 3, title: 'No label', labels: [{ name: 'bug' }], assignees: [] },
        ];
        expect(findExecutableIssues(roster, null, issues)).toHaveLength(0);
      });

      it('returns empty for empty input', () => {
        expect(findExecutableIssues(roster, null, [])).toHaveLength(0);
      });
    });

    describe('preflight', () => {
      it('succeeds when gh CLI is available', async () => {
        const cap = new ExecuteCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(true);
      });

      it('fails when platform auth fails', async () => {
        const cap = new ExecuteCapability();
        const result = await cap.preflight(makeContext({
          adapter: {
            type: 'github',
            ensureAuth: vi.fn().mockRejectedValue(new Error('not authenticated')),
          } as unknown as WatchContext['adapter'],
        }));
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('platform auth');
      });
    });

    describe('execute', () => {
      it('returns success with no issues from adapter', async () => {
        const cap = new ExecuteCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('no squad-labeled issues');
      });

      it('returns success when all issues are filtered out', async () => {
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          adapter: mockAdapter([
            { id: 1, title: 'Assigned task', tags: ['squad'], assignedTo: 'human' },
          ]),
        });
        const result = await cap.execute(ctx);
        expect(result.success).toBe(true);
        expect(result.summary).toContain('no squad-labeled issues');
      });

      it('dispatches agent for eligible issues', async () => {
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          adapter: mockAdapter([
            { id: 1, title: 'Fix bug', tags: ['squad:eecom'] },
          ]),
        });
        const result = await cap.execute(ctx);
        expect(result.success).toBe(true);
        expect(result.summary).toContain('agent dispatched');
        expect(result.data?.dispatched).toBe(1);
      });

      it('handles adapter errors gracefully', async () => {
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          adapter: {
            listWorkItems: vi.fn().mockRejectedValue(new Error('network error')),
          } as unknown as WatchContext['adapter'],
        });
        const result = await cap.execute(ctx);
        expect(result.success).toBe(false);
        expect(result.summary).toContain('network error');
      });

      it('reports agent failure', async () => {
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(new Error('agent crashed'));
          return {};
        });
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          adapter: mockAdapter([{ id: 1, title: 'Fix', tags: ['squad'] }]),
        });
        const result = await cap.execute(ctx);
        expect(result.success).toBe(false);
        expect(result.summary).toContain('agent failed');
      });

      it('reports timeout when agent process is killed', async () => {
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(Object.assign(new Error('killed'), { killed: true }));
          return {};
        });
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          adapter: mockAdapter([{ id: 1, title: 'Fix', tags: ['squad'] }]),
        });
        const result = await cap.execute(ctx);
        expect(result.success).toBe(false);
        expect(result.summary).toContain('Timed out');
      });

      it('uses custom agentCmd when provided', async () => {
        const cap = new ExecuteCapability();
        const ctx = makeContext({
          agentCmd: 'my-agent --flag',
          adapter: mockAdapter([{ id: 1, title: 'Fix', tags: ['squad'] }]),
        });
        await cap.execute(ctx);
        expect(mockExecFile).toHaveBeenCalledWith(
          'my-agent',
          expect.arrayContaining(['--flag', '-p']),
          expect.any(Object),
          expect.any(Function),
        );
      });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // CleanupCapability — file selection logic, round gating
  // ────────────────────────────────────────────────────────────────

  describe('CleanupCapability', () => {
    describe('preflight', () => {
      it('succeeds when .squad directory exists', async () => {
        mockStorage.existsSync.mockReturnValue(true);
        const cap = new CleanupCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(true);
      });

      it('fails when .squad directory is missing', async () => {
        mockStorage.existsSync.mockReturnValue(false);
        const cap = new CleanupCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('.squad');
      });
    });

    describe('execute', () => {
      it('skips non-Nth rounds (default every 10)', async () => {
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 5 }));
        expect(result.success).toBe(true);
        expect(result.summary).toContain('skipped');
      });

      it('always runs on round 1', async () => {
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.success).toBe(true);
        expect(result.summary).not.toContain('skipped');
      });

      it('runs on every Nth round', async () => {
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 10 }));
        expect(result.summary).not.toContain('skipped');
      });

      it('respects custom everyNRounds config', async () => {
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 3, config: { everyNRounds: 3 } }));
        expect(result.summary).not.toContain('skipped');
      });

      it('falls back to defaults for invalid config values', async () => {
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 5, config: { everyNRounds: -1 } }));
        // Invalid value → default 10 → round 5 is skipped
        expect(result.summary).toContain('skipped');
      });

      it('deletes scratch files', async () => {
        mockStorage.listSync.mockImplementation((dir: string) => {
          if (dir.includes('.scratch')) return ['temp1.md', 'temp2.md'];
          return [];
        });
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.success).toBe(true);
        expect(result.summary).toContain('scratch');
        expect(result.summary).toContain('2');
        expect(mockRmSync).toHaveBeenCalledTimes(2);
      });

      it('prunes old log files by date prefix, keeps recent ones', async () => {
        mockStorage.listSync.mockImplementation((dir: string) => {
          if (dir.includes('orchestration-log')) {
            return ['2020-01-01-agent.md', '2099-12-31-agent.md'];
          }
          return [];
        });
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.success).toBe(true);
        expect(result.summary).toContain('orchestration-log');
        expect(result.data?.orchPruned).toBe(1); // only 2020 file
      });

      it('skips files without date prefixes during pruning', async () => {
        mockStorage.listSync.mockImplementation((dir: string) => {
          if (dir.includes('orchestration-log')) return ['no-date-file.md'];
          return [];
        });
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.summary).toContain('nothing to do');
      });

      it('warns about stale decision inbox files', async () => {
        mockStorage.listSync.mockImplementation((dir: string) => {
          if (dir.includes('inbox')) return ['2020-01-01-old-decision.md'];
          return [];
        });
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.success).toBe(true);
        expect(result.summary).toContain('stale inbox');
      });

      it('reports nothing to do when all clean', async () => {
        mockStorage.listSync.mockReturnValue([]);
        const cap = new CleanupCapability();
        const result = await cap.execute(makeContext({ round: 1 }));
        expect(result.summary).toContain('nothing to do');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DecisionHygieneCapability — inbox threshold + merge trigger
  // ────────────────────────────────────────────────────────────────

  describe('DecisionHygieneCapability', () => {
    describe('preflight', () => {
      it('succeeds when inbox directory exists', async () => {
        mockStorage.existsSync.mockReturnValue(true);
        const cap = new DecisionHygieneCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(true);
      });

      it('fails when inbox directory is missing', async () => {
        mockStorage.existsSync.mockReturnValue(false);
        const cap = new DecisionHygieneCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('inbox');
      });
    });

    describe('execute', () => {
      it('skips when inbox has ≤5 files', async () => {
        mockStorage.listSync.mockReturnValue(['a.md', 'b.md', 'c.md']);
        const cap = new DecisionHygieneCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('3 files');
        expect(result.summary).toContain('threshold');
      });

      it('triggers merge when inbox has >5 files', async () => {
        mockStorage.listSync.mockReturnValue([
          'a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md',
        ]);
        const cap = new DecisionHygieneCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('merged');
        expect(result.summary).toContain('6');
      });

      it('reports error when merge agent fails', async () => {
        mockStorage.listSync.mockReturnValue([
          'a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md',
        ]);
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(new Error('spawn failed'));
          return {};
        });
        const cap = new DecisionHygieneCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(false);
        expect(result.summary).toContain('decision hygiene');
      });

      it('reports timeout when merge agent is killed', async () => {
        mockStorage.listSync.mockReturnValue([
          'a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md',
        ]);
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(Object.assign(new Error('killed'), { killed: true }));
          return {};
        });
        const cap = new DecisionHygieneCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(false);
        expect(result.summary).toContain('Timed out');
      });

      it('handles missing inbox directory gracefully', async () => {
        mockStorage.existsSync.mockReturnValue(false);
        const cap = new DecisionHygieneCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('no decision inbox');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // SelfPullCapability — git stash/fetch/pull safety
  // ────────────────────────────────────────────────────────────────

  describe('SelfPullCapability', () => {
    describe('preflight', () => {
      it('succeeds when git is available', async () => {
        const cap = new SelfPullCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(true);
      });

      it('fails when git is not found', async () => {
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(new Error('not found'));
          return {};
        });
        const cap = new SelfPullCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('git');
      });
    });

    describe('execute', () => {
      it('succeeds with clean pull (no source changes)', async () => {
        mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
          const a = args as string[];
          if (a.includes('rev-parse')) return 'abc123\n';
          if (a.includes('--porcelain')) return '';
          return '';
        });

        const cap = new SelfPullCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toBe('git pull ok');
      });

      it('stashes dirty working tree before pulling', async () => {
        const stashCalls: string[][] = [];
        mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
          const a = args as string[];
          if (a[0] === 'stash') stashCalls.push([...a]);
          if (a.includes('rev-parse')) return 'abc123\n';
          if (a.includes('--porcelain')) return 'M file.txt\n';
          return '';
        });

        const cap = new SelfPullCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(stashCalls).toContainEqual(
          expect.arrayContaining(['stash', '--include-untracked']),
        );
        expect(stashCalls).toContainEqual(
          expect.arrayContaining(['stash', 'pop']),
        );
      });

      it('handles stash pop failure gracefully (merge conflict)', async () => {
        mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
          const a = args as string[];
          if (a[0] === 'stash' && a[1] === 'pop') throw new Error('merge conflict');
          if (a[0] === 'stash') return '';
          if (a.includes('rev-parse')) return 'abc123\n';
          if (a.includes('--porcelain')) return 'M file.txt\n';
          return '';
        });

        const consoleSpy = vi.spyOn(console, 'log');
        const cap = new SelfPullCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('stash pop failed'),
        );
        consoleSpy.mockRestore();
      });

      it('detects source changes and recommends restart', async () => {
        let revParseCount = 0;
        mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
          const a = args as string[];
          if (a.includes('rev-parse')) {
            revParseCount++;
            return revParseCount === 1 ? 'abc123\n' : 'def456\n';
          }
          if (a.includes('--porcelain')) return '';
          if (a.includes('--name-only')) return 'packages/squad-cli/src/watch.ts\n';
          return '';
        });

        const cap = new SelfPullCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('restart recommended');
      });

      it('handles fetch/pull failure gracefully', async () => {
        mockExecFileSync.mockImplementation((_cmd: unknown, args: unknown) => {
          const a = args as string[];
          if (a.includes('rev-parse')) return 'abc123\n';
          if (a.includes('--porcelain')) return '';
          return '';
        });
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(new Error('network error'));
          return {};
        });

        const cap = new SelfPullCapability();
        const result = await cap.execute(makeContext());
        expect(result.success).toBe(true);
        expect(result.summary).toContain('skipped');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // BoardCapability — metadata + preflight
  // (execute() skipped: promisify(execFile) requires custom symbol)
  // ────────────────────────────────────────────────────────────────

  describe('BoardCapability', () => {
    describe('preflight', () => {
      it('succeeds when gh project CLI is available', async () => {
        const cap = new BoardCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(true);
      });

      it('fails when gh project CLI is not available', async () => {
        mockExecFile.mockImplementation((...args: unknown[]) => {
          const cb = findCallback(args);
          if (cb) cb(new Error('not available'));
          return {};
        });
        const cap = new BoardCapability();
        const result = await cap.preflight(makeContext());
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('gh project');
      });
    });
  });
});
