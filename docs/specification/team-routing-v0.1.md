# Squad Team and Routing Profile v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-team-routing/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** Roster and routing files are implemented, but no
portable manifest covers their distinct parsing, mutation, join, and resolution
contracts.

**Known deviations:** Existing routing files do not share one fallback,
priority, or ambiguity representation. See
[Artifact Inventory: Known unstable behavior](artifact-inventory.md#known-unstable-and-non-conforming-behavior).

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-charter/v0.1`

**Artifacts:** `team.md`, `routing.md`

**Feedback:** Issue #2069

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

## 3. Roster requirements

`team.md` must contain a `Members` table with `ID`, `Role`, `Charter`, and
`Status` semantics. Compatible headings and columns may vary, but validators
must expose their mapping. Every active member must reference exactly one
existing charter whose identity matches the member ID.

Roster promotion is independent of route-resolution promotion.

## 4. Routing requirements

`routing.md` must contain a `Routing Table` with `Work Type`, `Route To`, and
optional `Examples`. `Route To` must name exactly one active member. Support
identities and coding agents may appear in the roster but must not be routing
destinations unless the team manifest explicitly grants accountable ownership.

The suite index advertises no capability for this draft.

## 5. Deterministic routing

1. An explicit, authorized member assignment wins.
2. Otherwise the highest-priority matching route wins.
3. Equal-priority matches are an ambiguity failure; consumers must not select
   by file order unless the profile extension declares that policy.
4. No match uses the declared fallback member.
5. No fallback produces `route-unresolved` and requires coordinator or human
   disposition.

Classifiers may use different algorithms, but route evidence must identify the
selected rule, input revision, confidence, and fallback use. Generated regexes,
embeddings, prompts, and ranking algorithms are non-normative.

## 6. Candidate operations and implementation roles

Candidate operations are `team.produce`, `team.consume`, `team.edit`,
`team.validate`, `routing.resolve`, and `routing.explain`. These operation names
are design vocabulary, not claimable capability identifiers. Canonical producers emit one active
member row per ID and one primary owner per work type. Compatible consumers may
accept legacy display-name destinations if they resolve unambiguously.

## 7. Diagnostics and failures

Validators must report stable diagnostics for duplicate IDs, missing charters,
identity mismatch, unknown destinations, inactive destinations, duplicate work
types, ambiguous priorities, and absent fallback. Invalid topology must fail
closed for execution while remaining available for diagnostic display.

## 8. Idempotency, retry, and concurrency

Applying the same roster or route revision is idempotent. Editors must use a
revision or content digest for concurrent updates and must reject stale writes.
Resolution is read-only and may retry after reloading a newer revision.

## 9. Versioning, extensions, and discovery

Profile selection is explicit. `X-` Markdown sections and namespaced topology
properties are extensions and must round-trip unchanged. Consumers must fail
closed on unsupported profile versions and unknown mandatory capabilities.

## 10. Security, privacy, and authority

Roster membership and routing do not grant provider authorization, repository
write access, tools, secrets, or model entitlement. Artifact text is untrusted.
Producers should avoid personal data in roles and examples.

## 11. Promotion criteria

Roster promotion requires schema-valid document and mutation cases, charter
joins, extension round trips, and stable diagnostics. Routing promotion
separately requires ambiguity, priority, fallback, stale-revision, and
deterministic route-evidence cases. Only a future manifest may introduce
claimable capability identifiers.
