# E1 — Merge-Continuation Relay: Evidence Record

**Date:** 2026-08-21  
**Fixture repo (this run):** `bradygaster/aspiregregator-squad-e2e` — ⚠️ **retired.** Deleted 2026-08-24 along with every other test repo. The name is preserved here deliberately: this is an *evidence record*, and it must keep stating which repo actually produced the readings below. Re-runs target a different repo — see `$FIXTURE` in *PASS observation* below.  
**Recorded by:** FIDO (Quality Owner)  
**Session:** 70370e36-33b0-4786-bd72-4cf15518daa6

---

## Summary

The merge-continuation relay — which had **never once succeeded** before tonight — worked end to end on 2026-08-21.

**E1 verdict: PASS (with one gate NOT VERIFIED)** — 7 of 8 tested items passed. The eighth — **Rule D / epic closure** — was **NOT VERIFIED** due to a `detection` infrastructure hang, not a Squad defect. Rule D is now a **formal gate on this procedure** (see *Rule D — the gate and its escape hatch* below), and any re-run must score it explicitly rather than treating an unobserved run as green.

---

## Evidence Table

| Check | Pre-fix control (17:01 UTC) | Post-fix (23:11→23:39 UTC) | Verdict |
|---|---|---|---|
| Epic → leaf descent | stalled on epic | skipped closed #6/#7/#8, isolated #9 as sole remaining leaf | PASS (#1758.2) |
| Worker actually dispatched | announced re-queue, never fired | run `32427965213` fired | PASS |
| PR produced | none | PR #15, +320/−74, 4 files | PASS |
| CI on generated code | n/a | 3/3 OS builds pass (ubuntu 35s, macOS 44s, windows 2m10s) | PASS |
| Junk issues minted | #12, #14 | zero | PASS (#1772) |
| Auto post-merge relay | `Squad — run` (dispatched with NO command) | `Squad — implement` (command carried) | PASS |
| Child closed on merge | n/a | #9 CLOSED | PASS |
| Epic closure (Rule D) | — | BLOCKED on infra hang, not re-tested | NOT VERIFIED |

---

## Run IDs

| Run ID | Name | Timestamp (UTC) | Duration | Outcome |
|---|---|---|---|---|
| `32395290857` | `Squad — run` | 2026-08-21 17:01:33Z | — | Pre-fix control; announced epic re-queue, never dispatched worker |
| `32427606590` | `Squad — /squad implement` | 2026-08-21 23:11:41Z | 5m18s | Success — descended to leaf #9 and dispatched worker |
| `32427965213` | `Squad implement — 9` | 2026-08-21 23:16:36Z | 9m3s | Success — produced PR #15 (+320/−74, 4 files) |
| `32428574203` | PR checks | — | — | Required MANUAL APPROVAL (`action_required`), then 3/3 builds passed |
| `32429285504` | post-merge worker | 2026-08-21 23:35:28Z | 4m29s | Success — closed #9, dispatched relay |
| `32429564437` | `Squad — implement` | 2026-08-21 23:39:36Z | — | Auto-relay; `agent` job succeeded in 1m46s; `detection` job hung >35 min on `Install ripgrep`; run cancelled |

---

## Single Most Important Line of Evidence

The run *name* changed:

- **Pre-fix:** `Squad — run` — dispatched with an **empty command**. This is the defect that caused junk issues #12 and #14 to be minted.
- **Post-fix:** `Squad — implement` — dispatched with the **command carried**.

Same trigger. Same inputs. Different result. This is the fix in action.

---

## Autonomy Blockers

These are **not Squad defects** but they DO prevent the loop from closing unattended.

### 1. `action_required` Approval Gate

Worker-opened PRs are authored by `app/github-actions`. GitHub parks their `pull_request` workflow runs in `action_required` status pending manual approval. A human had to click **Approve** for PR #15 before CI would run.

**The loop cannot close unattended until PR creation uses a PAT or GitHub App token instead of the default `GITHUB_TOKEN`.**

Unblock command (for manual override during testing):
```sh
gh api -X POST "repos/<owner>/<repo>/actions/runs/<RUN_ID>/approve"
```

### 2. Detection-Job Hang

gh-aw gates safe-output application behind a `detection` job. Tonight it hung **>35 minutes** on the `Install ripgrep` step. Every prior step had succeeded, and Squad's `agent` job had already completed successfully in 1m46s.

**Latency between "agent decided" and "effect visible" is unbounded.** This is an infrastructure issue with the gh-aw runner environment, not a Squad logic issue.

Diagnose which step is hung:
```sh
gh api "repos/<owner>/<repo>/actions/jobs/<JOB_ID>" --jq '.steps[] | select(.status != "completed")'
```

Operational guidance: if the `detection` job has not completed within ~10 minutes of the `agent` job finishing, cancel the run and re-trigger manually.

---

## Not Verified: Epic Closure (Rule D)

Epic closure was not re-tested after the fix. The session ended while the `detection` job hung. This is **not a Squad regression** — the infra hang prevented observation, not a logic failure.

Rule D is now a formal gate on E1 (see next section). It is **not** getting its own scenario number — an earlier draft of the E-series referred to a "future E2 experiment," but that scenario was never authored. Rule D shares E1's trigger (the merge-continuation relay closing the last leaf), so verifying it separately would either duplicate E1 or fabricate the state — neither is worth a distinct procedure. See `.squad/e2e/README.md` for the numbering history.

---

## Rule D — the gate and its escape hatch

**Added post-execution, 2026-08-21.** Any re-run of E1 MUST score Rule D explicitly rather than defaulting to green on absence of contrary evidence.

### The gate

**Trigger.** All leaf tasks under an epic have been merged (their child issues CLOSED) and the merge-continuation relay has been observed to dispatch (i.e. E1's other 7 gates have passed on the final leaf).

**Rule D verdict — three possible outcomes:**

- ✅ **PASS** — the epic issue is CLOSED within a stated observation window (default: 10 minutes after the last leaf's merge-continuation relay run reaches `success`). The closure is attributed to Squad (either commented by the coordinator or effected via a Squad-authored PR/dispatch), not a manual close.
- ❌ **FAIL** — the epic is OPEN at window expiry. Full stop. Whether a closure was never attempted, fired against the wrong target, or fired and errored is *evidence recorded on the FAIL*, not a precondition for reaching it. A **late closure** (epic transitions to CLOSED after window expiry) is also a FAIL: the verdict is fixed at expiry and does not retroactively flip to PASS. Record the late-closure fact, run URL, and delay in the finding — the score is still FAIL because E1's whole point is that closure was supposed to be autonomous *and* on-time.
- ⚠️ **NOT VERIFIED** — the observation was blocked by an infrastructure hang (`detection` on `Install ripgrep` is the known offender). Record the observation-blocking job's URL and step and the exact minute the run was cancelled. A NOT VERIFIED verdict is *not* a green: it is a documented absence of signal, and it does not close #1758.2 or any successor.

### The escape hatch (required text on any NOT VERIFIED result)

```yaml
rule_d:
  verdict: NOT VERIFIED
  reason: "detection job hung >N min on step '<step name>'; observation window expired before closure could be witnessed"
  blocked_by_job_url: "https://github.com/<owner>/<fixture>/actions/runs/<run_id>/job/<job_id>"
  blocked_by_step: "<step name>"
  cancelled_at_utc: "<yyyy-MM-ddTHH:mm:ssZ>"
  observation_window_min: 10
  window_started_utc: "<yyyy-MM-ddTHH:mm:ssZ>"      # when the relay run reached success
  window_ended_utc:   "<yyyy-MM-ddTHH:mm:ssZ>"      # cancelled_at_utc for hang; +window_min otherwise
```

**Do not omit any of these fields on a NOT VERIFIED.** An escape hatch that accepts blank fields becomes a way to score anything as NOT VERIFIED. If any of the required text is missing, treat the result as **FAIL** (blocked-observation is a claim; unsubstantiated blocked-observation is silence).

**Cross-checks (completeness is not veracity).** Each of these must hold; otherwise the NOT VERIFIED verdict itself is invalid and the run scores **FAIL**:

- `blocked_by_job_url` MUST target the fixture repo. Concretely: the URL path MUST contain `/<fixture-owner>/<fixture-repo>/actions/runs/`, where `<fixture-owner>/<fixture-repo>` is the `$FIXTURE` declared in *PASS observation* below (currently `octodemo/aspiregregator-squad-e2e`). A cancelled run from an unrelated repo satisfies the field type but does not support the claim. **Match on owner *and* name, not the bare name.** The repo name `aspiregregator-squad-e2e` was deliberately reused when the fixture moved orgs on 2026-08-24, so a name-only match cannot distinguish the current fixture from the retired one and would accept evidence from a repo that no longer exists.
- `cancelled_at_utc` MUST fall within `[window_started_utc, window_ended_utc]`. A cancellation *before* the window opened wasn't blocking Rule D observation; a cancellation *after* the window closed didn't cause the NOT VERIFIED — the window already ended.
- `blocked_by_step` MUST name a step visible on the linked run and MUST still be `in_progress` (not `completed`) at cancellation time. A step that had already returned before the run was cancelled didn't hang.

These cross-checks are the difference between "documented absence of signal" (this hatch's whole point) and "any convenient cancelled run around the same time will do."

### PASS observation (the mandatory extractions)

```powershell
$FIXTURE = "octodemo/aspiregregator-squad-e2e"   # re-run target (2026-08-24 onward). NOT the
                                                 # repo named in this record's header — that one
                                                 # was deleted. See the header note.
$EPIC = <epic issue number>

# The relay run's success timestamp — the start of the observation window.
# Rule D house rule: every `gh … 2>$null` in this document is followed by an
# `$LASTEXITCODE` assertion. The stderr suppression keeps the terminal clean;
# the exit-code check keeps a silent failure from being scored as "no matching
# run" (which for this cell would zero out `window_started_utc`).
gh run list --repo $FIXTURE --workflow "Squad" --limit 20 `
    --json databaseId,name,conclusion,updatedAt `
    --jq '.[] | select(.conclusion=="success" and (.name|test("implement|relay"; "i"))) |
         [(.databaseId|tostring),.name,.updatedAt] | join("  |  ")' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "relay-timestamp extract: INCONCLUSIVE — gh run list exited $LASTEXITCODE. The line above is silence, not 'no matching run'. Do NOT set `window_started_utc` from this output; fix auth/network and re-run before scoring Rule D."
}

# Epic state at the end of the observation window.
gh issue view $EPIC --repo $FIXTURE --json state,closedAt,timelineItems `
    --jq '{state,closedAt,closer:(.timelineItems[]|select(.__typename=="ClosedEvent")|.actor.login)}' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "epic-state extract: INCONCLUSIVE — gh issue view exited $LASTEXITCODE. This cell is DISPOSITIVE for Rule D: an empty response is not 'epic OPEN' and not 'epic CLOSED'. Do NOT score the verdict from silence; fix the fetch and re-run before assigning PASS / FAIL / NOT VERIFIED."
}
```

**PASS attribution rule.** `closer` must be a Squad-owned actor (`app/github-actions` posting a Squad workflow closure, or the coordinator's Squad-authored PR merging). A closure attributed to a human operator during the observation window is **not** a Rule D PASS — it is a Rule D FAIL that was manually papered over, and E1's whole point is that closure was supposed to be autonomous.

### FAIL observation

Record the full `gh run list --workflow "Squad"` output for the observation window along with the epic's `state` and `openIssues` count. A FAIL says the closure logic did not fire — that is the finding.

---
