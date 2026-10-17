---
"@bradygaster/squad-sdk": patch
---

Fix `squad_state_list` with an omitted/empty `dir` failing on adapter-backed state backends (orphan, git-notes, two-layer): `StateBackendStorageAdapter` now maps the squad root to the `""` root key for list-shaped reads (`list`, `listSync`, `isDirectory`, `isDirectorySync`). File operations and `deleteDir` still reject the root.
