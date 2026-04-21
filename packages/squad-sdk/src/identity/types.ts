/**
 * Identity Module — Type definitions
 *
 * Types for GitHub App-based agent identity, supporting shared,
 * per-role, and per-agent identity tiers.
 *
 * @module identity/types
 */

/** Identity tier determines how GitHub App credentials are shared across agents. */
export type IdentityTier = 'shared' | 'per-role' | 'per-agent';

/** Canonical role slugs for identity mapping. */
export type RoleSlug = 'lead' | 'frontend' | 'backend' | 'tester' | 'devops' | 'docs' | 'security' | 'data' | 'scribe';

/** All canonical role slugs — single source of truth for SDK and CLI. */
export const ALL_ROLES: readonly RoleSlug[] = [
  'lead', 'frontend', 'backend', 'tester', 'devops', 'docs', 'security', 'data', 'scribe',
] as const;

/** A registered GitHub App linked to a role or shared across agents. */
export interface AppRegistration {
  appId: number;
  appSlug: string;
  installationId: number;
  roleSlug?: RoleSlug;
  tier?: IdentityTier;
}

/** Top-level identity configuration stored in `.squad/identity/config.json`. */
export interface IdentityConfig {
  tier: IdentityTier;
  apps?: Record<string, AppRegistration>;
  [key: string]: unknown;
}

/** Input for formatting an agent comment with attribution. */
export interface CommentInput {
  agentName: string;
  role: string;
  body: string;
}

/** Input for formatting a commit message with agent prefix. */
export interface CommitMessageInput {
  agentName: string;
  message: string;
}

