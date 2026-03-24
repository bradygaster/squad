/**
 * Agent Session Lifecycle (PRD 4)
 *
 * Manages the full agent lifecycle: spawn → active → idle → cleanup.
 * Compiles charter.md files into SDK CustomAgentConfig objects.
 * Injects dynamic context via session hooks instead of string templates.
 */

import { join, dirname, basename } from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import type { SquadState } from '../state/squad-state.js';
import { randomUUID } from 'node:crypto';
import { parseCharterMarkdown } from './charter-compiler.js';
import { EventBus } from '../client/event-bus.js';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import { recordAgentSpawn, recordAgentDuration, recordAgentError, recordAgentDestroy } from '../runtime/otel-metrics.js';

const tracer = trace.getTracer('squad-sdk');

// --- M1-8 Charter Compilation + M2-9 Config-driven ---
export { 
  compileCharter, 
  compileCharterFull, 
  parseCharterMarkdown,
  type CharterCompileOptions, 
  type CharterConfigOverrides, 
  type ParsedCharter,
  type CompiledCharter,
} from './charter-compiler.js';

// --- M1-9 Model Selection + M3-5 Model Fallback ---
export { 
  resolveModel,
  inferTierFromModel,
  isTierFallbackAllowed,
  ModelFallbackExecutor,
  type ModelResolutionOptions, 
  type ResolvedModel,
  type TaskType,
  type ModelTier,
  type ModelResolutionSource,
  type FallbackExecutorConfig,
  type FallbackAttempt,
  type FallbackResult,
} from './model-selector.js';

// --- M1-7 Agent Lifecycle ---
export {
  AgentLifecycleManager,
  type AgentHandle,
  type AgentStatus,
  type SpawnAgentOptions,
  type LifecycleManagerConfig,
} from './lifecycle.js';

// --- M1-11 History Shadows ---
export {
  createHistoryShadow,
  appendToHistory,
  readHistory,
  shadowExists,
  deleteHistoryShadow,
  type HistorySection,
  type ParsedHistory,
} from './history-shadow.js';

// --- M2-10 Agent Onboarding ---
export {
  onboardAgent,
  addAgentToConfig,
  type OnboardOptions,
  type OnboardResult,
} from './onboarding.js';

// --- Personal Squad Agents ---
export {
  resolvePersonalAgents,
  mergeSessionCast,
  type PersonalAgentMeta,
  type PersonalAgentManifest,
} from './personal.js';

// --- Charter Types ---

export interface AgentCharter {
  /** Agent name (e.g., 'fenster', 'verbal') */
  name: string;

  /** Display name (e.g., 'Fenster — Core Dev') */
  displayName: string;

  /** Role description */
  role: string;

  /** Expertise areas */
  expertise: string[];

  /** Working style */
  style: string;

  /** Full charter prompt content */
  prompt: string;

  /** Allowed tools for this agent */
  allowedTools?: string[];

  /** Excluded tools for this agent */
  excludedTools?: string[];

  /** Model preference from charter */
  modelPreference?: string;
}

export type AgentLifecycleState = 'pending' | 'spawning' | 'active' | 'idle' | 'error' | 'destroyed';

export interface AgentSessionInfo {
  charter: AgentCharter;
  sessionId: string | null;
  state: AgentLifecycleState;
  createdAt: Date | null;
  lastActiveAt: Date | null;
  /** Response mode: lightweight (no history), standard, full */
  responseMode: 'lightweight' | 'standard' | 'full';
}

// --- Charter Compiler ---

export class CharterCompiler {
  private storage: StorageProvider;
  private state?: SquadState;

  constructor(storage: StorageProvider = new FSStorageProvider(), state?: SquadState) {
    this.storage = storage;
    this.state = state;
  }

  /**
   * Load and compile a charter.md file into an AgentCharter.
   * Parses identity/model sections from markdown.
   */
  async compile(charterPath: string): Promise<AgentCharter> {
    const content = await this.storage.read(charterPath);
    if (content === undefined) {
      throw new Error(`Charter file not found: ${charterPath}`);
    }
    const parsed = parseCharterMarkdown(content);

    const name = parsed.identity.name ?? basename(dirname(charterPath));
    const role = parsed.identity.role ?? '';
    const expertise = parsed.identity.expertise ?? [];
    const style = parsed.identity.style ?? '';
    const displayName = `${name} — ${role}`;

    return {
      name: name.toLowerCase(),
      displayName,
      role,
      expertise,
      style,
      prompt: content,
      modelPreference: parsed.modelPreference,
    };
  }

  /**
   * Compile a charter from an agent name using SquadState.
   * Reads the charter via the typed agents collection.
   */
  async compileByName(agentName: string): Promise<AgentCharter> {
    if (!this.state) {
      throw new Error('compileByName requires SquadState — pass state to CharterCompiler constructor');
    }
    const content = await this.state.agents.get(agentName).charter();
    const parsed = parseCharterMarkdown(content);

    const name = parsed.identity.name ?? agentName;
    const role = parsed.identity.role ?? '';
    const expertise = parsed.identity.expertise ?? [];
    const style = parsed.identity.style ?? '';
    const displayName = `${name} — ${role}`;

    return {
      name: name.toLowerCase(),
      displayName,
      role,
      expertise,
      style,
      prompt: content,
      modelPreference: parsed.modelPreference,
    };
  }

  /**
   * Load all charters from the team directory.
   * When SquadState is available, uses the typed agents collection.
   * Otherwise scans .squad/agents/{name}/charter.md, skipping scribe and _alumni.
   */
  async compileAll(teamRoot: string): Promise<AgentCharter[]> {
    // Use SquadState agents collection when available
    if (this.state) {
      const names = await this.state.agents.list();
      const charters: AgentCharter[] = [];

      for (const name of names) {
        if (name === 'scribe' || name.startsWith('_')) continue;
        try {
          charters.push(await this.compileByName(name));
        } catch {
          // Skip agents without a valid charter.md
        }
      }

      return charters;
    }

    // Fallback: raw StorageProvider scan
    const agentsDir = join(teamRoot, '.squad', 'agents');
    if (!await this.storage.exists(agentsDir)) {
      throw new Error(`Agents directory not found: ${agentsDir}`);
    }
    const entries = await this.storage.list(agentsDir);
    const charters: AgentCharter[] = [];

    for (const name of entries) {
      if (name === 'scribe' || name.startsWith('_')) continue;

      const charterPath = join(agentsDir, name, 'charter.md');
      try {
        charters.push(await this.compile(charterPath));
      } catch {
        // Skip agents without a valid charter.md
      }
    }

    return charters;
  }
}

// --- Agent Session Manager ---

export class AgentSessionManager {
  private agents: Map<string, AgentSessionInfo> = new Map();
  private eventBus?: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

  /** Spawn a new agent session from a charter */
  async spawn(charter: AgentCharter, mode: 'lightweight' | 'standard' | 'full' = 'standard'): Promise<AgentSessionInfo> {
    const span = tracer.startSpan('squad.agent.spawn');
    span.setAttribute('agent.name', charter.name);
    span.setAttribute('agent.role', charter.role);
    span.setAttribute('spawn.mode', mode);
    try {
      const now = new Date();
      const info: AgentSessionInfo = {
        charter,
        sessionId: randomUUID(),
        state: 'active',
        createdAt: now,
        lastActiveAt: now,
        responseMode: mode,
      };

      this.agents.set(charter.name, info);
      recordAgentSpawn(charter.name, mode);

      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'session.created',
          sessionId: info.sessionId ?? undefined,
          agentName: charter.name,
          payload: { mode },
          timestamp: now,
        });
      }

      return info;
    } catch (err) {
      recordAgentError(charter.name, err instanceof Error ? err.constructor.name : 'unknown');
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  /** Resume an existing agent session */
  async resume(agentName: string): Promise<AgentSessionInfo> {
    const span = tracer.startSpan('squad.agent.resume');
    span.setAttribute('agent.name', agentName);
    try {
      const agent = this.agents.get(agentName);
      if (!agent) {
        throw new Error(`Agent '${agentName}' not found`);
      }

      agent.state = 'active';
      agent.lastActiveAt = new Date();
      return agent;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }

  /** Get info about a specific agent */
  getAgent(name: string): AgentSessionInfo | undefined {
    return this.agents.get(name);
  }

  /** Get all agent session info */
  getAllAgents(): AgentSessionInfo[] {
    return Array.from(this.agents.values());
  }

  /** Destroy an agent session */
  async destroy(agentName: string): Promise<void> {
    const span = tracer.startSpan('squad.agent.destroy');
    span.setAttribute('agent.name', agentName);
    try {
      const agent = this.agents.get(agentName);
      if (!agent) return;

      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'session.destroyed',
          sessionId: agent.sessionId ?? undefined,
          agentName,
          payload: {},
          timestamp: new Date(),
        });
      }

      const durationMs = agent.createdAt ? Date.now() - agent.createdAt.getTime() : 0;
      recordAgentDuration(agentName, durationMs, 'success');
      recordAgentDestroy(agentName);

      agent.state = 'destroyed';
      this.agents.delete(agentName);
    } catch (err) {
      recordAgentError(agentName, err instanceof Error ? err.constructor.name : 'unknown');
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  }
}
