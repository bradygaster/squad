/**
 * Shell session lifecycle management.
 *
 * Manages initialization (team discovery, path resolution),
 * message history tracking, state transitions, and graceful shutdown.
 *
 * Pure team-manifest parsing lives in the SDK; this file re-exports
 * those symbols for backward compatibility and keeps the shell-specific
 * ShellLifecycle class.
 *
 * @module cli/shell/lifecycle
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { parseTeamManifest, type DiscoveredAgent } from '@bradygaster/squad-sdk/runtime/team-manifest';
import { SessionRegistry } from './sessions.js';
import { ShellRenderer } from './render.js';
import type { ShellState, ShellMessage } from './types.js';

// Re-export SDK symbols so existing CLI consumers are unaffected
export { parseTeamManifest, getRoleEmoji, loadWelcomeData, type DiscoveredAgent, type WelcomeData } from '@bradygaster/squad-sdk/runtime/team-manifest';

/** Debug logger — writes to stderr only when SQUAD_DEBUG=1. */
function debugLog(...args: unknown[]): void {
  if (process.env['SQUAD_DEBUG'] === '1') {
    console.error('[SQUAD_DEBUG]', ...args);
  }
}

export interface LifecycleOptions {
  teamRoot: string;
  renderer: ShellRenderer;
  registry: SessionRegistry;
}

/**
 * Manages the shell session lifecycle:
 * - Initialization (load team, resolve squad path, populate registry)
 * - Message handling (route user input, track responses)
 * - Cleanup (graceful shutdown, session cleanup)
 */
export class ShellLifecycle {
  private state: ShellState;
  private options: LifecycleOptions;
  private messageHistory: ShellMessage[] = [];
  private discoveredAgents: DiscoveredAgent[] = [];

  constructor(options: LifecycleOptions) {
    this.options = options;
    this.state = {
      status: 'initializing',
      activeAgents: new Map(),
      messageHistory: [],
    };
  }

  /**
   * Initialize the shell — verify .squad/, load team.md, discover agents.
   *
   * Reads via FSStorageProvider so all file access is routed through the
   * StorageProvider abstraction (Phase 3 migration).
   */
  async initialize(): Promise<void> {
    this.state.status = 'initializing';
    const storage = new FSStorageProvider();

    const squadDir = path.resolve(this.options.teamRoot, '.squad');
    if (!await storage.exists(squadDir) || !await storage.isDirectory(squadDir)) {
      this.state.status = 'error';
      const err = new Error(
        `No team found. Run \`squad init\` to create one.`
      );
      debugLog('initialize: .squad/ directory not found at', squadDir);
      throw err;
    }

    const teamPath = path.join(squadDir, 'team.md');
    const teamContent = await storage.read(teamPath);
    if (teamContent === undefined) {
      this.state.status = 'error';
      const err = new Error(
        `No team manifest found. The .squad/ directory exists but has no team.md. Run \`squad init\` to fix.`
      );
      debugLog('initialize: team.md not found at', teamPath);
      throw err;
    }

    this.discoveredAgents = parseTeamManifest(teamContent);

    if (this.discoveredAgents.length === 0) {
      const initPromptPath = path.join(squadDir, '.init-prompt');
      if (!await storage.exists(initPromptPath)) {
        console.warn('⚠ No agents found in team.md. Run `squad init "describe your project"` to cast a team.');
      }
      // Auto-cast message is shown inside the Ink UI (index.ts handleInitCast)
    }

    // Register discovered agents in the session registry
    for (const agent of this.discoveredAgents) {
      if (agent.status === 'Active') {
        this.options.registry.register(agent.name, agent.role);
      }
    }

    this.state.status = 'ready';
  }

  /** Get current shell state. */
  getState(): ShellState {
    return { ...this.state };
  }

  /** Get agents discovered during initialization. */
  getDiscoveredAgents(): readonly DiscoveredAgent[] {
    return this.discoveredAgents;
  }

  /** Add a user message to history. */
  addUserMessage(content: string): ShellMessage {
    const msg: ShellMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(msg);
    this.state.messageHistory = [...this.messageHistory];
    return msg;
  }

  /** Add an agent response to history. */
  addAgentMessage(agentName: string, content: string): ShellMessage {
    const msg: ShellMessage = {
      role: 'agent',
      agentName,
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(msg);
    this.state.messageHistory = [...this.messageHistory];
    return msg;
  }

  /** Add a system message. */
  addSystemMessage(content: string): ShellMessage {
    const msg: ShellMessage = {
      role: 'system',
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(msg);
    this.state.messageHistory = [...this.messageHistory];
    return msg;
  }

  /** Get message history (optionally filtered by agent). */
  getHistory(agentName?: string): ShellMessage[] {
    if (agentName) {
      return this.messageHistory.filter(m => m.agentName === agentName);
    }
    return [...this.messageHistory];
  }

  /** Clean shutdown — close all sessions, clear state. */
  async shutdown(): Promise<void> {
    this.state.status = 'initializing'; // transitioning
    this.options.registry.clear();
    this.messageHistory = [];
    this.state.messageHistory = [];
    this.state.activeAgents.clear();
    this.discoveredAgents = [];
  }
}


