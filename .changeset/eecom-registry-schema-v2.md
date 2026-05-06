---
'@bradygaster/squad-sdk': minor
---

**W1 — Registry schema validator** (`@bradygaster/squad-sdk/registry`)

Adds a new `registry` subpath export with the full Wave 1 implementation of the `squad-data-model` v2 schema layer:

- `parseRegistry(json)` — parses and validates a `registry.json` string, enforcing S1–S12 schema rules (required fields, path sentinel, version gating)
- `validateRegistry(registry)` — deep-validates a parsed `Registry` object (S3–S17: path traversal, duplicate callsign/path, origins/clones shapes)
- `registerEntry(registry, entry)` — adds a new entry with register-time warnings for non-existent paths (S14b four-layer policy)
- `writeRegistry(registry, filePath)` — serialises and writes `registry.json` with a helpful error on read-only files (S20)
- `loadRegistryFromDisk(opts?)` — resolves the active registry, emitting an `onWarn` callback when a legacy `squad-repos.json` is present but no `registry.json` (SC2 coexistence policy)

Exports `Registry` and `RegistryEntry` types from the main `@bradygaster/squad-sdk` barrel.
