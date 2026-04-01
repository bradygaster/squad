import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { triageIssue, type RoutingRule, type TeamMember, type TriageIssue } from '../packages/squad-sdk/src/ralph/triage.js';
import { reportBoard, type BoardState } from '../packages/squad-cli/src/cli/commands/watch/index.js';

type BoardIssueState = Pick<BoardState, 'untriaged' | 'assigned'>;

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function captureBoardOutput(state: BoardState, round: number): string[] {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  reportBoard(state, round);
  return logSpy.mock.calls.map((args) => stripAnsi(args.map((arg) => String(arg ?? '')).join(' ')));
}

function countIssueBoardState(issues: TriageIssue[], roster: TeamMember[]): BoardIssueState {
  const memberLabels = new Set(roster.map((member) => member.label));
  const untriaged = issues.filter((issue) => issue.labels.every((label) => !memberLabels.has(label))).length;
  return {
    untriaged,
    assigned: issues.length - untriaged,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('watch board reporting', () => {
  it('prints clear-board idle message when all categories are zero', () => {
    const output = captureBoardOutput(
      {
        untriaged: 0,
        assigned: 0,
        drafts: 0,
        needsReview: 0,
        changesRequested: 0,
        ciFailures: 0,
        readyToMerge: 0,
      },
      1,
    );

    expect(output).toHaveLength(1);
    expect(output[0]).toContain('Board is clear');
  });

  it('prints only non-zero categories for mixed board state', () => {
    const output = captureBoardOutput(
      {
        untriaged: 2,
        assigned: 1,
        drafts: 0,
        needsReview: 3,
        changesRequested: 1,
        ciFailures: 0,
        readyToMerge: 4,
      },
      6,
    );

    const fullOutput = output.join('\n');
    expect(fullOutput).toContain('Untriaged:         2');
    expect(fullOutput).toContain('Assigned:          1');
    expect(fullOutput).toContain('Needs review:      3');
    expect(fullOutput).toContain('Changes requested: 1');
    expect(fullOutput).toContain('Ready to merge:    4');
    expect(fullOutput).not.toContain('Draft PRs');
    expect(fullOutput).not.toContain('CI failures');
  });

  it('shows the current round number in board output', () => {
    const output = captureBoardOutput(
      {
        untriaged: 1,
        assigned: 0,
        drafts: 0,
        needsReview: 0,
        changesRequested: 0,
        ciFailures: 0,
        readyToMerge: 0,
      },
      9,
    );

    expect(output.join('\n')).toContain('Ralph — Round 9');
  });
});

describe('board state compatibility with triage output', () => {
  it('maintains BoardState category contract used by watch command', () => {
    expectTypeOf<BoardState>().toMatchTypeOf<{
      untriaged: number;
      assigned: number;
      drafts: number;
      needsReview: number;
      changesRequested: number;
      ciFailures: number;
      readyToMerge: number;
    }>();
  });

  it('triage assignment labels move issues from untriaged to assigned', () => {
    const roster: TeamMember[] = [
      { name: 'Hockney', role: 'Tester', label: 'squad:hockney' },
      { name: 'Keaton', role: 'Lead', label: 'squad:keaton' },
    ];
    const rules: RoutingRule[] = [{ workType: 'Tests & quality', agentName: 'Hockney', keywords: ['vitest'] }];
    const issue: TriageIssue = {
      number: 77,
      title: 'Need Vitest coverage for board status',
      body: 'Please add vitest cases for watch board output.',
      labels: ['squad'],
    };

    const before = countIssueBoardState([issue], roster);
    const decision = triageIssue(issue, rules, [], roster);
    expect(decision).not.toBeNull();
    if (!decision) {
      throw new Error('Expected triage decision');
    }
    const after = countIssueBoardState([{ ...issue, labels: [...issue.labels, decision.agent.label] }], roster);

    expect(decision?.agent.label).toBe('squad:hockney');
    expect(before).toEqual({ untriaged: 1, assigned: 0 });
    expect(after).toEqual({ untriaged: 0, assigned: 1 });
  });
});

