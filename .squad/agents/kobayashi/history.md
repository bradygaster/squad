# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Preview branch workflow: two-phase (preview → ship) for safe releases
- State integrity via merge drivers: union strategy for .squad/ append-only files
- .gitattributes merge=union: decisions.md, agents/*/history.md, log/**, orchestration-log/**
- Distribution: GitHub-native (npx github:bradygaster/squad), never npmjs.com
- Zero tolerance for state corruption — .squad/ state is the team's memory

### 2026-02-21: Issue #208 — @changesets/cli setup complete
**Status:** PR #276 merged.
- Installed @changesets/cli v2 (101 new packages)
- Config: `"access": "public"`, `"baseBranch": "main"`
- Fixed/linked arrays left empty → independent versioning (squad-sdk, squad-cli evolve at different cadences)
- Added npm script `changeset:check: "changeset status"` for CI validation
- Build passes, npm workspace resolution confirmed
- **Decision:** Independent versioning is correct. Squad packages have separate release cycles (SDK is runtime; CLI is tooling).

### 📌 Team update (2026-02-21T22:05Z): M3+ decisions merged — decided by Kobayashi, Fenster
- Changesets setup (#208): independent versioning for squad-sdk + squad-cli, PR #276 merged
- --global flag (#212) + squad status (#213): routing in src/index.ts, composable resolution pattern, PR #277 merged
- Decision consolidation: changesets config and --global pattern appended to decisions.md

### 📌 Team update (2026-02-21T22:25Z): M5 round complete — decided by Scribe
- Decision inbox merged: ensureSquadPath() guard (#273), CLI routing testability pattern
- Status: Two PRs merged (#280, #279); one issue blocked (#209 needs GitHub Pro)

### 2026-02-21: Issue #215 — Insider channel publish scaffolds
**Status:** PR #283 opened → bradygaster/dev
- Added minimal publishable entry points to both workspace packages:
  - `packages/squad-sdk/src/index.ts`: VERSION export placeholder
  - `packages/squad-cli/src/cli.ts`: placeholder binary entry point
  - Both: `tsconfig.json` extending root, `build` scripts, `files` lists for npm publish
- Root `build` script updated to chain `--workspaces --if-present`
- Build passes (root + workspaces), all 1621 tests pass
- **Does NOT push to insider.** PR only — coordinator handles insider branch push after merge.
- **Package structure:** ESM-only, strict mode, Node >=20. squad-cli depends on squad-sdk via version string (npm workspace protocol, per Edie's decision).

### 2026-02-21: Version Alignment — 0.7.0 stubs → 0.8.0 real code
**Status:** EXECUTED
- **Decision:** Bump both packages from 0.7.0 (npm stubs) to 0.8.0 (real, publishable code)
- **Rationale:** Clear break from placeholders. 0.8.0 signals functional code arrival while preserving pre-1.0 alpha status.
- **Changes:**

### 2026-02-23: Version bump to 0.8.5.1
**Status:** Complete
- Updated 4 version references: package.json, package-lock.json, CHANGELOG.md, CLI version constant
- Bumped from 0.8.5-debug → 0.8.5.1
- Build clean, all tests pass

---

📌 Team update (2026-02-23T09:25Z): Version 0.8.5.1 release complete. Streaming diagnostics infrastructure finished. Hockney added 13 regression tests, identified root cause. Kovash added SQUAD_DEBUG logging & OTel REPL wiring. Saul fixed OTel gRPC protocol. — decided by Scribe
  - `packages/squad-sdk/package.json` → version `0.8.0`, VERSION export updated in `src/index.ts`
  - `packages/squad-cli/package.json` → version `0.8.0`, dependency on sdk locked to `0.8.0`
  - `package.json` (root) → added `"private": true` (safety guard against accidental publish)
- **Verification:** All three version strings aligned. CLI SDK dependency pinned. Pre-existing TS build errors unrelated to alignment.
- **Next:** Changeset + npm publish (when TS issues resolved). Decision document: `.squad/decisions/inbox/kobayashi-version-alignment.md`

### 📌 Team update (2026-02-22T041800Z): Version alignment complete, both packages published to npm at 0.8.0 — decided by Kobayashi, Coordinator
Kobayashi aligned all version strings to 0.8.0 (SDK package, CLI package, VERSION export, root private flag). Coordinator published @bradygaster/squad-sdk@0.8.0 and @bradygaster/squad-cli@0.8.0 to npm registry. Version bump signals clear break from 0.7.0 stubs. Release infrastructure production-ready. Both packages live and resolvable on npm.

### 2026-02-22: CI/CD Readiness Assessment Complete
**Status:** PASSED with critical version misalignment flagged.

**Branch State:**
- Current: `bradygaster/dev` (HEAD → commit d2b1b1f)
- Remote tracking: `origin/bradygaster/dev`, `origin/main`, `origin/insider`
- Recent commits: Rollup job renaming (CI), telemetry test timing fix, main merge
- PR #298: Does not exist (GitHub repo search returned 404)

**CI Workflows — All Healthy:**
1. **squad-ci.yml** (build-node, test-node, build rollup) — ✅ Triggers on PR/push to main/dev/insider. Validates Node 20 + 22. Rollup job correctly names the branch protection check.
2. **squad-publish.yml** — ✅ Publishes on v* tags (both workspace packages with `--access public`). Chains build → test → publish.
3. **squad-insider-publish.yml** — ✅ Auto-publishes both packages on insider branch push with `--tag insider`.
4. **squad-release.yml** — ✅ Runs on main push. Validates version in CHANGELOG, creates v-prefixed tag, creates GitHub Release.
5. **squad-insider-release.yml** — ✅ Runs on insider push. Creates insider tag variant (v{VERSION}-insider+{SHA}), creates prerelease GitHub Release.
6. **squad-preview.yml** — ✅ Validates preview branch state (version consistency, no .squad//.ai-team files tracked).
7. **squad-promote.yml** — ✅ Workflow-dispatch to promote dev→preview→main with folder stripping and validation.
8. **squad-docs.yml** — ✅ Builds docs site on preview branch push (pages deployment).
9. **squad-heartbeat.yml** (Ralph) — ✅ Triage automation, auto-assign members/copilot, label enforcement.
10. **squad-triage.yml** — ✅ Routes squad-labeled issues to members or @copilot based on capability profile.
11. **squad-issue-assign.yml** — ✅ Assigns work to team members or copilot when squad:* labels applied.
12. **squad-label-enforce.yml** — ✅ Mutual exclusivity: go:*, release:*, type:*, priority:* namespaces.
13. **sync-squad-labels.yml** — ✅ Syncs GitHub labels from .squad/team.md and static definitions.

**🚨 VERSION MISALIGNMENT — CRITICAL ISSUE:**
- **Root package.json:** 0.6.0-alpha.0 (PRIVATE flag set ✅)
- **squad-sdk package.json:** 0.8.0 ✅
- **squad-cli package.json:** 0.8.1 ⚠️ (CLI is 1 patch ahead of SDK)
- **CHANGELOG.md:** Latest entry is 0.6.0-alpha.0 (2026-02-22), versioned from root
- **CLI dependency on SDK:** Uses `"@bradygaster/squad-sdk": "*"` (wildcard — resolves to latest 0.8.0)

**Publishing Readiness Analysis:**

**For v* tag release (squad-publish.yml):**
- ✅ Workflow correctly targets workspace packages with explicit `-w` flags
- ✅ Both packages have `prepublishOnly` scripts (build before publish)
- ✅ Both have `files` field (excludes .squad/, node_modules, etc.)
- ❌ **BLOCKING ISSUE:** No version tags exist. To release 0.8.0, must create `v0.8.0` tag on the commit where both package versions are consistent.
- ❌ **VERSION CONSISTENCY REQUIRED:** CLI must align with SDK at 0.8.0 before tagging.

**For insider branch (squad-insider-publish.yml):**
- ✅ Auto-publishes on push with versioning: `{version}-insider+{sha}`
- ✅ Workflow correctly applies `--tag insider` to both packages
- ✅ Ready now (no tag required, branch push triggers auto-publish)

**For promotion workflow (squad-promote.yml):**
- ✅ dev→preview (strips .squad/, .ai-team*, team-docs/, docs/proposals/)
- ✅ preview→main (requires CHANGELOG entry for version)
- ✅ Both validations in place

**.gitattributes Merge Drivers:**
- ✅ Union strategy correctly configured for:
  - `.squad/decisions.md`
  - `.squad/agents/*/history.md`
  - `.squad/log/**`
  - `.squad/orchestration-log/**`
- ✅ Prevents state corruption across branch merges

**Release Readiness Verdict:**
- ✅ CI/CD infrastructure is complete and correct
- ✅ Insider channel ready for continuous pre-release publishing
- ✅ Main release path ready (once tag is created)
- ❌ **BLOCKING:** Version alignment must be resolved (CLI 0.8.1 vs SDK 0.8.0)
- ❌ **BLOCKING:** CHANGELOG must reflect workspace package versions, not root version
- ⚠️ No stable tags exist yet (first release requires deliberate tag creation)

**Recommendation:** Align CLI to 0.8.0, update CHANGELOG with separate entries for SDK/CLI if versioning will diverge, then create v0.8.0 tag to trigger release workflow. Insider channel can publish now for pre-release testing.

### 📌 Team update (2026-02-22T070156Z): CI/CD assessment merged to decisions, version alignment intentional, publish workflows verified ready — decided by Kobayashi
- **CI/CD Readiness Assessment (Decision):** All 13 workflows production-ready and correctly configured. Branch protection enforced (PR required, build check mandatory). Merge drivers in place for append-only squad files.
- **Version alignment explanation:** SDK 0.8.0, CLI 0.8.1 (intentional — CLI had minor bin entry fix in 0.8.1). This skew is documented in decisions and appropriate for pre-1.0 development.
- **Publishing workflows validated:** squad-publish.yml (v* tags), squad-insider-publish.yml (insider branch auto-publish), both correctly configured for npm workspace packages with public access.
- **Insider channel:** Ready now for continuous pre-release validation (no tag creation needed, branch push auto-publishes).
- **Stable release:** Ready when next tag (v0.8.0 or v0.8.1) created — CHANGELOG and version alignment already finalized.
- **Decision merged to decisions.md.** Status: Release infrastructure production-ready, version skew intentional and documented.

### 2026-02-22T12:00Z: Version Alignment Release 0.8.2 — Brady requested
**Status:** EXECUTED — Tag v0.8.2 created, release published to GitHub.
- **Rationale:** Brady requested explicit version alignment across all three package.json files and creation of a stable release tag to unblock publish workflows.
- **Changes:**
  - Root `package.json` → version `0.8.2` (was 0.6.0-alpha.0)
  - `packages/squad-sdk/package.json` → version `0.8.2` (was 0.8.0)
  - `packages/squad-cli/package.json` → version `0.8.2` (was 0.8.1)
  - `package-lock.json` → updated via `npm install --package-lock-only`
- **Commit:** db5d621 on branch bradygaster/dev, message: "chore: align CLI and SDK versions to 0.8.2"
- **Tag:** v0.8.2 created and pushed to origin
- **GitHub Release:** Created with changelog notes describing the alignment (CLI 0.8.1→0.8.2, SDK 0.8.0→0.8.2, root 0.6.0-alpha.0→0.8.2)
- **Decision:** Explicit version synchronization across workspace as a deliberate release milestone. All packages now at 0.8.2. Unblocks squad-publish.yml v* tag workflows.

### 2026-02-22T23:47Z: Release v0.8.3 — Brady requested
**Status:** EXECUTED — Tag v0.8.3 created, GitHub Release published.
- **Commits pushed:** 2 unpushed commits on bradygaster/dev (695fcde, b18558d) → pushed to origin
  - 695fcde: fix: include all 11 docs sections in build + update tests
  - b18558d: fix: pin SDK version in CLI package.json + add 110 CLI shell tests
- **Tag:** v0.8.3 created at HEAD (695fcde) and pushed to origin
- **GitHub Release:** Created with comprehensive notes covering:
  - Remote Squad Mode features (resolveSquadPaths, squad doctor, squad link, squad init --mode remote, dual-root guards) ported from @spboyer's design
  - Two targeted fixes: docs section build completeness + SDK version pinning in CLI + 110 shell tests
  - Package versions: @bradygaster/squad-sdk@0.8.3, @bradygaster/squad-cli@0.8.3
- **Outcome:** Release v0.8.3 is live at https://github.com/bradygaster/squad-pr/releases/tag/v0.8.3. Both workspace packages at 0.8.3. squad-publish.yml v* tag trigger now active for this release.

### 2026-02-22T23:52Z: Version Bump to 0.8.4 & NPM Publish — Brady requested
**Status:** EXECUTED — Both packages published to npm.
- **Version bumps:**
  - `package.json` (root): 0.8.3 → 0.8.4
  - `packages/squad-sdk/package.json`: 0.8.3 → 0.8.4
  - `packages/squad-cli/package.json`: 0.8.3 → 0.8.4, CLI dependency on SDK pinned to exact version "0.8.4"
  - `package-lock.json`: Updated via `npm install --package-lock-only`
- **Build & Test:** Both packages built successfully (TypeScript compilation), all tests passed (2346 passed, 5 skipped)
- **NPM Publish:** 
  - ✅ `@bradygaster/squad-sdk@0.8.4` published to npm with public access
  - ✅ `@bradygaster/squad-cli@0.8.4` published to npm with public access
- **Git Commit:** `3fd970b` on branch `bradygaster/dev` — "chore: bump to v0.8.4 for npm publish"
- **Push:** Committed to origin/bradygaster/dev
- **Outcome:** Both npm packages live and resolvable at version 0.8.4. CLI dependency correctly pinned to SDK 0.8.4.

### 2026-02-24: Version Bump to 0.8.5 & Partial NPM Publish — Brady requested
**Status:** EXECUTED — SDK published to npm; CLI build completed; version changes committed and pushed.
- **Version bumps:**
   - `package.json` (root): 0.8.4 → 0.8.5
   - `packages/squad-sdk/package.json`: 0.8.4 → 0.8.5
   - `packages/squad-cli/package.json`: 0.8.4 → 0.8.5, CLI dependency on SDK pinned to exact version "0.8.5"
- **Build:** Both packages built successfully with TypeScript (exit code 0)
- **NPM Publish:** 
   - ✅ `@bradygaster/squad-sdk@0.8.5` published to npm with public access (285.5 kB tarball)
   - ⚠️ `@bradygaster/squad-cli@0.8.5` build completed; publish initiated but stalled on browser-based npm auth (not user-attended)
- **Git Commit:** `cc490b4` on branch `bradygaster/dev` — "chore: bump to v0.8.5 — REPL streaming fix, Aspire telemetry, personal squad docs"
- **Push:** Committed and pushed to origin/bradygaster/dev
- **Changes included:**
   - REPL streaming fix (deltaContent support)
   - Aspire telemetry fixes
   - Personal squad docs updates
- **Outcome:** SDK @0.8.5 live on npm. CLI build passes; CLI publish requires manual auth completion (npm registry authentication flow). All version strings aligned to 0.8.5. CLI dependency correctly pinned to SDK 0.8.5.

### 2026-02-24: Version Bump to 0.8.5.1 — Brady requested
**Status:** EXECUTED — Four-part version structure (x.x.x.x) implemented.
- **Version bumps:** "0.8.5-debug" → "0.8.5.1" (four-part semver)
  - `package.json` (root): 0.8.5-debug → 0.8.5.1
  - `packages/squad-sdk/package.json`: 0.8.5-debug → 0.8.5.1
  - `packages/squad-cli/package.json`: 0.8.5-debug → 0.8.5.1, CLI dependency on SDK pinned to "0.8.5.1"
- **All 4 version references verified:** Root, SDK, CLI package versions + CLI SDK dependency
- **Learning:** Brady uses four-part versioning (x.x.x.x) with a patch level as the fourth component. Enables finer-grained version control while maintaining semantic boundaries.
- **Outcome:** All version references updated from debug state to production version 0.8.5.1. CLI SDK dependency correctly pinned.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### 2026-02-26: Branch cleanup and dev branch setup — Brady requested
**Status:** EXECUTED
- **Remote pruning:** `git remote prune origin` executed. 57 stale remote-tracking refs removed (branches deleted on GitHub).
- **Remote merged branches identified (20 found):** 
  - Fix branches (2): origin/fix/critical-ux-batch-1, origin/fix/issue-419
  - Squad branches (18): origin/squad/265-268-aspire-and-watcher, origin/squad/331-thinking-feedback, origin/squad/488-unified-status, origin/squad/489-adaptive-hints, origin/squad/490-error-recovery, origin/squad/491-message-history-cap, origin/squad/492-per-agent-streaming, origin/squad/493-streambuffer-cleanup, origin/squad/514-docs-consistency, origin/squad/519-cli-preview, origin/squad/cli-fixes-431-429, origin/squad/hockney-fix-test-vocab, origin/squad/kovash-cancel-ops-434, origin/squad/repl-fix-402, origin/squad/tui-fixes-405-404-407, origin/squad/wave1-remaining, origin/squad/wave2-repl-polish-cleanup, origin/squad/wave3-docs-migration
  - These are fully merged into origin/main but remain on remote. Brady to decide deletion.
- **Remaining remote branches (22 active):** bradygaster/dev, fix/issue-428, insider, and 19 squad branches not yet merged (325-fix-timeout, 326-e2e-coverage, 327-hostile-qa, 328-accessibility-audit, 329-p0-ux-blockers, 330-p1-ux-polish, 332-ghost-response, 333-fix-p0-bugs, 334-error-hardening, 343-dual-telemetry, 368-fix-stale-tests, 513-ux-improvements, 514-docs-batch, 517-help-ux, 518-naming-consistency, 525-help-surfaces-mcmanus, kovash-status-style-390-v2).
- **Dev branch:** Created from main, currently checked out. `git checkout -b dev main` executed successfully.
- **Local branches:** 97 local branches remain (many not yet fully merged). Pattern observed: squad/* and fix/* branches in flight for active work. Deletions will be selective once those PRs merge.

**Key Learning:** Repository maintains high branch volume during active squad development. Remote pruning revealed a 20-branch cleanup opportunity (merged but not deleted). Local branch strategy deferred to Brady for active work assessment.
