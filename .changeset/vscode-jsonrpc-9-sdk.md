---
"@bradygaster/squad-sdk": patch
---

Sync lockfile for the vscode-jsonrpc 8→9 bump in packages/squad-sdk. v9 adds the missing `exports` field that v8 lacked, making `vscode-jsonrpc/node` resolvable under strict ESM without `patch-esm-imports.mjs` runtime workarounds.