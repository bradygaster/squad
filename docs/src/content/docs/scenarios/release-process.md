# Release Process for Squad Maintainers

**Try this to ship a new version:**
```
We're ready to ship v1.2.0 — run the release process: changelog, tags, and publish
```

**Try this to promote to production:**
```
Merge preview to main and cut a production release
```

Complete step-by-step guide for Squad maintainers: three-branch model (dev/preview/main), guard workflows, PR merging, and production release procedures.

---

## Table of Contents

1. [Branch Model Overview](#branch-model-overview)
2. [Preview Build Workflow](#preview-build-workflow)
3. [Pull Request Workflow](#pull-request-workflow)
4. [Merging Back to Dev](#merging-back-to-dev)
5. [Full Release Lifecycle](#full-release-lifecycle)
6. [Branch Protection Rules](#branch-protection-rules)
7. [Troubleshooting](#troubleshooting)
8. [Sample Prompts](#sample-prompts)

---

## Branch Model Overview

| Branch | Purpose | Who Commits | Guard Active? | Files Allowed |
|--------|---------|------------|---------------|---------------|
| **dev** | Development — all work happens here | All team members | ❌ No | Everything (`.ai-team/`, team-docs, etc.) |
| **preview** | Staging/testing — validated product only | Release coordinator | ✅ Yes | Distribution files only (`.ai-team/` blocked) |
| **main** | Production — release source for `npx` | Release coordinator | ✅ Yes | Distribution files only (`.ai-team/` blocked) |

---

## Preview Build Workflow

### Step 1: Create the Preview Branch

```bash
git checkout dev
git pull origin dev
git checkout -b preview 2>/dev/null || git checkout preview
git reset --hard dev
```

### Step 2: Remove Forbidden Files (Guard Enforcement)

Remove forbidden paths:

```bash
git rm --cached -r .ai-team/
git rm --cached -r team-docs/
```

If there are changes:

```bash
git commit -m "chore: remove forbidden paths for preview branch"
git push -f origin preview
```

### Step 3: Review and Test

Verify CI status passes and code review is complete. Push test branches off `preview` to validate the release; if guard passes, your preview branch is clean.

---

## Pull Request Workflow

### Creating a PR (Feature Work on Dev)

```bash
git checkout -b feature/my-feature
# ... make changes ...
git add .
git commit -m "feat: my new feature"
git push -u origin feature/my-feature
gh pr create --base dev --title "feat: my new feature" --body "Description of changes"
```

### Reviewing a PR

Use GitHub UI or `gh` CLI to view and review PRs.

### Merging a PR to Dev

```bash
gh pr merge 123 --merge --auto
git checkout dev && git pull origin dev
```

---

## Merging Back to Dev

After a release ships from `main`, sync changes back to `dev`:

### Step 1: Create a Sync PR

```bash
git checkout dev
git pull origin dev
git checkout -b chore/sync-from-main
git merge main --no-ff --no-edit
```

### Step 2: Resolve Conflicts (if any)

If conflicts exist:

```bash
git status  # Lists conflicted files
git add .
git commit -m "chore: resolve merge conflicts from main"
```

### Step 3: Push and Merge

```bash
git push -u origin chore/sync-from-main
gh pr create --base dev --title "chore: sync from main" --body "Bring production changes back to dev"
gh pr merge --merge --auto
git checkout dev && git pull origin dev
```

---

## Full Release Lifecycle

### Phase 1: Preparation (on `dev`)

1. **Update CHANGELOG.md:**

```markdown
## [0.4.0] — 2026-02-15

### Added
- MCP tool discovery and integration
- Plugin marketplace support

### Changed
- VS Code support now fully compatible

### Community
- @csharpfritz: MCP tool discovery (#11)
```

2. **Update version in package.json:**

```bash
nano package.json  # Set "version": "0.4.0"
```

3. **Commit to dev:**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: prepare release v0.4.0"
git push origin dev
```

### Phase 2: Preview Build (on `preview`)

Follow [Preview Build Workflow](#preview-build-workflow).

### Phase 3: Merge to Main (on `main`)

1. **Create a release PR:**

```bash
git checkout main
git pull origin main
git checkout -b release/v0.4.0
git merge --no-ff preview -m "Release v0.4.0"
git push -u origin release/v0.4.0
```

2. **Create PR for final review:**

```bash
gh pr create --base main --title "Release v0.4.0" --body "Final release PR. Guard enforces file restrictions."
```

3. **Wait for guard to pass**, then merge:

```bash
gh pr merge --merge --auto
```

### Phase 4: Tag the Release (on `main`)

```bash
git checkout main
git pull origin main
git tag -a v0.4.0 -m "Release v0.4.0: MCP integration, Plugin marketplace, Notifications"
git push origin v0.4.0
```

Tag format: `vX.Y.Z` (must match `package.json` version).

### Phase 5: Verify the Release

Monitor the release workflow:

```bash
gh run list --workflow release.yml --status in_progress
gh run list --workflow release.yml --status completed --limit 1
```

### Phase 6: Sync Back to Dev

```bash
git checkout dev
git pull origin dev
git checkout -b chore/sync-from-main
git merge main --no-ff
git push -u origin chore/sync-from-main
gh pr merge --merge --auto
git pull origin dev
```

---

## Branch Protection Rules

| Branch | Rule | Effect |
|--------|------|--------|
| `main` | Require PR review | All PRs require at least 1 approval |
| `main` | Require status checks to pass | Tests must pass before merge allowed |
| `preview` | Require status checks to pass | Tests must pass before merge allowed |

---

## Troubleshooting

### Issue: Forbidden Files Detected in PR

Use `.gitignore` rules and verify `git status` before pushing:

```bash
git status
git rm --cached -r .ai-team/
git commit -m "chore: remove runtime state files"
git push
```

---

### Issue: SSH Hangs During Push

**Fix:**

```bash
# Try HTTP instead
git remote set-url origin https://github.com/bradygaster/squad.git
git push origin <branch>

# Or test SSH
ssh -T git@github.com
```

---

### Issue: .ai-team/ Files Keep Getting Committed

**Fix:**

```bash
git rm --cached -r .ai-team/
grep ".ai-team" .gitignore || echo ".ai-team/" >> .gitignore
git add .gitignore
git commit -m "chore: ensure .ai-team/ is untracked"
git push origin dev
```

---

### Issue: Missing Workflows in .github/workflows/

**Fix:**

```bash
npx github:bradygaster/squad upgrade
git add .github/workflows/
git commit -m "chore: restore Squad workflows"
git push origin dev
```

---

### Issue: GitHub Release Not Created After Tag

**Fix:**

```bash
gh run list --workflow release.yml --status completed --limit 1
gh run view <RUN_ID>  # Check details

# Create manually if needed
gh release create v0.4.0 --title "v0.4.0" --notes-file CHANGELOG.md --prerelease
```

---

## Sample Prompts

### To Prepare for Release

```
Kobayashi, prepare v0.4.0: update CHANGELOG.md and package.json version, commit to dev
```

### To Build a Preview

```
Kobayashi, build a preview branch from dev, remove forbidden files, push to origin, and confirm the guard passes
```

### To Tag a Release

```
Kobayashi, checkout main, create and push tag v0.4.0, verify the release workflow starts, and report when it completes
```

### To Sync After Release

```
Kobayashi, create a chore/sync-from-main branch, merge main into it, create and merge PR back to dev, and confirm dev is up to date
```

### To Test the Guard

```
Kobayashi, test the guard workflow by creating a test branch with .ai-team/ content, creating a PR to main (should fail), removing the file (should pass), and cleaning up
```

### To Fix a Blocked PR

```
Kobayashi, fetch the current PR state, remove all .ai-team/ and team-docs/ files, commit, push to update the PR, and wait for guard to pass
```

---

## Key Files Reference

- **Release workflow:** `.github/workflows/release.yml`
- **Changelog:** `CHANGELOG.md`
- **Version:** `package.json`
- **Ignore rules:** `.gitignore`, `.npmignore`
- **Branch protection:** GitHub repo Settings → Branches

