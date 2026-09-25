# Squad State and Memory Requirements v0.1

**Status:** Informative Requirements Draft

**Document class:** Informative; not a conformance profile

**Requirements identifier:** `squad-state-memory-requirements/v0.1`

**Maturity:** Informative and volatile

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`

## 1. Problem statement

Squad currently supports worktree files, git-native orphan references,
two-layer state, external stubs, storage providers, memory classifications, and
provider-specific search. These implementations expose useful seams, but they
do not yet share enough observable recovery and authority evidence for a
truthful normative schema.

## 2. Required future semantics

A promoted profile needs to define:

- one selected backend and explicit authority for each state collection;
- stable collection and record identities independent of backend paths;
- persistence, durability, and visibility guarantees;
- compare-and-swap revisions and conflict evidence;
- append, replace, delete, archive, and tombstone semantics;
- startup verification, degraded mode, circuit breaking, and recovery;
- migration and rollback between backends without split-brain authority;
- memory classification before provider dispatch;
- provider availability, search provenance, deletion, retention, and audit;
- trust boundaries among repository state, host-injected services, and remote
  providers;
- encryption, secrets, privacy, redaction, and data residency declarations.

## 3. Provisional authority rules

Static configuration and normative artifacts remain file-authoritative unless a
profile says otherwise. Mutable state MUST have exactly one authority backend
per collection. Mirrors and caches MUST identify their source revision and MUST
NOT accept writes while authority is ambiguous.

Memory classification MUST precede durable or external writes. Forbidden and
transient content MUST NOT reach a durable provider. Provider failures MUST be
observable and MUST NOT silently convert a denied write into local success.

## 4. Candidate portable operations

The likely operation set is `read`, `list`, `compare-and-swap-write`, `append`,
`delete`, `archive`, `health`, `migrate`, `recover`, `classify`, `search`, and
`promote`. Each operation needs request IDs, actor, expected revision, result
revision, backend identity, diagnostics, and idempotency semantics.

## 5. Security and privacy requirements

Backends must prevent path traversal and unauthorized ref access. Audit records
should omit content by default. External providers require explicit enablement,
authorization, retention disclosure, deletion behavior, and secret filtering.
Recovery tools must not leak state from another repository, worktree, user, or
account.

## 6. Promotion criteria

This document may become `squad-state-memory/v0.1` only after:

1. language-neutral fixtures exercise the same collection operations against
   local files, orphan refs, two-layer state, and one external provider;
2. compare-and-swap, duplicate retry, crash recovery, migration, rollback, and
   split-brain tests have common expected results;
3. authority discovery and degraded-mode behavior are independently specified;
4. memory classification and provider dispatch have stable vocabularies;
5. a security review covers traversal, ref isolation, secrets, retention,
   deletion, and cross-tenant leakage.

## 7. Intentionally deferred details

Git plumbing, SQLite layout, index algorithms, embeddings, ranking, cache
format, circuit-breaker constants, prompt-only fallback, and provider product
names remain implementation policy.
