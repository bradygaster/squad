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


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

## Learnings

- **2026-02-10: Model Selection Algorithm Design (Proposal 024b)** — Designed the full model selection algorithm for the coordinator. Key decisions:

  - **4-layer priority is the right abstraction.** User override → charter preference → task-aware auto-selection → default fallback. Each layer is self-contained and testable independently. The coordinator stops at the first match — no cascading complexity.

  - **Fallback chains must be cross-provider.** Single-provider chains are fragile to provider outages. The chains alternate: Anthropic → OpenAI → Anthropic → OpenAI → nuclear. This handles both single-model issues and provider-wide failures.

  - **3-retry maximum before nuclear fallback.** Walking a 5-model chain with API timeouts could add 30-60 seconds of invisible latency. Three retries handles transient issues; after that, the nuclear fallback is faster.

  - **Nuclear fallback = omit model param entirely.** This is the only option guaranteed to work regardless of plan tier, org policy, or platform state. It's backward-compatible — Squad worked this way before model selection existed.

  - **Silent fallback is UX, not laziness.** Users don't care which model runs their agent. Narrating "tried X, failed, trying Y" creates anxiety and slows acknowledgment. Fallbacks are logged for debugging, never surfaced to the user.

  - **Provider diversity is optional, not forced.** Charters are Anthropic-optimized. Cross-provider execution risks prompt portability issues. Diversity is a tool for reviews and code gen, not a mandate for every spawn.

  - **Task complexity overrides apply at most ONE bump.** No cascading upgrades. An architecture proposal gets bumped to premium — it doesn't get bumped again because it's also multi-file.

  - **Design tension resolved — charter vs. algorithm authority.** The charter's `Preferred` field is a preference, not a command. The coordinator respects it but the user can override. The auto-selection algorithm runs only when the charter says `auto` or omits the section entirely. This keeps agents self-documenting without making them rigid.

  - **Design tension resolved — when to cross providers.** Trigger-based, not role-based. A reviewer doesn't always use Gemini — only when the coordinator detects that cognitive diversity adds value (e.g., second-opinion review after a rejection). Provider diversity is situational, not structural.

📌 Team update (2026-02-10): Model catalog expanded to 16 models across 3 providers — selection algorithm must consider full catalog, not just 3 Anthropic models. — decided by Kujan
📌 Team update (2026-02-10): v0.3.0 sprint plan approved — model selection (024 Phases 1-2), team backlog (023 Phases 1-2), Demo 1 infrastructure. Two waves, 28-39h. — decided by Keaton


📌 Team update (2026-02-10): Marketing site architecture consolidated — Jekyll on GitHub Pages, docs/ is source root, blog from team-docs/blog/, no content reproduction. McManus (content) + Fenster (infrastructure) for Phase 1. — decided by bradygaster, Keaton, McManus
📌 Team update (2026-02-10): Tone directive consolidated — all public-facing material must be straight facts only. No editorial voice, sales language, or narrative framing. Stacks on existing banned-words and tone governance rules. — decided by bradygaster, McManus


📌 Team update (2026-02-10): 0.3.0 priorities: async comms > GitHub-native > CCA adoption — decided by bradygaster

📌 Team update (2026-02-10): `squad:` label convention standardized — update coordinator prompts — decided by Keaton, McManus


📌 Team update (2026-02-10): Async comms strategy decided — two-tier MVP: CCA-as-squad-member (2-4h, prompt-only) + Telegram bridge (8-16h, conditional on SDK spike). CCA is the floor. — decided by Kujan

- **2026-02-10: Label Taxonomy & Workflow Engine (Proposal 032c)** — Designed the complete label system for GitHub-native Squad. Key decisions:

  - **Labels ARE the state machine.** 8 status labels with formal transitions — `status:draft` → `status:reviewing` → `status:approved` → `status:implementing` → `status:done`, plus `status:blocked`, `status:shelved`, `status:superseded`. Exactly one status label per issue at any time. Transitions are label swaps (remove old, apply new).

  - **Namespaced labels prevent collisions.** `status:`, `type:`, `priority:`, `squad:`, `era:` — colon-separated namespaces are parseable (`split(':')`) and avoid conflicts with existing project labels. Follows Kubernetes/Prometheus conventions.

  - **Milestones for sprints, not labels.** `sprint:current` would require constant relabeling. GitHub Milestones have due dates, progress bars, and native grouping. The right tool for the job.

  - **39 labels total across 7 namespaces.** Status (8), Type (8), Priority (4), Squad routing (3 + per-agent), Automation (6), Migration/provenance (4). Within GitHub's practical limits.

  - **Migration mapping is honest.** All 44 existing proposals classified by actual status from their markdown headers: 22 implemented/closed, 3 superseded/closed, 12 shelved/open, 3 approved/active/open, 2 draft/open, 2 research/closed. Proposal 015 gets `type:bug` + `priority:p0`. Proposal 024 stays `status:approved` (not done — implementation was deferred).

  - **Provider abstraction is a mapping layer.** ADO uses built-in State field + Tags. GitLab uses scoped labels (`status::draft` with `::` for native mutual exclusion). The coordinator works with Squad labels; the provider adapter translates. Only GitHub adapter exists today.

  - **CCA integration is label-gated.** `cca-eligible` is the sole trigger for Copilot Coding Agent assignment. Opt-in, auditable, no other path to `@copilot`.

  - **`status:shelved` keeps issues open.** Shelved ≠ dead. Closing hides from default views. Open shelved issues stay visible as deferred backlog. Unshelving is a label swap, not a reopen.


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan
