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

/** Session object returned by the injected session factory */
export interface SpawnedSession {
  /** Unique session identifier */
  sessionId: string;
  /** Send the initial message when kickoff is not handled by session creation */
  sendMessage: (opts: { prompt: string; mode?: 'enqueue' | 'immediate' }) => Promise<void>;
}

/** Session creation callback injected by SDK callers */
export type CreateSessionFn = (config: any) => Promise<SpawnedSession>;

/**
 * Default timeout (ms) applied to an injected `createSession` call so a hung
 * factory cannot hold a concurrency slot / pending-spawn counter forever.
 */
export const DEFAULT_CREATE_SESSION_TIMEOUT_MS = 60_000;

/** Error thrown when an injected createSession call exceeds its timeout. */
export class SpawnTimeoutError extends Error {
  constructor(ms: number) {
    super(`createSession timed out after ${ms}ms`);
    this.name = 'SpawnTimeoutError';
  }
}

/**
 * Race a promise against a timeout. A non-positive `ms` disables the timeout.
 * The timer is unref'd so it never keeps the process alive on its own.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SpawnTimeoutError(ms)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Options shared by all spawn backends. */
export interface SpawnBackendOptions {
  /**
   * Timeout (ms) for the injected `createSession` call.
   * Defaults to {@link DEFAULT_CREATE_SESSION_TIMEOUT_MS}; set to 0 to disable.
   */
  createSessionTimeoutMs?: number;
  /**
   * Optional availability predicate. When provided, `isAvailable()` delegates
   * to it instead of the default heuristic — letting callers gate a backend on
   * real environment signals (e.g., tool-registry membership).
   */
  availabilityCheck?: () => boolean;
}

/** Options for sub-session creation (App mode) */
export interface SessionSpawnOptions extends SpawnBackendOptions {
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
   * Release a previously spawned handle once the caller observes completion.
   * Backends that enforce concurrency caps must decrement their tracking here.
   */
  release(handle: SpawnHandle): void;

  /**
   * Check if this backend is available in the current environment.
   * Used by detectSpawnBackend() to pick the right implementation.
   */
  isAvailable(): boolean;
}

// --- TaskSpawnBackend (CLI) ---

/**
 * Spawns agents via the injected session factory for CLI / VS Code contexts.
 * In prompt-only tool contexts, the coordinator LLM maps this abstraction to the `task` tool.
 */
export class TaskSpawnBackend implements SpawnBackend {
  readonly platform: SpawnPlatform = 'cli';

  private options: SpawnBackendOptions;

  constructor(
    private readonly createSession: CreateSessionFn,
    options: SpawnBackendOptions = {},
  ) {
    this.options = options;
  }

  isAvailable(): boolean {
    if (this.options.availabilityCheck) return this.options.availabilityCheck();
    // Requires a usable session factory to map onto the `task` tool.
    return typeof this.createSession === 'function';
  }

  async spawn(request: SpawnRequest): Promise<SpawnHandle> {
    try {
      const session = await withTimeout(
        this.createSession({
          model: request.model,
          clientName: `squad-agent-${request.agentName}`,
          ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        }),
        this.options.createSessionTimeoutMs ?? DEFAULT_CREATE_SESSION_TIMEOUT_MS,
      );

      await session.sendMessage({
        prompt: request.prompt,
        mode: 'immediate',
      });

      return {
        id: session.sessionId,
        agentName: request.agentName,
        platform: 'cli',
        success: true,
      };
    } catch (error) {
      return {
        id: '',
        agentName: request.agentName,
        platform: 'cli',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  release(_handle: SpawnHandle): void {
    // No concurrency cap for task-backed spawns.
  }
}

// --- SessionSpawnBackend (Copilot App) ---

/**
 * Spawns agents as sub-sessions via the injected session factory for Copilot App contexts.
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
  private activeSessionIds = new Set<string>();
  private pendingSpawnCount = 0;

  constructor(
    private readonly createSession: CreateSessionFn,
    options: SessionSpawnOptions = {},
  ) {
    this.options = {
      coordinateWithCreator: true,
      notifyOnIdle: 'once',
      maxConcurrent: 5,
      mode: 'autopilot',
      ...options,
    };
  }

  isAvailable(): boolean {
    if (this.options.availabilityCheck) return this.options.availabilityCheck();
    // Availability hinges on a usable session factory. Tool-registry gating
    // (e.g. `create_session` membership) is layered on by detectSpawnBackend()
    // or via an injected availabilityCheck.
    return typeof this.createSession === 'function';
  }

  async spawn(request: SpawnRequest): Promise<SpawnHandle> {
    const maxConcurrent = this.options.maxConcurrent ?? 5;
    const inFlightCount = this.activeSessionIds.size + this.pendingSpawnCount;

    // Enforce concurrency cap
    if (inFlightCount >= maxConcurrent) {
      return {
        id: '',
        agentName: request.agentName,
        platform: 'app',
        success: false,
        error:
          `Concurrency cap reached (${maxConcurrent} active or starting sub-sessions). ` +
          `Spawn rejected because no queue is configured.`,
      };
    }

    this.pendingSpawnCount++;

    try {
      const session = await withTimeout(
        this.createSession({
          name: truncateSessionName(request.description),
          coordinate_with_creator: this.options.coordinateWithCreator,
          notify_on_idle: this.options.notifyOnIdle,
          project_id: this.options.projectId,
          kickoff: {
            prompt: request.prompt,
            mode: this.options.mode,
            model: request.model,
            ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
          },
        }),
        this.options.createSessionTimeoutMs ?? DEFAULT_CREATE_SESSION_TIMEOUT_MS,
      );

      this.activeSessionIds.add(session.sessionId);

      return {
        id: session.sessionId,
        agentName: request.agentName,
        platform: 'app',
        success: true,
      };
    } catch (error) {
      return {
        id: '',
        agentName: request.agentName,
        platform: 'app',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.pendingSpawnCount--;
    }
  }

  release(handle: SpawnHandle): void {
    this.activeSessionIds.delete(handle.id);
  }

  /** Get current active session count */
  getActiveCount(): number {
    return this.activeSessionIds.size + this.pendingSpawnCount;
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
 * @param createSession - Injected session creation callback used by the selected backend
 * @param options - Options for SessionSpawnBackend if App mode is detected
 */
export function detectSpawnBackend(
  availableTools: ReadonlySet<string> | string[],
  createSession: CreateSessionFn,
  options?: SessionSpawnOptions,
): SpawnBackend {
  const tools = availableTools instanceof Set
    ? availableTools
    : new Set(availableTools);

  if (tools.has('create_session')) {
    return new SessionSpawnBackend(createSession, options);
  }

  return new TaskSpawnBackend(createSession, options);
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
