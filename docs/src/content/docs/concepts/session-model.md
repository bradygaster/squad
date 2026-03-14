# Session Model

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad sessions are the container for everything you do with your team. Understanding the session model helps you work confidently across tools, recover from interruptions, and know exactly where your context lives.

---

## Try This

```
What did we work on last session?
```

```
Can you pick up where we left off?
```

```
Show me the decisions from today's sessions
```

---

## What Is a Session?

A session starts when you open a conversation with Squad (CLI, VS Code, or Copilot Chat) and ends when you close it. During that time:

- **Agents remember context** — your current task, decisions made, files changed
- **Memory accumulates** — skills learned, conventions captured, decisions recorded
- **Work products persist** — commits, branches, PRs, and `.squad/` file changes survive the session

The session itself is ephemeral. The work it produces is permanent.

---

## Session Boundaries

| Surface | Session starts | Session ends |
|---------|---------------|--------------|
| CLI (`copilot` or `squad`) | You run the command | You exit (Ctrl+C or `/exit`) |
| VS Code Copilot Chat | You open a chat thread | You close the thread or window |
| Copilot Coding Agent | An issue is assigned | The PR is opened |

Each surface creates an independent session. Switching from CLI to VS Code starts a **new** session — the agents don't automatically carry over mid-conversation context.

---

## What Survives Between Sessions

Memory in Squad is layered. Some things persist automatically, others need explicit action:

| Layer | Persists? | Where |
|-------|-----------|-------|
| **Skills** (learned patterns) | ✅ Always | `.squad/skills/{name}/SKILL.md` |
| **Decisions** (team rules) | ✅ Always | `.squad/decisions.md` |
| **Agent history** (per-agent memory) | ✅ Always | `.squad/agents/{name}/history.md` |
| **Conversation context** | ❌ Session-only | Lives in the chat thread |
| **Uncommitted file changes** | ⚠️ If saved | Local working tree |

**Key insight:** If an agent learns something important mid-session, it writes it to a skill or decision file. That's what makes it permanent. Conversation context alone doesn't persist.

---

## Resuming Work

When you start a new session and want to continue previous work:

```
Pick up where we left off on the auth refactor
```

Squad reads the persisted layers (skills, decisions, history) and reconstructs context. The more your team has written to these layers, the smoother the resume.

For long-running projects, consider asking your team to checkpoint progress:

```
Scribe, log what we've done today before I close out
```

---

## Crashes and Restarts

During preview, session crashes and restarts are **expected behavior**. This is normal and not a sign of misconfiguration. When it happens:

1. Your persisted memory (skills, decisions, history) is safe — it lives in files
2. Uncommitted code changes are safe — they're in your working tree
3. Conversation context is lost — you'll need to re-establish what you were doing

A quick restart prompt works well:

```
I just restarted. We were working on [topic]. What's the current state?
```

---

## Sessions Across Surfaces

You can use different surfaces throughout the day without conflict:

- **Morning:** CLI session for focused coding
- **Midday:** VS Code chat for quick questions
- **Evening:** CLI session to review the day's work

Each reads the same `.squad/` directory, so decisions and skills are shared. The only thing that doesn't transfer is the live conversation thread.

---

## Next Steps

- [Memory and Knowledge](memory-and-knowledge) — how the three memory layers work
- [Your First Session](../get-started/first-session) — guided walkthrough
- [Tips and Tricks](../guide/tips-and-tricks) — productivity patterns
