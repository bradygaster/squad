---
"@bradygaster/squad-sdk": patch
---

test: SDK feature parity batch 3 — 46 tests for #31, #47, #45, #46

Adds 46 automated tests covering 4 SDK features from the #341 parity matrix:
- RalphMonitor idle-watch mode (#31): construction, event handling, stale session detection
- Platform detection (#47): GitHub/Azure DevOps URL parsing, detectPlatformFromUrl
- Reviewer lockout (#45): rejection protocol, per-artifact scope, persistence
- Deadlock handling (#46): all-agents-locked detection, clearLockout escalation, recovery
