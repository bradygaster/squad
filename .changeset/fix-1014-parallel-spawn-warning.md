---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Coordinator template now warns before launching 2+ parallel background agents in a shared worktree: global-scope git operations (stash/clean/restore) from one agent can silently delete another agent's untracked files. Warn-only — worktree mode remains opt-in. The worktree reference no longer claims shared-worktree concurrency is safe when agents touch different files.
