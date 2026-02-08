# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

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

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): Baseline testing needed — zero automated tests today; `tap` framework + integration tests required before broader adoption. — decided by Hockney
📌 Team update (2026-02-08): DevRel polish identified — six onboarding gaps to close: install output, sample-prompts linking, "Why Squad?" section, casting elevation, troubleshooting, demo video. — decided by McManus
📌 Team update (2026-02-08): Agent experience evolution proposed — adaptive spawn prompts, reviewer protocol with guidance, proactive coordinator chaining. — decided by Verbal
📌 Team update (2026-02-08): Industry trends identified — dynamic micro-specialists, agent-to-agent negotiation, speculative execution as strategic directions. — decided by Verbal
📌 Team update (2026-02-08): Proposal 003 revised — inline charter confirmed correct for batch spawns, context pre-loading removed, parallel Scribe spawning confirmed. — decided by Kujan

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