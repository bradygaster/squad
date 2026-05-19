---
'@bradygaster/squad-sdk': patch
---

Bump `@github/copilot-sdk` from `^0.1.32` to `^0.3.0` to fix ESM module resolution error (ERR_MODULE_NOT_FOUND for vscode-jsonrpc/node). Add explicit GitHub repo config support in `.squad/config.json` (`{ "github": { "owner": "...", "repo": "..." } }`) so platform adapter prefers user-specified repo over auto-detection from origin remote. (closes #1062, closes #905)
