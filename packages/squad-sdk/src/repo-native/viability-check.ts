/**
 * Viability gate — pre-flight assessment of whether a squad can produce
 * a valuable coordinator export within the character budget.
 *
 * v008: Quality-first philosophy. We'd rather refuse with honest advice
 * than produce a compressed artifact that lacks enough context to be useful.
 * Use --force to override if you know what you're doing.
 */

import type { SquadExportContext } from './types.js';

export interface ViabilityConfig {
  /** Hard character limit for CCA agent file. Default: 30000 */
  charLimit: number;
  /** Safety margin subtracted from charLimit to get the target. Default: 1000 */
  safetyMargin: number;
  /** Force export even when viability check fails. Default: false */
  force: boolean;
}

export interface ViabilityIssue {
  severity: 'warn' | 'error';
  code: string;
  message: string;
  detail?: string;
}

export interface ViabilityResult {
  viable: boolean;
  issues: ViabilityIssue[];
  /** Human-readable summary for CLI output */
  summary: string;
  /** Estimated content complexity score (higher = harder to fit) */
  complexityScore: number;
}

const DEFAULT_CONFIG: ViabilityConfig = {
  charLimit: 30_000,
  safetyMargin: 1_000,
  force: false,
};

/**
 * Thresholds that scale with the configured character limit.
 * At 30K chars, agent count >25 is a warning, >50 is an error.
 * These scale linearly if the limit changes.
 */
function getThresholds(charLimit: number) {
  const scale = charLimit / 30_000;
  return {
    agentWarn: Math.floor(25 * scale),
    agentError: Math.floor(50 * scale),
    routingRulesWarn: Math.floor(60 * scale),
    routingRulesError: Math.floor(100 * scale),
    coverageWarn: 0.50,
    coverageError: 0.25,
  };
}

/**
 * Estimate how many characters the roster alone would consume.
 */
function estimateRosterChars(context: SquadExportContext): number {
  return context.team.members.reduce((sum, m) => {
    const line = `- **${m.displayName}** (\`${m.slug}\`) — ${m.role}. ${m.charterSummary}`;
    return sum + line.length + 1;
  }, 0);
}

/**
 * Estimate how many characters the dispatch rules would consume.
 */
function estimateDispatchChars(context: SquadExportContext): number {
  return context.routing.rules.reduce((sum, r) => {
    const line = `- If the request is mainly about ${r.workType.toLowerCase()}, route to \`${r.routeTo}\`.`;
    return sum + line.length + 1;
  }, 0);
}

/**
 * Calculate coverage: what fraction of the budget would be
 * consumed by structural content alone (roster + dispatch),
 * leaving the remainder for mission, ceremonies, decisions, etc.
 */
function calculateCoverage(context: SquadExportContext, charTarget: number): number {
  const structural = estimateRosterChars(context) + estimateDispatchChars(context);
  const remaining = charTarget - structural;
  return remaining / charTarget;
}

/**
 * Run the viability pre-flight check.
 *
 * Returns a ViabilityResult. If viable=false and force=false, the export
 * should be refused with the summary message as guidance.
 */
export function checkViability(
  context: SquadExportContext,
  config: Partial<ViabilityConfig> = {},
): ViabilityResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const charTarget = cfg.charLimit - cfg.safetyMargin;
  const thresholds = getThresholds(cfg.charLimit);
  const issues: ViabilityIssue[] = [];

  const memberCount = context.team.members.length;
  const ruleCount = context.routing.rules.length;
  const coverage = calculateCoverage(context, charTarget);

  // Agent count checks
  if (memberCount > thresholds.agentError) {
    issues.push({
      severity: 'error',
      code: 'AGENTS_TOO_MANY',
      message: `This squad has ${memberCount} specialists — even in compact mode, the roster alone may consume most of the ${cfg.charLimit}-char budget.`,
      detail: `Threshold: >${thresholds.agentError} agents triggers this check. Consider splitting into sub-squads or using lazy-load mode.`,
    });
  } else if (memberCount > thresholds.agentWarn) {
    issues.push({
      severity: 'warn',
      code: 'AGENTS_LARGE',
      message: `${memberCount} specialists is a large team. The export will likely require compact or lazy-load mode.`,
    });
  }

  // Routing rules checks
  if (ruleCount > thresholds.routingRulesError) {
    issues.push({
      severity: 'error',
      code: 'RULES_TOO_MANY',
      message: `${ruleCount} routing rules is very dense. Even distilled, this many rules may produce a dispatch section that dominates the budget.`,
      detail: `Threshold: >${thresholds.routingRulesError} rules triggers this check. Consider grouping related rules or using broader categories.`,
    });
  } else if (ruleCount > thresholds.routingRulesWarn) {
    issues.push({
      severity: 'warn',
      code: 'RULES_DENSE',
      message: `${ruleCount} routing rules will require significant distillation to fit.`,
    });
  }

  // Coverage checks
  if (coverage < thresholds.coverageError) {
    issues.push({
      severity: 'error',
      code: 'COVERAGE_INSUFFICIENT',
      message: `Structural content (roster + dispatch) would consume ${Math.round((1 - coverage) * 100)}% of the budget, leaving too little room for mission context, decisions, and ceremony triggers.`,
      detail: `The exported coordinator needs at least 25% of the budget for contextual sections to be useful.`,
    });
  } else if (coverage < thresholds.coverageWarn) {
    issues.push({
      severity: 'warn',
      code: 'COVERAGE_TIGHT',
      message: `Structural content may consume ${Math.round((1 - coverage) * 100)}% of the budget. Decisions and ceremonies will be heavily trimmed.`,
    });
  }

  // Compute complexity score (0-100, higher = harder)
  const complexityScore = Math.min(100, Math.round(
    (memberCount / thresholds.agentError) * 40 +
    (ruleCount / thresholds.routingRulesError) * 30 +
    ((1 - coverage) / (1 - thresholds.coverageError)) * 30
  ));

  const hasErrors = issues.some(i => i.severity === 'error');
  const viable = !hasErrors || cfg.force;

  const summary = hasErrors
    ? buildRefusalMessage(issues, cfg)
    : issues.length > 0
      ? buildWarningMessage(issues)
      : 'Squad viability check passed — export should produce a useful coordinator.';

  return { viable, issues, summary, complexityScore };
}

function buildRefusalMessage(issues: ViabilityIssue[], config: ViabilityConfig): string {
  const errors = issues.filter(i => i.severity === 'error');
  const lines: string[] = [
    `We're pretty sure this squad is too complex to produce a valuable export within the ${config.charLimit}-char limit.`,
    '',
  ];

  for (const err of errors) {
    lines.push(`• ${err.message}`);
    if (err.detail) lines.push(`  ${err.detail}`);
  }

  lines.push('');
  lines.push(`Use --force if you want to attempt it anyway — we'll do our best, but the output may lack enough context to be useful for an AI agent.`);

  return lines.join('\n');
}

function buildWarningMessage(issues: ViabilityIssue[]): string {
  const lines = ['Viability check passed with notes:'];
  for (const issue of issues) {
    lines.push(`  ⚠ ${issue.message}`);
  }
  return lines.join('\n');
}
