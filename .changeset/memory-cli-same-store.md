---
"@bradygaster/squad-cli": patch
---

`squad memory` now opens the same governed memory store as the agents' `memory.*` tools in `squad_state`. It resolves the team the same way (walking up from the current directory, following git worktrees and linked teams) and goes through the configured state backend, so on `orphan` and `two-layer` it reads and writes the `squad-state` branch instead of working-tree files (a linked project on those backends is not supported by `squad_state` yet, see #2320). Outside a squad it fails with a clear message instead of creating a stray `.squad/`; that includes `squad memory classify`, which now needs a squad too.
