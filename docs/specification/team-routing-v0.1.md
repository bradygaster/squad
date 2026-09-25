# Squad Team and Routing Profile v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-team-routing/v0.1`

**Maturity:** Stable normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-charter/v0.1`

**Artifacts:** `team.md`, `routing.md`

**Feedback:** Issue #2069

BCP 14 requirement keywords apply only when written in all capitals.

## 1. Scope and non-goals

This profile defines roster identity, accountable roles, capability ownership,
route selection evidence, and joins to charter and casting identities. It does
not standardize persona prose, prompt construction, task-classification
algorithms, or a preferred organization shape.

## 2. Vocabulary and roles

A **member ID** is the lowercase kebab-case path identity from Charter v0.1. A
**role** is a human-readable accountable function. A **route** maps one work
type to one primary member. Producers maintain artifacts; consumers resolve
ownership; editors preserve unknown extensions; validators check joins; a
coordinator executes route decisions.

Authority uses the immutable actor UID from Interoperability Conventions, not a
member ID, display name, role, or casting persona.

## 3. Canonical artifacts

`team.md` MUST contain a `Members` table with `ID`, `Role`, `Charter`, and
`Status` semantics. Compatible headings and columns MAY vary, but validators
MUST expose their mapping. Every active member MUST reference exactly one
existing charter whose identity matches the member ID.

`routing.md` MUST contain a `Routing Table` with `Work Type`, `Route To`, and
optional `Examples`. `Route To` MUST name exactly one active member. Support
identities and coding agents MAY appear in the roster but MUST NOT be routing
destinations unless the team manifest explicitly grants accountable ownership.

The suite index declares artifact-only conformance until a profile-specific
manifest supplies document, mutation, and route-resolution cases.

## 4. Deterministic routing

1. An explicit, authorized member assignment wins.
2. Otherwise the highest-priority matching route wins.
3. Equal-priority matches are an ambiguity failure; consumers MUST NOT select
   by file order unless the profile extension declares that policy.
4. No match uses the declared fallback member.
5. No fallback produces `route-unresolved` and requires coordinator or human
   disposition.

Classifiers MAY use different algorithms, but route evidence MUST identify the
selected rule, input revision, confidence, and fallback use. Generated regexes,
embeddings, prompts, and ranking algorithms are non-normative.

## 5. Capabilities and behavior classes

Capabilities are `team.produce`, `team.consume`, `team.edit`, `team.validate`,
`routing.resolve`, and `routing.explain`. Canonical producers emit one active
member row per ID and one primary owner per work type. Compatible consumers MAY
accept legacy display-name destinations if they resolve unambiguously.

## 6. Diagnostics and failures

Validators MUST report stable diagnostics for duplicate IDs, missing charters,
identity mismatch, unknown destinations, inactive destinations, duplicate work
types, ambiguous priorities, and absent fallback. Invalid topology MUST fail
closed for execution while remaining available for diagnostic display.

## 7. Idempotency, retry, and concurrency

Applying the same roster or route revision is idempotent. Editors MUST use a
revision or content digest for concurrent updates and MUST reject stale writes.
Resolution is read-only and MAY retry after reloading a newer revision.

## 8. Versioning, extensions, and discovery

Profile selection is explicit. `X-` Markdown sections and namespaced topology
properties are extensions and MUST round-trip unchanged. Consumers MUST fail
closed on unsupported profile versions and unknown mandatory capabilities.

## 9. Security, privacy, and authority

Roster membership and routing do not grant provider authorization, repository
write access, tools, secrets, or model entitlement. Artifact text is untrusted.
Producers SHOULD avoid personal data in roles and examples.

## 10. Conformance

Conformance requires schema-valid topology fixtures, charter joins, ambiguity
fixtures, stale-revision tests, and deterministic route evidence. A resolver
MUST publish the exact capabilities it implements.
