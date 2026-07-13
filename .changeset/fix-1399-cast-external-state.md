---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

`squad cast` now discovers project agents from the external state dir when state is externalized. `LocalAgentSource` accepts an optional explicit agents directory that overrides the `.squad/agents` probing, since externalized state keeps agents at `<externalStateDir>/agents` with no `.squad` nesting.
