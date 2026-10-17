# Squad Governance and Review Profile v0.1

**Status:** Working Draft

**Document class:** Normative experimental evidence schema; transition profile
requirements remain non-claimable

**Profile identifier:** `squad-governance-review/v0.1`

**Maturity:** Experimental schema; non-claimable

**Claimable capabilities:** None

**Implementation status:** The shared evidence schema validates representative
governance transitions. No executable transition manifest is registered.

**Known deviations:** The rejected baseline allowed owner self-revision in
repository governance and lacked one machine-readable transition contract.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Protocol record:** governance evidence records

## 1. Scope and non-goals

**Section status:** Informative overview.

This profile defines accountable ownership, reviewer independence, blocking
verdict evidence, rejection lockout, reassignment, escalation, approval, and
completion transitions. It does not define code-review style, preferred
feedback wording, repository merge policy, or who is authorized by a provider.

## 2. Roles and vocabulary

**Section status:** Normative vocabulary for the experimental schema and suite
relationship checks.

The **accountable owner** owns the requirement and final handoff. The **current
revision author** produced the revision receiving the represented verdict. A
**blocking reviewer** issues verdicts. A **successor revision author** is the
independent author assigned to the next revision after rejection. A
**coordinator** validates transitions. An **authority** resolves deadlock or
policy disputes.

## 3. Evidence record

**Section status:** Experimental normative contract enforced by the shared
schema and suite tests.

Every represented transition MUST use the shared evidence envelope conforming to
`test-fixtures/spec/suite-v0.1/evidence.schema.json`. Governance data includes
prior and current state, reviewed subject UID and revision, accountable owner,
current revision author, successor revision author, independent reviewer,
blockers and dispositions, lockout and eligible-author sets,
escalation/deadlock status, replay disposition, gate result, actor, timestamp,
idempotency key, replay key, expected revision, and result revision.

## 4. State machine

**Section status:** Experimental normative transition contract enforced by the
schema's transition pairs.

The deterministic states are:

`draft -> submitted -> under-review -> approved -> completed`

Rejection uses:

`under-review -> rejected -> reassignment-required -> revising -> submitted`

Escalation uses:

`rejected|reassignment-required -> escalated -> dispositioned`

Only an approved review subject with applicable external checks may become completed.
Completion does not imply provider merge unless a binding says so.

## 5. Blocking verdict contract

**Section status:** Experimental normative rejection contract enforced by
transition conditionals and mutation tests.

A rejection MUST identify review-subject location, violated requirement or invariant,
reproducible evidence or concrete failure scenario, and the minimum clearing
condition. Preference-only feedback MUST be advisory and MUST NOT trigger
lockout.

## 6. Reviewer independence and lockout state machine

**Section status:** Experimental normative relationship contract enforced by
suite relationship and mutation tests.

The blocking reviewer MUST differ from the current revision author. After a
rejection, the current revision author is added to the review-subject
revision-cycle lockout set and MUST NOT author, co-author, pair on, or direct
the next revision. The reviewer MAY clarify the blocker but MUST NOT become the
successor revision author for the same cycle. The coordinator MUST select a
successor revision author from the eligible set and outside the lockout set.

Lockout is scoped to the review subject and persists until a later revision is
approved or an authority records an explicit override. A rejected revision
adds its current revision author to the set. If no eligible successor revision
author remains, the coordinator MUST record a deadlocked escalation rather than
silently readmit a locked-out author.

The separately testable lockout states are `clear`, `author-locked`,
`revision-assigned`, `revision-submitted`, `cleared`, and `deadlocked`.

This contract intentionally differs from repository governance that assigns
immediate revision preparation to the accountable owner. The difference is a
known draft-policy incompatibility, not a published conformance verdict.

## 7. Approval and reassignment

**Section status:** Experimental normative contract enforced by transition
conditionals and mutation tests.

Approval MUST identify the reviewed revision and blocker disposition. A
reviewer MUST NOT approve a revision they authored. Reassignment changes the
successor revision author, not the accountable owner, unless an authority
separately records ownership transfer.

## 8. Failure, idempotency, and concurrency

**Section status:** Invalid transitions, self-review, locked-out successor
revision authors, and missing rejection evidence are experimental normative
contracts enforced by the schema or suite tests. Retry, storage, and
concurrency behavior remain informative future-profile requirements.

Invalid transitions, self-review, locked-out successor revision authors, and
missing blocker evidence MUST fail validation. Future execution profiles should
fail closed for stale reviewed-subject revisions and duplicate event IDs,
return the original result for a repeated idempotency key, and use the prior
event ID plus reviewed-subject revision as compare-and-swap conditions.

## 9. Versioning and extensions

**Section status:** Informative future-profile requirements.

Future consumers are expected to reject unsupported profile versions and
unknown mandatory states. Namespaced evidence fields are expected to be
preserved. New advisory event types may be added compatibly; changing
transition eligibility requires a new profile.

## 10. Security, privacy, and authority

**Section status:** Informative security requirements pending dedicated
mutation fixtures.

Governance evidence does not grant repository permissions. Actors and
reviewers are expected to be authenticated by the executing environment.
Records should reference evidence rather than duplicate secrets, private logs,
or personal data.

## 11. Promotion criteria

Publish a transition manifest with positive and negative cases for approval,
advisory feedback, rejection, lockout, repeated rejection, reassignment,
eligible successor revision authors, escalation, deadlock, stale CAS, duplicate replay,
blocker disposition, and external-check gating. The registered rejection JSON
is an example fixture, not a conformance manifest.
