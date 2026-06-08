---
"@bradygaster/squad-cli": minor
"@bradygaster/squad-sdk": minor
---

Log each project at `squad init` and add `squad projects` to list them

`squad init` now records the project (name, absolute path, and creation timestamp) in a global registry, `projects.json`, stored under the existing global Squad home (`resolveGlobalSquadPath()`). A new `squad projects` command reads that registry and prints every Squad project on the machine, newest first.

This closes a small but common gap: after working across several repositories, a user had no built-in way to remember where all of their Squad projects live. The feature is purely additive:

- **`squad-sdk`** gains `registerProject()` and `readProjectsRegistry()` (plus the `ProjectRegistryEntry` type). The registry write is idempotent on the project path (re-running `squad init` updates the entry in place, never duplicating) and fail-safe (a registry error never blocks init).
- **`squad-cli`** calls `registerProject()` during repo `squad init` (global `--global` init is intentionally not registered, since it is the personal home, not a project) and adds the `squad projects` reader command.

No existing init output, project `.squad/` state, or other command behavior changes.
