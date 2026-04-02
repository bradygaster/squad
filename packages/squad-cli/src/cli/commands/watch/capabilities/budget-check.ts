/**
 * Budget check utility — enforce configurable per-round limits.
 *
 * Ported from ralph-watch.ps1 rate-pool / budget tracking logic.
 *
 * Config (via squad.config.ts → watch.capabilities or CLI flags):
 *   maxIssuesPerRound  – max issues to execute in a single round (default: 5)
 *   maxCostPerRound    – cost cap (abstract units) per round (default: Infinity)
 *
 * This is a utility module — not a WatchCapability.
 * Called by the execute capability before spawning agent sessions.
 */

export interface BudgetConfig {
  maxIssuesPerRound?: number;
  maxCostPerRound?: number;
}

export interface BudgetResult {
  allowed: number;
  reason: string;
}

const DEFAULT_MAX_ISSUES = 5;

/**
 * Determine how many issues can be executed this round given budget constraints.
 *
 * @param requested  Number of issues the execute phase wants to process.
 * @param config     Budget limits from config or CLI.
 * @returns          How many are allowed + explanation.
 */
export function checkBudget(requested: number, config?: BudgetConfig): BudgetResult {
  const maxIssues = config?.maxIssuesPerRound ?? DEFAULT_MAX_ISSUES;
  const maxCost = config?.maxCostPerRound ?? Infinity;

  // Simple issue-count gate
  if (requested <= maxIssues && maxCost === Infinity) {
    return { allowed: requested, reason: `within budget (${requested}/${maxIssues})` };
  }

  const allowed = Math.min(requested, maxIssues);
  const reasons: string[] = [];
  if (requested > maxIssues) {
    reasons.push(`capped to ${maxIssues} issues/round`);
  }
  if (maxCost !== Infinity) {
    reasons.push(`cost cap: ${maxCost}`);
  }

  return { allowed, reason: reasons.join('; ') };
}
