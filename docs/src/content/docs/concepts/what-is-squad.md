# What is Squad?

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad is an AI multi-agent orchestration framework that lives inside your repository. It coordinates a team of specialist AI agents, each with a defined role, persistent memory, and a charter that governs what it can and cannot do. Squad extends your team at agentic speed while keeping a human in charge of every meaningful decision.

## What is Squad?

Squad is an open-source (MIT) framework that brings multi-agent AI orchestration into developer workflows. Rather than relying on a single general-purpose AI, Squad distributes work across a cast of named, role-specific agents. Each agent focuses on one area: writing code, reviewing pull requests, drafting documentation, managing project state, or enforcing quality standards.

All agent state, memory, decisions, and configuration live in a `.squad/` directory at the root of your repository. Because `.squad/` is committed alongside your code, team state is version-controlled, auditable, and shareable. Any developer who clones the repo picks up the same agent context.

Squad is designed to extend human teams, not replace them. Agents surface options, produce drafts, and record decisions, but a human reviewer stays in the loop before anything is published or merged.

## Key capabilities

### Human-directed parallel work

Squad dispatches work to multiple agents at the same time, then surfaces the results for human review. Parallel execution reduces turnaround time on complex tasks (for example, simultaneous code review and documentation updates) without removing the human decision point at the end.

### Persistent memory across sessions

Each agent writes its working state to `.squad/agents/`. Memory persists between VS Code sessions, across branches, and across team members. An agent that reviewed a pull request yesterday remembers the context when it picks up the follow-on task today.

### GitHub-native

Squad ships no external service. The `.squad/` directory, agent charters, routing rules, and decision logs live in your repository. You version them, diff them, and review them the same way you review source code. There's nothing to keep in sync with a separate platform.

### Built-in governance

Squad enforces explicit safeguards at the framework level:

- **File-write guards** prevent agents from modifying files outside their assigned scope.
- **PII scrubbing** strips personally identifiable information before it reaches agent memory or logs.
- **Reviewer lockout** blocks agents from self-approving work that requires human sign-off.
- **Escalation points** surface unresolved decisions to the designated human owner before execution continues.

### Markdown-first design

Squad configuration lives in portable markdown under `.squad/`, so a team works across supported Copilot surfaces without a build step. The legacy `squad.config.ts` authoring mode is deprecated and will be removed in v2.

### Extensible

Squad supports plugins, a marketplace for community-built agent packs, and integration with the Model Context Protocol (MCP). You can add domain-specific agents or connect Squad to external tools without forking the core framework.

## How Squad works

Squad follows a three-step setup:

1. **Install** the Squad command-line interface (CLI) globally.
2. **Initialize** Squad in your repository. This creates the `.squad/` directory and scaffolds your team configuration.
3. **Build** by invoking your agent team from VS Code Copilot.

For the complete setup walkthrough, see [Installation](/docs/get-started/installation/).

## Architecture

Squad processes every request through a coordinator-first routing pipeline. The coordinator reads your request, applies routing rules, spawns agents in parallel, and then returns labeled results.

```
User request
    ↓
Coordinator (routing engine)
    ↓
Spawns agents in parallel
    ↓
Agents read memory (.squad/) → work → write results
    ↓
Scribe merges decisions, Ralph tracks issues
    ↓
Results returned to user
```

### Coordinator

The coordinator is Squad's routing engine. It reads your request, checks routing rules in `.squad/routing.md`, and decides which agents to spawn. If you address the team collectively, the coordinator decomposes the work and launches multiple agents in parallel. If you name a specific agent, the coordinator routes directly to that agent.

### Agents

Each agent is a specialist with a charter, a role, and persistent memory. Agents run as independent subprocesses with their own context windows and tools. Before working, each agent reads `.squad/decisions.md` and its own history file. After working, each agent writes results back. Agents never see each other's conversations — the coordinator manages all coordination between them.

### Memory (.squad/)

All team state lives in `.squad/`. This includes the roster (`team.md`), routing rules (`routing.md`), decisions (`decisions.md`), agent charters and histories (`agents/`), and ceremony schedules (`ceremonies.md`). Agents read from this directory before every spawn. You own these files and can edit them directly at any time.

### Routing

Routing rules in `.squad/routing.md` define which agent handles which category of work. The coordinator reads these rules before spawning any agent. You can override routing at any time by naming an agent directly in your request.

### Scribe

The Scribe is a silent agent that tracks decisions and logs sessions. Every team includes a Scribe. The Scribe runs in the background and merges decisions from all agents into `.squad/decisions.md`. You don't address the Scribe directly.

### Ralph

Ralph is the work monitor. Ralph watches your GitHub or GitLab issues, tracks work in progress, and alerts the team when something is ready for the next step. Like the Scribe, Ralph is silent unless you request a status update.

## What happens when you say "Team, build X"?

When you send a team-wide request, Squad runs the following sequence:

1. The coordinator reads the request and checks `.squad/routing.md` for decomposition rules.
2. The coordinator spawns multiple agents in parallel — one for frontend, one for backend, one for tests, and so on.
3. Each agent reads `.squad/decisions.md` and its own history file (`agents/{name}/history.md`), then works independently.
4. Agents write results to their history files and propose decisions.
5. The Scribe merges all decisions into `.squad/decisions.md`.
6. The coordinator returns labeled results to you, tagged with each agent's name.

## The Squad directory

The `.squad/` directory is the source of truth for your agent team. Key files and folders include:

| Path | Purpose |
|---|---|
| `team.md` | Defines the agent roster: names, roles, and ownership areas. |
| `routing.md` | Specifies which agent handles which type of task. |
| `decisions.md` | Records decisions made by agents, with rationale and human approval status. |
| `agents/` | Per-agent memory files, state, and logs. |
| `templates/` | Reusable prompt and output templates shared across agents. |

Because `.squad/` is committed to your repository, team state is as reviewable and reversible as any other source file. Pull requests that change agent behavior go through normal code review.

## Responsible AI

Squad is built on the principle that agentic systems must remain under human control. The framework democratizes multi-agent work by making it accessible to any developer with a repository, while enforcing human oversight at every consequential step.

Agents in Squad propose, draft, and record. Humans review, approve, and are accountable for final output. The governance features built into Squad, including reviewer lockout, escalation points, and auditable decision logs, are not optional settings. They are part of the framework's design contract. Squad extends human teams at scale; it doesn't remove the human from the loop.

