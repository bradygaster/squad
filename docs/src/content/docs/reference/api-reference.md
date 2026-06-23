# SDK API Reference

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Complete reference for all public exports from `@bradygaster/squad-sdk`. Each section includes types, functions, and usage examples.

## Overview

```typescript
import {
  // Resolution
  resolveSquad, resolveGlobalSquadPath, ensureSquadPath,
  
  // Runtime
  MODELS, TIMEOUTS, AGENT_ROLES,
  loadConfig, loadConfigSync,
  
  // Agents
  onboardAgent,
  
  // Casting
  CastingEngine, CastingHistory,
  
  // Coordinator
  SquadCoordinator, selectResponseTier, getTier,
  
  // Tools
  defineTool, ToolRegistry,
  
  // OTel
  initializeOTel, shutdownOTel, getTracer, getMeter,
  bridgeEventBusToOTel, createOTelTransport,
  initSquadTelemetry,
} from '@bradygaster/squad-sdk';
```

---

## Resolution

Functions to locate Squad directories.

### `resolveSquad(startPath?: string): string`

Find `.squad/` directory starting from a path and walking up to the project root. Throws if not found.

```typescript
const squadPath = resolveSquad();
const squadPath = resolveSquad('/home/user/project/src');
```

### `resolveGlobalSquadPath(): string`

Get path to global personal squad. Returns platform-specific path: `~/.config/squad/` on Linux, `~/Library/Application Support/squad/` on macOS, `%APPDATA%\squad\` on Windows.

### `ensureSquadPath(startPath?: string): string`

Like `resolveSquad()`, but creates the directory if it doesn't exist.

---

## Runtime Constants

### `MODELS: ModelCatalog`

All supported models, organized by tier.

```typescript
MODELS.premium;   // ['claude-opus-4.6', 'gpt-5.2', ...]
MODELS.standard;  // ['claude-sonnet-4.5', 'gpt-5.1', ...]
MODELS.fast;      // ['claude-haiku-4.5', 'gpt-5-mini', ...]
```

### `TIMEOUTS: TimeoutConfig`

Standard timeout values for agent operations.

```typescript
TIMEOUTS.agentInitMs;        // 30000 (30s)
TIMEOUTS.agentExecuteMs;     // 300000 (5 min)
TIMEOUTS.coordinatorRouteMs; // 5000 (5s)
```

### `AGENT_ROLES: Record<string, RoleDefinition>`

Standard agent roles and their default properties.

---

## Configuration

### `loadConfig(squadPath: string): Promise<ConfigLoadResult>`

Load configuration asynchronously. Reads `squad.config.ts` (if present), parses routing/model overrides, validates schemas.

```typescript
const config = await loadConfig('./.squad');
console.log(config.team.name);
console.log(Object.keys(config.agents));
```

**Types:**

```typescript
interface ConfigLoadResult {
  team: {
    name: string;
    root: string;
    description?: string;
  };
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

### `loadConfigSync(squadPath: string): ConfigLoadResult`

Synchronous version of `loadConfig()`.

---

## Agents & Onboarding

### `onboardAgent(options: OnboardOptions): Promise<OnboardResult>`

Create a new agent directory, charter, and history file.

```typescript
const result = await onboardAgent({
  teamRoot: './.squad',
  agentName: 'data-analyst',
  role: 'backend',
  displayName: 'Dana — Data Analyst',
  projectContext: 'A recipe sharing app with PostgreSQL and React',
  userName: 'Alice',
});
```

**Types:**

```typescript
interface OnboardOptions {
  teamRoot: string;
  agentName: string;
  role: string;
  displayName?: string;
  projectContext?: string;
  userName?: string;
  charterTemplate?: string;
}

interface OnboardResult {
  createdFiles: string[];
  agentDir: string;
  charterPath: string;
  historyPath: string;
}
```

---

## Casting

### `CastingEngine`

Generate agent personas from universe themes.

```typescript
const engine = new CastingEngine({
  universes: ['The Wire', 'Seinfeld'],
  activeUniverse: 'The Wire',
});

const members = await engine.castTeam([
  { role: 'lead', title: 'Lead Developer' },
  { role: 'backend', title: 'Backend Engineer' },
]);
```

### `CastingHistory`

Track all casting decisions over time.

```typescript
const history = new CastingHistory('./.squad/casting');
const records = history.getRecordsByAgent('lead');
const previousCast = history.findByName('Stringer');
```

**Types:**

```typescript
interface CastMember {
  name: string;
  role: string;
  universe: string;
  displayName: string;
}
```

---

## Coordinator

### `SquadCoordinator`

Main class for routing work to agents.

```typescript
const coordinator = new SquadCoordinator({
  teamRoot: './.squad',
  enableParallel: true,
});

await coordinator.initialize();

const decision = await coordinator.route('refactor the API');
console.log(decision.tier);      // 'standard' or 'full'
console.log(decision.agents);    // ['backend', 'tester']
console.log(decision.parallel);  // true if multi-agent
console.log(decision.rationale); // Explanation of routing choice

await coordinator.execute(decision, 'refactor the API');
await coordinator.shutdown();
```

**Types:**

```typescript
interface RoutingDecision {
  tier: ResponseTier;
  agents: string[];
  parallel: boolean;
  rationale: string;
}

type ResponseTier = 'direct' | 'lightweight' | 'standard' | 'full';
```

### `selectResponseTier(context: TierContext): TierName`

Choose the right response tier for a task.

### `getTier(name: TierName): TierDefinition`

Get configuration for a specific tier (max agents, default model, available tools).

---

## Tools

### `defineTool<TArgs>(config: ToolConfig<TArgs>): SquadTool<TArgs>`

Define a new tool with typed parameters.

```typescript
const myTool = defineTool<{ query: string }>({
  name: 'search_docs',
  description: 'Search project documentation',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    const results = await searchDocs(args.query);
    return {
      textResultForLlm: `Found ${results.length} results`,
      resultType: 'success',
      toolTelemetry: { resultCount: results.length },
    };
  },
});
```

### `ToolRegistry`

Manage the built-in tool set.

```typescript
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';
import type { FanOutDependencies } from '@bradygaster/squad-sdk/coordinator';

const registry = new ToolRegistry('./.squad');
const tools = registry.getTools();
const agentTools = registry.getToolsForAgent(['squad_route', 'squad_decide']);
```

**Constructor:** `new ToolRegistry(squadRoot?, sessionPoolGetter?, storage?, state?, fanOutDepsGetter?)`

- `fanOutDepsGetter` — Required for `squad_route` to spawn sessions via `spawnParallel`. Returns a `FanOutDependencies` object (from `@bradygaster/squad-sdk/coordinator`). Without it, `squad_route` returns `resultType: 'failure'` with `error: 'fan-out-deps-unavailable'`.
- `state` — When provided, `squad_route` validates that the target agent exists in the team roster before spawning.
- Agent names must match `/^[a-zA-Z0-9_-]+$/`. Spawn errors are sanitized before being returned to the LLM.

**Built-in tools:**

| Tool | Purpose |
|------|---------|
| `squad_route` | Route a task to another agent (requires `fanOutDepsGetter`) |
| `squad_decide` | Write decisions to the inbox |
| `squad_memory` | Append to agent history |
| `squad_status` | Query session pool state |
| `squad_skill` | Read/write agent skills |

---

## Observability (OpenTelemetry)

Three-layer observability API for traces, metrics, and telemetry.

### Layer 1: Low-Level Control

```typescript
import { initializeOTel, shutdownOTel, getTracer, getMeter } from '@bradygaster/squad-sdk';

await initializeOTel({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
});

const tracer = getTracer('my-component');
const meter = getMeter('my-component');

await shutdownOTel();
```

### Layer 2: Mid-Level Bridge

```typescript
import { bridgeEventBusToOTel, createOTelTransport } from '@bradygaster/squad-sdk';

const unsubscribe = bridgeEventBusToOTel(eventBus);
const transport = createOTelTransport();
```

### Layer 3: High-Level Convenience

```typescript
import { initSquadTelemetry } from '@bradygaster/squad-sdk';

const telemetry = await initSquadTelemetry({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
  eventBus: myEventBus,
});

await telemetry.shutdown();
```

---

## Streaming

### `createReadableStream(response: unknown): ReadableStream<string>`

Convert an agent response to a readable stream.

```typescript
const stream = createReadableStream(agentResponse);
const reader = stream.getReader();
let result;

while (!(result = await reader.read()).done) {
  console.log(result.value);
}
```

---

## Upstream Inheritance

### `readUpstreamConfig(squadPath: string): Promise<UpstreamConfig>`

Load upstream sources from `.squad/upstream.json`.

### `resolveUpstreams(config: UpstreamConfig, squadPath: string): Promise<ResolvedUpstream[]>`

Resolve all upstreams and return their inherited content.

### `buildInheritedContextBlock(resolved: ResolvedUpstream[]): string`

Build a markdown block of all inherited context (for agent charters).

### `buildSessionDisplay(resolved: ResolvedUpstream[]): string`

Build a human-readable display of upstream sources (for `squad status`).

---

## Glossary of Exports

| Export | Type | Module | Purpose |
|--------|------|--------|---------|
| `resolveSquad` | function | resolution | Find .squad directory |
| `resolveGlobalSquadPath` | function | resolution | Get ~/.squad path |
| `ensureSquadPath` | function | resolution | Find or create .squad |
| `MODELS` | constant | runtime/constants | Model catalog |
| `TIMEOUTS` | constant | runtime/constants | Standard timeouts |
| `AGENT_ROLES` | constant | runtime/constants | Agent role definitions |
| `loadConfig` | function | config | Async config loading |
| `loadConfigSync` | function | config | Sync config loading |
| `onboardAgent` | function | agents | Create new agent |
| `CastingEngine` | class | casting | Generate personas |
| `CastingHistory` | class | casting | Track castings |
| `SquadCoordinator` | class | coordinator | Route and orchestrate |
| `selectResponseTier` | function | coordinator | Choose response tier |
| `getTier` | function | coordinator | Get tier config |
| `defineTool` | function | tools | Define custom tool |
| `ToolRegistry` | class | tools | Manage tools |
| `initializeOTel` | function | runtime/otel | Init OTel providers |
| `shutdownOTel` | function | runtime/otel | Shutdown OTel |
| `getTracer` | function | runtime/otel | Get tracer |
| `getMeter` | function | runtime/otel | Get meter |
| `bridgeEventBusToOTel` | function | runtime/otel-bridge | EventBus → OTel |
| `createOTelTransport` | function | runtime/otel-bridge | Create OTel transport |
| `initSquadTelemetry` | function | runtime/otel-init | One-call setup |

---

## See Also

- [SDK Reference](sdk.md) — Quick reference for common SDK usage
- [Integration Guide](integration.md) — Connecting to the Copilot SDK
- [Tools & Hooks](tools-and-hooks.md) — Custom tools and hook pipeline
- [Installation](../get-started/installation.md) — Getting started
