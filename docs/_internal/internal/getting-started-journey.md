# Getting Started with Squad: Empty Directory to Multi-Agent App

> Internal doc. For experienced developers with 30 minutes.

---

## Prerequisites

- Node.js ≥ 20
- Git
- `gh` CLI authenticated (`gh auth login`)
- A GitHub Copilot subscription

---

## 1. Install

```bash
mkdir my-app && cd my-app
git init
npm init -y

# Install both packages
npm install --save-dev @bradygaster/squad-cli
npm install @bradygaster/squad-sdk
```

Set ESM mode in `package.json`:
```json
{
  "type": "module"
}
```

---

## 2. Create Your Team

```bash
squad init
```

This is idempotent — run it again and nothing breaks. It scaffolds `.squad/` in your repo root.

---

## 3. The `.squad/` Directory

After `squad init`, you have this:

```
.squad/
├── team.md              # Roster — who's on the team, their roles
├── routing.md           # Rules for who handles what kind of work
├── decisions.md         # Shared decision log — every agent reads this
├── ceremonies.md        # Sprint ceremonies config
├── casting/
│   ├── policy.json      # Universe theme, agent count
│   ├── registry.json    # Name → role mapping (persistent across sessions)
│   └── history.json     # Casting history
├── agents/
│   ├── keaton/
│   │   ├── charter.md   # Identity: expertise, voice, permissions
│   │   └── history.md   # What this agent knows about YOUR project
│   ├── mcmanus/
│   │   ├── charter.md
│   │   └── history.md
│   └── ...              # One directory per agent
├── skills/              # Compressed learnings (SKILL.md files)
├── identity/
│   ├── now.md           # Current team focus
│   └── wisdom.md        # Reusable patterns
└── log/                 # Session archive
```

**Commit this entire directory.** Clone the repo, get the team — with all accumulated knowledge.

Key files to understand:
- **`team.md`** — The roster. Agents read this to know who else is on the team.
- **`routing.md`** — Rules the coordinator uses to route tasks to agents.
- **`agents/{name}/charter.md`** — An agent's identity: what it's good at, how it talks, what it can touch.
- **`agents/{name}/history.md`** — Learnings accumulated over sessions. This is how agents get smarter.
- **`decisions.md`** — Every agent reads this before starting work. One decision propagates to the whole team.

---

## 4. Your First SDK Script

Create `src/hello.ts`:

```typescript
import {
  resolveSquad,
  loadConfig,
  CastingEngine,
  onboardAgent,
} from '@bradygaster/squad-sdk';

// Step 1: Find .squad/ from current directory
const squadPath = resolveSquad();

// Step 2: Load the typed config
const config = await loadConfig(squadPath);

// Step 3: Cast agents from a thematic universe
const casting = new CastingEngine({
  universe: 'usual-suspects',
  agentCount: 5,
});

const cast = casting.castTeam({
  roles: ['lead', 'frontend', 'backend', 'tester', 'scribe'],
});

// Step 4: Onboard each agent (creates persistent sessions)
for (const member of cast) {
  await onboardAgent({
    agentName: member.agentName,
    role: member.role,
    squadPath,
  });
  console.log(`✅ ${member.agentName} — ${member.role}`);
}
```

Run it:
```bash
node --loader tsx src/hello.ts
```

Output:
```
✅ Keaton — lead
✅ McManus — frontend
✅ Verbal — backend
✅ Fenster — tester
✅ Kobayashi — scribe
```

Names are deterministic. Same universe, same roles, same names every time.

---

## 5. Creating a Client and Sending Messages

Create `src/session.ts`:

```typescript
import { SquadClient } from '@bradygaster/squad-sdk';

// Create a client — connects to the Squad runtime
const client = new SquadClient({
  useStdio: true,
  autoStart: true,
  autoReconnect: true,
  maxReconnectAttempts: 3,
});

// Create a session for an agent
const session = await client.createSession({
  agentName: 'Backend',
  task: 'Implement user authentication endpoints',
  persistPath: '.squad/sessions/backend-auth.json',
});

// Send a message — the agent streams a response
await session.sendMessage('Set up JWT-based auth with bcrypt password hashing.');

// Session state is persisted to disk automatically.
// If the process crashes, resume later:
// const resumed = await client.resumeSession('.squad/sessions/backend-auth.json');
```

Key concepts:
- **`SquadClient`** manages the connection to the runtime.
- **`createSession()`** gives an agent a task with a persistent identity.
- **`persistPath`** enables crash recovery — the session writes state to disk.
- **`resumeSession()`** picks up where a crashed session left off.

---

## 6. Adding Governance Hooks

Governance isn't prompt engineering. It's code that runs before and after every tool call.

Create `src/governed.ts`:

```typescript
import { HookPipeline } from '@bradygaster/squad-sdk';

// Create a pipeline with multiple governance rules
const pipeline = new HookPipeline({
  // File-write guards: agents can only write to these paths
  allowedWritePaths: [
    'src/**/*.ts',
    'test/**/*.ts',
    '.squad/**',
    'docs/**',
  ],

  // Block dangerous shell commands
  blockedCommands: ['rm -rf', 'sudo', 'curl | bash'],

  // Agents can ask the user at most 3 times per session
  maxAskUserPerSession: 3,

  // Automatically scrub emails, phone numbers from tool output
  scrubPii: true,
});

// Custom pre-tool hook: log every tool call
pipeline.addPreToolHook({
  name: 'audit-logger',
  async execute(ctx) {
    console.log(`[AUDIT] ${ctx.agentName} calling ${ctx.toolName}`);
    return { decision: 'allow' };
  },
});

// Custom post-tool hook: check output size
pipeline.addPostToolHook({
  name: 'output-guard',
  async execute(ctx) {
    if (ctx.output && ctx.output.length > 50000) {
      return {
        decision: 'modify',
        modifiedOutput: ctx.output.slice(0, 50000) + '\n[TRUNCATED]',
      };
    }
    return { decision: 'allow' };
  },
});

// Reviewer lockout: once a reviewer rejects code, the original
// author can't edit that file until someone else does
const lockout = pipeline.getReviewerLockout();
lockout.lockout('src/auth.ts', 'Backend');
// Backend cannot touch src/auth.ts until the lockout is cleared.
```

What this buys you:
- **File guards** — No agent writes outside safe zones. Period.
- **PII scrubbing** — Emails and phone numbers never leak into logs or model context.
- **Rate limiting** — Agents don't stall waiting for human input.
- **Reviewer lockout** — Review rejections are enforced by code, not convention.
- **Custom hooks** — Add audit logging, output guards, compliance checks.

---

## 7. Adding Cost Tracking

Create `src/cost-aware.ts`:

```typescript
import { CostTracker, EventBus } from '@bradygaster/squad-sdk';

const bus = new EventBus();
const costTracker = new CostTracker();

// Wire cost tracker to the event bus — it automatically records
// token usage from every session event
const unsubscribe = costTracker.wireToEventBus(bus);

// Manual recording (if you need fine-grained control)
costTracker.recordUsage({
  sessionId: 'backend-auth-001',
  agentName: 'Backend',
  model: 'claude-sonnet-4-20250514',
  inputTokens: 12500,
  outputTokens: 3200,
  estimatedCost: 0.0234,
});

costTracker.recordUsage({
  sessionId: 'frontend-ui-001',
  agentName: 'Frontend',
  model: 'gpt-4.1-mini',
  inputTokens: 8000,
  outputTokens: 1500,
  estimatedCost: 0.0089,
});

// Get a summary
const summary = costTracker.getSummary();
console.log(`Total cost: $${summary.totalCost.toFixed(4)}`);
console.log(`Total tokens: ${summary.totalInputTokens + summary.totalOutputTokens}`);

// Or get a formatted report
console.log(costTracker.formatSummary());

// Clean up
unsubscribe();
costTracker.reset();
```

The `CostTracker` integrates with the `EventBus` — every session automatically reports token usage. You can also record manually for custom routing decisions.

---

## 8. Building a Multi-Agent Pipeline

This is where it comes together. Multiple agents, parallel execution, event-driven coordination.

Create `src/pipeline.ts`:

```typescript
import {
  SquadClient,
  EventBus,
  HookPipeline,
  CostTracker,
  CastingEngine,
  StreamingPipeline,
} from '@bradygaster/squad-sdk';

// --- Infrastructure ---
const bus = new EventBus();
const costTracker = new CostTracker();
costTracker.wireToEventBus(bus);

const hooks = new HookPipeline({
  allowedWritePaths: ['src/**', 'test/**', '.squad/**'],
  scrubPii: true,
  maxAskUserPerSession: 3,
});

const streaming = new StreamingPipeline();
streaming.onDelta((delta) => {
  process.stdout.write(delta.content);
});

// --- Cast the team ---
const casting = new CastingEngine({
  universe: 'usual-suspects',
  agentCount: 4,
});

const cast = casting.castTeam({
  roles: ['lead', 'backend', 'frontend', 'tester'],
});

// --- Create sessions ---
const client = new SquadClient({ useStdio: true });

const sessions = new Map();
for (const member of cast) {
  const session = await client.createSession({
    agentName: member.agentName,
    task: `${member.role} work`,
    persistPath: `.squad/sessions/${member.agentName.toLowerCase()}.json`,
  });
  sessions.set(member.role, session);
}

// --- Coordinate work ---
// Lead analyzes, then fans out to Backend + Frontend in parallel
const lead = sessions.get('lead');
await lead.sendMessage('Analyze requirements for a user dashboard feature.');

// Parallel fan-out: Backend and Frontend work simultaneously
const [backendResult, frontendResult] = await Promise.all([
  sessions.get('backend').sendMessage('Build the /api/dashboard endpoint.'),
  sessions.get('frontend').sendMessage('Build the Dashboard React component.'),
]);

// Tester reviews both
const tester = sessions.get('tester');
await tester.sendMessage('Write tests for the dashboard API and UI.');

// --- Report ---
console.log('\n📊 Pipeline complete.');
console.log(costTracker.formatSummary());
```

Pattern: **Lead → parallel fan-out → Tester review.** The coordinator doesn't need to be in the loop — your code is the coordinator.

---

## 9. Monitoring with Ralph

Ralph is a persistent monitor that subscribes to the event bus and watches everything.

Create `src/monitored.ts`:

```typescript
import { RalphMonitor, EventBus } from '@bradygaster/squad-sdk';

const bus = new EventBus();

const ralph = new RalphMonitor({
  teamRoot: '.squad',
  healthCheckInterval: 30000,    // Check every 30s
  staleSessionThreshold: 300000, // 5 minutes = stale
  statePath: '.squad/ralph-state.json',
});

// Subscribe to events
bus.on('session.created', (event) => {
  console.log(`🆕 Session started: ${event.agentName}`);
});

bus.on('session.error', (event) => {
  console.log(`❌ ${event.agentName} hit an error: ${event.error}`);
});

bus.on('session.destroyed', (event) => {
  console.log(`✅ ${event.agentName} finished`);
});

// Start Ralph — it runs health checks on the interval
await ralph.start(bus);

// Check health manually
const statuses = await ralph.healthCheck();
for (const status of statuses) {
  console.log(`${status.agentName}: ${status.state}`);
}

// When done
await ralph.stop();
```

Ralph persists its state to disk. If your process restarts, Ralph reads `ralph-state.json` and knows what was happening before the crash.

---

## 10. Deploying and Sharing Your Team

### Export your team

```bash
squad export
# → squad-export.json (portable snapshot of entire .squad/ directory)
```

### Import into another repo

```bash
squad import squad-export.json
```

### Share via upstream inheritance

```bash
# In the downstream repo:
squad upstream add --source ../shared-team --name org-standards
squad upstream sync
```

Upstream inheritance lets you maintain org-wide agent charters, routing rules, and governance policies in one place. Downstream repos inherit and can override.

### Remote team mode

```bash
squad init --mode remote /path/to/shared-team
```

This creates a dual-root setup: project-specific state lives in `.squad/`, but team identity (charters, casting, routing) lives in the shared location. Multiple repos share one team.

---

## Putting It All Together

Here's the full stack in one script — `src/full-stack.ts`:

```typescript
import {
  resolveSquad,
  loadConfig,
  SquadClient,
  EventBus,
  HookPipeline,
  CostTracker,
  CastingEngine,
  RalphMonitor,
  StreamingPipeline,
} from '@bradygaster/squad-sdk';

// Resolve and configure
const squadPath = resolveSquad();
const config = await loadConfig(squadPath);

// Infrastructure
const bus = new EventBus();
const costTracker = new CostTracker();
costTracker.wireToEventBus(bus);

const hooks = new HookPipeline({
  allowedWritePaths: ['src/**', 'test/**', '.squad/**'],
  scrubPii: true,
  maxAskUserPerSession: 3,
});

const streaming = new StreamingPipeline();
streaming.onDelta((delta) => process.stdout.write(delta.content));

// Cast
const casting = new CastingEngine({ universe: 'usual-suspects', agentCount: 5 });
const cast = casting.castTeam({
  roles: ['lead', 'frontend', 'backend', 'tester', 'scribe'],
});

// Monitor
const ralph = new RalphMonitor({
  teamRoot: squadPath,
  healthCheckInterval: 30000,
  statePath: `${squadPath}/ralph-state.json`,
});
await ralph.start(bus);

// Create client and sessions
const client = new SquadClient({ useStdio: true, autoReconnect: true });

for (const member of cast) {
  const session = await client.createSession({
    agentName: member.agentName,
    task: `Handle ${member.role} responsibilities`,
    persistPath: `${squadPath}/sessions/${member.agentName.toLowerCase()}.json`,
  });
  console.log(`🎭 ${member.agentName} (${member.role}) — ready`);
}

// Run your pipeline here...

// Report
console.log(costTracker.formatSummary());
const health = await ralph.healthCheck();
health.forEach(s => console.log(`  ${s.agentName}: ${s.state}`));

await ralph.stop();
```

---

## Key Concepts Cheat Sheet

| Concept | What it is | When you need it |
|---------|-----------|-----------------|
| `resolveSquad()` | Finds `.squad/` from cwd | Always — first call in any script |
| `loadConfig()` | Parses squad config into typed objects | When you need team/agent definitions |
| `CastingEngine` | Assigns persistent names from a universe | Team setup, adding agents |
| `SquadClient` | Connects to the runtime | Any session-based work |
| `createSession()` | Gives an agent a task with crash recovery | Every agent interaction |
| `HookPipeline` | Pre/post tool governance | Always — production requirement |
| `EventBus` | Pub/sub for session events | Monitoring, cost tracking, coordination |
| `CostTracker` | Token usage and cost reporting | Budget awareness, routing decisions |
| `RalphMonitor` | Health checks and event logging | Production monitoring |
| `StreamingPipeline` | Real-time response streaming | Interactive UX |
| `squad export/import` | Portable team snapshots | Sharing, backup, migration |
| `squad upstream` | Org-wide policy inheritance | Multi-repo teams |

---

## Next Steps

- **Explore the samples** — `samples/` has 6 working examples from basic to advanced.
- **Read the SDK README** — `packages/squad-sdk/README.md` for full API reference.
- **Try the interactive shell** — Run `squad` with no args for the REPL experience.
- **Add governance first** — `HookPipeline` should be in every production script. Don't skip it.
