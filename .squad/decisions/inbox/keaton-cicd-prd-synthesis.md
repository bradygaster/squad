# CI/CD & GitOps PRD Synthesis Decision

**Author:** Keaton (Lead)  
**Date:** 2026-03-07  
**Type:** Architecture & Process  
**Status:** Decided

---

## Decision

Created unified CI/CD & GitOps improvement PRD by synthesizing Trejo's release/GitOps audit (27KB) and Drucker's CI/CD pipeline audit (29KB) into single actionable document (docs/proposals/cicd-gitops-prd.md, ~34KB).

---

## Context

Brady requested PRD after two new agents (Trejo — Release Manager, Drucker — CI/CD Engineer) completed independent audits of our CI/CD infrastructure. Post-v0.8.22 disaster context: 4-part semver (0.8.21.4) mangled to 0.8.2-1.4, draft release didn't trigger CI, user token with 2FA failed 5+ times, `latest` dist-tag broken for 6+ hours.

**Input Documents:**
1. `docs/proposals/cicd-gitops-prd-release-audit.md` — Trejo's audit covering branching model, version state, tag hygiene, GitHub Releases, release process gaps, package-lock.json, workflow audit, test infrastructure, dependency management, documentation.
2. `docs/proposals/cicd-gitops-prd-cicd-audit.md` — Drucker's audit covering all 15 workflows individually, missing automation (rollback, pre-flight, monitoring, token expiry), scripts analysis (bump-build.mjs).

---

## Approach

### Synthesis Methodology

1. **Read both audits fully** — Absorbed 56KB of findings across GitOps processes and CI/CD pipelines.
2. **Extract & deduplicate findings** — Both identified same critical issues (squad-release.yml broken, semver validation missing, bump-build.mjs footgun, dev branch unprotected). Merged into single list.
3. **Prioritize into P0/P1/P2:**
   - **P0 (Must Fix Before Next Release):** Items that directly caused or could cause release failures — 5 items
   - **P1 (Fix Within 2 Releases):** Risk mitigation and hardening — 10 items
   - **P2 (Improve When Possible):** Quality of life and technical debt — 14 items
4. **Identify architecture decisions** — 5 key choices that require Brady input before implementation can proceed.
5. **Group into implementation phases** — 6 phases from "unblock releases" (1-2 days) to "quality of life" (backlog).

### Key Synthesis Decisions

**Where Trejo and Drucker agreed (high confidence):**
- squad-release.yml is completely broken (test failures) — **P0 blocker**
- Semver validation is missing — **root cause of v0.8.22**
- bump-build.mjs is a footgun (creates 4-part versions) — **must fix**
- dev branch needs protection — **unreviewed code reaches main**
- Preview branch workflows are dead code — **decision needed**

**Where they differed (tactical, not strategic):**
- **Test failure priority:** Trejo: unblock releases (P0), Drucker: restore CI confidence (P0) → **Resolution:** Same P0, same fix
- **bump-build.mjs approach:** Trejo: fix CI detection, Drucker: fix script format → **Resolution:** Do both (defense-in-depth)
- **Workflow consolidation timing:** Trejo: P1, Drucker: P2 → **Resolution:** P1 (reduces confusion during implementation)
- **Rollback automation:** Trejo: P2, Drucker: P1 → **Resolution:** P1 (v0.8.22 took 6+ hours to roll back)

### Defense-in-Depth Philosophy

v0.8.22 disaster showed **single validation layer is insufficient**. PRD mandates **3 layers**:

1. **Pre-commit validation:** Semver check before code enters repo (hook or manual check)
2. **CI validation:** squad-ci.yml validates versions, tests pass before merge
3. **Publish gates:** publish.yml validates semver, SKIP_BUILD_BUMP, dry-run before npm publish

**Rationale:** If one layer fails (e.g., pre-commit skipped), subsequent layers catch the issue. No single point of failure.

---

## PRD Structure

### 1. Executive Summary (2 paragraphs)
- v0.8.22 disaster as motivation (worst release in Squad history)
- Current state: working but fragile, one bad commit away from repeat

### 2. Problem Statement
- What went wrong during v0.8.22 (5 specific failures)
- Why our current CI/CD is fragile (broken infrastructure, branch/process gaps, publish pipeline gaps, workflow redundancy)

### 3. Prioritized Work Items (29 items)
- **P0 (5 items):** Fix squad-release.yml tests, add semver validation, fix bump-build.mjs, enforce SKIP_BUILD_BUMP, protect dev branch
- **P1 (10 items):** NPM_TOKEN checks, dry-run, fix squad-ci.yml tests, resolve insider/insiders naming, preview branch decision, apply validation to insider publish, consolidate workflows, pre-publish checklist, dist-tag hygiene, automated rollback
- **P2 (14 items):** Branch cleanup, tag cleanup, tag validation hooks, pre-flight workflow, rollback automation workflow, workflow docs, separate dev/release builds, delete deprecated files, heartbeat decision, health monitoring, token rotation docs, CODEOWNERS, commit signing, enforce admin rules

Each item includes:
- Description
- Source (which audit identified it, or both)
- Effort estimate (S/M/L)
- Dependencies on other items
- Code snippets where applicable

### 4. Architecture Decisions Required (5 choices)
- **Decision 1:** Consolidate publish.yml and squad-publish.yml? → **Recommendation:** Delete squad-publish.yml (use publish.yml as canonical)
- **Decision 2:** Delete or fix squad-release.yml? → **Recommendation:** Fix (automation is valuable, tests are fixable)
- **Decision 3:** How should bump-build.mjs behave? → **Recommendation:** Use -build.N suffix + separate build scripts (defense-in-depth)
- **Decision 4:** Branch protection strategy for dev? → **Recommendation:** Same rules as main (dev is integration branch)
- **Decision 5:** Preview branch architecture? → **Recommendation:** Remove workflows (three-branch model is sufficient)

### 5. Implementation Phases (6 phases)
- **Phase 1:** Unblock releases (1-2 days) — fix tests, protect dev
- **Phase 2:** Disaster-proof publish (2-3 days) — semver validation, bump-build.mjs fix, SKIP_BUILD_BUMP, NPM_TOKEN check, dry-run
- **Phase 3:** Workflow consolidation (3-5 days) — insider/insiders naming, preview decision, publish consolidation, delete deprecated
- **Phase 4:** Hardening (5-7 days) — fix squad-ci.yml, harden insider publish, pre-publish checklist, rollback automation, tag validation
- **Phase 5:** Operations (3-5 days) — dist-tag hygiene, tag cleanup, workflow docs, separate build scripts, token docs
- **Phase 6:** Quality of life (backlog) — pre-flight workflow, rollback workflow, health monitoring, CODEOWNERS, commit signing, admin rules

### 6. Success Criteria (Measurable)
- Zero invalid semver incidents for 6 months post-implementation
- squad-release.yml success rate ≥ 95% (no more than 1 failure per 20 runs)
- MTTR for release failures < 1 hour (down from 6+ hours in v0.8.22)
- CI confidence restored (no normalized failures)
- Zero unprotected critical branches (main AND dev)
- Publish pipeline defense-in-depth (at least 3 validation layers)

### 7. Appendix: Workflow Inventory
Table of all 15 workflows with status and priority assignments.

---

## Key Insights from Synthesis

### 1. Test Failures Are the Primary Blocker
squad-release.yml: 9+ consecutive failures due to ES module syntax errors (`require()` instead of `import` with `"type": "module"`). This is blocking ALL releases from main. **Fix this first.**

### 2. bump-build.mjs Is a Ticking Time Bomb
For non-prerelease versions, creates 4-part versions (0.8.22 → 0.8.22.1), which npm mangles. Direct cause of v0.8.22. **Must fix to use -build.N suffix (0.8.22-build.1 = valid semver).**

### 3. Workflow Redundancy Creates Confusion
15 workflows, 3 are unclear/redundant (squad-publish.yml, preview workflows, heartbeat). Consolidation needed.

### 4. Branch Model Needs Clarity
- Preview branch referenced but doesn't exist (dead code or incomplete implementation?)
- Insider/insiders naming inconsistent (workflows use `insider`, team uses `insiders`)
- dev branch unprotected (direct commits bypass review)

### 5. Defense-in-Depth Is Not Optional
v0.8.22 showed single validation layer fails. PRD mandates multiple layers: pre-commit + CI + publish gates.

---

## What Makes This PRD Actionable

1. **Concrete work items:** 29 items with descriptions, effort estimates, dependencies. Ready for agent assignment.
2. **Code snippets included:** Validation gates, CI checks, workflow improvements are ready-to-copy.
3. **Phased rollout:** Implementable in order — unblock releases first, disaster-proof next, harden later.
4. **Success criteria:** Measurable outcomes (zero invalid semver for 6 months, MTTR <1 hour, CI success rate ≥95%).
5. **Architecture decisions called out:** 5 choices that need Brady input before proceeding.

---

## Recommended Next Steps

1. **Brady reviews PRD** — Approves priorities, makes architecture decisions (publish consolidation, preview branch, bump-build.mjs approach).
2. **Drucker takes P0 items #1-4** — Fix squad-release.yml tests, add semver validation, fix bump-build.mjs, enforce SKIP_BUILD_BUMP.
3. **Trejo takes P0 item #5 + P1 items** — Protect dev branch, resolve insider/insiders, preview decision, workflow consolidation.
4. **Keaton reviews Phase 2 implementation** — Ensures defense-in-depth is implemented correctly.

---

## Impact

- **Prevents repeat disasters:** 3-layer validation means no single failure point.
- **Unblocks releases:** Fixing squad-release.yml tests enables releases from main.
- **Reduces MTTR:** Automated rollback reduces 6-hour incidents to <1 hour.
- **Restores CI confidence:** No more normalized failures — tests pass consistently.
- **Clarifies architecture:** 5 decisions resolve branch model, workflow redundancy, build script ambiguity.

---

**Status:** PRD published, awaiting Brady review and architecture decisions.
