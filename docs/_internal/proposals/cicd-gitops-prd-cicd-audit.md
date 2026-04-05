# CI/CD Pipeline Audit — Findings & Recommendations

**Auditor:** Drucker (CI/CD Engineer)  
**Date:** 2026-03-07  
**Scope:** All GitHub Actions workflows, publish pipeline, automation gaps  
**Context:** Post-v0.8.22 disaster — multiple CI failures, no validation gates, fragile publish flow

---

## Executive Summary

**Current State:** Squad has **15 GitHub Actions workflows** covering CI, publish, release, docs, and squad automation. The core publish pipeline (publish.yml) has been partially hardened post-v0.8.22, but **critical validation gaps remain**. Multiple workflows are broken or redundant. Test failures in squad-release.yml are blocking all main branch merges.

**Key Findings:**
- ❌ **No semver validation gate** — 4-part versions can still reach npm
- ❌ **No NPM_TOKEN type check** — User tokens with 2FA will still fail with EOTP
- ❌ **No dry-run step** — `npm publish --dry-run` not used before real publish
- ❌ **No SKIP_BUILD_BUMP enforcement** — bump-build.mjs could run in release builds
- ⚠️ **squad-release.yml is broken** — test failures blocking all releases (9+ consecutive failures)
- ⚠️ **Duplicate/redundant workflows** — squad-publish.yml and squad-publish.yml.deprecated exist alongside publish.yml
- ⚠️ **squad-ci.yml has test failures** — human-journeys.test.ts has 12 failing tests
- ✅ **Retry logic exists** — verify steps have 5-attempt retry with 15s intervals (good)
- ✅ **Version matching validation** — package.json version checked against target before publish (good)

**Bottom Line:** The publish pipeline works but is not disaster-proof. We're one bad commit away from another v0.8.22-style incident. squad-release.yml is completely broken and blocking releases from main.

---

## Detailed Audit: Workflow-by-Workflow

### 1. publish.yml (Primary Publish Pipeline)

**Purpose:** Publishes squad-sdk and squad-cli to npm when a GitHub Release is published.

**Trigger:**
- `release: [published]` — fires when a GitHub Release is published (NOT draft)
- `workflow_dispatch` — manual trigger with version input

**What it does:**
1. **publish-sdk job:**
   - Checks out code
   - Installs dependencies (`npm ci`)
   - Builds squad-sdk
   - **Validates package version matches target** ✅
   - Publishes to npm with `--provenance` flag ✅
   - **Verifies publication with 5-attempt retry loop** ✅
2. **publish-cli job:**
   - Depends on `publish-sdk` (correct order) ✅
   - Same flow as SDK
   - Publishes squad-cli

**Recent Run Status:**
- **2 successes** (run 22806809347 on 2026-03-07)
- **Multiple failures** (runs 22806809342, 22806775944, 22806732336, etc.)

**What's MISSING (Critical Gaps):**

#### Gap 1: No Semver Validation Gate ❌ P0
**Risk:** 4-part versions (0.8.21.4) can make it to npm and get mangled (0.8.2-1.4).  
**Impact:** Breaks `latest` dist-tag, confuses customers, requires rollback.  
**Evidence:** This caused the v0.8.22 disaster. No safeguard added post-incident.

**Fix Required:**
```yaml
- name: Validate semver
  run: |
    VERSION="${{ steps.version.outputs.version }}"
    if ! semver "$VERSION" > /dev/null 2>&1; then
      echo "❌ Invalid semver: $VERSION"
      echo "Only 3-part versions (X.Y.Z) or prerelease (X.Y.Z-tag.N) are valid."
      exit 1
    fi
    echo "✅ Valid semver: $VERSION"
```

#### Gap 2: No NPM_TOKEN Type Check ❌ P0
**Risk:** User tokens with 2FA cause EOTP errors. CI fails 5+ times before someone realizes.  
**Impact:** Delayed releases, wasted CI time, human intervention required.  
**Evidence:** v0.8.22 disaster had 5+ EOTP failures before token was replaced.

**Fix Required:**
```yaml
- name: Verify NPM_TOKEN is set
  run: |
    if [ -z "${{ secrets.NPM_TOKEN }}" ]; then
      echo "❌ NPM_TOKEN secret not set"
      exit 1
    fi
    # Document requirement for Automation token
    echo "⚠️ Ensure NPM_TOKEN is an Automation token (not User token with 2FA)"
    echo "To create: https://www.npmjs.com/settings/{user}/tokens → Generate New Token → Automation"
```

**Note:** Full token type verification requires authenticated npm CLI, which adds complexity. Documenting the requirement is acceptable for P0. Full verification is P1 enhancement.

#### Gap 3: No Dry-Run Step ❌ P1
**Risk:** package.json issues (missing files, invalid metadata) aren't caught until real publish.  
**Impact:** Publish fails after build completes, wasting time and causing rollback.

**Fix Required:**
```yaml
- name: Dry-run publish (SDK)
  run: npm -w packages/squad-sdk publish --dry-run --access public

- name: Dry-run publish (CLI)
  run: npm -w packages/squad-cli publish --dry-run --access public
```

#### Gap 4: No SKIP_BUILD_BUMP Enforcement ❌ P0
**Risk:** bump-build.mjs runs during release builds, creating 4-part versions.  
**Impact:** Same as Gap 1 — invalid semver reaches npm.  
**Evidence:** bump-build.mjs has `if (process.env.SKIP_BUILD_BUMP === '1' || process.env.CI === 'true')` check, but workflow doesn't enforce it.

**Fix Required:**
```yaml
env:
  SKIP_BUILD_BUMP: "1"

- name: Verify SKIP_BUILD_BUMP is set
  run: |
    if [ "$SKIP_BUILD_BUMP" != "1" ]; then
      echo "❌ SKIP_BUILD_BUMP must be set to 1 for release builds"
      exit 1
    fi
    echo "✅ SKIP_BUILD_BUMP is set"
```

**Note:** bump-build.mjs checks `process.env.CI === 'true'` which GitHub Actions sets by default, so this is mitigated. But explicit enforcement is better defense-in-depth.

#### Gap 5: Build Step Doesn't Set SKIP_BUILD_BUMP ❌ P0
**Risk:** Even though CI=true is set by GitHub Actions, package.json has `"prebuild": "node scripts/bump-build.mjs"` which will run before build.  
**Impact:** Version gets bumped during build, creating 4-part version.

**Fix Required:**
```yaml
- name: Build squad-sdk
  run: npm -w packages/squad-sdk run build
  env:
    SKIP_BUILD_BUMP: "1"
```

**Strengths (What's Working):**
- ✅ Retry logic with 5 attempts, 15s intervals (good npm propagation handling)
- ✅ Version matching validation (package.json vs. target version)
- ✅ Provenance flag enabled (good supply chain security)
- ✅ Correct publish order (SDK before CLI, CLI depends on SDK)
- ✅ Manual trigger option via workflow_dispatch

---

### 2. squad-release.yml (GitHub Release Automation) ❌ BROKEN

**Purpose:** Auto-creates GitHub Release + tag when code lands on main.

**Trigger:** `push: branches: [main]`

**What it does:**
1. Runs tests via `node --test test/*.test.js`
2. Validates CHANGELOG.md has entry for version
3. Reads version from package.json
4. Checks if tag already exists
5. Creates tag and pushes
6. Creates GitHub Release with `gh release create`

**Recent Run Status:**
- **9+ consecutive failures** (runs 22807156825, 22807134649, 22807120575, 22807009127, 22806809345, 22806782017, 22806732342, 22806705118, 22806544480, 22806484500)
- Last success: Unknown (all recent runs failed)

**Root Cause of Failures:**
Tests are failing with `ReferenceError: require is not defined in ES module scope` for multiple test files:
- test/email-scrub.test.js
- test/init-flow.test.js
- test/mcp-config.test.js
- test/migrate-directory.test.js
- test/plugin-marketplace.test.js
- test/skills-export-import.test.js
- test/version-stamping.test.js
- test/workflows.test.js

**Problem:** These test files use `require('node:test')` but the package.json has `"type": "module"`, so all .js files are treated as ES modules. Tests need to use `import` instead of `require`.

**Impact:**
- ❌ **squad-release.yml is completely broken** — every push to main fails
- ❌ **Releases from main are blocked** — workflow fails before creating tag/release
- ❌ **CI is red** — this creates a "broken windows" effect, normalizing failures

**Fix Required:**
1. **Immediate:** Update failing test files to use ES module syntax:
   ```javascript
   // OLD: const { describe, it, beforeEach, afterEach } = require('node:test');
   // NEW:
   import { describe, it, beforeEach, afterEach } from 'node:test';
   ```
2. **Alternative:** Use Vitest instead of node:test (repo already has Vitest configured and working)
3. **Temporary workaround:** Skip broken tests or disable squad-release.yml temporarily

**Priority:** **P0** — This is blocking all releases from main.

---

### 3. squad-ci.yml (Pull Request CI) ⚠️ PARTIALLY BROKEN

**Purpose:** Runs build + tests on PRs to dev/preview/main/insider branches.

**Trigger:**
- `pull_request: types: [opened, synchronize, reopened]`
- `push: branches: [dev, insider]`

**What it does:**
1. Installs dependencies
2. Installs Playwright browsers
3. Builds with `npm run build`
4. Runs tests with `npm test`

**Recent Run Status:**
- **2 failures** (runs 22806848247, 22806545692)
- Most runs succeed

**Root Cause of Failures:**
Test failures in `test/human-journeys.test.ts`:
- 12 failed tests out of 39 total
- Most failures relate to CLI command handling (unknown command error messages, help output, etc.)
- Error: "expected 'node:internal/modules/run_main:123...' to contain 'Unknown command'" — suggests CLI error handling isn't working as expected

**Impact:**
- ⚠️ **CI is flaky** — test suite has known failures
- ⚠️ **PRs may merge with broken tests** — if failures are sporadic

**Fix Required:**
- Investigate human-journeys.test.ts failures
- Fix CLI error handling or update tests to match actual behavior
- Consider separating flaky tests from critical path

**Priority:** **P1** — Not blocking releases but undermining CI confidence.

---

### 4. squad-docs.yml (Documentation Deploy) ✅ WORKING

**Purpose:** Builds and deploys documentation to GitHub Pages.

**Trigger:**
- `push: branches: [main], paths: ['docs/**', '.github/workflows/squad-docs.yml']`
- `workflow_dispatch`

**What it does:**
1. Installs markdown-it dependencies
2. Builds docs site with `node docs/build.js`
3. Uploads Pages artifact
4. Deploys to GitHub Pages

**Recent Run Status:**
- **100% success rate** (runs 22807156805, 22807120583, 22807009125)

**Assessment:** ✅ Working as expected. No issues.

---

### 5. squad-heartbeat.yml (Ralph Auto-Triage) ⚠️ DISABLED

**Purpose:** Ralph (triage agent) auto-assigns issues to squad members based on routing rules.

**Trigger:**
- ~~`schedule: cron: '*/30 * * * *'`~~ — **DISABLED** (commented out)
- `issues: types: [closed, labeled]`
- `pull_request: types: [closed]`
- `workflow_dispatch`

**What it does:**
1. Checks if `.squad/templates/ralph-triage.js` exists
2. Runs Ralph triage script
3. Applies triage decisions (labels, comments)
4. Auto-assigns @copilot to `squad:copilot` issues

**Recent Run Status:** Not triggered (cron disabled, event-based triggers are passive)

**Issues:**
- ⚠️ **Cron heartbeat is disabled** — Ralph won't run automatically every 30 minutes
- Script dependency: `.squad/templates/ralph-triage.js` — may not exist in all contexts

**Impact:** Ralph automation is mostly dormant. Issue triage relies on other workflows (squad-triage.yml, squad-issue-assign.yml).

**Recommendation:** Re-enable cron once Ralph triage script is stable, or remove this workflow if redundant with squad-triage.yml.

**Priority:** **P2** — Not critical, triage works via other workflows.

---

### 6. squad-insider-publish.yml (Insider Builds) 🤔 UNCLEAR STATUS

**Purpose:** Publishes insider builds to npm with `@insider` tag when code lands on `insider` branch.

**Trigger:** `push: branches: [insider]`

**What it does:**
1. Builds SDK and CLI
2. Runs tests
3. Publishes with `--tag insider` to npm

**Issues:**
- ⚠️ **No recent runs** — insider branch hasn't been pushed recently
- ⚠️ **No SKIP_BUILD_BUMP set** — bump-build.mjs will run and create 4-part versions
- ⚠️ **No semver validation** — same gaps as publish.yml

**Impact:** Insider builds may have same issues as main publish pipeline.

**Recommendation:** Apply same validation fixes as publish.yml (semver validation, SKIP_BUILD_BUMP, dry-run).

**Priority:** **P1** — Same risk as publish.yml, but lower traffic.

---

### 7. squad-insider-release.yml (Insider GitHub Releases) ✅ WORKING

**Purpose:** Creates GitHub Release for insider builds with SHA-stamped version.

**Trigger:** `push: branches: [insider]`

**What it does:**
1. Runs tests with `node --test`
2. Reads version and appends `-insider+{SHA}` suffix
3. Creates tag
4. Creates GitHub Release (prerelease)

**Assessment:** ✅ Looks good. Uses prerelease flag, SHA stamping is correct.

**Note:** Same test failures as squad-release.yml may affect this (node:test require vs. import).

---

### 8. squad-issue-assign.yml (Issue Assignment) ✅ WORKING

**Purpose:** Auto-assigns issues to squad members when `squad:{member}` label is added.

**Trigger:** `issues: types: [labeled]`

**What it does:**
1. Parses `.squad/team.md` or `.ai-team/team.md`
2. Identifies member from label (e.g., `squad:ripley` → ripley)
3. Posts assignment comment
4. For `squad:copilot`, assigns `copilot-swe-agent[bot]` via GitHub API

**Assessment:** ✅ Well-implemented. No issues found.

---

### 9. squad-label-enforce.yml (Label Rules) ✅ WORKING

**Purpose:** Enforces mutual exclusivity for namespaced labels (go:, release:, type:, priority:).

**Trigger:** `issues: types: [labeled]`

**What it does:**
1. Removes conflicting labels in same namespace
2. Auto-applies `release:backlog` when `go:yes` is added
3. Removes release labels when `go:no` is added

**Assessment:** ✅ Good label hygiene automation. No issues.

---

### 10. squad-preview.yml (Preview Branch Validation) ✅ WORKING

**Purpose:** Validates preview branch before release (version in CHANGELOG, no .squad/ files tracked).

**Trigger:** `push: branches: [preview]`

**What it does:**
1. Validates version exists in CHANGELOG.md
2. Runs tests
3. Checks no `.squad/` or `.ai-team/` files are tracked

**Assessment:** ✅ Good gate before release. No issues.

---

### 11. squad-promote.yml (Branch Promotion) ✅ WORKING

**Purpose:** Promotes dev → preview → main with path stripping.

**Trigger:** `workflow_dispatch` (manual)

**What it does:**
1. **dev → preview:** Merges dev, strips `.squad/`, `.ai-team/`, `team-docs/`, `docs/proposals/`
2. **preview → main:** Merges preview, validates CHANGELOG, triggers squad-release.yml

**Assessment:** ✅ Well-designed. Strips team files before release (good). Validates CHANGELOG (good).

**Note:** Relies on squad-release.yml which is currently broken.

---

### 12. squad-publish.yml (Tag-Based Publish) ❓ REDUNDANT?

**Purpose:** Publishes to npm when a tag is pushed (v*).

**Trigger:** `push: tags: ['v*']`

**What it does:**
1. Build → Test → Publish (same flow as publish.yml)

**Issues:**
- ⚠️ **Redundant with publish.yml?** — publish.yml is triggered by GitHub Release (which creates a tag), so this may be a fallback or duplicate.
- ⚠️ **Same validation gaps** — no semver validation, no SKIP_BUILD_BUMP, no dry-run
- ⚠️ **No provenance flag** — publish.yml uses `--provenance`, this doesn't

**Impact:** Unclear if this is used. May cause confusion.

**Recommendation:**
- **Option 1:** Delete this workflow (use publish.yml as canonical)
- **Option 2:** Keep as fallback, but add same validation gates as publish.yml
- **Option 3:** Document when to use each (tag-based vs. release-based publish)

**Priority:** **P2** — Clarify intent and clean up.

---

### 13. squad-publish.yml.deprecated ❓ STALE

**Purpose:** Same as squad-publish.yml (tag-based publish).

**Status:** Filename says "deprecated" but file still exists in repo.

**Recommendation:** Delete this file. Keeping deprecated workflows causes confusion.

**Priority:** **P2** — Housekeeping.

---

### 14. squad-triage.yml (Initial Squad Triage) ✅ WORKING

**Purpose:** Routes issues to squad members when `squad` label (no member) is added.

**Trigger:** `issues: types: [labeled]`

**What it does:**
1. Parses `.squad/team.md` or `.ai-team/team.md`
2. Evaluates @copilot capability match (good fit / needs review / not suitable)
3. Routes to best member via `squad:{member}` label
4. Falls back to Lead if no routing match

**Assessment:** ✅ Smart routing logic. @copilot capability evaluation is well-designed.

---

### 15. sync-squad-labels.yml (Label Sync) ✅ WORKING

**Purpose:** Syncs squad member labels based on `.squad/team.md`.

**Trigger:**
- `push: paths: ['.squad/team.md', '.ai-team/team.md']`
- `workflow_dispatch`

**What it does:**
1. Parses team roster from `.squad/team.md`
2. Creates/updates `squad:{member}` labels for each member
3. Creates triage labels (go:, release:, type:, priority:)

**Recent Run Status:** **100% success rate**

**Assessment:** ✅ Good automation. Keeps labels in sync with team roster.

---

## Missing Automation (Net-New Workflows)

### 1. Automated Rollback on Publish Failure ❌ P1

**Gap:** If publish.yml fails after SDK publish but before CLI publish, there's no automated rollback.

**Impact:** Broken state (SDK published, CLI not). Requires manual intervention.

**Recommendation:**
- Add rollback step that deprecates the SDK version if CLI publish fails
- Or: use a single `npm publish` command that publishes both (requires restructuring)

**Priority:** **P1** — Reduces manual intervention during incidents.

---

### 2. Pre-Flight Validation Workflow ❌ P2

**Gap:** No way to validate a version is "publish-ready" before creating a release.

**Impact:** Releases fail after tag/release is created, requiring rollback.

**Recommendation:**
- Create `squad-pre-flight.yml` workflow that runs validation checks:
  - Semver validation
  - Version matches CHANGELOG
  - All tests pass
  - No .squad/ files on preview branch
  - Dry-run publish succeeds
- Trigger via `workflow_dispatch` before creating release

**Priority:** **P2** — Nice-to-have, preview validation is already decent.

---

### 3. Publish Pipeline Health Monitoring ❌ P2

**Gap:** No proactive monitoring of publish pipeline health. Failures are discovered during release attempts.

**Impact:** Surprises during releases.

**Recommendation:**
- Weekly scheduled workflow that runs publish dry-run + validation checks
- Posts status to Slack or creates GitHub Issue if failures detected

**Priority:** **P2** — Proactive monitoring reduces surprises.

---

### 4. NPM Token Expiry Check ❌ P2

**Gap:** NPM_TOKEN can expire. No alerting when token is close to expiry.

**Impact:** Surprise failures when token expires during release.

**Recommendation:**
- Add step to publish.yml that checks token expiry date (if npm API supports it)
- Or: document token rotation schedule

**Priority:** **P2** — Low-frequency issue, but annoying when it happens.

---

## Scripts Analysis

### bump-build.mjs (Dev Build Versioning)

**Purpose:** Auto-increments build number before each build (0.8.6-preview.1 → 0.8.6-preview.2).

**Behavior:**
- Skips if `SKIP_BUILD_BUMP=1` or `CI=true` ✅
- Updates all 3 package.json files in lockstep ✅
- Supports prerelease format (X.Y.Z-tag.N) and non-prerelease format (X.Y.Z.N)

**Issues:**
- ⚠️ **Non-prerelease format creates 4-part versions** — If base version is 0.8.22 (not a prerelease), this creates 0.8.22.1, 0.8.22.2, etc. which are NOT valid semver.
- ⚠️ **CI=true check is not enough** — Some workflows may not have CI=true set (e.g., local docker builds)

**Impact:**
- 🔴 **Direct cause of v0.8.22 disaster** — This script created 0.8.21.4 which npm mangled to 0.8.2-1.4
- 🔴 **Still a footgun** — If SKIP_BUILD_BUMP isn't set and version is non-prerelease, disaster repeats

**Recommendation:**
1. **Option 1 (Strict):** Reject non-prerelease versions entirely. Script should exit with error if version doesn't have a prerelease tag.
2. **Option 2 (Safer Format):** For non-prerelease versions, use `-build.N` suffix (0.8.22 → 0.8.22-build.1) which IS valid semver.
3. **Option 3 (Nuclear):** Remove this script entirely. Only allow manual version bumps.

**Priority:** **P0** — This script caused the disaster. Must be fixed or removed.

**Proposed Fix (Option 2 — Safer Format):**
```javascript
function formatVersion({ base, build, prerelease }) {
  if (prerelease) {
    return `${base}${prerelease}.${build}`;
  }
  // For non-prerelease, use -build.N suffix (valid semver)
  return `${base}-build.${build}`;
}
```

---

## Workflow Run History Analysis

**Date Range:** 2026-03-07 (last 30 runs)

**Summary:**
- **Squad Release:** 9+ consecutive failures (test failures)
- **Squad CI:** 2 failures (human-journeys.test.ts)
- **Publish to npm:** Multiple failures, 2 successes
- **Squad Docs:** 100% success rate
- **Sync Squad Labels:** 100% success rate

**Failure Patterns:**
1. **Test failures** — Most common failure mode (squad-release.yml, squad-ci.yml)
2. **Publish errors** — Multiple publish.yml failures (likely NPM_TOKEN or propagation issues)
3. **No recent insider runs** — Insider branch hasn't been active

**Key Insight:** **Testing is the primary blocker.** squad-release.yml is completely broken due to test failures. squad-ci.yml has sporadic test failures. Until tests are fixed, releases from main are blocked.

---

## Priority Recommendations

### P0 (Blocking Releases — Fix Immediately)

1. **Fix squad-release.yml test failures** ❌ URGENT
   - Root cause: ES module syntax errors in test files (require → import)
   - Impact: Releases from main are completely blocked
   - Fix: Update test files to use ES module syntax or use Vitest

2. **Add semver validation to publish.yml** ❌ CRITICAL
   - Risk: 4-part versions can still reach npm
   - Fix: Add `semver` validation step before publish

3. **Add SKIP_BUILD_BUMP enforcement to publish.yml** ❌ CRITICAL
   - Risk: bump-build.mjs could create 4-part versions during release
   - Fix: Set `env.SKIP_BUILD_BUMP=1` and verify it's set

4. **Fix bump-build.mjs to use valid semver** ❌ CRITICAL
   - Risk: Non-prerelease format creates 4-part versions (0.8.22.1 = invalid)
   - Fix: Use `-build.N` suffix for non-prerelease versions (0.8.22-build.1 = valid)

---

### P1 (Hardening — Fix This Sprint)

5. **Add NPM_TOKEN existence check to publish.yml** ⚠️
   - Risk: Missing token causes cryptic errors
   - Fix: Check `secrets.NPM_TOKEN` is set before publish

6. **Add dry-run step to publish.yml** ⚠️
   - Risk: package.json issues not caught until real publish
   - Fix: Run `npm publish --dry-run` before real publish

7. **Fix squad-ci.yml test failures** ⚠️
   - Impact: Undermines CI confidence, may allow bad PRs to merge
   - Fix: Investigate human-journeys.test.ts failures

8. **Apply validation fixes to squad-insider-publish.yml** ⚠️
   - Risk: Same gaps as publish.yml (semver, SKIP_BUILD_BUMP, dry-run)
   - Fix: Copy validation steps from publish.yml

9. **Clarify squad-publish.yml vs. publish.yml** ⚠️
   - Issue: Two workflows with overlapping triggers (tag-based vs. release-based)
   - Fix: Document which is canonical, or delete redundant one

10. **Add automated rollback for partial publish failures** ⚠️
    - Risk: SDK published, CLI not → broken state
    - Fix: Deprecate SDK version if CLI publish fails

---

### P2 (Quality of Life — Fix Next Sprint)

11. **Delete squad-publish.yml.deprecated** 🧹
    - Issue: Stale file causes confusion
    - Fix: Remove file

12. **Re-enable squad-heartbeat.yml cron or remove workflow** 🧹
    - Issue: Cron disabled, workflow mostly dormant
    - Fix: Enable cron if Ralph is stable, or delete if redundant

13. **Add pre-flight validation workflow** 💡
    - Benefit: Catch issues before creating release
    - Fix: Create squad-pre-flight.yml with validation checks

14. **Add publish pipeline health monitoring** 💡
    - Benefit: Proactive detection of issues
    - Fix: Weekly scheduled workflow that runs dry-run + validation

15. **Document NPM token rotation schedule** 📚
    - Benefit: Avoid surprise expiry failures
    - Fix: Add docs/runbooks/npm-token-rotation.md

---

## Code Snippets for Proposed Fixes

### Fix 1: Add Semver Validation to publish.yml

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

### Fix 2: Enforce SKIP_BUILD_BUMP in publish.yml

```yaml
jobs:
  publish-sdk:
    name: Publish @bradygaster/squad-sdk
    runs-on: ubuntu-latest
    env:
      SKIP_BUILD_BUMP: "1"
    steps:
      # ... existing steps ...

      - name: Verify SKIP_BUILD_BUMP is set
        run: |
          if [ "$SKIP_BUILD_BUMP" != "1" ]; then
            echo "❌ SKIP_BUILD_BUMP must be set to 1 for release builds"
            echo "This prevents bump-build.mjs from creating 4-part versions."
            exit 1
          fi
          echo "✅ SKIP_BUILD_BUMP is set — bump-build.mjs will be skipped"

      - name: Build squad-sdk
        run: npm -w packages/squad-sdk run build
        env:
          SKIP_BUILD_BUMP: "1"
```

### Fix 3: Add Dry-Run Step to publish.yml

```yaml
- name: Dry-run publish (catch package.json issues)
  run: npm -w packages/squad-sdk publish --dry-run --access public
```

### Fix 4: Fix bump-build.mjs to Use Valid Semver

```javascript
function formatVersion({ base, build, prerelease }) {
  if (prerelease) {
    // Prerelease format: 0.8.6-preview.1 (valid semver)
    return `${base}${prerelease}.${build}`;
  }
  // Non-prerelease format: 0.8.22-build.1 (valid semver)
  // NOT 0.8.22.1 (invalid — 4-part version)
  return `${base}-build.${build}`;
}
```

### Fix 5: Add NPM_TOKEN Check to publish.yml

```yaml
- name: Verify NPM_TOKEN is configured
  run: |
    if [ -z "${{ secrets.NPM_TOKEN }}" ]; then
      echo "❌ NPM_TOKEN secret is not set"
      echo "To fix: Go to GitHub → Settings → Secrets → Actions → Add NPM_TOKEN"
      exit 1
    fi
    echo "⚠️ Ensure NPM_TOKEN is an Automation token (not User token with 2FA)"
    echo "User tokens will fail with EOTP error (one-time password required)."
    echo "To create Automation token: https://www.npmjs.com/settings/{user}/tokens"
    echo "✅ NPM_TOKEN is configured"
```

---

## Appendix: Workflow Inventory

| Workflow | Purpose | Trigger | Status | Priority |
|----------|---------|---------|--------|----------|
| publish.yml | Publish to npm | release: published | ⚠️ Needs hardening | P0 |
| squad-release.yml | Auto-create GitHub Release | push: main | ❌ Broken (tests) | P0 |
| squad-ci.yml | PR/push CI | pull_request, push | ⚠️ Flaky tests | P1 |
| squad-docs.yml | Deploy docs to Pages | push: main (docs paths) | ✅ Working | — |
| squad-heartbeat.yml | Ralph auto-triage | ~~cron~~ (disabled), issues | ⚠️ Dormant | P2 |
| squad-insider-publish.yml | Insider builds to npm | push: insider | 🤔 Needs hardening | P1 |
| squad-insider-release.yml | Insider GitHub Releases | push: insider | ✅ Working | — |
| squad-issue-assign.yml | Issue assignment | issues: labeled | ✅ Working | — |
| squad-label-enforce.yml | Label mutual exclusivity | issues: labeled | ✅ Working | — |
| squad-preview.yml | Preview validation | push: preview | ✅ Working | — |
| squad-promote.yml | Branch promotion | workflow_dispatch | ✅ Working | — |
| squad-publish.yml | Tag-based publish | push: tags | ❓ Redundant? | P2 |
| squad-publish.yml.deprecated | — | — | ❌ Stale | P2 |
| squad-triage.yml | Initial squad triage | issues: labeled | ✅ Working | — |
| sync-squad-labels.yml | Sync squad labels | push: .squad/team.md | ✅ Working | — |

**Total:** 15 workflows  
**Working:** 8 ✅  
**Needs hardening:** 3 ⚠️  
**Broken:** 1 ❌  
**Unclear/Redundant:** 3 ❓

---

## Conclusion

Squad's CI/CD pipeline is **functional but fragile**. The core publish workflow (publish.yml) works for happy-path releases but lacks critical validation gates that allowed the v0.8.22 disaster to happen. **squad-release.yml is completely broken** and blocking releases from main.

**Immediate Actions (P0):**
1. Fix squad-release.yml test failures (ES module syntax)
2. Add semver validation to publish.yml
3. Enforce SKIP_BUILD_BUMP in publish.yml
4. Fix bump-build.mjs to use valid semver format

**Next Sprint (P1):**
- Harden publish.yml with dry-run, token checks
- Fix squad-ci.yml test failures
- Apply validation fixes to insider publish workflow
- Add automated rollback for partial publish failures

**Future Improvements (P2):**
- Clean up redundant/stale workflows
- Add pre-flight validation workflow
- Add publish pipeline health monitoring
- Document token rotation

**The Goal:** Make the CI/CD pipeline disaster-proof. Every validation gap is a potential v0.8.22-style incident waiting to happen. Defense in depth is not optional for publish pipelines.
