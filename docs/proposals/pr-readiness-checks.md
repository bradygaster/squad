# Proposal: Automated PR Readiness Checks

> **Author:** Flight  
> **Date:** 2026-07-23  
> **Issue:** #750  
> **Status:** Implementing

## Problem

Contributors open PRs that aren't review-ready. Brady manually inspects each one. This doesn't scale.

## Approaches Evaluated

### A. GitHub Action with PR Comment

A workflow runs on `pull_request` events, checks all criteria, posts/updates a checklist comment.

| Dimension | Rating |
|-----------|--------|
| Setup effort | ~30 min (one workflow file) |
| Maintenance | Low — self-contained YAML + inline JS |
| Contributor UX | Excellent — clear checklist comment on every PR |
| Coverage | Full — can check anything via GitHub API |

### B. Branch Rulesets (GitHub Native)

GitHub's newer rulesets enforce required status checks, no draft merges, linear history.

| Dimension | Rating |
|-----------|--------|
| Setup effort | ~10 min (UI configuration) |
| Maintenance | Zero code |
| Contributor UX | Poor — generic "check failed" with no actionable feedback |
| Coverage | Partial — can't check changeset presence, commit count, Copilot review |

### C. Hybrid (Rulesets + Action)

Branch rulesets for native enforcement + small Action for custom checks.

| Dimension | Rating |
|-----------|--------|
| Setup effort | ~40 min (UI + workflow) |
| Maintenance | Medium — config in two places |
| Contributor UX | Mixed — some feedback from Action, some from opaque rulesets |
| Coverage | Full, but split across two systems |

## Recommendation: Option A — GitHub Action

**Why:**

1. **Single source of truth.** One workflow file, one checklist comment. Contributors see everything in one place.
2. **Actionable feedback.** A checklist comment with ✅/❌ is dramatically better UX than a red CI badge with "required check failed."
3. **Zero external dependencies.** Uses only `actions/github-script` — no marketplace actions, no external services.
4. **Complements existing CI.** Runs alongside `squad-ci.yml` without replacing anything. The readiness check is informational (comment), while CI is enforcement (status check).
5. **Fork-safe.** Using `pull_request` (not `pull_request_target`) means it works for fork PRs with appropriate permission scoping.

**What it can't enforce natively:** Branch rulesets for merge protection. But Brady already has branch protection on `dev`. The Action adds the missing contributor feedback layer.

## Implementation Plan

1. Create `.github/workflows/squad-pr-readiness.yml`
2. Update `CONTRIBUTING.md` with PR readiness requirements section
3. Document branch ruleset recommendations (optional, manual setup by Brady)

## Checks Implemented

| Check | Method | Blocking? |
|-------|--------|-----------|
| Single commit | `commits` count from PR API | Informational |
| Not draft | `draft` field from PR API | Informational |
| Branch up to date | Compare base branch HEAD | Informational |
| Copilot review | Check reviews for copilot-pull-request-reviewer | Informational |
| Changeset present | Check PR files for `.changeset/*.md` | Informational |
| No merge conflicts | `mergeable_state` from PR API | Informational |
| CI passing | Check combined status | Informational |

All checks are **informational** (comment only). They don't block merge — that's the job of branch protection rules and existing CI. This keeps the system non-disruptive while giving contributors clear guidance.
