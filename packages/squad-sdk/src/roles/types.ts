/**
 * Base Role Types — Built-in role catalog for Squad
 *
 * Base roles provide curated starting points for team casting.
 * Each role includes deep charter content that gets refined for
 * the specific project context during init.
 *
 * Inspired by agency-agents by AgentLand Contributors (MIT License)
 * https://github.com/msitarzewski/agency-agents
 *
 * @module roles/types
 */

/**
 * A category grouping for base roles.
 *
 * - Software development categories cover Squad's primary use case
 * - Business/operations categories cover broader team types
 */
export type RoleCategory =
  | 'engineering'
  | 'quality'
  | 'operations'
  | 'product'
  | 'design'
  | 'marketing'
  | 'sales'
  | 'support'
  | 'game-dev'
  | 'media'
  | 'compliance';

/**
 * A built-in base role definition.
 *
 * Base roles are starting points — they provide ~90% of charter content.
 * A lightweight LLM refinement pass adapts them to the project context.
 */
export interface BaseRole {
  /** Unique role identifier (kebab-case, e.g., 'backend', 'marketing') */
  readonly id: string;

  /** Human-readable title (e.g., 'Backend Developer') */
  readonly title: string;

  /** Category grouping */
  readonly category: RoleCategory;

  /** Emoji for display */
  readonly emoji: string;

  /** One-line personality/vibe (shown during role selection) */
  readonly vibe: string;

  /** Expertise areas for the charter Identity section */
  readonly expertise: readonly string[];

  /** Communication style descriptor */
  readonly style: string;

  /** What this role owns — bullet points for the charter */
  readonly ownership: readonly string[];

  /** How this role works — approach and principles */
  readonly approach: readonly string[];

  /** Boundary definitions */
  readonly boundaries: {
    /** Types of work this role handles */
    readonly handles: string;
    /** Types of work that belong elsewhere */
    readonly doesNotHandle: string;
  };

  /** Deeper personality description for the charter Voice section */
  readonly voice: string;

  /** Keywords for routing table matching during init */
  readonly routingPatterns: readonly string[];

  /** Source attribution (required for agency-agents derived content) */
  readonly attribution: string;
}

/**
 * Options for customizing a base role when using `useRole()`.
 */
export interface UseRoleOptions {
  /** Agent name (required — this becomes the cast name) */
  readonly name: string;

  /** Override or extend expertise areas */
  readonly expertise?: readonly string[];

  /** Override communication style */
  readonly style?: string;

  /** Override the vibe/personality line */
  readonly vibe?: string;

  /** Additional ownership items to append */
  readonly extraOwnership?: readonly string[];

  /** Additional approach items to append */
  readonly extraApproach?: readonly string[];

  /** Override boundaries */
  readonly boundaries?: {
    readonly handles?: string;
    readonly doesNotHandle?: string;
  };

  /** Override voice */
  readonly voice?: string;

  /** Model preference override */
  readonly model?: string;

  /** Agent status */
  readonly status?: 'active' | 'inactive' | 'retired';
}
