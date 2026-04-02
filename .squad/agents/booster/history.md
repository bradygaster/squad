# BOOSTER

> Booster Systems Engineer

## Learnings

### CI Workflow Audit & Preflight Patterns (2026-03-23 Release Incident)
**Context:** v0.9.0 shipped with broken dependency reference (`file:../squad-sdk` in CLI package.json). Required hotfix. Used incident as opportunity to audit entire CI/CD system.

**Audit findings:** 15 total workflow files. 7 load-bearing (ci, publish, release, preview, promote, insider variants). 7 administrative (triage, assign, labels, heartbeat, docs, link-check). 1 ghost (publish-npm.yml, deleted but GitHub index cached). No duplication. Authorship: 65% Brady, 10% Copilot (v0.9.1 scramble), 25% team.

**Key patterns identified:**
- Preflight gate (dependency scanning + semver validation) prevents dependency defects
- Implicit ordering risk: squad-release and squad-npm-publish both trigger on `release: published` with no explicit job dependency (works but fragile)
- Ghost workflow cleanup: GitHub's workflow index caches file names; deletion doesn't immediately invalidate; must wait 15+ minutes or manually refresh

**Preflight job pattern:** Scans `packages/*/package.json` for:
1. `file:` references (breaks published packages)
2. Invalid semver versions (rejects malformed versions)
Runs before smoke-test and all publish operations. Zero-cost gate (JSON reads only). Clear error messages with remediation instructions.

### CI Pipeline Status
149 test files, 3,931 tests passing, ~89s runtime. Only failure: aspire-integration.test.ts (needs Docker daemon — pre-existing, expected). publish.yml triggers on `release: published` event with retry logic for npm registry propagation (5 attempts, 15s sleep).

### Known CI Patterns
SKIP_BUILD_BUMP=1 environment variable intended to prevent version mutation during CI builds. Currently unreliable — bump-build.mjs ignores it in some code paths. NPM_TOKEN must be Automation type (not user token with 2FA) to avoid EOTP errors in publish workflow.

### Workflow Inventory
9 load-bearing workflows (215 min/month) must stay as GitHub Actions. 5 migration candidates (12 min/month) could move to CLI: sync-labels, triage, assign, heartbeat, validate-labels.

### Container Smoke Test Patterns
`npm pack` generates tarballs installable in clean containers for pre-publish validation. GitHub Actions containers (node:20-slim, node:22) suitable for smoke tests. No devcontainer config exists yet. Current CI budget: ~227 min/month. Container smoke test adds ~2-5 min per run. Tier 1 smoke test commands: `--version`, `--help`, `doctor`, `status`, `export`. CLI has 31 commands; 15 are user-facing smoke test candidates. cli-command-wiring.test.ts catches unwired commands at build time (issues #224, #236, #237).

### Smoke Test Gating in Publish Pipeline
Smoke tests now run as a dedicated `smoke-test` job in publish.yml before any npm publish operations. Both publish-sdk and publish-cli jobs depend on smoke-test passing. Prevents publishing broken CLI packages to npm. Smoke test runs `npx vitest run test/cli-packaging-smoke.test.ts` after a full build. Test takes ~30-60s for pack+install validation.

### CI Pipeline Hardening — March 20, 2026

**Changes shipped in commit 6cbabb5 (dev branch):**

1. **`edited` trigger added** — `pull_request` event types now include `edited`. Previously, retargeting a PR from `main→dev` would not refire CI because the base branch change uses the `edited` event type. Six PRs (#470, #469, #468, #467, #454, #451) were manually close/reopened to compensate.

2. **Lockfile lint step added** — New step `Lint lockfile for stale workspace entries` runs before `npm ci` in the `test` job. Uses Node inline script to detect any `packages/*/node_modules/@bradygaster/squad-*` entries in `package-lock.json` that have an `https://` resolved URL (indicating a stale nested registry copy shadowing the workspace symlink). Exits with error code + remediation instructions if found. This catches the TypeScript type-mismatch class of failures at the lockfile level, not at build time.

3. **Default branch changed to `dev`** — Repo default branch switched from `main` to `dev` via GitHub API. Community PRs now naturally target `dev`.

**Pattern confirmed:** The `edited` event gap was the exact reason retargeted PRs were not getting CI runs. Any future PR base-branch change will now trigger a fresh CI run automatically.

### CI Failure Pattern Analysis — March 15, 2026
Analyzed 20 CI runs from March 15. Identified 3 distinct failure categories:

**1. TypeScript Build Failures — SDK/CLI Type Mismatches (Most Critical)**
- 7+ consecutive failures on `squad/fix-ci-build` branch (14:00-14:11 UTC)
- Root cause: Stale nested SDK entry in package-lock.json causing TypeScript module resolution errors
- Error: "Module '@bradygaster/squad-sdk' has no exported member 'listRoles'" (and 6 other missing exports)
- Impact: Build failures blocked all PRs attempting to fix roles/cast features
- Fix: Removing stale lockfile entry resolved TypeScript resolution
- Pattern: Workspace dependency mismatches not caught until CI build phase

**2. Documentation Quality Gate Failures — New Validation Rules**
- 3 failures on `squad/docs-quality-ci` branch (14:32, 15:26, 15:51 UTC)
- Issue 1: Broken anchor link `../guide.md#troubleshooting` (anchor doesn't exist)
- Issue 2: Spell check failure for username "benleane" in notifications.md (not in cspell dictionary)
- Impact: New docs-quality job blocked merges when introducing new validation gates
- Pattern: Adding stricter CI gates without pre-validation of existing content creates immediate failures

**3. Test Failures — ES Module Migration Side Effects (Legacy)**
- 1 failure on main branch (13:59 UTC) — "deleted images" commit
- Root cause: 8 test files using `require()` in ES module context
- Error: "require is not defined in ES module scope" (node:test imports)
- Impact: Old test files incompatible with `"type": "module"` in package.json
- Pattern: Incomplete ESM migration left test files in CommonJS syntax

**Key Observations:**
- **Failure clusters**: Multiple consecutive failures trying to fix same root issue (TypeScript build: 7 attempts, docs-quality: 3 attempts)
- **Validation timing**: New validation gates (docs-quality CI) introduced without pre-testing against current codebase state
- **Workspace complexity**: Monorepo TypeScript workspace dependencies prone to lockfile staleness
- **Branch health**: dev branch had 2 failures (last failure: spell check), currently yellow/orange status

**Recommended CI Improvements:**
1. Pre-merge lockfile validation check (detect stale nested dependencies)
2. Docs validation dry-run before adding new quality gates
3. TypeScript workspace reference health check (catch SDK/CLI type mismatches early)
4. Better failure grouping/attribution in CI UI (distinguish "new gate" vs "regression")
5. Spell check dictionary maintenance workflow (easier to add known-good usernames/terms)

### CI Workflow Audit — March 23, 2026

**Status:** Conducted full audit of 15 workflow files. Brady's perception ("complete nightmare, 12,000 workflows") is not accurate — the codebase is lean, well-organized, and 99% authored by Brady (bradygaster + Copilot).

**Key Findings:**
- **Total workflows:** 15 (7 load-bearing core, 7 admin/automation, 1 ghost)
- **Authorship:** bradygaster 46 commits (65%), Copilot 7 (10%), team 17 (24%)
- **v0.9.1 Scramble:** Copilot made 4 commits on 2026-03-23 trying to work around GitHub platform bug (workflow_dispatch returns 422 after file renames/deletes)
- **Ghost file identified:** `publish-npm.yml` (deleted but still in GitHub's workflow cache) → requires manual deletion via API
- **Zero duplication:** Each workflow has clear, non-overlapping responsibility
- **One optional cleanup:** `ci-rerun.yml` (useful but not essential)

**Release Pipeline Quality:**
- Core pipeline (squad-ci → squad-release → squad-npm-publish → insider-*) is solid
- Smoke tests run before any npm publish (good safety gate)
- Implicit ordering works but fragile (squad-npm-publish depends on release: published event)

**Triage Automation Quality:**
- Label routing (squad-triage, squad-issue-assign, squad-label-enforce) well-integrated
- Ralph heartbeat has cron disabled (event-driven only)
- Works correctly with @copilot assignment

**Recommendation:** Delete ghost publish-npm.yml file, optionally keep ci-rerun for fork PR debugging, keep everything else. CI health is good.

**Report written to:** `.squad/decisions/inbox/booster-ci-audit.md`

### CI Cleanup & Hardening — Post-Audit

**Changes shipped:**

1. **Ghost workflow disabled** — `publish-npm.yml` (workflow ID 250121956) disabled via GitHub API (`PUT /actions/workflows/{id}/disable`). GitHub doesn't support DELETE on workflow entries; disable is the permanent fix.

2. **Pre-publish `preflight` job added** to `squad-npm-publish.yml`:
   - Scans ALL `packages/*/package.json` for `file:` references across all dependency sections (dependencies, devDependencies, optionalDependencies, peerDependencies)
   - Validates all package versions are valid semver
   - Runs BEFORE smoke-test and all publish jobs — blocks the entire pipeline if violations found
   - This is the gate that would have caught the v0.9.1 incident

3. **Smoke test enhanced** — Added `npm pack --dry-run` validation step for both SDK and CLI packages before the vitest smoke tests run

4. **ci-rerun.yml retained** — Added purpose documentation comment. Still useful for fork PR re-testing and infrastructure flake recovery.

5. **YAML fix** — Quoted `file:` in step names that were causing YAML parse ambiguity (both new and pre-existing)

**Pipeline dependency chain:** `preflight → smoke-test → publish-sdk → publish-cli`

### Comment Spam Protection — July 2026

**Context:** Spam account (`nkleadproofficial-del`) posted recruitment ad on PR #725. No automated moderation existed.

**Solution:** Added `squad-comment-moderation.yml` — a GitHub Action auto-moderator using multi-signal scoring:
- Triggers on `issue_comment` and `pull_request_review_comment` (created)
- Checks: account age (<7d), repo association (NONE), recruitment keywords, crypto/SEO spam, URL density, comment length
- Scoring threshold: score ≥ 5 required (prevents false positives from single signals)
- Actions: minimize (hide) comment via GraphQL API, post moderation notice
- Trusted users (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR) are always skipped

**Key design decision:** Chose action-based approach over GitHub native interaction limits. Native limits are too coarse — they block all first-time contributors. The scoring system requires multiple spam signals to combine, so legitimate first-time contributors are never affected.

**Files:** `.github/workflows/squad-comment-moderation.yml`, `docs/proposals/comment-spam-protection.md`, `CONTRIBUTING.md` (moderation notice added).

**Issue:** #751, **PR:** #753

### PR #752 Pagination Fix — July 2026

**Context:** Review feedback on PR #752 (squad-pr-readiness.yml) identified that `checks.listForRef` used `per_page: 100` without the `github.paginate()` wrapper. PRs with 100+ check runs could silently miss checks, causing false "CI passing" results.

**Fix:** Wrapped `checks.listForRef` in `github.paginate()` and updated the response access from `checkRuns.check_runs` to the flat paginated array. This matches the existing pagination pattern used for commits, reviews, files, and comments in the same workflow.

**Pattern:** All list API calls in GitHub Actions scripts should use `github.paginate()` — even when 100 results seems "enough." CI pipelines with many matrix jobs, reusable workflows, or external integrations can easily exceed 100 check runs.
