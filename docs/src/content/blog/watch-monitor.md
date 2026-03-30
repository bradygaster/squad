---
title: "From Triage Bot to Work Monitor"
date: 2026-03-30
author: "Brady"
tags: [squad, ralph, watch, work-monitor, automation, execution]
status: published
hero: "Ralph started as a label router that idled when the board was clear. Now he spawns Copilot sessions and actually does the work."
---

# From Triage Bot to Work Monitor

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _Ralph started as a label router that idled when the board was clear. Now he spawns Copilot sessions and actually does the work._

## What Changed

`squad watch` used to be a simple triage loop. Every N minutes, it would:

1. Fetch open issues with the `squad` label
2. Route them to team members based on routing rules
3. Add labels like `squad:eecom` or `squad:gnc`
4. Idle when done

That's it. Ralph was a label router — useful, but not autonomous. When the board cleared, Ralph just sat there waiting for humans to do the work.

**Issue #708 changed that.**

With `--execute`, Ralph transforms from a triage bot into a full work monitor. He doesn't just label issues — he spawns Copilot CLI sessions to actually work on them.

```bash
squad watch --execute --interval 15
```

This one flag turns Ralph from a watcher into a worker.

## The Unix Pipe Philosophy

The design follows the Unix philosophy: each flag is a composable feature that does one thing well.

- `--execute` → spawn Copilot sessions for actionable issues
- `--monitor-teams` → scan Teams messages via WorkIQ
- `--monitor-email` → scan email for alerts and action items
- `--board` → manage project board lifecycle (In Progress / Done / Blocked)
- `--two-pass` → lightweight scan, then hydrate only actionable issues
- `--wave-dispatch` → parallel sub-task execution within issues
- `--retro` → enforce retrospective checks (Fridays or >7 days)
- `--decision-hygiene` → auto-merge decision inbox when >5 files

Each flag is opt-in. Existing `squad watch` behavior is unchanged — triage only, no execution.

## Code Example: From Simple to Full Monitor

**Basic triage (original behavior):**
```bash
squad watch
```

**Add execution:**
```bash
squad watch --execute
```

**Add project board lifecycle:**
```bash
squad watch --execute --board
```

**Full monitor with all features:**
```bash
squad watch --execute \
  --board \
  --two-pass \
  --monitor-teams \
  --retro \
  --decision-hygiene \
  --max-concurrent 2 \
  --interval 15
```

## Architecture of a Round

When all features are enabled, each round follows this cycle:

1. **Self-pull**: `git fetch && git pull --ff-only` to stay current
2. **Scan**: Fetch open issues (two-pass if enabled: lightweight list → hydrate actionable only)
3. **Triage**: Label untriaged issues based on routing rules
4. **Execute**: Spawn Copilot sessions for actionable issues
   - Issues are actionable if: assigned to a squad member, not assigned to a human, and not blocked
   - Wave dispatch groups sub-tasks by dependency and runs them in parallel
   - Max concurrency controlled by `--max-concurrent N` (default: 1)
   - Each issue gets a timeout (`--timeout N` minutes, default: 30)
5. **Board**: Update project board status columns
   - Move claimed issues to "In Progress"
   - Move completed issues to "Done"
   - Reconcile mismatches (closed issues not in Done, open issues in Done)
6. **Monitor**: Scan Teams/email for new actionable items
   - Teams: query WorkIQ for action items, reviews, urgent requests
   - Email: query for CI failures, Dependabot alerts, security vulns
   - Create GitHub issues with bridge labels (`teams-bridge`, `email-bridge`)
7. **Housekeep**: Governance checks
   - Retro: if it's Friday after 14:00 UTC or last retro was >7 days ago, spawn a retro session
   - Decision hygiene: if `.squad/decisions/inbox/` has >5 files, spawn a merge session
8. **Report**: Log round summary, sleep until next interval

## Example Execution Output

```
🔄 Ralph — Round 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔴 Untriaged:         2
  🟡 Assigned:          5
  🚀 Executed:          3
  
▶ [14:23:10] Executing #42 "Fix auth redirect bug" → gh copilot --message "Work on issue #42..."
✓ [14:25:43] #42 completed

▶ [14:25:44] Executing #45 "Add retry logic" → gh copilot --message "Work on issue #45..."
✓ [14:28:20] #45 completed

▶ [14:28:21] Executing #47 "Update docs" → gh copilot --message "Work on issue #47..."
✗ [14:58:21] #47 failed: Timed out after 30m

[14:58:22] Two-pass: 15 total → 3 actionable (hydrated)
[14:58:23] Board: #42 → Done
[14:58:23] Board: #45 → Done
✓ [14:58:24] Teams monitor scan complete
✓ [14:58:25] Email monitor scan complete
[14:58:26] Round 1 complete — sleeping 15 minutes
```

## The Three Layers of Ralph

| Layer | When | How |
|-------|------|-----|
| **In-session** | You're at the keyboard | "Ralph, go" — active loop while work exists |
| **Local watchdog** | You're away but machine is on | `squad watch --execute` |
| **Cloud heartbeat** | Fully unattended | `squad-heartbeat.yml` GitHub Actions events |

The in-session loop is ephemeral — it lives only while the Copilot session is active. The local watchdog runs as a separate process and polls at your chosen interval. The cloud heartbeat is the fully unattended layer that triggers on GitHub events (issue close, PR merge, manual dispatch).

## Why This Matters

Before #708, Ralph was a coordinator. He routed work to team members but never picked up the tools himself.

Now, Ralph is a worker. He claims issues, posts comments, spawns Copilot sessions, manages the project board, scans Teams and email, and enforces governance checks.

This closes the gap between "someone triaged this issue" and "someone is working on this issue." Ralph doesn't just label the work — he starts it.

## What's Next

The next iteration will add:

- **SubSquad discovery**: automatically detect `.squad/subsquads/` for routing across multiple codebases
- **Channel routing**: route notifications to specific Teams channels based on work type
- **Multi-machine coordination**: distribute work across multiple Ralph instances

Ralph is no longer just a triage bot. He's a work monitor — and he's just getting started.

---

**Try it:**
```bash
squad watch --execute --interval 15
```

**Full feature set:**
```bash
squad watch --execute --board --two-pass --monitor-teams --retro --decision-hygiene --max-concurrent 2
```

---

_PR #709 · Issue #708 · Shipped 2026-03-30_
