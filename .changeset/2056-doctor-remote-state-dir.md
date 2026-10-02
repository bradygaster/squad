---
"@bradygaster/squad-cli": patch
---

`squad doctor` now validates team state files (`team.md`, `routing.md`, `agents/`, `casting/registry.json`, `decisions.md`) against the resolved team root in remote (linked) mode instead of the local `.squad/` stub, which only holds `config.json`. Previously this caused false "file not found" failures for correctly configured `squad link` setups even though `squad status` and `squad cast` resolved the team fine. Fixes #2056.
