# State Backends

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to use git-notes for state storage:**
```bash
squad watch --state-backend git-notes
```

**Try this to use an orphan branch:**
```bash
squad watch --state-backend orphan
```

**Try this to set a persistent default (add to existing config):**
```bash
# If .squad/config.json exists, add stateBackend to it:
node -e "const fs=require('fs'),p='.squad/config.json';const c=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{version:1,teamRoot:'.'};c.stateBackend='git-notes';fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n')"
```

Squad supports multiple **state backends** for storing `.squad/` state. Each backend determines _where_ and _how_ decisions, skills, agent memories, and session logs are persisted — without changing how agents interact with the data.

---

## The Problem

The default **local** backend stores `.squad/` state as regular files in the working tree. This works well for most workflows, but has trade-offs:

- **Branch pollution:** `.squad/` files appear in diffs and PRs
- **Branch-switch loss:** State can be lost when switching branches (if not committed)
- **Merge conflicts:** Multiple branches modifying `.squad/` files can conflict

State backends solve this by moving `.squad/` data into Git-native structures that live outside the working tree.

---

## Available Backends

### Local (default)

State lives as regular files in `.squad/` inside the working tree. This is the standard behavior — what you get out of the box.

```bash
squad watch --state-backend local
```

**Pros:**
- Simple and familiar — files on disk
- Easy to inspect, edit, and commit
- Works with all Git tools and IDEs

**Cons:**
- Files appear in `git status` and diffs
- Branch switches can lose uncommitted state

**Best for:** Most projects, especially when you want squad state committed alongside code.

---

### Git Notes

State is stored in [Git notes](https://git-scm.com/docs/git-notes) under `refs/notes/squad`. The note is attached to the repository's **root commit** (the first commit with no parents), which is the same on every branch. This means state persists across branch switches.

```bash
squad watch --state-backend git-notes
```

**How it works:**
- All state is serialized as a single JSON blob attached as a note on the repo's root commit
- The root commit is determined via `git rev-list --max-parents=0 HEAD` — it never changes regardless of which branch is checked out
- Reading loads the JSON, writing updates and reattaches it
- Notes travel with `git push` / `git fetch` when configured (see [Sharing](#sharing-git-notes-state))

**Pros:**
- Working tree stays completely clean — no `.squad/` files
- State persists across branch switches (anchored to root commit, not HEAD)
- No merge conflicts from `.squad/` files in PRs

**Cons:**
- Single JSON blob — not suited for high-concurrency writes
- Requires `git notes` familiarity for debugging
- Not human-readable without `git notes show`

**Best for:** Simpler setups where you want zero `.squad/` files in the working tree or PRs. For teams needing full isolation between branches, use the [orphan backend](#orphan-branch) instead.

> **Two-layer architecture:** The `GitNotesBackend` provides full state storage anchored to the repo root. For commit-scoped annotations (e.g., "why did we make this specific change?"), use `git notes` directly via the git CLI — that's the thin annotation layer, distinct from the primary state store.

#### Sharing Git Notes State

By default, Git doesn't push notes. To share git-notes state across clones:

```bash
# Push notes
git push origin refs/notes/squad

# Fetch notes
git fetch origin refs/notes/squad:refs/notes/squad
```

Or configure automatic fetch in `.git/config`:

```ini
[remote "origin"]
    fetch = +refs/notes/squad:refs/notes/squad
```

---

### Orphan Branch

State lives on a dedicated orphan branch (`squad-state` by default). The branch has no common history with your main branches — it's a completely separate tree used only for squad data.

```bash
squad watch --state-backend orphan
```

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
- Slightly more complex than worktree for debugging
- Concurrent writes to the branch can conflict (single-writer recommended)

**Best for:** Teams who want Git-versioned state without polluting the main branch history.

---

## Configuration

### CLI Flag (per-invocation)

Pass `--state-backend` to any squad command that supports it:

```bash
squad watch --state-backend git-notes
squad watch --state-backend orphan
squad watch --state-backend worktree
```

> **Note:** As of v0.9.x, the `--state-backend` CLI flag is wired into the `watch` command.
> The SDK's `resolveSquadState()` function makes the configured backend available to all
> squad operations. Individual commands are being migrated incrementally — see issue #1003.

### Config File (persistent)

Set a default in `.squad/config.json`. If the file already exists, add the `stateBackend` field
to it rather than overwriting:

```json
{
  "version": 1,
  "teamRoot": ".",
  "stateBackend": "git-notes"
}
```

> **Note:** The `stateBackend` field is read by `resolveStateBackend()` alongside any existing
> config fields (`version`, `teamRoot`, `stateLocation`, etc.). Only add the field you need —
> don't overwrite the whole file.

This persists across invocations. The CLI flag overrides the config file when both are present.

### Priority Order

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | CLI flag | `--state-backend orphan` |
| 2 | `.squad/config.json` | `"stateBackend": "orphan"` |
| 3 (default) | Built-in default | `worktree` |

### Fallback Behavior

If a non-default backend fails to initialize (e.g., Git is not available, permissions issue), Squad automatically falls back to the **worktree** backend with a warning:

```
Warning: State backend 'git-notes' failed: <reason>. Falling back to 'worktree'.
```

---

## Comparison

| Feature | Worktree | Git Notes | Orphan Branch |
|---------|----------|-----------|---------------|
| Working tree clean | ❌ | ✅ | ✅ |
| Appears in PRs | Yes (if committed) | No | No |
| Human-readable on disk | ✅ Files | ❌ JSON blob | ⚠️ Via `git show` |
| Git history | Via normal commits | Per-note | Per-branch commits |
| Branch-switch safe | ❌ (if uncommitted) | ✅ | ✅ |
| Easy to inspect | ✅ `cat .squad/...` | ⚠️ `git notes show` | ⚠️ `git show squad-state:...` |
| Sharing across clones | Normal push/pull | Requires notes fetch config | Normal branch push/pull |
| Concurrent-write safe | ✅ (filesystem) | ⚠️ (last writer wins) | ⚠️ (single writer) |

---

## Inspecting State

### Worktree

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
const ctx = resolveSquadState(process.cwd(), 'git-notes');
if (ctx) {
  ctx.backend.write('decisions.md', '# Decisions\n...');
  ctx.backend.append('log.md', 'New entry\n');
  ctx.backend.delete('inbox/processed.md');
}

// Option 2: Backend-only resolution
const backend: StateBackend = resolveStateBackend(
  '.squad',           // squadDir
  process.cwd(),      // repoRoot
  'git-notes'         // optional CLI override
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

The orphan and git-notes backends use raw `execFileSync` for content reads (without trimming) to
ensure faithful round-trips. Git plumbing helpers that trim output are only used for non-content
operations like `rev-parse` and `ls-tree`.

---

## Worktree Awareness

When running in a git worktree, `resolveSquadState()` uses `git rev-parse --show-toplevel` to
determine the actual current worktree root — not the parent of `.squad/`. This ensures that
git-native backends (git-notes, orphan) operate in the correct repository context, even when
`.squad/` is resolved from the main checkout via the worktree fallback strategy.

---

## Notes

- State backends are **opt-in** — the default is `worktree` (no behavior change)
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

When you enable `stateBackend: "git-notes"` or `stateBackend: "orphan"`, copy the notes protocol and helper scripts into your project:

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

When `stateBackend` is set to `git-notes` or `orphan`, the following templates are available:

| Template | Purpose |
|----------|---------|
| `notes-protocol.md` | The full agent contract for git notes |
| `scripts/notes/fetch.ps1` | Fetch + setup refspec + merge after conflict |
| `scripts/notes/write-note.ps1` | Agent helper — handles JSON, conflicts, push |

### Automatic Coordinator Integration

**You don't need to manually add copilot-instructions.md snippets.** When `stateBackend` is set in `.squad/config.json`, the Squad coordinator (`squad.agent.md`) automatically adapts its agent spawn prompts:

| Backend | Agent reads | Agent writes | Scribe commits to |
|---------|-------------|--------------|-------------------|
| `worktree` | `.squad/` files on disk | `.squad/` files on disk | Working branch |
| `git-notes` | Git notes via helper scripts | Git notes via `write-note.ps1` | Pushes note refs + working branch (decisions.md only) |
| `orphan` | `.squad/` files on disk (synced) | `.squad/` files on disk | `squad-state` orphan branch (NOT working branch) |

**Config vs State distinction:**
- **Static config** (charters, team.md, routing.md, casting/) — always on disk, all backends
- **Mutable state** (history.md, decisions/inbox/, logs, orchestration-log/) — backend-dependent

The coordinator passes `STATE_BACKEND` into every agent spawn prompt. Agents receive backend-specific instructions for reading and writing state. Scribe receives backend-specific commit instructions. This is fully automatic — no user configuration beyond setting `stateBackend` in config.json is needed.

---

## Quick Start — "I Want Clean PRs"

**3 steps to get `.squad/` state out of your PRs:**

### Option A: Git-Notes (recommended for most teams)

```bash
# 1. Set the backend
squad config set stateBackend git-notes
# Or manually: edit .squad/config.json → add "stateBackend": "git-notes"

# 2. Commit the config change
git add .squad/config.json && git commit -m "config: use git-notes for state"

# 3. Start a session — it just works
copilot
# The coordinator detects git-notes and adapts automatically.
# Decisions are written as git notes, not files. PRs stay clean.
```

### Option B: Orphan Branch (full isolation)

```bash
# 1. Set the backend
squad config set stateBackend orphan

# 2. Create the orphan branch (one-time)
git checkout --orphan squad-state
git rm -rf .
mkdir .squad && echo "# Squad State" > .squad/README.md
git add .squad/ && git commit -m "init: squad-state orphan branch"
git checkout main

# 3. Commit the config change
git add .squad/config.json && git commit -m "config: use orphan backend"

# 4. Start a session — Scribe handles the rest
copilot
# Agents write to disk during the session.
# Scribe commits state to squad-state branch, not your working branch.
```

---

## Migrating an Existing Squad

### From worktree (default) to git-notes

This is the simplest migration — just a config change:

```bash
# 1. Set the backend
echo '{"version":1,"stateBackend":"git-notes"}' > .squad/config.json
# Or add "stateBackend": "git-notes" to your existing config.json

# 2. Commit
git add .squad/config.json && git commit -m "config: migrate to git-notes backend"
```

**What happens:** Existing `.squad/` files remain on disk as a read-only reference. New decisions and state writes go to git notes refs. Scribe merges notes into `decisions.md` as before. Over time, the on-disk state files become stale (they're the snapshot from before migration), while the notes contain the latest state.

### From worktree (default) to orphan

```bash
# 1. Create orphan branch with existing state
git checkout --orphan squad-state
git rm -rf .
# Restore state files from main
git checkout main -- .squad/decisions.md .squad/agents/*/history.md
git add .squad/ && git commit -m "init: migrate state to orphan branch"
git checkout main

# 2. Set the backend
# Add "stateBackend": "orphan" to .squad/config.json
git add .squad/config.json && git commit -m "config: migrate to orphan backend"
```

**What happens:** State files now live on the `squad-state` branch. Scribe commits state changes there, not to your working branch. PRs from feature branches are clean.

### From git-notes to orphan (or vice versa)

Change `stateBackend` in config.json. The coordinator adapts on the next session. Notes data persists in git refs even if the active backend changes.

---

## Troubleshooting

### "My state disappeared after switching branches"

**Cause:** You're using the default `worktree` backend. State files are branch-local.

**Fix:** Switch to `git-notes` or `orphan` backend. Both persist state across branches:
- Git-notes: state travels as git refs (visible from any branch)
- Orphan: state lives on a dedicated branch (accessible via `git show squad-state:`)

### "State files are showing up in my PR"

**Cause:** Using `worktree` backend, or an agent accidentally committed state files on orphan/git-notes backend.

**Fix:**
1. If using worktree backend: switch to `git-notes` or `orphan`
2. If using orphan/notes: Scribe's State Leak Guard should catch this automatically. If it missed:
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

Scribe will auto-create it on the next session if it doesn't exist (via the worktree approach in the Scribe charter).

### "Git notes not found on root commit"

**Cause:** The agent wrote the note to HEAD instead of the root commit.

**Known issue:** Some agents write notes to the current HEAD instead of `$(git rev-list --max-parents=0 HEAD)`. The note still exists on the ref and is readable, but the root-commit anchor pattern isn't being followed precisely.

**Workaround:** The note is still accessible via `git notes --ref=squad/{agent} show {commit-sha}`. The ref itself (`refs/notes/squad/{agent}`) is visible from all branches regardless of which commit the note is on.

### "Config.json doesn't have stateBackend"

**This is fine.** The default is `worktree` — the current behavior. No config change needed unless you want a different backend.
