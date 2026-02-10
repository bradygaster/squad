# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
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

## Learnings

- **2026-02-10: Full Model Catalog Research (Proposal 024a)** — Researched and documented all 16 models available via the `task` tool's `model` parameter across 3 providers (Anthropic: 6 models, OpenAI: 9 models, Google: 1 model) and 3 tiers (premium, standard, fast/cheap). Key findings:
  - The platform offers far more diversity than Proposal 024's original 3-model mapping (Opus/Sonnet/Haiku). Brady was right to push back.
  - OpenAI Codex variants (GPT-5.2-Codex, GPT-5.1-Codex-Max) are genuinely strong contenders for code-heavy tasks — may outperform Claude Sonnet for pure code generation.
  - Gemini 3 Pro (Preview) offers cognitive diversity value for reviews/audits — different training yields different perspectives, which is signal not noise.
  - Provider diversity is a resilience play, not just a quality play. Single-provider dependency is a real operational risk for multi-agent systems.
  - Anthropic remains the safest default family (best instruction following, proven in agent workflows), with OpenAI as specialist for code and Google as specialist for diversity.
  - Opus 4.6 fast mode is an underappreciated option — premium quality at reduced latency for time-sensitive decisions (reviewer gates).
  - The expanded role-to-model mapping covers 11 roles × 2 models (default + specialist) with clear switching criteria.
  - Honest about knowledge gaps: Gemini 3 Pro Preview behavior may change, cross-provider prompt portability is untested, exact cost ratios unknown on the platform.
  - Output: `team-docs/proposals/024a-model-catalog.md` — reference document for Verbal's selection algorithm (sprint item 4.1).
- **2026-02-10: GitHub API Capabilities Assessment (Proposal 028a)** — Empirically tested all GitHub MCP server tools, `gh` CLI commands, and agent access patterns for Issues and Projects management. Key findings:
  - MCP tools are **read-only for Issues** — no create/update/close. All writes must go through `gh` CLI.
  - **Zero MCP tools exist for GitHub Projects V2** — entire Projects workflow depends on `gh project` commands.
  - `task` and `general-purpose` sub-agents **CAN** access MCP tools AND `gh` CLI — they can self-serve GitHub operations without coordinator mediation.
  - `explore` sub-agents have **NO MCP or shell access** — local filesystem only (grep/glob/view).
  - GitHub Projects is **blocked by missing token scope** (`project`). Fix: Brady runs `gh auth refresh -s project` once.
  - Current token scopes: `gist`, `read:org`, `repo`, `workflow` — sufficient for Issues, insufficient for Projects.
  - Rate limits are generous: 5,000 REST/hour, 5,000 GraphQL/hour, 30 searches/minute. Normal Squad operations use <5% capacity.
  - Only real rate limit risk: Search API (30/min) during batch operations — prefer list operations over search.
  - Recommended two-channel pattern: MCP for reads (structured data), `gh` CLI for writes (only option).
  - Full issue lifecycle verified: create → label → comment → close → read back via MCP. All working.
  - Output: `team-docs/proposals/028a-github-api-capabilities.md` and `.ai-team/decisions/inbox/kujan-github-api-assessment.md`.

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — your model catalog research (024a) and GitHub API assessment (028a) are foundational inputs. — decided by Keaton


📌 Team update (2026-02-10): Async squad comms is #1 priority for 0.3.0 — update feasibility analysis — decided by bradygaster

📌 Team update (2026-02-10): Squad DM (Proposal 017) un-deferred to P0 — decided by bradygaster
