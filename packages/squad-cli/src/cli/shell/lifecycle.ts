/**
 * Shell session lifecycle management.
 *
 * Manages initialization (team discovery, path resolution),
 * message history tracking, state transitions, and graceful shutdown.
 *
 * @module cli/shell/lifecycle
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { resolveStateDir } from '../core/effective-squad-dir.js';
import { SessionRegistry } from './sessions.js';
import { ShellRenderer } from './render.js';
import type { ShellState, ShellMessage } from './types.js';

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

export interface DiscoveredAgent {
  name: string;
  role: string;
  charter: string | undefined;
  status: string;
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

    const localSquadDir = path.resolve(this.options.teamRoot, '.squad');
    if (!await storage.exists(localSquadDir) || !await storage.isDirectory(localSquadDir)) {
      this.state.status = 'error';
      const err = new Error(
        `No team found. Run \`squad init\` to create one.`
      );
      debugLog('initialize: .squad/ directory not found at', localSquadDir);
      throw err;
    }

    // Resolve effective state dir (external when externalized)
    const squadDir = resolveStateDir(localSquadDir);

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
      const initPromptPath = path.join(localSquadDir, '.init-prompt');
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

/**
 * Parse the Members table from team.md and extract agent metadata.
 *
 * Expected markdown table format:
 * ```
 * | Name | Role | Charter | Status |
 * |------|------|---------|--------|
 * | Keaton | Lead | `.squad/agents/keaton/charter.md` | ✅ Active |
 * ```
 */
function parseTeamManifest(content: string): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const lines = content.split('\n');

  let inMembersTable = false;
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect the "Members" section header
    if (/^#+\s*Members/i.test(trimmed)) {
      inMembersTable = true;
      headerParsed = false;
      continue;
    }

    // Stop at the next section header
    if (inMembersTable && /^#+\s/.test(trimmed) && !/^#+\s*Members/i.test(trimmed)) {
      inMembersTable = false;
      continue;
    }

    if (!inMembersTable) continue;

    // Skip non-table lines
    if (!trimmed.startsWith('|')) continue;

    // Skip the header row (contains "Name") and separator row (contains "---")
    if (trimmed.includes('---') || /\|\s*Name\s*\|/i.test(trimmed)) {
      headerParsed = true;
      continue;
    }

    if (!headerParsed) continue;

    const cells = trimmed
      .split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length < 4) continue;

    const name = cells[0]!;
    const role = cells[1]!;
    const charter = cells[2]?.startsWith('`') ? cells[2].replace(/`/g, '') : undefined;

    // Extract status text from emoji-prefixed status (e.g. "✅ Active" → "Active")
    const rawStatus = cells[3]!;
    const status = rawStatus.replace(/^[^\w]*/, '').trim();

    agents.push({ name, role, charter, status });
  }

  return agents;
}

/** Role → emoji mapping for rich terminal display. */
export function getRoleEmoji(role: string): string {
  const normalized = role.toLowerCase();
  const exactMap: Record<string, string> = {
    'lead': '🏗️',
    'prompt engineer': '💬',
    'core dev': '🔧',
    'tester': '🧪',
    'devrel': '📢',
    'sdk expert': '📦',
    'typescript engineer': '⌨️',
    'git & release': '🏷️',
    'node.js runtime': '⚡',
    'distribution': '📤',
    'security': '🔒',
    'graphic designer': '🎨',
    'vs code extension': '🧩',
    'session logger': '📋',
    'work monitor': '🔄',
    'coordinator': '🎯',
    'coding agent': '🤖',
  };
  if (exactMap[normalized]) return exactMap[normalized]!;
  // Keyword-based fallbacks for custom roles
  if (normalized.includes('lead') || normalized.includes('architect')) return '🏗️';
  if (normalized.includes('frontend') || normalized.includes('ui')) return '⚛️';
  if (normalized.includes('backend') || normalized.includes('api') || normalized.includes('server')) return '🔧';
  if (normalized.includes('test') || normalized.includes('qa') || normalized.includes('quality')) return '🧪';
  if (normalized.includes('game') || normalized.includes('logic')) return '🎮';
  if (normalized.includes('devops') || normalized.includes('infra') || normalized.includes('platform')) return '⚙️';
  if (normalized.includes('security') || normalized.includes('auth')) return '🔒';
  if (normalized.includes('doc') || normalized.includes('writer') || normalized.includes('devrel')) return '📝';
  if (normalized.includes('data') || normalized.includes('database') || normalized.includes('analytics')) return '📊';
  if (normalized.includes('design') || normalized.includes('visual') || normalized.includes('graphic')) return '🎨';
  if (normalized.includes('dev') || normalized.includes('engineer')) return '🔧';
  return '🔹';
}

export interface WelcomeData {
  projectName: string;
  description: string;
  agents: Array<{ name: string; role: string; emoji: string }>;
  focus: string | null;
  /** True on the very first launch after `squad init`. */
  isFirstRun: boolean;
}

/**
 * Load welcome screen data from .squad/ directory.
 *
 * Uses FSStorageProvider (sync) so all reads are routed through the
 * StorageProvider abstraction. Kept synchronous to preserve the React
 * useState initializer contract in App.tsx (Phase 3 migration).
 */
export function loadWelcomeData(teamRoot: string): WelcomeData | null {
  try {
    const storage = new FSStorageProvider();
    const localSquadDir = path.join(teamRoot, '.squad');
    const stateDir = resolveStateDir(localSquadDir);
    const teamPath = path.join(stateDir, 'team.md');
    const content = storage.readSync(teamPath);
    if (content === undefined) return null;

    const titleMatch = content.match(/^#\s+Squad Team\s+—\s+(.+)$/m);
    const projectName = titleMatch?.[1] ?? 'Squad';
    const descMatch = content.match(/^>\s+(.+)$/m);
    const description = descMatch?.[1] ?? '';

    const agents = parseTeamManifest(content)
      .filter(a => a.status === 'Active')
      .map(a => ({ name: a.name, role: a.role, emoji: getRoleEmoji(a.role) }));

    let focus: string | null = null;
    const nowPath = path.join(stateDir, 'identity', 'now.md');
    const nowContent = storage.readSync(nowPath);
    if (nowContent !== undefined) {
      const focusMatch = nowContent.match(/focus_area:\s*(.+)/);
      focus = focusMatch?.[1]?.trim() ?? null;
    }

    // Detect and consume first-run marker from `squad init`
    const firstRunPath = path.join(stateDir, '.first-run');
    let isFirstRun = false;
    if (storage.existsSync(firstRunPath)) {
      isFirstRun = true;
      try { storage.deleteSync(firstRunPath); } catch { /* non-fatal */ }
    }

    return { projectName, description, agents, focus, isFirstRun };
  } catch (err) {
    debugLog('loadWelcomeData failed:', err);
    return null;
  }
}
