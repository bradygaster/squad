---
"@bradygaster/squad-cli": patch
---

Fix #1490: `squad watch` and `squad loop` resolved externalized state for their startup reads only — every capability was then handed `teamRoot` and built `.squad/` paths from it directly, so after `squad externalize` the local `.squad/` is a marker-only stub and decision-hygiene, cleanup, retro, subsquad discovery, the `capabilities/` loader, and the ralph-instructions.md check all silently saw an empty directory.

Added `stateRoot` to `WatchContext`, populated from `effectiveSquadDir().stateDir` in both `runWatch` and `runLoop`, and routed every capability's state reads/writes through it instead of joining `.squad/` onto `teamRoot`. `loadExternalCapabilities()` and `buildAgentPrompt()` gained an optional override parameter rather than changing their existing (well-tested) `{teamRoot}/.squad/...` default, so every prior caller and test keeps working unchanged. `notes-promote.ts` needed no change — it only reads the always-local `config.json` for backend-type detection; the two-layer backend's actual state is git-notes/orphan-branch, not filesystem, so externalization doesn't touch it.
