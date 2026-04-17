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

**Try this to set a persistent default:**
```bash
echo '{ "stateBackend": "git-notes" }' > .squad/config.json
```

Squad supports multiple **state backends** for storing `.squad/` state. Each backend determines _where_ and _how_ decisions, skills, agent memories, and session logs are persisted — without changing how agents interact with the data.

---

## The Problem

The default **worktree** backend stores `.squad/` state as regular files in the working tree. This works well for most workflows, but has trade-offs:

- **Branch pollution:** `.squad/` files appear in diffs and PRs
- **Branch-switch loss:** State can be lost when switching branches (if not committed)
- **Merge conflicts:** Multiple branches modifying `.squad/` files can conflict

State backends solve this by moving `.squad/` data into Git-native structures that live outside the working tree.

---

## Available Backends

### Worktree (default)

State lives as regular files in `.squad/` inside the working tree. This is the standard behavior — what you get out of the box.

```bash
squad watch --state-backend worktree
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

State is stored in [Git notes](https://git-scm.com/docs/git-notes) under `refs/notes/squad`. Notes are attached to `HEAD`, keeping data associated with commits but invisible in the working tree.

```bash
squad watch --state-backend git-notes
```

**How it works:**
- All state is serialized as a single JSON blob attached as a note on `HEAD`
- Reading loads the JSON, writing updates and reattaches it
- Notes travel with `git push` / `git fetch` when configured (see [Sharing](#sharing-git-notes-state))

**Pros:**
- Working tree stays completely clean — no `.squad/` files
- State is associated with specific commits
- No merge conflicts from `.squad/` files in PRs

**Cons:**
- State is per-commit — switching to a different commit loses the note context
- Requires `git notes` familiarity for debugging
- Not human-readable without `git notes show`

**Best for:** Repos where you want zero `.squad/` files in the working tree or PRs.

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

Pass `--state-backend` to any squad command:

```bash
squad watch --state-backend git-notes
squad watch --state-backend orphan
squad watch --state-backend worktree
```

### Config File (persistent)

Set a default in `.squad/config.json`:

```json
{
  "stateBackend": "git-notes"
}
```

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
# Show all state as JSON
git notes --ref=squad show HEAD

# Pretty-print
git notes --ref=squad show HEAD | python -m json.tool
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
  resolveStateBackend,
  type StateBackend,
} from '@bradygaster/squad-sdk';

// Resolve backend from config + CLI override
const backend: StateBackend = resolveStateBackend(
  '.squad',           // squadDir
  process.cwd(),      // repoRoot
  'git-notes'         // optional CLI override
);

// Use the backend
backend.write('decisions.md', '# Decisions\n...');
const content = backend.read('decisions.md');
const exists = backend.exists('skills/my-skill/SKILL.md');
const entries = backend.list('skills');
```

All backends implement the same `StateBackend` interface:

```typescript
interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
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

## Notes

- State backends are **opt-in** — the default is `worktree` (no behavior change)
- All backends implement the same interface — agents don't know or care which backend is active
- The `external` backend type exists as a stub for future external storage (see [External State](./external-state))
- State backends are available in the **insider** release channel (`@bradygaster/squad-cli@insider`)
- 30+ tests cover all backends including security hardening scenarios
