# Interactive Shell Guide

The Squad interactive shell gives you a persistent connection to your team. Instead of spawning short-lived CLI invocations, the shell maintains a real-time session where you can talk to agents, issue commands, and watch work happen.

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

Output:
```
Team Roster
────────────────────
Keaton (Lead)
  Expertise: Architecture, routing, decisions
  Last work: 5m ago
  Sessions: 12
  
McManus (DevRel)
  Expertise: Documentation, messaging, advocacy
  Last work: 2m ago
  Sessions: 8

[... Verbal, Fenster, Kobayashi ...]
```

### `/clear` — Clear the screen

Clears terminal output. Useful when the shell gets cluttered.

```
squad > /clear
```

### `/help` — Show all commands

Display this reference.

```
squad > /help
```

### `/quit` — Exit the shell

Close the shell and return to your terminal.

```
squad > /quit
```

---

## Addressing Agents

You can talk to specific agents by name using two syntaxes:

### Using `@AgentName`

Direct an agent to do something:

```
squad > @Keaton, analyze the architecture of this project
```

The shell routes the message to Keaton. Keaton reads it and acts on it.

### Using Natural Language Comma Syntax

Same effect:

```
squad > Keaton, set up the database schema for user authentication
```

Or directly (without the agent name):

```
squad > Write a blog post about our new casting system
```

When you don't name an agent, the **coordinator** (Keaton by default) routes the task to whoever is best suited.

---

## Message Routing

### How Messages Get to Agents

1. **You type a message** → Shell receives it
2. **Coordinator (Keaton) reads it** → Determines which agent(s) can usefully start
3. **Agents launch in parallel** → All applicable agents work simultaneously
4. **Agents write results** → To `.squad/` (decisions, history, skills, etc.)
5. **Shell streams updates** → You see progress in real-time

### The Coordinator

Keaton (the Lead) is your coordinator. He:
- Routes incoming tasks to the right agents
- Decides which agents can start in parallel
- Chains follow-up work (if Agent A finishes, does Agent B have work to do?)
- Records team decisions and learnings

You never talk directly to the coordinator logic—you just talk to Keaton as a person, and he coordinates.

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

Shows full session log with:
- Start time, end time, duration
- What the agent did
- Files written
- Decisions made
- Any errors or blocks

### Resuming Work

If an agent crashes or times out:

```
squad > @Keaton, check on Verbal and resume if needed
```

Keaton will check Verbal's session and resume if interrupted.

### Ending a Session

Agents end their own sessions when work is complete. You can ask an agent to wrap up:

```
squad > @Verbal, finish up and write a summary
```

---

## Keyboard Shortcuts

### Command History

**Up Arrow** / **Down Arrow** — Scroll through previous commands

```
squad > [up arrow]  # Previous command
squad > [up arrow]  # Command before that
squad > [down arrow] # Next command
```

Useful for re-running similar commands or remembering what you asked before.

### Line Editing

- **Ctrl+A** — Jump to start of line
- **Ctrl+E** — Jump to end of line
- **Ctrl+U** — Clear from cursor to start of line
- **Ctrl+K** — Clear from cursor to end of line
- **Ctrl+W** — Delete previous word

### Exit

- **Ctrl+C** — Exit the shell (same as `/quit`)

---

## Tips and Tricks

### Tip 1: Use `/status` before big asks

Before sending a complex task, check team status:

```
squad > /status
squad > @Keaton, set up the CI/CD pipeline
```

If agents are already working, you might want to wait.

### Tip 2: Reference decisions, not details

Instead of explaining the whole architecture:

```
# Don't:
squad > Build the auth system. Use JWT. Refresh tokens every 1 hour...

# Do:
squad > Build the auth system. See the auth decision in decisions.md.
```

Agents read your decisions—they're shortcuts for complex context.

### Tip 3: Ask Keaton to batch work

If you have multiple tasks:

```
squad > @Keaton, here's what needs doing:
1. Set up database schema
2. Build API endpoints
3. Write tests

Prioritize and route, please.
```

Keaton will decompose, prioritize, and launch agents efficiently.

### Tip 4: Check `/history` after long waits

If you step away for an hour:

```
squad > /history
```

Scroll through what happened. Every decision is logged. Every task is recorded.

### Tip 3: Name agents explicitly for urgent work

For critical tasks:

```
squad > @Keaton, this is critical: we need the deployment script fixed in the next 15 minutes
```

The explicit mention ensures the lead coordinator sees it first.

### Tip 4: Use your shell session as a workspace

The shell is your thinking space. You can:
- Ask follow-up questions mid-task (`@McManus, did you finish the form?`)
- Route corrections (`@Frontend, I changed my mind, use Tailwind not Bootstrap`)
- Poll progress (`/status`)
- Review decisions (`/history`)

All without breaking agents' work.

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

Keaton evaluates dependencies and launches all three (frontend doesn't block backend, etc.).

### Asking Agents About Their Work

You can ask any agent about their progress:

```
squad > @Verbal, what's left on the auth endpoints?
squad > @McManus, show me what you've written so far
squad > @Fenster, are the tests passing?
```

Agents respond with status, file paths, and blockers.

### Pulling in External Context

If you have a design or spec file:

```
squad > @Frontend, here's the figma link: https://...

Build the signup flow to match this design.
```

Agents can read external references (links, uploaded files, etc.) if you provide them.

### Custom Agent Chaining

Instead of asking the coordinator to chain work, you can ask agents to coordinate:

```
squad > @Keaton, when Verbal finishes the auth API, have him route testing to Fenster
```

Keaton can set up explicit hand-offs.

---

## Troubleshooting

### Shell Hangs or No Response

**Problem:** You type a message and nothing happens for 10+ seconds.

**Why:** The coordinator might be evaluating a complex task, or an agent might be streaming large output.

**Fix:** Press Ctrl+C to interrupt, then check `/status` to see what's happening.

### Agent Not Responding

**Problem:** You ask an agent to do something and they don't start working.

**Why:** They might be locked out, blocked by dependencies, or not recognized as the right agent for the task.

**Fix:** Check `/status` and `/history` to see blockers. Then ask Keaton to route explicitly:

```
squad > @Keaton, route this task to @Verbal and report any blocks
```

### Shell Quit Unexpectedly

**Problem:** Shell closed without you running `/quit`.

**Why:** Either you pressed Ctrl+C twice, or there was a fatal error.

**Fix:** Run `squad` again to restart. Check `.squad/log/` for error context.

### Lost Command History

**Problem:** You want to find a command you ran earlier but can't scroll back far enough.

**Why:** Shell history has a limit (usually 1000 lines).

**Fix:** Check `/history` which shows the full session log across all commands.

---

## Integration with Your Workflow

### Using the Shell with VS Code

1. Open an integrated terminal in VS Code
2. Run `squad` to enter the shell
3. Keep it open in a side panel
4. As you edit code, ask agents to review: `@Fenster, test this component`

### Using the Shell with GitHub CLI

```bash
# In one terminal
squad

# In another
gh issue list
gh pr create

# In squad shell
squad > @Keaton, here's the issue: [paste issue #]
```

### Setting Up for Long Sessions

For long development sprints:

1. Start the shell: `squad`
2. List what's to do: `@Keaton, what's the roadmap?`
3. Batch work: `@Keaton, prioritize these 5 issues`
4. Let agents work in parallel
5. Check status periodically: `/status`
6. Review decisions: `/history`
7. Ask follow-ups without restarting

---

## See Also

- **README.md** — Interactive Shell section (quick reference)
- **.squad/decisions.md** — Team decisions (agents read this)
- **.squad/agents/ — Agent charters and history (how agents work)
- **docs/api/** — Programmable SDK reference (for code-level orchestration)
