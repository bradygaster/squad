---
'@bradygaster/squad-cli': minor
---

feat(watch): schedule capability — run due tasks from schedule.json during watch rounds

Adds a `ScheduleCapability` to the watch command that evaluates `.squad/schedule.json`
each round and runs due local-polling tasks (cron, interval, startup triggers).

Enable via `.squad/config.json`:
```json
{ "watch": { "schedule": true } }
```

Features:
- Runs in `pre-scan` phase so scheduled work can affect triage
- Only executes tasks with `local-polling` provider
- Stale `running` state recovery (5-min threshold)
- Configurable `maxPerRound` to cap executions per cycle
- Validates manifest at preflight (fails early on bad JSON)
