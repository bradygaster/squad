# Ceremonies

**Try this to schedule team ceremonies:**
```
Schedule a daily standup at 9am and a sprint retro every Friday
```

**Try this to trigger a pre-work design review:**
```
Run a design review before we start the authentication rebuild
```

Ceremonies are structured team meetings that happen at key moments — before multi-agent work begins, or after something goes wrong. Squad runs them automatically when needed.

---

## Built-in Ceremonies

### Design Review

**Triggers automatically** before multi-agent tasks involving 2+ agents modifying shared systems.

The Lead facilitates. Each relevant agent is spawned to weigh in on interfaces, risks, and contracts before work begins.

```
> Team, rebuild the authentication system

📋 Design Review completed — facilitated by Ripley
   Decisions: 3 | Action items: 4
   Agreed on JWT format, session storage strategy, and endpoint contracts
```

### Retrospective

**Triggers automatically** after build failures, test failures, or reviewer rejections.

The Lead facilitates a focused root-cause analysis.

```
📋 Retrospective completed — facilitated by Ripley
   Decisions: 2 | Action items: 3
   Root cause: missing null check in API response parser
```

---

## Manual Triggers

Run any ceremony on demand:

```
> Run a retro
> Run a design meeting
```

---

## Managing Ceremonies

### Create a new ceremony

```
> Add a ceremony for code reviews
```

### Disable a ceremony

```
> Disable retros
```

The ceremony stays in `ceremonies.md` but won't auto-trigger.

### Skip a ceremony once

```
> Skip the design review for this task
```

The ceremony remains enabled for future tasks.

---

## Summary

| Action | Prompt |
|--------|--------|
| Trigger a retro | `"Run a retro"` |
| Trigger a design review | `"Run a design meeting"` |
| Create a ceremony | `"Add a ceremony for code reviews"` |
| Disable a ceremony | `"Disable retros"` |
| Skip once | `"Skip the design review for this task"` |

---

## Tips

- Design reviews prevent agents from building conflicting implementations. Let them run on multi-agent tasks.
- Retros produce decisions that get written to `decisions.md` — they improve future work, not just diagnose the current failure.
- Ceremony config lives in `.ai-team/ceremonies.md`. You can edit it directly if you prefer.
- Ceremonies work well with [human team members](human-team-members.md) — add a human as a participant for approval gates.

## Sample Prompts

```
run a design review before we start
```

Manually triggers a design review ceremony for the current task.

```
run a retro on why those tests failed
```

Starts a retrospective to analyze test failures and capture learnings.

```
add a ceremony for security reviews
```

Creates a custom ceremony type with its own triggers and participants.

```
skip the design review for this quick fix
```

Bypasses the design review ceremony for the current task only.

```
disable automatic retros
```

Turns off auto-triggering for retrospectives while keeping the ceremony defined.
