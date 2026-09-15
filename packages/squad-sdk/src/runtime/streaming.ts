/**
 * Streaming Event Pipeline
 *
 * Processes streaming events from Copilot SDK sessions including message deltas,
 * reasoning deltas, and usage/cost tracking.
 *
 * @module runtime/streaming
 */

import type { EventBus } from './event-bus.js';
import {
  recordContextUtilization,
  recordTokenUsage,
  recordTimeToFirstToken,
  recordResponseDuration,
  recordTokensPerSecond,
} from './otel-metrics.js';
import {
  ContextUtilizationTracker,
  type ContextUtilizationSnapshot,
  type ContextWindowResolver,
} from './context-utilization.js';

// ============================================================================
// Event Types
// ============================================================================

/** A chunk of assistant message content. */
export interface StreamDelta {
  type: 'message_delta';
  sessionId: string;
  agentName?: string;
  content: string;
  /** Monotonically increasing index within the message. */
  index: number;
  timestamp: Date;
}

/** Token usage and cost data for a completed turn. */
export interface UsageEvent {
  type: 'usage';
  sessionId: string;
  agentName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD (may be 0 if pricing unavailable). */
  estimatedCost: number;
  timestamp: Date;
}

/** Exact context-window accounting emitted by supported runtimes. */
export interface ContextUsageEvent {
  type: 'context_usage';
  sessionId: string;
  agentName?: string;
  currentTokens: number;
  tokenLimit: number;
  messagesLength?: number;
  conversationTokens?: number;
  systemTokens?: number;
  toolDefinitionsTokens?: number;
  timestamp: Date;
}

/** A chunk of model reasoning/thinking content. */
export interface ReasoningDelta {
  type: 'reasoning_delta';
  sessionId: string;
  agentName?: string;
  content: string;
  index: number;
  timestamp: Date;
}

/** Union of all streaming event types. */
export type StreamingEvent = StreamDelta | UsageEvent | ContextUsageEvent | ReasoningDelta;

// ============================================================================
// Handler Types
// ============================================================================

export type DeltaHandler = (event: StreamDelta) => void | Promise<void>;
export type UsageHandler = (event: UsageEvent) => void | Promise<void>;
export type ContextUtilizationHandler = (snapshot: ContextUtilizationSnapshot) => void | Promise<void>;
export type ReasoningHandler = (event: ReasoningDelta) => void | Promise<void>;

// ============================================================================
// Usage Summary
// ============================================================================

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  byAgent: Map<string, AgentUsage>;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  model: string;
  turnCount: number;
}

export interface StreamingPipelineOptions {
  eventBus?: EventBus;
  resolveContextWindow?: ContextWindowResolver;
  contextWarningThreshold?: number;
}

// ============================================================================
// StreamingPipeline
// ============================================================================

/**
 * Processes streaming events from SDK sessions.
 *
 * Allows registration of handlers for message deltas, reasoning deltas,
 * and usage events. Aggregates token counts across all active sessions.
 */
export class StreamingPipeline {
  /** Cap usage history to prevent unbounded memory growth in long sessions. */
  static readonly MAX_USAGE_EVENTS = 1000;

  private deltaHandlers: Set<DeltaHandler> = new Set();
  private usageHandlers: Set<UsageHandler> = new Set();
  private contextUtilizationHandlers: Set<ContextUtilizationHandler> = new Set();
  private reasoningHandlers: Set<ReasoningHandler> = new Set();
  private attachedSessions: Set<string> = new Set();
  private usageData: UsageEvent[] = [];

  /** Per-session message start timestamps for latency tracking. */
  private messageStartTimes: Map<string, number> = new Map();
  /** Per-session flag tracking whether first token has been recorded. */
  private firstTokenRecorded: Map<string, boolean> = new Map();
  private latestModels: Map<string, string> = new Map();
  private readonly eventBus?: EventBus;
  private readonly contextUtilizationTracker: ContextUtilizationTracker;

  constructor(options: StreamingPipelineOptions = {}) {
    this.eventBus = options.eventBus;
    this.contextUtilizationTracker = new ContextUtilizationTracker({
      warningThreshold: options.contextWarningThreshold,
      resolveContextWindow: options.resolveContextWindow,
    });
  }

  /** Register a handler for message deltas. */
  onDelta(handler: DeltaHandler): () => void {
    this.deltaHandlers.add(handler);
    return () => this.deltaHandlers.delete(handler);
  }

  /** Register a handler for token usage/cost data. */
  onUsage(handler: UsageHandler): () => void {
    this.usageHandlers.add(handler);
    return () => this.usageHandlers.delete(handler);
  }

  /** Register a handler for context-window utilization updates. */
  onContextUtilization(handler: ContextUtilizationHandler): () => void {
    this.contextUtilizationHandlers.add(handler);
    return () => this.contextUtilizationHandlers.delete(handler);
  }

  /** Register a handler for reasoning deltas. */
  onReasoning(handler: ReasoningHandler): () => void {
    this.reasoningHandlers.add(handler);
    return () => this.reasoningHandlers.delete(handler);
  }

  /**
   * Mark the start of a new message for a session.
   * Call this before sending a message to enable TTFT and duration tracking.
   */
  markMessageStart(sessionId: string): void {
    this.messageStartTimes.set(sessionId, Date.now());
    this.firstTokenRecorded.set(sessionId, false);
  }

  /** Wire up handlers to a session's event stream. */
  attachToSession(sessionId: string): void {
    if (this.attachedSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already attached`);
    }
    this.attachedSessions.add(sessionId);
  }

  /** Clean up handlers for a session. */
  detachFromSession(sessionId: string): void {
    this.attachedSessions.delete(sessionId);
  }

  /** Check whether a session is currently attached. */
  isAttached(sessionId: string): boolean {
    return this.attachedSessions.has(sessionId);
  }

  /** Returns all currently attached session IDs. */
  getAttachedSessions(): ReadonlySet<string> {
    return this.attachedSessions;
  }

  /**
   * Process an incoming streaming event.
   * Dispatches to the correct set of handlers based on event type.
   */
  async processEvent(event: StreamingEvent): Promise<void> {
    if (!this.attachedSessions.has(event.sessionId)) {
      return; // Ignore events from unattached sessions
    }

    switch (event.type) {
      case 'message_delta':
        // Record TTFT on first delta (index === 0) for this message
        if (event.index === 0 && !this.firstTokenRecorded.get(event.sessionId)) {
          this.firstTokenRecorded.set(event.sessionId, true);
          const startTime = this.messageStartTimes.get(event.sessionId);
          if (startTime !== undefined) {
            recordTimeToFirstToken(Date.now() - startTime);
          }
        }
        await this.dispatchDelta(event);
        break;
      case 'usage': {
        this.usageData.push(event);
        // Evict oldest events when history exceeds cap (FIFO)
        if (this.usageData.length > StreamingPipeline.MAX_USAGE_EVENTS) {
          this.usageData = this.usageData.slice(-StreamingPipeline.MAX_USAGE_EVENTS);
        }
        await this.dispatchUsage(event);
        recordTokenUsage(event);
        this.latestModels.set(event.sessionId, event.model);
        await this.publishContextUtilization(this.contextUtilizationTracker.recordEstimated({
          sessionId: event.sessionId,
          agentName: event.agentName,
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          timestamp: event.timestamp,
        }));
        // Record response duration and tokens/sec when usage arrives
        const msgStart = this.messageStartTimes.get(event.sessionId);
        if (msgStart !== undefined) {
          const durationMs = Date.now() - msgStart;
          recordResponseDuration(durationMs);
          if (durationMs > 0 && event.outputTokens > 0) {
            recordTokensPerSecond((event.outputTokens / durationMs) * 1000);
          }
          this.messageStartTimes.delete(event.sessionId);
          this.firstTokenRecorded.delete(event.sessionId);
        }
        break;
      }
      case 'context_usage':
        await this.publishContextUtilization(this.contextUtilizationTracker.recordRuntime({
          sessionId: event.sessionId,
          agentName: event.agentName,
          model: this.latestModels.get(event.sessionId),
          currentTokens: event.currentTokens,
          tokenLimit: event.tokenLimit,
          timestamp: event.timestamp,
        }));
        break;
      case 'reasoning_delta':
        await this.dispatchReasoning(event);
        break;
    }
  }

  /** Aggregate token counts and cost across all sessions. */
  getUsageSummary(): UsageSummary {
    const byAgent = new Map<string, AgentUsage>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCost = 0;

    for (const event of this.usageData) {
      totalInputTokens += event.inputTokens;
      totalOutputTokens += event.outputTokens;
      estimatedCost += event.estimatedCost;

      const agentKey = event.agentName ?? 'unknown';
      const existing = byAgent.get(agentKey);
      if (existing) {
        existing.inputTokens += event.inputTokens;
        existing.outputTokens += event.outputTokens;
        existing.estimatedCost += event.estimatedCost;
        existing.turnCount += 1;
        existing.model = event.model; // keep latest model
      } else {
        byAgent.set(agentKey, {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          estimatedCost: event.estimatedCost,
          model: event.model,
          turnCount: 1,
        });
      }
    }

    return { totalInputTokens, totalOutputTokens, estimatedCost, byAgent };
  }

  /** Return the latest context-window utilization sample for a session. */
  getContextUtilization(sessionId: string): ContextUtilizationSnapshot | undefined {
    return this.contextUtilizationTracker.getLatest(sessionId);
  }

  /** Return the latest context-window utilization samples for all sessions. */
  getAllContextUtilizations(): ContextUtilizationSnapshot[] {
    return this.contextUtilizationTracker.getAll();
  }

  /** Remove all handlers and detach all sessions. */
  clear(): void {
    this.deltaHandlers.clear();
    this.usageHandlers.clear();
    this.contextUtilizationHandlers.clear();
    this.reasoningHandlers.clear();
    this.attachedSessions.clear();
    this.usageData = [];
    this.messageStartTimes.clear();
    this.firstTokenRecorded.clear();
    this.latestModels.clear();
    this.contextUtilizationTracker.clear();
  }

  // ---------- Private ----------

  private async dispatchDelta(event: StreamDelta): Promise<void> {
    for (const handler of this.deltaHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) await result;
      } catch {
        // Isolate handler errors
      }
    }
  }

  private async dispatchUsage(event: UsageEvent): Promise<void> {
    for (const handler of this.usageHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) await result;
      } catch {
        // Isolate handler errors
      }
    }
  }

  private async dispatchReasoning(event: ReasoningDelta): Promise<void> {
    for (const handler of this.reasoningHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) await result;
      } catch {
        // Isolate handler errors
      }
    }
  }

  private async publishContextUtilization(
    snapshot: ContextUtilizationSnapshot | undefined,
  ): Promise<void> {
    if (!snapshot) return;

    recordContextUtilization(snapshot);
    for (const handler of this.contextUtilizationHandlers) {
      try {
        const result = handler(snapshot);
        if (result instanceof Promise) await result;
      } catch {
        // Isolate handler errors
      }
    }

    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'context:utilization',
        sessionId: snapshot.sessionId,
        agentName: snapshot.agentName,
        payload: {
          occupiedTokens: snapshot.occupiedTokens,
          contextWindowTokens: snapshot.contextWindowTokens,
          utilization: snapshot.utilization,
          warningThreshold: snapshot.warningThreshold,
          warning: snapshot.warning,
          thresholdCrossed: snapshot.thresholdCrossed,
          source: snapshot.source,
          model: snapshot.model,
        },
        timestamp: snapshot.timestamp,
      });
    }
  }
}
