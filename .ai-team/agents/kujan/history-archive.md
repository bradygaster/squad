# Kujan — History Archive

Archived entries from initial sessions. These entries were summarized into `## Core Context` in history.md.

---

## Archived: 2026-02-09 Session Entries

### 2026-02-08: Agent Persistence & Latency Analysis (Proposal 007)

**Context:** Brady reported "agents get in the way more than they help" later in sessions. Collaborated with Verbal on a latency reduction proposal.

**Key platform findings:**

1. **Copilot has no agent persistence.** Every `task` spawn is stateless. There's no warm cache, no persistent agent process, no session state for sub-agents. The coordinator's conversation history is the ONLY persistent state within a session. This is a hard platform constraint — not something we can work around with clever engineering.

2. **Tool calls are the dominant latency source.** Each `view` call costs ~1-2s of wall clock (LLM decide + execute + LLM process). The coordinator's 4 mandatory reads (team.md, routing.md, registry.json, charter.md) cost 4-8s before any spawn. This is the single biggest optimization target.

3. **Coordinator context caching is the cheapest win.** The coordinator already has team.md/routing.md/registry.json in its conversation context after the first message. Telling it to skip re-reading saves ~4.5s per message with zero risk. This is a 1-line instruction change.

4. **Scribe spawns are wasteful 50%+ of the time.** When no decisions were made, Scribe does nothing but still costs a full spawn cycle (~8-12s). Conditional spawning (only when inbox has files) is a strict improvement.

5. **The coordinator CAN do trivial domain work.** `squad.agent.md` line 569 prohibits it, but this is a policy choice not a platform constraint. The coordinator has full tool access. For single-line, unambiguous changes, spawning an agent is pure overhead.

6. **History growth is real but secondary.** Week 12 history loads add ~3-4K extra tokens per spawn. This matters, but less than the 9-10 tool calls of overhead. Progressive summarization is a P3 optimization — useful but not urgent.

**Architectural insight — tiered response modes:**
- The "every interaction goes through an agent spawn" assumption is the core problem.
- Solution: Direct (coordinator handles) → Lightweight (minimal spawn) → Standard (normal spawn) → Full (multi-agent fan-out).
- The coordinator's routing judgment becomes the critical path, not spawn mechanics.
- This extends the existing "quick factual question → answer directly" pattern that already exists in the routing table.

**What I got wrong in Proposal 003:**
- Proposal 003 focused on making spawns faster (inline vs. agent-reads-own charter, parallel Scribe). That's still valid, but the bigger win is *avoiding spawns entirely* for trivial work. I was optimizing the ceremony instead of questioning whether the ceremony was needed.

**File paths:**
- Proposal: `docs/proposals/007-agent-persistence-and-latency.md`
- Key coordinator sections for modification: `squad.agent.md` lines 84-101 (Team Mode entry), 104-111 (routing table), 345-385 (after agent work / Scribe spawning), 565-574 (constraints / "don't do domain work")


### 2026-02-08: Portable Squads — Platform Feasibility Analysis (Proposal 008)

**Context:** Brady wants users to export squads from one project and import into another, keeping names, personalities, and user meta-knowledge while shedding project-specific context.

**Key findings:**

1. **Export/import is pure CLI/filesystem — no Copilot platform constraints apply.** The entire feature runs before any agent session starts. `index.js` gets two new code paths (~80 lines total). No dependencies needed — `fs` and `path` handle everything. This is the simplest kind of feature to build on our stack.

2. **The `.squad` format should be a single JSON file.** Not a tarball, not a directory. JSON is human-readable (users can inspect/edit before sharing), git-diffable, self-describing, and requires no compression library. A mature 6-agent squad exports to ~15-25KB. The format includes a `squad_format_version` field for future migration.

3. **The export payload has a clean cut line.** Portable: casting state, charters, routing, ceremonies, filtered histories. Not portable: decisions.md, inbox, orchestration-log, session logs. `team.md` is portable but needs the Project Context section stripped — it gets rebuilt on import.

4. **History splitting is the only genuinely hard problem.** Agent histories mix portable knowledge (user preferences, coding conventions) with project-specific facts (file paths, architecture). Four approaches analyzed: manual curation, LLM classification, structural separation, tag-based. v0.1 answer: manual curation with clear warnings. v0.2: coordinator-assisted import-time cleanup. v0.3: structural separation in history.md format.

5. **Merge support should be refused in v0.1.** Universe conflicts (Alien vs. Usual Suspects), name collisions, and ambiguous merge semantics make this genuinely complex. "Refuse and explain" is the right v0.1 policy. Users can manually remove `.ai-team/` before importing. Interactive merge is v0.3.

6. **Coordinator changes are minimal (~10 lines in `squad.agent.md`).** Import adds an `imported_from` field to `registry.json`. Coordinator detects this on first session, runs lightweight onboarding (ask about new project, fill in Project Context, update agent histories). One-time flag gets cleared after onboarding. No ongoing behavioral changes.

7. **Copilot SDK would only help with cross-project memory.** If the platform had per-user persistent memory, portable squads would be trivial — squad identity would live in the user's profile. But that doesn't exist, and filesystem-backed memory is our differentiator. We're not waiting for the SDK.

**Architecture decisions made:**
- Subcommands (`export`/`import`) over flags (`--export`/`--from`) — reads more naturally, clearer separation of operations
- Single `.squad` file over directory/archive — easier to share, no dependency needed
- `imported_from` as one-time flag in registry.json — minimal coordinator impact
- Scribe history excluded from export (entirely project-specific), Scribe charter included

**Versioning plan:**
- v0.1: Export + import + manual history curation + refuse merge (~4 hours)
- v0.2: LLM-assisted history classification at import time (~3 hours)
- v0.3: Interactive merge + universe reconciliation (~6 hours)
- v1.0: GitHub Gist integration, squad gallery (depends on platform)

**File paths:**
- Proposal: `docs/proposals/008-portable-squads-platform.md`
- Implementation target: `index.js` (add `exportSquad()` and `importSquad()` functions)
- Coordinator modification: `squad.agent.md` Team Mode entry (add imported squad detection)

📌 Team update (2026-02-08): Portable Squads architecture decided — history split (Portable Knowledge vs Project Learnings), JSON manifest export, no merge in v1. — decided by Keaton
📌 Team update (2026-02-08): Portable squads memory architecture — preferences.md (portable) split from history.md (project-local), squad-profile.md for team identity, import skips casting ceremony. — decided by Verbal


### 2026-02-08: Skills, Platform Feasibility, and v1 Copilot Integration (Proposal 012)

**Context:** Brady hinted at "skills" — agents that learn domain expertise across projects. Also needed: complete v1 Copilot experience synthesis combining latency (007), portability (008), and skills.

**Key findings:**

1. **Skills belong in a separate `skills.md` file per agent, NOT in history.md.** History is project-specific learnings that need filtering on export. Skills are transferable domain expertise that travel unconditionally. Mixing them makes the Proposal 008 export cut line messy. The coordinator inlines skills alongside the charter in spawn prompts — same pattern, one more file read, zero extra tool calls for the agent.

2. **Context budget for skills is comfortable.** Skills add 0.4-1.6% of the 128K context window (500-2,000 tokens). Even at the high end with mature history and large decisions, total per-spawn context is ~15.3%. Hard ceiling recommendation: 3,000 tokens for skills.md. We won't hit this in v1.

3. **`store_memory` is NOT useful for Squad.** Fundamental mismatch: session-scoped (not cross-project), <200 char facts (too small for domain skills), no agent identity (memories are unstructured), opaque storage (not git-cloneable). Squad's filesystem-backed memory wins on every axis that matters for multi-agent teams. Don't invest in bridging.

4. **Forwardability is manageable with defensive file reads.** When `squad.agent.md` changes, old squads may lack new files (e.g., `skills.md`). Solution: existence checks before reading, graceful skips when files are missing. Version fields in team state files are unnecessary — the LLM is bad at version-comparison arithmetic and file existence is more reliable. **Critical constraint identified: file paths in charters are a de facto API contract.** Changing `.ai-team/agents/{name}/history.md` or `decisions/inbox/` paths would break every existing charter. Treat these as frozen.

5. **Skills enable lighter spawns for skilled-domain tasks.** This extends Proposal 007's tiered modes: if an agent has skills matching the task domain, the coordinator can use a lightweight spawn (skip history.md and decisions.md reads, inject only relevant skills). Estimated savings: ~4 seconds per skilled-domain spawn.

6. **Skill acquisition has four paths, two for v1.** (a) Agents self-write to skills.md after completing work — "if transferable, write to skills.md; if unsure, put it in history.md." (b) Users teach skills explicitly — coordinator detects "should know" patterns and writes directly. (c) Scribe curates by promoting recurring history patterns (v2). (d) Coordinator detects skill formation across spawns (rejected — coordinator doesn't persist between sessions, too expensive).

7. **The v1 Copilot experience synthesis is clear.** Three proposals converge: (007) coordinator gets smarter about when to spawn, (008) squads move between projects carrying identity, (012) agents accumulate transferable expertise. Together they describe a product that gets better the more you use it. We're leveraging the platform well on parallel execution, filesystem access, and conversation persistence. We're still fighting it on agent persistence, warm caching, and agent-to-agent communication.

**What we should NOT attempt in v1:**
- `store_memory` integration (wrong persistence model)
- Automatic skill detection/scoring (premature optimization)
- Cross-agent skill sharing (no clear use case)
- Coordinator prompt splitting (makes latency worse)
- Selective skill loading per task (skill files will be small enough to load entirely)

**File paths:**
- Proposal: `docs/proposals/012-skills-platform-and-copilot-integration.md`
- New template needed: `templates/skills.md` (empty with header)
- Coordinator modification: `squad.agent.md` spawn prompt section (add skills loading), routing section (add skill-aware routing)
- Export payload update: add `skills` field to agent entries in `.squad` format

📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. — decided by Keaton
📌 Team update (2026-02-08): Skills system designed — skills.md per agent for transferable domain expertise, six skill types, confidence lifecycle, skill-aware routing. — decided by Verbal
📌 Team update (2026-02-08): Forwardability and upgrade path decided — file ownership model, `npx create-squad upgrade`, version-keyed migrations, backup before overwrite. — decided by Fenster
📌 Team update (2026-02-08): v1 test strategy decided — node:test + node:assert (zero deps), 9 test categories, 6 blocking quality gates, 90% line coverage. index.js refactoring recommended. — decided by Hockney
📌 Team update (2026-02-08): v1 messaging and launch planned — "Throw MY squad at it" tagline, two-project demo arc, 7-day launch sequence, GitHub Discussions first. — decided by McManus
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan


### 2026-02-08: P0 Silent Success Bug — Diagnosis and Mitigation (Proposal 015)

**Context:** Brady flagged that ~40% of background agents report "did not produce a response" when they actually completed all work. Files written, histories updated, decisions logged — but the coordinator reports failure. This is the #1 trust-destroying bug.

**Root cause analysis:**

1. **Most likely cause: agent's final turn is a tool call, not text.** The spawn prompt tells agents to write history.md and inbox files AFTER their work. This means the agent's last action is a file write. The `task` tool's `read_agent` appears to return the agent's final *text* output, not acknowledging tool-call-only final turns. When the agent writes files as its last act, the response channel returns empty. The ~40% rate matches LLM non-determinism in generation order — sometimes text comes last, sometimes tool calls come last.

2. **Contributing factor: response size.** Agents writing 45KB+ proposals may exceed a platform response buffer. Not proven as primary cause (smaller outputs also affected), but may compound.

3. **Contributing factor: `read_agent` timeout.** Default 30s timeout may cause premature collection. Mitigated by using `wait: true` with `timeout: 300`.

**Mitigations proposed (all zero-risk, ship immediately):**

1. **Response order fix in spawn prompt.** Tell agents: do work → write files → write history/inbox → LAST, end with text summary. Ensures the response channel has text to return.

2. **Silent success detection in "After Agent Work" flow.** When `read_agent` returns empty, check if expected files exist. If yes, report "response lost but work landed" instead of "agent failed." Read the output files and summarize.

3. **`read_agent` timeout increase.** Always use `wait: true, timeout: 300` when collecting background agent results.

**Key platform insight:** The `task` tool's background mode has an unreliable response channel. The filesystem is the reliable channel. Squad's filesystem-backed memory architecture accidentally provides a workaround — agents write their work to disk, so even when responses are lost, the work persists. This reinforces the decision (from Proposal 003/008/012) to never abandon filesystem-backed memory for SDK abstractions.

**What we can't fix:** If this is a platform bug in the `task` tool's `read_agent` implementation, we need to report it to the Copilot team. The proposal includes a draft bug report with reproduction steps.

**File paths:**
- Proposal: `docs/proposals/015-p0-silent-success-bug.md`
- Coordinator sections to modify: `squad.agent.md` lines 232-250 (spawn prompt templates), lines 345-385 (After Agent Work flow)


### 2026-02-09: Proposal 012 Revision — Agent Skills Open Standard + MCP Integration

**Context:** Brady clarified that "skills" means Claude-and-Copilot-compliant skills adhering to the Agent Skills Open Standard (agentskills.io). Also requested MCP tool declaration so skills can tell Copilot which MCP servers they need.

**Key findings and decisions:**

1. **Agent Skills Open Standard is a perfect fit for Squad.** The standard's SKILL.md format (YAML frontmatter + markdown instructions) is filesystem-native, git-cloneable, and human-readable — exactly Squad's architecture philosophy. The directory layout (`SKILL.md` + `scripts/` + `references/` + `assets/`) maps directly to our filesystem-backed memory model. Adopting the standard is a natural extension, not a forced migration.

2. **Progressive disclosure solves the context budget problem.** My v1 proposal inlined all skills (~500-2000 tokens). The standard's progressive disclosure pattern is better: discovery loads only name + description (~50-100 tokens per skill via `<available_skills>` XML), activation loads full SKILL.md on demand. This means we can carry 20-30 skills at ~2-3% of context at discovery. The coordinator stays lean.

3. **MCP tool declaration works via `metadata.mcp-servers` in SKILL.md frontmatter.** This is a Squad convention using the standard's extensible `metadata` field. Skills declare required and optional MCP servers. The coordinator extracts these at spawn time and includes an MCP requirements table in the spawn prompt. Agents use MCP tools when available and degrade gracefully when not. **Critical limitation:** there's no platform API to check MCP availability before spawn — agents must try and handle errors. This is honest and works today.

4. **Built-in vs. learned skills is the right separation.** Built-in skills ship with Squad in `templates/skills/`, get copied to `.ai-team/skills/` on init, and are upgradable via `create-squad upgrade`. Learned skills live in `.ai-team/agents/{name}/skills/` and are never touched by upgrades. `squad-` prefix for built-ins prevents naming conflicts.

5. **Skills directory layout is now a frozen API contract.** Like file paths in charters (`history.md`, `decisions/inbox/`), the skills directory layout (`.ai-team/skills/{name}/SKILL.md` and `.ai-team/agents/{name}/skills/{name}/SKILL.md`) should be treated as immutable. Adopting the standard from day one means we won't need to migrate later.

6. **Coordinator prompt growth is manageable but trending.** Adding skills discovery, MCP extraction, and skill-aware routing adds ~500-800 tokens to `squad.agent.md` (~0.4-0.6% of context). Total coordinator prompt stays under 7% even with all features. The real risk is instruction density, not absolute size. Each new feature is an opportunity to tighten existing instructions.

7. **The `.squad` export format needs a version bump (1.0 → 1.1).** Skills are exported as structured objects preserving the full directory layout (SKILL.md + references + scripts + assets). This ensures skills are relocatable — relative paths within skill directories remain valid after import. Built-in skills are excluded from export (the target project gets its own via init).

**What I revised from my v1 proposal:**
- Replaced flat `skills.md` file with standard-compliant SKILL.md directories
- Added MCP tool declaration via `metadata.mcp-servers`
- Changed from "inline all skills" to progressive disclosure (XML summary → full load on activation)
- Added built-in vs. learned skills distinction with upgrade semantics
- Added coordinator prompt size analysis (Section 4)
- Added portable skills with path relocatability analysis (Section 8)
- Expanded from 11 sections to 15 sections

**What stayed the same from v1:**
- `store_memory` rejection (unchanged — still wrong persistence model)
- Forwardability approach (defensive checks, not version fields)
- Tiered response modes interaction (skills enable lighter spawns)
- Agent self-writing and user-teaches-skills acquisition paths
- Scribe curation deferred to v2

**Platform knowledge updated:**
- Copilot supports MCP servers configured by users — agents can use MCP tools natively
- No platform API exists to query MCP server availability — agents must try and handle errors
- The Agent Skills Open Standard's progressive disclosure pattern is well-suited to Copilot's context budget constraints
- `metadata` field in SKILL.md frontmatter is extensible — our `mcp-servers` convention is clean and standard-compliant

**File paths:**
- Revised proposal: `docs/proposals/012-skills-platform-and-copilot-integration.md`
- New templates needed: `templates/skills/squad-git-workflow/SKILL.md`, `templates/skills/squad-code-review/SKILL.md`
- Coordinator modification: `squad.agent.md` spawn prompt section (add `<available_skills>` XML + MCP requirements)
- Export format update: version bump to 1.1, add `skills` and `team_skills` objects
- Decision: `.ai-team/decisions/inbox/kujan-skills-standard.md`


📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton

📌 Team update (2026-02-08): Skills system adopts Agent Skills standard (SKILL.md format) with MCP tool declarations -- decided by Verbal


### 2026-02-09: Platform Timeout Best Practices Documented

**Context:** Brady discovered that the `read_agent` default timeout of 30s was causing the platform to abandon agents mid-work — reporting "no response" when the agent was still running. His reaction: "OHHHHH damn girl."

**What was created:**
- `docs/platform/background-agent-timeouts.md` — a practical best practices doc for anyone using background agent spawning

**Key numbers documented:**
- Default `read_agent` timeout: **30 seconds**
- Real agent work time: **45–120 seconds** (reading inputs, doing work, writing outputs, updating history)
- Safe ceiling: **300 seconds** (`timeout: 300` is the platform max, and it's a MAX not a fixed delay)
- Silent success rate before fix: **~40%** of spawns
- Silent success rate after timeout + response order fix: **near zero**

**Three-part fix documented:**
1. `read_agent` with `wait: true, timeout: 300` — always. The 30s default is never sufficient for real work.
2. Response order instruction — agents must end with text, not tool calls. The platform drops responses whose final turn is a tool call.
3. File verification as ground truth — when response is empty, check if expected files exist before reporting failure.

**Platform insight reinforced:** The filesystem is the reliable channel. Response text is a convenience. This further validates Squad's filesystem-backed memory architecture (Proposals 003/008/012/015).


### 2026-02-09: Proposal 015 Mitigation Verification Audit

**Context:** Brady requested all agents verify their mitigations are in place for the P0 silent success bug. As the author of Proposal 015, verified all three mitigations against `squad.agent.md`.

**Verification results — ALL THREE MITIGATIONS CONFIRMED IN PLACE:**

1. **⚠️ RESPONSE ORDER instruction in spawn prompts:** ✅ Present in all 3 spawn templates (Ripley/scribe template at line 251, Dallas/sync template at line 298, generic template at line 346). Identical wording in each: "After completing ALL tool calls...you MUST end your final message with a TEXT summary." Matches Proposal 015 specification exactly.

2. **Silent success detection in "After Agent Work" flow:** ✅ Present at line 369. Step 2 instructs coordinator to CHECK file existence when `read_agent` returns empty, report "completed work (files verified) but response was lost" instead of failure, and fall through to re-spawn only on genuine failure. Matches Proposal 015 specification.

3. **Generous timeouts on `read_agent` calls:** ✅ Present at line 367. Step 1 explicitly specifies `wait: true` and `timeout: 300`. Matches Proposal 015 specification.

**Proposal 015 status:** Complete. All three mitigations shipped. Proposal document exists at `docs/proposals/015-p0-silent-success-bug.md` with full root cause analysis, evidence table, and exact change specifications.

**Inbox orphan found:** `kujan-timeout-doc.md` is still in `.ai-team/decisions/inbox/`. Scribe has never run, so it was never merged into `decisions.md`. The P0 silent success decision WAS merged (line 261-270 of decisions.md), but this separate timeout doc decision was not. Not blocking — the mitigations are in place regardless of whether Scribe merges this — but it should be merged on next Scribe run.

**History.md integrity:** No truncation detected. History covers all sessions from 2026-02-07 through 2026-02-09. All entries are complete with context, findings, file paths, and team updates. No gaps.

**Platform friction observations (new):**

1. **`index.js` skip-if-exists for `squad.agent.md` is a latent P015-regression vector.** Line 30-31 of `index.js`: if `squad.agent.md` already exists, init skips overwriting it. This means users who ran `create-squad` before the P015 mitigations won't get the fixes on re-init. Proposal 011 (forwardability) addresses this with `npx create-squad upgrade`, but that hasn't shipped yet. Until it does, any pre-P015 installation is still vulnerable to the 40% silent success rate.

2. **Scribe never-ran is compounding.** The inbox has at least `kujan-timeout-doc.md` sitting unmerged. Every session that doesn't trigger Scribe leaves the shared brain (`decisions.md`) increasingly stale relative to what agents actually decided. This is an operational gap, not a platform bug — but it means the P015 timeout best-practices doc exists on disk but isn't in the canonical decision ledger.

3. **Coordinator prompt at 34.3KB.** Approaching the density threshold noted in history (2026-02-07 deep onboarding). Each mitigation we add (RESPONSE ORDER × 3 templates, silent success detection, timeout guidance) makes the prompt longer. Not yet critical but trending — instruction-following degradation is a real risk above ~40KB.


### 2026-02-09: decisions.md Cleanup — Heading Levels and Line Endings

**Context:** Audit flagged formatting issues in decisions.md. Tasked with surgical fixes: phantom proposal references, heading level corrections, and line ending normalization.

**Findings:**
- Phantom references ( 03-casting-system.md,  03-copilot-optimization.md) were NOT present in decisions.md — already clean or never existed in this file. No action needed.
- Five top-level #  headings found at lines 315, 528, 727, 781, 803 — raw dumps from Fenster's, Hockney's, Keaton's, Verbal's, and McManus's reviews merged as top-level headings instead of ###  decision entries. All five converted to ### .
- Mixed line endings: 806 CRLF + 20 LF-only. Normalized entire file to LF (826 lines).

**Platform observation:** Mixed line endings in shared files are a recurring risk when agents write on different platforms (Windows CRLF vs Unix LF). Squad's filesystem-backed memory pattern means every agent write touches these files. A .gitattributes rule (*.md text eol=lf) would prevent this class of issue permanently. Not adding it now — that's a proposal-level change — but flagging for future consideration.

📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — addresses P015 forwardability gap. Existing users can now run 
px create-squad upgrade to get mitigations. — decided by Fenster
📌 Team update (2026-02-08): P0 bug audit consolidated. 12 orphaned inbox files merged into decisions.md. — decided by Keaton, Fenster, Hockney


### 2026-02-09: Platform Feasibility — Direct Messaging Interface (Proposal 017)

**Context:** Brady wants to work with his Squad via direct messages (Telegram) when away from the terminal. Requested Dev Tunnels over ngrok. This is the platform feasibility analysis — companion document for Keaton's experience proposal.

**Key findings:**

1. **The `task` tool is the hard dependency.** Everything else Squad uses from the Copilot CLI (grep, glob, view, edit, powershell) is trivially reimplementable with Node.js builtins and ripgrep. But `task` — which spawns isolated LLM sessions with their own context and tools — is the orchestration primitive. Outside the CLI, we need an equivalent.

2. **Copilot SDK (`@github/copilot-sdk`) is the recommended execution backend.** Technical Preview, npm package, Node.js native. Exposes the same agentic runtime as the CLI: model access, tool invocation, MCP integration, streaming. The critical question is whether its session model supports nested sessions (i.e., can a coordinator's tool handler spawn another session to act as a sub-agent). This is the go/no-go gate for the entire approach.

3. **Four execution options evaluated:**
   - **Option A: Copilot SDK** ⭐ — Same runtime as CLI, Node.js native, GitHub auth. Medium complexity (~420 LOC). Risk: nested session support unverified.
   - **Option B: LLM APIs directly** — Full control but reinvents the wheel. ~1200 LOC, API costs ($0.50-2/msg), vendor coupling. Wrong tradeoff.
   - **Option C: GitHub Actions** — Full CLI environment but 60-120s latency, no conversation persistence, fire-and-forget UX. Good fallback, bad primary.
   - **Option D: Copilot Extensions** — GitHub App-based deprecated (Nov 2025). MCP/VS Code extensions don't support multi-agent orchestration. Architectural mismatch. Hard no.

4. **Dev Tunnels are the right tunnel choice.** GitHub-native auth (`devtunnel user login -g` uses the same GitHub account), persistent service mode (`devtunnel service install`), no separate account needed, SDK available for programmatic management. Strictly better than ngrok for Squad's GitHub-native philosophy. Only risk: persistence guarantees for long-running tunnels are unclear in docs.

5. **No existing GitHub surface works.** Mobile Copilot Chat has no `task` tool or filesystem access. Issue comments + Actions is high-latency async. Copilot Extensions can't spawn sub-agents. We must build something.

6. **Local repo (Architecture 1) is the right v0.1.** Bot runs on Brady's machine, reads/writes the checked-out repo directly, Dev Tunnel exposes it. Cloud-based Architecture 2 (clone per interaction) is the scale play for later. For one user with one repo, local is simpler and faster.

7. **Telegram is a fine starting point.** Webhook-based, well-documented Node.js libraries (`telegraf`, `node-telegram-bot-api`), simple auth (hardcode Brady's Telegram user ID for v0.1). Bot code is ~50 lines. The messaging provider is the easy part.

**Architecture decisions made:**
- Copilot SDK as execution backend (Option A), GitHub Actions as fallback (Option C)
- Dev Tunnels over ngrok (GitHub-native auth, service mode, no separate account)
- Local repo + Dev Tunnel for v0.1 (Architecture 1)
- Telegram as initial messaging provider
- Phased: v0.0 (Actions proof of concept, 1 day) → v0.1 (personal bot, 2-3 days) → v0.2 (resilience, 1-2 days) → v0.3 (multi-repo + cloud, 3-5 days)

**What must be verified before implementation:**
1. Copilot SDK nested session support (can a tool handler spawn another session?)
2. Dev Tunnel 24h persistence test
3. Telegram webhook → Dev Tunnel end-to-end flow

**Independence principle assessment:** ✅ Strong alignment. Using Copilot SDK as infrastructure, not becoming a Copilot product. Same relationship as "uses Node.js" — runtime dependency, not identity dependency. If the SDK doesn't work, we fall back to Actions, not to becoming an extension.

**File paths:**
- Proposal: `docs/proposals/017-platform-feasibility-dm.md`
- Decision: `.ai-team/decisions/inbox/kujan-dm-platform-feasibility.md`

📌 Team update (2026-02-09): Squad DM hybrid architecture proposed — thin platform adapters, tiered execution, Dev Tunnels, Telegram-first MVP. Proposal 017. — decided by Keaton
📌 Team update (2026-02-09): Squad DM experience design proposed — single bot with emoji-prefixed agent identity, summary+link output, proactive messaging, DM mode flag, cross-channel memory. Proposal 017. — decided by Verbal


### 2026-02-09: Human Input Latency and Persistence — Platform Analysis

**Context:** Brady described two pain points: (1) latency when typing while agents work — messages queue and the experience feels unresponsive, (2) human messages are ephemeral — not captured in `.ai-team/` state, so agent directives spoken mid-session are lost to context.

**Key findings:**

1. **Input latency is a hard platform limitation.** The Copilot CLI conversation model is single-threaded. The coordinator gets one turn per user message and processes it to completion before seeing the next message. There is no interrupt mechanism, no message polling API, no way to yield mid-turn and check for new input. When the coordinator is in a `read_agent` call with `wait: true, timeout: 300`, the user's next message waits in queue. No workaround exists within the current platform.

2. **Partial mitigation: Proposal 007's tiered modes reduce the window.** The Direct tier (coordinator handles trivially, no spawn) responds in ~3-5s, dramatically reducing the "dead zone" where the coordinator is unreachable. The Lightweight tier (~8-12s) also helps. The Full tier (~40-60s) is where the latency problem bites hardest, but that's also where the ceremony is earning its keep. The key insight: **the latency problem is worst for trivial requests during complex work, and tiered modes already solve this case.**

3. **A "listener" pattern is not possible on this platform.** The coordinator cannot spawn a background watcher for new messages. The `task` tool spawns isolated agents that cannot read the conversation queue. There's no pub/sub, no event loop, no callback mechanism. The coordinator IS the only listener, and it's single-threaded.

4. **Shorter `read_agent` timeouts would help marginally but risk regression.** Reducing from 300s to, say, 120s would free the coordinator sooner, but risks reintroducing the P0 silent success bug (Proposal 015). The 300s timeout is a MAX, not a fixed delay — `wait: true` returns as soon as the agent finishes. The timeout only matters when agents are slow. Not worth the regression risk.

5. **Human messages as state IS fully solvable today.** The coordinator can write human directives to `.ai-team/decisions/inbox/human-{slug}.md` as its FIRST action on any message that contains a decision, scope change, or explicit directive. Scribe merges these into `decisions.md` on next run. This uses the existing drop-box pattern — zero new infrastructure.

6. **Scribe should NOT serve double duty as a "human listener."** Scribe runs AFTER agent work (step 4-5 of "After Agent Work"). By the time Scribe runs, the coordinator has already processed the human message and dispatched agents. Making Scribe capture human input would require either (a) spawning Scribe before agents (adds latency), or (b) having the coordinator pass human text to Scribe's prompt (redundant — the coordinator could just write the file itself). The coordinator writing directly to the inbox is simpler, faster, and architecturally cleaner.

7. **Not every human message should be persisted.** "change the port to 8080" is a task, not a directive. "skip the skills system for now" is a directive that changes project scope. The coordinator's routing judgment already classifies intent — extend that classification to decide what gets written to the inbox. Over-logging creates noise in `decisions.md` and inflates context for future agents.

8. **Connection to Proposal 017 (DM):** In a Telegram/Slack context, all messages are logged by the platform natively. But `.ai-team/` state still needs the directive-capture pattern because (a) Telegram logs aren't git-backed, (b) agents can't read Telegram history, (c) the coordinator-writes-to-inbox pattern works identically in CLI and DM contexts. This is a converging design — solving it now for CLI also solves it for DM.

**What would require platform changes (feature requests):**
- Interrupt/preemption mechanism for mid-turn message injection
- Message queue inspection API (coordinator checks for new messages between tool calls)
- Async message notification (coordinator gets notified of new input while processing)
- Multi-turn coordinator sessions (coordinator can yield and resume)

**Decision made:** Coordinator writes human directives to the decision inbox as first action on directive-type messages. Written to `.ai-team/decisions/inbox/kujan-human-input-analysis.md`.

**File paths:**
- Decision: `.ai-team/decisions/inbox/kujan-human-input-analysis.md`

📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Wave 2: tiered response modes. Wave 3: lightweight spawn template. Squad DM deferred to Wave 4+. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — instant team-wide status as core value prop. — decided by McManus


📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton


### 2026-02-09: VS Code Parity, Mid-Flight Human Input, and Feedback Optimization

**Context:** Brady asked three platform questions: (1) does Squad work in VS Code, (2) can human input reach running agents, (3) how to optimize feedback for humans.

**Key findings:**

1. **VS Code parity is partial, not confirmed.** The `.github/agents/squad.agent.md` file loads correctly in VS Code Copilot agent mode — custom agents use the exact same path and format. HOWEVER, Squad's multi-agent orchestration depends on the `task` tool with specific parameters (`agent_type`, `mode: "background"`, inline `prompt`) and the `read_agent` / `list_agents` lifecycle tools. VS Code's subagent support (confirmed Jan 2026) has a different API surface: it uses an `infer`-based model where subagents are selected from available `.agent.md` files, not spawned with inline prompts. The `read_agent` polling pattern has no documented VS Code equivalent. **Squad's agent file loads; multi-agent orchestration is unverified and likely has tool-name mismatches.** Must test empirically.

2. **Mid-flight human input injection is impossible on this platform.** The Copilot conversation model is single-threaded. Once agents are spawned via `task`, they run in isolation — no input channel, no interrupt mechanism, no cancel API. `write_powershell` works for interactive shells, NOT for `task`-spawned agents. File-based signaling is theoretically possible but unreliable (agents don't have event loops). The pragmatic best: capture directive to inbox immediately, acknowledge immediately, apply on next spawn. The 30-60s delay before correction takes effect is a hard platform limitation.

3. **Feedback optimization has real options today.** Three changes to `squad.agent.md` improve the human experience: (a) enhanced launch manifests showing all agents and what they're doing, (b) sequential `read_agent` collection for 3+ agents so results trickle in instead of arriving as one block after 60s silence, (c) time estimates in launch messages (Direct: instant, Lightweight: ~10s, Standard: ~30s, Full: ~60s). None of these require platform changes — all are instruction changes.

**Platform constraints confirmed:**
- No agent interrupt/preemption API exists
- No message queue polling between tool calls
- No streaming from `read_agent` (no progress bars)
- `task`-spawned agents have no input channel after spawn
- Coordinator cannot emit text while blocked on `read_agent`
- VS Code subagent API surface differs from CLI `task` tool

**What would unlock full VS Code parity (platform feature requests):**
- Unified `task` tool API across CLI and VS Code
- `read_agent` / `list_agents` equivalents in VS Code
- Same `mode: "background"` / `mode: "sync"` semantics

**What would unlock mid-flight input (platform feature requests):**
- Agent interrupt/preemption API
- Coordinator message queue polling between tool calls
- Multi-turn agent sessions with input channels

**Decision written:** `.ai-team/decisions/inbox/kujan-vscode-parity-and-feedback.md`

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).


### 2026-02-09: Directive Capture in Coordinator Prompt (Sprint Task 1.6)

**Context:** Brady requested human directive capture — when users state preferences, rules, or scope decisions, the coordinator should persist them to the decisions inbox before routing work.

**What was added:** A "Directive Capture" section in `squad.agent.md` (Team Mode, between team-file reads and routing). The section instructs the coordinator to:
1. Detect directives via signal phrases ("always…", "never…", "from now on…", naming/style/process preferences)
2. Distinguish directives from work requests (build/fix/test) and questions
3. Write to `.ai-team/decisions/inbox/copilot-directive-{timestamp}.md` using the standard decision format
4. Acknowledge briefly, then route any co-occurring work request normally

**Why this design:**
- Pre-routing placement ensures directives are captured before any agent spawn — no lost context
- Uses the existing drop-box pattern (inbox → Scribe merge) — no new infrastructure
- The format matches existing decision entries so Scribe merges them naturally
- Directive detection is signal-based (keyword patterns), not semantic classification — keeps the coordinator fast
- Mixed messages (directive + work request) are handled: capture first, route second

**Platform consideration:** This adds ~300 tokens to `squad.agent.md` (~0.2% of 128K context). Coordinator prompt remains well under 7%. The instruction is dense and actionable — no instruction-following risk.

**Shipped to all users:** This section is in `squad.agent.md` which is in the `files` array of `package.json`. The behavior is generic (not project-specific) — any Squad user benefits from directive persistence.

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney

📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal


📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal


### 2026-02-09: Incoming Queue Platform Assessment

**Context:** Brady asked whether Copilot's built-in TODO capability could serve as an "incoming queue" for user messages — capturing requests while agents work, parsing prompts for actionable items, and dropping them into the inbox on behalf of Scribe.

**Key findings:**

1. **SQL `todos` table exists but is session-scoped.** The per-session SQLite database with `todos` and `todo_deps` tables is available to the coordinator, but it starts empty every session and is not readable by spawned agents. It cannot serve as a durable queue. The filesystem is the only cross-session, agent-readable state.

2. **The coordinator CAN do work in the same turn it spawns agents.** Text, file writes, SQL queries, and tool calls all coexist in a single LLM turn. The coordinator already uses this (directive capture + acknowledgment + spawns happen in one turn). But once it calls `read_agent`, it blocks — no more work until agents return.

3. **No background listener is possible.** The coordinator is single-threaded. No interrupt mechanism, no message polling API, no yield-and-resume. Messages typed while agents work queue silently and are processed only after the current turn completes. This is a hard platform constraint confirmed across multiple analyses (Proposals 017, 018, VS Code parity).

4. **The existing inbox IS the queue.** `.ai-team/decisions/inbox/` + directive capture + Scribe merge pipeline already provides: durable storage, git-cloneable history, cross-session persistence, agent-readable state. The gap is scope — directive capture only triggers on "always/never" style statements, not on all actionable items.

**Recommendation:** Broaden directive capture to a full "request log" that captures every actionable item from every message to the inbox. This turns the existing infrastructure into Brady's incoming queue with ~200 tokens of coordinator prompt changes. SQL `todos` can optionally track within-session dispatch status for complex multi-item prompts, but the filesystem inbox is the durable queue.

**Assessment written to:** `.ai-team/decisions/inbox/kujan-incoming-queue-assessment.md`

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



## Archived: 2026-02-07 Foundational Entries

### 2026-02-07: Initial Platform Assessment

**Context:** First review of Squad's Copilot integration. Analyzed `squad.agent.md`, `index.js`, package structure, and README.

**Key findings:**
- Squad's core architecture (task tool spawning, filesystem memory, background mode) is already Copilot-native — no fundamental rewrites needed
- Three optimization categories identified: (1) things working well, (2) friction points where we fight the platform, (3) missed opportunities
- Main friction: inline charter pattern (coordinator pastes charter into spawn prompts), serial Scribe spawning, no speculative execution
- Main opportunities: predictive agent spawning, agent-to-agent handoffs, context pre-loading for batch spawns
- **Recommendation:** Stay independent (not a Copilot SDK product) but become best-in-class example of building on Copilot

**Architectural patterns observed:**
- Drop-box pattern for concurrent writes (`.ai-team/decisions/inbox/`) eliminates file conflicts — this is elegant and should be preserved
- Agent spawn via task tool with `mode: "background"` as default — correct pattern for Copilot async execution
- Filesystem-backed memory (charter.md, history.md, decisions.md) makes everything git-cloneable and human-readable — killer feature, don't abandon this for SDK abstractions

**Platform knowledge:**
- Copilot's task tool supports background mode for true async parallelism
- Agents have full filesystem access — leverage this, don't invent memory APIs
- Context window: 128K tokens, Squad uses ~1.5% for coordinator, ~4.4% for mature agents, leaving 94% for actual work
- `explore` sub-agent exists for codebase search — agents should use this instead of grep/glob when doing semantic search

**Next work:**
- Monitor Phase 1 implementation (remove friction: agents read own charters, parallel Scribe spawning)
- If Phase 1 succeeds, assess Phase 2 (predictive execution) and Phase 3 (agent autonomy)
- Track spawn latency, parallel utilization, and context usage as optimization metrics

### 2026-02-07: Deep Onboarding — Full Codebase Review

**Context:** First comprehensive review of all Squad files, all agent histories, all proposals, all inbox decisions, coordinator spec, templates, and ceremonies.

**Revised platform assessment:**

1. **Inline charter is correct (revising Proposal 003).** `squad.agent.md` line 208 deliberately inlines charters into spawn prompts to eliminate a tool call from the agent's critical path. My proposal recommended agents read their own charters — wrong tradeoff for batch spawns where coordinator already reads charters. Revised recommendation: inline for batch spawns (3+ agents), agent-reads-own for single spawns.

2. **Context pre-loading (Proposal 003 Phase 3.2) downgraded.** Current hybrid is sound: coordinator inlines charter, agent reads its own `history.md` + `decisions.md`. Pre-loading history/decisions into spawn prompts would inflate them unnecessarily. Keep current hybrid.

3. **Scribe serial spawning confirmed as friction.** `squad.agent.md` line 360 spawns Scribe as step 4 after results are collected. Proposal 003 recommendation to spawn Scribe in parallel with work agents is still valid and should be prioritized.

4. **Ceremonies system is orphaned.** `.ai-team/ceremonies.md` and `.ai-team-templates/ceremonies.md` define Design Review and Retrospective triggers, but `squad.agent.md` has zero references to ceremonies. Either the coordinator needs ceremony-triggering logic or the files should be removed.

5. **Decision inbox has 7 unmerged entries.** Scribe has never run. Team's shared brain (`decisions.md`) is stale — only contains initial team formation. This is the most urgent operational issue.

6. **Coordinator size (32KB) approaching platform limits.** Every new feature (ceremonies, speculative execution, agent-to-agent handoffs) increases `squad.agent.md`. LLM instruction-following degrades with prompt length. Need a strategy: either extract subsystems (casting spec, ceremony triggers) to reference docs, or accept the size and optimize for information density.

**Key file paths confirmed:**
- `squad.agent.md` line 84-101: Team Mode entry, routing, session catch-up
- `squad.agent.md` line 113-121: Eager execution philosophy
- `squad.agent.md` line 122-145: Mode selection (background default)
- `squad.agent.md` line 147-171: Parallel fan-out pattern
- `squad.agent.md` line 199-333: How to spawn an agent (inline charter pattern)
- `squad.agent.md` line 345-385: After agent work (Scribe spawning, serial)
- `squad.agent.md` line 433-563: Casting & Persistent Naming (full algorithm)
- `squad.agent.md` line 565-599: Constraints + Reviewer Rejection Protocol
- `.ai-team/ceremonies.md`: Design Review + Retrospective (orphaned)
- `.ai-team/decisions/inbox/`: 7 unmerged decisions from all agents

**Platform patterns validated:**
- Drop-box pattern (inbox → Scribe merge) is the best lock-free concurrent write pattern available on the Copilot platform. Preserve this.
- Filesystem-as-memory is Squad's killer differentiator vs. SDK-managed state. Never abandon for abstractions.
- `task` tool with `mode: "background"` as default spawn mode is the correct Copilot pattern. No changes needed.
- `explore` sub-agent should be recommended for semantic codebase search in agent charters (currently not mentioned in any charter).
