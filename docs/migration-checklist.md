# Migration Checklist: origin (squad-pr) → beta (squad) — v0.8.18 Migration Release

**⚠️ BANANA RULE IS ACTIVE.** Do NOT execute ANY steps until Brady says "banana".

---

## BANANA GATE
- [x] **Brady explicitly said: "banana"**

If NOT checked, STOP. Do not proceed.

---

## Phase 1: Prerequisites
- [x] Both repos accessible: `origin` remote (bradygaster/squad-pr), `beta` remote (bradygaster/squad)
- [x] Working directory: `C:\src\squad-pr`
- [x] Clean tree: `git status` shows no uncommitted changes
- [x] Node.js ≥20: `node --version` → v22.16.0
- [x] npm ≥10: `npm --version` → 11.11.0

---

## Phase 2: Tag v0.8.18 on Origin

**Note:** Public repo (bradygaster/squad) is at v0.5.4. v0.8.18 is the target version for the public release. The v0.8.18 tag will be created at the migration merge commit on the public repo (not retroactively on origin).

**✅ Verified:** All package.json versions are at 0.8.18-preview as expected:
- root package.json: 0.8.18-preview
- packages/squad-cli/package.json: 0.8.18-preview
- packages/squad-sdk/package.json: 0.8.18-preview

---

## Phase 2.5: Merge PR #582 (Consult Mode) into origin/migration

✅ **VERIFIED COMPLETE.** Consult mode implementation is present in the migration branch.

**Evidence:**
- Commit 24d9ea5: "Merge pull request #582 from jsturtevant/consult-mode-impl" is in the history
- Source files exist: packages/squad-cli/src/cli/commands/consult.ts and packages/squad-sdk/src/sharing/consult.ts
- All merge conflicts resolved with 0.8.18-preview versions retained

**What happened:** James Sturtevant's "Consult mode implementation" (57 files) was integrated into the migration payload. All merge conflicts were resolved with 0.8.18-preview versions retained.

**Verification:** Consult mode is now part of the public release at v0.8.18. No additional action required.

**Note:** The original PR #582 branch references (consult-mode-impl) may no longer exist — these are for reference only.
---

## Phase 3: Push origin/migration to beta/migration
- [x] Verify migration branch HEAD: `git rev-parse migration` → `c1dd9b22d3a6b97dcab49ab47ad98d7c7e300249`
- [x] Ensure beta remote exists: `git remote -v | grep beta` ✅ (found)
- [x] If missing: `git remote add beta https://github.com/bradygaster/squad.git` (N/A - already exists)
- [x] Fetch beta: `git fetch beta` ✅
- [x] Push migration branch to beta: `git push beta migration:migration` ✅
- [x] Verify on beta: `git --no-pager log beta/migration -3 --oneline` ✅ HEAD at c1dd9b2

---

## Phase 4: Merge beta/migration → beta/main
- [ ] Navigate to beta repo (or switch remote context)
- [ ] Create PR: `gh pr create --repo bradygaster/squad --base main --head migration --title "Migration: squad-pr → squad" --body "..."`
- [ ] PR body should include:
  - [ ] Version jump: v0.5.4 → v0.8.18
  - [ ] Breaking changes (monorepo, npm distribution, .squad/ vs .ai-team/)
  - [ ] User upgrade path (GitHub-native → npm)
  - [ ] Distribution change (npx github: → npm install -g)
- [ ] Wait for CI checks (if any)
- [ ] Merge PR to beta/main
- [ ] Verify merge: `git fetch beta && git log beta/main -5`

---

## Phase 5: Version Alignment on Beta
**IMPORTANT CLARIFICATION:** All versions target 0.8.18:
- **Package.json files** (`package.json`, `packages/squad-cli/package.json`, `packages/squad-sdk/package.json`): Currently at 0.8.18-preview. Will be bumped to 0.8.18 at publish time (Phase 7.5).
- **Public repo tag** (`bradygaster/squad`): The v0.8.18 GitHub Release tag marks this migration commit (Phase 9).

- [ ] **Do NOT** change npm package.json versions yet — they are currently at 0.8.18-preview. Version bump happens in Phase 7.5 before npm publish.
- [ ] Create **v0.8.18 tag at migration merge commit** on beta/main (public repo marker, same as npm version)
- [ ] Document as "Migration release: GitHub-native → npm distribution, monorepo structure"
- [ ] Rationale: Beta's public version jump (0.5.4 → v0.8.18) aligns with npm packages publishing as 0.8.18

---

## Phase 6: Package Name Reconciliation
**Problem:** Beta uses `@bradygaster/create-squad`. Origin uses `@bradygaster/squad-cli` + `@bradygaster/squad-sdk`.

### Option A: Deprecate `@bradygaster/create-squad`
- [ ] Publish final version of `@bradygaster/create-squad` with deprecation notice
- [ ] Update npm metadata: `npm deprecate @bradygaster/create-squad "Migrated to @bradygaster/squad-cli"`
- [ ] All future releases under `@bradygaster/squad-cli` + `@bradygaster/squad-sdk`

### Option B: Rename packages back to `@bradygaster/create-squad`
- [ ] Update all package.json `name` fields in origin
- [ ] Not recommended (origin's naming is more accurate: CLI vs SDK)

**Recommendation: Option A.** Deprecate old package, move forward with new names.

---

## Phase 7: Beta User Upgrade Path

**For users on v0.5.4 (GitHub-native distribution):**

1. **Uninstall old distribution (if globally installed):**
   - [ ] N/A (GitHub-native doesn't install globally)

2. **Switch to npm distribution:**
   - [ ] `npm install -g @bradygaster/squad-cli@latest`
   - [ ] Or: `npx @bradygaster/squad-cli`

3. **Migrate `.ai-team/` to `.squad/`:**
   - [ ] Squad v0.8.18 uses `.squad/` directory (not `.ai-team/`)
   - [ ] User must manually rename: `mv .ai-team .squad` (if project has one)
   - [ ] ⚠️ Format may be incompatible — see migration guide

4. **Update CI/CD scripts:**
   - [ ] Replace `npx github:bradygaster/squad` with `npx @bradygaster/squad-cli`
   - [ ] Update version pinning strategy (npm tags instead of git SHAs)

5. **Test new version:**
   - [ ] `squad --version` → v0.8.18
   - [ ] `squad doctor` (if available)

---

## Phase 7.5: Bump Versions for Release

**Before npm publish:** Bump all package.json versions from 0.8.18-preview → 0.8.18.

- [ ] Update root `package.json`: `"version": "0.8.18-preview"` → `"version": "0.8.18"`
- [ ] Update `packages/squad-cli/package.json`: `"version": "0.8.18-preview"` → `"version": "0.8.18"`
- [ ] Update `packages/squad-sdk/package.json`: `"version": "0.8.18-preview"` → `"version": "0.8.18"`
- [ ] Run npm install to update package-lock.json: `npm install`
- [ ] Commit version bump: `git add package.json packages/*/package.json package-lock.json && git commit -m "chore: bump version to 0.8.18 for release"`
- [ ] **CRITICAL:** Do NOT push yet. Proceed directly to Phase 8.

---

## Phase 8: npm Publish (Origin Packages)
- [ ] Verify npm credentials: `npm whoami`
- [ ] Build packages: `npm run build` (exit code 0)
- [ ] Test packages: `npm test` (all pass)
- [ ] Publish SDK: `npm publish -w packages/squad-sdk --access public` (publishes 0.8.18)
- [ ] Publish CLI: `npm publish -w packages/squad-cli --access public` (publishes 0.8.18)
- [ ] Verify on npm: `npm view @bradygaster/squad-cli@0.8.18`
- [ ] Verify on npm: `npm view @bradygaster/squad-sdk@0.8.18`

---

## Phase 9: GitHub Release (Beta Repo)
- [ ] Fetch latest beta/main: `git fetch beta && git log beta/main -1`
- [ ] Tag beta at merge commit: `git tag v0.8.18 <merge-commit-sha>` (public repo release marker, matches npm version)
- [ ] Push tag: `git push beta v0.8.18`
- [ ] Create GitHub Release: `gh release create v0.8.18 --repo bradygaster/squad --title "v0.8.18 — Migration: GitHub-native → npm Distribution"`
- [ ] Release body includes:
  - [ ] **Breaking Changes:** GitHub-native → npm, `.ai-team/` → `.squad/`, monorepo structure
  - [ ] **New Distribution:** `npm install -g @bradygaster/squad-cli` or `npx @bradygaster/squad-cli`
  - [ ] **Upgrade Guide:** Link to migration docs
  - [ ] **Version Jump:** v0.5.4 → v0.8.18 (intermediate versions skipped)
- [ ] Mark as "Latest" release (not prerelease)

---

## Phase 10: Deprecate Beta's Old Package (if applicable)
- [ ] If `@bradygaster/create-squad` was published to npm:
  - [ ] `npm deprecate @bradygaster/create-squad "Migrated to @bradygaster/squad-cli. Install with: npm install -g @bradygaster/squad-cli"`
- [ ] Verify deprecation: `npm view @bradygaster/create-squad`

---

## Phase 11: Post-Release Bump (Origin)
**Per release versioning sequence:** After publishing v0.8.18, immediately bump to v0.8.19-preview.1 for continued development.

- [ ] Update root `package.json`: `"version": "0.8.18"` → `"version": "0.8.19-preview.1"`
- [ ] Update `packages/squad-cli/package.json`: `"version": "0.8.18"` → `"version": "0.8.19-preview.1"`
- [ ] Update `packages/squad-sdk/package.json`: `"version": "0.8.18"` → `"version": "0.8.19-preview.1"`
- [ ] Run npm install to update package-lock.json: `npm install`
- [ ] Commit: `git add package.json packages/*/package.json package-lock.json && git commit -m "chore: bump version to 0.8.19-preview.1 for continued development"`
- [ ] Push to origin: `git push origin HEAD` (or appropriate branch)

---

## Phase 12: Update Migration Docs
- [ ] Update `docs/migration-github-to-npm.md` with v0.8.18 specifics
- [ ] Update `docs/migration-guide-private-to-public.md` with actual version numbers
- [ ] Link to this checklist from main migration guide
- [ ] Commit: "docs: update migration guides for v0.8.18 execution"

---

## Phase 13: Verification
- [ ] Origin packages on npm: `npm view @bradygaster/squad-cli@0.8.18` ✅
- [ ] Origin packages on npm: `npm view @bradygaster/squad-sdk@0.8.18` ✅
- [ ] Beta release on GitHub: `gh release view v0.8.18 --repo bradygaster/squad` ✅
- [ ] Beta main branch HEAD includes migration: `git log beta/main --oneline -5` shows merge ✅
- [ ] Test install: `npm install -g @bradygaster/squad-cli@0.8.18 && squad --version` → 0.8.18 ✅

---

## Phase 14: Communication & Closure
- [ ] Announce migration completion in team channels (if any)
- [ ] Update beta repo README with new installation instructions
- [ ] Add migration notes to beta repo's CHANGELOG.md
- [ ] Document decision: `.squad/decisions/inbox/kobayashi-migration-complete.md`
- [ ] Update Kobayashi history: `.squad/agents/kobayashi/history.md`

---

## Rollback Plans

### If migration to beta fails:
- [ ] Delete beta/migration branch: `git push beta :migration`
- [ ] Close PR without merging
- [ ] Origin remains unaffected (no changes pushed)

### If npm publish fails:
- [ ] Unpublish within 72 hours (npm policy): `npm unpublish @bradygaster/squad-cli@0.8.18`
- [ ] Fix issue, re-publish with patch version (v0.8.19)

### If beta users report critical issues:
- [ ] Publish hotfix as v0.8.19 with fix
- [ ] Update GitHub Release notes with workaround
- [ ] Consider yanking v0.8.18 from npm (use `npm deprecate` instead of unpublish)

---

## Final Checklist
- [ ] **v0.8.18 tag exists on beta** (public repo migration marker at merge commit)
- [x] **origin/migration pushed to beta/migration**
- [ ] **beta/migration merged to beta/main**
- [ ] **Both npm packages published: squad-cli@0.8.18, squad-sdk@0.8.18**
- [ ] **GitHub Release v0.8.18 created on beta repo** (public release marker)
- [ ] **Beta users have upgrade path documented** (npm 0.8.18 installation)
- [ ] **Origin bumped to 0.8.19-preview.1 for continued development** (next dev version)
- [ ] **All docs updated with correct versioning (npm 0.8.18 everywhere)**

---

**Execution Date:** _______________  
**Executed By:** _______________  
**Status:** ✅ COMPLETE / 🛑 FAILED / ⏸️ PAUSED  
**Notes:** _______________________________________________________________

---

**Document maintained by:** Kobayashi (Git & Release)
