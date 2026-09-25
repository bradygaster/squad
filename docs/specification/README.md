# Squad Specification

**Core version:** 0.1

**Status:** Working Draft

**Draft date:** 2026-09-25

**Working-draft provenance:** [PR #2074](https://github.com/bradygaster/squad/pull/2074),
whose revision lineage starts at immutable review baseline
[`ab80da18087b7d37755db2c3cc5880d194a10f52`](https://github.com/bradygaster/squad/commit/ab80da18087b7d37755db2c3cc5880d194a10f52).
Each subsequent draft snapshot is identified by its immutable Git commit in
that pull request; no publication tag has been assigned.

**Document class:** Informative index; linked core/profile documents identify
their normative sections
**Foundation profile:** [Squad Charter Profile v0.1](charter-v0.1.md)

This directory defines portable contracts for the on-disk artifacts that make
up a Squad. The specification is independent of the TypeScript reference
implementation. A producer or consumer can implement one artifact profile
without claiming that an entire Squad is conformant.

## Documents

- [Core v0.1](core-v0.1.md) defines shared terminology, conformance classes,
  versions, paths, extensions, and trust requirements.
- [Interoperability Conventions v0.1](interoperability-conventions-v0.1.md)
  defines suite discovery, stable authority identities, negotiation, shared
  evidence, replay protection, and privacy/secrets exclusion.
- [Charter Profile v0.1](charter-v0.1.md) defines the first normative artifact
  profile for `.squad/agents/{id}/charter.md`.
- [Team and Routing Profile v0.1](team-routing-v0.1.md) defines accountable
  roster entries, capability ownership, and deterministic route selection.
- [Configuration and Casting Profile v0.1](configuration-casting-v0.1.md)
  defines configuration precedence, cast provenance, and revision joins.
- [Governance and Review Profile v0.1](governance-review-v0.1.md) defines
  reviewer independence, rejection lockout, reassignment, escalation, and
  approval evidence.
- [Execution Preferences Profile v0.1](execution-preferences-v0.1.md) separates
  portable execution intent from provider catalogs and runtime policy.
- [Planning and Activation Profile v0.1](planning-activation-v0.1.md) defines
  PRD intake, decomposition, acceptance, and activation evidence.
- [Ceremony Profile v0.1](ceremony-v0.1.md) defines observable ceremony
  declarations and completion records without standardizing meeting culture.
- [Work Lifecycle Profile v0.1](work-lifecycle-v0.1.md) defines the
  provider-neutral issue-to-change lifecycle.
- [GitHub Work Lifecycle Binding v0.1](github-work-lifecycle-binding-v0.1.md)
  maps the neutral lifecycle to GitHub issues, labels, branches, pull requests,
  checks, reviews, merges, and closure.
- [Coordination and Handoff Profile v0.1](coordination-handoff-v0.1.md) defines
  portable handoff envelopes and idempotent delivery semantics.
- [Automation Profile v0.1](automation-v0.1.md) defines schedule manifests,
  execution claims, retry evidence, and provider boundaries.
- [State and Memory Requirements v0.1](state-memory-requirements-v0.1.md) is an
  informative requirements draft with explicit promotion criteria.
- [Artifact inventory and coverage matrix](artifact-inventory.md) traces the
  repository surface to its specification disposition and maturity.
- [`test-fixtures/spec/charter-v0.1/`](../../test-fixtures/spec/charter-v0.1/)
  contains language-neutral positive, negative, legacy, and round-trip
  fixtures. Its [`manifest.schema.json`](../../test-fixtures/spec/charter-v0.1/manifest.schema.json)
  defines the portable manifest field contract.
- [`test-fixtures/spec/suite-v0.1/`](../../test-fixtures/spec/suite-v0.1/)
  contains the `squad-conformance/v0.1` suite index, reusable evidence schema,
  and language-neutral governance evidence example. The index registers the
  existing Charter v0.1 manifest unchanged as a legacy dialect.

## Dependency layers

1. `squad-core/v0.1` defines common conformance, diagnostics, versioning,
   extension, and trust rules.
2. `squad-interop/v0.1` defines discovery, negotiation, authority identity,
   shared evidence, concurrency, replay protection, and secrets exclusion.
3. Artifact profiles define portable files and evidence independent of any
   hosted provider.
4. Protocol profiles define state transitions and messages spanning artifacts.
5. Provider bindings map neutral protocol concepts to provider resources.
6. Informative requirements documents preserve conceptual coverage where
   interoperability evidence is not mature enough for a truthful schema.

Conformance is capability-specific. Supporting a GitHub binding does not imply
support for every artifact profile, and accepting one profile operation does
not imply editor, validator, executor, or provider capability.

Normative references are maintained in
[Core v0.1 §2](core-v0.1.md#2-normative-references), including BCP 14,
RFC 3339, and CommonMark 0.31.2.

## Versioning policy

The core and each artifact profile are versioned independently. Draft `0.x`
documents may change before publication, and unsupported versions fail closed.
After publication, a revision is immutable: editorial corrections are recorded
as dated errata, while normative changes require a new `vMAJOR.MINOR`
identifier. Patch components are not used. See
[Core v0.1 §10](core-v0.1.md#10-publication-errata-and-versioning).
