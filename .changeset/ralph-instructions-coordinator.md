---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

The coordinator template now tells Ralph to read `.squad/ralph-instructions.md` (when present) before dispatching issue work, not only `squad watch --execute`; fixed the self-referencing pointer in `ralph-reference.md`.
