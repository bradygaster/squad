# Squad

Squad gives you an AI team through GitHub Copilot. One file, one click, a working team that knows your project.

## Quick Start

```bash
mkdir my-project && cd my-project
git init
mkdir -p .github/agents
# Copy squad.agent.md into .github/agents/
```

Open Copilot, pick **Squad** from the `/agents` list, and tell it what you're building:

```
> I'm building a REST API with Node and Postgres.
```

Squad proposes a team. You say yes. They're ready.

## What Gets Created

```
.ai-team/
├── team.md              # Who's on the team
├── routing.md           # Who handles what
├── decisions.md         # Shared team decisions (all agents read this)
├── agents/
│   ├── alex/
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they've learned about YOUR project
│   ├── river/
│   │   ├── charter.md
│   │   └── history.md
│   └── scribe/
│       └── charter.md   # Silent memory manager
└── log/                 # Session history
```

Commit this. Your team persists across sessions, learns over time, and works for anyone who clones the repo.

## How It Works

Squad is a thin coordinator. When you talk to it:

1. **Routes** your request to the right team member
2. **Spawns** that agent in its own context window with only its charter + history
3. **Agent works**, then writes learnings back to its `history.md`
4. **Scribe logs** the session and propagates decisions across the team

Each agent sees only its own files — not the whole team. Context stays focused. Responses stay fast.

### Memory Architecture

- **`history.md`** — Personal. Each agent's project-specific knowledge. Grows over time.
- **`decisions.md`** — Shared. Team decisions all agents respect. The Scribe propagates these.
- **`log/`** — Archive. What happened, who did what, when.

Agents learn. They remember your conventions, your architecture, your preferences. They also share — when River makes a database decision, the Scribe makes sure Kai knows about it.

## Adding Team Members

```
> I need a DevOps person.
```

Squad generates a new agent, seeds them with project context, and adds them to the roster.

## Install

One file: [`squad.agent.md`](.github/agents/squad.agent.md)

Drop it in `.github/agents/` in any repo. Works with Copilot CLI and VS Code.

## Status

Early. Private. Building.
