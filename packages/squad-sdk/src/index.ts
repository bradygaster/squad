/**
 * Squad SDK — Public API barrel export.
 * This module has ZERO side effects. Safe to import as a library.
 * CLI entry point lives in src/cli-entry.ts.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
export const VERSION: string = pkg.version;

// Export public API
export { resolveSquad, resolveGlobalSquadPath, ensureSquadPath } from './resolution.js';
export * from './config/index.js';
export * from './agents/onboarding.js';
export * from './casting/index.js';
export * from './skills/index.js';
export { selectResponseTier, getTier } from './coordinator/response-tiers.js';
export type { ResponseTier, TierName, TierContext, ModelTierSuggestion } from './coordinator/response-tiers.js';
export { loadConfig, loadConfigSync } from './runtime/config.js';
export type { ConfigLoadResult, ConfigValidationError } from './runtime/config.js';
export * from './runtime/streaming.js';
export * from './runtime/cost-tracker.js';
export * from './runtime/telemetry.js';
export * from './runtime/offline.js';
export * from './runtime/i18n.js';
export * from './runtime/benchmarks.js';

export * from './marketplace/index.js';
export * from './build/index.js';
export * from './sharing/index.js';
