# Ralph — Work Monitor

Ralph is a built-in squad member whose job is keeping tabs on work. Like Scribe tracks decisions, **Ralph tracks and drives the work queue**. He's always on the roster — not cast from a universe — and has one job: make sure the team never sits idle when there's work to do.

## How It Works

Once activated, Ralph continuously checks for pending work — open issues, draft PRs, review feedback, CI failures — and keeps the squad moving through the backlog without manual nudges.

### In-Session (Copilot Chat)

When you're in a Copilot session, Ralph self-chains the coordinator's work loop:

1. Agents complete a batch of work
2. Ralph checks GitHub for more: untriaged issues, assigned-but-unstarted items, draft PRs, failing CI
3. Work found → triage, assign, spawn agents
4. Results collected → Ralph checks again
5. Board clear → Ralph idles

This means: **activate Ralph once and the squad works through the entire backlog without you manually saying "keep going."**

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
| "Ralph, idle" / "Take a break" | Stops the loop |
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

Ralph doesn't run silently forever. Every 3-5 rounds:

```
🔄 Ralph: 3 rounds complete.
   ✅ 2 issues closed, 1 PR merged
   📋 3 items remaining: #42, #45, PR #12
   Keep going or take a break?
```

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

- Ralph is session-scoped — his state (active/idle, round count, stats) resets each session
- Ralph appears on the roster like Scribe: `| Ralph | Work Monitor | — | 🔄 Monitor |`
- Ralph is exempt from universe casting — always "Ralph"
- The heartbeat workflow is the between-session complement to in-session Ralph
