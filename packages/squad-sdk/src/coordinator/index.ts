/**
 * Coordinator Orchestrator (PRD 5)
 *
 * The central orchestration engine. Replaces the 32KB squad.agent.md
 * prompt-based coordinator with a TypeScript program that manages
 * agent sessions, routes work, and observes progress via SDK events.
 */

// --- M3-1 Coordinator ---
export {
  SquadCoordinator,
  type SquadCoordinatorOptions,
  type CoordinatorResult,
  type SpawnStrategy,
  type CoordinatorContext,
} from './coordinator.js';

// --- M3-6 Direct Response ---
export {
  DirectResponseHandler,
  type DirectResponseResult,
  type DirectResponseCategory,
  type DirectResponsePattern,
} from './direct-response.js';

// --- M1-10 Fan-Out ---
export {
  spawnParallel,
  aggregateSessionEvents,
  type AgentSpawnConfig,
  type SpawnResult,
  type FanOutDependencies,
} from './fan-out.js';

// --- M3-4 Response Tiers ---
export {
  selectResponseTier,
  getTier,
  type TierName,
  type TierContext,
  type ModelTierSuggestion,
} from './response-tiers.js';

// --- Legacy types (kept for backwards compat) ---

import type { SquadClient, SquadSessionConfig } from '../client/index.js';
import type { EventBus } from '../runtime/event-bus.js';
import type { AgentSessionManager, AgentCharter } from '../agents/index.js';
import type { HookPipeline } from '../hooks/index.js';
import type { ToolRegistry } from '../tools/index.js';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';

const tracer = trace.getTracer('squad-sdk');

// --- Routing Types ---

export type ResponseTier = 'direct' | 'lightweight' | 'standard' | 'full';

export interface RoutingDecision {
  /** Tier of response based on complexity */
  tier: ResponseTier;
  /** Target agent(s) for this request */
  agents: string[];
  /** Whether agents should run in parallel */
  parallel: boolean;
  /** Routing rationale (for observability) */
  rationale: string;
}

export interface CoordinatorConfig {
  /** Path to the team root (.squad/ directory) */
  teamRoot: string;
  /** Default model for routing decisions */
  model?: string;
  /** Enable parallel fan-out for multi-agent tasks */
  enableParallel?: boolean;
}

// --- Coordinator ---

export interface CoordinatorDeps {
  client?: SquadClient;
  eventBus?: EventBus;
  agentManager?: AgentSessionManager;
  hookPipeline?: HookPipeline;
  toolRegistry?: ToolRegistry;
}

export class Coordinator {
  private client: SquadClient | null = null;
  private eventBus: EventBus | null = null;
  private agentManager: AgentSessionManager | null = null;
  private hookPipeline: HookPipeline | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private config: CoordinatorConfig;
  private initialized = false;
  private unsubscribers: (() => void)[] = [];

  constructor(config: CoordinatorConfig, deps?: CoordinatorDeps) {
    this.config = config;
    if (deps) {
      this.client = deps.client ?? null;
      this.eventBus = deps.eventBus ?? null;
      this.agentManager = deps.agentManager ?? null;
      this.hookPipeline = deps.hookPipeline ?? null;
      this.toolRegistry = deps.toolRegistry ?? null;
    }
  }

  /** Initialize the coordinator: wire up event subscriptions and mark ready */
  async initialize(): Promise<void> {
    const span = tracer.startSpan('squad.coordinator.initialize');
    try {
      if (this.eventBus) {
        this.unsubscribers.push(
          this.eventBus.subscribe('session:created', (event) => {
            const s = tracer.startSpan('squad.coordinator.session.created');
            s.setAttribute('session.id', event.sessionId ?? 'unknown');
            s.end();
          }),
        );
        this.unsubscribers.push(
          this.eventBus.subscribe('session:error', (event) => {
            const s = tracer.startSpan('squad.coordinator.session.error');
            s.setAttribute('session.id', event.sessionId ?? 'unknown');
            s.end();
          }),
        );
        this.unsubscribers.push(
          this.eventBus.subscribe('session:destroyed', (event) => {
            const s = tracer.startSpan('squad.coordinator.session.destroyed');
            s.setAttribute('session.id', event.sessionId ?? 'unknown');
            s.end();
          }),
        );
      }
      this.initialized = true;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  /** Route an incoming user message to the appropriate agent(s) */
  async route(message: string): Promise<RoutingDecision> {
    const span = tracer.startSpan('squad.coordinator.route');
    span.setAttribute('message.length', message.length);
    try {
      const lower = message.toLowerCase().trim();

      let decision: RoutingDecision;

      // Direct response: status queries, factual questions
      if (/^(status|help|what is|who is|how many|show|list)\b/.test(lower)) {
        decision = {
          tier: 'direct',
          agents: [],
          parallel: false,
          rationale: `Direct response for informational query: "${message}"`,
        };
      } else {
        // Agent name mention — route to that specific agent
        const agentMention = lower.match(/@(\w+)/);
        if (agentMention) {
          decision = {
            tier: 'standard',
            agents: [agentMention[1]!],
            parallel: false,
            rationale: `Routed to mentioned agent: ${agentMention[1]!}`,
          };
        } else if (/\bteam\b/.test(lower)) {
          // Team-wide task — fan-out to all agents
          decision = {
            tier: 'full',
            agents: ['all'],
            parallel: true,
            rationale: 'Team-wide task detected — fan-out to all agents',
          };
        } else {
          // Default: route to lead agent
          decision = {
            tier: 'standard',
            agents: ['lead'],
            parallel: false,
            rationale: 'Default routing to lead agent',
          };
        }
      }

      span.setAttribute('routing.tier', decision.tier);
      span.setAttribute('target.agents', decision.agents.join(','));
      span.setAttribute('routing.reason', decision.rationale);
      return decision;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  /** Execute a routing decision: emit routing event on EventBus */
  async execute(decision: RoutingDecision, message: string): Promise<void> {
    const span = tracer.startSpan('squad.coordinator.execute');
    span.setAttribute('routing.tier', decision.tier);
    span.setAttribute('target.agents', decision.agents.join(','));
    try {
      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'coordinator:routing',
          payload: { decision, message },
          timestamp: new Date(),
        });
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  /** Graceful shutdown: unsubscribe from events and release references */
  async shutdown(): Promise<void> {
    const span = tracer.startSpan('squad.coordinator.shutdown');
    try {
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];
      this.initialized = false;
      this.client = null;
      this.eventBus = null;
      this.agentManager = null;
      this.hookPipeline = null;
      this.toolRegistry = null;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }
}
