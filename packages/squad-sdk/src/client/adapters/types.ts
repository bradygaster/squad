/**
 * Multi-client host adapter types.
 *
 * Squad's coordinator and its `squad_state` MCP backend are host-agnostic.
 * A {@link HostProjection} projects them into the files a specific client
 * host (Copilot, Claude Code, Kiro, OpenCode, Cursor) loads natively.
 *
 * @module client/adapters/types
 */

export const CLIENT_IDS = ['copilot', 'claude', 'kiro', 'opencode', 'cursor', 'codex', 'antigravity'] as const;
export type ClientId = (typeof CLIENT_IDS)[number];

/** Launch spec for the `squad_state` MCP server. */
export interface McpLaunchSpec {
  command: string;
  args: string[];
}

export interface ClientContext {
  /** Project root the projection files are written under. */
  root: string;
  /** How hosts should launch the `squad_state` MCP backend. */
  mcp: McpLaunchSpec;
  /** Squad state directory name relative to root (default `.squad`). */
  squadDir?: string;
}

/** A projected file, relative to {@link ClientContext.root}. */
export type ProjectionFile =
  /** Fully Squad-owned file; overwritten on every refresh. */
  | { kind: 'managed'; path: string; content: string }
  /** Read-modify-write of a user-shared JSON config; only Squad keys are touched. */
  | { kind: 'json'; path: string; update: (existing: Record<string, unknown>) => Record<string, unknown> }
  /** Marker-delimited block inside a user-owned text file. */
  | { kind: 'block'; path: string; content: string; id?: string }
  /**
   * Individual lines upserted into a line-oriented user file (e.g. `.gitignore`).
   * Lines are appended once under a `# squad:<id>` comment; uninstall removes only those.
   */
  | { kind: 'lines'; path: string; lines: string[]; id: string }
  /** Read-modify-write of a user-shared text file (e.g. TOML) where only Squad's part changes. */
  | { kind: 'text'; path: string; update: (existing: string) => string };

export type DispatchStrategy = {
  /** Host-native way the coordinator spawns a specialist. */
  summary: string;
  /** Markdown "Dispatch adapter" section embedded in the coordinator instructions. */
  section: string;
};

/** How a client reaches the shared Squad backend contract. */
export type TransportMode = 'mcp-bridge' | 'http-backend' | 'in-process';

/**
 * What a host can do natively. Adapters own bootstrap/projection, capability
 * declaration, UI/dispatch translation and local lifecycle only; conversation
 * semantics, routing, durable state and authorization live in the backend.
 */
export interface ClientCapabilities {
  supportsSubagents: boolean;
  supportsMcpTransport: boolean;
  supportsNativeHooks: boolean;
  supportsSteeringFiles: boolean;
  /** Ways this host can connect to `SquadBackend`; `mcp-bridge` is a local tool transport, not the wire contract. */
  transportModes: TransportMode[];
}

/**
 * Pure workspace projection for one host: no backend or runtime dependency.
 * The spec-level runtime `ClientAdapter` (see `client/adapter-contract`) composes this.
 */
export interface HostProjection {
  readonly id: ClientId;
  readonly label: string;
  readonly capabilities: ClientCapabilities;
  readonly dispatch: DispatchStrategy;
  project(ctx: ClientContext): ProjectionFile[];
}

export type ApplyAction = 'created' | 'updated' | 'unchanged' | 'removed' | 'error';

export interface ApplyResult {
  path: string;
  action: ApplyAction;
  error?: string;
}
