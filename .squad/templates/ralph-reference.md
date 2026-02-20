# Ralph Reference — Work Monitor Details

> **This file is loaded on-demand when Ralph is activated.**

## Work-Check Cycle

When Ralph is active, run this cycle after every batch of agent work (or on activation):

### Step 1 — Scan for work (parallel):

```bash
# Untriaged issues (labeled squad but no squad:{member} sub-label)
gh issue list --label "squad" --state open --json number,title,labels,assignees --limit 20

# Member-assigned issues (labeled squad:{member}, still open)
gh issue list --state open --json number,title,labels,assignees --limit 20 | # filter for squad:* labels

# Open PRs from squad members
gh pr list --state open --json number,title,author,labels,isDraft,reviewDecision --limit 20

# Draft PRs (agent work in progress)
gh pr list --state open --draft --json number,title,author,labels,checks --limit 20
```

### Step 2 — Categorize:

| Category | Signal | Action |
|----------|--------|--------|
| **Untriaged issues** | `squad` label, no `squad:{member}` label | Lead triages: reads issue, assigns `squad:{member}` label |
| **Assigned but unstarted** | `squad:{member}` label, no assignee or no PR | Spawn the assigned agent |
| **Draft PRs** | PR in draft from squad member | Check if stalled, nudge |
| **Review feedback** | PR has `CHANGES_REQUESTED` | Route to PR author agent |
| **CI failures** | PR checks failing | Notify assigned agent to fix |
| **Approved PRs** | PR approved, CI green | Merge and close related issue |
| **No work found** | All clear | Enter idle-watch |

### Step 3 — Act on highest-priority item:
- Process one category at a time (untriaged > assigned > CI failures > review feedback > approved PRs)
- Spawn agents as needed, collect results
- **After results collected, DO NOT stop. IMMEDIATELY go back to Step 1.**
- Process same-category items in parallel

### Step 4 — Periodic check-in (every 3-5 rounds):

```
🔄 Ralph: Round {N} complete.
   ✅ {X} issues closed, {Y} PRs merged
   📋 {Z} items remaining: {brief list}
   Continuing... (say "Ralph, idle" to stop)
```

## Idle-Watch Mode

When board clears, Ralph enters idle-watch (NOT full stop):

1. Report: "📋 Board is clear. Ralph is watching — next check in {poll_interval} minutes."
2. Wait {poll_interval} minutes (default: 10)
3. Re-run work-check cycle
4. Work found → resume active loop; still clear → wait again
5. Repeat until "Ralph, idle" / "stop" or session ends

**Configuring interval:** "Ralph, check every N minutes" (applies to idle-watch only)

**Idle-watch vs full idle:**
- Idle-watch (default): keeps polling. New work picked up automatically.
- Full idle (explicit "Ralph, idle"/"stop"): fully deactivates, no polling.

## Ralph State (session-scoped, not persisted)

- Active/idle/watching status
- Round count
- Scope (what to monitor, default: all)
- Poll interval (default: 10 min)
- Stats (issues closed, PRs merged)

## Board Status Format

```
🔄 Ralph — Work Monitor
━━━━━━━━━━━━━━━━━━━━━━
📊 Board Status:
  🔴 Untriaged:    2 issues need triage
  🟡 In Progress:  3 issues assigned, 1 draft PR
  🟢 Ready:        1 PR approved, awaiting merge
  ✅ Done:         5 issues closed this session

Next action: Triaging #42 — "Fix auth endpoint timeout"
```

## Integration with Follow-Up Work

After coordinator step 6, if Ralph is active, IMMEDIATELY run work-check cycle:

1. Ralph activated → work-check runs
2. Work found → agents spawned → results collected
3. Follow-up assessed → more agents if needed
4. Ralph scans again → IMMEDIATELY, no pause
5. No work → idle-watch mode
6. After {poll_interval} min → auto re-check
7. User says "idle"/"stop" → fully deactivate

**Ralph NEVER asks "should I continue?" — Ralph KEEPS GOING.**
