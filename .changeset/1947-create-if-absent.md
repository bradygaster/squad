---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add atomic repository-scoped `createIfAbsent` operation to all state backends (local, git-notes, orphan-branch, two-layer), `StorageProvider` (FSStorageProvider, InMemoryStorageProvider, SQLiteStorageProvider), `StateBackendStorageAdapter`, and `ToolRegistry`/state-mcp MCP surface (`squad_state_create_if_absent`).

- Exactly one concurrent creator succeeds; all others receive `StateKeyConflictError`
- Existing content is never overwritten
- Two-layer backend is fail-closed for disagreement/failure between layers
- New typed errors: `StateKeyConflictError`, `StateBackendUncertaintyError` (exported from `@bradygaster/squad-sdk`)
- Local backend uses O_CREAT|O_EXCL (filesystem exclusive creation); git-native backends use CAS loops
- MCP tool `squad_state_create_if_absent` appears in `tools/list` with `conflict`/`uncertainty` failure types
