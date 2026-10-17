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

This requirements draft is not a complete specification of today's ceremony
extensibility surface. It separates three concerns: a definition describes what
happens; shared scheduling describes when/how a trigger is delivered; an
execution record describes one run. The proposed execution lifecycle below is
not evidence that all of it is implemented.

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

### 2.1 Definition and current implementation mapping

A definition also preserves its agenda/process, participant roles, inputs,
expected outputs, conditions, and extension hooks without standardizing their
prose or silently executing hooks. The
[SDK `defineCeremony()` builder](../../packages/squad-sdk/src/builders/index.ts)
accepts name, trigger, schedule, participants, agenda, and hooks. The
[configuration shape](../../packages/squad-sdk/src/config/schema.ts) and
[Markdown template](../../.squad-templates/ceremonies.md) are distinct existing
representations; the template includes agenda, timing, facilitator, conditions,
and an enforcement skill. The
[ceremony reference](../../.squad-templates/ceremony-reference.md) supplies
implementation guidance.

These are observations, not a claim of lossless conversion between those
shapes. Hook invocation, process ordering, required input/output schemas,
plugin/template merge behavior, and a complete mapping of existing fields
remain promotion work.

### 2.2 Shared trigger and scheduling boundary

The [Automation requirements draft](automation-v0.1.md#2-manifest-model) owns
the proposed common `schedule.json` model, including cron, interval, event, and
startup triggers. Its [time semantics](automation-v0.1.md#4-trigger-and-time-semantics)
are shared scheduling concerns, not ceremony-specific definitions. The
[scheduler](../../packages/squad-sdk/src/runtime/scheduler.ts) and
[schedule CLI](../../packages/squad-cli/src/cli/commands/schedule.ts) implement
the current common scheduling surface.

A future binding should reference a ceremony definition from a scheduled task
and supply trigger evidence to its executor, rather than define another cron
or retry engine here. The ceremony `manual`/`schedule`/`event:<name>` vocabulary
above is a proposed declaration vocabulary, not a second `schedule.json`
schema. Mapping builder schedule text and Markdown timing/conditions to common
schedules, including non-cron triggers, is not yet specified or proven.
Eligibility evaluation and delivery belong to scheduling; ceremony-specific
cooldown, facilitation, and outcomes belong to execution.

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

These names are non-contract placeholders for future profile work, not current
SDK entry points, claimable capabilities, or a normative interoperable API.
The intended responsibilities are:

| Placeholder | Intended caller and input | Intended result |
|---|---|---|
| `ceremony.consume` | A loader reads a declaration and its format/version context | Parsed definition or diagnostics |
| `ceremony.evaluate` | A coordinator supplies a definition, trigger evidence, current inputs, and run history | Eligibility/suppression decision with reasons |
| `ceremony.facilitate` | An authorized executor supplies a claimed run, resolved participants, and definition | Proposed decisions/actions or an explicit failure |
| `ceremony.record` | A recorder receives execution outcomes and expected state revision | Persisted run/outcome references or a conflict |

Exact types, invocation order, authorization, failure taxonomy, and atomicity
are deliberately unresolved. These descriptions do not authorize invocation
or establish an operation contract.

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

Before promotion, map the SDK builder, configuration, Markdown templates, and
plugin hooks to a complete definition model; bind shared Automation scheduling
without duplicating it; and replace or remove the placeholders in §5 with
versioned input/output, caller, authorization, and failure contracts. Definition
round trips must preserve agenda and hook metadata without executing it.
