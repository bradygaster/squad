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
export { resolveSquad, resolveGlobalSquadPath, resolvePersonalSquadDir, ensurePersonalSquadDir, ensureSquadPath, ensureSquadPathTriple, loadDirConfig, isConsultMode, scratchDir, scratchFile, deriveProjectKey, resolveExternalStateDir, resolveSquadPaths } from './resolution.js';
export { ensureCloneState, resolveCloneStateDir } from './clone-state.js';
export { normalizeRemoteUrl, getRemoteUrl } from './platform/detect.js';
export type { NormalizedRemote } from './platform/detect.js';
export type { CloneStateMetadata } from './clone-state.js';
export type { SquadDirConfig } from './resolution.js';
export type { ResolvedSquadPaths } from './resolution-base.js';
export {
  validateRepoKey,
  /** @internal Used by CLI — not part of the public SDK API surface. */
  validateWritePath,
  /** @internal Used by CLI — not part of the public SDK API surface. */
  sanitizeJournalFilenameComponent,
  loadRepoRegistry,
  saveRepoRegistry,
  createSharedSquad,
  createSharedSquadInRepo,
  addSquadRepoPointer,
  lookupByUrl,
  lookupByUrlAcrossRepos,
  lookupByKeyAcrossRepos,
  /** @internal Used by CLI — not part of the public SDK API surface. */
  loadSquadRepoPointers,
  resolveSharedSquad,
  addUrlPattern,
} from './shared-squad.js';
export type {
  RepoRegistryEntry,
  RepoRegistry,
  SharedSquadManifest,
  LocatedRegistryEntry,
} from './shared-squad.js';
export {
  /** @internal Used by CLI — not part of the public SDK API surface. */
  mergeInbox,
  /** @internal Used by CLI — not part of the public SDK API surface. */
  recoverStaleProcessing,
  mergeDecisionsInbox,
  mergeAgentHistoryInbox,
  mergeAllHistoryInboxes,
} from './scribe-merge.js';
export type { MergeOptions, MergeResult } from './scribe-merge.js';
export * from './config/index.js';
export * from './agents/onboarding.js';
export { resolvePersonalAgents, mergeSessionCast } from './agents/personal.js';
export type { PersonalAgentMeta, PersonalAgentManifest } from './agents/personal.js';
export * from './casting/index.js';
export * from './skills/index.js';
export { selectResponseTier, getTier } from './coordinator/response-tiers.js';
export type { ResponseTier, TierName, TierContext, ModelTierSuggestion } from './coordinator/response-tiers.js';
export { loadConfig, loadConfigSync } from './runtime/config.js';
export type { ConfigLoadResult, ConfigValidationError } from './runtime/config.js';
export { MODELS, TIMEOUTS, AGENT_ROLES } from './runtime/constants.js';
export type { AgentRole } from './runtime/constants.js';
export * from './runtime/streaming.js';
export * from './runtime/cost-tracker.js';
export * from './runtime/telemetry.js';
export * from './runtime/offline.js';
export * from './runtime/i18n.js';
export * from './runtime/benchmarks.js';
export * from './runtime/otel-init.js';
export * from './runtime/otel-metrics.js';
export * from './runtime/rework.js';
export { getMeter, getTracer } from './runtime/otel.js';
export { safeTimestamp } from './utils/safe-timestamp.js';
export { EventBus as RuntimeEventBus } from './runtime/event-bus.js';
export {
  type SquadManifest,
  type SquadContact,
  type AcceptedWorkType,
  type DiscoveredSquad,
  type CrossSquadIssueOptions,
  type CrossSquadIssueResult,
  type CrossSquadWorkStatus,
  validateManifest,
  readManifest,
  discoverSquads,
  discoverFromUpstreams,
  discoverFromRegistry,
  buildDelegationArgs,
  buildStatusCheckArgs,
  parseIssueStatus,
  formatDiscoveryTable,
  findSquadByName,
} from './runtime/cross-squad.js';

export * from './marketplace/index.js';
export * from './build/index.js';
export * from './sharing/index.js';
export * from './upstream/index.js';
export * from './remote/index.js';
export * from './streams/index.js';

// Builder functions (SDK-First Squad Mode)
export {
  defineTeam,
  defineAgent,
  defineBudget,
  defineRouting,
  defineCeremony,
  defineHooks,
  defineCasting,
  defineTelemetry,
  defineDefaults,
  defineSkill,
  defineSquad,
  BuilderValidationError,
} from './builders/index.js';
export type {
  AgentRef,
  ScheduleExpression,
  BuilderModelId,
  BudgetDefinition,
  ModelPreference,
  DefaultsDefinition,
  TeamDefinition,
  AgentCapability,
  AgentDefinition,
  RoutingRule as BuilderRoutingRule,
  RoutingDefinition,
  CeremonyDefinition,
  HooksDefinition,
  CastingDefinition,
  TelemetryDefinition,
  SkillDefinition as BuilderSkillDefinition,
  SkillTool as BuilderSkillTool,
  SquadSDKConfig,
} from './builders/index.js';
// Base Roles (built-in role catalog)
export * from './roles/index.js';
export * from './platform/index.js';
export * from './storage/index.js';

// Git-native state backends (Issue #807)
export type { StateBackend, StateBackendType, StateBackendConfig } from './state-backend.js';
export { WorktreeBackend, GitNotesBackend, OrphanBranchBackend, resolveStateBackend, validateStateKey } from './state-backend.js';

// State facade (Phase 2) — namespaced to avoid conflicts with existing config/sharing exports
export {
  // Error classes
  StateError,
  NotFoundError,
  ParseError,
  WriteConflictError,
  ProviderError,
  // Schema
  COLLECTION_PATHS,
  resolveCollectionPath,
  // Handle factory
  createAgentHandle,
  // Collection facades
  AgentsCollection,
  ConfigCollection,
  DecisionsCollection,
  LogCollection,
  RoutingCollection,
  SkillsCollection,
  TeamCollection,
  TemplatesCollection,
  // Top-level facade
  SquadState,
} from './state/index.js';
export type { ConfigFileData } from './state/index.js';
export type {
  Agent,
  Decision,
  LogEntry,
  RoutingConfigRule,
  SquadStateConfig,
  StateErrorKind,
  TeamMember,
  Template,
  CollectionEntityMap,
  CollectionName,
  AgentHandle,
  CollectionPathResolver,
} from './state/index.js';
