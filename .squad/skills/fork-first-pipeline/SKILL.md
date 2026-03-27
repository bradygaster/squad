# Fork-First PR Pipeline

## Confidence
High

## Domain
PR workflow, cross-fork collaboration

## Problem Statement
PRs opened directly on the upstream repository get messy iteration in public. Code review feedback creates visible churn. Force-push history is exposed. This workflow keeps development clean by staging changes on the fork first, then opening a single clean upstream PR after review is complete.

## 8-Step Pipeline

\\\
BRANCH → FORK PR → REVIEW → FIX → BLEED CHECK → CLEAN → UPSTREAM → DONE
\\\

### Step 1: BRANCH
Create a feature branch locally:
\\\ash
git checkout -b squad/{issue-number}-{slug}
\\\

### Step 2: FORK PR
Push to fork and open PR **against your fork's dev branch**:
\\\ash
git push origin {branch-name}
gh pr create --base dev --draft  # Opens on fork/dev, not upstream
\\\

### Step 3: REVIEW
Iterate on the fork PR with teammates. Collect feedback via review comments. This happens in your fork, not upstream.

### Step 4: FIX
Address review comments. Commit changes directly to the feature branch (don't squash yet).

### Step 5: BLEED CHECK
Run a bleed audit to verify no stowaway files are committed. Check for:
- \.squad/\ files (should not be in app PRs)
- Navigation entries for wrong PR
- Test expectations for wrong PR
- Full-file rewrites
- Build artifacts
- Root-level strays

If bleed detected, fix on the feature branch.

### Step 5.5: REBASE
Before squashing for upstream, rebase the feature branch against `origin/dev` to avoid full-file rewrites:
\\\ash
git fetch origin dev
git rebase origin/dev
\\\

#### Shared File Strategy
For files shared across PRs (navigation.ts, test files, CI workflows):
- **Never** make full-file changes on feature branches
- **Always** reset to dev first, then make surgical additions:
  \\\ash
  git checkout origin/dev -- docs/src/navigation.ts
  # Then manually add ONLY the entries for this PR's content
  \\\
- This prevents diffs that rewrite the entire file, which cause merge conflicts with every other PR

#### When Rebase Fails
If rebase has conflicts on shared files:
1. `git rebase --abort`
2. Reset the shared files to dev: `git checkout origin/dev -- {file}`
3. Re-add only this PR's surgical changes
4. `git commit --amend --no-edit`
5. Continue with step 6 CLEAN

### Step 6: CLEAN
Prepare for upstream PR:
- Squash commits into logical units
- Clean up commit messages
- Remove any \.squad/\ files if present
- Verify no \/docs/\ prefix in titles
- Remove double blank lines from description

### Step 7: UPSTREAM
Open PR on upstream repository against \radygaster/squad:dev\:
\\\ash
gh pr create --repo bradygaster/squad --base dev --fill
\\\

### Step 8: DONE
Upstream PR is merged. Close or keep fork PR for reference.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Better Way |
|---|---|---|
| Open upstream PR before fork review complete | Public iteration, messy history | Complete review cycle on fork first |
| Force-push to upstream branch | Breaks links, confuses reviewers | Squash locally, push once |
| Skip bleed check | Stowaway files merge upstream | Always audit before upstream PR |
| Commit \.squad/\ files in app PRs | Repo pollution, merge conflicts | Exclude from staging, bleed check catches this |
| Open multiple PRs per feature | Fragmented review, merge chaos | One upstream PR per feature |
| Skip rebase before upstream | Diverged branch creates full-file diffs | Always rebase against origin/dev before step 6 |

## Pre-Upstream Gate Checklist

Before opening the upstream PR, verify:

- [ ] **Flight approval**: Fork PR merged into fork/dev
- [ ] **FIDO approval**: Code quality, tests pass, no security issues
- [ ] **Bleed check pass**: Zero stowaway files, no \.squad/\ commits
- [ ] **Squash commits**: 1-3 logical commits, not N from iteration
- [ ] **Clean description**: No double blank lines, clear problem/solution
- [ ] **No \.squad/\ files**: Excluded from commit entirely
- [ ] **No \/docs/\ prefix**: If docs changes, they go elsewhere
- [ ] **No double blank lines**: Markdown/description formatting clean

## Workflow Summary

This pipeline separates concerns:
- **Fork PR**: Messy iteration, team feedback, bleed capture
- **Upstream PR**: Clean, single-commit, ready-to-merge

Result: Upstream PRs are lean, reviewed, and production-ready.
