# PRD 5: Coordinator Replatform

**Owner:** Keaton (Lead)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1
**Dependencies:** PRD 1 (SDK Orchestration Runtime), PRD 2 (Custom Tools API), PRD 3 (Hooks & Policy Enforcement), PRD 4 (Agent Session Lifecycle)

---

## Problem Statement

Squad's coordinator is a ~32KB markdown prompt (`squad.agent.md`, ~1,800 lines) that runs inside Copilot CLI's native agent system. It "orchestrates" by composing string templates and firing `task` tool calls — no session isolation, no event capture, no ability to intercept or modify what agents do. This ceiling limits routing reliability, parallel execution, observability, and governance enforcement. The coordinator needs to become a TypeScript program that uses the SDK's `CopilotClient`, sessions, hooks, and custom tools as building blocks.

## Goals

1. **Replace prompt-based orchestration with programmatic control.** The coordinator becomes a TypeScript process that creates and manages agent sessions via the SDK, not a markdown file that describes orchestration steps to an LLM.
2. **Preserve routing intelligence.** All routing logic from `squad.agent.md` — tier detection, agent selection, parallel fan-out, response mode selection — must transfer to the new coordinator with equivalent or better accuracy.
3. **Enable event-driven handoff.** The coordinator observes agent work in real time via `session.on()` events, uses `sendAndWait()` for deterministic sequencing, and can abort/retry on failure.
4. **Shrink the system prompt by 50%+.** Rules currently enforced in prompt (reviewer lockouts, tool restrictions, PII scrubbing) move to hooks (PRD 3). Routing logic moves to code. What remains is the coordinator's identity, team context, and high-level orchestration heuristics.
5. **Maintain backward compatibility.** Existing `squad init` / `squad upgrade` users are unaffected. The coordinator replatform is internal to how Squad runs, not how it installs.

## Non-Goals

- **Rewriting the template engine.** `index.js` and the init/upgrade/watch commands are unchanged.
- **Redesigning `.squad/` directory structure.** That's PRD 14 (Clean-Slate Architecture).
- **Building the streaming dashboard.** That's PRD 6 (Streaming Observability).
- **Migrating Ralph.** That's PRD 8 (Ralph SDK Migration).
- **Supporting BYOK providers.** That's PRD 9 (BYOK & Multi-Provider).

## Background

### From Analysis Phase

**Keaton's strategic proposal** (`sdk-replatforming-proposal.md`): The coordinator shifts from "spawn prompt engineer" to "session orchestrator." A single `CopilotClient` manages multiple sessions — one per agent. The coordinator's own session runs the routing logic; agent sessions run work. Hooks enforce policies that cost prompt tokens today.

**Fenster's technical mapping** (`sdk-technical-mapping.md`): ~75% direct feature mapping. Agent spawning via `task` tool maps to `customAgents` + `session.rpc.createCustomAgentSession()`. System message injection maps to `systemMessage.content`. Tool control maps to `availableTools`/`excludedTools`. All session management APIs (create, resume, list, delete) are available.

**Verbal's agent design analysis** (`sdk-agent-design-impact.md`): The coordinator shifts from composing spawn prompts to managing a session pool. Core agents get persistent sessions at team load. The coordinator listens to all agent events simultaneously, multiplexes parallel execution, and uses hooks for governance enforcement.

**Kujan's opportunity analysis** (`sdk-opportunity-analysis.md`): The coordinator can delete ~300 lines of spawn orchestration by using SDK sessions. `SessionMetadata.context` provides worktree awareness for free. `sendAndWait()` eliminates the silent success bug.

### Current Coordinator Responsibilities

The coordinator (`squad.agent.md`) currently handles:

1. **Routing** — Reads user message, selects agent(s), determines response tier (Direct/Lightweight/Standard/Full)
2. **Spawning** — Composes spawn prompts with charter, history, decisions, TEAM_ROOT injection; fires `task` tool calls
3. **Parallel fan-out** — Launches multiple background agents simultaneously via `task(mode="background")`
4. **Model selection** — Resolves per-agent model from 4-layer priority (user override → charter → registry → auto-select)
5. **Response aggregation** — Collects agent outputs, synthesizes final response
6. **Policy enforcement** — Reviewer lockouts, tool restrictions, no self-spawning, PII rules
7. **Context management** — Loads team.md, routing.md, decisions.md; injects into every spawn
8. **Platform detection** — Distinguishes CLI vs VS Code behavior
9. **Init mode** — Handles first-run setup, team creation
10. **Direct responses** — Answers simple questions without spawning agents

---

## Proposed Solution

### Architecture Overview

```
User Message
     │
     ▼
┌──────────────────────────────────────┐
│  Coordinator Process (TypeScript)     │
│                                       │
│  ┌─────────────┐  ┌───────────────┐  │
│  │ Router      │  │ Session Pool  │  │
│  │ (routing.ts)│  │ (pool.ts)     │  │
│  └──────┬──────┘  └───────┬───────┘  │
│         │                 │           │
│         ▼                 ▼           │
│  ┌─────────────────────────────────┐  │
│  │ CopilotClient (SDK)             │  │
│  │  - Coordinator Session (self)   │  │
│  │  - Agent Sessions (per-member)  │  │
│  │  - Shared Hooks (PRD 3)        │  │
│  │  - Custom Tools (PRD 2)        │  │
│  └─────────────────────────────────┘  │
└──────────────────────────────────────┘
     │              │             │
     ▼              ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Session: │  │ Session: │  │ Session: │
│ Fenster  │  │ Verbal   │  │ Baer     │
│ (sonnet) │  │ (sonnet) │  │ (sonnet) │
└─────────┘  └─────────┘  └─────────┘
```

### What Moves to Code vs. Stays as System Message

This is the key design question. The answer: **routing and orchestration become code; identity and heuristics stay as prompt.**

#### Moves to TypeScript Code

| Current Prompt Section | New Location | Rationale |
|----------------------|--------------|-----------|
| Spawn template composition | `spawn.ts` — builds `SessionConfig` from charter + context | String surgery becomes typed config objects |
| Parallel fan-out logic | `fanout.ts` — creates N sessions, awaits all via `Promise.allSettled()` | SDK manages parallel sessions natively |
| Response tier detection | `router.ts` — classifies message → Direct/Lightweight/Standard/Full | Deterministic logic doesn't need LLM |
| Agent selection from routing.md | `router.ts` — parses `routing.md`, matches patterns | Pattern matching is better in code |
| Model resolution | `models.ts` — 4-layer priority lookup | Config lookup doesn't need LLM |
| Policy enforcement | Hooks (PRD 3) — `onPreToolUse`, `onPostToolUse` | Runtime enforcement, not prompt rules |
| Platform detection | SDK abstracts (CLI vs VS Code are the same via `CopilotClient`) | SDK handles transport differences |
| Token tracking | `metrics.ts` — counts from session events | Event-driven aggregation |
| Orchestration log writes | `orchestration-log.ts` — event handlers write structured logs | Replaces ad-hoc file writes |

#### Stays as System Message (Coordinator's `systemMessage.content`)

| Content | Why It Stays |
|---------|-------------|
| Coordinator identity and persona | LLM needs to know who it is |
| Team roster summary | Context for routing decisions the LLM still makes |
| High-level orchestration heuristics | "When the user says X, consider Y" — nuanced judgment |
| Escalation guidelines | "When to involve Brady" — human judgment calls |
| Communication style rules | Tone and format preferences |

**Estimated prompt reduction: 50–60%.** From ~32KB to ~12–15KB. Everything deterministic or enforceable moves to code.

### Coordinator Session Lifecycle

The coordinator itself runs as an SDK session with a minimized system prompt:

```typescript
// coordinator.ts
import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { loadTeam } from "./team.js";
import { createRouter } from "./router.js";
import { createSessionPool } from "./pool.js";
import { createHooks } from "./hooks.js";
import { squadTools } from "./tools.js";

export async function startCoordinator(teamRoot: string) {
  const team = await loadTeam(teamRoot);
  const client = new CopilotClient();
  await client.start();

  const router = createRouter(team.routing);
  const pool = createSessionPool(client, team);
  const hooks = createHooks(team);

  // Coordinator's own session — handles user interaction
  const coordinatorSession = await client.createSession({
    sessionId: "squad-coordinator",
    model: team.coordinator.model,  // e.g., "gpt-5"
    systemMessage: {
      mode: "append",
      content: buildCoordinatorPrompt(team),  // ~12-15KB, down from ~32KB
    },
    tools: squadTools(pool, router, team),
    hooks,
    infiniteSessions: { enabled: true },
  });

  return { client, coordinatorSession, pool, router };
}
```

### Routing: From Prompt Logic to Programmatic Dispatch

Today, the coordinator LLM reads the user message and decides who to route to. This is unreliable — the LLM sometimes misroutes, forgets agent specializations, or routes to itself.

The new coordinator uses a hybrid approach:

```typescript
// router.ts
export function createRouter(routingRules: RoutingConfig) {
  return {
    classify(message: string): RouteDecision {
      // 1. Check explicit @mentions — deterministic
      const mention = extractMention(message);
      if (mention) return { agent: mention, tier: "standard" };

      // 2. Check keyword patterns from routing.md — deterministic
      const patternMatch = matchRoutingPatterns(message, routingRules);
      if (patternMatch.confidence > 0.8) return patternMatch;

      // 3. Fall back to LLM classification — the coordinator session
      //    decides when deterministic matching fails
      return { agent: null, tier: "llm-decide" };
    }
  };
}
```

When the router returns `llm-decide`, the coordinator session's LLM handles the nuanced routing. This hybrid ensures simple cases are fast and deterministic, complex cases still get LLM judgment.

### Parallel Fan-Out via SDK Sessions

```typescript
// fanout.ts
export async function fanOut(
  pool: SessionPool,
  agents: string[],
  task: string,
  context: FanOutContext
): Promise<FanOutResult[]> {
  const promises = agents.map(async (agentName) => {
    const session = await pool.getOrCreate(agentName);
    const result = await session.sendAndWait(
      { prompt: buildAgentPrompt(task, context) },
      context.timeout ?? 120_000
    );
    return { agent: agentName, result };
  });

  const results = await Promise.allSettled(promises);

  return results.map((r, i) => ({
    agent: agents[i],
    status: r.status,
    output: r.status === "fulfilled" ? r.value.result : undefined,
    error: r.status === "rejected" ? r.reason : undefined,
  }));
}
```

Key differences from current approach:
- **Typed results** — `Promise.allSettled` captures success/failure per agent
- **Timeouts** — `sendAndWait(prompt, timeout)` prevents hung agents
- **Session reuse** — Pool returns existing session if agent already active
- **Event streaming** — Each session emits events the coordinator can observe during execution

### Event-Driven Handoff

```typescript
// The coordinator subscribes to all agent events
pool.onAnyAgent("tool.execution_start", (agentName, event) => {
  metrics.trackToolCall(agentName, event.data.toolName);
  log.orchestration(`${agentName}: running ${event.data.toolName}`);
});

pool.onAnyAgent("assistant.message", (agentName, event) => {
  log.orchestration(`${agentName}: completed — ${event.data.content.slice(0, 100)}...`);
});

// Sequential handoff: agent A produces output, feeds to agent B
const reviewResult = await pool.sendAndWait("hockney", {
  prompt: `Review this code change:\n${codeResult.output}`
});

if (extractVerdict(reviewResult) === "rejected") {
  // Lockout enforced by hook (PRD 3), but coordinator also knows
  await pool.sendAndWait("ripley", {
    prompt: `Hockney rejected your change: ${reviewResult.feedback}. Revise.`
  });
}
```

### Streaming Event Aggregation

The coordinator multiplexes events from all active agent sessions:

```typescript
// All agent sessions stream simultaneously
for (const [name, session] of pool.activeSessions()) {
  session.on("assistant.message_delta", (event) => {
    emit("agent.progress", { agent: name, delta: event.data.deltaContent });
  });

  session.on("tool.execution_complete", (event) => {
    emit("agent.tool", {
      agent: name,
      tool: event.data.toolName,
      duration: event.data.duration,
    });
  });
}
```

This feeds PRD 6 (Streaming Observability) — the coordinator produces a unified event stream that dashboards consume.

### Token Usage Tracking

```typescript
// metrics.ts — per-agent token accounting
session.on("session.compaction_complete", (event) => {
  metrics.record(agentName, {
    inputTokens: event.data.inputTokens,
    outputTokens: event.data.outputTokens,
    compactionCount: metrics.get(agentName).compactionCount + 1,
  });
});

// Expose via squad_status tool (PRD 2)
function getTeamTokenUsage(): TokenReport {
  return Object.fromEntries(
    pool.allAgents().map(name => [name, metrics.get(name)])
  );
}
```

### Model Selection

Model resolution moves from prompt-level heuristics to typed config:

```typescript
// models.ts
export function resolveModel(
  agentName: string,
  team: TeamConfig,
  userOverride?: string
): string {
  // Layer 1: User override (from message or config)
  if (userOverride) return userOverride;

  // Layer 2: Charter-level model specification
  const charter = team.agents[agentName];
  if (charter?.model) return charter.model;

  // Layer 3: Role-based defaults from registry
  const roleDefault = team.modelRegistry[charter?.role];
  if (roleDefault) return roleDefault;

  // Layer 4: Auto-select (default model)
  return team.defaultModel ?? "claude-sonnet-4.5";
}
```

---

## Key Decisions

### Made

| Decision | Rationale |
|----------|-----------|
| Coordinator runs as TypeScript, not as agent prompt | Deterministic routing, typed APIs, testable code |
| Hybrid routing (code + LLM fallback) | Simple cases fast, complex cases still get judgment |
| Session pool with reuse | Persistent agent memory, lower latency than spawn-per-request |
| System message shrinks to ~12-15KB | Everything enforceable moves to hooks/code |
| SDK version pinned, no floating ranges | Technical Preview stability concern |

### Pending

| Decision | Options | Who Decides |
|----------|---------|-------------|
| Entry point: new `squad orchestrate` subcommand vs. replace `squad watch`? | (a) New subcommand — additive, backward-compat. (b) Replace watch — simpler, but breaking. | Brady |
| Coordinator session model: fixed or configurable? | (a) Hardcode gpt-5. (b) Configurable via team.md. | Keaton + Brady |
| Init mode: stays in prompt or moves to code? | (a) Keep in system message — it's conversational. (b) Move to code — it's a wizard. | Verbal |
| How does the coordinator handle its own crashes? | (a) `resumeSession("squad-coordinator")` on restart. (b) Fresh session, re-read state from disk. | Fenster |

---

## Implementation Notes

### File Structure

```
src/
├── coordinator.ts      # Entry point — startCoordinator()
├── router.ts           # Routing logic — classify, pattern match, LLM fallback
├── pool.ts             # Session pool — create, reuse, destroy agent sessions
├── fanout.ts           # Parallel fan-out — Promise.allSettled over sessions
├── spawn.ts            # Build SessionConfig from charter + context
├── models.ts           # Model resolution — 4-layer priority
├── metrics.ts          # Token tracking, event counting
├── team.ts             # Load team.md, routing.md, agents/, decisions/
├── hooks.ts            # Hook definitions (PRD 3 integration)
├── tools.ts            # Custom tool definitions (PRD 2 integration)
├── prompt.ts           # Build coordinator system message (~12-15KB)
├── orchestration-log.ts # Structured logging from events
└── types.ts            # Shared TypeScript types
```

### Migration Path for Existing Users

1. **Phase A (v0.6.0-beta):** `squad orchestrate` subcommand available. Existing `squad.agent.md` still works. Users opt-in to SDK orchestration.
2. **Phase B (v0.6.0):** SDK orchestration is default for new installs. Existing installs prompted to migrate via `squad upgrade`.
3. **Phase C (v0.7.0):** `squad.agent.md` becomes a legacy compatibility layer. SDK orchestration is the only supported path for new features.

### What Happens to `squad.agent.md`

It doesn't disappear — it shrinks. The file becomes the coordinator's system message content:

```markdown
# Squad Coordinator

You are the Squad coordinator for this project.

## Your Team
{dynamically injected from team.md at session creation}

## How You Work
- Users talk to you. You route work to the right agent.
- When routing is ambiguous, ask for clarification.
- For simple factual questions, answer directly.

## Communication Style
- Be concise and decisive
- Report outcomes, not process
- When agents finish, synthesize their output for the user

## Escalation
- Involve Brady for: strategic direction changes, new team members, release decisions
```

~2KB instead of ~32KB. Everything else is in code.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **LLM routing accuracy degrades** with smaller prompt | Medium | Hybrid router handles deterministic cases in code; LLM only handles ambiguous cases. Net accuracy should improve. |
| **Session pool memory pressure** with many persistent agents | Low | Infinite sessions auto-compact. Pool has configurable max size. Ephemeral sessions for one-off work. |
| **SDK breaking changes** between PRD 1 and PRD 5 | Medium | PRD 1 establishes adapter layer. PRD 5 uses Squad's adapter, not raw SDK. Pin version. |
| **Coordinator crash recovery** is more complex | Medium | `resumeSession()` restores coordinator state. Pool re-creates agent sessions from persisted IDs. Team state on disk is source of truth. |
| **Migration confuses existing users** | Low | Opt-in via `squad orchestrate`. `squad.agent.md` remains functional. Upgrade path is explicit. |
| **Testing complexity increases** | Medium | SDK adapter is mockable. Router is pure function — unit testable. Integration tests use real SDK against pinned version. |

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| **Coordinator prompt size** | ≤ 15KB (down from ~32KB) | Character count of system message |
| **Routing accuracy** | ≥ 95% correct agent selection | Manual audit of 100 routing decisions |
| **Agent spawn latency** | ≤ 500ms (session reuse), ≤ 2s (cold start) | Instrumented timing in pool.ts |
| **Silent success rate** | 0% (eliminated) | `sendAndWait()` timeout + event monitoring |
| **Parallel fan-out** | 3+ agents simultaneously with isolated contexts | Integration test: 3 agents, verify no context bleed |
| **Backward compat** | `squad init` / `squad upgrade` unchanged | Existing test suite passes |

---

## Open Questions

1. **How does the coordinator handle multi-turn conversations?** Current: the coordinator session maintains conversation history. SDK: same, via persistent session. But how does context from agent work (e.g., Fenster's code changes) flow back into the coordinator's conversation? Via `additionalContext` in hooks? Via explicit summary injection?

2. **Should the coordinator session be the user-facing session?** Or should there be a thin "gateway" session that handles user I/O and delegates to the coordinator? This affects how streaming and TUI integration work.

3. **What's the testing strategy for the coordinator?** Unit tests for router, pool, models. Integration tests for the full coordinator loop. But how do we test the LLM-dependent parts (ambiguous routing, synthesis) without flaky model calls?

4. **How does the coordinator integrate with VS Code's agent picker?** Today, `@squad` in VS Code routes to `squad.agent.md`. With SDK orchestration, does the VS Code extension need to change? Or does the coordinator session transparently handle both CLI and VS Code?

5. **Token budget for the coordinator session.** With a ~12-15KB system message and team context, how much is left for conversation? With gpt-5's 128K context: ~97K tokens for actual work. Comfortable, but monitor.

---

*This PRD was written by Keaton (Lead). It depends on PRDs 1–4 being complete and will be the final deliverable of Phase 1 (v0.6.0). Brady reviews before implementation begins.*
