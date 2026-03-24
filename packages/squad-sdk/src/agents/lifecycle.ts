/**
 * Agent Session Lifecycle (M1-7)
 * 
 * Orchestrates the complete lifecycle of agent sessions:
 * - Spawning: charter compilation, model selection, session creation
 * - Management: status tracking, message handling
 * - Destruction: graceful shutdown and history saving
 */

import { SquadClientWithPool } from '../client/index.js';
import type { SquadSession, SquadSessionConfig } from '../adapter/types.js';
import { compileCharter, type CharterCompileOptions } from './charter-compiler.js';
import { resolveModel, type ModelResolutionOptions, type TaskType } from './model-selector.js';
import { ConfigurationError, SessionLifecycleError } from '../adapter/errors.js';
import * as path from 'path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';
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
  private agents: Map<string, AgentHandleImpl> = new Map();
  private idleCheckTimer: NodeJS.Timeout | null = null;
  
  constructor(config: LifecycleManagerConfig) {
    this.client = config.client;
    this.teamRoot = config.teamRoot;
    this.storage = config.storage ?? new FSStorageProvider();
    this.defaultIdleTimeout = config.defaultIdleTimeout ?? 300_000; // 5 minutes
    
    // Start idle timeout checker
    this.startIdleChecker();
  }
  
  /**
   * Spawn a new agent with full lifecycle setup.
   * 
   * Pipeline:
   * 1. Read charter.md from team root
   * 2. Compile charter with team context
   * 3. Resolve model using 4-layer priority
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
      teamContext,
      routingRules,
      decisions,
      idleTimeout = this.defaultIdleTimeout,
    } = options;
    
    try {
      // Step 1: Read charter.md
      const charterPath = path.join(this.teamRoot, '.ai-team', 'agents', agentName, 'charter.md');
      const charterContent = await this.storage.read(charterPath);

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
        teamContext,
        routingRules,
        decisions,
      };
      
      const agentConfig = compileCharter(compileOptions);
      
      // Step 3: Resolve model
      const modelOptions: ModelResolutionOptions = {
        userOverride: modelOverride,
        charterPreference: agentConfig.prompt.includes('## Model') 
          ? this.extractModelPreference(charterContent)
          : undefined,
        taskType,
        agentRole: agentName,
      };
      
      const resolvedModel = resolveModel(modelOptions);
      
      // Step 4: Create session
      const sessionConfig: SquadSessionConfig = {
        model: resolvedModel.model,
        systemMessage: {
          content: agentConfig.prompt,
        },
      };
      
      const session = await this.client.createSession(sessionConfig);
      
      // Step 5: Create handle with event handlers
      const handle = new AgentHandleImpl({
        agentName,
        sessionId: session.sessionId,
        model: resolvedModel.model,
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
}

/**
 * Internal implementation of AgentHandle.
 * @private
 */
class AgentHandleImpl implements AgentHandle {
  agentName: string;
  sessionId: string;
  model: string;
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
    session: SquadSession;
    idleTimeout: number;
    onDestroy: () => void;
  }) {
    this.agentName = config.agentName;
    this.sessionId = config.sessionId;
    this.model = config.model;
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
