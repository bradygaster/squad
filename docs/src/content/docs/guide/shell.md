# Interactive Shell Guide

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> **Recommended: Use a provider CLI** - Use either `copilot --agent squad` or `claude --agent squad` for day-to-day conversational Squad sessions.

The Squad interactive shell gives you a persistent connection to your team.Instead of spawning short-lived CLI invocations, the shell maintains a real-time session where you can talk to agents, issue commands, and watch work happen.

---

## Getting Started

### Enter the Shell

```bash
squad
```

With no arguments, `squad` enters the interactive shell. You'll see a prompt:

```
squad >
```

### Exit the Shell

```
squad > /quit
```

Or press **Ctrl+C**.

---

## Shell Commands

All shell commands start with a forward slash `/`.

### `/status` — Check team status

Display the current state of your squad: active agents, sessions, and recent work.

```
squad > /status
```

Output:

```
Team Status
────────────────────
Active Agents: 4/5
  Keaton (lead): idle
  McManus (devrel): working (10s)
  Verbal (backend): working (25s)
  Fenster (tester): idle
  Kobayashi (scribe): logging

Sessions: 5
Latest decision: "Use React Query for data fetching" (2m ago)
```

### `/history` — View recent work

Display the session log and recent decisions.

```
squad > /history
```

Shows:
- Last 10 completed tasks
- Decisions made in this session
- Agents that have worked
- Full session transcript (searchable)

### `/agents` — List team members

Show all agents on the team with their roles, expertise, and knowledge.

```
squad > /agents
```

### `/sessions` — List saved sessions

View past shell sessions. Shows the 10 most recent sessions with their ID prefix, timestamp, and message count.

```
squad > /sessions
```

Output:

```
Saved Sessions (3 total)
  1. a1b2c3d4  6/15/2026, 2:30:00 PM  (12 messages)
  2. e5f6a7b8  6/14/2026, 10:15:00 AM  (8 messages)
  3. c9d0e1f2  6/13/2026, 4:45:00 PM  (23 messages)

Use /resume <id-prefix> to restore a session.
```

### `/resume <id>` — Restore a past session

Resume a previous session by providing the first few characters of its ID. The session's full message history is restored into the current shell.

```
squad > /resume a1b2
✔ Restored session a1b2c3d4 (12 messages)
```

Typical workflow — pick up where you left off:

```
squad > /sessions
squad > /resume a1b2
squad > @Keaton, where were we on the auth work?
```

### `/clear` — Clear the screen

Clears terminal output.

### `/help` — Show all commands

### `/quit` — Exit the shell

Close the shell and return to your terminal.

---

## Addressing Agents

You can talk to specific agents by name:

### Using `@AgentName`

```
squad > @Keaton, analyze the architecture of this project
```

### Using natural language

```
squad > Keaton, set up the database schema for user authentication
```

Or without naming an agent — the coordinator routes to whoever is best suited:

```
squad > Write a blog post about our new casting system
```

---

## Message Routing

### How Messages Get to Agents

1. **You type a message** → Shell receives it
2. **Coordinator reads it** → Determines which agent(s) can usefully start
3. **Agents launch in parallel** → All applicable agents work simultaneously
4. **Agents write results** → To `.squad/` (decisions, history, skills, etc.)
5. **Shell streams updates** → You see progress in real-time

### Parallel Execution

When you give a task that multiple agents can handle:

```
squad > Build the login page
```

The coordinator might spawn:
- McManus (frontend) → building the UI
- Verbal (backend) → setting up auth endpoints
- Fenster (tester) → writing test cases
- Kobayashi (scribe) → logging everything

All at once. All in parallel.

---

## Session Management

### What Is a Session?

Each agent gets a **persistent session** — a long-lived context where it remembers:
- The task you gave it
- What it's already written to disk
- Previous decisions and learnings
- Its own knowledge base (charter, history)

Sessions survive crashes. If an agent dies mid-work, it resumes from the exact checkpoint.

### Viewing Session History

```
squad > /history
```

Shows full session log with start time, end time, duration, what the agent did, files written, decisions made, and any errors.

### Resuming Work

If an agent crashes or times out:

```
squad > @Keaton, check on Verbal and resume if needed
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Scroll command history |
| `Ctrl+A` | Jump to start of line |
| `Ctrl+E` | Jump to end of line |
| `Ctrl+U` | Clear to start of line |
| `Ctrl+K` | Clear to end of line |
| `Ctrl+W` | Delete previous word |
| `Ctrl+C` | Exit shell |

---

## Tips and Tricks

### Check `/status` before big asks

Before sending a complex task, check team status. If agents are already working, you might want to wait.

### Reference decisions, not details

Instead of explaining the whole architecture:

```
# Don't:
squad > Build the auth system. Use JWT. Refresh tokens every 1 hour...

# Do:
squad > Build the auth system. See the auth decision in decisions.md.
```

Agents read your decisions — they're shortcuts for complex context.

### Batch work through the coordinator

```
squad > @Keaton, here's what needs doing:
1. Set up database schema
2. Build API endpoints
3. Write tests

Prioritize and route, please.
```

The coordinator will decompose, prioritize, and launch agents efficiently.

### Check `/history` after long waits

If you step away, run `/history` to see what happened. Every decision is logged, every task is recorded.

### Name agents explicitly for urgent work

```
squad > @Keaton, this is critical: we need the deployment script fixed
```

The explicit mention ensures the lead coordinator sees it first.

---

## Advanced Usage

### Working with Multiple Tasks

The coordinator queues tasks and parallelizes where possible:

```
squad > Write the API spec
squad > Build the React components
squad > Set up the database

/status  # See all three being worked on
```

### Asking Agents About Their Work

```
squad > @Verbal, what's left on the auth endpoints?
squad > @McManus, show me what you've written so far
squad > @Fenster, are the tests passing?
```

Agents respond with status, file paths, and blockers.

### Custom Agent Chaining

Instead of asking the coordinator to chain work, set up explicit hand-offs:

```
squad > @Keaton, when Verbal finishes the auth API, have him route testing to Fenster
```

---

## Using the Shell with VS Code

1. Open an integrated terminal in VS Code
2. Run `squad` to enter the shell
3. Keep it open in a side panel
4. As you edit code, ask agents to review: `@Fenster, test this component`

---

## Troubleshooting

### Shell Hangs or No Response

The coordinator might be evaluating a complex task, or an agent might be streaming large output. Press `Ctrl+C` to interrupt, then check `/status`.

### Agent Not Responding

Check `/status` and `/history` for blockers. Then ask the coordinator to route explicitly:

```
squad > @Keaton, route this task to @Verbal and report any blocks
```

### Shell Quit Unexpectedly

Run `squad` again to restart. Check `.squad/log/` for error context.

---

## See Also

- [CLI Reference](../reference/cli.md) — All CLI commands
- [VS Code](../features/vscode.md) — Squad in VS Code
- [Parallel Execution](../features/parallel-execution.md) — How agents fan out
