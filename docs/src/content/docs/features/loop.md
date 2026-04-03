# Loop — Prompt-driven work loop

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to initialize a loop:**
```
squad loop --init
```

**Try this to run your loop:**
```
squad loop
```

**Try this with monitoring:**
```
squad loop --monitor-email --monitor-teams
```

Loop reads a `loop.md` prompt file and runs it as a continuous work loop. No GitHub issues needed — the prompt is the work driver. Each cycle, Loop sends the prompt to Copilot, collects the work, and loops again at your chosen interval.

---

## What loop does

Loop is a prompt-driven work engine. Unlike Ralph (which routes GitHub issues to team members), Loop takes a **single `.md` file** with a prompt and your work directives, then runs that prompt continuously.

The `loop.md` file contains:

- **Frontmatter** — configuration (how often to loop, timeout, whether you've set up the loop)
- **Prompt** — the actual work driver (what Copilot should do each cycle)

When you run `squad loop`, it:

1. Reads `loop.md`
2. Checks that frontmatter is marked `configured: true`
3. Sends the prompt to Copilot
4. Collects the output (work done, decisions made, artifacts created)
5. Waits for the interval
6. Repeats

**Why use Loop instead of Ralph?**

- **No issue queue** — You drive the work with a prompt, not GitHub labels
- **Continuous** — One cycle after another, forever (or until you stop it)
- **Lightweight** — One file to maintain, no routing rules or complex setup
- **Flexible** — Mixed modes (team work queue + monitoring), repeated tasks (watch a folder, check metrics, cleanup jobs)

## Prerequisites

Loop requires:

- **GitHub CLI (`gh`)** — for authentication and GitHub integration (optional, but recommended)
- **Copilot CLI access** — to send prompts to Copilot
- **A `loop.md` file** — the prompt file that drives your work

## Getting started

### Step 1: Initialize your loop

```bash
squad loop --init
```

This creates a starter `loop.md` file in your project root:

```markdown
---
configured: false
interval: 10
timeout: 30
---

# Work Loop Prompt

You are a team member on this squad. Each cycle, you will:

1. Check for pending work
2. Complete what you can within the timeout
3. Document your results

Start with small, focused tasks. Expand the scope once you're confident the loop is working.
```

### Step 2: Edit `loop.md`

Update the prompt to describe the work you want done each cycle:

```markdown
---
configured: false
interval: 10
timeout: 20
description: "Monitor and fix failing CI"
---

# CI Monitoring Loop

Each cycle, you will:

1. Check GitHub Actions workflows for failures in the main branch
2. If any workflow failed in the last 10 minutes, investigate the failure
3. If it's a flaky test, flag it
4. If it's a real issue, create a PR with a fix
5. Report findings (failures found, fixes created, flaky tests)

Keep runs focused — 20 minutes max per cycle.
```

### Step 3: Enable the loop

Set `configured: true` in the frontmatter to unlock the loop:

```markdown
---
configured: true
interval: 10
timeout: 20
description: "Monitor and fix failing CI"
---
```

### Step 4: Run the loop

```bash
squad loop
```

Loop will run your prompt every 10 minutes until you press Ctrl+C.

## Frontmatter reference

The YAML frontmatter at the top of `loop.md` controls Loop's behavior:

| Field | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| `configured` | boolean | Yes | `false` | Safety check — must be `true` to run. Prevents accidental execution of incomplete loops. |
| `interval` | number | No | `10` | Minutes between cycles. Loop will wait this long after each cycle completes before running again. |
| `timeout` | number | No | `30` | Max runtime in minutes for each cycle. If Copilot doesn't finish within this time, the cycle is marked incomplete and the next cycle starts. |
| `description` | string | No | `""` | Human-readable description of what this loop does. Shown in logs and status. |

Example:

```markdown
---
configured: true
interval: 15
timeout: 45
description: "Process inbox and clean up stale branches"
---
```

## Writing a good loop prompt

A good loop prompt is:

- **Specific** — Clear about what work to do each cycle
- **Bounded** — Doesn't try to do everything at once; respects the timeout
- **Observable** — Reports what it did so you can track progress
- **Idempotent** — Safe to run repeatedly; doesn't duplicate work or corrupt state

### Example: Team work queue

```markdown
---
configured: true
interval: 5
timeout: 15
description: "Process team work queue from Teams"
---

# Team Work Queue

Each cycle:

1. Query our Teams channel for pending action items (messages with 🎯 emoji)
2. For each item, create a GitHub issue with label `teams:pending`
3. Triage to the right team member based on topic
4. Report how many items were added

Keep this quick — 15 minutes per cycle, process at most 3 items.
```

### Example: Monitoring and alerting

```markdown
---
configured: true
interval: 30
timeout: 20
description: "Monitor uptime and alert team"
---

# Uptime Monitor

Each cycle:

1. Check status.io for incidents on our services
2. Query monitoring dashboard for error rates
3. If any error rate > 5%, post alert to Teams #alerts channel
4. Report findings (status, error rates, alerts sent)

This is passive — no fixing, just reporting.
```

### Example: Mixed mode (queue + monitoring)

```markdown
---
configured: true
interval: 10
timeout: 30
description: "Work queue + monitoring + cleanup"
---

# Daily Squad Loop

Each cycle, in order:

1. **Monitor** — Check for CI failures, Dependabot alerts
2. **Triage** — Create issues for alerts
3. **Work** — Claim the next issue from the backlog
4. **Cleanup** — Delete stale feature branches older than 30 days
5. **Report** — Summary of work, alerts, deletions

Budget: 30 minutes per cycle. Start with most urgent work, drop to less urgent if running tight on time.
```

## Composing with capabilities

Loop works with Squad's monitoring and bridge capabilities. Add flags to extend what Loop can see and do:

```bash
# Monitor email for actionable items each cycle
squad loop --monitor-email

# Monitor Teams for action items each cycle
squad loop --monitor-teams

# Both email and Teams
squad loop --monitor-email --monitor-teams

# Enable self-pull (fetch latest code before each cycle)
squad loop --self-pull

# Combine multiple capabilities
squad loop --monitor-email --monitor-teams --self-pull
```

When enabled, these capabilities are available inside your loop prompt as context. For example, with `--monitor-email`, your prompt can reference email alerts and action items.

## CLI reference

All `squad loop` flags:

| Flag | Type | Description | Example |
|------|------|-------------|---------|
| `--init` | boolean | Create a starter `loop.md` file | `squad loop --init` |
| `--file <path>` | string | Path to loop file (default: `loop.md`) | `squad loop --file scripts/monitor.md` |
| `--interval <N>` | number | Override loop interval in minutes | `squad loop --interval 3` |
| `--timeout <N>` | number | Override cycle timeout in minutes | `squad loop --timeout 60` |
| `--copilot-flags "..."` | string | Pass extra flags to Copilot CLI | `squad loop --copilot-flags "--model gpt-4"` |
| `--agent-cmd <cmd>` | string | Custom agent command (advanced) | `squad loop --agent-cmd my-agent-wrapper` |
| `--monitor-email` | boolean | Scan email for alerts each cycle | `squad loop --monitor-email` |
| `--monitor-teams` | boolean | Scan Teams for action items each cycle | `squad loop --monitor-teams` |
| `--self-pull` | boolean | Run `git fetch && git pull` before each cycle | `squad loop --self-pull` |

### Examples

**Basic loop:**
```bash
squad loop
```

**Custom loop file:**
```bash
squad loop --file scripts/cleanup.md
```

**Faster interval:**
```bash
squad loop --interval 3 --timeout 15
```

**With monitoring:**
```bash
squad loop --monitor-email --monitor-teams --self-pull
```

**Override frontmatter with CLI:**
```bash
squad loop --interval 2 --timeout 45
```

CLI flags override frontmatter values. If your `loop.md` says `interval: 10` but you run `squad loop --interval 3`, Loop uses 3 minutes.

## Configuration

Instead of command-line flags, you can configure Loop in `.squad/config.json`:

```json
{
  "loop": {
    "interval": 10,
    "timeout": 30,
    "file": "loop.md",
    "monitorEmail": true,
    "monitorTeams": false,
    "selfPull": true,
    "copilotFlags": "--model gpt-4"
  }
}
```

Resolution order (first match wins):

1. CLI flags (`--interval 10`)
2. `.squad/config.json` `loop` section
3. `loop.md` frontmatter
4. Defaults (interval: 10, timeout: 30)

## Notes

- Loop is session-scoped — it runs in your terminal and stops when you press Ctrl+C
- Each cycle gets its own Copilot session; state is not preserved between cycles unless your prompt explicitly handles it
- Loop respects `.squad/` team context: charters, routing, decisions, and directives are all available to the prompt
- For fully unattended monitoring, use `squad watch` instead — it's designed for running in a separate terminal 24/7
