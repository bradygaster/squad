# Runtime Configuration

> ⚠️ **Experimental** — Runtime abstraction is in active development. OpenCode, Claude Code, and Cursor drivers are planned but not yet implemented.

Squad supports multiple AI coding agent runtimes through a driver abstraction layer. This allows teams to use whichever runtime fits their workflow.

---

## Supported Runtimes

| Runtime | Status | Notes |
|---------|--------|-------|
| `copilot` | Stable | GitHub Copilot (default) |
| `opencode` | Planned | OpenCode CLI — protocol not yet documented |
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
| `name` | `string` | ✅ | Runtime identifier: `'copilot'` (default), `'opencode'`, `'claude-code'`, `'cursor'` |
| `config` | `object` | ❌ | Runtime-specific configuration passed to the driver |
| `cliPath` | `string` | ❌ | Path to runtime CLI executable (useful for custom installations) |
| `cliUrl` | `string` | ❌ | URL for external server connection (mutually exclusive with `cliPath`) |

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

### OpenCode (Planned)

OpenCode is a CLI-based agent runtime. Configuration details will be added once the protocol is documented.

```typescript
runtime: defineRuntime({
  name: 'opencode',
  cliPath: '/usr/local/bin/opencode',  // optional
}),
```

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
  initialize(config: RuntimeConfig): Promise<void>;
  createSession(options: SessionOptions): Promise<AgentSession>;
  listSessions(): Promise<SessionInfo[]>;
  dispose(): Promise<void>;
}
```

See [`packages/squad-sdk/src/runtime/driver.ts`](https://github.com/bradygaster/squad/blob/dev/packages/squad-sdk/src/runtime/driver.ts) for the full interface.

---

## See Also

- [SDK-First Mode](./sdk-first-mode.md) — define your team in TypeScript
- [Architecture](./concepts/architecture.md) — how Squad components work together
- [GitHub Workflow](./concepts/github-workflow.md) — current Copilot integration details