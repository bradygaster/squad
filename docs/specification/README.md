# Squad Specification

**Core version:** 0.1

**Status:** Draft

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
  fixtures.

Normative references are maintained in
[Core v0.1 §2](core-v0.1.md#2-normative-references), including BCP 14,
RFC 3339, and CommonMark 0.31.2.

## Versioning policy

The core and each artifact profile are versioned independently. Draft `0.x`
documents may change before publication, and unsupported versions fail closed.
After publication, a revision is immutable: editorial corrections are recorded
as dated errata, while behavioral changes require a new profile version. See
[Core v0.1 §10](core-v0.1.md#10-publication-errata-and-versioning).
