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

_Summarized 2026-02-10 learnings (full entries available in session logs):_

- **2026-02-10: Model Selection (024 consolidated)** — Merged 024+024a+024b into single spec. 4-layer selection priority, 16-model catalog condensed to 4 columns, nuclear fallback for resilience. Status: Approved ✅ for v0.3.0 Wave 1.
- **2026-02-10: v0.3.0 Sprint Plan (027)** — 4 bets: model selection, backlog capture, demo infra, GitHub Issue sync. 2 waves, 31-43h. v0.2.0 gave hands; v0.3.0 gives a brain. Cut aggressively: no Squad DM, no agent negotiation, no speculative execution.
- **2026-02-10: GitHub-Native Planning (028)** — 4-phase plan. Phase 1: one-way push of proposals/backlog to GitHub Issues (3-4h, prompt-only). Key: filesystem authoritative, GitHub is collaboration cache. Only proposals and backlog items sync; decisions/history/skills stay filesystem-only.
- **2026-02-10: 028 Phase 1 promoted to v0.3.0** — Brady overrode deferral. Low-risk prompt engineering, reuses PR #2 patterns. Learning: read risk profile, not just item count.
- **2026-02-10: Marketing Site (029)** — Jekyll on GitHub Pages, `docs/` as source root. No content reproduction. Classic mode, zero CI. Phase 1: 5-8h (McManus + Fenster).

📌 Team update (2026-02-10): Model selection consolidated (024+024a+024b) — single approved spec for v0.3.0 Wave 1. — decided by Keaton
📌 Team update (2026-02-10): GitHub-native planning (028) Phase 1 promoted to v0.3.0 by Brady. — decided by Brady
📌 Team update (2026-02-10): Model fallback resilience is mandatory — nuclear fallback guarantees no broken spawns. — decided by Brady
📌 Team update (2026-02-10): Marketing site architecture decided — Jekyll on GitHub Pages, docs/ is the source root, no content reproduction. Phase 1: 5-8h. — decided by Keaton


📌 Team update (2026-02-10): GitHub Issues/PR integration must not break CLI conversations — CLI is primary surface, GitHub integration is additive only. — decided by bradygaster
📌 Team update (2026-02-10): Tone directive consolidated — all public-facing material must be straight facts only. No editorial voice, sales language, or narrative framing. Stacks on existing banned-words and tone governance rules. — decided by bradygaster, McManus
📌 Team update (2026-02-10): Squad DM UN-DEFERRED — async comms is now P0 for v0.3.0, moved from Horizon. Brady's top personal priority. — decided by bradygaster
📌 Team update (2026-02-10): v0.3.0 restructured to 3 waves: Wave 1 (Reach — DM), Wave 2 (Integration — GitHub/CCA), Wave 3 (Intelligence — model selection/polish). — decided by Keaton per Brady
📌 Team update (2026-02-10): CCA adoption is a v0.3.0 deliverable — Squad as governance layer for Copilot Coding Agent. — decided by bradygaster
📌 Team update (2026-02-10): Clean branch configuration added to v0.3.0 — users configure protected branches at init time. — decided by bradygaster

- **2026-02-10: Proposal 028 updated with spboyer/slidemaker reference implementation**
  - **Shayne Boyer (@spboyer) validated 028's design patterns end-to-end** using Squad to decompose a PRD into 9 GitHub Issues on [spboyer/slidemaker](https://github.com/spboyer/slidemaker). 8 of 9 completed and closed. This is the first external validation of the PRD→Issues pipeline.
  - **Formalized the `squad:` label convention:** Two-tier labeling — `squad` base label on every squad-managed issue, `squad:{agent-name}` for per-agent routing (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`). Validated with 9 issues across 3 agents in slidemaker. Updated both 028 and 028a to use this convention instead of the old `squad-agent` label.
  - **Standardized issue template:** User story format ("As a {persona}, I want {capability}, so that {benefit}") with checkbox acceptance criteria and agent metadata (Squad member, Primary work files, Dependencies) in a Notes section. All 9 slidemaker issues follow this pattern.
  - **Key architectural insight:** Agent metadata injection in issue bodies (Squad member name, role, file paths) eliminates the need for external routing logic. The issue IS the assignment. Labels handle filtering; body handles context.
  - **Key file paths:** `team-docs/proposals/028-github-native-team-planning.md` (Reference Implementation section added), `team-docs/proposals/028a-github-api-capabilities.md` (prerequisites label list updated).


📌 Team update (2026-02-10): 0.3.0 top priorities set — (1) async squad comms, (2) GitHub-native integration, (3) CCA squad adoption — decided by bradygaster

📌 Team update (2026-02-10): Squad DM (Proposal 017) un-deferred to P0 for 0.3.0 — decided by bradygaster

📌 Team update (2026-02-10): `squad:` label convention standardized (consolidated Keaton + McManus) — decided by Keaton, McManus

📌 Team update (2026-02-10): Clean branch config at init time — repo owners choose protected branches — decided by bradygaster


📌 Team update (2026-02-10): Async comms strategy decided — two-tier MVP: CCA-as-squad-member (2-4h, prompt-only) + Telegram bridge (8-16h, conditional on SDK spike). CCA is the floor. — decided by Kujan

- **2026-02-10: v0.3.0 Sprint Plan — Major Revision per Brady's Priority Reorder**
  - **Brady fundamentally reordered v0.3.0.** Previous plan had model selection + backlog capture as Wave 1 centerpiece. Brady's new priorities: (1) async squad communication — P0, top personal priority, (2) GitHub Issues/PRs driving Squad behavior — validated by slidemaker, (3) CCA using repo's Squad as governance layer, (4) clean branch configuration, (5) model selection — still important but not Wave 1, (6) marketing site.
  - **Squad DM un-deferred from Horizon to P0.** I had deferred DM to v1.0 in the original plan — "second product surface, massive scope." Brady overruled. The three 017 proposals (my architecture, Kujan's feasibility, Verbal's experience design) become the design foundation instead of being filed away. My instinct to protect scope was wrong here — Brady knows what matters to HIM, and "team in your pocket" is a visceral upgrade over "tool on your computer."
  - **Three waves, not two.** Wave 1: Reach (DM, 21-32h). Wave 2: Integration (GitHub Issues, CCA, clean branches, 22-32h). Wave 3: Intelligence + Polish (model selection, marketing site, demos, 25-35h). Total: 68-99h, roughly double the original 31-43h plan. This is the right call — Brady added real scope, and pretending it's the same size would be lying.
  - **Scope pressure relief valves defined explicitly.** If the sprint runs long, cut Wave 3 in this order: demos, marketing site, Scribe merge, model selection. Wave 1 (DM) and Wave 2 (GitHub+CCA) are the v0.3.0 story — if those ship without Wave 3, it's still a strong release. If DM fails, it's not a v0.3.0 at all.
  - **SDK spike is the critical path.** W1.1 (Kujan's Copilot SDK spike) is a go/no-go gate for the entire DM architecture. If nested SDK sessions work, we get CLI-parity DM. If they don't, we fall back to GitHub Actions (higher latency, lower UX). This is the most consequential 4-6 hours in the sprint.
  - **CCA adoption is new scope.** Not in any previous proposal. Brady wants Copilot Coding Agent to discover `.ai-team/` and work under Squad governance. This is pure prompt engineering — documenting `squad.agent.md` as CCA's entry point, connecting `squad:` labels to agent charters. Low code risk, high strategic value.
  - **Key learning: when the product owner reorders priorities, don't fight it — replan.** My instinct was right about scope pressure. My instinct was wrong about which features matter most. Brady sees usage patterns I don't — he's the user. DM is the feature that makes Squad irreplaceable, not model selection. Model selection makes Squad smarter; DM makes it present.

- **2026-02-10: Proposal 032 — GitHub-Native Proposals (v0.3.0 sole feature)**
  - **Brady declared a single feature for v0.3.0:** proposals become GitHub Issues, not markdown files. This supersedes the previous sprint plan entirely. Everything else (async comms, model selection, marketing site, CCA-specific work) defers.
  - **Source-of-truth shift for proposals only.** Proposal 028 established "filesystem authoritative, GitHub as dashboard." Proposal 032 breaks this for proposals specifically: proposals are BORN on GitHub Issues, not pushed there. Rationale: proposals are collaborative artifacts — collaboration happens on GitHub, not in local files. All other team state (decisions, history, skills, charters) remains filesystem-authoritative.
  - **Deferred the Octomember.** Brady suggested a dedicated agent for git platform ops. I deferred it — git operations are coordinator-mediated, not cross-cutting like memory management (Scribe). The coordinator handles issue creation, comment posting, and label management directly. If prompt bloat becomes a problem later, revisit with Redfoot (The Usual Suspects name).
  - **Provider abstraction is command-template-level, not code-level.** The coordinator is a prompt, not a runtime. Abstracting providers means conditional command blocks in the prompt, not JavaScript interfaces. This fits Squad's architecture. index.js stays as an installer.
  - **Agent comments use signature blocks, not bot accounts.** Each agent comment is signed with emoji + name + role header and a "Posted by Squad" footer. Bot accounts would require GitHub App registration — too much infrastructure for v0.3.0.
  - **Phase 1 is prompt-only, zero index.js changes.** ~6-10 hours of prompt engineering in squad.agent.md. All proven tools (gh CLI, MCP reads). Slidemaker patterns validated end-to-end.
  - **Key file paths:** `team-docs/proposals/032-github-native-proposals.md` (the design doc), `.github/agents/squad.agent.md` (where all changes land).

- **2026-02-10: Proposal 032 expanded — Migration Plan, Actions Automation, Working in the Open (Sections 11-13)**
  - **Brady's three expansion directives:** (1) iterate on everything around GitHub-native proposals and Shayne's issue/PR work — this is 0.3.0, (2) port ALL existing proposals from markdown to GitHub Issues — no more md files in the squad repo, (3) factor in GitHub Actions for automation — sky's the limit.
  - **Migration Plan (Section 11):** Classified all 42 existing proposals into 4 categories: 18 Shipped (close as `status:shipped`), 12 Active (open with appropriate status label), 3 Superseded (close with successor reference), 5 Deferred (close as `status:deferred`), plus 017 DM consolidated into single open issue (un-deferred by Brady). Three-wave migration: active first, then shipped, then superseded+deferred. Script-assisted with agent review — not fully manual, not fully automated.
  - **Actions Automation (Section 12):** Designed 7 GitHub Actions workflows: proposal-bot (template check on label), proposal-consensus (auto-transition on owner approval), proposal-decompose (create CCA decomposition task on approval), proposal-stale (weekly inactive cleanup), agent-comment (async comment posting via workflow_dispatch), proposal-lint (required section checker), cca-assign (auto-assign `squad:copilot` issues to @copilot). Workflows ship to consumer repos via `squad init` (core set) with opt-in extras.
  - **Working in the Open (Section 13):** Squad's own development becomes public via GitHub Issues. Proposals, agent analysis, design discussions, and approvals are all visible. The slidemaker pattern (Shayne opens issues, agents work them) is the template for all contributions. Key boundary: collaborative artifacts are public (proposals, PRs, issues), team state is private (history, decisions, skills, charters).
  - **Key architectural decision:** The `team-docs/proposals/` directory gets a redirect README post-migration (Option C), with full archive branch in v0.4.0. Migration script lives at `.github/scripts/migrate-proposals.sh` — internal tooling, not shipped.
  - **Key learning:** Brady's "sky's the limit" on Actions is the force multiplier. The proposal lifecycle that was fully coordinator-mediated in Sections 1-10 now has automation support at every stage. The coordinator still orchestrates, but Actions handle the mechanical transitions (approval → label, stale → close, CCA → assign). This reduces coordinator prompt bloat and enables async workflows that outlive any single CLI session.


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

## Learnings

- **2026-02-10: Proposal 033 — Project Boards (Issue #6, community contribution)**
  - **@londospark opened Issue #6 requesting GitHub Project Board support.** First community feature request with a concrete technical proposal. Well-structured: 3-layer architecture (GraphQL → Board Init → Task Management), identifies token scope requirements, specifies V2 API need.
  - **Deferred to v0.4.0.** Brady's v0.3.0 directive is clear: ONE feature (032 — proposals as GitHub Issues). Boards are a dashboard layer that depends on the label/issue infrastructure shipping in v0.3.0. Boards without labels are empty columns.
  - **GraphQL via `gh api graphql`, not npm packages.** The zero-dependency constraint is strategic, not accidental. `gh api graphql` handles auth and the protocol. Adding `graphql-request` would be Squad's first `node_modules` — a bigger decision than this feature warrants.
  - **Labels are authoritative, boards are projections.** One-way sync: labels → board columns. No reverse sync. The board is a view, not a source of truth. This matches 032c's "labels are the state machine" principle.
  - **5-column board, not 3.** The issue proposed Todo/In Progress/Done. Our label taxonomy has 8 statuses, mapped to 5 active columns: Backlog, Ready, In Progress, Blocked, Done.
  - **Provider abstraction matters here.** ADO has native boards. GitLab has label-driven boards. GitHub Projects V2 is GraphQL-only. The capability negotiation pattern (032a §2.8) handles this — `projectBoards: boolean` in getCapabilities().
  - **Key learning: community contributions validate the direction.** An external contributor independently proposed the same GitHub-native surface strategy we've been designing. This confirms the v0.3.0 bet — making GitHub the collaboration surface is what people want.
  - **Key file paths:** `team-docs/proposals/033-project-boards.md`, `.ai-team/decisions/inbox/keaton-project-boards.md`

- **2026-02-10: Community Issue Triage — Issues #6 and #8**
  - **Triaged two community feature requests** and posted substantive follow-up comments via `gh issue comment`.
  - **Issue #8 (@essenbee2): Provider abstraction.** Request to not lock Squad into GitHub. Posted a comment referencing the provider abstraction architecture (032a), capability negotiation, local-mode fallback, Day 1/Day 2 strategy, and cross-platform label mapping. Applied `enhancement` label.
  - **Issue #6 (@londospark): Project boards.** Request for GitHub Projects V2 integration. Posted a comment referencing Proposal 033 (project boards), 033a (feasibility), the "labels are the state machine, boards are the dashboard" architecture, the `gh project` CLI approach (zero dependencies), 5-column mapping, opt-in design, and v0.4.0 timeline. Applied `enhancement` label.
  - **Key decision: community engagement tone.** Both comments follow Brady's tone directive — straight facts, no hype, no editorial voice. Referenced specific internal design work to show depth of thought without overpromising.
  - **Key learning:** Community contributors are independently requesting features we've already designed. This validates the product direction. The team's proposal-first workflow means we have substantive technical details to share, not just "great idea, we'll look into it."


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan
