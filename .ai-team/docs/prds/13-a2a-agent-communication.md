# PRD 13: A2A Agent Communication

**Owner:** Verbal (Prompt Engineer & AI Strategist)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 3
**Dependencies:** PRD 4 (Agent Session Lifecycle), PRD 3 (Coordinator Architecture), PRD 11 (Casting System v2)

## Problem Statement

Squad agents currently communicate through two channels: file drop-boxes (`.squad/decisions/inbox/`) and coordinator relay (agent A tells coordinator, coordinator tells agent B). Both are asynchronous and lossy — there's no direct agent-to-agent messaging, no structured handoff protocol, and no way for agents to discover what other agents are currently doing. Brady's directive: "explore agent framework / A2A protocol for inter-agent comms — if it works with the SDK." The question isn't whether A2A is theoretically cool (it is). The question is whether it adds measurable value over the current drop-box pattern, and whether the SDK's session model supports it without over-engineering.

## Goals

1. Evaluate whether Google's A2A protocol concepts apply to Squad's SDK-based architecture
2. Design a minimal agent-to-agent messaging layer using SDK session primitives
3. Enable agent discovery — agents can query who's running and what they're working on
4. Define structured handoff protocols for common patterns (review → fix, design → implement)
5. Determine when A2A adds value vs. when the coordinator relay pattern is sufficient
6. Keep the coordinator as the authority — A2A augments orchestration, it doesn't replace it

## Non-Goals

- Implementing the full Google A2A protocol specification (it's designed for cross-organization agents — overkill for a single team)
- Building a general-purpose message bus or pub/sub system
- Removing the coordinator from the communication path entirely
- Cross-repo agent communication (agents in different repos talking to each other)
- Real-time chat between agents (agents don't have idle time to read messages)

## Background

### Current Communication Patterns

**Coordinator Relay (primary):**
```
User → Coordinator → Agent A (works) → Coordinator → Agent B (reviews) → Coordinator → User
```
The coordinator is the hub. Every message passes through it. This works but creates a bottleneck: the coordinator must fully receive Agent A's output before routing to Agent B. No streaming handoffs.

**File Drop-Box (secondary):**
```
Agent A writes to .squad/decisions/inbox/agent-a-findings.md
Agent B reads .squad/decisions/inbox/agent-a-findings.md (on next spawn)
```
Asynchronous, durable, but slow. Agent B doesn't know the file exists until it's spawned and told to look.

### Google A2A Protocol (Context)

Google's Agent-to-Agent (A2A) protocol defines:
- **Agent Cards:** JSON metadata describing agent capabilities (like `CustomAgentConfig`)
- **Tasks:** Structured work items with input/output schemas
- **Messaging:** Structured message passing between agents
- **Discovery:** Agents advertise capabilities; requestors find the right agent

A2A is designed for **cross-organization** agent communication — Agent A (company X) talks to Agent B (company Y). Squad's agents are **same-team** — they share context, trust each other, and have a coordinator. We don't need the full protocol. But the patterns are instructive.

### SDK Session Primitives

The SDK gives us the building blocks for A2A without adopting the protocol:

- **Multiple concurrent sessions:** Each agent is a `CopilotSession`. The coordinator holds references to all of them.
- **`session.sendAndWait()`:** Send a message to an agent and block until response. This is the A2A "task" primitive.
- **`session.on()` events:** Subscribe to agent output in real time. This enables streaming handoffs.
- **`client.listSessions()`:** Discover active sessions. This is the A2A "discovery" primitive.
- **Custom tools:** Define a `squad_route` tool that lets agents send messages to other agents via the coordinator.

The SDK doesn't have native agent-to-agent messaging. Sessions don't talk to each other directly — the coordinator mediates. But the coordinator can be a very thin relay.

## Proposed Solution

### Architecture: Coordinator as Lightweight Message Broker

```
             ┌──────────────────────────────┐
             │        Coordinator           │
             │   (Session Event Multiplexer) │
             └──────┬───────┬───────┬───────┘
                    │       │       │
          ┌─────────▼──┐ ┌─▼──────┐ ┌▼─────────┐
          │  Ripley    │ │ Dallas │ │ Hockney  │
          │  (session) │ │(session)│ │ (session) │
          └────────────┘ └────────┘ └──────────┘
```

The coordinator doesn't process messages between agents — it **routes** them. Agent A says "I need Hockney to review this." The coordinator forwards the request to Hockney's session. Hockney's response goes back through the coordinator to Agent A.

This is NOT peer-to-peer. It's hub-and-spoke with a thin hub. The coordinator maintains authority (it can reject, modify, or redirect messages) without being a processing bottleneck.

### Agent Discovery

Agents can discover teammates via a custom tool:

```typescript
const squadDiscoverTool = defineTool('squad_discover', {
  description: 'Discover active Squad agents and their current status',
  parameters: z.object({
    filter: z.enum(['all', 'active', 'idle']).optional().default('all'),
  }),
  handler: async (args) => {
    const sessions = await client.listSessions({ repository: currentRepo });
    const agentStatuses = sessions
      .filter(s => s.sessionId.startsWith('squad-'))
      .map(s => ({
        name: extractAgentName(s.sessionId),
        status: sessionPool.get(extractAgentName(s.sessionId))?.state ?? 'unknown',
        role: compiledAgents.get(extractAgentName(s.sessionId))?.config.description,
        lastActive: s.modifiedTime,
        summary: s.summary,
      }));

    if (args.filter !== 'all') {
      return agentStatuses.filter(a => a.status === args.filter);
    }
    return agentStatuses;
  },
});
```

### Structured Handoff Protocol

Handoffs between agents follow a typed protocol:

```typescript
interface AgentHandoff {
  from: string;              // sending agent
  to: string;                // target agent
  type: HandoffType;
  payload: HandoffPayload;
  priority: 'normal' | 'urgent';
  expectResponse: boolean;   // does sender need a reply?
}

type HandoffType =
  | 'review-request'         // "please review my work"
  | 'implementation-request' // "please implement this design"
  | 'information-share'      // "FYI, here's what I found"
  | 'escalation'             // "I can't handle this, you try"
  | 'question'               // "what do you think about X?"
  | 'completion-notice';     // "I'm done with my part"

interface HandoffPayload {
  summary: string;           // human-readable description
  files?: string[];          // relevant file paths
  context?: string;          // additional context
  constraints?: string[];    // things the receiver should know
}
```

### The `squad_route` Custom Tool

Agents communicate through a custom tool registered on their sessions:

```typescript
const squadRouteTool = defineTool('squad_route', {
  description: 'Send a message or handoff to another Squad agent',
  parameters: z.object({
    to: z.string().describe('Target agent name'),
    type: z.enum([
      'review-request', 'implementation-request',
      'information-share', 'escalation', 'question', 'completion-notice'
    ]),
    message: z.string().describe('Message content'),
    files: z.array(z.string()).optional().describe('Relevant file paths'),
    expectResponse: z.boolean().optional().default(true),
  }),
  handler: async (args, invocation) => {
    const fromAgent = extractAgentName(invocation.sessionId);
    const targetSession = sessionPool.get(args.to);

    if (!targetSession) {
      return { error: `Agent "${args.to}" is not currently active.` };
    }

    // Coordinator validates the handoff
    const approved = validateHandoff({
      from: fromAgent, to: args.to, type: args.type,
      payload: { summary: args.message, files: args.files },
      priority: 'normal',
      expectResponse: args.expectResponse,
    });

    if (!approved) {
      return { error: 'Handoff rejected by coordinator policy.' };
    }

    if (args.expectResponse) {
      // Synchronous: send and wait for response
      const response = await targetSession.session.sendAndWait({
        prompt: formatHandoffPrompt(fromAgent, args),
      }, 120_000);

      return {
        from: args.to,
        response: response?.data.content ?? 'No response received.',
      };
    } else {
      // Fire-and-forget: send without waiting
      await targetSession.session.send({
        prompt: formatHandoffPrompt(fromAgent, args),
      });

      return { status: 'delivered', to: args.to };
    }
  },
});

function formatHandoffPrompt(fromAgent: string, args: HandoffArgs): string {
  return `
## Incoming from ${fromAgent} (${args.type})

${args.message}

${args.files?.length ? `**Relevant files:** ${args.files.join(', ')}` : ''}

${args.expectResponse ? 'Please respond with your assessment.' : 'No response needed — this is informational.'}
  `.trim();
}
```

### When A2A Adds Value vs. Drop-Box

| Pattern | Use A2A (Direct) | Use Drop-Box (Async) |
|---------|-------------------|---------------------|
| Code review after implementation | ✅ Reviewer needs immediate context | |
| Design handoff to implementer | ✅ Structured handoff with constraints | |
| Decision logging | | ✅ Durable, not time-sensitive |
| Status updates to coordinator | | ✅ Fire-and-forget |
| Cross-issue context sharing | | ✅ Persists across sessions |
| Urgent escalation (blocked agent) | ✅ Agent needs help now | |
| Skill sharing between agents | | ✅ Skills are file-based, not conversational |
| Review rejection → reassignment | ✅ Immediate redirect to different agent | |

**Rule of thumb:** If the receiving agent needs to **act on the message in the same session**, use A2A. If the message is **reference material for future sessions**, use drop-box.

### Minimal A2A Implementation

The smallest useful A2A in Squad is two tools + one hook:

1. **`squad_discover`** — agent discovery (who's running?)
2. **`squad_route`** — message delivery (send to agent)
3. **`onPostToolUse` hook** — coordinator logs all A2A traffic for observability

That's it. No protocol negotiation, no agent cards, no task schemas. Just: discover, route, log.

```typescript
// Register A2A tools on every agent session
function buildSessionConfig(agent: CompiledAgent): SessionConfig {
  return {
    // ... existing config ...
    tools: [squadDiscoverTool, squadRouteTool],
    hooks: {
      ...sharedHooks,
      onPostToolUse: async (input, invocation) => {
        // Log A2A traffic
        if (input.toolName === 'squad_route') {
          await logA2AMessage(invocation.sessionId, input.toolArgs, input.toolResult);
        }
        // ... other post-tool-use hooks ...
      },
    },
  };
}
```

### Coordinator Authority

The coordinator retains full authority over A2A:

1. **Validation:** `validateHandoff()` checks that the target agent exists, is appropriate for the handoff type, and isn't overloaded
2. **Redirection:** Coordinator can reroute a message to a different agent (e.g., if Ripley is busy, redirect review to Dallas)
3. **Rejection:** Coordinator can block handoffs that violate team policy (e.g., agent sending review request to itself)
4. **Observation:** All A2A traffic is logged via `onPostToolUse` hook — coordinator sees everything
5. **Rate limiting:** Prevent message storms (agent A and agent B in an infinite loop)

```typescript
function validateHandoff(handoff: AgentHandoff): boolean {
  // Self-routing prevention
  if (handoff.from === handoff.to) return false;

  // Rate limiting: max 5 messages per agent per minute
  const recentMessages = getRecentA2ACount(handoff.from, 60_000);
  if (recentMessages >= 5) return false;

  // Circular routing prevention
  if (isCircularRoute(handoff.from, handoff.to)) return false;

  // Target must be active
  const target = sessionPool.get(handoff.to);
  if (!target || target.state === 'suspended') return false;

  return true;
}
```

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Hub-and-spoke, not peer-to-peer | ✅ Decided | Coordinator must retain authority. Peer-to-peer creates unobservable agent behavior. |
| SDK sessions + custom tools, not A2A protocol | ✅ Decided | A2A protocol is for cross-org agents. Squad agents are same-team with shared trust and context. |
| Two custom tools (`squad_discover` + `squad_route`) | ✅ Decided | Minimal surface area. Discovery + routing covers all use cases. |
| Synchronous handoffs via `sendAndWait()` | ✅ Decided | Most handoffs need a response (review results, implementation confirmation). |
| Fire-and-forget for informational messages | ✅ Decided | Status updates and completion notices don't need responses. |
| All A2A traffic logged | ✅ Decided | Observability is non-negotiable. Coordinator must see all inter-agent communication. |
| Rate limiting at 5 messages/agent/minute | 🔲 Needs discussion | Is 5 too low? Too high? Should it be configurable? |
| A2A tools available to all agents | 🔲 Needs discussion | Should Scribe be able to route to other agents? Or only agents with explicit handoff roles? |

## Implementation Notes

### Integration with `squad_route` (Existing)

The current coordinator already has a conceptual `squad_route` — it's prompt logic that decides which agent handles a request. The new `squad_route` tool is the programmatic version. Migration:

1. **Phase 1:** `squad_route` tool registered on coordinator session only. Coordinator uses it instead of prompt-level routing logic.
2. **Phase 2:** `squad_route` tool registered on all agent sessions. Agents can initiate handoffs directly.
3. **Phase 3:** Coordinator prompt routing logic removed (~100 lines). All routing is tool-based.

### A2A Traffic Log Schema

```typescript
interface A2ALogEntry {
  timestamp: string;
  from: string;
  to: string;
  type: HandoffType;
  messageSummary: string;      // first 200 chars
  files: string[];
  responseReceived: boolean;
  latencyMs: number;
  coordinatorAction: 'approved' | 'redirected' | 'rejected';
}
```

Logs written to `.squad/logs/a2a.jsonl` — one JSON line per message. Enables post-session analysis of communication patterns.

### Interaction with Casting System

A2A messages use cast names, not role names:

```
Ripley → squad_route(to: "hockney", type: "review-request", message: "...")
```

Not:

```
backend-developer → squad_route(to: "tester", ...)
```

Cast names are the agents' identity. A2A respects that identity.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Infinite message loops (A talks to B talks to A) | Session resource exhaustion | Circular route detection + rate limiting. Max 5 messages per agent per minute. Max 3 hops per conversation chain. |
| A2A overhead exceeds value | Slower than coordinator relay | Benchmark: if A2A adds >2s latency over direct relay, disable. Feature flag: `SQUAD_A2A_ENABLED`. |
| Agents misuse routing (send to wrong agent) | Work routed to unqualified agent | Coordinator validation checks role compatibility. Review requests can only go to agents with reviewer capability. |
| Message ordering issues | Agent receives messages out of order | `sendAndWait()` is synchronous — no ordering issues for request/response. Fire-and-forget messages are inherently unordered (acceptable). |
| Over-engineering for current team size | Complexity without benefit for 5-9 agents | This is a Phase 3 feature. Only built if Phase 1-2 prove SDK sessions work. Start with minimal implementation (2 tools + 1 hook). |

## Success Metrics

1. **Handoff latency:** Agent-to-agent handoffs complete within 5s (message delivery + response), compared to coordinator relay baseline
2. **Reduced coordinator bottleneck:** Coordinator prompt size decreases by ~100 lines (routing logic moved to tools)
3. **Agent autonomy:** Agents initiate 30%+ of handoffs directly (vs. 100% coordinator-initiated today)
4. **Zero message loops:** Rate limiting and circular detection prevent all runaway messaging
5. **Observability:** 100% of A2A traffic logged with <10ms logging overhead

## Open Questions

1. **Is A2A worth building at all?** The current coordinator relay works. A2A adds complexity. Brady said "explore" — this PRD is the exploration. The decision to build is separate from the decision to design.
2. **Agent personality in handoffs:** Should handoff messages reflect cast personality? ("Hey Hockney, take a look at this" vs. "Review request: authentication module")? Personality makes Squad feel alive; formality makes messages parseable.
3. **Multi-agent conversations:** Can 3+ agents participate in a single conversation (e.g., architecture discussion)? Current design is 1:1. Group messaging is significantly more complex.
4. **A2A across VS Code and CLI:** If one agent runs in CLI and another in VS Code (different clients), can they still route messages? Depends on whether sessions span client boundaries.
5. **Handoff failure recovery:** If the target agent crashes mid-handoff, what happens? Re-route to another qualified agent? Return error to sender? Queue for retry?
6. **Google A2A protocol compatibility:** Should we maintain any compatibility with the Google A2A spec for future interoperability with non-Squad agents? Or is Squad-native sufficient?
