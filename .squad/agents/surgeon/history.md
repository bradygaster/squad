# SURGEON

> Flight Surgeon

## Learnings

### Release Governance Rules (2026-03-23 v0.9.0→v0.9.1 Incident)
**Context:** v0.9.0 published with critical defect (CLI package had local monorepo reference instead of registry version). v0.9.1 hotfix prepared in minutes; publish workflow infrastructure collapsed (GitHub cache race + npm automation issue + 2FA hang), extending 10-minute fix to 8-hour incident.

**Governance rules established:**
1. **Surgeon owns all publishing.** Not Coordinator, not user. All release work routed to Surgeon. Coordinator escalates on failures.
2. **Strict process adherence.** Same playbook every time. No improvisation. Written checklists mandatory.
3. **Document to prevent recurrence.** If same problem happens twice, documentation failed. Root cause analysis + action items for every incident.
4. **CI/CD is top priority.** Release quality determines team effectiveness. Invest in automation, testing, pre-flight validation.
5. **Pre-flight gates mandatory.** Before any release tagging: validate dependencies, run smoke tests, verify versions, check 2FA settings, run dry-run installs.
6. **Escalation protocol.** If workflow fails twice, switch to local publish immediately. Two fallback paths: primary (CI/CD) + fallback (local), both documented.

**Action items (A1–A6):**
- A1: Dependency validation in publish workflow (scan for `file:` refs, npm install dry-run)
- A2: npm workspace publish policy (never `-w` for publish; 2FA auth-only)
- A3: GitHub workflow cache mitigation (15+ min wait documented, escalation runbook)
- A4: Publish fallback protocol (switch to local on 2nd failure)
- A5: Release readiness checklist (pre-flight validation before tagging)
- A6: Post-publish smoke test (mandatory global install verification)

**Release process skill created:** `.squad/skills/release-process/SKILL.md` documents all patterns and procedures.

### v0.9.0 CHANGELOG Organization (2026-03-23)
v0.9.0 is MAJOR minor bump (0.8.25 → 0.9.0) justified by 40+ commits, 6+ major features, governance layer, breaking behavioral changes. Organized by feature cluster (not chronological):
- Personal Squad, Worktree, Machine Capability Discovery, Rate Limiting, Economy Mode, Telemetry, Templates, Skills, Docs, ESLint patterns
- 12 feature sections + 5 fix categories
Strict format adherence: matched existing CHANGELOG headers, `### Added` pattern, PR refs (#NNN), grouped by domain. No npx, no "agency" terminology.

### Release History
v0.8.24 released successfully. npm packages: @bradygaster/squad-sdk@0.8.24, @bradygaster/squad-cli@0.8.24. publish.yml triggers on `release: published` (NOT draft). Test baseline at release: 3,931 tests, 149 files.

### Version Mutation Bug (P0)
bump-build.mjs mutates versions during local builds despite SKIP_BUILD_BUMP=1 and CI=true env vars. Workaround: set versions with `node -e` script and commit IMMEDIATELY before building. This is a P0 fix item in docs/proposals/cicd-gitops-prd.md.

### Known Incidents
v0.8.22: 4-part version 0.8.21.4 mangled by npm to 0.8.2-1.4. v0.8.23: versions reverted from 0.8.23 to 0.8.22 during build despite env vars. Both resolved with the node -e script + immediate commit workaround.

### v0.9.0 CHANGELOG Written
**Date:** 2026-03-23

v0.9.0 is a MAJOR minor version bump (0.8.25 → 0.9.0) justified by 40+ commits spanning 6+ major features and governance-layer additions. CHANGELOG organized across 12 feature sections + fixes:

**Feature Categories:**
- Personal Squad (governance layer + ambient discovery)
- Worktree Spawning & orchestration
- Machine Capability Discovery
- Cooperative Rate Limiting & circuit breaker
- Economy Mode (cost-conscious model selection)
- Auto-wire Telemetry
- Issue Lifecycle & KEDA templates
- Session Recovery skill
- GAP analysis verification loop
- GitHub Auth Isolation skill
- Astro docs site improvements (10 items)
- Skill migrations (.squad → .copilot)
- ESLint runtime anti-pattern detection

**Fixes:**
- CLI terminal rendering (scroll flicker, Ink remounting)
- Upgrade path & installation (P0 gaps, EPERM handling, template alignment)
- ESM compatibility (Node 22/24 vscode-jsonrpc fixes)
- Runtime stability (signal handling, race conditions, timeouts, memory safety)
- GitHub integration (CI hardening, casting alignment)

**Documentation:** Maintained strict format rules (no npx refs, no "agency" terminology, matched existing CHANGELOG style, grouped by feature subsections). CLI Terminal Rendering fixes kept from [Unreleased] as part of 0.9.0.

### v0.9.0 → v0.9.1 Release Retrospective
**Date:** 2026-03-23

**Executive Summary:** v0.9.0 published with critical defect—CLI package.json contained `"@bradygaster/squad-sdk": "file:../squad-sdk"` (local monorepo reference instead of registry version). Package broken on global install. v0.9.1 hotfix prepared in minutes but publish workflow infrastructure failures extended resolution to 8 hours (should have been 10 minutes).

**Root Causes:**
1. **Dependency Validation Gap** — No pre-publish check for `file:` references. npm workspaces automatically rewrite `"*"` → `"file:../path"` during development; this persisted in published package.
2. **GitHub Actions Workflow Cache Race Condition** — After deleting `squad-publish.yml`, GitHub workflow index didn't refresh for 10+ minutes. `workflow_dispatch` returned 422 error that persisted despite file deletion.
3. **npm Workspace Publish Broken** — `npm -w packages/squad-sdk publish` hung indefinitely (2FA auth issue on machine without authenticator app).
4. **Coordinator Decision-Making** — Retried broken `workflow_dispatch` 4+ times instead of escalating to local publish fallback sooner.

**Key Action Items:**
- A1: Add dependency validation to publish workflow (scan for `file:` refs, dry-run npm install)
- A2: Establish npm publish policy (never use `-w` for publishing; always `cd` into package directory)
- A3: Mitigate GitHub Actions cache race condition (document 15-min wait; escalate to local publish on 2nd failure)
- A4: Define publish fallback/escalation protocol (2nd workflow failure → immediate local publish)
- A5: Pre-release readiness checklist (dependency scan, CHANGELOG, tests, 2FA verify)
- A6: Post-publish smoke test (run global install; rollback if fails)

**Process Changes:**
- Change-1: Pre-publish validation mandatory (before tagging)
- Change-2: Simplified publish flow (remove manual `workflow_dispatch`; let tag trigger workflow)
- Change-3: Explicit runbook in PUBLISH-README.md (no tribal knowledge)
- Change-4: Escalation to fallback (fail-fast instead of retry loops)
- Change-5: Package validation in CI (ESLint rule to reject `file:` refs)

**Documentation:** Full retrospective in `.squad/decisions/inbox/surgeon-v091-retrospective.md` and `.squad/log/2026-03-23-v091-retrospective.md`.

**Status:** Approved for implementation. v0.9.1 published successfully (both packages verified live on npm).

---

### Release Playbook & CI Improvement Plan (2026-03-23)

Prepared comprehensive release playbook and CI improvement plan for Brady's review:

1. **Release Playbook** — Full step-by-step release procedure covering:
   - Pre-release checklist (dependency validation, tests, CHANGELOG, versions, npm auth)
   - Release execution (12 numbered steps from version bump to smoke test)
   - Fallback procedures (422 errors, 2FA timeouts, deployment failures, rollback)
   - Post-release verification checklist
   - Non-negotiable rules (no improvisation, no draft releases, no 4-part versions, etc)
   - Known gotchas (npm workspaces auto-rewrite, workflow cache TTL, 2FA hanging)

2. **CI Improvement Plan** — 7 GitHub issues + 4 CI cleanup actions:
   - Issue A: Dependency validation gate (scan for `file:` refs before publish)
   - Issue B: npm publish policy (never use `-w`, always `cd` + `--ignore-scripts`)
   - Issue C: Workflow cache mitigation (15-min wait, escalation policy)
   - Issue D: squad-promote workflow (dev → preview → main automation)
   - Issue E: squad-preview validation (forbidden files, versions, dependencies)
   - Issue F: squad version command fix (show correct CLI version)
   - Issue G: Escalation policy documentation (2nd failure → local publish)
   - CI cleanup: Delete ghost workflows, add pre-commit hooks, verify SKIP_BUILD_BUMP, audit NPM_TOKEN

3. **Session Log Cleanup** — Deleted 17 files from today's session logs:
   - 15 files from `.squad/orchestration-log/`
   - 2 files from `.squad/log/`
   - Preserved retro findings in `.squad/decisions/inbox/` (surgeon-v091-retrospective.md)
   - No agent history.md files deleted

**Key Lessons Learned:**
- Release playbook must be exhaustively detailed with no room for improvisation
- Fallback procedures are critical (workflow failures happen; escalate fast)
- Pre-release validation prevents 90% of publish issues
- Culture: "If the same problem happens twice, the playbook failed"
- Documentation must be user-first (Brady's perspective, not technical jargon)

### Insider Release v0.9.5-insider.2 (2026-05-04)
- Branch push target: `dev -> insider`
- Version bump committed as `chore: bump version to 0.9.5-insider.2`
- Pre-publish validation passed: no `file:`/`link:` refs in `packages/*/package.json`; semver valid
- Build issue encountered locally: `packages/squad-cli/node_modules/@bradygaster/squad-sdk` resolved to published `0.9.4`; removing the nested package restored workspace resolution and allowed `npm run build` to pass
- Windows test validation needed environment isolation: use a no-space Node path (`C:\src\squad\.nodebin`) plus temp root outside the repo/home tree (`C:\src\squad-release-tmp`) to avoid false failures in scheduler/team-root/init/upgrade tests; remaining suite failures were flaky timeouts that passed on targeted rerun
