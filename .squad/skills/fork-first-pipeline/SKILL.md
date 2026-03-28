# Fork-First PR Pipeline

## Confidence
High

## Domain
PR workflow, cross-fork collaboration

## Problem Statement
PRs opened directly on the upstream repository get messy iteration in public. Code review feedback creates visible churn. Force-push history is exposed. This workflow keeps development clean by staging changes on the fork first, then opening a single clean upstream PR after review is complete.

## 9-Step Pipeline

\\\
BRANCH → FORK PR → PREFLIGHT → REVIEW → FIX → BLEED CHECK → CLEAN → UPSTREAM → DONE
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

### Step 2.5: PREFLIGHT TEST GATE

Before requesting review, the author **MUST** run the full build and test suite locally:

```bash
npm run build && npm test
```

This is not optional for any PR. If tests fail, fix them before requesting review.

**PR description attestation**: Add a "Preflight" section to the PR description confirming tests pass:

```markdown
## Preflight
- [x] `npm run build` — passes
- [x] `npm test` — passes (N suites, N tests, Ns runtime)
```

**Migration PRs (>20 files changed)**: Include the full test output summary (suite count, pass/fail counts, total runtime) in the PR description. This prevents the "approved but broken" pattern where reviewers check ecosystem completeness without verifying functional correctness.

The 89-second test run is cheaper than one CI round-trip. Always run it locally.

### Step 3: REVIEW
Iterate on the fork PR with teammates. Collect feedback via review comments. This happens in your fork, not upstream.

#### Correctness Before Completeness

Reviews **MUST** follow this order:

1. **Functional correctness first** — Do tests pass? Does `npm run build && npm test` succeed? If not, stop here. Do not review ecosystem items on broken code.
2. **Mechanical correctness** — Are all callsites updated? Are string literals consistent? Are async/await signatures correct throughout?
3. **Ecosystem completeness last** — Docs, changelog, exports, navigation entries.

If tests fail at step 1, the review verdict is **NEEDS FIXES** with a single finding: "Tests must pass before review can proceed." Do not spend reviewer time evaluating docs or changelog on code that doesn't build.

### Step 4: FIX
Address review comments. Use **additive commits** so reviewers can see what changed between iterations. Do not squash-amend-force-push during active review — this hides fix iteration history and makes re-review impossible.

```bash
# Good: additive commit during review
git commit -m "fix: await async storage calls per review feedback"

# Bad: squash during active review
git commit --amend --no-edit && git push --force-with-lease  # ← hides iteration
```

Squash happens later, at Step 6 (CLEAN), after CI is green and review is complete.

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

#### Serial Branch Operations — Critical Rule

⚠️ **When multiple agents fix different PRs in parallel on the same physical repository (even if different branches), they all run `git checkout` in the same working tree.** This causes:
- Working tree conflicts (both agents try to update `.git/index` simultaneously)
- Commits landing on wrong branches (Agent A's commit lands on Agent B's branch)
- Race conditions (`.git/HEAD` and `.git/index` become inconsistent)

**RULE: Bleed fixes across multiple PRs must be done SERIALLY (one at a time) unless using git worktrees.** Never launch parallel agents that checkout different branches in the same repo without worktrees.

**Exception**: Use `git worktree add ../squad-195 -b squad/195-fix-issue origin/dev` to give each agent an isolated working directory.

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
- Check for stale TDD comments ("RED PHASE", "TODO: implement", "WIP") that no longer apply
- Verify no \/docs/\ prefix in titles
- Remove double blank lines from description

**Note on `.squad/skills/` files**: The `.squad/skills/` directory may be gitignored in some configurations. If you need to commit skill files to the fork, use `git add -f` to force them through, even if they match `.gitignore` patterns.

### Step 7: UPSTREAM
Open PR on upstream repository against radygaster/squad:dev:
\\\ash
gh pr create --repo bradygaster/squad --base dev --fill
\\\

After the PR is created, undraft it to mark it ready for review. The upstream PR is the **final presentation** — it should not remain in draft:
\\\ash
gh pr ready {pr-number} --repo bradygaster/squad
\\\

The upstream PR signals completion of the fork pipeline. Leaving it in draft confuses reviewers — they may assume work is still in progress when iteration is already complete.
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
| Parallel branch checkouts in same repo | Multiple agents switch branches simultaneously, causing working tree conflicts and commits landing on wrong branches | Use git worktrees or fix PRs serially |
| Forgetting to stash skill file updates | `.squad/skills/` files are gitignored, so they don't commit to the fork | Use `git add -f` when committing skill files |
| Leaving stale TDD comments in code | "RED PHASE", "TODO: implement" markers confuse reviewers after merge | Clean up all TDD markers before approval |
| Leave upstream PR in draft | Signals incomplete work when pipeline is done | Undraft upstream PR after opening — it's presentation-ready |
| Approving without running tests | Reviewers check ecosystem completeness (docs, changelog, exports) but miss functional breakage | Require test attestation before review; verify correctness before completeness |
| Squash-amend-force-push during review | Hides fix iteration history, reviewers can't see what changed between rounds | Use additive commits during review, squash only at merge time |
| Reviewing a 90-file migration like a 5-file PR | Mechanical errors (missed callsites, unwired async) survive review because reviewer skims | Use Migration PR Protocol: sample files, verify mechanical patterns, require test attestation |
| Skipping preflight test run | A sub-2-minute local test run would catch failures before CI round-trips | Always run `npm run build && npm test` before requesting review |

## Pre-Upstream Gate Checklist

Before opening the upstream PR, verify:

- [ ] **Preflight tests pass**: `npm run build && npm test` run locally with passing results
- [ ] **Test attestation in PR description**: Preflight section with suite count, pass/fail, runtime
- [ ] **Flight approval**: Fork PR merged into fork/dev
- [ ] **FIDO approval**: Code quality, tests pass, no security issues
- [ ] **Bleed check pass**: Zero stowaway files, no \.squad/\ commits
- [ ] **Squash commits**: 1-3 logical commits, not N from iteration (squash at merge time, not during review)
- [ ] **Clean description**: No double blank lines, clear problem/solution
- [ ] **No \.squad/\ files**: Excluded from commit entirely
- [ ] **No \/docs/\ prefix**: If docs changes, they go elsewhere
- [ ] **No double blank lines**: Markdown/description formatting clean
- [ ] **Migration PR extras (if >20 files)**: Full test output summary, structured change description, additive commit history preserved until squash

## Team Review Protocol

The fork PR review phase enforces team-wide quality standards. These patterns are mandatory.

### Dual Reviewer Gate
Every fork PR must be reviewed by **BOTH Flight (architecture)** and **FIDO (quality)** before approval. The rule:
- **Both APPROVE**: Ready to proceed
- **One APPROVE + One REJECT**: Not ready — re-review cycle required
- **No single-reviewer approvals**: A partial approval does not unblock

Both reviewers must sign off in the same review round or in sequential re-review rounds (see Review→Fix→Re-review Loop below).

### Convention Issues Are Blockers
The following are **NOT nits** — they are blockers per team directive. Flight and FIDO must flag these as `NEEDS FIXES`, never as "non-blocking notes":

- **`/docs/` prefix in internal links**: Links like `/docs/features/memory` should be bare: `/features/memory`. The /docs/ prefix is stripped at build time; links must not include it.
- **Double blank lines**: Single blank line is house style. Two or more consecutive blank lines must be reduced to one.
- **Table ordering discontinuities**: If tables reference order (e.g., step 1, 2, 3), they must be sequential without gaps.
- **Whitespace violations**: Trailing spaces, tabs instead of spaces, or inconsistent indentation.

When a reviewer finds any of these, the review verdict is **NEEDS FIXES** with findings documented. The author must correct all flagged conventions.

### Review→Fix→Re-review Loop
After reviewers identify blockers:

1. **Fix**: Author addresses all blocker comments on the feature branch. Use additive commits with descriptive messages (e.g., `fix: await async storage calls per review feedback`). Do not squash-amend during active review — reviewers need to see what changed.
2. **Re-run reviews**: **Both Flight AND FIDO must re-review**, even if only one reviewer found issues. This ensures convention fixes don't introduce new problems.
3. **Loop until both APPROVE**: Repeat until both reviewers vote APPROVE.
4. **Bleed check**: After both APPROVE, proceed to Step 5 (bleed check).

Do not skip to bleed check after a single reviewer fix.

### Reviewer Lockout
If Flight rejects a fork PR, the original author is locked out from self-revising. A **different agent** must make the fix and commit it. This is enforced mechanically:

- **Original author**: Locked from further commits on the feature branch after rejection.
- **Different agent** (e.g., Booster stepping in for PAO): Makes the fixes, commits, and force-pushes with `--force-with-lease`.
- **Re-review**: Both Flight and FIDO re-review the updated PR.

This rule prevents single-agent fixation loops and ensures peer review diversity.

### Known PAO Quirks (Watch for These)
If PAO is the author, Flight and FIDO should watch for:

- **`.squad/` file creep**: PAO often includes `.squad/agents/pao/history.md` or other `.squad/` files in commits. These must be explicitly excluded via bleed check or pre-commit rules.
- **`/docs/` prefix overuse**: PAO tends to add `/docs/` prefix to all internal links. Every reviewer must instruct "use bare paths — no /docs/ prefix."
- **Force-push caution**: Before PAO pushes, verify `git diff --cached --stat` matches intent and `git diff --cached --diff-filter=D` shows zero unintended deletions.

This is not a critique — it is a known pattern. Treat it as a checklist, not a personal issue.

### Migration PR Protocol (>20 Files)

PRs touching more than 20 files (bulk renames, API migrations, provider abstractions) follow a stricter protocol. These cannot be reviewed like a 5-file feature PR.

#### Author obligations
1. **Mandatory local test attestation** — Run `npm run build && npm test` and include the full test output summary in the PR description (suite count, pass/fail, runtime).
2. **Structured change description** — Break the PR description into: (a) what changed mechanically, (b) what changed semantically, (c) what callsites were updated.
3. **Additive commits during review** — Never squash during active review on a migration PR. Reviewers need to see exactly which files changed between iterations.

#### Reviewer obligations
1. **Mechanical correctness focus** — Are all callsites updated? Are string literals consistent across the migration? Are sync-to-async signature changes properly awaited everywhere?
2. **Sampling strategy** — Don't read all 80 files line-by-line. Sample 5-10 representative files, then verify the mechanical pattern holds across the rest.
3. **Test verification** — Before approving, confirm the author's test attestation. If the attestation is missing, request it before reviewing anything else.

#### Squash timing
Squash to a single commit **only at merge time** (Step 6: CLEAN), after CI is green and both reviewers approve. During review, the full commit history must be preserved.

### Review Comments Posted on PR
Formal reviews are posted to the fork PR as:
```
gh pr comment {pr-number} --body "REVIEW: {verdict}

## Findings
{findings}

## Summary
{summary}"
```

Verdict options: `APPROVE`, `NEEDS FIXES`, `REQUEST CHANGES`.

Findings should reference specific files, line numbers, and convention violations. Summary should restate the path forward (re-review required, bleed check next, etc.).

### Tamir Reviewer Rule
Only assign Tamir as a reviewer on **upstream PRs** where his original code PR is the source material for the content being documented. Do not add him to every upstream PR by default. On fork PRs, Flight and FIDO are the standard reviewers.

### Commit Hygiene
To ensure clean histories:

- **Additive commits during review**: Use descriptive commit messages for each fix iteration so reviewers can track what changed. Do NOT squash-amend-force-push during active review — this hides the fix history and makes re-review harder.
- **Squash at merge time only**: After CI is green and both reviewers approve, squash all review iterations into a single logical commit before opening the upstream PR (Step 6: CLEAN).
- **One commit per upstream PR**: The upstream PR should contain 1-3 logical commits, not N from iteration.
- **Force-push safely**: Use `--force-with-lease` to prevent accidental overwrites if teammates push simultaneously (rare in single-agent fork setup, but good practice). Only force-push after review is complete and you're preparing for upstream.
- **Always verify before push**:
  ```
  git diff --cached --stat       # File count must match intent
  git diff --cached --diff-filter=D  # Should show zero unintended deletions
  ```

## Lessons Learned — PR #640 Retrospective

These anti-patterns were observed during the StorageProvider abstraction PR (#640) and directly informed the Preflight Test Gate, Correctness Before Completeness, and Migration PR Protocol additions to this skill.

### "Approved but broken"
Flight and FIDO both approved the PR — twice — while CI was failing. Reviews checked ecosystem completeness (docs present? changelog updated? exports wired?) but nobody ran `npm test` locally or verified CI status before approving. **Root cause**: the review checklist evaluated packaging, not correctness.

### Template filename drift during bulk migration
An 89-file migration renamed storage provider references across the codebase. Some template filenames were updated inconsistently — the provider class was renamed but string literals referencing template paths were not. This is a mechanical correctness issue that sampling-based review should catch.

### Sync-to-async signature changes breaking tests
The migration changed synchronous method signatures to async, but not all test callsites added `await`. Tests that called async methods without awaiting them passed silently (the promise was truthy) until the test runner caught unhandled rejections. **Lesson**: when a migration changes function signatures, reviewers must verify all callsites match the new signature.

### The 89-second test run
The full test suite runs in ~89 seconds. Running it once locally before requesting review would have caught all three CI failures and prevented 3 consecutive CI round-trips (each taking 5-10 minutes). The preflight test gate exists because this single check has the highest ROI of any quality step in the pipeline.

### Squash-amend-force-push hiding iteration
During review, the author used `git commit --amend --no-edit && git push --force-with-lease` to address feedback. This replaced the previous commit entirely, making it impossible for reviewers to see what changed between review rounds. The fix: use additive commits during review, squash only at merge time.

## Workflow Summary

This pipeline separates concerns:
- **Fork PR**: Messy iteration, team feedback, bleed capture
- **Upstream PR**: Clean, single-commit, ready-to-merge

Result: Upstream PRs are lean, reviewed, and production-ready.

## Branch Segregation Rule

**Confidence:** high (validated by 3 stowaway incidents on PR #640)

### What goes where

| Content | Target Branch |
|---------|--------------|
| Code changes for the feature/issue | Feature branch |
| .squad/ state (decisions, logs, history) | dev |
| Skill updates (.squad/skills/) | dev |
| Fork-sync results | dev |
| Anything not part of a specific PR's scope | dev |

### Mechanic (when on a feature branch)

If you need to commit infrastructure work while on a feature branch:

1. `git stash` -- save feature work
2. `git checkout dev && git pull`
3. Commit and push the infrastructure change to dev
4. `git checkout -` -- return to feature branch
5. `git stash pop` -- restore feature work

### Coordinator responsibility

When dispatching agents for non-feature work while on a feature branch, include in the spawn prompt:

> "You are on a feature branch. Infrastructure work (.squad/, skills, decisions) must go to dev -- switch before committing."

### Anti-pattern

NEVER commit .squad/, skills, decisions, or fork-sync to a feature branch. This creates "stowaways" that contaminate PRs and require manual cleanup during squash.

**Evidence:** PR #640 had 3 stowaway incidents in one session -- fork-sync skill, fork-first-pipeline update, and .squad/ state all landed on the StorageProvider PR branch and had to be stripped.

