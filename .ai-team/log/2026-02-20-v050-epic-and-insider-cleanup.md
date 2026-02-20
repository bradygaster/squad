# Session Log: 2026-02-20 — v0.5.0 Epic & Insider Cleanup

**Date:** 2026-02-20 (Thursday, Week 1 Day 5)  
**Requested by:** Brady  
**Session Type:** Multi-agent orchestration batch

---

## What Happened

### 1. Insider Branch Cleanup ✅

- **Removed 164 forbidden files** from insider branch created on 2026-02-14
- Files removed:
  - `.ai-team/` (live team state)
  - `.ai-team-templates/` (internal format guides)
  - `team-docs/` (internal documentation)
  - `docs/proposals/` (design proposals)
- **Result:** Insider branch now clean and compliant with content policy

### 2. Guard Workflow Enhancement ✅

- Updated `.github/workflows/squad-main-guard.yml` to block `docs/proposals/` (in addition to existing `.ai-team/`, `.ai-team-templates/`, `team-docs/`)
- Guard now enforces: "Team state never ships to main, preview, or insider"
- Works in conjunction with branch content policy to prevent future leaks

### 3. Branch Content Policy Created ✅

- **Formalized what ships where:**
  - ✅ **Allowed on all protected branches:** index.js, package.json, templates/, docs/*, .github/*, tests, README, CHANGELOG, etc.
  - ❌ **Forbidden on all protected branches:** .ai-team/, .ai-team-templates/, team-docs/, docs/proposals/
  - 🔀 **Insider-specific extras:** insider-program.md, squad-insider-release.yml
- **Branch creation checklist:** Documented procedure for future branch creation from dev (guarantees clean content)
- **Stored in:** `.ai-team/decisions/inbox/copilot-branch-content-policy.md`

### 4. v0.5.0 Epic #69 Updated ✅

- **Posted clarification comment** to #69 documenting Brady's consolidation directive:
  - "Everything under .squad/ EXCEPT files that must stay at root for npx to work"
  - Exception files: index.js, package.json, templates/
  - Rationale: npx install copies from root
- **Architect decision:** Keep `templates/` at root (guard simplicity, npm clarity, better consumer experience)
- **Updated guard policy:** Block `.squad/**` entirely; no path-level exceptions needed

### 5. Created 6 Sub-Issues for v0.5.0 (#101–#106) ✅

Each sub-issue is discrete, parallelizable work:

| Issue | Title | Scope | Owner |
|-------|-------|-------|-------|
| #101 | CLI dual-path support for .squad/ migration | index.js: check .squad/ first, fall back to .ai-team/; `squad upgrade --migrate-directory` command | Fenster |
| #102 | squad.agent.md path migration - 745 refs | Update ~745 references across ~123 files; team root detection for both paths | Verbal |
| #103 | Workflow dual-path support for .squad/ | 6+ GitHub Actions workflows; guard verification | Kobayashi |
| #104 | Merge .ai-team-templates/ into .squad/templates/ | Move format guides; update references; remove .ai-team-templates/ | Fenster |
| #105 | Documentation and test updates | 27 docs files + 2 test files; migration guide; README | McManus |
| #106 | Guard workflow enforcement verification | Verify blocking works; test PR rejection | Hockney |

All tagged with `release:v0.5.0`, `type:feature`, assigned to v0.5.0 milestone.

---

## Team Analysis Provided

### Keaton (Lead) — Architecture

**Decision:** Keep `templates/` at root despite consolidation directive.

**Rationale:**
- **Guard complexity:** Nesting templates requires path-level exception (3 lines), breaks semantic clarity
- **npm package oddity:** Dotted directory (`.squad/`) in package suggests "agent state" not "install boilerplate"
- **Consumer confusion:** Users would see `.squad/templates/` and wonder "is this for me to edit?"
- **Naming convention consistency:** `.github/workflows/`, `.vscode/`, `.copilot/` all follow pattern: one purpose per directory
- **Maintenance cost:** Future maintainers must remember `.squad/templates/` is special

**Recommendation:** Option A — Keep at root. 85% achieves Brady's goal (consolidation under `.squad/`) while avoiding 80% maintenance complexity.

### Fenster (Core Dev) — Implementation Impact

**Analysis:** 4 systems affected, 6 files touched, ~30 lines changed.

| System | Effort | Complexity | Risk |
|--------|--------|-----------|------|
| index.js | Low | Mechanical (18 refs → 1 var) | Low |
| Guard workflow | Low | 3-line carve-out | Medium (must test) |
| Tests | Trivial | 1 path constant | Low |
| npm packaging | Low | Precision required | Medium (verify with npm pack) |
| **Total** | **3–4 hours** | **Low-Medium** | **Medium** |

**Verdict:** Feasible. Go with nested `.squad/templates/` approach. Guard carve-out is negligible.

---

## Decisions Documented

1. **.squad consolidation directive clarified** (Brady)
   - Everything under .squad/ except npx-required files (index.js, package.json, templates/)
   - Guard workflow stays simple (block .squad/** entirely; no exceptions)
   - Timeline: v0.5.0 (March 16)

2. **Templates placement decision** (Keaton + Fenster consensus)
   - Keep templates/ at root (not .squad/templates/)
   - Merge .ai-team-templates/ into .squad/templates/ (reference only)
   - Simplifies guard, improves npm clarity, better consumer experience

3. **Branch content policy formalized** (Coordinator)
   - What ships: public files (code, workflows, tests, docs, templates)
   - What doesn't ship: team state (.ai-team/, team-docs/, proposals)
   - Guard workflow + branch creation checklist enforce policy

---

## Impact & Next Steps

### For v0.5.0 Release (Target: March 16)

- Epic #69 is now clarified and scoped (6 sub-issues)
- Guard workflow is already updated
- Branch content policy is formalized
- Ready for team to implement sub-issues in parallel

### For Insider Program (Launching Feb 20)

- Insider branch is now clean (164 forbidden files removed)
- Guard prevents future leakage (docs/proposals/ now also blocked)
- Content policy is formalized for all future branches

### For Sprint Planning

- Route sub-issues #101–#106 to team specialists
- Fenster: CLI dual-path + template merge (#101, #104)
- Verbal: squad.agent.md path migration (#102)
- Kobayashi: Workflow dual-path support (#103)
- McManus: Documentation updates (#105)
- Hockney: Guard verification (#106)

---

## Archives & Records

- **Orchestration logs:** Written for each agent (Keaton×2, Fenster, Coordinator)
- **Decisions:** Appended to .ai-team/decisions.md (4 new blocks)
- **Session log:** This file

**Decision merging:** 6 inbox files → .ai-team/decisions.md. Consolidation concerns + epic update consolidated into single block crediting both Keaton and Fenster.
