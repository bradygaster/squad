# @bradygaster/squad-sdk

**Programmable multi-agent runtime for GitHub Copilot.** Build AI teams that persist, learn, and coordinate — with real governance, not vibes.

[![Status](https://img.shields.io/badge/status-production-brightgreen)](#requirements)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-green)](#requirements)
[![ESM](https://img.shields.io/badge/module-ESM--only-blue)](#requirements)

---

## Install

```bash
npm install @bradygaster/squad-sdk
```

---

## What Makes This Different

Most multi-agent setups are prompt engineering. You write a wall of text describing who each agent is, what they can do, and hope the model follows the rules. It works — until it doesn't. Agents ignore routing. They write files they shouldn't. They leak data. There's no enforcement, just suggestions.

Squad's SDK moves orchestration out of prompts and into code:

**Prompt-only orchestration** stuffs everything into a single context window. The coordinator is text. Agents read it, interpret it, maybe follow it.

```
Prompt says:
"If the agent is Backend, route auth tasks to it."
Agent reads it (consumes tokens), decides what to do (might ignore it).
```

**SDK orchestration** compiles rules into typed functions. Sessions are objects. Routing is deterministic. Tools are validated before execution.

```typescript
Router.matchRoute(message) → { agent: 'Backend', priority: 'high' }
// TypeScript knows exactly which agent runs, with what permissions.
// HookPipeline runs file-write guards BEFORE the tool executes.
// No interpretation. No ambiguity. Just code.
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Your Code (TypeScript)                     │
│  - createSession(), spawnParallel()         │
│  - SquadClient, EventBus, HookPipeline      │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  Agent Orchestration Runtime                │
│  - Router (matchRoute, compileRoutingRules) │
│  - Charter Compiler (permissions, voice)    │
│  - Tool Registry (squad_route, etc.)        │
│  - Hook Pipeline (governance enforcement)   │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  Session Pool + Event Bus                   │
│  - Each agent gets a persistent session     │
│  - Cross-session event pub/sub               │
│  - Crash recovery via session state         │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│  @github/copilot-sdk                        │
│  - Real-time agent streaming                │
│  - Tool execution                           │
└─────────────────────────────────────────────┘
```

Your code sits at the top. The runtime handles routing, permissions, and governance. Sessions are persistent and recoverable. Everything runs on top of the official Copilot SDK.

---

## Custom Tools

Five tools let agents coordinate without calling you back. Here are the three you'll reach for first.

### `squad_route` — Hand off work between agents

```typescript
const tool = toolRegistry.getTool('squad_route');
await tool.handler({
  targetAgent: 'mcmanus',  // lowercase — agent names are normalized
  task: 'Write a blog post on the new casting system',
  priority: 'high',
  context: 'Feature launches next week',
});
```

The lead routes a task to DevRel. A new session is created, context is passed, and the task is queued with priority. No human in the loop.

> **Wiring requirement:** `squad_route` creates sessions via `spawnParallel`, which requires fan-out dependencies. Pass a `fanOutDepsGetter` as the 5th argument to `new ToolRegistry(...)`:
>
> ```typescript
> import { ToolRegistry } from '@bradygaster/squad-sdk/tools';
> import type { FanOutDependencies } from '@bradygaster/squad-sdk/coordinator';
>
> const fanOutDeps: FanOutDependencies = {
>   compileCharter: async (name) => { /* load agent charter */ },
>   resolveModel: async (charter, override) => override ?? charter.modelPreference ?? 'default',
>   createSession: async (config) => ({ sessionId: '...', sendMessage: async () => {} }),
>   sessionPool,   // SessionPool instance
>   eventBus,      // EventBus instance
> };
>
> const registry = new ToolRegistry(
>   './.squad',
>   () => sessionPool,       // sessionPoolGetter
>   storageProvider,          // storage
>   squadState,               // state (enables roster validation)
>   () => fanOutDeps,         // fanOutDepsGetter
> );
> ```
>
> Without it, `squad_route` returns `resultType: 'failure'` with `error: 'fan-out-deps-unavailable'`. Agent names must match `/^[a-zA-Z0-9_-]+$/` and, when state is provided, exist in the team roster.

### `squad_decide` — Record a team decision

```typescript
await tool.handler({
  author: 'Keaton',
  summary: 'Use PostgreSQL, not MongoDB',
  body: 'Chose PostgreSQL for: (1) transactions, (2) team expertise, (3) JSONB flexibility.',
  references: ['architecture-spike'],
});
```

Writes to the shared decision log. Every agent reads decisions before working — one call propagates context to the entire team.

### `squad_memory` — Teach an agent something permanent

```typescript
await tool.handler({
  agent: 'Frontend',
  section: 'learnings',
  content: 'Project uses Tailwind v4 with dark mode plugin. Config at .styles/theme.config.ts',
});
```

Agents learn as they work. Next session, Frontend reads this and knows immediately. No context hunting, no re-explaining.

> Two more tools — `squad_status` (query the session pool) and `squad_skill` (read/write compressed learnings) — round out the coordination layer. See the [full docs](https://github.com/bradygaster/squad#the-custom-tools) for details.

---

## Hook Pipeline

Rules don't live in prompts. They run as code, before tools execute.

### File-Write Guards

```typescript
const pipeline = new HookPipeline({
  allowedWritePaths: ['src/**/*.ts', '.squad/**', 'docs/**'],
});

// An agent tries to write to /etc/passwd
// → Blocked. "File write blocked: '/etc/passwd' does not match allowed paths"
```

No agent — compromised or confused — can write outside your safe zones. Not because you asked nicely in the prompt. Because code won't let them.

### PII Scrubbing

```typescript
const pipeline = new HookPipeline({
  scrubPii: true,
});

// Agent logs: "contact brady@example.com about deploy"
// Output becomes: "contact [EMAIL_REDACTED] about deploy"
```

Sensitive data never escapes. Automatic, invisible to the agent, applied to every tool output.

### Reviewer Lockout

```typescript
const lockout = pipeline.getReviewerLockout();
lockout.lockout('src/auth.ts', 'Backend');

// Backend tries to re-write auth.ts after a review rejection
// → Blocked. "Agent 'Backend' is locked out of artifact 'src/auth.ts'"
```

When a reviewer says "no," it sticks. The original author can't sneak a fix in. Protocol enforced by code, not convention.

### Ask-User Rate Limiter

```typescript
const pipeline = new HookPipeline({
  maxAskUserPerSession: 3,
});

// Fourth attempt to prompt the user → Blocked.
// "ask_user rate limit exceeded: 3/3 calls used. Proceed without user input."
```

Agents don't stall waiting for you. They decide or move on.

---

## Persistent Sessions & Crash Recovery

Sessions aren't ephemeral. They're durable objects that survive failures.

```typescript
const session = await client.createSession({
  agentName: 'Backend',
  task: 'Implement user auth endpoints',
  persistPath: '.squad/sessions/backend-auth-001.json',
});

// Agent dies mid-work — network hiccup, model timeout, anything.
// Later:

const resumed = await client.resumeSession(
  '.squad/sessions/backend-auth-001.json'
);

// Backend wakes up knowing:
// - What the task was
// - What it already wrote
// - Where it left off
// No repetition, no lost context.
```

---

## Storage Abstraction

Squad separates I/O from business logic. All persistent storage — sessions, state, decisions, histories — flows through a pluggable `StorageProvider` interface. Swap the backend (filesystem, database, cloud) without touching orchestration code.

### Built-in Providers

| Provider | Use When |
|----------|----------|
| `FSStorageProvider` | Running on Node.js. Stores everything on disk. |
| `InMemoryStorageProvider` | Writing unit tests or running ephemeral sessions. |
| `SQLiteStorageProvider` | Need a single portable database file. Works on all platforms (runs on WASM). |

### Build Your Own

Implement the `StorageProvider` interface:

```typescript
import type { StorageProvider } from '@bradygaster/squad-sdk';

export class MyCloudStorageProvider implements StorageProvider {
  async read(filePath: string): Promise<string | undefined> {
    // Fetch from Azure Blob, S3, or your service
    try {
      return await this.client.getBlob(filePath);
    } catch (e) {
      if (e.code === 'NotFound') return undefined;
      throw e;
    }
  }

  async write(filePath: string, data: string): Promise<void> {
    // Store to cloud
    await this.client.putBlob(filePath, data);
  }

  // Implement remaining methods: append, exists, list, delete, deleteDir, isDirectory, mkdir, rename, copy, stat
  // + sync variants (deprecated in Wave 2)
}
```

See `storage-provider-azure` and `storage-provider-sqlite` samples for complete implementations.

---

## The Casting Engine

Agents aren't `role-1`, `role-2`. They have names, personalities, and persistent identities across sessions. The casting engine assigns them automatically from a thematic universe.

```typescript
const casting = new CastingEngine({
  universe: 'usual-suspects',
  agentCount: 5,
});

const cast = casting.castTeam({
  roles: ['lead', 'frontend', 'backend', 'tester', 'scribe'],
});
// → [
//   { role: 'lead', agentName: 'Keaton' },
//   { role: 'frontend', agentName: 'McManus' },
//   { role: 'backend', agentName: 'Verbal' },
//   { role: 'tester', agentName: 'Fenster' },
//   { role: 'scribe', agentName: 'Kobayashi' },
// ]
```

Names are memorable ("Keaton handles routing"), persistent (same name every session), and extensible (add a sixth agent — the casting engine picks the next name from the universe). You build a relationship with your agents over time.

---

## Event-Driven Monitoring

Ralph is the built-in work monitor — a persistent agent session that subscribes to everything happening on the team.

```typescript
const ralph = new RalphMonitor({
  teamRoot: '.squad',
  healthCheckInterval: 30000,
  statePath: '.squad/ralph-state.json',
});

ralph.subscribe('agent:task-complete', (event) => {
  console.log(`✅ ${event.agentName} finished: ${event.task}`);
});

ralph.subscribe('agent:error', (event) => {
  console.log(`❌ ${event.agentName} failed: ${event.error}`);
});

await ralph.start();
```

When agents complete work, record decisions, or hit errors — Ralph knows. If an agent crashes, Ralph remembers where it left off.

---

## API Reference

| Module | Key Exports | Purpose |
|--------|------------|---------|
| `resolution` | `resolveSquad()`, `resolveGlobalSquadPath()`, `ensureSquadPath()` | Find `.squad/` directory; platform-specific global path; path validation |
| `config` | `loadConfig()`, `loadConfigSync()` | Load and parse squad configuration from disk |
| `agents` | Agent onboarding utilities | Register and initialize agents; manage team discovery |
| `casting` | `CastingEngine` | Universe selection, name allocation, persistent registry |
| `skills` | Skills system | SKILL.md lifecycle, confidence levels |
| `coordinator` | `selectResponseTier()`, `getTier()` | Route requests to Direct/Lightweight/Standard/Full tiers |
| `runtime` | Streaming pipeline, cost tracker, telemetry | Core async execution, event streaming, i18n |
| `cli` | `checkForUpdate()`, `performUpgrade()` | SDK version management and update checking |
| `marketplace` | Plugin marketplace | Discover and manage plugins |

---

## Requirements

- **Node.js** ≥ 20.0.0
- **TypeScript** ≥ 5.0
- **ESM-only** — no CommonJS. Set `"type": "module"` in your `package.json`.

---

## Links

- **Repository:** [github.com/bradygaster/squad](https://github.com/bradygaster/squad)
- **CLI package:** [@bradygaster/squad-cli](https://www.npmjs.com/package/@bradygaster/squad-cli)
- **Issues:** [github.com/bradygaster/squad/issues](https://github.com/bradygaster/squad/issues)

---

## License

MIT
