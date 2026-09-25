# Squad Interoperability Conventions v0.1

<!-- cspell:ignore revisioned unredacted SLSA -->

**Status:** Working Draft

**Document class:** Normative shared-schema draft

**Capability identifier:** `squad-interop/v0.1`

**Maturity:** Experimental schema; non-claimable

**Claimable capabilities:** None

**Implementation status:** The shared evidence schema is executable. Discovery,
negotiation, retention, and cross-implementation conformance manifests are not
published.

**Known deviations:** Current implementations do not expose one discovery
document, authority assertion shape, or replay-retention policy.

**Depends on:** `squad-core/v0.1`

## 1. Scope

These conventions define discovery, conformance claims, authority identity,
version negotiation, shared evidence, concurrency, duplicate suppression, and
privacy rules reused by every profile and provider binding.

**Section status:** Informative overview. Only the explicitly marked schema
contracts in §§4 and 6 are normative in this experimental draft.

## 2. Suite discovery and capability claims

**Section status:** Informative future-profile requirements; no executable
discovery schema or conformance cases are registered.

A future discovery profile is expected to expose a document or API result
containing:

- supported core, convention, profile, and binding identifiers;
- exact capability identifiers and operations;
- supported file, record, or message schema versions;
- canonical, compatible, and migration-only behavior classes;
- extension namespaces owned or understood;
- provider assumptions and implementation-policy boundaries.

Discovery is descriptive, not authorization. A future executable profile is
expected to fail closed for unsupported mandatory versions or capabilities and
to avoid inferring nearest-version compatibility.

## 3. Stable identity and authority

**Section status:** Informative design requirements except for authority fields
validated by the shared envelope in §4.

Every actor, member, service, and portable resource has an immutable UID scoped by an
issuer. Display names, member IDs used as paths, roles, casting personas, and
provider logins are attributes rather than the authority UID.

Neutral observations identify the actor UID without implying authority. When
an authority assertion is present, the executable envelope schema requires
action, issuer, authenticated provider identity, authority basis, resource UID,
and policy revision. Casting or persona changes are not expected to alter
authority.

## 4. Shared event and evidence envelope

**Section status:** Experimental normative schema contract, enforced by
`evidence.schema.json` and `test/specification-suite.test.ts`.

Normative events and evidence MUST conform to
`test-fixtures/spec/suite-v0.1/evidence.schema.json`. The envelope carries:

- specification and schema identifiers;
- event ID, type, source, subject, and time;
- actor UID and authority evidence when an action is asserted;
- correlation, causation, idempotency, and replay keys;
- resource UID, revision, expected prior revision, and result revision;
- payload digest, redaction declaration, extensions, and typed data.

Profile data MUST appear under `data`; the closed envelope schema rejects
redefined or unknown top-level fields. Evidence immutability and correction
events remain informative future-profile behavior because the schema cannot
enforce storage history.

## 5. Concurrency, retry, and replay

**Section status:** Informative future-profile requirements; the envelope
validates represented fields but does not execute retry or replay behavior.

A future transition profile is expected to require mutation idempotency keys
and an expected prior revision, or an explicit declaration that no revision
precondition is available. A mismatch is expected to return `conflict` without
partial mutation.

At-least-once delivery is the intended default. Future executable cases should
require consumers to suppress exact duplicate event IDs, return the original
result for repeated idempotency keys, reject the same key with a different
payload digest, and declare replay windows, leases, and retry limits.

## 6. Canonical privacy and secrets exclusion

**Section status:** The redaction enumeration is an experimental normative
schema contract. Content exclusion and diagnostic behavior are informative
security requirements pending mutation fixtures.

Producers MUST declare one of `none`, `metadata-only`, or `content-redacted` in
the envelope's redaction field. Portable files, records, and evidence are
expected to exclude credentials, access tokens, private keys, session cookies,
secret environment values, hidden prompts, unredacted sensitive tool output,
and provider authorization headers.

Sensitive source material should be referenced by an access-controlled URI and
digest. Future diagnostics should identify the excluded field or class without
reproducing secret content. Profiles may impose stricter privacy rules and are
not expected to weaken these requirements.

## 7. Extension ownership

**Section status:** Informative future-profile requirements; no extension
round-trip manifest is registered.

Extension keys use a namespace controlled by their owner. The `squad`
namespace is reserved. Future discovery records should identify recognized namespaces and
whether each is advisory or mandatory. Unknown advisory extensions round-trip;
unknown mandatory extensions fail closed.

## 8. Version negotiation and drift

**Section status:** Informative future-profile requirements; no negotiation or
provider-drift manifest is registered.

Negotiation selects exact identifiers and schema versions before semantic
processing. Future provider bindings should declare the provider API or
behavior versions assumed. Runtime drift outside the declared range is expected
to return `unsupported-provider-version` or `provider-drift` rather than be
silently treated as compatible.

## 9. Capability identifiers, classes, and implementation roles

**Section status:** Informative registry design. The current index schema
enforces the capability grammar and prevents entries without manifests from
advertising capabilities or conformance classes.

A claimable capability identifier has exactly this grammar:
`squad-<profile>/v<major>.<minor>/<operation>`, where each name component uses
lowercase ASCII letters, digits, and hyphens. The suite does not define a
second `#operation` alias.

The conformance-class vocabulary is `canonical`, `compatible`, `legacy`, and
`runtime`. Classes describe the behavior evidenced by cases; they are not
implementation roles. The implementation-role vocabulary is `producer`,
`consumer`, `editor`, `validator`, and `executor`. A role alone is never a
claim.

Only a profile with a schema-valid executable manifest may advertise
capabilities or conformance classes in the suite index. Requirements drafts
retain implementation roles for design traceability but advertise no claims.
The Charter v0.1 registration therefore uses its unchanged `/parse`,
`/validate`, `/edit`, `/legacy-consume`, and `/runtime` identifiers.

Portable case kinds are `positive`, `negative`, `compatibility`, `legacy`,
`round-trip`, `mutation`, `transition`, `replay`, `concurrency`, `provider`,
and `security`. Runtime profiles should promote from requirements-only status
using transition traces with injected clocks and IDs. Provider bindings should
reference neutral case IDs and digests rather than duplicate lifecycle rules.

Every claimable normative profile requires falsifiable fixtures and an independent
reviewer before publication. Passing a schema alone does not prove executor or
authority conformance.

## 10. Versioned references and precedents

The evidence envelope normatively uses
[JSON Schema 2020-12 Core §8](https://json-schema.org/draft/2020-12/json-schema-core#section-8)
for identifiers and references,
[RFC 3339 §5.6](https://www.rfc-editor.org/rfc/rfc3339#section-5.6) for
timestamps, and
[RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2) as the
HTTP precedent for idempotent retry analysis.

CloudEvents 1.0.2
[§3.1](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md#required-attributes),
[Kubernetes v1.34 UID/name separation](https://github.com/kubernetes/website/blob/release-1.34/content/en/docs/concepts/overview/working-with-objects/names.md#uids),
[OCI Distribution Specification v1.1.1 content negotiation](https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md#content-negotiation),
[in-toto Attestation Framework v1.0 statement model](https://github.com/in-toto/attestation/blob/v1.0/spec/v1.0/statement.md),
and
[SLSA Provenance v1.0](https://slsa.dev/spec/v1.0/provenance)
are informative design precedents; they are not imported wholesale into this
schema.

## 11. Promotion criteria

Publish a manifest with neutral-observation, complete and incomplete authority,
privacy/redaction, expected/result revision, duplicate event, repeated
idempotency key, conflicting payload digest, replay, unsupported version, and
extension cases. Discovery and negotiation require a separate executable
document or API-result schema before this dependency can advertise a
capability.
