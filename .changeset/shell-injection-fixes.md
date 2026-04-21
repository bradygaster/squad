---
'@bradygaster/squad-sdk': patch
---

Eliminate shell injection vectors in scheduler and state backend

- Replace all `execSync` calls with `execFileSync` using explicit argv arrays (no shell interpretation)
- Refactor git helper functions to accept `string[]` instead of space-delimited strings
- Add `validateTaskRef()` for scheduler script refs (rejects null bytes, newlines)
- Add `validateStateKey()` for state backend keys (rejects null bytes, newlines, tabs, path traversal)
- Validate script task refs at manifest parse time (defense-in-depth)
- Add security-focused tests for both scheduler and state backend
