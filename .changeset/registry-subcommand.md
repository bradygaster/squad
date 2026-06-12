---
"@bradygaster/squad-cli": minor
"@bradygaster/squad-sdk": minor
---

Add `squad registry add/list/remove` for discovery-only peer squads (no inheritance)

The existing `squad upstream add` triggers inheritance (skills/decisions/wisdom flow from the other squad into yours at session start). For peer relationships where you want discovery and delegation but NOT inheritance, you previously had to hand-edit `.squad/squad-registry.json` — the `squad discover` error message even told you to "create a squad-registry.json" manually.

This adds a real CLI surface for the registry, symmetric to `squad upstream`:

- `squad registry add <name> <path>` — registers a peer, validates its manifest, refuses on duplicate name
- `squad registry list` — shows all registered peers
- `squad registry remove <name>` — removes by name

It also fixes a subtle path-semantics confusion: `readManifest()` now accepts BOTH `repo-root` and `repo-root/.squad` paths (the docs/SKILL showed the `.squad`-suffixed form, but the code previously joined `.squad/manifest.json` onto whatever you gave it, so the suffixed form silently failed). The SDK helpers (`readSquadRegistry`, `writeSquadRegistry`, `addRegistryEntry`, `removeRegistryEntry`) are exported for tooling.

The `cross-squad` SKILL and the `squad discover` empty-state hint are updated to reflect the new command.

Closes #1290.
