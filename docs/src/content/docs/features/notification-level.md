# Notification Level

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to silence empty rounds:**
```
squad watch --notify-level important
```

**Try this to see everything (debugging):**
```
squad watch --notify-level all
```

**Try this in config for persistent setting:**
```json
{ "watch": { "notifyLevel": "important" } }
```

When `squad watch` runs continuously, it prints a board report after every round. In production setups where output is forwarded to Teams, Slack, or email, this creates noise — hundreds of "Round N" messages with no useful content when the board is clear.

---

## Notify Levels

| Level | Behavior | When to use |
|-------|----------|-------------|
| `important` | Only print rounds with actual work items | **Default.** Best for production/Teams channels |
| `all` | Print every round, including empty ones | Debugging. Old behavior before this feature |
| `none` | Suppress all round output | Headless/CI — only errors matter |

## Machine and Repo Attribution

Every round header now includes the machine hostname and repo name:

```
🔄 Ralph — Round 5 (CPC-tamir-WCBED · my-project)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔴 Untriaged:         2
  🟢 Ready to merge:    1
```

This tells you **where** the message came from — which machine and which repo — so when multiple watch instances report to the same Teams channel, you can distinguish them.

## Configuration

### CLI flag (per-run)

```bash
squad watch --notify-level important    # default
squad watch --notify-level all          # old behavior
squad watch --notify-level none         # silent
```

### Config file (persistent)

In `.squad/config.json`:

```json
{
  "watch": {
    "notifyLevel": "important",
    "interval": 10,
    "execute": true
  }
}
```

Config file settings are overridden by CLI flags when both are present.

## What Counts as "Important"

A round is considered important (and reported) when **any** board counter is non-zero:

- Untriaged issues
- Assigned but unstarted work
- Draft PRs
- Changes requested on PRs
- CI failures
- PRs needing review
- PRs ready to merge
- Issues executed this round

If all counters are zero, the round is silent in `important` mode.

## See Also

- [Ralph — Work Monitor](/docs/features/ralph) — full Ralph documentation
- [Watch capabilities](/docs/features/ralph#watch-mode) — how squad watch works
