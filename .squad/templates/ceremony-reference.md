# Ceremony Reference — Config, Facilitator Pattern, and Templates

> **This file is loaded on-demand when ceremonies are triggered.**

## Ceremony Config Format

Each ceremony in `.squad/ceremonies.md` is an `## ` heading with a config table and agenda:

```markdown
## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | multi-agent task involving 2+ agents modifying shared systems |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review the task and requirements
2. Agree on interfaces and contracts between components
3. Identify risks and edge cases
4. Assign action items
```

## Config Fields

| Field | Values | Description |
|-------|--------|-------------|
| `trigger` | auto / manual | Auto: Coordinator triggers when condition matches. Manual: only when user requests. |
| `when` | before / after | Before: runs before agents start work. After: runs after agents complete. |
| `condition` | free text | Natural language condition the Coordinator evaluates. Ignored for manual triggers. |
| `facilitator` | lead / {agent-name} | The agent who runs the ceremony. `lead` = the team's Lead role. |
| `participants` | all / all-relevant / all-involved / {name list} | Who attends. `all-relevant` = agents relevant to the task. `all-involved` = agents who worked on the batch. |
| `time_budget` | focused / thorough | `focused` = keep it tight, decisions only. `thorough` = deeper analysis allowed. |
| `enabled` | ✅ yes / ❌ no | Toggle a ceremony without deleting it. |

## Facilitator Spawn Template

```
agent_type: "general-purpose"
model: "{resolved_model}"
description: "{facilitator_emoji} {Facilitator}: {ceremony name} — {task summary}"
prompt: |
  You are {Facilitator}, the {Role} on this project.

  YOUR CHARTER:
  {paste facilitator's charter.md}

  TEAM ROOT: {team_root}
  All `.squad/` paths are relative to this root.

  Read .squad/agents/{facilitator}/history.md and .squad/decisions.md.
  If .squad/skills/ exists and contains SKILL.md files, read relevant ones before working.

  **Requested by:** {current user name}

  ---

  You are FACILITATING a ceremony: **{ceremony name}**

  **Agenda:**
  {agenda_template}

  **Participants:** {list of participant names and roles}
  **Context:** {task description or batch results, depending on when: before/after}
  **Time budget:** {time_budget}

  Run this ceremony by spawning each participant as a sub-task to get their input:
  - For each participant, spawn them (sync) with the agenda and ask for their
    perspective on each agenda item. Include relevant context they need.
  - **Keep it fast.** Quick alignment check, not a long discussion.
    Each participant flags: (a) concerns/risks from their domain,
    (b) interface/contract requirements, (c) blockers or unknowns.
  - Goal: minimize iterations — surface problems BEFORE agents work independently.
  - Ask for delta feedback only: "What would you change or add?"
  - Synthesize ceremony summary: decisions, action items, risks, disagreements.

  Write the ceremony summary to:
  .squad/log/{YYYY-MM-DD}-{ceremony-id}.md

  Format:
  # {Ceremony Name} — {date}
  **Facilitator:** {Facilitator}
  **Participants:** {names}
  **Context:** {what triggered this ceremony}

  ## Decisions
  {list decisions}

  ## Action Items
  | Owner | Action |
  |-------|--------|
  | {Name} | {action} |

  ## Notes
  {risks, concerns, disagreements, other discussion points}

  For each decision, also write to:
  .squad/decisions/inbox/{facilitator}-{ceremony-id}-{brief-slug}.md
```

## Ceremony Execution Rules

1. **Check triggers.** Before spawning a work batch, read `.squad/ceremonies.md`. For auto/before ceremonies, evaluate condition against current task. For after, evaluate after batch completes. Manual runs only when user asks.
2. **Resolve participants.** Determine which agents attend based on the `participants` field and current task/batch.
3. **Spawn the facilitator (sync)** using the template above.
4. **Proceed with work.** For before: spawn work batch with ceremony summary as context. For after: results inform next iteration. Spawn Scribe (background) to record, but do NOT chain another ceremony.
5. **Show results:** `📋 Design Review completed — facilitated by {Lead}. Decisions: {count} | Action items: {count}.`

**Ceremony cooldown:** Skip auto-triggered checks for the immediately following step. Resets after one batch completes without a ceremony.

**Manual trigger:** User can request by name: "run a design meeting", "retro on the last build", "team meeting".
**User can:** skip, add new ceremonies, or disable existing ones.
