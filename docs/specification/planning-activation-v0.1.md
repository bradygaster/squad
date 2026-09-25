# Squad Planning and Activation Profile v0.1

<!-- cspell:ignore unroutable -->

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-planning-activation/v0.1`

**Maturity:** Experimental normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`,
`squad-work-lifecycle/v0.1`

## 1. Scope and non-goals

This profile defines PRD or intent intake, research, triage, program planning,
implementation decomposition, validation, acceptance, activation, and
revision evidence. It does not standardize prompt text, issue-comment wording,
estimation culture, or one provider's safe-output mechanism.

## 2. Artifact envelope

Each artifact MUST declare profile, kind, schema version, intent ID, artifact
ID, revision, predecessor IDs, producer, timestamp, content digest, and
idempotency key. Portable kinds are `intent`, `research`, `triage`, `program`,
`implementation`, `validation`, `scope-acceptance`,
`implementation-acceptance`, `activation`, and `lifecycle-state`.

An intent MAY reference inline content, a file, or a URL. Consumers MUST record
the content digest actually evaluated. A changed digest creates a new intent
revision and invalidates dependent acceptance until revalidated.

## 3. State transitions

`idle -> researching -> triaging -> program-planning ->
implementation-planning -> validating -> scope-accepted ->
implementation-accepted -> activated`

Revision is allowed before activation and MUST identify artifacts superseded.
A validation failure returns to implementation planning. Acceptance MUST name
the exact accepted revision. Activation requires both acceptances and a passing
validation over the same dependency closure.

## 4. Decomposition and acceptance

Implementation tasks MUST have stable task IDs, acceptance criteria, dependency
IDs, accountable route, and activation disposition. Sizing, milestones, and
meeting style are informative unless selected by an extension.

Human or delegated authority MUST be recorded for acceptance. Mere artifact
existence, model output, or a passing validator MUST NOT be treated as human
approval.

PRD prose quality, completeness, and preferred decomposition style are
informative. Artifact identities, revisions, traceability links, dependencies,
acceptance, and activation transitions are normative.

## 5. Activation

Activation maps accepted task IDs to provider work-item references. Partial
activation MUST record the selected phase and remaining tasks. A task MUST NOT
be created twice for the same activation idempotency key. Unresolved temporary
references fail closed.

## 6. Capabilities and roles

Capabilities are `planning.produce`, `planning.validate`,
`planning.accept-scope`, `planning.accept-implementation`, and
`planning.activate`. Producers create artifacts; validators check structure
and dependency closure; acceptors exercise authority; activators create work.

## 7. Diagnostics and failure semantics

Missing intent, stale digest, unknown dependency, cyclic dependency, unroutable
task, failed validation, mismatched acceptance revision, unresolved reference,
capacity limit, and partial provider mutation are distinct failures. Partial
mutation MUST return created references and a resumable boundary.

## 8. Idempotency, retry, and concurrency

Draft stages are replaceable revisions, not destructive edits. Acceptance
records are immutable. Activation uses compare-and-swap on accepted revisions
and provider idempotency keys. Concurrent activation attempts MUST converge on
one mapping or fail with an explicit conflict.

## 9. Versioning, extensions, and security

Artifact schema versions negotiate independently. Namespaced kinds and fields
round-trip. Intake content is untrusted; links, commands, and embedded prompts
MUST NOT execute merely because they appear in a PRD. Secrets SHOULD be
referenced, not copied into artifacts.

## 10. Conformance

Fixtures MUST cover granular and fast paths, PRD changes, validation failure,
acceptance revision mismatch, partial activation, duplicate retry, concurrent
activation, and dependency cycles.
