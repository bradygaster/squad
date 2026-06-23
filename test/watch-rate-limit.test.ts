import { describe, it, expect, afterEach, vi } from 'vitest';
import { reportBoard } from '../packages/squad-cli/src/cli/commands/watch/index.js';
import type { BoardState } from '../packages/squad-cli/src/cli/commands/watch/index.js';

function emptyState(): BoardState {
  return { untriaged: 0, assigned: 0, drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, executed: 0 };
}

describe('reportBoard rate-limit / error handling (#806)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows rate-limit warning instead of "Board is clear" when scanStatus is rate-limited', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { scanStatus: 'rate-limited' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('API rate limited');
    expect(output).not.toContain('Board is clear');
  });

  it('shows error warning instead of "Board is clear" when scanStatus is error', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { scanStatus: 'error' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Board scan failed');
    expect(output).not.toContain('Board is clear');
  });

  it('shows normal "Board is clear" when scanStatus is ok', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { scanStatus: 'ok' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Board is clear');
  });

  it('shows normal "Board is clear" when scanStatus is omitted', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1);
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Board is clear');
  });

  it('rate-limit warning bypasses notifyLevel "important" suppression', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { notifyLevel: 'important', scanStatus: 'rate-limited' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('API rate limited');
  });

  it('error warning bypasses notifyLevel "important" suppression', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { notifyLevel: 'important', scanStatus: 'error' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Board scan failed');
  });

  it('rate-limit warning bypasses notifyLevel "none" suppression', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportBoard(emptyState(), 1, { notifyLevel: 'none', scanStatus: 'rate-limited' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('API rate limited');
  });

  it('shows normal board when scanStatus is rate-limited but board is busy', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const busy = { ...emptyState(), untriaged: 3 };
    reportBoard(busy, 1, { scanStatus: 'rate-limited' });
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    // When there IS data, show the normal board (partial data is still useful)
    expect(output).toContain('Round 1');
    expect(output).toContain('Untriaged');
    expect(output).not.toContain('API rate limited');
  });
});
