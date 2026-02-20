# Kobayashi: v0.5.0 PR Merge Summary

**Date:** 2026-02-21  
**Operator:** Kobayashi (Git & Release Engineer)  
**Task:** Merge 5 open PRs into `dev` in dependency order

## Merge Sequence & Results

All 5 PRs merged successfully into `dev` and automatically closed.

### 1. **PR #112** — Move .ai-team-templates/ to .squad/templates/ (#104)
- **Status:** ✅ MERGED
- **Branch:** `squad/104-merge-ai-team-templates`
- **Commit:** `a1ee8c5`
- **Files Changed:** 
  - Created `.squad/templates/` with 21 format guide files
  - Updated `index.js` to copy templates to new location
  - Removed `.ai-team-templates/` from `.npmignore`
- **Notes:** No conflicts. This PR creates the directory structure that PRs #111 and #113 depend on.

### 2. **PR #111** — CLI dual-path support for .squad/ migration (#101)
- **Status:** ✅ MERGED
- **Branch:** `squad/101-cli-dual-path-squad-migration`
- **Commit:** `08e29f8`
- **Files Changed:**
  - `index.js`: Added `detectSquadDir()` helper, dual-path detection, deprecation warning
  - `index.js`: Implemented `squad upgrade --migrate-directory` command
- **Notes:** No conflicts. Implements core CLI logic for `.squad/` / `.ai-team/` dual-path support.

### 3. **PR #110** — Scrub email addresses from .squad/ files during migration (#108)
- **Status:** ✅ MERGED
- **Branch:** `squad/108-email-privacy-scrub`
- **Commit:** `b4ebe48`
- **Files Changed:**
  - `index.js`: Added `scrubEmailsFromDirectory()` function for privacy hardening
  - `index.js`: Added `squad scrub-emails [directory]` CLI command
  - Implemented v0.5.0 migration that auto-scrubs emails
- **Notes:** No conflicts. Provides privacy hardening as part of upgrade process.

### 4. **PR #109** — Workflow dual-path support for .squad/ migration (#103)
- **Status:** ✅ MERGED
- **Branch:** `squad/103-workflow-dual-path`
- **Commit:** `74914ee`
- **Files Changed:**
  - 6 workflows in `.github/workflows/` and `templates/workflows/`:
    - `squad-main-guard.yml`
    - `squad-preview.yml`
    - `squad-heartbeat.yml`
    - `squad-triage.yml`
    - `squad-issue-assign.yml`
    - `sync-squad-labels.yml`
  - Each workflow now: checks `.squad/` first, falls back to `.ai-team/`
  - Guard workflow blocks both `.squad/**` and `.ai-team/**` from main/preview
- **Notes:** No conflicts. Critical for workflow safety during migration.

### 5. **PR #113** — Update .ai-team/ references to .squad/ in docs and tests (#105)
- **Status:** ✅ MERGED (with conflict resolution)
- **Branch:** `squad/102-agent-md-path-migration`
- **Commit:** `ab41e83`
- **Files Changed:**
  - `README.md`: Updated 7 references to `.squad/`
  - `CONTRIBUTING.md`: Updated 9 references
  - `test/init-flow.test.js`: Updated 3 assertions
  - `test/plugin-marketplace.test.js`: Updated 2 assertions
  - `docs/migration/v0.5.0-squad-rename.md`: Comprehensive migration guide
- **Conflict:** 6 workflow files (same as PR #109)
  - **Resolution:** Kept PR #109 versions (which include fallback logic)
  - PR #109's dual-path implementation is more robust than PR #113's simplified version
- **Notes:** After merge, discovered missing `.squad/` path support in `index.js` plugin section → fixed in follow-up commit

### Follow-up Fix

**Commit:** `bf7b86a`  
**Issue:** Plugin marketplace command was still using hardcoded `.ai-team/` path instead of `detectSquadDir()`  
**Root Cause:** PR #113 updated tests to expect `.squad/plugins/marketplaces.json`, but PR #111's fix was incomplete  
**Fix:** Changed line 370 in `index.js` to use `detectSquadDir(dest)` instead of hardcoded `.ai-team/`  
**Result:** All 53 tests pass ✅

## Merge Order Rationale

The sequence was chosen to minimize conflicts and ensure logical dependencies:

1. **PR #112 first** — Creates `.squad/templates/` directory needed by later PRs
2. **PR #111 second** — Implements CLI detection and migration logic (core feature)
3. **PR #110 third** — Privacy hardening, independent of others
4. **PR #109 fourth** — Updates workflows (many files, high conflict risk if done before #113)
5. **PR #113 last** — Docs/tests update (references updated code)

This ordering placed the most "system-changing" PRs first, allowing subsequent PRs to build cleanly.

## Test Results

- **Pre-merge:** 53/53 tests pass on base dev
- **After PR #112:** Tests not re-run (merged cleanly)
- **After PR #111:** Tests not re-run (merged cleanly)
- **After PR #110:** Tests not re-run (merged cleanly)
- **After PR #109:** Tests not re-run (merged cleanly)
- **After PR #113 (with workflow conflict resolution):** 1 test failure
  - `marketplace state persists in .squad/plugins/marketplaces.json` — expected `.squad/` but code still used `.ai-team/`
- **After follow-up fix:** **ALL 53 TESTS PASS** ✅

## Conflict Patterns Observed

1. **`.ai-team/decisions.md` divergence** — NOT a problem
   - All PRs modified this file with independent changes
   - Git auto-merged cleanly because changes didn't overlap
   - File tracks development state (transient), not release artifacts

2. **Workflow file conflicts (PR #109 vs PR #113)** — Expected, resolved cleanly
   - Both PRs modified the same 6 workflow files
   - PR #109 implemented dual-path fallback: `.squad/` → `.ai-team/`
   - PR #113 simplified to `.squad/` only
   - Resolution: Kept PR #109 (more robust for mixed v0.4.1/v0.5.0 environments)

3. **Missing path update in plugin section** — Found post-merge
   - PR #113 updated test assertions but PR #111's implementation was incomplete
   - Fixed with targeted 1-line change + follow-up test run

## State After All Merges

**Branch:** `dev`  
**Commits ahead of origin:** 0 (pushed and synced)  
**Tests:** 53/53 pass ✅  
**All 5 v0.5.0 PRs:** Closed ✅

### Files Modified in This Session

```
index.js                                      — 2 lines changed
.github/workflows/[6 workflow files]         — Dual-path support
templates/workflows/[6 workflow files]       — Template sync
test/init-flow.test.js                       — Path assertion updates
test/plugin-marketplace.test.js              — Path assertion updates
CONTRIBUTING.md                              — Doc references
README.md                                    — Doc references
docs/migration/v0.5.0-squad-rename.md       — New migration guide
.squad/templates/[21 files]                  — Moved from .ai-team-templates/
```

## Key Learnings

1. **Dual-path migrations are mergeable** — Even though workflows and docs reference different paths, git merges cleanly if conflicts are resolved correctly. The migration works because code detects which path exists at runtime.

2. **Test-driven merge validation** — The test failure after PR #113 caught an incomplete implementation in PR #111. Always run tests after merging multi-PR features.

3. **Template sync invariant is critical** — All 6 workflows exist in both `.github/workflows/` and `templates/workflows/`. A single missed file would break consumer repo upgrades. Both PRs #109 and #113 maintained this correctly.

4. **Deprecation warnings reduce version skew risk** — The `showDeprecationWarning()` tells users v0.4.1 → v0.5.0 is a one-way upgrade. This simplifies the merge strategy (no need to support mixed versions after v0.5.0 ships).

5. **Forward-only migrations scale** — Brady's constraint (no v0.4.2 backport, v0.5.0 is forward-only) made these 5 PRs mergeable without complex compatibility logic.

---

**Signed:** Kobayashi, Git & Release Engineer  
**Time:** ~45 minutes (analysis, merging, conflict resolution, testing, documentation)
