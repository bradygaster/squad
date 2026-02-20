# Decision: Issue #106 Guard Workflow Verification — `.squad/` Blocking Confirmed

**Date:** 2026-02-21  
**Owner:** Kobayashi (Git & Release Engineer)  
**Status:** RESOLVED — Guard already correct, no changes needed.

## Request

Verify that `squad-main-guard.yml` correctly blocks `.squad/` paths (in addition to `.ai-team/`) from being committed to `main`, `preview`, and `insider` branches following the v0.5.0 migration.

## Verification Performed

### File Audit
- ✅ `.github/workflows/squad-main-guard.yml` — scanned and verified
- ✅ `templates/workflows/squad-main-guard.yml` — scanned and verified (byte-for-byte identical to repo copy)

### Logic Verification

**Forbidden paths check (line 78):**
```javascript
if (f === '.ai-team' || f.startsWith('.ai-team/') || f === '.squad' || f.startsWith('.squad/')) return true;
```
- ✅ Both `.ai-team/` and `.squad/` paths blocked
- ✅ Both directory root and subdirectories covered (e.g., `.squad/team.md`, `.squad/agents/`)
- ✅ No exceptions or whitelist entries

**Deletion handling (line 74):**
```javascript
.filter(f => f.status !== 'removed')
```
- ✅ Files with status='removed' are filtered OUT before path check
- ✅ Deletions are allowed (users can remove these files from protected branches)
- ✅ Additions and modifications of forbidden paths are blocked

**Error messaging:**
- ✅ Line 98: References both `.ai-team/` and `.squad/` as "runtime team state"
- ✅ Line 114: Fix instructions include `git rm --cached -r .squad/` 
- ✅ Line 124: Warning message mentions both directories

### Branch Coverage
- ✅ Guard triggers on PR to `main`, `preview`, `insider`
- ✅ Guard triggers on push to `main`, `preview`, `insider`
- ✅ Both PR and push events covered

### Template Sync
- ✅ No drift between `.github/workflows/squad-main-guard.yml` and `templates/workflows/squad-main-guard.yml`
- ✅ Both files contain identical `.squad/` blocking logic

## Conclusion

**VERDICT: Guard workflow is correct. No changes required.**

The v0.5.0 migration PRs (specifically PR #109 "workflow dual-path support") successfully updated both copies of the guard workflow to block `.squad/` paths alongside the legacy `.ai-team/` paths. The blocking logic is sound, deletions are properly permitted, and both the repo copy and the template copy are in sync.

**What this means for v0.5.0:**
- Users upgrading from v0.4.x to v0.5.0 will find `.squad/` directory blocked from main/preview/insider by guard (same enforcement as `.ai-team/`)
- Migration tool can confidently move state from `.ai-team/` to `.squad/` knowing guard has parity
- Template users (new installs) get dual-path support automatically
- Deletion of either directory from protected branches is allowed (cleanup workflow paths)

**No action required.** Issue #106 can be closed as verified.
