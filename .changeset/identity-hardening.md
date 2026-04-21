---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat(identity): hardening + kickstart sync quick wins

- **Structured error reporting** (`TokenResolveError`): typed `kind` field (`not-configured` | `runtime`) with human message
- **Fetch timeout** (H-01): `AbortController` + `Promise.race` 10-second cap on installation token requests
- **PEM validation** (H-02): `createPrivateKey()` validates key before signing; rejects with descriptive error
- **Partial env detection** (H-03): logs loud error when only 1-2 of 3 required env vars are set
- **Mock hook** (H-07): `SQUAD_IDENTITY_MOCK=1` bypasses real credentials; `SQUAD_IDENTITY_MOCK_TOKEN` sets custom token value
- **Role aliases**: `resolveRoleSlug()` maps shorthand aliases (`core`, `ui`, `qa`, `ops`, `writer`, `sec`, `ml`, `note`) to canonical role slugs
- **Scribe role**: `'scribe'` added to `RoleSlug` union; `ALL_ROLES` constant exported from SDK
- **ESM dual-mode guard**: `isCliInvocation` IIFE prevents CLI side-effects when `resolve-token.mjs` is imported as a module
- **`resolveTokenWithDiagnostics()`**: full diagnostic result type; `clearTokenCache()` for test isolation
- **Cache key fix**: token cache keyed by `${projectRoot}:${roleKey}` to prevent cross-test pollution
