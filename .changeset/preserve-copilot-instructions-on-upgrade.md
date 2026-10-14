---
"@bradygaster/squad-cli": patch
---

Preserve user-authored `.github/copilot-instructions.md` content during `squad upgrade`, `squad init`, and `squad copilot` by managing the Squad instructions section with `<!-- squad:copilot-instructions:start -->` and `<!-- squad:copilot-instructions:end -->` markers instead of overwriting the entire file (#2186).
