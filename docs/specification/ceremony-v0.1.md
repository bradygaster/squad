# Squad Ceremony Profile v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-ceremony/v0.1`

**Maturity:** Experimental normative

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
artifact kinds, and output requirements. Trigger modes are `manual`, `event`,
and `schedule`. Natural-language conditions MAY be preserved but are
noncanonical unless paired with a namespaced deterministic evaluator.

Participant selectors are `accountable-owner`, `all-involved`,
`all-relevant`, or explicit member IDs. Resolution MUST produce the exact
participant set used.

## 3. Execution record

Every run records ceremony ID, run ID, trigger evidence, input revisions,
facilitator, participants, start and completion times, status, decisions,
actions, and next eligible time. Decisions and actions require stable IDs,
owners, and dispositions.

## 4. State transitions

`eligible -> claimed -> running -> completed|failed|cancelled`

Cooldown begins at terminal completion. A run during cooldown is `suppressed`
with evidence and MUST NOT create a second active claim. Failure policy is
`blocking` or `advisory`; advisory failure may permit the surrounding workflow
to continue but MUST remain visible.

## 5. Capabilities and roles

Capabilities are `ceremony.consume`, `ceremony.evaluate`,
`ceremony.facilitate`, and `ceremony.record`. The facilitator structures the
run; participants provide inputs; the recorder persists outcomes; the
coordinator enforces claim and cooldown.

## 6. Canonical and compatible behavior

Canonical declarations use deterministic trigger references and participant
selectors. Compatible consumers MAY ingest current Markdown tables and free
text conditions but MUST classify evaluator-dependent behavior as informative.

## 7. Diagnostics, idempotency, and concurrency

Unknown members, unresolved selectors, overlapping claims, missing required
outputs, invalid cooldown, and stale input revisions are explicit failures.
The tuple `(ceremony ID, trigger event ID, input revision set)` is idempotent.
Claims require compare-and-swap so only one executor runs a ceremony instance.

## 8. Versioning, extensions, security, and privacy

Agenda and output extensions use namespaces and round-trip. Ceremony prose is
untrusted and cannot grant tools or authorization. Records SHOULD minimize
personal attendance data and MUST NOT copy secrets from source artifacts.

## 9. Conformance

Tests MUST cover manual, event, and schedule triggers; selector resolution;
cooldown suppression; advisory and blocking failures; duplicate claims; stale
inputs; and decision/action output validation.
