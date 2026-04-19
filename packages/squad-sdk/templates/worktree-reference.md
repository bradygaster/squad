# Worktree Reference — Lifecycle and Pre-Spawn Setup

## Worktree Lifecycle Management

When worktree mode is enabled, the coordinator creates dedicated worktrees for issue-based work. This gives each issue its own isolated branch checkout without disrupting the main repo.

**Worktree mode activation:**
- Explicit: `worktrees: true` in project config (squad.config.ts or package.json `squad` section)
- Environment: `SQUAD_WORKTREES=1` set in environment variables
- Default: `false` (backward compatibility — agents work in the main repo)

**Creating worktrees:**
- One worktree per issue number
- Multiple agents on the same issue share a worktree
- Path convention: `{repo-parent}/{repo-name}-{issue-number}`
  - Example: Working on issue #42 in `C:\src\squad` → worktree at `C:\src\squad-42`
- Branch: `squad/{issue-number}-{kebab-case-slug}` (created from the repo's default branch — e.g., `dev` or `main`)

**Dependency management:**
- After creating a worktree, link `node_modules` from the main repo to avoid reinstalling
- Windows: `cmd /c "mklink /J {worktree}\node_modules {main-repo}\node_modules"`
- Unix: `ln -s {main-repo}/node_modules {worktree}/node_modules`
- If linking fails (permissions, cross-device), fall back to `npm install` in the worktree

**Reusing worktrees:**
- Before creating a new worktree, check if one exists for the same issue
- `git worktree list` shows all active worktrees
- If found, reuse it (cd to the path, verify branch is correct, `git pull` to sync)
- Multiple agents can work in the same worktree concurrently if they modify different files

**Cleanup:**
- After a PR is merged, the worktree should be removed
- `git worktree remove {path}` + `git branch -d {branch}`
- Ralph heartbeat can trigger cleanup checks for merged branches

## Pre-Spawn: Worktree Setup

When spawning an agent for issue-based work (user request references an issue number, or agent is working on a GitHub issue):

**1. Check worktree mode:**
- Is `SQUAD_WORKTREES=1` set in the environment?
- Or does the project config have `worktrees: true`?
- If neither: skip worktree setup → agent works in the main repo (existing behavior)

**2. If worktrees enabled:**

a. **Determine the worktree path:**
   - Parse issue number from context (e.g., `#42`, `issue 42`, GitHub issue assignment)
   - Calculate path: `{repo-parent}/{repo-name}-{issue-number}`
   - Example: Main repo at `C:\src\squad`, issue #42 → `C:\src\squad-42`

b. **Check if worktree already exists:**
   - Run `git worktree list` to see all active worktrees
   - If the worktree path already exists → **reuse it**:
     - Verify the branch is correct (should be `squad/{issue-number}-*`)
     - `cd` to the worktree path
     - `git pull` to sync latest changes
     - Skip to step (e)

c. **Create the worktree:**
   - Determine branch name: `squad/{issue-number}-{kebab-case-slug}` (derive slug from issue title if available)
   - Determine base branch: run `git symbolic-ref refs/remotes/origin/HEAD | sed 's|refs/remotes/origin/||'` to detect the repo's default branch (e.g., `dev`, `main`)
   - Run: `git worktree add {path} -b {branch} {baseBranch}`
   - Example: `git worktree add C:\src\squad-42 -b squad/42-fix-login dev`

d. **Set up dependencies:**
   - Link `node_modules` from main repo to avoid reinstalling:
     - Windows: `cmd /c "mklink /J {worktree}\node_modules {main-repo}\node_modules"`
     - Unix: `ln -s {main-repo}/node_modules {worktree}/node_modules`
   - If linking fails (error), fall back: `cd {worktree} && npm install`
   - Verify the worktree is ready: check build tools are accessible

e. **Include worktree context in spawn:**
   - Set `WORKTREE_PATH` to the resolved worktree path
   - Set `WORKTREE_MODE` to `true`
   - Add worktree instructions to the spawn prompt (see spawn-reference.md)

**3. If worktrees disabled:**
- Set `WORKTREE_PATH` to `"n/a"`
- Set `WORKTREE_MODE` to `false`
- Use existing `git checkout -b` flow (no changes to current behavior)
