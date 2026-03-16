# Tone Validation Test Specification

> Quality gates for PAO's external communications. All tests must pass before a draft enters the review table.

## Test Categories

### T1: Reject Anti-Patterns

Drafts containing these patterns MUST be rejected:

| Test ID | Pattern | Example (should FAIL) |
|---------|---------|----------------------|
| T1.1 | Corporate speak | "We appreciate your patience as we investigate this matter" |
| T1.2 | Formal passive voice | "It has been determined that this is a known issue" |
| T1.3 | Marketing hype | "Squad is the best-in-class solution for this" |
| T1.4 | Empty acknowledgment | "Thanks for your feedback." (with nothing else) |
| T1.5 | Robot signature | "Best regards, PAO" |
| T1.6 | Over-promising | "We'll definitely ship this in the next release" |
| T1.7 | Dismissive language | "Works as designed" (without empathy) |
| T1.8 | Profanity | Any profanity, even quoted from the original issue |

### T2: Require Positive Patterns

Drafts of specific types MUST contain these patterns:

| Test ID | Response Type | Required Pattern | Example (should PASS) |
|---------|---------------|-----------------|----------------------|
| T2.1 | Welcome | Author acknowledgment | "Hey @user! Welcome to Squad 👋" |
| T2.2 | Troubleshooting | Action-oriented close | "Let us know if that helps!" |
| T2.3 | Feature guidance | Context on current state | "Currently, Squad handles this by..." |
| T2.4 | Technical uncertainty | Honesty about unknowns | "We're not 100% sure yet..." |

### T3: Confidence Flag Accuracy

| Test ID | Scenario | Expected Confidence |
|---------|----------|-------------------|
| T3.1 | Issue matches existing FAQ | 🟢 High |
| T3.2 | Technical question with partial docs | 🟡 Medium |
| T3.3 | Architecture question requiring Flight | 🔴 Needs review |
| T3.4 | Question about unreleased feature | 🔴 Needs review |
| T3.5 | Simple "how to install" question | 🟢 High |

### T4: Thread Safety

| Test ID | Scenario | Expected Behavior |
|---------|----------|------------------|
| T4.1 | Thread with >10 comments | ⚠️ Long thread flag set |
| T4.2 | Thread with deleted comments | Validation warning |
| T4.3 | Thread where squad member already responded | Skip (no draft) |
| T4.4 | Thread in different language | Flag for review |

### T5: Review Gate Enforcement

| Test ID | Scenario | Expected Behavior |
|---------|----------|------------------|
| T5.1 | Draft without human review | BLOCKED — cannot post |
| T5.2 | `pao approve` command without draft ID | Error message |
| T5.3 | Concurrent review sessions | SQLite lock prevents race |
| T5.4 | Stale lock (>1 hour) | Auto-cleanup, new session allowed |
| T5.5 | `pao halt` issued | All pending drafts frozen |
| T5.6 | `pao resume` after halt | Drafts unfrozen |

### T6: Audit Trail Completeness

| Test ID | Action | Expected Audit Entry |
|---------|--------|---------------------|
| T6.1 | Scan completed | scan action with item count |
| T6.2 | Draft created | draft action with content |
| T6.3 | Draft approved | approve action with reviewer |
| T6.4 | Draft skipped | skip action with reviewer |
| T6.5 | Response posted | post action with URL |
| T6.6 | `pao halt` issued | halt action with issuer |
| T6.7 | Draft deleted (rollback) | delete action with reason |

### T7: Baseline Comparison (Weekly)

| Test ID | Metric | Threshold | Frequency |
|---------|--------|-----------|-----------|
| T7.1 | Tone similarity to gold standard | >80% | Per draft |
| T7.2 | Response type distribution | No single type >60% | Weekly |
| T7.3 | Confidence flag distribution | 🔴 items <20% | Weekly |
| T7.4 | Average thread read depth | >95% of comments read | Per draft |

## Gold Standard Responses

The following 7 gold standard responses serve as the tone baseline. New drafts should align with this tone:

### GS-1: Welcome (High confidence)
> Hey @newuser! Welcome to Squad 👋 Thanks for opening this — great first issue!
>
> To answer your question: Squad uses `.squad/team.md` to define your team roster. You can add members by editing that file directly or running `squad init`.
>
> Let us know if you hit any snags — happy to help!

### GS-2: Troubleshooting (High confidence)
> Thanks for the detailed report, @reporter!
>
> This looks like it might be related to the casting registry not finding the universe file. Here's what we'd suggest:
> 1. Check that `.squad/casting/registry.json` exists and is valid JSON
> 2. Run `squad build` to regenerate from source
> 3. If that doesn't work, try deleting `.squad/casting/` and re-running `squad init`
>
> Let us know if that helps, or if you're seeing something different.

### GS-3: Feature Guidance (Medium confidence)
> Great question! Right now, Squad handles cross-repo orchestration through the hub-and-spoke model — you'd have a central `.squad/` in one repo and reference it from others.
>
> We know this isn't ideal for every setup. There's been some discussion about making this more seamless (see #316 for the RFC).
>
> For now, the workaround is to use `squad export` to share config across repos. Hope that helps!

### GS-4: Acknowledgment (High confidence)
> Good catch, @finder. We've confirmed this is a real issue with the session pool cleanup.
>
> It looks like sessions aren't being released when the adapter disconnects unexpectedly. We're tracking it and will update this thread when we have a fix.
>
> Thanks for flagging it — this one would have been hard to find without your repro steps!

### GS-5: Technical Uncertainty (Low confidence)
> Interesting find, @explorer. We're not 100% sure what's causing this yet.
>
> Here's what we've ruled out:
> - It's not a casting issue (registry looks fine)
> - It's not a config issue (your squad.config.ts parses correctly)
>
> Could you share the output of `squad build --verbose`? That would help us narrow it down. We'll dig deeper and update this thread.

### GS-6: Redirect (High confidence)
> Thanks for reaching out, @asker! This one is actually better suited for the Squad-IRL repo, which covers deployment patterns and infrastructure around Squad.
>
> You can open it here: https://github.com/bradygaster/Squad-IRL — they'll be able to help with the Terraform setup specifically.
>
> Feel free to link back to this thread for context!

### GS-7: Closing (High confidence)
> This should be resolved in v0.8.22! 🎉
>
> The fix was in PR #389 — the casting registry now handles universe overflow correctly when you have more than 15 agents.
>
> Thanks for reporting this, @reporter — your repro steps made this one easy to track down. Closing this out!

## Phase 1 Readiness Criteria

Before launch, ALL of the following must be true:
- [ ] All T1 tests have corresponding patterns in `tone-validation.json`
- [ ] All T2 tests verified against humanizer skill templates
- [ ] All 7 gold standard responses reviewed and approved by Brady or Dina
- [ ] All 9 response types have corresponding templates (7 original + empathetic disagreement + information request)
- [ ] Thread-read verification tested with threads of 1, 5, 10, and 20+ comments
- [ ] Rollback workflow (delete-and-repost) tested end-to-end
- [ ] Review gate SQLite schema tested with concurrent access
- [ ] Audit trail format validated against template
- [ ] `pao halt` / `pao resume` flow tested end-to-end
- [ ] At least one full scan→draft→review→post cycle completed successfully
