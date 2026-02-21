# Project Context

- **Owner:** bradygaster
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

📌 Team update (2026-02-13): VS Code runSubagent spawning — platform parity and adaptation strategy (consolidated). runSubagent viable with platform detection and custom .agent.md files. Spawn patterns all map 1:1; model selection is the gap; recommendation: prompt-level platform detection, no abstraction layer. Unblocks #32-35. — decided by Keaton, Strausz, Kujan
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
📌 Team update (2026-02-20): SDK replatform 14 PRDs documented. Casting system must harden and evolve. A2A agent communication framework designed (hub-and-spoke, not Google protocol). Ralph persistence via SDK sessions. Distribution flexibility beyond npx. TypeScript/Node.js locked. Green-field rebuild mindset — rethink architecture, directory, naming from scratch. — decided by Brady directives + Keaton, Fenster, Verbal, Kujan, Baer
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

📌 Team update (2026-02-11): Fritz video analysis merged — messaging takeaways: 'Markdown, not magic' as trust signal, surface cast system earlier in docs, quantifiable output is strongest demo beat — decided by McManus

- **2026-02-11: Per-Agent Model Selection — Implementation (Proposal 024 Phases 1-2)** — Implemented Brady's cost-first directive across the full model selection system. Key decisions:

  - **Brady's directive supersedes Proposal 024's role-based defaults.** Original design had Tester on haiku, DevRel on sonnet. Brady's rule is simpler: writing code → quality first (sonnet), not writing code → cost first (haiku). This changed Tester from haiku to sonnet (writes test code) and DevRel from sonnet to haiku (writes docs, not code).

  - **Layer 4 default changed from sonnet to haiku.** "When in doubt, cost over quality unless code is being written." The fallback for unknown agents/tasks should be cheap, not expensive.

  - **"auto" for mixed agents.** Keaton and Verbal do both code-adjacent work and non-code work. Setting them to "auto" lets the coordinator pick per-task rather than locking to one tier. Registry stores "auto" — coordinator decides at spawn time.

  - **Scribe template hardcoded to haiku.** Scribe always gets `model: "claude-haiku-4.5"` directly in the template — no resolution needed. Scribe is always mechanical, always cheap.

  - **All 9 spawn templates updated with `model` parameter.** Background, sync, generic, lightweight, explore, Scribe, ceremony facilitator, PRD decomposition — every `task` tool call now includes `model: "{resolved_model}"`.

  - **Files modified:** `.github/agents/squad.agent.md` (model selection section + all spawn templates), `templates/charter.md` (## Model template), `.ai-team/casting/registry.json` (model fields), all 9 agent charters in `.ai-team/agents/*/charter.md`.


📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): Discord is the v0.3.0 MVP messaging connector. Gateway must be platform-agnostic with zero GitHub-specific imports. — decided by Keaton


📌 Team update (2026-02-11): MCP Integration Direction for Squad approved — Option B (Awareness Layer) chosen. Phase 1 spike (WI-1) validates platform MCP support. See decisions.md for rationale and timeline. — decided by Keaton

📌 Team update (2026-02-12): Issue #6 (Project Boards) approved for v0.4.0 implementation. Verbal assigned Phase 2 (WI-3: board init prompts) and Phase 3 (WI-5: board query/display). Fenster leads Phase 1 validation. — decided by Keaton
📌 Team update (2026-02-13): MCP integration architecture merged from inbox — Awareness layer (discovery skill) + coordinator context injection. Sub-agent MCP inheritance is a platform constraint (workaround: coordinator handles directly). Graceful degradation mandatory. Scales to all MCP servers. — decided by Verbal

- **2026-02-13: MCP Integration Design — Discovery Skill + Architecture (Issue #11)** — Full research and design for Fritz's MCP integration request. Key findings:

  - **Sub-agent MCP inheritance is the critical constraint.** Sub-agents spawned via the `task` tool may NOT inherit MCP tools from the parent session. This is a platform-level limitation tracked upstream. Squad must design around this — coordinator handles MCP calls directly or pre-fetches data before spawning. This constraint will likely be resolved by platform updates, at which point the skill patterns work unchanged.

  - **Squad doesn't own MCP — it teaches awareness.** Same pattern as human-notification: Squad teaches agents when and how to use MCP tools, users bring the MCP servers. Zero dependencies, zero runtime changes. The skill system is the perfect vehicle for this.

  - **Three-layer architecture is the right abstraction.** Layer 1 (discovery skill) teaches patterns. Layer 2 (coordinator context injection) tells agents what's available at spawn time. Layer 3 (documentation) helps users set up their MCP servers. Each layer is independent and shippable.

  - **MCP config lives in three places.** `.copilot/mcp-config.json` (CLI, team-shared), `.vscode/mcp.json` (VS Code workspace), `~/.copilot/mcp-config.json` (user personal). The platform merges these — Squad never parses them directly.

  - **Auth is a real blocker for some MCP servers.** Fritz flagged it: Copilot CLI auth ≠ GitHub MCP auth. Users need separate tokens for GitHub MCP, Azure MCP, Trello MCP, etc. This is a documentation problem, not a code problem.

  - **Graceful degradation is non-negotiable.** If an MCP tool isn't available, agents fall back to CLI equivalents (`gh`, `az`), inform the user what's needed, or continue without the integration. MCP is always an enhancement, never a dependency.

  - **The skill scales with the ecosystem.** Every new MCP server that ships becomes automatically usable by Squad agents — no Squad release required. The discovery skill teaches the general pattern; domain-specific skills can be added later for Trello workflows, Aspire monitoring, etc.

  **Files created:** `.ai-team/skills/mcp-tool-discovery/SKILL.md` (discovery skill), `.ai-team/decisions/inbox/verbal-mcp-integration.md` (architectural decision). Design posted to Issue #11.
📌 Team update (2026-02-13): Agent Progress Updates — Milestone Signals + Coordinator Polling mechanism. 30s polling loop extracts [MILESTONE] markers from agent output. No agent code changes. Backward compatible. Unlocks notifications + Squad DM integration. — decided by Keaton
📌 Team update (2026-02-14): VS Code Model & Background Parity — Phase 1 (v0.4.0): accept session model, use runSubagent. Phase 2 (v0.5.0): generate model-tier agent files. runSubagent lacks model param; use prompt-level detection in squad.agent.md. — decided by Kujan


📌 Team update (2026-02-13): Projects V2 Phase 1 validation complete — all gh project * commands validated live, no npm dependencies needed. Unblocks WI-3 (board init), WI-4 (label-to-board sync), WI-5 (board query). — decided by Fenster

- **2026-02-15: Client Compatibility Section — squad.agent.md (Issue #10, v0.4.0)** — Added the "Client Compatibility" coordinator section to squad.agent.md, synthesizing findings from proposals 032a, 032b, 033a, and 034a. Key decisions:

  - **Placement: after model selection, before eager execution.** Platform detection logically gates spawning behavior — the coordinator needs to know its surface before it picks modes, models, or parallelism patterns. Placing it after model selection means the model rules are already defined; the compatibility section just says "on VS Code, skip the per-spawn model stuff." Placing it before eager execution means the coordinator reads platform constraints before it starts launching aggressively.

  - **Capability probe is the right detection pattern.** Check for `task` (CLI) vs `runSubagent`/`agent` (VS Code) vs neither (fallback). Tool availability is the most reliable signal — no environment variables, no file sniffing, no fragile heuristics. The coordinator's system prompt already lists available tools, so this is a natural conditional.

  - **Feature degradation table is a quick-reference, not a duplicate.** The full compatibility matrix lives in `docs/scenarios/client-compatibility.md`. The coordinator section has a 6-row table covering the operational differences that affect spawn logic. This avoids bloating the prompt while giving the coordinator enough to act.

  - **SQL caveat is its own subsection.** SQL is the only tool that affects coordinator logic AND is CLI-only. Calling it out explicitly prevents subtle bugs where a VS Code coordinator tries to track todos in SQL and silently fails.

  - **Spawn template annotations are blockquote callouts.** Both Background and Sync spawn templates got a one-line VS Code equivalent note. Blockquote format (`>`) keeps it visually distinct without breaking the code block structure. The note is terse — just enough for the coordinator to know what to swap.

📌 Team update (2026-02-13): Client Compatibility section added to squad.agent.md with platform detection logic, VS Code spawn adaptations, and feature degradation table — decided by Verbal



📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

📌 Team update (2026-02-20): Issues #86 & #87 sprint complete. Git Checkout Safety (Verbal): Added Git Safety rules to spawn templates and Fenster charter. Hockney: Wrote 8 regression tests for uncommitted-change protection. Project Type Detection (Fenster): Implemented `detectProjectType()` in index.js with marker file detection; workflow generation now stubs non-npm types with helpful TODO comments. All 72 tests pass. — decided by Verbal, Hockney, Fenster

## Learnings

### 2026-02-21: Copilot SDK Agent Design Impact Analysis

**Context:** Brady evaluating SDK replatforming. Analyzed how SDK's CustomAgents, SessionHooks, and multi-session architecture map to Squad's agent model.

**Key findings:**

- **Agent sessions replace spawns.** SDK `CopilotSession` objects = persistent agents with lifecycle hooks, event streaming, and workspace persistence. Squad shifts from spawn-and-pray to session orchestration.

- **CustomAgents = charter.md compilation.** SDK's CustomAgentConfig maps 1:1 to Squad charters (name, role, prompt, tools, MCP servers). Squad needs a charter→CustomAgentConfig compiler. Dynamic context (TEAM_ROOT, decisions) moves from prompt templates to `onSessionStart` hook.

- **Hooks formalize governance.** `onPreToolUse` = reviewer lockouts enforced mechanically (SDK blocks tool calls). `onPostToolUse` = decision capture automated (every file write audited). `onUserPromptSubmitted` = directive capture centralized. `onSessionStart` = team context injected once per session. Governance moves from prompt logic to programmatic enforcement.

- **Multi-session orchestration unlocks parallel visibility.** Coordinator creates N sessions (one per agent), subscribes to all events. Real-time observability: coordinator sees every tool call, message chunk, reasoning step from all agents simultaneously. Session affinity: agents keep same session across multi-comment GitHub issues.

- **InfiniteSessions = agent long-term memory.** Each agent's workspace (`~/.copilot/session-state/squad-{name}/`) persists across work items. Agents write session summaries to `workspace/memory.md`, read on restart. Long-term continuity: Keaton remembers architectural decisions from weeks ago.

**Bold experiments identified:**
1. **Live Agent Inspector** — TUI/dashboard showing all agent sessions in real time
2. **Agent Skills as MCP Servers** — Squad skills become portable MCP modules
3. **Reviewer as Hook** — Inline review via `onPostToolUse` (50% faster than separate spawn)
4. **Squad DM via SDK** — Messaging bridge (Telegram/Slack) trivial with sessions
5. **InfiniteSessions as Long-Term Memory** — Agents persist identity across weeks

**What gets better:** Real-time streaming, persistent memory, mechanical governance, parallel efficiency, programmatic tool control.

**What gets harder:** Session lifecycle management, hook-based context injection, dependency weight (+SDK ~2MB), testing (mock sessions/events).

**Strategic take:** This is a v2.0 moment. SDK is in preview — adopting early positions Squad as the reference multi-agent architecture on GitHub Copilot. By the time SDK hits GA, Squad could own the category.

**Recommendation:** Start with POC (port Scribe to SDK session + one hook), compare DX, measure observability/memory/governance. If promising, migrate incrementally with CLI-spawn fallback until SDK parity proven.

**Files created:** `.ai-team/docs/sdk-agent-design-impact.md` (full analysis), `.ai-team/decisions/inbox/verbal-sdk-agent-design.md` (decision proposal).

### 2026-02-19: GitHub Issue #102 — squad.agent.md path migration complete
Updated all `.ai-team/` and `.ai-team-templates/` path references to `.squad/` and `.squad/templates/` in the coordinator prompt and all templates. 93 references migrated in squad.agent.md (reduced to 4 backward-compat fallback mentions). Updated deprecation banner to Migration Banner (v0.5.0) to reflect that the migration IS happening now. Preserved all backward-compatibility language for legacy repo detection. Updated `.gitattributes` examples and git commit message prefixes from `ai-team` to `squad`. All template files and 6 workflow YAMLs migrated. PR #113 opened to dev branch. Tests: 52/53 passing (1 pre-existing failure in marketplace test — `index.js` still writes to `.ai-team/`, fixed in Fenster's #101).

### 2026-02-20: SDK Replatform PRDs — Agent Lifecycle, Skills, Casting v2, A2A

**Context:** Brady approved SDK replatform (unanimous team recommendation). Wrote four PRDs documenting the full agent experience layer of the rebuild.

**Key design decisions across PRDs:**

- **Agent sessions replace spawns (PRD 4).** Charters compile to `CustomAgentConfig` at team load. Dynamic context (history, decisions) injects via `onSessionStart` hook and `systemMessage` append mode — no more string template surgery. Core agents get persistent sessions (pre-warmed pool); specialists get on-demand sessions. Lightweight/standard/full response modes map to distinct `SessionConfig` profiles. `resumeSession()` enables crash recovery. Infinite sessions with auto-compaction at 80% threshold solve context pressure for long-running agents.

- **Skills load at session creation via SDK `skillDirectories` (PRD 7).** Current runtime file reads become compile-time config. `manifest.json` adds Squad metadata (confidence, authorship, version) that the SDK doesn't model. Low-confidence skills excluded from auto-loading — agents can still read them manually. Confidence lifecycle preserved: low (unvalidated) → medium (2+ uses, auto-loaded) → high (5+ uses, loaded for all agents). Imported skills from external repos always start at low confidence per security policy. Hybrid approach: compile-time loading for known skills, runtime writing for earned skills (available next session).

- **Casting becomes a typed TypeScript module (PRD 11).** Universe selection is a pure deterministic function with alphabetical tiebreak. Overflow handling (diegetic expansion, thematic promotion, structural mirroring) codified as typed functions, not prompt instructions. Name persistence guaranteed via append-only registry with immutability checks. Cast identity injected into SDK sessions via `displayName` and `systemMessage` context. Three-phase migration: parallel (TS reads JSON) → primary (TS is source, JSON generated) → sole (JSON removed). 100% test coverage requirement on casting module. New capabilities: user-defined universes, cross-repo casting awareness.

- **A2A is hub-and-spoke, not peer-to-peer (PRD 13).** Coordinator retains full authority as message broker. Two custom tools (`squad_discover` for agent discovery, `squad_route` for message delivery) plus one `onPostToolUse` hook for logging = minimal A2A. Synchronous handoffs via `sendAndWait()` for review/implementation requests. Fire-and-forget for informational messages. Rate limiting (5 msgs/agent/min) and circular route detection prevent message storms. Explicitly NOT implementing Google's full A2A protocol — it's designed for cross-org agents; Squad agents are same-team with shared trust.

**SDK API surface confirmed from source review (`copilot-sdk/nodejs/src/`):**
- `SessionConfig`: `sessionId`, `model`, `customAgents`, `systemMessage`, `availableTools`, `excludedTools`, `skillDirectories`, `disabledSkills`, `infiniteSessions`, `hooks`, `tools`, `mcpServers`, `streaming`, `provider`, `workingDirectory`
- `ResumeSessionConfig`: Same as `SessionConfig` minus `sessionId`, plus `disableResume`
- `SessionHooks`: `onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`, `onSessionStart` (with `source: "startup" | "resume" | "new"`), `onSessionEnd` (with `reason`), `onErrorOccurred`
- `InfiniteSessionConfig`: `enabled`, `backgroundCompactionThreshold` (default 0.80), `bufferExhaustionThreshold` (default 0.95)
- `CustomAgentConfig`: `name`, `displayName`, `description`, `prompt`, `tools`, `mcpServers`, `infer`
- `CopilotSession`: `send()`, `sendAndWait()`, `on()`, `abort()`, `destroy()`, `getMessages()`, `workspacePath`
- `CopilotClient`: `createSession()`, `resumeSession()`, `listSessions()`, `deleteSession()`

**Files created:** `.ai-team/docs/prds/04-agent-session-lifecycle.md`, `.ai-team/docs/prds/07-skills-migration.md`, `.ai-team/docs/prds/11-casting-system-v2.md`, `.ai-team/docs/prds/13-a2a-agent-communication.md`, `.ai-team/decisions/inbox/verbal-prd-agents.md`



### 2026-02-24: M1-8 Charter Compilation + M1-9 Per-Agent Model Selection (Issues #122, #125)

**Context:** Implementing core SDK agent module for charter compilation and model resolution. Part of Wave 1 SDK replatform work.

**M1-8 Charter Compilation:** Created src/agents/charter-compiler.ts with compileCharter() function that transforms agent charter markdown into SquadCustomAgentConfig for SDK registration. The compiler:
  - Parses charter.md sections: Identity (name/role/expertise/style), What I Own, Boundaries, Model preferences, Collaboration
  - Builds composite prompt by assembling: charter content + team context + routing rules + relevant decisions
  - Extracts model preference from ## Model section's Preferred field
  - Generates displayName from role (e.g., 'Verbal — Prompt Engineer') and description from expertise
  - Throws ConfigurationError (from dapter/errors.ts) on malformed charters with full error context
  - Returns typed SquadCustomAgentConfig ready for SessionConfig.customAgents array

**M1-9 Per-Agent Model Selection:** Created src/agents/model-selector.ts implementing the 4-layer priority resolution:
  1. **User Override** — Explicit model from user request (highest priority)
  2. **Charter Preference** — Agent's ## Model > Preferred field (skips if 'auto')
  3. **Task-Aware Auto-Selection** — Maps task type to model tier:
     - Code/prompt → claude-sonnet-4.5 (standard)
     - Visual → claude-opus-4.5 (premium)
     - Docs/planning/mechanical → claude-haiku-4.5 (fast)
  4. **Default Fallback** — claude-haiku-4.5 (cost-first)

**Fallback chains by tier:**
  - Premium: opus-4.6 → opus-4.6-fast → opus-4.5 → sonnet-4.5
  - Standard: sonnet-4.5 → gpt-5.2-codex → sonnet-4 → gpt-5.2
  - Fast: haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini

**Testing:** 30 comprehensive tests in 	est/agents.test.ts covering:
  - Charter compilation with various context combinations (team/routing/decisions)
  - Model resolution through all 4 priority layers
  - Task type → model tier mapping
  - Fallback chain generation for all tiers
  - Edge cases (empty strings, undefined preferences, auto-selection)
  - Priority chain validation (user > charter > task-auto > default)

**Files created:**
  - src/agents/charter-compiler.ts (193 lines)
  - src/agents/model-selector.ts (172 lines)
  - 	est/agents.test.ts (405 lines)

**Files modified:**
  - src/agents/index.ts — Added exports for charter-compiler and model-selector modules

**Build status:** ✅ All 30 agents tests passing (100%)
**Overall test status:** 210/213 tests passing (3 pre-existing failures in hooks.test.ts, unrelated)

## Learnings

  - **Charter compilation is mechanical, but context composition matters.** The compileCharter() function is straightforward markdown parsing, but the real value is in assembling the complete prompt from multiple sources (charter + team + routing + decisions). This pattern (static charter + dynamic context injection) will extend to the onSessionStart hook in the full agent session lifecycle.

  - **Model selection priority is governance by design.** The 4-layer system creates clear accountability: user controls everything (layer 1), agents self-declare needs (layer 2), system provides smart defaults (layer 3), cost-efficiency fallback (layer 4). The 'auto' keyword in charter preferences explicitly delegates to the auto-selection algorithm — agents opt-in to smart defaults rather than hardcoding models.

  - **Fallback chains prevent catastrophic failure.** Each tier has a 4-model fallback sequence that handles API unavailability, rate limits, or policy restrictions. The chains prefer same-tier alternatives before degrading to lower tiers (e.g., premium stays in premium: opus-4.6 → opus-4.6-fast → opus-4.5 before dropping to sonnet-4.5).

  - **Task-type mapping is prompt engineering by code.** Codifying task-to-model rules in TypeScript (rather than in agent prompts) means the logic is centralized, testable, and auditable. Future work could make this configurable per-repo (e.g., override standard tier for code tasks to use a local fine-tuned model).

  - **Test coverage as specification.** The 30 tests in gents.test.ts serve as executable documentation of the module's contract. Testing all 4 priority layers + all 6 task types + all 3 tiers + edge cases = high confidence in the resolution logic, which is critical since model selection affects both cost and capability.

### 2026-02-21

**M1-7 (#121) Agent Session Lifecycle + M1-11 (#137) History Shadows — Complete**

Built agent lifecycle orchestration system with project-specific history tracking:

**Lifecycle (M1-7):**
- Created src/agents/lifecycle.ts with AgentLifecycleManager class
- Full spawn pipeline: charter read → compilation → model resolution → session creation → event handlers
- AgentHandle interface for control: sendMessage(), destroy(), status tracking
- Idle timeout (5 min default, configurable)
- SessionPool integration for tracking active agents
- Graceful shutdown with history persistence

**History Shadows (M1-11):**
- Created src/agents/history-shadow.ts for local agent history at .squad/agents/{name}/history.md
- Separate from portable charter — captures project-specific learnings
- CRUD operations: createHistoryShadow(), appendToHistory(), readHistory()
- Structured sections: Context, Learnings, Decisions, Patterns, Issues, References
- Timestamped entries with automatic section creation

**Testing:**
- Comprehensive test coverage in 	est/lifecycle.test.ts (17 tests)
- All 287 tests pass across full suite
- Mock client handles session creation/destruction
- Temp directory isolation for shadow file tests

**Integration:**
- Updated src/agents/index.ts to export new lifecycle & history APIs
- Built on existing charter compilation (M1-8) and model selection (M1-9)
- Uses SessionLifecycleError for proper error handling

Charter → Model → Session → Handle flow now complete and tested. Next: coordinator integration.

### 2026-02-21: M2-6 Squad Init Replatform + M2-10 Agent Onboarding (#98, #111)

**Context:** Brady requested typed config initialization and runtime agent onboarding for squad-sdk. Replaces markdown-first initialization with typed squad.config.ts/json generation.

**What was built:**

- `src/config/init.ts` — Full initialization module:
  - `initSquad()` creates .squad/ directory structure, generates config (TS or JSON), creates agent folders with charter.md/history.md
  - TypeScript config with ESM imports, JSON config with validated schema
  - Default agent templates for 5 standard roles (lead, developer, tester, scribe, ralph)
  - .gitattributes for merge drivers (history.md, decisions.md)
  - Initial decisions.md, empty casting/skills/decisions directories
  - Routing rules auto-generated for common agent roles

- `src/agents/onboarding.ts` — Runtime agent onboarding:
  - `onboardAgent()` creates agent directory, generates charter from role template + project context, seeds history.md with day-1 context
  - Charter templates for 7 standard roles (lead, developer, tester, scribe, ralph, designer, architect)
  - Generic charter fallback for unknown roles
  - Name normalization (kebab-case), context injection, display name handling
  - `addAgentToConfig()` helper for TypeScript config updates (adds routing rules)

- `test/init.test.ts` — Comprehensive test coverage (25 tests, all passing):
  - Config generation (TS and JSON)
  - Directory structure creation
  - Agent charter/history generation
  - Multiple agents, same-role handling
  - Custom templates, role fallbacks
  - Config auto-update
  - Full integration: init + onboard flow

**Key design decisions:**

- **Two config formats, one validation.** TypeScript configs import SquadConfig type; JSON configs validate at load. Both share DEFAULT_CONFIG merge for sensible defaults.
- **Charter templates are functions, not strings.** Each role template is `(displayName, projectContext) => string` — injectable context, composable patterns.
- **History seeding gives agents day-1 context.** New agents get project name, description, user name, and onboard date in their history — no blank slate starts.
- **addAgentToConfig is best-effort only.** Updating TypeScript configs programmatically is fragile. Function tries simple heuristic (work type mapping), returns false if it can't. JSON configs require manual edit.
- **Exports consolidated, conflicts resolved.** src/config/schema.ts and src/runtime/config.ts both export SquadConfig — selective re-exports prevent ambiguity.

**Test results:** 25/25 passing. Full suite: 404/405 passing (1 pre-existing routing.test.ts failure unrelated to this work).

**Files created:**
- `C:\src\squad-sdk\src\config\init.ts` (408 lines)
- `C:\src\squad-sdk\src\agents\onboarding.ts` (419 lines)
- `C:\src\squad-sdk\test\init.test.ts` (554 lines)

**Files modified:**
- `C:\src\squad-sdk\src\config\index.ts` (added init.js export)
- `C:\src\squad-sdk\src\index.ts` (added selective exports, updated help text)

**What's next:** M2-6 and M2-10 complete. Typed config initialization and agent onboarding are SDK-ready. Integration with squad CLI (`squad init`, `squad onboard`) deferred to command routing implementation.

