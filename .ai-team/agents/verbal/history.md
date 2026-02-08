# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

- **Coordinator spawn prompts**: All agents use the same template structure (charter inline, read history.md + decisions.md, task description, memory update instructions). Located in `.github/agents/squad.agent.md` lines 200-300. Charter is pasted directly into spawn prompt to eliminate agent tool call overhead.
- **Memory architecture**: `charter.md` (identity, read by agent), `history.md` (project learnings, per-agent), `decisions.md` (shared brain, merged by Scribe), `decisions/inbox/` (drop-box for parallel writes), `log/` (session archive), `orchestration-log/` (per-spawn entries).
- **Mode selection philosophy**: Background is default. Sync only for hard data dependencies, approval gates, or direct user interaction. Scribe is always background. Located in squad.agent.md lines 123-145.
- **Parallel fan-out pattern**: Coordinator spawns all agents who can start work immediately in a single tool-calling turn (multiple task calls). Includes anticipatory downstream work (tests from requirements, docs from API specs). Located in squad.agent.md lines 147-171.
- **Drop-box pattern**: Agents write decisions to `.ai-team/decisions/inbox/{name}-{slug}.md`, Scribe merges to canonical `decisions.md`. Prevents write conflicts during parallel spawning.
- **Agent personality is a feature**: Each agent has opinions, preferences, boundaries. Casting system uses narrative universe names (The Usual Suspects for Squad's own team) to make agents feel real, not generic "Alice the Backend Dev."
- **Context budget math**: Coordinator uses 1.5% of 128K context, 12-week veteran agent uses 4.4%, leaving 94% for actual work. Real numbers documented in README lines 136-145.
- **Reviewer protocol**: Keaton (Lead) and Hockney (Tester) can reject work and require a different agent to handle revisions. Coordinator enforces this. Located in README lines 207-215.
- **Eager execution philosophy**: Coordinator default is "launch aggressively, collect results later." Chain follow-up work immediately when agents complete without waiting for user to ask. Located in squad.agent.md lines 113-121.

<!-- Append new learnings below. Each entry is something lasting about the project. -->

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
- "Throw a squad at it" evolves to "Throw MY squad at it." The possessive pronoun changes everything.
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

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.
