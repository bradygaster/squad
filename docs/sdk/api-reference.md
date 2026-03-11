# SDK API Reference

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Complete reference for all public exports from `@bradygaster/squad-sdk`. Each section includes types, functions, and usage examples.

## Overview

Squad SDK exports are organized by domain:

```typescript
// All imports work from the barrel export:
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

**Module:** `resolution.ts`

Functions to locate Squad directories.

### `resolveSquad(startPath?: string): string`

Find `.squad/` directory starting from a path and walking up to the project root.

```typescript
import { resolveSquad } from '@bradygaster/squad-sdk';

// From current directory
const squadPath = resolveSquad();  // → '/home/user/project/.squad'

// From specific path
const squadPath = resolveSquad('/home/user/project/src');  // → '/home/user/project/.squad'

// Throws if not found
try {
  const squadPath = resolveSquad('/tmp');  // No .squad/ anywhere
} catch (err) {
  console.error('Squad not found');
}
```

### `resolveGlobalSquadPath(): string`

Get path to global personal squad directory. Platform-specific:
- Linux: `~/.config/squad/`
- macOS: `~/Library/Application Support/squad/`
- Windows: `%APPDATA%\squad\`

```typescript
import { resolveGlobalSquadPath } from '@bradygaster/squad-sdk';

const globalSquad = resolveGlobalSquadPath();
// → /home/user/.config/squad  (on Linux)
// → /Users/user/Library/Application Support/squad  (on macOS)
// → C:\Users\user\AppData\Roaming\squad  (on Windows)
```

### `ensureSquadPath(startPath?: string): string`

Like `resolveSquad()`, but creates the directory if it doesn't exist.

```typescript
import { ensureSquadPath } from '@bradygaster/squad-sdk';

const squadPath = ensureSquadPath();  // Creates .squad/ if missing
```

---

## Runtime Constants

**Module:** `runtime/constants.ts`

Predefined catalogs for models, timeouts, and agent roles.

### `MODELS: ModelCatalog`

All 17 supported models, organized by tier.

```typescript
import { MODELS } from '@bradygaster/squad-sdk';

// Access by tier
MODELS.premium;   // ['claude-opus-4.6', 'gpt-5.2', ...]
MODELS.standard;  // ['claude-sonnet-4.5', 'gpt-5.1', ...]
MODELS.fast;      // ['claude-haiku-4.5', 'gpt-5-mini', ...]

// Find a model
const model = MODELS.all.find(m => m.name === 'claude-sonnet-4.5');
console.log(model.tier, model.costPerMToken);
```

### `TIMEOUTS: TimeoutConfig`

Standard timeout values for agent operations.

```typescript
import { TIMEOUTS } from '@bradygaster/squad-sdk';

console.log(TIMEOUTS.agentInitMs);        // 30000 (30s)
console.log(TIMEOUTS.agentExecuteMs);     // 300000 (5 min)
console.log(TIMEOUTS.coordinatorRouteMs); // 5000 (5s)
```

### `AGENT_ROLES: Record<string, RoleDefinition>`

Standard agent roles and their default properties.

```typescript
import { AGENT_ROLES } from '@bradygaster/squad-sdk';

console.log(AGENT_ROLES.lead);      // { tools: [...], model: 'standard', ... }
console.log(AGENT_ROLES.backend);   // { tools: [...], model: 'standard', ... }
console.log(AGENT_ROLES.frontend);  // { tools: [...], model: 'standard', ... }
```

---

## Configuration

**Module:** `config/*.ts`

Load and validate Squad configuration.

### `loadConfig(squadPath: string): Promise<ConfigLoadResult>`

Load configuration asynchronously. Reads `squad.config.ts` (if present), parses routing/model overrides, validates schemas.

```typescript
import { loadConfig } from '@bradygaster/squad-sdk';

const config = await loadConfig('./.squad');

console.log(config.team.name);          // Team name
console.log(Object.keys(config.agents)); // Agent names
console.log(config.routing.workTypes);  // Routing rules
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

interface RoutingConfig {
  workTypes: RoutingRule[];
  issueLabels?: IssueRoutingRule[];
}

interface RoutingRule {
  pattern: RegExp;
  targets: string[];
  tier?: ResponseTier;
}
```

### `loadConfigSync(squadPath: string): ConfigLoadResult`

Synchronous version of `loadConfig()`. Useful when you can't use async/await.

```typescript
import { loadConfigSync } from '@bradygaster/squad-sdk';

const config = loadConfigSync('./.squad');
```

---

## Agents & Onboarding

**Module:** `agents/onboarding.ts`

Create and configure agents at runtime.

### `onboardAgent(options: OnboardOptions): Promise<OnboardResult>`

Create a new agent directory, charter, and history file.

```typescript
import { onboardAgent } from '@bradygaster/squad-sdk';

const result = await onboardAgent({
  teamRoot: './.squad',
  agentName: 'data-analyst',
  role: 'backend',
  displayName: 'Dana — Data Analyst',
  projectContext: 'A recipe sharing app with PostgreSQL and React',
  userName: 'Alice',
});

console.log(result.agentDir);      // './.squad/agents/data-analyst'
console.log(result.charterPath);   // './.squad/agents/data-analyst/charter.md'
console.log(result.historyPath);   // './.squad/agents/data-analyst/history.md'
console.log(result.createdFiles);  // All files created
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

**Module:** `casting/index.ts`

Generate and track agent personas.

### `CastingEngine`

Runtime engine that generates agent personas from universe themes.

```typescript
import { CastingEngine, type CastingConfig } from '@bradygaster/squad-sdk';

const engine = new CastingEngine({
  universes: ['The Wire', 'Seinfeld'],
  activeUniverse: 'The Wire',
});

const members = await engine.castTeam([
  { role: 'lead', title: 'Lead Developer' },
  { role: 'backend', title: 'Backend Engineer' },
]);

console.log(members[0].name);       // e.g., 'Stringer' (from The Wire)
console.log(members[0].universe);   // 'The Wire'
console.log(members[0].role);       // 'lead'
```

### `CastingHistory`

Track all casting decisions over time.

```typescript
import { CastingHistory, type CastingRecord } from '@bradygaster/squad-sdk';

const history = new CastingHistory('./.squad/casting');

// Get all castings for an agent
const records = history.getRecordsByAgent('lead');

// Check if a name was used in a previous session
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

interface CastingRecord {
  sessionId: string;
  timestamp: Date;
  members: CastingRecord Member[];
}

interface CastingRecordMember extends CastMember {
  confidence: 'low' | 'medium' | 'high';
}
```

---

## Coordinator

**Module:** `coordinator/index.ts`

Central routing and orchestration engine.

### `SquadCoordinator`

Main class for routing work to agents.

```typescript
import { SquadCoordinator } from '@bradygaster/squad-sdk';

const coordinator = new SquadCoordinator({
  teamRoot: './.squad',
  enableParallel: true,
});

await coordinator.initialize();

// Route a message
const decision = await coordinator.route('refactor the API');

console.log(decision.tier);         // 'standard' or 'full'
console.log(decision.agents);       // ['backend', 'tester']
console.log(decision.parallel);     // true if multi-agent
console.log(decision.rationale);    // Explanation of routing choice

// Execute the decision
await coordinator.execute(decision, 'refactor the API');

// Cleanup
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

```typescript
import { selectResponseTier } from '@bradygaster/squad-sdk';

const tier = selectResponseTier({
  complexity: 'high',
  budget: 10,  // max tokens (thousands)
  userTeam: true,  // team task vs. personal
});

console.log(tier);  // 'standard' or 'full'
```

### `getTier(name: TierName): TierDefinition`

Get configuration for a specific tier.

```typescript
import { getTier } from '@bradygaster/squad-sdk';

const tier = getTier('standard');
console.log(tier.maxAgents);        // Max parallel agents
console.log(tier.defaultModel);     // Default model for this tier
console.log(tier.toolset);          // Available tools
```

---

## Tools

**Module:** `tools/index.ts`

Define custom tools and access the built-in tool registry.

### `defineTool<TArgs>(config: ToolConfig<TArgs>): SquadTool<TArgs>`

Define a new tool with typed parameters.

```typescript
import { defineTool, type ToolResult } from '@bradygaster/squad-sdk';

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

**Types:**

```typescript
interface ToolConfig<TArgs> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON schema
  handler: (args: TArgs) => Promise<SquadToolResult> | SquadToolResult;
  agentName?: string;
}

interface SquadToolResult {
  textResultForLlm: string;
  resultType: 'success' | 'failure' | 'unknown';
  error?: string;
  toolTelemetry?: Record<string, unknown>;
}
```

### `ToolRegistry`

Access and manage the built-in tool set.

```typescript
import { ToolRegistry } from '@bradygaster/squad-sdk';

const registry = new ToolRegistry('./.squad');

// Get all tools
const tools = registry.getTools();

// Get tools for a specific agent
const agentTools = registry.getToolsForAgent(['squad_route', 'squad_decide']);

// Look up a tool
const routeTool = registry.getTool('squad_route');
```

**Built-in tools:**

| Tool | Purpose |
|------|---------|
| `squad_route` | Route a task to another agent |
| `squad_decide` | Write decisions to the inbox |
| `squad_memory` | Append to agent history |
| `squad_status` | Query session pool state |
| `squad_skill` | Read/write agent skills |

---

## Observability (OpenTelemetry)

**Module:** `runtime/otel*.ts`

Three-layer observability API for traces, metrics, and telemetry.

### Layer 1: Low-Level Control

#### `initializeOTel(config?: OTelConfig): Promise<void>`

Initialize OTel providers (TracerProvider, MeterProvider) with OTLP HTTP exporters.

```typescript
import { initializeOTel } from '@bradygaster/squad-sdk';

await initializeOTel({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
  debug: true,
});
```

#### `shutdownOTel(): Promise<void>`

Flush pending traces and metrics, shut down providers.

```typescript
import { shutdownOTel } from '@bradygaster/squad-sdk';

await shutdownOTel();
```

#### `getTracer(name: string): Tracer`

Get a tracer instance for creating spans.

```typescript
import { getTracer } from '@bradygaster/squad-sdk';
import { SpanStatusCode } from '@opentelemetry/api';

const tracer = getTracer('my-component');

const span = tracer.startSpan('my-work', {
  attributes: { 'component': 'auth', 'user.id': '123' },
});

try {
  // Do work
} catch (err) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.recordException(err);
} finally {
  span.end();
}
```

#### `getMeter(name: string): Meter`

Get a meter instance for recording metrics.

```typescript
import { getMeter } from '@bradygaster/squad-sdk';

const meter = getMeter('my-component');

const counter = meter.createCounter('requests_total');
counter.add(1, { 'method': 'GET', 'status': '200' });
```

**Type:**

```typescript
interface OTelConfig {
  endpoint?: string;        // OTLP HTTP endpoint (e.g., http://localhost:4318)
  serviceName?: string;     // Service name for traces (default: 'squad-sdk')
  debug?: boolean;          // Enable debug logging
}
```

### Layer 2: Mid-Level Bridge

#### `bridgeEventBusToOTel(bus: EventBus): UnsubscribeFn`

Automatically forward all EventBus events as OTel spans.

```typescript
import { bridgeEventBusToOTel } from '@bradygaster/squad-sdk';

const unsubscribe = bridgeEventBusToOTel(eventBus);

// Later, clean up:
unsubscribe();
```

#### `createOTelTransport(): TelemetryTransport`

Create a telemetry transport backed by OTel.

```typescript
import { createOTelTransport, setTelemetryTransport } from '@bradygaster/squad-sdk';

const transport = createOTelTransport();
setTelemetryTransport(transport);
```

### Layer 3: High-Level Convenience

#### `initSquadTelemetry(options: SquadTelemetryOptions): Promise<SquadTelemetryHandle>`

One-call setup that configures OTel, wires the EventBus bridge, and registers the TelemetryTransport.

```typescript
import { initSquadTelemetry } from '@bradygaster/squad-sdk';

const telemetry = await initSquadTelemetry({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
  eventBus: myEventBus,
  installTransport: true,  // default
});

console.log('Tracing:', telemetry.tracing);   // boolean
console.log('Metrics:', telemetry.metrics);   // boolean

// Later:
await telemetry.shutdown();
```

**Types:**

```typescript
interface SquadTelemetryOptions extends OTelConfig {
  eventBus?: EventBus;
  installTransport?: boolean;  // default: true
}

interface SquadTelemetryHandle {
  tracing: boolean;
  metrics: boolean;
  shutdown(): Promise<void>;
}
```

---

## Streaming

**Module:** `runtime/streaming.ts`

Handle streamed agent responses.

### `createReadableStream(response: unknown): ReadableStream<string>`

Convert an agent response to a readable stream.

```typescript
import { createReadableStream } from '@bradygaster/squad-sdk';

const stream = createReadableStream(agentResponse);

const reader = stream.getReader();
let result;

while (!(result = await reader.read()).done) {
  console.log(result.value);  // Chunk of response
}
```

---

## Upstream Inheritance

**Module:** `upstream/index.ts`

Share practices, skills, and decisions across teams.

### Types

```typescript
type UpstreamType = 'local' | 'git' | 'export';

interface UpstreamSource {
  type: UpstreamType;
  location: string;      // Path or Git URL
  name: string;
  ref?: string;          // Git branch/tag
  lastSync?: Date;
}

interface UpstreamConfig {
  sources: UpstreamSource[];
}

interface ResolvedUpstream {
  name: string;
  skills?: SkillDefinition[];
  decisions?: DecisionEntry[];
  wisdom?: string;
  routing?: RoutingRules;
  castingPolicy?: CastingPolicy;
}
```

### Functions

#### `readUpstreamConfig(squadPath: string): Promise<UpstreamConfig>`

Load upstream sources from `.squad/upstream.json`.

```typescript
import { readUpstreamConfig } from '@bradygaster/squad-sdk';

const config = await readUpstreamConfig('./.squad');

for (const source of config.sources) {
  console.log(source.name, source.type, source.location);
}
```

#### `resolveUpstreams(config: UpstreamConfig, squadPath: string): Promise<ResolvedUpstream[]>`

Resolve all upstreams and return their inherited content.

```typescript
import { resolveUpstreams } from '@bradygaster/squad-sdk';

const resolved = await resolveUpstreams(config, './.squad');

// Merged skills from all upstreams
resolved.forEach(up => {
  console.log(`${up.name}: ${up.skills?.length || 0} skills`);
});
```

#### `buildInheritedContextBlock(resolved: ResolvedUpstream[]): string`

Build a markdown block of all inherited context (for agent charters).

```typescript
import { buildInheritedContextBlock } from '@bradygaster/squad-sdk';

const contextBlock = buildInheritedContextBlock(resolved);
// Use in agent charter as:
// ## Inherited Context
// [contextBlock]
```

#### `buildSessionDisplay(resolved: ResolvedUpstream[]): string`

Build a human-readable display of upstream sources (for `squad status`).

```typescript
import { buildSessionDisplay } from '@bradygaster/squad-sdk';

const display = buildSessionDisplay(resolved);
console.log(display);
// Output:
// Platform (git, last synced 2 days ago)
//   - 15 skills
//   - 3 decisions
```

---

## Skills

**Module:** `skills/index.ts`

Load and manage agent skills.

### Functions

```typescript
export function loadSkills(skillsDir: string): Promise<SkillDefinition[]>;
export function readSkill(skillPath: string): Promise<SkillDefinition>;
export function writeSkill(skillPath: string, skill: SkillDefinition): Promise<void>;
```

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
| `readUpstreamConfig` | function | upstream | Read upstream.json |
| `resolveUpstreams` | function | upstream | Resolve upstreams |
| `buildInheritedContextBlock` | function | upstream | Build context |
| `buildSessionDisplay` | function | upstream | Build UI display |

## Next Steps

- **Getting Started:** [Installation](../get-started/installation.md) — Set up Squad with the SDK
- **Features:** [Memory & Knowledge](../concepts/memory-and-knowledge.md) — How agents learn from your project
- **CLI Reference:** [CLI Documentation](../reference/cli.md) — Command-line interface guide
