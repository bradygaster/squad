# Squad Runtime Agnostic Refactoring Plan

## Overview

Refactor Squad to support alternative AI coding agent runtimes beyond GitHub Copilot (e.g., OpenCode CLI), enabling platform-agnostic multi-agent orchestration.

## Current Architecture Analysis

### Hard Coupling Points
1. **`CopilotClient` instantiation** — directly imports `@github/copilot-sdk`
2. **CLI commands** (`start`, `aspire`) — hardcoded to launch GitHub Copilot
3. **Platform detection** — GitHub-specific file/issue APIs
4. **Session pool** — tied to Copilot session lifecycle

### Existing Abstraction Points
- `adapter/types.ts` — Squad-stable interfaces decoupling from Copilot SDK types
- `adapter/client.ts` — `CopilotSessionAdapter` wrapping SDK sessions to `SquadSession` interface
- `SquadProviderConfig` — BYOK support for API endpoints (but not runtime agnostic)

---

## Implementation Phases

### Phase 1: Driver Interface Definition
**Effort:** Medium

Create `AgentRuntimeDriver` interface that abstracts runtime-specific implementations.

```typescript
// packages/squad-sdk/src/runtime/driver.ts

export interface AgentRuntimeDriver {
  readonly name: string;  // "copilot" | "opencode" | "claude-code" | "cursor"

  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Session management
  createSession(config: SessionConfig): Promise<AgentSession>;
  resumeSession(sessionId: string, config?: SessionConfig): Promise<AgentSession>;
  listSessions(): Promise<SessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;

  // Auth
  getAuthStatus(): Promise<AuthStatus>;
  getStatus(): Promise<RuntimeStatus>;

  // Models
  listModels(): Promise<ModelInfo[]>;
}

export interface AgentSession {
  readonly sessionId: string;
  sendMessage(options: MessageOptions): Promise<void>;
  sendAndWait(options: MessageOptions, timeout?: number): Promise<unknown>;
  abort(): Promise<void>;
  getMessages(): Promise<unknown[]>;
  on(eventType: string, handler: EventHandler): void;
  off(eventType: string, handler: EventHandler): void;
  close(): Promise<void>;
}
```

### Phase 2: Copilot Driver Extraction
**Effort:** Medium

Move current `CopilotClient` wrapper logic into a dedicated driver under `drivers/copilot/`.

```
packages/squad-sdk/src/drivers/
├── copilot/
│   └── driver.ts        # Current CopilotClient wrapper (refactored)
├── opencode/
│   └── driver.ts        # New: OpenCode CLI driver (future)
└── index.ts             # Driver registry and factory
```

### Phase 3: OpenCode Driver Implementation
**Effort:** Medium-High

Implement `OpenCodeDriver` for OpenCode CLI using stdio communication.

Key considerations:
- Discover OpenCode's JSON-RPC/stlio interface
- Implement session lifecycle management
- Handle tool schema mapping

### Phase 4: Config Schema Update
**Effort:** Low

Add `runtime` field to `squad.config.ts`:

```typescript
export default defineSquad({
  runtime: {
    name: "opencode",  // or "copilot", "claude-code", etc.
    config: {
      // runtime-specific configuration
    }
  },
  // ... existing config
});
```

### Phase 5: CLI Command Routing
**Effort:** Medium

Make `start`, `doctor`, and other runtime-aware commands use the active driver instead of hardcoding Copilot.

```typescript
// Abstract command interface
export interface RuntimeCommand {
  start(options: StartOptions): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<RuntimeStatus>;
}
```

### Phase 6: Session Pool Abstraction
**Effort:** Medium

Update `SessionPool` to use `AgentRuntimeDriver` interface instead of `CopilotClient` directly.

---

## Directory Structure

```
packages/squad-sdk/src/
├── runtime/
│   ├── driver.ts           # AgentRuntimeDriver interface
│   ├── registry.ts         # RuntimeRegistry for driver management
│   └── index.ts
├── drivers/
│   ├── copilot/
│   │   └── driver.ts       # Copilot runtime driver
│   ├── opencode/
│   │   └── driver.ts       # OpenCode runtime driver (future)
│   └── index.ts
├── adapter/
│   ├── client.ts          # SquadClient (updated to use driver)
│   ├── types.ts            # Squad stable types
│   └── errors.ts
└── ... existing modules ...
```

---

## Key Challenges

| Challenge | Mitigation |
|----------|------------|
| OpenCode Protocol Discovery | Implement wrapper that spawns opencode and communicates via stdin/stdout. May need to discover or define JSON-RPC interface. |
| Session Persistence | Each runtime may have its own storage format. Abstract to common interface. |
| Tool Schema Differences | Create tool mapping layer between runtime tools and Squad's tool interface. |
| Model Selection | Abstract `listModels()` to a common model interface. |

---

## Minimal Viable Change (MVP)

For quick OpenCode support:

1. Create `AgentRuntimeDriver` interface
2. Create `OpenCodeDriver` with `connect()`, `createSession()`, `sendMessage()`, `close()`
3. Make `SquadClient` accept a driver instead of hardcoding `CopilotClient`
4. Add `runtime` option to `squad.config.ts`
5. Keep tooling, routing, casting, hooks unchanged

This gives working OpenCode integration without rewriting the entire platform.

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/squad-sdk/src/runtime/driver.ts` | Driver interface definitions |
| `packages/squad-sdk/src/runtime/registry.ts` | RuntimeRegistry for driver management |
| `packages/squad-sdk/src/runtime/index.ts` | Runtime module exports |
| `packages/squad-sdk/src/drivers/copilot/driver.ts` | Copilot driver (refactored) |
| `packages/squad-sdk/src/drivers/opencode/driver.ts` | OpenCode driver (new) |
| `packages/squad-sdk/src/drivers/index.ts` | Driver exports |

## Files to Modify

| File | Changes |
|------|---------|
| `packages/squad-sdk/src/adapter/client.ts` | Make SquadClient use RuntimeRegistry |
| `packages/squad-sdk/src/builders/types.ts` | Add runtime config to squad builder |
| `packages/squad-sdk/src/config/schema.ts` | Add runtime field validation |
| `packages/squad-cli/src/cli-entry.ts` | Runtime-aware command routing |
| `squad.config.ts` | Add runtime configuration option |

---

## Success Criteria

1. Squad can be configured to use "opencode" as the runtime
2. Agent sessions can be created via OpenCode CLI (stdio)
3. Messages can be sent to agents and responses received
4. Sessions can be closed cleanly
5. Existing Copilot-based workflows continue to work unchanged
6. New runtimes can be added by implementing `AgentRuntimeDriver` interface
