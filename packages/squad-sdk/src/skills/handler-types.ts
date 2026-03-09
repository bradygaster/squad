/**
 * Type system for the skill-script model.
 *
 * This module defines the complete type contract for backend skills in `.squad/skills/`.
 * Skills contain `scripts/` directories with executable JS handlers that replace built-in
 * tool handlers in ToolRegistry.
 *
 * The skill-script model enables stateful, framework-aware backends for tasks, decisions,
 * memories, and logging concerns. Handlers are ordinary async functions that return
 * SquadToolResult values.
 */

import type { SquadToolResult, SquadTool } from "../adapter/types.js";

// ─── Tool Argument Interfaces ────────────────────────────────────────────────

/**
 * Arguments for squad_create_issue.
 * All tool arg interfaces include [key: string]: unknown for skill-documented extensions.
 */
export interface CreateIssueArgs {
  title: string;
  body?: string;
  assignee?: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_update_issue.
 */
export interface UpdateIssueArgs {
  issueId: string | number;
  title?: string;
  body?: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_list_issues.
 */
export interface ListIssuesArgs {
  status?: "all" | "open" | "closed";
  limit?: number;
  [key: string]: unknown;
}

/**
 * Arguments for squad_close_issue.
 */
export interface CloseIssueArgs {
  issueId: string | number;
  comment?: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_create_decision.
 */
export interface CreateDecisionArgs {
  author: string;
  summary: string;
  body: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_list_decisions.
 */
export interface ListDecisionsArgs {
  status?: "all" | "pending" | "merged";
  limit?: number;
  [key: string]: unknown;
}

/**
 * Arguments for squad_merge_decision.
 */
export interface MergeDecisionArgs {
  slugs?: string[];
  [key: string]: unknown;
}

/**
 * Arguments for squad_create_memory.
 */
export interface CreateMemoryArgs {
  content: string;
  agent?: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_list_memories.
 */
export interface ListMemoriesArgs {
  agent?: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * Arguments for squad_create_log.
 */
export interface CreateLogArgs {
  kind: "orchestration" | "session";
  content: string;
  agent?: string;
  [key: string]: unknown;
}

/**
 * Arguments for squad_list_logs.
 */
export interface ListLogsArgs {
  kind?: "orchestration" | "session";
  limit?: number;
  [key: string]: unknown;
}

// ─── Core Handler Types ──────────────────────────────────────────────────────

/**
 * Skill handler function.
 *
 * @param args - Tool input matching the tool's schema
 * @param config - Non-framework keys from the tracking config entry (excludes 'skill', 'disposeTimeoutMs')
 * @returns SquadToolResult (string or SquadToolResultObject)
 */
export type SkillHandler<TArgs = unknown> = (
  args: TArgs,
  config: Record<string, unknown>,
) => Promise<SquadToolResult> | SquadToolResult;

/**
 * Lifecycle hooks for stateful backend skills.
 * lifecycle.js in the scripts/ dir exports these.
 */
export interface HandlerLifecycle {
  /**
   * Called once after handler resolution, before first tool call.
   * init() must be idempotent.
   */
  init?(config: Record<string, unknown>): Promise<void>;

  /**
   * Called once at session end.
   * Must be safe to call even if init() partially failed.
   */
  dispose?(): Promise<void>;
}

// ─── Concern Handler Interfaces ──────────────────────────────────────────────

/**
 * Task concern handlers (squad_*_issue).
 */
export interface TaskHandlers extends HandlerLifecycle {
  squad_create_issue?: SkillHandler<CreateIssueArgs>;
  squad_update_issue?: SkillHandler<UpdateIssueArgs>;
  squad_list_issues?: SkillHandler<ListIssuesArgs>;
  squad_close_issue?: SkillHandler<CloseIssueArgs>;
}

/**
 * Decision concern handlers (squad_*_decision).
 */
export interface DecisionHandlers extends HandlerLifecycle {
  squad_create_decision?: SkillHandler<CreateDecisionArgs>;
  squad_list_decisions?: SkillHandler<ListDecisionsArgs>;
  squad_merge_decision?: SkillHandler<MergeDecisionArgs>;
}

/**
 * Memory concern handlers (squad_*_memory).
 */
export interface MemoryHandlers extends HandlerLifecycle {
  squad_create_memory?: SkillHandler<CreateMemoryArgs>;
  squad_list_memories?: SkillHandler<ListMemoriesArgs>;
}

/**
 * Logging concern handlers (squad_*_log).
 */
export interface LogHandlers extends HandlerLifecycle {
  squad_create_log?: SkillHandler<CreateLogArgs>;
  squad_list_logs?: SkillHandler<ListLogsArgs>;
}

/**
 * Union of all handler interfaces.
 */
export type AllHandlers = TaskHandlers &
  DecisionHandlers &
  MemoryHandlers &
  LogHandlers;

// ─── Disjoint Name Compile-Time Assertion ────────────────────────────────────

/**
 * Strip HandlerLifecycle keys, keep only tool-name keys.
 */
type OwnKeys<T> = Exclude<keyof T, keyof HandlerLifecycle>;

/**
 * true if A and B share no tool-name keys; never otherwise.
 */
type AssertDisjoint<A, B> = Extract<OwnKeys<A>, OwnKeys<B>> extends never
  ? true
  : never;

// All 6 pairs must be disjoint:
export type _TaskDecision = AssertDisjoint<TaskHandlers, DecisionHandlers>;
export type _TaskMemory = AssertDisjoint<TaskHandlers, MemoryHandlers>;
export type _TaskLog = AssertDisjoint<TaskHandlers, LogHandlers>;
export type _DecisionMemory = AssertDisjoint<DecisionHandlers, MemoryHandlers>;
export type _DecisionLog = AssertDisjoint<DecisionHandlers, LogHandlers>;
export type _MemoryLog = AssertDisjoint<MemoryHandlers, LogHandlers>;

// Compile fails if any pair shares a tool name:
const _disjointProof: [
  _TaskDecision,
  _TaskMemory,
  _TaskLog,
  _DecisionMemory,
  _DecisionLog,
  _MemoryLog,
] = [true, true, true, true, true, true];

// ─── ConcernMap and Related ──────────────────────────────────────────────────

/**
 * Maps concern names to their handler interfaces.
 */
export interface ConcernMap {
  tasks: TaskHandlers;
  decisions: DecisionHandlers;
  memories: MemoryHandlers;
  logging: LogHandlers;
}

/**
 * Valid concern names.
 */
export type Concern = keyof ConcernMap;

// ─── LoadResult ──────────────────────────────────────────────────────────────

/**
 * Return type for SkillScriptLoader.load().
 */
export interface LoadResult {
  /**
   * Fully-formed SquadTool entries — skill handlers combined with built-in schemas.
   */
  tools: SquadTool[];

  /**
   * Lifecycle hooks from scripts/lifecycle.js, if present.
   */
  lifecycle?: {
    init?(config: Record<string, unknown>): Promise<void>;
    dispose?(): Promise<void>;
  };
}

// ─── Config Types ────────────────────────────────────────────────────────────

/**
 * Skill configuration entry.
 *
 * Specifies a skill directory path and optional disposal timeout.
 * The 'package' key is reserved for future use and forbidden here.
 */
export interface SkillConfig {
  /** Path to skill directory (relative to squad root) */
  skill: string;
  /** Prevent future package key coexisting with skill */
  package?: never;
  /** Timeout for dispose() in ms (default: 10000) */
  disposeTimeoutMs?: number;
  [key: string]: unknown;
}

/**
 * A reference to a backend:
 * - undefined → built-in markdown (default)
 * - "markdown" → built-in markdown (explicit reset)
 * - "noop" → silent no-op (disables the concern)
 * - { skill, ...opts } → skill directory with config options
 */
export type BackendRef = "markdown" | "noop" | SkillConfig;

/**
 * Direct handler registration (alternative to skill path).
 * Used for programmatically-provided handlers.
 */
export interface HandlerRegistration<H extends HandlerLifecycle> {
  handlers: H;
}

/**
 * Tracking configuration for backend skills.
 *
 * Controls which backend (markdown, noop, or skill) serves each concern.
 * Supports a global default with per-concern overrides.
 */
export interface TrackingConfig {
  /** Backend for ALL concerns unless individually overridden */
  default?: BackendRef;
  decisions?: BackendRef | HandlerRegistration<DecisionHandlers>;
  memories?: BackendRef | HandlerRegistration<MemoryHandlers>;
  tasks?: BackendRef | HandlerRegistration<TaskHandlers>;
  logging?: BackendRef | HandlerRegistration<LogHandlers>;
}

// ─── defineHandler Helper ────────────────────────────────────────────────────

/**
 * Identity function for type inference in handler scripts.
 *
 * Provides compile-time safety when authoring TypeScript handlers.
 * The compiled .js output is a plain function — no runtime dependency on this.
 *
 * @example
 * ```typescript
 * export default defineHandler<CreateIssueArgs>(async (args, config) => {
 *   return { type: "success", text: `Issue created: ${args.title}` };
 * });
 * ```
 */
export function defineHandler<TArgs = unknown>(
  handler: SkillHandler<TArgs>,
): SkillHandler<TArgs> {
  return handler;
}
