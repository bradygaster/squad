---
"@bradygaster/squad-cli": minor
---

`squad init` now defaults to writing `"chat.newSession.defaultMode": "Squad"` into `.vscode/settings.json`, so new VS Code chat sessions open in Squad mode automatically. The edit is JSONC-aware (preserves comments, trailing commas, and existing keys), idempotent, and skipped when the key already exists. Pass `--no-vscode-default` to opt out entirely.
