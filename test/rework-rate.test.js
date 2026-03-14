const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'index.js');

// Import rework calculation functions from the pure module (no CLI side effects)
const { calculatePrRework, calculateReworkSummary } = require(path.join(__dirname, '..', 'lib', 'rework.js'));

describe('calculatePrRework', () => {
  it('should return zero rework for PR with no reviews', () => {
    const pr = { number: 1, title: 'test', author: { login: 'alice' }, additions: 10, deletions: 5 };
    const reviews = [];
    const commits = [
      { committedDate: '2025-01-01T10:00:00Z', oid: 'abc' },
      { committedDate: '2025-01-01T11:00:00Z', oid: 'def' },
    ];

    const result = calculatePrRework(pr, reviews, commits);
    assert.equal(result.reworkRate, 0);
    assert.equal(result.reworkCommits, 0);
    assert.equal(result.totalCommits, 2);
    assert.equal(result.reviewCycles, 0);
    assert.equal(result.hadChangesRequested, false);
    assert.equal(result.reworkTimeMs, null);
  });

  it('should detect rework when commits are pushed after first review', () => {
    const pr = { number: 2, title: 'feat', author: { login: 'bob' }, additions: 20, deletions: 3 };
    const reviews = [
      { submittedAt: '2025-01-01T12:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T15:00:00Z', state: 'APPROVED' },
    ];
    const commits = [
      { committedDate: '2025-01-01T10:00:00Z', oid: 'a1' },
      { committedDate: '2025-01-01T11:00:00Z', oid: 'a2' },
      { committedDate: '2025-01-01T13:00:00Z', oid: 'a3' }, // post-review
      { committedDate: '2025-01-01T14:00:00Z', oid: 'a4' }, // post-review
    ];

    const result = calculatePrRework(pr, reviews, commits);
    assert.equal(result.reworkRate, 50); // 2 of 4 commits
    assert.equal(result.reworkCommits, 2);
    assert.equal(result.totalCommits, 4);
    assert.equal(result.reviewCycles, 1);
    assert.equal(result.hadChangesRequested, true);
    assert.ok(result.reworkTimeMs > 0);
  });

  it('should count multiple review cycles', () => {
    const pr = { number: 3, title: 'fix', author: { login: 'carol' }, additions: 5, deletions: 1 };
    const reviews = [
      { submittedAt: '2025-01-01T10:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T12:00:00Z', state: 'APPROVED' },
      { submittedAt: '2025-01-01T14:00:00Z', state: 'CHANGES_REQUESTED' },
      { submittedAt: '2025-01-01T16:00:00Z', state: 'APPROVED' },
    ];
    const commits = [
      { committedDate: '2025-01-01T09:00:00Z', oid: 'c1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);
    assert.equal(result.reviewCycles, 2);
    assert.equal(result.hadChangesRequested, true);
  });

  it('should handle PR approved without changes requested', () => {
    const pr = { number: 4, title: 'docs', author: { login: 'dave' }, additions: 2, deletions: 0 };
    const reviews = [
      { submittedAt: '2025-01-01T10:00:00Z', state: 'APPROVED' },
    ];
    const commits = [
      { committedDate: '2025-01-01T09:00:00Z', oid: 'd1' },
    ];

    const result = calculatePrRework(pr, reviews, commits);
    assert.equal(result.reworkRate, 0);
    assert.equal(result.reviewCycles, 0);
    assert.equal(result.hadChangesRequested, false);
    assert.equal(result.reworkTimeMs, null);
  });

  it('should handle commits with nested commit object', () => {
    const pr = { number: 5, title: 'test nested', author: { login: 'eve' }, additions: 1, deletions: 1 };
    const reviews = [
      { submittedAt: '2025-01-01T12:00:00Z', state: 'COMMENTED' },
    ];
    const commits = [
      { commit: { committedDate: '2025-01-01T10:00:00Z' }, oid: 'e1' },
      { commit: { committedDate: '2025-01-01T14:00:00Z' }, oid: 'e2' }, // post-review
    ];

    const result = calculatePrRework(pr, reviews, commits);
    assert.equal(result.reworkCommits, 1);
    assert.equal(result.totalCommits, 2);
    assert.equal(result.reworkRate, 50);
  });

  it('should handle empty commits', () => {
    const pr = { number: 6, title: 'empty', author: { login: 'frank' }, additions: 0, deletions: 0 };
    const result = calculatePrRework(pr, [], []);
    assert.equal(result.reworkRate, 0);
    assert.equal(result.totalCommits, 0);
    assert.equal(result.reworkCommits, 0);
  });
});

describe('calculateReworkSummary', () => {
  it('should return empty summary for no results', () => {
    const summary = calculateReworkSummary([]);
    assert.equal(summary.totalPrs, 0);
  });

  it('should calculate correct aggregate metrics', () => {
    const results = [
      { number: 1, reworkRate: 0, reviewCycles: 0, hadChangesRequested: false, reworkCommits: 0, totalCommits: 3, reworkTimeMs: null },
      { number: 2, reworkRate: 50, reviewCycles: 1, hadChangesRequested: true, reworkCommits: 2, totalCommits: 4, reworkTimeMs: 7200000 },
      { number: 3, reworkRate: 25, reviewCycles: 1, hadChangesRequested: true, reworkCommits: 1, totalCommits: 4, reworkTimeMs: 3600000 },
    ];

    const summary = calculateReworkSummary(results);
    assert.equal(summary.totalPrs, 3);
    assert.equal(summary.avgReworkRate, 25); // (0+50+25)/3 = 25
    assert.equal(summary.prsWithRework, 2);
    assert.equal(summary.prsWithChangesRequested, 2);
    assert.equal(summary.avgReviewCycles, +(2 / 3).toFixed(1));
    assert.equal(summary.totalReworkCommits, 3);
    assert.equal(summary.totalCommits, 11);
    assert.equal(summary.rejectionRate, 67); // 2/3 * 100 rounded
    assert.equal(summary.avgReworkTimeHours, 1.5); // (7200000+3600000)/2/3600000
  });

  it('should handle all clean PRs', () => {
    const results = [
      { number: 1, reworkRate: 0, reviewCycles: 0, hadChangesRequested: false, reworkCommits: 0, totalCommits: 2, reworkTimeMs: null },
      { number: 2, reworkRate: 0, reviewCycles: 0, hadChangesRequested: false, reworkCommits: 0, totalCommits: 1, reworkTimeMs: null },
    ];

    const summary = calculateReworkSummary(results);
    assert.equal(summary.avgReworkRate, 0);
    assert.equal(summary.prsWithRework, 0);
    assert.equal(summary.rejectionRate, 0);
    assert.equal(summary.avgReworkTimeHours, null);
  });
});

describe('rework CLI command', () => {
  it('should show help for rework in --help output', () => {
    try {
      const result = execFileSync(process.execPath, [CLI, '--help'], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, NO_COLOR: '1' },
      });
      assert.ok(result.includes('rework'), 'Help should mention rework command');
      assert.ok(result.includes('5th DORA'), 'Help should mention 5th DORA metric');
    } catch (err) {
      // --help exits with 0, but execFileSync may not throw
      const output = (err.stdout || '') + (err.stderr || '');
      assert.ok(output.includes('rework'), 'Help should mention rework command');
    }
  });
});
