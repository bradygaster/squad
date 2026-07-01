# Keeping Squad State Where You Want It
Squad's current state directory is **`.squad/`**, not `.ai-team/`.
If you're deciding where team state should live, there are two different mechanisms in the product today:
1. **External state location** — `squad externalize` / `squad internalize`
2. **State backends** — `local`, `orphan`, and `two-layer`
Those shipped mechanisms are the options this page focuses on.
---
## What ships today
| Option | How you enable it | What it stores | Best fit |
|---|---|---|---|
| **Local working tree** | default | `.squad/` files in the repo | simplest workflow |
| **External state location** | `squad externalize` | mutable `.squad/` state in a platform-specific app-data directory | branch-switch safety without Git plumbing |
| **Orphan backend** | `squad init --state-backend orphan` or `squad upgrade --state-backend orphan` | mutable state on the `squad-state` orphan branch | clean working tree, Git history |
| **Two-layer backend** | `squad init --state-backend two-layer` or `squad upgrade --state-backend two-layer` | durable state on `squad-state`, plus best-effort git notes annotations | recommended team backend |
> `stateBackend: "external"` is **not** a real backend today. The SDK accepts the value for compatibility, warns that it is a stub, and falls back to `local`.
---
## 1. Local working tree (default)
This is the default behavior. Squad reads and writes regular files under `.squad/` in your working tree.
**Pros**
- Easiest to understand and inspect
- Works well when you want team state committed with the repo
- No special Git setup required
**Cons**
- State can show up in diffs and PRs
- Uncommitted state is vulnerable to branch switches and cleanup commands
- Shared editing can create merge conflicts in files like `decisions.md`
**Good fit when** you want the repo itself to be the source of truth.
---
## 2. External state location (`squad externalize`)
External state location moves mutable state out of the working tree and into a platform-specific Squad home directory.
```bash
squad externalize
```
What actually happens today:
- Mutable `.squad/` entries are copied to the external directory
- Local-only bootstrap files such as `.squad/config.json`, `manifest.json`, `workstreams.json`, `upstream.json`, `squad-registry.json`, and `_upstream_repos/` stay local
- Squad ensures **`.squad/config.json`** is in `.gitignore`
- `squad internalize` copies the externalized entries back, but does **not** remove the `.gitignore` entry
**Pros**
- Keeps mutable team state out of PRs
- Branch switches no longer destroy the externalized state
- No orphan branch or Git hooks required
**Cons**
- The external directory is machine-local unless you back it up yourself
- Not every file under `.squad/` moves out; bootstrap metadata stays local
- This is separate from the `stateBackend` system
**Good fit when** you want clean code branches but do not need Git-native history for team state.
See also: [External State Storage](/squad/docs/features/external-state/).
---
## 3. Orphan backend (`squad-state` branch)
The **orphan** backend stores mutable state on a dedicated `squad-state` branch using Git plumbing commands. The branch is never checked out as your working branch.
```bash
squad init --state-backend orphan
# or
squad upgrade --state-backend orphan
```
What the SDK actually ships:
- `OrphanBranchBackend` stores files as blobs on `squad-state`
- Reads use Git object lookups such as `git show squad-state:<path>`
- Writes create commits on the orphan branch
- The CLI installs Git hooks to help keep the branch synchronized
**Pros**
- Clean working tree
- Full Git history for squad state
- Easy to inspect with normal Git commands
**Cons**
- More Git machinery than local or external state
- Single-writer coordination is still helpful during concurrent updates
**Good fit when** you want Git-versioned squad state without mixing it into normal code commits.
---
## 4. Two-layer backend (recommended for teams)
The **two-layer** backend combines the orphan branch with best-effort Git notes.
```bash
squad init --state-backend two-layer
# or
squad upgrade --state-backend two-layer
```
What the SDK actually ships:
- `TwoLayerBackend` reads durable state from the orphan branch
- It also attempts note writes through `GitNotesBackend` for commit-scoped annotations
- If the notes layer fails, the durable orphan-layer write still succeeds
- `git-notes` as a standalone backend is deprecated and normalized to `two-layer`
**Pros**
- Clean working tree
- Durable, per-file state on `squad-state`
- Better team story than plain orphan or historical git-notes-only storage
**Cons**
- Most operationally complex option
- Requires Git repository semantics and hook setup
**Good fit when** multiple people or agents need a branch-safe, team-oriented backend.
See also: [State Backends](/squad/docs/features/state-backends/).
---
## What the SDK exports today
If you're building on the SDK, there are two public surfaces to know about.
### State backend surface
From `@bradygaster/squad-sdk`, the current public backend API includes:
- `resolveStateBackend()`
- `WorktreeBackend`
- `GitNotesBackend` (kept for compatibility; standalone use is deprecated)
- `OrphanBranchBackend`
- `TwoLayerBackend`
- `StateBackendStorageAdapter`
- `verifyStateBackend()`
### Typed state facade surface
The `./state` export provides a typed facade over `.squad/` state, including:
- `SquadState`
- `AgentsCollection`
- `DecisionsCollection`
- `RoutingCollection`
- `TeamCollection`
- `SkillsCollection`
- `TemplatesCollection`
- `ConfigCollection`
- `LogCollection`
Use this when you want typed access to Squad state without dealing with raw file paths yourself.
---
## Important distinction: location vs backend
These are related, but not the same thing:
- **External state location** changes where mutable state lives on disk (`stateLocation: "external"` in `.squad/config.json`)
- **State backends** change how mutable state is persisted (`stateBackend: "local" | "orphan" | "two-layer"`)
If you are choosing a strategy, decide first whether you want:
1. plain files,
2. an external directory, or
3. Git-native storage.
---
## Quick guidance
- **Want the simplest setup?** Stay on **local**.
- **Want branch-safe local storage without Git plumbing?** Use **externalize/internalize**.
- **Want Git history but a clean working tree?** Use **orphan**.
- **Want the most team-oriented shipped backend?** Use **two-layer**.
---
## See Also
- [External State Storage](/squad/docs/features/external-state/)
- [State Backends](/squad/docs/features/state-backends/)
- [Adding Squad to an Existing Repo](existing-repo.md)
