# CI/CD & GitOps Improvement PRD

**Authors:** Keaton (Lead) — synthesized from audits by Trejo (Release Manager) and Drucker (CI/CD Engineer)  
**Date:** 2026-03-07  
**Status:** Draft  
**Related:** [v0.8.22 Retrospective](../../.squad/decisions/inbox/keaton-v0822-retrospective.md), [Release Process Skill](../../.squad/skills/release-process/SKILL.md)

---

## Executive Summary

The v0.8.22 release was **the worst release in Squad history**. A 4-part semver (0.8.21.4) was committed without validation, mangled by npm into 0.8.2-1.4, and published to the registry. The `latest` dist-tag pointed to a phantom version for 6+ hours. Draft releases didn't trigger CI. User tokens with 2FA failed with EOTP errors 5+ times. The disaster exposed systemic gaps in our CI/CD infrastructure.

This PRD consolidates findings from two comprehensive audits — Trejo's GitOps/release process audit (27KB) and Drucker's CI/CD pipeline audit (29KB) — into a single actionable plan. The goal: make our release pipeline **disaster-proof** through validation gates, automation, and defense-in-depth.

**Current State:**
- ✅ **Working:** Manual release runbook exists, retry logic in publish.yml, main branch protected
- 🟡 **Fragile:** squad-release.yml blocked by test failures (9+ consecutive runs failed), bump-build.mjs still mutates versions during npm ci, multiple overlapping/redundant workflows
- ❌ **Missing:** Semver validation gates, dev branch protection, pre-publish checklists in CI, NPM_TOKEN type verification, rollback automation

**Bottom Line:** We're one bad commit away from another v0.8.22-style incident. This PRD prioritizes fixes that directly prevent release failures, followed by hardening and operational improvements.

---

## Problem Statement

### What Went Wrong During v0.8.22

The v0.8.22 release disaster was a **cascade of validation gaps**:

1. **Invalid semver committed:** `bump-build.mjs` ran 4 times during debugging, mutating version from 0.8.21 → 0.8.21.4 (4-part version, NOT valid semver). Kobayashi committed this without validation.
2. **npm mangled the version:** npm's parser misinterpreted 0.8.21.4 as major.minor.patch-prerelease, publishing it as **0.8.2-1.4** to the registry. The `latest` dist-tag pointed to this phantom version for 6+ hours.
3. **Draft release didn't trigger CI:** GitHub Release was created as DRAFT, which doesn't fire the `release: published` event. publish.yml never ran automatically.
4. **Wrong NPM_TOKEN type:** NPM_TOKEN was a User token with 2FA enabled, causing EOTP (one-time password) errors 5+ times during CI. Automation tokens don't require 2FA.
5. **No validation gates anywhere:** No pre-commit hooks, no CI checks, no squad-release.yml gates. Invalid versions sailed through to production.

### Why Our Current CI/CD is Fragile

Beyond v0.8.22, broader systemic issues exist:

**Broken Infrastructure:**
- **squad-release.yml is completely blocked:** 9+ consecutive failures due to ES module syntax errors in tests (`require()` instead of `import` with `"type": "module"`). Releases from main cannot ship.
- **squad-ci.yml has flaky tests:** 12 failing tests in `human-journeys.test.ts`. CI failures are normalized, reducing confidence.
- **bump-build.mjs CI detection ineffective:** Despite `CI=true` check, the script ran during Trejo's audit, creating 0.8.22.1. Version mutation during CI is unpredictable.

**Branch & Process Gaps:**
- **dev branch unprotected:** Primary integration branch allows direct commits and force pushes, bypassing PR review and CI checks.
- **Branch naming inconsistency:** Both `insider` and `insiders` branches exist; workflows reference `insider` but active development uses `insiders`.
- **Stale dist-tags mislead users:** `preview` points to 0.8.17-preview (pre-disaster), `insider` points to 0.6.0-alpha.0 (ancient).
- **No preview branch:** squad-promote.yml and squad-preview.yml reference a `preview` branch that doesn't exist — dead code or incomplete implementation.

**Publish Pipeline Gaps:**
- **No semver validation:** Nothing prevents 4-part versions (X.Y.Z.N) from being committed or published.
- **No NPM_TOKEN type check:** User tokens with 2FA will still fail with EOTP errors.
- **No dry-run step:** package.json issues aren't caught until real publish.
- **No SKIP_BUILD_BUMP enforcement:** bump-build.mjs could run during release builds despite `CI=true`.
- **No rollback automation:** v0.8.22 rollback took 9 manual steps over 6+ hours.

**Workflow Redundancy:**
- **Duplicate publish workflows:** publish.yml and squad-publish.yml may overlap (same workflow ID suggests rename).
- **Deprecated files not deleted:** squad-publish.yml.deprecated still exists.
- **Unclear insider publish flow:** squad-insider-publish.yml exists but unclear if it runs or to which npm dist-tag.

---

## Prioritized Work Items

### P0: Must Fix Before Next Release (Ship Blockers)

#### 1. Fix squad-release.yml Test Failures ❌ **BLOCKING ALL RELEASES**
**Problem:** 9+ consecutive workflow failures. 8 test files use `require('node:test')` in ES module context.  
**Impact:** Releases from main are completely blocked. Emergency hotfixes cannot ship.  
**Source:** Drucker audit (workflow analysis)  
**Effort:** **S** (1-2 hours)  
**Fix:** Update test files to use ES module syntax:
```javascript
// OLD: const { describe, it } = require('node:test');
// NEW: import { describe, it } from 'node:test';
```
**Alternative:** Use Vitest (already configured) instead of node:test.  
**Dependencies:** None — unblocks all other release work.

---

#### 2. Add Semver Validation to publish.yml ❌ **CRITICAL**
**Problem:** 4-part versions (X.Y.Z.N) can reach npm and get mangled. Root cause of v0.8.22 disaster.  
**Impact:** Invalid semver breaks `latest` dist-tag, requires rollback, confuses customers.  
**Source:** Both audits (Drucker: Gap 1, Trejo: P0 item #4)  
**Effort:** **S** (30 minutes)  
**Fix:**
```yaml
- name: Validate semver format
  run: |
    VERSION="${{ steps.version.outputs.version }}"
    if ! semver "$VERSION" > /dev/null 2>&1; then
      echo "❌ Invalid semver: $VERSION"
      echo "Only 3-part versions (X.Y.Z) or prerelease (X.Y.Z-tag.N) are valid."
      echo "4-part versions (X.Y.Z.N) are NOT valid semver and will be mangled by npm."
      exit 1
    fi
    echo "✅ Valid semver: $VERSION"
```
**Dependencies:** None.

---

#### 3. Fix bump-build.mjs to Use Valid Semver ❌ **CRITICAL**
**Problem:** Non-prerelease format creates 4-part versions (0.8.22 → 0.8.22.1 = invalid semver). Direct cause of v0.8.22 disaster.  
**Impact:** Repeat disaster if version isn't a prerelease and SKIP_BUILD_BUMP isn't set.  
**Source:** Drucker audit (scripts analysis, P0 item #4)  
**Effort:** **S** (30 minutes)  
**Fix:** For non-prerelease versions, use `-build.N` suffix:
```javascript
function formatVersion({ base, build, prerelease }) {
  if (prerelease) {
    // Prerelease: 0.8.6-preview.1 (valid semver)
    return `${base}${prerelease}.${build}`;
  }
  // Non-prerelease: 0.8.22-build.1 (valid semver)
  // NOT 0.8.22.1 (invalid — 4-part version)
  return `${base}-build.${build}`;
}
```
**Dependencies:** None.

---

#### 4. Enforce SKIP_BUILD_BUMP in publish.yml ❌ **CRITICAL**
**Problem:** bump-build.mjs could create 4-part versions during release builds. CI=true check is insufficient (Trejo's audit saw version mutation despite CI=true).  
**Impact:** Same as v0.8.22 disaster — invalid semver reaches npm.  
**Source:** Both audits (Drucker: Gap 4 & Gap 5, Trejo: P0 item #2)  
**Effort:** **S** (30 minutes)  
**Fix:**
```yaml
jobs:
  publish-sdk:
    env:
      SKIP_BUILD_BUMP: "1"
    steps:
      - name: Verify SKIP_BUILD_BUMP is set
        run: |
          if [ "$SKIP_BUILD_BUMP" != "1" ]; then
            echo "❌ SKIP_BUILD_BUMP must be set to 1 for release builds"
            exit 1
          fi
          echo "✅ SKIP_BUILD_BUMP is set"
      
      - name: Build squad-sdk
        run: npm -w packages/squad-sdk run build
        env:
          SKIP_BUILD_BUMP: "1"
```
**Dependencies:** Requires bump-build.mjs fix (item #3) for full protection.

---

#### 5. Protect dev Branch ❌ **CRITICAL**
**Problem:** dev branch is NOT protected (404 from GitHub API). Direct commits bypass PR review and CI checks.  
**Impact:** Unreviewed code reaches main (dev is integration branch). No tests, no approval gates.  
**Source:** Both audits (Trejo: P0 item #2 & Section 8, Drucker: implied)  
**Effort:** **S** (10 minutes via GitHub UI)  
**Fix:** Apply same protection rules as main:
- Require 1 approval for PRs
- Require "Squad CI" status check (tests must pass)
- Require conversation resolution
- Disable force pushes and deletions
- Enable `enforce_admins: true`  
**Dependencies:** None.

---

### P1: Fix Within 2 Releases (Hardening & Risk Mitigation)

#### 6. Add NPM_TOKEN Existence Check to publish.yml ⚠️
**Problem:** Missing or misconfigured token causes cryptic errors. Wrong token type (User with 2FA) causes EOTP failures.  
**Impact:** Delayed releases, wasted CI time, human intervention required. Caused 5+ failures in v0.8.22.  
**Source:** Drucker audit (Gap 2)  
**Effort:** **S** (15 minutes)  
**Fix:**
```yaml
- name: Verify NPM_TOKEN is configured
  run: |
    if [ -z "${{ secrets.NPM_TOKEN }}" ]; then
      echo "❌ NPM_TOKEN secret is not set"
      exit 1
    fi
    echo "⚠️ Ensure NPM_TOKEN is an Automation token (not User token with 2FA)"
    echo "User tokens will fail with EOTP error (one-time password required)."
    echo "To create: https://www.npmjs.com/settings/{user}/tokens → Automation"
```
**Note:** Full token type verification requires authenticated npm CLI (P2 enhancement).  
**Dependencies:** None.

---

#### 7. Add Dry-Run Step to publish.yml ⚠️
**Problem:** package.json issues (missing files, invalid metadata) aren't caught until real publish.  
**Impact:** Publish fails after build completes, wasting time and requiring rollback.  
**Source:** Drucker audit (Gap 3)  
**Effort:** **S** (10 minutes)  
**Fix:**
```yaml
- name: Dry-run publish (catch package.json issues)
  run: npm -w packages/squad-sdk publish --dry-run --access public
```
**Dependencies:** None.

---

#### 8. Fix squad-ci.yml Test Failures (human-journeys.test.ts) ⚠️
**Problem:** 12 failing tests related to CLI command handling. Flaky CI undermines confidence.  
**Impact:** PRs may merge with broken tests. Normalizes failures ("it's always red").  
**Source:** Drucker audit (workflow #3)  
**Effort:** **M** (2-4 hours investigation + fix)  
**Fix:** Investigate CLI error handling, fix tests or implementation to match expected behavior.  
**Dependencies:** None.

---

#### 9. Resolve insider/insiders Branch Naming ⚠️
**Problem:** Both `insider` and `insiders` branches exist. Workflows reference `insider`, team uses `insiders`.  
**Impact:** Confusion, potential workflow failures.  
**Source:** Trejo audit (Section 1, P1 item #2)  
**Effort:** **S** (30 minutes)  
**Fix:**
1. Choose canonical name (recommend `insiders` to match npm dist-tag convention)
2. Delete unused branch
3. Update all workflow references (squad-ci.yml, squad-insider-*.yml)  
**Dependencies:** None.

---

#### 10. Preview Branch Decision ⚠️
**Problem:** squad-promote.yml and squad-preview.yml reference a `preview` branch that doesn't exist.  
**Impact:** Dead code wastes CI resources, confuses contributors.  
**Source:** Both audits (Trejo: Section 1 & 7, Drucker: workflow #10)  
**Effort:** **S** (decision) or **M** (implementation if keeping)  
**Options:**
- **Option A:** Implement preview branch as documented (dev → preview → main with .squad/ stripping)
- **Option B:** Remove preview workflows if not part of release model  
**Recommendation:** Remove workflows. Three-branch model (dev/insiders/main) is sufficient.  
**Dependencies:** Brady decision required.

---

#### 11. Apply Validation Fixes to squad-insider-publish.yml ⚠️
**Problem:** Same validation gaps as publish.yml (no semver check, no SKIP_BUILD_BUMP, no dry-run).  
**Impact:** Insider builds can fail with same issues as main releases.  
**Source:** Drucker audit (workflow #6, P1 item #8)  
**Effort:** **S** (copy fixes from publish.yml)  
**Fix:** Apply items #2, #4, #6, #7 to squad-insider-publish.yml.  
**Dependencies:** Must complete P0 items #2-#4 first.

---

#### 12. Clarify squad-publish.yml vs. publish.yml ⚠️
**Problem:** Two workflows with overlapping triggers (tag-based vs. release-based). Same workflow ID suggests rename/duplication.  
**Impact:** Confusion about which workflow is canonical. Duplicate CI runs waste resources.  
**Source:** Both audits (Trejo: Section 7, Drucker: workflow #12)  
**Effort:** **S** (1 hour investigation + cleanup)  
**Fix:**
1. Audit: Are these duplicates or do they serve different purposes?
2. Check `.github/workflows/squad-publish.yml.deprecated` history
3. **Recommendation:** Delete squad-publish.yml (use publish.yml as canonical)  
**Dependencies:** Requires Trejo investigation.

---

#### 13. Add Pre-Publish Checklist CI Job ⚠️
**Problem:** Manual checklist from SKILL.md is not enforced. Human error possible.  
**Impact:** Release process gaps (version mismatches, CHANGELOG missing, tag conflicts).  
**Source:** Trejo audit (Section 5, P1 item #3)  
**Effort:** **M** (2-3 hours)  
**Fix:** Create `pre-release-checks.yml` workflow that validates:
1. All 3 package.json versions match
2. Version is valid semver
3. Version exists in CHANGELOG.md with release notes
4. Tag doesn't already exist (git ls-remote)
5. Version not already published to npm (npm view)  
Make this a required status check on main branch.  
**Dependencies:** None.

---

#### 14. Update Dist-Tag Hygiene ⚠️
**Problem:** Stale dist-tags mislead users (`preview` → 0.8.17-preview, `insider` → 0.6.0-alpha.0).  
**Impact:** Users trying preview/insider builds get ancient versions.  
**Source:** Trejo audit (Section 2, P1 item #4)  
**Effort:** **M** (policy decision + workflow updates)  
**Fix:** Define dist-tag update policy:
- `latest` → updated on stable release (currently working)
- `preview` → either publish dev snapshots or deprecate the tag
- `insider` → either publish insiders builds or deprecate the tag  
Audit and deprecate stale versions if channels abandoned.  
**Dependencies:** Requires Brady decision on preview/insider publishing strategy.

---

#### 15. Add Automated Rollback for Partial Publish Failures ⚠️
**Problem:** If SDK publishes but CLI fails, no automated rollback. Requires manual deprecation.  
**Impact:** Broken state (SDK published, CLI not). MTTR measured in hours (v0.8.22 = 6+ hours).  
**Source:** Drucker audit (P1 item #10)  
**Effort:** **M** (2-3 hours)  
**Fix:** Add rollback step to publish.yml that deprecates SDK version if CLI publish fails:
```yaml
- name: Deprecate SDK if CLI publish failed
  if: failure() && steps.publish-sdk.outcome == 'success'
  run: |
    VERSION="${{ steps.version.outputs.version }}"
    npm deprecate "@bradygaster/squad-sdk@$VERSION" "Automated rollback: CLI publish failed"
```
**Dependencies:** None.

---

### P2: Improve When Possible (Technical Debt & Quality of Life)

#### 16. Stale Branch Cleanup 🧹
**Problem:** Merged squad/* branches not deleted (squad/195, squad/223, squad/228, feature/squad-streams, etc.).  
**Impact:** Clutter, potential accidental rebasing.  
**Source:** Trejo audit (Section 1, P2 item #3)  
**Effort:** **S** (manual) or **M** (automation)  
**Fix:**
- **Immediate:** Manual cleanup of stale branches
- **Long-term:** GitHub Action to auto-delete branches after PR merge  
**Dependencies:** None.

---

#### 17. Tag Audit and Cleanup 🧹
**Problem:** Invalid semver tags exist (`v0.8.6.15-preview-insider+5664fd0` = 4-part), ambiguous tags (`v0.8.2`).  
**Impact:** Pollutes release history, confuses users.  
**Source:** Trejo audit (Section 3, P1 item #2)  
**Effort:** **S** (manual cleanup + docs)  
**Fix:**
1. Delete invalid tag `v0.8.6.15-preview-insider+5664fd0`
2. Clarify or delete `v0.8.2` (no release notes)
3. Document tag naming conventions in CONTRIBUTING.md  
**Dependencies:** None.

---

#### 18. Add Semver Tag Validation (Pre-Push Hook) 🔒
**Problem:** Invalid tags can be pushed (v0.8.21.4 from v0.8.22 disaster).  
**Impact:** Breaks npm publish.  
**Source:** Trejo audit (Section 3, P0 item #1)  
**Effort:** **M** (2-3 hours for pre-push hook + CI check)  
**Fix:**
- Pre-push hook: validate tag format with `semver.valid()` before allowing push
- CI check: fail if tag doesn't match `vMAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH-prerelease`  
**Dependencies:** None.

---

#### 19. Add Pre-Flight Validation Workflow 💡
**Problem:** No way to validate version is "publish-ready" before creating release.  
**Impact:** Releases fail after tag/release created, requiring rollback.  
**Source:** Drucker audit (missing automation #2)  
**Effort:** **M** (3-4 hours)  
**Fix:** Create `squad-pre-flight.yml` workflow (workflow_dispatch) that runs:
- Semver validation
- Version matches CHANGELOG
- All tests pass
- No .squad/ files on preview branch
- Dry-run publish succeeds  
**Dependencies:** None.

---

#### 20. Rollback Automation Workflow 🔧
**Problem:** Rollback is 9 manual steps per SKILL.md. v0.8.22 took 6+ hours.  
**Impact:** High MTTR during incidents.  
**Source:** Both audits (Trejo: Section 4 & 5, Drucker: implied)  
**Effort:** **M** (3-4 hours)  
**Fix:** Create `rollback.yml` workflow (workflow_dispatch):
- Inputs: version to roll back
- Steps: deprecate npm packages, delete GitHub Release, delete tag, open revert PR  
**Dependencies:** None.

---

#### 21. Workflow Documentation 📚
**Problem:** No README or diagram showing which workflows run when and dependencies.  
**Impact:** Onboarding friction, troubleshooting takes longer.  
**Source:** Both audits (Trejo: Section 7, Drucker: P1 item #9)  
**Effort:** **M** (2-3 hours)  
**Fix:** Create `.github/workflows/README.md` with:
- Workflow dependency graph
- Branch → workflow mapping
- Release flow diagram (dev → insiders, dev → main → npm)  
**Dependencies:** Requires clarity on insider publishing (item #14).

---

#### 22. Separate Dev Build from Release Build 🔧
**Problem:** `prebuild` script runs bump-build.mjs in all contexts. Confusing when it increments versions.  
**Impact:** npm ci isn't idempotent (mutates package.json). New contributors confused.  
**Source:** Trejo audit (Section 6, P1 item #2)  
**Effort:** **M** (2-3 hours)  
**Fix:** Create two npm scripts:
- `npm run build:dev` — runs bump-build.mjs, then esbuild
- `npm run build:release` — skips bump-build.mjs, runs esbuild only  
Update workflows to use `build:release`.  
**Dependencies:** None.

---

#### 23. Delete squad-publish.yml.deprecated 🧹
**Problem:** Deprecated file still exists, causes confusion.  
**Source:** Drucker audit (workflow #13)  
**Effort:** **XS** (1 minute)  
**Fix:** `rm .github/workflows/squad-publish.yml.deprecated`  
**Dependencies:** None.

---

#### 24. Re-Enable or Remove squad-heartbeat.yml Cron 🤔
**Problem:** Cron heartbeat disabled. Ralph automation mostly dormant.  
**Impact:** Issue triage relies on other workflows (squad-triage.yml).  
**Source:** Drucker audit (workflow #5, P2 item #12)  
**Effort:** **S** (decision) or **M** (implementation if re-enabling)  
**Options:**
- **Option A:** Re-enable cron once Ralph triage script is stable
- **Option B:** Remove workflow if redundant with squad-triage.yml  
**Recommendation:** Keep disabled until Ralph script stabilized.  
**Dependencies:** Ralph triage script maturity.

---

#### 25. Add Publish Pipeline Health Monitoring 💡
**Problem:** No proactive monitoring. Failures discovered during release attempts.  
**Impact:** Surprises during releases.  
**Source:** Drucker audit (missing automation #3)  
**Effort:** **M** (3-4 hours)  
**Fix:** Weekly scheduled workflow that runs:
- Dry-run publish + validation checks
- Posts status to Slack or creates GitHub Issue if failures detected  
**Dependencies:** None.

---

#### 26. Document NPM Token Rotation Schedule 📚
**Problem:** NPM_TOKEN can expire. No alerting.  
**Impact:** Surprise failures when token expires during release.  
**Source:** Drucker audit (missing automation #4)  
**Effort:** **S** (30 minutes)  
**Fix:** Add `docs/runbooks/npm-token-rotation.md` with:
- Token type requirements (Automation, not User)
- Expiry date tracking
- Rotation procedure  
**Dependencies:** None.

---

#### 27. Add CODEOWNERS for Critical Paths 🔒
**Problem:** No automatic reviewer assignment for critical files.  
**Impact:** Changes to workflows, package.json can merge without specialized review.  
**Source:** Trejo audit (Section 8, P2 item #6)  
**Effort:** **S** (30 minutes)  
**Fix:** Create `.github/CODEOWNERS`:
```
.squad/ @bradygaster
.github/workflows/ @bradygaster
packages/*/package.json @bradygaster
```
**Dependencies:** None.

---

#### 28. Require Commit Signing 🔒
**Problem:** Commits can be spoofed (no GPG/SSH verification).  
**Impact:** Security best practice.  
**Source:** Trejo audit (Section 8, P2 item #7)  
**Effort:** **S** (enable via GitHub UI)  
**Fix:** Enable `required_signatures: true` on main and dev branches.  
**Dependencies:** None.

---

#### 29. Enforce Admin Rules on Protected Branches 🔒
**Problem:** `enforce_admins: false` means admins can bypass all rules.  
**Impact:** Even admins can force-push to main, breaking release history.  
**Source:** Trejo audit (Section 8, P1 item #2)  
**Effort:** **S** (enable via GitHub UI)  
**Fix:** Set `enforce_admins: true` on main and dev.  
**Recommendation:** Emergency bypass via GitHub UI if needed (not via code).  
**Dependencies:** None.

---

## Architecture Decisions Required

### 1. Consolidate publish.yml and squad-publish.yml?

**Context:** Two workflows with overlapping triggers. Same workflow ID suggests rename/duplication.  
**Source:** Both audits (Trejo: Section 7, Drucker: workflow #12, work item #12)

**Options:**
- **A. Delete squad-publish.yml** (use publish.yml as canonical)
  - ✅ Simplifies CI, reduces confusion
  - ❌ Loses tag-based publish as fallback if release-based publish breaks
- **B. Keep both, document differences**
  - ✅ Redundancy if one path breaks
  - ❌ Duplicate CI runs, maintenance burden
- **C. Consolidate triggers into single workflow**
  - ✅ Single source of truth
  - ❌ More complex workflow logic

**Recommendation:** **Option A** (delete squad-publish.yml). publish.yml triggered by GitHub Releases is canonical. Tag-based publish as fallback adds complexity without clear value.

**Decision Owner:** Brady + Trejo

---

### 2. Delete or Fix squad-release.yml?

**Context:** squad-release.yml is broken (9+ consecutive failures). Manual release process via SKILL.md works.  
**Source:** Both audits (Drucker: workflow #2, P0 item #1)

**Options:**
- **A. Fix squad-release.yml** (update tests to ES modules)
  - ✅ Automation reduces human error
  - ❌ Test suite currently flaky, could block future releases
- **B. Delete squad-release.yml** (rely on manual runbook)
  - ✅ Removes failing CI, forces manual review
  - ❌ Loses automation, increases release friction
- **C. Bypass tests temporarily** (skip broken tests in workflow)
  - ✅ Unblocks releases immediately
  - ❌ Normalizes broken tests, hides real issues

**Recommendation:** **Option A** (fix squad-release.yml). Automation is valuable, test failures are fixable (ES module syntax). Work item #1 (P0) addresses this.

**Decision Owner:** Drucker

---

### 3. How Should bump-build.mjs Behave?

**Context:** bump-build.mjs creates 4-part versions for non-prerelease bases (0.8.22 → 0.8.22.1 = invalid). Direct cause of v0.8.22 disaster.  
**Source:** Both audits (Drucker: scripts analysis, Trejo: Section 6)

**Options:**
- **A. Use -build.N suffix for non-prerelease** (0.8.22 → 0.8.22-build.1 = valid)
  - ✅ Valid semver, safe
  - ❌ Unusual version format, might confuse users
- **B. Reject non-prerelease versions entirely** (exit with error)
  - ✅ Forces prerelease versions during dev
  - ❌ Breaks local dev workflow if version isn't prerelease
- **C. Remove bump-build.mjs entirely** (manual version bumps only)
  - ✅ Eliminates footgun
  - ❌ Loses auto-increment convenience during dev
- **D. Separate build scripts** (build:dev uses bump-build.mjs, build:release skips it)
  - ✅ Explicit separation, no ambiguity
  - ❌ More scripts to maintain

**Recommendation:** **Combination of A + D**. Fix bump-build.mjs to use `-build.N` suffix (work item #3), AND separate build scripts (work item #22). Defense-in-depth.

**Decision Owner:** Drucker + Keaton

---

### 4. Branch Protection Strategy for dev

**Context:** dev branch is unprotected. Should it match main's protection rules?  
**Source:** Both audits (Trejo: Section 1 & 8, P0 item #5)

**Options:**
- **A. Same rules as main** (1 approval, status checks, conversation resolution)
  - ✅ Consistent, prevents unreviewed code
  - ❌ Slows down iteration
- **B. Lighter rules** (status checks only, no approval)
  - ✅ Faster iteration
  - ❌ Allows unreviewed code to merge
- **C. No protection** (status quo)
  - ❌ Direct commits bypass CI, high risk

**Recommendation:** **Option A** (same rules as main). dev is the integration branch — unreviewed code in dev means unreviewed code in main. Work item #5 (P0) implements this.

**Decision Owner:** Brady + Keaton

---

### 5. Preview Branch Architecture

**Context:** squad-promote.yml and squad-preview.yml reference a `preview` branch that doesn't exist.  
**Source:** Both audits (Trejo: Section 1 & 7, Drucker: workflow #10, work item #10)

**Options:**
- **A. Implement preview branch** (dev → preview → main with .squad/ stripping)
  - ✅ Gate before stable release, test stripped state
  - ❌ Adds complexity, maintenance burden
- **B. Remove preview workflows** (use three-branch model: dev/insiders/main)
  - ✅ Simplifies release flow
  - ❌ Loses gate that validates .squad/ stripping

**Current State:** squad-promote.yml already supports dev → preview → main promotion with path stripping. preview branch just needs to be created.

**Recommendation:** **Option B** (remove preview workflows). Three-branch model is sufficient. If .squad/ stripping is critical, add validation to squad-release.yml that fails if .squad/ files are tracked on main.

**Decision Owner:** Brady + Trejo

---

## Implementation Phases

### Phase 1: Unblock Releases (1-2 days)
**Goal:** Make releases from main possible again.

- ✅ P0 Item #1: Fix squad-release.yml test failures (ES module syntax)
- ✅ P0 Item #5: Protect dev branch (GitHub UI, 5 minutes)

**Success Criteria:** squad-release.yml workflow succeeds, dev branch rejects direct commits.

---

### Phase 2: Disaster-Proof Publish Pipeline (2-3 days)
**Goal:** Prevent v0.8.22-style incidents.

- ✅ P0 Item #2: Add semver validation to publish.yml
- ✅ P0 Item #3: Fix bump-build.mjs to use valid semver
- ✅ P0 Item #4: Enforce SKIP_BUILD_BUMP in publish.yml
- ✅ P1 Item #6: Add NPM_TOKEN existence check
- ✅ P1 Item #7: Add dry-run step to publish.yml

**Success Criteria:** publish.yml rejects invalid semver, bump-build.mjs cannot create 4-part versions, dry-run catches package.json issues.

---

### Phase 3: Workflow Consolidation (3-5 days)
**Goal:** Remove redundancy and dead code.

- ✅ P1 Item #9: Resolve insider/insiders naming
- ✅ P1 Item #10: Preview branch decision (remove workflows)
- ✅ P1 Item #12: Clarify/consolidate squad-publish.yml
- ✅ P2 Item #23: Delete squad-publish.yml.deprecated
- ✅ P2 Item #16: Stale branch cleanup

**Success Criteria:** Single canonical publish workflow, no dead workflows, clear branch model.

---

### Phase 4: Hardening & Validation (5-7 days)
**Goal:** Add validation gates and hardening.

- ✅ P1 Item #8: Fix squad-ci.yml test failures
- ✅ P1 Item #11: Apply validation fixes to squad-insider-publish.yml
- ✅ P1 Item #13: Add pre-publish checklist CI job
- ✅ P1 Item #15: Add automated rollback for partial failures
- ✅ P2 Item #18: Add semver tag validation (pre-push hook)

**Success Criteria:** All CI tests pass, insider publish is hardened, pre-publish checklist enforced, rollback automation works.

---

### Phase 5: Operations & Documentation (3-5 days)
**Goal:** Improve operational visibility and documentation.

- ✅ P1 Item #14: Update dist-tag hygiene
- ✅ P2 Item #17: Tag audit and cleanup
- ✅ P2 Item #21: Workflow documentation
- ✅ P2 Item #22: Separate dev/release build scripts
- ✅ P2 Item #26: Document NPM token rotation

**Success Criteria:** Dist-tags accurate, workflow README published, build scripts separated.

---

### Phase 6: Quality of Life (Backlog)
**Goal:** Nice-to-haves and proactive monitoring.

- ✅ P2 Item #19: Add pre-flight validation workflow
- ✅ P2 Item #20: Rollback automation workflow
- ✅ P2 Item #25: Add publish pipeline health monitoring
- ✅ P2 Item #27: Add CODEOWNERS
- ✅ P2 Item #28: Require commit signing
- ✅ P2 Item #29: Enforce admin rules

**Success Criteria:** Pre-flight checks available, weekly health monitoring active, critical paths have code owners.

---

## Success Criteria

**Measurable Outcomes:**

1. **Zero Invalid Semver Incidents:** No 4-part versions reach npm for 6 months post-implementation.
2. **squad-release.yml Success Rate ≥ 95%:** No more than 1 failure per 20 runs (excluding transient GitHub/npm API issues).
3. **MTTR for Release Failures < 1 hour:** Rollback automation reduces time from 6+ hours (v0.8.22) to <1 hour.
4. **CI Confidence Restored:** squad-ci.yml and squad-release.yml pass consistently. No normalized failures.
5. **Zero Unprotected Critical Branches:** main AND dev protected with same rules.
6. **Publish Pipeline Defense-in-Depth:** At least 3 validation layers before npm publish (pre-commit validation, CI checks, publish.yml gates).

**Qualitative Outcomes:**

- **Runbook + Automation Alignment:** Every manual step in SKILL.md either automated or enforced via CI.
- **Contributor Confidence:** Contributors understand which workflows run when (via .github/workflows/README.md).
- **Release Confidence:** Releases ship without manual intervention, with automated rollback as safety net.

**Definition of Done:**

- All P0 items complete and deployed to main.
- At least 80% of P1 items complete within 2 releases.
- No outstanding critical vulnerabilities in CI/CD pipeline (validated via post-implementation audit).

---

## Appendix: Workflow Inventory

| Workflow | Purpose | Status | Priority |
|----------|---------|--------|----------|
| publish.yml | Publish to npm (release-based) | ⚠️ Needs hardening | P0 |
| squad-release.yml | Auto-create GitHub Release | ❌ Broken (tests) | P0 |
| squad-ci.yml | PR/push CI | ⚠️ Flaky tests | P1 |
| squad-docs.yml | Deploy docs to Pages | ✅ Working | — |
| squad-heartbeat.yml | Ralph auto-triage | ⚠️ Dormant (cron disabled) | P2 |
| squad-insider-publish.yml | Insider builds to npm | 🤔 Needs hardening | P1 |
| squad-insider-release.yml | Insider GitHub Releases | ✅ Working | — |
| squad-issue-assign.yml | Issue assignment | ✅ Working | — |
| squad-label-enforce.yml | Label mutual exclusivity | ✅ Working | — |
| squad-preview.yml | Preview validation | ❓ Dead code? | P1 |
| squad-promote.yml | Branch promotion | ✅ Working | — |
| squad-publish.yml | Tag-based publish | ❓ Redundant? | P2 |
| squad-publish.yml.deprecated | — | ❌ Stale | P2 |
| squad-triage.yml | Initial squad triage | ✅ Working | — |
| sync-squad-labels.yml | Sync squad labels | ✅ Working | — |

**Total:** 15 workflows  
**Working:** 8 ✅ | **Needs hardening:** 3 ⚠️ | **Broken:** 1 ❌ | **Unclear/Redundant:** 3 ❓

---

## Notes & Tradeoffs

### Trejo vs. Drucker Perspectives

**Where they agree:**
- squad-release.yml is broken and blocking releases
- Semver validation is critical (P0)
- bump-build.mjs is a footgun and caused v0.8.22
- dev branch needs protection
- Preview branch workflows are dead code or incomplete
- Workflow documentation is missing

**Where they differ:**

1. **Test Failures Priority:**
   - Trejo: Fix tests to unblock releases (P0)
   - Drucker: Fix tests to restore CI confidence (P0)
   - **Resolution:** Both agree it's P0, same fix.

2. **bump-build.mjs Approach:**
   - Trejo: Focus on CI detection (why did CI=true fail?)
   - Drucker: Focus on script format (fix to use -build.N suffix)
   - **Resolution:** Do both (work items #3 and #4).

3. **Workflow Consolidation Timing:**
   - Trejo: P1 priority (cleanup after critical fixes)
   - Drucker: P2 priority (housekeeping)
   - **Resolution:** P1 (reduces confusion during implementation).

4. **Rollback Automation:**
   - Trejo: P2 (nice-to-have)
   - Drucker: P1 (reduces MTTR)
   - **Resolution:** P1 (v0.8.22 took 6+ hours; automation is high-value).

### Key Tradeoffs

1. **Automation vs. Manual Review:**
   - **Decision:** Automate validation gates, keep manual release trigger.
   - **Rationale:** Automation prevents human error (validation), manual trigger preserves intentionality (when to release).

2. **Defense-in-Depth vs. Simplicity:**
   - **Decision:** Multiple validation layers (pre-commit, CI, publish.yml).
   - **Rationale:** v0.8.22 disaster showed single-layer validation is insufficient.

3. **Branch Model Complexity:**
   - **Decision:** Three-branch model (dev/insiders/main), remove preview.
   - **Rationale:** preview branch adds complexity without clear value. If .squad/ stripping is critical, validate in squad-release.yml.

4. **CI Test Strategy:**
   - **Decision:** Fix tests (don't skip), separate flaky tests from critical path.
   - **Rationale:** Skipping tests normalizes failures. Fixing tests restores confidence.

---

**End of PRD**
