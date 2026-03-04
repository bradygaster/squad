/**
 * Types barrel — pure type re-exports, zero runtime code.
 * Use `export type` exclusively to guarantee no runtime imports.
 *
 * @module types
 */

// --- Parsed types (config/markdown-migration.ts) ---
export type { ParsedAgent } from './config/markdown-migration.js';
export type { ParsedRoutingRule } from './config/markdown-migration.js';
export type { ParsedDecision } from './config/markdown-migration.js';
export type { MarkdownParseResult } from './config/markdown-migration.js';
export type { MarkdownMigrationOptions } from './config/markdown-migration.js';
export type { MarkdownMigrationResult } from './config/markdown-migration.js';

// --- Charter types (agents/charter-compiler.ts) ---
export type { ParsedCharter } from './agents/charter-compiler.js';
export type { CharterCompileOptions } from './agents/charter-compiler.js';
export type { CharterConfigOverrides } from './agents/charter-compiler.js';
export type { CompiledCharter } from './agents/charter-compiler.js';

// --- Routing types (config/routing.ts) ---
export type { CompiledRouter } from './config/routing.js';
export type { CompiledWorkTypeRule } from './config/routing.js';
export type { CompiledIssueRule } from './config/routing.js';
export type { RoutingMatch } from './config/routing.js';

// --- Skill types (skills/skill-loader.ts) ---
export type { SkillDefinition } from './skills/skill-loader.js';

// --- Config types (runtime/config.ts) ---
export type { SquadConfig } from './runtime/config.js';
export type { RoutingConfig } from './runtime/config.js';
export type { RoutingRule } from './runtime/config.js';
export type { IssueRoutingRule } from './runtime/config.js';
export type { ModelSelectionConfig } from './runtime/config.js';
export type { ModelTier } from './runtime/config.js';
export type { ModelId } from './runtime/config.js';
export type { WorkType } from './runtime/config.js';
export type { AgentRole } from './runtime/config.js';
export type { TaskOutputType } from './runtime/config.js';
export type { TaskToModelRule } from './runtime/config.js';
export type { RoleToModelMapping } from './runtime/config.js';
export type { ComplexityAdjustment } from './runtime/config.js';
export type { CastingPolicy } from './runtime/config.js';
export type { AgentSourceConfig } from './runtime/config.js';
export type { PlatformOverrides } from './runtime/config.js';
export type { CopilotCapabilityEvaluation } from './runtime/config.js';
export type { ConfigLoadResult } from './runtime/config.js';
export type { ConfigValidationError } from './runtime/config.js';

// --- Adapter types (adapter/types.ts) ---
export type { SquadSessionConfig } from './adapter/types.js';
export type { SquadCustomAgentConfig } from './adapter/types.js';

// --- Multi-squad types (multi-squad.ts) ---
export type { SquadEntry } from './multi-squad.js';
export type { MultiSquadConfig } from './multi-squad.js';
export type { SquadInfo } from './multi-squad.js';

// --- Workstream types (streams/types.ts) ---
export type { WorkstreamDefinition } from './streams/types.js';
export type { WorkstreamConfig } from './streams/types.js';
export type { ResolvedWorkstream } from './streams/types.js';
/** @deprecated aliases */
export type { StreamDefinition } from './streams/types.js';
export type { StreamConfig } from './streams/types.js';
export type { ResolvedStream } from './streams/types.js';

// --- Builder types (builders/types.ts) ---
export type { AgentRef } from './builders/types.js';
export type { ScheduleExpression } from './builders/types.js';
export type { BuilderModelId } from './builders/types.js';
export type { TeamDefinition } from './builders/types.js';
export type { AgentCapability } from './builders/types.js';
export type { AgentDefinition } from './builders/types.js';
export type { RoutingRule as BuilderRoutingRule } from './builders/types.js';
export type { RoutingDefinition } from './builders/types.js';
export type { CeremonyDefinition } from './builders/types.js';
export type { HooksDefinition } from './builders/types.js';
export type { CastingDefinition } from './builders/types.js';
export type { TelemetryDefinition } from './builders/types.js';
export type { SquadSDKConfig } from './builders/types.js';
// --- Platform types (platform/types.ts) ---
export type { PlatformType } from './platform/types.js';
export type { WorkItem } from './platform/types.js';
export type { PullRequest } from './platform/types.js';
export type { PlatformAdapter } from './platform/types.js';
export type { RalphCommands } from './platform/ralph-commands.js';
export type { GitHubRemoteInfo } from './platform/detect.js';
export type { AzureDevOpsRemoteInfo } from './platform/detect.js';
