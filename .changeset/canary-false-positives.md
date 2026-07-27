---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix #1461 canary false-positives: add HEAD canary to coordinator prompt and make the Canary Check three-state + coordinator-scoped so spawned/non-Squad agents no longer false-halt and truncation is positively detected.
