---
name: "docs-style-guide"
description: "Microsoft Style Guide conformance and scannability review framework for all documentation"
domain: "documentation"
confidence: "high"
source: "PAO charter — extracted during team reskill to keep charter within size budget"
---

## Context

PAO owns tone review and doc-impact review for every PR touching user-facing
behavior. This skill is the durable reference for that review — read it
before writing or reviewing any documentation content.

## Patterns

### Microsoft Style Guide (hard rule)

Follow the [Microsoft Style Guide](https://learn.microsoft.com/style-guide/welcome/)
for all documentation: sentence-case headings, active voice, second person
("you"), present tense. Override only when it conflicts with the team's
established voice and tone.

### Docs-test sync (hard rule)

When adding new docs pages (guides, blog posts), update the corresponding
test assertions in `test/docs-build.test.ts` in the SAME commit. Stale test
assertions that block CI are a docs team failure. `EXPECTED_GUIDES`,
`EXPECTED_FEATURES`, `EXPECTED_SCENARIOS` arrays must match the filesystem.

### Contributor recognition (hard rule)

Each release includes an update to the Contributors Guide page. No
contribution goes unappreciated.

### Doc-impact review (hard rule)

Review every PR for documentation impact. If a change affects user-facing
behavior, ensure corresponding docs are updated or flag the gap.

### Content discipline

One canonical page per concept. Link, don't duplicate. Use the most specific
anchor available when linking between docs pages (deep linking).

### Scannability review framework

All content must use the format that best serves scannability. Apply this
framework during review:

- **Paragraphs:** narrative flow, conceptual explanations, "why" context,
  transitions. Limit to 3-4 sentences; longer paragraphs should be broken
  into sections or converted to lists/tables.
- **Bullet lists:** features, options, non-sequential steps, anything a
  reader scans for one item. Start with strong verbs or nouns; keep items
  parallel in structure.
- **Tables:** comparisons (feature A vs B), structured reference data
  (config options, API parameters), or any grid of related attributes.
  Include headers that describe the relationship.
- **Quotes/indents:** warnings, important callouts, citations, examples.
  Reserve for content needing visual separation.
- **Decision test:** hunting for one specific item in a paragraph → convert
  to bullets/table. Explaining relationships between concepts → keep
  paragraph. Comparing options → use a table.

## Anti-Patterns

- Duplicating the same concept across two canonical pages instead of linking
- Linking to a page's top instead of the specific anchor a reader needs
- Landing a new docs page without updating `test/docs-build.test.ts` in the
  same commit
- Shipping a release without a Contributors Guide update
