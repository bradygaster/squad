# Squad Governance and Review Profile v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-governance-review/v0.1`

**Maturity:** Experimental normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Protocol artifact:** governance evidence records

## 1. Scope and non-goals

This profile defines accountable ownership, reviewer independence, blocking
verdict evidence, rejection lockout, reassignment, escalation, approval, and
completion transitions. It does not define code-review style, preferred
feedback wording, repository merge policy, or who is authorized by a provider.

## 2. Roles and vocabulary

The **accountable owner** owns the requirement and final handoff. The
**artifact author** produces a revision. A **blocking reviewer** issues
verdicts. A **revision author** independently produces the next revision after
rejection. A **coordinator** validates transitions. An **authority** resolves
deadlock or policy disputes.

## 3. Evidence record

Every transition MUST use the shared evidence envelope conforming to
`test-fixtures/spec/suite-v0.1/evidence.schema.json`. Governance data includes
profile, event ID, artifact ID and revision, state, accountable owner, author,
reviewer, blockers, lockout set, prior event, actor, timestamp, and
idempotency key.

## 4. State machine

The deterministic states are:

`draft -> submitted -> under-review -> approved -> completed`

Rejection uses:

`under-review -> rejected -> reassignment-required -> revising -> submitted`

Escalation uses:

`rejected|reassignment-required -> escalated -> dispositioned`

Only an approved artifact with applicable external checks may become completed.
Completion does not imply provider merge unless a binding says so.

## 5. Blocking verdict contract

A rejection MUST identify artifact location, violated requirement or invariant,
reproducible evidence or concrete failure scenario, and the minimum clearing
condition. Preference-only feedback MUST be advisory and MUST NOT trigger
lockout.

## 6. Reviewer independence and lockout state machine

The blocking reviewer MUST differ from the current artifact author. After a
rejection, the current author is added to the artifact revision-cycle lockout
set and MUST NOT author, co-author, pair on, or direct the next revision. The
reviewer MAY clarify the blocker but MUST NOT become revision author for the
same cycle. The coordinator MUST select an eligible revision author not in the
lockout set.

Lockout is scoped to the artifact and persists until a later revision is
approved or an authority records an explicit override. A rejected revision
adds its author to the set. If no eligible author remains, the coordinator MUST
escalate rather than silently readmit a locked-out author.

The separately testable lockout states are `clear`, `author-locked`,
`revision-assigned`, `revision-submitted`, `cleared`, and `deadlocked`.

This resolves a repository inconsistency: `.squad/governance.md` currently
assigns immediate revision preparation to the accountable owner, while the
reviewer protocol requires independent revision. Portable conformance follows
the stricter auditable rule; implementations using owner self-revision are
nonconforming until they declare a separate compatibility policy.

## 7. Approval and reassignment

Approval MUST identify the reviewed revision and blocker disposition. A
reviewer MUST NOT approve a revision they authored. Reassignment changes the
revision author, not the accountable owner, unless an authority separately
records ownership transfer.

## 8. Failure, idempotency, and concurrency

Invalid transitions, self-review, locked-out revision authors, missing blocker
evidence, stale artifact revisions, and duplicate event IDs fail closed.
Repeating an idempotency key returns the original result. Concurrent events use
the prior event ID and artifact revision as compare-and-swap conditions.

## 9. Versioning and extensions

Consumers MUST reject unsupported profile versions and unknown mandatory
states. Namespaced evidence fields are preserved. New advisory event types MAY
be added compatibly; changing transition eligibility requires a new profile.

## 10. Security, privacy, and authority

Governance evidence does not grant repository permissions. Actors and
reviewers MUST be authenticated by the executing environment. Records SHOULD
reference evidence rather than duplicate secrets, private logs, or personal
data.

## 11. Conformance

Conformance requires fixtures for approval, advisory feedback, rejection,
lockout, repeated rejection, reassignment, escalation, deadlock, stale events,
duplicate retries, and external-check gating.
