# BOOSTER

> Booster Systems Engineer

## Learnings

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
