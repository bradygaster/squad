# GNC

> Guidance, Navigation, and Control Officer

## Learnings

### ESM Compatibility Layer
@github/copilot-sdk@0.1.32 has broken ESM import (session.js uses 'vscode-jsonrpc/node' missing .js extension). Two-layer fix: (1) lazy-load copilot-sdk so init/build/watch don't trigger it, (2) postinstall patch in packages/squad-cli/scripts/patch-esm-imports.mjs. Runtime Module._resolveFilename patch in cli-entry.ts for npx where postinstall doesn't run.

### Node Version Requirements
Node.js ≥20 required. Node 24+ enforces strict ESM resolution (no extensionless imports). cli-entry.ts has runtime check that warns about node:sqlite availability (≥22.5.0).

### Dual-Layer ESM Fix (Issue #449)
Upgraded from single-layer session.js patch to dual-layer approach: (1) Inject `exports` field into vscode-jsonrpc@8.2.1 package.json at postinstall — this is the canonical fix that resolves ALL subpath imports at once, matching vscode-jsonrpc v9.x. (2) Keep session.js `.js` extension patch as defense-in-depth. Added `squad doctor` detection for both layers (checks vscode-jsonrpc exports field and copilot-sdk session.js import syntax). Runtime Module._resolveFilename patch in cli-entry.ts remains as Layer 3 for npx cache hits where postinstall never runs.
