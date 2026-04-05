# Decision: PR Lifecycle Skill & Readiness Check Expansion

**By:** Procedures (Prompt Engineer)
**Date:** 2026-07

## Context

The PR readiness system (`scripts/pr-readiness.mjs`) had 9 checks but no single skill document that agents could follow end-to-end for the issue → PR → merge lifecycle. Existing docs were scattered across CONTRIBUTING.md, copilot-instructions.md, git-workflow skill, and PR_REQUIREMENTS.md.

## Decisions

### 1. Canonical lifecycle skill

Created `.copilot/skills/pr-lifecycle/SKILL.md` as the single source of truth for Copilot agents doing issue work. This skill overrides older lifecycle guidance where conflicts exist.

### 2. Two new readiness checks

Expanded `pr-readiness.mjs` from 9 to 11 checks:

- **`checkIssueLinkage()`** — hard gate requiring `Closes #N` or equivalent in PR body or commit message. Catches orphan PRs.
- **`checkProtectedFiles()`** — informational warning when zero-dependency bootstrap files are modified. Surfaces the repo-health bootstrap protection check directly in the PR readiness comment.

### 3. Deferred: Required checks presence

Recommended but did not implement `checkRequiredChecksPresent()` — needs team agreement on which CI check names are mandatory. Filed as recommendation in the skill's gap analysis section.

## Rationale

- Issue linkage is the highest-leverage missing gate — traces every PR to its issue
- Protected file warning reduces friction by surfacing the warning inline instead of requiring contributors to check a separate workflow
- Both new checks use data already fetched by the orchestrator — zero new API calls

## Impact

- All agents get a complete, step-by-step lifecycle reference
- PR readiness comment now shows 11 checks instead of 9
- Tests updated: 90 passing (was 88 before accounting for new checks)
