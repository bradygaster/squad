# GNC

> Guidance, Navigation, and Control Officer

## Learnings

### ESM Compatibility Layer
@github/copilot-sdk@0.1.32 has broken ESM import (session.js uses 'vscode-jsonrpc/node' missing .js extension). Two-layer fix: (1) lazy-load copilot-sdk so init/build/watch don't trigger it, (2) postinstall patch in packages/squad-cli/scripts/patch-esm-imports.mjs. Runtime Module._resolveFilename patch in cli-entry.ts for npx where postinstall doesn't run.

### Node Version Requirements
Node.js ≥20 required. Node 24+ enforces strict ESM resolution (no extensionless imports). cli-entry.ts has runtime check that warns about node:sqlite availability (≥22.5.0).

### PR #474 Review & Merge — Node 22 ESM Fix (2026-03-22)

Reviewed and merged PR #474 (Node 22 ESM compatibility + bonus exports key fix). Addresses module resolution failures on Node 22 strict ESM enforcement.

**Fix pattern:** Node 22 ESM compatibility requires two checks: (1) explicit exports map in package.json (exports key with conditions), (2) actual module paths must match exports map entries. Mismatch between declared exports and actual files causes MODULE_NOT_FOUND errors. Build-time validation: check that every exports entry points to a file that exists.

**Key learning:** ESM exports key and actual module structure must stay in sync. When adding new entry points, update both package.json (exports) and create the corresponding module file. Missing either step breaks consumers on Node 22+. Test matrix must include Node 22+ to catch these errors early.
### Dual-Layer ESM Fix (Issue #449)
Upgraded from single-layer session.js patch to dual-layer approach: (1) Inject `exports` field into vscode-jsonrpc@8.2.1 package.json at postinstall — this is the canonical fix that resolves ALL subpath imports at once, matching vscode-jsonrpc v9.x. (2) Keep session.js `.js` extension patch as defense-in-depth. Added `squad doctor` detection for both layers (checks vscode-jsonrpc exports field and copilot-sdk session.js import syntax). Runtime Module._resolveFilename patch in cli-entry.ts remains as Layer 3 for npx cache hits where postinstall never runs.

📌 **Team update (2026-03-25T18:11Z):** Routing regression research complete — root cause identified as combination of Squad code changes (v0.9.0 prompt saturation +33%, inlined workflows, missing 
ame param in templates #577) AND Copilot CLI platform changes (CAPCOM report). Coordinator prompt grew 711→946 lines, diluting routing constraint. Workstream config replacement broke existing routing. Agent name fix exists on dev (#577) but not shipped. Recommendations: ship #577 immediately, move features to skills, optimize coordinator prompt, create regression tests. Report in decisions inbox.

