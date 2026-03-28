# SDK Reference

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Complete reference for `@bradygaster/squad-sdk` — the programmatic API for Squad.

> **See also:** [API Reference (TypeDoc)](/reference/api/) — Complete auto-generated reference with full type signatures for all exports.

```bash
npm install @bradygaster/squad-sdk
```

All imports work from the barrel export:

```typescript
import { resolveSquad, loadConfig, SquadCoordinator, defineTool } from '@bradygaster/squad-sdk';
```

---

## Resolution

Find `.squad/` directories on disk.

| Function | Description |
|----------|-------------|
| `resolveSquad(startPath?)` | Find `.squad/` walking up from `startPath` (throws if not found) |
| `resolveGlobalSquadPath()` | Get personal squad directory path (platform-specific) |
| `ensureSquadPath(startPath?)` | Like `resolveSquad`, but creates `.squad/` if missing |

```typescript
const squadPath = resolveSquad();                // '/home/user/project/.squad'
const globalPath = resolveGlobalSquadPath();      // Platform-specific: ~/.config/squad/ (Linux), ~/Library/Application Support/squad/ (macOS), %APPDATA%\squad\ (Windows)
const safePath = ensureSquadPath();               // Creates if needed
```

---

## Configuration

### `loadConfig(squadPath): Promise<ConfigLoadResult>`

Load and validate Squad configuration asynchronously.

```typescript
const config = await loadConfig('./.squad');
config.team.name;           // Team name
Object.keys(config.agents); // Agent names
config.routing.workTypes;   // Routing rules
```

### `loadConfigSync(squadPath): ConfigLoadResult`

Synchronous version for scripts and CLI tools.

### `defineConfig(partial): SquadConfig`

Create a typed config with defaults and editor autocomplete:

```typescript
// squad.config.ts
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  team: { name: 'my-squad', root: '.squad' },
  agents: {
    backend: { model: 'claude-sonnet-4', tools: ['route', 'memory', 'decision'] },
  },
  routing: {
    workTypes: [
      { pattern: /\bAPI|backend\b/i, targets: ['backend'], tier: 'standard' },
    ],
  },
  models: {
    default: 'claude-sonnet-4',
    fallbackChains: {
      premium: ['claude-opus-4', 'gpt-4.1'],
      standard: ['claude-sonnet-4', 'gpt-4.1'],
      fast: ['claude-haiku-3.5', 'gpt-4.1-mini'],
    },
  },
});
```

### Key Types

```typescript
interface ConfigLoadResult {
  team: { name: string; root: string; description?: string };
  agents?: Record<string, AgentConfig>;
  routing?: RoutingConfig;
  models?: ModelConfig;
}

interface AgentConfig {
  role: string;
  model?: string;
  tools?: string[];
  status?: 'active' | 'inactive';
}
```

---

## Builder Functions (SDK-First Mode)

Type-safe team configuration with runtime validation. Each builder accepts a config object, validates it, and returns the typed value.

> **New in Phase 1** — SDK-First Mode lets you define teams in TypeScript instead of manually maintaining markdown. Run `squad build` to generate `.squad/` files.

See [SDK-First Mode Guide](../sdk-first-mode.md) for comprehensive documentation and examples.

### `defineTeam(config): TeamDefinition`

Define team metadata, members, and project context.

```typescript
const team = defineTeam({
  name: 'Platform Squad',
  description: 'Full-stack engineering team',
  projectContext: 'React/Node monorepo, TypeScript strict mode',
  members: ['@edie', '@mcmanus', '@fenster'],
});
```

**Type:**

```typescript
interface TeamDefinition {
  readonly name: string;
  readonly description?: string;
  readonly projectContext?: string;
  readonly members: readonly string[];
}
```

---

### `defineAgent(config): AgentDefinition`

Define a single agent with role, tools, model, and capabilities.

```typescript
const edie = defineAgent({
  name: 'edie',
  role: 'TypeScript Engineer',
  model: 'claude-sonnet-4',
  tools: ['grep', 'edit', 'powershell', 'view'],
  capabilities: [
    { name: 'type-system', level: 'expert' },
    { name: 'testing', level: 'proficient' },
  ],
  status: 'active',
});
```

**Type:**

```typescript
interface AgentDefinition {
  readonly name: string;
  readonly role: string;
  readonly charter?: string;
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly capabilities?: readonly AgentCapability[];
  readonly status?: 'active' | 'inactive' | 'retired';
}

interface AgentCapability {
  readonly name: string;
  readonly level: 'expert' | 'proficient' | 'basic';
}
```

---

### `defineRouting(config): RoutingDefinition`

Define routing rules with pattern matching and tier assignment.

```typescript
const routing = defineRouting({
  rules: [
    { pattern: 'feature-*', agents: ['@edie'], tier: 'standard' },
    { pattern: 'docs-*', agents: ['@mcmanus'], tier: 'lightweight' },
  ],
  defaultAgent: '@coordinator',
  fallback: 'coordinator',
});
```

**Type:**

```typescript
interface RoutingDefinition {
  readonly rules: readonly RoutingRule[];
  readonly defaultAgent?: string;
  readonly fallback?: 'ask' | 'default-agent' | 'coordinator';
}

interface RoutingRule {
  readonly pattern: string;
  readonly agents: readonly string[];
  readonly tier?: 'direct' | 'lightweight' | 'standard' | 'full';
  readonly priority?: number;
}
```

---

### `defineCeremony(config): CeremonyDefinition`

Define ceremonies (standups, retros, etc.) with schedule and participants.

```typescript
const standup = defineCeremony({
  name: 'standup',
  trigger: 'schedule',
  schedule: '0 9 * * 1-5',
  participants: ['@edie', '@mcmanus'],
  agenda: 'Yesterday / Today / Blockers',
});
```

**Type:**

```typescript
interface CeremonyDefinition {
  readonly name: string;
  readonly trigger?: string;
  readonly schedule?: string;
  readonly participants?: readonly string[];
  readonly agenda?: string;
  readonly hooks?: readonly string[];
}
```

---

### `defineHooks(config): HooksDefinition`

Define governance hooks — write paths, blocked commands, PII scrubbing.

```typescript
const hooks = defineHooks({
  allowedWritePaths: ['src/**', 'test/**', '.squad/**'],
  blockedCommands: ['rm -rf /', 'DROP TABLE'],
  maxAskUser: 3,
  scrubPii: true,
  reviewerLockout: true,
});
```

**Type:**

```typescript
interface HooksDefinition {
  readonly allowedWritePaths?: readonly string[];
  readonly blockedCommands?: readonly string[];
  readonly maxAskUser?: number;
  readonly scrubPii?: boolean;
  readonly reviewerLockout?: boolean;
}
```

---

### `defineCasting(config): CastingDefinition`

Define casting configuration — universe allowlists and overflow behavior.

```typescript
const casting = defineCasting({
  allowlistUniverses: ['The Usual Suspects', 'Breaking Bad'],
  overflowStrategy: 'generic',
  capacity: { 'The Usual Suspects': 8 },
});
```

**Type:**

```typescript
interface CastingDefinition {
  readonly allowlistUniverses?: readonly string[];
  readonly overflowStrategy?: 'reject' | 'generic' | 'rotate';
  readonly capacity?: Readonly<Record<string, number>>;
}
```

---

### `defineTelemetry(config): TelemetryDefinition`

Define OpenTelemetry configuration for observability.

```typescript
const telemetry = defineTelemetry({
  enabled: true,
  endpoint: 'http://localhost:4317',
  serviceName: 'squad-prod',
  sampleRate: 1.0,
  aspireDefaults: true,
});
```

**Type:**

```typescript
interface TelemetryDefinition {
  readonly enabled?: boolean;
  readonly endpoint?: string;
  readonly serviceName?: string;
  readonly sampleRate?: number;
  readonly aspireDefaults?: boolean;
}
```

---

### `defineSquad(config): SquadSDKConfig`

Compose all builders into a single SDK config.

```typescript
export default defineSquad({
  version: '1.0.0',
  team: defineTeam({ /* ... */ }),
  agents: [defineAgent({ /* ... */ })],
  routing: defineRouting({ /* ... */ }),
});
```

**Type:**

```typescript
interface SquadSDKConfig {
  readonly version?: string;
  readonly team: TeamDefinition;
  readonly agents: readonly AgentDefinition[];
  readonly routing?: RoutingDefinition;
  readonly ceremonies?: readonly CeremonyDefinition[];
  readonly hooks?: HooksDefinition;
  readonly casting?: CastingDefinition;
  readonly telemetry?: TelemetryDefinition;
}
```

---

## SquadClient

Wraps `@github/copilot-sdk` with lifecycle management and auto-reconnection.

```typescript
import { SquadClient } from '@bradygaster/squad-sdk';

const client = new SquadClient({
  port: 3000,
  auth: { token: process.env.COPILOT_TOKEN },
  reconnection: { maxRetries: 5, backoffMs: 1000 },
});

await client.connect();
```

**Connection states:** `disconnected → connecting → connected → reconnecting → error`

### SquadClientWithPool

Production-ready client composing `SquadClient`, `SessionPool`, and `EventBus`:

```typescript
import { SquadClientWithPool } from '@bradygaster/squad-sdk';

const squad = new SquadClientWithPool({
  client: clientOptions,
  pool: { maxConcurrent: 10, idleTimeout: 60_000 },
});

const session = await squad.createSession({ agent: 'backend' });
const response = await session.sendMessage('Implement the /users endpoint');
await session.destroy();
```

**Session states:** `creating → active → idle → error → destroyed`

---

## Coordinator

Central routing and orchestration engine.

### `SquadCoordinator`

```typescript
import { SquadCoordinator } from '@bradygaster/squad-sdk';

const coordinator = new SquadCoordinator({ teamRoot: './.squad', enableParallel: true });
await coordinator.initialize();

const decision = await coordinator.route('refactor the API');
// decision.tier:      'direct' | 'lightweight' | 'standard' | 'full'
// decision.agents:    ['backend', 'tester']
// decision.parallel:  true
// decision.rationale: 'Backend refactor with test coverage'

await coordinator.execute(decision, 'refactor the API');
await coordinator.shutdown();
```

### `selectResponseTier(context): TierName`

```typescript
const tier = selectResponseTier({ complexity: 'high', budget: 10, userTeam: true });
// → 'standard' or 'full'
```

### `getTier(name): TierDefinition`

```typescript
const tier = getTier('standard');
tier.maxAgents;     // Max parallel agents
tier.defaultModel;  // Default model
tier.toolset;       // Available tools
```

---

## Event Handling

Typed pub/sub for session lifecycle events:

```typescript
squad.events.on('session.created', (event) => {
  console.log(`Session ${event.sessionId} started`);
});

squad.events.on('session.status_changed', (event) => {
  if (event.payload.status === 'error') { /* handle */ }
});
```

**Events:** `session.created`, `session.destroyed`, `session.status_changed`, tool execution events.

---

## Tools & Hooks

### `defineTool<TArgs>(config): SquadTool<TArgs>`

```typescript
import { defineTool } from '@bradygaster/squad-sdk';

const myTool = defineTool<{ query: string }>({
  name: 'search_docs',
  description: 'Search project documentation',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  handler: async (args) => ({
    textResultForLlm: `Found results for "${args.query}"`,
    resultType: 'success',
  }),
});
```

### `ToolRegistry`

```typescript
const registry = new ToolRegistry('./.squad');
registry.getTools();                                    // All tools
registry.getToolsForAgent(['squad_route', 'squad_decide']); // Agent-specific
registry.getTool('squad_route');                         // Single lookup
```

**Built-in tools:**

| Tool | Purpose |
|------|---------|
| `squad_route` | Route a task to another agent |
| `squad_decide` | Write decisions to the inbox |
| `squad_memory` | Append to agent history |
| `squad_status` | Query session pool state |
| `squad_skill` | Read/write agent skills |

### HookPipeline

Intercept tool calls before (`PreToolUseHook`) and after (`PostToolUseHook`) execution:

```typescript
import { HookPipeline, type PreToolUseHook } from '@bradygaster/squad-sdk';

const auditHook: PreToolUseHook = async (toolName, params, context) => {
  console.log(`Agent ${context.agentId} calling ${toolName}`);
  return { action: 'allow' };
};

const pipeline = new HookPipeline();
pipeline.addPreHook(auditHook);
```

**Hook actions:** `allow`, `block`, `modify`

**Built-in policies:** ReviewerLockout, File Guards, Shell Restrictions, Rate Limits, PII Filters.

---

## Agents & Casting

### `onboardAgent(options): Promise<OnboardResult>`

```typescript
const result = await onboardAgent({
  teamRoot: './.squad',
  agentName: 'data-analyst',
  role: 'backend',
  displayName: 'Dana — Data Analyst',
  projectContext: 'A recipe sharing app',
});
// result.agentDir, result.charterPath, result.historyPath
```

### `CastingEngine`

```typescript
import { CastingEngine } from '@bradygaster/squad-sdk';

const engine = new CastingEngine({ universes: ['The Wire'], activeUniverse: 'The Wire' });
const members = await engine.castTeam([
  { role: 'lead', title: 'Lead Developer' },
  { role: 'backend', title: 'Backend Engineer' },
]);
// members[0].name → 'Stringer', members[0].universe → 'The Wire'
```

---

## Runtime Constants

```typescript
import { MODELS, TIMEOUTS, AGENT_ROLES } from '@bradygaster/squad-sdk';

MODELS.premium;  // ['claude-opus-4.6', 'gpt-5.2', ...]
MODELS.standard; // ['claude-sonnet-4.5', 'gpt-5.1', ...]
MODELS.fast;     // ['claude-haiku-4.5', 'gpt-5-mini', ...]

TIMEOUTS.agentInitMs;        // 30000
TIMEOUTS.agentExecuteMs;     // 300000
TIMEOUTS.coordinatorRouteMs; // 5000
```

---

## Upstream Inheritance

Share skills, decisions, and routing across teams.

```typescript
import { readUpstreamConfig, resolveUpstreams, buildInheritedContextBlock } from '@bradygaster/squad-sdk';

const config = await readUpstreamConfig('./.squad');
const resolved = await resolveUpstreams(config, './.squad');
const contextBlock = buildInheritedContextBlock(resolved);
```

**Upstream types:** `local`, `git`, `export`

---

## Observability (OpenTelemetry)

### Quick Setup

```typescript
import { initSquadTelemetry } from '@bradygaster/squad-sdk';

const telemetry = await initSquadTelemetry({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
  eventBus: myEventBus,
});

// ... run agents ...
await telemetry.shutdown();
```

### Low-Level Control

```typescript
import { initializeOTel, shutdownOTel, getTracer, getMeter } from '@bradygaster/squad-sdk';

await initializeOTel({ endpoint: 'http://localhost:4318' });

const tracer = getTracer('my-component');
const span = tracer.startSpan('my-work');
// ... do work ...
span.end();

const meter = getMeter('my-component');
const counter = meter.createCounter('requests_total');
counter.add(1);

await shutdownOTel();
```

---

## Error Classes

All errors extend `SquadError` with severity, category, and recoverability:

| Error | When |
|-------|------|
| `SDKConnectionError` | Connection failures (retryable) |
| `AuthenticationError` | Bad credentials (fatal) |
| `SessionLifecycleError` | Session state transitions |
| `ToolExecutionError` | Tool call failures |
| `ModelAPIError` | Model unavailable or rate limited |
| `ConfigurationError` | Invalid config (includes field + reason) |
| `RateLimitError` | Too many requests |
| `ValidationError` | Schema validation failures |

---

## Exports at a Glance

| Export | Type | Module |
|--------|------|--------|
| `resolveSquad` | function | resolution |
| `resolveGlobalSquadPath` | function | resolution |
| `ensureSquadPath` | function | resolution |
| `MODELS` | constant | runtime/constants |
| `TIMEOUTS` | constant | runtime/constants |
| `AGENT_ROLES` | constant | runtime/constants |
| `loadConfig` / `loadConfigSync` | function | config |
| `onboardAgent` | function | agents |
| `CastingEngine` / `CastingHistory` | class | casting |
| `SquadCoordinator` | class | coordinator |
| `selectResponseTier` / `getTier` | function | coordinator |
| `defineTool` / `ToolRegistry` | function/class | tools |
| `initializeOTel` / `shutdownOTel` | function | runtime/otel |
| `getTracer` / `getMeter` | function | runtime/otel |
| `initSquadTelemetry` | function | runtime/otel-init |

---

## See Also

- [CLI Reference](./cli.md) — Shell commands and config files
- [Recipes & Advanced Scenarios](../cookbook/recipes.md) — Prompt-driven cookbook
