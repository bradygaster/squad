---
name: content-scope
description: Keep Squad documentation focused on shipped behavior and clearly bounded integrations
domain: documentation, product-scope
confidence: high
source: retained content-boundary reviews reconciled with current documentation
---

## Context

Use this skill when deciding whether proposed documentation, examples, or external material
belongs in Squad documentation.

## Patterns

- Apply the “Squad ships it” test: keep behavior, configuration, and integration contracts that
  Squad ships; exclude external infrastructure that users build around Squad.
- When documenting a platform feature used with Squad, identify it as a platform integration
  rather than implying Squad implements the platform feature.
- Preserve reusable product guidance while linking to external examples, articles, or deployment
  material instead of importing their operational specifics into product documentation.

## Examples

An explanation of Squad’s configured GitHub integration belongs in the documentation. A bespoke
bot, webhook deployment, or private operations wrapper built around it belongs in its own project
or external reference.

## Anti-Patterns

- Calling external infrastructure a built-in Squad feature
- Deleting all integration documentation because the platform owns the underlying service
- Copying third-party operational playbooks into product docs without a shipped contract
