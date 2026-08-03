📌 Team update (2026-03-07T20-04-20Z): GitHub Actions npm publishing automation established. New publish.yml workflow triggers on GitHub Release creation. NPM_TOKEN secret required in repo settings. CI/CD publishing is now authoritative method; local npm publish deprecated. — coordinated by Scribe

📌 Team update (2026-03-07T16:25:00Z): Actions → CLI migration strategy finalized. 4-agent consensus: migrate 5 squad-specific workflows (12 min/mo) to CLI commands. Keep 9 CI/release workflows (215 min/mo, load-bearing). Zero-risk migration. v0.8.22 quick wins identified: squad labels sync + squad labels enforce. Phased rollout: v0.8.22 (deprecation + CLI) → v0.9.0 (remove workflows) → v0.9.x (opt-in automation). — coordinated by Scribe

# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Status:** ALUMNI (retired; replaced by Booster as CI/CD lead)

## Pre-Phase-1 Foundations (2026-02-21 to 2026-03-04)

Established @changesets/cli for monorepo versioning (#208), insider channel publish scaffolds (#215), 3-branch model (main/dev/migration), versioning progression 0.7.0 stubs → 0.8.0–0.8.5.1 production releases. Key learning: Worktree parallelism, .squad/ state safety via merge=union, multi-repo coordination.

Released v0.8.2 through v0.8.21 — multiple incremental fixes and features. Published @bradygaster/squad-sdk + @bradygaster/squad-cli to npm. Established PR merge strategy (git checkout --theirs for dev→main conflicts).

## Key Incident — v0.8.22 Release Failures

**Hard rules established from failures:**

1. **Semver is ALWAYS 3-part for npm.** `X.Y.Z` only. `X.Y.Z.N` (4-part) is invalid — npm mangles to `X.Y.Z-N.N`. Use `npm version {version} --no-git-tag-version` to test before committing.

2. **GitHub Release draft vs. published:** DRAFT does NOT trigger `release: published` webhook. Automation using `on: release: published` ONLY fires when explicitly published. Use `gh release create --draft=false`.

3. **NPM_TOKEN must be automation token:** User tokens with 2FA CANNOT be used in CI/CD. Automation tokens bypass 2FA. Verify token type at npmjs.com/settings before configuring CI.

4. **Pre-flight checklist mandatory:** Validate semver format, version consistency across all package.json files, NPM_TOKEN type, release published (not draft), workflow trigger conditions.

## CI/CD Architecture Assessment

**9 load-bearing GitHub Actions workflows (must stay):** squad-ci.yml, squad-main-guard.yml, squad-release.yml, squad-promote.yml, squad-publish.yml, squad-preview.yml, squad-docs.yml, squad-insider-release.yml, squad-insider-publish.yml. Event-driven guarantees + branch protection integration cannot be replicated CLI-side.

**5 migration candidates (~12 min/month):** sync-squad-labels.yml, squad-triage.yml, squad-issue-assign.yml, squad-heartbeat.yml, squad-label-enforce.yml → replace with `squad sync-labels`, `squad triage`, `squad assign`, Ralph monitor loop, `squad validate-labels`.

**Migration timeline:** v0.9 deprecation docs → v1.0 CLI commands + warnings → v1.1 remove from new init.

## npm Publishing Automation

publish.yml: triggers on `release.published` (automatic) + `workflow_dispatch` (manual). Publishes SDK first, then CLI (dependency order). Verifies package.json version matches release tag. Includes npm provenance attestation. Deprecated squad-publish.yml (consolidated into publish.yml).