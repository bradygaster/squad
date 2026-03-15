/**
 * Rework Rate — Unit tests for calculation logic and OTEL metrics.
 *
 * Tests the pure calculation functions in runtime/rework.ts and the
 * OTEL metric recording functions in otel-metrics.ts.
 * No gh CLI calls needed — all data is synthetic.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  calculatePrRework,
  calculateReworkSummary,
  recordReworkMetrics,
  recordReworkSummary,
  _resetMetrics,
  type PrInfo,
  type PrReview,
  type PrCommit,
  type PrReworkResult,
} from '@bradygaster/squad-sdk';

// ---------------------------------------------------------------------------
// calculatePrRework
// ---------------------------------------------------------------------------

describe('calculatePrRework', () => {
  it('returns zero rework for PR with no reviews', () => {
    const pr: PrInfo = { number: 1, title: 'test', author: { login: 'alice' }, additions: 10, deletions: 5 };
    const reviews: PrReview[] = [];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T10:00:00Z', oid: 'abc' },
      { committedDate: '2025-01-01T11:00:00Z', oid: 'def' },
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reworkRate).toBe(0);
    expect(result.reworkCommits).toBe(0);
    expect(result.totalCommits).toBe(2);
    expect(result.reviewCycles).toBe(0);
    expect(result.hadChangesRequested).toBe(false);
    expect(result.reworkTimeMs).toBeNull();
  });

  it('detects rework when commits are pushed after first review', () => {
    const pr: PrInfo = { number: 2, title: 'feat', author: { login: 'bob' }, additions: 20, deletions: 3 };
    const reviews: PrReview[] = [
      { submittedAt: '2025-01-01T12:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T15:00:00Z', state: 'APPROVED' },
    ];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T10:00:00Z', oid: 'a1' },
      { committedDate: '2025-01-01T11:00:00Z', oid: 'a2' },
      { committedDate: '2025-01-01T13:00:00Z', oid: 'a3' }, // post-review
      { committedDate: '2025-01-01T14:00:00Z', oid: 'a4' }, // post-review
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reworkRate).toBe(50); // 2 of 4 commits
    expect(result.reworkCommits).toBe(2);
    expect(result.totalCommits).toBe(4);
    expect(result.reviewCycles).toBe(1);
    expect(result.hadChangesRequested).toBe(true);
    expect(result.reworkTimeMs).toBeGreaterThan(0);
  });

  it('counts multiple review cycles', () => {
    const pr: PrInfo = { number: 3, title: 'fix', author: { login: 'carol' }, additions: 5, deletions: 1 };
    const reviews: PrReview[] = [
      { submittedAt: '2025-01-01T10:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T12:00:00Z', state: 'APPROVED' },
      { submittedAt: '2025-01-01T14:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T16:00:00Z', state: 'APPROVED' },
    ];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T09:00:00Z', oid: 'c1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reviewCycles).toBe(2);
    expect(result.hadChangesRequested).toBe(true);
  });

  it('handles PR approved without changes requested', () => {
    const pr: PrInfo = { number: 4, title: 'docs', author: { login: 'dave' }, additions: 2, deletions: 0 };
    const reviews: PrReview[] = [
      { submittedAt: '2025-01-01T10:00:00Z', state: 'APPROVED' },
    ];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T09:00:00Z', oid: 'd1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reworkRate).toBe(0);
    expect(result.reviewCycles).toBe(0);
    expect(result.hadChangesRequested).toBe(false);
    expect(result.reworkTimeMs).toBeNull();
  });

  it('handles commits with nested commit object', () => {
    const pr: PrInfo = { number: 5, title: 'test nested', author: { login: 'eve' }, additions: 1, deletions: 1 };
    const reviews: PrReview[] = [
      { submittedAt: '2025-01-01T12:00:00Z', state: 'COMMENTED' },
    ];
    const commits: PrCommit[] = [
      { commit: { committedDate: '2025-01-01T10:00:00Z' }, oid: 'e1' },
      { commit: { committedDate: '2025-01-01T14:00:00Z' }, oid: 'e2' }, // post-review
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reworkCommits).toBe(1);
    expect(result.totalCommits).toBe(2);
    expect(result.reworkRate).toBe(50);
  });

  it('handles empty commits', () => {
    const pr: PrInfo = { number: 6, title: 'empty', author: { login: 'frank' }, additions: 0, deletions: 0 };

    const result = calculatePrRework(pr, [], []);

    expect(result.reworkRate).toBe(0);
    expect(result.totalCommits).toBe(0);
    expect(result.reworkCommits).toBe(0);
  });

  it('handles missing author', () => {
    const pr: PrInfo = { number: 7, title: 'no author' };

    const result = calculatePrRework(pr, [], []);

    expect(result.author).toBe('unknown');
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('filters reviews without submittedAt', () => {
    const pr: PrInfo = { number: 8, title: 'partial reviews', author: { login: 'gina' } };
    const reviews: PrReview[] = [
      { state: 'APPROVED' }, // no submittedAt — should be ignored
      { submittedAt: '2025-01-01T12:00:00Z', state: 'APPROVED' },
    ];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T10:00:00Z', oid: 'g1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.totalReviews).toBe(1);
    expect(result.reworkRate).toBe(0);
  });

  it('correctly computes rework time in ms', () => {
    const pr: PrInfo = { number: 9, title: 'rework time', author: { login: 'hank' } };
    const reviews: PrReview[] = [
      { submittedAt: '2025-01-01T10:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T13:00:00Z', state: 'APPROVED' }, // 3 hours later
    ];
    const commits: PrCommit[] = [
      { committedDate: '2025-01-01T09:00:00Z', oid: 'h1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);

    expect(result.reworkTimeMs).toBe(3 * 3_600_000); // 3 hours
  });
});

// ---------------------------------------------------------------------------
// calculateReworkSummary
// ---------------------------------------------------------------------------

describe('calculateReworkSummary', () => {
  it('returns empty summary for no results', () => {
    const summary = calculateReworkSummary([]);

    expect(summary.totalPrs).toBe(0);
  });

  it('calculates correct aggregate metrics', () => {
    const results: PrReworkResult[] = [
      {
        number: 1, title: 'a', author: 'alice', mergedAt: undefined,
        reworkRate: 0, reviewCycles: 0, hadChangesRequested: false,
        reworkCommits: 0, totalCommits: 3, reworkTimeMs: null,
        totalReviews: 1, additions: 10, deletions: 5,
      },
      {
        number: 2, title: 'b', author: 'bob', mergedAt: undefined,
        reworkRate: 50, reviewCycles: 1, hadChangesRequested: true,
        reworkCommits: 2, totalCommits: 4, reworkTimeMs: 7_200_000,
        totalReviews: 2, additions: 20, deletions: 3,
      },
      {
        number: 3, title: 'c', author: 'carol', mergedAt: undefined,
        reworkRate: 25, reviewCycles: 1, hadChangesRequested: true,
        reworkCommits: 1, totalCommits: 4, reworkTimeMs: 3_600_000,
        totalReviews: 2, additions: 5, deletions: 1,
      },
    ];

    const summary = calculateReworkSummary(results);

    expect(summary.totalPrs).toBe(3);
    expect(summary.avgReworkRate).toBe(25); // (0+50+25)/3 = 25
    expect(summary.prsWithRework).toBe(2);
    expect(summary.prsWithChangesRequested).toBe(2);
    expect(summary.avgReviewCycles).toBe(+(2 / 3).toFixed(1));
    expect(summary.totalReworkCommits).toBe(3);
    expect(summary.totalCommits).toBe(11);
    expect(summary.rejectionRate).toBe(67); // 2/3 * 100 rounded
    expect(summary.avgReworkTimeHours).toBe(1.5); // (7200000+3600000)/2/3600000
  });

  it('handles all clean PRs', () => {
    const results: PrReworkResult[] = [
      {
        number: 1, title: 'a', author: 'alice', mergedAt: undefined,
        reworkRate: 0, reviewCycles: 0, hadChangesRequested: false,
        reworkCommits: 0, totalCommits: 2, reworkTimeMs: null,
        totalReviews: 1, additions: 10, deletions: 0,
      },
      {
        number: 2, title: 'b', author: 'bob', mergedAt: undefined,
        reworkRate: 0, reviewCycles: 0, hadChangesRequested: false,
        reworkCommits: 0, totalCommits: 1, reworkTimeMs: null,
        totalReviews: 1, additions: 5, deletions: 2,
      },
    ];

    const summary = calculateReworkSummary(results);

    expect(summary.avgReworkRate).toBe(0);
    expect(summary.prsWithRework).toBe(0);
    expect(summary.rejectionRate).toBe(0);
    expect(summary.avgReworkTimeHours).toBeNull();
  });

  it('handles single PR with high rework', () => {
    const results: PrReworkResult[] = [
      {
        number: 10, title: 'big refactor', author: 'dan', mergedAt: undefined,
        reworkRate: 75, reviewCycles: 3, hadChangesRequested: true,
        reworkCommits: 6, totalCommits: 8, reworkTimeMs: 86_400_000,
        totalReviews: 6, additions: 100, deletions: 50,
      },
    ];

    const summary = calculateReworkSummary(results);

    expect(summary.totalPrs).toBe(1);
    expect(summary.avgReworkRate).toBe(75);
    expect(summary.prsWithRework).toBe(1);
    expect(summary.rejectionRate).toBe(100);
    expect(summary.avgReworkTimeHours).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// OTEL Rework Metrics — recordReworkMetrics / recordReworkSummary
// ---------------------------------------------------------------------------

interface SpyInstrument {
  add: Mock;
  record: Mock;
}

interface SpyMeter {
  createCounter: Mock;
  createHistogram: Mock;
  createUpDownCounter: Mock;
  createGauge: Mock;
  _instruments: Map<string, SpyInstrument>;
}

function createSpyMeter(): SpyMeter {
  const instruments = new Map<string, SpyInstrument>();

  function makeInstrument(name: string): SpyInstrument {
    const inst: SpyInstrument = { add: vi.fn(), record: vi.fn() };
    instruments.set(name, inst);
    return inst;
  }

  return {
    createCounter: vi.fn((name: string) => makeInstrument(name)),
    createHistogram: vi.fn((name: string) => makeInstrument(name)),
    createUpDownCounter: vi.fn((name: string) => makeInstrument(name)),
    createGauge: vi.fn((name: string) => makeInstrument(name)),
    _instruments: instruments,
  };
}

let spyMeter: SpyMeter;

vi.mock('@bradygaster/squad-sdk/runtime/otel', () => ({
  getMeter: () => spyMeter,
}));

function getInstrument(name: string): SpyInstrument {
  const inst = spyMeter._instruments.get(name);
  if (!inst) throw new Error(`No instrument created for "${name}". Created: ${[...spyMeter._instruments.keys()].join(', ')}`);
  return inst;
}

describe('OTel Rework Metrics (#265)', () => {
  beforeEach(() => {
    spyMeter = createSpyMeter();
    _resetMetrics();
  });

  it('recordReworkMetrics records rate gauge and cycles histogram', () => {
    const result: PrReworkResult = {
      number: 42, title: 'feat: add widget', author: 'alice', mergedAt: undefined,
      reworkRate: 33, reviewCycles: 2, hadChangesRequested: true,
      reworkCommits: 3, totalCommits: 9, reworkTimeMs: 7_200_000,
      totalReviews: 4, additions: 50, deletions: 10,
    };

    recordReworkMetrics(result);

    const rate = getInstrument('squad.rework.rate');
    const cycles = getInstrument('squad.rework.cycles');
    const time = getInstrument('squad.rework.time_ms');

    expect(rate.record).toHaveBeenCalledWith(33, { 'pr.number': 42, 'pr.author': 'alice' });
    expect(cycles.record).toHaveBeenCalledWith(2, { 'pr.number': 42, 'pr.author': 'alice' });
    expect(time.record).toHaveBeenCalledWith(7_200_000, { 'pr.number': 42, 'pr.author': 'alice' });
  });

  it('recordReworkMetrics skips time when reworkTimeMs is null', () => {
    const result: PrReworkResult = {
      number: 1, title: 'clean', author: 'bob', mergedAt: undefined,
      reworkRate: 0, reviewCycles: 0, hadChangesRequested: false,
      reworkCommits: 0, totalCommits: 2, reworkTimeMs: null,
      totalReviews: 1, additions: 5, deletions: 0,
    };

    recordReworkMetrics(result);

    const time = getInstrument('squad.rework.time_ms');
    expect(time.record).not.toHaveBeenCalled();
  });

  it('recordReworkSummary records aggregate metrics', () => {
    const summary = {
      totalPrs: 10,
      avgReworkRate: 22,
      prsWithRework: 5,
      prsWithChangesRequested: 4,
      avgReviewCycles: 1.3,
      totalReworkCommits: 15,
      totalCommits: 40,
      avgReworkTimeHours: 2.5,
      rejectionRate: 40,
    };

    recordReworkSummary(summary);

    const rate = getInstrument('squad.rework.rate');
    const rejection = getInstrument('squad.rework.rejection_rate');
    const cycles = getInstrument('squad.rework.cycles');
    const time = getInstrument('squad.rework.time_ms');

    expect(rate.record).toHaveBeenCalledWith(22, { scope: 'summary' });
    expect(rejection.record).toHaveBeenCalledWith(40, { scope: 'summary' });
    expect(cycles.record).toHaveBeenCalledWith(1.3, { scope: 'summary' });
    expect(time.record).toHaveBeenCalledWith(2.5 * 3_600_000, { scope: 'summary' });
  });

  it('recordReworkSummary handles empty summary gracefully', () => {
    const summary = { totalPrs: 0 };

    // Should not throw even with undefined optional fields
    expect(() => recordReworkSummary(summary)).not.toThrow();
  });

  it('creates rework instruments with correct metric names', () => {
    recordReworkMetrics({
      number: 1, title: 'x', author: 'a', mergedAt: undefined,
      reworkRate: 0, reviewCycles: 0, hadChangesRequested: false,
      reworkCommits: 0, totalCommits: 1, reworkTimeMs: null,
      totalReviews: 1, additions: 0, deletions: 0,
    });

    expect(spyMeter.createGauge).toHaveBeenCalledWith('squad.rework.rate', expect.objectContaining({ unit: '%' }));
    expect(spyMeter.createHistogram).toHaveBeenCalledWith('squad.rework.cycles', expect.any(Object));
    expect(spyMeter.createGauge).toHaveBeenCalledWith('squad.rework.rejection_rate', expect.objectContaining({ unit: '%' }));
    expect(spyMeter.createHistogram).toHaveBeenCalledWith('squad.rework.time_ms', expect.objectContaining({ unit: 'ms' }));
  });

  it('_resetMetrics clears rework metric instances', () => {
    recordReworkMetrics({
      number: 1, title: 'x', author: 'a', mergedAt: undefined,
      reworkRate: 10, reviewCycles: 1, hadChangesRequested: false,
      reworkCommits: 1, totalCommits: 5, reworkTimeMs: null,
      totalReviews: 1, additions: 0, deletions: 0,
    });

    _resetMetrics();
    spyMeter = createSpyMeter();

    recordReworkMetrics({
      number: 2, title: 'y', author: 'b', mergedAt: undefined,
      reworkRate: 20, reviewCycles: 0, hadChangesRequested: false,
      reworkCommits: 0, totalCommits: 3, reworkTimeMs: null,
      totalReviews: 1, additions: 0, deletions: 0,
    });

    const rate = getInstrument('squad.rework.rate');
    expect(rate.record).toHaveBeenCalledTimes(1);
    expect(rate.record).toHaveBeenCalledWith(20, { 'pr.number': 2, 'pr.author': 'b' });
  });
});
