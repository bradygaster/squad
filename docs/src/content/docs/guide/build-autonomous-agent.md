# Build an autonomous agent

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Build a CLI-wrapped autonomous agent pipeline that picks up tasks, coordinates work across teammates, and runs unattended.

**Try this:** Clone the [autonomous-pipeline sample](https://github.com/bradygaster/squad/tree/dev/samples/autonomous-pipeline) and run `npm run dev` to see the pattern in action.

This guide walks you through the pattern used by production autonomous agents — like a docs agent that monitors a repo for changes and generates documentation without human intervention.

---

## What an autonomous agent is

An autonomous agent is a program that:

- Receives a task (from a queue, a CLI argument, or a cron job)
- Routes the task to the right agent based on role and skill match
- Executes the work without waiting for human input
- Records decisions and learnings for future runs
- Reports results (cost, tokens, timeline)

In Squad, you build this by composing SDK primitives — `CastingEngine`, `CostTracker`, `SkillRegistry`, and `StreamingPipeline` — into a loop that assigns work, collects results, and decides what to do next.

---

## Set up the project

Create a new directory and initialize it with the Squad SDK dependency:

```bash
mkdir my-autonomous-agent
cd my-autonomous-agent
npm init -y
npm install @bradygaster/squad-sdk
npm install -D typescript
```

Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["*.ts"]
}
```

Set `"type": "module"` in your `package.json` and add scripts:

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  }
}
```

---

## Define your agents

Use `defineAgent()` to declare each agent's name, role, and capabilities:

```ts
import { defineAgent } from '@bradygaster/squad-sdk';

const docsWriter = defineAgent({
  name: 'lori',
  role: 'Technical Writer',
  description: 'Generates and updates documentation from code changes.',
  status: 'active',
  capabilities: [
    { name: 'markdown', level: 'expert' },
    { name: 'api-docs', level: 'proficient' },
  ],
});

const reviewer = defineAgent({
  name: 'chen',
  role: 'Reviewer',
  description: 'Reviews generated docs for accuracy and style.',
  status: 'active',
  capabilities: [
    { name: 'style-guide', level: 'expert' },
  ],
});
```

Each `defineAgent()` call validates the config at runtime and returns a typed `AgentDefinition` object.

---

## Build the squad

Compose your agents into a squad with `defineSquad()`:

```ts
import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
  defineDefaults,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  version: '1.0.0',

  team: defineTeam({
    name: 'Docs Automator',
    description: 'Autonomous documentation pipeline',
    members: ['lori', 'chen'],
  }),

  agents: [
    defineAgent({
      name: 'lori',
      role: 'Technical Writer',
      description: 'Generates docs from code changes.',
      status: 'active',
    }),
    defineAgent({
      name: 'chen',
      role: 'Reviewer',
      description: 'Reviews generated docs for accuracy.',
      status: 'active',
    }),
  ],

  routing: defineRouting({
    rules: [
      { pattern: 'docs-*', agents: ['@lori'], tier: 'standard' },
      { pattern: 'review-*', agents: ['@chen'], tier: 'lightweight' },
    ],
    defaultAgent: '@lori',
    fallback: 'default-agent',
  }),

  defaults: defineDefaults({
    model: {
      preferred: 'claude-sonnet-4',
      rationale: 'Good balance of speed and quality for docs generation',
      fallback: 'claude-haiku-4.5',
    },
  }),
});
```

`defineSquad()` validates every nested section through its respective builder — `defineTeam()`, `defineAgent()`, `defineRouting()`, `defineDefaults()`. If any field is invalid, you get a `BuilderValidationError` at startup, not at runtime.

---

## Create a CLI wrapper

Wrap your pipeline in a CLI entry point so you can invoke it from a terminal, cron job, or CI workflow:

```ts
#!/usr/bin/env node

import { CastingEngine, CostTracker, SkillRegistry } from '@bradygaster/squad-sdk';
import type { AgentRole, CastMember } from '@bradygaster/squad-sdk';

interface Task {
  id: string;
  title: string;
  description: string;
  requiredRole: AgentRole;
  status: 'queued' | 'in-progress' | 'done';
  assignedTo?: string;
  result?: string;
}

// Parse CLI arguments
const taskArg = process.argv[2];
if (!taskArg) {
  console.error('Usage: my-agent <task-description>');
  process.exit(1);
}

async function main(): Promise<void> {
  // Cast the team
  const engine = new CastingEngine();
  const team = engine.castTeam({
    universe: 'usual-suspects',
    requiredRoles: ['lead', 'developer', 'scribe'] as AgentRole[],
    teamSize: 3,
  });

  console.log(`Team: ${team.map(m => m.displayName).join(', ')}`);

  // Initialize SDK components
  const costTracker = new CostTracker();
  const skillRegistry = new SkillRegistry();

  // Register domain skills
  skillRegistry.registerSkill({
    id: 'markdown-gen',
    name: 'Markdown generation',
    domain: 'documentation',
    triggers: ['docs', 'markdown', 'readme', 'guide'],
    agentRoles: ['scribe'],
    content: 'Generate markdown from code analysis.',
  });

  // Build the task queue from CLI input
  const tasks: Task[] = [{
    id: 'task-01',
    title: taskArg,
    description: taskArg,
    requiredRole: 'scribe',
    status: 'queued',
  }];

  // Run the autonomous loop
  await runLoop(team, tasks, costTracker, skillRegistry);

  // Print results
  const summary = costTracker.getSummary();
  console.log(`Done. ${summary.totalInputTokens} tokens in, $${summary.totalEstimatedCost.toFixed(4)} cost.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

---

## The autonomous pipeline pattern

The core of an autonomous agent is a loop with four phases:

1. **Assign** — find the next queued task and match it to an available agent by role
2. **Execute** — the agent processes the task, streaming results and tracking cost
3. **Coordinate** — the agent may route follow-up tasks, record decisions, or save learnings
4. **Repeat** — continue until no tasks remain

```ts
import {
  CastingEngine,
  CostTracker,
  SkillRegistry,
  StreamingPipeline,
  selectResponseTier,
} from '@bradygaster/squad-sdk';
import type { CastMember, AgentRole, ResponseTier, TierContext } from '@bradygaster/squad-sdk';

interface Task {
  id: string;
  title: string;
  description: string;
  requiredRole: AgentRole;
  status: 'queued' | 'in-progress' | 'done';
  assignedTo?: string;
  result?: string;
}

interface AgentState {
  member: CastMember;
  status: 'idle' | 'working' | 'done';
  tasksCompleted: number;
  sessionId: string;
}

async function runLoop(
  team: CastMember[],
  tasks: Task[],
  costTracker: CostTracker,
  skillRegistry: SkillRegistry,
): Promise<void> {
  const streaming = new StreamingPipeline();

  // Build agent states
  const agents: AgentState[] = team.map((member, i) => {
    const sessionId = `session-${member.name.toLowerCase()}-${i}`;
    streaming.attachToSession(sessionId);
    return { member, status: 'idle', tasksCompleted: 0, sessionId };
  });

  // Autonomous execution loop
  while (tasks.some(t => t.status !== 'done')) {
    for (const agent of agents) {
      if (agent.status === 'working') continue;

      // Phase 1: Assign — find a task matching this agent's role
      const task = tasks.find(
        t => t.status === 'queued' && t.requiredRole === agent.member.role,
      );
      if (!task) continue;

      task.status = 'in-progress';
      task.assignedTo = agent.member.name;
      agent.status = 'working';

      // Check for skill matches
      const matches = skillRegistry.matchSkills(task.description, agent.member.role);
      if (matches.length > 0) {
        console.log(`  Skill match: ${matches[0].skill.id} (score: ${matches[0].score.toFixed(2)})`);
      }

      // Phase 2: Execute — simulate or call real LLM work
      console.log(`  ${agent.member.name} working on: ${task.title}`);
      // In a real agent, you would call the Copilot SDK here

      // Phase 3: Coordinate — record cost, route follow-ups
      costTracker.recordUsage({
        sessionId: agent.sessionId,
        agentName: agent.member.name,
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1200,
        outputTokens: 800,
        estimatedCost: 0.006,
      });

      // Complete the task
      task.status = 'done';
      task.result = `Completed by ${agent.member.name}`;
      agent.status = 'idle';
      agent.tasksCompleted++;
    }
  }

  // Clean up streaming sessions
  for (const agent of agents) {
    streaming.detachFromSession(agent.sessionId);
  }
  streaming.clear();
}
```

---

## Coordination tools

The autonomous-pipeline sample demonstrates three coordination patterns that agents use during the loop:

| Tool | What it does | Example |
|------|-------------|---------|
| `squad_route` | Routes a follow-up task to a teammate | Developer finishes auth → routes test-writing to Tester |
| `squad_decide` | Records an architectural decision | "Use JWT with RS256 signing for auth" |
| `squad_memory` | Saves a learning for future sessions | "Connection pool sweet spot: 20 connections" |

These patterns let agents coordinate without a central orchestrator. Each agent makes local decisions that accumulate into a shared knowledge base.

:::note[`squad_route` requires `fanOutDepsGetter`]
For `squad_route` to actually spawn agent sessions, the `ToolRegistry` must be constructed with a `fanOutDepsGetter` callback that provides fan-out dependencies (`sessionPool`, `modelClient`, `squadRoot`, `configGetter`). Without it, the tool returns an honest `fan-out-deps-unavailable` error instead of silently succeeding. See the [SDK reference](/reference/sdk/#toolregistry) for wiring details.
:::

---

## Add observability

Track cost, token usage, and agent activity with the built-in `CostTracker` and OpenTelemetry integration:

```ts
import {
  CostTracker,
  TelemetryCollector,
  initSquadTelemetry,
  recordAgentSpawn,
  recordAgentDuration,
  recordTokenUsage,
} from '@bradygaster/squad-sdk';

// Initialize OTel (connects to .NET Aspire dashboard if endpoint is set)
const otelEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
if (otelEndpoint) {
  initSquadTelemetry({
    endpoint: otelEndpoint,
    serviceName: 'my-autonomous-agent',
  });
}

// Track per-agent costs
const costTracker = new CostTracker();

// Collect opt-in telemetry events
const telemetry = new TelemetryCollector({ enabled: true });
telemetry.collectEvent({
  name: 'squad.init',
  properties: { agents: 3, sample: 'docs-agent' },
});

// Record OTel metrics per task
recordAgentSpawn('lori');
recordAgentDuration('lori', 1200, 'success');
recordTokenUsage({
  type: 'usage',
  sessionId: 'session-lori-0',
  agentName: 'lori',
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1200,
  outputTokens: 800,
  estimatedCost: 0.006,
  timestamp: new Date(),
});

// Print cost summary at the end
const summary = costTracker.getSummary();
console.log(`Total: $${summary.totalEstimatedCost.toFixed(4)}`);
```

To view traces and metrics in the .NET Aspire dashboard, see the [Aspire dashboard scenario](/scenarios/aspire-dashboard/).

---

## Complete working example

Here is a minimal but complete autonomous agent you can copy and run:

```ts
#!/usr/bin/env node
import {
  CastingEngine,
  CostTracker,
  SkillRegistry,
  StreamingPipeline,
} from '@bradygaster/squad-sdk';
import type { CastMember, AgentRole } from '@bradygaster/squad-sdk';

// Types
interface Task {
  id: string;
  title: string;
  requiredRole: AgentRole;
  status: 'queued' | 'done';
  assignedTo?: string;
}

interface Agent {
  member: CastMember;
  status: 'idle' | 'working';
  tasksCompleted: number;
  sessionId: string;
}

// Cast the team
const engine = new CastingEngine();
const team = engine.castTeam({
  universe: 'usual-suspects',
  requiredRoles: ['lead', 'developer', 'scribe'] as AgentRole[],
  teamSize: 3,
});

// Initialize components
const costTracker = new CostTracker();
const skills = new SkillRegistry();
const streaming = new StreamingPipeline();

skills.registerSkill({
  id: 'docs',
  name: 'Documentation',
  domain: 'docs',
  triggers: ['docs', 'readme', 'guide'],
  agentRoles: ['scribe'],
  content: 'Generate markdown docs.',
});

// Build task queue
const tasks: Task[] = [
  { id: '1', title: 'Write API docs', requiredRole: 'scribe', status: 'queued' },
  { id: '2', title: 'Review architecture', requiredRole: 'lead', status: 'queued' },
  { id: '3', title: 'Implement feature', requiredRole: 'developer', status: 'queued' },
];

// Build agents
const agents: Agent[] = team.map((member, i) => {
  const sessionId = `s-${member.name}-${i}`;
  streaming.attachToSession(sessionId);
  return { member, status: 'idle' as const, tasksCompleted: 0, sessionId };
});

// Autonomous loop: assign → execute → coordinate → repeat
while (tasks.some(t => t.status !== 'done')) {
  for (const agent of agents) {
    if (agent.status === 'working') continue;

    const task = tasks.find(
      t => t.status === 'queued' && t.requiredRole === agent.member.role,
    );
    if (!task) continue;

    // Assign
    task.assignedTo = agent.member.name;
    agent.status = 'working';
    console.log(`${agent.member.displayName} → ${task.title}`);

    // Execute (replace with real LLM call in production)
    const match = skills.matchSkills(task.title, agent.member.role);
    if (match.length > 0) {
      console.log(`  Skill: ${match[0].skill.id}`);
    }

    // Track cost
    costTracker.recordUsage({
      sessionId: agent.sessionId,
      agentName: agent.member.name,
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 600,
      estimatedCost: 0.005,
    });

    // Complete
    task.status = 'done';
    agent.status = 'idle';
    agent.tasksCompleted++;
  }
}

// Report
const summary = costTracker.getSummary();
console.log(`\nDone: ${tasks.length} tasks, $${summary.totalEstimatedCost.toFixed(4)} total cost`);
console.log('Agents:', agents.map(a => `${a.member.displayName} (${a.tasksCompleted})`).join(', '));

// Clean up
for (const a of agents) streaming.detachFromSession(a.sessionId);
streaming.clear();
```

---

## Next steps

- Run the [autonomous-pipeline sample](https://github.com/bradygaster/squad/tree/dev/samples/autonomous-pipeline) to see the full pattern with OTel, cost dashboards, and skill matching
- Read the [SDK reference](/reference/sdk/) for the complete API surface
- See the [extensibility guide](/guide/extensibility/) for where your agent fits in the Squad ecosystem
- Check the [Aspire dashboard scenario](/scenarios/aspire-dashboard/) for observability setup

---

## See Also

- [Your Team](../concepts/your-team.md) — Agent roles, charters, and team composition
- [Architecture](../concepts/architecture.md) — How the coordinator orchestrates work
- [SDK Reference](../reference/sdk.md) — SDK API for autonomous agents
