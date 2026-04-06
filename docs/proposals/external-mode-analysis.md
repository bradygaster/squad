# External Mode — Comprehensive Analysis

*Author: Flight (Lead) | Validated by: CAPCOM (SDK Expert)*  
*Status: COMPLETE — bugs fixed, test corrected*

---

## What Is External Mode?

External mode moves `.squad/` state out of the working tree into a platform-specific global directory:
- **Windows:** `%APPDATA%/squad/projects/{projectKey}/`
- **macOS:** `~/Library/Application Support/squad/projects/{projectKey}/`
- **Linux:** `$XDG_CONFIG_HOME/squad/projects/{projectKey}/`

A thin `.squad/config.json` marker stays in the repo (gitignored) with `stateBackend: 'external'`. The actual state (agents, decisions, logs, etc.) lives globally, survives branch switches, and keeps the working tree clean.

CLI workflow:
```sh
squad externalize          # Move state out → global dir
squad internalize          # Pull state back → .squad/
```

Config format:
```json
{
  "version": 1,
  "projectKey": "my-project",
  "stateBackend": "external",
  "externalStateRoot": "/optional/custom/path"
}
```

---

## Bugs Fixed in This Analysis

### Bug 1 — `resolveSquadPaths` returned wrong `projectDir` *(CRITICAL)*

**File:** `packages/squad-sdk/src/resolution.ts`, line 357 (pre-fix)

```ts
// BEFORE (wrong)
return {
  mode: 'remote',
  projectDir: cwd(),      // ← always process.cwd()!
  teamDir: externalDir,
  ...
};

// AFTER (fixed)
return {
  mode: 'remote',
  projectDir: externalDir, // ← correct external state dir
  teamDir: externalDir,
  ...
};
```

**Impact:** Any consumer of `ResolvedSquadPaths.projectDir` in external mode received the current working directory instead of the external state directory. This broke path-safe operations (`ensureSquadPathResolved`), state writes, and the `cast` command in external mode.

**Test confirmation:** `test/external-state.test.ts:122` — was failing with  
`expected '/Users/.../squaddev' to be '/var/.../custom-state/my-project'`

---

### Bug 2 — `ExternalBackend` ignored `externalStateRoot` config *(HIGH)*

**File:** `packages/squad-sdk/src/state-backend.ts`, ExternalBackend constructor

```ts
// BEFORE (wrong)
this.root = resolution.resolveExternalStateDir(projectKey, true);
// externalStateRoot from config was never read!

// AFTER (fixed)
const externalRoot = config?.externalStateRoot
  ? path.resolve(projectRoot, config.externalStateRoot)
  : undefined;
this.root = resolution.resolveExternalStateDir(projectKey, true, externalRoot);
```

**Impact:** Setting `externalStateRoot` in `config.json` had no effect on `ExternalBackend`. State would always land in the default global path. The CLI commands (`externalize.ts`, `pathDiagnostics.ts`) correctly handled `externalStateRoot`, creating an inconsistency: `runExternalize()` wrote to the custom root, but `ExternalBackend` always read from the default root.

---

### Stale Test — `'external returns worktree stub'` *(MEDIUM)*

**File:** `test/state-backend.test.ts:92`

```ts
// BEFORE (wrong expectation)
it('external returns worktree stub', () => {
  expect(resolveStateBackend(squadDir(), TMP, 'external').name).toBe('worktree');
});

// AFTER (correct)
it('external returns external backend', () => {
  expect(resolveStateBackend(squadDir(), TMP, 'external').name).toBe('external');
});
```

**Context:** The test was written when `ExternalBackend` was a stub. The implementation is now complete and returns `name = 'external'`. The test was documenting wrong behavior.

---

## Remaining Gaps (Not Fixed — Tracked)

### Gap 3 — `projectDir` / `teamDir` conflation in external mode *(MEDIUM)*
In external mode, `projectDir` and `teamDir` both resolve to the same `externalDir`. The separation between "project state" (decisions, logs) and "team identity" (agents, skills) is lost. This is semantically consistent (everything is in one external dir) but callers cannot distinguish the two roles.

### Gap 4 — `mode: 'remote'` is overloaded *(MEDIUM)*
Both external state (`stateBackend: 'external'`) and remote team (`teamRoot: '...'`) return `mode: 'remote'`. Consumers cannot distinguish these two different scenarios from `ResolvedSquadPaths.mode` alone.

### Gap 5 — Legacy `stateLocation: 'external'` migration undocumented *(MEDIUM)*
`loadDirConfig` silently migrates the legacy `stateLocation: 'external'` field to `stateBackend: 'external'`. There's no deprecation warning and no documented removal timeline. Both `externalize.ts` and `internalize.ts` check both fields.

### Gap 6 — `ExternalBackend` CRUD operations not tested *(MEDIUM)*
`ExternalBackend` has four operations (`read`, `write`, `exists`, `list`). None are directly tested. Only `resolveStateBackend` is tested. All other backends have full CRUD round-trip tests.

### Gap 7 — No user-facing documentation for External mode *(LOW)*
No public docs explain when to use `squad externalize`, how to configure `externalStateRoot`, or state behavior across branch switches. The `externalize.ts` module comment is excellent but not surfaced to users.

### Gap 8 — `ExternalBackend` constructor has filesystem side effects *(LOW)*
The constructor calls `resolveExternalStateDir(projectKey, true)` which creates the external directory. Other backends don't mutate the filesystem at construction time. This could surprise callers.

### Gap 9 — Path-traversal check uses string contains *(LOW)*
`ExternalBackend` uses `squadDir.includes('..')` which would reject legitimate paths like `/users/ann..drew/project/.squad`. Should use `path.normalize()` + prefix check.

---

## Architecture Notes

Four resolution modes in the SDK, but only two `mode` values in `ResolvedSquadPaths`:

| Scenario | `stateBackend` / `teamRoot` | `mode` |
|----------|----------------------------|--------|
| Local | neither | `'local'` |
| Remote team | `teamRoot: '...'` | `'remote'` |
| External state | `stateBackend: 'external'` | `'remote'` |
| Personal squad | `personalDir` set | either (orthogonal) |

`resolveStateBackend()` in `state-backend.ts` and `resolveSquadPaths()` in `resolution.ts` share `ExternalBackend` but are otherwise parallel implementations that can drift.

---

## Priority Summary

| Issue | Severity | Status |
|-------|----------|--------|
| Bug 1: Wrong `projectDir` in external mode | 🔴 CRITICAL | ✅ Fixed |
| Bug 2: `ExternalBackend` ignores `externalStateRoot` | 🔴 HIGH | ✅ Fixed |
| Stale test expectation | 🟡 MEDIUM | ✅ Fixed |
| Gap: `projectDir`/`teamDir` conflation | 🟡 MEDIUM | Open |
| Gap: `mode: 'remote'` overloaded | 🟡 MEDIUM | Open |
| Gap: Legacy `stateLocation` migration | 🟡 MEDIUM | Open |
| Gap: ExternalBackend CRUD untested | 🟡 MEDIUM | Open |
| Gap: No user docs | 🟢 LOW | Open |
| Gap: Constructor side effects | 🟢 LOW | Open |
| Gap: Path-traversal string check | 🟢 LOW | Open |
