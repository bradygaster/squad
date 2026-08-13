# Keeping Your Squad State Where You Want It

Your `.squad/` directory contains everything — team rosters, skills, decisions, agent histories. The question isn't whether to track it, but *where* to track it. Squad gives you three storage backends, each suited to different team sizes and workflows.

---

## Quick Decision

| Situation | Recommended backend |
|---|---|
| Solo dev or small team, want simple setup | **local** (default) |
| Want a clean working tree, no PR noise | **orphan** |
| Team with concurrent writers, want full safety | **two-layer** |

Configure your backend once during `squad init` or `squad upgrade`. The choice is stored in `.squad/config.json` — you never pass it again.

---

## Setting Your Backend

### New project

```bash
# Default — state files in .squad/ in the working tree
squad init

# Orphan branch — state on a dedicated squad-state branch
squad init --state-backend orphan

# Two-layer — recommended for teams with concurrent writers
squad init --state-backend two-layer
```

### Existing project

```bash
# Migrate from local to a different backend
squad upgrade --state-backend two-layer
# or: squad upgrade --state-backend orphan
```

The migration moves your existing state, creates the orphan branch (if applicable), and installs git hooks automatically.

---

## The Three Backends

### Local (default)

State lives as regular files in `.squad/` inside your working tree — the same directory structure you see when you `ls`.

**Pros:**
- Simple and familiar — files on disk
- Easy to inspect, edit, and commit
- Works with all Git tools and IDEs

**Cons:**
- Files show up in `git status` and PR diffs
- Branch switches can lose uncommitted state
- Multiple team members modifying `.squad/` causes merge conflicts

**Best for:** Most solo projects, especially when you want squad state committed alongside your code for portability.

```json
// .squad/config.json
{
  "stateBackend": "local"
}
```

---

### Orphan Branch

State lives on a dedicated orphan branch (`squad-state` by default). This branch has no common history with your main branches — it's a separate tree used only for squad data.

**How it works:**
- An orphan branch `squad-state` is created automatically on first write
- All state reads use `git show squad-state:<path>`; writes create new commits on the branch
- The branch is never checked out — all operations use Git plumbing commands
- Git hooks (installed automatically) keep the branch in sync when you push/pull

**Pros:**
- Working tree stays clean — no `.squad/` clutter in your diffs
- State is versioned with full Git history
- Easy to inspect: `git log squad-state` or `git show squad-state:decisions.md`

**Cons:**
- An extra branch in the repository
- Concurrent writes from multiple people can conflict (single-writer workflows work best)

**Best for:** Solo or small-team projects where you want a clean working tree.

```json
// .squad/config.json
{
  "stateBackend": "orphan"
}
```

---

### Two-Layer (recommended for teams)

Combines an orphan branch for durable file-per-state storage with git notes for best-effort commit annotations. This is the team-safe option.

**How it works:**
- Durable squad state (decisions, agent histories, casting, routing) lives on the orphan branch with per-file granularity — fully mergeable by Git
- Git notes on commits provide lightweight "why this commit" annotations
- Git hooks prevent accidentally staging squad state into a working-tree commit and flush pending state after each commit

**Pros:**
- Working tree stays clean
- Concurrent writers are safe — per-file granularity means Git can merge state from multiple contributors
- Automatic sync via hooks: push/pull keeps the orphan branch in sync

**Cons:**
- Slightly more complex to debug
- Requires the orphan branch to be pushed to the remote for team sharing

**Best for:** Teams with multiple developers working simultaneously on the same repo.

```json
// .squad/config.json
{
  "stateBackend": "two-layer"
}
```

> **Note on the deprecated `git-notes` backend:** If your config still references `git-notes`, Squad automatically migrates it to `two-layer` at runtime. The standalone git-notes backend stored all state as a single JSON blob and could not handle concurrent writes; the two-layer backend replaces it.

---

## What Gets Installed Automatically

When you choose `orphan` or `two-layer`, Squad installs Git hooks in `.git/hooks/`:

| Hook | Purpose |
|---|---|
| `pre-push` | Syncs orphan branch state before push |
| `post-merge` | Pulls orphan branch state after merge |
| `post-checkout` | Refreshes state when you switch branches |
| `post-rewrite` | Syncs after rebase or amend |
| `pre-commit` | Guards against accidentally staging two-layer mutable state |
| `post-commit` | Flushes pending two-layer state to the orphan branch |

Hooks chain with existing hooks (husky, etc.) — nothing is overwritten.

---

## Inspecting and Debugging Your State

```bash
# See which backend you're using
cat .squad/config.json

# Orphan or two-layer: inspect state branch
git log squad-state --oneline -10
git show squad-state:decisions.md

# Check installed hooks
ls .git/hooks/

# Migrate to a different backend
squad upgrade --state-backend two-layer
```

---

## Sharing State with Your Team

For `orphan` and `two-layer`, push the orphan branch to your remote so teammates can access it:

```bash
git push origin squad-state
```

Team members who clone the repo or run `squad upgrade` will pull down the state branch and install hooks automatically.

For `local`, the standard approach is to commit `.squad/` alongside your code (or gitignore it for local-only state). There is no separate sync mechanism for the local backend.

---

## Related

- [State Backends](../features/state-backends.md) — full reference for backend configuration options
- [External State](../features/external-state.md) — cloud and remote storage options
