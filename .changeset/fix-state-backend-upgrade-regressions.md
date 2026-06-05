---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix state-backend and upgrade regressions (#1163, #1185, #1190, #1191, #1194)

**Bug A (P0) — Permission contract mismatch** (#1191)
The Copilot SDK changed the valid permission result `kind` from `"approved"` to
`"approve-once"`. Squad was still returning `{ kind: 'approved' }`, causing all
agent sessions to fail permission checks immediately. Fixed in:
- `cli/shell/index.ts` — `approveAllPermissions` handler now returns `{ kind: 'approve-once' }`
- `adapter/types.ts` — `SquadPermissionRequestResult.kind` union includes `'approve-once'`
- `adapter/client.ts` — error hint updated to reference the correct `kind` value

**Bug B (P1) — Hard-throw in `resolveStateBackend()` when explicit backend fails** (#1185, #1190)
When a backend configured in `config.json` failed to initialize (e.g., no git repo
available), Squad threw a fatal error and refused to start. Now always warns and
falls back to `local` so operators can fix config without losing work.

**Bug C (P1) — Silent git-notes→two-layer migration** (#1163)
`normalizeBackendType()` silently mapped `'git-notes'` to `'two-layer'` with no
user notification. Now emits a `console.warn()` directing users to update their
`config.json`.

**Bug F (P3) — Windows `toRelative()` drive-letter case mismatch**
`StateBackendStorageAdapter.toRelative()` used a simple string prefix comparison
after normalizing separators. On Windows, `C:\` vs `c:\` drive-letter case
differences caused the prefix check to fail, returning full absolute paths as
git-notes keys (corruption). Now uses `path.resolve()` and case-insensitive
comparison on `process.platform === 'win32'`.

**Issue #1194 — Externalized state paths not followed by runtime commands**
Adds `effectiveSquadDir()` and `resolveStateDir()` helpers that follow the
`stateLocation: 'external'` marker in `.squad/config.json`. Updates `loop`,
`watch`, `plugin`, `doctor` commands and `shell` (lifecycle, coordinator, index)
to use the effective state dir for reading `team.md`, `routing.md`, `agents/`,
`plugins/`, and other state files.
