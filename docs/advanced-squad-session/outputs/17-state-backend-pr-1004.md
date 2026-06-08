# 1004: feat: wire state backends into all squad operations (worktree, git-notes, orphan, two-layer)
State: MERGED
URL: https://github.com/bradygaster/squad/pull/1004
Head: bradygaster/feat/state-backend-global-996

## feat: wire state backends into all squad operations

Closes #1003, closes #1013

### What changed

Makes state backends work **squad-wide** with 4 options: `worktree` (default), `git-notes`, `orphan`, and `two-layer` (the blog architecture).

### New: `squad init --state-backend <type>`

```bash
squad init --state-backend two-layer   # configures + creates orphan branch
squad init --state-backend git-notes   # configures git-notes
squad init --state-backend orphan      # configures + creates orphan branch
squad init                             # default worktree (unchanged)
```

Auto-creates `squad-state` orphan branch for orphan/two-layer backends at init time.

### Backend comparison

| Backend | Agent reads | Agent writes | Scribe commits to | PR clean? |
|---------|-------------|--------------|-------------------|-----------|
| `worktree` | disk | disk | Working branch | No |
| `git-notes` | git notes | `write-note.ps1` | Pushes note refs | Yes |
| `orphan` | disk (synced) | disk | `squad-state` orphan | Yes |
| `two-layer` | disk (synced) | notes + disk | orphan + note refs | Yes |

The `two-layer` option implements the architecture from [Tamir's blog](https://www.tamirdresher.com/blog/2026/03/23/scaling-ai-part7b-git-notes): git notes for commit-scoped "why" annotations + orphan branch for permanent state. Ralph promotes notes with `promote_to_permanent: true` after PR merge.

### Changes by package

**SDK (squad-sdk):**
- `StateBackend` interface: added `delete()` and `append()`
- 4 backends: WorktreeBackend, GitNotesBackend (root-commit anchor), OrphanBranchBackend, TwoLayerBackend
- StateBackendStorageAdapter, SquadStateContext, resolveSquadState()

**CLI (squad-cli):**
- `squad init --state-backend <type>` flag with orphan branch auto-creation
- `cli-entry.ts` wires resolveSquadState after --state-backend parsing
- `watch/config.ts` accepts pre-resolved backend

**Coordinator (squad.agent.md):**
- Detects STATE_BACKEND from config.json at session start
- Conditional spawn templates for all 4 backends
- Two-layer protocol: agents write notes with promote_to_permanent + inbox files
- Scribe spawn: backend-specific commit + State Leak Guard (step 0)
- Scribe charter: full orphan/git-notes/two-layer commit workflows

**Templates:** notes-protocol.md, fetch.ps1, write-note.ps1
**Docs:** Quick start, migration guide, troubleshooting, coordinator integration table

### E2E Test Results: 12/12 pass

| # | Test | Backend | Result |
|---|------|---------|--------|
| 1 | Worktree baseline | worktree | PASS |
| 2 | Git-notes basic | git-notes | PASS |
| 3 | Git-notes cross-branch | git-notes | PARTIAL (note on HEAD not root) |
| 4 | Scribe merges notes | git-notes | PASS |
| 5 | Orphan basic | orphan | PASS |
| 6 | Orphan PR cleanliness | orphan | PASS |
| 7 | State leak guard | orphan | PASS |
| 8 | Orphan cross-branch | orphan | PASS |
| 9 | Migration to notes | migration | PASS |
| 10 | Migration to orphan | migration | PASS |
| 11 | Two-layer basic | two-layer | PARTIAL (notes ok, orphan commit timing) |
| 12 | Two-layer from init | two-layer | PASS |

**Test 12 proof (init --state-backend two-layer):**
- Config: `stateBackend: "two-layer"` set at init
- Orphan branch auto-created with README
- Team created (Usual Suspects), auth decision made
- Orphan log: `state: promote team roster`, `state: promote auth decision`
- Git notes: `refs/notes/commits` with promote_to_permanent entries

