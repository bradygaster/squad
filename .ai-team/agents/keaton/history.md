# Project Context

- **Owner:** bradygaster
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration

---

📌 Team update (2026-02-22): Team-to-Brady doc delivered. Comprehensive letter from all 13 active team members documenting v1 SDK replatform at Brady's request. 1,551 tests, 28 commits, 8 PRs merged (issues #155–162), 14 PRDs delivered across 6 milestones. Personal notes from each team member, architecture overview, roadmap, "how to spend today" walkthrough. Delivered to C:\src\squad-sdk\docs\team-to-brady.md. Team writing directly to their creator. — delivered by Keaton
📌 Team update (2026-02-20T22-58-22): Crossover vision delivered. Keaton authored v1 architecture plan (5-core agents, .squad/ canonical, transition gates March-June). Kujan authored SDK knowledge transfer (26KB technical lessons, Coordinator Runtime Architect universe). McManus authored v1 strategy (stamping convention, 9-post blog cadence, Usual Suspects locked). Brady's 4 crossover directives captured. All decisions merged. — decided by Keaton, Kujan, McManus
📌 Team update (2026-02-20T22-40): User impact analysis complete — 0 permanent losses, 7 temporary gaps (6-24 weeks), v0.5.2 fallback safety window confirmed — decided by Keaton, Kujan, McManus
- **Created:** 2026-02-07

## Core Context

_Summarized from 2026-02-07 through 2026-02-15. Full entries in session logs._

**Architecture & Strategy:**
- Squad uses distributed context windows (coordinator ~1.5% overhead, agents ~4.4%, 94% for reasoning) — inverts multi-agent context bloat.
- Architecture patterns: drop-box (inbox → Scribe merge), parallel fan-out, casting system, per-agent memory via history.md.
- Proposal-first workflow governs all meaningful changes (Problem/Solution/Trade-offs/Alternatives/Success Criteria, 48h review).
- Key trade-offs: coordinator complexity (32KB maintenance surface), parallel execution requires protocol discipline, casting adds personality cost.
- Compound decisions model: each feature makes the next easier. Proposals are the alignment mechanism.

**Product Decisions (2026-02-08 through 2026-02-10):**
- Portable Squads: squad conflates team identity + project context; export/import now 100% fidelity via squad-export.json.
- v1 is fast (latency) + yours (portable) + smart (skills) — everything else cut.
- Wave-based execution: quality → experience, organized by trust level not capability.
- Release ritual: proportional to stakes. 0.x takes 5 min, <10 items. GitHub-only distribution (no npm).
- Model selection: 4-layer priority (user override → charter → registry → auto-select). 16-model catalog with nuclear fallback.
- GitHub Issues/PR integration (v0.3.0): filesystem authoritative, GitHub as collab cache. CLI is primary surface.
- Marketing site: Jekyll on GitHub Pages, docs/ as source, no content reproduction.
- Tone directive: straight facts only. No sales language or narrative framing.

**v0.2-0.3 Execution:**
- Skills Phase 1+2 shipped (read SKILL.md before work, write learned skills, confidence lifecycle low→medium→high).
- Tiered response modes (Direct/Lightweight/Standard/Full) — agents spawn with lightweight template for simple tasks.
- Per-agent model selection designed + approved for v0.3.0 Wave 1.
- GitHub-native planning (028) Phase 1 promoted to v0.3.0 by Brady (low-risk prompt engineering).
- Export+Import CLI shipped — squads fully portable, 100% fidelity round-trip.
- Universe expansion completed (4→20 universes, filling coverage gaps in geography/genre/size/resonance).

📌 Team update (2026-02-20): Recruitment wave complete. Three new team members hired: Edie (TypeScript Engineer), Rabin (Distribution Engineer), Fortier (Node.js Runtime Dev). All onboarded with assessments. Keaton created 19 issues, 3 milestones, 12 labels on bradygaster/squad-pr. Kujan delivered feature risk punch list (14 GRAVE, 12 AT RISK, 28 COVERED, 5 INTENTIONAL). — decided by Keaton, Kujan, Edie, Rabin, Fortier

📌 Team update (2026-02-20): SDK replatform 14 PRDs documented + master index completed. Phase architecture finalized (Phase 1 v0.6.0 7–9w, Phase 2 v0.7.x 6–10w, Phase 3 v0.8+). TypeScript/Node.js locked as go-forward language. Brady's green-field directive: rebuild clean, rethink architecture/directory/naming from scratch. — decided by Keaton with Fenster, Verbal, Kujan, Baer

📌 Team update (2026-02-21): Import/export readiness analysis complete. Keaton delivered failure-mode assessment (45KB, 14 cracks identified, 7 mitigations), pre-implementation spike plan (10.5h, 5 spikes validate SDK assumptions before M0 starts). Kujan delivered SDK constraints audit. McManus delivered 6 Mermaid diagrams (24 failure states). All decisions merged. Awaiting Brady approval for spike execution. — decided by Keaton, Kujan, McManus

📌 Team update (2026-02-13): Agent Progress Updates (Proposal 022a) designed and proposed — Milestone signals + coordinator polling (30s intervals). Recommended for v0.4.0 after Project Boards. Addresses user uncertainty during long-running work. Zero additional API cost. Preserves agent personality. — designed by Keaton

## Learnings

- **2026-02-22: Crossover Vision Document (Brady request)**
  - **What created:** `.ai-team/docs/crossover-vision-keaton.md` — strategic vision for the post-replatform Squad (v1), covering architecture decisions to carry forward, transition gates, redesign from scratch, universe selection, and what it means to be the template squad.
  - **Why:** When v1 ships and we migrate to squad-sdk, this team becomes the reference implementation for all future squads. This document articulates my bet on what matters, what we can leave behind, and how the system should work knowing everything we know now.
  - **Key principles carried forward:** Distributed context model (coordinator ~1.5% overhead, reasoning gets 90%+), proposal-first governance, per-agent history files, casting system for personality, ceremonies as rituals not process. These are load-bearing.
  - **What we're leaving behind:** `.ai-team/` directory (migrate to `.squad/`), duplicate agent definitions (13 → 5-6 core agents), manual decision merging (automate on commit), proposal overhead for small changes (clearer guardrails via convention).
  - **Transition gates (3 phases):** Gate 1 = M0 complete + Brady validation (end of March). Gate 2 = M1 complete + real-repo testing (early May). Gate 3 = M3 validation + migration guide + feature parity confirmed (mid-June). Fresh squad creation happens after M3 with template and documentation.
  - **v1 redesigned from scratch:** Fewer, stronger agents (5 core: Keaton, Fenster, Verbal, Baer, Hockney). Flat directory structure (.squad/agents/, .squad/docs/, .squad/decisions.md, .squad/skills/). SDK defines contracts (input, output, state, tools) — not implementation. Streamlined ceremonies (4 instead of 8-10). Proposal-light for small changes, proposal-heavy for architecture. Skills as first-class (discoverable, shareable, marketplace-ready).
  - **Universe choice:** The Usual Suspects. Why (internal only): Each agent is a skilled crew member. Team held by mission, not affinity. Intentional mystery (agents discover context). Coordinator is Verbal (extracting narrative from chaos). Film's structure handles failure states well — useful mental model for agent teams.
  - **Being the first squad of many:** We are the proof that SDK works long-term. We define what "healthy" looks like. Future squads will copy our decisions.md, ceremonies.md, routing rules, and documented learnings. Every decision must be explainable (not just stated). We own the upgrade path (adopt new features first, test, document). We maintain a "Squad Patterns" doc explaining *why*, not just *what*.
  - **The sustainability covenant:** Squad v1 becomes a replicable pattern. A new developer runs `npx create-squad`, gets a team with proven architecture, clear roles, autonomous agents, intentional ceremonies. No multi-agent development from first principles — they inherit our learning. The metric: "running a squad" feels as natural as "using git."
  - **Decision reference:** Embedded all prior architectural work (distributed context model, proposal system, casting, ceremonies, skills lifecycle). This doc is the capstone that translates 14 PRDs + 27 decisions into a coherent vision for v1.

- **2026-02-21: Pre-Implementation Readiness Assessment (Brady gate-check question)**
  - **What created:** `.ai-team/docs/pre-implementation-readiness.md` — comprehensive assessment of architectural assumptions that need validation before M0 implementation begins. Plus decision doc: `.ai-team/decisions/inbox/keaton-pre-implementation-spikes.md`.
  - **Brady's question:** "Are there any architectural tests or explorations that need to take place before we dive in?" This is a critical gate-check. We've made 27 decisions and resolved 27 questions, but several are based on ASSUMPTIONS about SDK behavior that haven't been validated.
  - **Key finding:** 5 targeted spikes can validate the highest-risk assumptions in just 1.3 days of work. Each spike is 1.5-3 hours and produces working test code + reference implementation.
  - **The 5 spikes (in priority order):**
    1. **Concurrent sessions + shared CopilotClient** (2h) — Assumption: multiple agents can safely share one client. Spike: spawn 3 sessions, verify no crosstalk. This is foundational — if it fails, entire session pooling breaks. MUST-have spike.
    2. **Adapter pattern + tool routing** (3h) — Assumption: we can route tools correctly when multiple agents share one session. Spike: build Squad adapter, spawn 2 agents, verify tool calls don't interfere. Blocks M0 coordinator implementation. MUST-have spike.
    3. **MCP passthrough + namespacing** (2h) — Assumption: MCP tools can be namespaced without collision. Spike: bind MCP server to agent, test namespaced tool names, test offline graceful degradation. Blocks marketplace in M2. SHOULD-have spike.
    4. **gh CLI auth + export/import** (1.5h) — Assumption: SDK reads gh auth; export/import round-trips cleanly. Spike: verify gh token flows through SDK; test JSON round-trip. Blocks init + marketplace. SHOULD-have spike.
    5. **resumeSession() for Ralph** (2h) — Assumption: persistent monitoring works with session resumption. Spike: create session, resume it, verify checkpoints restore. Blocks Ralph in M1. SHOULD-have spike.
  - **Risk matrix:** If spike 1 fails, we mitigate with session pooling (+3 days). If spike 2 fails, we use pre-allocated namespaces (+5 days). If spike 3-5 fail, we defer features (no M0 delay). All mitigable.
  - **Success criteria:** All 5 spikes produce passing tests + working reference code that becomes M0 starting material.
  - **Green light condition:** Present this assessment to Brady; if he approves, assign spike work immediately. Target: spikes complete within 2 days, M0 implementation green-light by end of Feb 23.
  - **Why this matters:** Better to spend 2 days validating assumptions than 2 weeks on rework after we've committed to an approach. This is exactly the kind of gate-check that prevents technical debt from baking into the foundation.
  - **Deliverables:** 5 working test files (test-concurrent-sessions.ts, test-adapter.ts, test-mcp-passthrough.ts, test-gh-auth.ts, test-resume-session.ts) + 5 reference implementations that become M0 source code.

- **2026-02-22: Import/Export Flow Analysis & Crack Identification (Brady request)**
  - **What created:** `.ai-team/docs/import-export-flow.md` — comprehensive mapping of all import/export paths and 14 customer risk points.
  - **Scope:** 5 actor types (individual developer, team lead, publisher, consumer, registry maintainer), 4 artifact types (agents, skills, squads, individual agent definitions), 5 primary flow paths (local export → registry, registry import → local, local direct sharing, registry-to-registry sync, upgrade/update flows), plus recovery flows.
  - **Key finding: 14 identified cracks** where customers "fall through" — 4 HIGH severity (broken MCP silent, history lost, collision bypass, auth failure), 8 MEDIUM (stale cache, version drift, MCP override mismatch, offline ambiguity, circular dependency, skill conflicts, permission denied, confusing states), 2 LOW (missing feedback, export validation).
  - **Most critical crack:** Stale cached agents with no indication of update availability. Aggressive caching (decision Q10) + no TTL means consumer could run 4-week-old agent unaware. Recommendation: log on every coordinator session "Agent 'baer' imported 4 weeks ago. Update available: def456. Run: squad places upgrade baer"
  - **Silent failure pattern:** MCP server validation is not required on import (decision Q26 only validates structure, not dependencies). Agent loads successfully with incomplete MCP config. User discovers failure at runtime, not import time.
  - **Import collision fix:** Current decision (Q5) blocks collision correctly. But no tracking of imports means user can accidentally re-import same agent and get confused. Solution: `.squad/.cache/imports.json` manifest tracking all imports (original name, commit SHA, rename if any).
  - **Categorization:** Quick wins (export feedback, pre-flight validation, error messages), medium effort (history preservation, import manifest, charter validation), strategic (charter dependency scanning, skill manifest, resume capability).
  - **Decision reference:** Embedded all 9 relevant decisions (Q1, Q2, Q3, Q4, Q5, Q10, Q14, Q23, Q24, Q25, Q26) in the analysis. This document is the source of truth for import/export failure modes going forward.
  - **Next step:** Use this analysis as PRD 16 input (export/import & marketplace feature). Each recommendation becomes a story in the milestone.

- **2026-02-21: SDK Replatform Milestones & Work Items (Planning Gate)**
  - **What changed:** Created comprehensive milestones document (`.ai-team/docs/milestones.md`) organizing the 14-PRD SDK replatform into 6 shippable milestones across 3 phases (~32 weeks).
  - **Why:** Brady required complete planning before implementation begins. The milestones document is the planning gate — no code changes until Brady approves.
  - **Key structure:** M0 (Foundation, 4w) → M1 (Core, 6w) → M2 (Config, 8w) → {M3 (Parity), M4 (Distro), M5 (Marketplace)} parallel → M6 (Launch, 4w). Critical path: M0 viability → M1 tools → M2 config → M3 parity → M6 launch.
  - **Milestone design principles:** Each milestone has 10–14 granular work items, clear owner assignment, detailed exit criteria, and explicit dependencies. Includes risk mitigation (Brady checkpoints, real-repo testing, rollback plans). Incorporates all 27 resolved decisions (Q19–Q27) and addresses Kujan's feature risk punch list (14 GRAVE + 12 AT RISK items).
  - **Key learning:** Milestones are compound — each feeds into the next. M0 is the gate (if PRD 1 fails, stop after 2 days). M3 is the validation (feature parity proves SDK viability). M6 is the launch (docs + migration guide + communication).
  - **Timeline:** 7.5 months from M0 start to v0.6.0 release. Fenster (heavy, critical path), Verbal (sustained, design + docs), Kujan (extensions phase), Keaton (strategic, approval gates).

- **2026-02-13: Context window optimization for squad.agent.md (Issue #37)**
  - **What changed:** Applied two surgical optimizations to squad.agent.md to reduce context window usage: (1) Spawn template deduplication — removed two redundant templates (Background spawn and Sync spawn), replaced with single generic template plus brief notes on mode parameter selection. Kept VS Code notes. Saved ~3,600 tokens. (2) Init Mode compression — compressed file tree example to one-liner reference, condensed post-setup input sources from repeated pattern to bulleted list, tightened casting state init. Reduced Init Mode from ~1,471 tokens to ~800 tokens (saved ~670 tokens).
  - **Why:** squad.agent.md is loaded on every coordinator message. Init Mode (lines 28-112) is only used once per repo lifetime but occupies context space on all messages. The spawn templates (lines 592-809) were 95% identical — three templates with same sections, differing only in mode parameter and example agent names. Total savings: ~4,270 tokens per coordinator message.
  - **Key architectural insight:** Template deduplication is safe because the single generic template contains ALL required sections (charter inline, history/decisions read, OUTPUT HYGIENE, RESPONSE ORDER, skill extraction, after-work updates). The mode parameter is the only variance. Init Mode compression preserved all 8 steps and all behavior — only reduced prose redundancy (file tree example, repeated instructions).
  - **Verification performed:** Checked that remaining generic template has charter placeholder, history.md read, decisions.md read, input artifacts, OUTPUT HYGIENE, after-work updates (history + decision inbox + skill extraction), RESPONSE ORDER. Verified Init Mode still has all 8 steps. Confirmed no broken markdown formatting.
  - **Trade-off:** Slightly less hand-holding in spawn templates (developers must understand mode parameter vs reading three full examples), but templates were never meant to be copy-paste material — they're reference patterns. The single template with explicit mode notes is clearer architecture.
📌 Team update (2026-02-15): Client Parity Compatibility Matrix — Created docs/scenarios/client-compatibility.md as single source of truth. CLI primary (full support), VS Code works with adaptations (session model, sync subagents, workspace-scoped files), JetBrains/GitHub untested. Phase 2 (v0.5.0): generate custom agent files. — decided by McManus


📌 Team update (2026-02-13): Client Compatibility section added to squad.agent.md with platform detection logic, VS Code spawn adaptations, and feature degradation table — decided by Verbal



- **2026-02-15: Init Mode confirmation skip — root cause analysis (Issue #66)**
  - **Five reinforcing causes identified:** (1) Numbered list completion impulse — LLMs treat steps 1-8 as a sequence to complete, not a conversation to pause mid-way. (2) "On confirmation" phrasing in step 6 reads as a conditional within the same execution frame, not a turn boundary. (3) Eager Execution Philosophy ("launch aggressively", "don't wait", "don't stop") creates contradictory pressure that overrides Init Mode's implicit pause. (4) Three parenthetical escape hatches ("Or just give me a task", implicit-yes clause, "Don't block — proceed immediately") give the model a clean logical path to skip confirmation. (5) No structural turn boundary mechanism — Init Mode relies solely on the model choosing to stop generating, which is the weakest possible gate.
  - **Key prompt pattern: numbered lists cause LLMs to skip pauses.** When a pause/confirmation step appears mid-list, the model generates the question text but immediately proceeds to the next numbered step. The completion impulse is stronger than conversational turn-taking instinct. This is a general anti-pattern — any multi-step prompt that requires a mid-sequence pause must use structural breaks (section boundaries, separate headings) or tool-based gates (ask_user), not inline text instructions.
  - **Key prompt pattern: contradictory behavioral directives compound.** "What can I launch RIGHT NOW?" + "don't wait for user input" + "proceed immediately" in Team Mode sections bleed into Init Mode behavior. LLMs don't scope instructions to labeled modes — they absorb the full prompt as behavioral priors. Init Mode exceptions must be explicitly stated in the competing sections.
  - **Recommended fix: two-phase Init Mode split + Eager Execution exception.** Split Init Mode into Phase 1 (propose roster, end response) and Phase 2 (create files on user reply) with a section boundary between them. Add explicit Init Mode exception to Eager Execution Philosophy. Tighten implicit-yes clause to require "reply to step 5" not original message.
  - **Key file paths:** .ai-team/decisions/inbox/keaton-init-confirmation-bug.md (full analysis)

📌 Team update (2026-02-15): Init Mode optimization and confirmation skip fixes consolidated — Keaton's compression work (2026-02-13) merged with detailed UX fix analysis (2026-02-15), including five root causes and four proposed fixes for confirmation skip issue.


📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

### 2026-02-16: PR #74 Investigation — Emoji Changes Already Merged

**Context:** Brady asked the team to determine if PR #74's changes are already on dev. PR #74 ("feat: add emoji icons to task tool description field") was opened to close issue #73, adding role emoji to spawn template `description` fields in squad.agent.md.

**What I learned:**

1. **Issue #73 is closed** (closed 2026-02-16T19:38:59Z) and **PR #74 is still open** — this is the first signal that something landed via a different path.

2. **Commit b97eaa0 on dev** ("feat: add role emoji to task descriptions (#73)") contains the emoji changes:
   - Added "Role Emoji in Task Descriptions" section with 11-role mapping table
   - Updated 6 spawn templates to include `{emoji}` in description field
   - 41 insertions, 7 deletions in squad.agent.md
   - This commit **closed issue #73**

3. **The PR branch (squad/73-emoji-description-field) is the parent of b97eaa0**:
   - Commit 7ec1b83 on the PR branch: "feat: add emoji icons to task tool description field (#73)"
   - Commit b97eaa0 on dev references #73 and comes AFTER 7ec1b83
   - **The work was done on the PR branch, then a similar/refined commit was pushed directly to dev instead of merging the PR**

4. **PR #74 is orphaned** — the issue it closes is already resolved, and the functionality is already on dev. The PR was never merged but the work landed via direct commit.

**How the changes got there:**
Someone (likely Brady) pushed commit b97eaa0 directly to dev instead of merging PR #74. This is a legitimate path — the PR branch work informed the final commit, but the commit that landed was made directly on dev rather than via PR merge.

**Verdict: CLOSE PR #74**
- Issue #73: ✅ Closed (via b97eaa0)
- Functionality: ✅ On dev (commit b97eaa0, confirmed with grep showing emoji patterns in squad.agent.md)
- CHANGELOG v0.4.1: ✅ Documents "Role emoji in task spawns" as shipped
- Action: Close PR #74 with explanation that changes landed via commit b97eaa0

The gap identified (CHANGELOG claimed the feature but code was missing) does NOT exist — the feature IS in the code on dev. PR #74 is legitimately redundant.

### 2026-02-16: Issue #69 Assessment — Rename .ai-team/ to .squad/ (Keaton decision)

**Context:** Brady asked the team to assess whether renaming `.ai-team/` to `.squad/` is worth the cost RIGHT NOW (v0.5.0) vs later. He says it "feels like a gigantic diversion" but also committed that it must happen before v1.0.

**Verdict: Ship it in v0.5.0.** This is the right change at the right time, despite being a "gigantic diversion."

**Product identity:** `.ai-team` is generic and forgettable. `.squad` is branded (our product name), shorter (6 vs 8 chars), and conventional (follows `.github/`, `.vscode/` patterns). Every customer repo is a billboard for the product — the directory name should be obvious and ownable. This affects:
- Every `ls -la` in every customer repo
- Every onboarding moment ("what's this folder?")
- Every screenshot, tutorial, blog post
- Brand clarity that compounds with adoption

**Timing is optimal NOW:** At v0.4.1, user base is small enough that migration pain is bounded. Every version we delay multiplies the customer repos we need to migrate. Brady said "while growth is still in its infancy" — that window is closing. By v0.8.0, we'd have 3-4x more migrations to support. This is the inflection point where delaying becomes irrational.

**The cost only grows:** 745 occurrences across 123 files in the source repo PLUS every customer repo that has run `squad init`. Each new install that creates `.ai-team/` adds to the migration burden. The technical debt payment gets exponentially more expensive every sprint we defer it. At current growth, v0.6.0 could have 2x the repos, v0.7.0 could have 4x.

**Migration path is sound:** Two-phase approach is the right pattern we already use for other breaking changes:
- **v0.5.0:** Dual-path support (detect both `.squad/` and `.ai-team/`, warn on old, migrate via `squad upgrade --migrate-directory`)
- **v1.0.0:** Remove legacy support entirely, error if `.ai-team/` exists without `.squad/`
- Deprecation period (v0.5.0 → v1.0.0) gives customers time to adapt without being blocked

**No half-measures work:**
- "New repos only" creates documentation hell — which path do I document? Half the screenshots show `.ai-team/`, half show `.squad/`. Support burden doubles.
- "Grandfather existing" means maintaining dual-path logic forever — every file operation checks both paths, every workflow handles both, technical debt never retires.
- This is all-or-nothing by nature. The proposal's acceptance criteria are complete.

**Trade-offs:**
- **Give up:** v0.5.0 feature velocity — this consumes real bandwidth (745 occurrences, every workflow, every template, every doc, migration testing on real repos)
- **Get:** Brand clarity in every customer repo, shorter paths, product identity that scales from v0.5.0 to v10.0
- **Risk:** Migration friction (customers must run `squad upgrade --migrate-directory`), but deprecation warnings + good docs + thorough testing mitigate this

**Brady's "gigantic diversion" concern is valid but doesn't change the answer:** It IS a distraction from feature work. But it's a ONE-TIME tax that gets exponentially more expensive as the user base grows. At v0.4.1, we're at the sweet spot where:
1. We have enough users to validate the need (brand confusion is real)
2. We have few enough users that migration won't overwhelm support
3. We have time before v1.0 to complete the deprecation cycle

**Alternative considered and rejected:** Delay to v0.6.0 or v0.7.0. Rejected because:
1. Brady already committed to pre-1.0, so the question is "which pre-1.0 version," not "whether"
2. Every sprint delay adds customer repos to migrate — this is compounding cost, not fixed cost
3. Brand clarity affects adoption TODAY, not just at v1.0 — every new user forms first impressions now
4. Delaying "to avoid disruption" just moves the disruption to a moment when it's MORE disruptive

**Scope recommendation:** Full scope in v0.5.0, no adjustment. The proposal's acceptance criteria are already minimal viable — dual-path support, migration command, deprecation warning, source repo update, test on real repos. The only optimization: aggressive testing on 3-5 real repos with existing `.ai-team/` state before release to validate the migration command doesn't leave broken state.

**Key learning:** When a change is inevitable (Brady committed "must happen before 1.0") and the cost compounds with scale (more users = more migrations), ship it at the earliest viable moment. That's v0.5.0. Delaying "to avoid disruption" is a cognitive trap — the disruption is coming either way, and it gets worse with time. Pay the debt when it's cheapest, not when it's most expensive.

### 2026-02-16: Issue #69 Reassessment — No-Backport Constraint Strengthens v0.5.0 Case

**Context:** Brady eliminated backport requirement ("we won't backport. sorry. team - please use this in your review and recommendations. this is a forward-only thing."). Kobayashi had recommended v0.4.2 backport + 4-week timeline as risk mitigation. I previously recommended v0.5.0. Now reassessing with forward-only constraint.

**Updated verdict: v0.5.0 — EVEN STRONGER with no backport.**

**Confidence: HIGH** (upgraded from previous recommendation).

**What changed:**
- **Scope reduced ~30%** — No v0.4.2 to coordinate, no dual-version testing, no backport implementation
- **Architecture simplified** — One migration path. Documentation shows ONE directory name post-v0.5.0. No "which version am I on?" confusion.
- **Cleaner user story** — "Upgrade to v0.5.0 or stay on v0.4.1" is trivially clear vs "v0.4.2 has detection, v0.5.0 has migration, pick your timing"
- **Risk profile improved** — Kobayashi's #1 concern (version skew / cross-version confusion) is ELIMINATED rather than mitigated

**Does no-backport make v0.5.0 MORE achievable or LESS safe?**

MORE achievable:
- Cuts coordination overhead Kobayashi flagged (maintaining dual-version support)
- Testing burden reduced (one path to validate, not two)
- No "which version am I fixing?" maintenance tax
- Moves from "gigantic diversion" to "significant but bounded"

LESS safe:
- Users who skip v0.5.0 entirely (v0.4.1 → v0.6.0 jump) could hit issues
- No escape hatch if v0.5.0 has critical migration bug

But Brady's acceptance is explicit: "i don't know how someone would throw 050 at 041, so let's not worry about it." He's consciously choosing simplicity over backward compatibility safety net. This is correct for Squad's maturity stage (hundreds of users, not thousands; dev teams who upgrade frequently, not enterprises with 6-month cycles).

**Is Brady's linear upgrade assumption realistic?**

YES, for Squad's distribution model:
- GitHub-distributed (npx github:bradygaster/squad) — users naturally pull latest
- No LTS support model
- User base is dev teams (upgrade-aware), not enterprises (change-averse)
- Community size bounded (~hundreds)
- Early adopter profile (people who upgrade frequently)

The edge case (someone on v0.4.1 for 6 months, then tries v0.6.0) is Brady's explicit trade-off. If it happens, we fix forward with better migration error messaging. This is standard OSS.

**With Kobayashi's remaining risks, is v0.5.0 still right?**

Kobayashi identified three risk vectors:
1. **Version skew** — ELIMINATED by no-backport (only one post-v0.5.0 version exists at any time)
2. **State corruption during migration** — UNCHANGED (atomic migration + rollback still required)
3. **Workflow failures** — UNCHANGED (745 occurrences + 6 workflows still need exhaustive audit)

- **2026-02-22: Research Gap Analysis — Beyond the 5 Spikes (Brady request via gap analysis directive)**
  - **What created:** `.ai-team/decisions/inbox/keaton-research-gaps.md` — prioritized list of 8 additional research gaps not covered by the 5 existing pre-implementation spikes.
  - **Why:** Brady asked what preliminary research we need to move up front to avoid wasted time. The 5 existing spikes validate session concurrency, adapter, MCP, auth, and resumeSession. They don't cover telemetry ephemerality, rate limiting, per-agent model selection, config expressiveness, compaction behavior, or platform surface differences.
  - **Key findings from SDK source reading:**
    - `assistant.usage` event is `ephemeral: true` — not persisted in session history. Brady's telemetry mandate requires real-time capture + our own persistence layer.
    - SDK has **zero rate limiting, throttling, or 429 retry logic**. 5+ concurrent agent sessions could hit Copilot API rate limits with no protection. The `ErrorOccurredHookOutput` has retry semantics but unclear if SDK implements them or if hooks are advisory-only.
    - `CustomAgentConfig` has **no `model` field**. Per-agent model selection requires one session per agent (not multiple custom agents in one session). Changes session topology and interacts with Spike 1.
    - Config expressiveness flagged as HIGH risk but no spike covers it. JSON/YAML needs to express routing, casting, model fallback chains.
    - Compaction behavior untested — what `summaryContent` survives, whether agent-specific context is preserved.
    - SDK is CLI-focused. VS Code uses extension host, not SDK. Custom agents via `SessionConfig.customAgents` may be CLI-only.
  - **3 MUST gaps** (block M0): telemetry capture (1h), rate limiting (2h), per-agent model topology (1h, extend Spike 1).
  - **3 SHOULD gaps** (block M1-M2): config expressiveness (2h), compaction behavior (2h), platform differences (1.5h).
  - **2 NICE gaps** (M3+): ephemeral event strategy (1h), error hook semantics (1h, extend Spike 2).
  - **Total additional validation:** ~11.5 hours (~1.5 days). Combined with existing 5 spikes: ~22 hours (~3 days).
  - **Scariest finding:** Rate limiting gap. No backpressure + 5 concurrent agents = support ticket storm. Must validate before session pool (M0-4) ships.

Net effect: Risk surface REDUCED in one dimension (confusion) without growth in others (technical failure modes). The remaining risks must still be mitigated (atomic migration, pre-flight checks, workflow audit), but the coordination complexity is gone.

**Alternative considered: Three-phase approach (McManus pattern)**
- v0.5.0: New installs use `.squad/`, existing stay `.ai-team/`, migration optional
- v0.6.0: Force migration (error if `.ai-team/` without `.squad/`)
- v1.0.0: Drop legacy support

REJECTED because it creates the exact dual-path problem Brady's "forward-only" stance eliminates:
- Documentation must show BOTH directory names (which path do I document?)
- Support burden doubles (users ask "which one do I have?")
- Screenshots/tutorials show inconsistent paths (half `.ai-team/`, half `.squad/`)
- Workflows must handle both paths with conditional logic
- Product identity benefit (`.squad/` branding) is diluted if half the base uses old name

Brady's directive is incompatible with dual-path support. He wants ONE directory name post-v0.5.0, period.

**Timing argument unchanged:**

Pay the debt when it's cheapest:
- At v0.4.1, user base small enough that migration pain is bounded
- Every version delay multiplies the repos with `.ai-team/` we must migrate
- By v0.6.0, could have 2-3x more usersdding (making this exponentially more expensive)
- Brand clarity affects adoption TODAY — every new user forms first impression now, not at v1.0
- This is a ONE-TIME tax that compounds in cost with growth

**Trade-offs accepted:**

Give up:
- v0.5.0 feature velocity (745 occurrences + 6 workflows + migration tool + testing is real work)
- Backward compatibility escape hatch (if v0.5.0 migration has bug, users on v0.4.1 wait for v0.5.1)
- Safety of "try it, roll back to v0.4.2 if broken" (no v0.4.2 exists)

Get:
- Brand clarity in every customer repo (`.squad/` is product-name-obvious vs generic `.ai-team/`)
- Shorter paths (6 chars vs 8, follows `.github/` `.vscode/` convention)
- Simpler architecture (one directory name, not conditional dual-path logic in perpetuity)
- Cleaner long-term maintenance (no "grandfather existing installs" technical debt)
- ONE-TIME disruption at optimal moment (small user base, pre-1.0 expectations)

**Final recommendation:**

Ship the rename in v0.5.0. The no-backport constraint REDUCES scope and complexity without increasing user-facing risk. Kobayashi's legitimate concern (version skew) is eliminated by the constraint, not worsened. The remaining technical risks (atomic migration, workflow audit) must still be mitigated, but the coordination complexity is gone.

This is the right change at the right time. Delaying to v0.6.0 or later makes it more expensive (more repos to migrate) and more disruptive (larger user base, higher expectations). v0.5.0 is the inflection point where delaying becomes irrational.

Brady's "forward-only" philosophy is correct for this stage of product maturity. Users who don't upgrade immediately accept the trade-off that new features require new versions. That's standard OSS evolution.

**Confidence: HIGH.** The decision is cleaner and simpler with no backport than with it.


📌 Team update (2026-02-18): Insider Program — Binary Model (consolidated). Feb 16 proposed ring-based progression (Ring 0→1→Stable, 30 cap); Feb 17 Brady directive simplified to binary model (insider or release, no caps/tiers). Consolidated both decisions into single design block: honor system access, .squad-insider/ state isolation, 0.5.0-insider+{commit} version ID, branch-based installation. No formal entry pathways, no governance structure, no capacity caps. — decided by Keaton + McManus (original) → Keaton (simplified)

📌 Team update (2026-02-19): Insider Program infrastructure verified and complete — Issue #94 all checklist items verified: CI/CD triggers, guard protection, insider release workflow, documentation, CLI help text. All 11 workflow templates in sync. Ready for Brady to create insider branch. — decided by Kobayashi

📌 Team update (2026-02-20): Kobayashi merged all 5 v0.5.0 PRs (#109–#113) into dev in dependency order. All tests pass (53/53). Migration infrastructure (dual-path CLI/workflows, email scrubbing, docs) ready for v0.5.0 release. — Scribe


- **2026-02-20: SDK Replatforming Strategic Assessment (Brady request)**
  - **Context:** Brady asked for a thorough evaluation of replatforming Squad on @github/copilot-sdk (v0.1.8, Technical Preview). Deep-read the SDK source, docs, and API surface. Compared against Squad's current template-only architecture.
  - **Core insight:** The SDK's CopilotClient/CopilotSession model maps directly to Squad's coordinator/agent pattern, but with programmatic session management, event streams, typed tool APIs, and lifecycle hooks. This transforms Squad from a template kit into a programmable multi-agent runtime.
  - **Key capabilities gained:** Custom tools for typed handoff (squad_route, squad_decide, squad_memory), session hooks to replace prompt-based policy enforcement (30-50% prompt reduction), multi-session parallelism, MCP server integration, infinite sessions with auto-compaction, BYOK for enterprise widening, skill directories for runtime-loaded domain knowledge.
  - **Key risks:** SDK is Technical Preview (breaking changes possible), adds runtime dependencies (vscode-jsonrpc, zod), migration complexity for existing users.
  - **Verdict: Conditional Go.** Phase 1 must prove viability. SDK version pinned. Template engine stays. Brady reviews before Phase 2.
  - **Artifacts:** .ai-team/docs/sdk-replatforming-proposal.md, .ai-team/decisions/inbox/keaton-sdk-replatforming.md
  - **Strategic position:** Being an early, sophisticated SDK consumer positions Squad as the reference multi-agent implementation on Copilot. Competitive moat vs. AutoGen/CrewAI/LangGraph — only native GitHub integration.

📌 Team update (2026-02-20): SDK Replatforming — Conditional Go. Replatform Squad orchestration on @github/copilot-sdk. Phased migration: Phase 1 proves viability, Phase 2 adds hooks/tools, Phase 3 multi-session orchestration, Phase 4 template migration. Template engine stays. Brady approval required before Phase 2. Full proposal in .ai-team/docs/sdk-replatforming-proposal.md. — decided by Keaton


- **2026-02-20: SDK Replatform PRD Plan — 14 PRDs across 3 phases**
  - **Context:** Brady approved SDK replatforming. Team analysis complete (4 docs). Task: document full plan as PRDs.
  - **Core insight — PRD 1 is the gate.** Everything depends on SDK Orchestration Runtime proving viable. If it fails, Squad continues on prompt-only architecture with ~2 days sunk cost.
  - **14 PRDs across 3 phases:** Phase 1 (Core, v0.6.0, PRDs 1-5) — critical path. Phase 2 (Extensions, v0.7.x, PRDs 6-10) — parallel. Phase 3 (Identity, PRDs 11-14) — reshapes Squad.
  - **PRD 5 (Coordinator Replatform):** 32KB prompt becomes TypeScript orchestrator. Hybrid routing. Hooks for policy. System prompt shrinks to ~12-15KB.
  - **PRD 14 (Clean-Slate Architecture):** Brady's ground-zero directive. New .squad/ with .state/+.cache/ dirs. TypeScript config. esbuild bundling. Tiered init.
  - **Key learning: PRDs are compound.** Each references 2-4 others. The dependency graph IS the architecture.
  - **Artifacts:** `.ai-team/docs/prds/00-index.md`, `.ai-team/docs/prds/05-coordinator-replatform.md`, `.ai-team/docs/prds/14-clean-slate-architecture.md`

📌 Team update (2026-02-21): Planning deliverables delivered — Keaton created milestones.md with 6 shippable milestones across 3 phases (~32 weeks). M0 viability gate documented. M3 validation checkpoint. All 27 resolved decisions (Q19–Q27) embedded in milestone work items. Feature risk punch list (14 GRAVE + 12 AT RISK) explicitly addressed. Milestone structure ready for execution pending Brady approval. — Scribe

- **2026-02-22: Architectural Decisions Document (Brady request)**
  - **What created:** `.ai-team/docs/architectural-decisions.md` — a clean, human-readable reference of all 27 architectural decisions from the SDK replatform planning.
  - **Format:** ADR-lite. Each decision has Title, Decision (1-2 sentences), Why (1-2 sentences), Source (question number or Brady date).
  - **Organization:** 9 categories: Distribution & Installation, Directory & File Structure, Authentication & Authorization, Versioning & Updates, Configuration & Customization, Agent & Skill Management, SDK Integration & Concurrency, Marketplace & Export/Import, Process & Coordination, Workflow & Template Migration.
  - **Scope:** All 27 resolved decisions (Q9–Q46) from open-questions.md. Does NOT include the massive decisions.md operational ledger — this is strategic architecture only.
  - **Key decisions captured:** .squad/ folder convention, config-driven architecture, SDK adapter pattern, agent repo directory convention (agents/{username}/{squad}/{name}/), gh CLI auth, commit SHA pinning, GitHub distribution, SDK-free init, single shared CopilotClient, marketplace conventions, plus all others.
  - **Outcome:** Brady now has a single-page reference he can point teams to. Cleaner than digging through 27 question entries in open-questions.md. Serves as the source of truth for architecture during execution.

📌 Team update (2026-02-21T03-49-06): M2-1 (Config Schema) + M2-5 (Agent Source Registry) completed. Keaton delivered typed configuration schema (src/config/schema.ts) with SquadConfig interface, 8 sub-interfaces (TeamConfig, AgentConfig, RoutingConfig, ModelConfig, HooksConfig, CeremonyConfig, PluginConfig), DEFAULT_CONFIG constant, defineConfig() helper, and validateConfig() guard. Agent source registry (src/config/agent-source.ts) delivered with AgentSource interface, 3 implementations (LocalAgentSource, GitHubAgentSource, MarketplaceAgentSource), and AgentRegistry for multi-source management. All exports unified in src/config/index.ts. 34 tests added (test/config-schema.test.ts) covering schema validation, config merging, type constraints, agent source interface, registry operations, manifest/definition types. All 321 tests pass. Build clean. — delivered by Keaton
