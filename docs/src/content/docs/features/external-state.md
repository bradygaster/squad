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
`squad externalize` moves `.squad/` to a platform-specific Squad data root **outside the working tree**:
**Platform paths:**
Squad stores externalized state under your platform's standard application-data location, in a repo-specific `projects/{repo-name}/` folder.
**Result:**
- Squad state persists across branch switches
- PRs never contain `.squad/` files
- State is isolated per repository (based on repo name)
---
## Usage
### Externalize
Move `.squad/` to external storage:
```bash
squad externalize
```
**What happens:**
1. Resolves the platform-specific Squad data root for this repository
2. Moves everything under `.squad/` **except** local-only bootstrap files (`config.json`, `manifest.json`, `workstreams.json`, `upstream.json`, `squad-registry.json`, and `_upstream_repos/`)
3. Writes or updates `.squad/config.json` in the working tree with the external-state marker and project key:
   ```json
   {
     "version": 1,
     "teamRoot": ".",
     "projectKey": "my-repo",
     "stateLocation": "external"
   }
   ```
4. Ensures `.squad/config.json` is listed in `.gitignore`
**After externalization:**
- Mutable squad state lives in the external Squad data root
- `.squad/config.json` stays in the repo as the machine-local marker file
- Other local-only resolver files under `.squad/` can also remain in the working tree
- Branch switches no longer affect the externalized state
---
### Internalize
Move state back to working tree:
```bash
squad internalize
```
**What happens:**
1. Reads `.squad/config.json` to find the external project key
2. Copies the externalized entries back into `.squad/`
3. Removes the external-state fields from `.squad/config.json`
4. Deletes `.squad/config.json` only if no other meaningful config remains
**After internalization:**
- Mutable state lives in the working tree again
- Any unrelated `.squad/config.json` settings are preserved
- The command does **not** edit `.gitignore`; the `config.json` ignore entry is left in place
---
## Configuration
The marker file `.squad/config.json` is the source of truth for externalized state:
```json
{
  "version": 1,
  "teamRoot": ".",
  "projectKey": "my-repo",
  "stateLocation": "external"
}
```
| Field | Meaning |
|-------|---------|
| `"projectKey"` | Stable key used to choose the external directory |
| `"stateLocation": "external"` | This repo should resolve mutable state from the platform-specific external directory |
| `"teamRoot": "."` | Resolver hint preserved in config |
**Notes:**
- `squad externalize` writes these fields while preserving unrelated config keys
- `.squad/config.json` is gitignored because it is machine-local
- `squad internalize` removes the external-state fields, then deletes the file only if nothing meaningful remains
---
## Global Directory Structure
```
<squad-data-root>/
  projects/
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
      team.md
```
Each repo gets its own isolated directory based on repository name. State is never shared across repos.
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
External state is **isolated per repository** — each repo gets its own global directory. If you work on multiple repos, each maintains separate squad state:
```
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
Externalization only adds **`.squad/config.json`** to `.gitignore`.
It does **not** add the whole `.squad/` directory, and it does not remove that entry during `squad internalize`.
That means:
- The machine-local marker file stays out of commits
- Other local `.squad/` files such as `manifest.json` or `workstreams.json` still follow normal Git rules
- Externalized mutable state stays out of PRs because it no longer lives in the working tree
- `git clean -fdx` does not delete the external directory
---
## Migration
### From Internal to External
```bash
# Before: .squad/ in working tree
ls .squad/
# decisions/  skills/  team.md  routing.md
squad externalize
# After: config.json remains, and some local-only bootstrap files may remain too
ls .squad/
# config.json  manifest.json  workstreams.json  ...
# State moved to global directory
ls ~/Library/Application\ Support/squad/projects/my-repo/
# decisions/  skills/  team.md  routing.md
```
### From External to Internal
```bash
squad internalize
# State moved back to working tree
ls .squad/
# decisions/  skills/  team.md  routing.md  ...
# config.json only remains if it still has other settings
```
---
## Notes
- External state is **opt-in** — default is internal (working tree)
- External state is **platform-aware** — uses OS-specific global directories
- External state is **isolated per repo** — no cross-repo pollution
- `.squad/config.json` is **gitignored** — never committed
- Local resolver/bootstrap files are intentionally left in the working tree
- `squad internalize` does not clean up the `.gitignore` entry for `config.json`
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
