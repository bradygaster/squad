# PRD 1: SDK Orchestration Runtime

**Owner:** Fenster (Core Developer)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1 (Foundation)
**Dependencies:** None — this is the foundation. Everything else blocks on this.

## Problem Statement

Squad's entire orchestration runtime is a 32KB markdown file interpreted by an LLM. There is no programmatic session management, no crash recovery, no protocol version checking, and no type safety. The SDK replatform requires a TypeScript runtime layer that wraps `@github/copilot-sdk` with Squad-specific lifecycle management, connection resilience, and an adapter layer that insulates us from Technical Preview breaking changes.

## Goals

1. Establish a TypeScript project structure with build toolchain alongside existing `index.js` installer
2. Wrap `CopilotClient` with connection management, error recovery, and automatic reconnection
3. Implement session pool management (create, track, resume, cleanup) for all agent sessions
4. Enforce protocol version compatibility via `sdkProtocolVersion` checks at startup
5. Create an SDK adapter layer that abstracts SDK-specific types behind Squad interfaces (kill-shot mitigation for Technical Preview coupling)
6. Provide configuration management for models, tools, MCP servers, and custom agents
7. Implement an event bus for session lifecycle events (created, destroyed, idle, error)

## Non-Goals

- Migrating the coordinator prompt from `squad.agent.md` to TypeScript (Phase 2)
- Implementing custom tools (PRD 2)
- Ralph migration (PRD 8)
- Casting system changes (remains in `index.js`)
- Template copying system changes (remains in `index.js`)
- VS Code extension development

## Background

The team unanimously approved replatforming on `@github/copilot-sdk` (v0.1.8+). My technical mapping (`.ai-team/docs/sdk-technical-mapping.md`) confirmed ~75% direct feature mapping with significant maintainability and capability gains. The SDK wraps the same Copilot CLI we already use, providing typed JSON-RPC, session management, hooks, and protocol versioning.

Key SDK primitives this PRD wraps:
- `CopilotClient` — connection lifecycle, server spawning, session registry
- `createSession()` / `resumeSession()` — session CRUD with full config
- `listSessions()` / `deleteSession()` — session inventory and cleanup
- `getStatus()` — protocol version + CLI version
- `listModels()` — model discovery with capabilities metadata
- Session lifecycle events (`session.created`, `session.deleted`, `session.updated`)
- `sdkProtocolVersion` (currently `2`) — compatibility gate

The SDK is Technical Preview (v0.1.x). Breaking changes are possible. The adapter layer is the critical mitigation — Squad code never imports from `@github/copilot-sdk` directly; it imports from our adapter.

## Proposed Solution

### Architecture Overview

```
src/
├── index.ts                    # New orchestration entry point (squad orchestrate)
├── adapter/
│   ├── index.ts                # Re-exports — Squad's public SDK surface
│   ├── client.ts               # SquadClient wrapping CopilotClient
│   ├── session.ts              # SquadSession wrapping CopilotSession
│   ├── types.ts                # Squad-specific type definitions
│   └── errors.ts               # Error hierarchy
├── runtime/
│   ├── session-pool.ts         # Session pool manager
│   ├── event-bus.ts            # Cross-session event bus
│   ├── config.ts               # Configuration loader
│   └── health.ts               # Connection health monitor
├── tools/                      # (PRD 2 — Custom Tools API)
└── ralph/                      # (PRD 8 — Ralph Migration)
```

### 1. SDK Adapter Layer (`src/adapter/`)

This is the kill-shot mitigation. All Squad code depends on Squad-defined interfaces, never on `@github/copilot-sdk` types directly. If the SDK ships a breaking change, we update one adapter file — not every consumer.

```typescript
// src/adapter/types.ts
import type {
  SessionConfig as SDKSessionConfig,
  ResumeSessionConfig as SDKResumeSessionConfig,
  SessionMetadata as SDKSessionMetadata,
  SessionEvent as SDKSessionEvent,
  ModelInfo as SDKModelInfo,
  CustomAgentConfig as SDKCustomAgentConfig,
  ConnectionState as SDKConnectionState,
  SessionHooks as SDKSessionHooks,
  MCPServerConfig as SDKMCPServerConfig,
  GetStatusResponse as SDKGetStatusResponse,
} from "@github/copilot-sdk";

// Squad's stable interfaces — these never change when SDK changes
export interface SquadSessionConfig {
  sessionId?: string;
  agentName: string;           // Squad agent name (e.g., "fenster")
  model?: string;              // Model override
  systemPrompt: string;        // Charter + history + decisions (assembled by caller)
  systemPromptMode: "append" | "replace";
  availableTools?: string[];
  excludedTools?: string[];
  workingDirectory?: string;
  mcpServers?: Record<string, SquadMCPServerConfig>;
  hooks?: SquadSessionHooks;
  infiniteSessions?: { enabled: boolean; compactionThreshold?: number };
  streaming?: boolean;
  customAgents?: SquadCustomAgentConfig[];
  skillDirectories?: string[];
}

export interface SquadCustomAgentConfig {
  name: string;
  displayName?: string;
  description?: string;
  prompt: string;
  tools?: string[] | null;
  mcpServers?: Record<string, SquadMCPServerConfig>;
}

export interface SquadMCPServerConfig {
  type?: "local" | "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  tools: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface SquadSessionHooks {
  onPreToolUse?: (input: SquadPreToolUseInput) => Promise<SquadPreToolUseOutput | void>;
  onPostToolUse?: (input: SquadPostToolUseInput) => Promise<SquadPostToolUseOutput | void>;
  onSessionStart?: (input: SquadSessionStartInput) => Promise<void>;
  onSessionEnd?: (input: SquadSessionEndInput) => Promise<void>;
  onError?: (input: SquadErrorInput) => Promise<SquadErrorOutput | void>;
}

export interface SquadPreToolUseInput {
  toolName: string;
  toolArgs: unknown;
  sessionId: string;
  timestamp: number;
}

export interface SquadPreToolUseOutput {
  decision: "allow" | "deny" | "ask";
  reason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
}

export interface SquadPostToolUseInput {
  toolName: string;
  toolArgs: unknown;
  toolResult: { textResultForLlm: string; resultType: string };
  sessionId: string;
  timestamp: number;
}

export interface SquadPostToolUseOutput {
  modifiedResult?: { textResultForLlm: string; resultType: string };
  additionalContext?: string;
}

export interface SquadSessionStartInput {
  source: "startup" | "resume" | "new";
  sessionId: string;
  timestamp: number;
}

export interface SquadSessionEndInput {
  reason: "complete" | "error" | "abort" | "timeout";
  sessionId: string;
  timestamp: number;
  error?: string;
}

export interface SquadErrorInput {
  error: string;
  context: "model_call" | "tool_execution" | "system";
  recoverable: boolean;
  sessionId: string;
}

export interface SquadErrorOutput {
  handling: "retry" | "skip" | "abort";
  retryCount?: number;
}

export interface SquadSessionMetadata {
  sessionId: string;
  agentName?: string;          // Squad-specific: which agent owns this session
  startTime: Date;
  modifiedTime: Date;
  summary?: string;
  isRemote: boolean;
  context?: {
    cwd: string;
    gitRoot?: string;
    repository?: string;
    branch?: string;
  };
}

export interface SquadModelInfo {
  id: string;
  name: string;
  maxContextTokens: number;
  supportsVision: boolean;
  supportsReasoningEffort: boolean;
  policy?: { state: "enabled" | "disabled" | "unconfigured" };
  billingMultiplier?: number;
}

export type SquadConnectionState = "disconnected" | "connecting" | "connected" | "error" | "reconnecting";

export interface SquadStatusResponse {
  cliVersion: string;
  protocolVersion: number;
  sdkExpectedVersion: number;
  compatible: boolean;
}
```

```typescript
// src/adapter/client.ts
import { CopilotClient, type CopilotClientOptions } from "@github/copilot-sdk";
import type { SquadSessionConfig, SquadModelInfo, SquadStatusResponse, SquadConnectionState } from "./types.js";
import { SquadSession } from "./session.js";

export class SquadClient {
  private client: CopilotClient;
  private state: SquadConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelayMs = 1000;

  constructor(private options: SquadClientOptions) {
    this.client = new CopilotClient(this.toSDKOptions(options));
  }

  async start(): Promise<void> {
    this.state = "connecting";
    try {
      await this.client.start();
      await this.verifyCompatibility();
      this.state = "connected";
      this.reconnectAttempts = 0;
    } catch (error) {
      this.state = "error";
      throw new SquadConnectionError(`Failed to connect: ${error}`, { cause: error });
    }
  }

  async stop(): Promise<void> {
    const errors = await this.client.stop();
    this.state = "disconnected";
    if (errors.length > 0) {
      console.error(`[squad] ${errors.length} cleanup errors during shutdown`);
    }
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    await this.ensureConnected();
    const sdkSession = await this.client.createSession({
      sessionId: config.sessionId,
      model: config.model,
      systemMessage: {
        mode: config.systemPromptMode,
        content: config.systemPrompt,
      },
      availableTools: config.availableTools,
      excludedTools: config.excludedTools,
      workingDirectory: config.workingDirectory,
      mcpServers: config.mcpServers as any, // Adapter boundary
      hooks: this.mapHooks(config.hooks),
      streaming: config.streaming,
      customAgents: config.customAgents as any,
      skillDirectories: config.skillDirectories,
      infiniteSessions: config.infiniteSessions ? {
        enabled: config.infiniteSessions.enabled,
        backgroundCompactionThreshold: config.infiniteSessions.compactionThreshold ?? 0.80,
      } : undefined,
      onPermissionRequest: () => ({ kind: "approved" as const }),
    });
    return new SquadSession(sdkSession, config.agentName);
  }

  async resumeSession(sessionId: string, config?: Partial<SquadSessionConfig>): Promise<SquadSession> {
    await this.ensureConnected();
    const sdkSession = await this.client.resumeSession(sessionId, {
      model: config?.model,
      systemMessage: config?.systemPrompt ? {
        mode: config.systemPromptMode ?? "append",
        content: config.systemPrompt,
      } : undefined,
      hooks: config?.hooks ? this.mapHooks(config.hooks) : undefined,
      streaming: config?.streaming,
    });
    return new SquadSession(sdkSession, config?.agentName);
  }

  async listModels(): Promise<SquadModelInfo[]> {
    await this.ensureConnected();
    const models = await this.client.listModels();
    return models.map(m => ({
      id: m.id,
      name: m.name,
      maxContextTokens: m.capabilities.limits.max_context_window_tokens,
      supportsVision: m.capabilities.supports.vision,
      supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
      policy: m.policy ? { state: m.policy.state } : undefined,
      billingMultiplier: m.billing?.multiplier,
    }));
  }

  async getStatus(): Promise<SquadStatusResponse> {
    await this.ensureConnected();
    const status = await this.client.getStatus();
    return {
      cliVersion: status.version,
      protocolVersion: status.protocolVersion,
      sdkExpectedVersion: 2, // SDK_PROTOCOL_VERSION from sdkProtocolVersion.ts
      compatible: status.protocolVersion === 2,
    };
  }

  getState(): SquadConnectionState { return this.state; }

  // --- Private ---

  private async ensureConnected(): Promise<void> {
    if (this.state === "connected") return;
    if (this.state === "reconnecting") {
      throw new SquadConnectionError("Reconnection in progress");
    }
    if (this.state === "disconnected" || this.state === "error") {
      await this.reconnect();
    }
  }

  private async reconnect(): Promise<void> {
    this.state = "reconnecting";
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      try {
        await this.client.stop().catch(() => {});
        this.client = new CopilotClient(this.toSDKOptions(this.options));
        await this.client.start();
        await this.verifyCompatibility();
        this.state = "connected";
        this.reconnectAttempts = 0;
        return;
      } catch {
        const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    this.state = "error";
    throw new SquadConnectionError(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
  }

  private async verifyCompatibility(): Promise<void> {
    const ping = await this.client.ping();
    if (ping.protocolVersion === undefined) {
      throw new SquadProtocolError("Server does not report protocol version — CLI too old");
    }
    if (ping.protocolVersion !== 2) {
      throw new SquadProtocolError(
        `Protocol mismatch: expected 2, got ${ping.protocolVersion}. Update CLI or SDK.`
      );
    }
  }

  private toSDKOptions(opts: SquadClientOptions): CopilotClientOptions {
    return {
      cwd: opts.workingDirectory,
      githubToken: opts.githubToken,
      useLoggedInUser: opts.githubToken ? false : true,
      logLevel: opts.logLevel ?? "error",
      autoStart: true,
      autoRestart: true,
    };
  }

  private mapHooks(hooks?: SquadSessionHooks): any {
    if (!hooks) return undefined;
    return {
      onPreToolUse: hooks.onPreToolUse
        ? (input: any, inv: any) => hooks.onPreToolUse!({
            toolName: input.toolName, toolArgs: input.toolArgs,
            sessionId: inv.sessionId, timestamp: input.timestamp,
          }).then(r => r ? {
            permissionDecision: r.decision, permissionDecisionReason: r.reason,
            modifiedArgs: r.modifiedArgs, additionalContext: r.additionalContext,
          } : undefined)
        : undefined,
      onPostToolUse: hooks.onPostToolUse
        ? (input: any, inv: any) => hooks.onPostToolUse!({
            toolName: input.toolName, toolArgs: input.toolArgs,
            toolResult: input.toolResult, sessionId: inv.sessionId,
            timestamp: input.timestamp,
          }).then(r => r ? {
            modifiedResult: r.modifiedResult, additionalContext: r.additionalContext,
          } : undefined)
        : undefined,
      onSessionStart: hooks.onSessionStart
        ? (input: any, inv: any) => hooks.onSessionStart!({
            source: input.source, sessionId: inv.sessionId, timestamp: input.timestamp,
          })
        : undefined,
      onSessionEnd: hooks.onSessionEnd
        ? (input: any, inv: any) => hooks.onSessionEnd!({
            reason: input.reason, sessionId: inv.sessionId,
            timestamp: input.timestamp, error: input.error,
          })
        : undefined,
      onErrorOccurred: hooks.onError
        ? (input: any, inv: any) => hooks.onError!({
            error: input.error, context: input.errorContext,
            recoverable: input.recoverable, sessionId: inv.sessionId,
          }).then(r => r ? { errorHandling: r.handling, retryCount: r.retryCount } : undefined)
        : undefined,
    };
  }
}

export interface SquadClientOptions {
  workingDirectory?: string;
  githubToken?: string;
  logLevel?: "none" | "error" | "warning" | "info" | "debug";
}
```

```typescript
// src/adapter/session.ts
import type { CopilotSession } from "@github/copilot-sdk";

export class SquadSession {
  constructor(
    private session: CopilotSession,
    public readonly agentName?: string,
  ) {}

  get sessionId(): string { return this.session.sessionId; }
  get workspacePath(): string | undefined { return this.session.workspacePath; }

  async send(prompt: string): Promise<string> {
    return this.session.send({ prompt });
  }

  async sendAndWait(prompt: string, timeoutMs = 300_000): Promise<string | undefined> {
    const result = await this.session.sendAndWait({ prompt }, timeoutMs);
    return result?.data?.content;
  }

  on(handler: (event: any) => void): () => void {
    return this.session.on(handler);
  }

  onType<K extends string>(eventType: K, handler: (event: any) => void): () => void {
    return this.session.on(eventType as any, handler as any);
  }

  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}
```

```typescript
// src/adapter/errors.ts
export class SquadSDKError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SquadSDKError";
  }
}

export class SquadConnectionError extends SquadSDKError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SquadConnectionError";
  }
}

export class SquadProtocolError extends SquadSDKError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SquadProtocolError";
  }
}

export class SquadSessionError extends SquadSDKError {
  constructor(message: string, public readonly sessionId?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SquadSessionError";
  }
}
```

### 2. Session Pool Manager (`src/runtime/session-pool.ts`)

Tracks all active agent sessions. The coordinator creates sessions through the pool; the pool handles lifecycle, cleanup, and provides inventory queries (used by `squad_status` tool in PRD 2 and Ralph in PRD 8).

```typescript
// src/runtime/session-pool.ts
import type { SquadSession } from "../adapter/session.js";
import type { SquadClient } from "../adapter/client.js";
import type { SquadSessionConfig, SquadSessionMetadata } from "../adapter/types.js";

interface PoolEntry {
  session: SquadSession;
  agentName: string;
  createdAt: Date;
  status: "active" | "idle" | "error" | "destroyed";
  lastActivity: Date;
  tokenEstimate?: number;
}

export class SessionPool {
  private entries = new Map<string, PoolEntry>();
  private client: SquadClient;

  constructor(client: SquadClient) {
    this.client = client;
  }

  async spawn(config: SquadSessionConfig): Promise<SquadSession> {
    const session = await this.client.createSession(config);
    this.entries.set(session.sessionId, {
      session,
      agentName: config.agentName,
      createdAt: new Date(),
      status: "active",
      lastActivity: new Date(),
    });

    // Subscribe to lifecycle events
    session.on((event: any) => {
      const entry = this.entries.get(session.sessionId);
      if (!entry) return;
      entry.lastActivity = new Date();
      if (event.type === "session.idle") entry.status = "idle";
      if (event.type === "session.error") entry.status = "error";
    });

    return session;
  }

  async resume(sessionId: string, config?: Partial<SquadSessionConfig>): Promise<SquadSession> {
    const session = await this.client.resumeSession(sessionId, config);
    this.entries.set(session.sessionId, {
      session,
      agentName: config?.agentName ?? "unknown",
      createdAt: new Date(),
      status: "active",
      lastActivity: new Date(),
    });
    return session;
  }

  async destroy(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    try {
      await entry.session.destroy();
    } finally {
      entry.status = "destroyed";
      this.entries.delete(sessionId);
    }
  }

  async destroyAll(): Promise<void> {
    const promises = [...this.entries.keys()].map(id => this.destroy(id));
    await Promise.allSettled(promises);
  }

  getStatus(): Array<{
    sessionId: string;
    agentName: string;
    status: string;
    createdAt: Date;
    lastActivity: Date;
  }> {
    return [...this.entries.values()].map(e => ({
      sessionId: e.session.sessionId,
      agentName: e.agentName,
      status: e.status,
      createdAt: e.createdAt,
      lastActivity: e.lastActivity,
    }));
  }

  getSession(sessionId: string): SquadSession | undefined {
    return this.entries.get(sessionId)?.session;
  }

  getByAgent(agentName: string): SquadSession | undefined {
    for (const entry of this.entries.values()) {
      if (entry.agentName === agentName && entry.status !== "destroyed") {
        return entry.session;
      }
    }
    return undefined;
  }

  get activeCount(): number {
    return [...this.entries.values()].filter(e => e.status !== "destroyed").length;
  }
}
```

### 3. Event Bus (`src/runtime/event-bus.ts`)

Cross-session event aggregation. The coordinator, Ralph, and any future UI subscribe here — not to individual sessions.

```typescript
// src/runtime/event-bus.ts
export type SquadEventType =
  | "agent.spawned"
  | "agent.completed"
  | "agent.error"
  | "agent.idle"
  | "pool.empty"
  | "connection.lost"
  | "connection.restored";

export interface SquadEvent {
  type: SquadEventType;
  sessionId?: string;
  agentName?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

type SquadEventHandler = (event: SquadEvent) => void;

export class EventBus {
  private handlers = new Map<SquadEventType | "*", Set<SquadEventHandler>>();

  on(type: SquadEventType | "*", handler: SquadEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(event: SquadEvent): void {
    this.handlers.get(event.type)?.forEach(h => h(event));
    this.handlers.get("*")?.forEach(h => h(event));
  }
}
```

### 4. Configuration Management (`src/runtime/config.ts`)

Loads Squad configuration from `.squad/config.json` (new) and existing `.squad/` files. Provides typed config to the runtime.

```typescript
// src/runtime/config.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SquadRuntimeConfig {
  squadDir: string;             // .squad/ or .ai-team/ (detected)
  models: {
    default: string;
    costOptimized: string;
    premium: string;
    roleOverrides: Record<string, string>; // agentName → model
  };
  sessions: {
    defaultTimeoutMs: number;   // 300_000 (5 min)
    maxConcurrent: number;      // 8
    infiniteSessions: boolean;  // true
    compactionThreshold: number; // 0.80
  };
  mcp: Record<string, {
    type: "local" | "http" | "sse";
    command?: string;
    args?: string[];
    url?: string;
    tools: string[];
  }>;
}

const DEFAULTS: SquadRuntimeConfig = {
  squadDir: ".squad",
  models: {
    default: "claude-sonnet-4.5",
    costOptimized: "claude-haiku-4.5",
    premium: "claude-opus-4.5",
    roleOverrides: {},
  },
  sessions: {
    defaultTimeoutMs: 300_000,
    maxConcurrent: 8,
    infiniteSessions: true,
    compactionThreshold: 0.80,
  },
  mcp: {},
};

export async function loadConfig(projectRoot: string): Promise<SquadRuntimeConfig> {
  const config = { ...DEFAULTS };
  try {
    const raw = await readFile(join(projectRoot, ".squad", "config.json"), "utf-8");
    const parsed = JSON.parse(raw);
    Object.assign(config, parsed);
  } catch {
    // No config file — use defaults
  }
  return config;
}
```

### 5. TypeScript Project Setup

```jsonc
// tsconfig.json (new, at repo root alongside existing package.json)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

Package.json additions (merged into existing):
```jsonc
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "dev": "tsx src/index.ts",
    "test:sdk": "node --test test/sdk/*.test.ts"
  },
  "dependencies": {
    "@github/copilot-sdk": "^0.1.8",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

**Critical:** `index.js` (the installer) stays as plain JavaScript. It must work with zero build step for `npx create-squad`. The TypeScript `src/` tree is only for the `squad orchestrate` runtime path.

## Key Decisions

### Made
1. **Adapter pattern for SDK isolation** — Squad code never imports `@github/copilot-sdk` directly. All access goes through `src/adapter/`. This was identified as the critical risk mitigation for Technical Preview coupling.
2. **TypeScript alongside JavaScript** — `index.js` stays JS (installer), `src/` is TS (runtime). No migration of existing installer code.
3. **Protocol version 2 hardcoded** — Current SDK expects version 2. We check at startup and fail fast if mismatched.
4. **Session pool is in-memory** — No persistent session registry (SDK handles disk persistence via `listSessions()`). Pool tracks active sessions for the current coordinator lifetime.
5. **`approveAll` for permissions** — During Phase 1, all tool permissions auto-approved (matches current behavior). Fine-grained permission hooks come with PRD 2.
6. **SDK version pinned** — No floating semver. Exact version in `package.json`.

### Needed
1. **`squad orchestrate` CLI entry point** — How does the user start the SDK runtime? New subcommand? Or replace coordinator entirely? (Recommend: new `squad orchestrate` subcommand, feature-flagged.)
2. **Coordinator session model** — Does the coordinator itself become an SDK session? Or does it remain a prompt-only `.agent.md` that uses SDK sessions for spawned agents? (Recommend: Phase 1 keeps coordinator as `.agent.md`, spawned agents get SDK sessions. Phase 2 migrates coordinator.)
3. **Graceful degradation** — If SDK fails to start (missing CLI, wrong version), should we fall back to current `task` tool spawning? (Recommend: yes, with warning.)

## Implementation Notes

### Directory Structure (after PRD 1)
```
squad/
├── index.js                    # Installer CLI (unchanged)
├── package.json                # Updated with TS deps + SDK dep
├── tsconfig.json               # New
├── src/
│   ├── index.ts                # Entry: squad orchestrate
│   ├── adapter/
│   │   ├── index.ts
│   │   ├── client.ts           # SquadClient
│   │   ├── session.ts          # SquadSession
│   │   ├── types.ts            # Squad stable types
│   │   └── errors.ts           # Error classes
│   └── runtime/
│       ├── session-pool.ts
│       ├── event-bus.ts
│       ├── config.ts
│       └── health.ts
├── dist/                       # Build output (gitignored)
├── templates/                  # Unchanged
├── .github/agents/             # Unchanged
├── docs/                       # Unchanged
└── test/
    ├── index.test.js           # Existing installer tests
    └── sdk/                    # New SDK runtime tests
        ├── client.test.ts
        ├── session-pool.test.ts
        └── event-bus.test.ts
```

### Key TypeScript Patterns

1. **No `any` at adapter boundary** — Use `as unknown as TargetType` with explicit type assertions at the SDK↔Squad boundary. Comment each assertion with the SDK type being mapped.
2. **Error cause chains** — All `SquadSDKError` subclasses use `{ cause: originalError }` to preserve SDK error context.
3. **Async disposal** — `SquadClient` and `SessionPool` implement cleanup via `stop()` / `destroyAll()`. Consider `Symbol.asyncDispose` when Node.js support stabilizes.
4. **Event type narrowing** — Event bus uses discriminated unions; consumers narrow via `event.type` checks, matching SDK's pattern.

### Build Configuration

- `tsc` compiles `src/` → `dist/`
- `tsx` for dev mode (no build step)
- `dist/` added to `.gitignore` (built artifact)
- `dist/` included in npm package via `package.json` `"files"` field
- `"main": "index.js"` stays (installer entry), add `"exports"` for SDK runtime

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK breaking changes in v0.2.0 | HIGH | Adapter layer isolates all SDK types. Pin exact version. CI tests against SDK weekly. |
| CLI binary version mismatch | MEDIUM | `verifyCompatibility()` checks protocol version at startup. Fail fast with actionable error message. |
| Connection drops during long operations | MEDIUM | `ensureConnected()` with exponential backoff reconnection (3 attempts). EventBus emits `connection.lost` / `connection.restored`. |
| Session pool memory leak | LOW | Destroyed sessions removed from pool. `destroyAll()` on shutdown. `session.idle` → status tracked. |
| TypeScript build adds complexity | LOW | `tsx` for dev, `tsc` for CI. Installer (`index.js`) unaffected — zero build step for `npx create-squad`. |
| `@github/copilot` transitive dep not installed | MEDIUM | SDK depends on `@github/copilot` (CLI binary). Package must be in `node_modules`. Document in setup guide. |

## Success Metrics

1. **Connection lifecycle works end-to-end** — `SquadClient.start()` → `createSession()` → `sendAndWait("Hello")` → response received → `stop()`
2. **Protocol version check catches mismatches** — Attempting to connect with wrong CLI version produces actionable error, not silent failure
3. **Session pool tracks 8+ concurrent sessions** — spawn 8 agents, query pool status, all show correct agent names and states
4. **Reconnection recovers from transient failures** — Kill CLI process mid-operation → client reconnects → next operation succeeds
5. **Adapter isolates SDK changes** — Change a type in `adapter/types.ts`, verify no `src/runtime/` or `src/tools/` files need changes
6. **Existing `npm test` still passes** — TypeScript addition doesn't break existing 86+ installer tests

## Open Questions

1. Should `SquadClient` manage multiple `CopilotClient` instances (one per model provider) or use a single client with model override per session? SDK's `provider` config is per-session, suggesting single client is sufficient.
2. How should we handle the `@github/copilot` binary on Windows? SDK spawns it via `child_process.spawn()` which works, but path resolution for the bundled CLI may differ. Need to test on Windows early.
3. Should session IDs be deterministic (e.g., `squad-fenster-{hash}`) or random? Deterministic enables easier debugging but may cause collisions if same agent spawned twice.
4. What's the telemetry story? SDK sends telemetry to GitHub. Do we add Squad-specific telemetry on top? Or rely on SDK's built-in instrumentation?
