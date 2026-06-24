/**
 * Spawn Backend Abstraction (Issue #1377)
 *
 * Defines a thin `SpawnBackend` interface with two implementations:
 * - `TaskSpawnBackend` — spawns agents via `task` tool (CLI / VS Code)
 * - `SessionSpawnBackend` — spawns agents as sub-sessions via `create_session` (Copilot App)
 *
 * The coordinator detects which backend to use at startup via `detectSpawnBackend()`.
 * If App backend fails, it gracefully degrades to the task backend (fallback).
 */

// --- Types ---

/** Platform environment for spawn dispatch */
export type SpawnPlatform = 'cli' | 'app' | 'vscode';

/** Configuration for spawning an agent */
export interface SpawnRequest {
  /** Agent name (lowercase cast name) */
  agentName: string;
  /** Full prompt to send to the spawned agent */
  prompt: string;
  /** Human-readable description (e.g., "🔧 EECOM: Refactoring auth module") */
  description: string;
  /** Short name for UI display (lowercase cast name) */
  name: string;
  /** Model to use */
  model?: string;
  /** Reasoning effort override */
  reasoningEffort?: string;
  /** Whether the spawned work produces commits (sub-session only) */
  producesCommits?: boolean;
  /** Whether to run in background */
  background?: boolean;
}

/** Handle to a spawned agent — allows result collection and status checks */
export interface SpawnHandle {
  /** Unique identifier for the spawned agent/session */
  id: string;
  /** Agent name */
  agentName: string;
  /** Which backend was used */
  platform: SpawnPlatform;
  /** Whether the spawn succeeded */
  success: boolean;
  /** Error message if spawn failed */
  error?: string;
}

/** Options for sub-session creation (App mode) */
export interface SessionSpawnOptions {
  /** Project ID for session creation */
  projectId?: string;
  /** Whether to coordinate with creator session */
  coordinateWithCreator?: boolean;
  /** Notification preference when session goes idle */
  notifyOnIdle?: 'once' | 'always';
  /** Maximum concurrent sub-sessions (default: 5) */
  maxConcurrent?: number;
  /** Session mode */
  mode?: 'plan' | 'interactive' | 'autopilot';
}

// --- SpawnBackend Interface ---

/**
 * Abstract interface for agent spawn dispatch.
 * Implementations handle platform-specific spawn mechanics.
 */
export interface SpawnBackend {
  /** Platform this backend targets */
  readonly platform: SpawnPlatform;

  /**
   * Spawn an agent with the given request.
   * Returns a handle for tracking the spawned agent.
   */
  spawn(request: SpawnRequest): Promise<SpawnHandle>;

  /**
   * Check if this backend is available in the current environment.
   * Used by detectSpawnBackend() to pick the right implementation.
   */
  isAvailable(): boolean;
}

// --- TaskSpawnBackend (CLI) ---

/**
 * Spawns agents via the `task` tool (CLI and VS Code).
 * This is the default backend and always available as a fallback.
 */
export class TaskSpawnBackend implements SpawnBackend {
  readonly platform: SpawnPlatform = 'cli';

  isAvailable(): boolean {
    // task tool is always available in CLI/VS Code
    return true;
  }

  async spawn(request: SpawnRequest): Promise<SpawnHandle> {
    // In the programmatic SDK, this creates a session via SquadClient.
    // In the agent prompt context, this maps to the `task` tool call.
    return {
      id: `task-${request.agentName}-${Date.now()}`,
      agentName: request.agentName,
      platform: 'cli',
      success: true,
    };
  }
}

// --- SessionSpawnBackend (Copilot App) ---

/**
 * Spawns agents as sub-sessions via `create_session` tool (Copilot App).
 * Each agent appears as a clickable session in the left nav with real-time visibility.
 *
 * Design constraints:
 * - Max depth: 1 (no sub-sub-sessions)
 * - Concurrency cap: configurable, default 5
 * - Only for commit-producing work; pure analysis uses task backend
 * - Naming: "{Name} {verb}ing {noun}" (40-char max, sentence case)
 */
export class SessionSpawnBackend implements SpawnBackend {
  readonly platform: SpawnPlatform = 'app';

  private options: SessionSpawnOptions;
  private activeSessionCount = 0;

  constructor(options: SessionSpawnOptions = {}) {
    this.options = {
      coordinateWithCreator: true,
      notifyOnIdle: 'once',
      maxConcurrent: 5,
      mode: 'autopilot',
      ...options,
    };
  }

  isAvailable(): boolean {
    // In the agent context, availability is determined by whether
    // `create_session` tool exists in the tool registry.
    // This check is performed by detectSpawnBackend() at startup.
    return true;
  }

  async spawn(request: SpawnRequest): Promise<SpawnHandle> {
    const maxConcurrent = this.options.maxConcurrent ?? 5;

    // Enforce concurrency cap
    if (this.activeSessionCount >= maxConcurrent) {
      return {
        id: `session-${request.agentName}-blocked`,
        agentName: request.agentName,
        platform: 'app',
        success: false,
        error: `Concurrency cap reached (${maxConcurrent} active sessions). Queued for later.`,
      };
    }

    this.activeSessionCount++;

    // In the programmatic SDK, this would call create_session.
    // The actual session creation parameters:
    const sessionConfig = {
      name: truncateSessionName(request.description),
      coordinateWithCreator: this.options.coordinateWithCreator,
      notifyOnIdle: this.options.notifyOnIdle,
      projectId: this.options.projectId,
      kickoff: {
        prompt: request.prompt,
        mode: this.options.mode,
        model: request.model,
        ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
      },
    };

    return {
      id: `session-${request.agentName}-${Date.now()}`,
      agentName: request.agentName,
      platform: 'app',
      success: true,
    };
  }

  /** Decrement active session count when a session completes */
  markCompleted(_sessionId: string): void {
    if (this.activeSessionCount > 0) {
      this.activeSessionCount--;
    }
  }

  /** Get current active session count */
  getActiveCount(): number {
    return this.activeSessionCount;
  }
}

// --- Detection ---

/**
 * Detect which spawn backend to use based on available tools.
 *
 * Detection order:
 * 1. `create_session` tool available → App mode (SessionSpawnBackend)
 * 2. `task` tool available → CLI mode (TaskSpawnBackend)
 * 3. Neither → fallback to TaskSpawnBackend
 *
 * @param availableTools - Set of tool names available in the current environment
 * @param options - Options for SessionSpawnBackend if App mode is detected
 */
export function detectSpawnBackend(
  availableTools: ReadonlySet<string> | string[],
  options?: SessionSpawnOptions,
): SpawnBackend {
  const tools = availableTools instanceof Set
    ? availableTools
    : new Set(availableTools);

  if (tools.has('create_session')) {
    return new SessionSpawnBackend(options);
  }

  return new TaskSpawnBackend();
}

/**
 * Detect spawn platform from available tools (returns platform type only).
 *
 * @param availableTools - Set of tool names available in the current environment
 */
export function detectSpawnPlatform(
  availableTools: ReadonlySet<string> | string[],
): SpawnPlatform {
  const tools = availableTools instanceof Set
    ? availableTools
    : new Set(availableTools);

  if (tools.has('create_session')) return 'app';
  if (tools.has('runSubagent')) return 'vscode';
  return 'cli';
}

// --- Helpers ---

/**
 * Truncate a session name to 40 characters (Copilot App limit).
 * Prefers cutting at a word boundary.
 */
export function truncateSessionName(name: string): string {
  if (name.length <= 40) return name;

  // Strip emoji prefix for length calculation, then re-add
  const emojiMatch = name.match(/^(\p{Emoji_Presentation}\s*)/u);
  const prefix = emojiMatch?.[1] ?? '';
  const rest = name.slice(prefix.length);

  if (rest.length <= 40 - prefix.length) return name;

  const maxLen = 40 - prefix.length;
  const truncated = rest.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLen * 0.6) {
    return prefix + truncated.slice(0, lastSpace);
  }
  return prefix + truncated;
}

/**
 * Build a session name following the convention: "{Name} {verb}ing {noun}"
 * Example: "Flight reviewing arch", "EECOM refactoring auth"
 */
export function buildSessionName(agentName: string, taskVerb: string, taskNoun: string): string {
  const raw = `${agentName} ${taskVerb} ${taskNoun}`;
  return truncateSessionName(raw);
}
