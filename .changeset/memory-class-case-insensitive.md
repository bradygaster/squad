---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

Treat governed memory class names case-insensitively. `memory.write`, `memory.classify` and `memory.promote` now map `decision` or ` Decision ` to `DECISION`, so a decision recorded with a lowercase class reaches `decisions/inbox` instead of being misfiled in `memory/local`, and lowercase `forbidden`, `transient` or `copilot_memory` no longer skip their governance gates. Unknown class names are rejected instead of being stored; the content scan still runs first, so secrets are rejected and audited either way. `memory.promote` now requires `targetClass` and refuses `FORBIDDEN` and `TRANSIENT` targets with a clear message. The SDK now exports `MEMORY_CLASSES`, `parseMemoryClass` and `UnknownMemoryClassError`. The coordinator template and the coordinator-response-mode skill now spell the class `DECISION`.
