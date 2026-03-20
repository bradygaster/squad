# Decision: Dual-Layer ESM Fix for vscode-jsonrpc

**By:** GNC
**Issue:** #449
**Date:** 2025-07-25

## What

ESM module resolution for `vscode-jsonrpc` subpath imports now uses a dual-layer postinstall strategy:

1. **Layer 1 (canonical):** Inject `exports` field into `vscode-jsonrpc@8.2.1/package.json` — fixes ALL subpath imports at once.
2. **Layer 2 (defense-in-depth):** Patch `copilot-sdk/dist/session.js` to add `.js` extension — kept as fallback.
3. **Layer 3 (runtime):** `cli-entry.ts` `Module._resolveFilename` intercept — handles npx cache hits where postinstall never runs.

`squad doctor` now detects both Layer 1 and Layer 2 issues.

## Why

- vscode-jsonrpc@8.2.1 has no `exports` field; Node 22+ strict ESM rejects extensionless subpath imports.
- Patching individual files (session.js) doesn't scale — any future copilot-sdk file using `vscode-jsonrpc/node` would break.
- The exports field injection matches what vscode-jsonrpc v9.x ships, making it forward-compatible.

## Impact

All agents should know: if a user reports ESM import errors on Node 22/24, direct them to `squad doctor` which now detects and reports the exact issue.
