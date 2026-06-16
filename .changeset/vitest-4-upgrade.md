---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Bump vitest from v3 to v4 alongside @vitest/coverage-v8 v4 to resolve peer-dep mismatch. Both packages now align at ^4.1.9 across root and all sample workspaces. No API adaptations required — vitest 4's spying rewrite is backwards-compatible for the mock/spyOn patterns used in this codebase.
