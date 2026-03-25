# Decision: README is orientation, not SDK reference

**Date:** 2025-07-24
**Author:** PAO

## Decision

The README's role is discovery and quick-start orientation. SDK internals (custom tools, hook pipeline, Ralph API, architecture diagrams) belong in the docs site, not the README.

## Rationale

The README had grown to 512 lines — ~212 of those were SDK deep-dive content that duplicates what's already in `docs/src/content/docs/reference/`. New users landing on the repo get overwhelmed before they even run `squad init`. Brady confirmed this directly ("QUITE long").

## What changed

- Removed lines 300–512 (SDK internals) from README
- Added compact SDK docs pointer section linking to `reference/sdk.md`, `reference/tools-and-hooks.md`, and `guide/extensibility.md`
- Added dedicated "Upgrading" section (two-step process) after Quick Start
- README went from 512 → 331 lines

## Rule going forward

If it's SDK API surface, hook pipeline internals, or event-driven code examples — it goes in `docs/`, not the README. The README links out. It doesn't host.
