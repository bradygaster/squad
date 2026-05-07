---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': patch
---

Add delete() and append() to StateBackend interface; add resolveSquadState() entry point; add StateBackendStorageAdapter; add git-notes agent protocol templates

- Add `delete()` and `append()` methods to the `StateBackend` interface
- Implement delete/append for all three backends (local, orphan, two-layer)
- Fix orphan backend append to preserve trailing whitespace via readUntrimmed()
- Add `SquadStateContext` interface and `resolveSquadState()` factory in resolution module
- Add `StateBackendStorageAdapter` — bridges StateBackend as a StorageProvider so SDK modules that accept `storage: StorageProvider` work with git-notes and orphan backends
- Add `storage` field to `SquadStateContext` — local uses FSStorageProvider directly, orphan/two-layer use the adapter
- Export `StateBackendStorageAdapter` from SDK public API
- Wire `resolveSquadState()` into CLI entry so the state backend is resolved once at startup
- Pass pre-resolved `stateContext` through to watch config to avoid redundant resolution
- Add `notes-protocol.md` template — agent contract for git-notes state (namespaces, JSON schema, fetch/push, conflict handling)
- Add `scripts/notes/fetch.ps1` template — fetch notes + one-time refspec setup + merge after conflict
- Add `scripts/notes/write-note.ps1` template — agent helper for writing notes with JSON validation and push retry
- Update state-backends docs with "Using with Copilot CLI Sessions" section (copilot-instructions snippet, promotion flow, template index)
- This is the SDK foundation for making state backends squad-wide (Phase 1)
