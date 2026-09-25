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
privacy rules reused by every profile and provider binding. Profiles MUST
reference these definitions rather than invent local alternatives.

## 2. Suite discovery and capability claims

An implementation MUST expose a discovery document or API result containing:

- supported core, convention, profile, and binding identifiers;
- exact capability identifiers and operations;
- supported file, record, or message schema versions;
- canonical, compatible, and migration-only behavior classes;
- extension namespaces owned or understood;
- provider assumptions and implementation-policy boundaries.

Discovery is descriptive, not authorization. Unsupported mandatory versions or
capabilities MUST fail closed. Implementations MUST NOT infer nearest-version
compatibility.

## 3. Stable identity and authority

Every actor, member, service, and portable resource has an immutable UID scoped by an
issuer. Display names, member IDs used as paths, roles, casting personas, and
provider logins are attributes and MUST NOT be treated as the authority UID.

Neutral observations identify the actor UID without implying authority. When
an authority assertion is present, it MUST identify action, issuer,
authenticated provider identity, authority basis, resource UID, and policy
revision. Casting or persona changes MUST NOT alter authority.

## 4. Shared event and evidence envelope

Normative events and evidence MUST conform to
`test-fixtures/spec/suite-v0.1/evidence.schema.json`. The envelope carries:

- specification and schema identifiers;
- event ID, type, source, subject, and time;
- actor UID and authority evidence when an action is asserted;
- correlation, causation, idempotency, and replay keys;
- resource UID, revision, expected prior revision, and result revision;
- payload digest, redaction declaration, extensions, and typed data.

Profile data belongs under `data`; profiles MUST NOT redefine envelope fields.
Evidence is immutable. Corrections are new events linked by causation.

## 5. Concurrency, retry, and replay

Mutations MUST declare an idempotency key. Operations on revisioned resources
MUST declare the expected prior revision or explicitly state that no revision
precondition is available. A mismatch returns `conflict` without partial
mutation.

At-least-once delivery is the default. Consumers MUST suppress exact duplicate
event IDs and return the original result for repeated idempotency keys. The
same idempotency key with different payload digest is an error. Replay windows,
leases, and retry limits MUST be declared by the executing capability.

## 6. Canonical privacy and secrets exclusion

Portable files, records, and evidence MUST NOT contain credentials, access tokens,
private keys, session cookies, secret environment values, hidden prompts,
unredacted sensitive tool output, or provider authorization headers.

Producers MUST declare one of `none`, `metadata-only`, or `content-redacted` in
the envelope's redaction field. Sensitive source material SHOULD be referenced
by an access-controlled URI and digest. Diagnostics MUST identify the excluded
field or class without reproducing secret content.

Profiles MAY impose stricter privacy rules. They MUST NOT weaken this section.

## 7. Extension ownership

Extension keys use a namespace controlled by their owner. The `squad`
namespace is reserved. Discovery MUST identify recognized namespaces and
whether each is advisory or mandatory. Unknown advisory extensions round-trip;
unknown mandatory extensions fail closed.

## 8. Version negotiation and drift

Negotiation selects exact identifiers and schema versions before semantic
processing. Provider bindings MUST also declare the provider API or behavior
versions assumed. Runtime drift outside the declared range returns
`unsupported-provider-version` or `provider-drift`; it MUST NOT be silently
treated as compatible.

## 9. Capability identifiers, classes, and implementation roles

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
and `security`. Runtime profiles SHOULD promote from requirements-only status
using transition traces with injected clocks and IDs. Provider bindings SHOULD
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
Kubernetes UID/name separation, OCI media-type negotiation, and in-toto/SLSA
provenance are informative design precedents; they are not imported wholesale
into this schema.

## 11. Promotion criteria

Publish a manifest with neutral-observation, complete and incomplete authority,
privacy/redaction, expected/result revision, duplicate event, repeated
idempotency key, conflicting payload digest, replay, unsupported version, and
extension cases. Discovery and negotiation require a separate executable
document or API-result schema before this dependency can advertise a
capability.
