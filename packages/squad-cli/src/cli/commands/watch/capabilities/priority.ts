/**
 * Issue priority scoring — weigh issues for execution order.
 *
 * Ported from ralph-watch.ps1 issue scoring logic.
 * Factors:
 *   - Priority labels: P0 (100), P1 (60), P2 (30), P3 (10)
 *   - Age bonus: +1 per day open (max +30)
 *   - Staleness: +20 if no activity in 7+ days
 *   - Bug label: +15
 *   - Size labels: size:S +10, size:M 0, size:L -5
 *
 * This is a utility module — not a WatchCapability.
 * Used by the execute capability to sort issues before picking work.
 */

export interface ScoredIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  score: number;
  breakdown: Record<string, number>;
}

export interface PriorityConfig {
  /** Weight multipliers — override defaults. */
  weights?: Partial<PriorityWeights>;
}

export interface PriorityWeights {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  agePerDay: number;
  ageMax: number;
  staleThresholdDays: number;
  staleBonus: number;
  bugBonus: number;
  sizeSBonus: number;
  sizeLPenalty: number;
}

const DEFAULT_WEIGHTS: PriorityWeights = {
  p0: 100,
  p1: 60,
  p2: 30,
  p3: 10,
  agePerDay: 1,
  ageMax: 30,
  staleThresholdDays: 7,
  staleBonus: 20,
  bugBonus: 15,
  sizeSBonus: 10,
  sizeLPenalty: -5,
};

export interface IssueLike {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/**
 * Score a single issue for execution priority.
 * Higher score = should be picked first.
 */
export function scoreIssue(issue: IssueLike, config?: PriorityConfig): ScoredIssue {
  const w: PriorityWeights = { ...DEFAULT_WEIGHTS, ...(config?.weights ?? {}) };
  const breakdown: Record<string, number> = {};
  let score = 0;

  const labels = new Set(issue.labels.map(l => l.name.toLowerCase()));

  // Priority label scoring
  if (labels.has('p0') || labels.has('priority:p0') || labels.has('priority:critical')) {
    breakdown['priority'] = w.p0;
  } else if (labels.has('p1') || labels.has('priority:p1') || labels.has('priority:high')) {
    breakdown['priority'] = w.p1;
  } else if (labels.has('p2') || labels.has('priority:p2') || labels.has('priority:medium')) {
    breakdown['priority'] = w.p2;
  } else if (labels.has('p3') || labels.has('priority:p3') || labels.has('priority:low')) {
    breakdown['priority'] = w.p3;
  } else {
    breakdown['priority'] = w.p2; // Default to P2 if unlabeled
  }
  score += breakdown['priority']!;

  // Age bonus
  if (issue.createdAt) {
    const created = new Date(issue.createdAt);
    const ageDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
    const ageScore = Math.min(ageDays * w.agePerDay, w.ageMax);
    breakdown['age'] = ageScore;
    score += ageScore;
  }

  // Staleness bonus
  if (issue.updatedAt) {
    const updated = new Date(issue.updatedAt);
    const staleDays = Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24));
    if (staleDays >= w.staleThresholdDays) {
      breakdown['stale'] = w.staleBonus;
      score += w.staleBonus;
    }
  }

  // Bug label bonus
  if (labels.has('bug') || labels.has('type:bug')) {
    breakdown['bug'] = w.bugBonus;
    score += w.bugBonus;
  }

  // Size label adjustment
  if (labels.has('size:s') || labels.has('size:small')) {
    breakdown['size'] = w.sizeSBonus;
    score += w.sizeSBonus;
  } else if (labels.has('size:l') || labels.has('size:large') || labels.has('size:xl')) {
    breakdown['size'] = w.sizeLPenalty;
    score += w.sizeLPenalty;
  }

  return {
    number: issue.number,
    title: issue.title,
    labels: issue.labels,
    score,
    breakdown,
  };
}

/**
 * Score and sort a batch of issues, highest score first.
 */
export function rankIssues(issues: IssueLike[], config?: PriorityConfig): ScoredIssue[] {
  return issues
    .map(i => scoreIssue(i, config))
    .sort((a, b) => b.score - a.score);
}
