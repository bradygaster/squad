# Decision: Release Process Skill Update — v0.9.4 Learnings

**Author:** Booster (CI/CD Engineer)
**Date:** 2026-04-25
**Status:** Implemented
**Requested by:** Brady

## Summary

Updated both release-process skill files with critical learnings from the v0.9.4 release session. The v0.9.4 release was delayed by three distinct issues, each fixed by a separate PR.

## Changes Made

### Files Updated
1. `.squad/skills/release-process/SKILL.md` (team-level skill)
2. `.copilot/skills/release-process/SKILL.md` (copilot-level skill)
3. `.squad/agents/booster/history.md` (learnings log)

### New Knowledge Added

| Issue | Root Cause | Fix PR | Skill Section |
|-------|-----------|--------|---------------|
| Root package.json version drift | squad-release.yml reads from root, not sub-packages | #1043 | Known Gotchas + v0.9.4 Incident Learnings |
| CHANGELOG missing `## [$VERSION]` | Workflow validates version entry exists | #1042 | Known Gotchas + Release Checklist |
| Lockfile integrity check rejects workspace packages | Check didn't filter for registry-only packages | #1044 | Known Gotchas + Common Failure Modes |
| GITHUB_TOKEN can't trigger downstream workflows | GitHub security feature prevents event propagation | N/A (design) | GITHUB_TOKEN section + Manual Publish |
| Prebuild bump breaks workspace linking | bump-build.mjs mutates versions breaking exact match | N/A (known) | Local Development section |

### Cross-References
- Added bidirectional cross-references between team-level and copilot-level skill files
- Added PR references (#1042, #1043, #1044) as source evidence throughout

## Rationale

These are high-impact, recurring failure modes. Documenting them in the skill files ensures every agent (human or AI) working on releases has the knowledge to avoid repeating the v0.9.4 delays. The GITHUB_TOKEN limitation in particular is non-obvious and would catch any future release.
