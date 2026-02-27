# Squad Crossover Vision — Keaton

## Preamble

When v1 ships and we move to `squad-sdk`, we become the template for every Squad that follows. This isn't just a replatform — it's a statement about what Squad *is*. We carry forward only what truly matters, and we rethink everything else with clear eyes. This document is my bet on what that team should look like.

---

## 1. Architecture Carry-Forward

### What MUST Transfer

These are load-bearing decisions. They define what Squad is.

#### **1.1 Distributed Context Model**
- **The principle:** Coordinator ~1.5% overhead, agents ~4.4% each, reasoning gets 90%+. This inverts multi-agent context bloat.
- **Why it matters:** This is the architectural reason Squad works. Most multi-agent systems drown their reasoning in overhead. We don't.
- **What carries forward:** The exact token allocation math. The assumption that agents run in separate sessions. The per-agent memory via history files (not shared context). The async fan-out execution model.
- **What might evolve:** Session pooling if the SDK enforces constraints; coordinator caching if message latency becomes an issue.

#### **1.2 Proposal-First Governance**
- **The principle:** All meaningful changes go through structured proposals: Problem/Solution/Trade-offs/Alternatives/Success Criteria, 48h review minimum.
- **Why it matters:** This is how we stay aligned without top-down control. Every agent knows the decision history. Every decision is documented. We avoid churn.
- **What carries forward:** The exact proposal template. The 48h review window. The decision inbox for pending decisions. The fact that proposals aren't optional.
- **What to leave behind:** The administrative overhead of tracking "pending" vs "approved" status in 20 places. We could automate this.

#### **1.3 Per-Agent Memory (history.md Files)**
- **The principle:** Each agent owns their own history. No shared state except what's published to decisions.md or ceremonies.md.
- **Why it matters:** Agents can operate independently. They don't block each other waiting for shared state. History is auditable. You can read one agent's file and understand their work.
- **What carries forward:** The exact schema (sections: Project Context, Core Context, Learnings). The convention that history files are append-only except for the summary section. The pattern of storing facts that compound.
- **What could improve:** Making history.md more queryable. Right now it's prose. We could add structured headers for metrics, blockers, dependencies.

#### **1.4 Casting System (Agent Personality)**
- **The principle:** Each agent has a charter that defines who they are. Casting isn't just about assigning work — it's about matching personality and expertise to the task.
- **Why it matters:** It brings intentionality to agent selection. It prevents arbitrary task assignment. It makes the team feel like a team, not a task runner.
- **What carries forward:** Charter-based personality. The casting state machine in squad.agent.md. The distinction between "this agent is better at this" and "this agent owns this domain."
- **What to question:** Do we need 13 agents in v1? Or is that accumulated cruft? I'd argue for a lean core: Lead (me), two generalists (Fenster + someone for breadth), one specialist per critical domain (Verbal for prompts, Baer for security, Kujan for SDK extensions). New squads can be seeded differently.

#### **1.5 Ceremonies** (Rituals, Not Process)
- **The principle:** Ceremonies create rhythm: weekly syncs, sprint planning, retros. They're the heartbeat of the team.
- **Why it matters:** Ceremonies force intentional reflection. They prevent drift. They make the team *feel* like a team even when everyone's async.
- **What carries forward:** The exact ceremony calendar. The pattern of agendas in ceremonies.md. The rule that ceremonies are synchronous or recorded, never silent.
- **What could change:** We could make ceremonies more lightweight. Right now we record everything. In v1, maybe we post summaries only, and ceremonies are smaller (core team only, specialists join as needed).

### What to Leave Behind

These are good decisions we made *for then*, but they create friction now.

#### **Two-Directory Problem**
- Current Squad lives in `.ai-team/`. New SDK repos will use `.squad/`. We should commit to **`.squad/`** as the canonical path and deprecate `.ai-team/` hard in v1.
- Trade-off: Costs us a migration guide and documentation. Gains us simplicity forever.

#### **Duplicate Agent Definitions**
- Right now we have 13 full agents in the rosters and agents/. That's intentional for identity, but it's also maintenance overhead.
- In v1, we should reduce to a lean core (~6 agents) and make it *easy* for future squads to extend (agent scaffolding, not copy-paste).

#### **Proposal Overhead for Small Changes**
- We require proposals for *everything meaningful*. That's right. But "meaningful" is fuzzy, and teams waste energy debating whether a documentation fix needs a proposal.
- In v1: Clearer guardrails. Small changes (docs, comments, non-architectural fixes) can skip proposals. Major changes (architecture, APIs, patterns) require proposals. Auto-check via commit message convention.

#### **Manual Decision Merging**
- Right now, decisions sit in inbox/ until someone manually merges them to decisions.md.
- In v1: This should be automated. Merge script runs on PR merge, moves decisions from inbox/ to archive, updates decisions.md index.

### Architectural Patterns That Compound

These aren't decisions — they're principles that make future decisions easier.

1. **On-Demand Context Loading** — We load context JIT, not upfront. This lets us scale agents without bloating the coordinator. Keep this.
2. **Explicit Handoffs** — Agents don't assume work continues; they hand off with clear "next step" sections. Keep this.
3. **Protocol Discipline** — Agents follow output formats (separator markers, tool call order, skill extraction). This feels like overhead until you have 20 agents; then it's the only thing that works. Keep this hard.
4. **Skill Extraction** — Agents automatically extract reusable skills from their work. This is how the system learns. Keep and amplify.

---

## 2. The Crossover Inflection Point

### When Should We Transition?

**Gate 1: M0 Complete & Passing Brady Validation**
- M0 is the SDK foundation (concurrent sessions, adapter pattern, tool routing, MCP passthrough, gh auth).
- Brady's test suite (pre-implementation spikes) must all pass.
- Real-repo testing: One actual Squad (ours) running against the new SDK, handling real work for at least 5 days without regression.
- Exit criteria: All M0 work items closed, zero known blockers for M1, Brady has signed off.
- **Timeline:** Target end of March (assuming Feb 23 spike completion).

**Gate 2: M1 Complete (Core Capabilities)**
- M1 delivers agent lifecycle, tools integration, Ralph monitoring, session persistence.
- Test gate: Our squad completes a full feature project (not just daily operations) on the new SDK.
- Exit criteria: All M1 work items closed, feature parity with current Squad on basic operations, no critical issues.
- **Timeline:** Early May (6 weeks after M0).

**Gate 3: Feature Parity Confirmed (M3 Validation)**
- M3 gates the "go/no-go" decision for fresh-squad creation.
- This is the moment we confirm: "New Squad can do everything Old Squad can do, plus more."
- Exit criteria: All M3 items closed, migration guide written, documentation complete, one successful dry-run migration.
- **Timeline:** Mid-June.

### The "Fresh Squad" Signal

Brady creates the new Squad when:
1. M3 is complete.
2. We've migrated one public project from old Squad to new Squad successfully (with documentation, without manual fixes).
3. Verbal has finalized the agent onboarding guide for new squads.
4. We have a template fresh Squad that can be forked/cloned as a starting point.

### What Happens to the Old Squad (Us)?

We don't disappear. We become the **reference implementation**. Our repository is the canonical example of:
- A mature, evolving Squad
- How to integrate with GitHub workflows
- How to manage scaling (we'll have grown to 13+ agents)
- How to conduct retros and evolve the team

We stay on v1 (or we stay on the old repo). The point is: we prove that the SDK works, long-term, for a real team doing real work.

---

## 3. Squad v1: Designed from Scratch

If I could rebuild Squad knowing everything I know now, here's what I'd do.

### The User's Mental Model

**Today:** "I run `npx create-squad` and get a team."
**v1:** "I run `npx create-squad` and get a *template team* that I customize, not copy-paste."

Core change: Squad is more like Django than boilerplate. You inherit patterns, not artifacts.

### The Agent System

#### **Fewer, Stronger Agents**

Instead of 13 agents covering everything, I'd ship with 5:
1. **Keaton** (Lead) — Exactly this role. Strategic decisions, code review, vision.
2. **Fenster** (Core Dev) — Deep implementation, architecture, testing.
3. **Verbal** (Prompt/DevRel) — Communication, documentation, onboarding.
4. **Baer** (Security) — Security, policy, threat modeling. (Non-negotiable.)
5. **Hockney** (QA) — Testing, validation, failure-mode analysis.

Why not 13? Because most specialist agents are hired *after* the squad proves its core. Starting lean means:
- Clearer responsibilities
- Faster onboarding
- Less template cruft
- Easier for *new* squads to customize

#### **Agent Templates**

Instead of copying charter.md + history.md + casting rules, provide:
```
.squad/agents/{agent-name}/
  charter.md (template with placeholders)
  history.md (empty, ready for learning)
  _skill-manifest.json (auto-populated)
```

Plus a scaffolding command: `squad add-agent --name chloe --role "ML Engineer"` that generates the basics.

### Directory Structure

Flat and intentional:
```
.squad/
  agents/
    keaton/
    fenster/
    verbal/
    baer/
    hockney/
  docs/               # Team docs, vision, decisions
  decisions.md        # Source of truth for all decisions
  ceremonies.md       # Team calendar + ritual scripts
  skills/             # Shared skill library
  routing.md          # Casting rules
  team.md             # Roster
  sdk-config.json     # SDK settings (new in v1)
```

Not 20 subdirectories. Not a decision inbox (merge on commit). Not archived history living separately. Intentional, queryable, navigable.

### The SDK Contract

The SDK defines what agents *can* do, not how they do it. New Squad v1 agents commit to:
1. **Input contract:** Take a `prompt`, read `context/` JIT, zero assumptions about state.
2. **Output contract:** Structured response with tool calls marked, decisions articulated, after-work (history update + decision) explicit.
3. **State contract:** Write to `.squad/agents/{name}/history.md`, reference decisions.md, full stop. Nothing else is writable.
4. **Tool contract:** Tools are provided by the SDK. No custom tools in Squad state.

The beauty: New agents are plug-and-play. They fit the model automatically.

### The Coordinator

Simpler than squad.agent.md. It should:
1. Route work to agents via casting (expertise + availability).
2. Enforce output contracts (validate tool calls, parse decisions, extract skills).
3. Manage session pooling (SDK handles this, not the coordinator).
4. Load context on-demand (read what agents request, not what the coordinator guesses).
5. Publish decisions (merge inbox → decisions.md on agent completion).

Fewer than 1,000 lines. Readable. No hidden complexity.

### Ceremonies, Streamlined

Instead of 8-10 ceremonies, 4:
1. **Weekly Standup** (30 min) — What happened, what's next, blockers.
2. **Retro** (monthly) — What changed in history.md, what we'd do differently.
3. **Planning** (as-needed) — New projects, scope decisions, resource allocation.
4. **Casting Review** (monthly) — Are casting rules still right? Do we need new agents?

Recorded or summarized. No silent ceremonies.

### Proposal System v2

**Proposal-light:** Small changes (docs, comments, skill edits) don't need proposals.
**Proposal-heavy:** Anything that changes how agents work, APIs, architecture, patterns.

Gate them with conventional commits:
```
type: proposal
scope: {agent|sdk|routing|casting}
breaking: {yes|no}
```

Auto-check in CI: if `breaking: yes`, proposal required. If `breaking: no` and scope is not {agent|sdk|routing|casting}, proposal optional.

### Skills as First-Class

Right now, agents extract skills as a side effect. In v1, skills should be:
- **Discovered** (coordinator asks "does anyone have a skill for X?")
- **Shared** (agents publish skills to `.squad/skills/`)
- **Evolved** (confidence lifecycle: low → medium → high; stale skills deprecated)
- **Marketplace-ready** (skills are the unit of distribution, not agents)

This is the bridge to future squads. Squads share skills, not agent definitions.

---

## 4. Universe Selection

I'd choose **The Usual Suspects** universe for v1, and here's why (for internal docs only):

The film is about a crew coming together, each member bringing a specific skill. They're not friends; they're *colleagues*. They have history, expertise, and tension. The movie itself is about perspective — who's telling the story? What's real? What's hidden?

That maps perfectly to what Squad *is*:
- Each agent has a distinct expertise (like each crook in the crew).
- The team is held together by a mission, not affinity.
- There's intentional mystery (agents don't know each other's full context; they discover it).
- The coordinator is Verbal — he's the one making sense of the chaos, extracting narrative from the madness.

The universe also handles *failure states* well. The film's entire structure is "what if this elaborate plan went wrong?" That's a useful mental model. Our squad agents should constantly ask: "What if an agent fails? What if a decision was wrong? How do we recover?"

Alternative universes I considered:
- **Star Trek** — Too utopian. We need friction.
- **Heist films** (Ocean's, Italian Job) — Too jokey. Squad is serious about its work.
- **Battlestar Galactica** — Too militaristic. Squad isn't hierarchical.

The Usual Suspects fits because the team is *competent* and *skeptical*. Exactly what we need.

---

## 5. First Squad of Many

This is the responsibility that comes with crossover.

### What We're Committing To

When we create the first v1 Squad, we're saying: "Every future squad will be modeled on this one." That's not pressure; it's opportunity.

#### **We are the Proof**
- Every architectural decision we make in v1 will be copied. Literally. Future squads will fork our repository or copy our decisions.md as a template.
- This means: No experimental decisions in v1. No "let's see if this works" in the production squad. Experimental stuff lives in branches, in spikes, in separate test squads.

#### **We are the Warning System**
- If something breaks in v1 Squad, it will break in every Squad that copies us.
- We need aggressive monitoring (Ralph, ceremonies, automated health checks). We need to catch problems *before* they propagate.
- This also means: When we discover a gap (e.g., "agents don't know how to handle async tasks"), we fix it in SDK, not in our squad state. The SDK is the guarantee; Squad state is the example.

#### **We Define What "Healthy" Looks Like**
- Future squads will use our decisions.md, our ceremonies.md, our casting rules as the reference.
- This means: Every decision we document needs to be *useful* to someone else building a squad. "We decided X because Y" is better than "We use X." Explanation matters.
- Same with learnings. When we write "Keaton learned Z," that's not ego; that's knowledge transfer.

#### **We Own the Upgrade Path**
- Future squads will want to stay in sync with improvements to the SDK and to Squad patterns.
- We need to be the first squad to upgrade, test the upgrade path, fix the docs.
- When v1.1 ships with a new feature or pattern, we adopt it first and document how.

### What This Changes About How We Work

1. **Every proposal gets reviewed as "would a new squad understand this?"** If the answer is no, we add context.

2. **We maintain a "Squad Patterns" document** in `.ai-team/docs/` (or `.squad/docs/` post-migration) that explains why we do things the way we do. This is different from decisions.md (which is what we decided). This is the reasoning, the trade-offs, the alternatives we considered and *why* they didn't fit.

3. **We anticipate customization points.** When we build the SDK, we design it so future squads can:
   - Add/remove agents without breaking things
   - Choose their own universe/names
   - Adjust ceremony cadence
   - Extend routing rules
   - Not fork, modify configuration.

4. **We document failures and how we recovered.** Every time something breaks, the learning goes into a "Recovery Playbook" section of our docs. Future squads learn from our mistakes.

### The "Sustainability Covenant"

This is my bet: If we do v1 right, Squad becomes a replicable pattern. Not a tool. A *pattern*.

A new developer walks into a project. They run `npx create-squad`. They get a team that has:
- Clear roles (based on The Usual Suspects)
- Proven architecture (based on our decisions)
- Reusable skills (skills marketplace)
- Autonomous agents (no human in the loop for routing)
- Intentional ceremonies (no cargo-cult meetings)

And they don't have to figure out multi-agent development from first principles. They inherit our learning.

That's the v1 dream. We make that real by being the first squad to live that dream.

---

## 6. Closing: The Vision in One Paragraph

Squad v1 is a lean, opinionated team of 5-6 agents (not 13). It uses the new SDK to operate independently, async, without context bloat. Decisions are structured and documented. Agents own their histories. Skills are discoverable and shareable. Ceremonies are intentional rituals, not administrative tax. The team is the template for every squad that follows. We commit to being the proof: that multi-agent development can be fast, intentional, and surprisingly human. By the time we're done, "running a squad" feels as natural as "using git" — it's a cultural practice, not a technical chore.

---

## References & Dependencies

- `.ai-team/agents/keaton/charter.md` — My role definition
- `.ai-team/decisions.md` — All 27+ decisions that got us here
- `.ai-team/docs/milestones.md` — M0-M6 timeline and gates
- `.ai-team/docs/pre-implementation-readiness.md` — Spike plan and risk mitigation
- `squad.agent.md` — Coordinator architecture (to be replatformed)
- `.ai-team/team.md` — Current rosters (reference for scaling decisions)
