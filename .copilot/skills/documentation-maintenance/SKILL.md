---
name: documentation-maintenance
description: Maintain accurate, scannable Squad documentation with validated inventory and links
domain: documentation
confidence: high
source: current documentation tests and repository requirements
---

## Context

Use this skill when adding, removing, or materially changing user-facing documentation. Squad
documentation should describe the product and its supported configuration, not surrounding
infrastructure presented as product behavior.

## Patterns

- Follow the Microsoft Style Guide: sentence-case headings, active voice, second person, and
  present tense unless established project voice requires an exception.
- Keep one canonical page per concept. Link to it rather than duplicating content, using the most
  specific stable anchor available.
- Choose paragraphs for explanation, parallel lists for scannable choices or steps, and tables for
  comparisons or reference data.
- When a page is added or removed, update the relevant expected-inventory arrays in
  `test/docs-build.test.ts` in the same change.
- Review behavior changes for documentation impact. Update affected docs or explicitly record why
  no user-facing documentation changes.

## Examples

`.github/PR_REQUIREMENTS.md` requires a docs-build test update for a new feature page.
`test/docs-build.test.ts` verifies the expected guide, feature, scenario, concept, and reference
inventories against the filesystem.

## Anti-Patterns

- Presenting external deployment wrappers, bots, or unrelated infrastructure as Squad features
- Adding a page without checking the inventory assertions
- Duplicating a concept across several pages instead of linking to the canonical explanation
