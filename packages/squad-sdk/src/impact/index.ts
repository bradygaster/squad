/**
 * Impact analysis engine — Public API.
 *
 * Analyzes PR or branch diffs to determine architectural impact:
 * blast radius, module boundaries, ownership mapping, and risk scoring.
 */

import { parseDiff, type DiffFile, type DiffResult } from './diff-parser.js';
import { parseRoutingTable, parseWorkspaces, mapModules, type ModuleMapping, type RoutingEntry } from './module-mapper.js';
import { buildMetrics, scoreRisk, RiskTier, type RiskScore, type RiskMetrics } from './risk-scorer.js';
import { formatTerminal, formatJson, formatMarkdown } from './report-formatter.js';

export type OutputFormat = 'terminal' | 'json' | 'markdown';

export interface ImpactOptions {
  /** Raw `git diff --name-status` output */
  nameStatusOutput: string;
  /** Content of .squad/routing.md (optional — falls back to heuristics) */
  routingContent?: string;
  /** Content of root package.json (optional — for workspace detection) */
  packageJsonContent?: string;
  /** Source label for the report (e.g., "PR #42" or "branch feature/x") */
  source: string;
  /**
   * Output format hint — not used by analyzeImpact() itself.
   * Formatting is handled separately via formatReport().
   * Accepted here for caller convenience when passing options through.
   */
  format?: OutputFormat;
}

export interface ImpactReport {
  source: string;
  diff: DiffResult;
  modules: ModuleMapping[];
  risk: RiskScore;
}

/**
 * Analyze the impact of a diff.
 *
 * Orchestrates: parse diff → map modules → detect boundaries → score risk.
 */
export function analyzeImpact(options: ImpactOptions): ImpactReport {
  const { nameStatusOutput, routingContent, packageJsonContent, source } = options;

  // 1. Parse diff
  const diff = parseDiff(nameStatusOutput);

  // 2. Parse routing entries
  const routingEntries: RoutingEntry[] = routingContent
    ? parseRoutingTable(routingContent)
    : [];

  // 3. Parse workspaces
  const workspaces: string[] = packageJsonContent
    ? parseWorkspaces(packageJsonContent)
    : [];

  // 4. Map modules
  const modules = mapModules(diff.files, routingEntries, workspaces);

  // 5. Score risk
  const metrics = buildMetrics(diff.files, modules);
  const risk = scoreRisk(metrics);

  return { source, diff, modules, risk };
}

/**
 * Format an impact report in the requested format.
 */
export function formatReport(report: ImpactReport, format: OutputFormat = 'terminal'): string {
  switch (format) {
    case 'json':
      return formatJson(report);
    case 'markdown':
      return formatMarkdown(report);
    case 'terminal':
    default:
      return formatTerminal(report);
  }
}

// Re-export types for consumers
export { parseDiff, type DiffFile, type DiffResult } from './diff-parser.js';
export { parseRoutingTable, parseWorkspaces, mapModules, type ModuleMapping, type RoutingEntry } from './module-mapper.js';
export { buildMetrics, scoreRisk, RiskTier, type RiskScore, type RiskMetrics } from './risk-scorer.js';
export { formatTerminal, formatJson, formatMarkdown } from './report-formatter.js';
