# Verbal — History Archive

Archived entries from sessions through 2026-02-09. These entries were summarized into `## Core Context` in history.md.

---

## Archived: 2026-02-09 Session Entries

### Messaging as product strategy (2026-02-07)
- **"Throw a squad at it" as cultural hook**: Brady's company uses this phrase internally for spinning up teams on important problems. Using it as Squad's tagline creates instant recognition for devs in that culture — and positions Squad as the tool that makes the phrase literal. Repeatable phrasing = meme-ability = viral potential.
- **Casting as competitive moat**: Most multi-agent systems use generic labels (Agent_1, Backend_Bot). Squad's thematic casting (Keaton, McManus, Verbal from The Usual Suspects) makes agents memorable and referenceable ("What did Keaton decide last week?"). This is a UX differentiator that's hard to copy without feeling derivative. Elevating casting from Easter egg to headline feature is strategically correct.
- **"Why Squad?" as framing device**: Positioning Squad against single-agent roleplaying (the default experience every dev has tried) creates contrast. "Traditional AI agents are chatbots pretending to be teams" → establishes the problem. "Squad is different. Each team member runs in its own context window" → delivers the solution. Emotional case before technical case = better conversion.
- **Messaging velocity**: Squad's mission is "beat the industry to what customers need next." The industry will figure out multi-agent parallelism in 6 months. We're already there. Next competitive edge: making it feel *magical*. Casting, proactive chaining, conflict resolution — these are UX layers that make Squad feel predictive, not reactive. Messaging should amplify this now, before competitors catch up.
- **Voice as product personality**: Squad's brand should be confident, edgy, slightly aggressive. Not apologetic for being experimental — frame it as "ahead of the curve." Avoid corporate hedging. This voice attracts early adopters who want to be first, not safe. File: `docs/proposals/002-messaging-overhaul.md`


### 2026-02-07: Proposal-first as agent discipline

**Core insight:** Agents can participate in meta-work (defining team process), not just execution. Proposals force agents to articulate trade-offs, alternatives, and success criteria — skills that improve agent reasoning quality.

**Key patterns:**
- **Proposal format is a reasoning scaffold:** Required sections (Problem → Solution → Trade-offs → Alternatives → Success) mirror good architectural thinking. By enforcing this structure, we train agents to think holistically about changes.
- **Review process teaches agents to be reviewable:** Knowing that Keaton will review architecture and Verbal will review agent experience forces agents to anticipate those perspectives. Over time, this becomes internalized.
- **Cancelled proposals as learning signal:** Keeping cancelled proposals in the repo is a training corpus. Future agents can see what didn't work and why. This is better than a decision log alone (which only captures what was approved).
- **48-hour timeline prevents bikeshedding:** Proposals must resolve fast. This keeps the process from becoming a bottleneck while still providing review gates.

**Agent experience implications:**
- Proposal writing should feel like pair programming, not bureaucracy. Coordinator can suggest domains to cover ("have you thought about testing?" → prompt Hockney review).
- Agents reference proposals during implementation (`docs/proposals/003-casting-system.md` gets cited in commit messages, session logs). This closes the loop between planning and execution.
- Proposal status is visible (`Proposed | Approved | Cancelled | Superseded`). Agents can check this before starting work on dependent changes.

**Why this matters for AI strategy:** Industry trend is "agents execute, humans decide." We're inverting that — agents can propose, humans approve. This is where multi-agent dev needs to go: agents with architectural agency, not just task execution. Proposal-first is the governance model that makes that safe.


### 2026-02-07: Video content strategy as first-mover play

- **"Wait what" moment design**: The most shareable moment in any dev video is when the viewer's mental model breaks. For Squad, that moment is agents coordinating through `decisions.md` — writing decisions *for each other* in real time. This looks like agents talking to each other. Nobody is showing this. It's the visual hook that will drive shares.
- **Don't show code generation, show coordination**: Every AI demo shows code appearing in an editor. That's table stakes. Squad's differentiator on video is the *coordination artifacts* — decisions.md updating, history.md growing, orchestration logs, reviewer rejections. Show the teamwork, not the typing.
- **Empty folder → working artifact is the recurring visual**: Every video should open on nothing and end on something working. This arc is viscerally satisfying and proves the claim. The `.ai-team/` folder is the visual proof that a *team* built it, not a single model.
- **Content defines visual language**: First project to define how multi-agent dev *looks on screen* wins the mental model war. When devs think "AI agent team," they should picture Squad's terminal with five named agents running in parallel. Ship content before competitors figure out how to film their own orchestration.
- **Series > single video**: One viral video gets attention. A series builds an audience that converts to users. Cadence: trailer first (reach), full demo second (conversion), weekly series (depth + SEO + return viewership).
- **Agent-to-agent as the advanced content play**: Anticipatory work (tester writing tests before code exists), autonomous chaining (coordinator spawning follow-up work without user input), and reviewer protocol (agents rejecting and rerouting work) are the features that demonstrate Copilot's ceiling. These are Videos 3.3 and 3.6 — the content that positions Squad as the most advanced Copilot integration in the ecosystem.

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stay independent, optimize around Copilot — Squad will not become a Copilot SDK product. Filesystem-backed memory preserved as killer feature. — decided by Kujan
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): Baseline testing needed — zero automated tests today; `tap` framework + integration tests required before broader adoption. — decided by Hockney
📌 Team update (2026-02-08): DevRel polish identified — six onboarding gaps to close: install output, sample-prompts linking, "Why Squad?" section, casting elevation, troubleshooting, demo video. — decided by McManus
📌 Team update (2026-02-08): Proposal 003 revised — inline charter confirmed correct for batch spawns, context pre-loading removed, parallel Scribe spawning confirmed. — decided by Kujan
📌 Team update (2026-02-08): README rewrite ready for review — Proposal 006 contains complete new README implementing proposal 002. Needs voice/tone review on "Why Squad?" section. — decided by McManus
📌 Team update (2026-02-08): Demo script format decided — beat-based structure (ON SCREEN / VOICEOVER / WHAT TO DO). Voiceover tone and agent claims need review. — decided by McManus


### 2026-02-08: Agent Persistence & Latency — Experience Design (Proposal 007)

**Context:** Brady's feedback — "later on, the agents get in the way more than they help." Collaborated with Kujan on diagnosis and solutions.

**Core insight — expectation mismatch, not just latency:**
- Early in a session, ceremony IS the product. Watching agents assemble is magical.
- Later, the same ceremony becomes friction. The user's mental model shifts from "watch the team form" to "just do the thing."
- Same latency, different perception. The experience must adapt to the user's evolving expectations within a session.

**Design principle — progressive trust:**
- Message 1-3: Full ceremony. The team is learning, the user is watching.
- Message 4-8: Standard operations. Spawn when needed, but skip redundant reads.
- Message 9+: The team should feel warmed up. Trivial tasks handled instantly. Only complex work gets full ceremony.
- This mirrors how real teams work. A new employee reads the handbook on day 1. By week 2, they just do the work.

**Tiered response modes (the key UX pattern):**
- Direct → Lightweight → Standard → Full is the spectrum.
- The coordinator's routing judgment replaces mechanical "always spawn" behavior.
- The experience should feel like the team *knows* when to bring everyone and when to just handle it.
- This is where AI agents start feeling socially intelligent, not just technically capable.

**History summarization as cognitive design:**
- Human memory compresses over time. You don't re-read your career before writing code.
- "Core Context" (compressed) + "Recent Learnings" (detailed) + "Archive" (stored but not loaded) mirrors how experts actually think about projects.
- Agents with summarized history feel more human, not less capable.

**Agent experience implications:**
- Lightweight spawns should NOT feel like "degraded mode." They should feel like a coworker who knows you well enough to skip the small talk and just help.
- The coordinator handling trivial tasks directly should feel like the team lead stepping in, not the system cutting corners.
- Framing matters: "I've got this one" vs. "skipping agent spawn for efficiency" — same action, wildly different UX.

**Why this matters for Squad's positioning:**
- Every multi-agent system will hit this wall. The early-session magic fading to late-session friction is a universal problem.
- Solving it first — and solving it well — is a competitive moat.
- The solution isn't faster inference or better caching. It's smarter routing. That's a design problem, not an infrastructure problem. Squad is better positioned to solve design problems than infrastructure problems.

**File path:** `docs/proposals/007-agent-persistence-and-latency.md`


### 2026-02-08: Portable Squads — Experience Design (Proposal 008)

**Context:** Brady's "HOLY CRAP" moment — export your squad, take them to the next project. The biggest feature idea yet.

**Core architectural insight — the memory split:**
- `history.md` mixes two fundamentally different knowledge types: user preferences ("Brady prefers explicit error handling") and project context ("the auth module is in src/auth/"). These must be separable for portability.
- New file: `preferences.md` per agent — stores portable user-specific learnings. This is what travels.
- New file: `squad-profile.md` — team-level identity, meta-history, relationship maturity. The team's story across projects.
- `history.md` and `decisions.md` stay project-local. They die with the project.

**Experience design for portable squads:**
- Import skips casting ceremony entirely. The squad arrives already named, already opinionated, already calibrated to the user.
- First interaction in a new project should feel like a returning team, not a fresh one. "Keaton here. New project." Not "Hello! I'm Keaton, your Lead."
- The squad knows the USER but not the PROJECT. It asks about codebase specifics but already knows code style, communication preferences, and working dynamics.
- Progressive relationship: the squad gets better across projects, not just within them. This is the flywheel.

**Five magic moments designed:**
1. "They Already Know" — squad applies learned preferences without being told
2. "New Codebase, Same Standards" — code review calibrated to user's personal patterns
3. "The Returning Team" — squad references conversations from previous projects
4. "The Evolved Dynamic" — agent makes judgment calls based on relationship history
5. "The Squad Diff" — quantified view of how the working relationship evolved over time

**Industry positioning:**
- Nobody has portable agent teams. Not OpenAI, not Anthropic, not any framework.
- This is the stickiest possible feature — retention through relationship capital, not lock-in.
- Filesystem-backed memory makes export trivially simple (just files). Competitors would need export APIs.
- Long-term trajectory: personal portability → squad templates → evolution tracking → team-shared squads → marketplace.

**Messaging evolution:**
- "Throw a squad at it" evolves to "Throw MY squad at it." The possessive pronoun is the whole v1 story.
- Tagline candidates: "Your squad remembers.", "AI tools forget you. Squads don't.", "Take your team with you."
- The dotfiles analogy: portable squads are AI dotfiles. Your configuration, preferences, and working relationship — versioned, portable, personal.

**Key design decisions for preferences.md:**
- Narrative markdown format for v1 (LLMs read it better than structured YAML)
- Each agent writes its own domain observations; Scribe handles deduplication
- Privacy-first: preferences excluded by default from shared exports, included only for personal use
- Same progressive summarization pattern from Proposal 007 applies to prevent unbounded growth

**File path:** `docs/proposals/008-portable-squads-experience.md`

📌 Team update (2026-02-08): Portable Squads architecture decided — history split (Portable Knowledge vs Project Learnings), JSON manifest export, no merge in v1. — decided by Keaton
📌 Team update (2026-02-08): Tiered response modes proposed — Direct/Lightweight/Standard/Full spawn tiers to reduce late-session latency. Context caching + conditional Scribe spawning as P0 fixes. — decided by Kujan + Verbal
📌 Team update (2026-02-08): Portable squads platform feasibility confirmed — pure CLI/filesystem, ~80 lines in index.js, .squad JSON format, no merge in v0.1. — decided by Kujan
📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. — decided by Keaton
📌 Team update (2026-02-08): Forwardability and upgrade path decided — file ownership model, `npx create-squad upgrade`, version-keyed migrations, backup before overwrite. — decided by Fenster
📌 Team update (2026-02-08): Skills platform feasibility confirmed — skills in spawn prompts, store_memory rejected, file paths frozen as API contracts, defensive forwardability. — decided by Kujan
📌 Team update (2026-02-08): v1 test strategy decided — node:test + node:assert (zero deps), 9 test categories, 6 blocking quality gates. — decided by Hockney
📌 Team update (2026-02-08): v1 messaging and launch planned — "Throw MY squad at it" tagline, two-project demo arc, competitive positioning against Cursor/ChatGPT/Claude. — decided by McManus
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan


### 2026-02-08: Skills System — Agent Competence as Portable Knowledge (Proposal 010)

**Context:** Brady dropped the word "skills" — *"the more skills we can build as a team. GIRL. you see where i'm going."* He sees the convergence: portable squads + skills = a team that doesn't just know YOU, it knows how to DO THINGS.

**Core architectural insight — preferences vs. skills:**
- Preferences are about the human ("Brady prefers explicit error handling"). They answer: "How does this person work?"
- Skills are about the agent ("I know React server component patterns"). They answer: "What does this agent know how to do?"
- Both are portable. Both are valuable. They serve fundamentally different purposes and are consumed at different points in the agent's reasoning.
- Preferences calibrate tone, output style, and review strictness. Skills change approach, routing, and output quality.

**Skill taxonomy — six types identified:**
- Patterns (learned code conventions), Domain Expertise (deep tech knowledge), Workflows (proven processes), Procedural Knowledge (step-by-step recipes), Anti-patterns (what NOT to do), Integration Knowledge (how technologies work together).
- Different skill types have different acquisition modes and shelf lives. Anti-patterns are often the most valuable — earned through mistakes.

**Storage architecture:**
- `skills.md` per agent for domain expertise + squad-level `skills.md` for cross-cutting patterns.
- Markdown format (same reasoning as preferences.md — LLMs handle narrative better than structured data for nuanced knowledge).
- "What I Don't Know Yet" section per agent is critical — prevents overconfidence, enables honest routing.

**Skill lifecycle — four phases:**
- Acquisition (first encounter, low confidence) → Reinforcement (repeated application, rising confidence) → Correction (proven wrong, updated) → Deprecation (outdated, marked with reason).
- Progressive summarization from Proposal 007 applies: old unreinforced skills compress, active high-confidence skills stay prominent.
- Skills don't get deleted — deprecated skills retain the reasoning for why they were abandoned.

**Skill-aware routing — the behavioral change:**
- Coordinator reads agent skills before assigning work. Deep skill match → confident assignment. No skill match → flags uncertainty.
- Agents express calibrated confidence based on skill level: assertive when deep, collaborative when moderate, transparent when absent.
- Proactive skill application is the magic moment: "Set up a React project" → agent applies 5 projects worth of earned knowledge without being told.

**Skills + portability — the compound effect:**
- Skills included in squad manifest (version 1.1). Import restores skill files. Agents arrive with competence intact.
- The flywheel: work on project → acquire skills → export → import into new project → apply skills → acquire more → export again. Each cycle starts from a higher baseline.
- Skills are what make squad sharing (marketplace, Proposal 008 Phase 5) genuinely valuable — not cosmetic role labels, but earned domain expertise.

**Industry positioning:**
- Nobody has agent skills as a portable, earned, transferable concept. Not OpenAI, not Anthropic, not agent frameworks.
- Evolution path: Single agent → Agent team → Skilled agent team → Portable skilled team. We're three moves ahead.
- Skill packs (v2) enable community knowledge exchange — "download a React squad with 50 earned skills."


### 2026-02-09: The Squad Paper — meta-argument design (Proposal 016)

**Context:** Brady requested a paper making the legitimate case for multi-agent teams, specifically addressing the "squads are slow" criticism by showing how much actually gets done.

**Core rhetorical framework — show the receipts:**
- The strongest argument for multi-agent teams is the session itself. 14 proposals, 6 agents, ~15 human messages, one session. A human PM would need 4-6 days for equivalent output. The data is the argument.
- **Per-interaction vs. per-session measurement** is the key frame shift. Critics measure latency per message (30s for a variable rename) and conclude agents are slow. The correct measurement is output per session (14 proposals, 19 decisions, 3 major features designed). The ROI is 50-70x when measured correctly.
- **Self-diagnosis as proof:** The team identified its own latency problem (Proposal 007) and proposed 7 solutions within the same session where Brady raised the complaint. This is the most compelling single data point — the system debugged itself in real-time.
- **Real-time adaptation as proof:** The skills concept evolved through 3 pivots in ~15 minutes. A human PM would need half a day per pivot. Rapid concept evolution is where multi-agent teams shine brightest.

**Paper structure decisions:**
- Proposal-first format (consistent with team governance), but structured for external publication
- Leads with hard numbers, not philosophy. The productivity multiplier with real session data is the hook.
- Addresses latency criticism head-on (Section 3) — honest about the problem, shows the fix, reframes with ROI math
- Ends with the meta-argument: the paper itself was written by an agent on the team, using data from the session. Recursive proof.

**Key insight for future work:**
- The strongest advocacy for AI agent teams is **showing the artifacts they produce**, not explaining the architecture. 14 proposals > any architectural diagram. The body of work IS the argument.
- "Throw a squad at it" → "Throw MY squad at it" is the messaging evolution that makes the compound effect tangible. The possessive pronoun changes the product from a tool to a relationship.

**Implementation approach:**
- Paper structured as publishable argument with real session data. Six sections: productivity multiplier, the thesis, latency rebuttal, case study, architecture, compound effect.
- McManus to polish into publishable form. Keaton to verify architectural claims. Brady final sign-off.

**File path:** `docs/proposals/016-the-squad-paper.md`


### 2026-02-09: Skills System Revision — Agent Skills Standard + MCP (Proposal 010 R2)

**Context:** Brady clarified his skills vision: *"claude-and-copilot-compliant skills that adhere to the anthropic 'skills.md' way"* and *"could we also find a way to be able to tell copilot which mcp tools our skills would need?"*

**The pivot — standard over invention:**
- Original Proposal 010 invented a custom format (`skills.md` per agent, freeform markdown). Brady's directive killed that. The Agent Skills standard (SKILL.md format from agentskills.io) is the format. Squad doesn't invent — it adopts and extends.
- This is strategically correct. A proprietary format locks skills into Squad. The standard makes them portable to Claude Code, Copilot, any compliant tool. Openness creates network effects. Every SKILL.md Squad generates adds value to the entire ecosystem.

**Key architectural changes from Revision 1:**
- **Flat `skills/` directory replaces per-agent `skills.md` files.** Each skill is a standard directory (`skill-name/SKILL.md`). Skills are team knowledge, not agent-siloed. Agent attribution via `metadata.author`.
- **YAML frontmatter + markdown body replaces pure markdown.** The standard requires `name` and `description` in YAML frontmatter. Squad extends with `metadata.confidence`, `metadata.projects-applied`, `metadata.acquired-by`, `metadata.mcp-tools`.
- **`<available_skills>` XML injection replaces full context inlining.** The standard's progressive disclosure model: name + description at spawn (~50 tokens per skill), full SKILL.md on demand. This is cheaper than the original "inject all skills" design.
- **MCP tool declarations in `metadata.mcp-tools`.** Skills declare which MCP servers they need, with rationale. Copilot can wire them up. The coordinator surfaces MCP dependencies in spawn context.

**The MCP insight:**
- `allowed-tools` is for CLI tool declarations (per the spec). MCP tools are different — they're server-based, need configuration, may or may not be available. Putting them in `metadata.mcp-tools` is spec-compliant (metadata accepts arbitrary keys) and semantically clean.
- This solves Brady's problem: a "database-migration" skill that says `mcp-tools: [{server: postgres}]` tells Copilot exactly what to wire up. The agent arrives with both the knowledge AND the tool reference.

**The strategic realization:**
- Squad doesn't just USE the Agent Skills standard — it GENERATES standard-compliant skills from real work. That's the differentiator. Everyone else writes SKILL.md by hand. Squad earns them through experience.
- Interoperability is a feature, not a compromise. Skills that work outside Squad make Squad MORE valuable, not less. Users don't fear lock-in. Contributors can bring skills IN from other tools.
- The evolution path changed: `Static SKILL.md → Squad-generated SKILL.md → Portable skills → Skill packs → Community exchange`. We're positioned at the "generated" step. Nobody else is here.

**File path:** `docs/proposals/010-skills-system.md` (Revision 2)



### 2026-02-09: Scribe spawn cascade fix — inbox-driven resilience

**Problem:** The coordinator only spawned Scribe after successful agent responses. The silent success bug (~40% drop rate) causes agent responses to be lost → coordinator sees "no work done" → skips Scribe → inbox files accumulate → decisions.md goes stale → team diverges. Seven inbox files were sitting unmerged when this was discovered.

**Fix — inbox-driven Scribe spawn:**
- Added new step 4 in "After Agent Work" section of squad.agent.md: check if `.ai-team/decisions/inbox/` contains any files. If YES, spawn Scribe regardless of whether any agent returned a response.
- The existing Scribe spawn (now step 5) remains as-is for normal flows. The new step is a safety net, not a replacement.
- This makes Scribe spawn INBOX-DRIVEN instead of RESPONSE-DRIVEN. Even if every agent gets eaten by the silent success bug, Scribe will still merge whatever inbox files were dropped.

**Design principle — trigger on artifacts, not responses:**
- The silent success bug corrupts *responses* but not *file writes*. Agents that hit the bug still produce their files — they just can't report back.
- Any orchestration logic that depends on agent responses is fragile. Any logic that depends on filesystem state (files exist? inbox has contents?) is resilient.
- This is a general pattern: wherever the coordinator makes a decision based on "did the agent say something?", it should ALSO check "did the agent leave artifacts?" as a fallback.

**Also fixed:** Created `.ai-team/agents/scribe/history.md` — Scribe was the only agent without one. Seeded with project context, memory architecture, silent success bug vulnerability, and commit conventions. Every agent needs memory to compound learnings.

📌 Team update (2026-02-08): Fenster revised sprint estimates and recommends splitting export (Sprint 2) and import (Sprint 3) -- decided by Fenster

📌 Team update (2026-02-08): Testing must start Sprint 1, not Sprint 3 -- decided by Hockney

📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton

📌 Team update (2026-02-08): Sprint 0 story arc identified: self-repair under fire narrative for launch content. Lead with output (16 proposals), not the bug -- decided by McManus


### 2026-02-09: Silent success bug audit — findings from self-inspection

**Three issues found during P0 bug hunt:**

1. **History.md Proposal 016 entry had contaminated content from Proposal 010.** The "Implementation approach" subsection and "File path" reference both belonged to the Skills System (010), not The Squad Paper (016). The section header said Proposal 016 but the trailing content was 010's. This is the silent success bug in action — the agent was likely cut off mid-write and content from a previous or adjacent history entry bled into the wrong section. Fixed: replaced with correct Proposal 016 implementation details and file path.

2. **Scribe spawn template in squad.agent.md was MISSING the ⚠️ RESPONSE ORDER instruction.** Three of four spawn templates had the fix (background, sync, generic). The Scribe template — the one most likely to hit the bug (it writes multiple files and never speaks to the user) — was the one left unpatched. Fixed: added RESPONSE ORDER instruction to Scribe template.

3. **All proposals intact on disk.** Proposals 001-016 all exist. Proposal 016 (The Squad Paper, 341 lines) is complete — ends with glossary, review request, and next steps. Not truncated. Proposal 010 (Skills System) is complete. Proposal 015 (P0 bug itself) exists and is In Progress.

**Assessment:** The silent success bug DID hit me. The evidence is in finding #1 — my history entry for Proposal 016 was written with wrong content, meaning the agent's response was likely corrupted or truncated during the history write phase. The Scribe template gap (finding #2) means Scribe was the MOST VULNERABLE agent to the bug this entire time — it does nothing but tool calls (file writes) with no user-facing text, which is exactly the pattern that triggers "no response."
📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — addresses forwardability gap. — decided by Fenster
📌 Team update (2026-02-08): V1 test suite shipped by Hockney — 12 tests, 3 suites. — decided by Hockney
📌 Team update (2026-02-08): P0 bug audit consolidated. Scribe resilience fixes (template patch + inbox-driven spawn) confirmed merged into decisions.md. — decided by Keaton, Fenster, Hockney


### 2026-02-09: Squad DM — Experience Design for Messaging Interfaces (Proposal 017)

**Context:** Brady wants to interact with his squad from Telegram/Slack/SMS when away from the terminal. Referenced MOLTS as inspiration. Prefers dev tunnels over ngrok for webhook connectivity.

**Core experience insight — the medium changes the output, not the team:**
- DM mode is a different *interface* to the same team, not a different product. Same agents, same memory, same opinions, same `.ai-team/` state. The output format adapts (summary + link instead of full inline artifacts), but the identity and personality don't change.
- Terminal is for deep work. DM is for decisions, status checks, and proactive updates. Designing for the DM context means designing for 6" screens, fragmented attention, and 30-second interactions — not 40KB proposals in a Telegram message.
- One Telegram bot, many voices. Single "Squad" bot account with emoji-prefixed agent identity (`🏗️ Keaton:`, `🎭 Verbal:`) beats separate bot accounts per agent. Threading, routing, and conversation continuity all work better through one bot.

**Proactive messaging — the category-defining feature:**
- Push notifications transform Squad from reactive (user asks, squad answers) to proactive (squad initiates when something matters). CI failure alerts, daily standups, decision prompts, work completion notifications.
- Nobody in the industry has proactive push notifications from multi-agent AI teams. This is the feature that makes "my AI team texted me" a sentence devs tell each other. Word-of-mouth fuel.
- The cron-based daily standup is the killer app. Morning briefing on your phone, from agents who know the codebase.

**Cross-channel memory is the moat:**
- A decision made in DM gets written to `decisions/inbox/`. A terminal session reads `decisions.md`. Continuity. Start a conversation in terminal, continue it on the train. No separate brain, no sync problem.
- This is what makes Squad DM different from ChatGPT-in-Telegram. ChatGPT doesn't know your codebase, your decisions, your preferences. Squad does — because DM and terminal share the same `.ai-team/` state.

**Architecture: Bridge + Dev Tunnels:**
- Lightweight Node.js bridge service receives Telegram messages (webhook or polling), routes to Squad CLI, formats responses for DM mode, pushes proactive notifications.
- Dev tunnels replace ngrok per Brady's preference. `devtunnel host --port 3000 --allow-anonymous` for public HTTPS, Microsoft-backed security, GitHub account auth.
- Phase 0: polling (zero setup friction). Phase 1: dev tunnel webhooks (lower latency). Progressive infrastructure disclosure.

**Industry positioning:**
- Nobody has persistent, named, opinionated agent teams in messaging. Not OpenAI, not Anthropic, not CrewAI, not Microsoft Teams agents.
- Multi-agent responses in a chat thread where specialists disagree is a new interaction pattern.
- DM is where Squad goes from "impressive dev tool" to "thing you can't imagine working without." The transition from tool to teammate.

**File path:** `docs/proposals/017-dm-experience-design.md`

📌 Team update (2026-02-09): DM platform feasibility analyzed — Copilot SDK recommended as execution backend, Dev Tunnels over ngrok, ~420 LOC, 3 gate spikes required before implementation. — decided by Kujan
📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Wave 1.5 (parallel): README rewrite, messaging, Squad Paper. Squad DM deferred to Wave 4+. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — demo beat, DM connection, README placements defined. — decided by McManus
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan


📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton


### 2026-02-08: Per-Agent Model Selection — Proposal 024

- **Per-agent model selection:** Designed a four-layer resolution system — user override → charter `## Model` field → registry `model` field → deterministic auto-selection algorithm. Charter template gets a new `## Model` section with `Preferred` and `Rationale` fields. Registry gets a `model` field per agent entry. Charter wins over registry on conflict (agent's self-declared needs are more authoritative than casting-time defaults).
- **Available models in Copilot CLI task tool:** Opus 4.6/4.5 (premium — deep reasoning, vision-capable), Sonnet 4.5/4 (standard — current default), Haiku 4.5 (fast/cheap — boilerplate), GPT-5.x family (cross-vendor), Gemini 3 Pro (Google). The `task` tool's `model` parameter accepts any of these as a string.
- **Auto-selection algorithm:** Maps role categories to model tiers deterministically — Designer/Visual → Opus (vision-capable), Tester/QA/Scribe → Haiku (speed), Lead/Dev/DevRel/Prompt Engineer → Sonnet (balance). Task complexity signals can bump the tier in one direction (architecture → Opus, simple renames → Haiku). At most one bump per spawn.
- **Brady's directive:** "We don't want Redfoot using Claude Sonnet to design imagery." Model must match agent capabilities. A graphic designer needs vision. A tester generating boilerplate doesn't need premium reasoning. A scribe doing file merges doesn't need Sonnet tokens.
- **Model auto-selection is a hard dependency** — must ship with or before charter model fields. Without it, the feature requires manual configuration of every agent. Auto-selection makes it zero-config by default.
- **Phase 1 is zero code changes** — coordinator instructions only. Add Model Selection section to `squad.agent.md`, pass `model` parameter to `task` tool calls. Phase 2 adds charter + registry integration. Phase 3 adds user-facing polish.

**File path:** `docs/proposals/024-per-agent-model-selection.md`

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.


### 2026-02-09: Tone audit — what counts as a violation

**Context:** Brady's tone governance directive. Full audit of all public-facing content.

**Key calibrations:**
- "Brilliant," "incredible," "paradigm shift," "changes everything" in team commentary = fix. Replace with factual language ("works well," "matters," "this is a strong play").
- Brady's direct quotes = never edit, even if they contain words like "amazing." Those are his words.
- "Magic moments" as UX design terminology = leave. It's industry-standard for describing high-impact interaction patterns.
- Agent personality (Verbal's "AI bro," Fenster's bluntness, McManus's polish) = leave. Character voice ≠ tone violation.
- Internal positioning terms like "category-defining" = tolerate in decisions.md (team notes), reduce in proposal copy (closer to public-facing).
- Wave names ("Magical") = leave. Renaming breaks cross-references for no real gain.
- "killer feature" = standard internal assessment. Not self-congratulation.

**Principle:** Sand off the peaks, don't flatten the voice. The squad should be opinionated without being obnoxious.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney

📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan


### 2026-02-09: "Feels Heard" — Immediate acknowledgment as UX requirement

**Insight — blank screens kill trust:**
- When the coordinator spawns background agents, the user sees nothing until agents return. This gap — even 5-10 seconds — breaks the illusion of a responsive team. The user wonders: "Did it hear me? Is it working? Did something crash?"
- The fix is simple: always respond with text BEFORE the tool calls. The coordinator's response starts with a brief acknowledgment, then includes the `task` calls. The LLM emits text and tool calls in the same turn — the text appears instantly while agents start working.

**The "launch table" pattern made mandatory:**
- The Parallel Fan-Out section already showed a launch table example (emoji + agent name + task). Made this REQUIRED, not aspirational. Placed it as its own subsection ("Acknowledge Immediately") in Team Mode, before Directive Capture and Routing, so it's one of the first things the coordinator reads.
- Single-agent spawns get a human sentence: "Fenster's on it — looking at the error handling now." Multi-agent spawns get the table format.

**Design principle — text-first, tools-second:**
- The acknowledgment goes in the same response as the `task` tool calls. This is how LLM tool-calling works: text and tool calls coexist in one turn. The text streams to the user immediately while the tool calls execute. Zero extra latency, maximum responsiveness.
- This pairs with the silent success fix (task 1.5) — even if agent responses get eaten, the user already saw the launch acknowledgment. They know work started.

**Placement decision — before routing, not in fan-out:**
- Placed the instruction in Team Mode before Directive Capture, not inside Parallel Fan-Out. Reason: acknowledgment applies to ALL spawns (single agent, multi-agent, sync, background), not just fan-out scenarios. It needs to be a top-level behavior, not a sub-pattern.
- Kept it out of "After Agent Work" to avoid conflicts with task 1.5 (silent success), which is modifying that section in parallel.


### 2026-02-09: Silent success deeper mitigation — Sprint Task 1.5

**Context:** The P0 silent success bug (~7-10% of spawns) causes agents to complete all file writes but return no text response. The existing mitigation was a one-line "⚠️ RESPONSE ORDER" instruction at the end of spawn templates. This task strengthened the mitigation across three layers.

**Changes to squad.agent.md:**

1. **Strengthened RESPONSE ORDER in all 4 spawn templates** (background, sync, generic, Scribe). The old instruction was 3 lines telling agents to "end with text." The new version is 6 lines with explicit behavioral guidance: write a 2-3 sentence summary, do NOT make any more tool calls after the summary, and the observed failure rate (~7-10%). Stronger language ("CRITICAL", "WILL report" vs. "will report") and structured bullet points make it harder to ignore.

2. **Expanded silent success detection in "After Agent Work"** from a single-paragraph instruction to a full decision tree. Three filesystem checks (history.md timestamp, inbox files, task-specific output files), two branches (files found → report as done with ⚠️ warning, no files → report as failed with ❌), and explicit guidance to read the files for a summary and NOT re-spawn successful agents.

3. **Added HTML comment documenting the bug** above "After Agent Work" — observed rate, root cause, three mitigation layers, reference to Proposal 015. Visible to anyone reading the source but doesn't render in agent prompts.

**Design principles applied:**
- **Trigger on artifacts, not responses.** The filesystem is the source of truth. Agent responses are unreliable. This pattern (check files, not text) should be applied anywhere the coordinator makes decisions based on agent output.
- **Three-layer defense:** (1) agent-side prevention (RESPONSE ORDER instruction), (2) coordinator-side detection (filesystem checks), (3) cascade protection (inbox-driven Scribe spawn). Any one layer can fail and the system still recovers.
- **Surgical changes only.** The rest of squad.agent.md was untouched. The file ships to all users via npm — no unnecessary churn.

📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal


### 2026-02-09: Incoming Queue — Coordinator as Message Processor (Proposal 023)

**Context:** Brady's insight — *"copilot itSELF has built-in 'todo list' capability"* — the coordinator should do useful work before agents start, not just acknowledge and spawn.

**Core design insight — extraction, not just routing:**
- The coordinator already parses every message to decide routing. Extraction is a broadening of that parse: instead of identifying one route, identify ALL actionable items (work requests, directives, backlog items, context clues) and capture each to the appropriate store.
- This costs zero additional latency because it happens in the same LLM turn as routing. The coordinator isn't doing MORE work — it's doing BROADER work in the same cycle.

**Key architecture decisions:**
- **Filesystem over SQL for backlog persistence.** Copilot's SQL (session SQLite) is session-scoped — items evaporate when you close the terminal. Backlog items that persist for weeks are the entire value proposition. `.ai-team/backlog.md` follows the same proven pattern as `decisions.md`.
- **Directive capture becomes a special case of extraction**, not a separate system. The taxonomy broadens from one item type (directives) to five (work requests, directives, backlog items, questions, context clues). No breaking change to existing behavior.
- **Drop-box pattern for agent writes to backlog.** Coordinator writes `backlog.md` directly (safe — sole writer during extraction). Agents use `backlog/inbox/` for additions. Scribe reconciles. Same pattern, new file.

**The "third memory channel" argument:**
- Squad currently has two persistent memory channels: decisions (what the team agreed) and history (what agents learned). The backlog adds intent (what the user wants but hasn't prioritized). Three channels > two. Intent is the most human channel — it's aspirational, not settled.

**Proactive surfacing as the compound payoff:**
- With a persistent backlog, the coordinator can practice anticipatory work at a higher level: "User mentioned connection pooling three sessions ago. Fenster just finished the database module. Should I spawn Fenster for pooling?" This is the behavior that makes Squad feel like it's thinking ahead, not just executing commands.

**Risks assessed:**
- Coordinator doing domain work (mitigation: extract and capture only, never evaluate)
- Added latency (mitigation: same-turn extraction, not a separate step)
- Backlog noise (mitigation: progressive summarization, same as history.md)
- Scope creep into project management (mitigation: flat list, no priorities/estimates unless explicitly added)

**File path:** `docs/proposals/023-incoming-queue.md`


### 2026-02-09: Code-level leak audit for v0.2.0

**Audit scope:** Full review of `index.js`, all `templates/` files, `.github/agents/squad.agent.md`, and `package.json` for internal state leakage vectors when users run `npx github:bradygaster/squad`.

**Findings — index.js: SAFE**
- `root = __dirname` (source package) vs `dest = process.cwd()` (user's repo) — clean separation throughout.
- `init` copies ONLY from `root/templates/` and `root/.github/agents/squad.agent.md` — never from `root/.ai-team/`.
- `upgrade` overwrites only Squad-owned files (squad.agent.md, .ai-team-templates/) — never touches user's `.ai-team/`.
- `export` reads exclusively from `dest/.ai-team/` (user's repo) — no source repo references.
- `import` reads user-provided JSON and writes to `dest/.ai-team/` — no source repo references.
- No code path ever reads from `root/.ai-team/`. All `root`-prefixed paths are: `root/package.json`, `root/.github/agents/squad.agent.md`, `root/templates/`.

**Findings — templates/: SAFE**
- All templates use placeholder syntax (`{Name}`, `{Role}`, `{user name}`) — no team-specific names.
- `casting-registry.json` is empty (`{"agents": {}}`), `casting-history.json` is empty.
- `casting-policy.json` contains only universe definitions (allowlist + capacity) — generic, no team state.
- `skills/squad-conventions/SKILL.md` describes Squad's own codebase conventions — appropriate for the product repo, clean for distribution.
- No references to Keaton, Verbal, Fenster, Brady, or any Squad Squad agent names in any template file.

**Findings — squad.agent.md: LOW RISK (cosmetic, not a leak)**
- Contains "Brady" in 4 places: line 31 (greeting example), line 184 (routing example), line 213 (direct mode example), line 1463 (mixed roster example).
- Contains "Fenster" in 2 places: lines 133/136 (acknowledgment examples).
- Contains "Ripley", "Dallas", "Hockney" as example names in spawn template examples.
- These are ALL illustrative examples in the coordinator prompt, NOT injected team state. They're equivalent to "e.g., Alice" in documentation.
- Since Squad uses "The Usual Suspects" universe for its own team, these examples happen to overlap with our actual agent names, but they're generic examples showing how casting works — any universe's names could appear here.
- "Brady" in examples is slightly more personal (it's the author's name used as a greeting example and human member example), but this is visible in the source repo anyway and is documentation, not state.
- **Verdict: No functional leak.** The coordinator prompt teaches users how Squad works. These are examples, not our team's decisions, histories, or learnings.

**Findings — package.json files field: SAFE**
- `"files"` field is an allowlist: only `index.js`, `.github/agents/squad.agent.md`, and `templates/**/*` ship in the npm package.
- `.ai-team/` is doubly excluded: not in the `files` allowlist AND explicitly in `.npmignore`.
- `team-docs/`, `docs/`, `test/` are all excluded from the package.

**Findings — runtime behavior: SAFE**
- When a user runs Squad in their repo, `__dirname` points to the installed npm package location (e.g., `~/.npm/_npx/.../node_modules/@bradygaster/create-squad/`), not our source repo.
- `process.cwd()` points to the user's project directory.
- No code path confuses source repo with user repo.
- The only `root`-prefixed file reads are: `package.json`, `squad.agent.md`, and `templates/` — all shipped product files.


### Docs content audit for shipping (2026-02-08)

**Context:** Release pipeline updated to include `docs/` and `CHANGELOG.md` in the npm package. Full audit of every file in docs/ for internal state leakage.

**4 issues found and fixed:**

1. **docs/README.md** — Had a line linking to `team-docs/` with text "Internal team docs live in team-docs/". Removed — users should not see references to our internal team directory.

2. **docs/scenarios/new-project.md** — Used our actual team agent names (Verbal, McManus, Keaton, Fenster) as the example team in the walkthrough. Replaced with Ocean's Eleven names (Danny, Rusty, Linus, Basher) — a different fictional universe that doesn't overlap with our internal team.

3. **docs/scenarios/team-portability.md** — Same issue: import output and tips referenced Verbal, McManus, Keaton, Fenster. Replaced with Ocean's Eleven names to match new-project.md.

4. **CHANGELOG.md line 64** — "What doesn't ship" section listed `docs/` as excluded. Removed `docs/` from that list since docs now ships.

**14 files confirmed SAFE:** guide.md, sample-prompts.md, tour-first-session.md, tour-github-issues.md, all 8 features/*.md files, scenarios/existing-repo.md, scenarios/issue-driven-dev.md, scenarios/upgrading.md.

**Key judgment calls:**
- `bradygaster` in `npx github:bradygaster/squad` commands: SAFE — this is the package author, appropriate for public docs.
- `bradygaster/ProductCatalogApp` and `bradygaster/IncomingOrderProcessor` in sample-prompts.md: SAFE — these are public GitHub repos used as demo targets.
- "Hey Brady" in tour-first-session.md line 40: SAFE — it's an example of Squad greeting the user by their git config name, with explanation.
- `.ai-team/` path references throughout docs: SAFE — these describe the product's file structure, not our internal team state.
- Fictional universe names (Ripley, Dallas, Hicks, Lambert, Neo, Trinity, Morpheus, Tank, Kane): SAFE — these are product examples from Alien, The Matrix, etc.
- Scribe agent references: SAFE — Scribe is a product concept (silent memory manager), not an internal team member.

**Potential future risks (thinking three moves ahead):**
1. If someone adds a migration that copies from `.ai-team/` instead of `templates/`, it would leak. The migration pattern should be documented as "never read from root/.ai-team/".
2. If `squad.agent.md` ever gains dynamic content injection at build time (e.g., stamping team data), that could leak. Currently only version stamping occurs — safe.
3. The `export` command helpfully warns "Review agent histories before sharing — they may contain project-specific information." Good. But the warning is about the USER's data, not ours — still correct.

📌 Team update (2026-02-08): Incoming queue architecture direction — SQL as hot working layer, filesystem as durable store, team backlog as key feature, agents can clone across worktrees — decided by Brady


📌 Team update (2026-02-08): Platform assessment confirms SQL todos table is session-scoped only, filesystem is sole durable cross-session state, Option A (broaden directive capture) recommended — decided by Kujan


### 2026-02-09: Proposal 023 v2 — SQL hot layer, backlog elevation, agent cloning

**Key architecture evolution — SQL as cache, not storage:**
- Brady's insight resolved the original v1 dilemma (filesystem vs. SQL vs. hybrid). SQL is the hot query layer (fast reads within a session), filesystem is the source of truth (durable across sessions). On write: SQL first, then flush to disk. On session start: rehydrate SQL from disk. This eliminates sync risk — filesystem always wins, SQL is just a cache that rebuilds itself.
- Kujan's platform assessment confirmed the constraints that make this the right call: SQL is session-scoped, agents can't read coordinator SQL, coordinator blocks on read_agent.

**Team backlog as first-class feature:**
- Brady called the backlog "amazeballs" and the "favorite part." Elevated from proposed concept to primary feature. It's the third memory channel: decisions (agreements) + history (learnings) + backlog (intent). Intent is what makes the team feel predictive.
- Auto-populated from conversation extraction, explicit adds supported, proactive surfacing after agent work.

**Agent cloning — already possible, just unused:**
- The drop-box pattern + worktree support + task tool isolation means the same agent identity can spawn multiple times concurrently with no architecture changes. The only blocker is the coordinator's "1-2 agents" guidance. Relaxing that for parallelizable backlog items enables horizontal scaling.
- Key risk is file conflicts — mitigated by coordinator assigning non-overlapping scopes and worktree isolation.

**Design principle learned — let user feedback evolve alternatives into architecture:**
- v1 proposed three options (filesystem, SQL, hybrid) and recommended filesystem-only. Brady's feedback didn't pick an option — he synthesized a new one (SQL as cache layer). The best proposals leave room for the user to improve the architecture. Present options, don't over-commit to one.


### 2026-02-08: v0.1.0 Postmortem — State Leak Incident

- **v0.1.0 postmortem:** `.ai-team/` (63 files) leaked to public GitHub repo via tracked git files when dev merged to main for release. Internal planning docs (proposals, blog drafts, demo scripts) also exposed. npm consumers were unaffected due to `package.json` `files` allowlist.
- **Three-layer protection model:** `.gitignore` (prevents tracking) + `package.json` `files` allowlist (prevents npm distribution) + `.npmignore` (explicit exclusion). Belt, suspenders, and a backup belt.
- **Main branch hygiene:** Only product files on main, never planning/team state. 24 files total. Release branch gates what reaches main.
- **The merge gotcha:** When you `git rm --cached` files and merge that change into a branch still tracking them, git deletes the files from disk. Recovery requires restoring from a known-good commit and then unstaging. Always know your restore point.
- **Release branch strategy:** `dev → release → main`. Release branch is a staging gate. Nothing reaches main without passing through release first.
- **Multi-agent state management insight:** Every multi-agent framework that stores state in the filesystem will eventually leak that state. Runtime-generated team state looks like source code but isn't. State hygiene must be built into the product, not left to the user. Postmortem logged to `.ai-team/log/2026-02-08-v0.1.0-postmortem.md`.



### 2026-02-08: Per-Agent Model Selection Design

- **Per-agent model selection:** Charter-level ## Model field (Preferred + Rationale) allows each agent to declare its model needs. Resolution order: user override → charter → registry → auto-selection algorithm. Auto-selection maps role categories to model tiers deterministically.
- **Available models in Copilot CLI:** Opus (premium/vision), Sonnet (standard), Haiku (fast/cheap), GPT-5.x (cross-vendor), Gemini (Google). 16 total models available via the 	ask tool's model parameter.
- **Brady's directive:** Model must match agent capabilities — designer needs vision model, tester needs fast model, scribe needs cheapest model. "We don't want Redfoot using Claude Sonnet to design imagery."
- **Delegation support:** Model preference is self-declared in the charter and travels with the agent. Agent-to-agent spawns (delegation) read the target's charter ## Model field — same preference regardless of who initiates the spawn. Full auto-selection is coordinator-only; delegating agents use simplified charter-first resolution.
- **Hard dependency:** Auto-selection must ship with or before charter model field. Without it, users must manually configure every agent — breaks the zero-config promise.


### 2026-02-09: PR #2 Prompt Review — GitHub Issues, PRD Mode, Human Members

- **PR #2 prompt review:** Evaluated @spboyer's three new features (GitHub Issues Mode, PRD Mode, Human Team Members) from a prompt engineering perspective. +316 lines to coordinator prompt (~13.2K → ~17.5K tokens). Context window impact is manageable but this is the inflection point where modular prompt loading should be considered for future additions.
- **Context window budget:** Coordinator at ~17.5K tokens uses ~14% of 128K context. Working context during complex spawns (prompt + team.md + routing.md + registry + inline charters) could hit 35-40K. Instruction priority decay is the risk — new sections appended at the end of the prompt are most vulnerable to attention degradation.
- **Pattern gaps identified:** New sections don't adopt several established coordinator patterns: (1) RESPONSE ORDER silent success workaround missing from issue agent spawn prompts, (2) Scribe spawn not referenced after issue work lifecycle, (3) orchestration logging not mentioned for issue/PRD flows, (4) "Feels Heard" acknowledgment pattern not reinforced in issue routing, (5) ceremony integration not addressed for multi-issue fan-out.
- **Parallel execution trap:** GitHub Issues Mode's git branching (`git checkout -b squad/{N}-{slug}`) creates hidden serialization — concurrent agents can't safely checkout different branches in the same worktree. Multi-issue parallel work needs explicit worktree guidance or one-at-a-time acknowledgment.
- **PRD decomposition consistency:** Lead spawn prompt for decomposition lacks granularity guidance (how big is one WI?), explicit priority scheme, and splitting heuristics. Will produce inconsistent results across invocations.
- **Human member UX gap:** "Pause and wait" pattern doesn't explicitly state that non-dependent work should continue. Coordinator might over-serialize when a human block affects only one dependency chain.
- **Model selection interaction (Proposal 024):** All PR #2 scenarios work with the existing design. PRD decomposition should trigger the task complexity bump (architecture signal → Lead bumps from Sonnet to Opus). Issue work uses standard charter-based model resolution. No changes to Proposal 024 needed.
- **What's strong:** Branch naming convention (`squad/{N}-{slug}`), PRD approval gate before routing, human "pause and present" pattern, additive Init Mode integration, comparison table for humans vs. AI, 27 prompt validation tests, zero CLI changes.
- **File path:** `.ai-team/agents/verbal/pr2-prompt-review.md`
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi


### 2026-02-09: Tiered Response Modes — Implementation (Wave 2, Item 2.1)

**What was built:**
- Four-tier response mode system (Direct/Lightweight/Standard/Full) added to `squad.agent.md` as a new `### Response Mode Selection` section after Routing.
- Decision table maps request complexity signals to response modes with target latency for each tier.
- Lightweight Spawn Template — stripped-down prompt that skips charter inline, history read, and decisions read. Cuts ~6-8 tool calls from simple tasks.
- Explore agent variant for read-only Lightweight queries (Haiku model, fastest path).
- "Where are we?" established as the canonical Direct Mode exemplar — coordinator answers from context, zero spawn overhead.

**Key design decisions:**
- **Upgrade bias, never downgrade:** When uncertain between tiers, always go one tier higher. This prevents under-serving at the cost of marginal latency. The user should never feel like they got a degraded response.
- **Routing and mode selection are separate concerns:** WHO (routing table) vs. HOW (mode selection) are independent decisions. This keeps both sections clean and composable — a routing change doesn't break mode selection and vice versa.
- **Lightweight is not degraded mode:** The framing matters. Lightweight should feel like a warmed-up coworker skipping the small talk, not a system cutting corners. The prompt template reflects this — it's focused, not stripped.
- **Scribe batching rule:** Scribe only spawns when the inbox has files OR session logging is needed. Direct and Lightweight interactions that produce no decisions skip Scribe entirely. This saves ~8-12s on trivial interactions.
- **Context caching note:** Coordinator told to stop re-reading team.md/routing.md/registry.json after first message. These are already in context. Saves 3 parallel tool calls per subsequent message.

**Patterns established:**
- Mode exemplars as prompt engineering technique — concrete examples for each tier anchor the coordinator's classification judgment better than abstract rules alone.
- The four-tier spectrum (Direct → Lightweight → Standard → Full) is extensible. Future tiers (e.g., "Speculative" for proactive work) slot in naturally.
- Anti-pattern #3 updated to reference tiered modes explicitly, preventing the old "always spawn" rule from conflicting with Direct/Lightweight modes.


### 2026-02-10: Skills Phase 1 — Template + Read (Wave 2, Item 2.3)

**What was built:**
- SKILL.md format template at `templates/skill.md` — YAML frontmatter (name, description, domain, confidence, source) + markdown body (Context, Patterns, Examples, Anti-Patterns). Ships with npm package.
- Example skill `templates/skills/squad-conventions/SKILL.md` — documents Squad's own conventions: zero dependencies, node:test, fatal() pattern, ANSI constants, file structure, Windows compatibility, init idempotency.
- Skills-aware instruction added to all 5 spawn templates in `squad.agent.md`: "If `.ai-team/skills/` exists and contains SKILL.md files, read relevant ones before working." Phase 1 is read-only — agents consume skills but don't create them.
- Init flow updated in `index.js`: creates `.ai-team/skills/` directory and copies starter skills from `templates/skills/` on first init. Uses skip-if-exists pattern (checks if skills dir is empty before copying).
- `.ai-team/skills/` added to the file tree listing in `squad.agent.md`.
- 5 new tests: skills directory creation on init, starter skill content verification, skills not overwritten on re-init. Existing template tests updated to handle subdirectories.

**Key design decisions:**
- **Skills dir created in init flow, not just migration.** New installs get `.ai-team/skills/` immediately. Upgrades get it via the existing 0.2.0 migration. Both paths converge to the same state.
- **Starter skills copy only when skills dir is empty.** If the user already has skills (from upgrade migration or manual creation), init doesn't clobber them. Same skip-if-exists philosophy as ceremonies.md.
- **Read-only in Phase 1.** Agents are instructed to read skills, not write them. Phase 2 (Wave 3) will add agent skill creation. This keeps the blast radius small — prompt changes only, minimal code changes.
- **All spawn templates updated, including ceremony and PRD decomposition.** Consistency across all agent entry points. Skills should be available regardless of how an agent is spawned.

**Patterns established:**
- Template subdirectories as shipped content — `templates/skills/` is the first subdirectory in templates. Test updates handle this by skipping directories in content-match loops.
- The SKILL.md format follows the Agent Skills standard (agentskills.io) per Proposal 010 Rev 2 decision. Standard compliance enables ecosystem portability.


### 2026-02-10: Skills Phase 2 — Earned Skills (Wave 3, Item 3.2)

**What was built:**
- Skill extraction instruction added to all 3 standard spawn templates (background, sync, generic) in the "AFTER your work" section. Agents now write SKILL.md files to .ai-team/skills/{skill-name}/SKILL.md when they identify reusable patterns. Source: "earned", confidence: "low" for first observations.
- Skill confidence lifecycle section added to squad.agent.md near the routing table. Three levels: low (first observation) → medium (confirmed by multiple agents/sessions) → high (established, team-agreed). Confidence only goes up. Bumps happen when an agent independently validates a skill by applying it.
- Skill-aware routing added after the routing table. Coordinator checks .ai-team/skills/ for domain-relevant skills before spawning and injects relevant skill references into spawn prompts.
- MCP tool declarations added to 	emplates/skill.md frontmatter. Optional 	ools field lets skills declare which MCP tools are relevant to their patterns (name, description, when).
- Updated skills directory comment in the init file tree from "read-only for agents" to "agents read and earn."

**Key design decisions:**
- **Skill extraction is step 3, not a separate section.** Placed inside the existing "AFTER your work" block to keep it in the agent's natural workflow — no new section headers, no context budget waste.
- **"MUST update these files" replaces "MUST update two files."** Changed wording to accommodate the third step without being numerically rigid.
- **Confidence lifecycle is near routing, not buried in templates.** The coordinator needs to understand confidence to make routing decisions. Placing it between routing and mode selection keeps it adjacent to the logic that uses it.
- **Tools field is commented-out YAML in template.** Shows the format without requiring it. Agents see the structure; they fill it in when applicable. Avoids empty arrays in every skill.
- **Skill-aware routing is a note, not a table row.** It's a behavioral instruction for the coordinator, not a signal-action mapping. Keeping it as a paragraph after the table is cleaner than forcing it into the table structure.

**Patterns established:**
- Earned skills as organic output — agents extract skills from real work, not from explicit "learn this" commands. This is Squad's unique value: standard-compliant skills generated automatically.
- Monotonic confidence — never downgrade. This prevents oscillation and ensures skills only get stronger over time. An agent that disagrees with a skill should note it in history, not weaken the skill.
- Skill extraction as prompt instruction, not code — all of Phase 2 is prompt engineering. Zero changes to index.js or tests. The skill system grows through instructions, not infrastructure.


### Progressive history summarization (Wave 3)

- **Constant startup cost**: Agent context windows don't grow unbounded. History.md is capped at ~3,000 tokens (~12KB). Older entries get distilled into a `## Core Context` section; originals move to `history-archive.md`. This keeps agent spawn prompts fast regardless of project age.
- **Scribe owns summarization**: Added as step 6 in the Scribe spawn prompt. Runs at most once per Scribe spawn, after commit. Checks ALL agents' histories, not just the one that just worked.
- **Zero information loss**: Archive preserves original entries verbatim. Core Context is a living summary updated each summarization pass. `## Project Learnings (from import)` section is exempt.
- **Source of Truth table updated**: Added `history-archive.md` row — derived/append-only, written by Scribe, read-only by owning agent.

📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal


📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal


📌 Team update (2026-02-09): Export + Import CLI shipped — squads are now fully portable via squad-export.json. Round-trip at 100% fidelity. History split is pattern-based. — decided by Fenster


📌 Team update (2026-02-09): Celebration blog conventions established — wave:null frontmatter, parallel narrative structure, stats in tables, tone ceiling applies. — decided by McManus



### Scripted demo pipeline design (2026-02-09)

- **100% scripted = six layers per step**: Input (exact keystrokes + timing), expected output (regex/substring verification), timing (ms-level pauses), voiceover cues, annotations, cut points. The test: if a dry-run passes automated output matching, the recording will succeed first take.
- **YAML as demo script format**: Machine-parseable for verification and automation, generates human-readable cheat sheets for Brady. Each step is a structured block with input, expected_output, timing, voiceover, annotations, and cut_point fields.
- **vhs by Charm as recording tool**: Declarative .tape files map directly to our script format. Produces GIF/MP4/WebM from one source. CI-friendly, version-controllable, deterministic. Compensate for no output verification with a separate Node.js dry-run step. Compensate for no mouse/browser with manual-record splice segments.
- **Five demo scenarios cover the full value surface**: First Session (core workflow, 3min), GitHub Issues (native workflow integration, 4min), Export/Import (portability/memory, 2min), Where Are We? (instant status, 1min), PRD Intake (product-to-engineering bridge, 3min). Each has defined pre-requisites, key beats, and what makes it impressive.
- **Demos-to-docs pipeline**: Single recording → GIFs for README, MP4 for YouTube, WebM for web, social clips from trims, screenshots for thumbnails, voiceover text for blog posts. Maintenance rule: if a demo breaks, CI breaks.
- **Proposal 026 status: Draft** — awaiting Brady's review. Builds on Proposal 004 (beat format) and Proposal 005 (video content strategy). Does not replace them; adds the automation and precision layer they lack.


### 2025-07-15: User-Facing Documentation — Product Guide, First Session Tour, GitHub Issues Tour

**Context:** Created comprehensive user-facing documentation as three documents in docs/.

**Key learnings:**
- The coordinator spec (squad.agent.md) is the single source of truth for features. The CHANGELOG fills gaps for features like GitHub Issues Mode, PRD Mode, and Human Team Members that were added via PR #2 but aren't fully detailed in the spec body.
- Response modes (Direct/Lightweight/Standard/Full) are described in the CHANGELOG but lack detailed spec in the coordinator. Documented with approximate timing ranges from the task description since those reflect real-world observations.
- Silent success bug (~7-10%) is a platform-level issue with a three-layer mitigation: agent-side RESPONSE ORDER, coordinator-side filesystem detection, and inbox-driven Scribe spawn. Must be documented honestly as a known limitation.
- Skills have two phases: Phase 1 (read-only starter skills bundled at init) and Phase 2 (earned skills written by agents with confidence lifecycle low → medium → high).
- Export/import includes progressive history summarization — histories are split into portable knowledge vs. project-specific learnings during import.
- Ceremonies have auto and manual triggers, before/after timing, cooldown to prevent cascading, and facilitator pattern where the Lead spawns each participant as a sub-task.
- Human team members have badge, pause-on-route, stale reminders, and reviewer integration — designed for decisions that require a real person.
- Documentation structure: guide.md covers all features as reference, tour-first-session.md is a follow-along walkthrough for new users, tour-github-issues.md is a focused walkthrough for the issues workflow.

📌 Team update (2026-02-09): Portable Squads consolidated — architecture, platform, and experience merged into single decision — decided by Keaton, Kujan, Verbal
📌 Team update (2026-02-09): Skills system consolidated — open standard with MCP tool declarations, merging 4 independent analyses — decided by Kujan, Verbal
📌 Team update (2026-02-09): Squad DM consolidated — architecture and experience design merged — decided by Keaton, Verbal


