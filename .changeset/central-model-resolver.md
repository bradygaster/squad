---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

Central model resolver (#1720): `resolveModel` in `@bradygaster/squad-sdk` adds `config`, `session` and `fallback` sources, applies the exported `MODEL_RESOLUTION_PRECEDENCE` (user-override > config > session > charter > task-auto > default), and returns a `rationale` for every choice. A session-picked model is inherited by every sub-agent spawn with source `session`, and `unavailableModels` triggers fallback-chain selection. Coordinator spawn guidance and `model-selection-reference.md` no longer hard-code model IDs; spawn acknowledgments show model, source and rationale, with catalog IDs kept in a separate appendix.
