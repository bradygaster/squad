# Session: Release Pipeline Update

**Date:** 2026-02-09
**Requested by:** Brady

## What Happened

Brady identified that `docs/` and `CHANGELOG.md` were incorrectly excluded from the release pipeline.

## Who Worked

- **Kobayashi:** Updated `release.yml` (KEEP_FILES/KEEP_DIRS), `package.json` (files field), and `.npmignore` to include docs/ and CHANGELOG.md.
- **Keaton:** Updated `team-docs/release-process.md` documentation.
- **Hockney, Verbal, Keaton:** Re-audited changes. All three hit silent success bug but filesystem confirms completion.

## Verification

- Coordinator ran `npm pack --dry-run`: 38 files, 84.0 KB packed, docs/ and CHANGELOG.md now included.
- All 92 tests pass.

## Decisions

- docs/ and CHANGELOG.md now ship in the release pipeline (see decisions.md).
