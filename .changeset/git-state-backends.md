---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat(sdk): git-notes + orphan-branch state backends for .squad/

Adds two git-native state storage backends as alternatives to the worktree
and external directory approaches:

- **git-notes** (`refs/notes/squad`): State stored in git notes ref. Survives
  branch switches, invisible in diffs and PRs.
- **orphan-branch** (`squad-state`): Dedicated orphan branch with no common
  ancestor. State files never appear in main.

Configure via `.squad/config.json`: `{ "stateBackend": "git-notes" }` or
the `--state-backend` CLI flag.