# Decision: PR #21 Review — Identity Hardening + Kickstart Sync

**By:** Flight (Lead)
**Date:** 2026-04-20
**PR:** #21 (squad/identity-quick-wins → dev)
**Author:** EECOM
**Status:** CHANGES REQUESTED

## Verdict

Request changes — two blocking issues, otherwise excellent implementation.

## Blocking Issues

### 1. Changeset package name mismatch
`.changeset/identity-hardening.md` uses `"@squad/sdk"` and `"@squad/cli"` instead of `'@bradygaster/squad-sdk'` and `'@bradygaster/squad-cli'`. All other changesets in the PR use the correct names. This changeset will be silently ignored during version bump.

### 2. Stale template copies
Only `packages/squad-cli/templates/scripts/resolve-token.mjs` has the hardened 283-line version. Three other copies (`templates/`, `packages/squad-sdk/templates/`, `.squad-templates/`) still have the old 224-line version lacking timeout, PEM validation, --required flag, mock hook, and ESM guard.

## Findings Status

All 13 claimed findings verified in SDK + CLI template:
- sync #1 resolveTokenWithDiagnostics ✅
- sync #2 --required flag ✅ (CLI template only)
- sync #3 isCliInvocation ✅ (CLI template only)
- sync #5 partial env detection ✅
- sync #6 scribe role ✅
- sync #7 execWithRoleToken dead catch ✅
- H-01 AbortController timeout ✅
- H-02 PEM validation ✅ (CLI template only)
- H-04 error taxonomy ✅
- H-05 mode 0o600 ✅
- H-06 .gitignore auto-append ✅
- H-07 SQUAD_IDENTITY_MOCK ✅
- H-08 nowOverride ✅

## Test Results

142 tests, 12 files, all green. Strong failure-path coverage.

## Next Steps

EECOM fixes two blockers (5-minute each), Flight re-reviews, Ahmed decides on merge.
