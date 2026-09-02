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
squad nap --dry-run --json  # Measure reclaimable context with structured output
```

In the interactive shell, use `/compact` for the same effect.

`squad nap --dry-run --json` is the safest way to answer "how much context can we reclaim?" It reports before/after metrics and planned actions without modifying files, so tests and CI can assert real numbers instead of relying on estimates.

Nap also measures loaded-context sources that affect every agent spawn: `charterBytes`, `skillBytes` for markdown under `.squad/skills/`, `charterReducibleBytes` above the 1.5 KB per-charter reskill target, and `historyReducibleBytes` above the 8 KB per-history target. It measures charters and skills, but it never modifies them. Charters define agent identity; automated charter rewriting is not part of nap.

---

## Reskill

**What it does:** Tells agents to audit measured context, re-examine skills, validate them against the current codebase, and potentially discover new patterns.

When you tell the team to "reskill," agents:

1. Start from `squad nap --dry-run --json` to get measured context numbers
2. Review skill files in `.copilot/skills/` and legacy `.squad/skills/`
3. Validate that documented patterns still apply
4. Look for new reusable patterns from recent work
5. Update skill confidence levels based on current evidence

The nap metrics give reskill a concrete audit baseline: how much agent-loaded context exists, what nap would change, and which charter or history bytes sit above the documented reskill targets. Reskill can use those numbers to guide recommendations, but nap still does not rewrite charters or skills.

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
- **Check the dry run first.** Use `squad nap --dry-run` to preview cleanup actions. The report is clearly labeled `DRY RUN — no files were modified`; add `--json` when you need structured metrics.

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

Previews what a nap would clean up without making any changes, with an explicit dry-run banner.
