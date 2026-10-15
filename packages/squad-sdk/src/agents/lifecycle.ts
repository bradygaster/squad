/**
 * Agent Session Lifecycle (M1-7)
 * 
 * Orchestrates the complete lifecycle of agent sessions:
 * - Spawning: charter compilation, model selection, session creation
 * - Management: status tracking, message handling
 * - Destruction: graceful shutdown and history saving
 */

import { SquadClientWithPool } from '../client/index.js';
import type { SquadSession, SquadSessionConfig, SquadReasoningEffort, SquadContextTier } from '../adapter/types.js';
import { compileCharterFull, type CharterCompileOptions } from './charter-compiler.js';
import {
  resolveModel,
  persistentConfigModel,
  type ModelResolution,
  type ModelResolutionOptions,
  type ModelResolutionSource,
  type TaskType,
} from './model-selector.js';
import { VALID_REASONING_EFFORTS, VALID_CONTEXT_TIERS, isModelSelectionProfile, isPreviewModel, type ModelSelectionProfile } from '../config/models.js';
import type { CostPolicyConfig, SessionCostPolicyOverride } from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';
import { ConfigurationError, SessionLifecycleError } from '../adapter/errors.js';
import * as path from 'path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import { buildActivePluginContext } from '../marketplace/plugin-state.js';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import { recordAgentSpawn, recordAgentDestroy, recordAgentError } from '../runtime/otel-metrics.js';

const tracer = trace.getTracer('squad-sdk');

/**
 * Agent handle status.
 */
export type AgentStatus = 'spawning' | 'active' | 'idle' | 'error' | 'destroyed';

/**
 * Handle to a spawned agent session.
 * Provides control and communication interface to the agent.
 */
export interface AgentHandle {
  /** Agent name (e.g., 'verbal', 'fenster') */
  agentName: string;
  /** Underlying session ID from Squad Client */
  sessionId: string;
  /** Model being used for this agent */
  model: string;
  /** How {@link model} was resolved (source, rationale, availability fallback). */
  modelResolution?: AgentModelResolution;
  /** Current agent status */
  status: AgentStatus;
  /** Timestamp when agent was spawned */
  createdAt: Date;
  /** Last activity timestamp (for idle timeout) */
  lastActivityAt: Date;
  
  /**
   * Send a message to the agent.
   * @param prompt - User message or task prompt
   */
  sendMessage(prompt: string): Promise<void>;
  
  /**
   * Destroy the agent session gracefully.
   * Saves history and cleans up resources.
   */
  destroy(): Promise<void>;
}

/**
 * Provenance of an agent's model, recorded at spawn time.
 */
export interface AgentModelResolution {
  /** Precedence layer that selected the model. */
  source: ModelResolutionSource;
  /** Human-readable explanation from the central resolver. */
  rationale: string;
  /** Quality profile in effect for the resolution. */
  profile?: ModelSelectionProfile;
  /** Model and source preferred before an availability fallback. */
  fallbackFrom?: { model: string; source: ModelResolutionSource };
  /** True when the model parameter was omitted so the platform default applies. */
  omitModel?: boolean;
}

/**
 * Options for spawning an agent.
 */
export interface SpawnAgentOptions {
  /** Agent name (e.g., 'verbal', 'fenster') */
  agentName: string;
  
  /** Task prompt to send to the agent */
  task: string;
  
  /** Task type for model selection */
  taskType?: TaskType;
  
  /** User-specified model override */
  modelOverride?: string;

  /**
   * Model picked for the current session, inherited by this spawn with source
   * `session` (below explicit override and persistent config, above charter).
   * Any id passes through, including opt-in preview models.
   */
  sessionModel?: string;

  /**
   * Model ids known to be unavailable. The resolver falls forward along the
   * fallback chain; when no candidate remains, `model` is omitted from the
   * session config so the platform default applies.
   */
  unavailableModels?: Iterable<string>;

  /**
   * Live model list from the runtime (for example the session model enum).
   * Authoritative for availability: ids not listed are skipped with visible
   * fallback provenance. Omit when no live list is known.
   */
  availableModels?: Iterable<string>;

  /**
   * Quality profile for this session; wins over `.squad/config.json`
   * `modelProfile` and legacy `economyMode`. Explicit model choices are never
   * changed by a profile.
   */
  sessionProfile?: ModelSelectionProfile;

  /** User-specified reasoning effort override */
  reasoningEffortOverride?: SquadReasoningEffort;

  /** User-specified context tier override */
  contextTierOverride?: SquadContextTier;
  
  /**
   * Per-session cost-policy override (cost-ceiling axis, issue #1080/#1183).
   * Takes precedence over the manager's persistent {@link LifecycleManagerConfig.costPolicy}.
   */
  sessionCostPolicy?: SessionCostPolicyOverride;
  
  /** Team context content (team.md) */
  teamContext?: string;
  
  /** Routing rules content */
  routingRules?: string;
  
  /** Relevant decision records */
  decisions?: string;
  
  /** Idle timeout in milliseconds (default: 5 minutes) */
  idleTimeout?: number;
}

/**
 * Configuration for the lifecycle manager.
 */
export interface LifecycleManagerConfig {
  /** Squad client instance */
  client: SquadClientWithPool;
  
  /** Path to team root directory */
  teamRoot: string;
  
  /** Storage provider for file I/O (default: FSStorageProvider) */
  storage?: StorageProvider;
  
  /** Default idle timeout (default: 5 minutes) */
  defaultIdleTimeout?: number;
  
  /**
   * Persistent cost policy applied to all spawns (cost-ceiling axis).
   * Overridable per-spawn via {@link SpawnAgentOptions.sessionCostPolicy}.
   */
  costPolicy?: CostPolicyConfig;
  
  /**
   * Optional event bus used to surface cost-policy actions
   * (downgrades / warnings). When absent, warnings still go to console.
   */
  eventBus?: EventBus;
}

/**
 * Manages the full lifecycle of agent sessions.
 * 
 * Coordinates charter compilation, model selection, session creation,
 * and graceful shutdown with history persistence.
 */
export class AgentLifecycleManager {
  private client: SquadClientWithPool;
  private teamRoot: string;
  private storage: StorageProvider;
  private defaultIdleTimeout: number;
  private costPolicy?: CostPolicyConfig;
  private eventBus?: EventBus;
  private agents: Map<string, AgentHandleImpl> = new Map();
  /** Preview models already reported as unavailable (one notice per model). */
  private unavailablePreviewNotified: Set<string> = new Set();
  private idleCheckTimer: NodeJS.Timeout | null = null;
  
  constructor(config: LifecycleManagerConfig) {
    this.client = config.client;
    this.teamRoot = config.teamRoot;
    this.storage = config.storage ?? new FSStorageProvider();
    this.defaultIdleTimeout = config.defaultIdleTimeout ?? 300_000; // 5 minutes
    this.costPolicy = config.costPolicy;
    this.eventBus = config.eventBus;
    
    // Start idle timeout checker
    this.startIdleChecker();
  }
  
  /**
   * Spawn a new agent with full lifecycle setup.
   * 
   * Pipeline:
   * 1. Read charter.md from team root
   * 2. Compile charter with team context
   * 3. Resolve model via the central resolver (persistent config included)
   * 4. Create session via Squad Client
   * 5. Set up event handlers
   * 6. Return AgentHandle
   * 
   * @param options - Spawn options
   * @returns Agent handle for control and communication
   */
  async spawnAgent(options: SpawnAgentOptions): Promise<AgentHandle> {
    const span = tracer.startSpan('squad.lifecycle.spawnAgent');
    span.setAttribute('agent.name', options.agentName);
    span.setAttribute('task.type', options.taskType ?? 'code');
    const {
      agentName,
      task,
      taskType = 'code',
      modelOverride,
      sessionModel,
      unavailableModels,
      availableModels,
      sessionProfile,
      reasoningEffortOverride,
      contextTierOverride,
      sessionCostPolicy,
      teamContext,
      routingRules,
      decisions,
      idleTimeout = this.defaultIdleTimeout,
    } = options;
    
    try {
      // Step 1: Read charter.md
      const squadCharterPath = path.join(this.teamRoot, '.squad', 'agents', agentName, 'charter.md');
      const legacyCharterPath = path.join(this.teamRoot, '.ai-team', 'agents', agentName, 'charter.md');
      let charterPath = squadCharterPath;
      let charterContent = await this.storage.read(charterPath);
      if (charterContent === undefined) {
        charterPath = legacyCharterPath;
        charterContent = await this.storage.read(charterPath);
      }

      if (charterContent === undefined) {
        throw new ConfigurationError(
          `Charter not found for agent '${agentName}' at ${charterPath}`,
          {
            agentName,
            operation: 'spawnAgent',
            timestamp: new Date(),
            metadata: { charterPath },
          }
        );
      }
      
      // Step 2: Compile charter
      const compileOptions: CharterCompileOptions = {
        agentName,
        charterPath,
        charterContent,
        teamContext,
        routingRules,
        decisions,
        pluginContext: await buildActivePluginContext(this.storage, path.join(this.teamRoot, '.squad')),
      };
      
      const agentConfig = compileCharterFull(compileOptions);
      
      // Step 3: Resolve model (with cost-policy finalization, issue #1080/#1183).
      // Persistent .squad/config.json lives beside the agents/ directory.
      const squadDir = path.dirname(path.dirname(path.dirname(charterPath)));
      const persistent = await this.readPersistentModelConfig(squadDir);
      const modelOptions: ModelResolutionOptions = {
        userOverride: modelOverride,
        configModel: persistentConfigModel(persistent, agentName),
        sessionModel,
        economyMode: persistent?.economyMode === true,
        profile: isModelSelectionProfile(persistent?.modelProfile) ? persistent.modelProfile : undefined,
        sessionProfile,
        charterPreference: agentConfig.resolvedModel !== undefined
          ? agentConfig.resolvedModel
          : this.extractModelPreference(charterContent),
        taskType,
        agentRole: agentName,
        config: this.costPolicy ? { costPolicy: this.costPolicy } : undefined,
        sessionCostPolicy,
        unavailableModels,
        availableModels,
      };
      
      let resolvedModel = resolveModel(modelOptions);
      span.setAttribute('model.id', resolvedModel.model);
      span.setAttribute('model.source', resolvedModel.source);
      if (resolvedModel.profile) span.setAttribute('model.profile', resolvedModel.profile);
      await this.emitModelResolved(agentName, resolvedModel);
      if (resolvedModel.fallbackFrom && isPreviewModel(resolvedModel.fallbackFrom.model)) {
        await this.noticePreviewUnavailable(agentName, resolvedModel.fallbackFrom.model, resolvedModel);
      }
      
      // Surface the cost-policy outcome — this was the #1089 bug: the policy
      // result was computed but never wired/emitted. Never swallow it.
      if (resolvedModel.policy && resolvedModel.policy.action !== 'none') {
        await this.emitPolicyOutcome(agentName, resolvedModel);
      }
      
      // Step 4: Create session
      // Use compiled charter's resolved reasoning effort (already validated/normalized),
      // with spawn-time override taking precedence. Validate before passing to session.
      const rawEffort = reasoningEffortOverride
        || agentConfig.resolvedReasoningEffort
        || undefined;
      const validEffort = rawEffort && rawEffort !== 'auto' && (VALID_REASONING_EFFORTS as readonly string[]).includes(rawEffort)
        ? rawEffort as SquadReasoningEffort
        : undefined;
      // Use compiled charter's resolved context tier (already validated/normalized),
      // with spawn-time override taking precedence. Validate before passing to session.
      const rawTier = contextTierOverride
        || agentConfig.resolvedContextTier
        || undefined;
      const validTier = rawTier && rawTier !== 'auto' && (VALID_CONTEXT_TIERS as readonly string[]).includes(rawTier)
        ? rawTier as SquadContextTier
        : undefined;
      const buildSessionConfig = (resolved: ModelResolution): SquadSessionConfig => ({
        ...(resolved.omitModel ? {} : { model: resolved.model }),
        systemMessage: {
          content: agentConfig.prompt,
        },
        ...(validEffort ? { reasoningEffort: validEffort } : {}),
        ...(validTier ? { contextTier: validTier } : {}),
      });
      
      let session: SquadSession;
      try {
        session = await this.client.createSession(buildSessionConfig(resolvedModel));
      } catch (createError) {
        // A profile-picked preview model can be rejected at session creation
        // (org policy, preview features off). Fall forward along its chain
        // once instead of failing the spawn; explicit picks are not retried.
        const rejected = resolvedModel.model;
        if (resolvedModel.omitModel || resolvedModel.source !== 'task-auto' || !isPreviewModel(rejected)) {
          throw createError;
        }
        resolvedModel = resolveModel({
          ...modelOptions,
          unavailableModels: [...(unavailableModels ?? []), rejected],
        });
        span.setAttribute('model.id', resolvedModel.model);
        await this.emitModelResolved(agentName, resolvedModel);
        await this.noticePreviewUnavailable(agentName, rejected, resolvedModel);
        session = await this.client.createSession(buildSessionConfig(resolvedModel));
      }
      
      // Step 5: Create handle with event handlers
      const handle = new AgentHandleImpl({
        agentName,
        sessionId: session.sessionId,
        model: resolvedModel.model,
        modelResolution: {
          source: resolvedModel.source,
          rationale: resolvedModel.rationale,
          ...(resolvedModel.profile ? { profile: resolvedModel.profile } : {}),
          ...(resolvedModel.fallbackFrom ? { fallbackFrom: resolvedModel.fallbackFrom } : {}),
          ...(resolvedModel.omitModel ? { omitModel: true } : {}),
        },
        session,
        idleTimeout,
        onDestroy: () => this.agents.delete(session.sessionId),
      });
      
      this.agents.set(session.sessionId, handle);
      recordAgentSpawn(agentName, 'lifecycle');
      
      // Step 6: Send initial task
      await handle.sendMessage(task);
      
      return handle;
      
    } catch (error) {
      recordAgentError(agentName, error instanceof Error ? error.constructor.name : 'unknown');
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw new SessionLifecycleError(
        `Failed to spawn agent '${agentName}': ${error instanceof Error ? error.message : String(error)}`,
        {
          agentName,
          operation: 'spawnAgent',
          timestamp: new Date(),
        },
        false,
        error instanceof Error ? error : undefined
      );
    } finally {
      span.end();
    }
  }
  
  /**
   * Destroy an agent gracefully.
   * Saves history and cleans up session.
   * 
   * @param handle - Agent handle to destroy
   */
  async destroyAgent(handle: AgentHandle): Promise<void> {
    const span = tracer.startSpan('squad.lifecycle.destroyAgent');
    span.setAttribute('agent.name', handle.agentName);
    try {
      await handle.destroy();
      this.agents.delete(handle.sessionId);
      recordAgentDestroy(handle.agentName);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }
  
  /**
   * List all active agent sessions.
   * 
   * @returns Array of active agent handles
   */
  listActive(): AgentHandle[] {
    return Array.from(this.agents.values()).filter(
      agent => agent.status !== 'destroyed'
    );
  }
  
  /**
   * Get agent handle by session ID.
   * 
   * @param sessionId - Session ID to look up
   * @returns Agent handle or undefined
   */
  getAgent(sessionId: string): AgentHandle | undefined {
    return this.agents.get(sessionId);
  }
  
  /**
   * Shutdown all agents gracefully.
   */
  async shutdown(): Promise<void> {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    
    const destroyPromises = Array.from(this.agents.values()).map(
      agent => agent.destroy().catch(err => {
        console.error(`Failed to destroy agent ${agent.agentName}:`, err);
      })
    );
    
    await Promise.all(destroyPromises);
    this.agents.clear();
  }
  
  /**
   * Start periodic idle timeout checker.
   * @private
   */
  private startIdleChecker(): void {
    this.idleCheckTimer = setInterval(() => {
      const now = Date.now();
      
      for (const agent of this.agents.values()) {
        const idleTimeMs = now - agent.lastActivityAt.getTime();
        
        if (idleTimeMs > this.defaultIdleTimeout && agent.status === 'active') {
          agent.markIdle();
        }
      }
    }, 30_000); // Check every 30 seconds
  }
  
  /**
   * Extract model preference from charter content.
   * @private
   */
  private extractModelPreference(charterContent: string): string | undefined {
    const modelMatch = charterContent.match(/##\s+Model\s*\n[\s\S]*?\*\*Preferred:\*\*\s*(.+)/i);
    return modelMatch ? modelMatch[1]!.trim() : undefined;
  }

  /**
   * Read the persistent model fields of `.squad/config.json`, if present.
   * @private
   */
  private async readPersistentModelConfig(
    squadDir: string,
  ): Promise<
    { defaultModel?: unknown; agentModelOverrides?: unknown; economyMode?: unknown; modelProfile?: unknown } | undefined
  > {
    const raw = await this.storage.read(path.join(squadDir, 'config.json'));
    if (raw === undefined) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Record model-resolution provenance as an `agent:milestone` event
   * (`event: 'model.resolved'`) when an event bus is configured.
   * @private
   */
  private async emitModelResolved(agentName: string, resolved: ModelResolution): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit({
      type: 'agent:milestone',
      agentName,
      payload: {
        event: 'model.resolved',
        model: resolved.model,
        source: resolved.source,
        rationale: resolved.rationale,
        ...(resolved.profile ? { profile: resolved.profile } : {}),
        ...(resolved.fallbackFrom ? { fallbackFrom: resolved.fallbackFrom } : {}),
        ...(resolved.omitModel ? { omitModel: true } : {}),
      },
      timestamp: new Date(),
    });
  }

  /**
   * Tell the user, once per preview model per manager, that an opt-in preview
   * model is unavailable and which model is used instead. Logged via
   * console.warn and emitted as `agent:milestone` (`event: 'model.unavailable'`).
   * @private
   */
  private async noticePreviewUnavailable(
    agentName: string,
    previewModel: string,
    resolved: ModelResolution,
  ): Promise<void> {
    const key = previewModel.toLowerCase();
    if (this.unavailablePreviewNotified.has(key)) return;
    this.unavailablePreviewNotified.add(key);
    const replacement = resolved.omitModel ? 'the platform default model' : `'${resolved.model}'`;
    const message =
      `Preview model '${previewModel}' is not available (plan, org policy, or preview features); ` +
      `using ${replacement} instead. This notice is shown once.`;
    console.warn(`[squad:model] ${message}`);
    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'agent:milestone',
        agentName,
        payload: {
          event: 'model.unavailable',
          model: previewModel,
          replacement: resolved.omitModel ? null : resolved.model,
          message,
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Surface a cost-policy outcome (downgrade / warn-allow / fail-closed).
   *
   * Emits an `agent:milestone` event (`event: 'model.policy'`) on the bus when
   * present, and always logs any human-readable warning via console.warn so the
   * signal is never silently dropped (the #1089 defect this fix addresses).
   * @private
   */
  private async emitPolicyOutcome(
    agentName: string,
    resolved: import('./model-selector.js').ResolvedModel,
  ): Promise<void> {
    const outcome = resolved.policy;
    if (!outcome) return;

    if (outcome.warning) {
      console.warn(`[squad:cost-policy] ${agentName}: ${outcome.warning}`);
    }

    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'agent:milestone',
        agentName,
        payload: {
          event: 'model.policy',
          action: outcome.action,
          originalModel: outcome.originalModel,
          finalModel: outcome.finalModel,
          warning: outcome.warning,
        },
        timestamp: new Date(),
      });
    }
  }
}

/**
 * Internal implementation of AgentHandle.
 * @private
 */
class AgentHandleImpl implements AgentHandle {
  agentName: string;
  sessionId: string;
  model: string;
  modelResolution?: AgentModelResolution;
  status: AgentStatus;
  createdAt: Date;
  lastActivityAt: Date;
  
  private session: SquadSession;
  private idleTimeout: number;
  private onDestroy: () => void;
  
  constructor(config: {
    agentName: string;
    sessionId: string;
    model: string;
    modelResolution?: AgentModelResolution;
    session: SquadSession;
    idleTimeout: number;
    onDestroy: () => void;
  }) {
    this.agentName = config.agentName;
    this.sessionId = config.sessionId;
    this.model = config.model;
    this.modelResolution = config.modelResolution;
    this.session = config.session;
    this.idleTimeout = config.idleTimeout;
    this.onDestroy = config.onDestroy;
    
    this.status = 'active';
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
  }
  
  async sendMessage(prompt: string): Promise<void> {
    if (this.status === 'destroyed') {
      throw new SessionLifecycleError(
        'Cannot send message to destroyed agent',
        {
          agentName: this.agentName,
          sessionId: this.sessionId,
          operation: 'sendMessage',
          timestamp: new Date(),
        }
      );
    }
    
    try {
      this.status = 'active';
      this.lastActivityAt = new Date();
      
      // Send message via session
      await this.session.sendMessage({ prompt });
      
    } catch (error) {
      this.status = 'error';
      throw new SessionLifecycleError(
        `Failed to send message to agent '${this.agentName}': ${error instanceof Error ? error.message : String(error)}`,
        {
          agentName: this.agentName,
          sessionId: this.sessionId,
          operation: 'sendMessage',
          timestamp: new Date(),
        },
        false,
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async destroy(): Promise<void> {
    if (this.status === 'destroyed') {
      return;
    }
    
    try {
      this.status = 'destroyed';
      
      // Clean up session
      await this.session.close();
      
      // Notify lifecycle manager
      this.onDestroy();
      
    } catch (error) {
      throw new SessionLifecycleError(
        `Failed to destroy agent '${this.agentName}': ${error instanceof Error ? error.message : String(error)}`,
        {
          agentName: this.agentName,
          sessionId: this.sessionId,
          operation: 'destroy',
          timestamp: new Date(),
        },
        false,
        error instanceof Error ? error : undefined
      );
    }
  }
  
  /**
   * Mark agent as idle (called by lifecycle manager).
   * @internal
   */
  markIdle(): void {
    if (this.status === 'active') {
      this.status = 'idle';
    }
  }
}
