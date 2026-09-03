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

### Release Process Skill Update — v0.9.4 Learnings (2026-04-25)

Updated both release-process skill files (`.squad/skills/release-process/SKILL.md` and `.copilot/skills/release-process/SKILL.md`) with critical learnings from the v0.9.4 release session. Added 5 new Known Gotchas, a full `v0.9.4 Incident Learnings` section, GITHUB_TOKEN propagation workaround, CHANGELOG/root-package.json validation rules, lockfile integrity fix documentation, local dev recovery steps, and cross-references between skill files. Source PRs: #1042, #1043, #1044.

### CI Cleanup — Issue #1000 (2026-04-17)

**Changes shipped in PR #1001:**

1. **Deleted `ci-rerun.yml`** — Redundant fork PR workflow with 100% failure rate (5/5 runs). GitHub's native "Approve and Run" handles fork PR CI. Removed reference from `setup-squad-node` comment header.

2. **Streamlined `squad-ci.yml`** — 852 → 585 lines, 9 → 6 jobs:
   - **Merged** `exports-map-check` + `export-smoke-test` → single `sdk-exports-validation` job (saves one runner boot, deduplicates checkout/setup/change-detection)
   - **Folded** `publish-policy` + `scope-check` into `policy-gates` as additional gate steps (saves two runner boots)
   - **Added** `workflows` output to `changes` path filter (policy-gates now properly skips on docs-only PRs)
   - **Trimmed** verbose local-testing instruction comments and skip-labels reference block
   - **Preserved** all genuine safety checks — no gates removed, only consolidated

**Key decisions:**
- Merging exports-map-check + export-smoke-test is safe because they share identical prerequisites (SDK change detection, feature flags, skip labels) and both only need SDK build
- publish-policy (static grep of workflow files) fits naturally in policy-gates since it's a lightweight lint
- scope-check (label-gated) works inside policy-gates because the step has its own `if` condition for the `repo-health` label

**Files modified:**
- `.github/workflows/ci-rerun.yml` (deleted)
- `.github/actions/setup-squad-node/action.yml` (comment update)
- `.github/workflows/squad-ci.yml` (streamlined)

### Workflow Shellcheck SC2086 Fix + Actionlint CI Gate (2026-07-29T17:11:56+10:00)

**Context:** Issue #1556 (bradygaster/squad) reported SC2086 failures in downstream repos using actionlint after `squad upgrade`. The unquoted `>> $GITHUB_OUTPUT` redirects in `squad-heartbeat.yml` were the reported trigger; audit revealed matching issues in `squad-repo-health.yml` and `squad-ci.yml` too.

**Changes shipped:**

1. **SC2086 fixes — all `>> $GITHUB_OUTPUT` and `>> $GITHUB_STEP_SUMMARY` redirects quoted** in:
   - `.squad-templates/workflows/squad-heartbeat.yml` (canonical source, synced to 3 mirrors by build)
   - `templates/workflows/squad-heartbeat.yml`, `packages/squad-cli/templates/workflows/squad-heartbeat.yml`, `packages/squad-sdk/templates/workflows/squad-heartbeat.yml` (mirrors)
   - `.github/workflows/squad-heartbeat.yml` (active workflow, maintained separately per SYNC comment)
   - `.github/workflows/squad-repo-health.yml` (4 run blocks, 10 lines total)
   - `.github/workflows/squad-ci.yml` (1 large gate block, 13 lines total)

2. **New CI workflow:** `.github/workflows/squad-workflow-lint.yml`
   - Installs actionlint 1.7.12 + installs shellcheck 0.10.0 explicitly (ubuntu-latest ships 0.9.0)
   - Lints `.github/workflows/*.yml` AND both template directories via explicit file paths
   - Triggers on `pull_request` + `push` to dev/main with `paths:` filter
   - Follows repo conventions: ubuntu-latest, `permissions: contents: read`, concurrency group

3. **Changeset:** `.changeset/fix-workflow-shellcheck-quoting.md` — patch for squad-cli + squad-sdk (required because template files under `packages/squad-*/templates/` are covered by changelog-gate regex)

**Key learnings:**
- The canonical workflow template source is `.squad-templates/workflows/` — fix templates THERE and the mirrors are auto-synced by `node scripts/sync-templates.mjs` during `prebuild`
- `.github/workflows/squad-heartbeat.yml` is maintained separately (SYNC comment at top of file) — must also be patched manually
- Template files can be linted by actionlint via explicit file paths — no need to copy them into `.github/workflows/` as a temp dir
- `npm run build` fails in this worktree environment due to missing TypeScript compiler (SSL install failure); the prebuild/sync phase succeeded and changes are correct YAML
- The `pull_request_target` context in `squad-repo-health.yml` uses only SHA values (not user-controlled text), so actionlint should NOT flag those as untrusted-input warnings

**Part 2 deferred:** The `actions/checkout` v7→v4 clobbering on upgrade (the other regression in #1556) is out of scope for this PR and handled separately.

### Actionlint CI Gate Gap Closure (2026-07-29T17:11:56+10:00 — follow-up)

**Context:** Review identified two gaps in the squad-workflow-lint.yml shipped in the previous commit.

**Gap 1 fixed:** `.squad-templates/workflows/` (canonical source, 11 files) and `templates/workflows/` (root mirror) were listed in `paths:` filters but had no corresponding lint steps. Added two new steps — "Lint canonical template source" and "Lint root mirror template workflows". Decision: lint all five directories from committed state (no sync step). Rationale: (a) bugs in canonical source are caught by the canonical lint step before sync propagates them; (b) mirror drift is already enforced by `template-sync.test.ts` as a separate gate. Sync-then-lint would test derived content, not what's committed.

**Gap 2 fixed:** Installer script was fetched from `https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash` — a moving ref, unpinned RCE surface. Pinned to `v1.7.12` tag URL (verified: `raw.githubusercontent.com/rhysd/actionlint/v1.7.12/scripts/download-actionlint.bash` returns HTTP 200).

**Shellcheck version:** ubuntu-latest ships shellcheck 0.9.0 (apt package `shellcheck 0.9.0-1`, confirmed in runner image README). Installed shellcheck 0.10.0 explicitly from GitHub releases (`shellcheck-v0.10.0.linux.x86_64.tar.xz`) to match the version cited in the original SC2086 reports.

**Commit:** 1b1af6e3, pushed to `serbrech/squad`.

### Installer Hardening — PR Review Comments (2026-07-29T19:25:08+10:00)

**Context:** Copilot automated reviewer left 3 inline comments on PR #1557 (`squad-workflow-lint.yml` installer step + history.md). All valid and in scope.

**Changes shipped:**

1. **`bash <(curl -sL ...)` → download-then-run** (`squad-workflow-lint.yml` actionlint install):
   - Replaced process substitution with `curl -fsSL ... > install-actionlint.bash && bash install-actionlint.bash && rm install-actionlint.bash`
   - `-f` makes curl hard-fail on non-200 (e.g. 404 returns exit 22, not exit 0 with HTML body fed to bash)
   - Named file is inspectable on failure; process substitution leaves no artifact
   - `-s` (silent) retained via `-fsSL` to suppress progress noise while preserving all error signals

2. **`set -euo pipefail` + `curl -fsSL` for shellcheck tar pipeline** (`squad-workflow-lint.yml`):
   - Added `shell: bash` + `set -euo pipefail` at top of the install step
   - GitHub Actions `run:` uses `bash -e` by default, NOT `-o pipefail`; curl failure in a `curl | tar` pipeline is masked by tar's exit status without it
   - `-f` on shellcheck curl: same hard-fail-on-non-200 rationale
   - Convention matched: `shell: bash` + `set -euo pipefail` inside run block, same as `squad-agents-ai-release.yml` (lines 76-78 and 135-139) and `squad-npm-publish.yml` (line 409)

3. **History.md stale entry corrected** (line 174):
   - Changed `Installs actionlint 1.7.12 + uses runner shellcheck` → `Installs actionlint 1.7.12 + installs shellcheck 0.10.0 explicitly (ubuntu-latest ships 0.9.0)`
   - The old text was a stale artifact from the first iteration; lines 196-198 of this same file already documented the correct 0.10.0 explicit install

**Validation:** `bash -n` passes on the new run block. Self-linting property holds — actionlint + shellcheck will lint this exact `run:` block on the next CI run, catching any quoting or syntax issues we introduce. Amended and force-pushed to `serbrech/squad` as a single commit.


---

## Appended during 2026-09-03 reskill (moved out of history.md to stay within budget)

### gh-aw Issue Triage — 2026-08-20 Pre-E2E Audit

**Issues reviewed:** #1748 (Allow dependency additions without bypassing protected-file safety), #1763 (Decide whether to drop `bots:` from squad.md)

**#1763 — Decision recorded, issue CLOSE:**
- `bots: ["github-actions[bot]"]` lives at `workflows/squad.md:8` and `workflows/squad-implement-worker.md:7`
- Merge-continuation uses `pull_request: types: [closed]` — NOT a slash-command bot comment. Removing `bots:` would not affect continuation at all.
- Warning is compile-time only (`gh aw add`), not runtime. The concurrency scenario it describes (bot-posted `/squad` comment) does not occur in current workflows.
- Tests at `test/gh-aw-implement-workflow.test.ts` lines 102–115 assert `bots:` is present.
- Issue sequencing note places this at Wave 5, depends on #1772 being fixed first.
- Decision written to `.squad/decisions/inbox/booster-bots-field-squad-md.md`: keep `bots:`, accept the warning.
- **Does NOT block tomorrow's E2E.**

**#1748 — DEFER (still thrashing, Wave 2 but depends on #1762):**
- 3 comments show active design discussion, not convergence. Brady inverted Option 2 to default-on (allow dependency additions, deny is opt-out). Third commenter introduced a diff-classification axis (new-dependency vs version-bump vs removed) that is not resolved.
- Protected-files SKILL.md covers Squad CLI bootstrap files (zero-dependency Node core files) — different concern from gh-aw manifest protection. No conflict.
- Issue has `Depends on: #1762` per sequencing comment. #1762 not yet resolved.
- Safe to defer past tomorrow's E2E.
