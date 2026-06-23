/**
 * State Module — Barrel Export
 *
 * Phase 2 of StorageProvider PRD (#481).
 * Typed facade layer over `.squad/` file-based state.
 */

// Domain types (new + re-exported canonical types)
export type {
  Agent,
  Decision,
  HistoryEntry,
  HistorySection,
  LogEntry,
  ModelTier,
  RoutingConfig,
  RoutingConfigRule,
  RoutingRule,
  SkillDefinition,
  SquadStateConfig,
  StateErrorKind,
  StorageProvider,
  TeamConfig,
  TeamMember,
  Template,
  WorkType,
} from './domain-types.js';

export type { AgentStatus } from './domain-types.js';

export {
  StateError,
  NotFoundError,
  ParseError,
  WriteConflictError,
  ProviderError,
} from './domain-types.js';

// Collection map
export type {
  CollectionEntityMap,
  CollectionName,
  AgentHandle,
} from './collection-map.js';

// Schema / path resolution
export type { CollectionPathResolver } from './schema.js';
export { COLLECTION_PATHS, resolveCollectionPath } from './schema.js';

// Agent handle factory
export { createAgentHandle } from './handles.js';

// Collection facades
export {
  AgentsCollection,
  ConfigCollection,
  DecisionsCollection,
  LogCollection,
  RoutingCollection,
  SkillsCollection,
  TeamCollection,
  TemplatesCollection,
} from './collections.js';

export type { ConfigFileData } from './collections.js';

// SquadState facade
export { SquadState } from './squad-state.js';
