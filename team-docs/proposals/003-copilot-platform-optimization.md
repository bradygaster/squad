# Proposal 003: Copilot Platform Optimization

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-07  
**Status:** Approved — Deferred to Horizon  

---

## Executive Summary

Squad is **well-positioned** for the Copilot platform. Our architecture — spawning agents via the `task` tool, using filesystem-backed memory, parallel execution — already exploits core Copilot capabilities. But we're missing opportunities in **predictive work**, **speculative execution**, and **agent-to-agent handoffs** that would make Squad a flagship demonstration of what Copilot can do.

This proposal identifies three optimization categories:
1. **Already working well** — keep doing these
2. **Friction points** — where we fight the platform unnecessarily
3. **Missed opportunities** — Copilot features we're not leveraging

**Recommendation:** Stay independent (not a Copilot SDK product) but become the **best-in-class example** of building on Copilot. Optimize around the platform, not into it.

---

## 1. Current State: How Squad Uses Copilot Today

### ✅ What We're Doing Right

Squad already exploits several Copilot platform strengths:

#### **Agent Spawning via `task` Tool**
```markdown
agent_type: "general-purpose"
mode: "background"
description: "Ripley: Design REST API endpoints"
prompt: |
  You are Ripley, the Backend Dev on this project.
  YOUR CHARTER: {inlined charter.md}
  ...
```

**Why this works:** Each agent gets its own context window. The coordinator stays lean (~1.9K tokens). Agents scale independently. This is the *right* pattern for Copilot.

#### **Filesystem-Backed Memory**
- `decisions.md` — shared brain, all agents read
- `history.md` — per-agent learnings, append-only
- `log/` — session archive, searchable

**Why this works:** Copilot agents have full filesystem access. Squad leverages this instead of inventing a custom memory API. Knowledge persists across sessions and survives git clone. No cloud dependency.

#### **Parallel Execution (Background Mode)**
```javascript
// Coordinator spawns 4 agents simultaneously
task(agent_type: "general-purpose", mode: "background", ...)
task(agent_type: "general-purpose", mode: "background", ...)
task(agent_type: "general-purpose", mode: "background", ...)
task(agent_type: "general-purpose", mode: "background", ...)
```

**Why this works:** Copilot's `task` tool supports `mode: "background"`. Squad defaults to this and chains follow-ups immediately. Pipeline stays full.

#### **Drop-Box Pattern for Concurrent Writes**
```
.ai-team/decisions/inbox/
├── ripley-auth-choice.md
├── dallas-api-design.md
└── parker-test-strategy.md
```

Scribe merges to canonical `decisions.md`. No file conflicts.

**Why this works:** Avoids the classic shared-file race condition. Agents can write decisions simultaneously without waiting for locks.

---

## 2. Friction Points: Where We Fight the Platform

### ❌ **Inline Charter Pattern**

**Current:** Coordinator reads each agent's `charter.md` and pastes it into the spawn prompt.

```javascript
// Coordinator does this:
1. view(.ai-team/agents/ripley/charter.md)
2. Copy contents
3. Paste into prompt string
4. Call task(..., prompt: "YOUR CHARTER:\n{pasted_contents}\n...")
```

**Why this is friction:** 
- Adds a tool call to every spawn (slows launch)
- Coordinator context grows with charter size
- If charters evolve, we're copy-pasting updated text

**Platform feature we're ignoring:** Copilot agents can read files at spawn time via the `view` tool. The agent should read its own charter.

**Fix:**
```javascript
// Better: Agent reads its own charter
prompt: |
  You are Ripley, the Backend Dev on this project.
  
  Read .ai-team/agents/ripley/charter.md — this is your identity and role.
  Read .ai-team/agents/ripley/history.md — this is what you know about the project.
  Read .ai-team/decisions.md — these are team decisions you must respect.
  
  **Requested by:** {current_user}
  INPUT ARTIFACTS (authorized to read):
  - {file paths}
  
  {message}
```

**Impact:** Faster spawns, smaller coordinator context, agents own their identity files.

---

### ❌ **Scribe Always Spawned After Work**

**Current:** After every batch of agents complete, Squad spawns Scribe to merge decisions and log the session.

**Why this is friction:**
- Scribe waits for *all* agents to finish before starting
- Decisions sit in the inbox until Scribe runs
- Session log is retroactive, not live

**Copilot feature we're ignoring:** Background agents run concurrently. Scribe could run *during* the work.

**Fix:** Spawn Scribe **with the work agents**, not after.

```javascript
// Current (serial)
spawn(frontend, backend, tester) → wait → spawn(scribe)

// Better (parallel)
spawn(frontend, backend, tester, scribe) → all run together
```

Scribe watches the inbox, merges decisions as they arrive, logs in real-time.

**Impact:** Decisions propagate faster. Session log is live. One fewer round-trip.

---

### ❌ **No Speculative Agents**

**Current:** Squad spawns agents only when confident they're needed.

Example: User says "Add OAuth support."
- Squad spawns Lead (architecture decision)
- *Waits* for Lead to finish
- *Then* spawns Backend (implementation)

**Why this is friction:** The tester agent *knows* OAuth will need test cases. But they wait. The docs agent *knows* OAuth needs API docs. But they wait.

**Copilot feature we're ignoring:** Background agents are cheap. Failed speculative work costs little.

**Fix:** Spawn tester + docs agent immediately, even before architecture decision.

```javascript
// Current
Turn 1: spawn(lead, mode: "sync")
Turn 2 (after lead): spawn(backend, frontend)

// Better — speculative execution
Turn 1: spawn(lead, mode: "sync") + spawn(tester, mode: "background") + spawn(docs, mode: "background")
// Tester writes OAuth test scenarios from known OAuth flows
// Docs agent drafts OAuth endpoint docs from RFC patterns
// Even if Lead changes the approach, 70% of the work is reusable
```

**Impact:** More aggressive parallelism. Less idle time. Demonstrates Copilot's async power.

---

## 3. Opportunities: Copilot Features We're Not Leveraging

### 🎯 **Predictive Agent Spawning**

**What Squad does now:** Reacts to explicit user requests.

**What Copilot enables:** Coordinator can predict next steps and launch agents proactively.

**Example:**

```
User: "The login form is done."

Current Squad response:
✓ Logged by Scribe

Better Squad response:
✓ Logged by Scribe
🧪 Hockney (Tester): I wrote integration tests for the login flow (proactive)
📚 (Docs agent): I updated the authentication guide (proactive)
```

**How:** After any completion, Coordinator asks: "What's obviously next?" and spawns those agents in background mode without waiting for user confirmation.

**Risk:** Low. Users can ignore proactive work if not needed. But most of the time, it's exactly what they'd ask for next.

---

### 🎯 **Agent-to-Agent Handoffs**

**What Squad does now:** Agents complete, return to Coordinator, Coordinator decides next steps.

**What Copilot enables:** Agents can spawn other agents directly using the `task` tool.

**Example:**

```javascript
// Current flow (3 turns)
User → Coordinator → Agent A → Coordinator → Agent B

// Possible with Copilot (2 turns)
User → Coordinator → Agent A → Agent B
                      ↳ spawns
```

An agent finishes work, sees a gap, spawns the right agent to fill it — no round-trip to Coordinator.

**Use case:**
- Backend agent finishes API endpoint, spawns Tester directly: "Write integration tests for POST /api/auth/login"
- Frontend agent encounters a design ambiguity, spawns Designer directly: "Specify button states for the submit action"

**Constraint:** Only senior agents (Lead, domain specialists) should have spawn authority. Don't let every agent spawn freely or we get recursion chaos.

**Implementation:**
1. Add `"spawn_authority": true` to charters for Lead, Backend, Frontend roles
2. In their charter: "If you complete work and identify an obvious follow-up task, you may spawn another agent using the `task` tool. Always set `mode: 'background'`. Always notify the Coordinator by writing to `.ai-team/orchestration-log/`."

**Impact:** Faster chaining. Demonstrates true multi-agent autonomy.

---

### 🎯 **Context Pre-Loading**

**What Squad does now:** Agents read `history.md` and `decisions.md` at spawn time (two `view` tool calls per agent).

**What Copilot enables:** Coordinator could pre-read these files *once* and inject them into spawn prompts for all agents in a batch.

**Example:**

```javascript
// Current (each agent reads independently)
Agent A: view(history.md) + view(decisions.md)
Agent B: view(history.md) + view(decisions.md)
Agent C: view(history.md) + view(decisions.md)
→ 6 tool calls total

// Optimized (Coordinator reads once, injects)
Coordinator: view(history.md) + view(decisions.md) → injects into all spawn prompts
Agent A, B, C: spawn with context pre-loaded
→ 2 tool calls total + 3 spawns
```

**Trade-off:** Larger spawn prompts, but fewer tool calls and faster agent startup.

**When to use:** For batch spawns (3+ agents at once). Not worth it for single agent spawns.

---

### 🎯 **Richer Spawn Descriptions**

**What Squad does now:**
```javascript
description: "Ripley: Design REST API endpoints"
```

**What Copilot UI could show:** Progress indicators, estimated scope, dependency chains.

**Opportunity:** The `description` parameter is what users see in the UI. Squad could make this more informative:

```javascript
description: "Ripley: Design REST API endpoints (blocking Parker's tests)"
description: "Dallas: Review architecture (needs approval before impl)"
description: "Parker: Write OAuth test cases (speculative, may need revision)"
```

Users get better visibility into what's happening and why.

---

## 4. SDK Assessment: Should Squad Become a Copilot SDK Product?

### **Short answer: No. Not yet.**

Here's why:

#### **What the Copilot SDK Would Give Us**
1. **Formalized agent lifecycle hooks** (onSpawn, onComplete, onError)
2. **Built-in memory primitives** (SDK-managed state, not filesystem)
3. **Agent discovery/registry** (programmatic roster management)
4. **Streaming responses** (real-time agent output to user)

#### **What We'd Lose**
1. **Filesystem-backed memory** — our killer feature. Everything is git-cloneable, human-readable, debuggable.
2. **Independence** — we can evolve faster than the SDK. If the SDK changes, we're not blocked.
3. **Transparency** — users see exactly how Squad works (it's just markdown files and task spawns). SDK abstracts this away.

#### **The Right Path: Stay Independent, Optimize Around Copilot**

Squad should be the **best example** of what you can build *on* Copilot without being *of* Copilot. That means:

- ✅ Use every Copilot feature that makes sense (`task` tool, `mode: "background"`, filesystem access, parallel execution)
- ✅ Demonstrate advanced patterns (speculative spawning, agent-to-agent handoffs, drop-box for concurrent writes)
- ✅ Stay simple and transparent (no SDK dependency, no custom APIs, just files and markdown)
- ❌ Don't reinvent what Copilot already provides (use `task` tool, not a custom subprocess manager)
- ❌ Don't fight the platform (if Copilot has a feature, use it instead of working around it)

**When to reconsider SDK adoption:**
- If the Copilot SDK adds **agent memory persistence primitives** that are better than filesystem (e.g., automatic conflict resolution, schema validation, query API)
- If GitHub releases **Copilot agent marketplace** features that require SDK integration
- If we hit hard limits with the `task` tool that the SDK solves (e.g., spawn quotas, context window exhaustion)

**Until then:** Independent product, platform-optimized implementation.

---

## 5. Recommendations: Concrete Next Steps

### **Phase 1: Remove Friction (High Impact, Low Risk)**

#### 1.1. Agents Read Their Own Charters
- **Change:** Remove inline charter paste from coordinator. Agents read `.ai-team/agents/{name}/charter.md` at spawn.
- **Impact:** Faster spawns, smaller coordinator context.
- **Effort:** 1 hour (update squad.agent.md spawn template).

#### 1.2. Spawn Scribe in Parallel
- **Change:** Launch Scribe with the work agents, not after.
- **Impact:** Decisions propagate faster, logs are real-time.
- **Effort:** 1 hour (change when Scribe is spawned).

#### 1.3. Better Spawn Descriptions
- **Change:** Add context to `description` parameter (e.g., "blocking", "speculative", "needs approval").
- **Impact:** Users get better visibility into agent work.
- **Effort:** 30 minutes (update coordinator prompt).

---

### **Phase 2: Enable Predictive Execution (Medium Impact, Medium Risk)**

#### 2.1. Speculative Agent Spawning
- **Change:** When user requests work, spawn *all* agents who might contribute (tests, docs, etc.), not just the primary implementer.
- **Impact:** Demonstrates Copilot's async power. More aggressive parallelism.
- **Risk:** Wasted work if speculative agents guess wrong. Mitigation: Make this opt-in via a setting or prompt keyword ("team, work ahead on...").
- **Effort:** 2 hours (update coordinator prompt + add speculative spawn logic).

#### 2.2. Proactive Follow-Up
- **Change:** After agents complete, coordinator immediately spawns obvious next steps without waiting for user request.
- **Impact:** Pipeline stays full. Less idle time.
- **Risk:** Users may feel Squad is "doing too much" without asking. Mitigation: Always label proactive work clearly ("🔮 Proactive: I wrote tests based on your API design").
- **Effort:** 1 hour (update coordinator post-work logic).

---

### **Phase 3: Enable Agent Autonomy (High Impact, High Risk)**

#### 3.1. Agent-to-Agent Handoffs
- **Change:** Senior agents (Lead, domain specialists) can spawn other agents directly using the `task` tool.
- **Impact:** True multi-agent autonomy. Demonstrates advanced Copilot patterns.
- **Risk:** Runaway spawning (agent A spawns B, B spawns C, C spawns A...). Mitigation: Strict spawn authority (only senior roles), require orchestration log entry, limit spawn depth.
- **Effort:** 4 hours (update charters for spawn-capable agents, add depth tracking, update orchestration log).

#### 3.2. Context Pre-Loading for Batch Spawns
- **Change:** Coordinator pre-reads `history.md` + `decisions.md` once and injects into all spawn prompts when spawning 3+ agents.
- **Impact:** Fewer tool calls, faster batch startup.
- **Risk:** Larger spawn prompts (may hit token limits on mature projects). Mitigation: Only use for batch spawns, fall back to agent-reads-itself for single spawns.
- **Effort:** 2 hours (add batch spawn detection + pre-load logic).

---

### **Phase 4: Visibility & Monitoring (Low Impact, High Value)**

#### 4.1. Spawn Cost Tracking
- **Change:** Log token usage per agent spawn in orchestration log (use Copilot's usage API if available).
- **Impact:** Users can see Squad's efficiency. We can optimize high-cost patterns.
- **Effort:** 2 hours (add token tracking to orchestration log).

#### 4.2. Agent Performance Metrics
- **Change:** Track agent spawn time, completion time, and output size. Surface in a dashboard or summary command.
- **Impact:** Identify slow agents or bottlenecks.
- **Effort:** 3 hours (add metrics collection + summary view).

---

## 6. Success Metrics

How do we know if these optimizations work?

| Metric | Current | Target (Post-Optimization) |
|--------|---------|---------------------------|
| **Avg spawn latency** | ~3-5 seconds (inline charter) | ~1-2 seconds (agent reads charter) |
| **Parallel agent utilization** | 60% (only spawn known-needed agents) | 85% (speculative + proactive spawns) |
| **Coordinator context usage** | 1.5% (1,900 tokens) | <1% (<1,300 tokens, no charter inlining) |
| **Time to first decision propagation** | After Scribe completes (serial) | During agent work (parallel Scribe) |
| **User-reported "Squad feels fast"** | Baseline | +30% improvement |

---

## 7. Open Questions

- **Q: Should we expose speculative spawning as a user-facing setting?**  
  A: Not initially. Start with Coordinator heuristics ("if request is broad, spawn speculatively"). Add a setting later if users want control.

- **Q: What's the spawn depth limit for agent-to-agent handoffs?**  
  A: Max depth = 2. Agent A can spawn Agent B, Agent B can spawn Agent C, but Agent C cannot spawn further. Prevents infinite recursion.

- **Q: How do we handle failed speculative work?**  
  A: Agents label speculative output clearly. If primary agent's decisions invalidate speculative work, we log it and move on. No retry. Cheap failure is the point.

- **Q: Should Squad use Copilot's `explore` agent for codebase questions?**  
  A: Yes. If a spawned agent needs to "search the codebase for X," they should use the `explore` sub-agent instead of grep/glob. Faster, more semantic.

---

## 8. Conclusion

Squad is already well-architected for Copilot. The core patterns — `task` tool spawning, filesystem memory, background parallelism — are solid. But we're leaving power on the table.

**The opportunity:** Make Squad the **flagship example** of what Copilot enables. Not by becoming a Copilot SDK product, but by being the best *demonstration* of building on the platform.

**Next step:** Start with Phase 1 (remove friction). Ship those changes. Then assess whether Phase 2/3 (predictive + autonomous execution) are worth the complexity.

**Strategic bet:** Copilot will evolve toward multi-agent orchestration. When it does, Squad should already be there — showing what's possible.

---

**Approved by:** bradygaster (partially — Phase 1 items folded into shipped features)  
**Implemented:** Partial — Phase 1 items (agents read own charters, Scribe in parallel, spawn descriptions) shipped in Waves 1-2. Phase 2-4 deferred to Horizon.  
**Retrospective:** [Pending]
