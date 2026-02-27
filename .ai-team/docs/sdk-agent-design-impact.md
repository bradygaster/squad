# SDK Agent Design Impact Analysis

**Analyst:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-21  
**Context:** Evaluating Copilot SDK replatforming impact on Squad's multi-agent architecture

---

## Agent Design Transformation

### The Core Shift: From Spawning to Sessions

**Current Squad:** Agents are spawned via the `task` tool with prompts injected via string templates. The coordinator reads `charter.md` files, composes spawn prompts with TEAM_ROOT/history/decisions context, and fires off `task` tool calls. Agents are ephemeral subprocess invocations — no persistent session state, no configuration lifecycle, no direct SDK control.

**SDK-powered Squad:** Agents become **persistent session objects** managed by the SDK. Instead of spawn-and-pray, each agent is a `CopilotSession` instance with:
- **Lifecycle hooks** (onSessionStart, onSessionEnd) — inject team context, clean up state
- **Tool filtering** (availableTools, excludedTools) — per-agent tool allowlists
- **System message control** (systemMessage config) — charter content as SDK config, not string injection
- **Event subscriptions** — the coordinator listens to all agent sessions simultaneously
- **Persistent workspace paths** (infiniteSessions.enabled) — each agent gets a filesystem workspace

The coordinator shifts from "spawn prompt engineer" to **session orchestrator**. Less string surgery, more programmatic control.

---

## CustomAgents + Charters: A Natural Fit (Almost)

### What CustomAgents Give Us

The SDK's `CustomAgentConfig` is **suspiciously close to Squad's charter.md**:

```typescript
{
  name: "ripley",                    // squad persistent name
  displayName: "Ripley",
  description: "Backend Developer",  // from charter role
  prompt: "..." ,                    // charter.md content as SDK string
  tools: ["edit", "view", "powershell"], // explicit tool allowlist
  mcpServers: { ... },               // agent-specific MCP servers
}
```

**The mapping is 1:1.** Squad charters already define:
- Agent identity (name, role)
- Expertise domain (description)
- Behavioral instructions (prompt content)
- Tool preferences (implied, not explicit yet)

**What Squad would gain:**
- **Runtime registration** — `customAgents` array at session creation = agent roster loaded programmatically
- **Built-in tool filtering** — no more spawn prompt warnings; SDK enforces tool allowlists
- **Per-agent MCP servers** — Ripley gets database MCP, Dallas gets GitHub MCP, isolated by SDK
- **Model selection per agent** — SDK `model` field = per-agent model tiers (haiku for Scribe, sonnet for Keaton)

### The Gap: Charter Structure vs. SDK Prompt String

**Squad charters are structured markdown:**
```markdown
## Expertise
- Distributed systems
- API design

## Style
- Concise answers
- Code examples
```

**SDK CustomAgents expect a flat string:**
```typescript
prompt: "You are a backend developer. Your expertise: distributed systems, API design. Style: concise, code examples."
```

**Solution:** Charter compilation. At runtime, Squad's `loadTeam()` reads `.squad/agents/*/charter.md`, converts to CustomAgentConfig, registers with SDK. The coordinator never reads charters mid-session — SDK manages them.

**Trade-off:** Lose the ability to dynamically inject context into charters per-spawn. Current Squad passes `TEAM_ROOT`, `USER_NAME`, and `decisions.md` content into every spawn. With CustomAgents, those would need to go in `onSessionStart` hook's `additionalContext` instead of baked into the prompt.

**Verdict:** Natural fit with one compile step. The SDK model is *cleaner* (config not string template), but Squad needs a charter→CustomAgentConfig translator and a rethink of dynamic context injection (move to hooks, not prompt templates).

---

## Hook-Based Orchestration Patterns

### onPreToolUse: Reviewer Gates

**Current Squad:** When a reviewer rejects work, the coordinator *manually enforces* the lockout — it refuses to spawn the original agent again for that artifact. This is prompt-level logic.

**SDK-powered:** `onPreToolUse` makes this **programmatic**:

```typescript
const rejectionLockouts = new Map<string, Set<string>>(); // artifact → locked agents

hooks: {
  onPreToolUse: async (input, invocation) => {
    const artifact = extractArtifact(input.toolArgs); // e.g., file path
    const lockedAgents = rejectionLockouts.get(artifact);
    const currentAgent = getAgentBySession(invocation.sessionId);

    if (lockedAgents?.has(currentAgent)) {
      return {
        permissionDecision: "deny",
        permissionDecisionReason: `${currentAgent} is locked out of ${artifact} due to reviewer rejection.`
      };
    }
    return { permissionDecision: "allow" };
  }
}
```

**Benefit:** The lockout is **enforced mechanically** at tool-call time, not coordinator string logic. Agents physically cannot write to files they're locked out of. No way to bypass — the SDK blocks the tool call.

### onPostToolUse: Decisions & Learnings Capture

**Current Squad:** After agent work, Scribe is spawned to log decisions, update `decisions.md`, and append to agent `history.md`. This is a separate subprocess.

**SDK-powered:** `onPostToolUse` makes this **automatic**:

```typescript
hooks: {
  onPostToolUse: async (input, invocation) => {
    if (input.toolName === "edit" || input.toolName === "create") {
      // Agent just modified a file — check if it's a decision
      const content = await readFile(input.toolArgs.path);
      const decision = extractDecision(content); // look for decision markers

      if (decision) {
        await appendToDecisions(decision, invocation.sessionId);
        return {
          additionalContext: "✅ Decision logged to .squad/decisions.md"
        };
      }
    }
    return null;
  }
}
```

**Benefit:** Scribe becomes **event-driven** instead of spawn-driven. Every file write is audited; decisions are captured *without* spawning a separate agent. Scribe's role shifts to orchestration-log assembly, not real-time decision capture.

### onUserPromptSubmitted: Routing & Directive Capture

**Current Squad:** The coordinator scans user prompts for directives ("always use X", "never do Y") and captures them to the decisions inbox *before* routing.

**SDK-powered:** `onUserPromptSubmitted` hook formalizes this:

```typescript
hooks: {
  onUserPromptSubmitted: async (input, invocation) => {
    const isDirective = detectDirective(input.prompt); // "always", "never", "from now on"
    
    if (isDirective) {
      await captureDirective(input.prompt);
      return {
        additionalContext: "📋 Directive captured to decisions inbox.",
        // Don't modify prompt — just add context
      };
    }
    return null;
  }
}
```

**Benefit:** Directive capture is **centralized in one hook** instead of scattered across coordinator prompt logic. Every prompt is scanned; nothing slips through.

### onSessionStart: Team Context Injection

**Current Squad:** Every agent spawn includes `TEAM_ROOT`, `USER_NAME`, roster state, and `decisions.md` content pasted into the prompt.

**SDK-powered:** `onSessionStart` injects this once per agent session:

```typescript
hooks: {
  onSessionStart: async (input, invocation) => {
    const agent = getAgentBySession(invocation.sessionId);
    const teamContext = await loadTeamContext();
    const decisions = await readFile(".squad/decisions.md");
    
    return {
      additionalContext: `
**Team Context:**
- User: ${teamContext.currentUser}
- Team root: ${teamContext.root}
- Current focus: ${teamContext.identity?.now}

**Shared Decisions:**
${decisions}
      `
    };
  }
}
```

**Benefit:** Context injection is **SDK-managed**, not template-managed. The coordinator no longer manually composes spawn prompts with team state. The SDK delivers the same content, but cleaner (config not string concat).

### onErrorOccurred: Silent Success Bug Mitigation

**Current Squad:** Agents sometimes complete file writes but return no text (silent success bug). Mitigation is prompt-level: *"RESPONSE ORDER: After ALL tool calls, write a 2-3 sentence summary."*

**SDK-powered:** `onErrorOccurred` + event monitoring can **detect and recover**:

```typescript
const agentResponses = new Map<string, string>();

session.on("tool.execution_complete", (event) => {
  const agent = getAgentBySession(event.sessionId);
  agentResponses.set(agent, ""); // reset response tracker
});

session.on("assistant.message", (event) => {
  const agent = getAgentBySession(event.sessionId);
  agentResponses.set(agent, event.data.content);
});

session.on("session.idle", () => {
  const agent = getAgentBySession(event.sessionId);
  const response = agentResponses.get(agent);
  
  if (!response || response.length < 10) {
    // Silent success detected — inject fallback response
    console.log(`⚠️ ${agent} completed work but returned no text.`);
  }
});
```

**Benefit:** Silent success is **observable** via SDK events, not just prompt mitigation. The coordinator can detect, log, and potentially retry or warn.

---

## Multi-Session Multi-Agent Architecture

### Current Squad: Background Tasks as Agents

**Current model:** Agents are spawned via `task(mode="background")`, which launches subprocesses. The coordinator polls `read_agent()` or waits for completion. Parallelism is "fire off N background tasks, collect results later."

**Limitations:**
- No real-time event streaming from agents (must poll)
- No lifecycle control (can't pause, resume, or introspect agents mid-work)
- No direct tool-call visibility (agent decisions are black-boxed until completion)

### SDK Model: Concurrent Sessions

**New model:** Each agent is a `CopilotSession`. The coordinator creates N sessions (one per agent), subscribes to all their events, and orchestrates work by calling `session.send()` on the appropriate agent.

```typescript
const sessions = new Map<string, CopilotSession>();

// Create agent sessions at team load
for (const member of roster) {
  const session = await client.createSession({
    sessionId: `squad-${member.name}`,
    model: member.model,
    customAgents: [member.asCustomAgent()],
    hooks: sharedHooks,
    infiniteSessions: { enabled: true }, // persistent workspace per agent
  });
  
  session.on((event) => {
    handleAgentEvent(member.name, event); // coordinator listens to all agents
  });
  
  sessions.set(member.name, session);
}

// Route work to an agent
const agent = sessions.get("ripley");
await agent.send({ prompt: "Fix the auth timeout issue in #42" });
```

**What this unlocks:**

1. **Real-time agent visibility:** The coordinator sees every tool call, every message chunk, every reasoning step from all agents simultaneously.

2. **Persistent agent memory:** Each agent's `infiniteSessions` workspace becomes their personal memory. Keaton's `.copilot/session-state/squad-keaton/plan.md` persists across work items. Ripley's workspace accumulates context over time.

3. **True parallel execution:** SDK sessions are multiplexed over a single CLI server connection. N agents can work simultaneously without spawning N CLI processes. More efficient.

4. **Lifecycle control:** The coordinator can `abort()` an agent mid-work, `destroy()` and recreate sessions, or pause/resume agents (via message queueing).

5. **Session affinity for long-running work:** An agent working on a GitHub issue can keep the same session open across multiple comments/revisions. Context accumulates naturally.

### Trade-off: Session Overhead vs. Spawn Simplicity

**Current Squad:** Spawning is cheap. `task` tool call → agent runs → done. No session lifecycle to manage.

**SDK Squad:** Sessions are heavier. Creating N sessions upfront costs more than spawning on-demand. But the **payoff** is persistent memory, real-time observability, and programmatic orchestration.

**Design implication:** Squad would shift to a **session pool model**:
- Core agents (Keaton, Ripley, Dallas, Hockney, Scribe) get persistent sessions created at team load.
- Specialized agents (new expertise needed) get ephemeral sessions created on-demand and destroyed after work.
- Ralph (work monitor) gets its own session that lives as long as monitoring is active.

---

## Developer Experience Impact

### For Squad Consumers: Better, Cleaner, Faster

**Current DX:** `npx create-squad` → answer questions → agents spawn via CLI `task` tool → work happens in black boxes → results appear in files/logs.

**SDK-powered DX:** Same surface, better internals.

**What changes:**
1. **Installation includes SDK:** `npx create-squad` would install `@github/copilot-sdk` as a dependency (or Squad bundles it).
2. **Team sessions persist:** Instead of spawning agents per-request, the team is "always on" — sessions live as long as the coordinator is running.
3. **Real-time feedback:** Consumers see agent progress as it happens (via SDK event streaming), not just final outputs.

**What stays the same:**
- User still interacts via chat (CLI or VS Code)
- User still sees agent responses as human-readable text
- User still controls the team via `.squad/team.md`, `routing.md`, etc.

**Concrete example:**

```
User: "Ripley, fix the auth timeout"

Current Squad:
[blank screen for 30 seconds]
Ripley: "✅ Fixed in commit abc123. Timeout now 30s."

SDK Squad:
Ripley: "Looking at the auth module now..."
  [2s later] 🔧 Ripley: Reading src/auth.ts
  [5s later] 🔧 Ripley: Found timeout hardcoded at 10s
  [10s later] 🔧 Ripley: Updated to 30s, added config option
✅ Ripley: "Fixed in commit abc123. Timeout configurable via AUTH_TIMEOUT env var."
```

**Why better:** Streaming makes agents feel **alive**. Current Squad agents are silent until completion — SDK agents narrate their work.

### For Squad Developers: More Leverage, Less String Surgery

**Current DX:** Editing Squad means editing `squad.agent.md` — a 1,800-line prompt that's part config, part procedural logic, part template. Every new feature = more prompt lines.

**SDK-powered DX:** Configuration moves to code, logic moves to hooks, prompts shrink.

**Example — adding a new agent capability:**

**Current approach:** Add 50 lines to `squad.agent.md` describing how to use the new tool, when to route to it, and what constraints apply.

**SDK approach:** Register the tool as a CustomAgentConfig field, add a hook to enforce constraints, done. The prompt stays focused on orchestration logic, not tool catalog.

**Impact on maintainability:** Prompt complexity grows **linearly** with features today. SDK moves complexity to **composable config objects** — easier to test, version, and reason about.

---

## Industry Positioning & Competitive Edge

### What "Squad Built on Copilot SDK" Signals

**To the market:**
1. **Legitimacy:** Squad isn't a hack on the CLI — it's a first-class SDK-powered application. GitHub endorsement implicit.
2. **Stability:** Squad tracks SDK stability (in preview now, but moving toward GA). No more chasing CLI implementation details.
3. **Interoperability:** Squad works wherever the SDK works — CLI, VS Code, future surfaces (web, mobile?).

**To competitors:**
- **AutoGPT, LangGraph, CrewAI:** Squad shows multi-agent orchestration on GitHub's platform, not a third-party framework.
- **GitHub Copilot Workspace:** Squad is programmable multi-agent, not a monolithic single-agent experience.

### What Patterns Squad Could Pioneer

#### 1. **Agent-as-Session Pattern**

**Nobody else is doing this yet.** Most multi-agent frameworks spawn per-request (LangChain/LangGraph) or run agents in isolated threads (CrewAI). SDK sessions enable **persistent agent memory** across work items.

**Squad demo:** Show an agent (Keaton) working on three related issues over an hour. The agent's session accumulates context — by issue #3, Keaton references decisions made in issue #1 without the user re-explaining. Memory persistence = compound intelligence.

#### 2. **Hook-Driven Governance**

**Other frameworks enforce governance via prompt instructions.** Squad could showcase governance as **code**:
- Reviewer lockouts = `onPreToolUse` hook blocking tool calls
- Decision capture = `onPostToolUse` hook extracting structured data
- Directive routing = `onUserPromptSubmitted` hook redirecting work

**Squad demo:** Show a rejection flow where the SDK *physically prevents* the locked-out agent from editing the file. Not "please don't" in a prompt — actual tooling enforcement.

#### 3. **Multi-Agent Streaming Orchestration**

**Most frameworks return final results.** Squad could stream *all agent work simultaneously* — multiple agents working in parallel, coordinator multiplexing their outputs into a unified stream.

**Squad demo:** User says "build the login feature." Coordinator spawns Ripley (backend), Dallas (frontend), Hockney (tests) simultaneously. User sees:
```
🔧 Ripley: Creating /api/login endpoint
⚛️ Dallas: Designing login form component
🧪 Hockney: Writing auth test cases
```

All three streams interleaved in real time. Nobody else shows this.

#### 4. **CustomAgents as Organizational Knowledge**

**Other tools treat agents as ephemeral prompts.** Squad treats agents as **persistent team members** with portable configurations.

**Squad demo:** Export `.squad/agents/` as a reusable package. Import Keaton (Lead) + Ripley (Backend) into a new project, they already know the team's coding standards, decision-making style, and tool preferences. Agents as **transferable expertise**, not one-off prompts.

---

## What Gets Better, What Gets Harder

### ✅ Gets Better

| Capability | Current Squad | SDK Squad |
|------------|---------------|-----------|
| **Agent observability** | Black-box until completion | Real-time event streaming |
| **Context persistence** | Spawn-scoped only | Persistent workspaces per agent |
| **Tool enforcement** | Prompt-level warnings | SDK blocks disallowed tool calls |
| **Parallel efficiency** | N subprocesses = N CLI instances | N sessions = 1 CLI server |
| **Governance as code** | Prompt logic | Hooks with structural enforcement |
| **Error detection** | Manual prompt patterns | SDK event monitoring |
| **Model selection** | String templates | SDK session config |

### ⚠️ Gets Harder

| Aspect | Current Squad | SDK Squad | Mitigation |
|--------|---------------|-----------|------------|
| **Session lifecycle** | Spawn-and-forget | Must manage session pool | Lifecycle manager module |
| **Context injection** | Template strings | Hook-based injection | Charter compiler + onSessionStart |
| **Dependency weight** | CLI-only | CLI + SDK (~2MB) | Bundled install, acceptable for agent framework |
| **Testing** | Mock `task` tool responses | Mock SDK sessions + events | SDK has test utilities, but learning curve |
| **Debugging** | Read spawn prompts | Trace SDK events + hooks | Better observability, but more moving parts |

**Net assessment:** The "harder" aspects are **operational complexity**, not fundamental blockers. SDK provides better primitives; Squad needs to build the orchestration layer on top.

---

## Bold Moves (Experiments Worth Trying)

### 1. **Live Agent Inspector**

**What:** A TUI (terminal UI) or web dashboard showing all active agent sessions in real time. Each agent gets a pane with:
- Current tool call
- Reasoning stream (if model supports it)
- File diffs as they happen
- Decision capture in real time

**Why bold:** Most frameworks show "agent working..." spinners. Squad shows **transparent multi-agent operation**.

**Implementation:** SDK streaming events → WebSocket → browser dashboard. `session.on("tool.execution_start")` → update UI pane.

**Demo value:** Record a 60-second video of 4 agents working simultaneously, all visible in the inspector. Post to Twitter. Instant differentiation.

---

### 2. **Agent Skills as MCP Servers**

**What:** Squad's `.squad/skills/` become local MCP servers. Each skill is a directory with:
- `SKILL.md` (prompt content)
- `tools/` (MCP tool definitions)
- `server.ts` (MCP server entrypoint)

The coordinator loads skills as `mcpServers` config when creating agent sessions. Skills become **portable, executable modules**.

**Why bold:** MCP is new (just released). Nobody's using MCP servers as agent skill packaging yet. Squad could define the standard.

**Implementation:** Squad's `loadSkills()` scans `.squad/skills/`, spawns MCP servers, registers them in SessionConfig. Agents automatically get skill tools.

**Demo value:** Show a skill being copied from one project to another. Drop `database-query-skill/` into `.squad/skills/`, agents immediately know how to query Postgres. No installation, no config.

---

### 3. **Reviewer as Hook, Not Agent**

**What:** The Reviewer (currently Hockney) doesn't get a session. Instead, the Reviewer is an `onPostToolUse` hook that runs on every file write. The hook invokes a lightweight LLM call (haiku model) to check the diff against review criteria. Approval/rejection happens **inline**, not via separate agent spawn.

**Why bold:** Collapses the reviewer spawn overhead. Current Squad: Keaton writes code → Hockney spawned → Hockney reviews → response. SDK: Keaton writes code → hook reviews inline → response. 50% faster.

**Implementation:** 
```typescript
hooks: {
  onPostToolUse: async (input) => {
    if (input.toolName === "edit") {
      const diff = await getDiff(input.toolArgs.path);
      const verdict = await quickReview(diff, reviewCriteria);
      
      if (verdict.rejected) {
        rejectionLockouts.add(input.toolArgs.path, currentAgent);
        return {
          additionalContext: `❌ Review failed: ${verdict.reason}. Reassigning to ${verdict.suggestedAgent}.`
        };
      }
    }
    return null;
  }
}
```

**Risk:** Inline review might not be as thorough as dedicated agent review. Could be a toggle — "fast review mode" vs. "deep review mode."

---

### 4. **Squad DM via SDK Sessions**

**What:** Squad's planned "DM the team from Telegram/Slack" feature becomes trivial with SDK. The messaging bridge creates a session per user, persists it across messages, routes to agent sessions.

**Why bold:** Most agent frameworks are CLI-only or web-only. SDK enables **messaging-native agents** with zero architectural rework.

**Implementation:**
```typescript
// Telegram bridge
bot.on("message", async (msg) => {
  const userSession = await getUserSession(msg.from.id);
  const reply = await userSession.sendAndWait({ prompt: msg.text });
  await bot.sendMessage(msg.chat.id, reply.data.content);
});
```

**Demo value:** Show a user DMing their squad from their phone. "Ripley, deploy staging" → Ripley deploys → replies in Telegram. Squad is **ubiquitous**, not terminal-bound.

---

### 5. **Infinite Sessions = Agent Long-Term Memory**

**What:** Enable `infiniteSessions` for all agents. Each agent's workspace becomes their personal **memory store**. Agents write notes to `workspace/memory.md`, persist context across weeks.

**Why bold:** Current agents are stateless across spawns. SDK agents could have **persistent identity** — Keaton remembers architectural decisions from 3 weeks ago because they're in Keaton's workspace.

**Implementation:** In `onSessionEnd` hook, agents write a session summary to `workspace/memory.md`. In `onSessionStart` hook, agents read `memory.md` and inject it as context.

**Demo value:** Show an agent (Keaton) being asked the same question twice, a week apart. Second time, Keaton says "As I decided last week, we're using Postgres." Memory = continuity.

---

## Conclusion: The SDK Supercharges Squad's Agent Model

**Bottom line:** Replatforming on the SDK is a **force multiplier**, not a rewrite.

**What Squad keeps:**
- Multi-agent orchestration as core value prop
- Charter-based agent identity
- Decision-driven shared memory
- Casting system for agent names
- Routing rules and ceremonies

**What Squad gains:**
- Agent sessions with persistent memory
- Hook-driven governance enforcement
- Real-time observability of all agent work
- Programmatic tool control
- First-class platform integration (CLI, VS Code, future surfaces)

**What Squad sacrifices:**
- Spawn-and-forget simplicity (sessions require lifecycle management)
- Prompt-as-config purity (moves to hybrid prompt + SDK config)

**Strategic recommendation:** This is a **v2.0 moment**. Squad v1 proves the concept — multi-agent teams work. SDK-powered Squad v2 makes it **production-grade**: observable, governable, extensible.

**First mover advantage:** SDK is in preview. Squad adopting it early positions as the **reference multi-agent architecture on GitHub Copilot**. By the time SDK hits GA, Squad could own the category.

**Timing:** Start with a **proof-of-concept branch** — port one agent (Scribe) to SDK session, compare DX. If promising, migrate incrementally. Maintain CLI-spawn as fallback until SDK parity is proven.

**The payoff:** When Squad demos 4 agents working simultaneously, all streaming their work in real time, with governance enforced mechanically via hooks, and agents remembering context across weeks — nobody else can match that. The SDK makes it possible. Squad makes it real.
