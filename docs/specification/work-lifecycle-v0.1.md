# Squad Work Lifecycle Profile v0.1

<!-- cspell:ignore unroutable -->

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-work-lifecycle/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** The state vocabulary is a provider-neutral design;
no portable transition manifest or cross-provider trace corpus exists.

**Known deviations:** Current providers do not emit one shared revision,
recovery, cancellation, or blocker-resume record.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`,
`squad-governance-review/v0.1`

## 1. Scope and non-goals

This profile defines a provider-neutral lifecycle for work items, assignment,
dependencies, branches or workspaces, change requests, checks, reviews, merge,
closure, and cleanup. It does not require Git, GitHub, one branch naming
scheme, one merge strategy, or automatic merge.

## 2. Resource model

Portable resources are `work-item`, `dependency`, `assignment`, `workspace`,
`change`, `check`, `review`, `integration`, and `closure`. Each resource has a
provider-qualified reference, immutable identity, observed revision, and
authority source.

The closed finite work states are `untriaged`, `assigned`, `in-progress`, `needs-review`,
`changes-requested`, `checks-failed`, `ready`, `integrated`, `done`,
`cancelled`, and `blocked`.

All transitions not explicitly listed by this profile are invalid.

## 3. Complete transition table

| From | To | Guard and evidence | Recovery or terminal behavior |
|---|---|---|---|
| `untriaged` | `assigned` | Exactly one accountable route | Re-route by a new assignment revision |
| `untriaged` | `cancelled` | Authorized cancellation disposition | Terminal |
| `assigned` | `in-progress` | Claimed workspace at expected work revision | Release or replace a stale claim |
| `assigned` | `blocked` | Active dependency or authority blocker | Resume to `assigned` after blocker clearance |
| `assigned` | `cancelled` | Authorized cancellation disposition | Terminal |
| `in-progress` | `needs-review` | Current change reference and submitted revision | Return to `in-progress` for a newer change revision |
| `in-progress` | `blocked` | Active dependency, workspace, or authority blocker | Resume to `in-progress` |
| `in-progress` | `cancelled` | Authorized cancellation disposition | Terminal |
| `needs-review` | `changes-requested` | Blocking verdict against the current revision | Resume through `in-progress` with a new revision |
| `needs-review` | `checks-failed` | One or more required checks failed | Re-run checks or submit a new revision |
| `needs-review` | `ready` | Independent approval and all required checks pass for one revision | Regress if review or check evidence changes |
| `needs-review` | `blocked` | External dependency or authority blocker | Resume to `needs-review` |
| `needs-review` | `cancelled` | Authorized cancellation disposition | Terminal |
| `changes-requested` | `in-progress` | Eligible revision author claims the correction | Submit a new revision for review |
| `changes-requested` | `blocked` | Revision cannot proceed | Resume to `changes-requested` |
| `changes-requested` | `cancelled` | Authorized cancellation disposition | Terminal |
| `checks-failed` | `in-progress` | Failure requires a code or configuration revision | Submit the corrected revision |
| `checks-failed` | `needs-review` | Checks are re-running for the unchanged revision | Await composed review/check result |
| `checks-failed` | `ready` | The same revision now has approval and passing required checks | Regress on newer failure or review |
| `checks-failed` | `blocked` | Check infrastructure or dependency blocker | Resume to `checks-failed` |
| `checks-failed` | `cancelled` | Authorized cancellation disposition | Terminal |
| `blocked` | prior nonterminal state | All recorded blockers clear and `resumeState` names the prior state | A missing or stale `resumeState` is invalid |
| `ready` | `changes-requested` | A current-revision blocking verdict supersedes approval | Correct through `in-progress` |
| `ready` | `checks-failed` | A required check fails or is invalidated | Re-run or revise |
| `ready` | `blocked` | Integration dependency or authority blocker | Resume to `ready` only if evidence remains current |
| `ready` | `integrated` | Provider integration succeeds at expected revision | Continue to closure |
| `ready` | `cancelled` | Authorized cancellation before integration | Terminal |
| `integrated` | `done` | Closure disposition and dependency updates succeed | Terminal |

`done` and `cancelled` are terminal. Every transition not listed above is
invalid. `blocked` records both blockers and the exact `resumeState`; it is not
a wildcard transition.

Provider observations may arrive out of order. Consumers must reconcile by
resource revision and must not infer integration from closure alone.

## 4. Dependencies and workspaces

Dependencies have stable IDs and `blocks` direction. Cycles are invalid unless
an extension explicitly permits informational relationships. A workspace claim
records base revision, branch or workspace reference, actor, and lease.
Worktrees are one compatible workspace implementation, not a requirement.

## 5. Candidate operations and roles

Candidate operations are `work.observe`, `work.assign`, `work.claim`,
`work.change-submit`, `work.check`, `work.review`, `work.integrate`, and
`work.close`. Provider bindings declare which operations they implement.

## 6. Failure and diagnostics

Unroutable assignment, dependency cycle, stale workspace base, duplicate active
claim, missing change, stale review, failed required check, unauthorized merge,
partial integration, and closure mismatch are distinct failures. Failures must
retain provider references and recovery guidance.

## 7. Idempotency, retry, and concurrency

Every mutation carries an operation ID. Repeated operations return the same
resource mapping. Workspace and integration operations require expected
revisions. Partial provider mutations are resumable and must not be reported as
success-shaped completion.

## 8. Versioning, extensions, security, and privacy

Bindings negotiate separately from this profile. Namespaced states and fields
round-trip. Work descriptions, review comments, branches, and check logs are
untrusted. Provider credentials and secret logs must not enter lifecycle
records.

## 9. Promotion criteria

Publish a manifest with positive and negative traces for every table row,
blocked-state recovery, stale base, rejection and lockout, check failure,
duplicate retry, partial integration, cancellation, terminal-state rejection,
and provider event reordering. Run the same neutral traces against GitHub and
one non-GitHub binding.
