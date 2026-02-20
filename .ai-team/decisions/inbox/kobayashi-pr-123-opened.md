# Decision: PR #123 Opened (Issues #86 & #87)

**Date:** Today
**Agent:** Kobayashi (Git & Release Engineer)
**Status:** PENDING REVIEW
**PR:** https://github.com/bradygaster/squad/pull/123

## Context

Brady requested that two completed issues be merged via PR to the `dev` branch:

- **Issue #86:** Squad undid its own uncommitted changes (git safety regression)
- **Issue #87:** Squad workflows assume npm project type (project type detection)

Both issues have been addressed in branch `squad/87-project-type-detection`.

## Action Taken

1. **Pushed branch to origin:** `squad/87-project-type-detection` (1 unpushed commit)
2. **Opened PR #123 against `dev`** with:
   - Title: "feat: project type detection and git safety rules"
   - Body: Issue closure refs, concise change summary, test confirmation
   - Status: Awaiting Brady's review before merge

## PR Details

**URL:** https://github.com/bradygaster/squad/pull/123
**Source:** squad/87-project-type-detection
**Target:** dev
**Commits:** 1
**Tests:** 64+ pass

## What Ships

1. **Project type detection** — `detectProjectType()` and `generateProjectWorkflowStub()` for non-npm projects
2. **Git safety rules** — Spawn template safety rules prevent undoing uncommitted user changes
3. **Regression tests** — `test/git-safety.test.js` validates both features

## Next Steps

- Brady reviews PR #123
- Merge to dev when approved
- No immediate action needed from Kobayashi pending review results
