# Squad

**AI agent teams for any project.** One command. A team that grows with your code.

[![Status](https://img.shields.io/badge/status-alpha-blueviolet)](#status)
[![Platform](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#about-squad)

---

## What is Squad?

Squad gives you an AI development team through GitHub Copilot. Describe what you're building. Get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. They persist across sessions, learn your codebase, share decisions, and get better the more you use them.

It's not a chatbot wearing hats. Each team member runs in its own context, reads only its own knowledge, and writes back what it learned.

---

## Quick Start

### 1. Create your project

```bash
mkdir my-project && cd my-project
git init
```

### 2. Install Squad

#### Option A: npm (Recommended)

```bash
npm install --save-dev @bradygaster/squad-cli
npx squad init
```

#### Option B: Legacy (GitHub-native)

```bash
npx github:bradygaster/squad-pr
```

This installs the Squad CLI, GitHub Actions workflows for automation (Ralph heartbeat, CI, triage, etc.), templates, and starter skills.

### 3. Authenticate with GitHub (for Issues, PRs, and Ralph)

```bash
gh auth login
```

### 4. Open Copilot and go

```
copilot
```

**In the GitHub Copilot CLI**, type `/agent` and select **Squad**.
**In VS Code**, type `/agents` and select **Squad**.

Then:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

Squad proposes a team — each member named from a persistent thematic cast. You say **yes**. They're ready.

---

## All 9 Commands

| Command | What it does |
|---------|-------------|
| `squad init` | **Init** — scaffold Squad in the current directory (skips existing files); use `--global` to init in personal squad directory |
| `squad upgrade` | Update Squad-owned files to latest; never touches your team state; use `--global` to upgrade personal squad |
| `squad upgrade --migrate-directory` | Rename `.ai-team/` → `.squad/` (legacy migration) |
| `squad status` | Show which squad is active and why |
| `squad copilot` | Add the Copilot coding agent (@copilot) to your squad |
| `squad watch` | Run Ralph's work monitor as a local polling process |
| `squad plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplaces |
| `squad export` | Export squad to a portable JSON snapshot |
| `squad import <file>` | Import squad from an export file |
| `squad scrub-emails` | Remove email addresses from Squad state files |

---

## Interactive Shell

Tired of typing `squad` followed by a command every time? Enter the interactive shell.

### Entering the Shell

```bash
squad
```

No arguments. Just `squad`. You'll get a prompt:

```
squad >
```

You're now connected to your team. Talk to them.

### Shell Commands

All shell commands start with `/`:

| Command | What it does |
|---------|-------------|
| `/status` | Show active agents, sessions, and recent work |
| `/history` | View session log and recent decisions |
| `/agents` | List team members, expertise, and activity |
| `/clear` | Clear the terminal screen |
| `/help` | Show this reference |
| `/quit` | Exit the shell (or Ctrl+C) |

### Talking to Agents

Use `@AgentName` or natural language with a comma:

```
squad > @Keaton, analyze the architecture of this project
squad > McManus, write a blog post about our new feature
squad > Build the login page
```

The coordinator routes messages to the right agents. Multiple agents can work in parallel—you'll see progress in real-time.

### What the Shell Does

- **Real-time visibility:** See agents working, decisions being recorded, blockers as they happen
- **Message routing:** Describe what you need; the coordinator figures out who should do it
- **Parallel execution:** Multiple agents work simultaneously on independent tasks
- **Session persistence:** If an agent crashes, it resumes from checkpoint; you never lose context
- **Decision logging:** Every decision is recorded in `.squad/decisions.md` for the whole team to see

For a comprehensive guide, see [docs/guide/shell.md](docs/guide/shell.md).

### Insider Channel

Want the latest features before they ship?

```bash
npm install --save-dev @bradygaster/squad-cli@insider
```

Or with legacy distribution:

```bash
npx github:bradygaster/squad-sdk#insider
```

### Legacy Distribution

The original GitHub-native distribution is still available:

```bash
npx github:bradygaster/squad-pr
```

This resolves the package from the repository directly via git+ssh. Use this if you prefer not to depend on npm registry.

**Migrating from GitHub-native?** See [Migration Guide: GitHub-native to npm](docs/migration-github-to-npm.md).

---

## Agents Work in Parallel — You Catch Up When You're Ready

Squad doesn't work on a human schedule. When you give a task, the coordinator launches every agent that can usefully start — simultaneously.

```
You: "Team, build the login page"

  🏗️ Lead — analyzing requirements...          ⎤
  ⚛️ Frontend — building login form...          ⎥ all launched
  🔧 Backend — setting up auth endpoints...     ⎥ in parallel
  🧪 Tester — writing test cases from spec...   ⎥
  📋 Scribe — logging everything...             ⎦
```

When agents finish, the coordinator immediately chains follow-up work. If you step away, a breadcrumb trail is waiting when you get back:

- **`decisions.md`** — every decision any agent made
- **`orchestration-log/`** — what was spawned, why, and what happened
- **`log/`** — full session history, searchable

**Knowledge compounds across sessions.** Every time an agent works, it writes lasting learnings to its `history.md`. After a few sessions, agents know your conventions, your preferences, your architecture. They stop asking questions they've already answered.

**And it's all in git.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## What Gets Created

```
.squad/
├── team.md              # Roster — who's on the team
├── routing.md           # Routing — who handles what
├── decisions.md         # Shared brain — team decisions
├── ceremonies.md        # Sprint ceremonies config
├── casting/
│   ├── policy.json      # Casting configuration
│   ├── registry.json    # Persistent name registry
│   └── history.json     # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they know about YOUR project
│   └── scribe/
│       └── charter.md   # Silent memory manager
├── skills/              # Compressed learnings from work
├── identity/
│   ├── now.md           # Current team focus
│   └── wisdom.md        # Reusable patterns
└── log/                 # Session history (searchable archive)
```

**Commit this folder.** Your team persists. Names persist. Anyone who clones gets the team — with the same cast.

---

## Monorepo Development

Squad is a monorepo with two packages:
- **`@bradygaster/squad-sdk`** — Core runtime and library for programmable agent orchestration
- **`@bradygaster/squad-cli`** — Command-line interface that depends on the SDK

### Building

```bash
# Install dependencies (npm workspaces)
npm install

# Build TypeScript to dist/
npm run build

# Build CLI bundle (dist/ + esbuild → cli.js)
npm run build:cli

# Watch mode for development
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Linting

```bash
# Type check (no emit)
npm run lint
```

### Publishing

Squad uses [changesets](https://github.com/changesets/changesets) for independent versioning across packages:

```bash
# Add a changeset
npx changeset add

# Validate changesets
npm run changeset:check
```

Changesets are resolved on the `main` branch; releases happen independently per package.

---

## The SDK: Programmable Agent Runtime

> Everything above works out of the box. The sections below are for developers who want **programmatic control** over agent orchestration.

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

### The Key Difference

**Prompt-only orchestration** (v0.5.2): One 32KB prompt describes all agents, all rules, all decision-making. The coordinator is text. Agents read it, interpret it, maybe follow it.

```
Prompt says:
"If the agent is Keaton, apply this logic. If McManus, apply that logic."
Agent reads it (consumes tokens), decides what to do (might ignore it).
```

**SDK orchestration** (v0.6+): Rules are code. Sessions are objects. Routing is compiled. Tools are validated before they run.

```
Router.matchRoute(message) → { agent: 'Keaton', priority: 'high' }
TypeScript knows exactly which agent will run, with what permissions.
HookPipeline runs file-write guards BEFORE the tool executes.
No interpretation. No ambiguity. Just code.
```

---

## The Custom Tools

These five tools let agents coordinate without calling you back.

### `squad_route` — Hand off work to another agent

```typescript
const tool = toolRegistry.getTool('squad_route');
const result = await tool.handler({
  targetAgent: 'McManus',  // Route to DevRel
  task: 'Write a blog post on the new casting system',
  priority: 'high',
  context: 'This feature launches next week',
});
```

**What it does:** Keaton (lead) routes a task to McManus (DevRel). Creates a new session for McManus, passes context, queues it with priority. McManus picks it up next.

### `squad_decide` — Record a team decision

```typescript
const result = await tool.handler({
  author: 'Keaton',
  summary: 'Use PostgreSQL, not MongoDB',
  body: 'We chose PostgreSQL because: (1) transactions, (2) known team expertise, (3) schema flexibility via JSONB.',
  references: ['PRD-5-coordinator', 'architecture-spike'],
});
```

**What it does:** Writes to `.squad/decisions/inbox/`. Every agent reads `decisions.md` before working. This is how Keaton's call cascades to the whole team without re-explaining.

### `squad_memory` — Append to agent history

```typescript
const result = await tool.handler({
  agent: 'Frontend',
  section: 'learnings',
  content: 'This project uses Tailwind v4 with dark mode plugin. Store under .styles/theme.config.ts',
});
```

**What it does:** Agents learn as they work. Next session, Frontend reads this and knows immediately. No context hunting.

### `squad_status` — Query the session pool

```typescript
const result = await tool.handler({
  agentName: 'Keaton',
  status: 'active',
  verbose: true,
});
// Returns: { poolSize: 5, activeSessions: 3, sessionsByAgent: {...} }
```

**What it does:** Ralph uses this to monitor work. You use it to debug ("Is Backend actually running or stalled?").

### `squad_skill` — Read/write agent skills

```typescript
const result = await tool.handler({
  skillName: 'react-query-setup',
  operation: 'read',
});
// Returns: skill content from .squad/skills/react-query-setup/SKILL.md

await tool.handler({
  skillName: 'auth-patterns',
  operation: 'write',
  content: 'Pattern for Clerk integration with Next.js...',
  confidence: 'high',
});
```

**What it does:** Skills are compressed learnings. Frontend writes "here's how we do auth" once. Every future Frontend session inherits it. Confidence levels let you track "we're sure" vs "we're experimenting".

---

## The Hook Pipeline

Rules don't live in prompts. They run before tools execute.

### File-Write Guards

```typescript
const pipeline = new HookPipeline({
  allowedWritePaths: [
    'src/**/*.ts',
    '.squad/**',
    'docs/**',
  ],
});

// Backend tries to write to /etc/passwd
// Hook intercepts, blocks, returns:
// "File write blocked: '/etc/passwd' does not match allowed paths: src/**, ..."
```

**Why it matters:** No agent (compromised or confused) can write outside your safe zones. Not because we asked nicely in the prompt. Because code won't let them.

### PII Scrubbing

```typescript
const pipeline = new HookPipeline({
  scrubPii: true,
});

// Agent logs "contact brady@example.com about deploy"
// After tool execution, output is:
// "contact [EMAIL_REDACTED] about deploy"
```

**Why it matters:** Sensitive data never escapes. Automatic. Invisible to the agent.

### Reviewer Lockout

```typescript
const lockout = pipeline.getReviewerLockout();

// Tester rejects Backend's auth code
lockout.lockout('src/auth.ts', 'Backend');

// Next turn, Backend tries to re-write auth.ts
// Hook blocks it:
// "Reviewer lockout: Agent 'Backend' is locked out of artifact 'src/auth.ts'. Another reviewer must handle this artifact."
```

**Why it matters:** When a reviewer says "no," it sticks. The original author can't sneak a fix in. Protocol enforced.

### Ask-User Rate Limiter

```typescript
const pipeline = new HookPipeline({
  maxAskUserPerSession: 3,
});

// Agent has called ask_user 3 times
// Fourth attempt is blocked:
// "ask_user rate limit exceeded: 3/3 calls used for this session. The agent should proceed without user input."
```

**Why it matters:** Agents don't stall waiting for you. They decide or move on.

---

## Event-Driven Coordination: Ralph

Ralph is your work monitor. Not a polling loop. A **persistent agent session** that subscribes to everything.

```typescript
const ralph = new RalphMonitor({
  teamRoot: '.squad',
  healthCheckInterval: 30000,  // Every 30s
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

Ralph is always watching. When agents complete work, write decisions, or hit errors, Ralph logs it. Crash? Ralph remembers. Next session, it knows exactly where you left off.

---

## Crash Recovery: Persistent Sessions

Sessions aren't ephemeral. They're durable.

```typescript
const session = await client.createSession({
  agentName: 'Backend',
  task: 'Implement user auth endpoints',
  persistPath: '.squad/sessions/backend-auth-001.json',
});

// Agent dies mid-work (network hiccup, model timeout, whatever)
// Next time:

const resumed = await client.resumeSession(
  '.squad/sessions/backend-auth-001.json'
);

// Backend wakes up knowing:
// - What the task was
// - What it already wrote (file system has the changes)
// - Where it was in the work
// - No repetition, no lost context
```

---

## The Cast: Persistent Agent Identity

Squad's secret weapon is **casting**. Agents aren't `role-1`, `role-2`. They're Keaton, McManus, Verbal, Fenster, Kujan. Names from *The Usual Suspects* (1995).

Why?

1. **Memorable.** Devs say "Keaton handles routing," not "the lead agent coordinates." It sticks.
2. **Persistent.** Same agent, same name, across every session. You build a relationship with Keaton over time.
3. **Extensible.** Adding a sixth agent? Cast them from the same universe. The identity pattern carries forward.

The casting engine compiles agent personas from the universe theme. Your `.squad/agents/` folder has the actual files, but the SDK's `CastingEngine` makes the assignment automatic and consistent.

```typescript
const casting = new CastingEngine({
  universe: 'usual-suspects',
  agentCount: 5,
});

const cast = casting.castTeam({
  roles: ['lead', 'frontend', 'backend', 'tester', 'scribe'],
});

// cast = [
//   { role: 'lead', agentName: 'Keaton', ... },
//   { role: 'frontend', agentName: 'McManus', ... },
//   { role: 'backend', agentName: 'Verbal', ... },
//   { role: 'tester', agentName: 'Fenster', ... },
//   { role: 'scribe', agentName: 'Kobayashi', ... },
// ]
```

---

## What Gets Created

The SDK doesn't replace your squad directory. It uses it.

```
.squad/
├── team.md                # Roster — who's on the team
├── routing.md             # Routing rules — who handles what
├── decisions.md           # Shared brain — every decision
├── casting/
│   ├── policy.json        # Casting config (universe, agent count, etc.)
│   ├── registry.json      # Persistent name registry
│   └── history.json       # Who was cast when
├── agents/
│   ├── Keaton/
│   │   ├── charter.md     # Identity, expertise, voice
│   │   └── history.md     # What Keaton knows about YOUR project
│   ├── McManus/
│   │   ├── charter.md
│   │   └── history.md
│   └── ... (others)
├── skills/
│   ├── react-patterns/
│   │   └── SKILL.md       # Compressed learnings
│   ├── auth-flows/
│   │   └── SKILL.md
│   └── ... (learned over time)
├── sessions/              # Persisted sessions for crash recovery
│   ├── backend-auth-001.json
│   └── ... (auto-cleanup older than 30 days)
└── log/                   # Session history (searchable archive)
```

**Commit all of this.** It's your team's memory. Clone the repo, you get the team—with everything they've learned.

---

## Growing Your Squad

### Add an Agent

```typescript
const casting = new CastingEngine({ universe: 'usual-suspects', agentCount: 6 });
const newCast = casting.castTeam({
  roles: ['lead', 'frontend', 'backend', 'tester', 'devops', 'scribe'],
});
// The SDK creates a new session for the sixth agent automatically.
```

### Remove an Agent

```typescript
// Update team.md to remove the agent, update casting config
// Old agent files move to .squad/agents/_alumni/{name}/
// Knowledge preserved forever, but not active in routing
```

---

## The Tech Stack

| What | Version | Why |
|------|---------|-----|
| **Node.js** | ≥ 20.0.0 | Stable async/await, strong TypeScript support |
| **TypeScript** | 5.7+ | Every tool, session, hook is fully typed |
| **@github/copilot-sdk** | v0.1.8+ (Technical Preview) | Real-time agent streaming, tool execution |
| **Vitest** | 3.0+ | Fast, concurrent test runner; great DX |
| **esbuild** | 0.25+ | Bundling, dead-code elimination |

---

## Testing & Coverage

```bash
npm test                # Run all tests (1551 tests across 45 files)
npm run test:watch     # Watch mode for development
npm run build          # Compile TypeScript to dist/
npm run build:cli      # Build + bundle CLI into cli.js
npm run dev            # Watch TypeScript in background
npm run lint           # Type check (tsc --noEmit)
```

**Test coverage:** 1,551 tests across 45 test files. Core modules tested:
- Session lifecycle (create, resume, end)
- Tool execution and validation
- Hook pipeline (guards, PII scrubbing, lockouts)
- Router matching and charter compilation
- Parallel fan-out spawning
- Event bus and subscription
- Casting engine and universe selection
- Ralph monitoring and health checks
- Crash recovery and persistence

---

## Known Limitations

- **Alpha** — API and file formats may change between versions
- **Node 20+** — requires Node.js 20.0.0 or later
- **GitHub Copilot CLI & VS Code** — Squad works on both CLI and VS Code
- **`gh` CLI required** — GitHub Issues, PRs, Ralph, and Project Boards all need `gh auth login`
- **Knowledge grows with use** — the first session is the least capable; agents improve as they accumulate history
- **SSH agent required for install** — `npx github:bradygaster/squad-sdk` resolves via `git+ssh://`. If no SSH agent is running, npm's progress spinner hides git's passphrase prompt, making install appear frozen. Fix: start your SSH agent first (`ssh-add`), or use `npx --progress=false github:bradygaster/squad-sdk`

---

## Status

🟣 **Alpha** — v0.6.0-alpha.0.

Your team (`.squad/` folder) is always portable and safe. The orchestration runtime is what evolves.

**Conceived by** [@bradygaster](https://github.com/bradygaster).

---

## Contributing

See [CONTRIBUTORS.md](../CONTRIBUTORS.md) in the source repo.

---

## License

MIT
