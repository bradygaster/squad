# Team Decisions

Shared brain. All agents read this before working.
---

## Deduplication Notes (2026-02-12)

**Overlapping decisions identified and consolidated:**

1. **Branching Strategy:** Multiple decisions on branching (2026-02-09, 2026-02-11, 2026-02-12) represent evolution of thinking:
   - 2026-02-09: Initial decision (dev/main separation)
   - 2026-02-10: Keaton's proposal (three-branch model with feature branches)
   - 2026-02-11: Fenster's analysis (validating three-branch model)
   - 2026-02-12: Kobayashi's hardening (branch protection rules)
   Together they represent the progression from initial model through detailed proposal to hardening implementation.

2. **Release Process:** Decisions span 2026-02-09 through 2026-02-12, building on each other:
   - 2026-02-09: Pipeline audit
   - 2026-02-11: Release process directive (no manual pushes)
   - 2026-02-12: Detailed hardening with branch protection rules
   Consolidated as single logical progression of release safety.

3. **Version Display:** Kujan's 2026-02-12 decision implements existing infrastructure from 2026-02-10 per-agent model selection. No duplication.

All original decision blocks preserved for historical context. No content removed.

---

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

### 2026-02-09: Portable Squads — architecture, platform, and experience (consolidated)

**By:** Keaton, Kujan, Verbal
**Proposals:** 008-portable-squads.md, 008-portable-squads-platform.md, 008-portable-squads-experience.md

**What:** Squad supports exporting and importing team identity across projects via a JSON manifest file. Key decisions from three independent analyses:
- **Architecture (Keaton):** Separate Team Identity (portable) from Project Context (not portable). History split into portable knowledge and project learnings. Export format is a single `squad-export.json`. CLI: `npx create-squad export` / `npx create-squad --from <manifest>`. Casting travels unconditionally. No merge in v1.
- **Platform (Kujan):** CLI subcommands, `.squad` JSON file format, refuse merge in v0.1, manual history curation in v0.1 with LLM-assisted cleanup in v0.2. `imported_from` flag in registry.json. Implementation ~80 lines. No new dependencies.
- **Experience (Verbal):** Memory split: `preferences.md` (portable) from `history.md` (project-specific). `squad-profile.md` for team meta-history. Import skips casting ceremony. Narrative markdown for v1.

**Why:** The team is more valuable than the project. Without portability, users rebuild from scratch. Category-defining feature — nobody in the industry has portable agent teams. Opens path to squad sharing (v2) and registries (v3). Filesystem-backed memory makes export trivially simple. Combined with skills: a squad arrives at a new project already knowing the user AND the technology.

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

### 2026-02-09: Skills system — open standard with MCP tool declarations (consolidated)

**By:** Kujan, Verbal
**Proposals:** 010-skills-system.md, 012-skills-platform-and-copilot-integration.md (both Revision 2)

**What:** Squad agents acquire, store, and apply skills — earned domain knowledge that changes how agents approach work. Evolution across four independent analyses:
- **Initial design (Verbal, 2026-02-08):** Skills as portable competence distinct from preferences. Per-agent `skills.md` files. Lifecycle: acquisition → reinforcement → correction → deprecation. Confidence tracked by project count.
- **Platform feasibility (Kujan, 2026-02-08):** Skills stored separately from history for clean export. `store_memory` tool rejected (wrong persistence model). File paths in charters are frozen API contracts. Forwardability via defensive reads.
- **Open standard adoption (Kujan, 2026-02-09):** Adopted Agent Skills Open Standard (agentskills.io). SKILL.md format with YAML frontmatter. Standard directory layout. MCP tool dependencies declared via `metadata.mcp-servers`. Two categories: built-in (squad-prefixed, upgradable) and learned (never overwritten).
- **Final decision (Verbal, 2026-02-09):** Skills in `.ai-team/skills/{skill-name}/SKILL.md`. Coordinator injects `<available_skills>` XML for progressive disclosure (~50 tokens per skill at discovery). Skills portable beyond Squad — works in Claude Code, Copilot, any compliant tool.

**Why:** Brady's directive: skills adhering to Anthropic SKILL.md standard with MCP tool declarations. Squad's unique value: it GENERATES standard-compliant skills from real work while others author by hand. Flat `skills/` directory replaces per-agent files — skills are team knowledge. Ecosystem compatibility, progressive disclosure, and future-proofing. Implementation phased across 6 releases.

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

### 2026-02-09: Squad DM — architecture and experience design (consolidated)

**By:** Keaton, Verbal
**Proposal:** 017-squad-dm.md (architecture, platform feasibility, experience design)

**What:** Direct messaging interface for Squad across Telegram, Slack, Discord. Key decisions from two independent analyses:
- **Architecture (Keaton, 2026-02-08):** Thin platform adapters → Squad DM Gateway → tiered execution (Direct LLM for queries, Copilot CLI for code, GitHub Actions for CI). Dev Tunnels for webhook ingress. Auth via dm-config.json. Three phases: MVP Telegram (2-3 days), multi-platform (1-2 weeks), full parity + proactive notifications (2-4 weeks). Includes Kujan's platform feasibility: Copilot SDK as execution backend, ~420 lines new code. Gate: verify nested SDK sessions before committing.
- **Experience (Verbal, 2026-02-09):** Single Squad bot with emoji-prefixed agent identity. DM output: summary + GitHub link, never inline full artifacts. Proactive messaging: CI alerts, daily standups, decision prompts. Cross-channel memory: DM and terminal share `.ai-team/` state. DM mode flag in spawn prompts adapts output without changing personality.

**Why:** Brady wants to work with his Squad away from the terminal ("YES LIKE MOLTS but just my team(s)"). Cross-channel memory is the architectural moat. DM transitions Squad from reactive tool to proactive team. Deferred to Wave 4+ per Proposal 019.

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

### 2026-02-09: No npm distribution — GitHub-only model (consolidated)
**By:** bradygaster, Keaton
**What:** Squad is NOT published to npm. Not now, not ever. Distributed exclusively via `npx github:bradygaster/squad`. Item 1.8 from Proposal 019a (Register create-squad on npm) is CANCELLED. All documentation must use GitHub-hosted npx syntax. Kobayashi (Git & Release Engineer) hired to own releases, tags, branch strategy, CI/CD, and state integrity. Three new Wave 1 items added (1.11 release workflow, 1.12 branch strategy, 1.13 first tagged release). Wave 1 effort increases from 15-18h to 18-22h.
**Why:** Brady's explicit decision: no npm registry involvement. GitHub is the sole distribution channel. The package name is the GitHub repo name. Keaton executed the directive, updating Proposal 019a and onboarding Kobayashi.

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

### 2026-02-09: Release ritual — checklist and lead recommendations (consolidated)

**By:** Keaton, Kobayashi

**What:** Release process established with checklist and architectural recommendations from two independent analyses:
- **Checklist (Kobayashi, 2026-02-08):** Step-by-step release ritual from branch prep through post-release verification. Documented in `team-docs/release-process.md`.
- **Lead recommendations (Keaton, 2026-02-08):** Comprehensive review of release workflow architecture, CI gates, version validation, branch strategy, and filtered-copy mechanism. Identified strengths and areas for hardening.

**Why:** Squad needs a repeatable, auditable release process. Combined checklist and architectural review ensures both operational correctness and structural safety.

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

### 2026-02-08: Error handling patterns for index.js
**By:** Fenster
**What:** Established error handling patterns for the Squad installer runtime. All fs operations are now wrapped in try/catch. A centralized `fatal()` function handles error output (RED ✗ to stderr + `process.exit(1)`). Pre-flight validation checks source integrity and destination writability before any writes. `process.on('uncaughtException')` catches anything that escapes explicit handling. RED color constant added for error messages.
**Why:** index.js had zero error handling — bare fs calls that would throw raw Node.js errors on permission issues, missing files, or corrupted installs. For a CLI tool that runs via `npx` in unknown environments, unhandled errors destroy user trust. The `fatal()` pattern keeps error paths DRY and user-facing messages clean (no stack traces). Pre-flight validation follows fail-fast principle — detect problems before making any filesystem changes. The uncaughtException handler is a safety net, not primary error handling.


# Version Stamping Phase 1

**Decided by:** Fenster (Core Dev)
**Date:** 2026-02-09
**Sprint Task:** 1.4
**Status:** Completed

## Decision

Added `"engines": { "node": ">=22.0.0" }` to `package.json` to declare the Node 22+ runtime requirement. No changes to `index.js` — the existing `--version` flag already reads from `package.json` correctly.

## Rationale

- Squad's test suite uses `node:test`, which requires Node 22+. Without an explicit engine constraint, users on older Node versions get cryptic `ERR_MODULE_NOT_FOUND` errors instead of a clear "unsupported engine" warning from npm/npx.
- The `--version` flag (index.js lines 17-19) reads `pkg.version` at runtime from `package.json`. This is the correct pattern — single source of truth, zero duplication. No index.js changes needed.
- `package.json` remains the sole version authority: version number, engine constraint, and CLI `--version` all derive from it.

## Changes

- `package.json`: Added `engines.node: ">=22.0.0"` field.
- `index.js`: No changes (already correct).

## Verification

- All 12 tests pass (`npm test`).
- `--version` flag confirmed working (reads `0.1.0` from package.json).


# Decision: CI Pipeline Configuration

**By:** Hockney (Tester)
**Date:** 2026-02-09
**Sprint Task:** 1.3

## What

Created `.github/workflows/ci.yml` — a minimal GitHub Actions CI pipeline that runs `npm test` on every push to `main`/`dev` and every PR to `main`. Added CI status badge to README.md.

## Key Decisions

1. **Node 22.x only** — no multi-version matrix. We use `node:test` and `node:assert` which require Node 22+. Testing older versions would just fail.
2. **No `npm install` step** — zero runtime dependencies, zero dev dependencies. The test framework is built into Node.
3. **No caching** — nothing to cache (no `node_modules`). Can add later if dependencies are introduced.
4. **No artifacts/coverage** — ship the floor first. Coverage uploads and test result artifacts are Sprint 3 territory.
5. **Badge goes above existing shields** — CI status is the most operationally important badge; it belongs at the top.

## Why This Matters

CI is the quality gate. My own rule from Proposal 013: "No pre-commit hook — CI is the quality gate." This workflow makes that real. Every PR to `main` must pass 12 tests before merging. The badge makes pass/fail visible to anyone who visits the repo.

## Impact

- All agents: PRs now have an automated gate. If tests fail, the badge goes red.
- Kobayashi: Release workflow should depend on CI passing (or at minimum, tests are a subset of release gates).
- Fenster: Any changes to `index.js` will be validated automatically on push.

### 2026-02-09: Coordinator captures user directives before routing
**By:** Kujan
**What:** Added a "Directive Capture" section to `squad.agent.md` (Team Mode). When the user states a preference, rule, or scope decision (signaled by phrases like "always…", "never…", "from now on…"), the coordinator writes it to `.ai-team/decisions/inbox/copilot-directive-{timestamp}.md` before routing any work. The format matches standard decision entries so Scribe merges them naturally. Mixed messages (directive + work request) are handled — capture first, route second.
**Why:** User directives are team-wide decisions that affect all agents. Without capture, they exist only in conversation context and are lost between sessions. The decisions inbox is the correct persistence layer — it feeds into `decisions.md` via Scribe, which all agents read at spawn time. This closes the loop between human intent and team memory.

### 2026-02-08: "Feels Heard" — Immediate acknowledgment before agent spawns
**By:** Verbal (Prompt Engineer)
**Status:** Decided
**What:** The coordinator MUST respond with brief text acknowledging the user's request BEFORE spawning background agents. For single agents, use a human sentence naming the agent and describing the work. For multi-agent spawns, show a quick launch table with emoji, agent name, and task description. The acknowledgment goes in the same response as the `task` tool calls — text first, then tool calls.
**Why:** When the coordinator spawns background agents, there can be a significant delay before the user sees any response. A blank screen while agents work creates anxiety and breaks the feeling of a responsive team. Immediate acknowledgment makes the experience feel human — like a team lead saying "I'm on it" before diving into work.
**Where:** `.github/agents/squad.agent.md` — new "Acknowledge Immediately" subsection in Team Mode, placed before Directive Capture and Routing.
**Scope:** This is the coordinator-level instruction only. Does not change agent spawn templates or post-completion behavior.

### 2026-02-08: Park logo SVGs, keep proposal, redirect Redfoot
**By:** Brady (via Copilot)
**What:** Delete all logo SVG files from docs/assets/. Keep Proposal 022 (visual identity concepts) for future reference. Redirect Redfoot's design energy toward README polish, UI, and presentation rather than logo SVGs for now. The concepts are good but SVG generation isn't capturing the vision yet. No harm, no foul — Brady has ideas for later.
**Why:** User request — captured for team memory


# Decision: Test Coverage Expansion to 27 Tests (Sprint Task 1.2)

**By:** Hockney
**Date:** 2026-02-09
**Status:** Completed

## What

Expanded `test/index.test.js` from 12 tests / 3 suites to **27 tests / 7 suites**. Added coverage for Fenster's error handling work, the upgrade subcommand, all CLI flags, and edge cases. All tests pass. Zero dependencies.

## New Test Suites

| Suite | Count | Coverage |
|-------|-------|----------|
| flags and subcommands | 5 | `--version`, `-v`, `--help`, `-h`, `help` |
| upgrade subcommand | 4 | Overwrites squad-owned files, preserves `.ai-team/` |
| error handling | 4 | `fatal()` exit code 1, clean errors, exit code 0 on success |
| edge cases | 2 | Idempotent re-init, exit codes |

## Why

- Sprint Task 1.2 required 20+ tests — we now have 27
- Fenster shipped error handling (source validation, writable check, `fatal()`, `uncaughtException` handler) — needs test coverage
- The upgrade subcommand is a critical path (overwrites files while preserving user state) — must be regression-tested
- CLI flags are user-facing contract — must not break silently

## Key Testing Decisions

1. **fake package root technique** — to test `fatal()`, we copy `index.js` to a directory without source files, triggering the validation check. This is a real integration test, not a mock.
2. **`runCmdStatus()` helper** — wraps execSync in try/catch to capture both stdout and exit codes for error-path testing.
3. **No read-only directory test on Windows** — `fs.chmodSync` doesn't reliably enforce read-only on Windows. Deferred to Linux CI.

## What's Still Not Covered

- Read-only directory permissions (platform-dependent)
- Symlink edge cases
- Export/import round-trip (blocked on Proposal 008)
- `NO_COLOR` / non-TTY output
- Concurrent init processes

### 1. The SQL `todos` Table — Available but Wrong Scope

The Copilot CLI provides a per-session SQLite database with pre-built `todos` and `todo_deps` tables. Every coordinator session has access via the `sql` tool.

**What it can do:**
- Store structured items (id, title, description, status, timestamps)
- Track dependencies between items
- Query by status (`pending`, `in_progress`, `done`, `blocked`)
- Persist across tool calls within a single session

**What it can't do:**
- **Persist across sessions.** The database is per-session and starts empty. When the user closes the terminal or starts a new `copilot` session, everything in the SQL database is gone. This is a hard platform constraint — there is no cross-session storage in the SQL tool.
- **Be read by spawned agents.** Sub-agents spawned via the `task` tool run in isolated contexts. They cannot query the coordinator's SQLite database. The SQL tool is coordinator-only state.

**Verdict:** The SQL tool is useful for within-session tracking (e.g., tracking which items from a prompt have been dispatched) but cannot serve as a durable incoming queue. Anything that needs to survive the session must go to the filesystem.

### 2. What the Coordinator Can Do Between Spawns

The coordinator has full tool access between spawning agents and collecting results. Specifically:

| Capability | Available? | Notes |
|-----------|-----------|-------|
| Write files (create/edit) | ✅ Yes | Can write to inbox immediately |
| Run SQL queries | ✅ Yes | Session-scoped only |
| Read the codebase | ✅ Yes | Can parse, classify, route |
| Make more tool calls | ✅ Yes | No limit on tool calls per turn |
| Spawn additional agents | ✅ Yes | Can fan out in same turn |
| Emit text to user | ✅ Yes | Text + tool calls coexist in one turn |

**Key insight:** The coordinator CAN do useful work in the same turn it spawns agents. It already does this — the "Acknowledge Immediately" pattern emits text while tool calls spawn agents. The directive capture pattern writes to the inbox before routing. These happen in the same LLM turn. There is no "idle time" between spawn and collection where additional work could happen — the coordinator emits everything (text, tool calls, file writes) in one turn, then blocks on `read_agent`.

### 3. Platform Constraints — The Hard Truths

**The coordinator is blocked while waiting for agents.** Once the coordinator calls `read_agent` with `wait: true`, it cannot process new messages, make new tool calls, or do any work until the agent returns. This is a single-threaded conversation model — confirmed in my earlier analysis (Proposal 018 human input latency). There is no interrupt mechanism, no message polling API, no yield-and-resume.

**The user CAN type while agents run** — but messages queue. The next message is processed only after the coordinator finishes its current turn (collecting all agent results, spawning Scribe, presenting output). During a full fan-out (~40-60s), the user's follow-up message sits in queue.

**There is no state between user messages** beyond:
- The coordinator's conversation history (LLM context window)
- The filesystem (`.ai-team/` directory)
- That's it. No SQL persistence, no in-memory state, no background processes.

### 4. What We Already Have vs. What We'd Build

**Already exists — no new infrastructure needed:**

| Component | Status | Where |
|-----------|--------|-------|
| Drop-box inbox | ✅ Shipped | `.ai-team/decisions/inbox/` |
| Directive capture | ✅ Shipped | `squad.agent.md` Team Mode |
| Scribe merge pipeline | ✅ Shipped | Scribe charter + After Agent Work flow |
| User acknowledgment | ✅ Shipped | "Acknowledge Immediately" section |
| Routing classification | ✅ Shipped | Routing table in Team Mode |

**The gap Brady is describing:**

Brady's "incoming queue" idea is about the *middle* of the current flow — between "user sends message" and "agents start working." Today, the coordinator:

1. Reads the message
2. Checks for directives → writes to inbox if found
3. Routes to agents → spawns them
4. Waits → collects results
5. Spawns Scribe → merges inbox

Brady wants step 2 to be smarter — not just directives, but ANY actionable item parsed from the prompt, written to the inbox as a queue entry, even if the coordinator also routes it for immediate work. This creates a paper trail of what was asked, separate from what was done.

## Assessment: What's Actually Feasible

### Option A: Enhance Directive Capture (Recommended — Zero New Infrastructure)

Broaden the existing directive capture to capture ALL actionable items from every message, not just "always/never" directives. The coordinator already writes to the inbox — expand what triggers a write.

**How it works:**
1. User sends message
2. Coordinator parses for actionable items (directives, tasks, questions, scope changes)
3. Writes each to `.ai-team/decisions/inbox/copilot-request-{timestamp}.md`
4. Acknowledges immediately ("📌 Captured 3 items. Dispatching...")
5. Routes and spawns agents as normal
6. Scribe merges the request log into `decisions.md`

**Why this works:**
- Uses the existing inbox → Scribe pipeline
- Filesystem-backed = survives sessions, is git-cloneable, human-readable
- No new tools, no SQL dependency, no platform features needed
- The coordinator already does steps 1, 4, and 5 — only step 2-3 is new
- Cost: ~200 tokens added to `squad.agent.md` (~0.15% of context)

**What it doesn't solve:**
- Messages queued while agents work still wait. The coordinator can't process them until its current turn finishes. This is a hard platform constraint.
- There's no "background listener" that captures input independently of the coordinator's turn cycle.

### Option B: SQL as Session-Local Work Queue (Marginal Value)

Use the `todos` table to track items within a session — parse prompt into items, insert as todos, update status as agents complete them.

**Why it's marginal:**
- Adds complexity (SQL + filesystem, two state systems)
- SQL state vanishes between sessions — the filesystem version persists
- Agents can't read the SQL state — only the coordinator benefits
- The filesystem inbox already serves the same purpose more durably

**When it might help:** A single complex session with 10+ items where the coordinator needs to track which are dispatched vs. pending vs. blocked. SQL's query semantics beat flat files for this. But this is an edge case — most prompts have 1-3 actionable items.

### Option C: What Would Require Platform Changes (Not Available Today)

- **Cross-session SQL persistence** — would make Option B viable as a durable queue
- **Background message listener** — a coordinator subprocess that captures input while agents work
- **Agent-readable shared state** — sub-agents querying the coordinator's SQL database
- **Message queue API** — coordinator checking for new messages between tool calls
- **Multi-turn coordinator sessions** — yield, check inbox, resume

None of these exist. None are announced. Don't design for them.

## Recommendation

**Option A. Broaden directive capture to a full "request log."** The coordinator already writes directives to the inbox. Extend this to capture every actionable item from every message — tasks, questions, scope changes, directives. This turns the inbox into Brady's "incoming queue" with zero new infrastructure.

The SQL `todos` table is a nice-to-have for within-session tracking of complex multi-item prompts, but it's not the queue — the filesystem inbox is the queue.

**What this gives the user:**
- Every request is logged to `.ai-team/decisions/inbox/` before agents start
- Scribe merges these into `decisions.md` — creating a persistent record of what was asked
- If agents fail (silent success, timeout, crash), the request is still captured
- The user can inspect the inbox anytime to see what's pending
- Git history shows the full request log — auditable, diffable

**What this doesn't give the user:**
- Real-time processing of messages sent while agents work (hard platform limit)
- A live dashboard of queue status (would need a UI, not just files)
- Automatic retry of failed items (possible but adds coordinator complexity)

---

*This assessment is honest about platform constraints. The Copilot CLI is single-threaded, session-scoped, and has no background processing for the coordinator. The filesystem is the only durable, cross-session, agent-readable state. Build on that.*

### 2026-02-09: Incoming queue — architecture decisions and coordinator design (consolidated)
**By:** Verbal
**What:** Proposal 023 v2 establishes three architecture decisions for the incoming queue, incorporating Brady's direction and Kujan's platform assessment:

1. **SQL hot layer + filesystem durable store.** SQL `todos` table is the queryable working set within a session. `.ai-team/backlog.md` is the durable source of truth across sessions. Writes go to both. Session start rehydrates SQL from filesystem. Filesystem always wins on conflict.

2. **Team backlog as first-class feature.** Auto-populated from conversation extraction, explicit adds supported, drop-box pattern for agent writes. Third memory channel alongside decisions and history. Proactive surfacing after agent work completes.

3. **Agent cloning is architecturally ready.** Same agent identity can spawn multiple times in parallel — each clone in its own worktree, writing to separate inbox files. No infrastructure changes needed.

The coordinator generalizes the directive capture pattern into full message extraction — parsing every message for work requests, directives, backlog items, questions, and context clues before spawning agents. Backlog items persist to `.ai-team/backlog.md` (filesystem-first). SQL rejected as primary store (session-scoped = non-persistent).
**Why:** Users send compound messages. Today only directives and work requests get captured — everything else disappears. Brady's explicit architecture direction (SQL as cache, filesystem as truth, team can clone). Kujan's assessment confirmed platform constraints. The backlog adds a third memory channel (intent) alongside decisions (agreements) and history (learnings).

**Recommendation:** Move to implementation. Phase 1 (extraction + dual-layer writes) is ~40 lines in squad.agent.md. Cloning (Phase 3) should be tested conservatively.

### 2026-02-08: State hygiene protocol established
**By:** Verbal
**What:** .ai-team/ must NEVER be tracked in git. Main branch = bare minimum product files only. Three-layer protection: .gitignore (prevents tracking), package.json files allowlist (prevents npm distribution), .npmignore (explicit exclusion). Release branch gates what reaches main.
**Why:** v0.1.0 shipped team state to public GitHub repo. The package.json files array saved us from shipping to npm consumers, but GitHub visibility was still a leak. This protocol ensures it never happens again.

### Decision: README polish + CHANGELOG for v0.1.0

**By:** McManus
**Date:** 2026-02-08
**Status:** Executed

## What changed

### README.md
- Added **Upgrade** subsection under Install — documents `npx github:bradygaster/squad upgrade` with explanation of what it overwrites and what it preserves
- Added **Known Limitations** section — four bullets: experimental (API/formats may change), Node 22+ required, GitHub Copilot CLI required, knowledge grows with use
- Updated **Status** line — now reads "Experimental — v0.1.0" instead of just "Experimental"
- CI badge was already present and correct (no change needed)
- No tone changes, no structural rewrites — the README was already solid

### CHANGELOG.md (new file)
- Created at repo root
- Three sections: Added (14 items), What ships (3 entries matching `files` array in package.json), What doesn't ship (`.ai-team/` explicitly noted as not packaged)
- Accurate to `index.js` behavior and `package.json` contents

## Why
Brady requested README/docs updates as the content gate for v0.1.0 release. The release checklist (docs/release-checklist.md) requires README currency and CHANGELOG updates.

## What didn't change
- README structure, tone, and messaging — untouched
- No code changes
- All 27 tests pass before and after

### 2026-02-08: User directive — short ask_user responses
**By:** Brady (via Copilot)
**What:** If ask_user returns a response under 10 characters, treat it as ambiguous and re-confirm with the user before acting. The platform may fabricate default responses from blank input.
**Why:** User request — captured for team memory. Brady observed the ask_user tool returning "Use your best judgment" when he typed nothing, and the coordinator acted on it as if it were a real response.

### 2026-02-09: Documentation structure and docs/ separation (consolidated)
**By:** Kobayashi
**What:** Permanent three-tier separation of documentation and team state:
- `docs/` = Public-facing documentation only (user guides, sample prompts, API docs). GitHub Pages ready. Ships on GitHub and in the release pipeline (KEEP_DIRS, package.json files field). On main, contains ONLY user-facing content — no internal planning.
- `team-docs/` = Internal team documentation (proposals, sprint plans, postmortems, blog drafts). Tracked in git on development branches, excluded from npm. Never merged to main.
- `.ai-team/` = Runtime team state. Gitignored. Never committed to any branch.
**Why:** v0.1.0 incident mixed user-facing and internal content in docs/. Brady's directive established permanent structural separation. Three tiers ensure product docs (public), team docs (internal but tracked), and team state (runtime, never tracked) are never mixed. As of 2026-02-09, docs/ and CHANGELOG.md are included in the release pipeline per Brady's directive.

### 2026-02-08: Per-agent model selection design
**By:** Verbal
**What:** Designed a per-agent model selection system with four layers: user override (highest priority) → charter `## Model` field → registry `model` field → deterministic auto-selection algorithm. Auto-selection maps role categories to model tiers (Designer → Opus for vision, Tester/Scribe → Haiku for speed, Lead/Dev → Sonnet for balance). Task complexity signals can bump the tier (architecture decisions → Opus, simple renames → Haiku). Charter template and registry schema both get model fields; charter wins on conflict because the agent's self-declared rationale is more authoritative. Phase 1 is zero code changes — coordinator instructions only. Model auto-selection is a hard dependency: it must ship with or before charter model fields so the feature is zero-config by default. Delegation support: agent-to-agent spawns read the target's charter `## Model` field; the model preference is self-declared and travels with the agent regardless of who spawns it.
**Why:** Current uniform model selection wastes money on simple tasks (Scribe doing file merges on Sonnet), undersells complex tasks (Keaton making architecture decisions on Sonnet), and creates capability mismatches (Redfoot designing visuals on a text-first model). Brady's directive: "We don't want Redfoot using Claude Sonnet to design imagery." The model must match the agent's capabilities. This design makes model selection automatic, transparent, and overridable.


# Export CLI Implemented (Item 2.4)

**Date:** 2026-02-09
**Author:** Fenster
**Status:** Completed
**Proposal:** 019 (Item 2.4)
**Depends on:** Item 2.2 (Smart Upgrade), Item 2.3 (Skills Phase 1)

## What

Shipped `npx github:bradygaster/squad export [--out <path>]` — produces a `squad-export.json` portable snapshot containing casting state, agent charters/histories, and skills.

## Implementation

- Export handler added to `index.js` after help block, before source validation (export doesn't need installer source files)
- Validates squad existence via `.ai-team/team.md` — fatal error if missing
- Reads casting files (registry.json, policy.json, history.json) with individual try/catch — missing files skipped
- Scans `.ai-team/agents/*/` for charter.md and history.md per agent
- Scans `.ai-team/skills/*/SKILL.md` for skill definitions
- `--out <path>` flag via `process.argv.indexOf('--out')` — no parser dependency
- Help text updated with export command description
- 9 tests added covering all specified scenarios

## Manifest Schema (v1.0)

```json
{
  "version": "1.0",
  "exported_at": "ISO 8601 timestamp",
  "squad_version": "from package.json",
  "casting": { "registry": {}, "policy": {}, "history": {} },
  "agents": { "name": { "charter": "string", "history": "string" } },
  "skills": ["SKILL.md contents"]
}
```

## Constraints Honored

- Zero dependencies
- Windows compatible (all `path.join()`)
- Existing 69 tests unaffected (4 pre-existing failures in templates/migrations unrelated to export)
- 9 new export tests all pass

## What's Next

- Import CLI (Item 3.1) will consume this format
- History curation remains manual in v1 per Proposal 008


# Decision: Import CLI Implementation (Sprint Task 3.1)

**Author:** Fenster (Core Developer)
**Date:** 2026-02-09
**Status:** Completed

## Context

Wave 2 delivered the `export` subcommand. Wave 3 requires the `import` counterpart to complete the portability story. Per Proposal 008, squads must be portable across projects via JSON manifest files.

## Decision

Shipped `import` subcommand at `npx github:bradygaster/squad import <file> [--force]`. Key design decisions:

1. **Collision detection with archival, not deletion.** When `.ai-team/` exists and `--force` is used, the old squad is moved to `.ai-team-archive-{timestamp}/`. No data is ever destroyed. Timestamp format uses `YYYYMMDD-HH-mm-ss` (no colons — Windows-safe).

2. **History split is pattern-based, not LLM-assisted.** Section headers are classified as portable or project-specific using regex patterns. This is deterministic and zero-dependency. LLM-assisted classification is deferred to v0.2 per Proposal 008.

3. **Project-specific files are NOT imported.** `decisions.md` and `team.md` are created empty. These are project-local state that doesn't transfer. Casting state (registry, policy, history) transfers unconditionally.

4. **Skills imported by frontmatter name extraction.** The `name` field from SKILL.md YAML frontmatter determines the directory name. Portable and deterministic.

5. **Casting ceremony skipped on import.** Per Proposal 008, imported squads arrive with pre-populated names, universe, and relationships. No interactive setup needed.

## Consequences

- Squad portability is now a complete feature: export → import round-trip at 100% fidelity (tested).
- History split is conservative — some portable content may end up in project learnings. This is safer than the reverse (project-specific content treated as portable).
- 92 tests pass, zero regressions. 11 new import-specific tests cover happy path, error cases, round-trip, and history split.

### Progressive History Summarization

**By:** Verbal (Prompt Engineer)
**Date:** Wave 3, Item 3.3

**What:** Added progressive history summarization to the Scribe's responsibilities in `squad.agent.md`. When any agent's `history.md` exceeds ~3,000 tokens (~12KB), the Scribe summarizes entries older than 2 weeks into a `## Core Context` section and archives originals to `history-archive.md`. Added `history-archive.md` to Source of Truth Hierarchy table.

**Why:** Agent startup cost must stay constant regardless of project age. Without summarization, history.md grows unbounded, consuming more context window on every spawn. This mechanism preserves all information (archive keeps originals) while keeping the working history file compact. The 2-week recency window ensures recent context stays detailed; older learnings get distilled into patterns.

**Scope:** Prompt engineering only — changes to `.github/agents/squad.agent.md`. No code changes.

### 2026-02-09: Forwardability and smart upgrade (consolidated)
**By:** Fenster
**What:** Squad adopts a forwardability model: file ownership (Squad-owned vs user-owned), `upgrade` subcommand, and version-keyed migration system. Implementation shipped: version delta detection reads installed version from squad.agent.md frontmatter, compares against package version. Migration registry (array of versioned functions) runs applicable migrations in semver order. First migration (0.2.0) creates `.ai-team/skills/`. "Already up to date" path exits early but still runs pending migrations. 8 new tests added.
**Why:** Users must be able to update squads with new features without losing state. File ownership model ensures upgrades are safe. Migration registry is the delivery mechanism for all future improvements -- additive-only, idempotent, never destructive.
**Proposal:** `docs/proposals/011-forwardability-and-upgrade-path.md`

### 2026-02-09: Tiered response modes (consolidated)
**By:** Kujan, Verbal
**What:** Four-tier response mode system (Direct/Lightweight/Standard/Full) replaces "every interaction spawns an agent" model. Routing table determines WHO; Response Mode Selection determines HOW based on complexity. Includes: decision table with latency targets, Lightweight Spawn Template (no charter/history/decisions reads), explore agent for read-only queries, "where are we?" as Direct Mode exemplar, context caching (stop re-reading team files after first message), Scribe batching (skip when inbox empty). Anti-pattern #3 updated to reference tiered modes as legitimate exceptions.
**Why:** Brady's feedback -- "later on, the agents get in the way more than they help." Every interaction paid ~30-35s overhead regardless of complexity. Tiered modes match effort to complexity: Direct ~2-3s, Lightweight ~8-12s, Standard ~25-35s, Full ~40-60s. Context caching saves ~3 tool calls per subsequent message. Combined: late-session friction becomes flow.
**Proposal:** `docs/proposals/007-agent-persistence-and-latency.md`

### Feature showcase prompts added to sample-prompts.md

**By:** McManus
**Date:** 2026-02-09

**What:** Added 7 new prompts (#17–#23) in a new "Feature Showcases" section to `docs/sample-prompts.md`. Covers all 9 Wave 2-3 features: export/import, skills, smart upgrade, ceremonies, GitHub Issues Mode, PRD Mode, human team members, tiered response modes, and history summarization. Each prompt is a real project where the feature shows up naturally — no contrived demos. Matches existing format and tone exactly.

**Why:** The file had 16 prompts but zero coverage of the features shipped in Waves 2-3. New users browsing sample prompts had no way to discover export/import, ceremonies, PRD mode, GitHub Issues mode, human team members, or skills. These prompts fill that gap while maintaining the same quality bar.

### 2026-02-09: GitHub-native state as first-class context
**By:** Brady (via Copilot)
**What:** Explore shifting Squad artifacts from files-on-disk to GitHub-native features. Proposals could be GitHub Issues instead of markdown files. Issues, PRs, discussions, and other GitHub repo features become additional context sources alongside .ai-team/ files. Inspired by Shayne's real-world usage where Squad is answering issues, commenting on PRs, and using GitHub features end-to-end.
**Why:** User directive — captured for team memory. This is a strategic direction for post-v0.2.0 work: deeper GitHub integration where the platform itself becomes part of the team's state and context.

### 2026-02-09: Mermaid diagram color convention
**By:** Brady (via Copilot)
**What:** All mermaid diagrams must use hard-picked colors: dark-colored backgrounds on boxes with light-colored (white) font text. Never use random or default mermaid colors. This is a visual accessibility rule.
**Why:** User directive — Brady can't read the random colors that get generated. Consistent dark-bg/light-text across all diagrams.


# Decision: Comprehensive Proposal Status Audit

**By:** Keaton (Lead)
**Date:** 2026-02-10
**Requested by:** bradygaster

## What

Audited all 25+ proposals in `team-docs/proposals/` and updated every status field to reflect what actually shipped across Waves 0-3 and PR #2.

## Status Changes Made

### Shipped (status → "Approved ✅ Shipped")
| Proposal | Previous Status | Wave |
|----------|----------------|------|
| 001 — Proposal-First Workflow | Accepted | Wave 0 |
| 001a — Lifecycle Amendment | Implemented | Wave 0 |
| 002 — Messaging Overhaul | Accepted | Wave 1.5 |
| 004 — Demo Script Overhaul | Accepted | Wave 1.5 |
| 007 — Agent Persistence & Latency | Accepted | Wave 2 |
| 008 — Portable Squads (all 3 variants) | Accepted | Wave 2 |
| 010 — Skills System | Accepted | Wave 2-3 |
| 011 — Forwardability & Upgrade | Accepted | Wave 2 |
| 012 — Skills Platform & Copilot Integration | Accepted | Wave 2-3 |
| 013 — V1 Test Strategy | Accepted (12 tests) | Wave 1 (92 tests now) |
| 014 — V1 Messaging & Launch | Accepted | Wave 1.5 |
| 014a — "Where Are We?" Beat | Accepted | Wave 1.5 |
| 015 — Silent Success Bug | Implemented | Wave 1 |
| 019 — Master Sprint Plan | Approved | Waves 1-3 |
| 019a — Sprint Plan Amendments | Accepted | Waves 1-3 |
| 020 — Blog & Packaging | Accepted | Wave 1.5 |
| 021 — Release Plan & Distribution | Accepted | Wave 1 |
| 025 — PR #2 Review | Review | Wave 2.5 |

### Deferred to Horizon
| Proposal | Previous Status | Reason |
|----------|----------------|--------|
| 003 — Copilot Platform Optimization | Deferred | Phase 1 items shipped; advanced phases deferred |
| 005 — Video Content Strategy | Deferred | Not yet produced |
| 016 — The Squad Paper | Accepted | Not yet published |
| 022 — Visual Identity | Draft | Not yet executed |
| 023 — Incoming Queue | Revised Draft | Not yet implemented |
| 024 — Per-Agent Model Selection | Draft | Not yet implemented |

### Already Correct (no change needed)
| Proposal | Status |
|----------|--------|
| 006 — README Rewrite | Superseded by 014/019 |
| 009 — V1 Sprint Plan | Superseded by 019 |
| 017 — Squad DM (all 3 variants) | Deferred to Horizon |
| 018 — Wave Execution Plan | Superseded by 019 |

## Additional Cleanup
- Updated "[Pending]" approval/implementation fields on proposals 003, 007, 008 (all variants) to reflect actual ship dates
- Updated proposal 013's test count from "12 tests shipped" to "92 tests now"

## Why This Matters
Proposal statuses were stale — many said "Accepted" or "Implemented" without reflecting that entire waves had shipped. Brady should be able to `grep "Shipped" team-docs/proposals/` and see exactly what landed. The audit brings every proposal into alignment with the lifecycle defined in Proposal 001a.


# Release Pipeline Audit — v0.2.0 Readiness

**Author:** Kobayashi (Git & Release Engineer)
**Date:** 2026-02-09
**Verdict:** SAFE — with 2 observations and 1 recommendation

---

## Audit Scope

End-to-end audit of every mechanism that controls what ships to users via `npx github:bradygaster/squad`.

---

## 1. npm Pack Safety (what `npm pack` would include)

### `package.json` `files` field (PRIMARY GATE):
```json
"files": [
  "index.js",
  ".github/agents/squad.agent.md",
  "templates/**/*"
]
```

**Verified via `npm pack --dry-run`** — tarball contains exactly **19 files**:
- `index.js` ✓
- `package.json` ✓ (always included by npm)
- `LICENSE` ✓ (always included by npm)
- `README.md` ✓ (always included by npm)
- `.github/agents/squad.agent.md` ✓
- `templates/` (13 files) ✓ — includes `templates/skills/squad-conventions/SKILL.md`

**NOT in tarball (confirmed excluded):**
- `.ai-team/` ✗
- `.ai-team-templates/` ✗
- `team-docs/` ✗
- `docs/` ✗
- `test/` ✗
- `CHANGELOG.md` ✗
- `.github/workflows/` ✗
- `.gitattributes` ✗
- `.gitignore` ✗
- `.npmignore` ✗

**Status: CLEAN.** The `files` allowlist is the strongest protection — it's an inclusion list, not an exclusion list. Only listed files ship. Period.

### `.npmignore` (DEFENSE-IN-DEPTH):
Excludes:
- `.ai-team/` ✓
- `.ai-team-templates/` ✓
- `docs/` ✓
- `team-docs/` ✓
- `test/` ✓
- `.gitattributes` ✓
- `.github/workflows/` ✓
- `.vscode/`, `.DS_Store`, `Thumbs.db`, `*.swp`, `*.swo` ✓

**Note:** `.npmignore` is redundant when `files` is present (`files` takes precedence). It exists purely as a safety net if `files` is accidentally removed. This is correct defense-in-depth.

---

## 2. Release Workflow (`release.yml`)

### Trigger Mechanisms:
- `workflow_dispatch` (manual, version input) ✓
- Tag push `v*` ✓
- Both validate version against `package.json` — mismatch = hard failure ✓

### Filtered-Copy Strategy (the core mechanism):
The workflow does NOT do `npm publish` or merge. It:
1. Checks out `dev`
2. Copies ONLY these files to a staging directory:
   - **KEEP_FILES:** `index.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore`, `.npmignore`, `.gitattributes`, `.github/agents/squad.agent.md`
   - **KEEP_DIRS:** `templates/`
3. Switches to `main`, does `git rm -rf .`
4. Copies staged files into clean working tree
5. Commits, tags, pushes

**This is an allowlist approach at the git level.** Only explicitly listed files reach `main`. Even if someone adds a new internal directory on `dev`, it will never reach `main` unless added to KEEP_FILES or KEEP_DIRS.

### Verification Steps:
- Test gate (runs `npm test` on dev before proceeding) ✓
- Version validation (package.json must match requested version) ✓
- Post-release verification (`npx -y github:bradygaster/squad --version` in clean dir) ✓

**Status: CLEAN.** The filtered-copy approach is the strongest possible design — dual allowlists (release workflow + `package.json` `files`) mean both must be wrong for internal state to leak.

---

## 3. npx Distribution Path

### How `npx github:bradygaster/squad` works:
1. npm downloads tarball from `codeload.github.com` for `main` HEAD
2. npm applies `package.json` `files` field filtering before installation
3. Only files matching the `files` allowlist land in `node_modules`

### Three layers of protection:
| Layer | Type | What it does |
|-------|------|-------------|
| Release workflow KEEP_FILES | Allowlist | Only product files reach `main` branch |
| `package.json` `files` | Allowlist | Only listed files enter npm installation |
| `.npmignore` | Denylist | Backup exclusion if `files` is removed |

### Pinned versions:
`npx github:bradygaster/squad#v0.2.0` resolves to the tagged commit on `main`. Since the tag is created by the release workflow after filtered-copy, it points to a clean product-only commit.

**Status: CLEAN.**

---

## 4. Edge Case Analysis

### What if someone runs `npm publish` manually from repo root?
- The `files` field in `package.json` protects this. `npm pack --dry-run` confirms: only 19 product files would be included. Internal state is excluded even from a manual publish on `dev`.
- **Mitigated by `files` allowlist.**

### What if `.npmignore` is accidentally deleted?
- No impact. `files` field takes precedence over `.npmignore`. The tarball would be identical.
- **Mitigated by `files` allowlist.**

### What if `package.json` `files` field is accidentally removed?
- `.npmignore` becomes the active filter. It would exclude `.ai-team/`, `.ai-team-templates/`, `docs/`, `team-docs/`, `test/`, `.github/workflows/`.
- **However:** `CHANGELOG.md` is NOT in `.npmignore` and would be included. This is cosmetic, not a security risk — it contains no internal state.
- **Partially mitigated by `.npmignore`.**

### What if someone adds a new internal directory without updating `.npmignore`?
- If `files` is present: no impact (allowlist).
- If `files` is removed AND `.npmignore` isn't updated: the new directory would ship. This is the weakest link, but requires TWO failures (removing `files` AND not updating `.npmignore`).
- **On `main` branch this is impossible** — the release workflow's KEEP_FILES/KEEP_DIRS would not include it.

### Is `.ai-team-templates/` excluded?
- Yes. Not in `files` allowlist, excluded by `.npmignore`, and not in KEEP_FILES/KEEP_DIRS.

---

## 5. Observations

### Consider adding a tarball content verification step to the release workflow

The current workflow verifies npx resolution (`--version` check) but does not verify the tarball content. Adding a step that runs `npm pack --dry-run` on the staged `main` content and asserts the file count would catch drift:

```yaml
- name: Verify package content
  run: |
    cd $STAGING
    FILE_COUNT=$(npm pack --dry-run 2>&1 | grep "total files" | grep -oP '\d+')
    if [ "$FILE_COUNT" -gt 25 ]; then
      echo "::error::Package contains $FILE_COUNT files — expected ≤25. Possible internal state leak."
      exit 1
    fi
    echo "✓ Package contains $FILE_COUNT files"
```

This is a nice-to-have, not a blocker. The dual-allowlist design (KEEP_FILES + `files` field) already makes leaks structurally impossible.

**Priority: LOW.** Not blocking v0.2.0.

---

## Verdict

### **YES — this release pipeline is safe for v0.2.0.**

The pipeline uses **three independent protection layers**, two of which are allowlists (structurally can't leak unknown files). Internal state (`.ai-team/`, `team-docs/`, agent charters, memories, casting state) cannot reach users through any distribution path:

1. **Release workflow KEEP_FILES** — only 8 files + 1 directory reach `main`
2. **`package.json` `files`** — only 3 patterns enter the npm tarball
3. **`.npmignore`** — backup denylist if `files` is removed

For internal state to leak, ALL THREE layers would need to fail simultaneously, which requires deliberate sabotage, not accident.

**Ship it.**


# Decision: v0.2.0 Release Prep Complete

**By:** Kobayashi (Git & Release Engineer)
**Date:** 2026-02-09
**Status:** Ready for review

## What

v0.2.0 release is prepped but NOT triggered. The following changes are on the `wave-2` branch:

1. **`CHANGELOG.md`** — New `[0.2.0]` section documenting Wave 2, Wave 2.5 (PR #2), and Wave 3 features.
2. **`package.json`** — Version bumped from `0.1.0` to `0.2.0`.
3. **`team-docs/release-process.md`** — Internal release process documentation with mermaid diagram and line-level references to CI/CD workflows.

## Remaining Steps Before Release

1. **Merge `wave-2` → `dev`** — 4 commits ahead of dev. This is a prerequisite.
2. **Merge `dev` → `release`** — For pre-release testing.
3. **Final test run on `release`** — Confirm 92/92 tests pass.
4. **Trigger release workflow** — `workflow_dispatch` with version `0.2.0`, or push tag `v0.2.0`.

## What NOT to Change

- `squad.agent.md` version header stays at `"0.0.0-source"` — it's stamped dynamically at install time by `index.js:350-353`.
- No changes needed to `.github/workflows/` — both `ci.yml` and `release.yml` are ready.

## Who Needs to Know

- **Brady** — Approves and triggers the release.
- **Hockney** — Tests are the release gate; 92 pass, 0 fail.
- **Keaton** — Branch merges need coordination.

### Blog work decisions — McManus (2026-02-09)

**Super Bowl Weekend post edited and set to draft:**
- Rewrote `team-docs/blog/003-super-bowl-weekend.md` with tighter tone per Brady's feedback ("not feeling it").
- Removed the Seahawks-as-metaphor framing. The Super Bowl is now one line of context, not the narrative spine.
- Status changed from `published` to `draft` — Brady may still delete it. The v0.2.0 release post covers the same features.
- If Brady kills it, no content is lost. Everything in 003 appears with more depth in 004.

**v0.2.0 release blog post created:**
- `team-docs/blog/004-v020-release.md` covers the full release: Waves 2, 2.5, and 3.
- Portability (export/import) is the headline. Skills earned from real work is the differentiator. GitHub Issues Mode is the "makes it real" feature.
- Shayne Boyer (@spboyer) credited on all three of his features with PR #2 attribution.
- Includes install/upgrade/export/import commands.

**Tone guidance reinforced:**
- Celebration posts that depend on external events for energy are fragile. The work should carry the post, not the coincidence.
- "That's it. That's the post." meme closers don't match Squad's voice. Dry confidence beats internet-casual.
- Banned words list still applies: amazing, incredible, brilliant, game-changing.


# Decision: Scripted End-to-End Demo Proposal

**By:** Verbal (Prompt Engineer)
**Date:** 2026-02-09
**Requested by:** bradygaster

## What

Drafted Proposal 026: Scripted End-to-End Demos. Proposes a structured YAML format for 100% scripted demos with pre-typed input, expected output verification, timing marks, voiceover cues, and cut points. Evaluates four recording tools and recommends `vhs` by Charm. Defines five demo scenarios covering Squad's full capability surface.

## Why

Brady wants production-quality recordings where every keystroke is planned. Current Proposal 004 beat format is a strong recording blueprint but lacks keystroke-level precision, output verification, and automation paths. This proposal bridges the gap between "structured script" and "fully automated, CI-verified demo pipeline."

## Key Decisions

1. **YAML as script format** — machine-parseable for dry-run verification and automation, human-readable for Brady's cheat sheet generation
2. **`vhs` by Charm as recording tool** — declarative `.tape` files map directly to our script format, produce GIF/MP4/WebM, run in CI, version-controllable
3. **Five demo scenarios** — First Session (3min), GitHub Issues (4min), Export/Import (2min), Where Are We? (1min), PRD Intake (3min)
4. **CI smoke tests** — tape files run in GitHub Actions; broken demos fail the build
5. **Demos → Docs pipeline** — single recording session produces GIFs for README, MP4s for YouTube, clips for social

## Status

Draft — awaiting Brady's review before implementation begins.

## Proposal Reference

`team-docs/proposals/026-scripted-end-to-end-demos.md`

### 2026-02-09: Preview branch added to release pipeline
**By:** Kobayashi
**What:** Release workflow (`.github/workflows/release.yml`) split into two-phase pipeline. Phase 1 ("preview") runs tests, validates version, builds filtered product files, and pushes to a `preview` branch. Phase 2 ("ship") validates the preview branch content, pushes to main, tags, creates GitHub Release, and verifies npx resolution. Both phases are triggered via `workflow_dispatch` with an `action` choice input (preview/ship) and a version string. The `KEEP_FILES` and `KEEP_DIRS` allowlists are defined once as workflow-level env vars — both phases reference the same lists (DRY). The ship phase includes a validation step that checks every file on the preview branch against the allowlist before pushing to main. Documentation updated in `team-docs/release-process.md` with new mermaid diagram and step-by-step descriptions.
**Why:** Brady wants a human review checkpoint before anything ships. The preview branch gives him an exact mirror of what main will become — he can `git checkout preview` locally and inspect exactly what ships. This is simpler than environment protection rules or approval gates while providing the same human checkpoint. The two-phase approach in a single workflow keeps the Actions UI clean (one workflow, two actions) and avoids the complexity of cross-workflow coordination.

### 2026-02-09: User directive — Contributor list doc
**By:** Brady (via Copilot)
**What:** Create a contributor list document. Every contribution (commits, issues, PRs) is tracked with links. Squad AI members get credit for shipped features just like humans do. The README tagline should read "conceived by Brady, built by us" where "us" links to the contributor page. The contributor doc lists all human contributors with their contributions AND all squad members with their roles and responsibilities.
**Why:** User request — captured for team memory. Brady wants full attribution for both human and AI contributors.

### 2026-02-10: User directive
**By:** bradygaster (via Copilot)
**What:** Don't ask clarifying questions when the coordinator has enough context to make a decision. "Let's gear up for 0.3.0 sprint" is a clear work request — route it to Keaton, don't ask "what's the theme?" The coordinator has proposals, horizon items, and a Lead agent. Use them.
**Why:** User request — captured for team memory. Brady was asked an unnecessary question, and a platform bug auto-responded on his behalf before he could answer. Both problems stem from the same root: the coordinator should have just launched Keaton.

### 2026-02-10: User directive — model fallback resilience
**By:** bradygaster (via Copilot)
**What:** The model selection algorithm must handle cases where a chosen model isn't available to the user (wrong Copilot plan, org policy, regional availability, model deprecation). It must not "go south" — graceful fallback is required.
**Why:** User request — captured for team memory. Model availability is not uniform across Copilot contexts.

### 2026-02-10: v0.3.0 is ONE feature — proposals as GitHub Issues (consolidated)
**By:** bradygaster, Keaton
**Date:** 2026-02-10
**Supersedes:** Original Proposal 028 phased approach (GitHub-native planning as multi-phase rollout)

**What:** v0.3.0 scope is a single feature: proposals become GitHub Issues instead of markdown files on disk. This supersedes the earlier phased approach (Proposal 028: one-way push, comment pull-back, Project board sync) with a simpler model: GitHub Issues ARE the source of truth for proposals. The coordinator creates issues with `gh issue create`, agents post analysis as signed comments, the owner approves via label or comment. Team (humans + AI agents) iterates on proposals in issue comments until consensus, then triages into sprint and works via normal git practices. Filesystem remains authoritative for all other team state (decisions, history, skills). All previously planned 0.3.0 items (async comms, model selection, marketing site, CCA integration) are deferred. CCA squad adoption (originally P1) deferred to post-v0.3.0. GitHub becomes part of the product. Provider abstraction layer ensures ADO/GitLab can plug in later. GitHub integration must not break CLI conversations; the terminal experience remains primary.

**Why:** Brady's directive: laser focus on making GitHub a first-class collaboration surface. Proposals are collaborative artifacts; collaboration happens on GitHub (URLs, comments, reactions, mobile access), not in markdown files on feature branches. This unlocks external contributor participation, persistent discussion, and normal git flow. Markdown proposals are invisible; issue proposals are shareable.

### 2026-02-10: Sprint plan revised — 028 Phase 1 added to v0.3.0
**By:** Keaton
**What:** Revised Proposal 027 (v0.3.0 Sprint Plan) to include Phase 1 of Proposal 028 (GitHub-Native Team Planning) as Wave 2 item 5.9. Phase 1 is one-way push — proposals and backlog items create GitHub Issues with labels; status changes close them. 3-4h prompt engineering, no index.js changes. Assigned to Verbal + Kujan. Updated sprint totals from 28-39h to 31-43h. Updated 028 status from "Draft — Horizon" to "Phase 1 Approved for v0.3.0 ✅". Phases 2-4 remain deferred to v0.4.0+.
**Why:** Brady overrode Keaton's recommendation to defer 028 to Horizon. His directive: "go with 0.3.0. brady and shayne want this." The scope increase is minimal (3-4h of prompt engineering on top of a 28-39h sprint), the risk is low (no code changes, reuses proven `gh` CLI patterns from PR #2), and the value is immediate (planning artifacts visible on GitHub without branch checkout). When the product owner says ship it, you ship it.

### 2026-02-10: Model selection proposal consolidated
**By:** Keaton
**What:** Consolidated Proposals 024 (original draft), 024a (model catalog research), and 024b (selection algorithm) into a single definitive proposal at `team-docs/proposals/024-per-agent-model-selection.md`. Status changed from "Draft — Deferred to Horizon" to "Approved ✅" as a v0.3.0 deliverable. 024a and 024b marked as companion/reference documents.
**Why:** Brady requested a single spec for model selection. Three separate documents created review friction and ambiguity about which was authoritative. The consolidated proposal is now the single source of truth — it contains the complete design (4-layer selection, 16-model catalog, fallback resilience, coordinator prompt section, implementation plan) while 024a and 024b remain as detailed reference material for implementers who need the full 8-dimension analysis or design rationale.

### 2026-02-10: v0.3.0 sprint plan
**By:** Keaton
**What:** v0.3.0 ships three things: per-agent model selection (024 Phases 1-2), team backlog with message extraction (023 Phases 1-2), and Demo 1 scripted infrastructure (026 partial). Two waves — Intelligence (model selection + backlog capture) and Integration (Scribe merge, agent backlog access, model visibility, demo GIF, "where are we?" enrichment). 15 work items, 28-39 hours, ~8-10 days. Smaller than v0.2.0 by design.
**Why:** Compound strategy — every feature makes the next easier. Model selection improves every future agent spawn (right model = better results, lower cost). Backlog capture closes the biggest information loss in Squad today (multi-item messages lose 2 of 3 items). Demo infrastructure lets Brady show the product to the world. Cut aggressively: no agent cloning, no proactive surfacing, no model cost reporting, no Demos 2-5, no Squad DM. Ship fewer things that work perfectly. v0.2.0 gave Squad hands; v0.3.0 gives it a brain.


# Decision: GitHub API Capabilities Assessment

**Author:** Kujan
**Date:** 2026-02-10
**Proposal:** 028a (GitHub API Capabilities Assessment)
**Type:** Research Finding

## Decision

Squad agents have the tools needed for full GitHub Issues integration **right now**. GitHub Projects integration requires one manual step from Brady (`gh auth refresh -s project`).

## Key Findings

### What Works Today
1. **Issue lifecycle** — create, edit, label, comment, close, reopen — all via `gh` CLI from any `task` or `general-purpose` agent
2. **Issue reads** — MCP tools provide structured read access (list, search, get details/comments/labels/sub-issues)
3. **Label management** — full CRUD via `gh label` commands
4. **GraphQL/REST API** — `gh api` gives raw access to anything the token permits

### What's Blocked
1. **GitHub Projects** — token missing `project` scope. Fix: `gh auth refresh -s project` (one-time, 10 seconds)

### Agent Access Matrix
- `task` and `general-purpose` sub-agents **CAN** use MCP tools AND `gh` CLI — they can self-serve GitHub writes
- `explore` sub-agents have **NO** MCP or shell access — read-only local files

### Architecture Pattern
- **Reads:** Use MCP tools (structured, parseable)
- **Writes:** Use `gh` CLI (only option, fully capable)
- **No coordinator mediation needed** for Issue/Project operations

### Rate Limits
- 5,000 REST calls/hour, 5,000 GraphQL/hour, 30 searches/minute
- Normal Squad operations will use <5% of available capacity
- Only risk: Search API (30/min) during batch operations

## Action Required from Brady
1. Run `gh auth refresh -s project` to enable GitHub Projects
2. Optionally create custom labels (`proposal`, `backlog`, `squad-agent`)

## Impact
- Proposals can migrate to GitHub Issues immediately
- Backlog can migrate to GitHub Projects after scope fix
- No custom API integration needed — existing tools cover everything


# Decision: Model Catalog Expands Selection Beyond 3 Models

**Author:** Kujan  
**Date:** 2026-02-10  
**Relates to:** Proposal 024 (Per-Agent Model Selection), Sprint Item 4.1

## Decision

The model selection algorithm (sprint item 4.1) must consider all 16 available models across 3 providers, not just the 3 Anthropic models from the original Proposal 024 (Opus/Sonnet/Haiku). Brady explicitly requested broader model consideration with justifications.

## Key Points

1. **Default tier remains Anthropic** — `claude-sonnet-4.5` (standard), `claude-haiku-4.5` (fast/cheap), `claude-opus-4.6` (premium). These are the safest, best-understood models for agent workflows.

2. **OpenAI Codex variants are specialist picks for code-heavy tasks** — `gpt-5.2-codex` and `gpt-5.1-codex-max` should be considered when code generation quality is the primary dimension (Core Dev, large refactors).

3. **Gemini 3 Pro is a specialist pick for cross-provider reviews** — cognitive diversity from different training data makes it valuable for code reviews and audits.

4. **Opus 4.6 fast mode** should be the premium pick for time-sensitive decisions (reviewer gates with deadlines), not full Opus 4.6.

5. **Full research documented** in `team-docs/proposals/024a-model-catalog.md` — Verbal should use this as input data for the selection algorithm.

## Who Needs to Know

- **Verbal** — Building the selection algorithm (sprint item 4.1). This is your input data.
- **Keaton** — Sprint item 4.1 scope is broader than originally planned. No timeline impact — it's still coordinator instructions, just with a richer model table.

### 2026-02-10: Model Selection Algorithm — Fallback Chain Architecture

**By:** Verbal
**What:** Designed the model selection algorithm (Proposal 024b) with cross-provider fallback chains and a nuclear fallback (`omit model param`) that guarantees spawns never break regardless of model availability. Three tiers, cross-provider ordering, 3-retry maximum, silent fallback by default.
**Why:** Brady's directive — system must NOT break when a model is unavailable. The nuclear fallback (omitting the `model` parameter entirely) is backward-compatible with pre-model-selection behavior, meaning the worst case is degraded quality, never a broken spawn. Cross-provider chains handle both single-model and provider-wide outages. Silent fallback prevents user anxiety during transient failures.

### 2026-02-10: P0 silent success bug — detection and mitigation (consolidated)
**By:** Kujan, Verbal
**What:** ~40% of background agents completed all work but `read_agent` returned "did not produce a response." Root cause: agent's final LLM turn is a tool call, not text. Three-phase mitigation: (1) Kujan's Proposal 015 identified the bug and proposed reorder, detection, and timeout fixes. (2) Verbal strengthened all 4 spawn templates with 6-line RESPONSE ORDER instruction, structured filesystem-based silent success detection (files found → done, no files → failed), and HTML comment documenting bug rate (~7-10%), root cause, and mitigation layers. (3) `read_agent` with `wait: true, timeout: 300` catches remaining cases.
**Why:** #1 trust-destroying bug — coordinator tells user "agent failed" while work sits on disk. Mitigations reduced silent success rate from ~40% to ~7-10%. All changes are additive, non-breaking, and ship to all users via squad.agent.md.

### 2026-02-10: PR #2 — architectural review and integration (consolidated)
**By:** Keaton, Fenster
**What:** PR #2 from @spboyer added three features — GitHub Issues Mode, PRD Mode, and Human Team Members. Keaton's architectural review (Proposal 025): Request Changes with 3 must-fixes (gh CLI detection, worktree interaction note, Init Mode questions post-setup). Fenster integrated all three features into squad.agent.md with all must-fixes applied inline — gh CLI detection with MCP fallback, standard spawn template references, ceremony integration notes, worktree awareness, and Scribe/orchestration logging hooks.
**Why:** 444-line coordinator prompt change from external contributor required both architectural review (pattern consistency) and clean integration (apply review fixes during merge, not after). Features are architecturally sound and well-integrated with existing patterns.

### 2026-02-10: Skills Phases 1-2 shipped — read and earned skills (consolidated)
**By:** Verbal
**What:** Phase 1: SKILL.md format template created at `templates/skill.md`. Example skill `squad-conventions` ships as starter content. Init creates `.ai-team/skills/`. All spawn templates instruct agents to read relevant SKILL.md files before working. Skills are read-only in Phase 1. 81 tests pass. Phase 2: Agents can now write SKILL.md files from real work. Skill extraction instruction added to all spawn templates. Confidence lifecycle: low→medium→high (monotonic). Coordinator does skill-aware routing — checks `.ai-team/skills/` before spawning. `templates/skill.md` extended with optional `tools` field for MCP tool declarations. All prompt engineering, zero code changes.
**Why:** Phase 1 established format, directory structure, and agent awareness. Phase 2 closes the loop: agents earn skills from work, skills feed routing, knowledge compounds across sessions and projects. This is the self-reinforcing learning flywheel that makes Squad's skill system unique.

### 2026-02-10: Blog post conventions — contributions and celebrations (consolidated)
**By:** bradygaster, McManus
**What:** Two standing blog policies: (1) Every external contribution gets a blog post highlighting the contributor. Posts live in `team-docs/blog/`, not `docs/blog/`. File naming follows sequential numbering. Frontmatter uses `wave: null` for non-wave posts with `community` and `contribution` tags. Contributor is always the hero. Retroactive posts are acceptable. (2) Celebration posts (milestones, events) use the same `wave: null` frontmatter. Parallel narrative structure: external event first, project milestone second, connection third. Stats in tables, not prose. Tone ceiling: energy, dry humor, facts-carry-weight. No self-congratulation. Banned words apply.
**Why:** Consistent quality and tone across all team blog content. Community contributions are celebrated with visibility. McManus owns blog content.

### 2026-02-10: GitHub integration must not break CLI conversations
**By:** bradygaster (via Copilot)
**What:** Whatever we do with GitHub Issues/PR conversation support, it must not interfere with or degrade CLI conversations. CLI experience is primary. GitHub integration is additive — it cannot break what already works.
**Why:** User request — CLI is the core product surface, GitHub integration is secondary

### 2026-02-10: Marketing site — Jekyll on GitHub Pages (consolidated)
**By:** bradygaster, Keaton, McManus
**What:** Marketing site uses Jekyll on GitHub Pages with the following architecture:
- `docs/` is the Jekyll source root — no separate site directory, no content copying
- Markdown files in docs/ are the single source of truth; Jekyll renders them to HTML in place
- Existing markdown files get YAML front matter added; Jekyll renders them with custom layouts
- GitHub Pages configured to serve from `docs/` on `main` branch using classic deployment
- No separate HTML build step — GitHub Pages handles it natively
- New infrastructure files: `_config.yml`, `_layouts/`, `_includes/`, `index.md` (landing page), `assets/css/`
- Blog renders from `team-docs/blog/` via Jekyll collection; only posts with `status: published` appear
- Landing page is separate from README.md (same facts, different structure and audience)
- Everything in `team-docs/` and `.ai-team/` excluded from site except published blog posts
- All landing page copy follows the straight-facts directive
- Phase 1 is 5-8 hours, assigned to McManus (content) + Fenster (infrastructure)
- Supersedes all prior marketing site directives
**Why:** Brady's priorities are (1) no content reproduction and (2) HTML output. Jekyll-in-docs satisfies both — it renders markdown where it lives instead of copying to a build directory. Every alternative (Docusaurus, VitePress, Hugo) requires a build pipeline producing a second copy. GitHub Pages runs Jekyll natively with zero CI configuration. The `docs/` directory already exists with 16+ well-structured markdown files. Adding Jekyll infrastructure is purely additive — no product code changes, no new dependencies. McManus's content plan ensures docs render directly, blog uses status frontmatter, and the three-tier separation (docs = public site, team-docs = internal, .ai-team = runtime) has a concrete consumer.

### 2026-02-10: Public-facing content tone — facts only (consolidated)
**By:** bradygaster, McManus
**What:** Two-phase tone directive for all public-facing material:

**Phase 1 (2026-02-09):** General tone governance:
- All content must be SFW, polite, respectful, growth-attitude (permanent rule)
- Dry, funny, but not jerks — modeled after The Usual Suspects
- No self-congratulation; just report what happened
- Kindness first in all public-facing content
- Thorough logging — honest about what happened including bugs and failures

**Phase 2 (2026-02-10):** Straight facts only (stricter refinement):
- No editorial commentary, sales language, narrative framing, rhetorical hooks
- No quoting team members' reactions to features
- Every sentence states what a feature is, how it works, what it depends on, or what it replaces
- Technical specifics (numbers, model counts, API details) required
- Attribution (who built what) required
- Deferred items must state what they depend on
- Applies to all blog posts in `team-docs/blog/` and all public-facing written material
- Banned words: amazing, incredible, brilliant, game-changing. No meme closers.
- First application: Blog post `005-v030-give-it-a-brain.md` rewritten under this directive

**Why:** Brady's tone governance (02-09) established the baseline: honest, respectful, no self-congratulation. The facts-only directive (02-10) tightened this further: no editorial voice at all, just factual statements. McManus recorded and applied the detailed rules. These stack — Phase 2 is a strict subset of Phase 1.

### 2026-02-10: Async squad communication — top personal priority
**By:** bradygaster (via Copilot)
**What:** Brady wants to communicate with his squads (per repo) asynchronously — from his phone, away from the PC. One chat channel per repo. Mediums to evaluate: Telegram (existing proposal), Microsoft Teams (ideal — especially per-repo chat), Discord, others. The goal: keep squads rolling when you're not at your desk. Brady says he wants THIS more than anything.
**Why:** User request — this is the highest-priority feature request from the product owner. Changes Squad from a dev-time tool to an always-available team.

### 2026-02-10: Clean branch configuration at init time
**By:** bradygaster (via Copilot)
**What:** During Squad init, offer repo owners a config option: "Which branch(es) should squad team files never land in?" (e.g., main, release). Squad state (.ai-team/, team-docs/, proposals, etc.) is filtered out of those branches automatically — Scribe and release workflows respect the list. This is a per-repo consideration, not a global default. Supersedes the earlier clean-main directive.
**Why:** User request — repo owners should control which branches stay product-only. Generalizes the existing KEEP_FILES/KEEP_DIRS release pattern for any Squad-powered repo.

### 2026-02-10: Contributors include non-code contributions
**By:** bradygaster (via Copilot)
**What:** Contributors to Squad include people who validate patterns, test in the wild, and drive product design — not just code commits. Shayne Boyer (spboyer) is a contributor: his slidemaker repo (spboyer/slidemaker) validated PRD-to-issues flow, invented the squad: label convention, and proved the GitHub Issues Mode design. Reference his work explicitly in proposals and docs. Credit where credit is due.
**Why:** User request — contribution recognition is a team value, not just a git metric.

### 2026-02-10: `squad:` label convention standardized (consolidated)

**By:** Keaton, McManus
**Date:** 2026-02-10
**Affects:** All agents creating GitHub Issues, coordinator prompt for Phase 1 (028)

**What:** The `squad:` prefix label convention is the standard for all squad-managed GitHub Issues. Two-tier system:
1. **`squad`** — base label on every squad-managed issue. Enables `gh issue list --label squad` to show all squad work.
2. **`squad:{agent-name}`** — per-agent routing label (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`). Enables per-agent backlog filtering.

Replaces the old `squad-agent` label proposed in 028a §7.

**Origin:** Shayne Boyer invented this pattern during his slidemaker deployment (spboyer/slidemaker, issues #1–#9). He needed per-agent filtering in GitHub's native UI and created the prefix convention independently. Validated in production before the Squad team designed it.

**Issue template:** Squad-generated issues must follow user story format with agent metadata (persona, capability, benefit, acceptance criteria, squad member, primary work, dependencies).

**Why:** Uses GitHub's existing label infrastructure — no external tooling. Simple enough to document in one sentence. Production-validated by an external user. Keaton standardized the convention; McManus recommended documenting it and auto-creating labels at GitHub Issues Mode init.

**Next:** Document in Squad's GitHub Issues Mode docs. Credit Shayne Boyer as origin. Consider auto-creating labels on init.

### 2026-02-10: Async comms strategy — two-tier MVP with CCA-first approach
**By:** Kujan (Copilot SDK Expert)
**What:** Proposal 030 recommends a two-tier async communication MVP for 0.3.0: (1) CCA-as-squad-member via `squad.agent.md` CCA guidance section — 2-4h prompt engineering, zero new infrastructure, gives Brady async work assignment from phone via GitHub Issues. (2) Telegram bridge via Copilot SDK — 8-16h new code, gives conversational async chat, conditional on SDK nested session spike passing. CCA is the floor, Telegram is the ceiling. Ship both, CCA first. Connector ranking: CCA+Issues > Telegram > Discord > Discussions > Teams > Slack.
**Why:** Brady un-deferred async comms to TOP PRIORITY for 0.3.0. CCA angle didn't exist in the original Proposal 017 and changes the entire strategy — it gives async comms through GitHub's native surfaces with near-zero build cost. Supersedes Proposal 017 feasibility assessment.

### 2026-02-10: Label taxonomy drives GitHub-native Squad workflow (consolidated)
**By:** bradygaster, Verbal
**Date:** 2026-02-10
**Source:** Brady directive + Proposal 032c (Verbal)

**What:** Labels are the workflow engine for GitHub-native Squad. Complete taxonomy designed: 39 labels across 7 namespaces: status (8: draft/reviewing/approved/implementing/done/blocked/shelved/superseded), type (8), priority (4: p0-p3), squad routing (3 base + per-agent), automation (6: cca-eligible, needs-review, needs-decomposition, stale, good-first-issue, help-wanted), migration/provenance (4: migrated:from-markdown, era:v0.1/v0.2/v0.3). Status labels are mutually exclusive and drive a formal state machine with defined transitions. GitHub Milestones used for sprints (not labels). Every status transition, routing decision, and lifecycle event is label-driven. Migrated proposals must reflect REAL historical state. No fake/placeholder states. Full migration mapping for all 44 existing proposals. `squad init` creates all labels idempotently via `gh label create --force`. Provider abstraction maps to ADO (states + tags), GitLab (scoped labels with `::`). Labels are the API surface that Actions, CCA, and humans all share.

**Why:** Brady's directive: labels drive the ENTIRE workflow, and states must be REAL. This taxonomy is the foundation for all GitHub-native automation in v0.3.0.

### 2026-02-10: Microsoft Teams is the ideal async comms platform
**By:** bradygaster (via Copilot)
**What:** Brady's preferred async comms platform is Microsoft Teams. Per-repo channels, already on every device, already where the org lives. Telegram is fallback, Teams is the target.
**Why:** User request — Teams preference captured for connector prioritization in Proposal 030.

### 1. Provider abstraction is prompt-level only — no JavaScript abstraction in index.js

The coordinator is a prompt that executes shell commands. The abstraction is command templates in `squad.agent.md`, not a JavaScript module. `index.js` stays an installer. Rationale: the coordinator can't import JS modules, adding runtime provider logic to the CLI would fundamentally change its architecture, and prompt-level substitution is what LLMs do well.

### 2. `## Issue Source` in team.md becomes `## Platform`

The new `## Platform` section is a superset — covers provider name, repository, connection date, CLI tool, and auth status. Replaces the GitHub-specific `## Issue Source`. Backward compatible: if `## Platform` is missing, the coordinator falls back to asking.

### 3. Provider detection via git remote URL parsing at init time (informational only)

The CLI detects the provider from `git remote get-url origin` and displays it during init. This is informational — the actual connection is established by the coordinator at runtime. No new dependencies; uses `child_process.execSync`.

### 4. Capability negotiation is required for each provider

Each provider declares its capabilities (issues, PRs, labels, labelColors, reactions, milestones, subIssues, search, webhooks). The coordinator checks capabilities before using optional operations. This prevents hard failures when ADO doesn't support reactions or GitLab doesn't support sub-issues.

### 5. Day 1 = GitHub only, Day 2 providers are additive

GitHub provider ships with v0.3.0 (reorganization of existing commands, ~9h). ADO (~23h) and GitLab (~12h) are deferred until demand signal. The architecture supports adding providers without refactoring.

### 6. index.js changes are minimal — ~15 lines for git remote detection

No new subcommands. No provider modules. No auth management. The only code change is an informational git remote detection message in the init output.

### 7. Fallback to local mode when no provider is available

If no platform CLI is installed or authenticated, Squad works in "local mode" — proposals as markdown files, no issue tracking, no PRs. This is the current behavior and serves as graceful degradation.

### 2026-02-10: Proposal 032 expanded with Migration Plan, Actions Automation, Working in the Open
**By:** Keaton
**Requested by:** bradygaster
**What:** Three new sections appended to Proposal 032:

1. **Section 11 — Proposal Migration Plan:** All 42 existing markdown proposals classified into 4 categories (Shipped/Active/Superseded/Deferred) with three-wave migration to GitHub Issues. Active proposals migrate first, shipped as closed issues second, superseded+deferred last. Script-assisted migration with agent review. `team-docs/proposals/` gets redirect README post-migration.

2. **Section 12 — GitHub Actions Automation:** 7 workflows designed: proposal-bot, proposal-consensus, proposal-decompose, proposal-stale, agent-comment, proposal-lint, cca-assign. Core workflows ship to consumer repos via `squad init`; CCA-specific workflows are opt-in. Actions handle mechanical lifecycle transitions, reducing coordinator prompt load.

3. **Section 13 — Working in the Open:** Squad's own development moves to public GitHub Issues. Collaborative artifacts (proposals, PRs, issues) are public; team state (history, decisions, skills, charters) stays private and gitignored. Slidemaker pattern is the contribution template.

**Why:** Brady's three directives — (1) iterate on GitHub-native proposals as THE 0.3.0 feature, (2) migrate all existing proposals from markdown to issues, (3) factor in GitHub Actions for automation. This is the strategic expansion of 032 from "proposals as issues" to "the entire proposal ecosystem runs on GitHub."

### 2026-02-10: Proposal migration uses three-wave approach
**By:** Keaton
**What:** Active proposals (12) migrate first as open issues. Shipped proposals (18) migrate second as closed issues with `status:shipped`. Superseded (3) and Deferred (5) proposals migrate last as closed issues. 017 DM proposals consolidated into single open issue per Brady's un-deferral.
**Why:** Active work gets immediate benefit from issue-based collaboration. Historical proposals need searchability but don't need to clutter the open issues list.

### 2026-02-10: team-docs/proposals/ directory gets redirect README after migration
**By:** Keaton
**What:** After all proposals are migrated to GitHub Issues, replace proposal files with a single `team-docs/proposals/README.md` redirecting to the issues list. Archive branch (`proposals-archive`) created in v0.4.0 for full history preservation.
**Why:** Lowest-risk transition — existing links still resolve, anyone landing in the directory gets redirected. Full cleanup deferred to avoid disruption during v0.3.0.

### 2026-02-10: GitHub Actions automation for proposal lifecycle (consolidated)
**By:** Keaton, Kujan
**Date:** 2026-02-10
**Source:** Proposal 032 Section 12 (Keaton), Proposal 032b (Kujan)

**What:** 7 GitHub Actions workflows designed for the proposal system. Workflows ship as opt-in templates in `templates/workflows/`, installed during `squad init` (not bundled automatically). Phase 1 (v0.3.0) ships three standalone workflows: `squad-proposal-lifecycle.yml` (label transitions), `squad-consensus.yml` (approval tracking), `squad-stale-proposals.yml` (stale cleanup). Phase 2 (v0.4.0) adds CCA Dispatch, Sprint Planner, and Daily Standup after CCA governance is validated per Proposal 031. Agent-comment workflow is Squad-internal only. Proposal-lint ships by default but can be removed.

**Why:** Actions handle mechanical lifecycle transitions (label changes, stale cleanup, CCA assignment), freeing the coordinator prompt to focus on orchestration. Standalone workflows are simpler to understand and customize than reusable workflows or composite actions. Workflows have repo-specific permissions and users must audit them before enabling. Template-based installation is the right pattern since npm has no convention for `.github/workflows/` files.

### 2026-02-10: Working in the open — collaborative artifacts public, team state private
**By:** Keaton
**What:** Squad's development publicly visible via GitHub Issues. Proposals, agent analysis, design discussions, approvals are all public. `.ai-team/` remains gitignored. Terminal sessions remain ephemeral. The boundary: GitHub-hosted artifacts are public, filesystem team state is private.
**Why:** Brady's directive to "work in the open as a squad." Validates the slidemaker contribution model (open issue → agents work it) and demonstrates Squad's capabilities by using them publicly.

### 2026-02-10: Octomember deferred — coordinator handles git platform ops
**By:** Keaton
**What:** No dedicated "Octomember" agent for git platform operations in v0.3.0. The coordinator handles issue creation, comment posting, and label management directly via `gh` CLI. If built later, the name is Redfoot (The Usual Suspects universe).
**Why:** Git platform operations are coordinator-mediated (event-driven, not cross-cutting). Adding an agent would add latency, context overhead (~4%), and a new coordination surface for zero benefit. Scribe exists because memory management is cross-cutting. Git ops are not. Revisit if coordinator prompt bloat becomes a problem.

### 2026-02-10: Agent comments on issues use signature blocks, not GitHub bot accounts
**By:** Keaton
**What:** Agent analysis posted as issue comments is signed with emoji + name + role header and "Posted by Squad" footer. No separate GitHub accounts or bot registration.
**Why:** Bot accounts require GitHub App registration, OAuth, and per-installation tokens — too much infrastructure for v0.3.0. Signature blocks are simple, reliable, and clearly distinguish AI from human comments. If Squad gets GitHub App status later, agent comments could come from a bot account with GitHub's "bot" badge.

# Decision: v0.3.0 Priority Reorder — DM is P0, GitHub Integration is P1

**By:** Keaton (per Brady's directive)  
**Date:** 2026-02-10  
**Scope:** v0.3.0 sprint plan (Proposal 027)

## What Changed

Brady reordered v0.3.0 priorities. The sprint plan has been fundamentally restructured:

1. **Squad DM (async comms) is now P0 / Wave 1.** Previously deferred to Horizon. Three existing 017 proposals provide the design foundation. Copilot SDK spike is the go/no-go gate.

2. **GitHub Issues/PRs + CCA adoption is P1 / Wave 2.** Expanded from "Phase 1 one-way push" to include Issues as work input and CCA governance. Validated by spboyer/slidemaker.

3. **Model selection moved to Wave 3.** Was Wave 1 centerpiece. Still ships in v0.3.0 but at lower priority. Explicit relief valve — can slip to 0.4.0 if DM + GitHub run long.

4. **Two new work streams added:** CCA adoption (Squad as governance layer for Copilot Coding Agent) and clean branch configuration (protect production branches from .ai-team/).

5. **Sprint size roughly doubled:** From 31-43h to 68-99h across 3 waves instead of 2.

## What Every Agent Needs to Know

- **Wave 1 (Reach):** Kujan runs the SDK spike first. Everything else depends on it. Fenster + Kujan build the Telegram bridge. Verbal designs the DM output mode.
- **Wave 2 (Integration):** Verbal + Kujan handle GitHub Issue integration. Keaton + Verbal handle CCA discovery. Fenster handles clean branch config.
- **Wave 3 (Intelligence):** Model selection, marketing site, demos, backlog intelligence. This is the relief valve — if scope pressure hits, Wave 3 items defer to 0.4.0.
- **CLI is still primary.** All GitHub/DM integration is additive. Nothing breaks the terminal experience.

## Why This Is the Right Call

Brady is the user. DM is the feature that makes Squad irreplaceable. GitHub integration makes Squad visible where work already happens. Model selection makes Squad smarter — but smarter doesn't matter if nobody can reach it.

### 2026-02-10: CCA governance must be self-contained in squad.agent.md
**By:** Kujan
**What:** All CCA governance instructions must live inside `.github/agents/squad.agent.md`, not reference `.ai-team/` files. Because `.ai-team/` is gitignored (team decision, 2026-02-08), CCA running in GitHub Actions cannot read `.ai-team/decisions.md` or any other Squad state files. The CCA Guidance section in Proposal 030 Appendix A needs revision — it currently tells CCA to "Read `.ai-team/decisions.md`" which will fail. Embed all critical conventions directly in the CCA Guidance section instead.
**Why:** This was discovered while designing the E2E test (Proposal 031). The planted-decision test originally relied on CCA reading `.ai-team/decisions.md`, but the gitignore constraint makes that impossible. This changes the CCA integration model from "CCA reads full Squad state" to "CCA reads a self-contained governance summary in squad.agent.md." Still viable, but different from what Proposal 030 assumed.

### 2026-02-10: Community issue responses use substantive technical detail, not placeholders
**By:** Keaton
**What:** When responding to community feature requests, Squad agents post substantive comments that reference specific internal design work (proposal numbers, architectural decisions, timelines). Comments follow Brady's tone directive: straight facts, no hype, no editorial voice. Signature block format: emoji + name + role, footer linking to Squad repo.
**Why:** Community contributors who take time to write detailed feature requests deserve detailed responses showing the team has thought deeply about their suggestions. Vague "great idea" replies waste the community's trust. The team's proposal-first workflow gives us real technical detail to share. This also serves as external validation of the product direction.


# Decision Inbox: Project Boards (033)

**From:** Keaton (Lead)  
**Date:** 2026-02-10  
**Re:** Issue #6 — GitHub Project Boards for Squad

## Decisions Made

### 033e: 5-column board, mapped to label taxonomy
**What:** Default columns are Backlog, Ready, In Progress, Blocked, Done — mapped to `status:*` labels.  
**Why:** The issue proposes 3 columns (Todo / In Progress / Done). Our label taxonomy has 8 statuses. 5 columns cover the active states. `status:shelved` and `status:superseded` are closed/archived and don't need board representation.  
**Reversible:** Yes — column configuration is a future customization target.

### 033f: No Octomember for board operations
**What:** The coordinator handles all board operations directly. No new agent (Redfoot) for platform ops.  
**Why:** Consistent with 032 §3 decision. Board operations are coordinator-mediated, not cross-cutting. The prompt growth is within context budget (~15% growth estimated). Revisit if board operations push coordinator beyond 2% context overhead.  
**Reversible:** Yes — Redfoot design exists if needed.

## Pending Decisions (for Brady)

### 033-P1: Version targeting
**Question:** Should project boards remain v0.4.0 or does community interest (Issue #6, +1 reaction) warrant pulling into v0.3.0?  
**Keaton's recommendation:** Keep v0.4.0. Ship labels/issues first.

## Work Decomposition Summary

| WI | Title | Agent | Size | Priority | Dependencies |
|----|-------|-------|------|----------|-------------|
| WI-1 | GraphQL Command Templates | Fenster | M (4-6h) | P2 | 032a |
| WI-2 | Provider Abstraction — Boards | Fenster | S (2-3h) | P2 | WI-1 |
| WI-3 | Board Initialization Flow | Verbal | M (3-5h) | P2 | WI-1 |
| WI-4 | Label-to-Board Sync Workflow | Fenster | M (4-6h) | P2 | WI-1, WI-3 |
| WI-5 | Board Query & Display | Verbal | S (2-3h) | P3 | WI-1, WI-3 |
| WI-6 | Documentation & Skill | McManus | S (2-3h) | P3 | WI-3, WI-5 |
| **Total** | | **3 agents** | **17-26h** | | |


# Decision: Projects V2 Integration Pattern

**Proposed by:** Kujan  
**Date:** 2026-02-10  
**Context:** Issue #6 (londospark), Proposal 033a

## Decisions

### 4. Zero MCP server coverage — `gh` CLI is the sole channel
- Verified: 0/17 MCP tools support any Projects V2 operation
- All read + write operations go through `gh project *` commands
- If MCP adds Projects V2 tools later, they supplement but don't replace `gh` CLI

### 5. Provider abstraction uses prompt-level command templates (per 032a)
- GitHub: `gh project *`
- Azure DevOps: `az boards *` (boards are built-in, no create step needed)
- GitLab: Label-driven boards (existing label workflow = the board)
- No JS interface needed — coordinator prompt contains provider-specific command templates

### 2026-02-11: Project boards target v0.4.0 (consolidated)
**By:** Keaton, Kujan
**What:** Project board support defers to v0.4.0. v0.3.0 scope remains GitHub-native proposals (032). Projects V2 boards depend on Issue integration being solid first. Token scope (`gh auth refresh -s project`) is a prerequisite not yet run.
**Why:** Boards are a dashboard layer on top of the label/issue infrastructure being built in v0.3.0. Shipping boards before labels are stable puts the cart before the horse. Brady's directive: v0.3.0 is ONE feature (proposals as GitHub Issues). Reversible — Brady can pull forward if community demand warrants.

### 2026-02-11: Board operations use `gh` CLI, not npm packages (consolidated)
**By:** Keaton, Kujan
**What:** All Projects V2 operations go through `gh` CLI commands. No npm dependencies added. Keaton initially specified `gh api graphql` for raw API calls; Kujan refined to `gh project *` subcommands which wrap GraphQL behind ergonomic flags. Both agree: zero npm dependencies for board operations.
**Why:** Squad is zero-dependency. The coordinator is a prompt that executes shell commands, not a runtime that imports modules. Adding `graphql-request` or `@octokit/graphql` would be the first `node_modules` entry — a fundamental architectural change for a convenience gain. `gh` CLI handles auth, rate limiting, and the GraphQL protocol. Reversible, but the bar should be high.

### 2026-02-11: Board integration is opt-in, not automatic (consolidated)
**By:** Keaton, Kujan
**What:** No automatic board creation on `squad init` or first issue. User explicitly requests board setup. Kujan adds: implement as a skill (`github-project-boards`), not code in `index.js`. Graceful degradation when `project` scope is missing — agents detect scope at runtime via `gh auth status`.
**Why:** Not every repo wants a project board. Surprise side effects erode trust. The coordinator pattern is: user requests, coordinator executes. Skill-based implementation keeps it modular.

### 2026-02-11: Labels are authoritative, boards are projections (consolidated)
**By:** Keaton, Kujan
**What:** Label changes drive board column positions. Board UI changes do NOT propagate back to labels. One-way sync: labels -> board. Label changes trigger Actions workflows; board column moves do not. Board mirrors label state but is not the source of truth. Aligns with existing `label-driven-workflow` skill anti-pattern guidance.
**Why:** Two-way sync creates state conflicts. Labels are the state machine (032c). If someone moves a card on the board, it creates a label/board mismatch — but the label is correct. Reverse sync would require conflict resolution not yet designed. Two-way sync is a future consideration, not a v0.4.0 concern.

### 2026-02-11: Blog post for first video coverage
**By:** McManus
**What:** Wrote blog post 007 acknowledging Jeff Fritz's Squad video — first public video coverage
**Why:** Community milestones get documented. This is the first time Squad appeared on video to an external audience.

### 2026-02-11: Fritz video analysis — messaging insights and community reference

**By:** McManus
**What:** Analysis of Jeff Fritz's Squad demo video with messaging takeaways, product signal, and draft community reference
**Why:** External community coverage is a key signal — captures what resonates with real developers seeing Squad for the first time

---

## 1. Messaging Insights — What Jeff Highlighted

#### What resonated (things Jeff chose to emphasize)

1. **"These are all markdown files"** — Jeff called this out twice. The fact that Squad is markdown files, not proprietary config, clearly registers as a trust signal. This is something we should lead with more prominently in docs. Developers distrust magic; markdown is the opposite of magic.

2. **Design review ceremony** — Jeff narrated the delegation to Banner, Romanoff, and Barton (his Avengers cast) and specifically pointed out the design review step. The ceremony — agents planning before coding — landed as a differentiator, not overhead.

3. **131 tests in one shot** — This was Jeff's proof point. He mentioned the test count, the build verification, and the fact it happened from a single prompt. Quantifiable output from a single interaction is the strongest demo beat.

4. **Everything saved in Markdown and JSON** — Jeff showed the `.ai-team/` folder and explicitly told viewers to "spend some time taking a look at what was decided." The transparency of decisions and logs registered as a feature, not implementation detail.

5. **Cast system worked naturally** — Jeff used the Avengers theme. He referenced Banner, Romanoff, and Barton by name without explaining the cast system. It just worked. This validates the design decision to make casting feel native, not gimmicky.

6. **Sprint planning and iteration** — Jeff described asking the squad to "design and figure out what the sprints should be" and then working through them with GitHub Issues and PRs. This positions Squad as a workflow tool, not a one-shot generator.

7. **"All of our code... and the prompts... are saved in this folder"** — Team knowledge persistence landed. Jeff framed it as collaborative — "all members of our development team get access to the same agents."

#### What Jeff skipped or didn't mention

1. **Install process** — No `npx` command shown or discussed. The demo started post-install. We don't know if install was smooth or if Jeff edited it out.

2. **Parallel execution** — Jeff didn't explicitly call out agents running in parallel, though the delegation was visible. Our README leads with this; it may not be as visible in practice as we think.

3. **Skills system, tiered response modes, export/import** — None of the v0.2.0 features were mentioned. Jeff's demo was focused on core loop: prompt → team → output.

4. **Context window efficiency** — No mention of the architecture that keeps agents in separate context windows. This is an engineering differentiator we care about; end users may not.

5. **Scribe / decision logging mechanics** — Jeff showed the folder but didn't explain the Scribe role or how decisions propagate. The output was visible; the mechanism was invisible.

6. **Reviewer protocol / rejection flow** — Not shown. The demo was a greenfield build, not an iteration cycle.

#### What would strengthen the story

- **"Markdown, not magic"** could be a documentation header or tagline for the architecture section. Jeff's emphasis on "these are markdown files" was the strongest trust-building moment in the video.
- **Test count as proof** — Sample prompts or docs could suggest users check test output as a validation step. Quantifiable results make demos land.
- **Cast system deserves a one-liner in Quick Start** — Jeff used it without explanation. A single sentence ("Your team gets persistent names from a thematic cast — Avengers, heist crews, whatever fits") would give new users the same confidence.

---

## 2. Product Signal

#### What worked well

| Signal | Evidence |
|--------|----------|
| Single-prompt to working app | Jeff went from one prompt to a running text adventure with 131 tests |
| Cast system adoption | Jeff chose Avengers, referenced agents by cast name naturally |
| Design review ceremony | Jeff highlighted it as a feature, not friction |
| Transparent artifacts | Jeff browsed `.ai-team/` and found the decision log useful |
| Multi-session continuity | Jeff described agents "learning, growing, and discovering" across sessions |

#### Potential friction points

| Area | Observation |
|------|-------------|
| Install visibility | Install was not shown — unclear if it was trivial or edited out for time |
| Parallel execution UX | Delegation was shown but parallelism wasn't called out — the visual signal may need strengthening |
| Feature discovery | v0.2.0 features (skills, export, triage) were not discovered or used — these may need better surfacing |
| Iteration loop | Jeff mentioned sprint planning but didn't demo the iteration → review → revision cycle — this is a gap in demo coverage, not necessarily a product gap |

#### Opportunities

1. **Cyberpunk text adventure as a sample prompt** — Jeff's prompt was detailed and produced a strong demo. A version of this prompt could go in `sample-prompts.md` as a "build something fun in 5 minutes" entry.
2. **"What just happened?" summary** — Jeff had to scroll back to narrate what the agents did. A post-run summary (already partially handled by the coordinator) could be more prominent.
3. **Video/demo section in README** — Jeff's video is the first external demo of Squad. A community section in the README linking to it gives social proof.

---

## 3. Draft Community Reference (for README or docs)

**Proposed addition — a "Community" or "In the Wild" section for the README:**

```markdown
## Community

| What | Who | Link |
|------|-----|------|
| "Introducing your AI Dev Team Squad with GitHub Copilot" — full demo building a cyberpunk text adventure with an Avengers-themed squad | Jeff Fritz ([@csharpfritz](https://github.com/csharpfritz)) | [Watch on YouTube](https://www.youtube.com/watch?v=TXcL-te7ByY) |
```

**Alternate inline version (if a table feels heavy):**

```markdown
## Community

- 📺 [Introducing your AI Dev Team Squad with GitHub Copilot](https://www.youtube.com/watch?v=TXcL-te7ByY) — Jeff Fritz ([@csharpfritz](https://github.com/csharpfritz)) demos Squad building a cyberpunk text adventure with a custom Avengers cast. Covers team setup, design review, automated testing, and the `.ai-team/` knowledge folder.
```

---

## 4. Recommendations

1. **Add a Community section to the README** with Jeff's video as the first entry. Place it after "Status" and before any footer. Use the inline format above.
2. **Consider adding Jeff's text adventure prompt** (or a variation) to `sample-prompts.md` — it's a strong "wow" demo.
3. **Surface the cast system earlier in docs** — Jeff's natural use of Avengers names validates that casting is intuitive, but new users reading the README don't encounter it until deep in the page.
4. **No changes to product roadmap needed** — Jeff's demo validated the core loop. Feature gaps he didn't surface (skills, export) are discoverable features, not blockers.
### 2026-02-11: User directive — model selection cost optimization
**By:** Brady (via Copilot)
**What:** Agents should pick their own models. Optimize for cost first unless the agent is writing code — in that case, optimize for quality and accuracy. Scribe and non-coding agents should use free or less-expensive models. When in doubt, cost over quality unless code is being written.
**Why:** User request — captured for team memory. This is the governing principle for the per-agent model selection feature (Proposal 024).

### 2026-02-11: Per-agent model selection implemented
**By:** Verbal
**What:** Added model selection to coordinator instructions, updated all spawn templates, added ## Model to charters and registry. Brady's cost-first directive applied: agents that write code use sonnet (standard), agents that don't write code use haiku (fast), mixed agents use "auto" (coordinator decides per-task), Redfoot uses opus (vision required).
**Why:** Brady's directive: cost-first unless writing code. Shipped as part of v0.3.0.



# Keaton — Universe Expansion Proposal (2026-02-10)

## Problem

Brady's direction: "People think we need more universes." Current allowlist (14 universes) has gaps:
- **Geographic skew**: 93% American (zero British, zero anime, zero international)
- **Genre imbalance**: Crime/action/thriller dominate (8/14); missing fantasy, sci-fi ensemble, modern drama
- **Size distribution weakness**: 7 small, 4 medium, 3 large — doesn't serve 4-6 person teams well; few options for large squads
- **Developer resonance**: Strong for crime/action fans, but gaps for fantasy, anime, British comedy, corporate drama audiences

## Solution

**Add 6 universes, reaching 20 total.** This hits the quality-over-quantity target (18-22 range) while strategically filling gaps without overcrowding the selection algorithm.

### New Universes

| Universe | Capacity | Rationale |
|----------|----------|-----------|
| **Monty Python** | 9 | Small ensemble (6+), British comedy, Python → developers immediately recognize the joke, distinctive last names work as identifiers (Idle, Palin, Gilliam, Chapman, Jones, Cleese) |
| **Doctor Who** | 16 | Sci-fi TV with deep bench, British sensibility, ensemble-driven (companions + antagonists), globally recognized, medium capacity |
| **Attack on Titan** | 12 | Anime; no anime in current allowlist; high developer/tech community resonance; ensemble leadership dynamics; distinct names (Levi, Eren, Hanji, Arwin, Zeke, Reiner, Bertholdt, Annie, Historia, Ymir, Falco, Porco) |
| **The Lord of the Rings** | 14 | Fantasy completely missing; iconic ensemble (Fellowship + extended); legendary names work perfectly as team identifiers (Aragorn, Legolas, Gandalf, Gimli, Boromir, Denethor, Elrond, Galadriel, Saruman, Sauron); medium-large capacity |
| **Succession** | 10 | Modern corporate drama; strategic/hostile-takeover dynamics (complements Ocean's Eleven in spirit); ensemble dysfunction; small-medium capacity; names (Logan, Kendall, Siobhan, Roman, Connor, Matsson, Wambsgans, Pierce) |
| **Severance** | 8 | Sci-fi thriller; small team; high appeal to developers/creatives; dystopian competence theme; names (Mark, Harmony, Tramell, James, Ricken, Burt, Devon, Helly) |

### Coverage Improvements

**Geography:**
- British: Monty Python, Doctor Who (2 new)
- Japanese: Attack on Titan (1 new)
- American: 15/20 (still dominant but not overwhelming)

**Genre:**
- Crime/Thriller/Action: 8/20 (was 8/14 = 57%, now 40%)
- Sci-Fi: 6/20 (was 3/14 = 21%, now 30%) — added Doctor Who, Severance
- Fantasy: 1/20 (was 0/14 = 0%, now 5%)
- Comedy: 2/20 (was 2/14 = 14%, improved breadth with Monty Python)
- Drama/Character ensemble: 3/20 (Succession, Lost, Arrested Dev)
- Animation: 1/20 (Attack on Titan adds anime; was only Simpsons)

**Size Distribution:**
- Small (6–10): 9 universes (Suspects, Dogs, Alien, Goonies, Monty Python, Firefly, Severance, Matrix, Succession)
- Medium (11–18): 6 universes (Star Wars, Breaking Bad, Doctor Who, Attack on Titan, LOTR, Lost, DC)
- Large (19–25): 5 universes (Ocean's Eleven, Arrested Dev, Simpsons, MCU, [room for future])

**Capacity headroom**: 245 total slots (vs. 185 current) — better distribution for growth.

## Trade-offs

**Keeping all 14 original universes** (not removing any):
- ✅ No disruption to existing team continuity
- ✅ Already proven resonance in Squad history
- ✅ Overflow algorithm depends on LRU; removals would break continuity
- ❌ Total of 20 is at upper end of "sweet spot" (18–22)

**Selection algorithm remains unchanged:**
- ✅ No new implementation burden
- ✅ Scoring logic (size_fit, shape_fit, resonance, LRU) works for new universes
- ❌ Algorithm doesn't auto-diversify; coordinator must seed early assignments with variety

**No universe constraints for new entries** (to keep initialization simple):
- ✅ Reduces policy friction
- ✅ Full rosters available for each
- ❌ Some teams might over-represent (e.g., 20 Simpsons characters spread across multiple squads)

## Alternatives Considered

**Option A: Remove weak/low-resonance universes instead**
- ❌ Breaks existing teams' casting history
- ❌ Violates "no retroactive name changes" principle
- ❌ Loses proven character pools

**Option B: Expand existing universes' capacity** (e.g., Matrix from 10→15)
- ❌ Dilutes quality (requires more peripheral characters)
- ❌ Doesn't address genre/geography gaps
- ❌ Single-universe overuse reduces variety signal

**Option C: Go to 25+ universes**
- ❌ Selection algorithm becomes harder to reason about
- ❌ Coordinator context bloat (policy.json larger)
- ❌ Developer experience: too many options → analysis paralysis

**Option D: Add only 2-3 universes (minimal expansion)**
- ❌ Leaves key gaps (no anime, no fantasy, limited British)
- ❌ Doesn't address size distribution weakness
- ✅ Lower implementation surface, but insufficient for Brady's "people think we need more"

## Success Criteria

1. **Update artifacts**: policy.json, squad.agent.md, registry.json all consistent ✅
2. **All 6 new universes have ≥6 distinct usable character names** ✅
3. **Coverage vector improved**: Genre diversity ≥30% sci-fi, 1 fantasy, 2+ British ✅
4. **No changes to existing universes or constraints** ✅
5. **Size distribution more balanced**: small/medium/large spread ✅
6. **First new assignment works** (next squad creation uses balanced selection from new pool) — TBD in future session

## Implementation

1. ✅ Updated `.ai-team/casting/policy.json`: added 6 universes + capacity
2. ✅ Updated `.github/agents/squad.agent.md`: Universe Allowlist table
3. ✅ Updated `.ai-team/agents/keaton/history.md`: logged learnings
4. ✅ Wrote SKILL.md: universe selection criteria reusable pattern

## Approval

- **Proposed by**: Keaton (Lead)
- **Requested by**: Brady (bradygaster)
- **Status**: ✅ IMPLEMENTED (2026-02-10)
- **No further review required**: Policy change only; no code impact



### 2026-02-11: Rename "sprints" to "milestones"
**By:** Brady (via Copilot), inspired by Jeff Fritz
**What:** Squad uses "milestones" instead of "sprints" for release planning units. Waves are feature-gated milestones, not time-boxed sprints. This aligns with GitHub's native Milestones feature and more accurately describes how Squad ships — when the work is done, not when a timer expires.
**Why:** Fritz suggested it during his video coverage. It's more accurate: Squad doesn't enforce time-boxed cadence. GitHub Milestones are a native platform concept we can integrate with. "Sprint" implies Scrum process overhead that doesn't exist here.

### 2026-02-11: Copilot Client Parity Gap — Issue #10

**Date:** 2026-02-11  
**Owner:** Keaton  
**Status:** Approved ✅  
**Related Issues:** #9 (community question), #10 (tracking issue)

**Problem:** Squad was designed for and tested on the **GitHub Copilot CLI**. The architecture assumes certain CLI-specific tools exist: `task` tool (sub-agent spawning), `/delegate` slash command (background work + PR creation), `/tasks` slash command (background agent management), per-agent model selection parameter. These tools either don't exist or have different names in VS Code, JetBrains, and GitHub.com. Squad's feature set degrades on non-CLI surfaces.

**Root Cause:** Tool naming is API surface. Squad's orchestration layer (markdown + prompts) is platform-agnostic. The *tooling* assumptions are not.

**Solution:** File Issue #10 as a **P1 tracking issue** to: (1) Systematically validate Squad's tool usage across all Copilot surfaces (CLI, VS Code, JetBrains, GitHub.com), (2) Identify which patterns work where and which degrade, (3) Define fallback strategies (if `task` doesn't exist, what's Plan B?), (4) Determine if graceful degradation is acceptable or if we need cross-client abstraction.

**Architecture Implication:** Future proposals that assume sub-agent spawning (like Proposal 032) need a **"Fallback" section** documenting what happens when `task` is unavailable. Examples: GitHub Actions workflow (higher latency, async via comment loop), Deferred to v0.4.0 (feature requires CLI), Graceful no-op (feature silently disabled on non-CLI).

**Trade-offs:** Short-term: Document the gap, don't try to fix all clients in v0.3.0. Long-term: Cross-client parity becomes a requirement; may need platform abstraction layer or client-specific prompts. Risk: If VS Code lacks critical tooling, Squad's value prop collapses on that surface.

**Rationale:** (1) Transparency > overpromising — community question (#9) revealed undocumented limitation. (2) Data-driven fallback — don't guess at cross-client behavior; test it. (3) Proposal precedent — Proposals 032+ will assume this gap is documented and fallback strategies are defined.

**Success Criteria:** [x] Respond to Issue #9 with honest explanation. [x] File Issue #10 as P1 tracking. [ ] Validate Squad behavior on VS Code. [ ] Validate Squad behavior on JetBrains. [ ] Validate Squad behavior on GitHub.com. [ ] Define fallback strategies per client. [ ] Update squad.agent.md with compatibility matrix.

**Next Steps:** (1) Brady reviews Issue #10 and prioritizes cross-client validation. (2) Verbal or future agent runs spike: "Test Squad on VS Code with runSubagent". (3) Results inform Proposal 034+ (cross-client compatibility layer, if needed).



### 2026-02-11: Discord is the v0.3.0 MVP messaging connector for Squad DM
**By:** Keaton
**What:** Discord replaces Telegram as the first rich messaging connector for Squad DM. The v0.3.0 delivery is three tiers: (1) CCA-as-squad-member via GitHub Issues (2-4h, prompt-only, unchanged), (1b) Discord webhook notifications for one-way alerts (30 min, new), (2) Discord conversational bridge via Copilot SDK (8-16h, replaces Telegram bridge). Teams is the second connector target for v0.4.0. Telegram is deprioritized per Brady's explicit preference.
**Why:** Brady prefers Discord over Telegram. The team analysis confirms this is the right call on multiple axes:
- **Technical (Kujan):** Build cost delta is ~30-70 LOC (~1 hour) over Telegram. Discord's `discord.js` library is mature. Channel-per-repo is native (no workarounds). Bot setup is straightforward via Discord Developer Portal.
- **Experience (Verbal):** Discord wins the "text my squad from my phone" feeling. Rich embeds with per-agent colors give instant visual identity. 2000-char message limit naturally enforces DM summary mode. The dev community already lives on Discord — no mental model shift for users.
- **Per-repo:** Discord server with text channels per repo (`#squad`, `#other-project`) maps cleanly. Superior to Telegram groups, comparable to Teams channels but lighter weight.
- **Lock-in:** Zero. `discord.js` has no GitHub coupling. The Squad DM Gateway architecture keeps the messaging layer platform-agnostic — swapping Discord for Teams or Slack later is an adapter change, not an architecture change.

### 2026-02-11: GitHub integrations are notification-only, not a messaging replacement
**By:** Keaton
**What:** GitHub-for-Teams, Copilot Extensions, and GitHub Actions webhooks provide one-way notification capabilities but cannot replace building a conversational bot. GitHub-for-Teams delivers event cards (push, PR, issue events) but is not programmable or extensible. Copilot Extensions are the wrong architecture for messaging bridges. GitHub Actions can push webhook notifications to Discord/Teams for free (one-way alerts).
**Why:** Brady asked whether GitHub's existing integrations could give us messaging "for free." The answer is: partially. One-way notifications (CI failure → Discord alert) are free via GitHub Actions webhooks. Conversational messaging (Brady asks a question → agents respond) requires a bot. This confirms the two-tier architecture: GitHub-native for work assignment (CCA), purpose-built bot for conversation (Discord).

### 2026-02-11: Squad DM Gateway must have zero GitHub-specific imports
**By:** Keaton
**What:** The shared Squad DM Gateway layer (message routing, agent spawning, response formatting) must never import GitHub-specific libraries or APIs. Platform adapters (Discord, Teams, Slack) are thin and replaceable. The gateway is the shared core. This preserves the path to Azure DevOps and GitLab support.
**Why:** Brady's concern about platform lock-in is valid and architecturally addressable. The adapter pattern keeps options open: Discord adapter imports `discord.js`, Teams adapter imports Bot Framework SDK, but the gateway itself is platform-agnostic. If Squad adds ADO or GitLab hosting support later, the messaging layer requires zero changes — only the hosting/auth layer adapts. CCA is GitHub-only by nature but is additive (Tier 1), not foundational.

### 2026-02-11: DM output mode should be platform-aware via adapter formatting
**By:** Keaton
**What:** The DM output mode prompt produces a platform-neutral summary (markdown with structured fields). Each platform adapter transforms this into native rendering: Discord rich embeds with agent-color sidebars, Teams Adaptive Cards with action buttons, etc. The prompt itself does not need per-platform variants — the adapter handles presentation.
**Why:** Verbal's analysis showed that Discord embeds, Teams Adaptive Cards, and Telegram markdown all support the same core pattern (agent identity + summary + link + actions) but with different rendering primitives. Making the prompt platform-neutral and the adapter platform-specific is cleaner than maintaining N prompt variants. Agent personality (emoji + name + role) is preserved identically across all platforms — only the visual container changes.




# Decision: MCP Integration Direction for Squad

**Author:** Keaton (Lead)  
**Date:** 2026-02-11  
**Requested by:** Brady (from Fritz's Issue #11)  
**Status:** Awaiting Brady's decision

---

## Problem

Fritz (@csharpfritz) has requested that Squad agents be able to interact with MCP services configured in `mcp.json`. Specifically: Trello board management and Aspire dashboard monitoring during deployments. This is a valid extension of Squad's provider-agnostic architecture.

---

## Recommendation

**Pursue Option B (Awareness Layer)** — low-effort MCP discovery that answers Fritz's use cases without speculating about platform behavior.

### Why Option B

1. **Option A (Platform-Native) is risky.** It assumes Copilot platform auto-injects MCP tools. If it doesn't, agents fail silently.
2. **Option B adds safety.** Explicit discovery prevents surprises and enables intelligent routing.
3. **Option C is premature.** Ceremonies should emerge from real usage, not speculation.
4. **Zero dependencies maintained.** `jq` parsing of `mcp.json` is trivial.

### Implementation

**Phase 1: Validation Spike (WI-1)** — 2-3 hours
- Test MCP tool availability in Copilot CLI
- Answer: does the platform auto-inject? How do agents access?
- Document findings

**Phase 2: Discovery (WI-2)** — 3-4 hours (if WI-1 is green)
- Coordinator reads `mcp.json` at session start
- Pass available tools list to agent spawns
- All prompt-level changes, no code modifications

**Phase 3: Routing Docs (WI-3)** — 2-3 hours (after WI-2)
- Update `routing.md` with MCP tool → agent mappings
- Document Trello sync and Aspire monitoring ceremonies
- User-facing documentation

### Effort & Risk

- **Total:** 7-10 hours if WI-1 validates platform behavior
- **Risk:** Medium — depends on Copilot platform MCP support
- **Mitigation:** WI-1 spike gates everything else

---

## Fritz's Use Cases (Design Drivers)

**Trello:** Sync between GitHub Issues (code work) and Trello boards (planning/roadmap).

**Aspire:** Monitor dashboards during deployments — error rates, latency, resource usage. Validate deployment success before promoting to production.

Both are achievable with awareness layer (Option B). Ceremonies can be documented without code changes.

---

## Timeline

- **v0.3.0 Wave 2:** If WI-1 shows platform auto-injection works, we can slip MCP discovery into v0.3.0 (3-4 hours, low risk)
- **v0.4.0 Wave 1:** If WI-1 is inconclusive, defer to v0.4.0 and resolve platform questions first

---

## Next Steps

1. **Brady approval:** Proceed with proposal and WI-1 spike?
2. **WI-1 execution:** Keaton validates platform MCP support
3. **Community feedback:** Fritz responds to proposal comment on Issue #11 with priorities/feedback
4. **Decision:** After WI-1, decide v0.3.0 vs v0.4.0 placement

---

## Context Files

- **Proposal:** `team-docs/proposals/034-mcp-integration.md`
- **Issue:** GitHub Issue #11 (Feature: Enable MCP use)
- **Related:** Proposal 032a (Provider Abstraction), 032c (Label Taxonomy)



### 2026-02-11: Release process directive
**By:** Brady (via Copilot)
**What:** Never bypass the release CI/CD pipeline. All code reaches main exclusively through the two-phase release workflow (preview → ship). No direct pushes, no manual merges to main.
**Why:** User directive — the release.yml pipeline is the only authorized path to main. It validates versions, filters product files, runs tests, and creates GitHub Releases. Bypassing it risks shipping non-product files, unvalidated versions, or missing release artifacts.


### 2026-02-12: User directive
**By:** Brady (via Copilot)
**What:** All tables presented to the user should include a "squad-time to complete" column showing estimated time for the squad to finish each item.
**Why:** User request — captured for team memory. Users already know the squad is superhuman; showing estimated completion time reinforces that and helps with planning.


# Fenster's Take: Branching Strategy for Squad

**Status:** Perspective for Brady  
**By:** Fenster (Core Dev)  
**Date:** 2026-02-11

---

## Summary

`dev` is sufficient as the integration branch. Feature branches (`squad/{issue}-{slug}`) merging into `dev` via PR is the right pattern for Squad's velocity. We don't need an "upcoming" or staging layer — it adds friction without safety. The release pipeline (preview → ship) already gives Brady control. Worktree support isn't essential yet. The current setup is clean.

---

## 1. Is dev sufficient as the integration branch?

**Yes.** Here's why:

- **dev is where the work lives**, and that's correct. All feature branches merge here. All agents read current state from dev. All tests run against dev. This is the "source of truth" for active work.
- **We don't need staging/upcoming.** Every feature branch is already a "staging area" for isolated work. The release pipeline's preview phase gives Brady a final eyeball before anything touches main. Adding another branch layer would:
  - Require managing merges between three layers (feature → upcoming → dev → main)
  - Create confusion about "where do I pull from?" during onboarding
  - Slow iteration (waiting for an intermediate merge before seeing something in a "staging" branch)
  - Add more places for merge conflicts
  
- **The real safety comes from the release process**, not branch topology. Brady can't accidentally ship garbage to main because the release pipeline (Kobayashi's design) validates versions, filters files, runs tests, and sits at a preview step. That's the gate.

---

## 2. How do feature branches work day-to-day?

**Clean pattern:** `squad/{issue}-{slug}` → dev via PR

This is already the right approach:

- Each feature gets its own branch. Agent spawns know which branch they're on (read from git config).
- PRs to dev trigger tests automatically (CI on dev is running).
- Once approved and merged, that work is immediately available to other agents on dev.
- Multiple agents can work in parallel on different features without blocking each other.

**One friction point I notice:** If an agent is working on a feature and another agent merges a conflicting change to dev mid-flight, the feature branch developer has to rebase. This is unavoidable, but we should document the rebase workflow clearly so agents aren't surprised.

---

## 3. What about when multiple features are in flight?

**Don't add worktree support yet.** Here's my reasoning:

- Worktrees are useful when *one person* needs to context-switch between multiple local branches. But our workflow is different: agents spawn on a *specific branch*, do their work, and exit. They're not context-switching.
- If we spawn Fenster to work on squad/123-feature-a and Fenster to work on squad/456-feature-b simultaneously (which we could do), they just use different clones or containerized instances. The orchestration handles it.
- Worktrees would add complexity to index.js (detecting worktrees, routing the agent to the right one, cleanup). Not worth it until we actually need it.

**What matters:** The PR-per-feature model keeps features isolated. If five features are in flight, we have five branches and five PRs. Each one can merge independently. That's plenty of parallelism.

---

## 4. What's the simplest flow that keeps Brady safe?

**Current setup is already safe.** Here's the protection:

1. **main is protected** — no direct pushes. All code goes through the release pipeline.
2. **release.yml pipeline enforces the two-phase workflow** — preview first (lets Brady eyeball it), then ship (automated). No bypasses.
3. **dev is the integration point** — all feature PRs merge here. Agents test against dev.
4. **release pipeline validates before shipping** — versions, file filtering, test runs. If something breaks, the preview phase catches it before main.

**For Brady's peace of mind:** The only thing we need to ensure is that:
- No one force-pushes to main or dev
- All merges to dev come through PRs with a brief review (agent-to-agent code review is fine)
- Release process is never skipped (enforce through GitHub branch protection rules)

This is already the case. We're good.

---

## 5. Does the current setup create friction for rapid iteration?

**No.**

- **Feature branches are fast** — creates a branch, pushes a commit, opens a PR, merges within minutes (assuming tests pass). No ceremony.
- **Dev is always ready** — agents don't wait for staging or release prep. They can spawn, pull from dev, and start work immediately.
- **Parallel PRs don't block each other** — if three features are merging to dev, they land independently. No "gate-keeping."
- **Tests run automatically** — CI on dev is working. We know if something broke before merging.

**One real friction point:** If we're shipping a release and simultaneously landing features in dev, there's a brief moment where dev is ahead of the preview branch. This is fine and expected — it's exactly why we have a two-phase workflow.

---

## Recommendation

**Keep the current model.**

- Stick with feature branches → dev (via PR) → release pipeline → main
- No "upcoming" branch
- No worktrees (yet)
- Add one doc: "Rebasing guide for agents" so they know what to do if dev changes while they're working

The simplicity is a feature. The release pipeline does the actual safety work. Branching topology is just plumbing.

---

## Questions for Brady

1. **Do we want automated squash-merge on feature branch PRs to dev?** (Keeps commit history clean, easier to bisect)
2. **Should the rebasing guide be in docs/ or team-docs/?** (I'd suggest team-docs — it's internal workflow)
3. **Any concerns about the current preview → ship release model, or is that already validated?**


# Branching Strategy — Proposal

**By:** Keaton (Lead)  
**Date:** 2026-02-10  
**Requested by:** Brady (v0.3.0 manual push incident)  
**Status:** READY FOR DECISION

---

## Problem

Brady had to manually push to `preview` and `main` during v0.3.0. This defeats the entire point of the CI/CD pipeline: **our release process should never require human hands on branch buttons.** We also need clarity on:

1. Should feature work go straight to `dev`, or is there a staging branch in between?
2. Where do hotfixes go?
3. Should `preview` and `main` be protected from manual pushes?
4. How do we prevent another manual-push incident?

## Solution: Three-Branch Strategy + Strict Automation

### Branching Model

```
feature/name          (temporary, deleted after merge)
    ↓
   dev                (always deployable, main development line)
    ↓
(Release CI: tests + preview build)
    ↓
  preview             (staging, human review gate, CI-pushes-only)
    ↓
(Release CI: copy preview → main, tag, release)
    ↓
   main               (shipping product, CI-pushes-only, read-only to humans)
    ↓
GitHub Release + npx resolution
```

### Branch Definitions

| Branch | Purpose | Who Writes | How | Protection |
|--------|---------|-----------|-----|-----------|
| `dev` | Active development | Humans (via PRs) | `git push origin feature/X` → PR → merge to `dev` | ✅ Require PR review, passing CI |
| `preview` | Staging (v0.x style) | CI/CD only | Release action Phase 1 — tests, builds, pushes | ✅ Require status checks, no direct pushes |
| `main` | Shipping product | CI/CD only | Release action Phase 2 — copy preview, tag, release | ✅ Require status checks, no direct pushes |

### Feature Branch Workflow

1. Create feature branch: `git checkout -b feature/my-feature dev`
2. Develop normally
3. Open PR against `dev`
4. CI runs tests (gates merge)
5. Brady (or team) reviews + approves
6. Merge to `dev` (delete feature branch)

### Release Workflow (No Manual Touches)

**Phase 1 — Preview:**
1. Update `package.json` version on `dev`
2. Commit + push to `dev`
3. Dispatch `release` workflow → `action: preview` → `version: 0.3.0`
4. CI: checks out `dev`, runs tests
5. CI: builds filtered product files, **pushes to `preview` with `--force`**
6. Brady inspects `preview` locally or via GitHub (see diff, run locally)
7. Approves or rejects (if reject, commit fixes to `dev`, re-run Phase 1)

**Phase 2 — Ship:**
1. Once satisfied with `preview`, dispatch `release` workflow → `action: ship` → `version: 0.3.0`
2. CI: checks out `preview`
3. CI: validates content (product-files-only check)
4. CI: **pushes to `main`** (forces overwrite of main to match preview exactly)
5. CI: tags release, creates GitHub Release
6. CI: verifies `npx github:bradygaster/squad` resolves
7. Done — humans stay off `main` and `preview`

### Hotfix Workflow

Hotfixes start on `dev` (not a separate hotfix branch):

1. Create `feature/hotfix-bug-X` from `dev`
2. Fix + test
3. PR → merge to `dev`
4. Run release workflow (Phase 1 + Phase 2) normally
5. Version bump: `0.3.0` → `0.3.1`

**Why:** This is a solo-dev-plus-AI project. A separate `hotfix/` → `main` → `dev` sync pattern adds branching debt. Keep it simple: all work feeds `dev`, all releases come from `dev`.

### Protection Rules (GitHub)

**On `main`:**
```
✅ Require status checks before merge
✅ Require PR reviews before merge
✅ Dismiss stale reviews
✅ Restrict push access to GitHub Actions only
❌ NO direct merges from humans (not even admins)
```

**On `preview`:**
```
✅ Require status checks before merge
✅ Restrict push access to GitHub Actions only
❌ NO direct merges from humans
```

**On `dev`:**
```
✅ Require PR reviews
✅ Require status checks
✅ Allow human merges (Brady + AI team)
```

---

## Trade-offs

**Simplicity vs. Flexibility:**
- ✅ **Simple:** Three branches, one release pattern, zero manual branch touching
- ❌ **Less flexible:** No separate staging environment (preview serves that)
- ✅ **Acceptable:** v0.x release pace doesn't need release branches

**Force Push on preview/main:**
- ✅ **Good:** Ensures preview/main are *exact* copies of what CI built (bit-for-bit)
- ❌ **Scary:** Force push history rewriting is risky
- ✅ **Mitigated:** Force push is scripted in CI (humans can't do it), plus validation step checks preview content before pushing main

**One Release Path:**
- ✅ **Good:** No branching confusion, no "should hotfixes go to main or dev?"
- ❌ **Less familiar:** Developers used to `hotfix/` → `main` model won't see it
- ✅ **Acceptable:** Documentation + team chat clarifies the pattern

---

## Alternatives Considered

### A. Current State (dev → preview → main, but allow manual pushes)
- ❌ Enables the v0.3.0 incident again
- ❌ "CI/CD optional" is a footgun on a solo project

### B. GitHub flow (main only, feature branches PR directly to main)
- ❌ Loses staging gate — `preview` serves a real purpose (Brady review before ship)
- ❌ Eliminates ability to inspect release before it ships

### C. Git flow (develop, release/X, hotfix/X, main)
- ❌ Too much branching for a 2-person team (Brady + AI team)
- ❌ Adds ceremony without benefit at this scale
- ✅ Good for enterprise; wrong for us

### D. Trunk-based (single main branch, tags for releases)
- ❌ Loses staging gate (no preview before ship)
- ❌ Can't diff main from "what's about to ship"

---

## Success Criteria

1. **No Manual Branch Touches** — Release is 100% CI/CD. Brady never runs `git push origin preview` again.
2. **Clear Role for Each Branch** — Dev is work, preview is review, main is shipped.
3. **Reviewable Releases** — Brady can inspect preview before ship (diff, local test, docs review).
4. **Protection Rules Enforced** — GitHub prevents direct pushes to preview/main, even by admins.
5. **Simple Hotfix Story** — Fix is on dev, release is normal; no special hotfix branching.
6. **Documentation** — Team knows the flow; no guessing about where to push.

---

## Implementation Checklist

- [ ] Set up branch protection rules on GitHub:
  - [ ] `main` — restrict push to Actions only, require status checks
  - [ ] `preview` — restrict push to Actions only
- [ ] Update release.yml (if needed) to document forced push strategy
- [ ] Update team-docs/release-process.md with this branching model
- [ ] Delete any old `hotfix/` branches if they exist
- [ ] Create team chat summary: "Branching Strategy Update — Here's How We Release"
- [ ] Verify v0.3.1+ releases use this pattern (no manual pushes)

---

## Decision

**Adopting Three-Branch Model with Strict CI/CD-Only Pushes to preview and main.**

This prevents the v0.3.0 incident from recurring. It's simple, clear, and matches the release pipeline we already built. No hand-waving about "who can push when" — GitHub enforces it.

Brady: You approve releases by dispatching the workflow, not by touching branches. The pipeline takes it from there.


### 2026-02-12: Release Pipeline Hardening — Branch Protection & CI/CD Enforcement

**By:** Kobayashi (Git & Release Engineer)

**Context:** During v0.3.0 release, the coordinator manually pushed release.yml to main (bootstrap) and pushed to preview/main. Brady wants ZERO manual pushes to preview or main — only CI/CD should write to these branches. This memo analyzes the current pipeline and proposes hardening measures.

---

## Problem Statement

Current state:
- **Preview and main branches are unprotected.** Anyone with write access can push directly, bypassing the release workflow.
- **Bootstrap problem:** release.yml must exist on main before GitHub Actions can see it. First-time setup for new repos requires manual seed.
- **No validation that dev is ahead of main.** The preview phase doesn't check whether there are actual changes to release.
- **Manual intervention risk.** The workflow exists and is designed well, but nothing prevents humans from circumventing it.

Brady's directive: **Preview and main are CI/CD-only. No manual pushes. Ever.**

---

## Recommended Hardening: Five Components

### 1. Branch Protection Rules for `preview`

**What to configure in GitHub:**

```
Branch: preview
├── Require pull request reviews
│   └── Dismiss stale pull request approvals: ❌ (not needed for CI-only writes)
├── Require status checks to pass
│   └── Required checks: NONE (no pre-merge validation needed)
├── Require branches to be up to date
│   └── ❌ (disable — not applicable)
├── Include administrators: ✓ (YES — admins cannot bypass)
├── Allow force pushes: ✓ For GitHub Actions bot ONLY (see below)
│   └── Restrict who can force push
│       └── Allow: github-actions[bot]
│       └── Restrict: Everyone else (❌ no force push)
├── Allow deletions: ❌ (NO one deletes preview)
└── Require signed commits: ❌ (not needed for Actions-generated commits)
```

**Why this design:**
- Prevents accidental pushes from human developers
- Allows `github-actions[bot]` to force-push (needed for phase 1 of release workflow)
- Protects against deletion (preview is a critical staging point)

**GitHub UI path:** Settings → Branches → Add rule → Branch name pattern: `preview`

---

### 2. Branch Protection Rules for `main`

**What to configure in GitHub:**

```
Branch: main
├── Require pull request reviews
│   └── Dismiss stale pull request approvals: ❌ (not needed)
├── Require status checks to pass
│   ├── ci.yml (required on push)
│   └── ✓ Check: npm test
├── Require branches to be up to date: ✓ YES
├── Include administrators: ✓ (YES — admins cannot bypass)
├── Allow force pushes: ❌ NO (never)
│   └── Exception: github-actions[bot] MAY push (not force-push)
│       └── Restrict who can force push: NO ONE (blank/disabled)
├── Allow deletions: ❌ NO (never)
├── Require signed commits: ❌ (optional, not critical)
├── Require code owners review: ✗ (only if code owners file exists)
└── Require conversation resolution: ❌ (not used)
```

**Key differences from preview:**
- **NO force pushes** — main is append-only. Mistakes are reverted via new releases, not force-push rewrites.
- **CI checks required** — ci.yml must pass before any merge (even from Actions).
- **Up-to-date check enabled** — prevents stale merges.

**Why this design:**
- Prevents human pushes entirely (Actions can push, but only via workflow)
- Enforces tests pass before production code lands
- Audit trail is immutable (no rewriting history)

**GitHub UI path:** Settings → Branches → Add rule → Branch name pattern: `main`

---

### 3. Preventing Manual Pushes: Enforcement Model

**The enforcement chain:**

```
Local developer types: git push origin main
    ↓
GitHub receives push
    ↓
Branch protection rule checks:
  - "main: require status checks to pass"
  - "main: no force pushes"
  - "main: requires write from github-actions[bot] only"
    ↓
Push is REJECTED
    ↓
Developer gets error: "Updates were rejected because the tip of your current 
  branch is behind its remote counterpart."
```

**Supplementary control:** Set branch protection to **restrict push access to `main` to github-actions[bot] only.**

**In GitHub UI:**
- Settings → Branches → `main` rule
- Under "Restrict who can push to matching branches"
  - Leave blank (defaults to all with write access)
  - **OR** explicitly list only `github-actions[bot]`

**Note:** GitHub's UI for "only X can push" is sparse. A more ironclad approach:

1. **Remove write permissions from human contributors** on the repository.
   - Make them Maintain role (can manage issues, run workflows) but not push.
   - OR use a tighter org-level role (can run Actions but not push).
   
2. **Only grant write permission to the bot that runs the workflow.**
   - GitHub Actions in this repo already uses `permissions: contents: write`.
   - This is tightly scoped to the Actions runner context.

**Best practice:** Combine branch protection + CODEOWNERS file:

```
# .github/CODEOWNERS
main      @bradygaster  # Brady is owner; branch protection enforces rules
preview   @bradygaster
dev       @bradygaster  # dev can have looser rules (features merge here)
```

This makes it clear to the team: **main and preview are locked down; Brady owns the keys.**

---

### 4. The Bootstrap Problem: release.yml Must Exist on Main

**The problem:**
- GitHub Actions workflows must exist on a branch before Actions can reference them.
- When setting up a new repo, release.yml is on `dev` but not on `main`.
- The release workflow file itself is in `.github/workflows/release.yml`.
- If it's not on main, Actions cannot trigger workflows from main branch events.
- v0.3.0 required a manual push to bootstrap release.yml onto main.

**Solution: Seed release.yml on main at repo creation.**

**Option A: Mandatory bootstrap step (for new repos using Squad)**

When initializing a new Squad repository (or importing an existing one):
1. Add `.github/workflows/release.yml` to the product file allowlist (`KEEP_FILES` in release.yml).
2. Bootstrap it onto `main` as a **one-time** manual step before taking over CI/CD.
3. Commit message: `bootstrap: initial release.yml`
4. After this, the release workflow owns all main updates.

**Add to `release.yml` KEEP_FILES:**
```bash
KEEP_FILES: "... .github/workflows/release.yml"
```

**Rationale:** 
- release.yml is a product file (all users inherit it for their Squad installations).
- Once it's on main, the workflow can manage itself.
- This is a one-time setup cost, not an ongoing manual burden.

**Option B: Dynamic workflow provisioning (future enhancement)**

The Coordinator agent (`squad.agent.md`) could check for release.yml on main at install time and create it if missing. This requires:
- Read-only GitHub API access (no auth needed for public repos).
- Light validation that the workflow is well-formed.
- Fallback if creation fails (print instructions to user).

Deferred for now; **Option A is the implementation path for v0.3.0 and Squad 1.x.**

**Documentation update required:**
- Add to `docs/release-checklist.md`: "Bootstrap: Ensure release.yml is on main before first release."
- Add to `team-docs/release-process.md`: "Setup: Manual bootstrap of release.yml to main is a one-time cost."

---

### 5. Should `preview` Validate That `dev` Is Ahead of `main`?

**Short answer: YES — add this as an early validation step in phase 1.**

**Why:**
- Currently, the preview phase doesn't check if there are actual changes since the last release.
- This could allow "releases" that contain no product changes (wasted tag, GitHub Release noise).
- Early failure is better than discovering this after force-pushing preview.

**Proposed step (add to preview job, right after checkout):**

```bash
- name: Validate dev is ahead of main
  run: |
    # Count commits between main and dev
    AHEAD=$(git rev-list --count main..HEAD)
    
    if [ "$AHEAD" -eq 0 ]; then
      echo "::error::dev is not ahead of main. No changes to release."
      exit 1
    fi
    
    echo "✓ dev is $AHEAD commit(s) ahead of main"
```

**Better version (commit-diff based):**

```bash
- name: Validate dev contains new product changes
  run: |
    # Get list of changed product files between main and dev
    read -ra KEEP_FILES_ARR <<< "$KEEP_FILES"
    read -ra KEEP_DIRS_ARR <<< "$KEEP_DIRS"
    
    CHANGED_PRODUCT_FILES=0
    
    # Check if any KEEP_FILES have changed
    for f in "${KEEP_FILES_ARR[@]}"; do
      if git diff --name-only main HEAD | grep -q "^$f$"; then
        ((CHANGED_PRODUCT_FILES++))
      fi
    done
    
    # Check if any KEEP_DIRS have changed
    for d in "${KEEP_DIRS_ARR[@]}"; do
      if git diff --name-only main HEAD | grep -q "^$d/"; then
        ((CHANGED_PRODUCT_FILES++))
      fi
    done
    
    if [ "$CHANGED_PRODUCT_FILES" -eq 0 ]; then
      echo "::error::No product file changes between main and dev. Nothing to release."
      exit 1
    fi
    
    echo "✓ $CHANGED_PRODUCT_FILES product file(s) changed since main"
```

**Impact on workflow:**
- Prevents empty releases.
- Catches accidental re-runs of the same version.
- Provides early feedback (before building and force-pushing preview).

**When to run:** Right after "Validate version" step in preview job.

---

## Summary of Changes

| Component | Change | Why |
|-----------|--------|-----|
| **preview branch protection** | Require rule; allow github-actions force-push only | Prevent manual writes, allow CI override |
| **main branch protection** | Require rule; NO force-push; require status checks | Enforce immutability, test validation |
| **Write access** | Restrict to github-actions[bot] via branch rules | Zero human manual pushes |
| **release.yml seeding** | Include in KEEP_FILES; bootstrap to main once | Unblock Actions from self-managing |
| **dev-ahead validation** | Add check in preview phase 1 | Prevent empty releases |

---

## Implementation Timeline

**v0.3.0 (immediate):**
1. Add branch protection rules to preview and main (GitHub Settings).
2. Add dev-ahead validation to release.yml preview phase.
3. Confirm release.yml is included in KEEP_FILES.
4. Bootstrap release.yml to main manually (one-time).

**v0.3.1 or later (if needed):**
- Refine bootstrap documentation.
- Consider dynamic workflow provisioning (Option B).

---

## Testing & Verification

After hardening:
1. **Negative test:** Attempt manual push to preview/main from local branch → should be rejected.
2. **Positive test:** Run full release workflow (preview → ship) with branch protection active → should succeed.
3. **Empty release test:** Run preview with no changes to product files → should fail at dev-ahead check.
4. **CI check test:** Commit broken test to dev, run preview → should fail at test gate.

---

## Questions & Edge Cases

**Q: What if we need to hotfix main directly?**
A: Use the release workflow with an expedited version. Never bypass protection rules. Create an emergency fix on `dev`, merge to `release`, run preview+ship.

**Q: Can we add a `HOTFIX` action to release.yml?**
A: Future enhancement. For v0.3.0, use the standard two-phase workflow.

**Q: What about force-pushing to dev?**
A: `dev` is development-facing; looser rules are fine. No branch protection needed (humans actively work here).

**Q: Does .github/workflows/ belong on main?**
A: Yes — workflows are product files. Users inherit them. Include in KEEP_FILES.

**Q: What if release.yml itself has a bug?**
A: Fix it on `dev`, re-run preview+ship with the corrected version. The protection rules do not prevent fixing workflow bugs.

---

## Acceptance Criteria

✓ preview and main are protected from manual writes  
✓ github-actions[bot] can push to both (via workflow)  
✓ Humans cannot force-push to either  
✓ release.yml exists on main (seeded or self-managed)  
✓ Preview phase validates dev is ahead before building  
✓ All CI checks pass  
✓ Brady can run a full release without manual intervention (except the ship trigger)  

---

**Next:** Implement branch protection rules in GitHub Settings, update release.yml with dev-ahead check, confirm release.yml bootstrap, and document in release-process.md.


# Cross-Client Sub-Agent/Delegation API Research

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-11  
**Requested by:** Brady  
**Triggered by:** Issue #9 (miketsui3a) — reports `runSubagent` instead of `task`  
**Related:** Issue #10 (Copilot client parity gap, P1)

---

## Executive Summary

**There is NO unified sub-agent/delegation tool name across Copilot clients.** Each client implements its own tool with its own name, parameters, and execution model. The `task` tool is specific to Copilot CLI. The `runSubagent` tool is specific to VS Code. Visual Studio doesn't have a native sub-agent tool yet. The coding agent (@copilot) uses an entirely different execution model.

**Recommendation: Do not change.** Squad targets Copilot CLI. The `task` tool works, is documented, and is the correct primitive for this platform. Switching would buy us nothing and break everything.

---

## Findings by Client

### 1. Copilot CLI — `task` tool ✅ (our platform)

- **Tool name:** `task`
- **Parameters:** `agent_type` (explore, task, general-purpose, code-review, custom), `mode` (sync, background), `model`, `prompt`, `description`
- **Execution:** Spawns isolated LLM sessions with their own context windows, tool access, and execution environments
- **Status:** Stable, production. Squad v0.3.0 shipped on this.
- **Documentation:** Built into the CLI system prompt; `/tasks` command manages background tasks
- **Source:** Copilot CLI help output, our own verified usage

### 2. VS Code (Copilot Chat) — `runSubagent` tool

- **Tool name:** `runSubagent` (also `runSubagent2` behind experimental flag `chat.experimental.runSubagent2`)
- **Invocation:** Agent-initiated tool call or user hint via `#runSubagent`; also available as `agent` in prompt file `tools` frontmatter
- **Execution:** Spawns context-isolated child agents in the same VS Code session. Synchronous (blocks parent). Multiple subagents can run in parallel.
- **Key differences from `task`:**
  - No `agent_type` parameter — uses custom agent `.agent.md` files instead
  - No `mode: "background"` — subagents are synchronous by design
  - No `read_agent` — results return inline
  - Has `subagentType` parameter to specify which custom agent to use
  - Experimental: `user-invokable`, `disable-model-invocation` frontmatter controls
- **Status:** Stable but still evolving. Experimental `runSubagent2` is the active development branch.
- **Documentation:** https://code.visualstudio.com/docs/copilot/agents/subagents
- **Issues tracker:** https://github.com/microsoft/vscode/issues?q=label:chat-subagents
- **Key issues:**
  - https://github.com/microsoft/vscode/issues/274950 (Test subagents)
  - https://github.com/microsoft/vscode/issues/274630 (Parallel subagents)
  - https://github.com/microsoft/vscode/issues/275855 (Model selection for subagents)
  - https://github.com/microsoft/vscode/issues/278199 (Issue running subagent tool)

### 3. Visual Studio (2022/2026) — No native sub-agent tool

- **Tool name:** None built-in for sub-agent delegation
- **Agent Mode:** Has Copilot Agent Mode (GA with MCP support) but it's single-agent — one agent executes a task with tool access, not multi-agent orchestration
- **Workaround:** Third-party VS Code extension `copilot-task-delegate` (marketplace: `dvcrn.copilot-task-delegate`) implements delegation via MCP tools (`copilot-task-delegate_start`, `copilot-task-delegate_status`, `copilot-task-delegate_complete`). This is NOT a GitHub-built feature.
- **Status:** Sub-agent delegation listed as "Coming, partial" in Visual Studio. Agent Mode is GA.
- **Documentation:** https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-mode
- **Source:** https://devblogs.microsoft.com/visualstudio/agent-mode-is-now-generally-available-with-mcp-support/

### 4. Copilot Coding Agent (@copilot cloud) — Different execution model entirely

- **Tool name:** N/A — this is not a tool-based delegation system
- **Execution model:** Issue-driven. Assign an issue to `@copilot`, it spins up an ephemeral GitHub Actions VM, clones the repo, does work, opens a draft PR.
- **Sub-agent spawning:** Internal orchestration within the VM. The agent may decompose tasks internally, but this is opaque — there's no user-facing sub-agent API.
- **Key difference:** The coding agent IS the agent. It doesn't spawn sub-agents in the way CLI/VS Code do. It's a single autonomous session.
- **Documentation:** https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent
- **Source:** https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/

---

## Tool Comparison Matrix

| Capability | CLI (`task`) | VS Code (`runSubagent`) | Visual Studio | Coding Agent |
|---|---|---|---|---|
| Tool name | `task` | `runSubagent` / `runSubagent2` | None (MCP extension workaround) | N/A (different model) |
| Agent types | explore, task, general-purpose, code-review, custom | Custom `.agent.md` files | N/A | N/A |
| Background/async | ✅ `mode: "background"` | ❌ Synchronous only | N/A | Always async (cloud) |
| Parallel execution | ✅ Multiple background agents | ✅ Multiple parallel subagents | N/A | Single session |
| Model selection | ✅ `model` parameter | ⚠️ Experimental (via custom agent) | N/A | Platform-selected |
| Result retrieval | `read_agent` tool | Inline (blocks until done) | N/A | PR + session logs |
| Context isolation | ✅ Separate context windows | ✅ Separate context windows | N/A | Full VM isolation |
| Custom agent support | ✅ Custom agent type | ✅ `.agent.md` files | ✅ `.agent.md` files | ✅ `.github/agents/` |

---

## Is Convergence Coming?

### Evidence FOR convergence:
- **Copilot SDK** (`@github/copilot-sdk`) released in early 2026 provides a unified runtime across Node.js, Python, Go, .NET — the same engine that powers the CLI. This could eventually standardize the spawning API.
- **Agent Skills** use an open standard (agentskills.io) that works across all clients — skills are portable even if the spawning mechanism isn't.
- **Custom agents** (`.github/agents/` and `.agent.md` files) are converging across clients — same config format, same frontmatter.
- **Agents Panel** launched across VS Code and Visual Studio as a unified session management UI.

### Evidence AGAINST near-term convergence:
- VS Code's `runSubagent` is still experimental (`runSubagent2` behind a feature flag) — the API is not settled.
- Visual Studio doesn't have native sub-agent spawning at all yet.
- The CLI's `task` tool has a fundamentally different parameter model than `runSubagent` (typed agent_type enum vs. custom agent references).
- No GitHub blog post, changelog, or documentation mentions plans to unify these tool names.
- The coding agent has a completely different execution model — there's nothing to unify with.

---

## Impact on Squad

### Current state:
- `squad.agent.md` references `task` tool **47+ times** across critical rules, spawn templates, response modes, and the anti-hallucination guardrails
- The `task` tool is the **single most important API call** in Squad's architecture
- Proposals 003, 007, 015, 017 all deeply analyze `task` tool behavior

### If we changed to `runSubagent`:
- Would break on CLI (our shipping platform)
- Would gain VS Code compatibility (which doesn't exist anyway — Squad runs in CLI)
- Would lose `mode: "background"` (critical for parallel fan-out)
- Would lose `agent_type` selection (critical for model/capability routing)
- Would require rewriting every spawn template, every proposal, every test

### Multi-client strategy (future):
When/if Squad supports VS Code (tracked in Issue #10), the correct approach is:
1. **Abstraction layer** — Squad's coordinator prompt uses a platform-neutral concept ("spawn agent") that maps to the correct tool per client
2. **Platform detection** — Coordinator detects which client it's running in and uses the right tool
3. **Not renaming** — We don't rename `task` to `runSubagent` or vice versa; we abstract over both

This is consistent with Proposal 032a (Provider Abstraction Architecture) — prompt-level command templates, not JS interfaces.

---

## Recommendation

**Do not change.** Rationale:

1. **`task` works.** We just shipped v0.3.0 on it. The bar for changing is high.
2. **There is no unified tool.** Switching to `runSubagent` would break CLI compatibility for zero cross-client gain.
3. **The VS Code API is not stable.** `runSubagent2` is behind an experimental flag. Building on it now would be building on sand.
4. **The abstraction is the play.** When cross-client matters (Issue #10), we abstract — we don't pick one client's API and hope the others adopt it.
5. **Response to Issue #9:** miketsui3a is correct that VS Code uses `runSubagent`. The answer is: Squad targets Copilot CLI, which uses `task`. This is documented in our README. If a user is running Squad in VS Code, they need CLI, not the VS Code chat extension.

### Recommended Issue #9 response:
> Squad runs on GitHub Copilot CLI, which uses the `task` tool for agent spawning. VS Code Copilot Chat uses a different tool (`runSubagent`). These are separate Copilot clients with different tool APIs. Squad requires the CLI — see our [Getting Started guide](docs/guide.md) for setup instructions.

---

## Sources

| Source | URL |
|---|---|
| VS Code Subagents Documentation | https://code.visualstudio.com/docs/copilot/agents/subagents |
| VS Code Custom Agents | https://code.visualstudio.com/docs/copilot/customization/custom-agents |
| Copilot CLI Documentation | https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started |
| Copilot CLI Custom Agents Changelog | https://github.blog/changelog/2025-10-28-github-copilot-cli-use-custom-agents-and-delegate-to-copilot-coding-agent/ |
| VS Code Subagent Issues | https://github.com/microsoft/vscode/issues?q=label:chat-subagents |
| Parallel Subagents Issue | https://github.com/microsoft/vscode/issues/274630 |
| Model Selection for Subagents Issue | https://github.com/microsoft/vscode/issues/275855 |
| Subagent Running Issues | https://github.com/microsoft/vscode/issues/278199 |
| Visual Studio Agent Mode | https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-mode |
| VS Agent Mode GA + MCP | https://devblogs.microsoft.com/visualstudio/agent-mode-is-now-generally-available-with-mcp-support/ |
| Copilot Coding Agent Docs | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent |
| Copilot Coding Agent Blog | https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/ |
| Copilot SDK Repository | https://github.com/github/copilot-sdk |
| Copilot SDK Guide (MS Tech Community) | https://techcommunity.microsoft.com/blog/azuredevcommunityblog/building-agents-with-github-copilot-sdk-a-practical-guide-to-automated-tech-upda/4488948 |
| Agent Skills in VS Code | https://code.visualstudio.com/docs/copilot/customization/agent-skills |
| Custom Agents Configuration | https://docs.github.com/en/copilot/reference/custom-agents-configuration |
| Copilot Task Delegate Extension | https://marketplace.visualstudio.com/items?itemName=dvcrn.copilot-task-delegate |


### Version Display via Coordinator Self-Announcement

**By:** Kujan
**Date:** 2025-07-14
**Context:** Issue #18 — Show squad version number in agent label across Copilot hosts

**What:** Added a `Version` instruction to the Coordinator Identity section in `squad.agent.md`. The coordinator reads the `version` field from its own YAML frontmatter and includes `Squad v{version}` in its first response of each session.

**Why:** The version stamping pipeline (`stampVersion()` in `index.js`) already embeds the real version into the installed agent file's frontmatter during init and upgrade. The version was present but never surfaced to users. This approach requires zero code changes — it's a prompt instruction that leverages existing infrastructure.

**Alternatives rejected:**
- `description` frontmatter field: noisy in agent picker, may truncate
- `task` tool `description` parameter: per-spawn, not persistent
- Runtime `package.json` read: coordinator can't access the npm package at runtime

**Scope:** Single line addition to `squad.agent.md` Coordinator Identity section. No `index.js` changes. All 118 tests pass.


# Decision: Tips and Tricks User Documentation

**Date:** 2026-02-11
**Author:** McManus (DevRel)
**Status:** Approved

## What

Created `docs/tips-and-tricks.md` — practical end-user guide for managing Squad effectively. Addresses Issue #16.

## Why

Users new to Squad need more than feature documentation. They need patterns: when to use "Team" vs direct commands, how to get the most out of parallel work, how to manage decisions and memory, and how to recover from common mistakes.

Sample-prompts.md shows what Squad can build; tips-and-tricks.md shows how to work with Squad as a team.

## Key Decisions in the Doc

1. **Prompt Patterns**: Emphasis on scope clarity, roster specification, and decision stacking in the prompt itself. "Be specific about scope" prevents agents from asking clarifying questions later.

2. **Team vs Direct Commands**: Clear routing guidance — "Team" for parallel/cross-functional work, direct commands for sequential/specialized work. Includes table with use cases.

3. **Parallel Work Discipline**: Don't interrupt agents mid-chain. Check work logs instead of raw output. Let Ralph handle backlogs while you focus on urgent work.

4. **Ralph as Backlog Processor**: Practical Ralph patterns — activation, scoping, status checks, heartbeat setup. Ralph is most valuable when you have open issues.

5. **Decisions as Permanent Rules**: Set conventions early (session 1-2), capture them in decisions.md, agents read them automatically. "You only have to say them once."

6. **Pitfall Recovery**: 8 common mistakes with solutions. Emphasis on commitment (commit `.ai-team/`), clarity (specific prompts), and discipline (don't interrupt parallel work).

7. **Copyable Prompts**: Templates for getting started, asking for status, spike-then-build, closing phases. Real prompts users can copy directly.

## Style Notes

- Facts-based, not instructional. "Here's what works" not "You should do this."
- Before/after examples for patterns (❌ bad, ✅ good).
- Tables for routing guidance and reference.
- No fluff. Every section has working examples.
- Tone matches existing docs: direct, opinionated, technical.

## What Gets Created in Squad

This enables a help feature where users can ask:
- "Tips for prompt writing" → excerpt from Effective Prompt Patterns
- "How do I work with Ralph?" → Ralph section
- "I keep interrupting parallel work" → Pitfalls section
- "Show me a template prompt" → Copyable Prompts section

Document is self-contained and can be cross-referenced in README or featured in future chat help.

## Not in This Doc

- Feature explanations (that's in feature docs)
- Architecture (that's in guide.md)
- Installation (that's in guide.md)
- Getting started (that's in tour-first-session.md)

This doc assumes the user has installed Squad and formed a team. It's about effectiveness, not mechanics.



### 2026-02-12: Universe allowlist expansion
**By:** Fenster
**What:** Added 11 new universes to the casting allowlist (Adventure Time, Futurama, Seinfeld, The Office, Cowboy Bebop, Fullmetal Alchemist, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune). Updated both `.github/agents/squad.agent.md` and `.ai-team/casting/policy.json`. Closed issue #21.
**Why:** The existing 20-universe list was genre-heavy on heist/crime films and light on animation, anime, sitcoms, and workplace comedy. Community request (Gabe, issue #21) for Adventure Time was the catalyst. The 10 additional universes were selected to diversify genre coverage — adding sitcom (Seinfeld, The Office), anime (Cowboy Bebop, Fullmetal Alchemist), animation (Futurama, Arcane), horror/drama (Stranger Things), hard sci-fi (The Expanse), sports/comedy (Ted Lasso), and epic sci-fi (Dune). Capacity values set conservatively (8–15) based on named character pools. Two constraint entries added where protagonist avoidance improves casting variety.


# Issue #6 (Project Boards) — Go/No-Go Assessment

**Date:** 2026-02-11  
**By:** Keaton (Lead)  
**Status:** Go (Conditional v0.4.0)  
**Posted:** https://github.com/bradygaster/squad/issues/6#issuecomment-3888277477

---

## What

Project Boards (V2) integration for Squad is **approved for v0.4.0 implementation**. The feature is architecturally sound, technically feasible with zero npm dependencies, and has clear 3-phase implementation plan.

---

## Why

1. **Validated architecture:** Labels drive automation (source of truth), boards provide visualization (read-only projection). No state conflicts. Complements existing 032/032c/PR#5 work.

2. **Zero-dependency confirmed:** Kujan's 033a assessment proved `gh project *` CLI covers all 12 required operations. GitHub MCP server has zero Projects V2 tools. No npm packages needed.

3. **Single blocker is fixable:** Missing `project` token scope is not a design problem. Brady runs `gh auth refresh -s project` once, feature is unblocked. Graceful degradation handles missing scope at runtime.

4. **Clear sprint decomposition:** 17-26 squad-hours across 3 agents, 3 phases:
   - Phase 1 (Foundation): Validate CLI commands work, define provider interface (WI-1, WI-2)
   - Phase 2 (Integration): Coordinator prompts + sync workflow (WI-3, WI-4) — can parallelize Fenster + Verbal
   - Phase 3 (Polish): Query/display + docs (WI-5, WI-6) — can parallelize Verbal + McManus

5. **Community signal matters:** @londospark's Issue #6 is the first external feature request with concrete technical proposal. Shipping it demonstrates we listen and move fast. v0.4.0 is achievable in 12-16 calendar days if phases 2-3 overlap.

---

## Rationale

**v0.4.0, not v0.3.0:** Brady's directive for v0.3.0 is ONE feature (proposals as GitHub Issues, 032). Project boards sit on top of the label/issue foundation that 032/032c/PR#5 build. The right sequence is labels first (v0.3.0), boards as a dashboard (v0.4.0). This is not deferral, it's architecture.

**Zero-dependency constraint holds:** Proposal 033 initially suggested GraphQL client library. Kujan's 033a recommendation is `gh project *` CLI commands exclusively. This preserves our zero-dependency architecture and is more maintainable long-term.

**Provider abstraction from day 1:** While GitHub-only on Day 1, the design documents cross-provider mapping (GitHub/ADO/GitLab). 033a shows each provider has equivalent operations. No future architectural rework needed.

---

## Prerequisites

**Brady must run before squad starts:**
```bash
gh auth refresh -s project
```

Grants `project` scope to the token. One-time interactive step, ~10 seconds. Verify:
```bash
gh auth status 2>&1 | grep "project"
```

If scope is missing at runtime, graceful degradation kicks in: board operations skip silently, user gets a message with fix instructions.

---

## Agent Assignments

- **Fenster (Core Dev):** WI-1 (validate GraphQL commands), WI-2 (provider interface), WI-4 (sync workflow)
- **Verbal (Prompt Engineer):** WI-3 (board init prompts), WI-5 (board query/display)
- **McManus (DevRel):** WI-6 (documentation)

---

## Risks Mitigated

| Risk | Mitigation |
|------|-----------|
| `gh project item-edit` ID handling unreliable | Phase 1 is a focused validation gate; if it fails, we reassess |
| Token scope becomes unavailable | Graceful degradation + clear user messaging |
| Board sync becomes noisy | Sync is label-driven and silent; no issue comments |
| GraphQL field IDs change per-project | Expected behavior; WI-1 documents 4-step discovery; team.md caches IDs |
| Prompt bloat in coordinator | Verbal's core skill; if needed, we split functionality |

---

## Next Steps

1. Brady grants `project` scope
2. Fenster begins Phase 1 (WI-1 validation)
3. After Phase 1 gate passes, Verbal + Fenster start Phase 2 in parallel
4. After Phase 2, Verbal + McManus start Phase 3 in parallel

---

## Decision Reference

Full proposal: `team-docs/proposals/033-project-boards.md`  
API assessment: `team-docs/proposals/033a-projects-v2-api-assessment.md`  
GitHub issue: Issue #6 (londospark)  
Public comment: https://github.com/bradygaster/squad/issues/6#issuecomment-3888277477



---

### 2026-02-11: Squad Notification Architecture — MCP Integration Pattern

**By:** Keaton (Lead)

**What:** Squad agents can notify humans via external channels (Teams, iMessage, Discord, webhooks) when work is blocked, errors occur, or decisions are needed. Implemented as an MCP integration pattern — Squad ships ZERO notification infrastructure.

**Why:**

1. **Brady's vision:** "It needs to feel like I'm not in the team room, they are, and they need me so they pinged me." When agents hit a wall requiring human input, they should ping the human's phone, not just pause in the terminal.

2. **MCP integration preserves Squad's architecture:** Zero dependencies, filesystem-authoritative, git-native. The consumer brings their own notification MCP server (Teams, iMessage, etc.). Squad teaches agents WHEN and HOW to notify via a skill at `.ai-team/skills/human-notification/SKILL.md`.

3. **Platform-agnostic design:** Works with ANY notification MCP server — Teams (primary path), iMessage (Mac-only secondary), Discord, generic webhooks. Squad never hardens against a specific platform. When new platforms emerge (Slack, Mattermost, Signal), the consumer installs the right MCP server and Squad's skill detects the tools automatically.

4. **Zero maintenance burden:** The consumer owns the MCP server, credentials, and delivery mechanism. When Teams changes their API, the MCP server maintainer updates the server — not Squad. Squad just teaches the notification pattern and lets the platform handle delivery.

5. **Graceful degradation:** If no MCP server is configured, agents log the notification attempt and continue. Notifications are an enhancement, not a requirement. Squad works perfectly without them.

**Architecture:**

- **Layer 1:** Notification skill (`.ai-team/skills/human-notification/SKILL.md`) teaches agents when to ping (BLOCKED, ERROR, DECISION, COMPLETE) and how to compose rich, agent-branded notifications.
- **Layer 2:** MCP tool abstraction — agents detect which notification tools are available (`send_teams_message`, `send_imessage`, `post_webhook`) and use the right format for each platform.
- **Layer 3:** Consumer's MCP server (configured in `.vscode/mcp.json`, VS Code settings, etc.) handles actual delivery.

**Message format (platform-agnostic):**

- **Who:** Agent name + emoji (Keaton 🏗️)
- **Why:** Type badge (🚫 BLOCKED, ⚠️ ERROR, 🤔 DECISION, ✅ COMPLETE)
- **Context:** Brief explanation (1-2 sentences)
- **Action:** What the human should do next
- **Link:** URL to GitHub issue/PR/proposal if applicable

**Platform-specific renderers:**

- **Teams:** Adaptive Card JSON with color-coded theme (red for ERROR, orange for BLOCKED, blue for DECISION, green for COMPLETE)
- **iMessage:** Plain text with emoji and signature
- **Webhook:** Structured JSON payload that consumer routes to their chosen backend (Slack, Discord, SMS, push notifications)

**Integration with existing features:**

- **Human Team Members:** When work routes to a human team member, the assigned agent sends a BLOCKED notification on their behalf.
- **Ralph (Work Queue Monitor):** Ralph can escalate stale work via notifications (opt-in — default OFF).
- **Coordinator Handoffs:** When an agent returns blocked, the coordinator triggers the notification BEFORE prompting the user in terminal (ensures Brady gets the ping even if not watching terminal).

**Primary path: Microsoft Teams**

Brady said Teams is "ideal, especially per-repo channels." Teams channels-within-a-Team map perfectly to repos. Microsoft ships official MCP support: `@microsoft/teams.mcp` npm package and https://github.com/microsoft/IF-MCP-Server-for-Microsoft-Teams. Setup: create Incoming Webhook URL, configure MCP server, Squad detects `send_teams_message` tool and sends Adaptive Cards.

**Secondary path: iMessage (Mac-only)**

Zero account setup, instant delivery, native to Apple ecosystem. Limitations: requires macOS with Messages.app running, cannot run headless. MCP server exists: `imessage-mcp` or `imsg` CLI tool. Squad detects `send_imessage` tool and sends plain text with agent signature.

**Trade-offs:**

- **No auto-configuration:** Consumer must manually wire up MCP server and credentials. This is a setup burden but preserves Squad's zero-dependency constraint.
- **Single channel per repo:** All notifications from a repo go to ONE configured channel/recipient. Per-agent channels would fragment the notification stream (Brady doesn't want to monitor 5 channels per repo).
- **COMPLETE notifications opt-in:** Completion notifications can be noisy. Default is OFF. Consumers enable explicitly if they want visibility into finished work.

**Sprint estimate:** 1.8 squad-days (core) + 0.3 squad-days (Ralph integration, optional). Target version: 0.3.0 (alongside GitHub-native proposals).

**Success criteria:**

1. Notification skill exists at `.ai-team/skills/human-notification/SKILL.md`
2. Skill teaches all four trigger types (BLOCKED, ERROR, DECISION, COMPLETE)
3. `docs/notifications.md` exists with Teams and iMessage setup guides
4. Agents gracefully degrade when no MCP server configured
5. At least ONE real-world test: Brady configures Teams, receives notification from his squad

**Key file paths:**

- `team-docs/proposals/034-notification-architecture.md` — full design specification
- `.ai-team/skills/human-notification/SKILL.md` — agent-facing skill (teaches when/how to notify)
- Future: `docs/notifications.md` — consumer setup guide (Teams, iMessage, Discord, webhook walkthroughs)

**Future enhancements (post-0.3.0):**

- Discord support in primary docs (currently secondary tier)
- Slack support for enterprise customers
- Per-agent notification preferences (e.g., "only notify for Keaton's blockers")
- Digest mode (daily/weekly summary email instead of real-time pings)
- Two-way communication (reply to notification via Teams/iMessage and have Squad ingest response — requires connector architecture, not just MCP tools)


---

# Decision: Squad Notifications Consumer Documentation

**Status:** Completed  
**Decided by:** McManus  
**Date:** 2026-02-12

## What Was Decided

Created `docs/features/notifications.md` — consumer-facing documentation for "Squad Pings You," the feature allowing users to receive instant messages when agents need human input.

## Rationale

Brady's vision: "It needs to feel like I'm not in the team room, they are, and they need me so they pinged me." This doc translates that into practical setup paths and concrete examples of what notifications look like.

## Key Design Decisions

### Zero-Auth Paths Come First
- Teams Incoming Webhook (just a URL, no API setup) listed as "Option A"
- Official Teams MCP server (full Azure AD auth) listed as "Option B" for completeness
- This lowers barrier to entry for most users

### Show, Don't Tell
- All quick-start sections include actual JSON configuration examples
- Notification format section shows concrete message examples with emoji and structure
- Troubleshooting uses real error scenarios ("MCP server failed to start", "wrong channel receiving")

### Architecture Transparency
- Explicit section explaining: skill-based (not hard-coded), bring-your-own MCP server (not managed service)
- Notes that users can customize the `human-notification` skill for advanced use cases
- Links to `.vscode/mcp.json` standard config file location

### Trigger Control Upfront
- Configuration section explains how to selectively enable/disable notification types
- Quiet hours concept introduced for advanced setups
- Test command provided for validation

### Platform Realistic
- iMessage marked as "Mac Only" with clear limitations
- All paths (Teams, Discord, webhook) tested for completeness
- Acknowledges three-tier setup complexity (webhook URL → MCP config → environment variable)

## File Location

`docs/features/notifications.md` — placed alongside other feature docs (skills, ralph, memory, etc.)

## Style Adherence

- **Brady's "straight facts" directive:** No editorial voice, no hype words, every sentence states what/how/depends-on
- **Devrel vision:** First 5 minutes to value (webhook option gets you going fastest), then depth for power users
- **Tone:** "Here's how to set it up" not "isn't this cool"
- **Brevity:** Dev-skimmable format with tables, code blocks, and scannable lists

## Cross-References

Links to related docs:
- Skills System (`docs/features/skills.md`)
- Copilot Environment Setup (`docs/guide.md`)
- Model Selection (`docs/features/model-selection.md`)

No README changes required — notifications is a features doc, not a headline change.

## Follow-Up

Consider adding `notifications` to the "What's New" section in README.md if this is a v0.4.0 feature launch. Coordinate with Brady on feature status and visibility.

### 2026-02-13: go:/release: label automation

**By:** Fenster

**What:** Four-workflow system to automate `go:` (triage verdict) and `release:` (version target) label namespaces. Created `squad-label-enforce.yml` for mutual exclusivity enforcement; updated `sync-squad-labels.yml` to sync 8 static labels (3 go:, 5 release:); updated `squad-triage.yml` to apply `go:needs-research` as default verdict; updated `squad-heartbeat.yml` to detect issues missing go: labels and go:yes issues missing release: labels.

**Why:** Labels-as-automation is the foundation of Squad's GitHub-native workflow. The `go:` namespace (go:yes, go:no, go:needs-research) captures triage decisions; the `release:` namespace (release:v0.4.0, v0.5.0, v0.6.0, v1.0.0, release:backlog) captures delivery targets. Mutual exclusivity is business logic (exactly 1 go: label per triaged issue, at most 1 release: label per issue). Workflows enforce this at runtime, eliminating human error. The enforcement workflow handles label transitions: when a new go: or release: label is applied, it removes conflicting labels in the same namespace and posts a comment (only on actual changes). Special cases: `go:yes` auto-applies `release:backlog` if no release target exists (every approved issue must have a target); `go:no` strips release labels (rejected issues shouldn't be in release planning). Default verdict (`go:needs-research`) is applied by triage workflow to ensure every triaged issue enters the system with a go: label. Ralph (heartbeat) now scans for label hygiene: issues missing go: labels are surfaced as incomplete triage, go:yes issues missing release: labels are surfaced as incomplete planning. This is textbook "agentic DevOps" — labels are the state machine, automation is the enforcement layer.


### 2026-02-13: User directive
**By:** Brady (via Copilot)
**What:** Execution is the strategy. Take action, don't wait for permission. If the squad has questions on issues, leave a comment. If not, close research issues and create milestone-ready implementation issues. Optimize for taking action.
**Why:** User request — captured for team memory. Brady wants momentum, not planning paralysis.




### 2026-02-13: VS Code runSubagent spawning — platform parity and adaptation strategy (consolidated)

**By:** Keaton, Strausz, Kujan

**What:** VS Code is the #1 priority for Copilot client parity. Squad agent spawning via unSubagent in VS Code requires: (1) platform detection via tool availability (	ask = CLI, gent/unSubagent = VS Code), (2) custom .agent.md files per Squad role to replace CLI gent_type parameters, (3) prompt-based agent selection rather than structured spawn parameters. Key findings: parallel execution supported (multiple sub-agents run concurrently in VS Code); unSubagent is synchronous but covers Squad's Eager Execution via batch spawning; model selection differs (CLI has per-spawn model param, VS Code routes through .agent.md frontmatter); MCP tools are inherited by default in VS Code (opposite of CLI, net positive).

**Why — architectural (Keaton):** Issue #10 decomposition — Brady's directive prioritizes VS Code over JetBrains and GitHub.com (P2/deferred). VS Code dominates the market and has the most feature-complete Copilot integration (agent spawning, background tasks, file system access). Solving VS Code first unblocks patterns for other surfaces.

**Why — viability (Strausz):** Issue #32 spike on VS Code unSubagent API confirms it can replace CLI 	ask tool but requires platform detection and custom agent files. Coordinator needs conditional spawn logic to detect platform via tool availability, then use appropriate mechanism. Custom agent files provide finer control than CLI agent types (tool restrictions, model selection, visibility). This decision unblocks #33 (file discovery), #34 (model selection), #35 (compatibility matrix).

**Why — parity analysis (Kujan):** Full parameter catalog between CLI 	ask and VS Code unSubagent: prompt maps 1:1, parallel fan-out works both surfaces (CLI background mode, VS Code parallel sync subagents), model selection is the biggest gap. The 5 spawn patterns (standard, lightweight, explore, scribe, ceremony facilitator) all map successfully — only degradation is Scribe becoming synchronous (tolerable) and explore losing speed optimization (optional fix via custom agent file).

**Implementation strategy (consensus):**
- **Recommended approach:** Prompt-level platform detection in squad.agent.md coordinator — no abstraction layer needed
- **v0.4.0 MVP:** Accept session model for all agents, defer per-agent model selection
- **v0.4.x follow-up:** Generate custom agent files for per-agent model selection
- **Graceful degradation:** If neither 	ask nor gent tool available, coordinator works inline with warning

**Key technical findings:**
- unSubagent is synchronous but supports parallel batch spawning (multiple sub-agents in one turn run concurrently)
- No mode: "background" equivalent — Squad's Eager Execution works via parallel batch spawning instead
- Model selection via .agent.md model field (not spawn parameter) — experimental, requires VS Code setting
- MCP tool inheritance is DEFAULT in VS Code (opposite of CLI) — this is positive for Squad
- Detection strategy: check for 	ask tool (CLI) vs gent tool (VS Code) in available_tools
- Graceful degradation: if neither tool available, coordinator works inline

**Decomposition (sub-issues for v0.4.0):**
| Issue | Priority | Surface | Work |
|-------|----------|---------|------|
| #32 | P0 | VS Code | Test unSubagent as squad spawn mechanism |
| #33 | P0 | VS Code | Test agent file discovery & .ai-team/ access |
| #34 | P1 | VS Code | Model selection & background mode parity |
| #35 | P1 | VS Code | Compatibility matrix document |
| #36 | P2 | JetBrains + GitHub.com | Surface research (v0.5.0+ deferred) |

**Related decisions:**
- Per-agent model selection (024 consolidated) — VS Code must support model parameter
- GitHub-native planning (028) — Issues/PRs are assignment vehicle
- Release timeline (019) — v0.4.0 includes GitHub Issues + Project Boards; client parity incremental

**Success criteria:**
- Agent spawning works in VS Code via unSubagent
- .ai-team/ file discovery and access validated
- Model selection parameter support tested  
- Background/async execution mode documented
- Compatibility matrix published (VS Code 100%, others TBD)



---

# Decision: Agent Progress Updates — Milestone Signals + Coordinator Polling

**Decision Date:** 2026-02-13  
**Decided by:** Keaton (Lead)  
**Affects:** Proposal 022a (Issue #22), Coordinator (squad.agent.md), All Agent Types  
**Status:** Proposed (awaiting Brady approval, likely v0.4.0)

---

## The Question

**Issue #22 (bradygaster):** Users feel uncertain during long-running background agent work. The terminal goes quiet. How do we surface periodic progress updates that:
- Signal work is still happening
- Reflect agent personality (not generic "still working...")
- Don't slow down actual work (cost-first model)
- Work across all agent types (explore, task, general-purpose, code-review)

## The Decision

**Implement Milestone Signals + Coordinator Polling mechanism.**

### Architecture

```
Agent (working):
  - Emits output as usual (via console.log, file writes, etc.)
  - At natural breakpoints, emits: ✅ [MILESTONE] Analyzed 150/400 files
  - No file I/O, no special tools, no ceremony

Coordinator (polling loop, every 30s):
  - Calls read_agent(agent_id, wait: false) — get current partial output
  - Scans output for lines matching \[MILESTONE\]
  - For each new milestone (not previously shown):
    - Extracts milestone text
    - Outputs: 📍 {AgentName} — {milestone_text}
  - Continues polling until agent completes

User (watching terminal):
  - Sees "🏗️ Keaton is analyzing... I'll check in every 30s"
  - [30s] 📍 Keaton — ✅ Parsed 150/400 files
  - [30s] 📍 Keaton — 📍 Analyzing dependencies...
  - [45s] ✅ Keaton completed. Report:
    [full output]
```

### Why This Approach

| Criterion | Score | Notes |
|-----------|-------|-------|
| **Cost** | ⭐⭐⭐⭐⭐ | Reuses read_agent polling (1 API call per 30s per agent). No new infrastructure. |
| **Voice** | ⭐⭐⭐⭐⭐ | Agents control what's highlighted. Not coordinator-paraphrased progress. |
| **Adoption** | ⭐⭐⭐⭐⭐ | Zero agent code changes. Skill-based documentation (opt-in). Backward compatible. |
| **UX** | ⭐⭐⭐⭐⭐ | 30s cadence is industry standard. Users see "work is progressing" without noise. |
| **Complexity** | ⭐⭐⭐⭐ (low) | ~30 lines in coordinator. Regex extraction. No file I/O. |

### Alternatives Rejected

- **Polling only (no milestone signal):** Coordinator tells user "still working every 30s" — generic, not agent personality
- **File-based progress:** Agents write to `.ai-team/progress/{agent}.md` — file coordination overhead, requires agent discipline, merge conflicts possible
- **Event drop-box:** Agents write JSON events to `.ai-team/progress-events/` — over-engineered, unnecessary file handles, higher latency
- **Real-time streaming:** Would require WebSocket or event subscription — incompatible with read_agent polling model, adds infrastructure

### Implementation Plan

**Coordinator changes (squad.agent.md):**
1. Add progress polling loop to spawn → completion flow
2. Call `read_agent(agent_id, wait: false)` every 30s while agent is running
3. Extract lines matching `\[MILESTONE\]` from output
4. Display new milestones with agent name and emoji

**Skill creation (.ai-team/skills/progress-signals/SKILL.md):**
1. Document when to use milestone signals (any work > 30 seconds)
2. Show pattern: `console.log("✅ [MILESTONE] {message}")`
3. Emoji conventions: ✅ completed, 📍 in-progress, 🔴 error, 🤔 thinking
4. Do's and don'ts (not every log line, keep < 80 chars, etc.)

**No agent code changes required.** Agents that don't emit milestones still get "still working..." fallback messages every 30s. Adoption is gradual.

### Compound Value

This decision unlocks downstream features:

1. **With Proposal 034 (Notifications):** Agent can emit `🔴 [MILESTONE] Blocked on decision` → Coordinator can trigger human notification
2. **With Squad DM:** Progress milestones can sync to Discord channel as reactions or embeds
3. **With Proposal 028 (GitHub-native planning):** Milestones can auto-comment on GitHub Issues in progress
4. **Future: Agent negotiation:** Agents can emit `⚠️ [MILESTONE] Conflict detected` → Coordinator initiates agent conversation

Visible progress is foundational for agent-user intimacy. It answers "Are they working for me or with me?"

---

## Success Criteria

- [ ] Coordinator extracts milestones correctly from 10+ common formats
- [ ] Agents adopt pattern within 1-2 spawns of first use
- [ ] No performance degradation: read_agent polling < 100ms overhead per call
- [ ] Works across all agent types without modification
- [ ] Users report less uncertainty during 2+ minute tasks (post-launch feedback)
- [ ] Milestone signal appears in at least 3 agent specs by v0.4.0 close

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Agents forget to emit milestones | Medium | Skill documentation + spawn template examples |
| Coordinator extracts false positives | Low | Strict regex: `\[MILESTONE\]` (hard to accidentally match) |
| Polling latency (30s) feels too slow | Low | Industry standard; documented as tunable per agent |
| read_agent output accumulates too large | Low | Milestones are 1-2 lines; total overhead < 10KB |
| Users get milestone fatigue | Low | Deduplication + one milestone per 30s discipline |

---

## Timeline

- **Proposal review:** 48-72 hours (standard)
- **Implementation (if approved):** 3-4 squad-hours
  - Fenster: Coordinator polling loop (1.5h)
  - Verbal: Skill design + agent examples (1.5h)
  - Testing: Validation across agent types (1h)
- **Target release:** v0.4.0 (after Project Boards)

---

## Related Proposals

- **Proposal 034:** Notification architecture (Teams, iMessage, webhook) — notifications triggered by agent state
- **Proposal 017/030/030a:** Async comms (Squad DM) — milestones can surface in Discord/Teams
- **Proposal 028:** GitHub-native planning — milestones can comment on issues
- **Issue #22:** Community request for progress visibility during long-running work

---

## Next Steps

1. **Brady's approval:** Is this the right design? Any modifications?
2. **Verbal's feedback:** How should the skill be documented? What examples?
3. **Fenster's estimate:** Any gotchas in the coordinator implementation?
4. **Implementation:** Parallel work on coordinator + skill
5. **Testing:** Validate across explore, task, general-purpose, code-review agents
6. **Release:** v0.4.0 (bundled with Project Boards feature)



---

# Decision: VS Code Model & Background Parity Strategy

**By:** Kujan
**Date:** 2026-02-14
**Issue:** #34
**Proposal:** 034a

## Decision

VS Code model selection and background mode parity follows a three-phase approach:

1. **Phase 1 (v0.4.0):** Accept session model for all VS Code spawns. Use `runSubagent` (anonymous). No custom agent files required. Parallel sync subagents replace background mode.

2. **Phase 2 (v0.5.0):** Generate model-tier `.agent.md` files during `squad init` — `squad-fast` (haiku), `squad-standard` (sonnet), `squad-premium` (opus). Use `agent` tool to invoke named agents for model control.

3. **Phase 3 (v0.6.0+):** Per-role agent files if custom agent subagent support stabilizes out of experimental.

## Key Constraints

- `runSubagent` does NOT accept `model` param — frontmatter only
- VS Code "Background Agents" ≠ CLI `mode: "background"` — different concept entirely
- `chat.customAgentInSubagent.enabled` is still experimental
- Model names differ: CLI uses API names, VS Code uses display names with `(copilot)` suffix

## What This Means for the Team

- **Fenster:** When implementing VS Code spawn logic in `squad.agent.md`, use prompt-level conditional instructions (§5 of proposal). No code-level abstraction.
- **Verbal:** Spawn templates need VS Code-specific variants. Key differences: drop `mode`, `model`, `agent_type`, `description` params. Add "batch Scribe last" rule.
- **Keaton:** Phase 2 requires `squad init` to detect VS Code and generate `.agent.md` files. Plan for v0.5.0.


---

# Decision: VS Code File Discovery and .ai-team/ Access Requires No Code Changes

**Author:** Strausz
**Date:** 2026-02-15
**Issue:** #33

## Decision

Squad's file discovery and `.ai-team/` access work in VS Code with zero code changes to `squad.agent.md`. The instruction-level abstraction (describing operations like "read this file" rather than hardcoding tool names like `view` or `readFile`) naturally works across both CLI and VS Code surfaces.

## Rationale

- VS Code auto-discovers `squad.agent.md` from `.github/agents/` — same location CLI uses
- Sub-agents inherit file tools by default — better than CLI (more tools available)
- Path resolution via `git rev-parse --show-toplevel` works in VS Code via `runInTerminal`
- All `.ai-team/` read/write operations are supported via VS Code's built-in tools

## Constraints Documented

- Multi-root workspaces: NOT supported for Squad (known VS Code bugs). Single-root only.
- Workspace Trust: Must be enabled. Document as prerequisite.
- First-session approval: Users see tool approval prompts on first file write. Document in onboarding.
- `sql` tool: CLI-only. Avoid in VS Code codepaths.

## Optional Enhancement (Not Blocking)

A small VS Code compatibility note can be added to `squad.agent.md` covering workspace scope, `sql` absence, and approval UX. This is recommended but not required for functionality.



---

# Decision: Client Parity Compatibility Matrix

**Date:** 2026-02-15  
**Owner:** McManus (DevRel)  
**Status:** Implemented  
**Related:** Issue #35, Proposals #032a, #032b, #033a, #034a  

## Summary

Created `docs/scenarios/client-compatibility.md` as the single source of truth for what Squad features work on each Copilot surface (CLI, VS Code, JetBrains, GitHub.com).

## Rationale

**Community clarity need:** Issue #9 (reporter: miketsui3a) and #10 asked for documentation on cross-client support. Developers trying Squad on VS Code or other surfaces need to know what works where without trial-and-error or searching scattered spikes.

**Spike findings ready:** Four research proposals (032a–034a) contain production-grade findings from February spikes. Synthesizing them into one document prevents knowledge silos and gives developers a single reference point.

**Developer-first structure:** Matrix format (quick reference) + detailed per-platform sections + adaptation guide enables self-service troubleshooting. No need to file issues or ask in discussions.

## Key Decisions Documented

1. **CLI is primary:** Full feature support, recommended for learning and setup.

2. **VS Code works:** With adaptations.
   - Sub-agents are sync but parallel when spawned in one turn (functionally equivalent to CLI's background mode).
   - Session model by default (Phase 1). Custom agent frontmatter for Phase 2.
   - File access works (workspace-scoped).
   - Scribe batching pattern: put Scribe last in parallel groups.

3. **JetBrains/GitHub untested:** Documented as `?` (unknown). Links to pending spikes #12, #13.

4. **SQL is CLI-only:** Avoids confusion about cross-platform SQL workflows.

5. **File discovery works everywhere:** `.github/agents/squad.agent.md` auto-discovered on all platforms tested.

6. **Straight facts tone:** No editorial framing, no "amazing" language. Every statement specifies what a feature is, how it works, or what replaces it.

## Structure

- **Quick Reference Matrix** — One table with ✅/⚠️/❌/? for all features
- **Per-Platform Details** — CLI (full), VS Code (conditional), JetBrains (unknown), GitHub (unknown)
- **Platform Adaptation Guide** — When to use which surface + feature degradation table for developers building cross-platform coordinators
- **Investigation Status** — Links to spike proposals for deep dives
- **See Also** — Cross-references to related feature docs (model selection, parallel execution, worktrees)

## Navigation

- Added to `docs/README.md` under "Operations" section (first item for discoverability)
- Link: [Client Compatibility Matrix](scenarios/client-compatibility.md) — What works on CLI, VS Code, JetBrains, GitHub.com

## Impact

- ✅ Developers get one document instead of reading 4 proposals
- ✅ Community questions about "does this work on VS Code?" have a documented answer
- ✅ Sets foundation for Phase 2 (custom agent generation) and Phase 3 (per-role agent files)
- ✅ Enables Brady to point to facts-based matrix when discussing cross-client strategy

## Future Work

- Spike #12 (JetBrains investigation) — populate `?` cells, determine if agent spawning supported
- Spike #13 (GitHub investigation) — populate `?` cells, assess GitHub's agent orchestration capabilities
- Phase 2 (v0.5.0) — Generate custom `.agent.md` files during `squad init` for model-tier selection on VS Code
- Empirical testing — Verify VS Code has the silent success bug (P0 from Proposal 015) or can omit Response Order workaround


## Decision: Projects V2 Phase 1 Gate — PASSED

**Date:** 2026-02-15  
**Author:** Fenster  
**Context:** Issue #6, Proposal 033 WI-1 + WI-2

### Decision

GitHub Projects V2 board operations are fully implementable using gh project * CLI commands with zero npm dependencies. Phase 1 validation is complete. Phase 2 (coordinator prompts + label-to-board sync workflow) is unblocked.

### Key Facts

1. All 10 gh project * commands validated live against bradygaster/squad.
2. project token scope already present — no gh auth refresh needed for this repo.
3. The 4-step field discovery pipeline (list → field-list → extract Status → cache IDs) is reliable and repeatable.
4. item-edit requires 4 opaque IDs — this is the main complexity. IDs are stable after creation.
5. item-add is idempotent — safe to re-add existing issues.
6. No raw GraphQL needed. gh project subcommands cover 100% of required operations.

### Artifacts Created

- **SKILL.md:** .ai-team/skills/github-projects-v2-commands/SKILL.md — complete command reference
- **Proposal:** 	eam-docs/proposals/006a-project-board-implementation.md — provider abstraction + capabilities interface
- **Issue comment:** Posted findings to issue #6

### What This Unblocks

- WI-3: Board initialization flow (Verbal)
- WI-4: Label-to-board sync workflow (Fenster)
- WI-5: Board query & display (Verbal)

### 2026-02-15: Client Compatibility section added to squad.agent.md
**By:** Verbal
**What:** Added a "Client Compatibility" coordinator instruction section to `.github/agents/squad.agent.md` as the v0.4.0 deliverable for issue #10. The section includes platform detection logic (CLI/VS Code/fallback), VS Code spawn adaptations (9 behavioral changes), a feature degradation table (6 rows), and a SQL tool caveat. Both Background and Sync spawn templates were annotated with VS Code equivalents via blockquote callouts. Source data from proposals 032a, 032b, 033a, 034a and the compatibility matrix at `docs/scenarios/client-compatibility.md`.
**Why:** The coordinator needs actionable instructions for cross-platform spawning. Without this section, `squad.agent.md` only knows CLI patterns — a VS Code coordinator would attempt `task` tool calls, fail, and have no fallback. The section is placed between Per-Agent Model Selection and Eager Execution Philosophy because platform detection logically gates how spawning, model selection, and parallelism work. Prompt-level conditional instructions (not a code abstraction layer) is the team-agreed approach from proposal 032b §8.

### 2026-02-13: User directive
**By:** Brady (via Copilot)
**What:** In VS Code, individual squad agents should show up with different emoticons in the agent picker. When generating per-agent .agent.md files (Phase 2 of client parity), include role-specific emoji in the agent name field (e.g., name: "🔧 Fenster", "🧪 Hockney").
**Why:** User request — captured for team memory. This makes the VS Code experience feel more alive and distinguishable when multiple agents are available.

### 2026-02-13: User directive — Emoji identity in CLI spawn descriptions
**By:** Brady (via Copilot)
**What:** Agent role emoji should be prepended to the `description` field in CLI `task` tool spawns. E.g., `"🔧 Fenster: refactoring auth module"` instead of `"Fenster: refactoring auth module"`. The roster already maps emoji to roles (🏗️ Lead, 🔧 Core Dev, ⚛️ Frontend, 🧪 Tester, 📝 DevRel, ✏️ Prompt Engineer, 📋 Scribe, 🔄 Ralph). Carry them into spawn descriptions.
**Why:** User request — captured for team memory. Extends the VS Code emoji directive to CLI. Both platforms should show agent identity with role emoji.

