# Repo Anatomy

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Every Squad-enabled repository has a `.squad/` directory at the root. This page explains what each file and folder does, how they relate to each other, and which ones you should edit vs. leave to the agents.

---

## Try This

```
What's in our .squad directory?
```

```
Show me the team's current decisions
```

```
Which skills has the team learned?
```

---

## Directory Structure

After running `squad init`, your repo looks like this:

```
.squad/
├── team.md                    # Team roster and member profiles
├── routing.md                 # Work routing rules
├── charter.md                 # Team charter and mission
├── decisions.md               # Shared decision log (all agents read this)
├── decisions-archive.md       # Archived decisions
├── history.md                 # Team-wide session history
├── roster.md                  # Member list with roles
├── ceremonies.md              # Team rituals (standup, retro, etc.)
├── config.json                # Local configuration
├── agents/
│   └── {name}/
│       ├── charter.md         # Agent's role, domain, and voice
│       └── history.md         # Agent's personal memory
├── skills/
│   └── {name}/
│       └── SKILL.md           # Learned patterns and tool usage
├── decisions/
│   └── inbox/                 # Pending decision drafts (gitignored)
├── sessions/                  # Session logs (gitignored)
├── templates/                 # File templates for new squads
└── identity/                  # Team identity and wisdom docs
```

---

## What Each File Does

### Files You Should Know

| File | Purpose | Who writes it | You edit? |
|------|---------|---------------|-----------|
| `team.md` | Roster of all agents with roles and capabilities | `squad init` and Scribe | Rarely — add human members here |
| `routing.md` | Rules for which agent handles what | You or Scribe | Yes — tune routing as your team evolves |
| `decisions.md` | Shared rules every agent reads at session start | Scribe (merges from inbox) | Yes — this is your team's law |
| `charter.md` | Team mission and operating principles | `squad init` | Occasionally — when team direction changes |

### Per-Agent Files

| File | Purpose | Who writes it |
|------|---------|---------------|
| `agents/{name}/charter.md` | Defines the agent's role, domain expertise, voice, and boundaries | `squad init` or casting |
| `agents/{name}/history.md` | Personal memory — only this agent reads its own | The agent itself |

Charters are your primary lever for shaping agent behavior. Edit a charter to change how an agent thinks, what it prioritizes, and how it communicates.

### Skills

| File | Purpose | Who writes it |
|------|---------|---------------|
| `skills/{name}/SKILL.md` | Reusable pattern with tools, examples, and anti-patterns | Agents (typically Procedures or the agent that learned it) |

Skills are portable. You can copy a skill from one repo to another, and any Squad team can use it. They follow a standard template with Context, Patterns, Examples, and Anti-Patterns sections.

---

## The Decision Lifecycle

Decisions flow through a specific path:

```
Agent drafts note → .squad/decisions/inbox/{agent}-{slug}.md
       ↓
Scribe reviews and merges → .squad/decisions.md
       ↓
All agents read decisions.md at session start
       ↓
Old decisions archived → .squad/decisions-archive.md
```

The `inbox/` directory is gitignored — it's a staging area for drafts that haven't been reviewed yet. Once Scribe merges a decision, it becomes team law.

---

## What Gets Checked In vs. Gitignored

| Checked in | Gitignored |
|------------|------------|
| `team.md`, `routing.md`, `charter.md` | `decisions/inbox/` (draft staging) |
| `decisions.md`, `decisions-archive.md` | `sessions/` (session logs) |
| `agents/{name}/charter.md` and `history.md` | `config.json` (local machine paths) |
| `skills/{name}/SKILL.md` | `*.local.json` (local secrets and config) |
| `ceremonies.md`, `templates/` | `orchestration-log/`, `log/` |

**Rule of thumb:** If it shapes agent behavior, check it in. If it contains local paths, secrets, or transient state, gitignore it.

---

## Relationship to Other Config

Squad also uses files outside `.squad/`:

| File | Purpose |
|------|---------|
| `squad.config.ts` | SDK configuration (when using `squad init --sdk`) |
| `.github/agents/squad.agent.md` | GitHub Copilot Coding Agent coordinator prompt |
| `.github/copilot-instructions.md` | Global Copilot instructions (Squad adds team context here) |

---

## Next Steps

- [Team Setup](../features/team-setup) — configure your team roster
- [Memory and Knowledge](memory-and-knowledge) — how the three memory layers interact
- [Skills](../features/skills) — how to create and manage skills
