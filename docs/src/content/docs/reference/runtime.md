# Runtime Configuration

Squad supports multiple AI coding agent runtimes through a driver abstraction layer. This allows teams to use whichever runtime fits their workflow.

---

## Supported Runtimes

| Runtime | Status | Notes |
|---------|--------|-------|
| `copilot` | Stable | GitHub Copilot (default) |
| `opencode` | Experimental | OpenCode CLI — uses subprocess mode with JSON event streaming |
| `claude-code` | Planned | Anthropic Claude Code — not yet started |
| `cursor` | Planned | Cursor AI — not yet started |

---

## Configuring a Runtime

### SDK-First (Recommended)

In `squad.config.ts`, use the `runtime` option:

```typescript
import { defineSquad, defineTeam, defineAgent, defineRuntime } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({
    name: 'Platform Squad',
    members: ['@edie'],
  }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer' }),
  ],
  runtime: defineRuntime({
    name: 'copilot',
    config: {
      // copilot-specific config
    },
  }),
});
```

### Runtime Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | Yes | Runtime identifier: `'copilot'` (default), `'opencode'`, `'claude-code'`, `'cursor'` |
| `config` | `object` | No | Runtime-specific configuration passed to the driver |
| `cliPath` | `string` | No | Path to runtime CLI executable (useful for custom installations) |
| `cliUrl` | `string` | No | URL for external server connection (mutually exclusive with `cliPath`) |

---

## Runtime-Specific Configuration

### GitHub Copilot

Copilot is the default runtime. No configuration needed for standard setup.

```typescript
runtime: defineRuntime({
  name: 'copilot',
  config: {
    // Optional: override defaults
  },
}),
```

**Authentication:** Uses `gh auth` credentials. Run `gh auth login` before using Squad.

### OpenCode

OpenCode is a CLI-based agent runtime that uses the `opencode run` command with JSON output for subprocess communication.

```typescript
runtime: defineRuntime({
  name: 'opencode',
  cliPath: '/usr/local/bin/opencode',  // optional, defaults to 'opencode'
  config: {
    requestTimeout: 120000,  // ms, default 120s
    sessionTimeout: 300000, // ms, default 300s
  },
}),
```

**How it works:** Each session spawns a new `opencode run --format json` subprocess. The driver parses JSON events (`step_start`, `text`, `step_finish`) for streaming output and error handling.

**Session continuation:** The `--continue` flag is automatically used when resuming a session.

**Authentication:** Uses OpenCode CLI authentication (no additional config needed).

### Claude Code (Planned)

Anthropic's Claude Code agent. Not yet implemented.

### Cursor (Planned)

Cursor AI's agent mode. Not yet implemented.

---

## Changing the Runtime

To switch from the default Copilot to another runtime:

1. **Update `squad.config.ts`:**

```typescript
runtime: defineRuntime({
  name: 'opencode',
}),
```

2. **Run `squad build`** to regenerate config:

```bash
squad build
```

3. **Verify with `squad doctor`**:

```bash
squad doctor
```

---

## Driver Interface

Advanced users can implement custom drivers by implementing `AgentRuntimeDriver`:

```typescript
interface AgentRuntimeDriver {
  readonly name: string;
  readonly displayName: string;
  getState(): DriverConnectionState;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<Error[]>;
  createSession(config?: DriverSessionConfig): Promise<AgentSession>;
  resumeSession(sessionId: string, config?: DriverSessionConfig): Promise<AgentSession>;
  listSessions(): Promise<DriverSessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  getAuthStatus(): Promise<DriverAuthStatus>;
  listModels(): Promise<DriverModelInfo[]>;
  sendMessage(session: AgentSession, options: DriverMessageOptions): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}
```

See [`packages/squad-sdk/src/runtime/driver.ts`](https://github.com/bradygaster/squad/blob/dev/packages/squad-sdk/src/runtime/driver.ts) for the full interface.

---

## See Also

- [SDK-First Mode](./sdk-first-mode.md) — define your team in TypeScript
- [Architecture](./concepts/architecture.md) — how Squad components work together
- [GitHub Workflow](./concepts/github-workflow.md) — current Copilot integration details