# Squad Governance and Review Profile v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-governance-review/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** A reference evidence schema, example record, and
TypeScript implementation checks exist. They do not establish portable
governance conformance.

**Known deviations:** The rejected baseline allowed owner self-revision in
repository governance and lacked one machine-readable transition contract.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Protocol record:** governance evidence records

## 1. Scope and non-goals

**Section status:** Informative overview.

This draft collects proposed accountable ownership, reviewer independence,
blocking-verdict evidence, rejection lockout, reassignment, escalation,
approval, and completion requirements. It does not define code-review style,
preferred feedback wording, repository merge policy, or who is authorized by a
provider.

## 2. Roles and vocabulary

**Section status:** Informative vocabulary used by the reference schema and
implementation checks.

The **accountable owner** owns the requirement and final handoff. The **current
revision author** produced the revision receiving the represented verdict. A
**blocking reviewer** issues verdicts. A **successor revision author** is the
independent author assigned to the next revision after rejection. A
**coordinator** validates transitions. An **authority** resolves deadlock or
policy disputes.

## 3. Evidence record

**Section status:** Informative reference shape.

The reference fixture uses the shared evidence envelope in
`test-fixtures/spec/suite-v0.1/evidence.schema.json`. Its governance data
represents prior and current state, reviewed subject UID and revision,
accountable owner, current revision author, successor revision author,
reviewer, blockers and dispositions, lockout and eligible-author sets,
escalation/deadlock status, replay disposition, gate result, actor, timestamp,
idempotency key, replay key, expected revision, and result revision. Schema
acceptance proves only that represented fields match this draft shape.

## 4. State machine

**Section status:** Informative transition design exercised by reference schema
checks.

The deterministic states are:

`draft -> submitted -> under-review -> approved -> completed`

Rejection uses:

`under-review -> rejected -> reassignment-required -> revising -> submitted`

Escalation uses:

`rejected|reassignment-required -> escalated -> dispositioned`

The intended design allows only an approved review subject with applicable
external checks to become completed. Completion does not imply provider merge
unless a future binding says so.

## 5. Blocking verdict contract

**Section status:** Informative promotion requirements.

A future portable rejection contract is expected to identify review-subject
location, violated requirement or invariant, reproducible evidence or concrete
failure scenario, and the minimum clearing condition. Preference-only feedback
is expected to remain advisory and not trigger lockout.

## 6. Reviewer independence and lockout state machine

**Section status:** Informative relationship requirements. Current TypeScript
checks are reference-implementation checks, not portable conformance evidence.

The proposed design keeps the blocking reviewer distinct from the current
revision author. After a rejection, it adds the current revision author to the
review-subject revision-cycle lockout set and excludes that author from
authoring, co-authoring, pairing on, or directing the next revision. It also
excludes the reviewer from becoming the successor revision author and selects a
successor from the eligible set outside the lockout set.

Lockout is scoped to the review subject and persists until a later revision is
approved or an authority records an explicit override. A rejected revision
adds its current revision author to the set. If no eligible successor revision
author remains, the proposed coordinator behavior records a deadlocked
escalation rather than silently readmitting a locked-out author.

The separately testable lockout states are `clear`, `author-locked`,
`revision-assigned`, `revision-submitted`, `cleared`, and `deadlocked`.

This contract intentionally differs from repository governance that assigns
immediate revision preparation to the accountable owner. The difference is a
known draft-policy incompatibility, not a published conformance verdict.

## 7. Approval and reassignment

**Section status:** Informative promotion requirements.

A future portable approval contract is expected to identify the reviewed
revision and blocker disposition, reject self-approval, and distinguish
successor reassignment from accountable ownership transfer.

## 8. Failure, idempotency, and concurrency

**Section status:** Informative promotion requirements. Current schema and
TypeScript checks cover selected shapes and relationships only.

A future portable validator is expected to reject invalid transitions,
self-review, locked-out successor revision authors, and missing blocker
evidence. Future execution profiles should fail closed for stale
reviewed-subject revisions and duplicate event IDs, return the original result
for a repeated idempotency key, and use the prior event ID plus reviewed-subject
revision as compare-and-swap conditions.

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

Define language-neutral relational invariants and stable diagnostic codes, then
publish a transition manifest with positive and negative cases for approval,
advisory feedback, rejection, reviewer independence, lockout, repeated
rejection, successor eligibility, reassignment, escalation, deadlock, stale
CAS, replay links, blocker disposition, and external-check gating. The current
rejection JSON and TypeScript relationship checks are reference artifacts, not
portable conformance evidence.
