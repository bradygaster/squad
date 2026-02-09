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
