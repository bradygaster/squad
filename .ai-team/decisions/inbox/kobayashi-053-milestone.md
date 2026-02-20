# v0.5.3 Release Milestone & Issue

**Date:** 2026-02-20
**Requestor:** Brady
**Executor:** Kobayashi (Git & Release Engineer)

## GitHub Artifacts Created

- **Milestone:** #3 — "0.5.3" (Patch release: version indicator fix and pre-release semver support)
- **Issue:** #128 — "Version indicator missing from coordinator greeting after install/upgrade"
  - Status: CLOSED
  - Milestone: 0.5.3
  - Labels: (none assigned; ready for release triage)

## Issue Description

**Problem:** After `npx create-squad upgrade`, the coordinator's first greeting should include `Squad v{version}` but the version was missing. The `stampVersion()` function was replacing the version number in the agent file but leaving a literal `{version}` placeholder in the greeting instruction.

**Fix:** 
1. `stampVersion()` in `index.js` now also replaces the `` `Squad v{version}` `` placeholder with the literal version string (e.g., `` `Squad v0.5.3` ``)
2. `compareSemver()` correctly handles pre-release version suffixes like `-insiders`

## Status

✅ Milestone created
✅ Issue created and closed with fix explanation
✅ Ready for v0.5.3 release cycle

## Next Actions

- Include this issue in v0.5.3 release notes
- Reference fix in CHANGELOG.md v0.5.3 entry
