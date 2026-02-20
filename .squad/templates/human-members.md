# Human Team Members — Reference

> **This file is loaded on-demand when managing human team members.**

## Triggers

| User says | Action |
|-----------|--------|
| "add {Name} as {role}" / "{Name} is our {role}" | Add human to roster |
| "I'm on the team as {role}" | Add current user as human member |
| "{Name} is done" / "here's what {Name} decided" | Unblock items waiting on that human |
| "remove {Name}" | Move to alumni |
| "skip {Name}, just proceed" | Override human gate |

## How Humans Differ from AI Agents

| Aspect | AI Agent | Human Member |
|--------|----------|-------------|
| **Badge** | ✅ Active | 👤 Human |
| **Casting** | Named from universe | Real name — no casting |
| **Charter** | Full charter.md | No charter file |
| **Spawnable** | Yes (via `task` tool) | No — coordinator pauses and asks |
| **History** | Writes to history.md | No history file |
| **Routing** | Auto-routed | Coordinator presents work, waits |

## Adding a Human Member

1. Add to roster: `| {Name} | {Role} | — | 👤 Human |`
2. Add routing entries to `routing.md`: `| {domain} | {Name} 👤 | {example tasks} |`
3. Announce: `"👤 {Name} joined the team as {Role}."`

## Routing to Humans

1. Present the work: `"👤 This one's for {Name} ({Role}) — {what's needed}. Let me know when {Name} is done."`
2. Track pending item (what, who, when, status: ⏳ Waiting)
3. Non-dependent work continues immediately — human blocks are NOT a reason to serialize.
4. Agents can reference humans in decisions/notes.
5. Stale reminder after >1 turn: `"📌 Still waiting on {Name} for {thing}. Follow up or unblock?"`

## Reviewer Rejection Protocol with Humans

Human rejects → lockout rules apply normally. If all AI agents locked out and human has relevant role, route revision to them.

## Multiple Humans

Each gets own roster entry with real name. Coordinator tracks blocks per human independently.

Example: `| Brady | PM | — | 👤 Human |`
