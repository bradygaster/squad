# External State Storage

**Try this to move state outside the working tree:**
```bash
squad externalize
```

**Try this to move state back:**
```bash
squad internalize
```

**Try this to check current state location:**
```bash
cat .squad/config.json | grep stateLocation
```

Squad can store `.squad/` state outside the working tree in a platform-specific global directory — solving branch-switch data loss and PR pollution.

---

## The Problem

By default, `.squad/` lives in the working tree alongside your code:

```
my-repo/
  .squad/
    decisions/
    skills/
    team.md
    routing.md
```

This creates two problems:

### 1. Branch-Switch Data Loss

When you switch Git branches, `.squad/` is destroyed:

```bash
git checkout feature-branch    # .squad/ exists
git checkout main              # .squad/ GONE (if not on main)
```

Your decisions, skills, earned knowledge — all lost.

### 2. PR Pollution

If you commit `.squad/` to preserve it, every branch includes squad state in PRs:

```diff
+ .squad/decisions/log.md
+ .copilot/skills/ci-setup/SKILL.md
+ .squad/team.md
```

Reviewers see squad metadata mixed with your actual code changes.

---

## The Solution: External State

`squad externalize` moves `.squad/` to a platform-specific global directory **outside the working tree**:

**Platform paths:**

| OS | Path |
|----|------|
| **Windows** | `%APPDATA%\squad\projects\{repo-name}\` |
| **macOS** | `~/Library/Application Support/squad/projects/{repo-name}/` |
| **Linux** | `~/.config/squad/projects/{repo-name}/` |

**Result:**
- Squad state persists across branch switches
- PRs never contain `.squad/` files
- State is keyed per project; use `--key` when projects resolve to the same default key

---

## Usage

### Externalize

Move `.squad/` to external storage:

```bash
squad externalize
```

**What happens:**
1. Resolves platform-specific global path (e.g., `~/Library/Application Support/squad/projects/my-repo/`)
2. Moves `.squad/` contents to global path
3. Creates thin marker file `.squad/config.json` in working tree (existing config fields are preserved):
   ```json
   {
     "version": 1,
     "teamRoot": ".",
     "projectKey": "my-repo",
     "stateLocation": "external"
   }
   ```
4. Adds `.squad/config.json` to `.gitignore` (if not already present) — the marker is machine-specific and must not be committed

**After externalization:**
- Working tree has only `.squad/config.json` (gitignored marker)
- All squad state lives in global directory
- Branch switches don't affect squad data

External state directories are keyed by the project directory name by default. Squad records the owning project in an `.owner.json` file in the global directory. If a different project resolves to a key that is already owned, `squad externalize` refuses before moving state. Choose a unique key to keep both projects' state separate:

```bash
squad externalize --key acme-api
```

A populated directory from an older Squad version can be adopted when this project's `.squad/config.json` already points to that key. An occupied directory without matching project configuration is left untouched and refused rather than overwritten.

---

### Internalize

Move state back to working tree:

```bash
squad internalize
```

**What happens:**
1. Reads marker file to find external state location
2. Copies state from the global directory back to `.squad/` (the external copy is left in place)
3. Removes the external-state fields (`stateLocation`, `teamRoot`, `projectKey`) from `.squad/config.json` — the file is deleted when no other settings remain
4. Leaves `.gitignore` unchanged

**After internalization:**
- `.squad/` lives in working tree again
- Can commit squad state if desired
- Vulnerable to branch-switch data loss again

---

## Configuration

The thin marker file `.squad/config.json` tracks state location:

```json
{
  "version": 1,
  "teamRoot": ".",
  "projectKey": "my-repo",
  "stateLocation": "external"
}
```

| `stateLocation` | Meaning |
|-------|---------|
| absent (or no marker file) | State lives in working tree (`.squad/` in repo) |
| `"external"` | State lives in global directory (platform-specific path) |

**Notes:**
- Marker file is created by `squad externalize`
- Marker file is gitignored — not committed to repo
- `squad internalize` removes the external-state fields from the file (and deletes it when nothing else remains)

---

## Global Directory Structure

```
~/Library/Application Support/squad/projects/
  my-repo/
    decisions/
      log.md
      inbox/
    skills/
      ci-setup/SKILL.md
    team.md
    routing.md
  other-repo/
    decisions/
    skills/
```

Each project key gets its own directory. The default key comes from the project directory name, so projects with the same name should use distinct keys with `squad externalize --key <name>`.

---

## When to Use External State

**Use `squad externalize` when:**
- You switch branches frequently
- You want squad state isolated from code PRs
- You work on feature branches where `.squad/` isn't committed to base branch
- You want squad state to persist across `git clean -fdx`

**Keep internal state when:**
- You want squad state committed to the repo (e.g., decisions, skills travel with code)
- You rarely switch branches
- You want squad state versioned alongside code

---

## Multi-Repo Workflows

External state is **keyed per project**. If you work on multiple repos with different directory names, each gets a separate global directory. If two project directories resolve to the same key, choose a distinct key with `--key`:

```
~/Library/Application Support/squad/projects/
  frontend/
    decisions/
    skills/
    team.md
  backend/
    decisions/
    skills/
    team.md
```

No cross-repo state pollution.

---

## Git Integration

After externalization, only the thin marker file exists in the working tree, and it is gitignored:

```bash
$ git status
On branch feature-branch
nothing to commit, working tree clean
# .squad/config.json exists on disk but is gitignored — not committed
```

This means:
- PRs never show squad state changes
- Branch switches don't affect squad data
- `git clean -fdx` doesn't delete squad state (it lives outside the repo — though it does remove the gitignored marker, which `squad externalize` can recreate)

---

## Migration

### From Internal to External

```bash
# Before: .squad/ in working tree
ls .squad/
# decisions/  skills/  team.md  routing.md

squad externalize

# After: only marker file in working tree
ls .squad/
# config.json

# State moved to global directory
ls ~/Library/Application\ Support/squad/projects/my-repo/
# decisions/  skills/  team.md  routing.md
```

### From External to Internal

```bash
squad internalize

# State moved back to working tree
ls .squad/
# decisions/  skills/  team.md  routing.md  config.json
```

---

## Notes

- External state is **opt-in** — default is internal (working tree)
- External state is **platform-aware** — uses OS-specific global directories
- External state is **isolated per repo** — no cross-repo pollution
- Marker file is **gitignored** — never committed
- `squad upgrade` respects current state location (doesn't force internal/external)

---

## Sample Prompts

```
squad externalize
```

Moves squad state to global directory.

```
squad internalize
```

Moves squad state back to working tree.

```
Where is my squad state stored?
```

Reports current state location (internal vs external).

```
Show me the external state path
```

Prints the platform-specific global directory path.
