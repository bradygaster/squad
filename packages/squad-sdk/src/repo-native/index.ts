/**
 * Repo-native coordinator export — public API.
 */

export * from './types.js';
export { loadExportContext } from './load-export-context.js';
export { compileCoordinatorPrompt, estimateTokens } from './compile-coordinator-prompt.js';
export { renderFrontmatter } from './render-frontmatter.js';
export { writeCoordinatorAgent } from './write-coordinator-agent.js';
export type { WriteOptions, WriteResult } from './write-coordinator-agent.js';
export { startWatchExport } from './watch-export.js';
export type { WatchExportOptions } from './watch-export.js';
export { distillDecisions, parseExportDecisions, buildDistillationPrompt } from './distill-decisions.js';
export type { DistillOptions, DistillResult, ExportDecision, DecisionCategory } from './distill-decisions.js';
export { checkViability } from './viability-check.js';
export type { ViabilityConfig, ViabilityIssue, ViabilityResult } from './viability-check.js';
