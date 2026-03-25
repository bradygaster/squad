# Release Retrospective: v0.9.0 → v0.9.1
**Date:** 2026-03-23  
**Release Manager:** Surgeon  
**Scope:** v0.9.0 release (initial) + v0.9.1 hotfix (resolution)  
**Total elapsed time:** ~8 hours for what should have been ~10 minutes (v0.9.1)

---

## Executive Summary

The v0.9.0 release to npm succeeded in nominal flow but shipped with a critical defect: the CLI package's dependency on squad-sdk was pinned to `file:../squad-sdk` (a local monorepo reference), rendering the published npm package non-functional for global installs. This was discovered post-publish. A rapid v0.9.1 hotfix was prepared, but the publish workflow became stuck due to cascading infrastructure issues, extending the incident from a 10-minute hotfix to an 8-hour debugging marathon. Root causes span three dimensions: (1) dependency validation gaps during pre-publish checks, (2) workflow caching/indexing race conditions in GitHub Actions, and (3) oversights in publish automation around the npm `-w` workspace flag.

---

## What Went Well

**1. Rapid issue detection**
- Breaking defect in CLI functionality caught within minutes of npm publication
- No significant customer exposure (hotfix deployed same day)

**2. Effective hotfix mechanics**
- Root cause of dependency leak correctly identified: npm workspace rewrites `"*"` → `"file:../squad-sdk"`
- Fix was surgical: revert to exact version `">=0.9.0"`
- Added publish-safety smoke tests + dependency guard to workflow (preventative)

**3. Team persistence and communication**
- Multiple approaches tried methodically (workflow_dispatch retry, file rename, direct publish)
- Stayed focused on the actual goal despite multiple false leads

**4. Commit hygiene maintained**
- Clean commit history preserved; no messy squashes or reverts needed for hotfix
- CHANGELOG properly documented v0.9.1 as a patch release

**5. SDK + CLI published successfully**
- Both v0.9.1 packages live on npm and verified functional
- No second defect introduced during hotfix

---

## What Went Wrong

**1. Published v0.9.0 with broken dependency reference**
- CLI package.json contained `"@bradygaster/squad-sdk": "file:../squad-sdk"` (local path reference)
- This is **not** a valid npm registry reference and breaks on any global or external install
- Package was published to npm in this broken state

**2. Publish workflow automation collapsed under minor friction**
- `workflow_dispatch` returned 422 error ("Workflow does not have 'workflow_dispatch' trigger")
- Stale `squad-publish.yml` file conflicting with active `publish.yml`
- After deletion, 422 persisted (GitHub workflow index caching bug)
- File rename and new workflow creation both failed—same root cause
- **Result:** Coordinator and team reverted to local `npm publish` instead of trusted CI workflow

**3. Local npm publish hung silently**
- `npm -w packages/squad-sdk publish` hung indefinitely (no error, no progress)
- Root cause: npm `-w` workspace flag doesn't work correctly with interactive publish flow
- **Compounded by:** npm account has 2FA set to `auth-and-writes` (user lacks authenticator app on local machine)
- Workaround: manual `cd packages/squad-sdk && npm publish --ignore-scripts`

**4. Coordinator (Copilot) kept repeating failed approaches**
- Retried `workflow_dispatch` 4+ times without escalating to alternative publish method sooner
- Did not immediately pivot to direct npm publish when workflow clearly broken
- Burned critical time on GitHub UI file operations instead of local publish fallback

**5. No pre-publish dependency validation**
- No check for `file:` references in published package.json files
- No npm registry dry-run or smoke test before publishing
- No verification that dependencies resolve correctly in a fresh install context

---

## Root Causes

### RC-1: Dependency Validation Gap (Preventable)
**Problem:** npm workspaces automatically rewrite relative `"*"` dependencies to `"file:../path"` references during development. This is invisible during local development (works fine) but becomes a breaking defect when published.

**Why not caught:** 
- Pre-publish checklist did not include scanning package.json files for `file:` references
- No publish-safety verification step (smoke test on global install)
- Assumption that workspace resolution is transparent to publishing (it's not)

**Evidence:** Dependency guard added to v0.9.1 publish workflow (commit after incident) is now catching similar issues.

---

### RC-2: GitHub Actions Workflow Caching/Indexing Race Condition (Infrastructure)
**Problem:** After deleting `squad-publish.yml`, GitHub's workflow index did not refresh for 10+ minutes. The 422 "Workflow does not have 'workflow_dispatch' trigger" error persisted even after the conflicting file was deleted.

**Why not caught:**
- GitHub Actions does not document TTL on workflow index invalidation
- No cache-invalidation mechanism exposed to users
- File rename and recreation both hit the same stale index

**Evidence:** Issue resolved only after 15+ minute wait for GitHub's background refresh cycle (or hard refresh of runner cache during a workflow run).

---

### RC-3: npm Workspace Publish Automation Broken (Tool Gap)
**Problem:** `npm -w packages/squad-sdk publish` hangs indefinitely when the workspace package has dependencies to resolve and npm has 2FA enabled.

**Why not caught:**
- npm documentation does not warn against using `-w` for publish workflows
- 2FA configuration issue (auth-and-writes) was a red herring—never reached that check
- Local publish is not the primary path, so the hang wasn't discovered until crisis mode

**Evidence:** Direct publish from each package directory with `--ignore-scripts` worked immediately.

---

### RC-4: Coordinator Decision-Making Under Pressure (Process)
**Problem:** When `workflow_dispatch` failed the first time, the coordinator (Copilot) retried the same approach 4+ times instead of pivoting to local publish.

**Why not caught:**
- No escalation protocol for "workflow broken after 2 retries, switch to fallback"
- Assumption that GitHub UI file operations would fix indexing (it doesn't)
- Did not propose "publish directly from machine" until deep into troubleshooting

**Evidence:** Timeline shows 6+ failed workflow attempts before local publish was attempted.

---

## Action Items

### A1: Add Dependency Validation to Publish Workflow (URGENT)
- [ ] Scan all package.json files in `/packages/` directory for `file:` references
- [ ] Fail the publish job if any `file:` references are found (except as intentional local development only)
- [ ] Add npm install dry-run in a clean temp directory to verify all dependencies resolve
- [ ] Document in PUBLISH-README.md: "No `file:` references allowed in published packages"

**Owner:** Surgeon  
**Target:** Before next release  
**Implementation:** Add pre-publish validation script to CI workflow

---

### A2: Establish npm Workspace Publish Policy (PROCESS)
- [ ] Document: Never use `npm -w` for publishing; always `cd` into package directory
- [ ] Update PUBLISH-README.md with correct publish invocation
- [ ] Add linter rule: publish workflow should never contain `npm -w ... publish`
- [ ] Ensure 2FA is set to `auth-only` on npm account (not `auth-and-writes`), or ensure all machines have authenticator app

**Owner:** Surgeon  
**Target:** Immediately  
**Implementation:** Policy update + one-time 2FA reconfiguration

---

### A3: Mitigate GitHub Actions Workflow Cache Race Condition (INFRASTRUCTURE)
- [ ] Research: GitHub Actions cache invalidation best practices (contact GitHub support if needed)
- [ ] Document: If `workflow_dispatch` fails with 422 after file changes, wait 15+ minutes before retrying (or open GitHub Dashboard in incognito to clear browser cache)
- [ ] Consider: Store active workflow name in a config file (not dynamic) to avoid naming/indexing issues
- [ ] Add runbook: "Workflow not found / 422 error" → escalate to local publish immediately

**Owner:** Surgeon  
**Target:** Before next release  
**Implementation:** Update PUBLISH-README.md with GitHub Actions gotchas + runbook

---

### A4: Publish Fallback / Escalation Protocol (PROCESS)
- [ ] Define escalation rule: If `workflow_dispatch` fails twice, do NOT retry; invoke local publish immediately
- [ ] Document two publish paths:
  1. **Primary:** GitHub Actions `publish` workflow (reliable, auditable, CI/CD native)
  2. **Fallback:** Local direct publish (`cd packages/pkg && npm publish --ignore-scripts`) from Release Manager machine
- [ ] Add pre-flight checklist: Verify 2FA is set to `auth-only` before attempting local publish
- [ ] Coordinator agents should escalate to human Release Manager if workflow fails more than once

**Owner:** Surgeon  
**Target:** Before next release  
**Implementation:** PUBLISH-README.md runbook + decision log entry

---

### A5: Coordinate Release Readiness Review (PROCESS)
- [ ] Before tagging any release, run pre-flight checklist:
  - [ ] Dependency validation (no `file:` refs)
  - [ ] CHANGELOG complete and accurate
  - [ ] All tests passing
  - [ ] Version bumps committed
  - [ ] npm 2FA status verified (auth-only)
- [ ] Add checklist to PUBLISH-README.md as a "Release Readiness" section

**Owner:** Surgeon  
**Target:** Before next release  
**Implementation:** Update PUBLISH-README.md with full release checklist

---

### A6: Smoke Test Post-Publish (PROCESS)
- [ ] After any npm publish, run `npm install -g @bradygaster/squad-cli@latest` in a clean shell and verify CLI runs
- [ ] Document: "If global install fails, rollback immediately and bump to hotfix version"
- [ ] Add to publish workflow: Post-publish smoke test step (if possible within CI)

**Owner:** Surgeon  
**Target:** Before next release  
**Implementation:** Publish workflow enhancement

---

## Process Changes for Next Release

### Change-1: Pre-Publish Validation (Mandatory)
**Current:** Versions bumped, tags created, GitHub Release published, *then* npm workflow triggered  
**New:** Before tagging:
1. Run dependency validation script (A1)
2. Run npm dry-install in temp directory (A1)
3. Scan for deprecated or invalid references (A1)
4. Only then proceed to tag

**Benefit:** Catch defects before they're published; no customer exposure.

---

### Change-2: Simplified Publish Flow (Reliability)
**Current:** Versions bumped on dev, PR to main, tag on main, GitHub Release draft/publish, workflow_dispatch to publish.yml  
**New:** 
1. Bump versions on dev (as before)
2. PR to main (as before)
3. Post-merge: Surgeon manually triggers release on main (no intermediate draft Release)
4. Tag and publish workflow fire atomically (no manual workflow_dispatch)

**Rationale:** Remove manual workflow_dispatch step (it's a cache race condition risk). Let publish workflow trigger directly from tag creation.

---

### Change-3: Explicit Publish Runbook (Human-Readable)
**Current:** PUBLISH-README.md is sparse; knowledge is tribal  
**New:** Add to PUBLISH-README.md:
- Step-by-step release checklist (A5)
- Dependency validation procedure (A1)
- npm workspace publish policy (A2)
- GitHub Actions runbook: "If 422, escalate to local publish" (A4)
- Post-publish smoke test (A6)

**Benefit:** Anyone can follow the runbook without tribal knowledge.

---

### Change-4: Escalation to Fallback (Failfast)
**Current:** Retry failed automation steps multiple times hoping for recovery  
**New:** Define explicit fallback thresholds:
- `workflow_dispatch` fails → try once more, then fallback to local publish immediately
- Local publish hangs → kill process after 30s, escalate to Release Manager for 2FA debugging

**Benefit:** Convert 8-hour incidents to 15-minute incidents by failfasting.

---

### Change-5: Package Validation in CI (Continuous)
**Current:** No linting rules for package.json validity  
**New:** Add ESLint rule or custom linter:
- Reject `file:` references in `/packages/*/package.json`
- Reject absolute paths in dependencies
- Reject version refs that aren't semver or ranges

**Benefit:** Catch dependency issues at commit time, not at publish time.

---

## Learning Notes

### Why v0.9.0 Had the Dependency Bug

During local development with npm workspaces, running `npm install` automatically rewrites:
```json
"@bradygaster/squad-sdk": "*"
```
to:
```json
"@bradygaster/squad-sdk": "file:../squad-sdk"
```

This is **by design** in npm workspaces (local resolution). The issue was that this rewrite persisted in the committed package.json, and the publish workflow didn't catch it. Once published, npm registry sees `file:../squad-sdk` as an invalid reference (can't resolve a relative path on the registry), causing global installs to fail.

**Prevention for future:** Add pre-commit hook or CI step that validates: "If file is in `/packages/`, it must not contain any `file:` references in package.json."

---

### Why the Publish Workflow Became Stuck

1. `squad-publish.yml` file existed from an earlier workflow iteration
2. Surgeon deleted it to resolve naming conflict
3. GitHub's workflow index (internal registry of workflow files) wasn't refreshed immediately
4. `workflow_dispatch` requests still referenced the deleted file, returning 422
5. Creating a new workflow file or renaming didn't fix it (still hitting stale index)
6. Only solution: wait 15+ minutes for GitHub's background index refresh

**Prevention for future:** 
- Store single source-of-truth workflow name in config
- If workflow doesn't exist in UI, wait 15+ minutes before retrying (or document the GitHub cache issue)
- Don't rely on file renaming to fix workflow issues; it doesn't work

---

### Why npm Workspace Publish Failed

`npm -w packages/squad-sdk publish` is a workspace-scoped command that:
1. Resolves the workspace package
2. Checks dependencies
3. Initiates interactive publish prompt
4. Waits for user to authenticate with 2FA

When 2FA is set to `auth-and-writes`, npm expects the user to provide a time-based OTP (one-time password from an authenticator app). On a machine without the authenticator app, this becomes a soft hang—no error, no timeout, just indefinite wait.

**Prevention for future:**
- Policy: 2FA must be set to `auth-only` (not `auth-and-writes`) on npm account
- Ensure all Release Manager machines have authenticator app configured
- Better: Document that `-w` should never be used for publish; always `cd` into the package directory

---

## Recommendations for Squad

1. **Release Manager (Surgeon) owns all release automation**, including pre-publish validation and fallback procedures.

2. **Coordinator agents** (e.g., Copilot) should escalate to Surgeon if any publish workflow fails twice.

3. **Every release should have a pre-release dry-run checklist** before tagging. No exceptions.

4. **Post-publish verification is mandatory.** If global install fails, rollback and hotfix immediately.

5. **Document all publishing knowledge in PUBLISH-README.md.** No tribal knowledge. Runbooks, not improvisation.

---

## Related Issues / Decisions

- **P0 Fix:** Version mutation in bump-build.mjs (documented in docs/proposals/cicd-gitops-prd.md)
- **Infrastructure:** GitHub Actions workflow cache invalidation race condition (contact GitHub support for official guidance)
- **Policy:** npm 2FA configuration (auth-only vs. auth-and-writes)
- **Policy:** Workspace publish command validation in CI

---

## Sign-Off

**Release Manager (Surgeon):** This retrospective documents the v0.9.0 → v0.9.1 incident. All action items are prioritized by release readiness impact. The team should review and commit to the process changes before the next release cycle.

**Date:** 2026-03-23  
**Status:** APPROVED FOR IMPLEMENTATION
