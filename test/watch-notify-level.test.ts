import { describe, it, expect, afterEach, vi } from 'vitest';
import { reportBoard } from '../packages/squad-cli/src/cli/commands/watch/index.js';
import type { BoardState } from '../packages/squad-cli/src/cli/commands/watch/index.js';

function emptyState(): BoardState {
  return { untriaged: 0, assigned: 0, drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, executed: 0 };
}

describe('reportBoard notifyLevel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses empty rounds in important mode (default)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 42, { notifyLevel: 'important' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints empty rounds in all mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 42, { notifyLevel: 'all' });
    expect(spy).toHaveBeenCalled();
    const allOutput = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allOutput).toContain('Board is clear');
  });

  it('suppresses everything in none mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const busy = { ...emptyState(), untriaged: 3, ciFailures: 1 };
    reportBoard(busy, 10, { notifyLevel: 'none' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints busy rounds in important mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const busy = { ...emptyState(), untriaged: 2, readyToMerge: 1 };
    reportBoard(busy, 5, { notifyLevel: 'important' });
    const allOutput = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allOutput).toContain('Round 5');
    expect(allOutput).toContain('Untriaged');
  });

  it('includes machine and repo in output when provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const busy = { ...emptyState(), assigned: 1 };
    reportBoard(busy, 3, {
      notifyLevel: 'all',
      machineName: 'CPC-tamir-WCBED',
      repoName: 'my-project',
    });
    const allOutput = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allOutput).toContain('Round 3');
    expect(allOutput).toContain('CPC-tamir-WCBED');
    expect(allOutput).toContain('my-project');
  });
});
