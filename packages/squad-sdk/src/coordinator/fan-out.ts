/**
 * Parallel Fan-Out Session Spawning (M1-10, Issue #130)
 *
 * Spawns multiple agent sessions concurrently using Promise.allSettled
 * for maximum throughput. Each spawn compiles charter → resolves model
 * → creates session → sends initial message. Event aggregation collects
 * all session events into coordinator's event bus. Error isolation ensures
 * one session failure doesn't affect others.
 */

import type { AgentCharter } from '../agents/index.js';
import type { EventBus } from '../client/event-bus.js';
import type { SessionPool } from '../client/session-pool.js';
import { VALID_REASONING_EFFORTS } from '../config/models.js';
import type { CreateSessionFn, SpawnBackend, SpawnHandle, SpawnRequest } from './spawn-backend.js';

// --- Spawn Configuration ---

export interface AgentSpawnConfig {
  /** Agent name to spawn */
  agentName: string;
  /** Task description for the agent */
  task: string;
  /** Priority level */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Additional context to pass */
  context?: string;
  /** Model override (skips resolution) */
  modelOverride?: string;
  /** Reasoning effort override */
  reasoningEffortOverride?: string;
}

// --- Spawn Result ---

export interface SpawnResult {
  /** Agent name that was spawned */
  agentName: string;
  /** Session ID if spawn succeeded */
  sessionId?: string;
  /** Spawn outcome */
  status: 'success' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
}

// --- Charter and Model Resolution Dependencies ---

export interface FanOutDependencies {
  /** Charter compilation function */
  compileCharter: (agentName: string) => Promise<AgentCharter>;
  /** Model resolution function */
  resolveModel: (charter: AgentCharter, override?: string) => Promise<string>;
  /** Reasoning effort resolution function (optional for backwards compatibility) */
  resolveReasoningEffort?: (charter: AgentCharter, override?: string) => Promise<string | undefined>;
  /** Session creation function */
  createSession: CreateSessionFn;
  /** Session pool for tracking */
  sessionPool: SessionPool;
  /** Event bus for aggregation */
  eventBus: EventBus;
  /**
   * Optional spawn backend for platform-aware dispatch (Issue #1377).
   * When provided, spawn uses the backend's platform-specific mechanism
   * (e.g., sub-sessions in Copilot App). Falls back to createSession if absent.
   */
  spawnBackend?: SpawnBackend;
}

// --- Fan-Out Orchestrator ---

/**
 * Spawn multiple agents in parallel using Promise.allSettled.
 * 
 * Each spawn:
 * 1. Compile charter.md → AgentCharter
 * 2. Resolve model (override or charter or auto-select)
 * 3. Create session via SquadClient
 * 4. Send initial message with task and context
 * 5. Aggregate events to coordinator's event bus
 * 
 * Error isolation: one failure doesn't block others.
 * Returns SpawnResult[] with outcomes for each agent.
 * 
 * @param configs - Array of agent spawn configurations
 * @param deps - Injected dependencies (charter compiler, model resolver, client)
 * @returns Promise resolving to array of spawn results
 */
export async function spawnParallel(
  configs: AgentSpawnConfig[],
  deps: FanOutDependencies
): Promise<SpawnResult[]> {
  const spawnPromises = configs.map(config => spawnSingle(config, deps));
  const settledResults = await Promise.allSettled(spawnPromises);

  return settledResults.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // Rejection from spawnSingle shouldn't happen (it catches internally),
      // but handle defensively
      return {
        agentName: configs[index]!.agentName,
        status: 'failed' as const,
        error: result.reason?.message || String(result.reason),
        startTime: new Date(),
        endTime: new Date(),
      };
    }
  });
}

/**
 * Spawn a single agent session.
 * Catches all errors and returns a SpawnResult (never rejects).
 */
async function spawnSingle(
  config: AgentSpawnConfig,
  deps: FanOutDependencies
): Promise<SpawnResult> {
  const startTime = new Date();

  try {
    // Step 1: Compile charter
    const charter = await deps.compileCharter(config.agentName);

    // Step 2: Resolve model
    const model = config.modelOverride
      ? config.modelOverride
      : await deps.resolveModel(charter, config.modelOverride);

    // Step 2b: Resolve reasoning effort
    const rawEffort = deps.resolveReasoningEffort
      ? await deps.resolveReasoningEffort(charter, config.reasoningEffortOverride)
      : config.reasoningEffortOverride || charter.reasoningEffort || undefined;
    // Validate: only pass through recognized effort values
    const validEfforts = VALID_REASONING_EFFORTS as readonly string[];
    const reasoningEffort = rawEffort && rawEffort !== 'auto' && validEfforts.includes(rawEffort)
      ? rawEffort
      : undefined;

    const initialPrompt = buildInitialPrompt(config);

    // Step 3: Create session
    let sessionId: string;
    let spawnHandle: SpawnHandle | undefined;

    if (deps.spawnBackend) {
      const request: SpawnRequest = {
        agentName: config.agentName,
        prompt: initialPrompt,
        description: `${config.agentName}: ${config.task}`,
        name: config.agentName,
        model,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        background: true,
      };

      spawnHandle = await deps.spawnBackend.spawn(request);
      if (!spawnHandle.success) {
        throw new Error(spawnHandle.error || `Failed to spawn agent ${config.agentName}`);
      }

      sessionId = spawnHandle.id;
    } else {
      const session = await deps.createSession({
        model,
        clientName: `squad-agent-${config.agentName}`,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      });

      // Step 5: Send initial task message
      await session.sendMessage({
        prompt: initialPrompt,
        mode: 'immediate',
      });

      sessionId = session.sessionId;
    }

    // Step 4: Register in session pool
    deps.sessionPool.add({
      id: sessionId,
      agentName: config.agentName,
      status: 'active',
      createdAt: startTime,
    });

    if (deps.spawnBackend && spawnHandle) {
      registerSpawnRelease(deps.spawnBackend, spawnHandle, deps.eventBus);
    }

    // Step 6: Emit spawn success event
    await deps.eventBus.emit({
      type: 'session.created' as any,
      sessionId,
      payload: { agentName: config.agentName, priority: config.priority || 'normal' },
      timestamp: new Date(),
    });

    return {
      agentName: config.agentName,
      sessionId,
      status: 'success',
      startTime,
      endTime: new Date(),
    };
  } catch (error) {
    // Error isolation: one spawn failure doesn't affect others
    const errorMessage = error instanceof Error ? error.message : String(error);

    await deps.eventBus.emit({
      type: 'session.error' as any,
      sessionId: undefined,
      payload: { agentName: config.agentName, error: errorMessage },
      timestamp: new Date(),
    });

    return {
      agentName: config.agentName,
      status: 'failed',
      error: errorMessage,
      startTime,
      endTime: new Date(),
    };
  }
}

function registerSpawnRelease(
  backend: SpawnBackend,
  handle: SpawnHandle,
  eventBus: EventBus,
): void {
  let released = false;

  const releaseOnce = () => {
    if (released) return;
    released = true;
    unsubscribeStatus();
    unsubscribeDestroyed();
    unsubscribeError();
    backend.release(handle);
  };

  const unsubscribeStatus = eventBus.on('session.status_changed', (event) => {
    if (event.sessionId !== handle.id) return;
    const payload = event.payload as { newStatus?: string } | undefined;
    if (payload?.newStatus === 'idle' || payload?.newStatus === 'error' || payload?.newStatus === 'destroyed') {
      releaseOnce();
    }
  });

  const unsubscribeDestroyed = eventBus.on('session.destroyed', (event) => {
    if (event.sessionId === handle.id) {
      releaseOnce();
    }
  });

  const unsubscribeError = eventBus.on('session.error', (event) => {
    if (event.sessionId === handle.id) {
      releaseOnce();
    }
  });
}

/**
 * Build the initial prompt message for a spawned agent.
 * Includes task, priority, and optional context.
 */
function buildInitialPrompt(config: AgentSpawnConfig): string {
  const parts: string[] = [];

  if (config.priority && config.priority !== 'normal') {
    parts.push(`**Priority:** ${config.priority.toUpperCase()}`);
  }

  parts.push('', `**Task:**`, config.task);

  if (config.context) {
    parts.push('', `**Context:**`, config.context);
  }

  return parts.join('\n');
}

// --- Event Aggregation Helper ---

/**
 * Subscribe to all events from a spawned session and forward them
 * to the coordinator's event bus with agent context.
 * 
 * @param sessionId - Session ID to subscribe to
 * @param agentName - Agent name for context
 * @param sessionEventEmitter - Session's event emitter (if available)
 * @param coordinatorEventBus - Coordinator's event bus
 */
export function aggregateSessionEvents(
  sessionId: string,
  agentName: string,
  sessionEventEmitter: any, // SquadSession
  coordinatorEventBus: EventBus
): void {
  // Forward all session events to coordinator's event bus
  const eventTypes = [
    'message.delta',
    'message.complete',
    'tool.start',
    'tool.complete',
    'session.error',
    'session.complete',
  ];

  for (const eventType of eventTypes) {
    if (sessionEventEmitter.on) {
      sessionEventEmitter.on(eventType, (event: any) => {
        coordinatorEventBus.emit({
          type: eventType as any,
          sessionId,
          payload: { agentName, ...event },
          timestamp: new Date(),
        });
      });
    }
  }
}
