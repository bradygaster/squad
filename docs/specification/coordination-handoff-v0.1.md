# Squad Coordination and Handoff Profile v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-coordination-handoff/v0.1`

**Maturity:** Experimental normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

## 1. Scope and non-goals

This profile defines portable task dispatch, handoff, result, escalation, and
session-reference envelopes. It does not standardize prompts, tool APIs,
transport, streaming, agent internals, UI notifications, or session storage.

## 2. Envelope

Every message uses the shared evidence envelope and declares message type,
message ID, correlation ID,
causation ID, sender, intended recipient or route, task or artifact reference,
input revisions, created time, expiry policy, idempotency key, and payload
digest. Types are `dispatch`, `acknowledgement`, `progress`, `result`,
`handoff`, `escalation`, and `cancellation`.

Session IDs are opaque provider references. Portable consumers MUST NOT derive
identity, authorization, or ordering from their syntax.

## 3. State transitions

`pending -> accepted -> running -> succeeded|failed|cancelled|expired`

A handoff creates a successor task linked by causation; it does not mutate the
predecessor result. An escalation identifies the blocked capability, evidence,
and requested authority. Result completion requires output references and
their revisions.

## 4. Delivery, idempotency, and ordering

Delivery is at-least-once unless a binding declares stronger guarantees.
Consumers deduplicate by message ID and operation idempotency key. Duplicate
delivery returns the original disposition. Per-correlation ordering uses
causation links, not transport arrival time. Concurrent results for one task
require an explicit winner or are a conflict.

## 5. Capabilities and roles

Capabilities are `coordination.dispatch`, `coordination.consume`,
`coordination.handoff`, `coordination.cancel`, and `coordination.recover`.
Coordinators route; workers consume and produce results; authorities resolve
escalations; recorders persist evidence.

## 6. Failure and recovery

Unknown recipient, expired task, stale input, digest mismatch, duplicate
conflict, unavailable transport, partial result, and lost session are distinct
failures. Recovery MAY create a new provider session but MUST retain the same
portable task identity and record the replacement reference.

## 7. Versioning and extensions

Bindings negotiate transports separately. Namespaced payload fields
round-trip. Unknown mandatory message types fail closed.

## 8. Security and privacy

Messages are untrusted and do not grant tools, repository access, or provider
authorization. Payloads SHOULD reference large or sensitive artifacts rather
than inline them. Credentials, hidden prompts, and secret tool results MUST NOT
appear in portable envelopes.

## 9. Conformance

Tests MUST cover duplicate delivery, out-of-order progress, stale inputs,
handoff causation, escalation, cancellation races, session loss and recovery,
and conflicting terminal results.
