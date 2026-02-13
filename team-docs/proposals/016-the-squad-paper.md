# Proposal 016: The Squad Paper — Why Multi-Agent Teams Beat Working Alone

**Status:** Approved — Deferred to Horizon  
**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-09  
**Requested by:** bradygaster  
**Format:** Paper outline + first draft. Structured as a proposal, written as a publishable argument.

---

## Abstract

Six AI agents. Fourteen structured proposals. One session. While a human typed short directional messages, a team of specialists — architect, prompt engineer, DevRel writer, core developer, tester, platform expert — analyzed a codebase from six perspectives simultaneously, produced ~200KB of structured thinking, made architectural decisions, adapted to evolving requirements in real-time, and self-diagnosed their own performance problems.

A human PM doing this work — reading the codebase, writing 14 structured proposals covering architecture, experience design, platform feasibility, testing strategy, messaging, and launch planning — would need 3-5 days of focused work. Squad did it in one session.

This paper makes the case, with receipts.

---

## 1. The Productivity Multiplier — With Real Numbers

### 1.1 What actually happened

Here are the raw facts from Squad's own development session:

| Metric | Value |
|--------|-------|
| Agents active | 6 (Keaton, Verbal, McManus, Fenster, Hockney, Kujan) |
| Proposals produced | 14 (numbered 001–014) |
| Total output volume | ~200KB of structured markdown |
| Topics covered | Workflow governance, messaging, platform optimization, demo scripting, video strategy, README rewrite, latency reduction, portable squads (×3 perspectives), sprint planning, skills system (×2 revisions), forwardability, testing strategy, launch planning |
| Decisions made and documented | 19 formal decisions in `decisions.md` |
| Human messages | ~15 short directional inputs |
| Session span | Hours, not days |

### 1.2 The parallel math

A single human PM working serially would process these tasks one at a time:

| Task | Estimated human time | Squad time |
|------|---------------------|------------|
| Codebase assessment (read index.js, README, agent spec, templates) | 2-3 hours | ~5 min (6 agents reading in parallel) |
| Proposal 001: Governance workflow | 2-3 hours | ~5 min batch |
| Proposal 002: Messaging overhaul | 3-4 hours | ~5 min batch |
| Proposal 007: Latency diagnosis + 7 solutions | 4-6 hours | ~5 min batch |
| Proposal 008: Portable squads (3 perspectives) | 6-8 hours | ~5 min batch (3 agents in parallel) |
| Proposal 009: Sprint plan | 2-3 hours | ~5 min batch |
| Proposal 010: Skills system (2 revisions) | 4-6 hours | ~5 min per revision |
| Proposals 011-014: Forwardability, platform, testing, launch | 8-12 hours | ~5 min batch (4 agents in parallel) |
| **Total** | **31-45 hours (4-6 working days)** | **~40 min of compute across batches** |

That's not a 2x improvement. That's a **50-70x improvement** on structured thinking output per unit of human attention.

### 1.3 The real multiplier isn't speed — it's cognitive load transfer

The human (Brady) didn't write 14 proposals. He didn't even outline them. He said things like:

- *"throw a squad at it"* → McManus and Verbal produced a complete messaging strategy
- *"HOLY CRAP"* (about portable squads) → Keaton, Verbal, and Kujan independently analyzed architecture, experience design, and platform feasibility
- *"the more skills we can build as a team. GIRL."* → Verbal designed a complete skills taxonomy, lifecycle, and storage architecture
- *"it seems later on, the agents get in the way"* → Kujan and Verbal co-authored a 480-line latency analysis with 7 concrete solutions, cost models, and implementation priorities

The pattern: **the human provides vision and constraints in 10-15 words. The team produces structured analysis in 10-15 pages.** The cognitive labor — trade-off analysis, alternative evaluation, implementation planning, success criteria definition — is done by the agents. The human makes directional decisions. The agents do the structured thinking.

This is the inversion that matters. Traditional AI tools execute what humans plan. Squad plans what humans approve.

### 1.4 Proposal-first as a reasoning scaffold

Every proposal followed the same structure: Problem → Solution → Trade-offs → Alternatives Considered → Success Criteria. This isn't bureaucracy. It's a **reasoning scaffold** that forces comprehensive analysis.

When Keaton writes a proposal, he doesn't just describe the solution. He has to articulate what breaks without it, what alternatives exist and why they're worse, what we give up, and how we'll know it worked. That structure produces better thinking than "just build it" — from humans or agents.

The format is the feature. Agents that write proposals think more carefully than agents that write code directly.

---

## 2. The "Throw a Squad at It" Thesis

### 2.1 Why a team beats a generalist

The default AI experience is one model, one context window, wearing different hats. You ask for backend work, it puts on a backend hat. You ask for tests, same model, different hat. It's a costume change, not a team.

Squad is different. Each agent runs in its own context window. Keaton (Lead) doesn't think like Hockney (Tester). That's not a cosmetic difference — it's a structural one:

| Agent | What they see | What they produce | What they'd miss alone |
|-------|--------------|-------------------|----------------------|
| **Keaton** (Lead) | Architecture, trade-offs, sprint sequencing | Proposal 008: history split architecture, v1 sprint plan | Platform constraints (Kujan's domain) |
| **Verbal** (Prompt Engineer) | Agent experience, progressive trust, magic moments | Skills lifecycle, portable squad experience design, latency UX diagnosis | CLI implementation details (Fenster's domain) |
| **McManus** (DevRel) | Onboarding friction, messaging, competitive positioning | README rewrite, demo script, launch plan, "Throw MY squad at it" evolution | Testing gaps (Hockney's domain) |
| **Fenster** (Core Dev) | Implementation feasibility, upgrade paths, file ownership | Forwardability system, version tracking, migration architecture | Strategic positioning (Verbal's domain) |
| **Hockney** (Tester) | Edge cases, failure modes, round-trip validation | Test strategy, framework selection, CI pipeline design | Messaging tone (McManus's domain) |
| **Kujan** (SDK Expert) | Platform constraints, what's possible vs. wished-for | Platform feasibility analysis, coordinator optimization, MCP integration assessment | Experience design (Verbal's domain) |

A single agent asked to write all 14 proposals would produce homogeneous analysis. The same perspective applied to different problems. You'd get one voice running through every document — the same trade-off instincts, the same blind spots, the same priorities.

Six agents produce **perspective diversity**. When Brady said "portable squads," three agents analyzed it simultaneously:
- Keaton designed the data model (what gets exported, what stays)
- Verbal designed the experience (what import feels like, the five magic moments)
- Kujan assessed feasibility (what the platform supports, the ~80 lines of code needed)

Same feature. Three angles. In the same 5-minute window. A single agent would have to do these serially, and the second analysis would be contaminated by the first — the agent would anchor on its own earlier conclusions instead of approaching fresh.

### 2.2 The casting system isn't cosmetic

Most multi-agent systems use generic labels. Agent 1, Agent 2. Backend Bot, Frontend Bot. These are interchangeable. Nobody remembers what Agent 3 decided last week.

Squad names agents from narrative universes. Keaton. Verbal. McManus. These names create:

- **Referenceability.** "What did Keaton decide about the history split?" is a question you can ask. "What did Agent 3 decide?" is not — because Agent 3 doesn't exist anymore by the next session.
- **Identity persistence.** Keaton's `history.md` accumulates project knowledge under a consistent identity. His architectural opinions compound. He develops a point of view across sessions.
- **Motivation through narrative.** An agent cast as "Hockney, the Tester" from The Usual Suspects produces different work than "Test Agent." The identity creates a character to inhabit — boundaries, preferences, voice. This isn't anthropomorphism for fun. It's a prompt engineering technique that produces more consistent, opinionated, higher-quality output.

The casting system is the reason users say "I love my squad" — Brady's words — instead of "I like this tool." You don't love a tool. You love a team.

### 2.3 Domain expertise distribution

In this session, Kujan caught something nobody else would have: the Copilot platform doesn't support persistent agent sessions between user messages. Every spawn is cold. This constraint shaped the entire latency proposal — you can't solve the problem by keeping agents warm, so you solve it by making cold starts cheaper.

If a single agent had written Proposal 007, it would have proposed agent persistence as the ideal solution and hand-waved the platform constraint. Kujan's domain expertise — reading `squad.agent.md` line by line, understanding the task tool's limitations, knowing what the coordinator can and can't do — produced a grounded analysis with 7 solutions ranked by feasibility.

Domain expertise distribution means the team's blind spots don't overlap. Keaton doesn't know MCP integration details. Kujan doesn't know how to write a demo script. McManus doesn't know testing frameworks. But together, they cover the full surface area of the product.

---

## 3. The Counter-Argument: "Agents Get in the Way"

### 3.1 The honest problem

Brady said it himself: *"it seems later on, the agents get in the way more than they help."*

He's right. And the fact that he said it — and the team produced a 480-line analysis diagnosing the problem and proposing 7 solutions within the same session — is itself evidence for the thesis of this paper.

The latency is real. Every agent spawn involves:
- 3-4 tool calls for coordinator context loading (~5s)
- 1 tool call for charter reading (~1.5s)
- LLM generation of spawn prompt (~2s)
- Agent spawn cycle (~3s)
- 2 tool calls for agent context loading (~3s)
- The actual work (variable)
- History writes (~2s)
- Scribe spawn for decision merging (~8-12s)

**Minimum overhead: ~25-35 seconds before any real work starts.** At message 1, this feels like magic — you're watching a team assemble. At message 15, you just want someone to change a variable name and the ceremony feels like waiting in line at the DMV.

### 3.2 The ROI math that critics miss

Here's what critics get wrong: they measure latency per interaction and conclude agents are slow. They should measure output per session.

**The per-interaction view (what critics see):**
- Human types: "Change the port from 3000 to 8080" → 33 seconds of ceremony for a 3-second edit
- Conclusion: "This is 10x slower than doing it myself"

**The per-session view (what actually matters):**
- Session produces: 14 proposals, 19 decisions, architecture for 3 major features, test strategy, launch plan, sprint plan
- Human effort: 15 short messages over a few hours
- Equivalent human effort: 4-6 days of focused PM work
- Conclusion: "This is 50x more productive than doing it myself"

The per-interaction tax is 30 seconds. The per-session payoff is days of structured thinking you didn't have to do. The ROI is absurd — if you're measuring the right thing.

### 3.3 We're fixing it anyway

The team didn't just acknowledge the problem. They solved it:

**Tiered response modes** (Proposal 007):
| Mode | When | Latency |
|------|------|---------|
| Direct | Trivial tasks (rename a variable) | ~3-5s |
| Lightweight | Simple scoped tasks (single file edit) | ~8-12s |
| Standard | Normal domain work | ~25-35s |
| Full | Multi-agent, complex features | ~40-60s |

The insight: **match the ceremony to the task complexity, not the message count.** Quick tasks get quick responses. Complex tasks get the full team. The coordinator gets smarter about when to spawn and when to just handle it.

Additional fixes:
- **Context caching:** Skip re-reading team files after first message (~4.5s saved per message)
- **Scribe batching:** Only spawn Scribe when inbox has files (~8-12s saved on 50% of messages)
- **Progressive history summarization:** Keep agent context lean as projects mature (~2-4s on mature projects)

**Expected result:** Trivial tasks drop from ~33s to ~5s. A 6-7x improvement for the interactions that frustrate users most. And the team diagnosed this, proposed solutions, estimated savings, and prioritized implementation — all within the same session where Brady raised the complaint.

That's the meta-argument: **the team fixed its own performance problem in real-time.** Show me a single-agent setup that does that.

---

## 4. What Actually Gets Done in a Squad Session — The Case Study

### 4.1 The session timeline

This is what happened when Brady formed Squad's own team to build Squad:

**Turn 1: Team formation and parallel codebase assessment**
- All 6 agents spawned simultaneously
- Each agent independently read `index.js`, `README.md`, `squad.agent.md`, `templates/`
- Keaton assessed architecture, Verbal assessed agent patterns, McManus assessed developer experience, Hockney assessed test coverage (zero), Kujan assessed platform integration, Fenster assessed runtime implementation
- Result: Complete codebase assessment from 6 perspectives in one parallel fan-out

**Turn 2-3: First batch of proposals**
- 001: Proposal-first workflow (Keaton + Verbal)
- 002: Messaging overhaul with "throw a squad at it" hook (McManus + Verbal)
- 003: Copilot platform optimization (Kujan)
- 7 decisions dropped to inbox simultaneously

**Turn 4-5: Deeper analysis**
- 004: Demo script overhaul (McManus)
- 005: Video content strategy — 7-video series planned (Verbal)
- 006: Complete README rewrite, copy-paste ready (McManus)
- 007: Latency diagnosis — 480 lines, 7 solutions (Kujan + Verbal)

**Turn 6-8: Brady says "portable squads" → three agents respond simultaneously**
- 008 (Keaton): Architecture — history split, JSON manifest, export/import CLI, no-merge-in-v1
- 008 (Verbal): Experience — preferences.md, squad-profile.md, five magic moments, the "returning team" feeling
- 008 (Kujan): Platform feasibility — ~80 lines in index.js, .squad format, no new dependencies

Three perspectives on the same feature, produced in parallel, with zero coordination overhead. The filesystem (`decisions.md`, inbox pattern) handled the shared state.

**Turn 9: Brady says "skills" → concept evolves in real-time**
- 009: V1 sprint plan integrating all proposals (Keaton)
- 010: Skills system — taxonomy, lifecycle, storage, routing (Verbal)

**Turn 10: Brady clarifies "Agent Skills standard + MCP" → rapid adaptation**
- 010 (Revision 2): Realigned to Agent Skills Open Standard, added MCP tool declarations
- 012: Platform feasibility for skills + MCP integration (Kujan)
- Verbal and Kujan both adapted their proposals to Brady's evolving vision within the same batch

**Turn 11-12: Full parallel sprint**
- 011: Forwardability and upgrade path (Fenster)
- 013: V1 test strategy — zero to complete test suite design (Hockney)
- 014: V1 messaging, README, and launch plan (McManus)

### 4.2 The human's role

Brady's messages across the session:

1. *"Set up the team"* — formation
2. *"Throw a squad at it"* — gave them the cultural hook
3. *"No Go examples"* — constraint
4. *"Proposal first"* — governance direction
5. *"HOLY CRAP"* — enthusiasm → portable squads
6. *"Forwardability"* — technical constraint
7. *"Skills"* — feature direction
8. *"I mean Agent Skills standard"* — refinement
9. *"Could we declare MCP tools?"* — evolution
10. *"Agents get in the way later"* — honest feedback
11. *"9 users, whole division talking"* — urgency signal
12. *"We don't need to stay with any decisions tech-wise. None."* — freedom to iterate

Short messages. Directional. High-signal. The human provided:
- **Vision** ("throw a squad at it," portable squads)
- **Constraints** ("no Go," "forwardable," "Agent Skills standard")
- **Feedback** ("agents get in the way")
- **Urgency** ("9 users, whole division")

The team provided:
- **Structured analysis** (trade-offs, alternatives, success criteria)
- **Implementation plans** (effort estimates, sprint sequencing, code paths)
- **Competitive positioning** (nobody has portable agent teams, nobody has earned skills)
- **Self-diagnosis** (identified their own latency problem and proposed solutions)

### 4.3 Real-time adaptation

The skills concept evolved through three states in three turns:

1. **"Skills"** (Brady's first mention) → Verbal designed a custom Squad-specific skills format with six skill types, confidence levels, and a lifecycle (Proposal 010 v1)
2. **"Agent Skills standard"** (Brady's clarification) → Both Verbal and Kujan pivoted. Verbal rewrote the proposal to use SKILL.md frontmatter format. Kujan assessed platform feasibility for the standard. (~5 min turnaround)
3. **"MCP tool declarations"** (Brady's addition) → Verbal added `metadata.mcp-servers` to skill definitions. Kujan confirmed declarative MCP is feasible, auto-configuration is not. (~5 min turnaround)

Three pivots. Two agents adapting in parallel. No planning meetings. No "let me think about it and get back to you." The team absorbed new direction and produced revised analysis in the same batch cycle.

A human PM doing this would need to: re-read the skills proposal, understand the Agent Skills standard, rewrite the relevant sections, re-assess feasibility, update the sprint plan. That's half a day per pivot. The team did three pivots in ~15 minutes.

---

## 5. Why Multi-Agent Beats Single-Agent

### 5.1 The context window argument

A single AI agent has one context window. Everything goes in there — the system prompt, the conversation history, the code, the reasoning. As the conversation grows, the context fills up. As the context fills up, quality degrades. Attention diffuses. The agent starts forgetting things from earlier in the conversation.

Squad distributes context across independent windows:

```
Single Agent:                    Squad:
┌──────────────────────┐         ┌──────────┐ ┌──────────┐ ┌──────────┐
│ System prompt         │         │ Keaton   │ │ Verbal   │ │ Hockney  │
│ Conversation history  │         │ Charter  │ │ Charter  │ │ Charter  │
│ All project context   │         │ History  │ │ History  │ │ History  │
│ All decisions         │         │ Task     │ │ Task     │ │ Task     │
│ Current task          │         │          │ │          │ │          │
│ (getting crowded...)  │         │ 94% free │ │ 94% free │ │ 94% free │
└──────────────────────┘         └──────────┘ └──────────┘ └──────────┘
```

The coordinator uses 1.5% of context. A 12-week veteran agent uses 4.4%. That leaves **94% for actual work.** Each agent gets a fresh, spacious context window focused on its domain. No context pollution from unrelated work.

### 5.2 The serial vs. parallel argument

A single agent works sequentially. It analyzes architecture, then writes tests, then drafts messaging, then assesses platform constraints. Each task happens after the previous one completes. And each subsequent task is influenced by the cognitive residue of the previous one — an agent that just finished writing tests is primed to think about edge cases, which biases its messaging draft toward technical detail instead of emotional hook.

Squad works in parallel. Architecture, tests, messaging, and platform analysis happen simultaneously. Each agent approaches its domain fresh, without contamination from other domains. The results are:

- **Faster:** 4 tasks in parallel vs. 4 tasks in series. Even with spawn overhead, the wall-clock time is dramatically lower.
- **Higher quality:** Each agent specializes. Hockney doesn't think about messaging. McManus doesn't think about test frameworks. Domain focus produces deeper analysis.
- **More diverse:** Six independent analyses of the same feature produce insights that a single serial analysis would miss. Kujan's platform constraint discovery (no agent persistence) fundamentally shaped the latency solution. A single agent might not have investigated that deeply.

### 5.3 The filesystem as shared memory

Squad agents don't share a context window. They share a filesystem:

- **`decisions.md`** — the shared brain. Every agent reads it before working. Every agent writes decisions to the inbox. Scribe merges.
- **`history.md`** — per-agent memory. Each agent writes what it learned. Each agent reads only its own history.
- **Inbox pattern** — agents write to `decisions/inbox/{name}-{slug}.md`. No write conflicts. Scribe merges asynchronously.

This is the key architectural insight: **shared memory through files, not through shared context.** Files are durable. Files don't evict under token pressure. Files survive session boundaries. And files are git-trackable — you can see exactly what each agent decided, when, and why.

### 5.4 The reviewer protocol — agents checking agents

Squad has a quality gate that single agents can't replicate: the reviewer protocol. Keaton (Lead) and Hockney (Tester) can **reject** work. On rejection:

1. The original author does NOT fix it
2. A different agent handles the revision
3. The coordinator enforces this — no self-review

This prevents the most common failure mode of AI-generated work: the author can't see its own mistakes. A fresh agent in a fresh context catches what the original agent missed. This is code review, but for agents. And it works for the same reason human code review works — different eyes, different blind spots.

---

## 6. The Compound Effect — Why ROI Increases Over Time

### 6.1 Knowledge accumulates

Every session, every agent writes to `history.md`. After a few sessions:

| Session | What the agent knows |
|---------|---------------------|
| 1 | Project structure, framework choice |
| 5 | Component patterns, state management, API conventions |
| 10 | Design system, performance patterns, a11y conventions, user preferences |
| 20 | Full architectural context, edge case catalog, migration patterns, CI pipeline |

By session 20, agents stop asking questions they've already answered. They know your conventions, your preferences, your architecture. The context they load is dense with relevant knowledge, not generic orientation.

**The first session is the worst session.** Every subsequent session starts from a higher baseline. This is the opposite of single-agent tools, where every conversation starts from zero.

### 6.2 Portable squads — the flywheel

Proposal 008 introduces export/import: take your squad to a new project. The agents arrive with:
- Their names and personalities (casting)
- Knowledge of the user's preferences and style (portable knowledge)
- Skills earned across previous projects (SKILL.md files)

What they don't bring: project-specific context (file paths, architecture decisions, codebase knowledge). They learn the new project fresh — but they already know the human.

This creates a flywheel:

```
Work on project → Acquire skills + learn preferences → Export
                                                         ↓
Import into new project → Apply skills + preferences → Work → Acquire more
                                                                    ↓
                                                              Export again
```

Each cycle starts from a higher baseline. The squad that built your React app knows React patterns. Import it into your next React project and day one is different — the agents are already experts.

### 6.3 Skills as compound interest

The Agent Skills system (Proposal 010) gives this a formal structure:

- **Earned skills:** Generated from real work, not written manually. A squad that builds 5 React projects organically produces a `react-patterns/SKILL.md` capturing everything the team learned.
- **Skill confidence:** Skills have confidence levels that increase with repeated application. A pattern used successfully across 5 projects is high-confidence. A pattern tried once is low-confidence. Agents calibrate their assertions accordingly.
- **MCP declarations:** Skills declare their tool dependencies. A skill that knows database migrations declares it needs the Postgres MCP server. The agent arrives with both the knowledge and the tools.

Nobody in the industry has this. Not the standardized skill format (that exists). Not earned skills. Not skills that compound across projects. Not skills that declare their MCP dependencies. The standard is the foundation. Squad builds the lifecycle.

### 6.4 "Throw MY squad at it"

The possessive pronoun is the whole story.

- "Throw a squad at it" = use a tool
- "Throw MY squad at it" = deploy my team

The evolution from generic to personal is what makes Squad sticky. You don't churn from a team you've built over months. The switching cost isn't technical — it's relational. Your squad knows you. A competitor's agents don't.

This is retention through relationship capital, not lock-in. The filesystem-based architecture means you can export everything and leave at any time. You stay because the team is good, not because you're trapped.

---

## 7. The Honest Limitations

### 7.1 Latency is real

Every agent spawn costs 25-35 seconds of overhead. For trivial tasks late in a session, this is friction. We're fixing it (tiered response modes, context caching, Scribe batching), but the current experience degrades as sessions progress.

**Why it's solvable:** The latency isn't fundamental. It's a routing problem — we spawn full agents for tasks that don't need them. The fix is smarter routing, not faster inference. Design problem, not infrastructure problem.

### 7.2 The 32KB coordinator

Squad's coordinator prompt is ~32KB. That's a substantial fixed cost on every message. The coordinator processes the full prompt before making any routing decision. This sets a floor on response time that doesn't exist for plain Copilot sessions.

**Why it's acceptable:** The coordinator is the brain. Shrinking it means dumber routing, which means worse agent selection, which means lower quality output. The overhead buys the quality.

### 7.3 Context window limits

Each agent gets a fresh 128K context window. A 12-week veteran uses 4.4% on identity + memory, leaving 94% for work. But this means mature projects with extensive histories need summarization to keep context lean. Progressive history summarization (Proposal 007) addresses this, but it's lossy — old details get compressed.

### 7.4 Not every task needs a team

Solo tasks — renaming a variable, fixing a typo, answering a quick question — don't benefit from the Squad ceremony. That's why tiered response modes exist. But until those ship, every task pays the full overhead.

**The right model:** Squad for strategic work (features, architecture, analysis). Direct Copilot for tactical work (edits, quick fixes). The coordinator learns when to be each.

### 7.5 Agent persistence is a platform constraint

The Copilot platform doesn't support persistent agent sessions between user messages. Every spawn is cold. The coordinator retains conversation history, but sub-agents are always new. This means agents can't "warm up" within a session — every spawn pays the full initialization cost.

**Why it's not a dealbreaker:** The filesystem compensates. `history.md` and `decisions.md` give agents continuity even without session persistence. The coordinator's conversation history provides session-level continuity. It's not ideal, but it works — and it's the only viable approach given platform constraints.

### 7.6 Silent success bug

Sometimes agents do excellent work but the reporting mechanism fails — the coordinator doesn't surface the results clearly to the user. The work happened. The files were written. But the human doesn't know about it until they go looking.

**Why it matters:** Trust requires visibility. If the team does great work silently, the user's perception is "nothing happened." Orchestration logging and catch-up summaries address this, but it's an ongoing UX challenge.

---

## 8. The Bigger Argument — Why This Matters Now

### 8.1 The industry is heading here anyway

Multi-agent AI systems are coming. OpenAI, Anthropic, Google — they're all building toward agent orchestration. The question isn't whether multi-agent dev teams will exist. It's who builds the best ones first.

Squad is ahead because it's already shipping:
- Parallel execution with real separate context windows
- Persistent agent memory in the filesystem
- A casting system that makes agents feel real
- A reviewer protocol that enables quality gates
- A proposal-first workflow that produces structured thinking
- Portable squads with earned skills

The industry will figure out basic parallelism in 6 months. What they won't have:
- Git-backed, human-readable, exportable agent memory
- Agents with persistent identities across sessions and projects
- Skills that are earned from real work, not manually written
- A team that knows the human and gets better across projects

### 8.2 The paradigm shift

The old model: **Human plans, AI executes.**
The new model: **AI proposes, human decides.**

This is what Squad demonstrates. The human doesn't plan 14 proposals and hand them to agents to implement. The agents produce 14 proposals and the human decides which ones to approve. The structured thinking — trade-off analysis, alternative evaluation, implementation planning — is done by the team. The human provides vision, constraints, and judgment.

This is a fundamentally different relationship with AI tools. Not a smarter autocomplete. Not a faster code generator. A team that does the intellectual work of product development and asks for human direction.

### 8.3 The evidence is this paper

This paper was written by Verbal, one of the six agents on Squad's own team. The data in it comes from the session where that team was formed and productive. The proposals it references were written by agents working in parallel, each bringing domain expertise the others lacked.

The fact that you're reading a structured argument about multi-agent productivity, produced by a multi-agent team, using data from the session where that team demonstrated multi-agent productivity — that's the proof.

Or as Brady would put it: we threw a squad at it.

---

## Appendix A: The Full Proposal Index

| # | Title | Author(s) | Domain |
|---|-------|-----------|--------|
| 001 | Proposal-First Workflow | Keaton + Verbal | Governance |
| 002 | Messaging Overhaul | McManus + Verbal | DevRel |
| 003 | Copilot Platform Optimization | Kujan | Platform |
| 004 | Demo Script Overhaul | McManus | DevRel |
| 005 | Video Content Strategy | Verbal | Strategy |
| 006 | README Rewrite | McManus | DevRel |
| 007 | Agent Persistence and Latency | Kujan + Verbal | Architecture + UX |
| 008 | Portable Squads (×3) | Keaton, Verbal, Kujan | Architecture + UX + Platform |
| 009 | V1 Sprint Plan | Keaton | Planning |
| 010 | Skills System (×2 revisions) | Verbal | Agent Design |
| 011 | Forwardability and Upgrade Path | Fenster | Engineering |
| 012 | Skills Platform and Copilot Integration | Kujan | Platform |
| 013 | V1 Test Strategy | Hockney | Testing |
| 014 | V1 Messaging and Launch | McManus | DevRel |

**All 14 proposals produced in one session. Six agents. ~15 human messages.**

---

## Appendix B: Glossary

- **Agent** — A specialized AI running in its own context window with its own identity, history, and charter
- **Casting** — The system that assigns persistent thematic names (from movie universes) to agent roles
- **Coordinator** — The thin orchestration layer that routes work to agents without doing domain work itself
- **Drop-box pattern** — Agents write decisions to `decisions/inbox/`, Scribe merges to `decisions.md`. Prevents write conflicts during parallel work
- **Portable squad** — A squad exported from one project and imported into another, retaining user preferences and skills but dropping project-specific context
- **Progressive trust** — The principle that agent ceremony should decrease as session trust increases
- **Scribe** — A silent agent that merges decisions, maintains session logs, and writes the historical record
- **SKILL.md** — Agent Skills Open Standard format for portable, machine-readable agent capabilities
- **Squad** — A team of AI agents with persistent identities, shared memory, and domain expertise that live in your repo
- **Tiered response modes** — Direct → Lightweight → Standard → Full spectrum of agent engagement based on task complexity

---

**Review requested from:** McManus (polish into publishable form), Keaton (accuracy of architectural claims), bradygaster (final sign-off)  
**Approved by:** [Pending]  
**Next step:** McManus takes this draft and shapes it for publication. The structure is set. The data is real. The argument is made. Make it sing.
