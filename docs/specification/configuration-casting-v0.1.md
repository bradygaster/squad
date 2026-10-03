# Squad Configuration and Casting Profile v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-configuration-casting/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** Configuration loaders, casting registries, and
history records exist, but they do not share one portable manifest.

**Known deviations:** Legacy registry shapes and runtime-only configuration
keys remain accepted. See the
[inventory deviation matrix](artifact-inventory.md#known-unstable-and-non-conforming-behavior).

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Artifacts:** `config.json`, `casting/registry.json`, `casting/policy.json`,
`casting/history.json`

## 1. Scope and non-goals

This profile defines portable configuration selection, cast identity
provenance, revisions, and roster joins. It does not standardize themed
universes, character-selection scoring, UI choices, provider credentials, or
internal migration algorithms.

Configuration, casting identity, and provenance are separate promotion units.
Casting aesthetics are an informative, independently versioned extension and
do not define authority.

## 2. Configuration requirements

`config.json` is authored configuration intent. Portable configuration covers
declared values, precedence, and source evidence. Runtime-only keys and
provider catalogs remain implementation policy.

## 3. Casting identity requirements

`casting/registry.json` is the current cast identity authority.
`casting/policy.json` constrains allowed naming behavior but does not itself
create members.

Every registry document must declare a schema identifier, schema version,
monotonic revision, generation timestamp, and agent map keyed by member ID.
Each agent entry must include display name, persistent name, accountable role,
universe or naming source, status, creation time, and update time.

## 4. Provenance requirements

`casting/history.json` is append-only provenance and does not override the
registry. Each history entry records the operation, prior and result revision,
actor, time, and identity joins needed to reproduce the change.

## 5. Precedence and joins

Portable configuration precedence is:

1. explicit operation input;
2. session-scoped user intent;
3. repository `config.json`;
4. charter preference;
5. runtime automatic policy.

Lower layers must not overwrite higher-layer authored intent. A value of
`auto` requests runtime selection and is not a concrete override.

Registry IDs must join to active team IDs. Recasting may change display names
but must preserve member IDs unless an explicit identity migration is recorded.

## 6. State transitions

`unregistered -> active -> inactive -> retired` is the portable lifecycle.
`retired -> active` requires a new revision and explicit reactivation evidence.
Every mutation increments `revision` exactly once and appends history with the
operation ID, prior revision, resulting revision, actor, and timestamp.

## 7. Candidate operations and roles

Candidate operations are `config.consume`, `config.edit`, `casting.produce`,
`casting.validate`, `casting.recast`, and `casting.migrate`. They are not
claimable capabilities. Producers create
revisions; validators check joins and monotonicity; executors apply an
authorized cast operation.

## 8. Canonical, compatible, and failure behavior

Canonical documents use declared schemas and complete provenance. Compatible
consumers may ingest older registry shapes but must report the migration and
must not fabricate provenance. Unknown configuration keys are preserved as
namespaced extensions. Invalid joins, revision regression, duplicate persistent
names where uniqueness is required, or stale writes fail closed.

## 9. Idempotency, retry, and concurrency

Operations must carry an idempotency key. Repeating a completed key returns the
same resulting revision. Concurrent writers must compare the expected registry
revision; a mismatch returns `stale-revision` without partial mutation.

## 10. Versioning and extensions

Artifact schema versions and this profile version are independent. Consumers
must negotiate each supported schema. Namespaced policy and registry fields
must round-trip unchanged.

## 11. Security, privacy, and trust

Configuration is not authorization. Model names, tools, repositories, and
providers are requests subject to runtime policy. Registry content must not
contain credentials. Theme or persona text is untrusted and must not grant
capabilities.

## 12. Promotion criteria

Configuration promotion requires precedence and source-evidence cases. Casting
promotion separately requires identity, join, recast, and migration cases.
Provenance promotion requires append-only history, revision, replay,
extension-preservation, and stale-write cases. A future manifest must keep
these claims independently selectable.
