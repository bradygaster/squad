# FAQ

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Answers to frequently asked questions, sourced from the Squad community.

---

## Setup and Getting Started

### Why is Squad asking me to approve every file edit?

By default, Copilot requires approval for each tool call. Squad sessions involve many tool calls (agent spawns, file reads, git operations), which makes this very disruptive.

**Fix:** Use `--yolo` mode:

```bash
copilot --yolo
```

This is the recommended way to run Squad. See [Quick Start](../get-started/five-minute-start) for details.

### Why does setup differ from what the README shows?

Squad evolves quickly during preview. If the README instructions don't match your experience, check [What's New](../whatsnew) for recent changes, or run:

```bash
npx github:bradygaster/squad@latest init
```

The `@latest` tag ensures you're using the most current version.

### I ran `squad init` but my agents aren't showing up

This usually happens when you run `squad init` inside a subdirectory of an existing Git repository, or when there's a parent `.git/` directory above your project. Squad needs to be initialized at the **Git repository root**.

**Fix:** Run `squad init` from the root of your Git repo, not a subdirectory.

---

## Sessions and Context

### Did I lose my Squad session?

If you switched tools (CLI to VS Code, or vice versa), you started a new session. Your persisted memory (skills, decisions, history) is intact — only the live conversation context was lost.

**Fix:** Start the new session with context:

```
I was working on [topic]. Pick up where we left off.
```

See [Session Model](../concepts/session-model) for more on how sessions work.

### Do I need to keep using the terminal?

No. Squad works across multiple surfaces:

- **CLI** (`copilot` or `squad`) — best for focused, multi-step work
- **VS Code Copilot Chat** — good for quick questions and small tasks
- **Copilot Coding Agent** — best for autonomous issue-to-PR workflows

All surfaces read the same `.squad/` directory, so your team's memory is shared.

### Is it okay to restart Squad?

Yes. During preview, crashes and restarts are normal. Your work is safe — files, commits, and `.squad/` state all persist. See [Known Limitations](../get-started/known-limitations) for details.

---

## Team and Memory

### Where do decisions actually live?

In `.squad/decisions.md`. This is the single source of truth that every agent reads at session start. Decisions get there through a lifecycle:

1. An agent drafts a note → `.squad/decisions/inbox/`
2. Scribe reviews and merges → `.squad/decisions.md`
3. Old decisions get archived → `.squad/decisions-archive.md`

See [Repo Anatomy](../concepts/repo-anatomy) for the full directory structure.

### How do I change how an agent behaves?

Edit its charter at `.squad/agents/{name}/charter.md`. The charter defines the agent's role, domain, voice, and boundaries. Changes take effect at the next session start.

### Can I add human team members?

Yes. Add them to `.squad/team.md` and reference them in `.squad/routing.md`. See [Human Team Members](../features/human-team-members) for details.

---

## Is Squad Right for Me?

### Is Squad faster than working alone with Copilot?

Speed isn't Squad's primary value. The real benefits are:

- **Management altitude** — you direct a team instead of doing everything yourself
- **Role separation** — agents specialize (architect, reviewer, docs writer) so quality improves
- **Continuity** — memory compounds across sessions, so the team gets better over time
- **Consistency** — decisions are enforced uniformly across the codebase

Squad shines when you have multi-step workflows, long-lived projects, or team coordination needs. For simple one-off tasks, plain Copilot may be simpler.

### When is Squad overkill?

- Quick one-line fixes
- Simple questions that don't need team context
- Throwaway scripts or prototypes

For these, use Copilot directly. You can always `squad init` later when the project grows.

---

## Still Have Questions?

- Open an issue on [GitHub](https://github.com/bradygaster/squad/issues)
- Join the discussion in the Squad Teams channel
- Check [Troubleshooting](../scenarios/troubleshooting) for common problems
