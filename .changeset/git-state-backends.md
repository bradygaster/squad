---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat(sdk): git-notes + orphan-branch state backends for .squad/

Adds git-native state storage backends as alternatives to the local (disk)
approach:

- **orphan-branch** (`squad-state`): Dedicated orphan branch with no common
  ancestor. State files never appear in main.
- **two-layer** (notes + orphan): Git notes as best-effort commit annotations
  plus orphan branch for durable state. Recommended for teams.

Configure via `.squad/config.json`: `{ "stateBackend": "two-layer" }` or
the `--state-backend` CLI flag.