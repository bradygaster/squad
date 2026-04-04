/**
 * Calculate risk tier from file counts and module data.
 * Uses only Node.js built-ins.
 *
 * Issue: #733
 */

const TIER_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function maxTier(a, b) {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

/**
 * Calculate risk tier based on PR change metrics.
 * Takes the highest tier from all individual factors.
 *
 * @param {{ filesChanged: number, filesDeleted: number, modulesTouched: number, criticalFiles: string[] }} params
 * @returns {{ tier: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL', factors: string[] }}
 */
export function calculateRisk({ filesChanged, filesDeleted, modulesTouched, criticalFiles }) {
  const factors = [];
  let tier = 'LOW';

  // Files changed: ≤5=LOW, 6-20=MEDIUM, 21-50=HIGH, >50=CRITICAL
  if (filesChanged > 50) {
    tier = maxTier(tier, 'CRITICAL');
    factors.push(`${filesChanged} files changed (>50 → CRITICAL)`);
  } else if (filesChanged > 20) {
    tier = maxTier(tier, 'HIGH');
    factors.push(`${filesChanged} files changed (21-50 → HIGH)`);
  } else if (filesChanged > 5) {
    tier = maxTier(tier, 'MEDIUM');
    factors.push(`${filesChanged} files changed (6-20 → MEDIUM)`);
  } else {
    factors.push(`${filesChanged} files changed (≤5 → LOW)`);
  }

  // Modules touched: ≤1=LOW, 2-4=MEDIUM, 5-8=HIGH, >8=CRITICAL
  if (modulesTouched > 8) {
    tier = maxTier(tier, 'CRITICAL');
    factors.push(`${modulesTouched} modules touched (>8 → CRITICAL)`);
  } else if (modulesTouched >= 5) {
    tier = maxTier(tier, 'HIGH');
    factors.push(`${modulesTouched} modules touched (5-8 → HIGH)`);
  } else if (modulesTouched >= 2) {
    tier = maxTier(tier, 'MEDIUM');
    factors.push(`${modulesTouched} modules touched (2-4 → MEDIUM)`);
  } else {
    factors.push(`${modulesTouched} module(s) touched (≤1 → LOW)`);
  }

  // Files deleted: >10=CRITICAL
  if (filesDeleted > 10) {
    tier = maxTier(tier, 'CRITICAL');
    factors.push(`${filesDeleted} files deleted (>10 → CRITICAL)`);
  } else if (filesDeleted > 0) {
    factors.push(`${filesDeleted} file(s) deleted`);
  }

  // Critical files (package.json, tsconfig.json, index.ts entry points)
  if (criticalFiles.length > 0) {
    tier = maxTier(tier, 'MEDIUM');
    factors.push(`Critical files touched: ${criticalFiles.join(', ')}`);
  }

  return { tier, factors };
}
