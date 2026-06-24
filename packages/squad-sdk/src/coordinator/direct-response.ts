/**
 * Direct Response Handler (M3-6, Issue #147)
 *
 * Handles simple queries that don't require agent spawning.
 * Acts as a first-pass check in the coordinator pipeline —
 * status queries, help requests, config questions, and team roster
 * queries are answered directly without consuming agent sessions.
 */

import type { SquadConfig } from '../runtime/config.js';
import type { EventBus, SquadEvent } from '../runtime/event-bus.js';

// --- Types ---

/**
 * Context for coordinator message handling.
 */
export interface CoordinatorContext {
  /** Current session ID (coordinator session) */
  sessionId: string;
  /** Squad configuration */
  config: SquadConfig;
  /** Event bus for observability */
  eventBus?: EventBus;
  /** Team roster content (team.md) */
  teamRoster?: string;
  /** Active agent names */
  activeAgents?: string[];
  /** User-provided metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a direct response.
 */
export interface DirectResponseResult {
  /** The response text to return to the user */
  response: string;
  /** Category of the matched pattern */
  category: DirectResponseCategory;
  /** Confidence in the match */
  confidence: 'high' | 'medium';
}

/**
 * Categories of messages handled directly.
 */
export type DirectResponseCategory =
  | 'status'
  | 'help'
  | 'config'
  | 'roster'
  | 'greeting';

/**
 * A configurable pattern for direct response matching.
 */
export interface DirectResponsePattern {
  /** Category this pattern belongs to */
  category: DirectResponseCategory;
  /** Regex patterns that trigger this category */
  patterns: RegExp[];
  /** Handler that produces the response */
  handler: (message: string, context: CoordinatorContext) => string;
}

// --- Default Patterns ---

const DEFAULT_PATTERNS: DirectResponsePattern[] = [
  {
    category: 'status',
    patterns: [
      /^(?:what(?:'s| is) the )?status\b/i,
      /^(?:show|list|get)\s+(?:active\s+)?(?:agents?|sessions?|status)\b/i,
      /^who(?:'s| is) (?:active|running|working)\b/i,
      /^squad\s+status\b/i,
    ],
    handler: (_message, context) => {
      const agents = context.activeAgents ?? [];
      if (agents.length === 0) {
        return 'No agents are currently active. Use a task request to spawn agents.';
      }
      return `Active agents (${agents.length}): ${agents.join(', ')}`;
    },
  },
  {
    category: 'help',
    patterns: [
      /^(?:help|how do I|what can you do|what commands|usage)\b/i,
      /^(?:show|list)\s+(?:help|commands|capabilities)\b/i,
      /^\?$/,
    ],
    handler: () => {
      return [
        '**Squad Coordinator** — I route work to specialist agents.',
        '',
        'You can ask me to:',
        '- Route tasks to specific agents (e.g., "ask Fenster to fix the build")',
        '- Check team status (e.g., "status" or "who is active?")',
        '- View the team roster (e.g., "show team" or "who is on the team?")',
        '- View configuration (e.g., "show config" or "what model am I using?")',
        '',
        'Or just describe what you need and I\'ll route it to the right agent.',
      ].join('\n');
    },
  },
  {
    category: 'config',
    patterns: [
      /^(?:show|get|what(?:'s| is))\s+(?:the\s+)?(?:config|configuration|settings|model)\b/i,
      /^(?:which|what)\s+model\b/i,
      /^config\b/i,
    ],
    handler: (_message, context) => {
      const cfg = context.config;
      const model = cfg.models?.defaultModel ?? 'unknown';
      const tier = cfg.models?.defaultTier ?? 'unknown';
      const ruleCount = cfg.routing?.rules?.length ?? 0;
      return [
        `**Configuration** (v${cfg.version})`,
        `- Default model: ${model} (${tier} tier)`,
        `- Routing rules: ${ruleCount}`,
        `- Tier ceiling respected: ${cfg.models?.respectTierCeiling ?? true}`,
      ].join('\n');
    },
  },
  {
    category: 'roster',
    patterns: [
      /^(?:show|list|get|who(?:'s| is)(?: on)?)\s+(?:the\s+)?(?:team|roster|agents?|members?)\b/i,
      /^team\b/i,
      /^roster\b/i,
    ],
    handler: (_message, context) => {
      if (context.teamRoster) {
        return context.teamRoster;
      }
      const agents = context.activeAgents ?? [];
      if (agents.length === 0) {
        return 'No team roster available. Configure agents in your squad.config.ts.';
      }
      return `**Team Roster:** ${agents.join(', ')}`;
    },
  },
  {
    category: 'greeting',
    patterns: [
      /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|yo|sup)\b/i,
      /^(?:hi|hello|hey)!?$/i,
    ],
    handler: () => {
      return 'Hello! I\'m the Squad coordinator. Describe what you need and I\'ll route it to the right agent, or type "help" for options.';
    },
  },
];

// --- Direct Response Handler ---

/**
 * Handles simple queries without spawning agents.
 *
 * The handler checks incoming messages against a set of configurable
 * patterns. If a match is found, it produces a direct response without
 * going through the routing → charter → spawn pipeline.
 */
export class DirectResponseHandler {
  private patterns: DirectResponsePattern[];

  constructor(customPatterns?: DirectResponsePattern[]) {
    this.patterns = customPatterns ?? DEFAULT_PATTERNS;
  }

  /**
   * Check whether a message should be handled directly (no agent spawn).
   */
  shouldHandleDirectly(message: string, config?: SquadConfig): boolean {
    const trimmed = message.trim();
    if (trimmed.length === 0) return false;

    // Never handle directly when message contains an explicit @agent mention (#1029)
    if (/@[a-z][a-z0-9_-]*/i.test(trimmed)) {
      return false;
    }

    // Check configurable patterns from squad config
    if (config?.routing?.rules) {
      for (const rule of config.routing.rules) {
        if (rule.workType === 'direct' || (rule as any).tier === 'direct') {
          // Rules explicitly marked as 'direct' tier mean
          // the coordinator should handle them, but we still
          // fall through to pattern matching below.
        }
      }
    }

    return this.matchPattern(trimmed) !== undefined;
  }

  /**
   * Handle a message directly and return a response.
   * Should only be called after shouldHandleDirectly() returns true.
   */
  handleDirect(message: string, context: CoordinatorContext): DirectResponseResult {
    const trimmed = message.trim();
    const match = this.matchPattern(trimmed);

    if (!match) {
      return {
        response: 'I\'m not sure how to handle that directly. Let me route it to an agent.',
        category: 'help',
        confidence: 'medium',
      };
    }

    const response = match.handler(trimmed, context);

    // Emit event for observability
    if (context.eventBus) {
      context.eventBus.emit({
        type: 'coordinator:routing' as SquadEvent['type'],
        sessionId: context.sessionId,
        payload: {
          decision: 'direct',
          category: match.category,
          messageLength: trimmed.length,
        },
        timestamp: new Date(),
      });
    }

    return {
      response,
      category: match.category,
      confidence: 'high',
    };
  }

  /**
   * Add a custom pattern at runtime.
   */
  addPattern(pattern: DirectResponsePattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Get all registered patterns.
   */
  getPatterns(): ReadonlyArray<DirectResponsePattern> {
    return this.patterns;
  }

  // --- Private ---

  private matchPattern(message: string): DirectResponsePattern | undefined {
    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(message)) {
          return pattern;
        }
      }
    }
    return undefined;
  }
}
