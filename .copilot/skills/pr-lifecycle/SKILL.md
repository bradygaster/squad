---
name: "pr-lifecycle"
description: "Complete issue → PR → merge lifecycle with readiness checks"
domain: "workflow"
confidence: "high"
source: "extracted from CONTRIBUTING.md, PR_REQUIREMENTS.md, squad-ci.yml"
---

## Context

This skill is the **canonical Copilot-agent lifecycle for the Squad repository**. It covers the full path from picking up a GitHub issue to merging a PR. Where older docs (templates, copilot-instructions, CONTRIBUTING.md) conflict with this skill, **this skill takes precedence** for Copilot agents.

For advanced scenarios (worktrees, multi-repo coordination), see `.copilot/skills/git-workflow/SKILL.md`.

## Scope

✅ **THIS SKILL COVERS:**
- Issue pickup and branch creation
- Implementation, build, test, lint workflow
- Pre-push safety verification
- PR creation with correct target, title, body, and labels
- All 11 PR readiness checks (what they check, how to pass, how to fix)
- Post-creation maintenance (review feedback, rebasing, CI)
- Merge preconditions and cleanup

❌ **THIS SKILL DOES NOT COVER:**
- Worktree-based parallel work (see `git-workflow` skill)
- Multi-repo coordinated PRs (see `git-workflow` skill)
- Release process / publishing (see `.squad/skills/release-process`)
- Reviewer lockout protocol (see `.copilot/skills/reviewer-protocol`)
- Architectural or security review checklists

---

## Lifecycle Procedure

### Phase 1 — Issue Pickup

1. **Read the issue.** Understand the acceptance criteria before writing code.

2. **Confirm capability fit.** Check your capability profile in `.squad/team.md`. 🟢 = proceed. 🟡 = proceed but flag in PR. 🔴 = comment on issue and stop.

3. **Branch from dev:**
   ```bash
   git fetch origin dev
   git checkout dev
   git rebase origin/dev
   git checkout -b squad/{issue-number}-{slug}
   ```
   - Branch name format: `squad/{issue-number}-{kebab-case-slug}`
   - Example: `squad/42-fix-login-validation`
   - **Never** branch from `main`

4. **Mark in-progress** (optional):
   ```bash
   gh issue edit {number} --add-label "status:in-progress"
   ```

---

### Phase 2 — Implementation

1. **Make your changes.** Follow the codebase conventions:
   - TypeScript strict mode, no `@ts-ignore`
   - ESM-only, async/await
   - JSDoc on new public APIs

2. **Build:**
   ```bash
   npm run build
   ```

3. **Test:**
   ```bash
   npm test
   ```

4. **Type check:**
   ```bash
   npm run lint
   ```

5. **Stage specific files only:**
   ```bash
   git add path/to/file1.ts path/to/file2.ts
   ```
   - ❌ **NEVER** `git add .`, `git add -A`, or `git commit -a`
   - ✅ **ALWAYS** name each file explicitly

6. **Pre-push safety check:**
   ```bash
   # Verify file count matches intent (expect ≤10 files for most fixes)
   git diff --cached --stat

   # Verify NO unintended deletions
   git diff --cached --diff-filter=D --name-only
   ```
   If you see unexpected files or deletions, unstage them: `git reset HEAD <file>`

7. **Single commit with issue reference:**
   ```bash
   git commit -m "Brief description of change

   Closes #{issue-number}

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
   ```
   - If you already have multiple commits, squash: `git rebase -i origin/dev` and squash all into one
   - **Never** use `git reset --soft` to squash — it picks up delta from dev and contaminates the commit

8. **Add changeset (if required):**
   A changeset is required when your PR modifies files under `packages/squad-sdk/src/` or `packages/squad-cli/src/`.

   ```bash
   npx changeset add
   ```
   This prompts for: which packages changed, bump type (patch/minor/major), summary.

   Or create manually at `.changeset/{descriptive-name}.md`:
   ```markdown
   ---
   '@bradygaster/squad-cli': patch
   ---

   Brief description of the change
   ```

   If the changeset creates a second commit, squash it into your main commit.

---

### Phase 3 — PR Creation

1. **Push:**
   ```bash
   git push -u origin squad/{issue-number}-{slug}
   ```

2. **Create PR targeting dev:**
   ```bash
   gh pr create --repo bradygaster/squad --base dev \
     --title "fix: brief description (#issue-number)" \
     --body "Closes #{issue-number}

   ## Summary
   What this PR does and why.

   ## Changes
   - File-level description of changes

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
   ```

3. **Title conventions:**
   - Bug fix: `fix: description (#N)`
   - Feature: `feat: description (#N)`
   - Docs: `docs: description (#N)`
   - Chore/infra: `chore: description (#N)`

4. **Labels:**
   - `fix`, `feat`, `docs`, or `repo-health` for type
   - `squad:{agent-name}` if working as a squad member
   - `skip-changelog` only with reviewer approval (escape hatch)

5. **Scope rules by label:**
   - `repo-health`: Only modify `.github/`, `scripts/`, root config, tests, docs. **Never** modify `packages/*/src/`
   - `fix` or `feat`: May modify product source. Must include changeset when touching `packages/*/src/`

---

### Phase 4 — PR Readiness

An automated readiness check runs on every push and posts a checklist comment on the PR. All 11 checks must pass before review (check 11 is informational-only).

#### Check 1: Single Commit

| | |
|---|---|
| **What** | PR must contain exactly 1 commit |
| **Pass** | Push a single, squashed commit |
| **Fix** | `git rebase -i origin/dev` → squash all commits into one → `git push --force-with-lease` |
| **Gotcha** | Never `git reset --soft` to squash — contaminates the commit with unrelated changes |

#### Check 2: Not in Draft

| | |
|---|---|
| **What** | PR must not be marked as draft |
| **Pass** | Create PR as ready, or convert: `gh pr ready` |
| **Fix** | `gh pr ready {number}` or use the GitHub UI |
| **Gotcha** | The readiness check still runs on drafts but will show ❌ until you mark ready |

#### Check 3: Branch Up to Date

| | |
|---|---|
| **What** | PR branch must not be behind `dev` |
| **Pass** | Rebase onto latest dev before pushing |
| **Fix** | `git fetch origin dev && git rebase origin/dev && git push --force-with-lease` |
| **Gotcha** | After rebasing, the readiness check re-runs automatically on the new push |

#### Check 4: Copilot Review

| | |
|---|---|
| **What** | The `copilot-pull-request-reviewer` bot must post an `APPROVED` review |
| **Pass** | Wait — Copilot review is triggered automatically on PR creation/push |
| **Fix** | If Copilot hasn't reviewed after 5 minutes, push an empty commit to re-trigger: `git commit --allow-empty -m "trigger review" && git push` then squash before merge |
| **Gotcha** | Copilot review state is `APPROVED`, `CHANGES_REQUESTED`, or `COMMENTED`. Only `APPROVED` passes |

#### Check 5: Changeset Present

| | |
|---|---|
| **What** | PRs that modify `packages/squad-sdk/src/` or `packages/squad-cli/src/` must include a `.changeset/*.md` file or a `CHANGELOG.md` edit |
| **Pass** | Run `npx changeset add` and commit the generated file |
| **Fix** | `npx changeset add` → select affected package(s) → select bump type → write summary → `git add .changeset/ && git commit --amend --no-edit && git push --force-with-lease` |
| **Gotcha** | The `skip-changelog` label bypasses this check but requires reviewer approval. Non-source changes (docs, config, tests) don't need a changeset |

#### Check 6: No Merge Conflicts

| | |
|---|---|
| **What** | PR must be cleanly mergeable with the base branch |
| **Pass** | Keep branch rebased on dev |
| **Fix** | `git fetch origin dev && git rebase origin/dev` → resolve conflicts → `git push --force-with-lease` |
| **Gotcha** | GitHub may show `null` mergeability briefly while computing — the check treats this as passing |

#### Check 7: Scope Clean

| | |
|---|---|
| **What** | Warns if PR includes `.squad/` or `docs/proposals/` files |
| **Pass** | Don't include team state or proposal files in product PRs |
| **Fix** | Remove unintended files: `git reset HEAD .squad/ docs/proposals/` then amend your commit |
| **Gotcha** | This check is **informational only** — it always passes but flags attention. Including these files is OK if intentional (e.g., updating agent history) |

#### Check 8: Copilot Threads Resolved

| | |
|---|---|
| **What** | All review threads opened by `copilot-pull-request-reviewer` must be resolved |
| **Pass** | Address each Copilot comment, then click "Resolve conversation" in the GitHub UI |
| **Fix** | Go to the PR's "Files changed" tab → find unresolved Copilot threads → fix the code or explain why no change is needed → click "Resolve conversation" |
| **Gotcha** | Outdated threads (on code that's since changed) are automatically skipped. Only active, unresolved threads block |

#### Check 9: CI Passing

| | |
|---|---|
| **What** | All CI check runs (excluding the readiness check itself) must be green |
| **Pass** | Fix any build, test, or lint failures and push |
| **Fix** | Read the failing check's logs (`gh run view {run-id} --log-failed`), fix the issue, push |
| **Gotcha** | Pending/in-progress checks also show ❌. Wait for all checks to complete before evaluating. The readiness check re-runs after CI completes via `workflow_run` trigger |

#### Check 10: Issue Linked

| | |
|---|---|
| **What** | PR body or commit message must reference an issue (`Closes #N`, `Fixes #N`, `Resolves #N`, or `Part of #N`) |
| **Pass** | Include `Closes #N` in PR body or commit message |
| **Fix** | Edit PR body to add `Closes #{issue-number}`, or amend commit message |
| **Gotcha** | Case-insensitive matching. Only closing keywords are recognized |

#### Check 11: Protected Files (informational)

| | |
|---|---|
| **What** | Warns when zero-dependency bootstrap files are modified (always passes) |
| **Pass** | Always passes — this is informational only |
| **Fix** | If flagged, verify the changed bootstrap file still has zero external dependencies |
| **Gotcha** | Protected files are listed in `copilot-instructions.md`. The check warns but does not block |

---

### Phase 5 — Post-Creation Maintenance

1. **Handling Copilot review feedback:**
   - Read each comment carefully
   - Fix valid issues in your code
   - Resolve each thread after addressing it
   - Amend your single commit: `git commit --amend --no-edit && git push --force-with-lease`

2. **Rebasing when behind dev:**
   ```bash
   git fetch origin dev
   git rebase origin/dev
   # Resolve any conflicts
   git push --force-with-lease
   ```

3. **Re-running CI:**
   - CI re-runs automatically on every push
   - To re-run without changes: `gh run rerun {run-id} --failed`

4. **If readiness check is stale:**
   - The readiness check re-runs on push and after CI completes
   - If it's stale, push a trivial fix or empty commit to re-trigger

---

### Phase 6 — Merge & Cleanup

1. **Merge preconditions:**
   - All 11 readiness checks pass (✅ across the board)
   - Human reviewer has approved (or maintainer merges directly)
   - No open blocking conversations

2. **Who merges:**
   - Agents do **not** merge PRs themselves
   - Maintainers (bradygaster or designated reviewers) merge via GitHub UI
   - The repo uses squash merge, so commit history is clean regardless

3. **Post-merge cleanup:**
   ```bash
   git checkout dev
   git pull origin dev
   git branch -d squad/{issue-number}-{slug}
   git push origin --delete squad/{issue-number}-{slug}
   ```

4. **Verify issue auto-close:**
   - If PR body contains `Closes #{N}`, the issue closes automatically on merge
   - If not, manually close: `gh issue close {number}`

---

## Examples

### Example: Bug fix PR (no source changes)

```bash
# Branch
git fetch origin dev && git checkout dev && git rebase origin/dev
git checkout -b squad/610-fix-broken-link

# Fix
# ... edit docs/some-file.md ...

# Validate
npm run build && npm test

# Commit (no changeset needed — docs only)
git add docs/some-file.md
git diff --cached --stat        # verify: 1 file
git commit -m "docs: fix broken link in contributing guide

Closes #610

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# Push and PR
git push -u origin squad/610-fix-broken-link
gh pr create --repo bradygaster/squad --base dev \
  --title "docs: fix broken link (#610)" \
  --body "Closes #610"
```

### Example: SDK feature PR (source changes)

```bash
# Branch
git fetch origin dev && git checkout dev && git rebase origin/dev
git checkout -b squad/42-add-profile-api

# Implement
# ... edit packages/squad-sdk/src/profile/index.ts ...
# ... edit packages/squad-sdk/src/index.ts (re-export) ...

# Validate
npm run build && npm test && npm run lint

# Changeset (required — touches packages/squad-sdk/src/)
npx changeset add
# Select: @bradygaster/squad-sdk, minor, "Add profile API"

# Stage and commit
git add packages/squad-sdk/src/profile/index.ts packages/squad-sdk/src/index.ts .changeset/
git diff --cached --stat                    # verify file count
git diff --cached --diff-filter=D --name-only  # verify no deletions
git commit -m "feat: add profile API

Closes #42

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# Push and PR
git push -u origin squad/42-add-profile-api
gh pr create --repo bradygaster/squad --base dev \
  --title "feat: add profile API (#42)" \
  --body "Closes #42

## Summary
Adds profile resolution API to the SDK.

## Changes
- New module: packages/squad-sdk/src/profile/
- Re-exported from barrel file"
```

---

## Anti-Patterns

- ❌ Branching from `main` (always branch from `dev`)
- ❌ Targeting `main` with PRs (always target `dev`)
- ❌ Using `git add .` or `git add -A` (stage specific files only)
- ❌ Using `git commit -a` (same risk as broad staging)
- ❌ Using `git reset --soft` to squash (contaminates commit with dev delta)
- ❌ Force-pushing to `dev` or `main` (only force-push your own feature branch)
- ❌ Merging your own PR (maintainers merge)
- ❌ Skipping the changeset when source files changed (CI will fail)
- ❌ Self-resolving Copilot threads without addressing the feedback
- ❌ Pushing >1 commit without squashing (readiness check will flag it)
- ❌ Including `.squad/` files in product PRs without intention (scope check warns)
- ❌ Mixing product and infrastructure changes in one PR (create separate PRs)

---

## Readiness Check Gaps & Recommendations

After analyzing `.github/workflows/squad-ci.yml`, three gaps were identified. Gaps 1 and 3 are now implemented (checks 10 and 11). Gap 2 is deferred.

### Gap 1: Issue Linkage Check (Check 10) — IMPLEMENTED

**Problem:** Nothing verifies that the PR body or commit message references an issue (`Closes #N` or `Part of #N`). Orphan PRs are hard to trace.

**Recommendation:** Add `checkIssueLinkage(prBody, commitMessages)` to `pr-readiness.mjs`.

```javascript
/**
 * Check: Issue linkage.
 * @param {string} prBody — PR description text
 * @param {Array<{ commit: { message: string } }>} commits
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkIssueLinkage(prBody, commits) {
  const issuePattern = /(closes|fixes|resolves|part of)\s+#\d+/i;
  const bodyHasRef = issuePattern.test(prBody || '');
  const commitHasRef = (commits || []).some(
    (c) => issuePattern.test(c.commit?.message || '')
  );
  if (bodyHasRef || commitHasRef) {
    return { pass: true, detail: 'Issue reference found' };
  }
  return {
    pass: false,
    detail: 'No issue reference — add `Closes #N` to PR body or commit message',
  };
}
```

**Integration point:** After check 2 (draft status), before check 3 (branch freshness). Data is already available from the commits and PR body fetched in the orchestrator.

### Gap 2: No Required Checks Presence Verification

**Problem:** The CI status check (check 9) verifies that existing checks are green, but doesn't verify that the *expected* set of checks actually ran. If a workflow is misconfigured or skipped, the PR could pass with zero CI checks.

**Recommendation:** Add `checkRequiredChecksPresent(checkRuns, files)` to `pr-readiness.mjs`.

```javascript
/** Minimum required check names that must appear for source PRs. */
export const REQUIRED_CHECKS = ['Squad CI / test'];

/**
 * Check: Required CI checks are present.
 * @param {Array<{ name: string }>} checkRuns
 * @param {Array<{ filename: string }>} files
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkRequiredChecksPresent(checkRuns, files) {
  const touchesSource = (files || []).some(
    (f) => SOURCE_PATTERN.test(f.filename)
  );
  if (!touchesSource) {
    return { pass: true, detail: 'No source changes — required checks not enforced' };
  }
  const checkNames = new Set((checkRuns || []).map((cr) => cr.name));
  const missing = REQUIRED_CHECKS.filter((name) => !checkNames.has(name));
  if (missing.length > 0) {
    return {
      pass: false,
      detail: `Required check(s) not found: ${missing.join(', ')}`,
    };
  }
  return { pass: true, detail: 'All required checks present' };
}
```

**Integration point:** After check 9 (CI status). Uses the same `checkRuns` and `files` data already fetched.

### Gap 3: Protected File Change Detection (Check 11) — IMPLEMENTED

**Problem:** The repo has zero-dependency bootstrap files that must never import external packages (documented in `copilot-instructions.md`). The `squad-repo-health.yml` workflow runs a bootstrap protection check, but the PR readiness comment doesn't surface it — contributors don't see the warning until they check the separate workflow.

**Recommendation:** Add `checkProtectedFiles(files)` to `pr-readiness.mjs` as an **informational** check (always passes, like scope clean).

```javascript
/** Bootstrap files that must remain zero-dependency. */
export const PROTECTED_FILES = [
  'packages/squad-cli/src/cli/core/detect-squad-dir.ts',
  'packages/squad-cli/src/cli/core/errors.ts',
  'packages/squad-cli/src/cli/core/gh-cli.ts',
  'packages/squad-cli/src/cli/core/output.ts',
  'packages/squad-cli/src/cli/core/history-split.ts',
];

/**
 * Check: Protected file changes (informational).
 * @param {Array<{ filename: string }>} files
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkProtectedFiles(files) {
  const touched = (files || []).filter(
    (f) => PROTECTED_FILES.includes(f.filename)
  );
  if (touched.length === 0) {
    return { pass: true, detail: 'No protected bootstrap files changed' };
  }
  return {
    pass: true,
    detail: `⚠️ ${touched.length} protected bootstrap file(s) changed: ${touched.map((f) => f.filename.split('/').pop()).join(', ')} — verify zero-dependency constraint`,
  };
}
```

**Integration point:** After check 7 (scope clean). Uses the same `files` data. Informational only — warns but doesn't block.

### Summary of Recommended Changes

| Check | Type | Blocks PR? | Status |
|-------|------|------------|--------|
| Issue linkage (Check 10) | Hard gate | Yes | Implemented |
| Required checks present | Hard gate | Yes | Deferred |
| Protected file warning (Check 11) | Informational | No | Implemented |

All three use data that `pr-readiness.mjs` already fetches — no new API calls needed. Total addition: ~60 lines of check functions + ~10 lines of orchestration wiring.
