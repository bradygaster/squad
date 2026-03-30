/**
 * State Module — Collection Entity Map
 *
 * Compiler-enforced registry that maps collection names to their
 * domain entity types.  Any `SquadState.get<C>(collection)` call
 * is type-checked against this map at compile time.
 */

import type {
  Agent,
  Decision,
  HistoryEntry,
  HistorySection,
  LogEntry,
  RoutingConfig,
  SquadStateConfig,
  TeamConfig,
  Template,
} from './domain-types.js';
import type { SkillDefinition } from '../skills/skill-loader.js';

/** Compiler-enforced mapping from collection name → entity type. */
export interface CollectionEntityMap {
  agents: Agent;
  decisions: Decision;
  routing: RoutingConfig;
  team: TeamConfig;
  skills: SkillDefinition;
  templates: Template;
  log: LogEntry;
  config: SquadStateConfig;
}

/** Union of all valid collection names. */
export type CollectionName = keyof CollectionEntityMap;

/**
 * Ergonomic handle for interacting with a single agent's state.
 *
 * Returned by `SquadState.agent(name)`.  Provides scoped access to
 * the agent's charter, history, and mutable properties without
 * requiring the caller to know file paths.
 */
export interface AgentHandle {
  /** Agent name (immutable). */
  readonly name: string;

  /** Read the full charter markdown. */
  charter(): Promise<string>;

  /** Read all history entries, or entries for a specific section. */
  history(): Promise<HistoryEntry[]>;
  history(section: HistorySection): Promise<HistoryEntry[]>;

  /** Append a new entry to a history section. */
  appendHistory(section: HistorySection, entry: HistoryEntry): Promise<void>;

  /** Apply a partial update to the agent entity. */
  update(updates: Partial<Agent>): Promise<void>;
}
