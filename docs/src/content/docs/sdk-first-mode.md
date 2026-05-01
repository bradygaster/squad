# SDK-First Squad Mode

> **Phase 1** — Type-safe team configuration with builder functions.

Squad now supports **SDK-First Mode**: define your team in TypeScript with full type safety, runtime validation, and editor autocomplete. Instead of manually maintaining markdown files in `.squad/`, you write clean TypeScript, and `squad build` generates the governance markdown.

---

## What gets generated

Running `squad build` generates these files:

| File | Condition | Contains |
|------|-----------|----------|
| `.squad/team.md` | Always | Team roster, member list, project context |
| `.squad/routing.md` | If `routing` defined | Routing rules and default agent |
| `.squad/agents/{name}/charter.md` | For each agent | Agent role, model, tools, capabilities |
| `.squad/ceremonies.md` | If `ceremonies` defined | Ceremony schedule and agenda |

**Protected files** (never overwritten):
- `.squad/decisions.md` / `.squad/decisions-archive.md`
- `.squad/agents/*/history.md`
- `.squad/orchestration-log/*`

---

## What is SDK-First Mode?

In SDK-First Mode:

1. **You write** a `squad.config.ts` (or `squad/index.ts`) with builder functions
2. **Squad validates** your config at runtime with type guards
3. **`squad build`** generates `.squad/` markdown files automatically
4. **You version control** only your TypeScript source — markdown is generated

This replaces manual `.squad/team.md`, `.squad/routing.md`, and agent charters with a single source of truth in code.

**When to use SDK mode:** For a comparison of SDK-first mode versus CLI mode, see the [Getting started guide](/guide#how-teams-form-init-mode).

---

## Quick Start

### 1. Install the SDK

```bash
npm install @bradygaster/squad-sdk
```

### 2. Create `squad.config.ts`

```typescript
import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({
    name: 'Core Squad',
    description: 'The main engineering team',
    members: ['@edie', '@mcmanus'],
  }),

  agents: [
    defineAgent({
      name: 'edie',
      role: 'TypeScript Engineer',
      model: 'claude-sonnet-4',
      tools: ['grep', 'edit', 'powershell'],
      capabilities: [{ name: 'type-system', level: 'expert' }],
    }),
    defineAgent({
      name: 'mcmanus',
      role: 'DevRel',
      model: 'claude-haiku-4.5',
      capabilities: [{ name: 'documentation', level: 'expert' }],
    }),
  ],

  routing: defineRouting({
    rules: [
      { pattern: 'feature-*', agents: ['@edie'], tier: 'standard' },
      { pattern: 'docs-*', agents: ['@mcmanus'], tier: 'lightweight' },
    ],
    defaultAgent: '@coordinator',
  }),
});
```

### 3. Run `squad build`

```bash
squad build
```

This generates:
- `.squad/team.md` — team roster and context
- `.squad/routing.md` — routing rules
- `.squad/agents/{name}/charter.md` — agent charters
- `.squad/ceremonies.md` — (if ceremonies defined)

---

## Start a new SDK-first project

```bash
squad init --sdk
```

This generates `.squad/` markdown files and a `squad.config.ts` at your project root using the `defineSquad()` builder syntax. Your TypeScript config is the source of truth — edit it, then run `squad build` to regenerate `.squad/`.

For the full team initialization flow, see [How teams form (Init Mode)](/guide#how-teams-form-init-mode) in the getting started guide.

---

## Migrating an Existing Squad to SDK-First

```bash
squad migrate --to sdk        # generate squad.config.ts from existing .squad/
squad migrate --to sdk --dry-run  # preview without writing
```

The migrate command reads your existing `.squad/` files (team.md, routing.md, agent charters) and generates a `squad.config.ts` that reproduces your current configuration using typed builders.

### What Gets Migrated

| Source | Generated |
|--------|-----------|
| `.squad/team.md` roster | `defineTeam({ members: [...] })` |
| `.squad/agents/*/charter.md` | `defineAgent({ name, role, ... })` per agent |
| `.squad/routing.md` rules | `defineRouting({ rules: [...] })` |
| `.squad/ceremonies.md` | `defineCeremony()` entries |
| `.squad/casting/policy.json` | `defineCasting()` block |

### What's Preserved (Not Migrated)

- `decisions.md` — append-only ledger, stays as-is
- `agents/*/history.md` — personal knowledge, stays as-is
- `orchestration-log/`, `log/` — append-only archives

### Reverting to Markdown

```bash
squad migrate --to markdown
```

This runs `squad build` to ensure `.squad/` is current, then removes `squad.config.ts`.

### Legacy Migration

```bash
squad migrate --from ai-team   # rename .ai-team/ → .squad/
```

This replaces the old `squad upgrade --migrate-directory` command.

---

## Builder functions

Each builder accepts a configuration object, validates it at runtime, and returns the typed value.

### Common types reference

All builders share these core patterns:

```typescript
// Base types used across multiple builders
interface AgentCapability {
  readonly name: string;
  readonly level: 'expert' | 'proficient' | 'basic';
}

interface RoutingRule {
  readonly pattern: string;
  readonly agents: readonly string[];
  readonly tier?: 'direct' | 'lightweight' | 'standard' | 'full';
  readonly priority?: number;
}

// Lifecycle and status
type AgentStatus = 'active' | 'inactive' | 'retired';
type FallbackBehavior = 'ask' | 'default-agent' | 'coordinator';
type OverflowStrategy = 'reject' | 'generic' | 'rotate';
type ConfidenceLevel = 'low' | 'medium' | 'high';
type SkillSource = 'manual' | 'observed' | 'earned' | 'extracted';
```

---

### `defineTeam(config)`

Define team metadata, project context, and member roster.

```typescript
const team = defineTeam({
  name: 'Core Squad',
  description: 'The main engineering team',
  projectContext: 'Building a React/Node recipe app...',
  members: ['@edie', '@fenster', '@hockney'],
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Team name (non-empty) |
| `description` | string | ❌ | One-liner |
| `projectContext` | string | ❌ | Injected into agent prompts; describe the codebase, tech stack, conventions |
| `members` | string[] | ✅ | Agent refs (`"@edie"` or `"edie"`); order matters for routing fallback |

---

### `defineAgent(config)`

Define a single agent with role, charter, model preference, tools, and capability profile.

```typescript
const edie = defineAgent({
  name: 'edie',
  role: 'TypeScript Engineer',
  charter: 'Expert in type systems and test-driven development',
  model: 'claude-sonnet-4',
  tools: ['grep', 'edit', 'powershell', 'view'],
  capabilities: [
    { name: 'type-system', level: 'expert' },
    { name: 'testing', level: 'proficient' },
  ],
  status: 'active',
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Unique identifier (kebab-case, no `@`) |
| `role` | string | ✅ | Human-readable title |
| `charter` | string | ❌ | Character description or link to charter |
| `model` | string | ❌ | Model preference (e.g., `"claude-sonnet-4"`, `"claude-haiku-4.5"`) |
| `tools` | string[] | ❌ | Allowed tools (e.g., `["grep", "edit", "view"]`) |
| `capabilities` | `AgentCapability[]` | ❌ | Capability list with proficiency levels (see Common Types) |
| `status` | `AgentStatus` | ❌ | Lifecycle: `'active'` (default), `'inactive'`, `'retired'` |

---

### `defineRouting(config)`

Define typed routing rules with pattern matching, priority, and tier.

```typescript
const routing = defineRouting({
  rules: [
    { pattern: 'feature-*', agents: ['@edie'], tier: 'standard', priority: 1 },
    { pattern: 'docs-*', agents: ['@mcmanus'], tier: 'lightweight' },
    { pattern: 'test-*', agents: ['@edie', '@fenster'], tier: 'full' },
  ],
  defaultAgent: '@coordinator',
  fallback: 'coordinator',
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `rules` | `RoutingRule[]` | ✅ | Pattern-based routing rules (see Common Types) |
| `defaultAgent` | string | ❌ | Fallback agent ref |
| `fallback` | `FallbackBehavior` | ❌ | `'ask'`, `'default-agent'`, or `'coordinator'` |

**Routing tiers:** `direct` (skip ceremony), `lightweight` (quick handoff), `standard` (normal workflow), `full` (maximum governance).

---

### `defineCeremony(config)`

Define ceremonies (standups, retros, etc.) with schedule, participants, and agenda.

```typescript
const standup = defineCeremony({
  name: 'standup',
  trigger: 'schedule',
  schedule: '0 9 * * 1-5',  // Cron: 9 AM weekdays
  participants: ['@edie', '@mcmanus', '@fenster'],
  agenda: 'Yesterday / Today / Blockers',
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Ceremony name |
| `trigger` | string | ❌ | Event that triggers ceremony (e.g., `"schedule"`, `"pr-merged"`) |
| `schedule` | string | ❌ | Cron expression or human-readable frequency |
| `participants` | string[] | ❌ | Agent refs |
| `agenda` | string | ❌ | Freeform agenda or template |
| `hooks` | string[] | ❌ | Hook names that fire during ceremony |

---

### `defineHooks(config)`

Define the governance hook pipeline — write paths, blocked commands, PII scrubbing, reviewer gates.

```typescript
const hooks = defineHooks({
  allowedWritePaths: ['src/**', 'test/**', '.squad/**'],
  blockedCommands: ['rm -rf /', 'DROP TABLE', 'delete from'],
  maxAskUser: 3,
  scrubPii: true,
  reviewerLockout: true,
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `allowedWritePaths` | string[] | ❌ | Glob patterns (e.g., `["src/**", "docs/**"]`) |
| `blockedCommands` | string[] | ❌ | Dangerous commands to block |
| `maxAskUser` | number | ❌ | Max user prompts per session |
| `scrubPii` | boolean | ❌ | Anonymize email/phone before logging |
| `reviewerLockout` | boolean | ❌ | Prevent PR author from approving own PR |

---

### `defineCasting(config)`

Define casting configuration — universe allowlists and overflow strategy.

```typescript
const casting = defineCasting({
  allowlistUniverses: ['The Usual Suspects', 'Breaking Bad'],
  overflowStrategy: 'generic',
  capacity: {
    'The Usual Suspects': 8,
    'Breaking Bad': 5,
  },
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `allowlistUniverses` | string[] | ❌ | Permitted fictional universes |
| `overflowStrategy` | `OverflowStrategy` | ❌ | `'reject'`, `'generic'`, or `'rotate'` |
| `capacity` | `Record<string, number>` | ❌ | Max agents per universe |

---

### `defineTelemetry(config)`

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

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `enabled` | boolean | ❌ | Master on/off switch (default: `false`) |
| `endpoint` | string | ❌ | OTLP receiver endpoint (e.g., `"http://localhost:4317"`) |
| `serviceName` | string | ❌ | OTel service name |
| `sampleRate` | number | ❌ | Trace sample rate (0.0 – 1.0) |
| `aspireDefaults` | boolean | ❌ | Apply Aspire-compatible defaults for dashboard integration |

---

### `defineSkill()`

Define a reusable skill that agents can load on demand.

```typescript
import { defineSkill } from '@bradygaster/squad-sdk';

const gitWorkflow = defineSkill({
  name: 'git-workflow',
  description: 'Squad branching model and PR conventions',
  domain: 'workflow',
  confidence: 'high',
  source: 'manual',
  content: `
    ## Patterns
    - Branch from dev: squad/{issue-number}-{slug}
    - PRs target dev, not main
    - Three-branch model: dev → insiders → main
  `,
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique skill name (kebab-case) |
| `description` | string | ✅ | What this skill teaches |
| `domain` | string | ✅ | Category (e.g., 'orchestration', 'testing') |
| `confidence` | `ConfidenceLevel` | ❌ | `'low'`, `'medium'`, or `'high'` |
| `source` | `SkillSource` | ❌ | `'manual'`, `'observed'`, `'earned'`, or `'extracted'` |
| `content` | string | ✅ | The skill body (patterns, examples) |
| `tools` | `SkillTool[]` | ❌ | MCP tools relevant to this skill |

Skills defined in `squad.config.ts` are generated to `.squad/skills/{name}/SKILL.md` when you run `squad build`.

---

### `defineSquad(config)`

Compose all builders into a single SDK config.

```typescript
export default defineSquad({
  version: '1.0.0',
  team: defineTeam({ /* ... */ }),
  agents: [
    defineAgent({ /* ... */ }),
    defineAgent({ /* ... */ }),
  ],
  routing: defineRouting({ /* ... */ }),
  ceremonies: [defineCeremony({ /* ... */ })],
  hooks: defineHooks({ /* ... */ }),
  casting: defineCasting({ /* ... */ }),
  telemetry: defineTelemetry({ /* ... */ }),
  runtime: defineRuntime({ /* ... */ }),
});
```

---

### `defineRuntime(config)`

Define which AI coding agent runtime to use. Squad supports multiple runtimes via a driver abstraction layer.

```typescript
const runtime = defineRuntime({
  name: 'copilot',  // or 'opencode', 'claude-code', 'cursor'
  config: {
    // runtime-specific configuration
  },
  cliPath: '/path/to/cli',  // optional override
});
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Runtime name: `'copilot'` (default), `'opencode'`, `'claude-code'`, `'cursor'` |
| `config` | object | ❌ | Runtime-specific configuration passed to the driver |
| `cliPath` | string | ❌ | Path to runtime CLI executable |
| `cliUrl` | string | ❌ | URL for external server connection (mutually exclusive with `cliPath`) |

**Supported Runtimes:**

| Runtime | Status | Notes |
|---------|--------|-------|
| `copilot` | Stable | GitHub Copilot (default) |
| `opencode` | Planned | OpenCode CLI support in development |
| `claude-code` | Planned | Anthropic Claude Code support |
| `cursor` | Planned | Cursor AI support |

---

## `squad build` command

Compile TypeScript Squad definitions into `.squad/` markdown.

**Usage:**

```bash
squad build [options]
```

**Flags:**

| Flag | What it does |
|------|-------------|
| `--check` | Validate without writing; exit 0 if matches disk, exit 1 if drift |
| `--dry-run` | Show what would be generated without writing |
| `--watch` | Rebuild on `.ts` file changes (coming soon) |

**Examples:**

```bash
# Rebuild all generated files
squad build

# Validate that generated files match disk (useful in CI/CD)
squad build --check

# Preview changes before writing
squad build --dry-run
```

---

## Config discovery

`squad build` discovers your config in this order:

1. `squad/index.ts` — SDK-First config
2. `squad.config.ts` — Alternative location
3. `squad.config.js` — JavaScript fallback

The config must export: `export default config` (default export), `export { config }` (named export), or `export { squadConfig }` (alias).

---

## Validation

All builders perform runtime validation with typed error messages. Example:

```typescript
defineAgent({
  name: 'edie',
  // Missing required 'role' field
});
// BuilderValidationError: [defineAgent] "role" must be a non-empty string
```


You manually maintain this file and agent charters.

### After (SDK-First)

```typescript
export default defineSquad({
  team: defineTeam({
    name: 'Core Squad',
    members: ['@edie'],
  }),
  agents: [
    defineAgent({
      name: 'edie',
      role: 'TypeScript Engineer',
    }),
  ],
});
```

Run `squad build` and the markdown is generated. Version control your TypeScript, not the markdown.

---

## Best Practices

1. **Keep `squad.config.ts` at project root** — easier to discover
2. **Use `defineSquad()` for composition** — ensures all sections are validated together
3. **Add capabilities** — helps the coordinator understand agent expertise
4. **Document project context** — inject into agent prompts via `TeamDefinition.projectContext`
5. **Use consistent tier names** — team members should understand routing tiers
6. **Validate in CI** — add `squad build --check` to your CI pipeline
7. **Don't edit generated markdown** — it will be overwritten; edit `squad.config.ts` instead

---

## Examples

### Full SDK-First Config

```typescript
import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
  defineHooks,
  defineCasting,
  defineTelemetry,
  defineRuntime,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'Platform Squad',
    description: 'Full-stack platform engineering team',
    projectContext: `
      React/Node monorepo. TypeScript strict mode.
      Uses Vitest for testing, ESLint for linting.
      Deploys to Vercel (frontend) and AWS Lambda (backend).
    `,
    members: ['@edie', '@mcmanus', '@fenster', '@hockney'],
  }),

  agents: [
    defineAgent({
      name: 'edie',
      role: 'TypeScript Engineer',
      model: 'claude-sonnet-4',
      tools: ['grep', 'edit', 'powershell', 'view'],
      capabilities: [
        { name: 'type-system', level: 'expert' },
        { name: 'testing', level: 'proficient' },
        { name: 'architecture', level: 'proficient' },
      ],
    }),

    defineAgent({
      name: 'mcmanus',
      role: 'DevRel',
      model: 'claude-haiku-4.5',
      tools: ['grep', 'view', 'edit'],
      capabilities: [
        { name: 'documentation', level: 'expert' },
        { name: 'developer-experience', level: 'expert' },
      ],
    }),

    defineAgent({
      name: 'fenster',
      role: 'Test Lead',
      model: 'claude-sonnet-4',
      capabilities: [
        { name: 'testing', level: 'expert' },
        { name: 'qa', level: 'proficient' },
      ],
    }),

    defineAgent({
      name: 'hockney',
      role: 'Frontend Specialist',
      model: 'claude-opus-4.6',
      capabilities: [
        { name: 'frontend', level: 'expert' },
        { name: 'ui-ux', level: 'proficient' },
      ],
    }),
  ],

  routing: defineRouting({
    rules: [
      {
        pattern: 'feature-*',
        agents: ['@edie', '@hockney'],
        tier: 'standard',
        priority: 1,
      },
      {
        pattern: 'docs-*',
        agents: ['@mcmanus'],
        tier: 'lightweight',
      },
      {
        pattern: 'test-*',
        agents: ['@fenster'],
        tier: 'standard',
      },
      {
        pattern: 'bug-*',
        agents: ['@edie', '@fenster'],
        tier: 'full',
        priority: 0,
      },
    ],
    defaultAgent: '@coordinator',
    fallback: 'coordinator',
  }),

  runtime: defineRuntime({
    name: 'copilot',
    config: {},
  }),

  hooks: defineHooks({
    allowedWritePaths: [
      'src/**',
      'test/**',
      'docs/**',
      '.squad/**',
      'package.json',
    ],
    blockedCommands: ['rm -rf /', 'DROP TABLE'],
    maxAskUser: 3,
    scrubPii: true,
    reviewerLockout: true,
  }),

  casting: defineCasting({
    allowlistUniverses: ['The Usual Suspects', 'Breaking Bad'],
    overflowStrategy: 'generic',
    capacity: {
      'The Usual Suspects': 8,
    },
  }),

  telemetry: defineTelemetry({
    enabled: true,
    endpoint: 'http://localhost:4317',
    serviceName: 'squad-platform',
    sampleRate: 1.0,
    aspireDefaults: true,
  }),
});
```

---

## See Also

- [SDK Reference](./reference/sdk.md) — all SDK exports
- [Runtime Configuration](./reference/runtime.md) — runtime drivers and configuration
- [Routing Guide](./features/routing.md) — deep dive on routing tiers
- [Governance & Hooks](./reference/sdk.md) — hook pipeline and governance
