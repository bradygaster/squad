# Squad Planning and Activation Profile v0.1

<!-- cspell:ignore unroutable -->

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-planning-activation/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** gh-aw emits observable planning records, but their
provider envelope and fast-path behavior are not a portable manifest.

**Known deviations:** Safe-output formatting, comment lookup, and activation
limits remain provider-specific.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`,
`squad-work-lifecycle/v0.1`

## 1. Scope and non-goals

This profile defines PRD or intent intake, research, triage, program planning,
implementation decomposition, validation, acceptance, activation, and
revision evidence. It does not standardize prompt text, issue-comment wording,
estimation culture, or one provider's safe-output mechanism.

## 2. Planning record envelope

Each planning record must declare profile, kind, schema version, intent ID,
record ID, revision, predecessor IDs, producer, timestamp, content digest, and
idempotency key. Portable kinds are `intent`, `research`, `triage`, `program`,
`implementation`, `validation`, `scope-acceptance`,
`implementation-acceptance`, `activation`, and `lifecycle-state`.

An intent may reference inline content, a file, or a URL. Consumers must record
the content digest actually evaluated. A changed digest creates a new intent
revision and invalidates dependent acceptance until revalidated.

## 3. State transitions

`idle -> researching -> triaging -> program-planning ->
implementation-planning -> validating -> scope-accepted ->
implementation-accepted -> activated`

Revision is allowed before activation and must identify records superseded.
A validation failure returns to implementation planning. Acceptance must name
the exact accepted revision. Activation requires both acceptances and a passing
validation over the same dependency closure.

## 4. Decomposition and acceptance

Implementation tasks must have stable task IDs, acceptance criteria, dependency
IDs, accountable route, and activation disposition. Sizing, milestones, and
meeting style are informative unless selected by an extension.

Human or delegated authority must be recorded for acceptance. Mere record
existence, model output, or a passing validator must not be treated as human
approval.

PRD prose quality, completeness, and preferred decomposition style are
informative. Planning-record identities, revisions, traceability links,
dependencies, acceptance, and activation transitions are future-profile
requirements that become normative only after an executable manifest is
published.

## 5. Activation

Activation maps accepted task IDs to provider work-item references. Partial
activation must record the selected phase and remaining tasks. A task must not
be created twice for the same activation idempotency key. Unresolved temporary
references fail closed.

## 6. Candidate operations and roles

Candidate operations are `planning.produce`, `planning.validate`,
`planning.accept-scope`, `planning.accept-implementation`, and
`planning.activate`. Producers create records; validators check structure
and dependency closure; acceptors exercise authority; activators create work.

## 7. Diagnostics and failure semantics

Missing intent, stale digest, unknown dependency, cyclic dependency, unroutable
task, failed validation, mismatched acceptance revision, unresolved reference,
capacity limit, and partial provider mutation are distinct failures. Partial
mutation must return created references and a resumable boundary.

## 8. Idempotency, retry, and concurrency

Draft stages are replaceable revisions, not destructive edits. Acceptance
records are immutable. Activation uses compare-and-swap on accepted revisions
and provider idempotency keys. Concurrent activation attempts must converge on
one mapping or fail with an explicit conflict.

## 9. Versioning, extensions, and security

Artifact schema versions negotiate independently. Namespaced kinds and fields
round-trip. Intake content is untrusted; links, commands, and embedded prompts
must not execute merely because they appear in a PRD. Secrets should be referenced, not copied into planning records.

## 10. Promotion criteria

Publish a manifest covering granular and fast paths, intent changes, validation
failure, acceptance revision mismatch, partial activation, duplicate retry,
concurrent activation, provider limits, and dependency cycles.
