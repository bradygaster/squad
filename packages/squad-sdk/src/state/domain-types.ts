/**
 * State Module — Canonical Domain Types
 *
 * Phase 2 of StorageProvider PRD (#481).
 * Types that already exist elsewhere are re-exported here as the
 * canonical import point for the state layer.  New domain types are
 * defined inline.
 */

export type { AgentStatus } from '../agents/lifecycle.js';
export type { HistorySection } from '../agents/history-shadow.js';
export type { ModelTier, WorkType, RoutingRule } from '../runtime/config.js';
export type { SkillDefinition } from '../skills/skill-loader.js';
export type { StorageProvider } from '../storage/storage-provider.js';

import type { AgentStatus } from '../agents/lifecycle.js';
import type { HistorySection } from '../agents/history-shadow.js';
import type { ModelTier } from '../runtime/config.js';
import type { StorageProvider } from '../storage/storage-provider.js';

/** Full agent entity persisted under `.squad/agents/<name>/`. */
export interface Agent {
  readonly name: string;
  readonly role: string;
  readonly emoji?: string;
  readonly status: AgentStatus;
  readonly charterPath: string;
  readonly modelPreference?: ModelTier;
  readonly modelFallback?: string;
  readonly skills: readonly string[];
  readonly aliases: readonly string[];
  readonly autoAssign: boolean;
}

/** Structured decision entry parsed from `decisions.md`. */
export interface Decision {
  readonly date: string;
  readonly title: string;
  readonly author: string;
  readonly body: string;
  readonly configRelevant: boolean;
}

/** Timestamped history entry within an agent's `history.md`. */
export interface HistoryEntry {
  readonly section: HistorySection;
  readonly content: string;
  readonly timestamp: string;
}

/** Parsed `team.md` structure. */
export interface TeamConfig {
  readonly projectContext: string;
  readonly members: readonly TeamMember[];
}

/** A single row from the team.md members table. */
export interface TeamMember {
  readonly name: string;
  readonly role: string;
  readonly emoji?: string;
  readonly status?: string;
}

/** Parsed `routing.md` structure. */
export interface RoutingConfig {
  readonly rules: readonly RoutingConfigRule[];
  readonly moduleOwnership: ReadonlyMap<string, string>;
  readonly principles: readonly string[];
}

/** A single routing rule within RoutingConfig. */
export interface RoutingConfigRule {
  readonly workType: string;
  readonly agents: readonly string[];
  readonly examples: readonly string[];
}

/** Template file content from `.squad/templates/`. */
export type Template = {
  readonly id: string;
  readonly name: string;
  readonly content: string;
};

/** Log entry for orchestration / session logging. */
export interface LogEntry {
  readonly timestamp: string;
  readonly level: 'info' | 'warn' | 'error' | 'debug';
  readonly message: string;
  readonly agent?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Options for SquadState initialization. */
export interface SquadStateConfig {
  readonly provider: StorageProvider;
  readonly rootDir: string;
  readonly cacheEnabled?: boolean;
  readonly cacheTtlMs?: number;
}

/**
 * Discriminant for state-layer storage errors.
 * Distinct from the low-level `StorageError` in `storage/storage-error.ts`
 * which wraps Node.js `ErrnoException`.
 */
export type StateErrorKind = 'not-found' | 'parse-error' | 'write-conflict' | 'provider-error';

/**
 * Base error class for the state layer.
 *
 * Named `StateError` (not `StorageError`) to avoid collision with the
 * low-level FS error wrapper in `storage/storage-error.ts`.  Uses a
 * `kind` discriminant so callers can switch on error type.
 */
export class StateError extends Error {
  readonly kind: StateErrorKind;

  constructor(kind: StateErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StateError';
    this.kind = kind;
  }
}

/** Thrown when a requested entity or path does not exist. */
export class NotFoundError extends StateError {
  constructor(collection: string, id?: string, options?: ErrorOptions) {
    const target = id ? `${collection}/${id}` : collection;
    super('not-found', `Not found: ${target}`, options);
    this.name = 'NotFoundError';
  }
}

/** Thrown when file content cannot be parsed into the expected type. */
export class ParseError extends StateError {
  constructor(collection: string, detail: string, options?: ErrorOptions) {
    super('parse-error', `Parse error in ${collection}: ${detail}`, options);
    this.name = 'ParseError';
  }
}

/** Thrown on concurrent write conflicts (future optimistic locking). */
export class WriteConflictError extends StateError {
  constructor(collection: string, id?: string, options?: ErrorOptions) {
    const target = id ? `${collection}/${id}` : collection;
    super('write-conflict', `Write conflict: ${target}`, options);
    this.name = 'WriteConflictError';
  }
}

/** Thrown when the underlying StorageProvider operation fails. */
export class ProviderError extends StateError {
  constructor(operation: string, detail: string, options?: ErrorOptions) {
    super('provider-error', `Provider ${operation} failed: ${detail}`, options);
    this.name = 'ProviderError';
  }
}
