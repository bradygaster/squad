# Ralph — Work Monitor

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


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

Ralph uses intelligent routing to match work to the right agent. Rather than simple keyword matching against role titles, Ralph reads `.squad/routing.md` — your team's work-type definitions and module ownership — to make smart triage and dispatch decisions. This is the same intelligence the in-session coordinator uses.

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

Once activated, Ralph continuously checks for pending work — open issues, draft PRs, review feedback, CI failures — and keeps the squad moving through the backlog without manual nudges. Ralph's behavior is built on three layers: in-session coordinator, watch mode for local polling, and cloud heartbeat for fully unattended monitoring.

### Routing-Aware Triage

Ralph doesn't rely on dumb keyword matching. He reads your `.squad/routing.md` file to understand:
- **Work types** — categories like "Core runtime", "Docs & messaging", "Tests & quality"
- **Agent assignments** — which agent owns each domain
- **Module ownership** — which files belong to which agent (e.g., `src/hooks/` → Baer)

When triaging an issue, Ralph uses this priority order:
1. **Module path match** — If the issue mentions a file in `src/hooks/`, it routes to Baer (primary owner)
2. **Routing rule keywords** — If the issue mentions "docs" or "messaging", Ralph looks up those work types and assigns the matching agent (McManus for "Docs & messaging")
3. **Role keywords** — If no module or routing rule matches, Ralph scans the issue for role titles ("test", "security", "performance")
4. **Lead fallback** — If still no match, escalate to the team Lead for manual review
This ensures Ralph makes intelligent decisions based on your team's actual structure, not generic heuristics.

### In-Session (Copilot Chat)

When you're in a Copilot session, Ralph self-chains the coordinator's work loop:

1. Agents complete a batch of work
2. Ralph checks GitHub for more: untriaged issues, assigned-but-unstarted items, draft PRs, failing CI
3. Work found → triage, assign, spawn agents
4. Results collected → Ralph checks again **immediately** — no pause, no asking permission
5. Board clear → Ralph idles (use `squad watch` for persistent polling)

**Ralph never stops on his own while work remains.** He keeps cycling through the backlog until every issue is closed, every PR is merged, and CI is green. When the board clears, Ralph idles — run `squad watch` in a separate terminal for persistent polling, or use the cloud heartbeat for fully unattended monitoring. The only things that stop Ralph's active loop: the board is clear, you say "idle"/"stop", or the session ends.

### Between Sessions (GitHub Actions Heartbeat)

When no one is at the keyboard, the `squad-heartbeat.yml` workflow runs on event-based triggers (issue close, PR merge, manual dispatch). It:

- Finds untriaged `squad`-labeled issues
- Auto-triages based on your routing.md — matching issues to the right agent by work type and module ownership
- Assigns `squad:{member}` labels
- For `@copilot` (if enabled with auto-assign): assigns `copilot-swe-agent[bot]` so the coding agent picks up work autonomously

This creates a fully autonomous loop for `@copilot` — heartbeat triages → assigns → agent works → issue closed → heartbeat finds next issue → repeat. For continuous periodic monitoring, use `squad watch` locally.

### Work-in-Progress Monitoring

Ralph doesn't just dispatch work and forget about it. Once an issue is assigned or a PR is created, Ralph **watches the work** — tracking its lifecycle from assigned → PR created → review requested → CI running → approved → merged. Each completed step triggers a re-scan:

- **Assigned but no PR**: Ralph checks if the assigned agent has started work
- **PR created**: Ralph monitors for review feedback and CI status
- **Changes requested**: Ralph routes the feedback back to the author agent
- **CI passing**: Ralph marks as ready to merge
- **PR merged**: Ralph closes the corresponding issue and picks up the next work item

This continuous watch prevents work from getting stuck in intermediate states — Ralph catches stalled PRs, failed CI, and review bottlenecks automatically.

### Board State

Ralph maintains an internal view of the work board. Work items flow through these categories:

| Category | Meaning | Label(s) |
|----------|---------|----------|
| **Untriaged** | Issue has `squad` label but no `squad:{member}` assignment | `squad` only |
| **Assigned** | Issue assigned to a squad member, awaiting agent start | `squad:{member}` |
| **In Progress** | Agent has started work (draft PR exists or assignee begun) | `squad:{member}` + issue assigned |
| **Needs Review** | PR created, awaiting review feedback or approval | `squad:{member}` + PR open |
| **Changes Requested** | PR review came back with feedback | `squad:{member}` + `changes-requested` |
| **CI Failure** | PR checks are failing | `squad:{member}` + `ci-failure` |
| **Ready to Merge** | PR approved, all checks passing | `squad:{member}` + `approved` |
| **Done** | PR merged, issue closed | *(removed from board)* |

Ralph uses these categories internally to decide what action to take next. When you ask for status, Ralph reports the current board state across all these categories.

### What Wakes Ralph Up

Ralph monitors work at three different layers, each with different wake-up triggers:

**In-Session (Copilot Chat):**
- Agent completes work → Ralph immediately checks for next item (no delay)
- You say "Ralph, go" or "Ralph, status" → Ralph starts active loop
- You say "Ralph, idle" → Ralph stops checking

**Watch Mode (`squad watch` CLI):**
- Poll interval expires (default 10 min) → Ralph checks GitHub
- You press Ctrl+C → Ralph stops

**Cloud Heartbeat (GitHub Actions events):**
- Issue close event → Ralph checks for next item
- PR merge event → Ralph checks for next item
- Manual dispatch via GitHub Actions UI → Ralph checks GitHub

In all three layers, when Ralph wakes up, he scans the board, triages any untriaged items using routing.md, dispatches work to the right agent, watches in-flight items for progress, and reports results.

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

Ralph doesn't run silently forever. Every 3-5 rounds, Ralph reports and **keeps going**:

```
🔄 Ralph: Round 3 complete.
   ✅ 2 issues closed, 1 PR merged
   📋 3 items remaining: #42, #45, PR #12
   Continuing... (say "Ralph, idle" to stop)
```

Ralph does **not** ask permission to continue — he keeps working. The only things that stop Ralph: the board is clear, you say "idle"/"stop", or the session ends.

## Watch Mode (`squad watch`)

Ralph's in-session loop processes work while it exists, then idles. For **persistent polling** when you're away from the keyboard, run the `squad watch` command in a separate terminal:

```bash
squad watch                    # polls every 10 minutes (default)
squad watch --interval 5       # polls every 5 minutes
squad watch --interval 30      # polls every 30 minutes
```

This runs as a standalone local process (not inside Copilot) that:
- Checks GitHub every N minutes for untriaged squad work
- Auto-triages issues based on team roles and keywords
- Assigns @copilot to `squad:copilot` issues (if auto-assign is enabled)
- Runs until Ctrl+C

### Three layers of Ralph

| Layer | When | How |
|-------|------|-----|
| **In-session** | You're at the keyboard | "Ralph, go" — active loop while work exists |
| **Local watchdog** | You're away but machine is on | `squad watch --interval 10` |
| **Cloud heartbeat** | Fully unattended | `squad-heartbeat.yml` GitHub Actions events (issue close, PR merge, manual dispatch) |

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

- **On issue close**: Checks for next item in backlog
- **On PR merge**: Checks for follow-up work
- **On manual dispatch**: Trigger via GitHub Actions UI

For persistent polling when you're away, use `squad watch` locally — it polls at your chosen interval without consuming GitHub Actions minutes.

## Notes

- Ralph is session-scoped — his state (active/idle, round count, stats) resets each session
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
squad watch --interval 5
```

Starts persistent local polling — checks GitHub every 5 minutes for new squad work and triages automatically.

```
Ralph, scope: just issues
```

Configures Ralph to monitor only issues and skip PRs and CI status checks.

```
Ralph, idle
```

Fully stops Ralph's work loop and idle-watch polling until manually reactivated.
