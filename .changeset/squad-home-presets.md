---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat: add SQUAD_HOME env var and preset system

- Add `SQUAD_HOME` environment variable support for a roaming squad root directory
- Add preset system for reusable agent configurations (list, show, apply, init)
- Ship a default built-in preset with 5 agents (lead, reviewer, devrel, security, docs)
- Add `squad preset` CLI command with list, show, apply, and init subcommands
- Resolves #1038
