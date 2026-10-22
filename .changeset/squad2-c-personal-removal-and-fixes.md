---
"@bradygaster/squad": major
"@bradygaster/squad-sdk": major
"@bradygaster/squad-cli": major
---

Squad 2.0: breaking removals from the 1.x profile-level feature set; squad resolution is project-only; state-bridge fixes.

- **BREAKING:** Personal squads, consult mode and the global squad (`--global`) were removed; existing `personal-squad/` and global `.squad/` directories under the user profile are no longer read or written and may be deleted manually.
- Squad resolves `.squad/` only from the current directory and its parents. `squad status`, `squad doctor`, `squad cast` and `squad cost` run outside a project now fail with "No squad in this directory … run `squad init`" instead of resolving a user-profile directory; `squad init` and `squad upgrade` only ever write inside the project `.squad/`. The SDK exports, CLI subcommands, flags, environment switches, templates and coordinator sections that backed the removed features are gone with them; `resolveGlobalSquadPath()` remains only as the base of externalized project state (`squad externalize`).
- **State bridge fixes.** `squad_state_health` reports `State backend: local|orphan|two-layer` (plus storage class and team squad dir) as the coordinator digest promised (F6); `squad_state_list` without `dir` lists the root on git-backed backends instead of failing (F8); Claude Code declares `background-runs` in `capability-matrix.json` and `CAPABILITY_TOKENS_BY_HOST` (F7). `ToolRegistry` accepts `backendName` in its trailing options object.
- A retired-symbol gate (`test/retired-symbols.test.ts`) keeps the removed concepts out of source, templates, skills, docs, help text, schemas and the built package output.