# Project Context

- **Owner:** bradygaster
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial platform assessment and deep onboarding (2026-02-07). Full entries in `history-archive.md`._

- **Squad is already Copilot-native** — task tool spawning, filesystem memory, background mode all align with the platform. No fundamental rewrites needed. Stay independent (not a Copilot SDK product) but be best-in-class on Copilot.
- **Filesystem-backed memory is the killer differentiator** — git-cloneable, human-readable, and the reliable channel (vs. unreliable response text). Never abandon for SDK abstractions.
- **Inline charter pattern is correct for batch spawns** — coordinator inlines charters to eliminate agent tool calls. For single spawns, agent-reads-own is acceptable.
- **Platform constraints**: 128K token context window, `task` tool with `mode: "background"` is the correct spawn pattern, `explore` sub-agent for semantic search, no agent persistence between sessions.
- **Coordinator size (32KB+) is a maintenance concern** — instruction-following degrades with prompt length. Subsystem extraction or information density optimization needed.
- **Drop-box pattern is the best lock-free concurrent write pattern** on this platform. Preserve and extend.
- **Key validated patterns**: parallel fan-out by default, eager execution philosophy, Scribe serial spawning (confirmed as friction to fix).

### Session Summaries

- **2026-02-08: Agent Persistence & Latency Analysis (Proposal 007)** — **Context:** Brady reported "agents get in the way more than they help" later in sessions. Collaborated with Verbal on a latency reduction proposal.
- **2026-02-08: Portable Squads — Platform Feasibility Analysis (Proposal 008)** — **Context:** Brady wants users to export squads from one project and import into another, keeping names, personalities, and user meta-knowledge while 
- **2026-02-08: Skills, Platform Feasibility, and v1 Copilot Integration (Proposal 012)** — **Context:** Brady hinted at "skills" — agents that learn domain expertise across projects. Also needed: complete v1 Copilot experience synthesis comb
- **2026-02-08: P0 Silent Success Bug — Diagnosis and Mitigation (Proposal 015)** — **Context:** Brady flagged that ~40% of background agents report "did not produce a response" when they actually completed all work. Files written, hi
- **2026-02-09: Proposal 012 Revision — Agent Skills Open Standard + MCP Integration** — **Context:** Brady clarified that "skills" means Claude-and-Copilot-compliant skills adhering to the Agent Skills Open Standard (agentskills.io). Also
- **2026-02-09: Platform Timeout Best Practices Documented** — **Context:** Brady discovered that the `read_agent` default timeout of 30s was causing the platform to abandon agents mid-work — reporting "no respons
- **2026-02-09: Proposal 015 Mitigation Verification Audit** — **Context:** Brady requested all agents verify their mitigations are in place for the P0 silent success bug. As the author of Proposal 015, verified a
- **2026-02-09: decisions.md Cleanup — Heading Levels and Line Endings** — **Context:** Audit flagged formatting issues in decisions.md. Tasked with surgical fixes: phantom proposal references, heading level corrections, and 
- **2026-02-09: Platform Feasibility — Direct Messaging Interface (Proposal 017)** — **Context:** Brady wants to work with his Squad via direct messages (Telegram) when away from the terminal. Requested Dev Tunnels over ngrok. This is 
- **2026-02-09: Human Input Latency and Persistence — Platform Analysis** — **Context:** Brady described two pain points: (1) latency when typing while agents work — messages queue and the experience feels unresponsive, (2) hu
- **2026-02-09: VS Code Parity, Mid-Flight Human Input, and Feedback Optimization** — **Context:** Brady asked three platform questions: (1) does Squad work in VS Code, (2) can human input reach running agents, (3) how to optimize feedb
- **2026-02-09: Directive Capture in Coordinator Prompt (Sprint Task 1.6)** — **Context:** Brady requested human directive capture — when users state preferences, rules, or scope decisions, the coordinator should persist them to
- **2026-02-09: Incoming Queue Platform Assessment** — **Context:** Brady asked whether Copilot's built-in TODO capability could serve as an "incoming queue" for user messages — capturing requests while ag

## Recent Updates

📌 Team update (2026-02-20): Recruitment wave complete. Three new team members hired: Edie (TypeScript Engineer), Rabin (Distribution Engineer), Fortier (Node.js Runtime Dev). All onboarded with assessments. Keaton created 19 issues, 3 milestones, 12 labels on bradygaster/squad-pr. Kujan delivered feature risk punch list (14 GRAVE, 12 AT RISK, 28 COVERED, 5 INTENTIONAL). — decided by Keaton, Kujan, Edie, Rabin, Fortier

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): Incoming queue architecture direction — SQL as hot working layer, filesystem as durable store, team backlog as key feature, agents can clone across worktrees — decided by Brady
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-08): Incoming queue architecture finalized — SQL hot layer + filesystem durable store, team backlog as third memory channel, agent cloning ready. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): Portable Squads consolidated — architecture, platform, and experience merged into single decision — decided by Keaton, Kujan, Verbal
📌 Team update (2026-02-09): Skills system consolidated — open standard with MCP tool declarations, merging 4 independent analyses — decided by Kujan, Verbal


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi
📌 Team update (2026-02-20): SDK replatform 14 PRDs grounded in verified SDK source. Cost data native in SDK. JSONL for event persistence. Tier-based model aliases (fast/standard/premium). Per-agent MCP via SDK customAgents[]. esbuild bundling. In-Copilot install Phase 1, Marketplace Phase 2. Brady pending: package name, fallback chains, provider override, quota routing, OTLP export. — decided by Kujan with Keaton, Fenster, Verbal, Baer

## Learnings

_Summarized 2026-02-10 learnings (full entries in session logs and proposals):_

- **2026-02-10: Model Catalog (024a)** — Documented 16 models across 3 providers (Anthropic 6, OpenAI 9, Google 1), 3 tiers. OpenAI Codex strong for code tasks. Provider diversity = resilience play. 11-role mapping with defaults + specialists. Output: `team-docs/proposals/024a-model-catalog.md`.
- **2026-02-10: GitHub API Assessment (028a)** — MCP tools are read-only for Issues; all writes via `gh` CLI. Zero MCP tools for Projects V2. `task`/`general-purpose` agents have full access; `explore` has none. Projects blocked by missing `project` scope (`gh auth refresh -s project`). Rate limits generous (5K/hr REST+GraphQL). Output: `team-docs/proposals/028a-github-api-capabilities.md`.
- **2026-02-10: Async Comms Feasibility (030)** — CCA-as-squad-member is the breakthrough: `squad.agent.md` + CCA guidance = async work via Issues for 2-4h prompt engineering, zero infrastructure. Copilot SDK confirmed for Telegram bridge (8-16h, conditional on nested session spike). Ranking: CCA+Issues > Telegram > Discord > Discussions > Teams > Slack. Two-tier MVP: Tier 1 (CCA, guaranteed) + Tier 2 (Telegram, conditional). Output: `team-docs/proposals/030-async-comms-feasibility.md`.

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — your model catalog research (024a) and GitHub API assessment (028a) are foundational inputs. — decided by Keaton


📌 Team update (2026-02-10): Async squad comms is #1 priority for 0.3.0 — update feasibility analysis — decided by bradygaster

📌 Team update (2026-02-10): Squad DM (Proposal 017) un-deferred to P0 — decided by bradygaster

- **2026-02-10: CCA E2E Test Design (031)** — `.ai-team/` is gitignored on main, so CCA cannot read `.ai-team/decisions.md`. All CCA governance must be self-contained within `.github/agents/squad.agent.md`. This fundamentally constrains the CCA-as-squad-member model: CCA follows `squad.agent.md` conventions, not the full Squad filesystem state. Proposal 030 Appendix A needs revision to account for this.
- **2026-02-10: CCA testability pattern** — Plant a convention in `squad.agent.md` that CCA would NOT do by default (e.g., "use `node:test`" instead of jest). If CCA follows it, strong signal it read the guidance. JSDoc alone is weak signal — CCA often adds it unprompted. Two-signal verification (JSDoc + node:test) gives high confidence.
- **2026-02-10: CCA E2E is observation-only** — CCA is a black box. Tests can only verify inputs (issue text, repo state) and outputs (branches, PRs, file diffs, CI status). No instrumentation possible. Structural checks (file exists, pattern present) over content checks (exact code match) for reliability against LLM non-determinism.
- **2026-02-10: Actions Automation Layer (032b)** — Designed 7 workflows automating the 032 proposal lifecycle: Proposal Lifecycle, Consensus Engine, Sprint Planner, Agent Comment Poster, Daily Standup, Stale Cleanup, CCA Dispatch. Key insight: Actions doesn't replace agents, it connects them — agents think, Actions plumbs. Phase 1 ships 3 workflows (lifecycle, consensus, stale cleanup) in 5-8h. `.ai-team/` gitignore constraint means Actions workflows operate entirely on GitHub API state (issues, labels, comments), not Squad filesystem state. CCA Dispatch deferred to Phase 2 pending 031 validation. Output: `team-docs/proposals/032b-actions-automation-layer.md`.
- **2026-02-10: Workflow distribution pattern** — Workflows ship as templates in `templates/workflows/`, installed opt-in during `squad init`. Not bundled in npm package (no convention for that). Users must audit and approve workflow installation. Standalone workflows for v0.3.0; reusable workflows / composite actions deferred.
- **2026-02-10: GitHub API state vs. filesystem state** — Actions and CCA both operate on GitHub API primitives (issues, labels, comments, PRs). Squad filesystem state (`.ai-team/`) is inaccessible to both because of the gitignore decision. This cleanly separates the automation layer (GitHub) from the agent memory layer (filesystem). No sync needed between them.
- **2026-02-10: Projects V2 API Assessment (033a)** — GitHub Projects V2 is fully feasible with zero npm dependencies using `gh project *` CLI commands exclusively. Zero MCP tools exist for Projects V2 (verified against all 17 MCP tools). GraphQL client proposed in Issue #6 is unnecessary — `gh` CLI wraps all GraphQL mutations. Only blocker: `project` token scope (same as 028a). Key insight: boards are visualization layer, labels remain the state machine (per `label-driven-workflow` skill anti-pattern). Provider abstraction maps cleanly: GitHub Projects V2 / ADO Boards / GitLab Issue Boards all reduce to prompt-level command templates. Recommend: implement as opt-in skill, not core code. Board operations should gracefully degrade when scope is missing. Output: `team-docs/proposals/033a-projects-v2-api-assessment.md`.


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): Copilot client parity gap identified — Issue #10 filed as P1 tracking. Tool naming is API surface; CLI `task` vs VS Code `runSubagent`. Future work needs fallback strategies for non-CLI clients. — decided by Keaton

📌 Team update (2026-02-11): Discord is the v0.3.0 MVP messaging connector. Gateway must be platform-agnostic with zero GitHub-specific imports. — decided by Keaton

- **Issue #18: Version Display in Agent Output** — Investigated how to show Squad version across Copilot hosts. Key finding: the version stamping pipeline (`stampVersion()` in `index.js`) already embeds the version into `squad.agent.md` frontmatter during install/upgrade — the version was present but unused at runtime. Solution: added a `Version` instruction to the Coordinator Identity section telling the coordinator to read its own frontmatter version and include `Squad v{version}` in its first response. Zero `index.js` changes needed. Works across CLI, VS Code, and GitHub.com because it's coordinator behavior, not host-specific. The `description` frontmatter field and `task` tool `description` parameter were rejected as too noisy/per-spawn respectively.



📌 Team update (2026-02-12): Version display implemented via Coordinator self-announcement in squad.agent.md — leverages existing version stamping infrastructure — decided by Kujan

- **2026-02-13: CLI `task` vs VS Code `runSubagent` Spawn Parity (Issue #32, Proposal 032b)** — Complete analysis of how Squad's CLI-based spawn mechanism maps to VS Code's `runSubagent`. Key findings:
  - **Task tool parameter catalog:** 5 params — `prompt` (required), `agent_type` (required, Squad uses `general-purpose` 99%, `explore` 1%), `description` (required, format: `{Name}: {task}`), `mode` (`background` default, `sync` for gates), `model` (4-layer selection hierarchy with 3-tier fallback chains).
  - **Spawn pattern inventory:** 5 patterns — Standard (full ceremony), Lightweight (no charter/history), Explore (read-only, haiku), Scribe (always background, always haiku), Ceremony Facilitator (sync, spawns sub-agents).
  - **VS Code `runSubagent` surface:** prompt-only required param, sync-only (but parallel when multiple launched in one turn), model via custom `.agent.md` frontmatter (not per-spawn), no `agent_type` equivalent, no `description` param, no `mode` param.
  - **Parity gaps:** (1) No background mode — mitigated by parallel sync subagents achieving equivalent concurrency. (2) No per-spawn model selection — mitigated by accepting session model (v0.4.0) or generating custom agent files (v0.4.x). (3) No explore speed optimization — optional custom `explorer.agent.md`.
  - **Platform detection strategy:** Prompt-level conditional instructions in `squad.agent.md`. Coordinator checks which tool is available (`task` or `runSubagent`) and adapts. No abstraction layer needed.
  - **Decision:** No code-level abstraction layer. Prompt-level adaptation in `squad.agent.md` is sufficient. All 5 spawn patterns map successfully to VS Code.
  - **Output:** `team-docs/proposals/032b-cli-spawn-parity-analysis.md`

- **2026-02-14: Model Selection & Background Mode Parity (Issue #34, Proposal 034a)** — Deep dive on the two specific parity gaps Brady flagged: per-agent model selection and background/async execution. Key findings:
  - **Model selection:** `runSubagent` does NOT accept `model` param. Override via custom `.agent.md` frontmatter only. Supports prioritized fallback lists. Requires experimental `chat.customAgentInSubagent.enabled`. Three-phase approach: accept session model (v0.4.0) → model-tier agent files (v0.5.0) → per-role agent files (v0.6.0+).
  - **Background mode:** No equivalent. VS Code "Background Agents" are a different concept (CLI-based worktree sessions, user-initiated). Parallel sync subagents in one turn = equivalent concurrency. No fire-and-forget (Scribe blocks). No incremental collection (all-or-nothing).
  - **`agent` vs `runSubagent` tools:** `runSubagent` = anonymous subagent (session model). `agent` = named custom agent (frontmatter model). Squad should use `runSubagent` Phase 1, `agent` Phase 2.
  - **Result collection:** No `read_agent` equivalent needed — sync subagents return results automatically. Simpler on VS Code.
  - **Graceful degradation:** Accept session model when no custom agents. Skip launch table and read_agent on VS Code. Inline work when no spawn tool available.
  - **Output:** `team-docs/proposals/034a-model-background-parity.md`, commented on Issue #34.
📌 Team update (2026-02-14): VS Code Model & Background Parity — Phase 1 (v0.4.0): accept session model, use runSubagent. Phase 2 (v0.5.0): generate model-tier agent files. runSubagent lacks model param; use prompt-level detection in squad.agent.md. — decided by Kujan


📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

- **2026-02-16: CCA Compatibility Assessment (Issue #25)** — Researched whether Squad can run from Copilot Coding Agent. Verdict: **NO-GO for v0.5.0** pending empirical test of sub-agent spawning. Key findings:
  - **Custom agents (✅):** CCA reads `.github/agents/*.agent.md` like CLI — Squad governance loading is confirmed.
  - **Sub-agent spawning (⚠️ BLOCKER):** No documentation confirms `task` or equivalent tool availability in CCA environment. Squad's architecture requires spawning real sub-agents — without this, Squad cannot function as designed.
  - **Background mode (❌):** CCA likely doesn't support `mode: "background"` for fire-and-forget sub-agents. Could fall back to VS Code parallel sync pattern if spawning exists.
  - **MCP servers (✅):** CCA supports MCP including GitHub MCP server. Issue management feasible.
  - **File system (⚠️ CONSTRAINT):** `.ai-team/` is gitignored on main — CCA cannot read Squad memory (decisions, history, skills). All governance must be self-contained in `squad.agent.md`. CCA can write to `.ai-team/` and commit via PR.
  - **Session model (✅):** CCA's async batch execution (no user in loop) is compatible but eliminates interactive ceremonies requiring human gates.
  - **Complexity limits (⚠️):** CCA best for single-issue work; multi-agent sprints risky without confirmed sub-agent spawning.
  - **Recommended action:** Run empirical spike (2-4h) — test custom agent that attempts `task` tool call. If tool exists, proceed with CCA integration design. If not, select fallback: (A) CCA as Squad member, (B) lightweight single-agent mode, or (C) defer to v0.6.0.
  - Output: `.ai-team/decisions/inbox/kujan-cca-research.md`, comment on Issue #25


📌 Team update (2026-02-18): CCA Compatibility Assessment (Issue #25). Researched whether Squad can run from Copilot Coding Agent. Findings: custom agent files supported, MCP servers accessible, file system access constrained (.ai-team/ gitignored in CCA environment). CRITICAL BLOCKER: No confirmed sub-agent spawning mechanism (	ask tool availability unknown in CCA). NO-GO for v0.5.0 unless Phase 1 spike (2-4h) confirms 	ask tool. Recommended fallback: CCA as Squad member (not coordinator), or defer to v0.6.0. High architectural risk; empirical testing required. — decided by Kujan

- **2026-02-19: CCA Spike Test Plan (Issue #25)** — Wrote and posted a concrete, step-by-step spike test plan for empirically testing CCA capabilities. Four test vectors: (1) `task` tool availability for sub-agent spawning — the critical blocker, (2) `.ai-team/` file access on non-main branches (canary file with unique marker value), (3) MCP tools in practice (not just docs), (4) context window limits under `squad.agent.md` (~1,800 lines). Plan includes: custom probe agent file (`cca-probe.agent.md`), trigger issue template, observation matrix, combined go/no-go decision logic, and cleanup steps. Estimated ~1.5h wall clock including CCA wait time. Key insight: `.ai-team/` is NOT gitignored — it's blocked by a workflow guard on main/preview only, so CCA should see it on branches based on dev.

- **2026-02-19: Copilot SDK Comprehensive Analysis** — Exhaustively reviewed SDK for replatforming opportunity. Key findings:
  - **CustomAgents API designed for Squad's use case:** Register team members as named agents with charters as `prompt` field, per-agent MCP servers, tool access control. ~300 lines of spawn orchestration replaced with SDK config.
  - **Infinite sessions solve Proposal 007 context pressure:** Auto-compaction at 80% context, checkpoints for undo/replay, workspace persistence. Zero manual compaction code needed.
  - **Hooks system enables coordinator logic as code:** `onPreToolUse` for reviewer gates (no longer prompt adherence), `onPostToolUse` for result transformation, `onSessionStart` for context injection. Fragile prompt engineering replaced with hardened enforcement.
  - **SessionContext = worktree awareness:** SDK already tracks cwd, gitRoot, repository, branch per session. Squad's manual worktree detection (~50 lines) is unnecessary — SDK has it built-in.
  - **MCP per-agent config:** Backend Dev gets PostgreSQL MCP server, Frontend gets GitHub. Proposal 033a "provider abstraction is prompt-level command templates" was wrong — it's SDK MCP config.
  - **BYOK unlocks enterprise market:** Azure AI Foundry, OpenAI, Anthropic, Ollama support. Multi-provider fallback chains (Azure → OpenAI → Anthropic). Static token auth with `bearerToken` field.
  - **Event streams replace polling:** 40+ event types (tool.execution_start, assistant.message_delta, session.idle, session.compaction_complete). Real-time agent status without read_agent timeouts. Eliminates silent success bug (Proposal 015 P0).
  - **Model capabilities queryable:** `listModels()` returns vision support, reasoning effort support, context limits. Squad's hardcoded model list (Proposal 024a) becomes dynamic catalog.
  - **SDK maturity:** Protocol v2 (not v0.x), 18+ months production in Copilot CLI, 4 official language SDKs (TypeScript/Python/Go/.NET), comprehensive docs (getting-started, hooks, MCP, auth, skills, session persistence). "Technical Preview" disclaimer = breaking changes possible, but protocol stable enough for production use.
  - **Gaps identified:** Session locking (concurrent access undefined), per-agent hooks (session-scoped only, must route via sessionId lookup), model cost data (pricing not in SDK, need external data), MCP health monitoring (can't detect server failures proactively), BYOK auth limitations (no Entra ID, no managed identities, static tokens only).
  - **What Squad keeps:** Casting system (persistent names, universe allocation), filesystem memory (`.ai-team/` source of truth), coordinator orchestration logic (which agents, when, dependencies), decision governance (proposals, voting, lifecycle), Scribe pattern (dedicated documentation agent).
  - **Recommendation:** YES — replatform in two phases. Phase 1 (v0.6.0, 3-5 weeks): SDK as infrastructure, coordinator as agent.md, hybrid with custom tools (`squad_spawn_agent`). Phase 2 (v0.7.0, 8-12 weeks): coordinator as Node.js process using SDK client, full programmatic control. Adapter pattern required (SDK is preview, breaking changes expected). Migration path: dual-mode coordinator (SDK opt-in v0.6.0, default v0.7.0, only v1.0.0), zero downtime.
  - **Output:** `.ai-team/docs/sdk-opportunity-analysis.md` (61KB, exhaustive capability inventory + gap analysis + architecture + migration), `.ai-team/decisions/inbox/kujan-sdk-analysis.md` (decision record for Brady review).

- **2026-02-20: SDK Replatform PRDs (4 documents)** — Wrote four PRDs grounded in actual SDK source code review:
  - **PRD 6: Streaming Observability** — SDK has 30+ event types including `assistant.usage` with `cost` field (corrects earlier gap analysis that said SDK lacks cost data). `session.shutdown` event provides per-model `modelMetrics` with full token/cost breakdown. JSONL event logs + live CLI display + export format for external dashboards. Phase 2 (v0.7.0).
  - **PRD 9: BYOK & Multi-Provider** — SDK `ProviderConfig` supports `openai|azure|anthropic` types with `apiKey` or `bearerToken`. Provider config is per-session (no client-level default). Tier-based model aliases (`fast`/`standard`/`premium`) decouple charters from providers. Fallback chains with health caching. Phase 1 (v0.6.0).
  - **PRD 10: MCP Server Integration** — SDK `CustomAgentConfig.mcpServers` enables per-agent MCP routing natively. Squad as MCP server exposes roster/decisions/backlog as standard MCP resources. Tool filtering via `tools` array is include-list only (exclude must be resolved). Phase 1 per-agent config, Phase 2 Squad MCP server.
  - **PRD 12: Distribution & In-Copilot Install** — esbuild bundling with embedded templates via text loader. In-Copilot install via custom agent file (Phase 1), marketplace (Phase 2 when available). npm publishing as `@bradygaster/squad`. Auto-update check (24h cache, 3s timeout, silent fail). SDK as external dep (not bundled).
  - **Key SDK source findings during PRD writing:**
    - `assistant.usage` event includes `cost` field — SDK computes per-call cost. No external pricing data needed.
    - `session.shutdown` event has `modelMetrics` map with per-model request counts, costs, and token breakdowns.
    - `session.usage_info` provides `tokenLimit` and `currentTokens` for context pressure gauge.
    - `ProviderConfig.bearerToken` takes precedence over `apiKey` — useful for enterprise SSO tokens.
    - `MCPServerConfig.tools` is include-list only — SDK doesn't support exclude patterns.
    - `CustomAgentConfig.mcpServers` confirmed for per-agent MCP routing.
    - `SessionConfig.streaming` enables `assistant.message_delta` and `assistant.reasoning_delta` events.
  - **Output:** `.ai-team/docs/prds/06-streaming-observability.md`, `09-byok-multi-provider.md`, `10-mcp-server-integration.md`, `12-distribution-install.md`, `.ai-team/decisions/inbox/kujan-prd-platform.md`.
