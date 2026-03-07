/**
 * Builder Types — SDK-First Squad Mode
 *
 * These types define the config surface for the builder functions
 * (`defineTeam`, `defineAgent`, etc.). They are the SDK-mode complement
 * to the existing SquadConfig / schema types. Treat these interfaces
 * as the public contract for programmatic team definition.
 *
 * @module builders/types
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Reference to an agent by name (e.g. `"@edie"` or `"edie"`). */
export type AgentRef = string;

/** Cron-like schedule expression or human-readable trigger. */
export type ScheduleExpression = string;

/** Model identifier (same domain as runtime ModelId). */
export type BuilderModelId = string;

// ---------------------------------------------------------------------------
// ModelPreference — structured model selection
// ---------------------------------------------------------------------------

/**
 * Structured model preference for an agent or squad-level default.
 * Supports the 4-layer model selection hierarchy:
 *   1. User override (runtime)
 *   2. Charter / config preference (this type)
 *   3. Task-aware auto-selection (runtime)
 *   4. Default (haiku)
 */
export interface ModelPreference {
  /** Preferred model identifier (e.g. `"claude-sonnet-4.5"`). */
  readonly preferred: BuilderModelId;

  /** Why this model was chosen — helps coordinators respect the preference. */
  readonly rationale?: string;

  /** Fallback model if the preferred model is unavailable. */
  readonly fallback?: BuilderModelId;
}

// ---------------------------------------------------------------------------
// DefaultsDefinition — squad-level defaults
// ---------------------------------------------------------------------------

/** Squad-level defaults applied to all agents unless overridden. */
export interface DefaultsDefinition {
  /** Default model preference for agents that don't specify one. */
  readonly model?: BuilderModelId | ModelPreference;
}

// ---------------------------------------------------------------------------
// TeamDefinition
// ---------------------------------------------------------------------------

export interface TeamDefinition {
  /** Human-readable team name. */
  readonly name: string;

  /** One-liner describing the team's purpose. */
  readonly description?: string;

  /** Freeform project context injected into agent system prompts. */
  readonly projectContext?: string;

  /** Ordered list of agent refs that belong to this team. */
  readonly members: readonly AgentRef[];
}

// ---------------------------------------------------------------------------
// AgentDefinition
// ---------------------------------------------------------------------------

/** Agent capability descriptor. */
export interface AgentCapability {
  /** Capability name (e.g. `"code-review"`, `"testing"`). */
  readonly name: string;

  /** Proficiency level. */
  readonly level: 'expert' | 'proficient' | 'basic';
}

export interface AgentDefinition {
  /** Unique agent identifier (kebab-case, no `@` prefix). */
  readonly name: string;

  /** Human-readable role title. */
  readonly role: string;

  /** One-line tagline or description (rendered as blockquote in charter). */
  readonly description?: string;

  /** Path to charter markdown or inline charter text. */
  readonly charter?: string;

  /** Preferred model identifier or structured model preference. */
  readonly model?: BuilderModelId | ModelPreference;

  /** Tools this agent is allowed to use. */
  readonly tools?: readonly string[];

  /** Typed capability list. */
  readonly capabilities?: readonly AgentCapability[];

  /** Agent lifecycle status. */
  readonly status?: 'active' | 'inactive' | 'retired';
}

// ---------------------------------------------------------------------------
// RoutingDefinition
// ---------------------------------------------------------------------------

export interface RoutingRule {
  /** Glob or regex pattern to match against work type / issue labels. */
  readonly pattern: string;

  /** Agent(s) to route matching work to. */
  readonly agents: readonly AgentRef[];

  /** Routing tier controls how much ceremony surrounds execution. */
  readonly tier?: 'direct' | 'lightweight' | 'standard' | 'full';

  /** Numeric priority — lower wins. */
  readonly priority?: number;

  /** Human-readable description or examples for this rule. */
  readonly description?: string;
}

export interface RoutingDefinition {
  /** Ordered list of routing rules (first match wins at equal priority). */
  readonly rules: readonly RoutingRule[];

  /** Fallback agent when no rule matches. */
  readonly defaultAgent?: AgentRef;

  /** Fallback behaviour when routing is ambiguous. */
  readonly fallback?: 'ask' | 'default-agent' | 'coordinator';
}

// ---------------------------------------------------------------------------
// CeremonyDefinition
// ---------------------------------------------------------------------------

export interface CeremonyDefinition {
  /** Ceremony name (e.g. `"standup"`, `"retrospective"`). */
  readonly name: string;

  /** What triggers this ceremony (e.g. `"schedule"`, `"pr-merged"`). */
  readonly trigger?: string;

  /** Cron expression or human-readable schedule. */
  readonly schedule?: ScheduleExpression;

  /** Agents that participate. */
  readonly participants?: readonly AgentRef[];

  /** Freeform agenda / template. */
  readonly agenda?: string;

  /** Hook names that fire during this ceremony. */
  readonly hooks?: readonly string[];
}

// ---------------------------------------------------------------------------
// HooksDefinition
// ---------------------------------------------------------------------------

export interface HooksDefinition {
  /** Glob patterns for paths agents are allowed to write. */
  readonly allowedWritePaths?: readonly string[];

  /** Shell commands that agents must never execute. */
  readonly blockedCommands?: readonly string[];

  /** Max number of ask-user prompts per session. */
  readonly maxAskUser?: number;

  /** Scrub PII from agent output before persisting. */
  readonly scrubPii?: boolean;

  /** Prevent the PR author from approving their own PR. */
  readonly reviewerLockout?: boolean;
}

// ---------------------------------------------------------------------------
// CastingDefinition
// ---------------------------------------------------------------------------

export interface CastingDefinition {
  /** Fictional universes from which agent personas are drawn. */
  readonly allowlistUniverses?: readonly string[];

  /** Strategy when the universe is at capacity. */
  readonly overflowStrategy?: 'reject' | 'generic' | 'rotate';

  /** Max agents per universe (keyed by universe name). */
  readonly capacity?: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// TelemetryDefinition
// ---------------------------------------------------------------------------

export interface TelemetryDefinition {
  /** Master on/off switch. */
  readonly enabled?: boolean;

  /** OTLP endpoint URL. */
  readonly endpoint?: string;

  /** OTel service name. */
  readonly serviceName?: string;

  /** Trace sample rate (0.0 – 1.0). */
  readonly sampleRate?: number;

  /** Apply Aspire-compatible defaults for dashboard integration. */
  readonly aspireDefaults?: boolean;
}

// ---------------------------------------------------------------------------
// SquadSDKConfig — top-level config that composes all builders
// ---------------------------------------------------------------------------

export interface SquadSDKConfig {
  /** Schema version for forward-compat. */
  readonly version?: string;

  /** Team metadata. */
  readonly team: TeamDefinition;

  /** Agent definitions. */
  readonly agents: readonly AgentDefinition[];

  /** Squad-level defaults applied to agents unless overridden. */
  readonly defaults?: DefaultsDefinition;

  /** Routing rules. */
  readonly routing?: RoutingDefinition;

  /** Ceremony definitions. */
  readonly ceremonies?: readonly CeremonyDefinition[];

  /** Hook / governance definitions. */
  readonly hooks?: HooksDefinition;

  /** Casting configuration. */
  readonly casting?: CastingDefinition;

  /** Telemetry / OTel configuration. */
  readonly telemetry?: TelemetryDefinition;
}
