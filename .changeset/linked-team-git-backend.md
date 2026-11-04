---
"@bradygaster/squad-sdk": patch
---

A linked project (`teamRoot` in `.squad/config.json`) on the `orphan` or `two-layer` state backend can use `squad_state` again. `resolveSquadState` ran the git backend in the project repo and rooted its storage adapter at the project's `.squad`, while every tool builds paths under the team's `.squad`, so each `memory.*`, `squad_state_write` and `squad_state_read` call failed with "path is outside squadDir". The team repo owns the state, so the git backend now runs in the team repo (on its `squad-state` branch) and the adapter is rooted at the team's `.squad`, the same root the local backend already used. When the team root is not in a git repository, resolution now fails with a message that says so, instead of failing on every call.
