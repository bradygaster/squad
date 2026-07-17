---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Fix StateBackendStorageAdapter.deleteDir leaving nested keys behind: a single-level list+delete pass missed deeper subtrees (e.g. `agents/x/history/2026/log.md` survived a delete of `agents/x`), silently leaking state on git-notes and orphan backends. deleteDir now walks the full subtree on every backend. Also rename the unimplemented `stateBackend: 'external'` placeholder to `'external-stub'` so it can no longer be confused with the real external-state feature (`squad externalize` / `stateLocation: 'external'`); the legacy name is still accepted and normalized with a one-time deprecation warning.
