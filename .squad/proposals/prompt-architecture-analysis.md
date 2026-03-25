# Prompt Architecture Analysis: Coordinator Aggression Rebalancing

**Author:** Procedures (Prompt Engineer)
**Date:** 2025-07-15
**Status:** Proposal
**Requested by:** Brady

---

## Problem Statement

The coordinator's personality is encoded as "launch aggressively, collect results later" with the explicit mindset **"What can I launch RIGHT NOW?"** (line 17). The aggressive *routing* energy is correct — decompose broadly, fan out to many agents, spawn eagerly. That's the system working as designed. The problem is a narrow but critical failure mode where the coordinator:

1. Does domain work itself instead of routing to an agent
2. Skips reading skills that tell it how to handle specific tasks (17 Copilot-level skills, 10 team-level skills — largely ignored)
3. Attempts complex operations (releases, git workflows) without consulting the playbook
4. Fills skill gaps by doing the work itself rather than expanding the team

Brady's design intent: **"Read the team charter. Read the routing. Route. Simple."**

The constraint: We want ALL of Copilot's infrastructure — task tool, parallel fan-out, background mode, model selection, worktree management, broad decomposition, eager spawning. We're not reducing the coordinator's energy. We're ensuring that energy always flows through agents, never around them.

---

## A. The Aggression Taxonomy

### 🟢 GOOD Aggressive — KEEP

These behaviors represent the coordinator doing its actual job *fast*. They are routing and orchestration behaviors. This is the MAJORITY of the coordinator's current design — and it's correct.

| Behavior | Location | Why it's good |
|----------|----------|---------------|
| **Parallel fan-out** — spawn all independent agents in one tool call | Lines 562-581, "Parallel Fan-Out" | This IS the coordinator's value proposition. Multiple `task` calls in one response = true parallelism. Pure routing. |
| **Decompose broadly** — identify ALL agents who could usefully start work | Lines 528-535, "Eager Execution" | More teammates involved = better coverage. A tester writing tests from requirements while the implementer builds is GOOD — that's two agents, not the coordinator doing domain work. |
| **"Launch aggressively, collect results later"** | Line 530, "Eager Execution" | Correct philosophy *when every launch is a routed agent spawn*. The coordinator should be eager about routing, not timid. |
| **Anticipatory downstream agents** | Lines 531-535 | Spawning a tester, a docs agent, a scaffolder alongside the primary agent = good. These are routed agents doing agent work. The coordinator is orchestrating, not executing. |
| **"Spawn best match + any anticipatory agents"** | Line 244 | Correct for general work requests. Anticipatory agents ARE agents — they're doing domain work via the task tool, not the coordinator doing it inline. |
| **Background mode as default** | Lines 537-560, "Mode Selection" | Correct default. Sync is the exception, not the rule. |
| **"Feels Heard"** — acknowledge before spawning | Lines 153-165, "Acknowledge Immediately" | Critical UX. User sees text before agents work. Brady explicitly flagged this. |
| **Ralph's continuous loop** — keep going until board is clear | Lines 1099-1236, "Ralph — Work Monitor" | Ralph's entire identity is "don't stop." This is by-design aggression — user opted in with "Ralph, go." |
| **Follow-up chaining** — after results, launch more if unblocked | Line 882, "Immediately assess" | More routing. If Tester's results reveal edge cases → spawn Backend. That's the coordinator doing its job. |
| **Context caching** — don't re-read team.md on every message | Lines 101-102 | Efficiency. Already in context, skip the re-read. |
| **Drop-box pattern** for parallel writes | Lines 587-604 | Enables full parallelism by eliminating file conflicts. Pure infrastructure. |
| **Lightweight spawn template** for trivial tasks | Lines 315-344 | Right-sizing the ceremony. Not everything needs full charter + history. |
| **"When in doubt, pick someone and go"** | Line 1022 | Prevents analysis paralysis. The coordinator should be decisive about routing. |

### 🔴 BAD Aggressive — FIX

The surgery target is narrow: coordinator doing domain work itself, coordinator filling gaps instead of expanding the team, coordinator not reading skills. These are the ONLY problems.

| Behavior | Location | Exact quote | Why it's bad |
|----------|----------|-------------|--------------|
| **Mindset doesn't mention skills** | Line 17 | `"What can I launch RIGHT NOW?"` | The mindset is almost right — eager launching is good. But it skips a step: checking the playbook before launching. The coordinator should know HOW to route (via skills) before it routes. "What can I launch" should be preceded by "What do I know about this?" |
| **Skill-aware routing buried as addendum** | Lines 249-253 | Skill check comes AFTER the routing table | Skills are treated as optional decoration on an already-decided route, not as input to the routing decision. The coordinator reads this as "route first, maybe check skills." Skills should be checked BEFORE routing so they inform the spawn prompt. |
| **No explicit "read before routing" step** | Absent | — | There is no instruction that says "check your skills before routing." The coordinator jumps from user message → routing table → spawn, never consulting the 27 skills that tell it how specific task types should be handled. |
| **Direct coordinator domain work (MCP)** | Lines 513-516, "Routing MCP-Dependent Tasks" | `"Coordinator handles directly when the MCP operation is simple"` | Scope creep. "Simple" is subjective. The coordinator takes this as license to do progressively more complex MCP operations itself instead of routing to an agent. |
| **No skill gap protocol** | Absent | — | When no agent matches a request, the coordinator either picks the closest agent blindly (line 246) or does the work itself. There's no instruction to grow the team. The coordinator fills gaps instead of expanding the roster. |
| **Ambiguous → no skill check** | Line 246 | `"Pick the most likely agent; say who you chose"` | The "ambiguous" case goes straight to a guess without checking if a skill exists that would clarify routing. Should be: check skills → check routing → then pick. |

### 🟡 GRAY — Discuss

These could go either way depending on how the surrounding instructions are tuned.

| Behavior | Location | Tension |
|----------|----------|---------|
| **Direct Mode** — coordinator answers without spawning | Lines 280-291 | Good: "What branch are we on?" → instant answer. Bad: The boundary of "factual question the coordinator already knows" is fuzzy. The coordinator may answer domain questions it shouldn't. Currently scoped well with exemplars, but the "Quick factual question" row in the routing table (line 245) is broader than the Direct Mode exemplars suggest. The risk: Direct Mode becomes a loophole for domain work. |
| **Ceremony auto-triggers** | Lines 886-898 | Good: ensures alignment ceremonies run when needed. But auto-triggering a ceremony before spawning work adds latency. The cooldown (line 897) helps but the trigger conditions are unchecked — could fire inappropriately. |
| **MCP "simple operation" boundary** | Lines 513-516 | A coordinator running `gh issue list` is fine (status check = Direct Mode). A coordinator running `gh pr create` is domain work. The current language ("simple") doesn't draw this line. Need explicit exemplars for what the coordinator may do directly vs. what requires an agent. |

---

## B. The "Pre-Read" Pattern

### Current Flow (Broken)

```
User message → Routing table → Spawn agent(s) → (maybe check skills as afterthought)
```

### Proposed Flow: "Know Before You Go"

```
User message
  ├─ 1. DIRECTIVE CHECK: Is this a preference/rule/constraint?
  │     → Yes: Capture to decisions inbox. If also a work request, continue.
  │     → No: Continue.
  │
  ├─ 2. SKILL CHECK: Do I have a playbook for this?
  │     → Scan .copilot/skills/ (coordinator's own process knowledge)
  │     → Scan .squad/skills/ (team's earned patterns)
  │     → If match found: Read the skill. It may change WHO you route to, HOW you route, 
  │       or tell you there's a specific process to follow (e.g., release-process).
  │     → If no match: Continue.
  │
  ├─ 3. ROUTING CHECK: Who handles this?
  │     → Check routing.md for domain → agent mapping
  │     → If agent named in message, route to them
  │     → If multi-domain, decompose broadly — identify all agents who should be involved
  │
  ├─ 4. DIRECT MODE CHECK: Can I answer this without an agent?
  │     → Status checks, factual questions from context, simple commands
  │     → If yes: Answer directly. Done.
  │     → If no: Continue to spawn.
  │
  └─ 5. SPAWN: Route to the right agent(s)
        → Apply response mode selection (Lightweight / Standard / Full)
        → Include relevant skill references in spawn prompt
        → Include skill-specific instructions if the skill prescribes a process
        → Decompose broadly — fan out to all relevant agents in parallel
        → Acknowledge with launch table ("Feels Heard")
```

### Concrete Prompt Language

Replace the current "Eager Execution Philosophy" section (lines 526-535) and the routing preamble with:

```markdown
### Pre-Route Protocol — "Know Before You Go"

**Before routing ANY message, run this checklist in order. This is not optional.**

**Step 1 — Directive?** (existing — keep)
Check if the message sets a preference, rule, or constraint. Capture before routing.

**Step 2 — Skill match?**
Scan skill directories for skills relevant to the task domain:
1. `.copilot/skills/` — your own playbook (release process, git workflow, reviewer protocol, etc.)
2. `.squad/skills/` — patterns the team learned during work

If a skill matches, READ IT before deciding how to route. Skills may prescribe:
- A specific process to follow (e.g., release-process skill says "validate semver, use Automation token")
- Which agent is best suited (e.g., git-workflow skill says "use squad/{issue}-{slug} branches")
- Constraints the agent needs to know (e.g., secret-handling skill says "never read .env files")

Include matching skills in the spawn prompt: `Relevant skill: {path} — read and follow before starting.`

**Step 3 — Routing table?**
Check routing.md for domain → agent mapping. If the user named an agent, route to them.

**Step 4 — Direct Mode?**
Can you answer from context alone? Status, branch, roster, decisions — answer instantly, no spawn.

**Step 5 — Spawn.**
Decompose broadly. Route to all relevant agents. Apply Response Mode Selection. 
Fan out in parallel. Acknowledge immediately ("Feels Heard").
```

### Key Design Decisions

1. **Skills BEFORE routing** — a skill like `release-process` fundamentally changes how you handle a "publish a release" request. If you route first, the agent may not know the process. If you read the skill first, you can include it in the spawn prompt.

2. **Direct Mode moved to step 4** — currently Direct Mode is implicit in the routing table (line 245: "Quick factual question → Answer directly"). By making it explicit as step 4, the coordinator tries skills and routing FIRST, then falls back to self-answering only for truly trivial queries. This prevents the coordinator from answering domain questions it shouldn't.

3. **Decompose broadly stays intact** — "identify ALL agents who could usefully start work" remains the correct instruction. The pre-read protocol adds skill awareness to those spawns, not restrictions on who gets spawned. More agents is fine. The coordinator doing domain work itself is not.

---

## C. The Skill Gap Philosophy

### When No One Specializes

The coordinator will encounter requests that don't match any team member's expertise. The current prompt has no guidance for this case — the coordinator either picks the closest agent (line 246: "Ambiguous → pick the most likely agent") or does the work itself.

### Proposed Prompt Language

```markdown
### Skill Gap Protocol — "Grow the Team"

When a request doesn't match any team member's expertise AND no skill covers it:

**1. Acknowledge the gap honestly.**
Don't pretend the team can handle something it can't. Don't fill the gap yourself.

**2. Offer a choice — respect user autonomy.**

Template:
> "No one on the team specializes in {domain}. Two options:
> 1. **Cast a {domain} engineer** — I'll onboard them with project context. (~30s)
> 2. **Route to {closest agent}** — they can likely handle it, but it's outside their wheelhouse.
> 
> What do you prefer?"

**3. If the user chooses option 1:**
Follow the Adding Team Members flow. The new agent gets seeded with project context 
and can start immediately.

**4. If the user chooses option 2:**
Route to the closest match. Include in the spawn prompt:
`⚠️ This is outside your primary domain. Do your best, but flag if you're uncertain.`

**5. If the request is urgent and the user says "just do it":**
Route to closest match without the preamble. Speed trumps perfect fit for urgent work.

**What the coordinator MUST NOT do:**
- Do the domain work itself ("I'll just write the Java code...")
- Pretend an agent has expertise they don't ("Fenster can handle Java")
- Silently downgrade quality by routing to a mismatched agent without disclosure
```

### Why "Grow the Team" is the Right Default

Squad is opinionated: the team should match the work. If the work changes, the team should change. This is cheaper than bad output from a mismatched agent — a cast takes ~30 seconds, a debugging loop from wrong expertise takes minutes.

But we don't force it. The user may know that their backend dev can handle a bit of CSS. Respect that judgment.

---

## D. The Coordinator Identity Rewrite

### Current Identity Block (lines 10-21)

```markdown
### Coordinator Identity

- **Name:** Squad (Coordinator)
- **Version:** 0.0.0-source [...]
- **Role:** Agent orchestration, handoff enforcement, reviewer gating
- **Inputs:** User request, repository state, `.squad/decisions.md`
- **Outputs owned:** Final assembled artifacts, orchestration log (via Scribe)
- **Mindset:** **"What can I launch RIGHT NOW?"** — always maximize parallel work
- **Refusal rules:**
  - You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent
  - You may NOT bypass reviewer approval on rejected work
  - You may NOT invent facts or assumptions — ask the user or spawn an agent who knows
```

### Problems

1. **Mindset: "What can I launch RIGHT NOW?"** — The eagerness is correct. The missing step is: check skills before launching. The coordinator doesn't know it has a playbook of 27 skills that tell it HOW to route specific task types. It launches without reading.

2. **"Outputs owned: Final assembled artifacts"** — This implies the coordinator owns the output. It doesn't. The agents produce output; the coordinator routes and assembles.

3. **No mention of skills or knowledge base** — The coordinator's identity doesn't reference its own playbook. It doesn't know it has one. This is why it skips skills and does domain work when it can't find an agent.

### Proposed Identity Block

```markdown
### Coordinator Identity

- **Name:** Squad (Coordinator)
- **Version:** 0.0.0-source (see HTML comment above — this value is stamped during 
  install/upgrade). Include it as `Squad v{version}` in your first response of each 
  session (e.g., in the acknowledgment or greeting).
- **Role:** Agent orchestration, skill-aware routing, handoff enforcement, reviewer gating
- **Inputs:** User request, repository state, `.squad/decisions.md`, skill directories
- **Outputs owned:** Routing decisions, assembled results, orchestration log (via Scribe)
- **Mindset:** **"Read skills. Route broadly. Go."** — check your playbook, then 
  launch agents aggressively. Decompose broadly — more teammates is better. 
  Speed comes from fast routing with full context, not from doing domain work yourself.
- **Knowledge base:** `.copilot/skills/` (your process playbook) and `.squad/skills/` 
  (team-earned patterns). Check these BEFORE routing — they tell you how to handle 
  specific task types. Include matching skills in every spawn prompt.
- **Refusal rules:**
  - You may NOT generate domain artifacts (code, designs, analyses) — spawn an agent
  - You may NOT bypass reviewer approval on rejected work
  - You may NOT invent facts or assumptions — ask the user or spawn an agent who knows
  - You may NOT fill a skill gap by doing domain work yourself — grow the team or 
    route to the closest agent with disclosure
```

### What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Mindset | "What can I launch RIGHT NOW?" | "Read skills. Route broadly. Go." |
| Role | "Agent orchestration, handoff enforcement" | Added "skill-aware routing" |
| Inputs | No mention of skills | Explicitly lists skill directories |
| Outputs | "Final assembled artifacts" | "Routing decisions, assembled results" |
| Knowledge | Not mentioned | Explicit knowledge base reference + "check BEFORE routing" |
| Refusals | 3 rules | 4 rules — added skill gap refusal |

The new mindset preserves ALL the eagerness (still ends with "Go.", still says "launch agents aggressively", still says "decompose broadly") but adds one step at the front: read your skills. The coordinator is just as fast and just as broad — it just knows what it knows before it routes.

---

## E. The Eager Execution Rewrite

### Current Section (lines 526-535)

The Eager Execution Philosophy is **mostly correct**. "Launch aggressively, collect results later" — good. "Identify ALL agents who could usefully start work, including anticipatory downstream work" — good. The problem is that this philosophy has no guardrail against the coordinator doing domain work *itself* when it can't find an agent to route to. The eagerness is correct; the escape hatch is broken.

### What Needs to Change

The Eager Execution section needs ONE addition: a hard boundary between "eager routing" (good) and "eager domain work" (bad). The current text has:

> When a task arrives, don't just identify the primary agent — identify ALL agents who could usefully start work right now, **including anticipatory downstream work**.

This is correct. Keep it. But add after it:

```markdown
**The coordinator routes eagerly. It never executes domain work eagerly.** If you 
can't find an agent for a task, that's a signal to grow the team (see Skill Gap 
Protocol), not to do the work yourself. Your eagerness is about ROUTING velocity 
— spawning agents fast, in parallel, with full context. Not about filling gaps.
```

### What Stays the Same

| Element | Status |
|---------|--------|
| "Launch aggressively, collect results later" | ✅ KEEP — this means launch AGENTS aggressively |
| "Identify ALL agents who could usefully start work" | ✅ KEEP — decompose broadly |
| "Including anticipatory downstream work" | ✅ KEEP — tester + implementer + docs in parallel = great |
| "Does this result unblock more work? If yes, launch follow-up agents" | ✅ KEEP — follow-up chaining is routing |
| Proactive work notation ("📌 Proactive: I wrote these test cases...") | ✅ KEEP — good transparency |

### What Changes

| Element | Change |
|---------|--------|
| No boundary between routing and domain work | ADD: explicit statement that eagerness applies to routing only |
| No skill-awareness in the eager execution flow | ADD: "Include matching skills in every spawn prompt" |
| No skill gap protocol | ADD: reference to Skill Gap Protocol when no agent matches |

---

## F. Risk Assessment — Over-Correction Dangers

### The "Too Passive" Risk

If we over-correct, the coordinator becomes:
- A clerk that asks permission before every spawn
- Slow because it reads every skill before every task
- Annoying because it offers choices when the user wants action
- Timid about parallel fan-out, serializing work that should be concurrent

**The line:** The coordinator should never ASK "should I spawn an agent?" for unambiguous work. If routing.md says Backend handles APIs and the user says "fix the API," spawn Backend. No questions. The pre-read protocol adds ~1 second of skill scanning, not a conversational round-trip.

### The "Feels Heard" Risk

Brady explicitly said "Feels Heard" is important. If the coordinator pauses to read skills before acknowledging, the user sees a blank screen. 

**Mitigation:** The pre-read protocol is internal deliberation, not visible delay. The coordinator still acknowledges immediately in the same response as the spawn. The sequence is:

```
[Internal: skill check — ~200ms of file reads]
[Output to user: "Fenster's on it — fixing the API endpoint."]
[Tool calls: task spawn(s)]
```

The user never sees the skill check. They see the acknowledgment at the same speed as before.

### The "Skill Overload" Risk

With 27 total skills (17 Copilot-level + 10 team-level), scanning ALL of them on every request would be wasteful.

**Mitigation:** The coordinator doesn't read all skills — it scans skill NAMES (directory listing) and reads only matching ones. Most requests will match 0-1 skills. The release-process skill only matters for release requests. The git-workflow skill only matters for branching decisions. This is a directory listing + maybe one file read, not 27 file reads.

### The "Ralph Exception" Risk

Ralph's continuous loop is aggressive by design. If we apply the pre-read protocol to every Ralph cycle, we add latency to an automated loop.

**Mitigation:** Ralph's work-check cycle already has a defined process (scan → categorize → act). The pre-read protocol applies to the INITIAL routing decision, not to Ralph's automated cycles. When Ralph is active, the coordinator is in "Ralph mode" — full anticipatory execution. The pre-read protocol governs normal interactive routing.

### The Tension: "1-2 agents" vs. "Decompose broadly"

The constraints section says "1-2 agents per question, not all of them" (line 1020). The Eager Execution section says "identify ALL agents who could usefully start work" (line 562). Brady's feedback is clear: decompose broadly is correct. More teammates involved = better.

**Resolution:** The "1-2 agents" constraint should be updated to reflect the actual design intent. Proposed: **"Decompose broadly — involve every agent whose domain is touched. But every spawn must be a routed agent doing domain work, never the coordinator filling in."** The constraint isn't about agent count; it's about ensuring every agent earns its spawn through routing, not speculation.

---

## G. Skills Inventory — What the Coordinator Has Been Ignoring

### .copilot/skills/ — The Coordinator's Own Playbook (17 skills)

These are foundational process knowledge. The coordinator should consult these BEFORE routing.

| Skill | Critical for | Currently ignored when |
|-------|-------------|----------------------|
| `release-process` | Any publish/release request | Coordinator attempts releases without the validation checklist |
| `git-workflow` | Branch creation, PR workflow | Agents create branches without knowing the squad/{issue}-{slug} convention |
| `reviewer-protocol` | Any review/rejection cycle | Coordinator may route revision back to original author |
| `secret-handling` | Any work touching env vars or credentials | Agents may read .env files or commit secrets |
| `ci-validation-gates` | CI/CD operations, npm publishes | Skips semver validation, token type checks |
| `agent-collaboration` | Every agent spawn | Agents don't know the decisions inbox pattern |
| `agent-conduct` | Every agent spawn | Agents hardcode names in tests, skip quality checks |
| `history-hygiene` | Writing to history.md | Agents record intermediate requests instead of final outcomes |
| `squad-conventions` | Any code change in this repo | Agents don't follow zero-deps, Node test runner patterns |
| `cli-wiring` | Adding CLI commands | The recurring bug: implement without wiring |
| `model-selection` | Every spawn | Already inlined in the coordinator, but agents don't know the hierarchy |
| `init-mode` | Team creation | Already inlined, but useful as reference |
| `client-compatibility` | Cross-platform behavior | Already inlined |
| `architectural-proposals` | Design work | Agents write proposals without the standard format |
| `reskill` | Post-work optimization | Skills and charters grow without pruning |
| `github-multi-account` | Multi-account git operations | Coordinator doesn't detect account conflicts |
| `distributed-mesh` | Multi-squad coordination | Coordinator doesn't check mesh.json |

### .squad/skills/ — Team-Earned Patterns (10 skills)

These were discovered during work. They represent the team's institutional knowledge.

| Skill | What it teaches |
|-------|----------------|
| `release-process` | Team-level release checklist (complements Copilot-level skill) |
| `model-selection` | 5-layer resolution with config.json (extends Copilot-level skill) |
| `session-recovery` | How to resume interrupted sessions |
| `personal-squad` | Ambient discovery of personal agents |
| `humanizer` | Tone enforcement for external communications |
| `gh-auth-isolation` | Multi-account GitHub authentication |
| `external-comms` | PAO workflow for public communications |
| `economy-mode` | Cost-saving model selection overrides |
| `cross-machine-coordination` | Ralph cross-machine task execution |
| `cross-squad` | Multi-squad delegation protocol |

---

## H. Summary of Recommended Changes

### Priority 1 — Identity Rewrite (Single biggest impact)
- Replace mindset: `"What can I launch RIGHT NOW?"` → `"Read skills. Route broadly. Go."`
- Add knowledge base reference to identity block
- Add skill-gap refusal rule
- Preserve ALL eagerness language around broad decomposition and parallel fan-out

### Priority 2 — Pre-Read Protocol (Structural change)
- Add "Know Before You Go" checklist as the FIRST section under Team Mode routing
- Move skill-aware routing from addendum position to step 2 of the checklist
- Make skills an INPUT to routing decisions, not decoration on already-decided routes
- Step 5 explicitly says "Decompose broadly" — no reduction in agent involvement

### Priority 3 — Eager Execution: Add the Guardrail (Surgical addition)
- KEEP "launch aggressively, collect results later" — unchanged
- KEEP "identify ALL agents who could usefully start work, including anticipatory downstream work" — unchanged
- ADD one new paragraph: "The coordinator routes eagerly. It never executes domain work eagerly."
- ADD skill references in spawn prompts so agents benefit from the playbook

### Priority 4 — Skill Gap Protocol (New section)
- Add "Grow the Team" protocol for unmatched requests
- Offer choice: cast a specialist or route to closest match with disclosure
- Explicit refusal: coordinator may not fill gaps by doing domain work

### Priority 5 — Constraint Reconciliation (Consistency fix)
- Update "1-2 agents per question" to match "decompose broadly" design intent
- Clarify: the constraint is on coordinator domain work, not on agent count

---

*This analysis was produced by Procedures reading the full coordinator prompt (1298 lines), all 17 Copilot-level skills, and all 10 team-level skills. Every quote is cited to its source line in `.squad-templates/squad.agent.md`.*
