# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from sessions through 2026-02-09. Full entries in `history-archive.md`._



### Session Summaries

- **Messaging as product strategy (2026-02-07)**
- **2026-02-07: Proposal-first as agent discipline** — **Core insight:** Agents can participate in meta-work (defining team process), not just execution. Proposals force agents to articulate trade-offs, al
- **2026-02-07: Video content strategy as first-mover play** — 📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, r
- **2026-02-08: Agent Persistence & Latency — Experience Design (Proposal 007)** — **Context:** Brady's feedback — "later on, the agents get in the way more than they help." Collaborated with Kujan on diagnosis and solutions.
- **2026-02-08: Portable Squads — Experience Design (Proposal 008)** — **Context:** Brady's "HOLY CRAP" moment — export your squad, take them to the next project. The biggest feature idea yet.
- **2026-02-08: Skills System — Agent Competence as Portable Knowledge (Proposal 010)** — **Context:** Brady dropped the word "skills" — *"the more skills we can build as a team. GIRL. you see where i'm going."* He sees the convergence: por
- **2026-02-09: The Squad Paper — meta-argument design (Proposal 016)** — **Context:** Brady requested a paper making the legitimate case for multi-agent teams, specifically addressing the "squads are slow" criticism by show
- **2026-02-09: Skills System Revision — Agent Skills Standard + MCP (Proposal 010 R2)** — **Context:** Brady clarified his skills vision: *"claude-and-copilot-compliant skills that adhere to the anthropic 'skills.md' way"* and *"could we al
- **2026-02-09: Scribe spawn cascade fix — inbox-driven resilience** — **Problem:** The coordinator only spawned Scribe after successful agent responses. The silent success bug (~40% drop rate) causes agent responses to b
- **2026-02-09: Silent success bug audit — findings from self-inspection** — **Three issues found during P0 bug hunt:**
- **2026-02-09: Squad DM — Experience Design for Messaging Interfaces (Proposal 017)** — **Context:** Brady wants to interact with his squad from Telegram/Slack/SMS when away from the terminal. Referenced MOLTS as inspiration. Prefers dev 
- **2026-02-08: Per-Agent Model Selection — Proposal 024** — **File path:** `docs/proposals/024-per-agent-model-selection.md`
- **2026-02-09: Tone audit — what counts as a violation** — **Context:** Brady's tone governance directive. Full audit of all public-facing content.
- **2026-02-09: "Feels Heard" — Immediate acknowledgment as UX requirement** — **Insight — blank screens kill trust:**
- **2026-02-09: Silent success deeper mitigation — Sprint Task 1.5** — **Context:** The P0 silent success bug (~7-10% of spawns) causes agents to complete all file writes but return no text response. The existing mitigati
- **2026-02-09: Incoming Queue — Coordinator as Message Processor (Proposal 023)** — **Context:** Brady's insight — *"copilot itSELF has built-in 'todo list' capability"* — the coordinator should do useful work before agents start, not
- **2026-02-09: Code-level leak audit for v0.2.0** — **Audit scope:** Full review of `index.js`, all `templates/` files, `.github/agents/squad.agent.md`, and `package.json` for internal state leakage vec
- **Docs content audit for shipping (2026-02-08)** — **Context:** Release pipeline updated to include `docs/` and `CHANGELOG.md` in the npm package. Full audit of every file in docs/ for internal state l
- **2026-02-09: Proposal 023 v2 — SQL hot layer, backlog elevation, agent cloning** — **Key architecture evolution — SQL as cache, not storage:**
- **2026-02-08: v0.1.0 Postmortem — State Leak Incident**
- **2026-02-08: Per-Agent Model Selection Design**
- **2026-02-09: PR #2 Prompt Review — GitHub Issues, PRD Mode, Human Members** — 📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from bla
- **2026-02-09: Tiered Response Modes — Implementation (Wave 2, Item 2.1)** — **What was built:**
- **2026-02-10: Skills Phase 1 — Template + Read (Wave 2, Item 2.3)** — **What was built:**
- **2026-02-10: Skills Phase 2 — Earned Skills (Wave 3, Item 3.2)** — **What was built:**
- **Progressive history summarization (Wave 3)** — 📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be s
- **Scripted demo pipeline design (2026-02-09)**
- **2025-07-15: User-Facing Documentation — Product Guide, First Session Tour, GitHub Issues Tour** — **Context:** Created comprehensive user-facing documentation as three documents in docs/.

## Recent Updates

📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): Incoming queue architecture direction — SQL as hot working layer, filesystem as durable store, team backlog as key feature, agents can clone across worktrees — decided by Brady
📌 Team update (2026-02-08): Platform assessment confirms SQL todos table is session-scoped only, filesystem is sole durable cross-session state, Option A (broaden directive capture) recommended — decided by Kujan
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): Export + Import CLI shipped — squads are now fully portable via squad-export.json. Round-trip at 100% fidelity. History split is pattern-based. — decided by Fenster
📌 Team update (2026-02-09): Celebration blog conventions established — wave:null frontmatter, parallel narrative structure, stats in tables, tone ceiling applies. — decided by McManus
📌 Team update (2026-02-09): Portable Squads consolidated — architecture, platform, and experience merged into single decision — decided by Keaton, Kujan, Verbal
📌 Team update (2026-02-09): Skills system consolidated — open standard with MCP tool declarations, merging 4 independent analyses — decided by Kujan, Verbal
📌 Team update (2026-02-09): Squad DM consolidated — architecture and experience design merged — decided by Keaton, Verbal
