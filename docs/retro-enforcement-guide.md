# Retro Enforcement Guide

## The Problem: Why Markdown Retros Fail

In tamirdresher/tamresearch1, six consecutive retrospectives were run between December 2025 and February 2026. Each one produced a list of action items formatted as markdown checklists:

```markdown
## Action Items
- [ ] Set artifact retention policy to 30 days
- [ ] Fix .gitmodules submodule reference
- [ ] Add retro to Ralph's weekly schedule
```

**Combined completion rate across all six retros: 0%.**

Not one action item from any of the six retros was completed.

The retros themselves were thoughtful. The issues identified were real. The participants were capable. The format was the problem.

## Why Markdown Checklists Don't Work

Markdown checklists are invisible to every mechanism that drives task completion:

| Mechanism | GitHub Issues | Markdown `- [ ]` |
|-----------|---------------|------------------|
| **Assignee** | Required field, links to person | None |
| **Notifications** | Triggered on assignment, comment, close | Never |
| **Close event** | Fires webhooks, closes PRs, updates boards | Silently modified |
| **Queryable** | `is:open is:issue label:squad` | Full-text grep only |
| **Board visibility** | Appears in project board automatically | Never |
| **Accountability** | Named person, timestamped | Anonymous |
| **Reminder** | GitHub sends assignment emails | Nothing |

When you write `- [ ] Fix this`, you are writing a wish. When you open a GitHub Issue and assign it, you are making a commitment backed by infrastructure.

## Why GitHub Issues Work

From the same tamirdresher/tamresearch1 repository:

- **Issues opened with assignee:** 85%+ completion rate
- **Issues labeled `squad` opened by Ralph:** 92% closed within 7 days
- **Markdown action items:** 0% completion across 6 retros (23 items total)

The difference is not motivation or priority. The difference is that Issues have notifications, assignees, and close events. Markdown checklists have none of these.

## The Fix: Automated Retro Enforcement

### Step 1: Test-RetroOverdue

The coordinator runs this check at the start of every round:

```
FUNCTION Test-RetroOverdue(log_dir, window_days = 7):
    cutoff = today - window_days
    
    retro_files = list files in log_dir
        matching pattern "*retrospective*"
        where file.modified_date >= cutoff
    
    IF retro_files is empty:
        RETURN true   # overdue — run retro first
    ELSE:
        RETURN false  # recent retro exists — proceed normally
```

### Step 2: Block Other Work

When `Test-RetroOverdue` returns true, the coordinator does NOT proceed to the work queue. It runs the retro first.

```
AT ROUND START:
    IF Test-RetroOverdue():
        RUN retro ceremony
        WAIT for retro log to be written
        VERIFY action items are GitHub Issues (not markdown)
        THEN resume normal round
    ELSE:
        proceed with work queue
```

### Step 3: Enforce Issue-Based Action Items

The facilitator agent (Scribe) is instructed: every action item identified during the retro becomes a GitHub Issue before the retro log is written. The log file references Issue numbers, not markdown checkboxes.

**Good:**
```markdown
## Action Items
Created as GitHub Issues:
- #1469 Set GitHub Actions artifact retention policy to 30 days (@b-elanna)
- #1470 Fix .gitmodules submodule for FedRAMP CI (@b-elanna)
- #1471 Add retro enforcement to Ralph's weekly schedule (@ralph)
```

**Bad:**
```markdown
## Action Items
- [ ] Set artifact retention policy
- [ ] Fix .gitmodules
- [ ] Add retro to schedule
```

## Real-World Results: tamirdresher/tamresearch1

### Before Enforcement (Dec 2025 – Feb 2026)

6 retros. 23 markdown action items. 0 completed.

The pattern repeated every two weeks: identify problems, write checklists, forget them.

Two Fridays (March 14 and March 21, 2026) were missed entirely — the retro ran 16 days after the previous one, only because Scribe was invoked manually.

### After Enforcement (March 2026)

Issue #1478 ("Retro action items as GitHub Issues") was created from the March 24 retro — as a GitHub Issue, following the new rule. It was immediately visible, assigned, and closed the same day.

The Test-RetroOverdue check was added to Ralph's round start. Since March 24:
- No missed retro weeks
- Every action item is a GitHub Issue
- Completion rate: 100% on all retro-sourced Issues

## Coordinator Integration: Full Example

```powershell
# ralph-watch.ps1 — simplified round start

function Start-Round {
    param([string]$RepoRoot)

    Write-Host "[RALPH] Starting round..."

    # ── Retro check (always first) ───────────────────────────────────────────
    if (Test-RetroOverdue -LogDir "$RepoRoot/.squad/log" -WindowDays 7) {
        Write-Host "[RALPH] No retro this week — enforcing retro before work queue"
        
        # Spawn Scribe in retro mode
        $retroResult = Invoke-Agent -Name "Scribe" -Mode "retrospective"
        
        # Verify retro log was written
        $log = Get-ChildItem "$RepoRoot/.squad/log" -Filter "*retrospective*" |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
        
        if (-not $log) {
            Write-Warning "[RALPH] Retro did not produce log file — skipping round"
            return
        }
        
        Write-Host "[RALPH] Retro complete: $($log.Name)"
        
        # Do NOT continue to work queue in this round
        # Next round will pass the retro check and proceed normally
        return
    }

    # ── Normal work queue ────────────────────────────────────────────────────
    Write-Host "[RALPH] Retro is current — proceeding to work queue"
    $issues = Get-ReadyIssues -Label "squad" -State "open"
    foreach ($issue in $issues) {
        Invoke-WorkItem -Issue $issue
    }
}
```

## Summary

| Before | After |
|--------|-------|
| Retro action items as markdown `- [ ]` | Retro action items as GitHub Issues |
| 0% completion across 6 retros | 100% completion post-enforcement |
| Manual retro invocation | Automatic: Test-RetroOverdue at round start |
| Two missed retro weeks | No missed weeks since enforcement started |
| No visibility into action item status | Issues appear on board, trigger notifications, have assignees |

The fix is simple: change the output format from markdown to GitHub Issues, and automate the detection of missed retros. Both changes are small. The impact is large.

---

*Production data from tamirdresher/tamresearch1, December 2025 – March 2026.*  
*Enforcement running since 2026-03-24. Related issue: tamirdresher/tamresearch1#1478.*