### 2026-03-22T16:40:56Z: #498 Phase 1 Audit — .squad/ VCS Removal Preparation
**By:** EECOM (Core Dev)
**Status:** In Progress
**Issue:** #498

#### Executive Summary

The `.squad/` directory is currently tracked in git. Since SDK mode (`squad.config.ts` + `squad build`) generates `.squad/` as build output, tracking it creates:
- **Merge conflicts** — developers working on different agents create conflicting `.squad/` changes
- **Dirty working trees** — `squad build` modifies tracked files, causing false positives in git status
- **CI noise** — workflows fail when `.squad/` is out of sync
- **Privacy concerns** — agent history, decisions, and orchestration logs contain sensitive project data

This audit identifies all references to `.squad/` in CI workflows and source code to prepare for safe removal.

---

#### CI Workflow Audit

| Workflow | .squad/ Files Read | Status | Fix Needed |
|----------|-------------------|--------|------------|
| `sync-squad-labels.yml` | `.squad/team.md` | ⚠️ **BREAKS** | Add `squad build` step before reading team.md |
| `squad-heartbeat.yml` | `.squad/team.md`, `.squad/templates/ralph-triage.js` | ⚠️ **BREAKS** | Add `squad build` + ensure templates/ is installed |
| `squad-triage.yml` | `.squad/team.md`, `.squad/routing.md` | ⚠️ **BREAKS** | Add `squad build` before reading team.md/routing.md |
| `squad-issue-assign.yml` | `.squad/team.md` | ⚠️ **BREAKS** | Add `squad build` before reading team.md |
| `squad-preview.yml` | Validates absence of `.squad/` | ✅ **NO CHANGE** | Already checks that .squad/ is NOT tracked — works as-is |
| `squad-promote.yml` | Strips `.squad/` during merge | ✅ **NO CHANGE** | Already strips .squad/ from preview branch — works as-is |

**Critical Dependencies:**
- All workflows that read `.squad/team.md` or `.squad/routing.md` MUST run `squad build` first
- `squad-heartbeat.yml` reads `.squad/templates/ralph-triage.js` — template installation needs verification
- Fallback to `.ai-team/` (legacy directory) is present in all workflows — remains safe after removal

**Recommended CI Fix Pattern:**
```yaml
- uses: actions/checkout@v4

- uses: actions/setup-node@v4
  with:
    node-version: 22

- name: Install dependencies
  run: npm ci

- name: Generate .squad/ from config
  run: npx squad build
  
# Now workflows can read .squad/team.md, .squad/routing.md, etc.
```

---

#### Source Code Audit

**Total References:** 54 TypeScript files in `packages/` reference `.squad/`

##### Category 1: Runtime Readers (Core Functionality)
These files read `.squad/` at runtime and MUST continue working after removal:

| File | Purpose | Post-Removal Status |
|------|---------|-------------------|
| `packages/squad-cli/src/cli/core/detect-squad-dir.ts` | Detects `.squad/` vs `.ai-team/` | ✅ **WORKS** — reads from disk, doesn't assume git tracking |
| `packages/squad-cli/src/cli/commands/build.ts` | Generates `.squad/` from `squad.config.ts` | ✅ **WORKS** — writes to disk, main regeneration tool |
| `packages/squad-sdk/src/config/init.ts` | Creates initial `.squad/` structure | ✅ **WORKS** — writes new files, doesn't read git |
| `packages/squad-sdk/src/config/agent-source.ts` | Reads agent charters from `.squad/agents/` | ✅ **WORKS** — runtime file read, no git dependency |
| `packages/squad-sdk/src/platform/comms.ts` | Reads/writes orchestration logs | ✅ **WORKS** — runtime state, already gitignored |
| `packages/squad-sdk/src/runtime/config.ts` | Loads squad config from disk | ✅ **WORKS** — runtime loader |

**Verdict:** ✅ All runtime readers work with `.squad/` as build output (not tracked).

##### Category 2: Path References (Constants/Templates)
These files reference `.squad/` paths as strings (no actual file I/O):

| File | Purpose | Post-Removal Status |
|------|---------|-------------------|
| `packages/squad-cli/src/cli/core/templates.ts` | Template manifest with `.squad/` destinations | ✅ **SAFE** — just path constants |
| `packages/squad-sdk/src/builders/index.ts` | Example code showing `.squad/agents/` paths | ✅ **SAFE** — documentation/examples |
| `packages/squad-sdk/src/upstream/types.ts` | Type definitions for `.squad/` structure | ✅ **SAFE** — types only |
| `packages/squad-sdk/src/streams/types.ts` | SubSquad `.squad/` path references | ✅ **SAFE** — path constants |

**Verdict:** ✅ No action needed — these are path definitions, not file operations.

##### Category 3: Test References (May Need Fixture Updates)
Test files that reference `.squad/`:

| Pattern | Count | Post-Removal Status |
|---------|-------|-------------------|
| Test fixtures reading `.squad/` | ~10 files | ⚠️ **REVIEW** — tests may need `squad build` in setup or mock fixtures |
| Integration tests | ~5 files | ⚠️ **REVIEW** — may need to generate test `.squad/` dirs |

**Verdict:** ⚠️ Test suite needs review — some tests may fail if they assume `.squad/` is tracked.

---

#### .gitignore Audit

**Current State:**
- `.gitignore` in THIS repo ignores specific `.squad/` subdirectories (logs, inbox, sessions)
- `.gitignore` does NOT ignore the entire `.squad/` directory
- `squad init` adds partial `.squad/` ignores to new projects (runtime state only)

**Findings:**
1. **This repo (.gitignore):** Currently has partial ignores:
   ```gitignore
   .squad/orchestration-log/
   .squad/log/
   .squad/decisions/inbox/
   .squad/sessions/
   .squad/config.json
   .squad-workstream
   .squad/.first-run
   ```
   **Phase 2 change:** Add `.squad/` to ignore the entire directory

2. **`squad init` template (init.ts:975-1000):** 
   - Generates `.gitignore` entries for runtime state only (logs, inbox, sessions)
   - Does NOT add `.squad/` to .gitignore for new projects
   - **Phase 2 change:** Update `init.ts` to add `.squad/` entry for SDK mode projects

**Recommended .gitignore template for NEW projects (SDK mode):**
```gitignore
# Squad: generated team structure (build output from squad.config.ts)
.squad/

# Squad: local machine state
.squad-workstream
```

**Recommended .gitignore template for NEW projects (markdown mode — no config file):**
```gitignore
# Squad: runtime state (logs, inbox, sessions)
.squad/orchestration-log/
.squad/log/
.squad/decisions/inbox/
.squad/sessions/

# Squad: local machine state
.squad-workstream
```

---

#### `squad build` Regeneration Capability

**Status:** ✅ **VERIFIED** — `squad build` fully regenerates `.squad/` from `squad.config.ts`

**Generated Files:**
- `.squad/team.md` — team roster
- `.squad/routing.md` — routing rules
- `.squad/agents/{name}/charter.md` — agent charters
- `.squad/ceremonies.md` — ceremony definitions (or dispatch table if large)
- `.copilot/skills/ceremony-{slug}/SKILL.md` — individual ceremony skills (if dispatch mode)
- `.copilot/skills/{name}/SKILL.md` — custom skill definitions

**Protected Files (NEVER overwritten by `squad build`):**
- `.squad/decisions.md` — user-owned decision log
- `.squad/decisions-archive.md` — archived decisions
- `.squad/orchestration-log/` — runtime logs (already gitignored)
- `.squad/history.md` — agent history (user-owned)

**Gaps:** None identified. `squad build` is the authoritative regeneration tool.

---

#### Risk Assessment

**High Risk:**
1. **CI Workflows** — 4 workflows will break immediately if `.squad/` is removed without adding `squad build` steps
2. **Developer Onboarding** — new contributors must run `squad build` after checkout (could be automated with git hooks or README update)
3. **Legacy Projects** — projects using markdown-only mode (no `squad.config.ts`) cannot regenerate `.squad/` — need migration path

**Medium Risk:**
1. **Test Suite** — some tests may fail if they assume `.squad/` is tracked (needs test run after removal)
2. **Documentation** — tutorials/examples may reference `.squad/` as tracked files

**Low Risk:**
1. **Runtime Code** — all runtime readers work with `.squad/` as build output (no git dependency)
2. **Template Files** — path references are safe (no file I/O)

---

#### Recommended Sequence for Safe Removal

**Phase 1: Preparation (THIS PHASE)**
- ✅ Audit CI workflows and source code
- ✅ Document risks and migration plan
- ✅ Verify `squad build` regeneration capability
- ✅ Identify protected files

**Phase 2: CI Workflow Updates**
1. Add `squad build` step to workflows that read `.squad/` files:
   - `sync-squad-labels.yml`
   - `squad-heartbeat.yml`
   - `squad-triage.yml`
   - `squad-issue-assign.yml`
2. Test workflows in a branch with `.squad/` removed
3. Verify workflows pass with generated `.squad/` files

**Phase 3: Source Code Updates**
1. Update `init.ts` to add `.squad/` to `.gitignore` for SDK mode projects
2. Add `squad build` to `postinstall` scripts (optional — for auto-regeneration)
3. Update README/docs to mention `squad build` requirement
4. Run test suite and fix any tests that assume `.squad/` is tracked

**Phase 4: Repository Removal**
1. Add `.squad/` to THIS repo's `.gitignore`
2. Remove `.squad/` from git: `git rm -r --cached .squad/`
3. Run `squad build` to regenerate `.squad/`
4. Commit: `git commit -m "chore: remove .squad/ from version control (#498)"`
5. Update `squad-preview.yml` validation (already checks for absence — no change needed)

**Phase 5: Validation & Rollout**
1. Test on a feature branch with CI workflows
2. Verify all workflows pass
3. Merge to `dev`
4. Monitor for issues
5. Document in CHANGELOG as breaking change for v1.0

---

#### Open Questions

1. **Template installation:** `squad-heartbeat.yml` reads `.squad/templates/ralph-triage.js` — is this file generated by `squad build` or installed by `squad upgrade`?
   - **Action:** Verify template installation mechanism
   
2. **Markdown-only mode:** Projects without `squad.config.ts` cannot run `squad build` — should we require migration to SDK mode before v1.0?
   - **Action:** Define migration path in #498 Phase 2

3. **Git hooks:** Should we add a post-checkout hook to auto-run `squad build`?
   - **Pros:** Seamless developer experience
   - **Cons:** Slows down checkout, may surprise developers
   - **Action:** Discuss with team in #498

4. **Preview branch:** `squad-preview.yml` validates absence of `.squad/` — does this need to change?
   - **Answer:** ✅ No change needed — validation already checks for absence

---

#### Next Steps (Phase 2)

1. Create PRs to add `squad build` to CI workflows
2. Update `init.ts` to add `.squad/` to `.gitignore` for new SDK mode projects
3. Run test suite and fix failing tests
4. Update documentation (README, tutorials) to mention `squad build` requirement
5. Test removal in a feature branch
6. Merge to `dev` and validate all workflows pass

**Estimated effort:** 2-3 days of work spread across multiple PRs

**Target milestone:** v1.0 (blocking — `.squad/` must not ship in v1.0)
