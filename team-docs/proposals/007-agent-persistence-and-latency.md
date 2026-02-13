# Proposal 007: Agent Persistence and Latency Reduction

**Authors:** Kujan (Copilot SDK Expert) + Verbal (Prompt Engineer)  
**Date:** 2026-02-08  
**Status:** Approved ✅ Shipped  
**Triggered by:**bradygaster — *"it seems later on, the agents get in the way more than they help"*

---

## The Problem

Brady nailed it: *"it seems you spin up each message, learn, decide, then spin down. that must be an expensive process."*

Every user message triggers a ceremony:

| Step | What happens | Cost |
|------|-------------|------|
| 1 | Coordinator reads `team.md`, `routing.md`, `registry.json` | 3 tool calls |
| 2 | Coordinator reads relevant agent's `charter.md` | 1 tool call |
| 3 | Coordinator constructs spawn prompt, calls `task` tool | LLM generation + spawn |
| 4 | Spawned agent reads its own `history.md` | 1 tool call |
| 5 | Spawned agent reads `decisions.md` | 1 tool call |
| 6 | Agent does the actual work | Variable |
| 7 | Agent writes to `history.md` and possibly `decisions/inbox/` | 1-2 tool calls |
| 8 | Coordinator collects results | 1 tool call (read_agent) |
| 9 | Scribe spawned to merge decisions | Full spawn cycle |

**Minimum overhead per interaction: 9-10 tool calls + 2 LLM spawn cycles before any real work starts.**

Early in a session this feels like magic — you watch a team assemble. By message 8, you just want someone to change a variable name and the 15-second ceremony feels like waiting in line at the DMV.

---

## 1. The Actual Cost Model

**Kujan's breakdown — where the time actually goes:**

### Tool calls are the dominant cost

Each tool call in the Copilot platform involves:
- An LLM turn to decide to make the call (~0.5-1s)
- The tool execution itself (filesystem reads: ~0.1s, `task` spawn: ~2-3s)
- An LLM turn to process the result (~0.5-1s)

So each `view` call costs ~1-2s of wall clock time. The coordinator's 4 reads (team.md, routing.md, registry.json, charter.md) cost **4-8 seconds** before any agent is even spawned. The spawned agent's 2 reads (history.md, decisions.md) add another **2-4 seconds** at the start of its lifecycle.

### LLM processing scales with context

The coordinator prompt (`squad.agent.md`) is ~32KB. Every message the coordinator processes requires the LLM to attend over this entire prompt. This is a fixed cost per turn — and it's not small.

When the coordinator then *generates* the spawn prompt (inlining the charter), it's doing generative work on top of comprehension work. Two expensive operations in sequence.

### Context loading grows over time

This is the "later in a session" killer:

| File | Day 1 | Week 4 | Week 12 |
|------|-------|--------|---------|
| `history.md` (per agent) | ~500 tokens | ~2,000 tokens | ~5,600 tokens |
| `decisions.md` | ~200 tokens | ~1,500 tokens | ~4,000 tokens |
| Agent spawn prompt | ~1,500 tokens | ~1,500 tokens | ~1,500 tokens |
| **Total context load per spawn** | **~2,200 tokens** | **~5,000 tokens** | **~11,100 tokens** |

By week 12, every agent spawn burns 11K tokens just on memory loading. With 128K context, that's 8.7% — still manageable in absolute terms, but the LLM processing time scales superlinearly with context size. Longer inputs = slower attention = slower first-token.

### The Scribe tax

Scribe spawns after every batch. That's a full `general-purpose` agent spawn (~2-3s) to merge what are often 0-1 inbox files. On interactions where no decisions were made, Scribe does literally nothing useful — but still costs a full spawn cycle.

### Compound latency math

Best case (single agent, simple task):
```
Coordinator reads (4 tools)     ~5s
Coordinator generates prompt     ~2s
Agent spawns                     ~3s
Agent reads (2 tools)            ~3s
Agent does work                  ~10s
Agent writes history             ~2s
Coordinator collects             ~1s
Scribe spawns + runs             ~8s
                          Total: ~34s
```

Worst case (multi-agent, mature project):
```
Coordinator reads (4 tools)      ~8s
Coordinator generates prompts    ~4s
3 agents spawn                   ~3s (parallel)
Each agent reads (2 tools each)  ~6s
Agents do work                   ~30s
Agents write history             ~3s
Coordinator collects (3 reads)   ~3s
Scribe spawns + runs             ~12s
                          Total: ~69s
```

And this is before counting LLM "thinking" time, which increases with prompt complexity and context length.

---

## 2. Why It Feels Worse Later

**Verbal's diagnosis — it's not just latency, it's expectation mismatch:**

Four forces compound:

### 2.1. Memory files grow (real cost increase)

`history.md` and `decisions.md` grow monotonically. Every spawn loads more tokens. The LLM takes longer to process them. This is a real, measurable slowdown — not just perception.

### 2.2. The coordinator prompt is already huge (fixed cost floor)

At ~32KB, `squad.agent.md` is a substantial prompt. The coordinator can never be fast because it's always processing 32KB before it does anything. This sets a floor on response time that doesn't exist for a plain Copilot session (where the system prompt is ~2-4KB).

### 2.3. Users build a mental model of speed (expectation acceleration)

Early in a session, users are watching something novel. The ceremony *is* the product — seeing agents get named, assigned, and dispatched is fascinating. By message 10, the novelty has faded. The user has a mental model: "Kujan knows my codebase, just fix the thing." The ceremony that was delightful at message 1 is friction at message 15.

This is the critical insight: **the same latency feels longer as the session progresses** because the user's tolerance for ceremony drops as their familiarity with the team increases.

### 2.4. Diminishing value of re-reading context

By the 5th interaction, `decisions.md` hasn't changed much. `history.md` has the same core context plus a few new entries. But agents re-read everything from scratch every time. The marginal value of re-reading drops to near zero while the cost stays constant (or increases).

---

## 3. What the Copilot Platform Actually Supports

**Kujan's platform reality check:**

### What we CAN'T do

| Wish | Reality |
|------|---------|
| Keep agents "warm" between messages | Not supported. Each `task` spawn is stateless. There is no persistent agent process. |
| Cache context across spawns | No platform-level caching. Each spawn starts cold. |
| Share memory between spawned agents in real-time | Agents are isolated. Filesystem is the only shared channel. |
| Reduce coordinator prompt size without losing behavior | The coordinator IS the prompt. Smaller prompt = different behavior. |
| Control LLM inference speed | Platform-managed. We can't tune model parameters or request priority. |
| Persistent agent sessions that survive across user messages | The Copilot session is the coordinator's session. Sub-agents don't persist. |

### What we CAN do

| Capability | How it helps |
|-----------|-------------|
| Skip tool calls when context is already loaded | Coordinator can check if it already has team.md/routing.md/registry.json in its context window from this session |
| Make tool calls parallel | Already doing this for reads, but can be more aggressive |
| Vary spawn complexity based on task type | Not every task needs full ceremony |
| Coordinator can handle simple tasks directly | Nothing technically prevents this — it's a policy choice in `squad.agent.md` |
| Batch Scribe work | Spawn Scribe every N interactions instead of every 1 |
| Reduce what agents read per spawn | Agents could skip `decisions.md` if told "no changes since your last spawn" |
| Use `explore` agent instead of `general-purpose` for lightweight tasks | Faster model (Haiku), fewer tools, lower latency |

### The key platform constraint

The Copilot platform has no concept of agent persistence between user messages. Every user message starts a fresh coordinator turn. The coordinator retains its conversation history (it's the same session), but spawned agents are always new.

This means: **the coordinator is the only "persistent" entity.** Any optimization must either make the coordinator smarter about what to skip, or make agent spawns cheaper.

---

## 4. Concrete Solutions

### Solution 1: Tiered Response Modes

**The philosophical answer to "every interaction goes through an agent spawn."**

No. It shouldn't. There should be a spectrum:

| Mode | When | What happens | Latency |
|------|------|-------------|---------|
| **Direct** | Simple questions, status checks, quick clarifications | Coordinator answers directly, no spawn | ~2-3s |
| **Lightweight** | Single-file edits, small fixes, follow-ups to recent work | Coordinator spawns with `explore` or minimal prompt | ~8-12s |
| **Standard** | Normal tasks, single agent | Full spawn with history + decisions | ~25-35s |
| **Full** | Multi-agent, complex tasks, new features | Parallel fan-out, full ceremony | ~40-60s |

**Implementation: Update the routing table in `squad.agent.md`:**

```markdown
### Routing — Mode Selection

| Signal | Mode | Rationale |
|--------|------|-----------|
| Quick factual question | **Direct** | Coordinator already knows |
| "change X to Y in file Z" | **Lightweight** | One agent, known scope, no architecture |
| Follow-up to work completed this session | **Lightweight** | Context is fresh, skip re-reading |
| "fix the bug in..." | **Standard** | Needs domain expertise |
| "build feature X" | **Standard** | Single domain, full context needed |
| "team, build..." or multi-domain | **Full** | Parallel fan-out |
| New feature with architectural decisions | **Full** | Lead + implementers + tester |
```

**Kujan's note:** The coordinator already handles "quick factual questions" directly (line 110 of squad.agent.md). We're extending this principle, not inventing it. The routing table already has the precedent.

**Verbal's note:** This is the single highest-impact change. Users don't consciously think "I want a lightweight spawn" — they think "just fix the damn thing." The coordinator needs to read that intent and match the ceremony to the complexity. The experience should feel like the team *knows* when to go fast.

### Solution 2: Coordinator Context Caching (Session-Level)

**Problem:** The coordinator reads `team.md`, `routing.md`, and `registry.json` on every message. These files almost never change mid-session.

**Fix:** The coordinator should read these files **once per session** and skip re-reading on subsequent messages if they're already in its conversation context.

**Implementation — add to `squad.agent.md` Team Mode section:**

```markdown
**Context caching (session-level):**
- On first message: Read `team.md`, `routing.md`, `registry.json` (3 parallel tool calls).
- On subsequent messages: You already have these in your conversation context.
  Skip re-reading unless:
  - A new agent was added this session
  - The user explicitly asked to refresh the team
  - You detect a reference to an agent you don't recognize
```

**Savings:** 3 tool calls × ~1.5s each = **~4.5 seconds saved per message** after the first.

**Kujan's note:** This is safe because the coordinator's conversation history persists across messages within a session. The files are already "cached" in the LLM's context — we're just telling the coordinator to notice that. There's a risk of stale data if someone manually edits team.md mid-session, but that's an extreme edge case and the "unless" clauses handle it.

### Solution 3: Conditional Memory Loading for Agents

**Problem:** Agents read `decisions.md` and their own `history.md` on every spawn, even when nothing has changed.

**Fix:** The coordinator tracks whether these files have changed and tells the agent to skip if they haven't.

**Implementation — modify spawn prompt template:**

```markdown
## When decisions.md hasn't changed since last spawn:

prompt: |
  You are {Name}, the {Role} on this project.
  
  YOUR CHARTER:
  {inlined charter}
  
  Read .ai-team/agents/{name}/history.md — this is what you know about the project.
  
  decisions.md has not changed since the last time a team member read it.
  Here is a one-line summary of current decisions: {coordinator's summary}
  Skip reading it unless your task requires checking a specific decision.
  
  {task}
```

**Savings:** 1 tool call per spawn when decisions.md is unchanged = **~1.5 seconds**.

**Trade-off:** Risk of agents missing a decision. Mitigated by the coordinator providing a summary and the "unless" escape clause. In practice, decisions.md changes maybe once every 3-5 interactions, so this saves time on 60-80% of spawns.

**Verbal's note:** We could take this further. For lightweight spawns, skip history.md too and inject a 2-3 line summary: "You've been working on this project for 2 weeks. Key context: Node.js API, Express, PostgreSQL. Last session you refactored the auth middleware." This gives the agent enough to be useful without the full read.

### Solution 4: Scribe Batching

**Problem:** Scribe is spawned after every interaction, even when there's nothing in the inbox.

**Fix:** Batch Scribe work. Only spawn Scribe when there are actual inbox files to merge.

**Implementation — modify "After Agent Work" in `squad.agent.md`:**

```markdown
4. **Spawn Scribe** — but ONLY when:
   - There are files in `.ai-team/decisions/inbox/`
   - OR 3+ interactions have passed since last Scribe run
   - OR the user is ending the session
   
   If none of these conditions are met, skip Scribe. Log entries can wait.
```

**Savings:** Eliminates a full spawn cycle (~8-12s) on interactions where no decisions were made. Estimated to apply to 40-60% of interactions.

**Kujan's note:** This is a strict improvement. Scribe's merge-and-log work is not time-sensitive. Batching it doesn't lose data (inbox files persist) and doesn't delay decision propagation meaningfully (decisions propagate at the *next* agent spawn regardless of when Scribe merges them).

### Solution 5: Lightweight Spawn via `explore` Agent Type

**Problem:** Every agent spawn uses `general-purpose` (Sonnet model, full tool access). For small tasks, this is overkill.

**Fix:** For lightweight mode tasks, use the `explore` agent type (Haiku model, read-only tools) when the task doesn't require writes.

For tasks that require simple file edits, use `general-purpose` but with a minimal prompt — no charter inline, no history read, just the task.

**Implementation — add lightweight spawn template:**

```markdown
### Lightweight Spawn (for simple, scoped tasks)

agent_type: "general-purpose"
description: "{Name}: {brief task}"
prompt: |
  You are {Name}, the {Role}. Make this change:
  
  {specific task with exact file paths and what to change}
  
  Do NOT read history.md or decisions.md. Do NOT write to history.md.
  Just do the task and report what you changed.
```

**Savings:** Eliminates 2-3 tool calls from the agent's path + shorter prompt = faster LLM processing. Estimated **~5-8 seconds faster** than a standard spawn.

**Trade-off:** The agent has no project memory for this spawn. This is fine for "change the button color" but wrong for "redesign the auth flow." The coordinator's routing judgment is critical.

### Solution 6: Coordinator Handles Direct Tasks

**Problem:** `squad.agent.md` line 569 says "You are the coordinator, not the team. Route work; don't do domain work yourself." This is correct for complex work but wasteful for trivial tasks.

**Fix:** Expand the coordinator's "quick factual question" exception to include trivial domain work.

**New rule:**

```markdown
**Coordinator may handle directly (no spawn):**
- Quick factual questions about the project
- Single-line changes where the file path and exact change are obvious
- Status summaries and catch-up requests  
- Confirming what an agent did in a previous turn
- Renaming, moving, or deleting a file when the user specifies exactly what

**Coordinator MUST spawn for:**
- Any task requiring domain expertise or judgment
- Multi-file changes
- Architecture decisions
- Anything the user addresses to a specific agent by name
- Test writing, code review, or quality assessment
```

**Kujan's note:** This is a policy change, not a platform change. The coordinator already has full tool access — it *can* do file operations. We're explicitly giving it permission for trivial cases. The key constraint is "single-line" and "obvious" — if there's any ambiguity, spawn the agent.

**Verbal's note:** This is where the magic feeling comes from later in a session. User says "rename `userId` to `userID` in auth.ts" and the coordinator just... does it. In 3 seconds. No spawn. No ceremony. The team is smart enough to know when the senior engineer can handle it herself.

### Solution 7: Progressive History Summarization

**Problem:** `history.md` grows without bound. By week 12, agents are reading 5,600 tokens of history, most of which is stale context.

**Fix:** Periodically summarize older history entries into a compact "Core Context" section.

**Implementation:**

```markdown
## history.md structure

### Core Context (summarized)
- Project: Node.js API with Express + PostgreSQL
- Key patterns: Repository pattern, JWT auth, middleware chain
- User preferences: Prefers explicit error handling, no ORMs
- Critical decisions: REST over GraphQL, PostgreSQL over MongoDB

### Recent Learnings (last 2 weeks)
[detailed entries as they are today]

### Archive
[moved to .ai-team/agents/{name}/history-archive.md if needed]
```

**Implementation approach:** This is a Scribe responsibility. When `history.md` exceeds a threshold (e.g., 3,000 tokens), Scribe summarizes entries older than 2 weeks into the Core Context section and archives the originals.

**Savings:** Keeps `history.md` reads under ~2,000 tokens regardless of project age. Estimated **~2-4 seconds faster** on mature projects.

**Verbal's note:** This is how human memory actually works. You don't re-read your entire career history before writing code. You have a compressed sense of "what I know about this project" plus vivid detail on recent work. History summarization makes agents feel more human, not less.

---

## 5. Implementation Priority

| Priority | Solution | Effort | Impact | Risk |
|----------|----------|--------|--------|------|
| **P0** | Solution 2: Coordinator context caching | 30 min | ~4.5s/msg saved | Very low |
| **P0** | Solution 4: Scribe batching | 30 min | ~8-12s saved on 50% of msgs | Very low |
| **P1** | Solution 1: Tiered response modes | 2 hours | Transforms the experience | Medium (routing judgment) |
| **P1** | Solution 6: Coordinator handles direct tasks | 1 hour | Eliminates ceremony for trivial work | Low |
| **P2** | Solution 5: Lightweight spawn template | 1 hour | ~5-8s faster on simple tasks | Low |
| **P2** | Solution 3: Conditional memory loading | 1 hour | ~1.5s per spawn | Low |
| **P3** | Solution 7: Progressive history summarization | 3 hours | ~2-4s on mature projects | Medium (lossy compression) |

**P0 changes are zero-risk, high-impact, and can ship today.** They're purely instructional changes to `squad.agent.md`.

---

## 6. The Philosophical Question

**Verbal's take:**

The current design treats every interaction as if it's the agent's first day. Read the charter. Read the history. Read the decisions. Orient yourself. Then work.

But by message 10, this is absurd. It's like a coworker who re-reads the employee handbook before answering every Slack message.

The right mental model is **progressive trust.** Early in a session, full ceremony is appropriate — the team is learning the project, decisions are being made, context is thin. Later in a session, the team should feel *warmed up*. Quick tasks should be quick. The ceremony should scale with the complexity, not the message count.

This isn't about making Squad "dumber" for speed. It's about making Squad *socially intelligent* — knowing when to bring the full team and when to just handle it.

**Kujan's take:**

The platform constraint is real: we can't keep agents warm. Every spawn is cold. But we can make cold starts cheaper by:

1. Not re-reading what we already know (Solutions 2, 3)
2. Not spawning when we don't need to (Solutions 1, 6)
3. Not running overhead processes when there's nothing to process (Solution 4)
4. Not loading the full history when a summary suffices (Solutions 5, 7)

The coordinator is the only persistent entity. Everything we can push to coordinator-level intelligence (routing judgment, context tracking, direct handling) saves a full spawn cycle. The coordinator should get *smarter* about when NOT to spawn, rather than us trying to make spawns faster.

Brady is right that persistence would be ideal. The platform doesn't support it. But the coordinator's conversation history IS a form of persistence — we just haven't been exploiting it.

---

## 7. Expected Impact

### Before (current, message 10 of a session):

```
User: "Change the port from 3000 to 8080 in server.ts"

Coordinator reads team.md, routing.md, registry.json    ~5s
Coordinator reads Fenster's charter.md                  ~1.5s
Coordinator generates spawn prompt                      ~2s
Fenster spawns                                          ~3s
Fenster reads history.md                                ~1.5s
Fenster reads decisions.md                              ~1.5s
Fenster changes the port                                ~5s
Fenster writes to history.md                            ~2s
Coordinator collects result                             ~1s
Scribe spawns + runs                                    ~10s
                                              Total:    ~33s
```

### After (with P0 + P1 solutions):

```
User: "Change the port from 3000 to 8080 in server.ts"

Coordinator recognizes trivial task (Direct mode)        ~1s
Coordinator changes the port                             ~3s
Coordinator responds                                     ~1s
(No Scribe — no decisions to merge)
                                              Total:     ~5s
```

**That's a 6-7x improvement for the class of tasks that most frustrate users late in a session.**

For complex tasks (new features, multi-agent work), the full ceremony remains — because it's worth it there. The difference is that users will only experience the ceremony when the ceremony is earning its keep.

---

## 8. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Trivial task latency (single-line changes) | ~30-35s | ~5s |
| Simple task latency (single-agent, known scope) | ~30-35s | ~12-15s |
| Complex task latency (multi-agent) | ~60-70s | ~50-60s |
| Scribe spawns per session (10 messages) | 10 | 3-4 |
| Coordinator tool calls per message (after first) | 4-5 | 0-1 |
| User perception: "agents get in the way" | Yes (reported) | No |

---

## 9. Open Questions

1. **Where's the line between "trivial" and "needs an agent"?** The coordinator's judgment is critical. Wrong routing (handling something directly that should have been spawned) is worse than slow spawning. We should bias toward spawning when uncertain and only handle directly when the task is unambiguous.

2. **Should lightweight spawns still write to history.md?** If we skip reading history for speed, should we also skip writing? Pro: faster. Con: knowledge gaps compound. Our recommendation: lightweight spawns write a one-line note to history.md ("changed port from 3000 to 8080 in server.ts") but don't read it.

3. **How do we measure this?** Orchestration log could track spawn mode (direct/lightweight/standard/full) and estimated latency. This gives us data to tune the routing thresholds.

4. **Should there be a user override?** E.g., "team, full review on this" to force full ceremony even on a simple task. Probably yes, but defer to v2.

---

## 10. Conclusion

The "agents get in the way later" problem isn't a bug — it's a design assumption that every interaction deserves the same ceremony. It doesn't.

The fix is straightforward: **match the ceremony to the task complexity, not the message count.** Quick tasks get quick responses. Complex tasks get the full team. The coordinator gets smarter about when to spawn and when to just handle it.

P0 changes (context caching + Scribe batching) can ship today with zero risk. P1 changes (tiered modes + coordinator direct handling) are the real experience transformation. P2/P3 are optimizations that matter more as projects mature.

The goal: **by message 10, Squad should feel faster than at message 1** — because the team knows you, knows the project, and knows when to skip the ceremony.

---

**Review requested from:** Keaton (architecture), bradygaster (experience validation)  
**Approved by:** bradygaster  
**Implemented:** Wave 2 — Tiered response modes, context caching, Scribe batching, coordinator direct handling, progressive history summarization  
**Retrospective:** [Pending]
