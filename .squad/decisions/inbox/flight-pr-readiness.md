# Decision: PR Readiness Checks — Action-Only Approach

**By:** Flight  
**Date:** 2026-07-23  
**Issue:** #750 | **PR:** #752

## Decision

PR readiness enforcement uses a single GitHub Action workflow (`squad-pr-readiness.yml`) that posts an upsert checklist comment — not branch rulesets, not a hybrid approach.

## Rationale

- Branch rulesets can't check changeset presence, commit count, or Copilot review status
- Rulesets give contributors generic "check failed" errors with no actionable guidance
- A single workflow file is easier to maintain than config split across rulesets + Actions
- The comment-based approach is **informational**, complementing (not replacing) existing CI enforcement

## Impact

- All agents: when adding new PR requirements, add them to the readiness workflow
- Contributors: will see a checklist comment on every PR — reference it in reviews
- Brady: reduced manual PR triage burden
