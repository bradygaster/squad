# Human Team Members

> **Try this:**  
> `"Add Sarah (sarah@example.com) as a frontend developer to the team"`  
> `"Add Jordan as design reviewer"`

Not every team member needs to be AI. Add real people to the roster for decisions that require a human — design sign-off, security review, product approval.

---

## Adding a Human

```
> Add Sarah as design reviewer
```

Sarah appears in the team roster with a 👤 Human badge, distinct from AI agents.

---

## How Humans Differ from AI Agents

| | AI Agent | Human Member |
|---|----------|-------------|
| Badge | Role-specific emoji | 👤 Human |
| Charter | ✅ | ❌ |
| History | ✅ | ❌ |
| Spawned as sub-agent | ✅ | ❌ |
| Can review work | ✅ | ✅ |

Human team members have no charter, no history file, and are never spawned as sub-agents. They exist on the roster as routing targets.

---

## What Happens When Work Routes to a Human

When the coordinator determines that a task should go to a human team member:

1. **Squad pauses** and tells you that a human needs to act
2. You relay the task to the person outside of Squad
3. When they respond, you tell Squad what happened

If the human hasn't responded after a while, Squad sends **stale reminders** prompting you to follow up.

---

## Humans as Reviewers

Human team members can serve as reviewers in the [reviewer protocol](../guide.md). This is useful when you want a real person to sign off before work is considered done.

```
> Add Jordan as security reviewer
```

When work requires security review, Squad routes it to Jordan and waits.

---

## Removing a Human

Same as removing any team member — they move to alumni:

```
> Remove Sarah from the team
```

Their entry moves to `.ai-team/agents/_alumni/`. They can be re-added later.

---

## Tips

- Use human members for approval gates — design review, compliance, final sign-off.
- Human members work well alongside [ceremonies](ceremonies.md) — add a human as a required participant in a design review ceremony.
- You're the relay. Squad can't message humans directly — it tells you, and you coordinate.

## Sample Prompts

```
add Maria as security reviewer
```

Adds a human team member with a specific review responsibility.

```
route this auth work to Jordan for approval
```

Assigns a task to a human team member for external handling.

```
Jordan approved the design — we can proceed
```

Unblocks work that was waiting on human input.

```
who's on the roster?
```

Shows all team members including both AI agents and human members.

```
remove Sarah from the team
```

Moves a human team member to the alumni list.
