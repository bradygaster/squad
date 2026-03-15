/**
 * Rework Rate — Pure calculation helpers.
 *
 * Computes PR rework metrics from review and commit data.
 * No I/O, no side effects — safe to import in tests.
 *
 * @module runtime/rework
 */

/** Minimal PR shape from `gh pr list --json ...` */
export interface PrInfo {
  number: number;
  title: string;
  author?: { login: string };
  mergedAt?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

/** Review data from `gh pr view --json reviews` */
export interface PrReview {
  submittedAt?: string;
  state?: string;
}

/** Commit data from `gh pr view --json commits` */
export interface PrCommit {
  committedDate?: string;
  commit?: { committedDate?: string };
  oid?: string;
}

/** Per-PR rework analysis result */
export interface PrReworkResult {
  number: number;
  title: string;
  author: string;
  mergedAt: string | undefined;
  totalCommits: number;
  reworkCommits: number;
  reworkRate: number;
  reviewCycles: number;
  hadChangesRequested: boolean;
  reworkTimeMs: number | null;
  totalReviews: number;
  additions: number;
  deletions: number;
}

/** Aggregate summary across analyzed PRs */
export interface ReworkSummary {
  totalPrs: number;
  avgReworkRate?: number;
  prsWithRework?: number;
  prsWithChangesRequested?: number;
  avgReviewCycles?: number;
  totalReworkCommits?: number;
  totalCommits?: number;
  avgReworkTimeHours?: number | null;
  rejectionRate?: number;
}

function getCommitDate(c: PrCommit): string | undefined {
  return c.committedDate ?? c.commit?.committedDate;
}

/**
 * Calculate rework metrics for a single PR.
 * Rework = commits pushed after the first review.
 */
export function calculatePrRework(
  pr: PrInfo,
  reviews: PrReview[],
  commits: PrCommit[],
): PrReworkResult {
  const sortedReviews = reviews
    .filter((r): r is PrReview & { submittedAt: string } => !!r.submittedAt)
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  const sortedCommits = commits
    .filter((c) => !!getCommitDate(c))
    .sort((a, b) => new Date(getCommitDate(a)!).getTime() - new Date(getCommitDate(b)!).getTime());

  const firstReview = sortedReviews[0];
  const firstReviewTime = firstReview ? new Date(firstReview.submittedAt).getTime() : null;

  // Count review cycles: changes-requested → approved transitions
  let reviewCycles = 0;
  let hadChangesRequested = false;
  let firstChangesRequested: string | null = null;
  let lastApproval: string | null = null;
  let pendingChangeRequest = false;

  for (const review of sortedReviews) {
    const state = (review.state ?? '').toUpperCase();
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

  // Count post-review commits (rework)
  const postReviewCommits = firstReviewTime
    ? sortedCommits.filter((c) => new Date(getCommitDate(c)!).getTime() > firstReviewTime)
    : [];

  const totalCommits = sortedCommits.length;
  const reworkCommits = postReviewCommits.length;
  const reworkRate = totalCommits > 0 ? reworkCommits / totalCommits : 0;

  // Rework time: first changes-requested to last approval
  const reworkTimeMs =
    firstChangesRequested && lastApproval
      ? new Date(lastApproval).getTime() - new Date(firstChangesRequested).getTime()
      : null;

  return {
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'unknown',
    mergedAt: pr.mergedAt,
    totalCommits,
    reworkCommits,
    reworkRate: Math.round(reworkRate * 100),
    reviewCycles,
    hadChangesRequested,
    reworkTimeMs,
    totalReviews: sortedReviews.length,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
  };
}

/**
 * Calculate aggregate rework summary across all analyzed PRs.
 */
export function calculateReworkSummary(results: PrReworkResult[]): ReworkSummary {
  if (results.length === 0) return { totalPrs: 0 };

  const totalPrs = results.length;
  const avgReworkRate = Math.round(
    results.reduce((s, r) => s + r.reworkRate, 0) / totalPrs,
  );
  const prsWithRework = results.filter((r) => r.reworkRate > 0).length;
  const prsWithChangesRequested = results.filter((r) => r.hadChangesRequested).length;
  const avgReviewCycles = +(
    results.reduce((s, r) => s + r.reviewCycles, 0) / totalPrs
  ).toFixed(1);
  const totalReworkCommits = results.reduce((s, r) => s + r.reworkCommits, 0);
  const totalCommits = results.reduce((s, r) => s + r.totalCommits, 0);

  // Average rework time (only for PRs that had rework time)
  const reworkTimes = results
    .filter((r): r is PrReworkResult & { reworkTimeMs: number } => r.reworkTimeMs !== null)
    .map((r) => r.reworkTimeMs);
  const avgReworkTimeHours =
    reworkTimes.length > 0
      ? +(reworkTimes.reduce((s, t) => s + t, 0) / reworkTimes.length / 3_600_000).toFixed(1)
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
