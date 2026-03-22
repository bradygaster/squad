# Issue → PR → Merge Lifecycle

This template describes the full lifecycle for issue-driven work, including worktree-aware parallel execution.

---

## Decision Logic

| Scenario | Strategy | Branch creation |
|----------|----------|-----------------|
| Single agent / single issue | Standard | `git checkout -b squad/{issue}-{slug}` |
| 2+ agents on separate issues | Worktree | `git worktree add` per agent |
| Ralph batch work (multiple issues) | Worktree | `git worktree add` per issue |

---

## Single-Issue Workflow (Standard)

```bash
# 1. Branch from base (dev or main, per repo convention)
git checkout {baseBranch} && git pull origin {baseBranch}
git checkout -b squad/{issue-number}-{slug}

# 2. Do work, commit referencing issue
git add -A && git commit -m "feat: {description} (#issue-number)"

# 3. Push and open PR
git push -u origin squad/{issue-number}-{slug}
gh pr create --base {baseBranch} --title "{description}" --body "Closes #{issue-number}" --draft
```

---

## Parallel-Issue Workflow (Worktrees)

### Pre-Spawn — Coordinator Creates Worktrees

Before spawning agents, the coordinator creates one worktree per issue:

```bash
git fetch origin {baseBranch}
git worktree add ./worktrees/squad-{issue} -b squad/{issue}-{slug} origin/{baseBranch}
```

**Naming convention:** `./worktrees/squad-{issue-number}` (e.g., `./worktrees/squad-195`).

Each worktree:
- Has its own working directory and index
- Is on its own `squad/{issue-number}-{slug}` branch
- Shares the same `.git` object store (disk-efficient)

### Spawn Prompt — ISSUE CONTEXT Block

When spawning an agent for worktree-based issue work, include this block in the spawn prompt:

```
ISSUE CONTEXT:
  Issue: #{issue-number} — {title}
  Branch: squad/{issue-number}-{slug}
  Base: {baseBranch}

WORKTREE_PATH: ./worktrees/squad-{issue-number}
You are already on branch squad/{issue-number}-{slug} in a dedicated worktree.
Work ONLY inside {WORKTREE_PATH}. Do NOT run `git checkout` to switch branches.

After completing work:
1. Stage and commit: `git add -A && git commit -m "feat: {description} (#{issue-number})"`
2. Push: `git push -u origin squad/{issue-number}-{slug}`
3. Open PR: `gh pr create --base {baseBranch} --title "{description}" --body "Closes #{issue-number}" --draft`
```

### Per-Worktree Agent Workflow

Each agent operates inside its worktree:

```bash
cd ./worktrees/squad-{issue-number}

# Work normally — commits, tests, pushes
git add -A && git commit -m "fix: {description} (#{issue-number})"
git push -u origin squad/{issue-number}-{slug}

# Create PR targeting base branch
gh pr create --base {baseBranch} --title "{description}" --body "Closes #{issue-number}" --draft
```

All PRs target the base branch independently. Agents never interfere with each other's filesystem.

### .squad/ State in Worktrees

The `.squad/` directory exists in each worktree as a copy. This is safe because:
- `.gitattributes` declares `merge=union` on append-only files (history.md, decisions.md, logs)
- Each agent appends to its own section; union merge reconciles on PR merge
- **Rule:** Never rewrite or reorder `.squad/` files in a worktree — append only

---

## PR Review Handling

After PR is created:
1. If the team has a Lead with reviewer role, spawn Lead for review (sync mode — gates further work)
2. If reviewer rejects, apply rejection lockout protocol
3. If reviewer approves or no reviewer configured, PR is ready for merge

---

## Post-Merge Cleanup

After a PR is merged:

### Standard (single-issue)
```bash
git checkout {baseBranch} && git pull origin {baseBranch}
git branch -d squad/{issue-number}-{slug}
git push origin --delete squad/{issue-number}-{slug}
```

### Worktree (parallel-issue)
```bash
# From the main clone (not from inside the worktree)
git worktree remove ./worktrees/squad-{issue-number}
git worktree prune
git branch -d squad/{issue-number}-{slug}
git push origin --delete squad/{issue-number}-{slug}
```

If a worktree was deleted manually (`rm -rf`), `git worktree prune` recovers the state.
