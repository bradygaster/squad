# Ralph Reference — Work Monitor Lifecycle

## Ralph's Work-Check Cycle

Ralph runs the same cycle at every wake-up (in-session, watch mode, or heartbeat):

1. **Scan** — Read GitHub: list issues with `squad` label, list all PRs
2. **Categorize** — Assign each item to a board category (untriaged, assigned, inProgress, needsReview, changesRequested, ciFailure, readyToMerge, done)
3. **Dispatch** — For untriaged items, read `.squad/routing.md` and triage using: module path match → routing rule keywords → role keywords → Lead fallback. Assign `squad:{member}` label and spawn agent if not already assigned
4. **Watch** — For in-flight items (assigned, inProgress, needsReview), check for state changes (PR created, review feedback, CI status, approval)
5. **Report** — Log results to the user (items moved, agents spawned, board state)
6. **Board Clear Check** — If all items are done/merged, go idle
7. **Loop** — If work remains, go back to step 1

## Board Format

Ralph tracks work items in these states:

```
Board State → Ralph Action
──────────────────────────
untriaged    → Triage using routing.md, assign agent
assigned     → Wait for agent to start, or spawn if stalled
inProgress   → Check for PR creation, review feedback
needsReview  → Wait for approval or request changes
ciFailure    → Notify agent, wait for fix
readyToMerge → Merge PR, close issue
done         → Remove from board
```

**Issue labels used:**
- `squad` — Issue is in squad backlog
- `squad:{member}` — Assigned to specific agent

**PR API fields used for state tracking (not labels):**
- `reviewDecision` — `CHANGES_REQUESTED` or `APPROVED`
- `statusCheckRollup` — check states like `FAILURE`, `ERROR`, or `PENDING`

## Idle-Watch Mode

When the board is clear (all work done/merged), Ralph enters **idle mode**. In this state:
- In-session Ralph stops the active loop (agents can still be called manually)
- Watch mode Ralph pauses polling until next interval
- Heartbeat Ralph waits for next event trigger (cron permanently disabled)

Ralph wakes from idle when:
- New issue is created with `squad` label
- PR is opened by a squad agent
- Existing issue is reopened
- Manual activation via "Ralph, go" or `squad watch`

## Activation Triggers

**Text-based (in Copilot Chat):**
- `Ralph, go` → Start active loop
- `Ralph, status` → Check board once, report results
- `Ralph, idle` → Stop active loop

**CLI-based:**
- `squad watch --interval 10` → Start persistent polling
- Ctrl+C → Stop watch mode

**Event-based (Heartbeat):**
- Issue closed/labeled → Check GitHub
- PR opened/merged → Check GitHub
- Manual dispatch → Check GitHub

## Work-Check Termination

Ralph stops checking when:
1. Board is clear (all items done)
2. User says "Ralph, idle" or "stop"
3. Session ends (in-session layer only)
4. Process killed (watch mode)

## Retrospective Enforcement

Ralph enforces the weekly retrospective ceremony. At **every work-check cycle**, before dispatching any new work, Ralph checks whether a retrospective is overdue.

### Test-RetroOverdue Logic

A retrospective is overdue when no retrospective log file exists from the past 7 days.

**Implementation (PowerShell):**

```powershell
function Test-RetroOverdue {
    $logDir = ".squad/log"
    $threshold = (Get-Date).AddDays(-7)

    # Find the most recent retrospective log file
    $latestRetro = Get-ChildItem -Path $logDir -Filter "*retrospective*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latestRetro) {
        # No retro ever run — overdue immediately
        return $true
    }

    return $latestRetro.LastWriteTime -lt $threshold
}
```

**Implementation (JavaScript/Node.js):**

```js
const fs = require('fs');
const path = require('path');

function isRetroOverdue() {
  const logDir = '.squad/log';
  const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  if (!fs.existsSync(logDir)) return true;

  const retroFiles = fs.readdirSync(logDir)
    .filter(f => f.includes('retrospective'))
    .map(f => fs.statSync(path.join(logDir, f)).mtimeMs)
    .sort((a, b) => b - a);

  if (retroFiles.length === 0) return true;
  return retroFiles[0] < threshold;
}
```

### Enforcement Rule

Add this check to the **beginning** of Ralph's work-check cycle, before step 1 (Scan):

```
PRE-CYCLE: Check if retrospective is overdue
  IF Test-RetroOverdue() THEN
    Run the "Retrospective (Weekly)" ceremony from ceremonies.md
    DO NOT dispatch other work until retro is complete
    Log retro output to .squad/log/{timestamp}-retrospective.md
  END IF
```

**Why before other work:** Retros that wait until after the board is clear never run. Enforcing before dispatch means the team reviews before building more.

### Action Item Tracking

Retro action items **must** be created as GitHub Issues, not markdown checkboxes:

- Label: `retro-action`
- Assignee: the agent or human responsible
- Track completion via issue close-rate

Measured result: teams using GitHub Issues for retro actions show significantly higher completion rates than markdown checklists, which have near-zero completion when not enforced.