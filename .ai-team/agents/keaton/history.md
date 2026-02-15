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

📌 Team update (2026-02-13): VS Code runSubagent spawning — platform parity and adaptation strategy (consolidated). runSubagent viable with platform detection and custom .agent.md files. Spawn patterns all map 1:1; model selection is the gap; recommendation: prompt-level platform detection, no abstraction layer. Unblocks #32-35. — decided by Keaton, Strausz, Kujan
📌 Team update (2026-02-13): Context window optimization — spawn template dedup and Init Mode compression. Applied surgical optimizations to squad.agent.md (Issue #37): removed two redundant spawn templates, compressed Init Mode from 84 to 48 lines. Saved ~4,270 tokens per coordinator message. — decided by Keaton
📌 Team update (2026-02-13): Plugin Marketplace Integration. When adding new team members, coordinator checks configured plugin marketplaces for relevant templates and skills. State in `.ai-team/plugins/marketplaces.json`. CLI: `squad plugin marketplace add|remove|list|browse`. Issue #29 resolved. — decided by Keaton
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

_Summarized 2026-02-10+ learnings (full entries available in session logs):_

- **2026-02-10+: Issue #6 (Project Boards) — Go/No-Go Assessment**
  - **Verdict: GO (Conditional v0.4.0).** Projects V2 integration is architecturally sound and technically feasible with zero npm dependencies using `gh project *` CLI commands. Kujan's 033a assessment confirmed: 12 operations map cleanly to CLI, MCP server has zero Projects tools, provider abstraction works for GitHub/ADO/GitLab. Single prerequisite: Brady must grant `project` token scope (`gh auth refresh -s project`). Three-phase sprint plan: Phase 1 (6-9h foundation validation), Phase 2 (7-11h integration, parallelizable), Phase 3 (4-6h polish). Total 17-26h across Fenster (core), Verbal (prompts), McManus (docs). v0.4.0 timing is intentional — labels + issues (v0.3.0) are the foundation; boards are the dashboard (v0.4.0). Posted as comment on Issue #6 at https://github.com/bradygaster/squad/issues/6#issuecomment-3888277477.

- **2026-02-10: Model Selection (024 consolidated)** — Merged 024+024a+024b into single spec. 4-layer selection priority, 16-model catalog condensed to 4 columns, nuclear fallback for resilience. Status: Approved ✅ for v0.3.0 Wave 1.
- **2026-02-10: v0.3.0 Sprint Plan (027)** — 4 bets: model selection, backlog capture, demo infra, GitHub Issue sync. 2 waves, 31-43h. v0.2.0 gave hands; v0.3.0 gives a brain. Cut aggressively: no Squad DM, no agent negotiation, no speculative execution.
- **2026-02-10: GitHub-Native Planning (028)** — 4-phase plan. Phase 1: one-way push of proposals/backlog to GitHub Issues (3-4h, prompt-only). Key: filesystem authoritative, GitHub is collaboration cache. Only proposals and backlog items sync; decisions/history/skills stay filesystem-only.
- **2026-02-10: 028 Phase 1 promoted to v0.3.0** — Brady overrode deferral. Low-risk prompt engineering, reuses PR #2 patterns. Learning: read risk profile, not just item count.
- **2026-02-10: Marketing Site (029)** — Jekyll on GitHub Pages, `docs/` as source root. No content reproduction. Classic mode, zero CI. Phase 1: 5-8h (McManus + Fenster).
- **2026-02-10: Universe Expansion (Keaton decision)** — Brady: "People think we need more universes." Analysis identified 4 coverage gaps (geography, genre, size distribution, developer resonance). Added 6 universes to reach 20 total: Monty Python (9), Doctor Who (16), Attack on Titan (12), The Lord of the Rings (14), Succession (10), Severance (8). Maintains all 14 original universes (no removals). Result: British + anime now represented; fantasy added; sci-fi goes 3→6 universes; size distribution better balanced. Sweet spot hit (18-22 range). Updated policy.json, squad.agent.md, and decisions/ artifact.

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

📌 Team update (2026-02-11): Fritz video analysis merged — product signal: v0.2.0 features (skills, export, triage) not discovered in demo, parallel execution not visually apparent, iteration loop not demoed — decided by McManus


📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

- **2026-02-11: Issue #9 triage and GitHub-native client parity (Keaton decision)**
  - **Issue #9 from @miketsui3a:** Raised a valid question—no `task` tool in VS Code Copilot, only `runSubagent`. This exposed a critical gap: Squad conflates CLI-specific tooling with core architecture.
  - **Root cause:** Squad was designed on and for the Copilot CLI. The `task` tool (sub-agent spawn) is CLI-specific; VS Code exposes `runSubagent`. `/delegate` (user-facing background work) is also CLI-specific. Squad's coordinator assumes these tools exist.
  - **Posted response to #9:** Clarified the distinction (CLI `task` vs VS Code `runSubagent`, user-facing `/delegate` vs agent-facing `task`), documented current parity limitation (CLI only), and committed to filing a tracking issue.
  - **Filed Issue #10 (Copilot client parity):** Created P1 tracking issue to systematically validate Squad across CLI, VS Code, JetBrains, and GitHub.com. Key unknowns: sub-agent spawning tool names, async execution patterns, MCP discovery, model selection support. Success = graceful degradation where features unavailable.
  - **Key learning: Tool naming is API surface.** Squad's architecture (markdown + prompts) is portable. The tooling assumptions (task, /delegate, /tasks, model override) are not. This is a **platform abstraction gap**, not an architecture flaw.
  - **Architecture implication:** Future proposals that assume sub-agent spawning need a "CLI fallback" section. If `task` doesn't exist, what's the Plan B? (GitHub Actions? Async comment loop? Deferred to v0.4.0?)
  - **Key file paths:** Issue #9 (community question), Issue #10 (tracking), `.ai-team/agents/keaton/history.md` (this entry).

📌 Team update (2026-02-11): Copilot client parity gap identified — Issue #10 filed as P1 tracking. Squad works fully only on CLI; other clients need validation and potential graceful degradation. — decided by Keaton

- **2026-02-11: Messaging Platform Selection for Squad DM — Discord chosen as MVP connector**
  - **Facilitated discussion with Kujan and Verbal.** Brady's inputs: no Telegram (prefers Discord), users asking for Teams, concerned about GitHub-specific lock-in closing the door on AzDO/GitLab.
  - **Discord replaces Telegram as the v0.3.0 MVP connector.** Build cost delta is minimal (~30-70 LOC over Telegram). Discord's channel-per-repo is native, rich embeds give per-agent color identity, and the dev community already lives there. Brady's preference aligns with the technical and UX analysis.
  - **Three-tier delivery confirmed:** Tier 1 = CCA-as-squad-member via GitHub Issues (2-4h, prompt-only). Tier 1b = Discord webhook notifications for one-way alerts (30 min). Tier 2 = Discord conversational bridge via Copilot SDK (8-16h).
  - **GitHub integrations are notification-only, not messaging.** GitHub-for-Teams app delivers event cards but is not programmable. Copilot Extensions are the wrong architecture. GitHub Actions webhooks can push one-way alerts to Discord/Teams for free.
  - **Platform lock-in is architecturally mitigated.** Squad DM Gateway must have zero GitHub-specific imports. Adapters are thin and replaceable (discord.js, Bot Framework SDK, etc.). CCA is GitHub-only but additive, not foundational.
  - **DM output is platform-neutral, adapters handle rendering.** Prompt produces markdown summary. Discord adapter renders as rich embeds with agent colors. Teams adapter renders as Adaptive Cards. No per-platform prompt variants needed.
  - **Teams is the v0.4.0 second connector.** Best per-repo organization (channels within a Team). Higher build cost (Azure Bot Service registration). Not MVP but next.
  - **Key file paths:** `team-docs/proposals/030a-dm-platform-experience-analysis.md` (Verbal), `team-docs/proposals/030a-connector-recommendation-update.md` (Kujan), `.ai-team/decisions/inbox/keaton-messaging-platform.md`

📌 Team update (2026-02-11): Discord is v0.3.0 MVP messaging connector for Squad DM, replacing Telegram. Three-tier delivery: CCA (prompt-only) → Discord webhooks (30 min) → Discord bridge (8-16h). Teams is v0.4.0. Squad DM Gateway must have zero GitHub-specific imports. — decided by Keaton, Kujan, Verbal

- **2026-02-11: Proposal 034 — MCP Integration for Squad Agents (Issue #11, Fritz's Request)**
  - **Fritz (@csharpfritz) filed Issue #11 requesting MCP integration.** His ask is concrete and well-motivated: (1) interact with MCP services configured in mcp.json, (2) enable Trello board management alongside GitHub Issues, (3) enable Aspire dashboard monitoring during deployments. All valid extensions of Squad's provider-agnostic architecture.
  - **Identified the critical unknown: Copilot platform behavior.** Does the platform automatically inject MCP tools into spawned agents when mcp.json is configured? This is the gate for all downstream decisions. WI-1 (spike) answers this in 2-3 hours. Without this answer, we can't recommend a confident path.
  - **Designed three options by effort level:**
    - Option A (Platform-Native, zero work): MCP tools auto-inject, Squad does nothing. Risk: silent failures if assumption is wrong.
    - Option B (Awareness Layer, 4-6 hours): Coordinator reads mcp.json, lists available tools to agents. Low risk, unlocks all of Fritz's use cases.
    - Option C (Routing Integration, 8-12 hours): Awareness + ceremonies (Trello sync, Aspire checks, etc.). Premature — ceremonies should emerge from real usage.
  - **Recommended Option B.** It's pragmatic: do the minimum (discovery) that unlocks both use cases without committing to ceremonies we haven't validated. All prompt-level, zero npm dependencies (jq parsing is trivial). WI-1 spike gates the commitment.
  - **Fritz's use cases are the design drivers.** Trello = sync between GitHub Issues (code) and Trello boards (planning). Aspire = monitor metrics/logs during deployment, decide to proceed or rollback. Both achievable with awareness layer.
  - **v0.3.0 Wave 2 or v0.4.0 timing.** Depends on WI-1 results. If platform auto-injection is confirmed, slip into v0.3.0 (3-4 hours, low risk). If uncertain, defer to v0.4.0 and resolve platform questions first.
  - **Posted comment on Issue #11** thanking Fritz, sharing proposal highlights inline (since links to local files don't work), asking for feedback on priorities and other MCP services.
  - **Key learning: Not all unknowns are equal.** This one (platform behavior) is a blocker for all implementation work. Spent proposal time clarifying the unknown rather than speculating past it. WI-1 validates the whole direction upfront.
  - **Key file paths:** `team-docs/proposals/034-mcp-integration.md`, `.ai-team/decisions/inbox/keaton-mcp-integration.md`, GitHub Issue #11 comment (posted).

📌 Team update (2026-02-11): Proposal 034 — MCP Integration architecture designed. Recommendation: Option B (Awareness Layer, 4-6h). Blocks on WI-1 platform behavior validation. Fritz's use cases: Trello board sync + Aspire dashboard monitoring. — decided by Keaton

📌 Team update (2026-02-11): MCP Integration Direction for Squad approved — Option B (Awareness Layer) chosen. Phase 1 spike (WI-1) validates platform MCP support. See decisions.md for rationale and timeline. — decided by Keaton


📌 Team update (2026-02-12): Branching strategy finalized — feature branches (squad/{issue}-{slug}) to dev via PR, release pipeline handles preview→main — decided by Keaton, analyzed by Fenster, hardened by Kobayashi

📌 Team update (2026-02-12): Release process hardened with branch protection rules and CI/CD-only writes to preview/main — decided by Kobayashi and Brady

📌 Team update (2026-02-12): Issue #6 (Project Boards) approved for v0.4.0. GO (Conditional) — pending Brady's project token scope grant. 3-phase implementation plan (17-26 squad-hours), agent assignments finalized. — decided by Keaton
📌 Team update (2026-02-13): go:/release: label automation shipped — Four-workflow system enforces label namespace integrity (go:* triage verdicts, release:* version targets). Mutual exclusivity at runtime, special cases (go:yes auto-adds release:backlog), heartbeat detects label hygiene gaps. Labels-as-state-machine is now foundational to GitHub-native workflow. — decided by Fenster

- **2026-02-11: Proposal 034 — Squad Pings You (Notification Architecture)**
  - **Brady's vision:** "It needs to feel like I'm not in the team room, they are, and they need me so they pinged me." He wants notifications on his phone (Teams or iMessage) when squad agents hit a wall requiring human input.
  - **Architectural decision: Squad ships ZERO notification infrastructure.** This is an MCP integration pattern — the consumer brings their own notification MCP server (Teams, iMessage, Discord, webhook). Squad teaches agents WHEN and HOW to notify via a skill.
  - **Three-layer architecture:** (1) Notification skill at .ai-team/skills/human-notification/SKILL.md teaches agents when to ping, (2) MCP tool abstraction (no hardcoded tool names), (3) Consumer's MCP server (user-configured in .vscode/mcp.json).
  - **Notification trigger taxonomy:** BLOCKED (work cannot proceed), ERROR (unrecoverable failure), DECISION (strategic choice needed), COMPLETE (opt-in only, for completion notifications).
  - **Platform-agnostic message format:** Agent name + emoji + type badge + context + action + link. Platform-specific renderers: Teams (Adaptive Cards), iMessage (plain text), webhook (JSON payload).
  - **Primary path: Microsoft Teams.** Brady said "ideal, especially per-repo channels." Teams channels-per-repo is native, Incoming Webhooks are simple (POST JSON to URL), mobile UX is enterprise-standard. Official MCP server exists: @microsoft/teams.mcp.
  - **Secondary path: iMessage (Mac-only).** Zero account setup, instant delivery. Limitations: requires macOS with Messages.app running, cannot run headless. MCP server exists: imessage-mcp or imsg CLI.
  - **Graceful degradation:** If no MCP server is configured, agents log the notification attempt and continue. Notifications are an enhancement, not a requirement.
  - **Integration with existing features:** Human Team Members get BLOCKED notifications when work routes to them. Ralph can escalate stale work via notifications (opt-in). Coordinator triggers notifications when agents return blocked.
  - **Zero maintenance burden for Squad:** The consumer owns the MCP server, credentials, and delivery mechanism. When Teams changes their API, the MCP server maintainer updates the server — not Squad.
  - **Sprint estimate:** 1.8 squad-days (core) + 0.3 squad-days (Ralph integration, optional). Target version: 0.3.0 (alongside GitHub-native proposals).
  - **Key file paths:** 	eam-docs/proposals/034-notification-architecture.md (full spec), .ai-team/skills/human-notification/SKILL.md (agent-facing skill), future docs/notifications.md (consumer setup guide).


📌 Team update (2026-02-12): Squad Notification Architecture (Proposal 034) merged into decisions.md — MCP integration pattern, Teams primary, iMessage secondary, skill-based trigger system (BLOCKED/ERROR/DECISION/COMPLETE). — decided by Keaton

- **2026-02-12: Issue #10 Decomposition — VS Code Priority for Copilot Client Parity (Keaton decision)**
  - **Brady's directive:** "VS Code is the priority. If we need to split #10, deal with VS Code first. JetBrains, GitHub.com, and other surfaces are secondary."
  - **Decomposed Issue #10 into 5 sub-issues on GitHub:**
    - **#32 (P0, v0.4.0):** VS Code `runSubagent` compatibility. Test spawn mechanism, parameter support (model, mode, description), background execution, compatibility layer.
    - **#33 (P0, v0.4.0):** VS Code file discovery & .ai-team/ access. Test squad.agent.md discovery, .ai-team/ read/write capability, filesystem API equivalence.
    - **#34 (P1, v0.4.0):** VS Code model selection & background mode parity. Validate `runSubagent` model parameter, async equivalent, fallback behavior.
    - **#35 (P1, v0.4.0):** Compatibility matrix document. Feature × Surface table (CLI ✅, VS Code ?, JetBrains ?, GitHub.com ?), fallback strategies, docs placement.
    - **#36 (P2, deferred v0.5.0):** JetBrains + GitHub.com research. Deferred until VS Code is solid. Same pattern: spawn, file discovery, model selection.
  - **Posted comment on #10** documenting decomposition, timeline (Wave 1 v0.4.0 = VS Code, Wave 2 v0.5.0 = broader surfaces), success metric (graceful degradation across all surfaces).
  - **Created decision artifact:** `.ai-team/decisions/inbox/keaton-vscode-priority.md` — rationale (market position, feature validation, Brady's directive), decomposition strategy, success criteria, risk mitigation.
  - **Key learning: Platform abstraction is a multi-surface problem.** Issue #9 identified the tool-naming gap (CLI `task` vs VS Code `runSubagent`). This decomposition validates the architectural insight — core (squad.agent.md, orchestration, memory) is portable; tooling assumptions (task, /delegate, model override) are not. Each Copilot surface needs a compatibility layer.
  - **Strategic timing:** VS Code parity enables full Squad adoption on the dominant editor. Deferring JetBrains + GitHub.com to v0.5.0 keeps v0.4.0 scope tight (Project Boards + client parity = 2 major features). Brady's priority directive is operationalized via issue labels (release:v0.4.0 vs v0.5.0) and decomposition.
  - **Key file paths:** Issues #32–#36 (created on GitHub), `.ai-team/decisions/inbox/keaton-vscode-priority.md` (decision), this history entry.

📌 Team update (2026-02-12): Copilot client parity issue (#10) decomposed into 5 sub-issues. VS Code is P0 (v0.4.0), JetBrains + GitHub.com deferred to v0.5.0. Decision: keaton-vscode-priority.md. Issues: #32–#36. — decided by Keaton per Brady
📌 Team update (2026-02-13): VS Code priority decision merged from inbox — Market position (VS Code dominance), feature validation (most complete Copilot integration), Brady's directive. Decomposition strategy for Issues #32–#36. Graceful degradation across all surfaces. — decided by Keaton

- **2026-02-13: Proposal 022a — Agent Progress Updates (Issue #22, Design Spike)**
  - **Brady's request:** Users feel uncertain during long-running agent work — "Is anything happening?" Terminal goes quiet. Proposal 022a designs a mechanism for periodic status updates that feel native to agent personality, not generic "still working..." messages.
  - **Problem framing:** Not a technical blocker; it's a design problem. The coordinator can already poll agents via `read_agent` with short timeouts. The real constraint is: what's the right signal? Right cadence? Right voice?
  - **Platform mechanisms evaluated:**
    - Option A: Coordinator polling via `read_agent` (30-second intervals, 1 API call per poll, works with any agent output)
    - Option B: Agents write milestone files to `.ai-team/progress/` (agents control message, but requires discipline, file coordination issues)
    - Option C: Agents emit `[MILESTONE]` signals in output + coordinator extraction (agents control voice, coordinator relays via read_agent polling)
    - Option D: Event log drop-box (over-engineered, unnecessary complexity)
  - **Recommended: Option C hybrid (Milestone Signals + Coordinator Relay).** Combines A's cost efficiency with C's voice control:
    - Coordinator polls agents every 30s via read_agent (same cost as final result collection, zero additional API calls)
    - Agents trained to emit `✅ [MILESTONE] Analyzed 150/400 files` at natural breakpoints
    - Coordinator scans output for `[MILESTONE]` markers every 30s, displays new milestones to user
    - Result: User sees periodic progress (e.g., "📍 Keaton — ✅ Parsed 150/400 files") without needing to understand coordinator internals
  - **UX outcome:** 5-minute task shows no progress. 3-minute task with milestones shows "Parsed files → Found dependencies → Generating suggestions → Complete." 8+ minute task with errors shows "Starting → Progress → Error encountered → Retrying → Success → Report ready." User feels team is alive.
  - **Implementation:** Add progress polling loop to coordinator spawn flow (30 lines). Create `.ai-team/skills/progress-signals/SKILL.md` to teach agents the pattern. Zero agent code changes required; skill is opt-in documentation. Backward compatible.
  - **Squad.agent.md impact:** New section on progress polling. Example spawn template showing 30-second polling loop. Coordinator reads read_agent output, extracts milestones matching `\[MILESTONE\]` regex, relays to user with agent name and emoji prefix.
  - **Success criteria:** Coordinator milestone extraction works for 10+ common formats. Agents adopt pattern within 1-2 spawns. No performance degradation (polling overhead < 100ms). Users report less uncertainty in post-launch feedback.
  - **Brady's cost model fit:** Excellent. No new infrastructure. Reuses read_agent (already called at end). 30-second polling is industry standard (GitHub Actions, CI/CD). Milestone discipline is self-enforcing (agents choose what matters to highlight).
  - **Compound value:** This unlocks the "remote team member" feeling. When combined with Proposal 034 (notifications), agents can notify users mid-work for BLOCKED decisions. When combined with Squad DM, milestones can sync to Discord. Visible progress is foundational for agent-user intimacy.
  - **Strategic insight:** Users don't need real-time streams. They need to know work is progressing. 30-second updates feel alive without being noisy. The milestone pattern aligns with how human teams actually work — "we're at this checkpoint now, moving to the next phase."
  - **Key file paths:** `team-docs/proposals/022a-agent-progress-updates.md` (full spec, 180KB), GitHub Issue #22 (comment with summary).
  - **Status:** Proposed, awaiting Brady approval. Estimated v0.4.0 delivery: 3-4 hours (Fenster for coordinator, Verbal for skill design).

📌 Team update (2026-02-13): Agent Progress Updates (Proposal 022a) designed and proposed — Milestone signals + coordinator polling (30s intervals). Recommended for v0.4.0 after Project Boards. Addresses user uncertainty during long-running work. Zero additional API cost. Preserves agent personality. — designed by Keaton

## Learnings

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

