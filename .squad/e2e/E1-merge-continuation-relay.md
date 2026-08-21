# E1 — Merge-Continuation Relay: Evidence Record

**Date:** 2026-08-21  
**Fixture repo:** `bradygaster/aspiregregator-squad-e2e`  
**Recorded by:** FIDO (Quality Owner)  
**Session:** 70370e36-33b0-4786-bd72-4cf15518daa6

---

## Summary

The merge-continuation relay — which had **never once succeeded** before tonight — worked end to end on 2026-08-21.

**E1 verdict: PASS** — all tested items passed. One item (epic closure / Rule D) was **not verified** due to an infrastructure hang, not a Squad defect.

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

This item remains open for a future E2 experiment.
