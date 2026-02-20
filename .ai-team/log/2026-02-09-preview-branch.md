# Session Log: Preview Branch Release Pipeline

**Date:** 2026-02-09
**Requested by:** Brady
**Agent:** Kobayashi

## What Happened

- Designed and implemented a preview branch step in the release workflow
- Split `.github/workflows/release.yml` into a two-phase pipeline:
  - **Phase 1 (preview):** Runs tests, validates version, builds filtered product files, pushes to `preview` branch
  - **Phase 2 (ship):** Validates preview branch content against allowlist, pushes to main, tags, creates GitHub Release
- Both phases triggered via `workflow_dispatch` with `action` choice (preview/ship) and version string
- `KEEP_FILES` and `KEEP_DIRS` allowlists defined once as workflow-level env vars (DRY)
- Updated `team-docs/release-process.md` with new mermaid flow diagram and step-by-step documentation

## Outcomes

- 92 tests passing, no breakage
- Brady now has a human review checkpoint: `git checkout preview` to inspect exactly what ships before it hits main
