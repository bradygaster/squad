---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

Warn when squad.agent.md template is missing during upgrade or init instead of silently skipping file creation. Adds `warnings` field to `InitResult` for structured error reporting.
