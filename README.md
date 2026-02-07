# Squad

**AI agent teams for any project.** A team that grows with your code.

[![Status](https://img.shields.io/badge/status-experimental-blueviolet)](#status)
[![Platform](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#how-it-works)

---

## What is Squad?

Squad gives you an AI development team through GitHub Copilot. Describe what you're building. Get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. They persist across sessions, learn your codebase, share decisions, and get better the more you use them.

It's not a chatbot wearing hats. Each team member runs in its own context, reads only its own knowledge, and writes back what it learned.

```mermaid
graph TB
    U["🧑‍💻 You"] -->|"Team, build the login page"| C["GitHub Copilot"]

    subgraph team [" 🏢 The Team "]
        direction LR
        A["🏗️ Lead"]
        K["⚛️ Frontend"]
        R["🔧 Backend"]
        T["🧪 Tester"]
    end

    C -->|spawns| A
    C -->|spawns| K
    C -->|spawns| R
    C -->|spawns| T
    C -.->|silent| S["📋 Scribe"]

    subgraph memory [" 🧠 Shared Memory "]
        direction LR
        D["decisions.md"]
        L["log/"]
    end

    A & K & R & T -->|read & write| D
    S -->|merges & logs| D
    S -->|writes| L

    A -->|learns| HA["history.md"]
    K -->|learns| HK["history.md"]
    R -->|learns| HR["history.md"]
    T -->|learns| HT["history.md"]

    style C fill:#6366f1,color:#fff
    style A fill:#3b82f6,color:#fff
    style K fill:#3b82f6,color:#fff
    style R fill:#3b82f6,color:#fff
    style T fill:#3b82f6,color:#fff
    style S fill:#6b7280,color:#fff
    style team fill:none,stroke:#3b82f6,stroke-width:2px,stroke-dasharray:5 5
    style memory fill:none,stroke:#8b5cf6,stroke-width:2px,stroke-dasharray:5 5
```

---

## Quick Start

### 1. Create your project

```bash
mkdir my-project && cd my-project
git init
```

### 2. Install Squad

```bash
npx bradygaster/squad
```

### 3. Open Copilot and go

```
copilot
```

Select **Squad** from the `/agents` list, then:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

Squad proposes a team — each member named from a persistent thematic cast. You say **yes**. They're ready.

---

## Your Team Grows With Your Project

Squad agents aren't stateless assistants. They accumulate project-specific knowledge over time.

| | 🌱 Week 1 | 🌿 Week 4 | 🌳 Week 12 |
|---|-----------|-----------|------------|
| ⚛️ **Frontend** | React project structure | + Component library, routing, state patterns | + Design system, perf patterns, a11y |
| 🔧 **Backend** | Express + Postgres stack | + JWT auth, rate limiting, SQL preferences | + Caching, migrations, monitoring |
| 🏗️ **Lead** | Project scope, team roster | + Architecture decisions, trade-offs | + Full project history, risk areas, tech debt |
| 🧪 **Tester** | Test framework chosen | + Integration test patterns, edge cases | + Regression patterns, CI pipeline, coverage gaps |
| 📋 **Scribe** | First session logged | 12 sessions, 8 decisions | 47 decisions, full searchable archive |

**How it works:**

- Every time an agent does work, it writes lasting learnings to its `history.md`
- A silent **Scribe** propagates cross-team decisions — when one agent chooses JWT, the others find out
- `decisions.md` is the shared brain — every agent reads it before working
- Session logs in `log/` create a searchable archive of everything that happened
- Each agent gets a **persistent name** from a thematic cast — names stick across sessions and clones

By week 4, your agents know your conventions, your preferences, your architecture. They stop asking questions they've already answered. They start making suggestions informed by your project's actual history.

**And it's all in git.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## How It Works

### The Key Insight

Each agent gets its **own context window**. The coordinator is thin. Each agent loads only its charter + history. No shared bloat.

### Context Window Budget

Real numbers. No hand-waving.

| What | Tokens | % of 128K context | When |
|------|--------|-------------------|------|
| **Coordinator** (squad.agent.md) | ~1,900 | 1.5% | Every message |
| **Agent at Week 1** (charter + seed) | ~850 | 0.7% | When spawned |
| **Agent at Week 4** (+ 15 learnings, 8 decisions) | ~1,900 | 1.5% | When spawned |
| **Agent at Week 12** (+ 50 learnings, 47 decisions) | ~5,600 | 4.4% | When spawned |
| **Remaining for actual work** | **~120,000** | **94%** | Always |

The coordinator uses 1.5% of context. A 12-week veteran agent uses 4.4%. That leaves **94% of the context window for reasoning about your code** — not for remembering who it is.

### Memory Architecture

| Layer | What | Who writes | Who reads |
|-------|------|-----------|-----------|
| `charter.md` | Identity, expertise, voice | Squad (at init) | The agent itself |
| `history.md` | Project-specific learnings | Each agent, after every session | That agent only |
| `decisions.md` | Team-wide decisions | Any agent | All agents |
| `log/` | Session history | Scribe | Anyone (searchable archive) |

---

## What Gets Created

```
.ai-team/
├── team.md              # Roster — who's on the team
├── routing.md           # Routing — who handles what
├── decisions.md         # Shared brain — team decisions
├── casting/
│   ├── policy.json      # Casting configuration
│   ├── registry.json    # Persistent name registry
│   └── history.json     # Universe usage history
├── agents/
│   ├── {name}/          # Each agent gets a persistent cast name
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they know about YOUR project
│   ├── {name}/
│   │   ├── charter.md
│   │   └── history.md
│   └── scribe/
│       └── charter.md   # Silent memory manager
└── log/                 # Session history
```

**Commit this folder.** Your team persists. Names persist. Anyone who clones gets the team — with the same cast.

---

## Growing the Team

### Adding Members

```
> I need a DevOps person.
```

Squad generates a new agent, seeds them with project context and existing decisions. Immediately productive.

### Removing Members

```
> Remove the designer — we're past that phase.
```

Agents aren't deleted. Their charter and history move to `.ai-team/agents/_alumni/`. Knowledge preserved, nothing lost. If you need them back later, they remember everything.

---

## Reviewer Protocol

Team members with review authority (Tester, Lead) can **reject** work. On rejection, the reviewer may require:

- A **different agent** handles the revision (not the original author)
- A **new specialist** is spawned for the task

The Coordinator enforces this. No self-review of rejected work.

---

## Install

```bash
npx bradygaster/squad
```

See [Quick Start](#quick-start) for the full walkthrough.

---

## Status

🟣 **Experimental.** Contributors welcome.

Conceived by [@bradygaster](https://github.com/bradygaster).
