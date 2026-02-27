# PRD Gap Resolutions — Feature Comparison Audit

**Audit Date:** 2026-02-21  
**Auditor:** Kujan (Copilot SDK Expert)  
**Context:** Brady requested audit of 16 features marked "None" in `feature-comparison.md`. This document maps each gap to a resolution: either an existing PRD that was missed in mapping, or a PRD addition needed.

---

## Summary

| Category | Count | Items |
|----------|-------|-------|
| ✅ **Already covered** | 1 | Gap was in mapping only; PRD exists and documents the feature |
| 📝 **Needs addition** | 10 | Feature IS in scope of existing PRD but not explicitly documented in that PRD's scope section |
| 🆕 **Needs new PRD** | 5 | Feature requires a new PRD (most involve @copilot agent roster or export/import) |

---

## 1. Already Covered ✅

### CLI-3: `squad upgrade --self`
- **Feature:** Self-upgrade for Squad's own repo; refreshes `.ai-team/` from templates without destroying history
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** ALREADY COVERED by **PRD 14 (Clean-Slate Architecture)**
  - PRD 14 §5.3 "Migration Registry" discusses the `migrations[]` array that enables additive version-keyed upgrades
  - PRD 14 §4.2 discusses backward compatibility: "Existing `squad init` / `squad upgrade` users are unaffected"
  - This is the self-upgrade path — Squad's own repo uses the migration system to refresh from templates

**Action:** Update feature-comparison.md to map CLI-3 → **PRD 14**, change risk from 🔴 GRAVE to 🟢 OK.

---

## 2. Needs Addition to Existing PRD 📝

These 10 features ARE covered by existing PRDs but are implicit, not explicit in the PRD's stated scope. The PRD owner should add one section per feature to make coverage explicit.

### AGT-16: `@copilot capability profiling` (🟢/🟡/🔴 routing)
- **Feature:** Route decisions based on @copilot's health status
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 4 (Agent Session Lifecycle)** — needs explicit section
  - PRD 4 §5.2 "Per-Agent Tool Allowlists" discusses `availableTools` filtering
  - PRD 4 §5.1 "Per-Agent Model Selection" discusses conditional agent routing
  - Capability profiling is the runtime extension: tool filtering + model assignment based on health status

**Action:** PRD 4 owner (Verbal) should add §6 "Capability Profiling & Health-Aware Routing" describing how agents get marked 🟢/🟡/🔴 and how the coordinator's routing logic respects those markers.

**Spec Addition for PRD 4:**
> Agents can advertise health status via the `squad_status` custom tool (PRD 2). The coordinator evaluates capability levels (🟢 full, 🟡 constrained, 🔴 offline) and routes accordingly: green agents get complex tasks, yellow get simple serial work, red are bypassed. Status is cached per session and updated on every agent idle event.

---

### STM-7: Identity system — `now.md` (team focus)
- **Feature:** Document current project focus / short-term orientation
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 14 (Clean-Slate Architecture)** — needs explicit section
  - PRD 14 §3 "New `.squad/` Directory Structure" mentions identity files but doesn't detail them
  - The identity system (`now.md` + `wisdom.md`) is part of Squad's context injection at session startup

**Action:** PRD 14 owner (Keaton) should expand §3.2 to include identity subsystem with explicit sections for `now.md` (session-injected focus) and `wisdom.md` (persistent patterns).

**Spec Addition for PRD 14:**
> `.squad/identity/now.md` contains the team's short-term focus: current quarter goals, active features, known constraints. Injected via `onSessionStart` hook. `wisdom.md` captures recurring patterns: deployment procedures, common pitfalls, cultural norms. Both are human-readable markdown; the coordinator reads at session start and injects as `additionalContext`.

---

### STM-8: Identity system — `wisdom.md` (team patterns)
- **Feature:** Persistent team patterns and learnings
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 14 (Clean-Slate Architecture)** — same addition as STM-7

See STM-7 above.

---

### STM-9: History splitting on import (portable vs. project)
- **Feature:** Separate agent history files on import to keep portable history vs. project-specific learnings
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 14 (Clean-Slate Architecture)** — needs explicit section on state management during import
  - PRD 14 §4.4 "What We Keep As-Is" touches on history but doesn't address import splitting
  - The import feature (PRD 16, future) will call this splitting logic

**Action:** PRD 14 owner (Keaton) should add §3.4 "History Management on Import/Export" describing the split algorithm.

**Spec Addition for PRD 14:**
> When importing an agent into a new project, `history.md` is split: (1) portable section (skills, general learnings) stays; (2) project-specific section (this repo's issues, worktrees, etc.) is archived. The split is deterministic and reversible — archived history can be restored if the agent is re-assigned to the original project.

---

### STM-12: Migration registry (version-keyed additive ops)
- **Feature:** Record of all migrations applied to a squad, enabling replay on new instances
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 14 (Clean-Slate Architecture)** — mentioned but not detailed
  - PRD 14 §5.3 mentions the `migrations[]` array
  - Should be expanded with full schema and replay semantics

**Action:** PRD 14 owner (Keaton) should add detailed subsection to §3 on migration registry structure.

**Spec Addition for PRD 14:**
> `.squad/migrations.json` records all applied migrations (name, version, timestamp, checksum). Each migration is idempotent and can be replayed. On upgrade, the system compares current version to applied migrations and runs only new ones. This enables Squad's own upgrades (`squad upgrade --self`) and enables sharing squads between developers without data loss.

---

### GH-3: `@copilot auto-assign to issues`
- **Feature:** Automatically assign @copilot coding agent to squad-labeled GitHub issues
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 8 (Ralph SDK Migration)** — needs explicit section
  - PRD 8 is about Ralph's persistent session and issue monitoring
  - Auto-assignment is a Ralph responsibility once issues are discovered

**Action:** PRD 8 owner (Fenster) should add §4 "Auto-Assignment & Tagging" describing how Ralph decides to assign issues.

**Spec Addition for PRD 8:**
> Ralph's monitoring loop can auto-assign issues to team members via `gh issue edit`. When an issue is triaged to a domain (Backend, Frontend, etc.), Ralph checks the coordinator's routing rules and either auto-assigns the relevant agent or labels the issue for manual review. Auto-assignment is opt-in per team — controlled by `squad.config.ts` setting.

---

### DST-2: Insider channel (`#insider` branch)
- **Feature:** Pre-release branch for testing new Squad features before general release
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 12 (Distribution & In-Copilot Install)** — needs explicit section on release channels
  - PRD 12 §3 discusses version stamping and auto-update
  - Should mention how to support multiple release channels (stable vs. insider)

**Action:** PRD 12 owner (Kujan) should add §5 "Release Channels" detailing insider/beta/stable tiers.

**Spec Addition for PRD 12:**
> Squad supports three release channels: `stable` (npm registry, default), `beta` (GitHub Releases), and `insider` (GitHub branch). Users opt into channels via `squad config set release-channel insider`. The auto-update mechanism checks the configured channel for new versions. Insider channel runs tests against the latest SDK version (Technical Preview) before stable release.

---

### DST-5: Project-type detection (npm/go/python/java/dotnet)
- **Feature:** Auto-detect project language and scaffold appropriate workflows + agent roles
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 12 (Distribution & In-Copilot Install)** — needs explicit section
  - PRD 12 §1 discusses that "Squad currently has zero project-type awareness"
  - Should be added as a Phase 1 enhancement

**Action:** PRD 12 owner (Kujan) should add §6 "Project-Type Detection & Adaptation" describing the detection algorithm and implications.

**Spec Addition for PRD 12:**
> `squad init` detects project type by scanning `package.json` (npm), `go.mod` (Go), `requirements.txt`/`pyproject.toml` (Python), `pom.xml`/`build.gradle` (Java), `*.csproj` (dotnet). Based on detection, agents are role-cast to domain specialists (Python expert for `requirements.txt`, Rust expert for `Cargo.toml`), and workflow templates adapt (Jest for npm, pytest for Python, etc.). Detection is explicit and confirmable — user always sees and can override the result.

---

### DST-6: Project-adapted workflow stubs for non-npm
- **Feature:** Scaffold workflows that work with project's actual build system (not just npm/Node)
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 12 (Distribution & In-Copilot Install)** — part of project-type detection
  - Related to DST-5; these features are linked

**Action:** Same as DST-5. Add workflows section to PRD 12 §6.

**Spec Addition for PRD 12:**
> After project-type detection, `squad init` scaffolds 12 GitHub Actions workflows adapted to the project type. npm projects get Jest + npm test stubs; Python projects get pytest + tox stubs; Go projects get `go test` stubs. The `.github/workflows/squad-*` files are always editable — Squad provides templates, not dogma. Users can swap pytest for unittest, or tox for poetry, or any variant.

---

### DST-8: 18 template files (team DNA)
- **Feature:** Reference templates for team charters, skills, decisions, and team.md — preserved across upgrades
- **Current Status:** 🔴 GRAVE (marked "None")
- **Finding:** COVERED by **PRD 14 (Clean-Slate Architecture)** — needs explicit section
  - PRD 14 §3 discusses the `.squad/` directory structure
  - Templates are mentioned but not detailed

**Action:** PRD 14 owner (Keaton) should add §3.5 "Template System & Team DNA Preservation" describing what templates exist and how they survive upgrades.

**Spec Addition for PRD 14:**
> Templates live in `.squad-templates/` (bundled with Squad binary) and reference copies live in `.squad/templates/`. The 18 core templates include: 1 `team.md` template, 3 agent role templates (Core Dev, Tester, Architect), 5 skill templates (git-workflow, code-review-patterns, etc.), 4 ceremony templates (weekly standup, retrospective, etc.), 3 decision templates (architecture, API design, process change), and 2 workflow templates (CI, release). On upgrade, Squad merges user customizations with new template versions — never overwrites user edits.

---

## 3. Needs New PRD 🆕

Five features require entirely new PRDs because they don't fit into existing scope.

### CLI-6, CLI-7, CLI-8: @copilot Agent Roster Management
- **Features:**
  - CLI-6: `squad copilot` — Add/remove @copilot coding agent from roster with capability profiles
  - CLI-7: `squad copilot --off` — Remove @copilot from team roster + delete copilot-instructions.md
  - CLI-8: `squad copilot --auto-assign` — Enable auto-assignment of @copilot to squad-labeled issues
- **Current Status:** All 🔴 GRAVE (marked "None")
- **Finding:** These three are closely related; they form a single feature domain.

**Rationale for New PRD:**
- These are NOT SDK replatform work (Phase 1). They're about special handling for the GitHub Copilot agent specifically.
- They don't fit into existing PRDs: PRD 4 covers agent session lifecycle, but @copilot has special semantics (capability profiles, auto-assignment policy).
- They're cross-cutting: roster management, GitHub integration, and CLI commands all involved.

**Recommendation:** Create **PRD 15: @copilot Agent Roster Management** (or absorb into PRD 14 as a subsection).

**Owner:** Keaton (Lead) or Brady (Product)  
**Phase:** 2 (v0.7.x) — depends on PRD 5 (Coordinator Replatform) stable  
**Scope:**
- CLI commands for managing @copilot as a first-class team member
- Capability profiling system (🟢/🟡/🔴 health states)
- Auto-assignment policies and opt-in/opt-out per team
- Integration with GitHub Issues labels for domain routing
- Backward compatibility with legacy `copilot-instructions.md`

---

### CLI-13, CLI-14: Squad Export/Import
- **Features:**
  - CLI-13: `squad export` — Export squad to portable JSON (casting, agents, skills)
  - CLI-14: `squad import` — Import squad from JSON, collision detection, archiving
- **Current Status:** Both explicitly noted "needs PRD 16" — this confirms it.
- **Finding:** These are confirmed as PRD 16 scope.

**Rationale for New PRD:**
- Export/import is a top-level feature (Proposal 008 — Portable Squads)
- It involves: serialization format (JSON schema), collision detection algorithm, archiving strategy, history splitting (STM-9), state management
- Dependencies: PRD 4 (agent config), PRD 11 (casting), PRD 7 (skills), PRD 14 (state structure)

**Recommendation:** Create **PRD 16: Portable Squads — Export/Import** (as already noted in feature-comparison.md)

**Owner:** TBD (not yet assigned in PRD index)  
**Phase:** 2 (v0.7.x) or 3 (v0.8.x)  
**Scope:**
- JSON schema for portable squad data
- Algorithm for merging imported agents with existing roster (collision detection)
- History splitting: portable vs. project-specific
- Skill/capability migration
- Casting registry merge
- Archiving strategy for replaced agents
- Round-trip fidelity: export + import = faithful reproduction

---

## Summary Table: How to Fix the 16 Gaps

| ID | Feature | Current PRD | Action | Risk After | Notes |
|----|---------|-----------  |--------|-----------|-------|
| CLI-3 | `squad upgrade --self` | None | Map to **PRD 14** | 🟢 OK | Already documented; mapping gap only |
| CLI-6 | `squad copilot` | None | Add **PRD 15 (new)** | 🟡 AT RISK | @copilot roster mgmt; Phase 2+ |
| CLI-7 | `squad copilot --off` | None | Add **PRD 15 (new)** | 🟡 AT RISK | Same as CLI-6 |
| CLI-8 | `squad copilot --auto-assign` | None | Add **PRD 15 (new)** | 🟡 AT RISK | Same as CLI-6 |
| CLI-13 | `squad export` | None (PRD 16) | Add **PRD 16 (new)** | 🟡 AT RISK | Portable squads; confirmed needed |
| CLI-14 | `squad import` | None (PRD 16) | Add **PRD 16 (new)** | 🟡 AT RISK | Same as CLI-13 |
| AGT-16 | @copilot capability profiling | None | Add to **PRD 4** | 🟢 OK | Session lifecycle already covers capability routing |
| STM-7 | Identity system — now.md | None | Add to **PRD 14** | 🟢 OK | Clean-slate architecture covers identity |
| STM-8 | Identity system — wisdom.md | None | Add to **PRD 14** | 🟢 OK | Same as STM-7 |
| STM-9 | History splitting on import | None | Add to **PRD 14** | 🟢 OK | State management subsystem; critical for import |
| STM-12 | Migration registry | None | Add to **PRD 14** | 🟢 OK | Backup/upgrade mechanism for squads |
| GH-3 | @copilot auto-assign | None | Add to **PRD 8** | 🟢 OK | Ralph's monitoring & assignment loop |
| DST-2 | Insider channel | None | Add to **PRD 12** | 🟡 AT RISK | Release channel selection; Phase 2+ |
| DST-5 | Project-type detection | None | Add to **PRD 12** | 🟡 AT RISK | Multi-language support; Phase 1 possible |
| DST-6 | Project-adapted workflows | None | Add to **PRD 12** | 🟡 AT RISK | Follows project-type detection; same PR |
| DST-8 | 18 template files | None | Add to **PRD 14** | 🟢 OK | Bundling & template preservation |

---

## Next Steps

1. **Update `feature-comparison.md`:**
   - CLI-3: Change PRD from "None" → "PRD 14", risk 🔴 → 🟢
   - All "needs addition" items: Update PRD column to relevant PRD, risk to 🟢 or 🟡 as appropriate
   - All "needs new PRD" items: Add PRD 15 and PRD 16 entries

2. **Create PRD 15 (if approved):** @copilot Agent Roster Management (Keaton or Brady)

3. **Create PRD 16 (if approved):** Portable Squads — Export/Import (TBD owner)

4. **Extend existing PRDs** with sections for 10 "needs addition" items:
   - PRD 4: §6 Capability Profiling
   - PRD 8: §4 Auto-Assignment & Tagging
   - PRD 12: §5 Release Channels, §6 Project-Type Detection & Adaptation
   - PRD 14: §3.2 Identity System, §3.4 History Management, §3.5 Template System, expand §3 overall

5. **Update PRD Index** (`.ai-team/docs/prds/00-index.md`) if PRDs 15 and 16 are approved.

---

*Audit completed by Kujan. All findings are reversible — these are mapping suggestions, not requirements. Brady to decide which gaps to close and at what phase.*
