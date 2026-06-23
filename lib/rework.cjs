/**
 * Rework Rate — Calculation helpers.
 *
 * Pure functions for computing PR rework metrics.
 * No I/O, no side effects — safe to require() in tests.
 */

/**
 * Calculate rework metrics for a single PR.
 * Rework = commits pushed after the first review.
 */
function calculatePrRework(pr, reviews, commits) {
  // Sort reviews by timestamp
  const sortedReviews = reviews
    .filter(r => r.submittedAt)
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  // Sort commits by timestamp
  const sortedCommits = commits
    .filter(c => c.committedDate || (c.commit && c.commit.committedDate))
    .sort((a, b) => {
      const dateA = a.committedDate || (a.commit && a.commit.committedDate);
      const dateB = b.committedDate || (b.commit && b.commit.committedDate);
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

  const firstReview = sortedReviews[0];
  const firstReviewTime = firstReview ? new Date(firstReview.submittedAt).getTime() : null;

  // Count review cycles: changes-requested → approved transitions
  let reviewCycles = 0;
  let hadChangesRequested = false;
  let firstChangesRequested = null;
  let lastApproval = null;
  let pendingChangeRequest = false;

  for (const review of sortedReviews) {
    const state = (review.state || '').toUpperCase();
    if (state === 'CHANGES_REQUESTED') {
      hadChangesRequested = true;
      pendingChangeRequest = true;
      if (!firstChangesRequested) firstChangesRequested = review.submittedAt;
    } else if (state === 'APPROVED' && pendingChangeRequest) {
      reviewCycles++;
      pendingChangeRequest = false;
      lastApproval = review.submittedAt;
    } else if (state === 'APPROVED') {
      lastApproval = review.submittedAt;
    }
  }

  // Count post-review commits
  const postReviewCommits = firstReviewTime
    ? sortedCommits.filter(c => {
        const d = c.committedDate || (c.commit && c.commit.committedDate);
        return new Date(d).getTime() > firstReviewTime;
      })
    : [];

  const totalCommits = sortedCommits.length;
  const reworkCommits = postReviewCommits.length;
  const reworkRate = totalCommits > 0 ? reworkCommits / totalCommits : 0;

  // Rework time (ms)
  const reworkTimeMs = (firstChangesRequested && lastApproval)
    ? new Date(lastApproval).getTime() - new Date(firstChangesRequested).getTime()
    : null;

  return {
    number: pr.number,
    title: pr.title,
    author: pr.author ? pr.author.login : 'unknown',
    mergedAt: pr.mergedAt,
    totalCommits,
    reworkCommits,
    reworkRate: Math.round(reworkRate * 100),
    reviewCycles,
    hadChangesRequested,
    reworkTimeMs,
    totalReviews: sortedReviews.length,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
  };
}

/**
 * Calculate aggregate rework summary across all analyzed PRs.
 */
function calculateReworkSummary(results) {
  if (results.length === 0) return { totalPrs: 0 };

  const totalPrs = results.length;
  const avgReworkRate = Math.round(results.reduce((s, r) => s + r.reworkRate, 0) / totalPrs);
  const prsWithRework = results.filter(r => r.reworkRate > 0).length;
  const prsWithChangesRequested = results.filter(r => r.hadChangesRequested).length;
  const avgReviewCycles = +(results.reduce((s, r) => s + r.reviewCycles, 0) / totalPrs).toFixed(1);
  const totalReworkCommits = results.reduce((s, r) => s + r.reworkCommits, 0);
  const totalCommits = results.reduce((s, r) => s + r.totalCommits, 0);

  // Average rework time (only for PRs that had rework time)
  const reworkTimes = results.filter(r => r.reworkTimeMs !== null).map(r => r.reworkTimeMs);
  const avgReworkTimeHours = reworkTimes.length > 0
    ? +(reworkTimes.reduce((s, t) => s + t, 0) / reworkTimes.length / 3600000).toFixed(1)
    : null;

  return {
    totalPrs,
    avgReworkRate,
    prsWithRework,
    prsWithChangesRequested,
    avgReviewCycles,
    totalReworkCommits,
    totalCommits,
    avgReworkTimeHours,
    rejectionRate: Math.round((prsWithChangesRequested / totalPrs) * 100),
  };
}

module.exports = { calculatePrRework, calculateReworkSummary };
