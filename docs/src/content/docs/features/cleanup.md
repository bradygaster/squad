# Cleanup Watch

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to trigger a cleanup cycle:**
```
squad watch --execute
```

**Try this to configure cleanup frequency:**
```json
{
  "cleanup": {
    "everyNRounds": 10,
    "maxAgeDays": 30
  }
}
```

Ralph runs automated housekeeping during `squad watch` to keep `.squad/` clean — clearing temp files, archiving old logs, and flagging stale decisions.

---

## What Gets Cleaned

### Scratch Directory

Clears all files in `.squad/.scratch/` — the ephemeral temp directory used for prompt files, commit drafts, and processing artifacts. These are temporary by design and safe to delete between sessions.

### Log Archives

Archives orchestration-log and session-log entries older than the configured `maxAgeDays` (default: 30 days):
- Orchestration logs (work dispatch, agent lifecycle)
- Session logs (Copilot session metadata)

Archived logs are moved to `.squad/logs/archive/{YYYY-MM}/` for long-term storage without cluttering active logs.

### Decision Inbox Warnings

Scans `.squad/decisions/inbox/` for files older than 7 days and warns you. Decision inbox files represent unmerged decisions — leaving them stale means the team's decision log is out of sync with actual project state.

```
⚠️  Stale decision inbox files detected:
    - inbox/auth-strategy-2025-01-15.md (12 days old)
    - inbox/api-versioning-2025-01-10.md (17 days old)

    Run: squad decisions merge
```

Cleanup doesn't auto-merge — it just warns. You decide when to merge.

---

## When Cleanup Runs

Cleanup runs during the **housekeeping phase** of `squad watch` — after all work is processed for the round, before the next polling interval. This happens every `N` rounds based on your config.

**Default behavior:**
- Cleanup runs every **10 rounds** of `squad watch`
- Archives logs older than **30 days**
- Warns about decision inbox files older than **7 days**

---

## Configuration

Add a `cleanup` section to your `.squad/config.json`:

```json
{
  "cleanup": {
    "everyNRounds": 10,
    "maxAgeDays": 30
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `everyNRounds` | number | 10 | Run cleanup every N watch rounds |
| `maxAgeDays` | number | 30 | Archive logs older than this many days |

**Examples:**

Run cleanup every 5 rounds, keep 60 days of logs:
```json
{
  "cleanup": {
    "everyNRounds": 5,
    "maxAgeDays": 60
  }
}
```

Run cleanup every round (aggressive), keep 14 days:
```json
{
  "cleanup": {
    "everyNRounds": 1,
    "maxAgeDays": 14
  }
}
```

---

## What Cleanup Does NOT Touch

- Earned skills in `.squad/skills/` — never deleted
- Decision log in `.squad/decisions/log.md` — never deleted
- Active session data
- Router state, team config, and other core Squad files

Cleanup is safe and conservative — it only removes temporary files and archives old logs. Core squad state is never touched.

---

## Manual Cleanup

You can manually trigger cleanup without running `squad watch`:

```bash
# Clean scratch dir only
rm -rf .squad/.scratch/*

# Archive old logs manually
squad logs archive --before 2025-01-01

# Merge stale decision inbox
squad decisions merge
```

---

## Notes

- Cleanup is **opt-in** — it only runs during `squad watch`, not in standalone Copilot sessions
- Cleanup logs are written to the orchestration log for audit trail
- Archived logs are still accessible but separated from active logs
- Decision inbox warnings are informational only — no auto-merge

---

## Sample Prompts

```
Ralph, run cleanup now
```

Triggers a cleanup cycle immediately (if Ralph is active in `squad watch`).

```
Show me what cleanup will do
```

Dry-run preview of cleanup actions without actually running them.

```
How often does cleanup run?
```

Reports the current `everyNRounds` setting from config.
