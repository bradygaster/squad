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