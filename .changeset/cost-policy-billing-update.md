---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': patch
---

Add cost policy support for GitHub Copilot's AI Credits billing transition.

The SDK now ships an updated GitHub model catalog, supports `models.costPolicy`
configuration, carries cost policy through runtime model selection, refreshes
fallback chains to current active models, and enforces billing ceilings with
warn-and-allow behavior for explicit overrides plus automatic downgrades for
implicit selections.

The CLI templates are synced to the new model catalog and cost policy guidance.
