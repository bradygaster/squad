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
  DEFAULT: process.env['SQUAD_DEFAULT_MODEL'] ?? 'gpt-5.6-terra',

  /**
   * Economy-profile default for model-selector Layer 4 (cost-first). The
   * quality-first and balanced profiles default to the standard chain head.
   */
  SELECTOR_DEFAULT: 'gpt-5.6-luna',

  /** Tier of {@link MODELS.SELECTOR_DEFAULT} */
  SELECTOR_DEFAULT_TIER: 'fast',

  /**
   * Fallback chains by tier — public GA model ids only (#1598), quality first,
   * alternating providers. Must match `DEFAULT_FALLBACK_CHAINS` and
   * `DEFAULT_CONFIG.models.tiers`.
   */
  FALLBACK_CHAINS: {
    premium: [
      'claude-opus-5.5',
      'gpt-6.1-sol',
      'claude-opus-5',
      'gpt-6-sol',
      'claude-opus-4.8',
      'gpt-5.6-sol',
    ],
    standard: [
      'claude-sonnet-5.5',
      'gpt-5.6-terra',
      'claude-sonnet-5',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.3-codex',
    ],
    fast: [
      'claude-haiku-5.5',
      'gpt-6-luna',
      'gpt-5.6-luna',
      'gemini-3.8-flash',
      'claude-haiku-4.5',
      'gpt-5.4-mini',
      'gpt-5-mini',
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
