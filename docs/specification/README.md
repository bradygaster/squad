# Squad Specification

**Core version:** 0.1

**Status:** Working Draft

**Draft date:** 2026-09-24

**Working-draft provenance:** [PR #2074](https://github.com/bradygaster/squad/pull/2074),
whose revision lineage starts at immutable review baseline
[`ab80da18087b7d37755db2c3cc5880d194a10f52`](https://github.com/bradygaster/squad/commit/ab80da18087b7d37755db2c3cc5880d194a10f52).
Each subsequent draft snapshot is identified by its immutable Git commit in
that pull request; no publication tag has been assigned.

**Document class:** Informative index; linked core/profile documents identify
their normative sections
**First artifact profile:** [Squad Charter Profile v0.1](charter-v0.1.md)

This directory defines portable contracts for the on-disk artifacts that make
up a Squad. The specification is independent of the TypeScript reference
implementation. A producer or consumer can implement one artifact profile
without claiming that an entire Squad is conformant.

## Documents

- [Core v0.1](core-v0.1.md) defines shared terminology, conformance classes,
  versions, paths, extensions, and trust requirements.
- [Charter Profile v0.1](charter-v0.1.md) defines the first normative artifact
  profile for `.squad/agents/{id}/charter.md`.
- [Artifact inventory](artifact-inventory.md) records the current on-disk
  surface, parser locations, maturity, and proposed profile order.
- [`test-fixtures/spec/charter-v0.1/`](../../test-fixtures/spec/charter-v0.1/)
  contains language-neutral positive, negative, legacy, and round-trip
  fixtures. Its [`manifest.schema.json`](../../test-fixtures/spec/charter-v0.1/manifest.schema.json)
  defines the portable manifest field contract.

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
