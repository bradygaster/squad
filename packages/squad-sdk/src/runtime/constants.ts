/**
 * Central constants — single source of truth for model names, timeouts, roles.
 * All magic values live here. Environment variables override where noted.
 *
 * @module runtime/constants
 */

// ============================================================================
// Models
// ============================================================================

export const MODELS = {
  /** Default model for config files and new projects (env-overridable) */
  DEFAULT: process.env['SQUAD_DEFAULT_MODEL'] ?? 'claude-sonnet-4.6',

  /** Default model for model-selector Layer 4 — cost-first */
  SELECTOR_DEFAULT: 'claude-haiku-4.5',

  /** Default tier for the model-selector Layer 4 fallback */
  SELECTOR_DEFAULT_TIER: 'fast',

  /** Fallback chains by tier — ordered by preference */
  FALLBACK_CHAINS: {
    premium: [
      'claude-opus-4.7',
      'claude-opus-4.6',
      'claude-opus-4.5',
      'gpt-5.5',
      'claude-sonnet-4.6',
    ],
    standard: [
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.4',
      'claude-sonnet-4',
      'gpt-4.1',
    ],
    fast: [
      'claude-haiku-4.5',
      'gpt-5.4-mini',
      'gpt-5-mini',
      'gpt-4.1',
    ],
  },

  /** Nuclear fallback model when all chains are exhausted */
  NUCLEAR_FALLBACK: 'claude-haiku-4.5',

  /** Maximum retries before nuclear fallback engages */
  NUCLEAR_MAX_RETRIES: 3,
} as const;

// ============================================================================
// Timeouts
// ============================================================================

export const TIMEOUTS = {
  /** Health check timeout in milliseconds */
  HEALTH_CHECK_MS: parseInt(process.env['SQUAD_HEALTH_CHECK_MS'] ?? '5000', 10),

  /** Git clone timeout in milliseconds */
  GIT_CLONE_MS: parseInt(process.env['SQUAD_GIT_CLONE_MS'] ?? '60000', 10),

  /** Plugin/marketplace fetch timeout in milliseconds */
  PLUGIN_FETCH_MS: parseInt(process.env['SQUAD_PLUGIN_FETCH_MS'] ?? '15000', 10),

  /** Session response timeout in milliseconds (env-overridable, default 10 min) */
  SESSION_RESPONSE_MS: parseInt(process.env['SQUAD_SESSION_TIMEOUT_MS'] ?? '600000', 10),
} as const;

// ============================================================================
// Agent Roles
// ============================================================================

export const AGENT_ROLES = ['lead', 'developer', 'tester', 'designer', 'scribe', 'coordinator'] as const;
export type AgentRole = typeof AGENT_ROLES[number];
