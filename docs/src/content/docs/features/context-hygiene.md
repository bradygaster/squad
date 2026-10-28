# Context Hygiene: Nap, Reskill, and Compact

**Try this to compact your team's memory:**
```
Team, take a nap
```

**Try this to refresh agent skills:**
```
Team, reskill
```

**Try this to do both and report results:**
```
Team, reskill, take a nap, and let me know how much context you cleared out collectively for future iterations
```

Over multiple sessions, Squad's `.squad/` files grow — agent histories, decisions, skill files. Context hygiene commands let you actively manage that growth so agents stay fast and focused.

---

## Nap

**What it does:** `squad nap` makes `.squad/` files smaller so agents load less at spawn. It moves old content into archive files and deletes old logs. It does not summarize anything. In the Squad interactive shell (`squad` with no arguments), the same command is `/nap`. It is not the same as `/compact` in GitHub Copilot CLI, which shortens the current chat session and does not touch `.squad/` files.

A nap does four things:

1. **Agent histories.** Each `agents/{name}/history.md` over 15 KB keeps its `## Core Context` section and its last 5 other `##` sections (3 with `--deep`). Older `##` sections move word for word to `history-archive.md` in the same folder. Entries written as `###` headings under one `## Learnings` section count as one section, so they are not moved.
2. **Logs.** Files in `log/` and `orchestration-log/` older than 7 days are deleted.
3. **Decision inbox.** Files left in `decisions/inbox/` are appended to `decisions.md` and deleted.
4. **Decisions.** When `decisions.md` is over 20 KB, entries older than 30 days move to `decisions-archive.md`. If none are that old, the oldest dated entries move until the file fits. Undated entries always stay. Nap skips this step if git ignores the archive file and does not track it, because the move could never be committed.

It then reports how much space it reclaimed.

Summarizing is a separate job that an AI agent does: you can ask the coordinator to summarize a member's history. Scribe doesn't touch histories; its charter limits it to merging decisions. See [Memory & Knowledge](/squad/docs/concepts/memory-and-knowledge/).

"Team, take a nap" in a chat is a plain request to the coordinator. No built-in rule maps that phrase to `squad nap`, so the coordinator decides what to do. For predictable results, run `squad nap` yourself.

### Nap ≠ Shutting Down

This is the most common misconception:

| Action | What happens to `.squad/` files |
|--------|-------------------------------|
| **Shutting down Squad** (closing the CLI, killing the process) | Files stay exactly as they are. Nothing is summarized or compacted. |
| **Nap** (`squad nap`, or `/nap` in the Squad interactive shell) | Old history sections and old decisions move to archive files, and old logs are deleted. Nothing is summarized. |

Shutting down Squad every night does **not** perform context hygiene. Nap never runs on its own: run `squad nap` when you want it.

### CLI equivalents

```bash
squad nap              # Standard context hygiene
squad nap --deep       # Same, but keep only the last 3 history sections (default 5)
squad nap --dry-run    # Preview what would be cleaned up
```

In the Squad interactive shell, use `/nap` with the same flags. In GitHub Copilot CLI (`copilot --agent squad`), run `squad nap` from a terminal. Copilot CLI's own `/compact` shortens the chat session, not `.squad/` files.

---

## Reskill

**What it does:** Tells agents to re-examine their skills, validate them against the current codebase, and potentially discover new patterns.

When you tell the team to "reskill," agents:

1. Review existing skill files in `.copilot/skills/`
2. Validate that documented patterns still apply
3. Look for new reusable patterns from recent work
4. Update skill confidence levels based on current evidence

### Availability

> **Note:** As of now, reskill requires running Squad from source (via symlink). It is not yet available through `squad upgrade`. This will change in a future release.

---

## Combined Commands

You can trigger nap and reskill together in a single prompt:

```
Team, reskill, take a nap, and let me know how much context you cleared out collectively for future iterations
```

This runs both behaviors and gives you a report on how much context was reduced — useful for understanding how lean your team's working memory is before the next session.

---

## When to Use These

| Situation | Command |
|-----------|---------|
| After several work sessions, agents feel slow or unfocused | `team, take a nap` |
| Codebase has changed significantly and skills may be stale | `team, reskill` |
| Before a major new phase of work | Combine both |
| End of sprint / milestone | `squad nap --deep` |

---

## Tips

- **Nap regularly.** A few sessions of heavy work can bloat history files. Napping keeps context budgets in check.
- **Don't rely on shutdown.** Closing the CLI preserves files as-is — it does not compact anything.
- **Reskill after refactors.** If you've restructured the codebase, agent skills may reference outdated patterns.
- **Check the dry run first.** Use `squad nap --dry-run` to preview cleanup actions before committing to them.

## Sample Prompts

```
team, take a nap
```

Asks the coordinator to tidy the team's memory files. For a predictable result, run `squad nap`.

```
team, reskill
```

Agents re-examine and validate their skills against the current codebase.

```
team, reskill, take a nap, and let me know how much context you cleared out collectively for future iterations
```

Combines both behaviors and reports back on total context reduction.

```
squad nap --dry-run
```

Previews what a nap would clean up without making any changes.
