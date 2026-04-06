---
'@bradygaster/squad-sdk': patch
---

Fix two bugs in External mode state resolution:

1. `resolveSquadPaths` was returning `process.cwd()` as `projectDir` in external mode instead of the external state directory. This caused all consumers of `ResolvedSquadPaths.projectDir` to look in the wrong location for squad state when external mode was active.

2. `ExternalBackend` ignored the `externalStateRoot` config option, always resolving to the default global path even when a custom root was configured.

Also corrects a stale test expectation in `state-backend.test.ts` that was documenting wrong behaviour (expecting `ExternalBackend` to fall back to `WorktreeBackend`).
