---
"@bradygaster/squad-cli": patch
---

Fix #1396: `squad export` now resolves externalized state. After `squad externalize`, export read the local `.squad/` directory directly, so it either failed with a misleading "No squad found — run init first" or silently exported stale/scaffolded local files instead of the real team state in the external directory. Export now routes through the same `effectiveSquadDir()` resolution used by `build`, `loop`, `plugin`, `watch`, and `doctor`, reading `team.md`, `decisions.md`, `routing.md`, `casting/`, `agents/`, and `.squad`-local skills from the effective state directory.
