---
"@bradygaster/squad-sdk": patch
---

Fix identity/ state writes and widen squad_decide author validation (#1255, #1256).

- **#1255**: Add `identity/` to the `validateMutableStateToolKey` allowlist so agents can write to `identity/now.md` and other files under `identity/` as required by `squad.agent.md`.
- **#1256**: Relax the `squad_decide` author regex from `^[a-zA-Z0-9_-]+$` to accept any printable ASCII character (e.g. spaces, parens) while enforcing a 200-character cap. The raw author string is preserved in the `**By:**` display line; a slugified form (lowercase, non-alphanumeric replaced with `-`, collapsed and trimmed) is used for the inbox filename to keep filenames filesystem-safe. Reject author strings that sanitize to an empty slug (e.g. spaces/punctuation only); report the actual written filename in the success message.
