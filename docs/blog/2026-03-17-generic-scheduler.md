---
title: "Generic Scheduler: Unified Task Orchestration"
date: 2026-03-17
author: "Squad (Copilot)"
wave: null
tags: [squad, scheduler, automation, cron, tasks]
status: published
hero: "Stop scattering cron jobs, polling scripts, and manual triggers. Define all recurring squad tasks in one place and let Squad run them locally or on GitHub Actions."
---

# Generic Scheduler: Unified Task Orchestration

> _One config file. Local polling or GitHub Actions. Cron, interval, event-driven, or startup triggers. Squad runs your tasks reliably._

## The Problem

Squads need to run recurring tasks:
- Ralph monitors work every 5 minutes
- Upstream sync runs every 6 hours
- Daily reports generate at 9am
- Deployment notifications trigger on push

Today, these are scattered across different systems:
- Some use `cron` on a local machine (breaks if machine stops)
- Some use GitHub Actions (hard to run locally, different syntax)
- Some use custom polling scripts (duplicated logic everywhere)
- Some are manual (easy to forget)

No unified way to orchestrate, monitor, or test.

## How It Works

### One Config, Two Runtimes

Define your schedule once in `.squad/schedule.json`:

```json
{
  "schedules": [
    {
      "id": "ralph-heartbeat",
      "trigger": { "type": "interval", "intervalSeconds": 300 },
      "task": { "type": "script", "command": "squad ralph watch --duration 25s" },
      "providers": ["local-polling", "github-actions"]
    }
  ]
}
```

Run it **locally**:
```bash
squad schedule watch
```

Or **in GitHub Actions** (auto-generated):
```bash
squad schedule init-ci
```

Same config, both runtimes work.

## Real-World Example

### A Squad's Daily Routine

**Morning**: Deploy latest code
```json
{
  "id": "deploy-staging",
  "trigger": { "type": "cron", "expression": "0 8 * * MON-FRI" },
  "task": { "type": "workflow", "ref": ".github/workflows/deploy-staging.yml" },
  "providers": ["github-actions"]
}
```

**Every hour**: Check upstream for updates
```json
{
  "id": "sync-upstream",
  "trigger": { "type": "cron", "expression": "0 * * * *" },
  "task": { "type": "script", "command": "squad upstream sync" },
  "providers": ["github-actions"]
}
```

**Every 5 minutes**: Monitor work queue (local only)
```json
{
  "id": "ralph-heartbeat",
  "trigger": { "type": "interval", "intervalSeconds": 300 },
  "task": { "type": "script", "command": "squad ralph watch --duration 25s" },
  "providers": ["local-polling"]
}
```

**At startup**: Initialize metrics
```json
{
  "id": "init-metrics",
  "trigger": { "type": "startup" },
  "task": { "type": "script", "command": "mkdir -p .squad/metrics" },
  "providers": ["local-polling"]
}
```

### Workflow

**Morning at 8am**:
- GitHub Actions triggers `deploy-staging`
- Deployment completes, logs available in GitHub UI

**Throughout the day**:
- Every hour, `sync-upstream` runs to check for parent changes
- Every 5 minutes (if you're running `squad schedule watch`), Ralph checks work

**Failure scenario**:
- A sync attempt fails (network issue)
- Scheduler waits 30 seconds (backoff)
- Retries automatically
- Logs to `.squad/.schedule-state.json`

## Trigger Types

### Interval
Run every N seconds:
```json
{ "type": "interval", "intervalSeconds": 300 }  // Every 5 minutes
```

### Cron
Standard cron syntax:
```json
{ "type": "cron", "expression": "0 8 * * MON-FRI" }  // 8am Mon-Fri
```

Common patterns:
- `"0 * * * *"` — Every hour
- `"0 0 * * *"` — Daily at midnight
- `"0 */6 * * *"` — Every 6 hours
- `"*/5 * * * *"` — Every 5 minutes (GitHub Actions only)

### Event
Run when something happens:
```json
{ "type": "event", "eventName": "session:complete" }
```

Built-in events:
- `session:start` — Squad initializes
- `session:complete` — Squad finishes
- `agent:milestone` — Agent reaches checkpoint
- `error:uncaught` — Error occurs

### Startup
Run once when squad initializes:
```json
{ "type": "startup" }
```

## Task Types

### Script
Run a shell command:
```json
{ "type": "script", "command": "squad upstream sync --auto-pr" }
```

### Workflow
Trigger a GitHub Actions workflow:
```json
{ "type": "workflow", "ref": ".github/workflows/daily-report.yml", "inputs": { "format": "markdown" } }
```

### Copilot
Run a Copilot agent task:
```json
{ "type": "copilot", "agent": "ralph", "prompt": "summarize work status" }
```

### Webhook
POST to a URL:
```json
{ "type": "webhook", "url": "https://api.example.com/hooks/squad-task", "method": "POST" }
```

## Providers

### Local Polling
Run in-process when you run `squad schedule watch`:
```json
{ "providers": ["local-polling"] }
```

Best for development and testing. Runs until you stop it.

### GitHub Actions
Automatically generate GitHub Actions workflows:
```json
{ "providers": ["github-actions"] }
```

Best for production. Runs 24/7 on GitHub's infrastructure. Squad generates `.github/workflows/schedule-{id}.yml` files.

## Configuration Reference

```json
{
  "schedules": [
    {
      "id": "unique-identifier",
      "name": "Human-readable name",
      "description": "What this task does",
      "enabled": true,
      "trigger": {
        "type": "interval|cron|event|startup",
        ...
      },
      "task": {
        "type": "script|workflow|copilot|webhook",
        ...
      },
      "providers": ["local-polling", "github-actions"],
      "retry": {
        "maxRetries": 2,
        "backoffSeconds": 5
      },
      "tags": ["monitoring", "core"],
      "timeout": 300
    }
  ]
}
```

## Monitoring

Check schedule status anytime:
```bash
squad schedule status
```

Output shows:
- Last run time and result
- Next scheduled run time
- Total runs and failure count
- Current status (running, waiting, error)

View detailed logs:
```bash
squad schedule logs ralph-heartbeat
```

## Error Handling

Schedules include configurable retry:

```json
{
  "retry": {
    "maxRetries": 2,
    "backoffSeconds": 5
  }
}
```

On failure:
1. Wait 5 seconds (backoff)
2. Retry attempt 1
3. Wait 10 seconds (exponential backoff)
4. Retry attempt 2
5. If still failing, log error and continue

## Use Cases

### Monitoring
```bash
squad schedule init ralph-monitor --trigger interval:300
```

Ralph checks work every 5 minutes.

### CI/CD Integration
```bash
squad schedule init deploy --trigger "cron:0 8 * * *" --task workflow:.github/workflows/deploy.yml
```

Deploy every morning at 8am.

### Syncing
```bash
squad schedule init sync-upstream --trigger "cron:0 * * * *" --providers github-actions
```

Sync from parent every hour (GitHub Actions only).

### Notifications
```bash
squad schedule init slack-report --trigger "cron:0 9 * * MON-FRI" --task webhook:https://hooks.slack.com/...
```

Send daily standup to Slack on weekday mornings.

## See Also

- [Persistent Ralph](/features/persistent-ralph) — Monitor agent activity
- [Upstream Auto-Sync](/features/upstream-sync) — Sync squads on schedule
- [Cross-Squad Orchestration](/features/cross-squad-orchestration) — Delegate recurring work
