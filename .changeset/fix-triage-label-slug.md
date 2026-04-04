---
'@bradygaster/squad-sdk': patch
'@bradygaster/squad-cli': patch
---

Fix triage label slug derivation: use `slugify()` instead of `toLowerCase()` so multi-word agent names produce valid GitHub labels (e.g. "Steve Rogers" → `squad:steve-rogers` instead of `squad:steve rogers`).

Pre-create all `squad:{member}` labels at watch startup via `ensureTag()` so `gh issue edit --add-label` never fails on missing labels.
