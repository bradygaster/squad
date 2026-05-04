# State Backends

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad supports multiple **state backends** for storing `.squad/` state (decisions, agent memories, session logs, skills). Each backend determines _where_ and _how_ this data is persisted — without changing how agents interact with it. Once configured, everything is automatic.

---

## The Problem

By default, Squad stores `.squad/` state as regular files in your working tree. This works for solo workflows but has real trade-offs for teams:

- **Branch pollution:** `.squad/` files appear in diffs and PRs
- **Branch-switch loss:** State can be lost when switching branches (if not committed)
- **Merge conflicts:** Multiple team members modifying `.squad/` files creates frequent conflicts

State backends solve this by moving `.squad/` data into Git-native structures that live outside the working tree — keeping your PRs clean and your state safe across branches.

---

## Getting Started

### New project — choose a backend during init

```bash
# Default (local — files in .squad/, same as always)
squad init

# Orphan branch (state on a dedicated squad-state branch)
squad init --state-backend orphan

# Two-layer (recommended for teams — orphan branch + git notes)
squad init --state-backend two-layer
```

The backend is stored in `.squad/config.json` — you never need to pass it again. All subsequent commands (`squad watch`, interactive sessions, etc.) read from config automatically.

### Existing project — migrate with upgrade

```bash
# Migrate from local to orphan or two-layer
squad upgrade --state-backend two-layer

# Or: squad upgrade --state-backend orphan
```

This migrates existing state, creates the orphan branch, and installs git hooks for automatic multi-user sync. No manual steps needed.

### What gets installed automatically

When you choose `orphan` or `two-layer`:
- **Git hooks** (pre-push, post-merge, post-checkout, post-rewrite) are installed in `.git/hooks/`
- These hooks sync the `squad-state` branch automatically when you push/pull — no manual sync needed
- Hooks chain with existing hooks (husky, etc.) — nothing is overwritten

---

## Available Backends

### Local (default)

State lives as regular files in `.squad/` inside the working tree. This is the standard behavior — what you get out of the box.

**Pros:**
- Simple and familiar — files on disk
- Easy to inspect, edit, and commit
- Works with all Git tools and IDEs

**Cons:**
- Files appear in `git status` and diffs
- Branch switches can lose uncommitted state

**Best for:** Most projects, especially when you want squad state committed alongside code.

---

### Git Notes (Deprecated → Two-Layer)

> ⚠️ **Deprecated:** The standalone `git-notes` backend has been removed as a user-facing option. If your config still references `git-notes`, it will be **automatically migrated to `two-layer`** at runtime.
>
> **Why:** Standalone git-notes stores all state as a single JSON blob on the root commit. This fundamentally cannot handle concurrent writes from multiple team members — `git notes merge` cannot merge opaque JSON, causing silent data loss.
>
> **Replacement:** The `two-layer` backend uses git notes as best-effort commit annotations (the "why" layer) while storing durable state on an orphan branch with per-file granularity (the "state" layer). This gives you the clean working tree of git-notes with the team-safe mergeability of the orphan approach.

---

### Orphan Branch

State lives on a dedicated orphan branch (`squad-state` by default). The branch has no common history with your main branches — it's a completely separate tree used only for squad data.

**How it works:**
- An orphan branch `squad-state` is created automatically on first write
- Each state file is stored as a blob in the branch's tree
- Reads use `git show squad-state:<path>`, writes create new commits on the branch
- The branch is never checked out — all operations use Git plumbing commands

**Pros:**
- Working tree stays clean
- State is versioned with full Git history
- Easy to inspect: `git log squad-state`, `git show squad-state:decisions.md`
- Pushes/fetches with normal branch operations

**Cons:**
- An extra branch in your repository
- Slightly more complex than `local` for debugging
- Concurrent writes to the branch can conflict (single-writer recommended)

**Best for:** Teams who want Git-versioned state without polluting the main branch history.

---

## Configuration

The state backend is set once (during `squad init` or `squad upgrade`) and stored in `.squad/config.json`:

```json
{
  "version": 1,
  "teamRoot": ".",
  "stateBackend": "two-layer"
}
```

All squad commands read from this file automatically. You don't need to pass `--state-backend` on every invocation.

> **Note:** If no `stateBackend` field exists, the default is `local` (current behavior, no change).

### Fallback Behavior

If a non-default backend fails to initialize (e.g., Git is not available, permissions issue), Squad automatically falls back to the **local** backend with a warning:

```
Warning: State backend 'two-layer' failed: <reason>. Falling back to 'local'.
```

---

## Comparison

| Feature | Local | Orphan Branch | Two-Layer |
|---------|-------|---------------|-----------|
| Working tree clean | ❌ | ✅ | ✅ |
| Appears in PRs | Yes (if committed) | No | No |
| Human-readable on disk | ✅ Files | ⚠️ Via `git show` | ⚠️ Via `git show` |
| Git history | Via normal commits | Per-branch commits | Per-branch + notes |
| Branch-switch safe | ❌ (if uncommitted) | ✅ | ✅ |
| Easy to inspect | ✅ `cat .squad/...` | ⚠️ `git show squad-state:...` | ⚠️ `git show squad-state:...` |
| Sharing across clones | Normal push/pull | Normal branch push/pull | Normal branch push/pull |
| Concurrent-write safe | ✅ (filesystem) | ⚠️ (single writer) | ✅ (per-file merge) |
| Team-safe (multi-user) | ❌ (merge conflicts) | ⚠️ (needs coordination) | ✅ (designed for teams) |

---

## Inspecting State

### Local

```bash
cat .squad/decisions.md
ls .squad/skills/
```

### Git Notes

```bash
# Show all state as JSON (anchored to root commit)
git notes --ref=squad show $(git rev-list --max-parents=0 HEAD)

# Pretty-print
git notes --ref=squad show $(git rev-list --max-parents=0 HEAD) | python -m json.tool
```

### Orphan Branch

```bash
# List all state files
git ls-tree --name-only -r squad-state

# Read a specific file
git show squad-state:decisions.md

# View commit history
git log --oneline squad-state
```

---

## SDK Usage

The state backend is available programmatically via the Squad SDK:

```typescript
import {
  resolveSquadState,
  resolveStateBackend,
  type StateBackend,
} from '@bradygaster/squad-sdk';

// Option 1: Full context resolution (recommended)
// Resolves paths + backend from config + CLI override in one call
const ctx = resolveSquadState(process.cwd(), 'two-layer');
if (ctx) {
  ctx.backend.write('decisions.md', '# Decisions\n...');
  ctx.backend.append('log.md', 'New entry\n');
  ctx.backend.delete('inbox/processed.md');
}

// Option 2: Backend-only resolution
const backend: StateBackend = resolveStateBackend(
  '.squad',           // squadDir
  process.cwd(),      // repoRoot
  'two-layer'         // optional CLI override
);
backend.write('decisions.md', '# Decisions\n...');
```

All backends implement the same `StateBackend` interface:

```typescript
interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  delete(relativePath: string): boolean;
  append(relativePath: string, content: string): void;
  readonly name: string;
}
```

---

## Security

State backends include hardening against common injection attacks:

- **Path traversal:** `..` segments are rejected
- **Null byte injection:** `\0` characters are rejected
- **Newline injection:** `\n` and `\r` characters are rejected (prevents Git plumbing manipulation)
- **Tab injection:** `\t` characters are rejected (prevents mktree format corruption)
- **Empty segments:** Double slashes (`//`) are rejected

All validation is centralized in `validateStateKey()` and applied uniformly across all backends.

---

## Content Fidelity

All backends preserve content exactly as written — including trailing newlines, leading whitespace,
and empty lines. This is critical for append-only files like `history.md` and `decisions.md` where
multiple agents append entries over time.

The orphan and two-layer backends use raw `execFileSync` for content reads (without trimming) to
ensure faithful round-trips. Git plumbing helpers that trim output are only used for non-content
operations like `rev-parse` and `ls-tree`.

---

## Worktree Awareness

When running in a git worktree, `resolveSquadState()` uses `git rev-parse --show-toplevel` to
determine the actual current worktree root — not the parent of `.squad/`. This ensures that
git-native backends (orphan, two-layer) operate in the correct repository context, even when
`.squad/` is resolved from the main checkout via the worktree fallback strategy.

---

## Notes

- State backends are **opt-in** — the default is `local` (no behavior change)
- All backends implement the same interface — agents don't know or care which backend is active
- Empty directories are automatically pruned after the last file is deleted (orphan backend)
- The `external` backend type exists as a stub for future external storage (see [External State](./external-state))
- State backends are available in the **insider** release channel (`@bradygaster/squad-cli@insider`)
- 63 unit tests + 46 E2E tests cover all backends including security hardening, content fidelity, and directory pruning

---

## Using with Copilot CLI Sessions

The SDK's `StateBackend` interface handles programmatic state for Squad internals, but Copilot agents also need a way to write commit-scoped context — decisions, research, reviews — without creating `.squad/` file changes that pollute PRs.

The solution: agents use **git notes CLI commands** directly for mutable, commit-scoped state. The `notes-protocol.md` template defines the contract.

### How it works

1. Each agent writes to its own namespace: `refs/notes/squad/{agent-name}`
2. Notes are JSON with required fields: `agent`, `timestamp`, `type`, `content`
3. Notes are invisible in PR diffs — they travel as git refs, not files
4. Ralph promotes notes with `"promote_to_permanent": true` to `decisions.md` after merge
5. If a PR is rejected, notes on those commits are NOT promoted (desired behavior)

### Setup

When you enable `stateBackend: "two-layer"` or `stateBackend: "orphan"`, copy the notes protocol and helper scripts into your project:

```bash
# Copy from Squad's templates (after squad init)
cp .squad/templates/notes-protocol.md .squad/notes-protocol.md
cp -r .squad/templates/scripts/notes/ scripts/notes/

# One-time git config for notes fetch
./scripts/notes/fetch.ps1 -Setup
```

### Copilot Instructions Integration

Add the following to your `.github/copilot-instructions.md` (or `.copilot/copilot-instructions.md`) to teach agents the notes protocol:

````markdown
## Git Notes — State Protocol

**Every agent uses git notes for commit-scoped state.** Do not write to
`.squad/decisions.md` or other `.squad/` files directly on feature branches.

### On every work round

1. **Start**: `git fetch origin 'refs/notes/*:refs/notes/*'`
2. **When making a decision**: Write it as a note on the relevant commit
3. **End**: `git push origin 'refs/notes/*:refs/notes/*'`

### Write pattern

```bash
git notes --ref=squad/{your-agent} add \
  -m '{"agent":"{Name}","timestamp":"{ISO8601}","type":"decision","content":"..."}' \
  HEAD
```

Use `git notes append` if a note already exists on the commit.

### Key rules

- Write only to your own namespace (`refs/notes/squad/{your-name}`)
- Notes MUST be valid JSON
- Set `"promote_to_permanent": true` for decisions that should outlast the branch
- Set `"archive_on_close": true` for research worth keeping even if the PR is rejected
- Fetch before write, push after your round

See `.squad/notes-protocol.md` for the full contract.
````

### Example: Agent writes a decision, Ralph promotes it

1. **Data** makes an architecture choice and writes a note:
   ```bash
   git notes --ref=squad/data add -m \
     '{"agent":"Data","timestamp":"2026-03-23T14:00:00Z","type":"decision","decision":"Use JWT RS256","reasoning":"Matches existing auth pattern","promote_to_permanent":true}' \
     HEAD
   git push origin 'refs/notes/*:refs/notes/*'
   ```

2. **PR merges** into the default branch.

3. **Ralph** runs promotion on the next watch cycle:
   - Fetches all notes
   - Finds Data's note with `promote_to_permanent: true` on a merged commit
   - Appends the decision to `decisions.md` via the state backend
   - Notes on rejected PRs are silently ignored

### Template files

When `stateBackend` is set to `two-layer` or `orphan`, the following templates are available:

| Template | Purpose |
|----------|---------|
| `notes-protocol.md` | The full agent contract for git notes |
| `scripts/notes/fetch.ps1` | Fetch + setup refspec + merge after conflict |
| `scripts/notes/write-note.ps1` | Agent helper — handles JSON, conflicts, push |

### Automatic Coordinator Integration

**You don't need to manually add copilot-instructions.md snippets.** When `stateBackend` is set in `.squad/config.json`, the Squad coordinator (`squad.agent.md`) automatically adapts its agent spawn prompts:

| Backend | Agent reads | Agent writes | Scribe commits to |
|---------|-------------|--------------|-------------------|
| `local` | `.squad/` files on disk | `.squad/` files on disk | Working branch |
| `orphan` | `.squad/` files on disk (synced) | `.squad/` files on disk | `squad-state` orphan branch (NOT working branch) |
| `two-layer` | Git notes + orphan branch | Git notes via `write-note.ps1` + orphan | Pushes note refs + orphan branch |

**Config vs State distinction:**
- **Static config** (charters, team.md, routing.md, casting/) — always on disk, all backends
- **Mutable state** (history.md, decisions/inbox/, logs, orchestration-log/) — backend-dependent

The coordinator passes `STATE_BACKEND` into every agent spawn prompt. Agents receive backend-specific instructions for reading and writing state. Scribe receives backend-specific commit instructions. This is fully automatic — no user configuration beyond setting `stateBackend` in config.json is needed.

---

## Migrating an Existing Squad

Use `squad upgrade` to migrate — it handles everything:

```bash
squad upgrade --state-backend two-layer
# or: squad upgrade --state-backend orphan
```

This will:
1. Update `.squad/config.json` with the new backend
2. Create the `squad-state` orphan branch (if needed)
3. Install git hooks for automatic sync
4. Preserve all existing state

**What happens:** Existing `.squad/` files remain on disk as a read-only reference. New decisions and state writes go to the orphan branch (and git notes for two-layer). Over time, the on-disk state files become stale (they're the snapshot from before migration), while the orphan branch and notes contain the latest state.

### Switching between orphan and two-layer

Change `stateBackend` in `.squad/config.json`. The coordinator adapts on the next session. Both use the `squad-state` orphan branch, so existing state is preserved. Two-layer additionally enables git notes for commit-scoped annotations.

---

## Troubleshooting

### "My state disappeared after switching branches"

**Cause:** You're using the default `local` backend. State files are branch-local.

**Fix:** Switch to `orphan` or `two-layer` backend. Both persist state across branches:
- Orphan: state lives on a dedicated branch (accessible via `git show squad-state:`)
- Two-layer: orphan branch + git notes for commit-scoped annotations

### "State files are showing up in my PR"

**Cause:** Using `local` backend, or an agent accidentally committed state files on orphan/two-layer backend.

**Fix:**
1. If using local backend: switch to `orphan` or `two-layer`
2. If using orphan/two-layer: Scribe's State Leak Guard should catch this automatically. If it missed:
   ```bash
   git reset HEAD -- .squad/decisions.md .squad/agents/*/history.md .squad/log/ .squad/orchestration-log/
   git checkout HEAD -- .squad/decisions.md .squad/agents/*/history.md
   ```

### "Orphan branch doesn't exist"

**Cause:** The `squad-state` branch hasn't been created yet.

**Fix:** Create it manually:
```bash
git checkout --orphan squad-state
git rm -rf .
mkdir .squad && echo "# Squad State" > .squad/README.md
git add .squad/ && git commit -m "init: squad-state orphan branch"
git checkout main
```

Scribe will auto-create it on the next session if it doesn't exist (via git plumbing: `mktree`, `commit-tree`, `update-ref`).

### "Git notes not found on root commit"

**Cause:** The agent wrote the note to HEAD instead of the root commit.

**Known issue:** Some agents write notes to the current HEAD instead of `$(git rev-list --max-parents=0 HEAD)`. The note still exists on the ref and is readable, but the root-commit anchor pattern isn't being followed precisely.

**Workaround:** The note is still accessible via `git notes --ref=squad/{agent} show {commit-sha}`. The ref itself (`refs/notes/squad/{agent}`) is visible from all branches regardless of which commit the note is on.

### "Config.json doesn't have stateBackend"

**This is fine.** The default is `local` — the current behavior. No config change needed unless you want a different backend.

---

## Multi-User Synchronization

When multiple team members work on the same repo with Squad, the state backend determines how state stays in sync.

### Local backend

Each user has their own `.squad/` files in the working tree. If committed, they merge like any other files — which means **merge conflicts are common** when two people modify decisions or histories simultaneously. This is the main reason teams choose orphan or two-layer backends.

### Orphan backend

The `squad-state` branch is a normal Git branch. Synchronization works like any other branch:

```bash
# Before a squad session — pull latest state
git fetch origin squad-state:squad-state

# After a squad session — push your state changes
git push origin squad-state
```

**Conflict handling:** If two users push to `squad-state` simultaneously, the second push will be rejected (non-fast-forward). Resolution:

```bash
git fetch origin squad-state:squad-state
git checkout squad-state
git merge origin/squad-state   # resolve conflicts, then:
git push origin squad-state
git checkout main
```

In practice, Squad's watch loop handles this automatically — Scribe's commit logic retries on push failure.

> **Tip:** For teams, consider protecting the `squad-state` branch with GitHub branch protection rules that allow force-push from the CI bot but require linear history from humans.

### Two-layer backend

Two-layer uses **both** the orphan branch (same as above) **and** git notes. Notes are per-commit annotations that travel as refs:

```bash
# Fetch notes from the remote
git fetch origin 'refs/notes/*:refs/notes/*'

# Push notes to the remote
git push origin 'refs/notes/*:refs/notes/*'
```

**Why this is team-safe:** Notes are scoped to individual commits — there are no merge conflicts because each commit has its own annotation namespace. The orphan branch stores the aggregated permanent state, and Ralph promotes note data to it after PRs merge.

### Automatic fetch in `squad watch`

When `squad watch` starts, it automatically:
1. Fetches the `squad-state` branch (if orphan or two-layer)
2. Fetches `refs/notes/*` (if two-layer)
3. On each watch cycle, pushes any state changes back

**No manual sync is needed** when using `squad watch`. Manual sync is only needed if you're running one-off squad commands outside of watch mode.

### Git config for automatic notes fetch

To make `git pull` automatically fetch notes, add this to `.git/config` (or use the setup script):

```bash
# One-time setup per clone
git config --add remote.origin.fetch '+refs/notes/*:refs/notes/*'
```

After this, every `git fetch origin` includes notes automatically.

---

## FAQ

### What's the default state backend?

**`local`**. If you don't set `stateBackend` in `.squad/config.json`, Squad stores state as regular files in `.squad/` on your working branch. This is the simplest setup — no extra configuration needed.

### When should I switch away from `local`?

Switch when any of these apply:
- Your PRs are cluttered with `.squad/` file changes
- You lose state when switching branches
- Multiple team members are getting merge conflicts on `.squad/` files
- You want squad state to be invisible in code reviews

### Why would I choose `orphan` over `two-layer`?

**Choose `orphan` when you want simplicity.** It stores all state on a single dedicated branch. Easy to understand, inspect, and debug. One branch, one source of truth.

**Choose `two-layer` when you need commit-scoped context.** Two-layer adds git notes — annotations attached to specific commits. This means:
- A decision made on commit `abc123` stays linked to that commit
- Ralph can decide whether to promote or discard decisions based on whether the PR was merged or rejected
- Research notes on a rejected PR are automatically ignored (not promoted)

**Bottom line:** `orphan` is for teams who just want clean PRs. `two-layer` is for teams who want intelligent state lifecycle management (decisions that survive or die with their PRs).

### Can I use `orphan` and later upgrade to `two-layer`?

Yes. Both use the same `squad-state` orphan branch for permanent state. Switching from `orphan` to `two-layer` simply enables the additional git notes layer. Your existing state is fully preserved.

### What happens if two people run Squad simultaneously?

- **Local backend:** File-level merge conflicts when both push (just like any Git merge conflict).
- **Orphan backend:** The second push to `squad-state` fails with a non-fast-forward error. Squad's watch loop retries automatically. In the worst case, you manually merge the branch.
- **Two-layer backend:** Notes are per-commit, so they never conflict. The orphan branch layer has the same retry behavior as the orphan backend.

### Does the `squad-state` branch show up in my PRs?

No. The `squad-state` branch is an **orphan branch** — it has no common ancestor with your main branch. GitHub doesn't include it in PR diffs. It's completely invisible in code reviews.

### How do I inspect state on the orphan branch?

```bash
# List all state files
git ls-tree --name-only -r squad-state

# Read a specific file
git show squad-state:decisions.md

# View state history
git log --oneline squad-state
```

### Does this work with GitHub Actions / CI?

Yes. If your CI/CD workflow needs to read squad state:
- **Orphan backend:** `git fetch origin squad-state && git show squad-state:<path>`
- **Two-layer:** Same as orphan, plus `git fetch origin 'refs/notes/*:refs/notes/*'` for notes
- **Local backend:** State is on the working branch — just read `.squad/` files directly

### What if I forget to push the `squad-state` branch?

State stays local to your machine. Other team members won't see your latest decisions or agent histories until you push. This is no different from forgetting to push any other branch — Git is distributed, and state only syncs when you push/fetch.

### Can the `squad-state` branch be deleted safely?

**No.** Deleting it loses all permanent squad state (decisions, agent histories, logs). Treat it like your main branch — push it to the remote and don't delete it. You can recover from a local deletion by re-fetching from the remote: `git fetch origin squad-state:squad-state`.
