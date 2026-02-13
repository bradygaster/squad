# Keeping Your Squad Where You Want It

Your `.ai-team/` directory contains everything—team rosters, skills, decisions, agent histories. The question isn't whether to track it, but *how* and *where* to track it. Here are the real options, with honest tradeoffs.

---

## 1. Committed to Main (The Default)

**What it is:** `.ai-team/` is tracked in git, committed alongside your code. Anyone who clones the repo gets the full team with all accumulated knowledge.

```bash
git add .ai-team/
git commit -m "Add Squad team"
```

### Pros

- **Simplest setup.** No configuration, no branching strategy.
- **Portable.** Clone the repo anywhere, and the team knowledge travels with it.
- **Shared context.** Every collaborator sees the same team definitions, skills, and decisions.
- **Git history.** You can trace how decisions evolved, view old skills, recover deleted files.
- **GitHub Actions work out of the box.** Workflows (heartbeat, triage, label sync) access `.ai-team/` immediately.

### Cons

- **PR noise.** Every team change—new skill, updated decision, agent history—shows up in PR diffs. Some people find this distracting.
- **`decisions.md` grows.** Over time, your decisions file accumulates hundreds of entries. Git history is there, but the current file gets long.
- **Some orgs don't allow it.** Enterprise policies sometimes forbid AI artifacts in source repositories. Check before you commit.

### When to Use This

- Solo dev or small team, private repo.
- Open source project—your contributors should see how the team works.
- You want maximum portability and zero configuration.

---

## 2. Gitignored (Local-Only)

**What it is:** Add `.ai-team/` to `.gitignore`. Team state lives locally on each dev machine, never committed.

```bash
echo ".ai-team/" >> .gitignore
git add .gitignore
git commit -m "Gitignore squad team state"
```

### Pros

- **Zero repo noise.** No PR diffs, no git history clutter.
- **No policy concerns.** Enterprise orgs with AI artifact policies sleep easy.
- **Clean main branch.** Code and team are completely separated.

### Cons

- **Team knowledge is not portable.** If you delete `.ai-team/`, it's gone. No git history to recover it.
- **Collaborators don't share state.** Your teammate clones the repo and gets a fresh, empty `.ai-team/`. Their team doesn't match yours.
- **No git history for recovery.** You can't `git log` to find an old decision or see when a skill was added.
- **⚠️ GitHub Actions workflows can't access `.ai-team/`.** Actions only see committed files. Triage routing rules in `team.md` won't work in CI/CD. (Label sync and other API-based workflows still function, but the team-based routing logic is silent.)

### When to Use This

- Team doesn't need shared state (unlikely for Squad).
- Enterprise policy strictly forbids AI artifacts in repos.
- You're experimenting and don't want to commit yet.

---

## 3. Separate Branch (e.g., `squad-state`)

**What it is:** Keep `.ai-team/` on a dedicated branch (`squad-state`, `team-config`, etc.), not on `main`. Use `git worktree` to mount it locally.

### Setup

```bash
# Create and push the squad-state branch (if it doesn't exist)
git checkout --orphan squad-state
git rm -rf .
echo "# Squad State Branch\nThis branch tracks .ai-team/ configuration." > README.md
git add README.md
git commit -m "Initial squad-state branch"
git push origin squad-state

# Back on main
git checkout main

# Mount squad-state in a worktree
git worktree add .ai-team-worktree squad-state
ln -s .ai-team-worktree/.ai-team .ai-team
git add .gitignore
echo ".ai-team-worktree/" >> .gitignore
git commit -m "Add squad worktree"
```

On Windows:

```bash
# Use mklink instead of ln -s (requires admin or Developer Mode)
git worktree add .ai-team-worktree squad-state
mklink /D .ai-team .ai-team-worktree\.ai-team
```

### Pros

- **Clean main branch.** `.ai-team/` never appears in `main` or in PR diffs.
- **Full git history.** The `squad-state` branch has complete history of all team changes.
- **Shareable with collaborators.** They can check out `squad-state` and pull your team setup.
- **GitHub Actions can access it.** Workflows can check out both `main` and `squad-state` if needed.

### Cons

- **Complex setup.** Requires knowledge of `git worktree` and branch management.
- **Merge conflicts.** If multiple people work on `squad-state` simultaneously, conflicts happen.
- **Worktree management overhead.** You need to remember to update the worktree, and it can get stale.
- **Collaborators must set up the worktree.** They can't just clone; they need to run the setup commands.

### When to Use This

- Team that values clean main branch but wants shared team state.
- You want full git history of team evolution but don't want PR noise.
- You're already comfortable with `git worktree` or branching strategies.

---

## 4. Git Submodule

**What it is:** `.ai-team/` as a separate Git repository, added as a submodule to your main repo.

### Setup

```bash
# Create a separate repository for your squad (e.g., on GitHub)
# Then add it as a submodule
git submodule add https://github.com/you/my-squad-state .ai-team
git commit -m "Add squad state as submodule"
git push
```

Collaborators clone with:

```bash
git clone --recurse-submodules https://github.com/you/my-project
```

Or after cloning normally:

```bash
git submodule init
git submodule update
```

### Pros

- **Completely separate history.** The submodule repo has its own git log, independent of your main project.
- **Shareable across repos.** Use the same submodule in multiple projects.
- **Clean main branch.** `.ai-team/` is external; no PR diffs in your project.
- **Full git features.** Submodule repo has branches, tags, and full history.

### Cons

- **Submodules are complex.** Widely disliked by the git community. Conflicts, merge issues, and confusion are common.
- **Everyone must remember `--recurse-submodules`.** Collaborators who forget get an empty `.ai-team/` directory.
- **CI/CD needs extra setup.** Your workflows must initialize submodules explicitly:
  ```bash
  git submodule init && git submodule update
  ```
- **Updating the submodule can cause conflicts.** If two people push to the submodule simultaneously, merging back is painful.

### When to Use This

- You're already using submodules elsewhere in your org (they're familiar with the pain).
- You want to share the same squad configuration across 3+ repositories.
- Your team is comfortable with advanced git workflows.

**Honest take:** Submodules work, but the git community almost universally dislikes them. They're powerful tools for specific use cases, but most teams regret using them. Only reach for submodules if you truly need them.

---

## 5. Symlink to External Directory

**What it is:** Keep `.ai-team/` somewhere else on your filesystem (e.g., `~/my-squads/my-project-squad/`), then symlink it into your repo.

### Setup

On macOS/Linux:

```bash
mkdir -p ~/my-squads/my-project-squad
ln -s ~/my-squads/my-project-squad .ai-team
```

On Windows (requires admin or Developer Mode):

```bash
mkdir C:\Users\you\my-squads\my-project-squad
mklink /D .ai-team C:\Users\you\my-squads\my-project-squad
```

Add `.ai-team` to `.gitignore`:

```bash
echo ".ai-team" >> .gitignore
```

### Pros

- **Share state across repos.** Point multiple projects to the same squad directory.
- **No git noise.** The symlink itself isn't tracked; `.ai-team/` is ignored.
- **Maximum flexibility.** You can move the squad, reorganize it, or swap it out.

### Cons

- **Not portable.** Symlinks are machine-specific. Collaborators need the exact same filesystem layout or the symlink breaks.
- **Windows compatibility is fragile.** Symlinks on Windows require admin privileges or Developer Mode; many orgs disable this.
- **Easy to break.** If the external directory is deleted, the symlink points to nothing.
- **No git history.** Team state changes aren't tracked in your project repo; you're on your own for backups.

### When to Use This

- You maintain multiple repositories with the same squad.
- Everyone on your team has the same filesystem layout (rare in practice).
- You're on macOS/Linux and control your development environment.

**Caveat:** This breaks for most teams sharing code. Collaborators' symlinks will be broken, external contractors can't participate, and CI/CD usually fails.

---

## 6. Dev Branch Only (The Squad Project's Own Approach)

**What it is:** `.ai-team/` is committed, but *only* on dev/feature branches. On `main`, it's gitignored. When you create a feature branch, you remove `.ai-team/` from `.gitignore` so the team travels with your work.

### Setup

On `main`:

```bash
echo ".ai-team/" >> .gitignore
git add .gitignore
git commit -m "Ignore squad team on main"
```

When you start a feature branch:

```bash
git checkout -b feature/my-feature
git rm .ai-team/  # if it exists from a previous branch
# Remove .ai-team/ from .gitignore
git edit .gitignore
# (remove the .ai-team/ line)
git add .gitignore
git commit -m "Track squad team on this branch"
```

Agents work with the full `.ai-team/` context while you develop. When you merge back to `main`, the PR shows the `.ai-team/` changes, but `main` stays clean.

### Pros

- **Clean main branch.** `main` is pure code, no squad artifacts.
- **Full context on feature branches.** Agents have the team history while you work.
- **Git history preserved.** Team changes are committed on feature branches and visible in git log.
- **Collaborators get team state.** Anyone checking out your feature branch gets `.ai-team/`.
- **GitHub Actions can work both ways.** On `main`, workflows use GitHub API (label sync, heartbeat). On feature branches, they can use team-based routing if needed.

### Cons

- **Merge conflicts when syncing branches.** If `main` has `.ai-team/` gitignored but your branch commits it, merging is messy.
- **Easy to forget the pattern.** Developers forget to remove `.ai-team/` from `.gitignore` when creating feature branches (or forget to add it back when switching back to `main`).
- **PR diffs include team changes.** PRs from feature branches show all `.ai-team/` modifications, which some teams find noisy.

### When to Use This

- Small team that's aware of the pattern.
- You want clean main but team context on feature branches.
- You're OK with remembering to toggle `.gitignore` per branch.

---

## Decision Matrix

| Scenario | Option | Why |
|----------|--------|-----|
| Solo dev, private repo | **1. Committed** | Simplest, portable, full history |
| Team, shared state, no PR concerns | **1. Committed** | Everyone gets same team |
| Team, clean main, no Actions workflows | **2. Gitignored** | No policy issues, no PR noise |
| Team, clean main, need Actions workflows | **3. Separate Branch** | Full history, shared state, Actions can access it |
| Multiple repos, same squad | **4. Submodule** or **5. Symlink** | Submodule if you need git; symlink if portable |
| Enterprise, AI artifact policy | **2. Gitignored** or **4. Submodule** | Keep AI stuff out of main repo |
| Open source | **1. Committed** | Contributors should see how the team works |

---

## Tips

- **GitHub Actions and Gitignored `.ai-team/`:** If you choose option 2 (gitignore), remember that Actions workflows see committed files only. Label sync and heartbeat workflows (which use GitHub API) still work. But `squad.agent.md` triage rules won't see `.ai-team/decisions.md` during automated runs. Workaround: Copy critical decisions to a committed file or pass them as workflow env vars.
- **Merge conflicts on `decisions.md`:** If multiple people are committing to `.ai-team/` at the same time, `decisions.md` and agent histories conflict frequently. Use the `.gitattributes merge=union` rules that Squad sets up. Check the file after merge to ensure it looks reasonable.
- **Backup your team.** If you're gitignoring `.ai-team/`, make sure you have backups. A deleted `.ai-team/` directory with no git history is gone forever.
- **Communicate the pattern to your team.** Whatever you choose, document it. Add a line to your `CONTRIBUTING.md` or `README.md` explaining where the squad lives and how to interact with it.
- **Start simple, migrate later.** Commit `.ai-team/` initially (option 1). If PR noise becomes a real problem, migrate to option 2 or 3. Changing strategies later is possible but requires care.

---

## Sample Prompts

Use these prompts with Squad to implement specific strategies:

- **"Keep .ai-team/ out of my main branch."**
  - Directs you toward option 3 (separate branch) or option 6 (dev-only).

- **"I want to share my squad across three repos without duplicating the team state."**
  - Points to option 4 (submodule) or option 5 (symlink).

- **"Add .ai-team to .gitignore but make sure GitHub Actions can still route based on team.md."**
  - Hybrid: gitignore but keep a committed `squad-routing.md` that Actions reads.

- **"My enterprise doesn't allow AI artifacts in the main repository."**
  - Option 2 (gitignore) or option 4 (submodule in a separate org-controlled repo).

- **"I deleted .ai-team by accident. How do I recover it?"**
  - If committed: `git checkout HEAD~5 .ai-team/` (restore from history).
  - If gitignored: No recovery from git. Restore from backup or rebuild the team.

---

## See Also

- **[Adding Squad to an Existing Repo](existing-repo.md)** — How to integrate Squad into a project with existing code.
- **[Squad for Solo Developers](solo-dev.md)** — Building alone? Here's how Squad becomes your team.
- **[Multiple Squads](multiple-squads.md)** — Managing more than one AI team.
- **[Team Portability](team-portability.md)** — Moving your squad to a new repo or machine.
