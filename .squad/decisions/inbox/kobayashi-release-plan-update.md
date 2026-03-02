# Release Plan Update — npm-only Distribution & Semver Fix (#692)

**Status:** DECIDED
**Decided by:** Kobayashi (Git & Release)
**Date:** 2026-03-01T14:22Z
**Context:** Brady's two strategic decisions on distribution and versioning

## Decisions

### 1. NPM-Only Distribution
- **What:** End GitHub-native distribution (`npx github:bradygaster/squad`). Install exclusively via npm registry.
- **How:** Users install via `npm install -g @bradygaster/squad-cli` (global) or `npx @bradygaster/squad-cli` (per-project).
- **Why:** Simplified distribution, centralized source of truth, standard npm tooling conventions.
- **Scope:** Affects all future releases, all external documentation, and CI/CD publish workflows.
- **Owners:** Rabin (docs), Fenster (scripts), all team members (update docs/sample references).

### 2. Semantic Versioning Fix (#692)
- **Problem:** Versions were `X.Y.Z.N-preview` (four-part with prerelease after), which violates semver spec.
- **Solution:** Correct format is `X.Y.Z-preview.N` (prerelease identifier comes after patch, before any build metadata).
- **Examples:**
  - ❌ Invalid: `0.8.6.1-preview`, `0.8.6.16-preview`
  - ✅ Valid: `0.8.6-preview.1`, `0.8.6-preview.16`
- **Impact:** Affects all version strings going forward (package.json, CLI version constant, release tags).
- **Release sequence:** 
  1. Pre-release: `X.Y.Z-preview.1`, `X.Y.Z-preview.2`, ...
  2. At publish: Bump to `X.Y.Z`
  3. Post-publish: Bump to `{next}-preview.1` (reset counter)

### 3. Version Continuity
- **Transition:** Public repo ended at `0.8.5.1`. Private repo continues at `0.8.6-preview` (following semver format).
- **Rationale:** Clear break between public (stable) and private (dev) codebases while maintaining version history continuity.

## Implementation

- ✅ **CHANGELOG.md:** Added "Changed" section documenting distribution channel and semver fix.
- ✅ **Charter (Kobayashi):** Updated Release Versioning Sequence with corrected pattern and phase description.
- ✅ **History (Kobayashi):** Logged decision with rationale and scope.

## Dependent Work

- **Fenster:** Ensure `bump-build.mjs` implements X.Y.Z-preview.N pattern (not X.Y.Z.N-preview).
- **Rabin:** Update README, docs, and all install instructions to reflect npm-only distribution.
- **All:** Use corrected version format in release commits, tags, and announcements.

## Notes

- Zero impact on functionality — this is purely distribution and versioning cleanup.
- Merge drivers on `.squad/agents/kobayashi/history.md` ensure this decision appends safely across parallel branches.
- If questions arise about versioning during releases, refer back to Charter § Release Versioning Sequence.
