# Squad Ceremony Profile v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-ceremony/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** The SDK builder preserves arbitrary trigger strings
and schedule text. Existing tests demonstrate `manual`, `schedule`, and an
event name (`pr-merged`); they do not prove runtime cooldown enforcement.

**Known deviations:** Legacy `auto` is ambiguous, event names are not
normalized, and cooldown currently has schedule-cadence evidence only.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Artifact:** `ceremonies.md` or an equivalent manifest selected by an API

## 1. Scope and non-goals

This profile defines observable ceremony declarations, triggers, cooldowns,
participants, decisions, actions, and completion records. It does not
standardize meeting culture, agenda prose, facilitation prompts, timekeeping
style, consensus, or synchronous human attendance.

## 2. Declaration model

A ceremony declares ID, enabled state, trigger mode, timing, condition
reference, facilitator selector, participant selectors, cooldown policy, input
record kinds, and output requirements. Canonical trigger modes are `manual`,
`schedule`, and `event:<name>`. Existing bare event names such as `pr-merged`
map to `event:pr-merged`. Legacy `auto` is accepted only as ambiguous compatible
input and requires an implementation mapping to either a named event or a
schedule. Natural-language conditions may be preserved but are
noncanonical unless paired with a namespaced deterministic evaluator.

Participant selectors are `accountable-owner`, `all-involved`,
`all-relevant`, or explicit member IDs. Resolution must produce the exact
participant set used.

## 3. Execution record

Every run records ceremony ID, run ID, trigger evidence, input revisions,
facilitator, participants, start and completion times, status, decisions,
actions, and next eligible time. Decisions and actions require stable IDs,
owners, and dispositions.

## 4. State transitions

`eligible -> claimed -> running -> completed|failed|cancelled`

Cooldown begins at terminal completion. A run during cooldown is `suppressed`
with evidence and must not create a second active claim. Failure policy is
`blocking` or `advisory`; advisory failure may permit the surrounding workflow
to continue but must remain visible.

## 5. Candidate operations and roles

Candidate operations are `ceremony.consume`, `ceremony.evaluate`,
`ceremony.facilitate`, and `ceremony.record`. The facilitator structures the
run; participants provide inputs; the recorder persists outcomes; the
coordinator enforces claim and cooldown.

## 6. Canonical and compatible behavior

Canonical declarations use deterministic trigger references and participant
selectors. Compatible consumers may ingest current Markdown tables and free
text conditions but must classify evaluator-dependent behavior as informative.

## 7. Diagnostics, idempotency, and concurrency

Unknown members, unresolved selectors, overlapping claims, missing required
outputs, invalid cooldown, and stale input revisions are explicit failures.
The tuple `(ceremony ID, trigger event ID, input revision set)` is idempotent.
Claims require compare-and-swap so only one executor runs a ceremony instance.

## 8. Versioning, extensions, security, and privacy

Agenda and output extensions use namespaces and round-trip. Ceremony prose is
untrusted and cannot grant tools or authorization. Records should minimize
personal attendance data and must not copy secrets from source records.

## 9. Promotion criteria

Publish a manifest covering normalized manual, named-event, schedule, and
legacy-`auto` inputs; selector resolution; injected-clock cooldown suppression;
advisory and blocking failures; duplicate claims; stale inputs; and
decision/action output validation.
