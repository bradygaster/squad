---
"@bradygaster/squad-cli": minor
---

Add `squad add` to register an existing directory as a Squad project.

`squad add <path>` registers a pre-existing directory in the global project registry so it appears in `squad projects`, `squad list`, and `squad pick`, without re-running `squad init`. The command handles paths containing spaces even when passed without quotes, reconstructing the full path from remaining CLI arguments.
