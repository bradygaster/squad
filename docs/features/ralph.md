# Ralph — Work Monitor

**Try this to see active work:**
```
Ralph, show me what everyone is working on
```

**Try this to identify blockers:**
```
Ralph, what's blocking progress on issue #42?
```

**Try this to auto-assign work:**
```
Ralph, assign the next high-priority issue
```

Ralph tracks the work queue, monitors CI status, and ensures the team never sits idle when there's work to do. He's always on the roster and requires GitHub CLI access.

---

## What Ralph Does

Ralph is a built-in squad member whose job is keeping tabs on work. Like Scribe tracks decisions, **Ralph tracks and drives the work queue**. He's always on the roster — not cast from a universe — and has one job: make sure the team never sits idle when there's work to do.

## Prerequisites

Ralph requires access to GitHub Issues and Pull Requests via the `gh` CLI. **A GitHub PAT (Personal Access Token) with Classic scope is required.**

### Why PAT Classic?

The default `GITHUB_TOKEN` provided by Copilot does not have sufficient scopes to read and write GitHub Issues and PRs. Ralph needs to:
- List and read issues
- Create and update issue labels and assignments
- Read and interact with pull requests
- Report on CI status

### Setup

1. **Create a PAT Classic token:**
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` and `project` (full access to repositories and projects)
   - Copy the token

2. **Authenticate with `gh`:**
   ```bash
   gh auth login
   ```
   - Select "GitHub.com"
   - Select "HTTPS" for protocol
   - When asked "Authenticate Git with your GitHub credentials?", answer "Yes"
   - Choose "Paste an authentication token" and paste your PAT Classic token

3. **Verify authentication:**
   ```bash
   gh auth status
   ```

Once authenticated, Ralph can monitor your repository's issues and PRs.

## How It Works

Once activated, Ralph continuously checks for pending work — open issues, draft PRs, review feedback, CI failures — and keeps the squad moving through the backlog without manual nudges.

### In-Session (Copilot Chat)

When you're in a Copilot session, Ralph self-chains the coordinator's work loop:

1. Agents complete a batch of work
2. Ralph checks GitHub for more: untriaged issues, assigned-but-unstarted items, draft PRs, failing CI
3. Work found → triage, assign, spawn agents
4. Results collected → Ralph checks again **immediately** — no pause, no asking permission
5. Board clear → Ralph enters **idle-watch** — polls every 10 minutes (configurable) for new work

**Ralph never stops on his own while work remains.** He keeps cycling through the backlog until every issue is closed, every PR is merged, and CI is green. When the board clears, Ralph doesn't fully stop — he enters idle-watch mode and periodically checks for new work. The only things that fully stop Ralph: you say "idle"/"stop", or the session ends.

### Between Sessions (GitHub Actions Heartbeat)

When no one is at the keyboard, the `squad-heartbeat.yml` workflow runs on a cron schedule (every 30 minutes by default). It:

- Finds untriaged `squad`-labeled issues
- Auto-triages based on team roles and issue keywords
- Assigns `squad:{member}` labels
- For `@copilot` (if enabled with auto-assign): assigns `copilot-swe-agent[bot]` so the coding agent picks up work autonomously

This creates a fully autonomous loop for `@copilot` — heartbeat triages → assigns → agent works → issue closed → heartbeat finds next issue → repeat.

## Talking to Ralph

| What you say | What happens |
|---|---|
| "Ralph, go" / "Ralph, start monitoring" | Activates the work-check loop |
| "Keep working" / "Work until done" | Activates Ralph |
| "Ralph, status" / "What's on the board?" | Runs one check cycle, reports results |
| "Ralph, check every N minutes" | Sets the idle-watch polling interval (e.g., "Ralph, check every 30 minutes") |
| "Ralph, idle" / "Take a break" | Fully stops the loop and idle-watch polling |
| "Ralph, scope: just issues" | Monitors only issues, skips PRs/CI |

## What Ralph Monitors

| Category | Signal | Action |
|---|---|---|
| **Untriaged issues** | `squad` label, no `squad:{member}` label | Lead triages and assigns |
| **Assigned issues** | `squad:{member}` label, no assignee/PR yet | Spawn agent to pick it up |
| **Draft PRs** | Squad member PR still in draft | Check if agent is stalled |
| **Review feedback** | Changes requested on PR | Route to author agent |
| **CI failures** | PR checks failing | Notify agent to fix |
| **Approved PRs** | Ready to merge | Merge and close issue |

## Periodic Check-In

Ralph doesn't run silently forever. Every 3-5 rounds, Ralph reports and **keeps going**:

```
🔄 Ralph: Round 3 complete.
   ✅ 2 issues closed, 1 PR merged
   📋 3 items remaining: #42, #45, PR #12
   Continuing... (say "Ralph, idle" to stop)
```

Ralph does **not** ask permission to continue — he keeps working. The only things that fully stop Ralph: you say "idle"/"stop", or the session ends. A clear board puts Ralph into idle-watch mode, not full stop.

## Idle-Watch Mode

When the board clears, Ralph doesn't fully stop. He enters **idle-watch** — a polling mode that automatically re-checks for new work on a timer.

```
📋 Board is clear. Ralph is watching — next check in 10 minutes.
   (say "Ralph, idle" to fully stop)
```

### How it works

1. Board clears → Ralph enters idle-watch
2. After {poll_interval} minutes (default: 10), Ralph re-scans GitHub
3. New work found → resumes the active work loop automatically
4. Still no work → waits another {poll_interval} minutes and checks again
5. Repeats until you say "Ralph, idle" or the session ends

### Configuring the interval

You can adjust the polling interval at any time:

| What you say | Interval |
|---|---|
| "Ralph, check every 5 minutes" | 5 min |
| "Ralph, check every 15 minutes" | 15 min |
| "Ralph, poll every 30 minutes" | 30 min |

The default is **10 minutes**. The interval only affects idle-watch — when actively processing work, Ralph scans immediately after each batch.

### Idle-watch vs. full idle

| Mode | Behavior | How to enter |
|---|---|---|
| **Idle-watch** | Polls for new work every N minutes | Automatic when board clears |
| **Full idle** | Completely stopped, no polling | Say "Ralph, idle" or "stop" |

## Ralph's Board View

When you ask for status:

```
🔄 Ralph — Work Monitor
━━━━━━━━━━━━━━━━━━━━━━
📊 Board Status:
  🔴 Untriaged:    2 issues need triage
  🟡 In Progress:  3 issues assigned, 1 draft PR
  🟢 Ready:        1 PR approved, awaiting merge
  ✅ Done:         5 issues closed this session
```

## Heartbeat Workflow Setup

The heartbeat workflow (`squad-heartbeat.yml`) is automatically installed during `init` or `upgrade`. It runs:

- **On a schedule**: Every 30 minutes (configurable in the workflow file)
- **On issue close**: Checks for next item in backlog
- **On PR merge**: Checks for follow-up work
- **On manual dispatch**: Trigger via GitHub Actions UI

### Adjusting the Schedule

Edit `.github/workflows/squad-heartbeat.yml`:

```yaml
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 min (default)
    # - cron: '0 * * * *'   # Every hour
    # - cron: '0 9-17 * * 1-5'  # Work hours only (M-F 9am-5pm UTC)
```

## Notes

- Ralph is session-scoped — his state (active/idle/watching, round count, poll interval, stats) resets each session
- Ralph appears on the roster like Scribe: `| Ralph | Work Monitor | — | 🔄 Monitor |`
- Ralph is exempt from universe casting — always "Ralph"
- The heartbeat workflow is the between-session complement to in-session Ralph

## Sample Prompts

```
Ralph, go — start monitoring and process the backlog until it's clear
```

Activates Ralph's self-chaining work loop to continuously process all pending work.

```
Ralph, status
```

Runs a single check cycle and shows the current board state without activating the work loop.

```
Ralph, check every 5 minutes
```

Changes the idle-watch polling interval from the default 10 minutes to 5 minutes.

```
Ralph, scope: just issues
```

Configures Ralph to monitor only issues and skip PRs and CI status checks.

```
Ralph, idle
```

Fully stops Ralph's work loop and idle-watch polling until manually reactivated.
