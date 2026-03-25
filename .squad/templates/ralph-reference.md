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
