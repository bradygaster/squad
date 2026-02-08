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
- Six phases, starting with template + instruction changes (zero code changes). Skills in export/import at Phase 3. Skill packs at Phase 6 (future).
- Total initial effort: ~2 hours for Phase 1. Skills are additive — no breaking changes to existing behavior.

**File path:** `docs/proposals/010-skills-system.md`
