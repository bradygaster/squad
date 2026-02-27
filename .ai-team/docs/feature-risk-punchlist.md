# Feature Risk Punch List — SDK Replatform

**Author:** Kujan (Copilot SDK Expert)
**Requested by:** Brady
**Date:** 2026-02-20
**Scope:** Every Squad feature inventoried against 14 PRDs for loss/degradation risk

---

## Summary

| Risk Level | Count | Meaning |
|------------|-------|---------|
| 🔴 GRAVE | 14 | No PRD coverage. Will be silently lost unless we act. |
| 🟡 AT RISK | 12 | Partially covered or SDK approach may degrade it. |
| 🟢 COVERED | 28 | Explicitly addressed in a PRD with clear migration path. |
| ⚪ INTENTIONAL | 5 | Deliberately dropped or replaced. We know and accept it. |

---

## 🔴 GRAVE — No PRD Coverage (Will Be Silently Lost)

| # | Feature | Current Location | PRD Coverage | Notes |
|---|---------|-----------------|--------------|-------|
| 1 | **`squad export` subcommand** | `index.js` lines 836–913 | None | Exports casting, agents, skills to portable JSON. No PRD mentions export/import. This entire portability story vanishes. |
| 2 | **`squad import` subcommand** | `index.js` lines 917–1029 | None | Imports squad from JSON with history splitting (portable vs project-specific). Completely unaddressed. |
| 3 | **History splitting on import** | `index.js` lines 1032–1096 (splitHistory) | None | Separates portable knowledge from project learnings during import. Sophisticated logic with no migration path. |
| 4 | **`squad scrub-emails` subcommand** | `index.js` lines 267–595 | PRD 3 covers PII policy but NOT the CLI command | The standalone scrubbing tool that users run manually is gone. PRD 3 moves PII to hooks but doesn't replace the CLI utility. |
| 5 | **`squad copilot` subcommand** | `index.js` lines 598–713 | None | Add/remove @copilot coding agent from roster. Copilot capability profiles (🟢/🟡/🔴). Auto-assign toggle. None of this is in any PRD. |
| 6 | **@copilot capability profiling** | `squad.agent.md` routing + `index.js` copilot section | None | The tiered routing (good fit / needs review / not suitable) for @copilot issues. Routing PRDs focus on agent-to-agent, not Copilot coding agent integration. |
| 7 | **12 workflow templates** | `templates/workflows/*.yml` | PRD 14 mentions "embedded, not fetched" but NO specifics | squad-heartbeat, squad-triage, squad-issue-assign, squad-main-guard, squad-label-enforce, sync-squad-labels, squad-ci, squad-release, squad-preview, squad-insider-release, squad-docs, squad-promote. PRD 14 hand-waves at "scaffolded" workflows but doesn't inventory or migrate ANY of these. |
| 8 | **Project-type detection + workflow stubs** | `index.js` lines 384–567 | None | Detects npm/go/python/java/dotnet and generates adapted CI/release workflow stubs for non-npm projects. Completely unaddressed. |
| 9 | **`squad upgrade --self` mode** | `index.js` lines 1292–1330 | None | Special self-upgrade for the Squad repo itself. Refreshes .ai-team/ from templates without destroying agent histories. |
| 10 | **Migration registry system** | `index.js` lines 1239–1285 | None | Version-keyed additive migrations (create skills/, plugins/, scrub emails). The entire migration framework disappears. |
| 11 | **Version stamping + semver comparison** | `index.js` lines 1192–1236 | PRD 12 mentions versions but not the stamp-into-agent mechanism | `stampVersion()` writes version into squad.agent.md HTML comment + Identity section + greeting. `compareSemver()` drives upgrade logic. |
| 12 | **18 template files beyond workflows** | `templates/*.md` + `templates/*.json` | None | charter.md, routing.md, ceremonies.md, copilot-instructions.md, casting-*.json, skill.md, constraint-tracking.md, mcp-config.md, multi-agent-format.md, orchestration-log.md, plugin-marketplace.md, raw-agent-output.md, roster.md, run-output.md, scribe-charter.md, history.md. These are the "team DNA" files that consumers get. No PRD discusses which survive. |
| 13 | **Insider channel (`#insider` branch)** | `package.json` + `index.js` help text | None | `npx github:bradygaster/squad#insider` — early-access distribution channel. No PRD mentions preserving this. |
| 14 | **Identity system files (now.md, wisdom.md)** | `index.js` lines 1455–1499, `templates/identity/` | None | Scaffolded during init. `now.md` tracks current focus; `wisdom.md` captures team patterns/anti-patterns. PRD 14 does NOT mention these. |

---

## 🟡 AT RISK — Partially Covered or May Be Degraded

| # | Feature | Current Location | PRD Coverage | Notes |
|---|---------|-----------------|--------------|-------|
| 1 | **`squad.agent.md` as user-editable coordinator** | `.github/agents/squad.agent.md` | PRD 5 §Source of Truth | Today users can read/edit the 32KB prompt to understand and customize team behavior. PRD 5 shrinks it to ~12KB and moves logic to TypeScript. Users lose visibility into routing logic, spawn templates, and fallback chains. **This is the single biggest UX regression risk.** |
| 2 | **`npx github:bradygaster/squad` install path** | `package.json` bin field | PRD 12 §Distribution | PRD 12 says GitHub tarball "kept as alias" but primary moves to npm registry. If GitHub tarball path breaks or is deprioritized, existing docs/tutorials/READMEs everywhere break. |
| 3 | **`.gitattributes` merge=union setup** | `index.js` lines 1556–1573 | PRD 14 — NOT addressed | PRD 14 discusses `.gitignore` but never mentions `.gitattributes` or merge=union. This is CRITICAL for multi-branch squad state. Without it, merge conflicts in decisions.md and history.md files will be constant. |
| 4 | **`squad watch` local polling** | `index.js` lines 104–264 | PRD 8 partially | PRD 8 redesigns Ralph as persistent SDK session. The current `squad watch` polls via `gh` CLI without any SDK dependency. If SDK isn't installed/configured, local watch breaks. PRD 8 mentions watchdog but assumes SDK session exists. |
| 5 | **Plugin marketplace** | `index.js` lines 716–833 | PRD 7 mentions marketplace as "future path" | `squad plugin marketplace add/remove/list/browse` — full CRUD for marketplace registries. PRD 7 mentions "imported skills start at low confidence" but doesn't cover the marketplace CLI commands or the `marketplaces.json` storage format. |
| 6 | **MCP config scaffolding** | `index.js` lines 1501–1528 | PRD 10 covers per-agent MCP but not the `.copilot/mcp-config.json` scaffolding | Current init creates a sample Trello MCP config. PRD 10 moves to `.squad/mcp-config.json` with per-agent routing. The init-time scaffolding is unaddressed. |
| 7 | **Casting system file format** | `templates/casting-*.json` | PRD 11 covers v2 but migration details are thin | PRD 11 says "Phase 1: JSON read-only → Phase 2: TypeScript primary → Phase 3: JSON removed." But current `policy.json`, `registry.json`, `history.json` formats aren't documented in the PRD. Consumer repos with existing casting state could break. |
| 8 | **Scribe as fire-and-forget on CLI** | `squad.agent.md` Scribe section | PRD 5 partially | Scribe is background, never collected on CLI. VS Code forces sync blocking (last in parallel group). PRD 5 doesn't clearly address how Scribe works in the new SDK model where sessions are managed differently. |
| 9 | **Model fallback chains** | `squad.agent.md` error handling | PRD 1 §adapter, PRD 5 partially | Current fallback chains (Premium/Standard/Fast tiers with 4-model cascades) are prompt-level. PRD 5 mentions "cascading task failures" but doesn't enumerate the chains. Risk of losing specific fallback paths. |
| 10 | **`.ai-team/` → `.squad/` dual-path support** | `index.js` detectSquadDir() throughout | PRD 14 covers migration but not backward compat period | Current code detects both `.ai-team/` and `.squad/` and works with either. PRD 14 focuses on clean-slate `.squad/` only. Consumer repos still on `.ai-team/` during transition need the dual-path code. |
| 11 | **`squad upgrade --migrate-directory`** | `index.js` lines 1120–1190 | PRD 14 has migration function but not as CLI flag | The user-facing CLI flag that renames `.ai-team/` → `.squad/`, updates `.gitattributes`, `.gitignore`, scrubs emails. PRD 14 has a `migrateToCleanSlate()` concept but not the specific upgrade subcommand. |
| 12 | **Workflow path references (`.ai-team/` vs `.squad/`)** | All workflow templates | PRD 14 partially | Workflows hardcode paths like `squad:*` labels, `## Members` section parsing. PRD 14 doesn't inventory which workflows need path updates or how. |

---

## 🟢 COVERED — Explicitly Addressed in a PRD

| # | Feature | Current Location | PRD Coverage | Notes |
|---|---------|-----------------|--------------|-------|
| 1 | Agent routing (explicit naming, multi-domain) | `squad.agent.md` | PRD 5, PRD 2 (`squad_route`) | Hybrid router: code for deterministic, LLM for ambiguous |
| 2 | Agent spawning via `task` tool | `squad.agent.md` | PRD 1, PRD 4, PRD 5 | SDK `createSession()` replaces prompt-level task calls |
| 3 | Parallel fan-out (background agents) | `squad.agent.md` | PRD 5 | Session pool enables true parallel execution |
| 4 | Charter-based context injection | `squad.agent.md` | PRD 4 | Charters compile to `CustomAgentConfig` |
| 5 | Decision drop-box pattern | `squad.agent.md` | PRD 2 (`squad_decide`), PRD 5 | Typed tool replaces file-convention communication |
| 6 | Casting universe selection | `squad.agent.md` | PRD 11 | Deterministic scoring moves to TypeScript |
| 7 | Persistent name allocation | `squad.agent.md` | PRD 11 | Typed CastRegistry with O(1) collision detection |
| 8 | Overflow handling (diegetic, thematic, structural) | `squad.agent.md` | PRD 11 | Codified as typed functions |
| 9 | Skills system (SKILL.md, confidence levels) | `squad.agent.md` + `templates/skills/` | PRD 7 | Manifest-based with SDK `skillDirectories` |
| 10 | PII/email policy enforcement | `squad.agent.md` | PRD 3 | Hooks enforce at tool level |
| 11 | Reviewer lockout protocol | `squad.agent.md` | PRD 3 | Programmatic enforcement via hooks |
| 12 | File-write authorization (Source of Truth) | `squad.agent.md` | PRD 3 | Per-agent allowed files via `onPreToolUse` |
| 13 | Agent session lifecycle | `squad.agent.md` | PRD 4 | Full lifecycle: spawn → active → idle → cleanup |
| 14 | Per-agent model selection | `squad.agent.md` | PRD 4, PRD 9 | 4-layer priority preserved |
| 15 | Ralph work monitor loop | `squad.agent.md` | PRD 8 | Persistent SDK session, event-driven |
| 16 | Ralph heartbeat (GitHub Actions) | `squad.agent.md` + workflow | PRD 8 | Three-layer monitoring preserved |
| 17 | Streaming/observability | (new capability) | PRD 6 | Real-time event aggregation, token tracking |
| 18 | BYOK multi-provider | (new capability) | PRD 9 | Provider config, fallback chains, Ollama |
| 19 | MCP per-agent integration | (new capability) | PRD 10 | Per-agent MCP server routing |
| 20 | A2A agent communication | (new capability) | PRD 13 | `squad_discover` + `squad_route` tools |
| 21 | `squad init` (basic) | `index.js` | PRD 12 | npm-based init preserved |
| 22 | `squad upgrade` (basic) | `index.js` | PRD 12 | Auto-update mechanism detailed |
| 23 | Platform detection (CLI/VS Code) | `squad.agent.md` | PRD 5 | Adapter pattern handles platform differences |
| 24 | Context caching (team.md read-once) | `squad.agent.md` | PRD 5 | Session state management |
| 25 | Ceremony system | `squad.agent.md` + `ceremonies.md` | PRD 5 | Before/after triggers preserved |
| 26 | Directive capture | `squad.agent.md` | PRD 2 (`squad_decide`) | Typed decision tool |
| 27 | Scribe orchestration logging | `squad.agent.md` | PRD 5, PRD 6 | JSONL event logging |
| 28 | `.squad/` directory structure | `index.js` + PRD 14 | PRD 14 | Clean-slate redesign |

---

## ⚪ INTENTIONAL — Deliberately Dropped or Replaced

| # | Feature | Current Location | Replacement | Notes |
|---|---------|-----------------|-------------|-------|
| 1 | 32KB prompt-only architecture | `squad.agent.md` | SDK TypeScript runtime | Entire replatform purpose |
| 2 | Convention-based file coordination | `squad.agent.md` | Custom Tools API (PRD 2) | Typed tools replace file-write conventions |
| 3 | Prompt-level policy enforcement | `squad.agent.md` (~17K tokens) | Hooks (PRD 3) | Programmatic enforcement |
| 4 | `.ai-team/` directory name | `index.js` dual-path | `.squad/` (PRD 14) | Deprecation already announced |
| 5 | `.ai-team-templates/` directory name | `index.js` | `.squad-templates/` or embedded | Part of clean-slate |

---

## Recommendations

### 🔴 GRAVE Items — Immediate Action Required

**1. Create PRD 15: Export/Import & Portability (GRAVE #1–3)**
The entire squad portability story (export, import, history splitting) has zero PRD coverage. This is how users move their team between projects. Without it, teams are permanently locked to a single repo. **Owner suggestion:** Fenster or Verbal. **Priority:** Phase 2.

**2. Add `squad copilot` and @copilot integration to PRD 5 or create PRD 15.5 (GRAVE #5–6)**
The @copilot coding agent integration (add/remove from roster, capability profiling, auto-assign) is a key differentiator. No PRD addresses it. This needs to either fold into PRD 5 (Coordinator Replatform) or get its own PRD. **Owner suggestion:** Keaton.

**3. Create workflow migration appendix for PRD 14 (GRAVE #7–8)**
12 workflow templates + project-type detection are completely unaddressed. These are what make Squad's GitHub integration work. PRD 14 needs an appendix that inventories every workflow, lists its path dependencies, and specifies the migration path. **Owner suggestion:** Fenster.

**4. Preserve template file inventory in PRD 14 (GRAVE #12)**
18 template files (charter.md, routing.md, casting-*.json, etc.) are the "team DNA" that consumers receive. PRD 14 needs a table listing every template with its status: keep/modify/replace/drop. **Owner suggestion:** Keaton.

**5. Add migration registry concept to PRD 12 or 14 (GRAVE #10)**
The version-keyed migration system (create dirs, scrub emails, etc.) ensures smooth upgrades. Neither PRD 12 nor 14 addresses how versioned migrations will work in the SDK world. **Owner suggestion:** Kujan.

**6. Address identity system (now.md, wisdom.md) in PRD 14 (GRAVE #14)**
These files track team focus and accumulated wisdom. PRD 14 redesigns directory structure but doesn't mention them. They'll vanish silently. **Owner suggestion:** Verbal.

**7. Preserve insider channel in PRD 12 (GRAVE #13)**
The `#insider` branch distribution channel for early adopters is unmentioned. PRD 12 should specify whether npm tags (`@insider`) replace the GitHub branch approach. **Owner suggestion:** Kujan.

### 🟡 AT RISK Items — Needs PRD Clarification

**8. Document squad.agent.md customization migration path (AT RISK #1)**
This is the **#1 UX regression risk**. Users who have read/customized the 32KB prompt lose that transparency when logic moves to TypeScript. PRD 5 must include a "Customization Parity" section showing what levers users retain (config files) and what they lose (prompt inspection). **Owner suggestion:** Keaton + Verbal.

**9. Add .gitattributes merge=union to PRD 14 (AT RISK #3)**
Without merge=union, every branch merge will create conflicts in decisions.md and history.md. This is a 2-line addition to PRD 14 but it's critical infrastructure. **Owner suggestion:** Fenster.

**10. Clarify SDK-free fallback for `squad watch` (AT RISK #4)**
Current watch uses `gh` CLI only. PRD 8's redesign assumes SDK availability. We need a degradation path where watch works without SDK installed. **Owner suggestion:** Fenster.

**11. Add marketplace CLI commands to PRD 7 (AT RISK #5)**
Plugin marketplace CRUD (`add/remove/list/browse`) is implemented today but only mentioned as "future path" in PRD 7. Either commit to it or mark as intentional drop. **Owner suggestion:** Verbal.

**12. Preserve npx install path explicitly in PRD 12 (AT RISK #2)**
`npx github:bradygaster/squad` is in every tutorial, README, and getting-started guide. PRD 12 needs an explicit backward-compat commitment, not just "kept as alias." **Owner suggestion:** Kujan.

---

## Top 3 Most Concerning Items

1. **🔴 `squad.agent.md` user customizability (AT RISK #1)** — Today, the product IS the prompt. Users can read every routing decision, every spawn template, every fallback chain. Moving to TypeScript makes the product opaque. This is an existential UX change disguised as a platform migration.

2. **🔴 Export/Import portability (GRAVE #1–3)** — Zero PRD coverage for the entire squad portability story. Teams that move between projects, share configurations, or onboard new repos will lose their path entirely.

3. **🔴 Workflow templates (GRAVE #7)** — 12 workflow files are the backbone of Squad's GitHub integration (heartbeat, triage, issue-assign, label enforcement, CI, release). No PRD inventories or migrates them. They'll silently break when directory paths change.

---

*Generated by Kujan (Copilot SDK Expert). This is a living document — update as PRDs evolve.*
