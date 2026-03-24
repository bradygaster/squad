/**
 * Ralph — Work Monitor (PRD 8)
 *
 * Persistent SDK session that monitors agent work in real time.
 * Replaces ephemeral polling spawns with an event-driven observer
 * that accumulates knowledge across monitoring cycles.
 *
 * Three monitoring layers:
 *   1. In-session: Event subscriptions via EventBus
 *   2. Watchdog: Periodic health checks on session pool
 *   3. Cloud heartbeat: External health signal (future)
 */

import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { EventBus, SquadEvent } from '../runtime/event-bus.js';

// --- Monitor Types ---

export interface MonitorConfig {
  /** Team root directory */
  teamRoot: string;

  /** Health check interval (ms, default: 30000) */
  healthCheckInterval?: number;

  /** Stale session threshold (ms, default: 300000) */
  staleSessionThreshold?: number;

  /** Path to persist monitor state for crash recovery */
  statePath?: string;
}

export interface AgentWorkStatus {
  agentName: string;
  sessionId: string;
  status: 'working' | 'idle' | 'stale' | 'error';
  lastActivity: Date;
  currentTask?: string;
  milestones: string[];
}

export interface MonitorState {
  /** Timestamp of last health check */
  lastHealthCheck: Date | null;
  /** Per-agent work status */
  agents: Map<string, AgentWorkStatus>;
  /** Accumulated observations across cycles */
  observations: string[];
}

// --- Ralph Monitor ---

export class RalphMonitor {
  private config: MonitorConfig;
  private state: MonitorState;
  private storage: StorageProvider;
  private eventBus: EventBus | null = null;
  private unsubscribers: (() => void)[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: MonitorConfig, storage: StorageProvider = new FSStorageProvider()) {
    this.config = config;
    this.storage = storage;
    this.state = {
      lastHealthCheck: null,
      agents: new Map(),
      observations: [],
    };
  }

  /** Start monitoring — subscribe to EventBus and begin health checks */
  async start(eventBus: EventBus): Promise<void> {
    this.eventBus = eventBus;

    // Subscribe to session lifecycle events
    this.unsubscribers.push(
      eventBus.subscribe('session:created', (event) => this.handleEvent(event)),
    );
    this.unsubscribers.push(
      eventBus.subscribe('session:destroyed', (event) => this.handleEvent(event)),
    );
    this.unsubscribers.push(
      eventBus.subscribe('session:error', (event) => this.handleEvent(event)),
    );
    this.unsubscribers.push(
      eventBus.subscribe('agent:milestone', (event) => this.handleEvent(event)),
    );

    const interval = this.config.healthCheckInterval ?? 30_000;
    this.healthCheckTimer = setInterval(() => {
      void this.healthCheck();
    }, interval);
  }

  /** Handle an incoming event from the EventBus */
  private handleEvent(event: SquadEvent): void {
    const agentName = event.agentName ?? 'unknown';
    const sessionId = event.sessionId ?? 'unknown';

    switch (event.type) {
      case 'session:created': {
        this.state.agents.set(agentName, {
          agentName,
          sessionId,
          status: 'working',
          lastActivity: event.timestamp,
          milestones: [],
        });
        break;
      }
      case 'session:destroyed': {
        this.state.agents.delete(agentName);
        break;
      }
      case 'session:error': {
        const existing = this.state.agents.get(agentName);
        if (existing) {
          existing.status = 'error';
          existing.lastActivity = event.timestamp;
        }
        break;
      }
      case 'agent:milestone': {
        const agent = this.state.agents.get(agentName);
        if (agent) {
          const payload = event.payload as { milestone?: string; task?: string } | null;
          if (payload?.milestone) {
            agent.milestones.push(payload.milestone);
          }
          if (payload?.task) {
            agent.currentTask = payload.task;
          }
          agent.lastActivity = event.timestamp;
          agent.status = 'working';
        }
        break;
      }
    }
  }

  /** Run a health check across all tracked agent sessions */
  async healthCheck(): Promise<AgentWorkStatus[]> {
    const now = new Date();
    const staleThreshold = this.config.staleSessionThreshold ?? 300_000;

    for (const agent of this.state.agents.values()) {
      if (agent.status === 'error') continue;
      const elapsed = now.getTime() - agent.lastActivity.getTime();
      agent.status = elapsed > staleThreshold ? 'stale' : agent.status === 'stale' ? 'idle' : agent.status;
    }

    this.state.lastHealthCheck = now;
    return Array.from(this.state.agents.values());
  }

  /** Get current work status for all agents */
  getStatus(): AgentWorkStatus[] {
    return Array.from(this.state.agents.values());
  }

  /** Stop monitoring and persist final state */
  async stop(): Promise<void> {
    // Unsubscribe from EventBus
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    // Stop health check timer
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Persist state if statePath is configured
    if (this.config.statePath) {
      const serializable = {
        lastHealthCheck: this.state.lastHealthCheck?.toISOString() ?? null,
        agents: Array.from(this.state.agents.entries()),
        observations: this.state.observations,
      };
      await this.storage.write(this.config.statePath, JSON.stringify(serializable, null, 2));
    }

    this.eventBus = null;
  }
}

export { loadCapabilities, canHandleIssue, filterByCapabilities, extractNeeds, getDeploymentMode, getPodId, generatePodCapabilitiesPath, type MachineCapabilities, type DeploymentMode, KNOWN_CAPABILITIES } from './capabilities.js';
export { getTrafficLight, shouldProceed, getRetryDelay, PredictiveCircuitBreaker, canUseQuota, loadRatePool, type RatePool, type RatePoolAllocation, type RateSample, type TrafficLight, type AgentPriority } from './rate-limiting.js';
