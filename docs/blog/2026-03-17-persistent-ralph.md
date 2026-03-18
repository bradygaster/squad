---
title: "Persistent Ralph: Monitor Squad Health 24/7"
date: 2026-03-17
author: "Squad (Copilot)"
wave: null
tags: [squad, ralph, monitoring, health, state, persistence]
status: published
hero: "Ralph evolved from ephemeral monitor to persistent guardian. Track agent activity 24/7, detect stale sessions, and maintain squad health with continuous state tracking."
---

# Persistent Ralph: Monitor Squad Health 24/7

> _Ralph now runs continuously with persistent state. Know what your agents are doing, detect problems early, and analyze squad productivity over time._

## The Problem

Ralph was great at snapshots: "Tell me what everyone's working on right now." But what about deeper questions?

- Which agents go idle the longest before restarting?
- What was the squad's productivity trend this week?
- Did an agent crash or intentionally stop?
- What do we spend most time on: features, bugs, or maintenance?

Ralph's ephemeral nature made these impossible. Each session died when Ralph stopped, erasing the history.

The squad needed a **persistent Ralph** that accumulates knowledge across cycles.

## How It Works

### Continuous Heartbeat

Ralph runs on a timer (default: every 5 minutes) via `.squad/schedule.json`:

```json
{
  "id": "ralph-heartbeat",
  "trigger": { "type": "interval", "intervalSeconds": 300 },
  "task": { "type": "script", "command": "squad ralph watch --duration 25s" },
  "providers": ["local-polling", "github-actions"]
}
```

This setup ensures:
- **Local development**: Ralph checks work when you run `squad schedule watch`
- **Production**: Ralph runs 24/7 via GitHub Actions cron job

### Persistent State

Ralph saves session data to `.squad/.ralph-state.json`:

```json
{
  "sessions": [
    {
      "id": "session-abc123",
      "agentName": "copilot-data",
      "status": "completed",
      "startedAt": "2026-03-17T09:30:00Z",
      "endedAt": "2026-03-17T10:15:00Z",
      "duration": 2700,
      "milestones": ["dependencies analyzed", "refactoring complete"],
      "task": "Optimize database queries",
      "result": "5 slow queries identified, 2 fixed"
    }
  ]
}
```

History survives:
- Restarts (data is on disk)
- Crashes (last known good state)
- Deployments (state persists across versions)

### Event Tracking

Ralph observes agent lifecycle events:

```
14:25:00  session:created (copilot-data starts)
14:26:15  agent:milestone "database schema analyzed"
14:28:30  agent:milestone "test suite written"
14:40:00  agent:milestone "performance improved 40%"
14:42:00  session:destroyed (copilot-data finishes)
```

These events accumulate into a permanent record.

## Real-World Scenario

### Day 1: Enable Persistent Ralph

```bash
squad schedule init ralph-heartbeat --trigger interval:300
git commit -m "Enable Ralph persistent monitoring"
git push
```

Ralph's heartbeat deploys. Every 5 minutes, GitHub Actions runs `squad ralph watch`.

### Day 2: Monitor Work

Ralph observes:
- Agent 1: 45 min session, completed feature
- Agent 2: 10 min session, fixed bug
- Agent 3: 60 min session, refactored tests
- Agent 4: 5 min session, updated docs

State saved to `.squad/.ralph-state.json`.

### Day 5: Ask Historical Questions

```bash
Ralph, show me productivity for the last 3 days
```

Ralph queries the persistent state:
```
Mar 15: 8 sessions, 4 completed (50%), 2 blocked, 2 stale
Mar 16: 12 sessions, 10 completed (83%), 1 blocked, 1 error
Mar 17: 6 sessions (so far), 5 completed (83%), 0 blocked
```

Trend: Productivity improving, fewer stale sessions.

```bash
Ralph, what's taking the most time?
```

Ralph aggregates all sessions:
```
Top Activities (by total time):
1. Writing/updating tests (34%)
2. Refactoring (22%)
3. Documentation (18%)
4. Performance work (15%)
5. Bug fixes (11%)
```

## Architecture

### Three Layers of Ralph

Ralph now operates at three layers:

**Layer 1: Event Listener** (always on)
- Subscribes to agent lifecycle events
- Records start, milestones, stop
- Writes to `.squad/.ralph-state.json`

**Layer 2: Health Monitor** (periodic)
- Runs every 30 seconds
- Checks for stale sessions (no activity > 5 min)
- Checks for hung processes
- Logs warnings and alerts

**Layer 3: Trend Analyzer** (on-demand)
- Called when you ask questions like "show me productivity"
- Aggregates historical data
- Computes trends and patterns

All three layers are now fully operational.

## Configuration

Customize Ralph in `.squad/config.json`:

```json
{
  "ralph": {
    "healthCheckInterval": 30000,
    "staleSessionThreshold": 300000,
    "persistenceEnabled": true,
    "archiveDaily": true,
    "maxHistoryDays": 90
  }
}
```

- **healthCheckInterval**: How often to check for stale sessions (default: 30s)
- **staleSessionThreshold**: Mark idle after N milliseconds (default: 5 min)
- **persistenceEnabled**: Save state to disk (default: true)
- **archiveDaily**: Roll over to archive every day (default: true)
- **maxHistoryDays**: Keep history for N days (default: 90 days)

## Stale Detection

Ralph automatically flags idle agents:

```
Agent: copilot-platform
├─ Last Activity: 10 minutes ago
├─ Status: STALE
└─ Recommendation: Check if hung or waiting for input
```

Ralph checks every 30 seconds and logs:
- What was the agent doing last?
- How long has it been idle?
- Is the process still running?
- Suggested next steps

## Multi-Platform Awareness

Ralph now adapts to your platform:

### GitHub Native
```bash
Ralph, show me GitHub Actions run history
```
Ralph queries: GitHub CI status, PR reviews, action timings

### Azure DevOps Native
```bash
Ralph, show me pipeline builds
```
Ralph queries: ADO pipeline status, work item updates, build timings

### Planner Native
```bash
Ralph, show me Planner task progress
```
Ralph queries: Task status, plan updates, assignments

Ralph auto-detects your platform and adapts its monitoring.

## Use Cases

### Debug Productivity

```bash
Ralph, why did we ship 3 fewer features this week?
```

Ralph analyzes data:
```
Work Breakdown This Week:
- Features: 2 (vs. 5 last week) ↓60%
- Tests: 4 (vs. 2 last week) ↑100%
- Bugs: 6 (vs. 3 last week) ↑100%

Likely cause: Increased test coverage effort + more bugs reported.
```

### Optimize Workflows

```bash
Ralph, what's slowing down our PRs?
```

Ralph finds:
```
Average PR Cycle: 4.2 hours

Breakdown:
- Author writes PR: 45 min ✓
- Waiting for review: 2.5 hours ⚠️ (60% of time!)
- Review feedback: 30 min ✓
- Fixes & re-review: 20 min ✓
- Merge: 5 min ✓

Recommendation: Faster reviewer turnaround = biggest gain.
```

### Capacity Planning

```bash
Ralph, show me utilization this month
```

Ralph reports:
```
Average Sessions per Day: 8
Average Session Duration: 35 min
Total Productive Hours: 47 hours
Team Capacity (5 agents × 8h): 40 hours

Utilization: 118% (some overlap/parallelism)
```

### Spot Trends

```bash
Ralph, have we gotten faster at writing tests?
```

Ralph shows:
```
Test Writing Trend (30-day window):
- Week 1: 45 min per test file
- Week 2: 42 min per test file
- Week 3: 38 min per test file ↓ (16% improvement)
- Week 4: 37 min per test file ↓ (staying efficient)

Conclusion: Better, stable at ~38 min per file.
```

## Data Format

Historical data structure:

```json
{
  "monitor": {
    "startedAt": "2026-03-10T00:00:00Z",
    "lastHealthCheck": "2026-03-17T14:30:00Z",
    "uptime": 604800,
    "status": "healthy"
  },
  "sessions": [
    {
      "id": "session-123",
      "agentName": "copilot-data",
      "task": "Refactor user model",
      "status": "completed",
      "startedAt": "2026-03-17T09:30:00Z",
      "endedAt": "2026-03-17T10:15:00Z",
      "duration": 2700,
      "milestones": [
        { "time": "2026-03-17T09:31:00Z", "label": "schema analyzed" },
        { "time": "2026-03-17T10:00:00Z", "label": "tests written" }
      ]
    }
  ]
}
```

## Archival

By default, Ralph archives weekly:

```
.squad/.ralph-archive/
├─ 2026-03-10-archive.json  (week of Mar 3-9)
├─ 2026-03-17-archive.json  (week of Mar 10-16)
└─ 2026-03-24-archive.json  (week of Mar 17-23)
```

Archives are never deleted (until `maxHistoryDays` expires). Query any week:

```bash
Ralph, show me productivity for week of March 10
```

## See Also

- [Generic Scheduler](/features/generic-scheduler) — Schedule Ralph's heartbeat
- [Upstream Auto-Sync](/features/upstream-sync) — Ralph monitors sync status
- [Cross-Squad Orchestration](/features/cross-squad-orchestration) — Ralph tracks delegation
