# Team Decisions

Shared brain. All agents read this before working.

## Initial Setup

### 2026-02-07: Team formation
**By:** Copilot (Coordinator)
**What:** Created Squad's own team using The Usual Suspects universe — Keaton (Lead), Verbal (Prompt Engineer), McManus (DevRel), Fenster (Core Dev), Hockney (Tester).
**Why:** Squad needs a dedicated team to evolve the product, amplify its message, and stay ahead of the industry. Casting chosen to represent pressure and consequence, not literal role names. Brady (the owner) requested The Usual Suspects specifically.

### 2026-02-07: Prioritize stress testing Squad on a real project

**By:** Keaton

**What:** Squad's own team should build a non-trivial feature or project using the Squad workflow to validate orchestration, parallel execution, and memory compounding under real conditions.

**Why:** Current testing is theoretical. We've defined the patterns (drop-box, parallel fan-out, casting) but haven't stressed them with genuine multi-agent work where decisions propagate, agents disagree, or orchestration fails. A real project exposes coordination bugs, reveals where the coordinator instructions are unclear, and demonstrates whether memory actually compounds. This is the only way to know if Squad works at scale.

**Next steps:** Pick a target project (non-docs, real implementation), use Squad to build it, and log what breaks.

### 2026-02-07: Proposal-first workflow adoption

**By:** Keaton + Verbal
**Date:** 2026-02-07
**Context:** bradygaster's request for "proposal first" mindset

Squad adopts a proposal-first workflow for all meaningful changes (features, architecture, major refactors, agent design, messaging, breaking changes). Proposals must be written, reviewed by domain specialists, and approved by bradygaster before execution.

**Why:** Squad's mission requires compound decisions — each feature making the next easier. This only works with visibility and alignment. Proposals are the mechanism: visibility (changes documented before execution), alignment (team reviews before merge), memory (historical record of why choices were made), filtering (bad ideas cancelled, good ideas refined).

**What Changes:** New directory `docs/proposals/` with numbered markdown files. Agents write proposals, not just code. Review gates: Keaton (architecture), Verbal (AI strategy), domain specialists, Brady (final approval). 48-hour timeline.

**What Doesn't Change:** Bug fixes, minor polish, tests, doc updates, dependency bumps — no proposal needed. Parallel execution, drop-box pattern, casting system — all stay the same.

**Implementation:** Proposal written to `docs/proposals/001-proposal-first-workflow.md`.

### 2026-02-07: DevRel priorities for Squad onboarding

**By:** McManus

**What:** Identified six critical polish areas to improve Squad's first-5-minutes developer experience: (1) Make install output visible and explanatory, (2) Link sample-prompts.md from README (16 ready-to-use demos), (3) Add "Why Squad?" value prop section, (4) Elevate casting from Easter egg to feature, (5) Add troubleshooting section, (6) Record 2-minute demo video/GIF showing parallel work.

**Why:** The product has strong bones — solid messaging, tight Quick Start, real numbers in the context budget table — but the first-time experience has gaps. Install output is too quiet (just checkmarks, no structure explanation). Sample prompts are hidden in docs/. Casting (thematic persistent names) is mentioned once but not explained. No "why should I care?" section. No troubleshooting. No visual demo. These gaps increase time-to-value and reduce conversion. Priority is making the first 5 minutes irresistible — from "what is this?" to "I need this" as fast as possible.

### 2026-02-07: Agent experience evolution — three strategic directions

**By:** Verbal

**What:** Identified three areas where Squad's agent design should evolve to stay ahead of the industry: (1) Role-specific spawn prompts with adaptive context loading, (2) Reviewer protocol with guidance and grace periods, (3) Proactive coordinator chaining and conflict resolution.

**Why:** Current spawn template is uniform across all agents. This works functionally but doesn't match how specialists actually work — Leads need trade-off context, Testers need edge case catalogs, etc. Adaptive context loading (tagging decisions by domain, injecting only relevant history) prevents agents from parsing noise. Reviewer protocol adding rejection with guidance + grace periods makes reviews collaborative handoffs. Coordinator chaining follow-up work automatically and catching decision conflicts before the user sees them makes Squad feel predictive, not reactive.

### 2026-02-07: Industry trends — agent specialization, collaboration, speculative execution

**By:** Verbal

**What:** Three trends Squad should lead: (1) Dynamic micro-specialist spawning (10+ narrow experts on the fly), (2) Agent-to-agent negotiation (multi-turn collaboration, not just fan-out-and-merge), (3) Speculative execution (anticipatory agents for work that will obviously follow).

**Why:** Specialization — current 5-role model will expand to 10+ narrow specialists, adding specialists mid-session should be effortless. Collaboration — agents currently work in parallel and coordinator synthesizes; next evolution is agent-to-agent negotiation. Speculative execution — parallel agents are the only way to stay fast at scale; spawn anticipatory agents and discard if unneeded. These trends align with where the industry is headed. Squad should ship these patterns before competitors figure out basic parallelism.

### 2026-02-07: Baseline testing infrastructure needed before broader adoption

**By:** Hockney

**What:** Squad currently has zero automated tests. Before we move beyond internal experimentation, we need at minimum: (1) a test framework, (2) an integration test for the happy path (run `index.js` in a temp directory, validate expected files are created), and (3) error handling for filesystem failures.

**Why:** The installer manipulates the filesystem with conditional logic (skip if exists, recursive copy, directory creation). Without tests, we have no way to know when we break something. Users will get raw stack traces instead of helpful error messages. This is acceptable for early prototyping but not for external use — even as "experimental."

**Priority:** Not blocking current iteration. But required before we ask anyone outside the core team to use this.

**Proposed approach:** Use `tap` as test framework. Start with one integration test. Add error handling incrementally as we find failure modes.

### 2026-02-07: Stay independent, optimize around Copilot
**By:** Kujan
**What:** Squad will NOT become a Copilot SDK product. Instead, we optimize around the platform while maintaining independence. Focus on being the best example of what you can build *on* Copilot, not *of* Copilot.
**Why:** Squad's filesystem-backed memory (git-cloneable, human-readable) is a killer feature. SDK adoption would abstract this away and reduce transparency. We can evolve faster independently. If the SDK later adds features we need (agent memory primitives, marketplace integration, spawn quota management), we reconsider. Until then: independent product, platform-optimized implementation.

### 2026-02-07: Proposal 003 revisions after deep onboarding review
**By:** Kujan
**What:** Three revisions to Proposal 003 (Copilot Platform Optimization) based on full codebase review:
1. **Inline charter is correct** — inline charters are the right pattern for batch spawns (eliminates tool call from agent critical path). Agent-reads-own is better only for single spawns. Coordinator should pick the strategy per spawn.
2. **Context pre-loading downgraded** — current hybrid (inline charter, agent reads own history+decisions) is sound. Pre-loading would inflate spawn prompts unnecessarily. Removed from Phase 3.
3. **Parallel Scribe spawning confirmed** — `squad.agent.md` line 360 still spawns Scribe serially after work. Should change to parallel spawning with work agents.
**Why:** Proposal 003 was written before a full read of `squad.agent.md`. The coordinator's deliberate inline-charter design and hybrid context-loading approach are well-reasoned. Overriding them would fight the platform. Parallel Scribe remains a genuine friction point worth fixing.

### 2026-02-07: README rewrite proposal ready for review
**By:** McManus
**What:** Proposal 006 (`docs/proposals/006-readme-rewrite.md`) contains the complete new README text implementing proposal 002. Copy-paste-ready once approved. Key decisions: "What is Squad?" merged into hero, sample prompts link at end of Quick Start, no Go references in README (Go example in sample-prompts tracked separately), no demo GIF yet (needs production setup).
**Why:** Consolidates messaging overhaul into a concrete, reviewable artifact. Needs sign-off from Keaton (messaging), Brady (owner), and Verbal (voice/tone review on "Why Squad?" section).

### 2026-02-07: Video content strategy approved
**By:** Verbal
**What:** Video content strategy for Squad: 75-second trailer, 6-minute full demo, 5-video series (7 total including supercut). Trailer ships first (cold open, no intro). Visual hook is agents coordinating through decisions.md, not code generation. "Throw a squad at it" closes every video. Weekly release cadence (~9 weeks).
**Why:** Positions Squad as the definitive multi-agent tool for Copilot through visual proof. Needs McManus (scripting/polish), Keaton (strategy alignment review), Brady (release cadence and on-camera decision). Proposal: `docs/proposals/005-video-content-strategy.md`.

### 2026-02-07: Demo script format — beat-based structure
**By:** McManus
**What:** Demo script (`docs/demo-script.md`) uses beat-based format with three sections per beat: 🎬 ON SCREEN (what viewer sees), 🎙️ VOICEOVER (exact words), 👆 WHAT TO DO (physical actions during recording). Eliminates improvisation — Brady records each beat independently.
**Why:** Brady's feedback: current script doesn't tell him what to do. Ambiguity costs takes. Beat format makes recording mechanical. Proposal: `docs/proposals/004-demo-script-overhaul.md`. Needs Keaton (feature ordering), Verbal (tone/claims), Brady (final sign-off).

### 2026-02-08: Portable Squads — architecture direction

**By:** Keaton
**Proposal:** 008-portable-squads.md

**What:** Squad will support exporting and importing team identity across projects via a JSON manifest file. Core architectural decision: separate Team Identity (portable) from Project Context (not portable) at the data model level. History split into `## Portable Knowledge` and `## Project Learnings`. Export format is a single `squad-export.json` manifest. CLI: `npx create-squad export` / `npx create-squad --from <manifest>`. Casting (universe, names, roles) travels unconditionally. No merge in v1 — `--force` replaces with archival.

**Why:** The team is more valuable than the project. Without portability, users rebuild from scratch every time. Opens path to squad sharing (v2) and registries (v3). Aligns with Proposal 007 (both modify history structure, complementary). Requires Hockney's testing infrastructure for round-trip validation. Template changes are backward-compatible.

### 2026-02-08: Agent persistence and latency reduction — tiered response modes

**By:** Kujan + Verbal

**What:** Proposed a tiered response system (Direct → Lightweight → Standard → Full) to replace the current "every interaction spawns an agent" model. Key changes: (1) Coordinator skips re-reading team.md/routing.md/registry.json after first message (context caching), (2) Scribe only spawns when inbox has files to merge, (3) Coordinator may handle trivial single-line tasks directly without spawning, (4) Lightweight spawn template for simple scoped tasks that skips history.md and decisions.md reads, (5) Progressive history summarization for mature projects.

**Why:** Brady's feedback: "later on, the agents get in the way more than they help." Root cause is that every interaction pays the same 9-10 tool call overhead (~30-35s) regardless of task complexity. By message 10, trivial tasks take 30+ seconds for what should be a 5-second change. P0 fixes (context caching + Scribe batching) are zero-risk instruction changes that save ~12-17s per message. P1 fixes (tiered modes + coordinator direct handling) transform the late-session experience from friction to flow.

**Proposal:** `docs/proposals/007-agent-persistence-and-latency.md`

### 2026-02-08: Portable squads — export/import design and platform feasibility

**By:** Kujan

**What:** Designed the portable squads feature: CLI subcommands (`create-squad export` / `create-squad import <file>`), `.squad` JSON file format, export payload definition, import flow, and coordinator integration. Key decisions: (1) Single JSON file format over tarball/directory, (2) refuse merge in v0.1 (existing squad → error), (3) manual history curation in v0.1 with LLM-assisted cleanup in v0.2, (4) `imported_from` one-time flag in registry.json for coordinator onboarding detection, (5) Scribe history excluded from export (project-specific), Scribe charter included.

**Why:** Brady wants users to move squads between projects. The feature is pure CLI/filesystem — no Copilot platform constraints. History splitting (portable user preferences vs. project-specific facts) is the only hard problem; v0.1 punts to manual curation. Merge support deferred to v0.3 due to universe conflicts and name collision complexity. Implementation is ~80 lines in `index.js`, ~10 lines in `squad.agent.md`. No new dependencies.

**Proposal:** `docs/proposals/008-portable-squads-platform.md`

### 2026-02-08: Portable Squads — memory architecture and experience design

**By:** Verbal

**What:** Portable squads require a memory split: separate `preferences.md` (user-specific, portable) from `history.md` (project-specific, stays). Add `squad-profile.md` for team-level meta-history. Export packages charters + preferences + casting + coordinator. Import reconstitutes the squad with user knowledge intact but project context empty. Import skips casting ceremony. Narrative markdown format for v1.

**Why:** Nobody in the industry has portable agent teams — category-defining feature. Stickiness through relationship capital, not lock-in. Filesystem-backed memory makes export trivially simple. Enables future phases: squad templates, team-shared squads, marketplace. Aligns with Proposal 007's progressive summarization.

**Proposal:** `docs/proposals/008-portable-squads-experience.md`

### 2026-02-08: Squad v1 Sprint Plan — architecture and prioritization

**By:** Keaton
**Proposal:** 009-v1-sprint-plan.md

**What:** Comprehensive v1 sprint plan synthesizing proposals 001-008 and Brady's directives. Three sprints over 10 days:

- **Sprint 1 (Days 1-3): "Make It Fast"** — Forwardability (`npx create-squad upgrade`), latency P0 fixes (context caching + Scribe batching), tiered response modes (Direct/Lightweight/Standard/Full), coordinator direct handling. Init always overwrites `squad.agent.md` — it's our code, not user state.

- **Sprint 2 (Days 4-7): "Make It Yours"** — History split (Portable Knowledge / Project Learnings), Skills system (`skills.md` — domain expertise that compounds across projects), export/import CLI with manifest schema v1.0, imported squad detection in coordinator.

- **Sprint 3 (Days 8-10): "Make It Shine"** — README rewrite, testing infrastructure (5 core tests with tap), progressive history summarization, lightweight spawn template.

**Key architectural decisions:**
1. **Forwardability bright line:** We own `squad.agent.md` and templates. Users own `.ai-team/`. Upgrade overwrites our code, never touches their state.
2. **Skills are a new first-class concept.** Not preferences (about the user), not project learnings (about the codebase) — domain expertise about technologies and frameworks. Stored in `.ai-team/skills.md`. Portable and shareable.
3. **`preferences.md` deferred to v1.1.** Portable Knowledge section in history.md is sufficient for v1. Separate file adds migration cost without near-term benefit.
4. **No merge in v1.** `--force` with archival only. Merge is v2.
5. **No `squad-profile.md` in v1.** Relationship tracking is v1.1.

**What's explicitly cut from v1:** Squad merge, LLM-assisted history classification, squad sharing/registry, agent-to-agent negotiation, speculative execution, Copilot SDK integration, squad diff.

**Why:** Brady said forwardability, portability, and skills are all v1 features. 9 users, division talking. The plan is aggressive because it needs to be. "Throw a squad at it" must be earned, not marketed.

**Success criteria:** Trivial task latency drops from ~30s to ~3-5s. Export/import round-trip at 100% fidelity. Upgrade preserves 100% of user state. 5 core tests passing. Brady approves.

### 2026-02-08: Skills system — agent competence as portable knowledge

**By:** Verbal
**Date:** 2026-02-08
**Proposal:** 010-skills-system.md

**What:** Squad agents will acquire, store, and apply **skills** — earned domain knowledge that changes how agents approach work. Skills are distinct from preferences (which are about the user): skills are about what the agent *knows how to do*. Storage: `skills.md` per agent (domain expertise) + squad-level `skills.md` (cross-cutting patterns). Skills travel with portable squad exports alongside preferences and charters. Skill types: patterns, domain expertise, workflows, procedural knowledge, anti-patterns, integration knowledge. Lifecycle: acquisition → reinforcement → correction → deprecation. Confidence tracked via project count (Low/Medium/High). Agents declare known gaps ("What I Don't Know Yet"). Coordinator routes work using skill awareness. Manifest version bumps to 1.1 to include skills in export.

**Why:** Portable squads (Proposal 008) solved "your team knows YOU." Skills solve "your team knows how to DO THINGS." Combined: a squad arrives at a new React project already knowing the user's preferences AND React's patterns. Day one productive. Nobody in the industry has agent skills as a portable, earned, transferable concept. This is the feature that makes squad sharing (marketplace) actually valuable — the difference between a costume and competence. Skills compound across projects: each export captures more, each import starts from a higher baseline. Implementation phased across 6 releases, starting with template + instruction changes only (zero code changes in Phase 1).

**Depends on:** Proposal 008 (Portable Squads) for export/import integration; Proposal 007 (Persistence) for progressive summarization of skills.

### 2026-02-08: Forwardability and upgrade path

**By:** Fenster
**Date:** 2026-02-08

**What:** Squad adopts a forwardability model based on three principles:

1. **File ownership model.** Every file Squad touches is classified as Squad-owned (overwrite on upgrade), user-owned (never touch), or additive-only (create if missing). `squad.agent.md` and `.ai-team-templates/` are Squad-owned. Everything in `.ai-team/agents/`, `decisions.md`, and `casting/` is user-owned.

2. **`npx create-squad upgrade` subcommand.** Backs up `squad.agent.md`, overwrites it with the latest version, refreshes templates, runs version-specific migrations, creates new directories. Never touches user state. Always backs up before overwriting.

3. **Version-keyed migration system.** Migrations are idempotent functions keyed by version range. Each migration moves `.ai-team/` state forward (e.g., adding `## Portable Knowledge` sections to histories). Migrations are non-destructive, fault-tolerant, and ordered. A failed migration logs an error but doesn't abort the upgrade.

**Why:** The current installer skips files that already exist. This was correct for v0.1 (don't clobber) but blocks upgrades entirely. When we ship a better `squad.agent.md`, existing users never get it. Brady requires forwardability — users should be able to update their squads with new features.

The file ownership model ensures upgrades are safe. The migration system ensures state evolves correctly. The backup strategy ensures recoverability.

**Implementation:**
- Phase 1 (v0.1.1): Version stamping — add `squad_version` to frontmatter, write `.squad-version` metadata, show version in output
- Phase 2 (v0.2.0): Upgrade command — argument routing, `upgradeSquad()`, migration framework, backup + overwrite
- Phase 3 (v0.2.1): Dry-run, backup, and force flags
- Phase 4 (v0.3.0): Customization detection via content hashing

No new dependencies. `index.js` stays under 150 lines. Aligns with Proposal 008's export/import subcommands — all share the same argument routing pattern.

**What Doesn't Change:**
- Default `npx create-squad` behavior (init flow) is unchanged
- User-owned files are never modified by the upgrade system
- No new dependencies in `package.json`
- The coordinator reads `squad.agent.md` fresh every session — overwriting it IS the upgrade

**Proposal:** `docs/proposals/011-forwardability-and-upgrade-path.md`

### 2026-02-08: Skills platform architecture and v1 Copilot integration

**By:** Kujan

**What:** Skills are transferable domain expertise stored in per-agent `skills.md` files, separate from project-specific `history.md`. The coordinator inlines skills into spawn prompts alongside charters. Skills enable lighter spawns for skilled-domain tasks (extending Proposal 007's tiered modes). `store_memory` is NOT useful for Squad — wrong persistence model, no agent identity, too small. Forwardability handled via defensive file reads (existence checks), not version fields. File paths in charters are a de facto API contract — treat as frozen.

**Why:** Brady wants agents that learn across projects. Skills are the mechanism. Keeping skills separate from history makes the Proposal 008 export clean (skills travel unconditionally, history needs filtering). The `store_memory` analysis prevents the team from investing in a dead-end platform integration. The forwardability analysis prevents breaking changes when `squad.agent.md` evolves. The v1 synthesis (007 + 008 + 012) tells a coherent product story: Squad gets better the more you use it.

**Proposal:** `docs/proposals/012-skills-platform-and-copilot-integration.md`

**v1 scope:** Agent self-writing to skills.md, user-teaches-skills via coordinator, skills in spawn prompts, skills in `.squad` export, defensive forwardability. NOT in v1: `store_memory` integration, automatic skill detection, cross-agent skill sharing, selective skill loading.

### 2026-02-08: V1 test strategy

**By:** Hockney
**Date:** 2026-02-08
**Proposal:** 013-v1-test-strategy.md

**What:** Squad adopts a comprehensive test strategy for v1 using `node:test` + `node:assert` (zero dependencies). Nine test categories covering init, idempotency, export, import, round-trip, upgrade, schema validation, edge cases, and platform-specific behavior. Six blocking quality gates must pass before v1 ships. CI via GitHub Actions matrix (ubuntu, macos, windows).

**Key Decisions:**
1. **Framework: `node:test`** — zero dependencies, built into Node 22. Previous recommendation of `tap` is withdrawn in favor of Brady's thin-runtime philosophy.
2. **Coverage target: 90% line, 85% branch** — `index.js` is small enough that this means "you tested almost everything."
3. **Quality gates (all blocking):** All tests pass; init happy path works; export/import round-trip produces identical portable state; no raw stack traces on any error path; idempotent re-runs don't corrupt state; schema validation catches all malformed input.
4. **Test architecture: 80% integration, 20% unit** — run the CLI in temp dirs, check file output.
5. **No pre-commit hook** — CI is the gate.
6. **`index.js` refactoring recommended** — wrap in functions, export for testing, use `require.main === module` guard.

**Why:** Nine users. Whole division talking. Zero tests. This is a product now — if a user can break it, we should have broken it first.

### 2026-02-08: V1 messaging, README, and launch strategy

**By:** McManus
**Date:** 2026-02-08
**Proposal:** `docs/proposals/014-v1-messaging-and-launch.md`

**What:** Complete v1 public-facing launch plan covering: positioning statement, README rewrite, demo script, launch strategy, community engagement, and competitive positioning.

**Key decisions:**
1. **V1 tagline:** "Throw MY squad at it" — the possessive pronoun is the entire v1 story.
2. **One-liner:** "Your AI squad remembers you. Across every project. Forever."
3. **README restructured for v1** with three new sections: "Your Squad Learns" (skills + persistence merged), "Take Your Squad Anywhere" (portability), and "Staying Current" (forwardability).
4. **Demo script is a two-project arc** — the "holy crap" moment: squad remembers preferences in a brand new project without being told.
5. **Launch sequence:** 7-day pre-launch teasers → D-Day → D+7 follow-up → D+14 community showcase.
6. **Community strategy:** GitHub Discussions first, not Discord. `#throwasquadatit` hashtag. No squad sharing in v1.
7. **Competitive positioning:** "Other tools have memory. Squad has a relationship." Never trash Copilot Chat.

**Why:** Brady's goals: "9 users, whole division talking," "throw a squad at it should be EARNED." Three v1 features (portability, skills, forwardability) are category-defining. The launch must match the ambition.

### 2026-02-08: P0 — Silent success bug mitigation

**By:** Kujan
**Priority:** P0

**What:** ~40% of background agents complete all work (files written, histories updated) but `read_agent` returns "did not produce a response." Root cause: agent's final LLM turn is a tool call (writing history.md/inbox), not text. The `task` tool's response channel drops tool-call-only final turns. Three zero-risk mitigations proposed: (1) reorder spawn prompt so agents end with text summary after all file writes, (2) add silent success detection to coordinator's "After Agent Work" flow — check file existence when response is empty, (3) always use `read_agent` with `wait: true, timeout: 300`.

**Why:** This is the #1 trust-destroying bug. When the coordinator tells the user "agent failed" but the work is sitting on disk, it creates the exact "agents get in the way" perception Brady flagged. The mitigations are all additive, non-breaking, and can ship immediately. Expected to reduce silent success rate from ~40% to <15% (prompt fix) and catch remaining cases with file verification (detection fix). If rate stays above 10% after mitigations, escalate to Copilot team as platform bug.

**Proposal:** `docs/proposals/015-p0-silent-success-bug.md`

### 2026-02-09: Adopt Agent Skills Open Standard with MCP tool declarations

**By:** Kujan

**What:** Squad will adopt the Agent Skills Open Standard (agentskills.io) for its skills system instead of the previously proposed flat `skills.md` file. Skills use the standard SKILL.md format with YAML frontmatter, standard directory layout (SKILL.md + scripts/ + references/ + assets/), and progressive disclosure. MCP tool dependencies are declared via `metadata.mcp-servers` in SKILL.md frontmatter. Two skill categories: built-in (shipped with Squad, upgradable via `create-squad upgrade`, prefixed `squad-`) and learned (created by agents/users, never overwritten by upgrades). Skills discovery uses the standard's `<available_skills>` XML injection into spawn prompts.

**Why:** Brady clarified that "skills" means Claude-and-Copilot-compliant skills adhering to the Anthropic SKILL.md standard. Adopting the open standard gives Squad three advantages: (1) ecosystem compatibility — skills published on agentskills.io can be dropped into `.ai-team/skills/` and just work, (2) progressive disclosure — coordinator loads only name + description at discovery (~100 tokens per skill), full SKILL.md on activation, keeping spawn prompts lean, (3) future-proofing — the standard's extensible metadata field cleanly accommodates our MCP server declarations without inventing a proprietary format. The standard's filesystem-native design (directories with markdown files) aligns perfectly with Squad's filesystem-backed memory architecture.

**Key decisions within this decision:**
- Skills directory layout: `.ai-team/skills/` (team-wide) + `.ai-team/agents/{name}/skills/` (per-agent)
- MCP declaration: `metadata.mcp-servers` array in SKILL.md frontmatter with `name`, `reason`, `optional`, and `fallback` fields
- Built-in skills: shipped in `templates/skills/`, prefixed `squad-`, upgradable
- Learned skills: agent-created or user-taught, never touched by upgrades
- Skills directory layout is a frozen API contract (like charter file paths)
- Progressive disclosure over full inlining — XML summary at discovery, full read on activation
- No MCP auto-configuration (security concern) — skills document requirements, users configure servers

**Proposal:** `docs/proposals/012-skills-platform-and-copilot-integration.md` (Revision 2)

### 2026-02-09: Squad Paper — The Case for Multi-Agent Teams

**By:** Verbal
**Date:** 2026-02-09
**Proposal:** 016-the-squad-paper.md

**What:** Proposal 016 is the first draft of a paper/white paper making the legitimate business and productivity case for multi-agent development teams, using Squad's own session as the primary case study.

**Key Claims (backed by session data):**
1. **50-70x productivity multiplier** on structured thinking output per unit of human attention (14 proposals in one session vs. 4-6 days of human PM work)
2. **Perspective diversity** — 6 agents analyzing the same feature from 6 angles simultaneously produces insights a single agent would miss
3. **Real-time adaptation** — the skills concept evolved through 3 pivots in ~15 minutes; a human PM would need half a day per pivot
4. **Self-diagnosis** — the team identified and proposed solutions for its own latency problem within the same session where the complaint was raised
5. **Compound effect** — portable squads + earned skills = ROI increases over time, not just per-session

**Why This Matters:** Brady specifically requested this: *"i think this needs a paper in the end to describe the legitimate benefit."* He also wanted to address the "squads are slow" criticism by showing how much actually gets done in a session. This paper does both.

**Format Decision:** Written as a proposal (because proposal-first), structured as a publishable paper. McManus should take this draft and polish for external publication. The data is real, the structure is set, the argument is made.

**Dependencies:** McManus for publication polish, Keaton for accuracy review of architectural claims, Brady for final sign-off.


---

### Fenster — Sprint Plan 009 Implementation Review

**Author:** Fenster (Core Dev)
**Date:** 2026-02-09
**Re:** Proposal 009 (v1 Sprint Plan) feasibility assessment
**Requested by:** bradygaster

---

## Verdict: Approve with re-sequencing

The plan is good. The feature set is right. The dependency map is mostly correct. But the sequencing has a critical gap: **Proposal 015 (silent success bug) is not in the sprint plan at all**, and it should be Sprint 0 — before anything else ships.

Below is my section-by-section implementation review.

---

## 1. Sprint 1 Feasibility: Forwardability (~4 hours estimate)

**Assessment: 4 hours is about right for the `index.js` changes alone. But the plan undersells the scope.**

### What's actually involved

I already wrote Proposal 011 with the complete `index.js` sketch (~140 lines, up from 65). The plan's section 1.1 describes the intent correctly but glosses over implementation details I covered:

- **Version detection** needs three fallback strategies (`.squad-version` file → frontmatter parsing → presence detection). The plan just says "version header in squad.agent.md" — that's the easy part. Detecting pre-versioning installs (every current user) is the hard part.
- **Backup before overwrite** — the plan doesn't mention this. My Proposal 011 does. If upgrade clobbers a customized `squad.agent.md` with no backup, Brady will hear about it from users. Non-negotiable.
- **Migration framework** — even though v0.1→v0.2 has no data migrations, the framework needs to exist. Empty migrations array is fine, but the plumbing (getMigrations, ordered execution, idempotency) must be built now or we'll be retrofitting it under pressure when v0.3 needs it.
- **Error handling** — backup failure aborts. Overwrite failure restores backup. Migration failure warns but continues. This is not trivial code.

### What's missing from the plan

1. **The plan says init should "always write squad.agent.md" (remove skip-if-exists)**. My Proposal 011 disagrees. Init should still skip if exists, but HINT at upgrade. Reason: `npx create-squad` is what users run in CI, in scripts, in onboarding docs. Silently overwriting their coordinator without warning on every `npx create-squad` is wrong. The plan's proposed change means any re-run of the init command overwrites — that's not forwardability, that's clobbering.

2. **No mention of `.squad-version` metadata file.** Where does the installed version live? The plan says "version header in squad.agent.md" but that couples version detection to parsing a 32KB markdown file. My proposal uses a dedicated `.ai-team-templates/.squad-version` JSON file.

3. **Templates overwrite behavior.** The plan says upgrade overwrites templates. Fine. But init should still skip templates if they exist (same as coordinator). The plan marks both init and upgrade as "always overwrite" — that changes init semantics in a way users don't expect.

### Revised estimate

- `index.js` rewrite with upgrade, version detection, backup, migrations: **4-5 hours**
- `squad.agent.md` version header addition: **15 minutes**
- Testing the upgrade path on a real v0.1.0 install: **1 hour**
- **Total: ~6 hours** (not 4)

### Recommendation

Use Proposal 011's `index.js` sketch as the implementation baseline, not the plan's simplified pseudocode. The sketch handles all the edge cases the plan skips.

---

## 2. Sprint 2 Feasibility: Export/Import CLI (~6 hours estimate)

**Assessment: 6 hours is unrealistic. 10-12 hours minimum.**

### What's actually hard

The plan lists the export manifest schema and import flow as if they're straightforward file operations. They're not.

#### Export edge cases the plan misses:

1. **History heuristic extraction.** The plan says "Portable Knowledge section only" for history export, with "heuristic extraction for unsplit histories." There IS no heuristic yet. Writing one that correctly separates "Brady prefers explicit error handling" from "Auth module is in src/auth/" from a flat history.md is an LLM task, not a regex task. And we said we're not using LLM-assisted classification in v1 — so what's the actual heuristic? This is undefined work.

2. **Casting state validation.** The plan exports `registry.json`, `history.json`, `policy.json` as opaque blobs. What if they reference files or paths specific to the source project? What if universe assignments are inconsistent? Export needs to validate, not just copy.

3. **Manifest size.** Skills + charters + portable knowledge + casting state + routing. If a squad has worked on 5 domains with 6 agents, this manifest could be large. The plan doesn't set size limits or mention chunking.

4. **Encoding.** History files may contain unicode, emoji, special characters. JSON.stringify handles this but we need to verify round-trip fidelity with real history.md content.

#### Import edge cases the plan misses:

1. **Manifest validation.** "Validate `.squad` or `.json` manifest" — what's the validation? Schema checking? Version compatibility? The plan doesn't define what makes a manifest invalid. A malformed manifest shouldn't silently create a broken squad.

2. **Conflict with existing `.ai-team/`.** The plan says "refuse if `.ai-team/team.md` exists (unless `--force`)". But what about partial state? What if `.ai-team/` exists but `team.md` doesn't? What if agents/ exists with some but not all of the imported agents? The detection needs to be more nuanced than "team.md exists."

3. **`--force` archive naming.** `.ai-team-archive-{timestamp}/` — what timestamp format? ISO 8601 with colons doesn't work as a directory name on Windows. Need `YYYYMMDD-HHmmss` or similar.

4. **Import of skills.md.** The plan says "Write skills.md from manifest." But what if skills.md already has content from the current project and we're not using `--force`? This is a merge problem the plan explicitly defers to v2, but import without merge means destroying local skills.

#### The dependency problem:

Export depends on history split (2.1) AND skills (2.2). Both are prompt-engineering changes to `squad.agent.md`. Until agents are actually writing to the new history format and skills.md, there's nothing meaningful to export. The plan acknowledges this dependency but underestimates the testing overhead: you need a squad that has actually USED the new formats to verify export captures them correctly.

### Revised estimate

- Export command implementation: **3-4 hours**
- Import command implementation: **3-4 hours**
- Manifest validation: **2 hours**
- History heuristic (or deciding to punt it): **1-2 hours**
- Round-trip testing: **2 hours**
- **Total: 11-14 hours** (not 6)

### Recommendation

Ship export-only in Sprint 2. Import is Sprint 3. Export is useful immediately (backup/audit). Import without thorough testing is dangerous — it creates broken squads.

---

## 3. P0 Priority Check: Silent Success Bug (Proposal 015)

**Assessment: This MUST be Sprint 0. Before everything else.**

### Why it blocks the sprint plan

The silent success bug means ~40% of agent spawns lose their response text. The sprint plan's entire development process uses Squad to build Squad. If Verbal writes the tiered response mode changes to `squad.agent.md` and the coordinator reports "did not produce a response," we've lost work. If I implement forwardability and my response vanishes, Brady sees failure where there was success.

**You cannot build v1 with a tool that lies about success 40% of the time.**

### Proposal 015's mitigations are zero-risk

Every change in Proposal 015 is a prompt instruction change to `squad.agent.md`:

1. Response order guidance (tell agents to end with text, not tool calls) — ~15 minutes to edit
2. Silent success detection (coordinator checks for files when response is empty) — ~30 minutes to edit
3. `read_agent` timeout increase (`wait: true`, `timeout: 300`) — ~10 minutes to edit

**Total implementation: ~1 hour.** These are instruction edits, not code changes.

### The trust argument

Brady said "human trust is P0." If Squad reports "agent did not produce a response" when the agent actually wrote a 45KB proposal, that's a trust-destroying moment. The user thinks the system failed. The system actually succeeded. This is worse than an actual failure — at least real failures are honest.

### Recommendation

Ship Proposal 015 as Sprint 0. One hour of work. Zero risk. Immediately makes the rest of the sprint more reliable. Don't start Sprint 1 without this.

---

## 4. My Re-sequencing

Given "human trust is P0," here's the order I'd build in:

### Sprint 0: Trust Foundation (Day 0, ~2 hours)

1. **Silent success bug fix** (Proposal 015) — prompt changes to `squad.agent.md`
2. **Response format enforcement** — same file, same edit session

This unblocks everything. Every subsequent sprint benefits from agents that reliably report their work.

### Sprint 1: Forwardability + Latency (Days 1-3)

1. **`index.js` rewrite** with upgrade, version detection, backup, migrations (Proposal 011 sketch)
2. **Latency fixes** — context caching, Scribe batching (prompt changes)
3. **Tiered response modes** — routing table in `squad.agent.md` (prompt changes)
4. **Coordinator direct handling** — permission expansion (prompt changes)

Items 2-4 are all prompt edits. They can ship independently of item 1. Item 1 is the code work.

### Sprint 2: Portability Foundation (Days 4-7)

1. **History split** — template + prompt changes (prerequisite for everything else)
2. **Skills system** — template + prompt changes
3. **Export CLI** — `create-squad export` command in `index.js`
4. **Defer import to Sprint 3** — export is useful alone; import needs more testing

### Sprint 3: Import + Polish + Tests (Days 8-10+)

1. **Import CLI** — `create-squad import` with proper validation
2. **Imported squad detection** — coordinator prompt change
3. **Testing infrastructure** — Hockney's 5 core tests
4. **README rewrite** — McManus
5. **History summarization** — if time permits

### Why this order

- Sprint 0 makes every subsequent sprint more reliable
- Export before import: export is a backup mechanism even without import
- Import gets more testing time, which it desperately needs
- Tests can cover export AND import in Sprint 3 instead of testing export in Sprint 2 and import in Sprint 3 separately

---

## 5. Dependencies the Plan Gets Wrong

### Marked parallel but has a hard dependency:

1. **2.3 Export/Import depends on 2.2 Skills.** The plan shows this correctly in the dependency diagram but then assigns both to Sprint 2 days 4-7 as if they can overlap. Skills system (prompt engineering) must be DONE before export knows what to export. If skills.md format changes during export development, export breaks. **Verdict: Skills must be finalized before export begins. At least 1 day gap.**

2. **3.2 Testing depends on export AND import.** The plan's test list includes "Export/import round-trip" and "Skills persistence test." If import is in Sprint 2, testing it in Sprint 3 works. But if import bugs are found in testing, the fix cycle bleeds past Sprint 3. **Verdict: Import and tests should overlap in Sprint 3 with buffer for fix cycles.**

### Marked sequential but could be parallel:

1. **2.1 History split and 1.1 Forwardability.** The plan says "Sprint 2 blocks: Sprint 1 must ship first (forwardability is prerequisite for template updates reaching users)." This is wrong for development purposes. History split is a prompt change to `squad.agent.md` — it doesn't require forwardability to DEVELOP. It requires forwardability to SHIP to existing users. Development can start in parallel. Only the final `squad.agent.md` delivery needs Sprint 1 done. **Verdict: History split development starts Day 1. Just don't merge into the coordinator file until upgrade works.**

2. **3.1 README rewrite and Sprint 2.** The plan notes McManus "can start README draft" during Sprint 2. McManus can start the README Day 1. The README doesn't depend on any implementation — it's messaging work. Only the final version needs feature screenshots/demos. **Verdict: README drafting is fully parallel from Day 1.**

3. **3.4 Lightweight spawn template and 1.3 Tiered modes.** The plan marks this as dependent. It's not — the lightweight template is a standalone prompt blob. It references tiered mode concepts but doesn't require the routing table to exist. Both are edits to the same file. **Verdict: Can be developed in parallel, merged together.**

### Missing dependency:

1. **Export/Import depends on `package.json` updates.** The manifest includes `exported_from` and version info. The package.json version must be bumped to 0.2.0 before export generates correct manifests. The plan mentions version bump in passing but doesn't sequence it. **Verdict: Version bump is Sprint 1, item 1.**

---

## Summary for Brady

The sprint plan is solid architecture, weak on implementation details. My recommendations:

1. **Add Sprint 0** — ship Proposal 015 (silent success bug) immediately. 1 hour, zero risk, unblocks trust.
2. **Revise Sprint 1 estimate** from 4 to 6 hours for forwardability. Use Proposal 011's implementation, not the plan's simplified version.
3. **Revise Sprint 2 estimate** from 6 to 11-14 hours for export/import. Or split: export in Sprint 2, import in Sprint 3.
4. **Start parallel tracks earlier** — README and history split development can begin Day 1.
5. **Keep the "What We're NOT Doing" list** — it's the most important section of the plan. Don't let scope creep.

The plan's total timeline of 10 days is achievable IF we split import from export. If we try to do both in Sprint 2 with the current 6-hour estimate, Sprint 2 will overrun and compress Sprint 3.

With re-sequencing: **12 days total, high confidence.** Without: **10 days, medium confidence with Sprint 2 overrun risk.**

— Fenster


---

### Decision: Test Sequence and Sprint Placement

**Author:** Hockney (Tester)
**Date:** 2026-02-09
**Context:** Brady asked if we have team agreement on the sprint plan. I'm reviewing the test aspects of Proposal 009 against my own Proposal 013, and flagging where the plan puts quality at risk.

---

## 1. Are 5 Tests Enough for v1?

**No. But the right 5 tests cover the critical path.**

Proposal 009 lists 5 tests for Sprint 3:

1. Init test
2. Upgrade test
3. Export/import round-trip
4. Forwardability test
5. Skills persistence test

My Proposal 013 has ~80 test cases across 9 categories. That's the full picture. But 80 tests in Sprint 3 (days 8-10) is fantasy — we'd spend all of Sprint 3 just writing tests and ship nothing else.

**My position:** 5 tests is the right number for the *Sprint 3 deliverable*, BUT only if we've been writing foundational tests alongside Sprint 1 and Sprint 2 implementation. The 5 tests in the plan are integration/acceptance tests that prove the whole system works. They sit on top of unit and module tests that should already exist.

**The minimum test suite that proves the product works:**

| # | Test | What It Proves | Non-Negotiable? |
|---|------|---------------|-----------------|
| 1 | Init happy path | The product installs correctly | ✅ YES |
| 2 | Init idempotency | Running twice doesn't corrupt state | ✅ YES |
| 3 | Export/import round-trip | Portability actually works | ✅ YES |
| 4 | Malformed input rejection | Bad `.squad` files don't crash the CLI | ✅ YES |
| 5 | Upgrade preserves user state | Users don't lose their team | ✅ YES |
| 6 | Exit codes are correct | Scripts can depend on us | ⚠️ Should have |
| 7 | No raw stack traces on error | Users see messages, not crashes | ⚠️ Should have |

**Bottom line:** 5 is enough if they're the RIGHT 5. Tests 1-5 above are my non-negotiable set. Tests 6-7 are close behind.

---

## 2. Should Testing Be Sprint 3 or Earlier?

**Testing MUST start in Sprint 1. This is the hill I'll die on.**

Proposal 009 puts ALL testing in Sprint 3 (days 8-10). That's a mistake. Here's why:

**Brady's P0 is human trust.** Trust comes from reliability. Reliability comes from tests. If we build for 7 days without tests, we're building on a foundation we can't verify. Every Sprint 2 feature (export, import, skills) is built on top of Sprint 1 code (init, upgrade). If init is broken in a subtle way, we won't know until Sprint 3 — and then we're debugging foundational bugs while trying to write tests AND polish.

**My recommended test timeline:**

| Sprint | Tests to Write | Why Now |
|--------|---------------|---------|
| Sprint 1 (days 1-3) | Init happy path, init idempotency | We're touching `index.js` for forwardability. Write tests for the code we're changing. Takes 1 hour. |
| Sprint 2 (days 4-7) | Export validation, import validation, round-trip | We're building export/import. Write tests as we build. Takes 2 hours. |
| Sprint 3 (days 8-10) | Upgrade preservation, edge cases, CI pipeline, malformed input | Harden and ship. Takes 3 hours. |

**Total effort is the same (~6 hours).** We're just spreading it across sprints instead of cramming it into the last 3 days.

**The Sprint 3-only plan has a specific failure mode:** Fenster builds export/import in Sprint 2 without tests. I write tests in Sprint 3 and discover that the `.squad` JSON format has a bug — maybe it silently drops agent skills during export. Now it's day 9 and we're choosing between shipping a broken feature or delaying the release. Tests alongside implementation catch this in Sprint 2 when there's time to fix it.

**Decision:** Testing starts Sprint 1, day 1. I'll pair with Fenster — they implement, I test. This is how quality works.

---

## 3. The Silent Success Bug (Proposal 015) — How to Test

The silent success bug is a platform-level issue (background agents returning empty responses despite completing work). We can't unit-test LLM behavior. But we CAN write a regression test for the *mitigations*.

**What we can test:**

### Test A: Response Order Compliance
Verify that the spawn prompt template in `squad.agent.md` contains the response-order instruction. This is a content test — grep for the critical text:

```javascript
it('spawn prompt requires text summary as final output', () => {
  const content = fs.readFileSync(
    path.join(tmpDir, '.github', 'agents', 'squad.agent.md'), 'utf8'
  );
  assert.ok(
    content.includes('end with a TEXT summary') || 
    content.includes('RESPONSE ORDER') ||
    content.includes('end your final message with a text summary'),
    'squad.agent.md must instruct agents to end with text, not tool calls'
  );
});
```

### Test B: Silent Success Detection Instructions
Verify that the coordinator instructions include silent-success detection logic:

```javascript
it('coordinator handles silent success', () => {
  const content = fs.readFileSync(
    path.join(tmpDir, '.github', 'agents', 'squad.agent.md'), 'utf8'
  );
  assert.ok(
    content.includes('silent success') || content.includes('did not produce a response'),
    'squad.agent.md must include silent success detection'
  );
});
```

### Test C: File Existence as Ground Truth
The mitigation says "check if expected files exist when response is empty." We can test the FILE CREATION part — which is the ground truth the coordinator relies on:

```javascript
it('init creates all expected files (ground truth for silent success detection)', () => {
  execSync(`node ${indexPath}`, { cwd: tmpDir });
  // These are the files the coordinator checks when detecting silent success
  assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'agents', 'squad.agent.md')));
  assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team-templates')));
  assert.ok(fs.existsSync(path.join(tmpDir, '.ai-team', 'decisions', 'inbox')));
});
```

**What we CANNOT test:** Whether the LLM actually follows the response-order instruction. That's an AI behavior test, not a code test. Kujan's Proposal 015 is right that the ~40% rate is non-deterministic. Our tests prove the mitigations are IN PLACE, not that they work 100% of the time. Monitoring the silent success rate post-mitigation is the only way to validate effectiveness.

**Regression value:** If someone edits `squad.agent.md` and accidentally removes the response-order instructions, these tests catch it. That's the regression we're preventing.

---

## 4. My Recommended Test Sequence — If You Can Only Ship 3

If I could only ship 3 tests, these are the 3:

### Priority 1: Init Happy Path
**Why first:** If `npx create-squad` doesn't work, nothing else matters. This is the front door. Every user hits this. Zero ambiguity about whether the product functions.

```
Run index.js in temp dir → verify:
  - .github/agents/squad.agent.md exists and matches source
  - .ai-team-templates/ exists with all template files  
  - .ai-team/decisions/inbox/ exists
  - .ai-team/orchestration-log/ exists
  - .ai-team/casting/ exists
  - stdout contains "Squad is ready"
  - exit code is 0
```

### Priority 2: Init Idempotency
**Why second:** Real users WILL run `npx create-squad` twice. Maybe they forgot they already ran it. Maybe they want to check if it's installed. If the second run corrupts their team state, we've lost that user's trust permanently. Brady's P0 is human trust — this test is how we prove it.

```
Run index.js in temp dir (first run)
Create .ai-team/agents/keaton/history.md with content
Run index.js again (second run) → verify:
  - history.md content is unchanged
  - squad.agent.md is unchanged (skipped)
  - .ai-team-templates/ is unchanged (skipped)
  - stdout contains "already exists — skipping"
  - No errors, exit code 0
```

### Priority 3: Export/Import Round-Trip
**Why third:** This is the v1 headline feature. "Your squad travels with you." If export → import loses data, the feature is a lie. This is the acid test — if it passes, portability works. If it fails, we don't have a v1.

```
Init in dir A
Seed A with agent data (charters, histories, casting, skills)
Export from A → .squad file
Import into dir B
Compare: A's portable state == B's state
  - casting/registry.json matches
  - agent charters match
  - skills/preferences survive
  - NO project-specific leakage (decisions.md is fresh, orchestration-log is empty)
```

**What I'm cutting and why:**
- Upgrade test — important but upgrade is a convenience feature, not the core value prop
- Skills persistence — covered by the round-trip test (skills are part of the export)
- Forwardability test — similar to upgrade, secondary to the core init/export/import flow
- Edge cases — these catch bugs but don't prove the product works; they prove it doesn't break

**The 3-test suite proves:** The product installs (1), it's safe to use repeatedly (2), and the headline feature works (3). That's the minimum viable trust.

---

## Summary Decision

| Question | Answer |
|----------|--------|
| Are 5 tests enough? | Yes, if they're the right 5 and foundational tests exist earlier |
| Sprint 3 only? | **NO.** Tests must start Sprint 1. Same total effort, radically less risk. |
| Silent success testing? | Test that mitigations are in place (content tests on squad.agent.md). Can't test LLM compliance. |
| Top 3 tests? | Init happy path → Init idempotency → Export/import round-trip |
| Framework? | `node:test` + `node:assert` (zero dependencies, per Proposal 013) |
| Blocking for v1? | Init + idempotency + round-trip. If these 3 don't pass, we don't ship. |

**I agree with Proposal 009's test LIST but disagree with the TIMING.** Push init tests to Sprint 1 and export/import tests to Sprint 2. Sprint 3 is for hardening, edge cases, and CI — not for discovering that the foundation is broken.

---

**For:** bradygaster (sign-off), Keaton (sprint plan revision), Fenster (test-alongside-implementation)
**Status:** PROPOSED


---

### Decision: Proposal Lifecycle Amendment

**From:** Keaton (Lead)  
**Date:** 2026-02-09  
**Re:** Proposal 001a — Adding lifecycle states to proposal workflow

---

## Decision 1: Proposal Lifecycle States

Proposal 001's status options (`Proposed | Approved | Cancelled | Superseded`) are insufficient. We have 16 proposals with no way to track what's active or shipped.

**Adding two states:**
- **In Progress** — implementation started, owner assigned
- **Completed** — shipped, evidence linked

Full lifecycle: `Proposed → Approved → In Progress → Completed` (with `Cancelled` and `Superseded` as exits at any point).

Filed as Proposal 001a. Needs Brady's sign-off.

---

## Decision 2: Sprint Plan Assessment (Proposal 009)

Proposal 009 is architecturally sound but **mis-sequenced for trust**. Brady said human trust is P0. Proposal 015 (silent success bug) affects 40% of agent spawns — users see "no response" when work completed successfully. This is the single biggest trust destroyer.

**What should change:**

1. **Silent success fix (Proposal 015) must be Sprint 1, Day 1.** It's a zero-risk prompt change. Every session where a user sees "no response" when work was done erodes the trust we're trying to build. The sprint plan doesn't mention it at all — that's a gap.

2. **Sprint 1 priority reorder:**
   - Day 1: Silent success mitigations (Proposal 015) — ship immediately
   - Day 1-2: Tiered response modes + coordinator direct handling — the "it's fast" feeling
   - Day 2-3: Forwardability + latency fixes — infrastructure
   
3. **Sprint 2 and 3 are fine as-is.** The dependency chain (history split → skills → export/import) is correct. README and testing are correctly deferred.

4. **What can start without team review:** Silent success fix (Proposal 015) — zero risk, ship now. Latency P0 fixes — instruction-only changes. Context caching — instruction-only.

5. **What needs team review before starting:** Skills system design — Verbal's prompt work is critical path. Export/import schema — once shipped, the manifest format is a contract.

**The plan is right for v1. The sequencing needs the trust fix up front.**

---

## Action Required

- Scribe: merge both decisions to `decisions.md`
- Brady: review and approve Proposal 001a
- Keaton: update Proposal 009 to include Proposal 015 mitigations in Sprint 1


---

### Decision: Skills System — Agent Skills Standard + MCP Tool Declarations

**By:** Verbal  
**Date:** 2026-02-09  
**Proposal:** 010-skills-system.md (Revision 2)

**What:** Squad skills will use the **Agent Skills standard** (SKILL.md format) instead of a custom format. Skills live in `.ai-team/skills/{skill-name}/SKILL.md` as standard directories — not per-agent `skills.md` files. Each SKILL.md has YAML frontmatter (`name`, `description` required; `metadata.confidence`, `metadata.projects-applied`, `metadata.acquired-by`, `metadata.mcp-tools` for Squad extensions) and a markdown body with earned knowledge. The coordinator injects `<available_skills>` XML into spawn prompts for progressive disclosure (~50 tokens per skill at discovery, full SKILL.md loaded on demand). MCP tool dependencies are declared in `metadata.mcp-tools` — skills specify which MCP servers they need and why. Skills are generated organically from real work (agents create SKILL.md after completing tasks), can be explicitly taught, and follow a lifecycle: acquisition → reinforcement → correction → deprecation. The standard format means skills are portable beyond Squad — works in Claude Code, Copilot, any compliant tool.

**Why:** Brady's directive: *"skills that adhere to the anthropic 'skills.md' way"* and *"tell copilot which mcp tools our skills would need."* The original Proposal 010 invented a custom format. This revision adopts the open standard, gaining interoperability (skills work everywhere), progressive disclosure (cheap discovery, on-demand activation), and MCP awareness (skills declare their tool dependencies). Squad's unique value isn't the format — it's that Squad GENERATES standard-compliant skills from real work. Everyone else authors them by hand. The flat `skills/` directory replaces per-agent skill files because skills are team knowledge, not agent-siloed. MCP declarations in metadata are spec-compliant (arbitrary key-value) and solve the tool-wiring problem. Implementation phased across 6 releases, starting with template + instruction changes only.

**Key changes from Revision 1:**
- Storage: `skills/*/SKILL.md` (standard directories) replaces `agents/*/skills.md` (per-agent markdown)
- Format: YAML frontmatter + markdown body (standard) replaces freeform markdown (custom)
- Context: `<available_skills>` XML injection (standard progressive disclosure) replaces full content inlining
- MCP: `metadata.mcp-tools` array for declaring MCP server dependencies (NEW — addresses Brady's request)
- Portability: Skills work in any Agent Skills-compliant tool (Claude Code, Copilot, etc.)

**Depends on:** Proposal 008 (Portable Squads) for export/import; Proposal 007 (Persistence) for progressive summarization; Proposal 012 (Skills Platform) for Kujan's forwardability analysis.


---

### Decision: Sprint 0 Story Arc Identified

**By:** McManus (DevRel)
**Date:** 2026-02-09
**Context:** Brady requested DevRel track the team's story for future content

## Decision

The Sprint 0 narrative arc is: **self-repair under fire.** The team produced 16 proposals (~350KB), hit a 40% silent success bug, self-diagnosed it in the same session, and shipped three zero-risk mitigations before any other v1 work. This is the lead story for Squad's public launch content.

## Key messaging decisions

1. **Lead with output, not the bug.** The story starts with "16 proposals, one session" — then the bug is the complication, not the headline.
2. **"Success caused the failure" is the technical hook.** Agents that did ALL their work (including final history writes) were the ones whose responses got dropped. This inverts expectations and makes the story memorable.
3. **Three independent reviewers converging** (Fenster/Keaton/Hockney all said Sprint 0) is the "multi-agent intelligence" proof point. Not consensus-building — convergent expertise.
4. **Sprint 2 export moment is the v1 demo climax.** The "holy crap" moment when a squad imported into a new project already knows your preferences — that's the trailer beat.

## Why this matters

DevRel content needs a narrative, not a feature list. This session gave us one — complete with conflict, self-repair, and resolution. Every future piece of content (blog, demo, talk, thread) should reference this arc. It's the founding story.

## Working doc

`docs/devrel/sprint-0-story.md` — McManus's internal reference for all storytelling around this arc.

### 2026-02-09: decisions.md Formatting Cleanup
**By:** Kujan (Copilot SDK Expert)
**What:** Audit found formatting issues in decisions.md — wrong heading levels and mixed line endings. Five review dumps from Fenster, Hockney, Keaton, Verbal, and McManus were merged with top-level `# ` headings instead of `### ` entries; all converted. File had 806 CRLF and 20 LF-only endings; normalized to LF. Recommends adding `*.md text eol=lf` to `.gitattributes`.
**Why:** decisions.md is read by every agent. Inconsistent formatting and heading levels cause parsing confusion and merge artifacts.
**Status:** DECIDED — changes applied directly.

### 2026-02-09: Scribe resilience — template fix + inbox-driven spawn
**By:** Verbal
**What:** Two related fixes shipped:
1. **Template patch:** Scribe spawn template in `squad.agent.md` was the only template missing the `⚠️ RESPONSE ORDER` instruction. Fixed. Also cleaned contaminated content in Verbal's history.md (Proposal 016 entry had Proposal 010's details).
2. **Cascade fix:** Added inbox-driven Scribe spawn to squad.agent.md "After Agent Work" section. Coordinator now checks `.ai-team/decisions/inbox/` for files BEFORE deciding whether to spawn Scribe. If inbox has files, Scribe spawns regardless of agent response status. Created `.ai-team/agents/scribe/history.md` — Scribe was the only agent without memory.
**Why:** Scribe is the most vulnerable agent to the silent success bug (does nothing but tool calls). The cascade: silent success → Scribe not spawned → inbox accumulates → decisions.md stale → team diverges. Fix triggers on artifacts (files), not responses (agent output).
**Scope:** squad.agent.md (4 lines changed), new file scribe/history.md.

### 2026-02-09: P0 bug audit — shared state integrity findings (consolidated)
**By:** Keaton (Lead), Fenster (Core Dev), Hockney (Tester)
**What:** Three independent audits converged on the same findings:
1. **Drop-box pipeline broken:** Up to 12 inbox files accumulated unmerged across sessions. Scribe was either never spawned or silent-failed. This is the silent success bug manifesting in team infrastructure.
2. **Scribe had no history.md** — lost to the silent success bug. Every spawn started from scratch. (Now fixed by Verbal.)
3. **Orchestration log is dead** — zero entries written despite 20+ agent spawns across 4+ sessions.
4. **Demo script ACT 7 missing** — McManus flagged, now restored (see separate decision).
5. **P015 mitigations don't reach existing users** — `index.js` skip-if-exists blocks fixes from pre-existing installs. Upgrade subcommand is the delivery mechanism (now shipped by Fenster).
6. **decisions.md had raw review dumps** (lines 315-826) not formatted as decisions.
7. **Phantom references** in Verbal's history and session log (`003-casting-system.md` vs actual `003-copilot-platform-optimization.md`).
**The cascade pattern:** Silent success bug → Scribe not spawned → inbox accumulates → decisions.md stale → agents work with incomplete context → more divergence. This is not just a display bug — it's a shared state corruption vector.
**Required actions (most now completed):**
- ✅ Merge orphaned inbox files (this session)
- ✅ Inbox-driven Scribe spawn added to coordinator
- ✅ Scribe's history.md created
- ⬜ Orchestration log: implement or remove from charter
- ⬜ Add `npm test` to CI when pipeline is set up

### 2026-02-09: V1 Test Suite Shipped
**By:** Hockney (Tester)
**What:** Shipped first test suite. 12 tests, 3 suites, zero external dependencies. Framework: `node:test` + `node:assert/strict` (Node 22 built-ins). Location: `test/index.test.js`. Run: `npm test`. Result: 12/12 pass.
**What's tested:** copyRecursive (4 tests), Init happy path (4 tests), Re-init idempotency (4 tests).
**What's NOT tested:** Export/import (blocked on P008), Upgrade (blocked on P011), Error handling (none exists), Symlinks/permissions.
**Action required:**
- Fenster: When `require.main === module` guard is added to `index.js`, update tests to import `copyRecursive` directly.
- Keaton: Consider adding `npm test` to CI.

### 2026-02-09: Demo Script ACT 7 — Identified Missing and Restored
**By:** McManus (DevRel)
**What:** ACT 7 was missing from `docs/demo-script.md` — script jumped from ACT 6 (5:30–6:30) to ACT 8 (7:30–8:00), leaving 60 seconds of dead air. KEY THEMES table referenced ACT 7 three times (history.md, decisions.md on screen, second wave). Likely a silent success bug casualty. McManus reconstructed and inserted **ACT 7 — THE ARTIFACTS & SECOND WAVE (6:30–7:30)** covering: decisions.md on screen, history.md on screen, second wave fan-out demonstrating faster re-launch. Demo script is now recordable end-to-end.
**Source material:** Proposal 004 BEAT 7, KEY THEMES reference table, existing demo script format.

### 2026-02-09: Upgrade Subcommand Shipped
**By:** Fenster (Core Dev)
**What:** Implemented `upgrade` subcommand in `index.js`. Running `npx create-squad upgrade` now overwrites Squad-owned files (`squad.agent.md`, `.ai-team-templates/`) to bring existing installs forward. Added `--help`, `-h`, `help`, `--version`, `-v` support.
**File ownership enforced:** Squad-owned (overwrite on upgrade): `.github/agents/squad.agent.md`, `.ai-team-templates/`. User-owned (never touched): `.ai-team/`. Additive-only: inbox, orchestration-log, casting dirs.
**Not in this pass:** No backup-before-overwrite, no version detection, no migration framework — deferred per Proposal 011's phased approach.
**Why:** Pre-P015 users are stuck on coordinator instructions without RESPONSE ORDER and silent success detection. The upgrade subcommand is the delivery mechanism for these fixes.

### 2026-02-09: Background agent timeout best practices documented
**By:** Kujan (Copilot SDK Expert)
**What:** Created `docs/platform/background-agent-timeouts.md` — best practices covering the `read_agent` default timeout problem (30s default vs 45-120s real work), response order issue, and file-verification detection pattern. Key numbers: 30s default timeout, 45-120s real agent work time, 300s safe ceiling.
**Why:** The 30s default was causing ~40% of agents to appear failed when still working. Doc captures hard-won knowledge for future builders.

### 2026-02-09: P015 mitigations don't reach pre-existing installations
**By:** Kujan (Copilot SDK Expert)
**What:** `index.js` line 30-31 skips overwriting `squad.agent.md` if it already exists. Pre-P015 users still have the old coordinator without RESPONSE ORDER, silent success detection, or `read_agent` timeout guidance (~40% silent success rate). The `npx create-squad upgrade` path (now shipped by Fenster) is the delivery mechanism.
**Why:** P015 mitigations only effective for new installations. Existing installations remain vulnerable until they run `npx create-squad upgrade`. This is now the primary reason to publicize the upgrade subcommand.

### 2026-02-08: Squad DM — Hybrid architecture with tiered execution for direct messaging
**By:** Keaton
**What:** Proposed Proposal 017: Squad DM — a direct messaging interface that lets users interact with their Squad from Telegram, Slack, Discord, and other messaging platforms. Architecture: thin platform adapters feed into a single Squad DM Gateway, which routes messages to the appropriate agent and executes via a tiered model (Direct LLM for queries, Copilot CLI for code tasks, GitHub Actions for CI). Dev Tunnels provide webhook ingress when the gateway runs locally. Auth via dm-config.json mapping platform user IDs to GitHub usernames. Three phases: MVP (Telegram + Direct LLM, 2-3 days), Multi-platform + code execution (1-2 weeks), Full parity + proactive notifications (2-4 weeks).
**Why:** Brady explicitly requested the ability to work with his Squad from his phone/tablet — "YES LIKE MOLTS but just my team(s)." The terminal-only interface locks Squad to desk-time. The hybrid architecture was selected over alternatives (bot-per-platform, GitHub-native, webhook-only) because it maximizes platform flexibility while keeping orchestration logic in one place. Tiered execution avoids the cost and latency of spawning Copilot CLI for simple status queries. Dev Tunnels over ngrok per Brady's explicit request — Microsoft ecosystem native, free, persistent URLs, GitHub auth. This proposal compounds with Proposal 008 (Portable Squads) — if your team travels with you across projects, it should also travel with you across devices and contexts.

# Decision: DM Interface Platform Feasibility

**By:** Kujan  
**Date:** 2026-02-09  
**Proposal:** 017-platform-feasibility-dm.md  
**Requested by:** bradygaster

## What

Platform feasibility analysis for a DM (direct messaging) interface to Squad, starting with Telegram. Four execution backends evaluated, two tunnel solutions compared, four GitHub-native alternatives assessed.

**Recommended architecture:** Copilot SDK (`@github/copilot-sdk`) as execution backend + Telegram bot + Dev Tunnels for local exposure + local repo access. Estimated ~420 lines of new code, 2 npm deps + 1 CLI tool.

## Key Decisions

1. **Copilot SDK is the execution backend.** Same runtime as the CLI, Node.js native, GitHub auth. The `task` tool equivalent is the go/no-go gate — must verify nested SDK sessions work before committing to implementation.

2. **Dev Tunnels over ngrok.** GitHub-native auth, persistent service mode, no separate account, SDK available for programmatic management. Brady's explicit request, and it aligns with Squad's GitHub-native philosophy.

3. **Local repo architecture for v0.1.** Bot runs on Brady's machine, reads/writes checked-out repo directly. Cloud-based (clone per interaction) is v0.3.

4. **GitHub Actions is the fallback.** If the SDK's Technical Preview doesn't support nested sessions, each Telegram message can trigger a GitHub Actions workflow that runs the full CLI. Higher latency (60-120s) but guaranteed tool availability.

5. **No existing GitHub surface is viable.** Mobile Copilot Chat lacks `task` tool and filesystem access. Copilot Extensions can't spawn sub-agents. Issue comments + Actions is async and high-latency. We must build something.

6. **Gate before implementation:** Three spikes must pass: (a) SDK nested sessions, (b) Dev Tunnel 24h persistence, (c) Telegram webhook → Dev Tunnel end-to-end.

## Why

Brady wants to work with his Squad when he's not at his terminal. The Copilot CLI provides all of Squad's tools — but those tools only exist inside the CLI runtime. Outside it, we need an alternative execution backend. The Copilot SDK is designed for exactly this: "build an agent into any app." Squad's Telegram bot is that app.

This aligns with our independence principle (2026-02-07 decision): we're using Copilot infrastructure, not becoming a Copilot product.

## Dependencies

- Copilot SDK Technical Preview stability
- Brady's Copilot subscription (already covered)
- `devtunnel` CLI installation
- Telegram Bot API token (from @BotFather)

### 2026-02-09: Squad DM — Experience Design for Messaging Interfaces

**By:** Verbal
**What:** Proposal 017 defines the complete experience design for Squad DM — interacting with your Squad team via Telegram, Slack, or SMS when away from the terminal. Key decisions: (1) Single Squad bot with emoji-prefixed agent identity, not separate bots per agent. (2) DM mode output strategy: summary + GitHub link, never inline full artifacts. (3) Proactive messaging: CI failure alerts, daily standups, decision prompts as push notifications. (4) Coordinator stays invisible in DM (same as terminal), except for explicit fan-out announcements. (5) Bridge architecture: Node.js service with dev tunnel webhook connectivity (Brady's preference over ngrok). (6) Cross-channel memory: DM and terminal share the same `.ai-team/` state — decisions made via DM are available in terminal and vice versa. (7) DM mode flag injected into spawn prompts to adapt output format without changing agent personality. (8) Four implementation phases: PoC (polling, 1-2 days) → DM Experience (dev tunnel, 3-5 days) → Proactive Messaging (webhooks + cron, 3-5 days) → Multi-Platform (Slack/SMS/Discord, future).

**Why:** Brady wants to work with his squad when away from the terminal. The MOLTS reference signals desire for an intimate, personal AI team experience in messaging. Nobody has persistent, named, opinionated agent teams in messaging apps yet. The proactive messaging feature (squad texts you first) turns Squad from a reactive tool into a proactive team. Cross-channel memory (same `.ai-team/` state across terminal and DM) is the architectural moat. DM is where Squad transitions from "dev tool" to "thing you can't work without" — the 11pm couch moment, the morning standup notification, the decision made on the train.

**Proposal:** `docs/proposals/017-dm-experience-design.md`

### 2026-02-09: "Where are we?" identified as top-tier messaging beat
**By:** McManus
**What:** Wrote Proposal 014a — an amendment to Proposal 014's v1 messaging strategy — adding the "where are we?" interaction as a core value prop moment. Includes: new messaging beat ("Ask Your Team, Not Your Dashboard"), demo script beat ("The Check-In"), DM connection to Proposal 017, README placement recommendations, and tagline hierarchy update. File: `docs/proposals/014a-where-are-we-messaging-beat.md`.
**Why:** Brady's visceral reaction to asking "where are we?" and getting instant team-wide status reveals a feature moment we weren't messaging. It proves three features simultaneously (persistent memory, shared state, coordinator intelligence) in two seconds with zero setup. It's the most emotionally resonant proof that Squad is a team, not a tool — and it bridges directly to the DM story (Proposal 017) where asking "where are we?" from your phone becomes category-defining.

### 2026-02-09: Wave-Based Execution Plan (Quality → Experience)

**By:** Keaton
**What:** Proposal 018 — supersede Proposal 009's sprint structure with a wave-based execution plan organized by trust level: quality first, then experience. Gates between waves are binary — all quality criteria must pass before experience work begins. Wave 1: error handling, test expansion to 20+, CI, version stamping, silent success mitigations. Wave 1.5 (parallel): README, messaging, Squad Paper. Wave 2: tiered response modes, skills Phase 1, export, smart upgrade. Wave 3: import, skills Phase 2, history summarization. Squad DM deferred to Wave 4+. Key cuts: conditional memory loading, LLM history classification, squad merge, agent-to-agent negotiation. Total estimate: 38-51h across 3 waves.
**Why:** Brady's directive — quality then experience — requires reorganizing work by trust level, not by capability. Sprints have fixed timelines; waves have gates. A wave doesn't end when the calendar says so — it ends when the quality criteria are met. Supersedes Proposal 009's sprint structure; feature set and architecture decisions from 009 remain valid.

### 2026-02-09: Human Input Latency and Persistence — Platform Analysis

**By:** Kujan
**What:** Analyzed Brady's two-part request: (1) reduce latency when human types while agents are working, (2) persist human messages as first-class state in `.ai-team/`. Problem 1 is a hard platform limitation (single-threaded conversation model, no interrupt mechanism) with partial workarounds via tiered response modes. Problem 2 is fully solvable today: coordinator writes human directives to `.ai-team/decisions/inbox/human-{slug}.md` as FIRST action on directive-type messages. Scribe merges via existing drop-box pattern. Not every message — only decisions, scope changes, explicit directives.
**Why:** Human input responsiveness matters for team experience. Input latency is a platform limitation (no mid-turn message polling), but the lightweight variant (coordinator writes directives to inbox) requires zero new infrastructure and works identically in CLI and DM contexts. Scribe should NOT serve double duty as a human listener — the coordinator is the right place because it's the only entity that sees human messages in real-time.

### 2026-02-09: Master Sprint Plan (Proposal 019)
**By:** Keaton
**What:** Proposal 019 is the definitive build plan for Squad v1. Synthesizes all 18 prior proposals into one execution plan: 21 items, 3 waves + parallel content track, 44–59h estimated. Wave 1 (Quality): error handling, test expansion, CI, version stamping, silent success, human directive capture, "feels heard." Wave 1.5 (Content, parallel): README, messaging, Squad Paper, "where are we?" beat, demo script, video. Wave 2 (Experience): tiered response modes, smart upgrade, Skills Phase 1, Export CLI. Wave 3 (Magical): Import CLI, Skills Phase 2, history summarization, lightweight spawn. Horizon deferred: Squad DM, agent-to-agent negotiation, speculative execution, sharing/registry, merge support. All Brady directives reflected. Wave gates are binary. Supersedes Proposals 009 and 018.
**Why:** Brady asked for "all of it — stack it all up, sprint plan it." 18 proposals had overlapping scope and no single source of truth. 019 is that source of truth. All agents execute from 019.



---

### 2026-02-09: Brady directives — session 5 batch

**By:** bradygaster (human)

**Directives:**

1. **VS Code parity:** No reason Squad shouldn't work in VS Code Copilot Chat as well or better than CLI. Investigate.

2. **"Feels heard" clarification:** Not just coordinator saying "gotcha" — ideally human input impacts ongoing agent work in real-time. If not possible, enhance the experience for now. Don't let perfect be the enemy of good.

3. **README timing:** Consider saving README rewrite for the end, OR keep it updated as we go. Team's call. But think of each iteration as individually blogworthy.

4. **Blog engine meta-play:** Create a blog markdown format to update users on progress. Then make one of the sample prompts a blog engine with amazing front-end UX that renders Squad blog posts. Meta.

5. **NPM package naming:** Currently `bradygaster/squad`. Wants easy-to-understand npx commands for update/export. If we need to rename now, do it — not at v1 yet. Optimize for consistency and future-proofing.

6. **Human feedback optimization:** "please please optimize for an efficient experience or a continually up-to-date one for the human. humans like feedback." — This is a P0 UX principle for all work going forward.

---

### 2026-02-09: Sprint plan amendments for Brady's session 5 directives

**By:** Keaton (Lead)

**Proposal:** 019a — Sprint Plan Amendments

**Decisions for team review:**

1. **README timing: living document.** README updated per wave, not written once at end. McManus refreshes at each wave gate. Blog posts handle the narrative arc; README documents current truth.

2. **Blog format defined, blog engine sample prompt added.** YAML front matter, `docs/blog/` directory, one post per wave. McManus owns. Blog engine sample prompt added to `docs/sample-prompts.md` — meta: Squad builds a blog engine that renders Squad's own posts.

3. **Package naming: register `create-squad` (unscoped) NOW.** Available on npm today. Dual-publish as both `create-squad` and `@bradygaster/create-squad`. Primary docs use `npx create-squad`. Zero breaking change. Time-sensitive — name could be taken.

4. **Human feedback is the 5th directive.** "Optimize for human feedback. Every interaction gives the human visible evidence of progress. Silence is never acceptable." Distinct from Directives 3-4 (input→system). This is output→human. New items: 1.9 (progress reporting), result summarization in 2.1, CLI output enrichment in 1.1.

5. **VS Code parity: manual smoke test in Wave 1.** No architectural blockers expected. Kujan tests init, team mode, parallel spawn in VS Code. Automated VS Code CI not recommended for v1 — too heavyweight. Document test checklist instead.

6. **Three new Wave 1 items:** 1.8 (register create-squad, Fenster, 1h), 1.9 (progress reporting, Verbal+Kujan, 2h), 1.10 (VS Code smoke test, Kujan, 1h). All parallelize with existing work.

7. **Updated effort: 52.5-67.5h total** (up from 44-59h). Calendar impact minimal due to parallelism.

**Status:** Pending team review and Brady approval.

---

### 2026-02-09: VS Code Parity, Mid-Flight Human Input, and Feedback Optimization — Platform Analysis
**By:** Kujan (Copilot SDK Expert)
**Requested by:** bradygaster

---

## Decision 1: VS Code Parity — "Would Squad Just Work?"

**Verdict: Almost, but not quite. The `task` tool is the gap.**

### What matches across CLI and VS Code Copilot agent mode:

| Tool | CLI | VS Code Agent Mode | Match? |
|------|-----|-------------------|--------|
| `.github/agents/*.agent.md` | ✅ Custom agents | ✅ Custom agents (same path, same format) | ✅ Exact match |
| `view`, `edit`, `create` | ✅ | ✅ (file operations built-in) | ✅ |
| `grep`, `glob` | ✅ | ✅ (search tools available) | ✅ |
| `powershell` / terminal | ✅ Interactive shell sessions | ✅ Terminal tool exists | ⚠️ Similar, not identical API |
| MCP servers | ✅ | ✅ | ✅ |
| `task` (spawn sub-agents) | ✅ `task` tool with `agent_type`, `mode`, `prompt` | ⚠️ Subagent support exists but with different API surface | ❌ Not the same tool |
| `read_agent` / `list_agents` | ✅ Background agent lifecycle management | ⚠️ No documented equivalent | ❌ Gap |
| `write_powershell` / `read_powershell` | ✅ Interactive shell sessions | ⚠️ Different terminal interaction model | ⚠️ Partial |
| `store_memory` / `sql` | ✅ | ❓ Not confirmed in VS Code | ⚠️ Unknown |

### The critical analysis:

**Squad's entire orchestration model depends on the `task` tool with these specific features:**
1. `agent_type: "general-purpose"` — spawns a full-capability sub-agent
2. `mode: "background"` — parallel async execution
3. `read_agent` with `wait: true, timeout: 300` — lifecycle collection
4. `list_agents` — discover running agents

VS Code Copilot agent mode supports subagent spawning (confirmed in Jan 2026 updates), but the API surface is different:
- VS Code uses an `infer`-based model where subagents are selected from available `.agent.md` files
- The CLI uses an explicit `task` tool call with inline prompts
- VS Code's subagent model may not support the same `background` / `sync` mode distinction
- `read_agent` (polling for completion) has no documented VS Code equivalent — VS Code subagents appear to report results differently

**What this means for Squad:**
- The `.github/agents/squad.agent.md` file WILL be picked up by VS Code Copilot as a custom agent — confirmed
- The coordinator's INSTRUCTIONS will be loaded — confirmed
- The coordinator's attempts to call `task` tool with Squad's specific parameter patterns may work IF VS Code's subagent tool accepts the same schema
- But the `read_agent` / `list_agents` lifecycle management pattern is CLI-specific

### Honest assessment:

Squad will NOT "just work" in VS Code today without testing. It MIGHT work if VS Code's subagent tool is API-compatible with the CLI's `task` tool. The safest statement: **Squad's agent file loads correctly in VS Code, the coordinator's instructions are understood, but multi-agent orchestration (the core value prop) is unverified and likely has tool-name mismatches.**

### What to verify (actionable):
1. Open the repo in VS Code, invoke `@squad` in Copilot Chat
2. Give it a task that requires agent spawning
3. Watch whether it successfully calls the `task` tool or errors
4. If it errors, check the error — is it "unknown tool" or "wrong parameters"?
5. Report findings back

### Performance comparison:
- VS Code Copilot has a larger context window (typically matches CLI at 128K)
- VS Code may have richer editor integration (diagnostics, LSP, inline diff)
- CLI has more explicit tool control and session management
- CLI's `/tasks` command gives visibility into running sub-agents — no VS Code equivalent

---

## Decision 2: "Feels Heard" — Can Human Input Reach Running Agents?

**Verdict: No. Mid-flight input injection is not possible on this platform. But we have a pragmatic path.**

### Platform reality:

| Mechanism | Possible? | Why / Why Not |
|-----------|-----------|---------------|
| Send input to running `task` agent | ❌ | `task` agents are NOT interactive shells. `write_powershell` works for shell sessions, not for agents spawned via `task`. Agents are isolated LLM sessions with no input channel after spawn. |
| Cancel running agents and re-spawn | ⚠️ Partially | `stop_powershell` exists but only for shell sessions. No `stop_agent` tool exists. Background agents run until completion or timeout. The coordinator CANNOT cancel a running `task` agent. |
| Coordinator polls for new messages mid-turn | ❌ | Single-threaded conversation model. Coordinator processes one message to completion. No message queue inspection API. No yield-and-resume. |
| File-based signal (agent checks mid-work) | ⚠️ Theoretically | We could instruct agents to check a `.ai-team/human-directive.md` file periodically during long tasks. BUT: agents don't have event loops — they execute tool calls sequentially. An agent would only check the file if explicitly instructed to do so between steps. This adds complexity and latency. Not reliable. |
| Wait for agent completion, then re-route | ✅ Yes | The coordinator can capture the human directive to the inbox, wait for current agents to finish, then re-spawn with updated context. This is the realistic path. |

### The honest answer:

**Mid-flight human input injection is not possible on the Copilot platform today.** The conversation model is single-threaded. Once agents are spawned, they run in isolation until completion. The coordinator cannot:
- Interrupt running agents
- Send them new information
- Cancel and re-spawn them
- Inject context mid-execution

### The pragmatic best (what we CAN do):

**The "feels heard" + "directive capture" pattern from Proposal 019 items 1.6 and 1.7 is the best we can do, and it's actually pretty good:**

1. **Instant acknowledgment** — Coordinator responds with text BEFORE any tool calls: "Got it. I'll factor that in."
2. **Directive persistence** — Coordinator writes the human directive to `.ai-team/decisions/inbox/human-directive-{timestamp}.md` as first action
3. **Context injection on next spawn** — When current agents complete and the coordinator routes follow-up work, the new spawn prompts include the human directive
4. **Scribe merges** — Directive enters `decisions.md` and becomes persistent team knowledge

**The gap:** If the user says "actually, don't use PostgreSQL, use SQLite" while the backend agent is 30 seconds into implementing PostgreSQL, that work is wasted. The coordinator can only apply the correction AFTER the agent completes.

**What would fix this (platform feature requests):**
- Agent interrupt/preemption API
- Coordinator message queue polling between tool calls
- Agent subscription to filesystem events (inotify-style)
- Multi-turn agent sessions with input channels

**Brady said "don't let perfect be the enemy of good."** The pragmatic answer: capture the directive immediately, acknowledge it immediately, apply it on next spawn. The 30-60 second delay before it takes effect is a platform limitation, not a Squad limitation. Document it honestly.

---

## Decision 3: Human Feedback Optimization — What Can We Do TODAY?

**Verdict: Several things, all via `squad.agent.md` changes only.**

### What the platform supports for real-time feedback:

| Technique | Supported? | How |
|-----------|-----------|-----|
| Coordinator text before tool calls | ✅ Yes | Coordinator emits text in the same turn as tool calls. User sees text while agents spin up. |
| Progress indicators during agent work | ⚠️ Limited | The coordinator CANNOT emit text while waiting on `read_agent`. The `read_agent` call blocks the coordinator's turn. No streaming progress. |
| Report as each agent completes | ⚠️ Partially | Sequential `read_agent` calls can report one-at-a-time. BUT this means serial collection instead of parallel. Trade-off: faster feedback vs. longer total time. |
| Intermediate status messages | ❌ | Once the coordinator is in a tool-call turn, it cannot interleave text responses. Text comes before or after tool calls, never during. |

### What we can change in `squad.agent.md` TODAY:

#### 1. Enhanced launch message (already partially in 1.7 — extend it)
```
When spawning agents, emit a detailed launch manifest BEFORE the task calls:

"🚀 Launching:
 🏗️ Keaton — analyzing architecture implications
 ⚛️ Fenster — implementing the API endpoint  
 🧪 Hockney — writing test cases from the spec
 
 Estimated: 30-45 seconds. I'll report as each completes."
```
This gives the user a mental model of what's happening during the wait.

#### 2. Sequential collection with incremental reporting
Instead of:
```
1. Spawn all agents (background)
2. read_agent for ALL agents
3. Present all results at once
```

Do:
```
1. Spawn all agents (background)
2. read_agent for Agent A (wait: true, timeout: 300)
3. Report Agent A's results immediately
4. read_agent for Agent B (wait: true, timeout: 300)  
5. Report Agent B's results immediately
...
```

**Trade-off:** This is sequential collection, which means the user sees results sooner but the TOTAL time is the same (or slightly longer due to serial read_agent overhead). The UX improvement is that the user isn't staring at silence for 60 seconds — they see results trickling in.

**Recommendation:** Use sequential collection for 3+ agents. For 1-2 agents, the current pattern is fine.

#### 3. Post-collection summary
After all agents report, add a one-line synthesis:
```
"✅ All 3 agents completed. Key output: {brief summary}. 
 Scribe is merging decisions. What's next?"
```

#### 4. Time estimates in launch message
The coordinator knows the task complexity from its routing. Include an estimate:
- Direct mode: "(instant)"
- Lightweight: "(~10 seconds)"
- Standard: "(~30 seconds)"
- Full: "(~60 seconds)"

This manages expectations. Waiting 60 seconds when you expected 5 is painful. Waiting 60 seconds when you were told 60 is acceptable.

### What we CANNOT do today:
- Stream agent progress in real-time (no streaming from `read_agent`)
- Show a progress bar (no mechanism for partial updates from agents)
- Interrupt and report mid-work (agents are isolated)
- Push notifications while waiting (single-threaded conversation)

---

## Summary of Conclusions

| Question | Answer |
|----------|--------|
| Does Squad work in VS Code? | Agent file loads; multi-agent orchestration is unverified and likely has tool gaps |
| Can humans impact running agents? | No — platform limitation. Capture-and-apply-next is the best we can do. |
| Can we give more feedback? | Yes — launch manifests, sequential collection, time estimates. All via squad.agent.md. |

**Recommended actions:**
1. **Verify VS Code parity** — Open repo in VS Code, try a Squad task, report what happens with the `task` tool
2. **Ship items 1.6 and 1.7** from Proposal 019 — these are the "feels heard" foundation
3. **Add sequential agent collection** to squad.agent.md for 3+ agent spawns
4. **Add time estimates** to the launch manifest
5. **Document honestly** in README that mid-flight input injection is a platform limitation

---

# Decision: Blog Format, Blog Engine Prompt, and Package Naming UX

**Author:** McManus (DevRel)  
**Date:** 2026-02-09  
**Proposal:** 020-blog-and-packaging.md  
**Requested by:** bradygaster

---

## Decisions Made

### 1. Blog Post Format Adopted
- Template at `docs/blog/template.md`
- YAML frontmatter: title, date, author, wave, tags, status, hero
- Structured body: What Shipped → The Story → By the Numbers → What We Learned → What's Next
- One post per wave completion — wave cadence IS the content cadence
- First post shipped: `docs/blog/001-wave-0-the-team-that-built-itself.md`

### 2. Blog Engine Sample Prompt Added
- Added to `docs/sample-prompts.md` as "Squad Blog Engine (Meta Demo)"
- Squad builds a static blog renderer (HTML/CSS/JS) that renders its own progress posts
- Meta angle: "Squad built the tool that tells Squad's story"
- Categorized as Quick Build — single session, well-scoped

### 3. Package Naming Recommendation (Pending Brady's Call)
- **Recommendation:** Publish `create-squad` (unscoped) alongside existing `@bradygaster/create-squad`
- `npx create-squad` = 16 chars vs `npx @bradygaster/create-squad` = 33 chars
- Follows `create-*` convention (create-react-app, create-next-app, create-vite)
- Enables `npm init squad` for free
- No breaking change — both names coexist on npm
- `squad-cli` rejected: breaks `create-*` convention, implies ongoing CLI tool not initializer
- **This is a naming proposal, not a decision. Brady decides.**

---

## Files Created/Modified

| File | Action |
|------|--------|
| `docs/blog/template.md` | Created — blog post template |
| `docs/blog/001-wave-0-the-team-that-built-itself.md` | Created — first blog post |
| `docs/proposals/020-blog-and-packaging.md` | Created — full proposal |
| `docs/sample-prompts.md` | Modified — added blog engine prompt |

---

**Review requested from:** bradygaster (package naming decision), Keaton (architecture), Fenster (implementation)

### 2026-02-09: No npm — GitHub-only distribution, release plan needed, Git specialist hired

**By:** bradygaster (human)

**Decisions:**

1. **No npm publish. Ever.** Squad is distributed exclusively via GitHub: `npx github:bradygaster/squad`. No npm registry involvement.

2. **Update mechanism required:** Users must be able to run something to get the latest Squad without breaking their `.ai-team/` state. The `upgrade` subcommand already exists — it needs to pull from the latest GitHub release/tag, not npm.

3. **Release plan needed:** Proper GitHub Releases with tags, versioning, changelogs. We need a release workflow.

4. **Git/GitHub specialist:** Hire a dedicated team member who owns ALL git and GitHub responsibilities — releases, tags, branch strategy, state integrity, CI/CD, GitHub Actions. Git is our state maintenance — we can't mess it up.

5. **Item 1.8 from Proposal 019a (Register create-squad on npm) is CANCELLED.**


### 2026-02-09: No npm publish — GitHub-hosted npx only

**By:** bradygaster (human)

**Decision:** Squad is NOT published to npm. Not now, not ever. Brady does not want npm publish. The package is consumed exclusively via GitHub-hosted npx:

```bash
npx github:bradygaster/squad
```

**Impact on Proposal 019a:**
- Item 1.8 (Register `create-squad` on npm) — **CANCELLED**
- Keaton's and McManus's recommendation to register `create-squad` unscoped — **REJECTED**
- All documentation, README, sample prompts must use `npx github:bradygaster/squad` syntax
- No dual-publish, no npm scope, no registry concerns

**What this means for naming:**
- The "package name" is the GitHub repo name: `bradygaster/squad`
- Users run: `npx github:bradygaster/squad` (init), `npx github:bradygaster/squad upgrade` (upgrade)
- If Brady renames the repo, the npx command changes automatically
- No npm auth, no publish CI, no registry maintenance


### 2026-02-09: No npm distribution — GitHub-only model, Kobayashi hired, release plan slotted

**By:** Keaton (Lead), executing Brady's session 6 directives

**Decisions:**

1. **Item 1.8 (Register `create-squad` on npm) is CANCELLED.** Brady's decision: no npm publish, ever. Squad is distributed exclusively via `npx github:bradygaster/squad`. My previous recommendation to register the unscoped `create-squad` name is withdrawn.

2. **Kobayashi (Git & Release Engineer) joins the team.** Owns ALL git and GitHub responsibilities: releases, tags, branch strategy, CI/CD workflows, state integrity. Git is our state maintenance layer — `.ai-team/`, the drop-box pattern, casting registry — and a dedicated owner is the right call.

3. **Three new Wave 1 items added:**
   - **1.11:** Release workflow (GitHub Actions) — Kobayashi, 2h
   - **1.12:** Branch strategy and merge to main — Kobayashi, 1-2h
   - **1.13:** First tagged release v0.1.0 — Kobayashi, 1h (Wave 1 gate exit criterion)

4. **Item 1.3 (CI setup) ownership updated:** Hockney + Kobayashi. Kobayashi owns the Actions workflow definition, Hockney owns the test content CI runs.

5. **All npm references in 019a updated.** Directive 3 rewritten to reflect GitHub-only distribution. Blog post code examples, CLI references, and effort totals corrected.

6. **Updated effort totals:** Wave 1 increases from 15-18h to 18-22h. Total increases from 52.5-67.5h to 55.5-71.5h. Calendar impact is moderate — Kobayashi's work parallelizes with existing agents.

**Impact on Proposal 019:**
- Directive 3 (Package Naming) is now "GitHub-Only Distribution"
- New Directive 6 added to 019a: "GitHub-Only Distribution & Release Process"
- Wave 1 gate exit now requires v0.1.0 tagged release
- Kobayashi is writing detailed release proposal (021)

**Filed in:** `docs/proposals/019a-sprint-plan-amendments.md` (Directive 6 section added)


### 2025-07-16: Proposal 021 — Release Plan & Distribution Strategy

**By:** Kobayashi (Git & Release Engineer)

**Decisions proposed (pending Brady's approval):**

1. **Distribution model:** `npx github:bradygaster/squad` pulls `main` HEAD. Version pinning uses `#` syntax: `npx github:bradygaster/squad#v0.2.0`. No npm publish — ever.

2. **Branch strategy:** `main` is release-only (always stable, always what users get). `squadify` is the development branch. Merges to `main` happen only during the release process. Direct push to `main` is prohibited.

3. **Tag format:** `v{MAJOR}.{MINOR}.{PATCH}` — e.g., `v0.1.0`, `v0.2.0`. Tags are immutable.

4. **Semantic versioning (pre-v1):** Minor bump for new features/breaking changes, patch bump for bug fixes and content changes. Wave completion → minor bump.

5. **CI pipeline:** `.github/workflows/ci.yml` — runs `npm test` on push/PR to `main` and `squadify`. Node 22.x, ubuntu-latest. Includes smoke test (init) and state integrity test (upgrade preserves `.ai-team/`).

6. **Release automation:** `.github/workflows/release.yml` — triggered by `v*` tag push. Validates tag matches `package.json` version, runs tests, creates GitHub Release with install/upgrade/pin instructions, verifies npx resolution.

7. **State integrity:** `.ai-team/` is never touched by upgrade — enforced in CI with a sentinel file test. `.ai-team/` stays out of `.gitignore` (it's user state that should be committed).

8. **Release authority:** Open question — does Brady approve each release, or can Kobayashi cut releases when wave gates pass?

**Proposal location:** `docs/proposals/021-release-plan-and-distribution.md`

**Implements:** Sprint Plan items 1.3 (CI setup), release process (new scope), distribution strategy (new scope).

**Open questions for Brady:**
- Tag `v0.1.0` now or wait for Wave 1 → `v0.2.0`?
- Is the repo public or private? (affects branch protection and API access)
- Release authority model?
- When to merge `squadify` → `main` for the first time?


### 2026-02-09: Kobayashi's open questions — Brady deferred to team judgment

**By:** Copilot (Coordinator) — Brady said "use your best judgment" on all 4

**Decisions:**

1. **First release timing:** Tag `v0.1.0` now on current state. Version 0.x signals "early." Don't wait for perfection before first tag.

2. **Repo visibility:** Design for public from day one. No secrets in branch protection assumptions.

3. **Release authority:** Kobayashi proposes + prepares draft GitHub Release. Brady reviews and publishes. Automation without losing control.

4. **`squadify` → `main` merge:** After Wave 1 gate passes. First merge to main = first release-worthy state. `squadify` remains the working branch until then.

---

### 2026-02-09: Branch strategy — dev has everything, main is product-only

**By:** bradygaster (human)

**Decision:**

1. **Rename `squadify` to `dev`** — all work continues here, including Squad Squad files (`.ai-team/`, `docs/proposals/`, orchestration logs, etc.)

2. **`main` is product-only** — when we merge to main, Squad Squad files are excluded. Main only gets: `index.js`, `package.json`, `.github/agents/squad.agent.md`, `templates/`, `test/`, `README.md`, `LICENSE`, `.npmignore`.

3. **`dev` is public and intentional** — the Squad Squad state being visible is part of the story. Dog-fooding in public.

4. **`npx github:bradygaster/squad` pulls from `main`** — users always get clean product, never the Squad Squad.

**Impact:**
- Kobayashi needs to design the merge-to-main process to strip Squad Squad files
- CI runs on `dev`, releases cut from `main`
- The `.ai-team/` files in this repo never land on `main`


---

# Decision: Branch Strategy & Release Workflow

**Author:** Kobayashi (Git & Release Engineer)  
**Date:** 2025-07-16  
**Status:** Implemented (pending Brady's push)

---

## Branch Rename

- `squadify` renamed to `dev` (local only — remote rename is Brady's call)
- `dev` is the primary development branch; Squad Squad lives here and is intentionally public (dog-fooding story)

## Branch Separation

| Branch | Purpose | Contains |
|--------|---------|----------|
| `main` | Product-only, what users get via `npx github:bradygaster/squad` | `index.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore`, `.npmignore`, `.gitattributes`, `.github/agents/squad.agent.md`, `templates/` |
| `dev` | Development + Squad Squad | Everything — product files, `.ai-team/`, `docs/`, `test/`, `.github/workflows/`, etc. |

## Release Process: Filtered-Copy Strategy

**Chosen approach:** Script-based filtered copy via GitHub Actions (Option C from Brady's list).

**How it works:**
1. Workflow triggers on `workflow_dispatch` (enter version) or tag push
2. Tests run on `dev` — gate before anything ships
3. Checks out `dev`, copies only product files to staging area
4. Switches to `main`, replaces content with staged product files
5. Commits `release: v{version}` on `main`
6. Tags the commit, pushes `main` + tag
7. Creates GitHub Release (prerelease for pre-v1)
8. Verifies `npx` resolution

**Why this over alternatives:**
- **Not force-push (Option A):** Destructive, loses `main` commit history
- **Not `.gitattributes` merge drivers (Option B):** Fragile, hard to debug, requires all contributors to configure
- **Not orphan branch (Option D):** Loses all git history tracing from `dev`
- **Filtered-copy is:** Simple, explicit, auditable, reversible, automatable

## Files Created/Modified

- **Created:** `.github/workflows/release.yml`
- **Modified:** `docs/proposals/021-release-plan-and-distribution.md` (updated all references from `squadify` → `dev`, rewrote §4b and §5)

## Action Required

- Brady: push `dev` branch to remote (replaces `squadify`)
- Brady: review and approve release workflow before first use
- Brady: set remote default branch to `dev` on GitHub (or keep `main` as default — either works since `main` is what users pull)


---

# Decision: Squad Squad Isolation — Distribution Hygiene

**Author:** Kobayashi (Git & Release Engineer)  
**Date:** 2026-02-09  
**Status:** Implemented  
**Triggered by:** bradygaster — "you're the squad squad"

---

## Problem

Squad (the product) and the Squad Squad (the AI team that builds it) live in the same repository. When users run `npx github:bradygaster/squad`, should they receive the team's internal state (`.ai-team/`, `docs/proposals/`, orchestration logs, etc.) alongside the product?

Brady's position: The repo is completely public. The Squad Squad state SHOULD be visible (it's the story — dogfooding). But it should NOT ship to users as part of the `npx` install.

## Analysis of Options

### Option 1: `.npmignore` — Belt-and-suspenders exclusion
- **Verdict: IMPLEMENTED (defense in depth)**
- `.npmignore` explicitly excludes `.ai-team/`, `.ai-team-templates/`, `docs/`, `test/`, `.gitattributes`, `.github/workflows/`
- With `package.json` `files` field present, `.npmignore` is redundant for filtering — `files` takes precedence as a whitelist
- Value: catches mistakes if `files` field is accidentally removed; serves as documentation of intent

### Option 2: Separate `release`/`dist` branch
- **Verdict: NOT NEEDED**
- Would work but adds operational complexity (CI must maintain a stripped branch)
- The `files` field already solves the problem without branch gymnastics
- Reserved as an option if npm behavior changes in the future

### Option 3: GitHub Release artifacts (tarball)
- **Verdict: REJECTED**
- Changes the user-facing command from `npx github:bradygaster/squad` to a tarball URL
- Breaks the current UX contract and all existing documentation
- No benefit over the current `files`-based approach

### Option 4: `.gitattributes` with `export-ignore`
- **Verdict: DOES NOT WORK**
- `npx github:` uses GitHub's tarball API (`codeload.github.com`), NOT `git archive`
- `export-ignore` is only honored by `git archive`, which npm never calls for `github:` installs
- This is a common misconception — researched and empirically debunked

### Option 5: Accept it (do nothing)
- **Verdict: ALREADY RESOLVED — the `files` field works**
- The `files` field in `package.json` already correctly filters the distributed package
- Empirically verified: `npm install github:bradygaster/squad` installs only 15 files (product files)
- The npm cache contains opaque content-addressed blobs, not a browsable directory tree
- The Squad Squad files never appear in the user's `node_modules` or project

## Key Discovery

**`package.json` `files` field IS respected by `npx github:` installs.** This was verified empirically on npm v11.9.0:

```
npm install github:bradygaster/squad
# Result in node_modules/@bradygaster/create-squad/:
#   .github/agents/squad.agent.md
#   index.js
#   package.json
#   README.md
#   templates/ (11 files)
# Total: 15 files. No .ai-team/, docs/, test/, etc.
```

The npm documentation states that for git dependencies, the package is "packaged and installed" — meaning npm applies the same `files` filtering as `npm publish`, even for GitHub-sourced installs. This holds true regardless of whether a `prepare` script exists.

## What Was Implemented

1. **Created `.npmignore`** — Explicit exclusion list for Squad Squad files. Acts as defense-in-depth behind the `files` field and as documentation of intent.

2. **No changes to `package.json`** — The `files` field was already correctly configured:
   ```json
   "files": ["index.js", ".github/agents/squad.agent.md", "templates/**/*"]
   ```

3. **No changes to `index.js`** — The runtime was already correct: it copies from `templates/` (source) to `.ai-team-templates/` (destination in user's project).

## What This Means

| Content | In repo? | In distributed package? | In user's project? |
|---------|----------|------------------------|--------------------|
| `index.js` | ✅ | ✅ | ❌ (runs, doesn't copy itself) |
| `templates/` | ✅ | ✅ | ❌ → copies to `.ai-team-templates/` |
| `.github/agents/squad.agent.md` | ✅ | ✅ | ✅ (copied by init) |
| `.ai-team/` (Squad Squad state) | ✅ | ❌ | ❌ |
| `docs/` (proposals, blog, etc.) | ✅ | ❌ | ❌ |
| `test/` | ✅ | ❌ | ❌ |
| `.ai-team-templates/` (Squad's own) | ✅ | ❌ | ❌ |

## Risk Assessment

- **Risk of npm changing behavior:** Low. The `files` field has been a core npm feature since npm v1. If it ever stops working for git installs, `.npmignore` catches it.
- **Risk of accidental `files` removal:** Low but non-zero. `.npmignore` catches this.
- **Risk of new Squad Squad paths not being excluded:** Mitigated by the whitelist approach (`files` field only includes what's needed).

---

**Kobayashi's note:** The product was already correctly isolated by the existing `files` field. The `.npmignore` I added is insurance and documentation — it makes the separation visible to anyone reading the repo. Zero behavioral change. Zero risk. Ship it.



### 2026-02-09: Public hygiene and tone governance

**By:** bradygaster (human)

**Directives:**

1. **All content must be SFW, polite, respectful, growth-attitude.** This is now a permanent rule.

2. **Tone for the Squad Squad:** Dry, funny, but not jerks. Modeled after The Usual Suspects — not flowery AI talk, not self-congratulatory, not mean. Honest and thorough.

3. **Don't complement ourselves a lot.** No "amazing work team!" energy. Just report what happened.

4. **Kindness first** attitude in all public-facing content — logs, blogs, proposals, decisions.

5. **Thorough logging** — be honest about what happened (including bugs, failures, missteps). Growth vibe.

6. **Stale proposals** — audit and update status fields. Superseded proposals should say so.

7. **Blog content** — follow the blog format from docs/blog/template.md. Each milestone is blogworthy.


### Decision: Stale Proposals Audit — Status Field Reconciliation

**By:** Keaton (Lead)
**Date:** Post-019a session
**Requested by:** bradygaster

---

## What

Audited all 25 proposal files in `docs/proposals/`. Updated every `Status:` field to reflect current reality against Proposal 019 (master sprint plan), 019a (amendments), and shipped work.

## Status Changes

| Proposal | Old Status | New Status | Reason |
|----------|-----------|------------|--------|
| 001 | Proposed | Accepted | Workflow actively in use |
| 001a | Approved | Implemented | Lifecycle states adopted |
| 002 | Draft | Accepted | Messaging direction adopted; tracked in 019 |
| 003 | Draft | Deferred | Platform optimization beyond v1 scope |
| 004 | Proposed | Accepted | Demo script tracked in 019 Wave 1.5 |
| 005 | Proposed | Deferred | Video content not in 019 scope |
| 006 | Draft | Superseded | By Proposal 014 and 019 |
| 007 | Draft | Accepted | Tiered response modes in 019 Wave 2 |
| 008 (all 3) | Draft/Proposed | Accepted | Portable squads in 019 Waves 2-3 |
| 009 | Approved | Superseded | By Proposal 019 |
| 010 | Draft (Rev 2) | Accepted | Skills system in 019 Waves 2-3 |
| 011 | Proposed | Accepted | Upgrade shipped; full plan in 019 |
| 012 | Draft (Rev 2) | Accepted | Skills platform in 019 Waves 2-3 |
| 013 | Proposed | Accepted | 12 tests shipped; expansion in 019 Wave 1 |
| 014 | Draft | Accepted | V1 messaging in 019 Wave 1.5 |
| 014a | Proposed | Accepted | "Where are we?" beat in 019 Wave 1.5 |
| 015 | In Progress | Implemented | Mitigations shipped in squad.agent.md |
| 016 | Proposed | Accepted | Squad Paper in 019 Wave 1.5 |
| 017 (all 3) | Proposed | Deferred | Squad DM deferred to Horizon per 019 |
| 018 | Proposed | Superseded | By Proposal 019 |
| 019 | Approved | Approved | No change — active plan |
| 019a | Proposed | Accepted | Amendments actively applied |
| 020 | Proposed | Accepted | Blog/packaging in scope; npm note added |
| 021 | Proposed | Accepted | Release plan aligns with GitHub-only decision |

## npm/GitHub-Only Notes

Four proposals (008-experience, 008-platform, 011, 020) reference `@bradygaster/create-squad` or npm publishing. Added inline notes that distribution is now GitHub-only via `npx github:bradygaster/squad` per Proposal 019a. Proposal 021 already reflects this decision.

## Process Recommendation

Proposal status should be updated when work state changes — not accumulated into a retroactive audit. Proposal 001a defined the lifecycle but enforcement lapsed. Consider: agents update the proposal status field when they begin or complete work tracked by that proposal.

---

**For:** Scribe (merge to decisions.md), bradygaster (awareness)


### 2026-02-09: Tone audit — surgical cleanup of public-facing content

**By:** Verbal

**What:** Full tone audit of all agent charters, histories, decisions.md, session logs, orchestration logs, blog post, README, and key proposals (014, 014a, 005, 008, 010, 017, 019a). Applied Brady's tone governance directive: SFW, polite, no self-congratulation, no AI-flowery talk, keep opinionated voices intact.

**What was fixed (13 edits across 7 files):**

1. **`docs/proposals/014-v1-messaging-and-launch.md`** (3 edits)
   - "three features that change everything" → "three features that matter"
   - "changes everything about AI tools" → "not like any AI tool you've used"
   - Endorsement: removed "This is the launch Squad has been building toward" and "Make it pop" — self-congratulatory

2. **`docs/proposals/005-video-content-strategy.md`** (2 edits)
   - "paradigm shift, and it looks like magic on screen" → "fundamentally different workflow, and it looks compelling on screen"
   - Endorsement: "positions Squad as inevitable" → "gets Squad in front of people early"; cut "Beat everyone to the visual language"

3. **`docs/proposals/010-skills-system.md`** (2 edits)
   - "This is brilliant" → "This works well"
   - "This is huge" → "This matters"

4. **`docs/proposals/019a-sprint-plan-amendments.md`** (2 edits)
   - "This is brilliant" → "This is a strong play"
   - "incredible front-end reading experience" → "polished front-end reading experience"

5. **`docs/proposals/008-portable-squads-experience.md`** (2 edits)
   - Section header "Why This Changes Everything" → "Why This Matters"
   - "massive messaging upgrade. The possessive pronoun changes everything" → "significant messaging upgrade. The possessive pronoun matters"

6. **`docs/proposals/014a-where-are-we-messaging-beat.md`** (2 edits)
   - Reduced "category-defining" from 3 uses to 1 (kept the section-setting one, replaced the others with "strongest beat" and "lead beat")

7. **`docs/proposals/017-dm-experience-design.md`** (3 edits)
   - "The Three Things That Make Squad DM Category-Defining" → "The Three Things That Make Squad DM Different"
   - "Absolutely yes" → "Yes" (in Verbal's dialogue)
   - "Nobody else is doing this. Nobody." → "Nobody else is doing this yet."

8. **`.ai-team/agents/verbal/history.md`** (1 edit)
   - "The possessive pronoun changes everything" → "The possessive pronoun is the whole v1 story"

9. **`.ai-team/decisions.md`** (1 edit)
   - DM decision entry: trimmed "category-defining" and "This is the feature that makes..." self-congratulatory closer

**What was left alone (and why):**

- **Agent charters** — all clean. Edgy personality is character voice, not tone violation.
- **Verbal's "feel magical" / "AI bro"** — that's my personality. Edgy but not mean.
- **"killer feature" in decisions.md** — standard internal assessment term, not hype.
- **"category-defining" in decisions.md (line 137, 259)** — internal strategic positioning, not public copy.
- **Blog post (001)** — already clean. Factual, honest about the silent success bug, no self-congratulation.
- **README** — already clean. Concise, factual, no hype language.
- **Session logs** — already clean. Just facts.
- **Orchestration logs** — already clean.
- **"Magic Moments" sections in proposals 008, 010** — these are UX design terms describing interaction patterns, not self-congratulation. The word "magic" in context of UX design is industry-standard (Apple uses it, don't @ me). Left as-is.
- **Brady quotes** — never edited direct quotes from Brady (e.g., "amazing front-end UX" in 019a line 50 is his words).
- **"gorgeous" in 019a line 129** — part of a sample prompt (user-facing copy for a blog engine request), not team self-talk.
- **Wave 3 name "Magical"** — internal sprint name. Changing it would break cross-references across 4+ files for no reason.

**Principle applied:** Light touch. Brady said "don't go overboard." Each agent should still sound like themselves — Verbal is edgy, McManus is polished, Fenster is blunt. The goal was to sand off the "we're so incredible" peaks, not flatten the voice.


### 2026-02-08: Release ritual checklist established

**By:** Kobayashi
**What:** Created `docs/release-checklist.md` — a five-phase release ritual covering pre-release checks, release execution, post-release validation, communication, and rollback. Every step is tagged HUMAN (requires judgment), AUTOMATED (handled by `.github/workflows/release.yml`), or TEAM (owned by another agent). Includes rollback procedures for failed workflows, bad releases, stale npx cache, and `.ai-team/` corruption scenarios.
**Why:** Brady requested a codified release checklist — a ritual we evolve but don't break. Without a written process, releases depend on tribal knowledge. This checklist makes the release process reproducible by anyone on the team, documents what the automation handles vs. what requires human judgment, and establishes a rollback playbook before we need one. Derived from the release workflow in `.github/workflows/release.yml` and the distribution strategy in Proposal 021.

### 2026-02-08: Release ritual — Lead recommendations

**By:** Keaton
**What:** Product-level input on what a release ritual should contain for Squad, from 0.x through 1.0.
**Why:** Brady wants a release ritual that becomes team DNA — codified but not bureaucratic. This is my input as Lead so Kobayashi has product context when designing the actual checklist, and the team has a record of the reasoning.

---

#### 1. What gates matter for a product like Squad?

Tests are table stakes. For Squad specifically, three more gates matter:

1. **State integrity canary.** This is the single most important gate beyond tests. Squad's entire value proposition rests on `.ai-team/` being user-owned, untouchable state. If an upgrade corrupts user state, we don't have a bug — we have a trust violation. The CI already runs this (init → write sentinel → upgrade → assert sentinel survives). It MUST be a hard release gate. Not optional. Not "nice to have." Binary pass/fail, and a fail blocks the release.

2. **`npx` resolution smoke test.** Our distribution model is unusual — GitHub-only, no npm registry. The release workflow already verifies `npx github:bradygaster/squad --version` resolves correctly post-release. Keep this. A release that passes tests but can't be installed by users is not a release.

3. **Version coherence check.** `package.json` version, git tag, and `--version` CLI output must all agree. The release workflow validates tag-to-package.json already. Good. This stays.

What I'd skip as a gate: changelog completeness, documentation coverage, lint rules. Those matter but they shouldn't block a patch release at 3am when something's broken.

#### 2. Sign-off: who needs to approve?

**For 0.x:** Kobayashi + Brady is sufficient. Kobayashi owns the release mechanics, Brady owns the product. Two-person sign-off is fast and accountable. Adding more reviewers at this stage adds latency without adding safety — we're pre-v1, moving fast, and the automated gates (tests, state canary, npx verification) catch the things humans miss anyway.

**For 1.0:** I want Lead sign-off (me) added. The 1.0 release is a product statement, not just a code artifact. Architecture, messaging, feature completeness — those are product decisions that need a product eye. 1.0 should require Kobayashi (release mechanics) + Keaton (product readiness) + Brady (final call).

**Post-1.0:** Return to Kobayashi + Brady for patches and minors. Lead sign-off only for major versions.

#### 3. State integrity canary — is it a release gate?

Yes. Unambiguously yes. See point 1 above.

To be explicit: if the state integrity canary fails, the release does not ship. Period. No overrides, no "we'll fix it in the next patch." This is the one gate where I'd rather be too strict than too lenient. Users who lose their `.ai-team/` state lose their team identity, their decision history, their casting — everything that makes Squad *theirs*. That's not a recoverable failure.

The canary should test:
- Files in `.ai-team/decisions/inbox/` survive upgrade
- Subdirectory structure in `.ai-team/agents/` survives upgrade
- Nested content (files inside agent directories) survives upgrade
- Squad-owned files (`.github/agents/squad.agent.md`, `.ai-team-templates/`) ARE updated

#### 4. Blog post per release — required or optional?

**Optional for patches, strongly encouraged for minors, required for milestones.**

Here's my reasoning: a blog post for every `v0.1.1` bugfix patch is performative — it creates noise that dilutes the signal of real releases. But a minor version (`v0.2.0`, `v0.3.0`) represents a wave gate passing, new capabilities shipping, real product evolution. Those deserve a post. McManus should write it, and it should be part of the release ritual as a post-release task — not a gate, but a tracked follow-up.

For 1.0: the blog post IS the release. That one's mandatory and should be drafted before the release is cut.

**Practical distinction:**
- Patch: no blog post required. Release notes on GitHub are sufficient.
- Minor: blog post within 48 hours of release. Not a gate, but tracked.
- Major (1.0): blog post drafted and reviewed before release day. Gate.

#### 5. README freshness — should we verify the README matches the release?

Yes, but with nuance.

The README is a living document (decided in 019a). It should reflect current capabilities truthfully. A release that ships a new subcommand but doesn't mention it in the README is shipping a lie of omission.

**For 0.x:** Add a manual checklist item: "README reflects new capabilities in this release." It's a review step, not an automated gate. The person cutting the release eyeballs it.

**For 1.0:** README review becomes a gate. The README IS the product's face at launch. It must be accurate, complete, and polished. McManus reviews before release.

**What to check specifically:**
- New subcommands are documented
- `--version` output in examples matches the release version
- "Known Limitations" section is current
- Install/upgrade commands are correct
- CI badge is green (links to real passing workflow)

#### 6. Minimum viable release ritual: 0.x vs 1.0

**0.x — The "Ship It" Ritual (5 minutes):**

Pre-release:
- [ ] All tests pass on `dev` (`npm test`)
- [ ] State integrity canary passes (CI green)
- [ ] Version bumped in `package.json`
- [ ] README reflects new capabilities (eyeball check)

Release:
- [ ] Trigger release workflow (tag push or workflow_dispatch)
- [ ] Workflow completes: tests → filtered copy → main commit → tag → GitHub Release → npx verify

Post-release:
- [ ] Verify `npx github:bradygaster/squad --version` shows new version
- [ ] Verify `npx github:bradygaster/squad#v{tag} --version` works
- [ ] For minor releases: blog post within 48 hours (McManus, tracked not gated)

Sign-off: Kobayashi + Brady

**1.0 — The "This Is It" Ritual (1 day):**

Pre-release (day before):
- [ ] All tests pass on `dev` (`npm test`)
- [ ] State integrity canary passes
- [ ] Full upgrade path tested: v0.1.0 → v0.x.x → v1.0.0, `.ai-team/` intact at each step
- [ ] Version bumped in `package.json`
- [ ] README reviewed by McManus — accurate, complete, polished
- [ ] Blog post drafted and reviewed
- [ ] Demo script verified against actual product behavior
- [ ] Keaton (Lead) signs off on product readiness

Release:
- [ ] Trigger release workflow
- [ ] Workflow completes successfully
- [ ] GitHub Release marked as `prerelease: false` (first non-prerelease!)

Post-release:
- [ ] Verify npx resolution (both untagged and tagged)
- [ ] Run full upgrade path one more time from a clean directory
- [ ] Blog post published
- [ ] Demo video reflects 1.0 capabilities
- [ ] Announce in all channels

Sign-off: Kobayashi + Keaton + Brady

---

**The principle:** The ritual should be proportional to the stakes. A patch fix shouldn't require a ceremony. A major release shouldn't ship without one. The automated gates (tests, state canary, npx verify) do the heavy lifting — the human steps are about product judgment, not mechanical verification.

**What I'd warn against:** Don't let the ritual grow. Every "nice to have" checklist item that gets added becomes a reason to skip the whole checklist. Keep the 0.x ritual under 10 items. If something's important enough to be a gate, automate it. If it can't be automated, it better be worth the human time.

### 2026-02-08: Brand voice guidance for visual identity
**By:** McManus
**What:** Brand voice guidance for Redfoot (graphic designer) to use when developing Squad's logo and visual identity.
**Why:** The visual identity needs to match the written voice we've already established — dry, understated, confident. A logo that contradicts the messaging undermines everything we've built. This document gives Redfoot concrete guidance instead of vibes.

---

## 1. What Squad's brand should feel like

Squad is a **developer tool that doesn't try to impress you.** It works. It remembers. It gets better. The brand should feel like:

- **Competent, not flashy.** Squad is the colleague who ships while everyone else is still in standup. The visual identity should feel like something a senior engineer would put on a sticker. Not something a marketing team designed in a war room.
- **Dry confidence.** Our tagline is "Throw a squad at it" — it's casual, imperative, slightly cocky. The logo should match that energy. No exclamation marks. No gradients screaming "INNOVATION."
- **Developer-native.** This lives in terminals, READMEs, and GitHub profiles. It should feel born there, not ported from a Figma brand deck for a SaaS landing page.
- **Personality without performance.** Squad's casting system gives agents names from movie universes (The Usual Suspects, Alien, Ocean's Eleven). That's character, not costume. The visual identity should have personality baked in — not bolted on.

**The one-word test:** If someone sees the logo and thinks "polished," good. If they think "corporate," we failed. If they think "indie dev project," also failed. The sweet spot is **"this was made by someone who gives a damn but doesn't need to prove it."**

---

## 2. Visual pitfalls to avoid

| Pitfall | Why it kills us |
|---------|----------------|
| **Robot/AI imagery** (brains, circuits, neural nets) | Positions Squad as "another AI thing." We're a team tool, not a model wrapper. |
| **Gradient overload** | Screams 2024 AI startup. Squad's voice is understated. |
| **Chat bubble iconography** | "It's not a chatbot wearing hats" is literally our differentiator line. A chat bubble contradicts it. |
| **Too many colors** | Needs to work in monochrome (terminal output, GitHub dark mode, favicons at 16px). |
| **Overly literal "squad" imagery** (people, silhouettes, groups) | Gets cheesy fast. The "team" concept should be implied, not illustrated. |
| **Rounded-everything friendly SaaS aesthetic** | Squad's tone is dry and opinionated, not warm and welcoming. We're not Notion. |
| **Anything that looks like it was generated by AI** | Ironic and fatal. The Squad Squad blog posts are hand-crafted. The logo should feel that way too. |
| **Complex detail that disappears at small sizes** | This logo will live at 16px (favicon) as often as it lives at 200px (README header). |

---

## 3. Where the logo will live

The logo needs to work in all of these contexts — design for the smallest and most constrained first:

| Context | Size / Constraints | Notes |
|---------|-------------------|-------|
| **Favicon** | 16×16, 32×32 | Must be recognizable as a single shape. Monochrome. |
| **GitHub avatar** | 500×500, displayed at ~40px in most views | Circle-cropped. The mark needs to survive cropping. |
| **README header** | ~600px wide, inline markdown image | First thing a developer sees. Sits above "AI agent teams for any project." Needs to work on both light and dark GitHub themes. |
| **npm / GitHub package page** | Small icon + text | Often rendered tiny next to package name. |
| **Social cards (Open Graph)** | 1200×630 | Twitter/X, LinkedIn previews. Logo + tagline combo. Needs to pop on a feed. |
| **Blog header** | Full-width, flexible | Used in `docs/blog/` posts. Can be more expressive here. |
| **Terminal / CLI** | ASCII or emoji fallback | For install output (`npx create-squad`). Consider whether the mark can be approximated in unicode. |
| **Stickers / swag** | Die-cut friendly | If someone wants to put this on a laptop, the shape should work as a sticker. |

**Deliverable request for Redfoot:** A mark (icon) that works standalone, plus a lockup (mark + wordmark) for wider contexts. Dark and light variants. SVG source.

---

## 4. Tone alignment — visual identity ↔ written voice

Squad's written voice has been codified across proposals, blog posts, and team decisions. The visual identity needs to be the same voice in a different medium.

| Written voice trait | Visual equivalent |
|--------------------|-------------------|
| **Dry humor** ("It's not a chatbot wearing hats") | Subtle wit in the mark — clever, not jokey. No winking faces. |
| **Understated confidence** ("Throw a squad at it") | Clean geometry. Not trying to prove anything. |
| **Opinionated** ("If it sounds like a B2B landing page, rewrite it") | Strong, decisive shapes. Not generic. |
| **Technical credibility** (real token counts, architecture diagrams) | Precision in execution. Sharp edges, intentional spacing. |
| **Personality through restraint** (agent names, not agent role labels) | Character comes from the specific choice of form, not from decoration. |

**The tone governance rule applies to design too:** SFW, kind, dry humor, no AI-flowery aesthetics, no self-congratulation. If the logo could appear on a "Top 50 AI Startups" listicle without looking out of place, it's too generic.

---

## 5. Reference points — developer tools that got visual identity right

| Tool | What they got right | Relevance to Squad |
|------|--------------------|--------------------|
| **Astro** | The rocket mark is simple, memorable, works at any size. Personality without clutter. The purple-orange palette is distinctive without being loud. | Shows how a single strong shape scales from favicon to hero. |
| **Warp** (terminal) | Dark, developer-native palette. Logo feels like it belongs in a terminal. Not trying to be friendly — trying to be fast. | Squad lives in terminals. The visual language should feel native there. |
| **Raycast** | Geometric mark, works in monochrome, looks inevitable rather than designed. Clean lockup. | "Looks inevitable" is the goal. It shouldn't feel like a choice — it should feel like the only option. |
| **Linear** | Minimal, sharp, confident. The logomark is just lines. No gradients, no illustrations. The brand is the restraint. | Squad's written voice is the same — confident through what it doesn't say. |
| **Bun** | The bun icon is playful but disciplined. One shape, one concept, instant recognition. Scales perfectly. | Proof that personality and simplicity aren't opposites. |
| **Deno** | A dinosaur shouldn't work for a JavaScript runtime, but it does — because it's committed, not ironic. The illustration style is specific. | If Squad's mark has character, it needs to commit fully. Half-personality is worse than none. |

**Anti-references:**
- **LangChain** — logo is generic, forgettable, could be any SaaS product. Squad needs to be instantly recognizable.
- **Most "AI agent" products** — they all look the same. Purple gradients, neural net imagery, abstract blobs. If Redfoot's first instinct looks like any of these, start over.

---

## Notes for Redfoot

- The name "Squad" is short, punchy, one syllable. The wordmark should match that energy — no elongation, no flourishes.
- We use emoji as visual shorthand in docs (🏗️ Lead, ⚛️ Frontend, 🔧 Backend, 🧪 Tester, 📋 Scribe). The logo doesn't need to reference these, but it shouldn't clash with them either.
- Colors in our current mermaid diagrams: `#6366f1` (indigo/violet for Copilot), `#3b82f6` (blue for agents), `#8b5cf6` (purple for memory), `#6b7280` (gray for Scribe). These aren't brand colors yet — they're starting points, not constraints.
- Brady conceived this project. The visual identity should feel like something he'd be proud to put on a conference slide, not something he'd have to explain.


# Decision: Team Introduction Blog Post (003)

**By:** McManus (DevRel)
**Date:** 2026-02-09
**Status:** Shipped

## What

Published `docs/blog/003-meet-the-squad.md` — a full roster introduction covering all 8 active agents plus Scribe. Introduces Redfoot as the newest team member.

## Key Decisions

1. **Template adaptation:** Dropped `wave:` field and `What Shipped` section from the blog template. This is a team post, not a wave post. The template is a guide, and this format works better for introductions.
2. **First-person for McManus:** Since I'm introducing myself alongside the team, I wrote my own section in first person. Everyone else gets third person. Felt honest rather than weird.
3. **Redfoot welcome angle:** Called out as newest hire with `_(new)_` marker in the heading. Final line of the section is "Welcome aboard." — brief, warm, not performative.
4. **Scribe last:** Positioned as the closer. The silent observer gets the final word (or non-word). Lets the structure itself make the point about Scribe's role.

## Why It Matters

Blog 001 mentioned the original 5. Blog 002 introduced Kobayashi through his work. But neither post has the full roster in one place, and Redfoot had no introduction at all. A dev reading the blog chronologically should be able to find every team member.

## Files

- `docs/blog/003-meet-the-squad.md` (the post)
- `.ai-team/agents/mcmanus/history.md` (updated with learnings)


### 2026-02-08: Squad visual identity — initial proposals

**By:** Redfoot

**What:** Created visual identity proposal (`docs/proposals/022-squad-visual-identity.md`) with brand analysis, four logo concepts (The Formation, The Bracket, The Glyph, The Stack), brand color palette, and typography recommendations. Recommended Concept C "The Glyph" — a diamond outline with asymmetric inner solid diamond — and shipped an SVG implementation at `docs/assets/squad-logo-proposal.svg`. Defined primary palette anchored on Indigo 500 (`#6366F1`) to harmonize with existing Mermaid diagram colors.

**Why:** Squad has no visual identity. As the product approaches v1 launch (Proposal 014), it needs a logo, color system, and typography that work across every rendering context: terminal (monochrome), GitHub README (dark/light mode), favicon (16px), VS Code sidebar, social cards, and npm. The recommended concept was chosen because it satisfies every constraint with zero adaptation — one SVG, one color, infinite contexts. The brand register matches Squad's tone governance: confident, not flashy; structured, not decorative. Awaiting team feedback before refinement.

