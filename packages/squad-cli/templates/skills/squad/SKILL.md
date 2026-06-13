---
name: "squad"
description: "Disambiguation skill — Squad is a CUSTOM AGENT, not a skill. If you reached this skill while trying to set up an AI team or invoke Squad's coordinator, read this file: it routes you to the right tool (task tool with agent_type='Squad') and surfaces the squad-commands menu."
domain: "squad-meta"
confidence: "high"
source: "first-party"
triggers: ["squad", "use squad", "use the squad skill", "squad skill", "assemble a squad", "set up squad", "squad agent", "squad team"]
license: MIT
---

# Skill: Squad (Disambiguation)

> **You are here because something tried to invoke a skill named `Squad`.**
> Squad is a **custom agent**, not a skill. This file redirects you to the right tool.

---

## Why this skill exists

The Squad framework registers a custom Copilot CLI agent at `.github/agents/squad.agent.md` with the user-facing name **"Squad"** and the description *"Your AI team. Describe what you're building, get a team of specialists that live in your repo."*

Coding models reading that description sometimes pick the wrong tool: they try `skill(Squad)` (skill lookup) instead of `task(agent_type="Squad", …)` (custom agent invocation). That call fails because no skill is named "Squad" — the actual Squad-related skills are `squad-commands`, `squad-conventions`, `squad-version-check`, etc.

This skill exists so the lookup **succeeds** and immediately tells you the right next step.

---

## How to actually use Squad

There are two distinct things you might want to do. Pick the one that matches your intent:

### A) Invoke the Squad coordinator agent (most common)

Use the **`task` tool** with `agent_type` set to `"Squad"`. This spawns the orchestrator described in `.github/agents/squad.agent.md`. It will route your request to the right specialist agent on the team, scaffold a team if none exists yet, and enforce handoffs.

```text
task(
  name="<short-task-name>",
  agent_type="Squad",
  prompt="<what you want the team to do>"
)
```

Use this when the user says things like:
- *"Use Squad to build X"*
- *"Set up an AI team for this project"*
- *"Have the Squad coordinator design Y"*

### B) See what Squad commands exist

Trigger the **`squad-commands` skill** (not this one). It's a categorized catalog the coordinator presents as an interactive menu.

Triggered by: `"squad commands"`, `"what can squad do"`, `"show me squad options"`, `"slash commands"`, `"what commands are available"`.

Use this when the user says things like:
- *"What can Squad do?"*
- *"Show me the squad commands"*
- *"squad help"*

### C) Initialize Squad in a fresh project (rare from inside a session)

`squad init` is a **shell command**, not a tool call. If a project has no `.squad/` directory and the user wants to add Squad, run `squad init` in their terminal. Do NOT try to invoke this from inside an existing Copilot session — `.squad/` is already initialized if you're reading this file.

---

## What NOT to do

- ❌ Do not call `skill(Squad)` again — you just did, that's how you got here.
- ❌ Do not call `skill(squad-coordinator)` or other made-up skill names.
- ❌ Do not assume the Squad agent is a one-shot tool — it spawns specialist agents and orchestrates handoffs across a multi-turn session.
- ❌ Do not call `task(agent_type="Squad", …)` for tiny tasks the current agent can handle directly. Squad is for work that needs orchestration; trivial edits don't.

---

## How this skill was discovered

Squad scans 5 project skill directories in precedence order. This skill ships at `.copilot/skills/squad/SKILL.md` from the bundled templates so a fresh `squad init` produces a coordinator that already knows the right disambiguation.

If you removed this skill on purpose, the model will fall back to its own reasoning (and may make the same mistake again).

---

## See also

- `.github/agents/squad.agent.md` — the actual Squad coordinator agent
- `.copilot/skills/squad-commands/SKILL.md` — the command catalog
- `.copilot/skills/squad-conventions/SKILL.md` — conventions for working on the Squad codebase itself
