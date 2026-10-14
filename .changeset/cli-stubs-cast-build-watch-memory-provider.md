---
"@bradygaster/squad-cli": patch
---

Implement persisted agent creation for `squad cast --name <name> --role <role>` and `squad hire`, implement `squad build --watch` with initial build and live rebuilds, and report unsupported `squad memory provider --provider copilot` via `SquadError` with aligned help text (#2191, #2192, #2193).
