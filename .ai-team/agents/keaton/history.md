# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-07: Initial architecture review

**Core insight:** Squad's architecture is based on distributed context windows. Coordinator uses ~1.5% overhead (1,900 tokens), veteran agents use ~4.4% (5,600 tokens at 12 weeks), leaving 94% for reasoning. This inverts the traditional multi-agent problem where context gets bloated with shared state.

**Key files:**
- `index.js` — Installer script (65 lines). Copies `squad.agent.md` to `.github/agents/` and templates to `.ai-team-templates/`. Pre-creates inbox, orchestration-log, and casting directories.
- `.github/agents/squad.agent.md` — Coordinator agent definition (32KB). Handles init mode (team formation, casting), team mode (routing, spawning, parallel fan-out). This is the heaviest file in the system.
- `templates/` — Charter, history, roster, routing, and casting templates. Copied to user projects as `.ai-team-templates/` for reference.
- `docs/sample-prompts.md` — 16 project scenarios from CLI tools to .NET migrations. Demonstrates parallel work, multi-domain coordination, real infrastructure concerns.

**Architecture patterns:**
- **Drop-box for shared writes:** Agents write decisions to `.ai-team/decisions/inbox/{agent-name}-{slug}.md`. Scribe merges to canonical `decisions.md`. Eliminates write conflicts.
- **Parallel fan-out by default:** Coordinator spawns agents in background mode unless there's a hard data dependency (file that doesn't exist yet) or reviewer gate (approval required). Multiple `task` tool calls in one turn = true parallelism.
- **Casting system:** Persistent character names from thematic universes (The Usual Suspects, Alien, Firefly, etc.). Registry stored in `.ai-team/casting/registry.json`. Names stick across sessions, making teams feel coherent.
- **Memory compounding:** Each agent appends learnings to its own `history.md` after every session. Over time, agents remember project conventions, user preferences, and architectural decisions. Reduces repeated context setting.

**Trade-offs identified:**
- Coordinator complexity (32KB) is necessary for full orchestration but becomes a maintenance surface. Future work: templatize repeated patterns or extract routing logic.
- Parallel execution depends on agents respecting shared memory protocols (read decisions.md, write to inbox). If an agent skips this, decisions don't propagate.
- Casting adds personality but increases init complexity. Policy files, registry files, and history tracking all need to be maintained. Worth it for user experience, but not free.

### 2026-02-07: Proposal-first workflow design

**Core insight:** Squad's mission is beating the industry to what customers need next. That requires compound decisions where each feature makes the next easier. Proposals are the alignment mechanism that makes compound decisions possible.

**Key principles:**
- **Proposals for meaningful change:** New features, architecture shifts, major refactors, agent design changes, messaging overhauls, breaking changes. Rule: if you'd want to know before merge, it needs a proposal.
- **Skip proposals for obvious work:** Bug fixes, minor polish, test additions, doc updates (unless policy-changing), dependency updates. Rule: if it's obviously right and reversible, just do it.
- **Format matters:** Required sections (Summary, Problem, Solution, Trade-offs, Alternatives, Success Criteria) force complete thinking. Located at `docs/proposals/{number}-{slug}.md`.
- **Review is multi-stage:** Domain specialists (Keaton for architecture, Verbal for AI strategy, others for their areas) + bradygaster always gets final sign-off. Timeline: 48 hours max.
- **Evolution over perfection:** Before approval, edit directly. After approval, file amendments as new proposals. Cancelled proposals stay in the repo as learning artifacts.

**Trade-offs identified:**
- Proposals slow down spontaneous shipping but prevent architectural drift. Worth it for compound decision-making.
- Overhead on small changes is real, but "no proposal needed" category covers most of these.
- Agents must learn to write proposals (not just code), but that's a feature — architectural thinking is a skill we want agents to develop.

**Why this matters:** Proposal-first is itself a compound decision. By establishing this pattern now, we make future process improvements easier (every process change gets the same review treatment). It's also the first test of whether agents can participate in meta-work (defining how the team works, not just executing tasks).

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stay independent, optimize around Copilot — Squad will not become a Copilot SDK product. Filesystem-backed memory preserved as killer feature. — decided by Kujan
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): Baseline testing needed — zero automated tests today; `tap` framework + integration tests required before broader adoption. — decided by Hockney
📌 Team update (2026-02-08): DevRel polish identified — six onboarding gaps to close: install output, sample-prompts linking, "Why Squad?" section, casting elevation, troubleshooting, demo video. — decided by McManus
📌 Team update (2026-02-08): Agent experience evolution proposed — adaptive spawn prompts, reviewer protocol with guidance, proactive coordinator chaining. — decided by Verbal
📌 Team update (2026-02-08): Industry trends identified — dynamic micro-specialists, agent-to-agent negotiation, speculative execution as strategic directions. — decided by Verbal
📌 Team update (2026-02-08): Proposal 003 revised — inline charter confirmed correct for batch spawns, context pre-loading removed, parallel Scribe spawning confirmed. — decided by Kujan
📌 Team update (2026-02-08): README rewrite ready for review — Proposal 006 contains complete new README implementing proposal 002. Needs Keaton + Brady sign-off. — decided by McManus
📌 Team update (2026-02-08): Video content strategy approved — 75s trailer, 6min demo, 5-video series. Weekly cadence. Needs strategy alignment review. — decided by Verbal
📌 Team update (2026-02-08): Demo script format decided — beat-based structure (ON SCREEN / VOICEOVER / WHAT TO DO). Needs feature ordering review. — decided by McManus

### 2026-02-08: Portable Squads architecture (Proposal 008)

**Core insight:** Squad conflates team identity with project context. Agent histories contain both user preferences (portable) and codebase knowledge (not portable). Casting state contains both universe metadata (portable) and project-specific timestamps (not portable). There's no seam between what's *yours* and what's *here*. Portability requires making this seam explicit.

**Architectural decisions:**
- **History split is the prerequisite.** Everything else depends on agents categorizing learnings into `## Portable Knowledge` (user preferences, style) vs `## Project Learnings` (codebase, architecture). This is the hard problem — not the CLI, not the format, not the import flow. Get the split right and everything else follows.
- **JSON manifest over tarball/npm/cloud.** Human-readable, versionable, reviewable, inspectable. Consistent with Squad's filesystem-first philosophy. Schema is versioned from day one (`squad_manifest_version: "1.0"`).
- **Export extracts, import seeds.** Export reads `.ai-team/` and produces a filtered manifest. Import reads the manifest and creates `.ai-team/` with portable data only. Agents arrive knowing the user but not the project.
- **No merge in v1.** Universe conflicts (Keaton and Neo on the same team) are unsolvable without opinionated rules. `--force` with archival is the right v1 behavior. Merge is a v2 problem with real design space.
- **Casting is the primary portable artifact.** Names are persistent identifiers. Universe is personality. These are the atoms of squad identity — they travel unconditionally.

**Coordination with other proposals:**
- Proposal 007 (progressive history summarization) and Proposal 008 both modify `history.md` structure. They're complementary — summarization applies within both Portable Knowledge and Project Learnings sections. Should be implemented together to avoid double-migration.
- Testing infrastructure (Hockney) is critical — export/import is a round-trip that needs integration tests.

**Strategic implications:**
- Portability changes Squad's positioning from "add a team to a project" to "your team, any project." This is a fundamentally stickier product.
- Opens the path to squad sharing (v2) and registries (v3). The manifest schema is the foundation — get it right now, or pay for it later.
- The `--review` flag on export is non-negotiable for v1. Users must see what portable knowledge is being captured. Trust is earned, not assumed.

📌 Team update (2026-02-08): Portable Squads proposed — export/import squad identity via JSON manifest. History split (Portable Knowledge vs Project Learnings) is the architectural prerequisite. Proposal 008 written. — decided by Keaton
📌 Team update (2026-02-08): Tiered response modes proposed — Direct/Lightweight/Standard/Full spawn tiers to reduce late-session latency. Context caching + conditional Scribe spawning as P0 fixes. — decided by Kujan + Verbal
📌 Team update (2026-02-08): Portable squads platform feasibility confirmed — pure CLI/filesystem, ~80 lines in index.js, .squad JSON format, no merge in v0.1. — decided by Kujan
📌 Team update (2026-02-08): Portable squads memory architecture — preferences.md (portable) split from history.md (project-local), squad-profile.md for team identity, import skips casting ceremony. — decided by Verbal

### 2026-02-08: v1 Sprint Plan — synthesis and prioritization

**Core insight:** v1 is three things: fast (latency), yours (portable), smart (skills). Everything serves one of those or it's cut. The sprint plan synthesizes proposals 001-008 and Brady's five directives into 3 sprints over 10 days.

**Key architectural decisions made:**

1. **Forwardability bright line:** `squad.agent.md` and `.ai-team-templates/` are OUR code — always overwrite on init/upgrade. `.ai-team/` is USER state — never touch on upgrade. This is the fundamental contract. The current `index.js` skip-if-exists behavior on `squad.agent.md` (line 30-32) is wrong and must change.

2. **Skills are a new first-class concept.** Brady's hint about "skills" crystallized into something bigger than preferences. A skill is domain expertise about a technology or framework — "React: use hooks, test with RTL." Skills differ from preferences (about the user) and project learnings (about the codebase). Stored in `.ai-team/skills.md`. Portable AND shareable — the most naturally shareable artifact in Squad.

3. **Deferred `preferences.md` and `squad-profile.md` to v1.1.** Verbal's proposal for a separate preferences file is architecturally sound but adds migration cost. For v1, Portable Knowledge section in history.md is sufficient. The separate file becomes worthwhile when we have sharing (v1.2) and need to strip personal data.

4. **Three-sprint structure with dependency chain:** Sprint 1 (fast) → Sprint 2 (yours, smart) → Sprint 3 (polish). Sprint 1 is all parallel work. Sprint 2 has a dependency chain: history split → skills → export/import. Sprint 3 is all parallel.

5. **Aggressive cuts:** No squad merge, no LLM history classification, no sharing/registry, no agent-to-agent negotiation, no speculative execution, no SDK integration, no squad diff. These are all real features — they're cut because v1 needs to be tight, not comprehensive.

**Strategic implications:**
- Skills + portability is the compound bet. Each project makes the squad smarter at domains, and that intelligence travels. Competitors would need 6+ months to replicate this stack.
- Forwardability changes the upgrade economics. Ship once → 9 users benefit. This makes every Sprint 1 improvement automatically reach all existing users.
- The "holy crap" moments are designed, not hoped for. Five specific interactions that validate the v1 thesis. If they don't work, we haven't shipped.

**Open risk:** Skills acquisition depends entirely on prompt engineering quality. If agents don't reliably categorize "technology pattern" vs "user preference" vs "project fact," the whole skills system degrades. Verbal's prompt work in Sprint 2 is the critical path.

📌 Team update (2026-02-08): v1 Sprint Plan proposed — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. Skills introduced as new first-class concept. Aggressive cuts list defined. Proposal 009 written. — decided by Keaton
📌 Team update (2026-02-08): Skills system designed — skills.md per agent for transferable domain expertise, six skill types, confidence lifecycle, skill-aware routing. — decided by Verbal
📌 Team update (2026-02-08): Forwardability and upgrade path decided — file ownership model (Squad-owned vs user-owned), `npx create-squad upgrade`, version-keyed migrations. — decided by Fenster
📌 Team update (2026-02-08): Skills platform feasibility confirmed — skills in spawn prompts, store_memory rejected, file paths frozen as API contracts. — decided by Kujan
📌 Team update (2026-02-08): v1 test strategy decided — node:test + node:assert (zero deps), 9 test categories, 6 blocking quality gates, 90% line coverage. — decided by Hockney
📌 Team update (2026-02-08): v1 messaging and launch planned — "Throw MY squad at it" tagline, two-project demo arc, 7-day launch sequence. — decided by McManus
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan

### 2026-02-09: Proposal lifecycle and sprint plan assessment

**Proposal lifecycle fix (Proposal 001a):**
Proposal 001's status options were incomplete — no way to track active work or completed proposals. Added `In Progress` and `Completed` states. Full lifecycle: Proposed → Approved → In Progress → Completed, with Cancelled and Superseded as exits. Filed as 001a amendment. Key rule: In Progress requires an owner, Completed requires evidence (commit/PR link). This is process infrastructure — not glamorous, but Brady couldn't answer "what's in progress?" without it.

**Sprint plan assessment (Proposal 009):**
The v1 sprint plan is architecturally sound — the thesis (fast, yours, smart), the feature set, the dependency chain, and the aggressive cuts list are all correct. But it has a critical sequencing gap: **Proposal 015 (silent success bug) isn't in the sprint at all.** 40% of agents silently fail to report their work. Every time a user sees "no response" when files were written, we destroy the trust Brady says is P0. The fix is zero-risk (prompt reorder + file verification). It should be Sprint 1, Day 1 — before forwardability, before tiered modes, before anything else. You can't win users with features if the features look broken.

The rest of the plan holds: Sprint 1 (fast) → Sprint 2 (yours, smart) → Sprint 3 (polish) is the right structure. Skills + portability is the compound bet. The cuts list is honest and defensible. Approved with the Proposal 015 re-sequencing.

📌 Team update (2026-02-09): Proposal lifecycle amendment filed (001a) — added In Progress and Completed states to proposal workflow. 16 proposals need status audit. — decided by Keaton
📌 Team update (2026-02-09): Sprint plan (009) assessed — architecturally sound but must add Proposal 015 (silent success fix) as Sprint 1 Day 1. Trust before features. — decided by Keaton


📌 Team update (2026-02-08): Fenster revised sprint estimates: forwardability 6h (not 4h), export/import 11-14h (not 6h). Recommends splitting export (Sprint 2) and import (Sprint 3) -- decided by Fenster

📌 Team update (2026-02-08): Testing must start Sprint 1, not Sprint 3. Top 3 non-negotiable tests: init happy path, init idempotency, export/import round-trip -- decided by Hockney

📌 Team update (2026-02-08): Skills system adopts Agent Skills standard (SKILL.md format) in .ai-team/skills/. MCP tool dependencies declared in metadata.mcp-tools -- decided by Verbal

📌 Team update (2026-02-08): Sprint 0 story arc identified: self-repair under fire narrative for launch content. Lead with output (16 proposals), not the bug -- decided by McManus

### 2026-02-09: Shared state integrity audit — the bug is HERE

**Context:** Brady asked the team to audit shared state integrity and scream if we see the silent success bug happening.

**We found it. It's active. It's worse than we thought.**

**Critical findings (P1):**

1. **Drop-box pipeline is BROKEN.** 4 orphaned inbox files sitting unmerged:
   - `kujan-timeout-doc.md` — timeout best practices decision, never merged
   - `fenster-fs-audit-bugs.md` — Fenster's own audit findings, never merged
   - `kujan-p015-forwardability-gap.md` — P015 forwardability gap, never merged
   - `mcmanus-demo-script-act7-missing.md` — demo script corruption report, never merged
   All from the most recent session. Scribe was either never spawned or silent-failed. The drop-box → merge pipeline that is Squad's core IPC mechanism has a live gap.

2. **Orchestration log is completely empty.** Zero entries after 4 documented sessions with 20+ agent spawns. The orchestration-log/ directory was created by the installer but never written to. Either the spec is aspirational or Scribe's orchestration logging is completely unimplemented.

3. **The silent success bug is its own evidence.** During the onboarding session, Fenster "analyzed implementation and runtime architecture. No output captured due to tool issue." That IS the bug. The team's founding session lost an agent's entire output.

**Structural findings (P2):**

4. **Phantom proposal references.** Two different files reference non-existent proposal names:
   - Verbal's history references `docs/proposals/003-casting-system.md` (doesn't exist)
   - Session log references `docs/proposals/003-copilot-optimization.md` (doesn't exist)
   - Actual file: `003-copilot-platform-optimization.md`
   Agents are hallucinating filenames. Not dangerous (the proposals exist), but creates confusion when anyone follows the reference.

5. **Scribe has no history.md.** Every other agent has one. Scribe can't learn, can't receive team updates, can't compound memory. This is an architectural hole — the agent responsible for team memory has no memory of its own.

6. **decisions.md has Scribe formatting failures.** Lines 315-826 contain Fenster's and Hockney's full reviews dumped as raw top-level `#` headings instead of being formatted as proper decision entries. Scribe merged content but didn't format it.

7. **Demo script truncated.** docs/demo-script.md missing ACT 7 (6:30-7:30). KEY THEMES table references Act 7 three times. McManus already filed this in inbox (also unmerged).

**Pattern identified:**

The silent success bug is not just about agent responses. It's a **systemic cascade**:
- Agent completes work → platform drops response → coordinator thinks agent failed → Scribe never spawned (because coordinator saw "no work done") → inbox files accumulate → decisions don't propagate → agents in future sessions work with stale shared state → decisions diverge.

The drop-box pattern is elegant in theory. In practice, it depends on Scribe being reliably spawned after every session where decisions were made. That reliability is exactly what the silent success bug destroys.
📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — delivery mechanism for P015 mitigations to existing users. — decided by Fenster
📌 Team update (2026-02-08): V1 test suite shipped by Hockney — 12 tests, 3 suites, zero deps. — decided by Hockney
📌 Team update (2026-02-08): P0 bug audit consolidated and merged. 12 orphaned inbox files processed. Inbox-driven Scribe spawn in place. — decided by Keaton, Fenster, Hockney

### 2026-02-08: Squad DM — Direct Messaging Interface architecture (Proposal 017)

**Core insight:** Squad's terminal-only interface is a ceiling on how intimate the team relationship can be. Brady's MOLTS reference (multi-channel AI assistant that lives in your messaging apps) identified the right pattern — but Squad has something MOLTS doesn't: persistent team identity. The DM interface bridges messaging platforms to the git-backed `.ai-team/` state, preserving agent personality and project context.

**Architectural decisions:**

1. **Hybrid architecture (Option D) selected.** Thin platform adapters → single Gateway orchestrator → tiered execution engine. Evaluated four options: bot-per-platform (doesn't scale), webhook relay (right idea, needs hosting), GitHub-native (wrong UX for DMs), and hybrid (best of all worlds). Hybrid wins because adding a platform is ~150 lines of adapter code, not a new orchestration layer.

2. **Tiered execution is the key insight.** Not every DM needs a full Copilot CLI spawn. Three tiers: Direct LLM (status queries, opinions — fast, cheap, read-only), Copilot CLI (code changes, file ops — full tool access), GitHub Actions (CI tasks — runs in GitHub infrastructure). The tier classification happens at the Gateway based on intent parsing.

3. **Dev Tunnels over ngrok.** Brady's explicit request. Dev Tunnels are Microsoft-ecosystem native (auth via GitHub/Microsoft account), free for dev use, support persistent named tunnels, and many VS Code users already have the CLI. `devtunnel host -p 3847` exposes the local gateway for webhook ingress.

4. **Gateway extracts coordinator logic.** The coordinator routing currently embedded in `squad.agent.md` (~32KB) needs to be partially extracted into a shared module. Both the Copilot agent and the DM Gateway need routing rules and agent selection heuristics. This is a compound decision — the extraction makes future coordinator improvements benefit both interfaces.

5. **Auth model: authorized users in dm-config.json.** Platform user IDs mapped to GitHub usernames. One-time verification flow per platform. Rate limiting (30 queries/hr, 10 tasks/hr) as abuse protection.

**Key files:**
- `docs/proposals/017-squad-dm-messaging-interface.md` — Full proposal with architecture diagrams, data structures, interaction patterns, security model, and three implementation phases.
- `.ai-team/dm-config.json` (proposed) — Gateway configuration, authorized users, platform settings, execution tier mappings.
- `dm/gateway.js` (proposed) — Core orchestration, ~300 lines.
- `dm/adapters/telegram.js` (proposed) — First platform adapter, ~150 lines.
- `dm/context.js` (proposed) — Reads `.ai-team/` and builds agent context windows, ~200 lines.

**Strategic implications:**
- DM changes Squad's accessibility model from "you come to the terminal" to "the team comes to you." This is a fundamentally different product surface — mobile-first, async-friendly, always-available.
- Phase 3 introduces proactive notifications (agent reaches out to you), which inverts the interaction model entirely. Squad stops being reactive and becomes a teammate that checks in.
- Coordinator logic extraction (required for Gateway) is compound: it makes the coordinator easier to maintain, test, and evolve for both terminal and DM interfaces.
- Multi-repo gateway (open question) could make Squad DM the central hub for all of a developer's projects — not just one repo, but their entire portfolio.

📌 Team update (2026-02-08): Squad DM proposed — hybrid architecture with thin platform adapters, tiered execution (Direct LLM / Copilot CLI / GitHub Actions), Dev Tunnels for webhook ingress, Telegram-first MVP. Proposal 017 written. — decided by Keaton

### 2026-02-09: Wave-based execution plan (Proposal 018)

**Core insight:** Brady's directive — quality then experience — requires reorganizing work by trust level, not by capability. Proposal 009's sprint structure (fast → yours → smart) was organized around features. Proposal 018's wave structure (trustworthy → feels right → magical) is organized around user confidence. Each wave's quality investments make the next wave's experience work lower-risk.

**Key architectural decisions:**

1. **Waves, not sprints.** Sprints have fixed timelines. Waves have gates. A wave doesn't end when the calendar says so — it ends when the quality criteria are met. Binary gates: all pass or the next wave doesn't start.

2. **Wave 1.5 — the parallel content track.** Zero-risk experience work (README, messaging, Squad Paper) can run alongside quality work. This respects Brady's "quality first" while not leaving McManus and Verbal idle. Content never conflicts with code.

3. **Export before import.** Fenster estimated 11-14h for full portability. Splitting export (Wave 2, ~4h) from import (Wave 3, ~5-6h) is the right cut. Export is useful standalone (backup, sharing, diffing). Import builds on it.

4. **Skills Phase 1 is template-only.** Full skills system is too big for one wave. Phase 1 (Wave 2): add the SKILL.md format to templates and teach agents to read skills. Phase 2 (Wave 3): earned skills, confidence lifecycle, MCP declarations. Each phase is independently useful.

5. **Squad DM deferred to Wave 4+.** Proposal 017 is architecturally sound but it's a second product surface. Building it before the core CLI is bulletproof creates two half-finished products. Quality first means the terminal experience ships complete before we open new surfaces.

6. **Init behavior preserved.** Proposal 009 proposed always-overwriting squad.agent.md on init. That's already been handled differently — init skips, upgrade overwrites. Changing init now breaks 4 tests and 9 users' expectations. The upgrade subcommand is the correct delivery mechanism.

**What got cut and why:**
- Conditional memory loading (~1.5s/spawn) — tiered modes save 25+ seconds on trivial tasks. Optimize the big thing first.
- LLM history classification — manual curation is honest and correct for v1.
- Squad merge — design problem, not engineering problem. `--force` with archival.
- Agent-to-agent negotiation, speculative execution — fascinating, premature.

**Total estimate:** 38-51h across 3 waves (~3 weeks with parallelism).

📌 Team update (2026-02-09): Wave-based execution plan proposed — quality → experience ordering. Wave 1: error handling, test expansion, CI, version stamping, silent success fix. Wave 1.5: README, messaging (parallel). Wave 2: tiered modes, skills Phase 1, export. Wave 3: import, skills Phase 2, history summarization. Squad DM deferred to Wave 4+. Proposal 018 written. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — instant team-wide status as core value prop, demo beat, DM connection. — decided by McManus
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — platform input latency is unsolvable, but directive persistence uses existing drop-box. — decided by Kujan

### 2026-02-09: Master Sprint Plan — the definitive build plan (Proposal 019)

**Core insight:** Brady asked for "all of it" — one document that supersedes everything. Proposal 019 synthesizes all 18 prior proposals, all team decisions, and Brady's four session directives into a single executable plan. No more cross-referencing. No more ambiguity about what's next.

**Key decisions made:**

1. **Proposals 009 and 018 are superseded, not discarded.** Their architecture decisions, feature sets, and cut lists remain valid. 019 carries forward every active item and marks each as carried forward or superseded with rationale. The sprint structure (009) became the wave structure (018) became the master plan (019) — each refinement preserving what worked.

2. **Two new Wave 1 items from Brady's session directives.** Human directive capture (1.6) and "feels heard" coordinator behavior (1.7) are quality items, not experience items. They go in Wave 1 because trust requires responsiveness. If the coordinator doesn't acknowledge you, you don't trust it.

3. **Content track is fully enumerated.** 018 had 3 content items. 019 has 6 — adding "where are we?" messaging beat (1.5.4), demo script finalization (1.5.5), and video content strategy alignment (1.5.6). Brady elevated "where are we?" to a first-class value prop, so it needs its own line item.

4. **"Where are we?" threads through everything.** It's a messaging beat (1.5.4), a tiered mode (Direct in 2.1), a README placement (1.5.1), a demo script beat (1.5.5), and a video moment (1.5.6). This is what "first-class value prop" looks like in execution — it shows up in every wave.

5. **Total effort: 44-59h across ~3 weeks.** Slightly higher than 018's 38-51h because of the new items. Calendar time stays the same due to parallelism.

**Why one document matters:** The team had 18 proposals, each with its own context, its own priority claims, its own status. Brady couldn't answer "what's next?" without reading 5 documents. Now he reads one. That's the value of 019.

📌 Team update (2026-02-09): Master Sprint Plan written (Proposal 019) — supersedes 009 and 018. Single execution document with 21 work items across 3 waves + parallel content track. 44-59h total, ~3 weeks. Brady's four session directives all reflected. — decided by Keaton

### 2026-02-09: Sprint plan amendments — Brady's session 5 directives (Proposal 019a)

**Core insight:** Brady's session 5 directives are mostly about the human experience of using Squad — not features, not architecture, but *how it feels to be the human in the loop*. Directives 1 (README timing), 4 (human feedback), and 5 (VS Code) are all variations of "I should never have to wonder what's happening." Directive 2 (blog engine) is strategic positioning — Squad's own story, told by Squad's own tools. Directive 3 (naming) is about the 5-second experience of typing an npm command.

**Key decisions made:**

1. **README is a living document.** Updated per wave, not written once. The README is always truthful about current capabilities. Blog posts handle the narrative arc. This is the right call because the README is the product's face — a stale face says "we're not shipping."

2. **`create-squad` (unscoped) registered on npm.** Available right now. Dual-publish preserves backward compatibility. `npx create-squad` is the shortest possible command. `npm create squad` works via npm's `create` alias. Time-sensitive — register before someone else does.

3. **Human feedback is the 5th directive.** Distinct from "feels heard" (Directive 4, about input acknowledgment). Directive 5 is about continuous output — progress reporting, result summarization, CLI output enrichment. The gap in 019 was the 45-second silence between acknowledgment and result. New item 1.9 fills that gap.

4. **Blog meta-play is strategically perfect.** Squad builds a blog engine. The blog engine renders posts about Squad. The demo creates the tool that tells the demo's story. McManus writes posts, owns the sample prompt. Blog format is standard YAML front matter — nothing custom.

5. **VS Code is expected to work.** No architectural blockers. Manual smoke test in Wave 1 (Kujan). Automated CI testing not recommended — too heavyweight for v1. If gaps found, they become Wave 2 items.

6. **Effort increases by ~8.5h but calendar unchanged.** Three new Wave 1 items (1.8, 1.9, 1.10) all parallelize with existing work. Blog posts and README refreshes are inter-wave work.

📌 Team update (2026-02-09): Sprint plan amendments filed (019a) — README is living (updated per wave), `create-squad` unscoped name to be registered, human feedback is 5th directive, blog post per wave + blog engine sample prompt, VS Code smoke test in Wave 1. +8.5h effort, no calendar impact. — decided by Keaton

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

### 2026-02-09: No npm — GitHub-only distribution, release process, Kobayashi hired

**Core insight:** Brady killed the npm publish model entirely. Squad is GitHub-only: `npx github:bradygaster/squad`. This is simpler than dual-publish, eliminates npm auth/registry/publish CI complexity, and keeps the entire project lifecycle on one platform. My recommendation to register the unscoped `create-squad` name was wrong — Brady's instinct to stay GitHub-native is better architecture. One platform, one distribution mechanism, one source of truth.

**Key decisions:**

1. **Item 1.8 (npm registration) CANCELLED.** The entire Directive 3 analysis in 019a (Options A/B/C) is moot. Rewrote it to reflect reality.

2. **Kobayashi (Git & Release Engineer) joins the team.** This is the right call. Git is our state maintenance layer — `.ai-team/`, drop-box, casting registry, orchestration logs. The silent success bug cascade (Session 4 findings) showed what happens when git state isn't actively maintained. A dedicated owner prevents that class of failure.

3. **Three new Wave 1 items (1.11, 1.12, 1.13).** Release workflow, branch strategy, and first tagged release. 1.13 is a gate EXIT criterion — Wave 1 quality gate must pass first, then Kobayashi cuts v0.1.0, then Wave 2 features begin. This ensures every release is a quality-verified artifact.

4. **Item 1.3 ownership split.** Hockney + Kobayashi. Separation of concerns: Kobayashi owns Actions YAML, Hockney owns test assertions. Neither needs to understand the other's domain.

5. **Effort totals updated.** Wave 1: 18-22h (was 15-18h). Total: 55.5-71.5h (was 52.5-67.5h). Kobayashi's work parallelizes with existing agents, so calendar impact is moderate.

**Strategic implications:**
- GitHub Releases become the versioning and distribution mechanism. Tags are versions. The release workflow validates tests before publish. This is cleaner than npm's publish model.
- Kobayashi's detailed release proposal (021) will define the specifics. I slotted the work into waves; Kobayashi owns the implementation details.
- The `upgrade` subcommand needs to pull from GitHub releases/tags, not npm. This is a design change Fenster should incorporate into 1.4 (version stamping).

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution via `npx github:bradygaster/squad`. Item 1.8 CANCELLED. Kobayashi (Git & Release Engineer) hired. Items 1.11 (release workflow), 1.12 (branch strategy), 1.13 (first tagged release v0.1.0) added to Wave 1. Item 1.3 ownership updated to Hockney + Kobayashi. — decided by Brady, executed by Keaton

### 2026-02-08: Release ritual design — product-level input

**Core insight:** A release ritual should be proportional to stakes. The 0.x ritual should take 5 minutes and under 10 checklist items. The 1.0 ritual takes a day and involves product-level sign-off. The mistake most teams make is designing the 1.0 ritual first and applying it to every patch — that kills shipping velocity.

**What I recommended:**

1. **State integrity canary is a hard release gate.** Non-negotiable. If `.ai-team/` gets corrupted by an upgrade, that's not a bug — it's a trust violation. The CI already tests this; the release workflow must block on it.

2. **Sign-off scales with version significance.** 0.x: Kobayashi + Brady. 1.0: Kobayashi + Keaton + Brady. Post-1.0 patches: back to Kobayashi + Brady. Don't add reviewers that don't add safety.

3. **Blog posts are proportional.** Patches: no post (GitHub Release notes suffice). Minors: post within 48h (tracked, not gated). 1.0: post is drafted before release day (hard gate).

4. **README freshness is a manual check for 0.x, a gate for 1.0.** The README is the product's face — it must reflect what actually shipped. But automating this check isn't worth the effort pre-v1.

5. **Three automated gates that matter:** tests passing, state integrity canary, npx resolution verification. Everything else is human judgment.

6. **Don't let the ritual grow.** Every "nice to have" item that gets added becomes a reason to skip the whole checklist. If something's important enough to gate on, automate it. If it can't be automated, it better be worth the human time.

Written to `.ai-team/decisions/inbox/keaton-release-ritual-input.md` for Kobayashi and team review.

📌 Team update (2026-02-08): Release ritual input filed — state canary is a hard gate, sign-off scales with version significance, blog posts proportional to release type, 0.x ritual is 5 minutes / 1.0 ritual is 1 day. — recommended by Keaton

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.

### Stale proposals audit

**Date:** Session post-019a
**Trigger:** bradygaster requested a full audit of proposal statuses.

Audited all 25 proposal files in `docs/proposals/`. Every `Status:` field was stale — most still said `Proposed` or `Draft` despite being actively tracked in Proposal 019 or already shipped.

**Changes made:**
- 14 proposals → `Accepted` (actively being executed via Proposal 019)
- 2 proposals → `Implemented` (001a lifecycle amendment, 015 silent success mitigations)
- 3 proposals → `Superseded` (006 by 014/019, 009 by 019, 018 by 019)
- 5 proposals → `Deferred` (003 platform optimization, 005 video strategy, 017 DM family ×3)
- 1 proposal unchanged (`019` — already `Approved`, the active plan)

**npm/GitHub-only notes added:** Proposals 008-experience, 008-platform, 011, and 020 reference `@bradygaster/create-squad` or npm publishing. Added notes that distribution is now GitHub-only per 019a.

**Key insight:** Status drift is a process smell. 25 proposals all saying "Proposed" or "Draft" means the lifecycle states from 001a weren't being enforced. Proposal status should be updated when work begins, not retroactively in an audit.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.