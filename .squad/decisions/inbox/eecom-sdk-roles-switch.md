### SDK + Roles Config Generation Pattern

**By:** EECOM (Core Dev)
**Date:** 2026-03-16

**What:** When `squad init --sdk --roles` is used, the generated `squad.config.ts` uses `useRole()` for base-role agents and `defineAgent()` for system agents (scribe, ralph). A default starter team of `lead`, `backend`, `frontend`, `tester` is generated when no explicit base-role agents are provided.

**Why:** The `useRole()` API provides curated charter content, expertise, and boundaries from the role catalog. Using it in SDK config gives users a structured starting point they can customize with overrides (expertise, style, voice, etc.) rather than empty `defineAgent()` shells.

**Impact:** New `roles` boolean on `InitOptions`. Config generation dispatches to `generateSDKBuilderConfigWithRoles()` when both `configFormat === 'sdk'` and `roles === true`. No breaking changes — existing `--sdk` and `--roles` behavior unchanged when used independently.
