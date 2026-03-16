# What It Means on Disk to Be a Squad Agent

> Developer-oriented concept doc: the on-disk anatomy of a Squad agent

## Overview

A Squad agent is not a single file or code module. It's a **distributed identity** spanning three layers:

1. **Runtime state** — `.squad/` directory (team-specific, git-committed)
2. **SDK infrastructure** — `packages/squad-sdk/src/agents/` (compiled code)
3. **Configuration** — `squad.config.ts` or `squad.config.json` (optional overrides)

This doc explains how these layers work together to create an agent that can be spawned, collaborate, and accumulate knowledge over time.

## Directory Structure

Each agent exists in `.squad/agents/{name}/`:

```
.squad/
└── agents/
    ├── flight/
    │   ├── charter.md       # Agent's identity, boundaries, voice
    │   └── history.md       # Append-only learnings (optional)
    ├── capcom/
    │   └── charter.md
    ├── scribe/
    │   └── charter.md
    └── _alumni/
        └── verbal/          # Retired agents live here
            └── charter.md
```

### Key Files

#### `charter.md` — The Agent's DNA

**Who writes it:** The team (usually via a specialist like Procedures, or manually by the team owner).

**Who reads it:** The SDK's charter compiler (`charter-compiler.ts`) at agent spawn time.

**What it contains:**

```markdown
# {Name} — {Role}

> {One-line personality statement}

## Identity
- **Name:** Flight
- **Role:** Lead
- **Expertise:** Product vision, architecture, code review
- **Style:** Decisive. Opinionated when it matters.

## What I Own
- Product direction and architectural decisions
- Code review and quality gates

## How I Work
- Architecture decisions compound
- Proposal-first: meaningful changes need docs/proposals/ before code

## Boundaries
**I handle:** Architecture, product direction, code review, scope.
**I don't handle:** Implementation details, test writing, docs, distribution.

## Model
Preferred: auto
```

**Parsed sections:**
- **Identity** → `name`, `role`, `expertise`, `style`
- **What I Own** → `ownership` (plain text)
- **Boundaries** → `boundaries` (plain text)
- **Model** → `modelPreference`, `modelRationale`, `modelFallback`

The charter is compiled into a `SquadCustomAgentConfig` object that includes:
- The full charter content as the agent's system prompt
- Parsed metadata (name, role, model preference)
- Team context (from `team.md`, `routing.md`, `decisions.md`)

**Format expectations:**
- Markdown headings (`## `) structure the charter
- The SDK parses specific sections by heading name
- Freeform content is preserved and passed to the LLM
- Personality and voice matter — agents have opinions

#### `history.md` — Append-Only Learnings

**Who writes it:** The agent itself, after completing work.

**Who reads it:** The agent, before starting new work (via the charter compiler's history shadow feature).

**What it contains:**

```markdown
# Flight — Project History

> Knowledge accumulated through leading Squad development.

## Core Context

Three-branch model (main/dev/insiders). Apollo 13 team, 3931 tests. 
Boundary review heuristic: "Squad Ships It" — if Squad doesn't ship 
the code, it's IRL content.

## Learnings

### Adoption Tracking Architecture
Three-tier opt-in system: Tier 1 (aggregate-only, `.github/adoption/`) 
ships first; Tier 2 (opt-in registry) designed next; Tier 3 (public 
showcase) launches when ≥5 projects opt in.

### Remote Squad Access
Three-phase rollout: Phase 1 — GitHub Discussions bot with `/squad` 
command (1 day, zero hosting). Phase 2 — GitHub Copilot Extension via 
Contents API (1 week). Phase 3 — Slack/Teams bot (2 weeks).
```

**What goes in:**
- Context that persists across sessions (project patterns, established decisions)
- Learnings that inform future work (what worked, what didn't)
- Domain-specific knowledge accumulated over time

**What doesn't go in:**
- Transient task state (use the session-scoped SQL database for that)
- Raw command output or logs (use `.squad/log/` for session logs)
- Decisions that affect other agents (those go in `.squad/decisions.md`)

**Format:**
- Top-level `## Core Context` — stable facts
- Top-level `## Learnings` — append new `### ` blocks here
- No deletion — history is append-only

### Alumni — The Retirement Pattern

When an agent is no longer needed, it's moved to `.squad/agents/_alumni/{name}/`:

```
.squad/agents/_alumni/
├── verbal/
│   └── charter.md
├── kobayashi/
│   └── charter.md
└── mcmanus/
    └── charter.md
```

**What happens on retirement:**
1. Agent directory moved from `.squad/agents/{name}/` to `.squad/agents/_alumni/{name}/`
2. Agent removed from `team.md` roster
3. Routing rules updated to remove agent from work assignments
4. Charter preserved for historical reference
5. Casting name returned to the pool (if using the casting system)

Alumni agents cannot be spawned. Their charters are read-only archives.

## The Casting System

Squad uses a **thematic casting model** to assign memorable names from fictional universes.

### Files

#### `casting-registry.json` — Name Allocation

```json
{
  "agents": {
    "flight": {
      "universe": "Apollo 13",
      "character": "Flight Director",
      "assigned": "2026-02-21T10:00:00Z"
    }
  }
}
```

**Purpose:** Tracks which names are in use, which universe they're from, and when they were assigned.

**Who manages it:** The casting module (`packages/squad-sdk/src/casting/`).

**Lifecycle:**
- Name allocated when agent created → entry added
- Agent retired → entry remains (name not reused within same universe)
- Universe exhausted → new universe added to `casting-policy.json`

#### `casting-policy.json` — Universe Rules

```json
{
  "casting_policy_version": "1.1",
  "allowlist_universes": [
    "The Usual Suspects",
    "Reservoir Dogs",
    "Alien",
    "Ocean's Eleven"
  ],
  "universe_capacity": {
    "The Usual Suspects": 6,
    "Reservoir Dogs": 8,
    "Alien": 8,
    "Ocean's Eleven": 14
  }
}
```

**Purpose:** Defines which fictional universes are available and how many names each can provide.

**Who manages it:** The team owner (manually edited when adding new universes).

**Rules:**
- Each universe has a capacity limit (prevents name dilution)
- Names must be recognizable characters from that universe
- No universe mixing on the same team (maintains thematic coherence)

#### `casting-history.json` — Audit Log

```json
{
  "universe_usage_history": [
    {
      "timestamp": "2026-02-21T10:00:00Z",
      "universe": "Apollo 13",
      "agent": "flight",
      "character": "Flight Director",
      "action": "assigned"
    }
  ],
  "assignment_cast_snapshots": {}
}
```

**Purpose:** Immutable audit trail of all casting decisions.

**Who writes it:** The casting module (append-only).

**Why it matters:** Enables rollback, debugging, and understanding team evolution over time.

## How an Agent "Exists"

An agent is **active** when all three conditions are met:

1. **Charter exists** — `.squad/agents/{name}/charter.md` is present
2. **Roster entry** — Agent listed in `team.md` with status `✅ Active` or `📋 Silent`
3. **Routing rules** — Agent appears in `routing.md` work assignments

Without all three, the agent cannot be spawned.

**Spawn flow:**

```
User request
    ↓
Coordinator reads routing.md
    ↓
Identifies agent to spawn (e.g., "flight")
    ↓
SDK reads .squad/agents/flight/charter.md
    ↓
SDK reads .squad/agents/flight/history.md (if exists)
    ↓
SDK reads .squad/team.md, routing.md, decisions.md
    ↓
Charter compiler builds SquadCustomAgentConfig
    ↓
SDK spawns agent with compiled prompt
    ↓
Agent runs, writes to history.md after work
```

## Relationship to SDK Source Files

The `.squad/` directory is **runtime state**, not code. The SDK provides the **infrastructure** to load, parse, and execute agents:

| SDK Module | Purpose |
|------------|---------|
| `packages/squad-sdk/src/agents/charter-compiler.ts` | Parses `charter.md` into `SquadCustomAgentConfig` |
| `packages/squad-sdk/src/agents/history-shadow.ts` | Loads `history.md` and injects into agent context |
| `packages/squad-sdk/src/agents/lifecycle.ts` | Agent spawn, session management, termination |
| `packages/squad-sdk/src/agents/model-selector.ts` | Resolves `## Model` preference to actual model |
| `packages/squad-sdk/src/casting/` | Name allocation, registry management |

**Key insight:** The SDK never hardcodes agent names or roles. It's a generic **agent runtime**. All specificity lives in `.squad/`.

This means:
- You can add new agents without changing SDK code
- Multiple projects using the same SDK have different teams
- Agents can be dynamically added, retired, or renamed

## What About `squad.config.ts`?

The optional `squad.config.ts` file provides **overrides** for charter-based agents:

```typescript
export default {
  agents: {
    flight: {
      model: 'gpt-4.1', // Override charter's "Preferred: auto"
      tools: ['read', 'write'], // Restrict tool access
      extraPrompt: 'Focus on performance trade-offs.' // Append to charter
    }
  }
}
```

**Merge order (config wins on conflict):**
1. Charter parsed → base `SquadCustomAgentConfig`
2. Config overrides applied → merged `SquadCustomAgentConfig`
3. Team context injected → final prompt sent to LLM

This allows:
- Per-environment tuning (staging vs production)
- Temporary restrictions (disable tools during testing)
- A/B testing different prompts without editing charters

## Cross-Agent Context Propagation

Agents don't share memory. Context flows via **explicit artifacts**:

### `team.md` — Shared Roster
All agents read this to know who else exists and what they do.

### `routing.md` — Work Assignment Rules
Defines which agent handles which type of work. Coordinator uses this to route requests.

### `decisions.md` — Canonical Decisions Log
All agents read this before starting work. It's the shared memory.

### `.squad/decisions/inbox/` — Decision Drop-Box
Agents write decisions here. Scribe merges them into `decisions.md`.

**Flow:**

```
Flight makes a decision
    ↓
Flight writes .squad/decisions/inbox/flight-api-versioning.md
    ↓
Scribe (background agent) runs
    ↓
Scribe reads inbox, appends to decisions.md, deletes inbox file
    ↓
CAPCOM starts work, reads decisions.md
    ↓
CAPCOM sees Flight's decision, respects it
```

### `.squad/log/` — Session Logs
Scribe writes session summaries here. Useful for auditing and debugging.

**Example log file:**

```
.squad/log/2026-03-16T10-00-00-feature-adoption-tracking.md
```

Contains:
- Who worked
- What was done
- Decisions made
- Key outcomes

## Key Takeaways

1. **An agent is a directory** — `.squad/agents/{name}/` with at least `charter.md`.
2. **Charter is the source of truth** — defines identity, boundaries, voice.
3. **History is optional** — but recommended for agents doing repeated work.
4. **Casting adds personality** — thematic names make agents memorable.
5. **SDK is generic infrastructure** — no agent-specific code in the runtime.
6. **Context flows via files** — `team.md`, `routing.md`, `decisions.md`, `.squad/log/`.
7. **Retirement is move + remove** — alumni live in `_alumni/`, can't be spawned.

## Developer Checklist: Creating a New Agent

- [ ] Create `.squad/agents/{name}/` directory
- [ ] Write `charter.md` using `.squad/templates/charter.md` as reference
- [ ] Add agent to `team.md` roster with status `✅ Active`
- [ ] Add agent to `routing.md` with work type assignments
- [ ] (Optional) Allocate name via casting system
- [ ] (Optional) Create `history.md` if agent needs persistent memory
- [ ] Test spawn: `squad spawn {name} "Hello, world"`

## Further Reading

- **Charter format reference:** `.squad/templates/charter.md`
- **Roster format reference:** `.squad/templates/roster.md`
- **SDK agent infrastructure:** `packages/squad-sdk/src/agents/`
- **Casting system design:** `packages/squad-sdk/src/casting/`

---

**Author:** Flight  
**Requested by:** Dina (via Brady)  
**Date:** 2026-03-16
