# SDK-First Squad Mode

> **Phase 1** — Type-safe team configuration with builder functions.

Squad now supports **SDK-First Mode**: define your team in TypeScript with full type safety, runtime validation, and editor autocomplete. Instead of manually maintaining markdown files in `.squad/`, you write clean TypeScript, and `squad build` generates the governance markdown.

---

## What is SDK-First Mode?

In SDK-First Mode:

1. **You write** a `squad.config.ts` (or `squad/index.ts`) with builder functions
2. **Squad validates** your config at runtime with type guards
3. **`squad build`** generates `.squad/` markdown files automatically
4. **You version control** only your TypeScript source — markdown is generated

This replaces manual `.squad/team.md`, `.squad/routing.md`, and agent charters with a single source of truth in code.

---

## Which Mode Should I Use?

| Scenario | Command | What You Get |
|----------|---------|-------------|
| New project, want simplicity | `squad init` | Markdown-only `.squad/` directory |
| New project, want type safety | `squad init --sdk` | `.squad/` + `squad.config.ts` with typed builders |
| Existing squad, want to upgrade | `squad migrate --to sdk` | Keeps your team, generates typed config |
| SDK squad, want to simplify | `squad migrate --to markdown` | Removes config, keeps markdown |

**Start with markdown.** It's simpler, requires no build step, and works great for most projects. **Upgrade to SDK** when you want type-safe configuration, IDE autocomplete, and the ability to define skills and ceremonies in TypeScript.

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
npx squad-cli build
```

This generates:
- `.squad/team.md` — team roster and context
- `.squad/routing.md` — routing rules
- `.squad/agents/{name}/charter.md` — agent charters
- `.squad/ceremonies.md` — (if ceremonies defined)

---

## Starting a New SDK-First Project

```bash
squad init --sdk
```

This generates:
- `.squad/` directory with all standard markdown files (team.md, routing.md, agent charters, etc.)
- `squad.config.ts` at your project root using the `defineSquad()` builder syntax

Your `squad.config.ts` is the source of truth. Edit it, then run `squad build` to regenerate `.squad/`.

### What Gets Generated

```typescript
import {
  defineSquad,
  defineTeam,
  defineAgent,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  version: '1.0.0',
  team: defineTeam({
    name: 'my-project',
    members: ['scribe'],
  }),
  agents: [
    defineAgent({ name: 'scribe', role: 'scribe', description: 'Scribe', status: 'active' }),
  ],
});
```

Without `--sdk`, `squad init` creates a markdown-only squad — no config file, no build step needed.

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

## Builder Functions

Each builder accepts a configuration object, validates it at runtime, and returns the typed value. The pattern mirrors `defineConfig()` — identity-passthrough with runtime safety.

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

**Type:**

```typescript
interface TeamDefinition {
  readonly name: string;
  readonly description?: string;
  readonly projectContext?: string;
  readonly members: readonly string[];
}
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

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Unique identifier (kebab-case, no `@`) |
| `role` | string | ✅ | Human-readable title |
| `charter` | string | ❌ | Character description or link to charter |
| `model` | string | ❌ | Model preference (e.g., `"claude-sonnet-4"`, `"claude-haiku-4.5"`) |
| `tools` | string[] | ❌ | Allowed tools (e.g., `["grep", "edit", "view"]`) |
| `capabilities` | object[] | ❌ | Capability list with proficiency levels |
| `status` | enum | ❌ | Lifecycle: `'active'` (default), `'inactive'`, `'retired'` |

**Capability Levels:**
- `expert` — core competency
- `proficient` — strong knowledge
- `basic` — foundational

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

**Routing Tiers:**
- `direct` — skip ceremony, execute immediately
- `lightweight` — quick handoff, minimal overhead
- `standard` — normal workflow with decision checkpoints
- `full` — maximum governance, review gates

**Fallback Behavior:**
- `ask` — ask the user for routing direction
- `default-agent` — use the `defaultAgent`
- `coordinator` — delegate to the Squad coordinator

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

**Type:**

```typescript
interface CastingDefinition {
  readonly allowlistUniverses?: readonly string[];
  readonly overflowStrategy?: 'reject' | 'generic' | 'rotate';
  readonly capacity?: Readonly<Record<string, number>>;
}
```

**Overflow Strategies:**
- `reject` — refuse to cast if universe is at capacity
- `generic` — use a generic persona
- `rotate` — cycle through available universes

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
| `name` | `string` | ✅ | Unique skill name (kebab-case) |
| `description` | `string` | ✅ | What this skill teaches |
| `domain` | `string` | ✅ | Category (e.g., 'orchestration', 'testing') |
| `confidence` | `'low' \| 'medium' \| 'high'` | — | Skill maturity level |
| `source` | `'manual' \| 'observed' \| 'earned' \| 'extracted'` | — | How the skill was learned |
| `content` | `string` | ✅ | The skill body (patterns, examples) |
| `tools` | `SkillTool[]` | — | MCP tools relevant to this skill |

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

## `squad build` Command

Compile TypeScript Squad definitions into `.squad/` markdown.

### Usage

```bash
squad build [options]
```

### Flags

| Flag | What it does |
|------|-------------|
| `--check` | Validate without writing; exit 0 if matches disk, exit 1 if drift |
| `--dry-run` | Show what would be generated without writing |
| `--watch` | Rebuild on `.ts` file changes (coming soon) |

### Examples

**Rebuild all generated files:**

```bash
squad build
```

**Validate that generated files match disk:**

```bash
squad build --check
```

This is useful in CI/CD to ensure the config is in sync:

```yaml
# .github/workflows/squad-check.yml
- name: Check Squad config
  run: squad build --check
```

**Preview changes before writing:**

```bash
squad build --dry-run
```

Output:
```
ℹ️ Dry run — would generate 6 file(s):

  create  .squad/team.md
  create  .squad/routing.md
  create  .squad/agents/edie/charter.md
  create  .squad/agents/mcmanus/charter.md
  create  .squad/ceremonies.md
  overwrite .squad/hooks.md
```

### Generated Files

`squad build` generates:

| File | Condition | Contains |
|------|-----------|----------|
| `.squad/team.md` | Always | Team roster, member list, project context |
| `.squad/routing.md` | If `routing` defined | Routing rules and default agent |
| `.squad/agents/{name}/charter.md` | For each agent | Agent role, model, tools, capabilities |
| `.squad/ceremonies.md` | If `ceremonies` defined | Ceremony schedule and agenda |

**Protected files** — never overwritten:
- `.squad/decisions.md` / `.squad/decisions-archive.md`
- `.squad/agents/*/history.md`
- `.squad/orchestration-log/*`

---

## Config Discovery

`squad build` discovers your config in this order:

1. `squad/index.ts` — SDK-First config
2. `squad.config.ts` — Alternative location
3. `squad.config.js` — JavaScript fallback

The config must export one of:
- **`export default config`** — default export
- **`export { config }`** — named export
- **`export { squadConfig }`** — alias

---

## Validation

All builders perform runtime validation with typed error messages.

If validation fails:

```typescript
defineAgent({
  name: 'edie',
  // Missing required 'role' field
});
// BuilderValidationError: [defineAgent] "role" must be a non-empty string
```

Validation is:
- **Runtime** — catches errors at build time, not runtime
- **Typed** — assertions narrow TypeScript types
- **Descriptive** — error messages include field path and expected type
- **No dependencies** — no Zod, JSON Schema, or external validators

---

## Migration Guide: From Manual to SDK-First

### Before (manual `.squad/team.md`)

```markdown
# Squad Team — Core Squad

## Members

| Name | Role | Charter |
|------|------|---------|
| Edie | TypeScript Engineer | `.squad/agents/edie/charter.md` |
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
- [Routing Guide](./features/routing.md) — deep dive on routing tiers
- [Governance & Hooks](./sdk/tools-and-hooks.md) — hook pipeline and governance
