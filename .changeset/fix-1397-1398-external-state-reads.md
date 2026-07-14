---
"@bradygaster/squad-cli": patch
---

`squad copilot` and `squad rc` now follow externalized state: roster reads and writes go to the external state dir when `.squad/config.json` has the `stateLocation: external` marker, instead of always using the local `.squad/team.md`.
