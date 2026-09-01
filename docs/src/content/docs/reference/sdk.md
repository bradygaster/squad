# SDK Reference

> **Experimental:** Squad is alpha software. APIs and behavior may change between releases.

This is the curated quick reference for `@bradygaster/squad-sdk`. The SDK provides configuration builders, model selection, agent lifecycle APIs, routing, tools, storage, telemetry, and platform integrations.

For every public type and export, see the [generated API reference](./api/).

## Install

```bash
npm install @bradygaster/squad-sdk
```

The package uses ESM and exposes a root entrypoint plus focused subpath entrypoints:

| Import path | Use for |
|-------------|---------|
| `@bradygaster/squad-sdk` | Resolution, configuration, builders, models, roles, storage, telemetry, and shared types |
| `@bradygaster/squad-sdk/client` | `SquadClient`, `SquadClientWithPool`, `SessionPool`, and client events |
| `@bradygaster/squad-sdk/coordinator` | `SquadCoordinator`, fan-out, and response-tier orchestration |
| `@bradygaster/squad-sdk/tools` | `defineTool` and `ToolRegistry` |
| `@bradygaster/squad-sdk/hooks` | `HookPipeline` and hook policy types |
| `@bradygaster/squad-sdk/config` | Configuration schema and model registry APIs |
| `@bradygaster/squad-sdk/casting` | Persona casting and casting history |
| `@bradygaster/squad-sdk/platform` | GitHub, Azure DevOps, and communication adapters |
| `@bradygaster/squad-sdk/state` | State collections and handles |

## Configuration

### `defineConfig(config): SquadConfig`

Create a typed configuration object with defaults and editor autocomplete.

```typescript
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  version: '1.0.0',
  team: {
    name: 'Platform Squad',
    projectContext: 'TypeScript monorepo with a REST API',
  },
  agents: [
    {
      name: 'backend',
      role: 'Backend Engineer',
      model: 'gpt-5.6-terra',
      tools: ['route', 'memory', 'decision'],
    },
  ],
  routing: {
    rules: [
      { pattern: 'api|backend', agents: ['backend'], tier: 'standard' },
    ],
    fallbackBehavior: 'coordinator',
  },
  models: {
    default: 'gpt-5.6-terra',
    defaultTier: 'standard',
    tiers: {
      premium: ['gpt-5.6-sol', 'claude-opus-5'],
      standard: ['gpt-5.6-terra', 'claude-sonnet-5'],
      fast: ['gpt-5.6-luna', 'claude-haiku-4.5'],
    },
  },
});
```

The configuration schema includes:

- `team`: name, description, project context, and optional issue source.
- `agents`: named agents with roles, models, tools, status, reasoning effort, and context tier.
- `routing`: ordered rules, fallback behavior, and optional priorities.
- `models`: default model, default tier, tier lists, agent overrides, task mappings, and cost policy.
- `hooks`, `ceremonies`, and `plugins`: optional team capabilities.

### `loadConfig(squadPath)` and `loadConfigSync(squadPath)`

Load and validate Squad configuration asynchronously or synchronously.

```typescript
import { loadConfig } from '@bradygaster/squad-sdk';

const result = await loadConfig('./.squad');
console.log(result.config.models.defaultModel);
```

Use `result.errors` and `result.warnings` when presenting validation results. The runtime loader uses `defaultModel`, `defaultTier`, and `fallbackChains`; `defineConfig` uses the public schema fields `default`, `defaultTier`, and `tiers` shown above.

## SDK-First Builders

> [!CAUTION]
> SDK-first team configuration is deprecated. `squad init --sdk` will be removed in v2. These builders remain documented for existing `squad.config.ts` projects during the transition.

Builders validate typed team definitions before they are written to `.squad/` by `squad build`.

```typescript
import {
  defineAgent,
  defineBudget,
  defineDefaults,
  defineRouting,
  defineSquad,
  defineTeam,
} from '@bradygaster/squad-sdk';

const squad = defineSquad({
  version: '1.0.0',
  team: defineTeam({
    name: 'Platform Squad',
    members: ['backend', 'tester'],
  }),
  agents: [
    defineAgent({
      name: 'backend',
      role: 'Backend Engineer',
      model: 'gpt-5.6-terra',
      budget: defineBudget({ perSession: 100_000 }),
    }),
    defineAgent({ name: 'tester', role: 'Test Engineer' }),
  ],
  defaults: defineDefaults({ model: 'gpt-5.6-luna' }),
  routing: defineRouting({
    rules: [{ pattern: 'test-*', agents: ['tester'], tier: 'standard' }],
    fallback: 'coordinator',
  }),
});
```

Available builders are `defineTeam`, `defineAgent`, `defineBudget`, `defineDefaults`, `defineRouting`, `defineCeremony`, `defineHooks`, `defineCasting`, `defineTelemetry`, `defineSkill`, and `defineSquad`.

## Model Selection

`MODELS` is the runtime source of truth for defaults and fallback chains.

```typescript
import { MODELS } from '@bradygaster/squad-sdk';

MODELS.DEFAULT;                  // gpt-5.6-terra, env-overridable
MODELS.SELECTOR_DEFAULT;         // gpt-5.6-luna
MODELS.SELECTOR_DEFAULT_TIER;    // fast
MODELS.FALLBACK_CHAINS.premium;  // starts with gpt-5.6-sol
MODELS.FALLBACK_CHAINS.standard; // starts with gpt-5.6-terra
MODELS.FALLBACK_CHAINS.fast;     // starts with gpt-5.6-luna
MODELS.NUCLEAR_FALLBACK;         // claude-haiku-4.5
```

Automatic task-aware selection uses Terra for code and prompt architecture, Luna for docs, planning, triage, and other non-code work, and Sol for visual or design work. Persistent model preferences and per-agent overrides take precedence over automatic selection.

The default model can be changed with `SQUAD_DEFAULT_MODEL`. The fallback chains are tier-preserving; a failed fast or standard selection does not upgrade to premium.

### Cost policy

Cost ceilings are separate from quality tiers. Use `maxCategory` with `lightweight`, `versatile`, or `powerful` when automatic selection must stay within a billing category.

```typescript
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  models: {
    costPolicy: { maxCategory: 'versatile' },
  },
});
```

## Resolution

Resolution helpers locate project, personal, and shared Squad state.

```typescript
import {
  ensureSquadPath,
  resolveGlobalSquadPath,
  resolveSquad,
  scratchDir,
} from '@bradygaster/squad-sdk';

const projectSquad = resolveSquad();
const personalSquad = resolveGlobalSquadPath();
const ensured = ensureSquadPath();
const scratch = scratchDir();
```

The root package also exports personal-state helpers, project-key helpers, preset/state resolution, directory config loading, and cache management. See the generated API reference for signatures.

## Client and Sessions

Import client APIs from the client subpath.

```typescript
import { SquadClientWithPool } from '@bradygaster/squad-sdk/client';

const squad = new SquadClientWithPool({
  pool: { maxConcurrent: 5 },
});

await squad.connect();

const session = await squad.createSession({
  model: 'gpt-5.6-terra',
});

const response = await session.sendMessage('Implement the /users endpoint');
console.log(response);

await squad.shutdown();
```

Use `SquadClient` when you need connection management without the integrated session pool. `SquadClientWithPool` adds capacity limits, session lifecycle management, and an `eventBus` for session and pool events.

## Coordinator

Import the coordinator from its subpath. It accepts a validated `SquadConfig` and handles direct responses, route matching, and optional fan-out.

```typescript
import { defineConfig } from '@bradygaster/squad-sdk';
import { SquadCoordinator } from '@bradygaster/squad-sdk/coordinator';

const config = defineConfig({
  team: { name: 'Platform Squad' },
  agents: [{ name: 'backend', role: 'Backend Engineer' }],
  routing: {
    rules: [{ pattern: 'api', agents: ['backend'], tier: 'standard' }],
  },
});

const coordinator = new SquadCoordinator({ config });
const result = await coordinator.handleMessage('Fix the API timeout', {
  sessionId: 'example-session',
  config,
});
```

The coordinator subpath also exports `spawnParallel`, `DirectResponseHandler`, spawn backend helpers, `selectResponseTier`, and `getTier`.

## Tools and Hooks

### Custom tools

```typescript
import { defineTool, ToolRegistry } from '@bradygaster/squad-sdk/tools';

const searchTool = defineTool<{ query: string }>({
  name: 'search_docs',
  description: 'Search project documentation',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  handler: async (args) => ({
    textResultForLlm: `Search requested for ${args.query}`,
    resultType: 'success',
  }),
});

const registry = new ToolRegistry('./.squad');
registry.getTools();
registry.getTool('squad_route');
```

The built-in tools are `squad_route`, `squad_decide`, `squad_memory`, `squad_status`, and `squad_skill`. `squad_route` requires fan-out dependencies to create sessions and validates agent names before spawning.

### Hook pipeline

```typescript
import { HookPipeline } from '@bradygaster/squad-sdk/hooks';

const hooks = new HookPipeline();
hooks.addPreToolHook(async (context) => ({
  action: context.toolName === 'shell' ? 'block' : 'allow',
  reason: context.toolName === 'shell' ? 'Shell access is disabled' : undefined,
}));
```

Hook actions are `allow`, `block`, and `modify`. The hook package also exports pre-tool, post-tool, session, error, and policy types.

## Casting and Roles

```typescript
import { CastingEngine } from '@bradygaster/squad-sdk';

const engine = new CastingEngine({
  universes: ['The Wire'],
  activeUniverse: 'The Wire',
});

const members = await engine.castTeam([
  { role: 'lead', title: 'Lead Developer' },
  { role: 'backend', title: 'Backend Engineer' },
]);
```

The root package exports the built-in role catalogs, `CastingEngine`, and `CastingHistory`.

## Telemetry and Streaming

```typescript
import {
  getMeter,
  getTracer,
  initSquadTelemetry,
  initializeOTel,
  shutdownOTel,
} from '@bradygaster/squad-sdk';

await initializeOTel({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
});

const tracer = getTracer('my-component');
const meter = getMeter('my-component');

const telemetry = await initSquadTelemetry({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-squad',
});

await telemetry.shutdown();
await shutdownOTel();
```

The root package also exports streaming helpers, cost tracking, offline mode, runtime events, OpenTelemetry metrics, and internationalization helpers.

## Other Public Modules

The root package exports or re-exports APIs for:

- Storage providers and in-memory state.
- Git-native state backends and state collections.
- Upstream inheritance and shared context.
- Marketplace packaging, extensions, and discovery.
- GitHub and Azure DevOps platform adapters.
- Ralph capabilities, triage, and rate limiting.
- Sharing, remote bridges, memory, skills, and presets.

Use the [generated API reference](./api/) for the complete list of current exports and signatures.

## See Also

- [Generated API reference](./api/) - exhaustive TypeDoc output
- [Configuration reference](./config.md) - file format and migration details
- [Tools and hooks](./tools-and-hooks.md) - focused orchestration examples
- [SDK-First Mode](../sdk-first-mode.md) - builder workflow and `squad build`
