# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial architecture review and proposal-first design (2026-02-07). Full entries in `history-archive.md`._

- **Squad uses distributed context windows** — coordinator at ~1.5% overhead, veteran agents at ~4.4%, leaving 94% for reasoning. This inverts the traditional multi-agent context bloat problem.
- **Architecture patterns**: drop-box for concurrent writes (inbox → Scribe merge), parallel fan-out by default (multiple `task` calls in one turn), casting system for persistent character names, memory compounding via per-agent `history.md`.
- **Proposal-first workflow governs all meaningful changes** — required sections (Problem → Solution → Trade-offs → Alternatives → Success Criteria) force complete thinking. 48-hour review timeline. Cancelled proposals kept as learning artifacts.
- **Key trade-offs**: coordinator complexity (32KB) is a maintenance surface; parallel execution depends on agents following shared memory protocols; casting adds personality at the cost of init complexity.
- **Compound decisions are the strategic model** — each feature makes the next easier. Proposals are the alignment mechanism that makes this possible.

### Session Summaries

- **2026-02-08: Portable Squads architecture (Proposal 008)** — **Core insight:** Squad conflates team identity with project context. Agent histories contain both user preferences (portable) and codebase knowledge 
- **2026-02-08: v1 Sprint Plan — synthesis and prioritization** — **Core insight:** v1 is three things: fast (latency), yours (portable), smart (skills). Everything serves one of those or it's cut. The sprint plan sy
- **2026-02-09: Proposal lifecycle and sprint plan assessment** — **Proposal lifecycle fix (Proposal 001a):**
- **2026-02-09: Shared state integrity audit — the bug is HERE** — **Context:** Brady asked the team to audit shared state integrity and scream if we see the silent success bug happening.
- **2026-02-08: Squad DM — Direct Messaging Interface architecture (Proposal 017)** — **Core insight:** Squad's terminal-only interface is a ceiling on how intimate the team relationship can be. Brady's MOLTS reference (multi-channel AI
- **2026-02-09: Wave-based execution plan (Proposal 018)** — **Core insight:** Brady's directive — quality then experience — requires reorganizing work by trust level, not by capability. Proposal 009's sprint st
- **Character links in team.md** — **Date:** 2026-02-09
- **2026-02-09: Master Sprint Plan — the definitive build plan (Proposal 019)** — **Core insight:** Brady asked for "all of it" — one document that supersedes everything. Proposal 019 synthesizes all 18 prior proposals, all team dec
- **2026-02-09: Sprint plan amendments — Brady's session 5 directives (Proposal 019a)** — **Core insight:** Brady's session 5 directives are mostly about the human experience of using Squad — not features, not architecture, but *how it feel
- **2026-02-09: No npm — GitHub-only distribution, release process, Kobayashi hired** — **Core insight:** Brady killed the npm publish model entirely. Squad is GitHub-only: `npx github:bradygaster/squad`. This is simpler than dual-publish
- **2026-02-08: Release ritual design — product-level input** — **Core insight:** A release ritual should be proportional to stakes. The 0.x ritual should take 5 minutes and under 10 checklist items. The 1.0 ritual
- **Stale proposals audit** — **Date:** Session post-019a
- **2026-02-08: PR #2 review — GitHub Issues mode, PRD mode, Human team members** — 📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from bla
- **2026-02-10: Comprehensive Proposal Status Audit** — **What:** Audited all 25+ proposals in `team-docs/proposals/` and updated every status to match what actually shipped. 18 proposals marked "Approved ✅
- **2026-02-10: Critical Release Safety Audit for v0.2.0** — **Requested by:** Brady — needs 100% confidence that internal files never reach users via `npm publish` or `npx github:bradygaster/squad`.
- **Updated release-process.md: docs/ and CHANGELOG.md now ship** — Brady flagged that `docs/` and `CHANGELOG.md` should ship to main (and to users). Updated `team-docs/release-process.md` to reflect this:
- **2026-02-10: Final Architecture Review — Updated Release Pipeline (docs/ + CHANGELOG.md)** — **Verdict: YES — the updated release pipeline is architecturally sound.**

## Recent Updates

📌 Team update (2026-02-08): Proposal 023 — coordinator extracts all actionable items from messages, new backlog.md as third memory channel (intent), SQL rejected as primary store, proactive backlog surfacing as Phase 3 — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-08): Incoming queue architecture finalized — SQL hot layer + filesystem durable store, team backlog as third memory channel, agent cloning ready. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): Export + Import CLI shipped — squads are now fully portable via squad-export.json. Round-trip at 100% fidelity. History split is pattern-based. — decided by Fenster
📌 Team update (2026-02-09): Contribution blog policy consolidated — retroactive PR #1 blog (001c) added. All contributions get a blog post, late is OK. — decided by McManus
📌 Team update (2026-02-09): Celebration blog conventions established — wave:null frontmatter, parallel narrative structure, stats in tables, tone ceiling applies. — decided by McManus
📌 Team update (2026-02-09): Portable Squads consolidated — architecture, platform, and experience merged into single decision — decided by Keaton, Kujan, Verbal
📌 Team update (2026-02-09): Squad DM consolidated — architecture and experience design merged — decided by Keaton, Verbal
📌 Team update (2026-02-09): Release ritual consolidated — checklist and lead recommendations merged — decided by Keaton, Kobayashi


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

## Learnings

- **2026-02-10: Model Selection Proposal Consolidation (024 + 024a + 024b → 024)**
  - **Consolidated three documents into one:** Brady asked for "a spec/proposal for it" — singular. Three separate docs (draft, catalog, algorithm) created review friction. Merged into a single authoritative 024 with 024a/024b as companion reference material.
  - **What I kept from 024 (Verbal's original draft):** Problem statement (unchanged — still correct), charter template concept, registry integration, delegation support patterns, trade-offs framework. The original design was structurally sound; it just needed the catalog and fallback work integrated.
  - **What I kept from 024a (Kujan's catalog):** The full 16-model catalog, but condensed to 4 essential columns (Model ID, Provider, Tier, Best Fit) instead of the 8-dimension analysis. The detailed dimensions remain in 024a as reference for implementers. Role-to-model mapping expanded from 8 to 11 roles. Default-per-tier recommendations (Opus 4.6/Sonnet 4.5/Haiku 4.5) replacing the old Sonnet 4-centric defaults.
  - **What I kept from 024b (Verbal's algorithm):** The entire algorithm — 4-layer selection priority, task complexity overrides, provider diversity triggers, fallback chains by tier, 3-retry max, silent-by-default behavior, nuclear fallback. Also the ready-to-paste coordinator prompt section and charter template with Fallback field. This was the most operationally complete document and its content went in nearly verbatim.
  - **What I cut:** 024's original 3-model design (superseded by catalog), verbose cross-vendor section (folded into catalog table), user-facing documentation section (deferred — Wave 2 item 5.3 covers spawn output, full roster display is Phase 3), alternatives considered (good thinking but not needed in a consolidated approved spec), the 8-dimension analysis from 024a (stays in companion doc — too detailed for the spec).
  - **What I restructured:** Moved fallback resilience to its own top-level section (was buried in 024b §3) because Brady flagged it as the most important part. Added implementation plan referencing sprint plan items 4.1–4.4. Added success criteria for fallback behavior ("no user-facing error when any single model or provider is unavailable"). Updated default model from Sonnet 4 to Sonnet 4.5 throughout (024 was written before the catalog existed).
  - **Key decision:** Status changed from "Draft — Deferred to Horizon" to "Approved ✅". This is no longer a future idea — it's a v0.3.0 Wave 1 deliverable with assigned owners and effort estimates.

- **2026-02-10: v0.3.0 Sprint Plan Decisions (Proposal 027)**
  - **Prioritized per-agent model selection (024 Phases 1-2):** Highest-compound feature available. It improves every future agent spawn — Redfoot gets vision on Opus, Scribe gets speed on Haiku, Hockney gets fast test gen. Zero-config via auto-selection algorithm. Phase 1 is coordinator prompt only (zero code risk), Phase 2 adds charter + registry integration. Deferred Phase 3 (cost reporting, override persistence) — polish, not leverage.
  - **Prioritized team backlog / message extraction (023 Phases 1-2):** Brady's "favorite part." Closes the biggest information loss — multi-item messages lose 2 of 3 items today. Dual-layer storage (SQL hot + filesystem durable) is elegant and uses proven patterns. Creates Squad's third memory channel (intent). Deferred agent cloning (Phase 3) and proactive surfacing (Phase 4) — too much coordination complexity before capture is proven.
  - **Prioritized Demo 1 scripted infrastructure (026 partial):** Brady needs to show Squad to the world. One perfect demo beats five drafts. vhs tape files enable automated GIF generation and CI verification. Deferred Demos 2-5 until Demo 1 format is validated.
  - **Cut aggressively:** No Squad DM (second product surface), no agent-to-agent negotiation (premature), no speculative execution (needs lower silent success rate), no Squad Paper (content, not product), no model cost reporting (polish). v0.3.0 is intentionally 28-39h vs v0.2.0's 55-71h. Fewer items, done right.
  - **Two waves, not three:** Wave 1 (Intelligence) ships model selection + backlog capture. Wave 2 (Integration) connects them — Scribe merge, agent read access, model visibility, demo infrastructure. Smaller wave count means faster iteration and less gate overhead.
  - **Key insight:** v0.2.0 gave Squad hands (export, import, skills, tiered modes). v0.3.0 gives it a brain (right models, persistent intent, visible reasoning). The compound strategy is working — each version's features make the next version's features cheaper to build.

- **2026-02-10: GitHub-Native Team Planning (Proposal 028)**
  - **What I designed:** A four-phase plan to make Squad's internal planning artifacts (proposals, backlog items) visible on GitHub as Issues and Project boards. Phase 1 (one-way push, 3-4h) creates GitHub Issues when agents write proposals or capture backlog items. Phase 2 adds comment pull-back — human comments on issues flow into agent context. Phase 3 adds full GitHub Project board sync with column management. Phase 4 is aspirational cross-repo aggregation.
  - **Key architectural decision: filesystem remains authoritative, GitHub is a synchronized view.** Evaluated three options — filesystem-auth (Option A), GitHub-auth (Option B), and true bidirectional sync (Option C). Chose Option A because it preserves Squad's core strengths: agents read files not APIs, offline mode works, git history is the audit trail, and zero external dependencies for core operation. Option B would make Squad dependent on GitHub API availability. Option C is a product in itself (bidirectional sync is what Notion/Obsidian spend entire teams on). This extends Proposal 023's principle: "filesystem always wins, SQL is a queryable cache" → "filesystem always wins, GitHub is a collaboration cache."
  - **Shayne's door matters.** PR #2's GitHub Issues Mode points outward (work external issues). This proposal turns it inward (push internal planning to GitHub). Same `gh` CLI / MCP tools, different direction. The reuse is intentional — no new dependencies, no new patterns, just a new application of proven ones.
  - **Scoped out of v0.3.0 deliberately.** Phase 1 needs Proposal 023's backlog.md to exist first (shipping in v0.3.0). Phase 1 is the obvious v0.4.0 centerpiece — high value (80% of the vision), low risk (3-4h prompt engineering, no index.js changes), and it compounds with proactive backlog surfacing (also deferred to v0.4.0).
  - **Explicit scope boundary:** Only proposals and backlog items sync to GitHub. Decisions, history, skills, and charters stay filesystem-only. Without this boundary, scope gravity pulls everything into the sync surface and Squad becomes a sync engine instead of an agent orchestrator.

- **2026-02-10: 028 Phase 1 promoted to v0.3.0 — Brady override**
  - **What changed:** Brady overrode my recommendation to defer Proposal 028 (GitHub-Native Team Planning) to Horizon. His directive: "go with 0.3.0. brady and shayne want this." I revised Proposal 027 to add Phase 1 as Wave 2 item 5.9 (Verbal + Kujan, 3-4h). Updated sprint totals from 28-39h to 31-43h. Updated 028 status to "Phase 1 Approved for v0.3.0 ✅". Phases 2-4 remain deferred.
  - **Why I'd recommended deferral:** v0.3.0 was scoped tight (2 waves, 28-39h) and Phase 1 depends on backlog capture (4.5, 4.6) which hadn't shipped yet. Building on unproven infrastructure felt premature.
  - **Why Brady's call is sound:** Phase 1 is pure prompt engineering (3-4h, no index.js changes), reuses proven `gh` CLI patterns from PR #2, and the backlog capture it depends on IS shipping in v0.3.0 Wave 1. The risk is minimal. The value — planning artifacts visible on GitHub — is immediately tangible. When the product owner says "ship it" and the risk profile is low, you ship it.
  - **Updated sprint scope:** v0.3.0 is now 4 bets (model selection, backlog capture, demo infra, GitHub Issue sync), 16 items across 2 waves, 31-43h estimated. Still well under v0.2.0's 55-71h.
  - **Learning:** My instinct to protect scope is right most of the time. But when the scope addition is low-risk prompt engineering with zero code changes, the deferral instinct can be too conservative. Read the risk profile, not just the item count.

📌 Team update (2026-02-10): Model selection consolidated (024+024a+024b) — single approved spec for v0.3.0 Wave 1. — decided by Keaton
📌 Team update (2026-02-10): GitHub-native planning (028) Phase 1 promoted to v0.3.0 by Brady. — decided by Brady
📌 Team update (2026-02-10): Model fallback resilience is mandatory — nuclear fallback guarantees no broken spawns. — decided by Brady
