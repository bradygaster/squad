# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Core Context — Trejo's Focus Areas

**Release Manager:** Trejo owns end-to-end release orchestration, semantic versioning (3-part ONLY), GitHub Release creation (NEVER as draft), changelog management, and pre/post-release validation. Pattern: checklist-first releases — every release follows the same validated process to prevent disasters.

## Lessons from Kobayashi's Failures

Trejo was created to replace Kobayashi after the v0.8.22 release disaster. These lessons are foundational to Trejo's approach:

### 📌 v0.8.22 Release Disaster — 2026-03-07

**THE WORST RELEASE IN SQUAD HISTORY.** Multiple cascading failures that broke the `latest` dist-tag for 6+ hours.

**What went wrong:**
1. **Invalid semver:** Committed version 0.8.21.4 (4-part) without validation. npm mangled it to 0.8.2-1.4 (major.minor.patch-prerelease).
2. **Draft release didn't trigger automation:** Created GitHub Release as DRAFT, which doesn't emit `release: published` event. publish.yml never ran automatically.
3. **Wrong NPM_TOKEN type:** NPM_TOKEN was a User token with 2FA enabled. CI failed 5+ times with EOTP errors.
4. **bump-build.mjs ran during release:** Ran locally 4 times during debugging, silently mutating version from 0.8.21 → 0.8.21.4.
5. **No retry logic in verify steps:** npm propagation delay caused false 404 failures even when publish succeeded.

**Root cause:** No release runbook. Kobayashi improvised. Improvisation during releases = disaster.

**Lessons learned (hard):**
1. **Process documentation prevents disasters.** No release without a runbook = no release. Period.
2. **Semver validation is mandatory.** 4-part versions (0.8.21.4) look valid to humans but npm mangles them. Must run `semver.valid()` before ANY commit.
3. **Token types matter.** User tokens with 2FA ≠ Automation tokens. Verify token type BEFORE first publish attempt.
4. **Draft releases are a footgun.** The difference between "draft" and "published" is invisible in the UI but breaks automation.
5. **Validation gates catch mistakes before they ship.** No more trusting package.json versions. Validate everything.
6. **Releases need checklists, not creativity.** Agents need process discipline for critical flows.

**What we shipped:**
- Comprehensive retrospective: `.squad/decisions/inbox/keaton-v0822-retrospective.md`
- Release process skill: `.squad/skills/release-process/SKILL.md` — definitive step-by-step runbook with validation gates, rollback procedures, common failure modes
- Two new agents: Trejo (Release Manager) and Drucker (CI/CD Engineer) to replace Kobayashi with separation of concerns

**Never again.** This was bad. We own it. We fixed it. We document it so future teams learn from it.

## Release Process Skill

The definitive release runbook lives at `.squad/skills/release-process/SKILL.md`. Every release follows this checklist:

**Pre-Release Validation:**
1. Version number validation (semver.valid() check)
2. NPM_TOKEN verification (Automation token, not User token with 2FA)
3. Branch and tag state verification
4. Disable bump-build.mjs (SKIP_BUILD_BUMP=1)

**Release Workflow:**
1. Version bump (all 3 package.json files in lockstep)
2. Commit and tag
3. Create GitHub Release as PUBLISHED (NOT draft)
4. Monitor publish.yml workflow
5. Verify npm publication
6. Test installation
7. Sync dev to next preview version

**Common Failure Modes:**
- EOTP error = wrong NPM_TOKEN type (use Automation token)
- Verify step 404 = npm propagation delay (workflow has retry logic now)
- Version mismatch = package.json version doesn't match tag
- 4-part version mangled = NOT valid semver (use semver.valid() before commit)
- Draft release didn't trigger workflow = drafts don't emit `release: published` event

## Learnings

### 2026-03-12: Release Readiness Assessment for v0.8.24

**Context:** Brady requested release readiness assessment — "show what you can do" for first real release post-Kobayashi disaster. Full system check: versions, branches, tests, build, changelog, blockers.

**What I assessed:**
1. **Version state** — All 3 package.json files at 0.8.23, npm registry matches, git tags consistent
2. **Branch state** — main clean (no uncommitted changes), dev 7 commits ahead (expected for integration branch)
3. **Test baseline** — 3811 tests passing, 0 failures, 3 intentional skips (ALL GREEN)
4. **Build check** — Build succeeds, SKIP_BUILD_BUMP=1 properly prevents bump-build.mjs mutation
5. **Changelog** — v0.8.23 entry exists but claims to fix #265 (issue still OPEN — discrepancy found)
6. **Release blockers** — Issue #265 (Node 24+ ESM crash) identified as critical blocker pending verification
7. **Pre-flight checklist** — Walked through release-process skill, 4/5 gates green, NPM_TOKEN verification pending

**Critical findings:**
1. **Changelog discrepancy** — CHANGELOG.md claims v0.8.23 fixed issue #265 (Node 24+ ESM import crash), but issue is STILL OPEN with users reporting the bug as of 2026-03-08. No linked PR to verify the fix. Needs verification before v0.8.24 release.
2. **Issue #265 is a release blocker** — Affects `squad init` on Node 24+ and GitHub Codespaces (fresh installs crash with ERR_MODULE_NOT_FOUND). If v0.8.23 didn't actually fix this, users on modern Node can't use Squad.
3. **Issue #267 (credential leak) is NOT a blocker** — Serious security issue but doesn't affect new installs or upgrades. Can be mitigated via charter updates while engineering proper fix.
4. **v0.8.23 already published** — Next release is v0.8.24 (proposed). Version validated via semver.valid().

**Proposed release plan:**
- **Option A:** Release v0.8.24 immediately if #265 is verified fixed (1-2 days)
- **Option B:** Fix #265 in v0.8.24 if v0.8.23 didn't fix it (3-5 days)
- **Recommendation:** Verify #265 status ASAP, then decide path

**Learnings:**
1. **Changelog must be source of truth** — Discrepancies between changelog and issue state create confusion. If changelog claims a fix, the issue should be closed with verification.
2. **Test Node version compatibility** — ESM import issues are Node-version-specific. Release testing should cover both Node LTS and latest.
3. **Verify fixes before claiming them** — Never document a fix in the changelog without a linked PR or commit SHA. Verifiability matters.
4. **Distinguish release blockers from serious bugs** — Not every open issue blocks a release. Issue #267 is serious but doesn't affect the upgrade path or new installs — can be fixed in follow-up.
5. **Clean state makes assessment easier** — Having zero uncommitted changes, green tests, and clean build meant I could focus on blockers instead of debugging local state.

**Output:** Comprehensive release readiness report at `.squad/decisions/inbox/trejo-release-readiness.md` with version proposal (0.8.24), blocker analysis, pre-flight checklist status, and 3 release path options.

**What worked:**
- Parallel data gathering (versions, tags, branch state, tests, build) was efficient
- Walking through the release-process skill checklist revealed NPM_TOKEN verification gap
- Test/build validation proved the system is mechanically ready (just needs scope clarity)

**What I'd do differently next time:**
- Check issue comments more thoroughly — if changelog claims a fix, verify closure status
- Test the actual fix (e.g., run `npx @bradygaster/squad-cli init` on Node 24+) instead of just reading issue thread
- Include a "What's new since last release?" section (git log between tags) to define v0.8.24 scope

---

### 2026-03-07: First task — Release & GitOps audit for CI/CD PRD

**Context:** Brady requested comprehensive audit of release and GitOps state to feed into CI/CD improvement PRD. Drucker auditing CI/CD pipelines separately.

**What I audited:**
1. Branching model (dev/main/insiders state, protection rules, divergent histories)
2. Version state (main: 0.8.22, dev: 0.8.23-preview.1, npm registry consistency)
3. Tag hygiene (33 tags total, found invalid semver tag v0.8.6.15-preview-insider+5664fd0)
4. GitHub Releases (last 10 releases, no drafts, automated creation working)
5. Release process gaps (post-Kobayashi disaster, automation missing)
6. package-lock.json state (npm ci works but triggers bump-build.mjs)
7. Workflow audit (14 active workflows, found duplicates and dead references)
8. Branch protection rules (main protected, dev NOT protected)

**Critical findings (P0):**
1. **dev branch unprotected** — Primary integration branch has NO protection (anyone can force-push, bypass review)
2. **Tests blocking releases** — 8 test files fail due to ESM `require()` misuse; squad-release.yml blocked
3. **bump-build.mjs still runs in CI** — Despite `CI=true` check, version mutated during `npm ci` (0.8.22 → 0.8.22.1)
4. **No automated semver validation** — Nothing prevents 4-part versions from being committed (root cause of v0.8.22 disaster)

**Learnings:**
1. **Live audits are dangerous** — Running `npm ci` during audit mutated 3 package.json files (had to `git checkout .` to restore)
2. **CI=true is not enough** — bump-build.mjs checks `process.env.CI === 'true'` but still executed during npm prepare lifecycle (environment variables may not propagate to child scripts)
3. **Branch naming matters** — Found both `insider` (stale) and `insiders` (active) branches; workflows reference `insider` but team uses `insiders` — inconsistency causes confusion
4. **Preview branch is ghost architecture** — squad-promote.yml and squad-preview.yml reference a `preview` branch that doesn't exist; unclear if planned or abandoned
5. **Dist-tags decay** — npm `preview` dist-tag still points to 0.8.17-preview (pre-disaster), `insider` points to 0.6.0-alpha.0 (ancient); if dist-tags aren't maintained, they mislead users
6. **Workflow archaeology needed** — Found duplicate workflow IDs (publish.yml and squad-publish.yml both active), deprecated file exists (squad-publish.yml.deprecated), suggests rename history; need to deduplicate
7. **Tests gate everything** — squad-release.yml runs tests before release, but tests currently fail (8/8 fail); broken tests block ALL releases, even emergency hotfixes; should separate test gate from release gate

**Output:** Comprehensive audit document at `docs/proposals/cicd-gitops-prd-release-audit.md` with 8 sections, priority recommendations (P0/P1/P2), and next steps for Brady/Drucker/Trejo.

**What worked:**
- Parallel git/npm/gh commands gathered complete state snapshot efficiently
- Reading predecessor's charter (Kobayashi) and post-mortem (v0.8.22 retrospective) provided essential context
- Structuring audit as "Current State / Pain Points / Proposed Improvements" made findings actionable

**What I'd do differently next time:**
- Run read-only commands first, save any potentially mutating commands (npm ci, npm install) for last or skip entirely
- Use `--dry-run` or `--help` flags when testing unfamiliar commands to avoid side effects
- Document environment state BEFORE running commands (current branch, git status, versions) to detect mutations

---

## 📌 Team Update (2026-03-07T21:06:29Z): Your Role as Release Manager

You were hired to replace Kobayashi. Team voted 4-0 REPLACE. Your job: CHECKLIST-FIRST releases following .squad/skills/release-process/SKILL.md. ALWAYS validate semver, NEVER draft releases, VERIFY NPM_TOKEN type.

Session log: .squad/log/2026-03-07T21-06-29Z-v0822-release.md"

 = 
---

 + 