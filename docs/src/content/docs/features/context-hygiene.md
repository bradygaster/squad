# Context Hygiene: Nap, Reskill, and Compact

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


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

**What it does:** Summarizes accumulated work into smaller, more efficient memory files. This is the same as running `/compact` in the CLI or `squad nap` from the command line.

When you tell the team to "take a nap," each agent:

1. Reviews its `history.md` and other state files
2. Compresses older entries into concise summaries
3. Archives verbose detail while preserving key decisions and learnings
4. Reports how much context was reclaimed

### Nap ≠ Shutting Down

This is the most common misconception:

| Action | What happens to `.squad/` files |
|--------|-------------------------------|
| **Shutting down Squad** (closing the CLI, killing the process) | Files stay exactly as they are. Nothing is summarized or compacted. |
| **Nap** (`team, take a nap` or `squad nap`) | Files are actively summarized and compacted. Older entries are archived, working context gets leaner. |

Shutting down Squad every night does **not** perform context hygiene. You must explicitly tell the team to take a nap.

### CLI equivalents

```bash
squad nap              # Standard context hygiene
squad nap --deep       # Thorough cleanup with recursive descent
squad nap --dry-run    # Preview what would be cleaned up
```

In the interactive shell, use `/compact` for the same effect.

---

## Reskill

**What it does:** Tells agents to re-examine their skills, validate them against the current codebase, and potentially discover new patterns.

When you tell the team to "reskill," agents:

1. Review existing skill files in `.squad/skills/`
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

Compacts and summarizes all agent memory files, reclaiming context space.

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
