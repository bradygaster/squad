---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Automatically migrate supported unversioned casting state before upgrading managed files, including already-current upgrades. Preserve identities and timestamps, archive original registry/history bytes without overwriting, and fail closed on unsupported or inconsistent state. Dry runs validate without mutating casting state.
