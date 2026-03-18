# Persistent Ralph

**Try this to see what agents are working on:**
```
Ralph, show me current work status
```

**Try this to check for stale sessions:**
```
Ralph, who's been idle the longest?
```

**Try this to get a summary:**
```
Ralph, summarize squad activity in the last hour
```

Ralph now runs continuously with persistent state. Track agent activity trends, detect stuck processes, and maintain squad health 24/7.

---

## What Persistent Ralph Does

Ralph evolved from an ephemeral monitor to a **persistent, stateful squad guardian**:

1. **Continuous Monitoring** — Ralph runs 24/7 via GitHub Actions heartbeat
2. **State Persistence** — Session data survives restarts and crashes
3. **Activity Tracking** — Know what each agent is working on, when they start/stop
4. **Stale Detection** — Automatically flag idle or hung processes
5. **Trend Analysis** — Understand squad productivity over time

## Quick Start

### Enable Persistent Monitoring

Ralph runs automatically once enabled. To check status:

```bash
Ralph, show squad status
```

Ralph reports:
- Active agents and their tasks
- Last activity timestamp for each
- Issues or blockers detected
- Recommended next actions

### Add Heartbeat Cron

Enable Ralph's background heartbeat:

```bash
squad schedule init ralph-heartbeat --trigger interval:300
```

This adds a 5-minute polling cycle to `.squad/schedule.json`. Ralph checks:
- All active sessions
- Agent health
- Pending work
- Blocker status

Commit the schedule:
```bash
git add .squad/schedule.json
git commit -m "Enable Ralph heartbeat"
```

### Check Session History

See what agents have done:

```bash
Ralph, show me sessions from the last 24 hours
```

Output:
```
Session 1 (9:30 AM - 10:15 AM, 45 min)
  Agent: copilot-data
  Task: Refactor user model
  Status: Completed
  PRs: 1 (merged)

Session 2 (10:20 AM - still running, 15 min)
  Agent: copilot-platform
  Task: Add caching layer
  Status: In Progress
  Blockers: Waiting for review

Session 3 (8:30 AM - 8:45 AM, 15 min)
  Agent: copilot-docs
  Task: Update API docs
  Status: Completed
  Changes: 12 files
```

## Configuration

Ralph's persistent state is stored in `.squad/.ralph-state.json`:

```json
{
  "monitor": {
    "healthCheckInterval": 30000,
    "staleSessionThreshold": 300000,
    "lastCheck": "2026-03-17T14:30:00Z",
    "status": "healthy"
  },
  "sessions": [
    {
      "id": "session-123",
      "agentName": "copilot-data",
      "status": "working",
      "startedAt": "2026-03-17T14:25:00Z",
      "lastActivity": "2026-03-17T14:29:50Z",
      "currentTask": "Optimize database queries",
      "milestones": ["analyzed schema", "drafted plan"],
      "output": "Found 3 expensive queries..."
    }
  ]
}
```

Add to `.squad/config.json` to customize:

```json
{
  "ralph": {
    "healthCheckInterval": 30000,
    "staleSessionThreshold": 300000,
    "persistenceEnabled": true
  }
}
```

- **healthCheckInterval**: Check health every N ms (default: 30 seconds)
- **staleSessionThreshold**: Mark session stale after N ms idle (default: 5 minutes)
- **persistenceEnabled**: Save state to disk (default: true)

## How It Works

### Lifecycle

1. **Session Starts** → Ralph registers the session, records start time
2. **Agent Works** → Ralph observes milestones, progress checkpoints
3. **Agent Idles** → After 5 minutes of no activity, Ralph flags as "idle"
4. **Session Ends** → Ralph archives the session with final status
5. **Trend Analysis** → Ralph aggregates historical data

### Event Tracking

Ralph subscribes to agent lifecycle events:

- `session:created` — Agent started working
- `session:milestone` — Agent reached a checkpoint (e.g., "files analyzed", "tests passing")
- `session:error` — Agent encountered an error
- `session:destroyed` — Agent finished or crashed

Example session with milestones:
```
Session: squad-copilot-data (14:25 - 14:42)
├─ 14:25:00 session:created
├─ 14:26:15 session:milestone "dependencies analyzed"
├─ 14:28:30 session:milestone "tests written"
├─ 14:30:00 session:milestone "refactoring started"
├─ 14:40:45 session:milestone "all tests passing"
└─ 14:42:00 session:destroyed (success)
```

### Stale Detection

Ralph tracks inactivity:

```
Session: squad-copilot-platform (10:00 - still running)
├─ Last activity: 11:45 (25 minutes ago)
├─ Status: STALE (no activity since 11:30 threshold)
├─ Likely causes: hung process, waiting for input, network issue
└─ Recommendation: Check logs, consider restart
```

## Health Checks

Ralph performs periodic health checks every 30 seconds:

```bash
Ralph, show health status
```

Output:
```
Ralph Health Status (as of 14:35:00)

Monitor: Healthy
├─ Uptime: 2h 15m
├─ Last Check: 30 seconds ago
└─ Issues: None

Active Sessions: 3
├─ copilot-data (30m) - Working on user model
├─ copilot-platform (5m) - Starting caching task
└─ copilot-docs (2m) - Updating API docs

Idle Sessions: 1
├─ copilot-test (45m idle) - STALE - Consider restart

Completed Sessions (today): 12
├─ Success: 11
└─ Error: 1
```

## Persistent Heartbeat

Ralph's background heartbeat is defined in `.squad/schedule.json`:

```json
{
  "id": "ralph-heartbeat",
  "name": "Ralph Health Monitor",
  "trigger": { "type": "interval", "intervalSeconds": 300 },
  "task": { "type": "script", "command": "squad ralph watch --duration 25s" },
  "providers": ["local-polling", "github-actions"],
  "retry": { "maxRetries": 1, "backoffSeconds": 10 }
}
```

This runs:
- **Locally**: Every 5 minutes while you're working (via `squad schedule watch`)
- **In GitHub Actions**: Every 5 minutes 24/7 (via generated workflow)

## Use Cases

### Detect Hung Agents

Ralph flags an agent that hasn't produced output in 5 minutes:

```
Session: copilot-linter (14:00 - still running)
└─ STALE for 15 minutes
   Recommendation: Check CPU, kill process, and restart
```

### Trend Analysis

See what the squad was productive on:

```bash
Ralph, summarize productivity for week
```

```
Week of Mar 10-16:

Total Sessions: 45
Success Rate: 96%
Avg Duration: 28 min
Most Productive Day: Thursday (9 sessions)

Top Tasks:
1. Writing tests (18%)
2. Refactoring (22%)
3. Docs (12%)
4. Performance (10%)
5. Bugs (5%)

Trends:
- Tests passing rate: 95% (↑ from 88%)
- Avg PR size: 180 lines (stable)
- Time to merge: 2.1h (↓ from 3.2h)
```

### Squad Health Dashboard

As part of Ralph's monitoring:

```bash
Ralph, show squad health
```

```
Squad Health: 92% (Excellent)

Active Contributors: 4
├─ copilot-data: 35% productivity
├─ copilot-platform: 28%
├─ copilot-docs: 22%
└─ copilot-infra: 15%

Blockers: 2
├─ PR #142 (waiting 6h for review)
└─ Issue #89 (stale, assigned to nobody)

Work Queue:
├─ Ready: 8 issues
├─ In Progress: 5 issues
├─ Blocked: 2 issues
```

## Data Retention

Ralph persists state to:
- `.squad/.ralph-state.json` — Current state and session history
- `.squad/.ralph-archive/` — Historical snapshots (weekly)

Archive format:
```
.squad/.ralph-archive/
├─ 2026-03-10.json (week of Mar 3-9)
├─ 2026-03-17.json (week of Mar 10-16)
└─ 2026-03-24.json (week of Mar 17-23)
```

View historical data:
```bash
Ralph, show activity for week of March 10
```

## Multi-Platform Support

Ralph now detects the platform and adapts:

### GitHub
- Pulls CI status from GitHub Actions
- Monitors PR reviews and comments
- Integrates with GitHub Issues

### Azure DevOps
- Tracks work item status
- Monitors pipeline builds
- Integrates with ADO backlog

### Planner
- Tracks task progress
- Monitors plan status
- Integrates with Planner tasks

Ralph adjusts its monitoring based on what platform the squad uses.

## See Also

- [Generic Scheduler](/features/generic-scheduler) — Schedule Ralph's heartbeat
- [Upstream Auto-Sync](/features/upstream-sync) — Ralph can monitor sync status
- [Cross-Squad Orchestration](/features/cross-squad-orchestration) — Ralph tracks delegation status
