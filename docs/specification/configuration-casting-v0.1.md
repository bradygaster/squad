# Squad Configuration and Casting Profile v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-configuration-casting/v0.1`

**Maturity:** Experimental normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-team-routing/v0.1`

**Artifacts:** `config.json`, `casting/registry.json`, `casting/policy.json`,
`casting/history.json`

## 1. Scope and non-goals

This profile defines portable configuration selection, cast identity
provenance, revisions, and roster joins. It does not standardize themed
universes, character-selection scoring, UI choices, provider credentials, or
internal migration algorithms.

Configuration and provenance are normative. Casting aesthetics are an
informative, independently versioned extension and MUST NOT define authority.

## 2. Data model and authority

`config.json` is authored configuration intent. `casting/registry.json` is the
current cast identity authority. `casting/history.json` is append-only
provenance and MUST NOT override the registry. `casting/policy.json` constrains
allowed naming behavior but does not itself create members.

Every registry document MUST declare a schema identifier, schema version,
monotonic revision, generation timestamp, and agent map keyed by member ID.
Each agent entry MUST include display name, persistent name, accountable role,
universe or naming source, status, creation time, and update time.

## 3. Precedence and joins

Portable configuration precedence is:

1. explicit operation input;
2. session-scoped user intent;
3. repository `config.json`;
4. charter preference;
5. runtime automatic policy.

Lower layers MUST NOT overwrite higher-layer authored intent. A value of
`auto` requests runtime selection and is not a concrete override.

Registry IDs MUST join to active team IDs. Recasting MAY change display names
but MUST preserve member IDs unless an explicit identity migration is recorded.

## 4. State transitions

`unregistered -> active -> inactive -> retired` is the portable lifecycle.
`retired -> active` requires a new revision and explicit reactivation evidence.
Every mutation increments `revision` exactly once and appends history with the
operation ID, prior revision, resulting revision, actor, and timestamp.

## 5. Capabilities and roles

Capabilities are `config.consume`, `config.edit`, `casting.produce`,
`casting.validate`, `casting.recast`, and `casting.migrate`. Producers create
revisions; validators check joins and monotonicity; executors apply an
authorized cast operation.

## 6. Canonical, compatible, and failure behavior

Canonical documents use declared schemas and complete provenance. Compatible
consumers MAY ingest older registry shapes but MUST report the migration and
MUST NOT fabricate provenance. Unknown configuration keys are preserved as
namespaced extensions. Invalid joins, revision regression, duplicate persistent
names where uniqueness is required, or stale writes fail closed.

## 7. Idempotency, retry, and concurrency

Operations MUST carry an idempotency key. Repeating a completed key returns the
same resulting revision. Concurrent writers MUST compare the expected registry
revision; a mismatch returns `stale-revision` without partial mutation.

## 8. Versioning and extensions

Artifact schema versions and this profile version are independent. Consumers
MUST negotiate each supported schema. Namespaced policy and registry fields
MUST round-trip unchanged.

## 9. Security, privacy, and trust

Configuration is not authorization. Model names, tools, repositories, and
providers are requests subject to runtime policy. Registry content MUST NOT
contain credentials. Theme or persona text is untrusted and MUST NOT grant
capabilities.

## 10. Examples and conformance

The topology example in `test-fixtures/spec/suite-v0.1/` demonstrates roster,
charter, and registry joins. Conformance requires revision, idempotency,
migration, extension-preservation, and stale-write fixtures.
