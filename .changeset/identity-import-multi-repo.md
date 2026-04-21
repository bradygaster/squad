---
'@bradygaster/squad-cli': minor
---

Add `--import` flag to `squad identity create` for multi-repo identity reuse. When a GitHub App already exists from another repo, `--import /path/to/source-repo` copies credentials and triggers installation on the current repo. Also improves error handling when app name is already taken, suggesting the `--import` flag.
