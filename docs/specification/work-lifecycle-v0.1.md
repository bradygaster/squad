# Squad Work Lifecycle Profile v0.1

<!-- cspell:ignore unroutable -->

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-work-lifecycle/v0.1`

**Maturity:** Experimental normative

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

## 3. Deterministic transitions

- `untriaged -> assigned` requires one accountable route.
- `assigned -> in-progress` requires a claimed workspace.
- `in-progress -> needs-review` requires a change reference and evidence.
- `needs-review -> changes-requested` follows a blocking governance verdict.
- `needs-review|changes-requested|checks-failed -> ready` requires approval of
  the current revision and all required checks passing.
- `ready -> integrated` requires provider integration evidence.
- `integrated -> done` requires closure disposition and dependency updates.

Provider observations MAY arrive out of order. Consumers MUST reconcile by
resource revision and MUST NOT infer integration from closure alone.

## 4. Dependencies and workspaces

Dependencies have stable IDs and `blocks` direction. Cycles are invalid unless
an extension explicitly permits informational relationships. A workspace claim
records base revision, branch or workspace reference, actor, and lease.
Worktrees are one compatible workspace implementation, not a requirement.

## 5. Capabilities and roles

Capabilities are `work.observe`, `work.assign`, `work.claim`,
`work.change-submit`, `work.check`, `work.review`, `work.integrate`, and
`work.close`. Provider bindings declare which operations they implement.

## 6. Failure and diagnostics

Unroutable assignment, dependency cycle, stale workspace base, duplicate active
claim, missing change, stale review, failed required check, unauthorized merge,
partial integration, and closure mismatch are distinct failures. Failures MUST
retain provider references and recovery guidance.

## 7. Idempotency, retry, and concurrency

Every mutation carries an operation ID. Repeated operations return the same
resource mapping. Workspace and integration operations require expected
revisions. Partial provider mutations are resumable and MUST NOT be reported as
success-shaped completion.

## 8. Versioning, extensions, security, and privacy

Bindings negotiate separately from this profile. Namespaced states and fields
round-trip. Work descriptions, review comments, branches, and check logs are
untrusted. Provider credentials and secret logs MUST NOT enter lifecycle
records.

## 9. Conformance

Conformance requires traces for happy path, blocked dependencies, stale base,
review rejection and lockout, check failure and recovery, duplicate retries,
partial integration, cancellation, and provider event reordering.
