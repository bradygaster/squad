---
"@bradygaster/squad-sdk": patch
---

`resolveSquadState()` now constructs the local-backend `FSStorageProvider` with `rootDir` set to `paths.teamDir`, so its path-traversal guard actually validates state writes instead of no-op'ing on an unset rootDir. Also fixed `resolveSquadPaths()` treating a `config.teamRoot` of `"."` (the sentinel `squad externalize` writes) as remote mode, which pointed `teamDir` one level above `.squad/` — it now correctly falls through to local mode. Together these were breaking `squad_decide`/`squad_state_*` MCP tools on externalized projects with a "Path traversal blocked" error.
