# SPIKE #66: Per-Agent Model Selection — SDK Source Analysis

## Executive Summary
**Confirmed:** CustomAgentConfig has NO `model` field. Model selection is session-scoped only. Per-agent models require multiple sessions.

---

## Finding 1: CustomAgentConfig Has No Model Field

**File:** `C:\src\copilot-sdk\nodejs\src\types.ts:548-579`

```typescript
export interface CustomAgentConfig {
    name: string;
    displayName?: string;
    description?: string;
    tools?: string[] | null;
    prompt: string;
    mcpServers?: Record<string, MCPServerConfig>;
    infer?: boolean;
}
```

**Analysis:**
- NO `model` field exists on `CustomAgentConfig`
- Agents within a session inherit the session's model
- Cannot specify different models for different agents within the same session

---

## Finding 2: Model is Session-Level Only

**File:** `C:\src\copilot-sdk\nodejs\src\types.ts:613-733`

```typescript
export interface SessionConfig {
    sessionId?: string;
    clientName?: string;
    model?: string;  // ← Session-scoped only
    reasoningEffort?: ReasoningEffort;
    tools?: Tool<any>[];
    customAgents?: CustomAgentConfig[];  // ← Agents inherit session model
    // ... other session-level config
}
```

**Analysis:**
- `model` is set at session creation (`createSession()`)
- ALL agents in that session use the same model
- No override mechanism at agent level

---

## Finding 3: Session Creation Flow

**File:** `C:\src\copilot-sdk\nodejs\src\client.ts:511-560`

```typescript
async createSession(config: SessionConfig = {}): Promise<CopilotSession> {
    const response = await this.connection!.sendRequest("session.create", {
        model: config.model,  // ← Entire session uses this model
        sessionId: config.sessionId,
        customAgents: config.customAgents,  // ← Agents passed to session
        // ...
    });
}
```

**Analysis:**
- Session model is fixed at creation time
- `customAgents` array is passed as session config, not separate sessions
- Model cannot be changed mid-session (requires new session)

---

## Finding 4: Session Resume Supports Model Change

**File:** `C:\src\copilot-sdk\nodejs\src\client.ts:603-640`

```typescript
async resumeSession(sessionId: string, config: ResumeSessionConfig = {}): Promise<CopilotSession> {
    const response = await this.connection!.sendRequest("session.resume", {
        sessionId,
        model: config.model,  // ← Model can be changed on resume
        // ...
    });
}
```

**Analysis:**
- `resumeSession()` allows changing the model
- But still session-scoped, not per-agent

---

## Topology Recommendations

### Option A: Multi-Session Architecture (Recommended)
**Create one session per model tier:**

```typescript
const leadSession = await client.createSession({
    model: "claude-opus-4.6",
    customAgents: [leadConfig, pmConfig]  // Opus-tier agents
});

const coreSession = await client.createSession({
    model: "claude-sonnet-4.6", 
    customAgents: [kobayashiConfig, fensterConfig]  // Sonnet-tier agents
});

const scribeSession = await client.createSession({
    model: "claude-haiku-4.5",
    customAgents: [scribeConfig]  // Haiku-tier agent
});
```

**Pros:**
- Direct SDK support, no workarounds
- Clean model isolation per tier
- Each session has its own workspace and history

**Cons:**
- Multiple session objects to manage
- Need cross-session coordination for Squad workflows
- Workspace state is fragmented across sessions

---

### Option B: Dynamic Session Creation
**Create sessions on-demand per agent invocation:**

```typescript
async function invokeAgent(agentName: string, prompt: string) {
    const modelTier = getModelForAgent(agentName);
    const session = await client.createSession({
        model: modelTier,
        customAgents: [agentConfigs[agentName]]
    });
    
    const result = await session.sendAndWait({ prompt });
    await session.destroy();
    return result;
}
```

**Pros:**
- Perfect model isolation per agent
- Session lifecycle matches agent invocation
- Simplifies session management

**Cons:**
- No persistent session state per agent
- Higher overhead (session creation cost)
- Infinite session features unavailable (no workspace persistence)

---

### Option C: Session Pool by Model Tier
**Maintain a pool of long-lived sessions per tier:**

```typescript
const sessionPool = {
    opus: await client.createSession({ model: "claude-opus-4.6" }),
    sonnet: await client.createSession({ model: "claude-sonnet-4.6" }),
    haiku: await client.createSession({ model: "claude-haiku-4.5" })
};

async function routeToAgent(agentName: string, prompt: string) {
    const tier = agentTierMap[agentName];  // "opus" | "sonnet" | "haiku"
    const session = sessionPool[tier];
    
    // Dynamically inject agent context via systemMessage
    await session.send({
        prompt: `[Agent: ${agentName}]\n${prompt}`,
        // Agent selection handled by prompt engineering
    });
}
```

**Pros:**
- Reuses sessions (lower overhead)
- Maintains session state per tier
- Infinite session features work

**Cons:**
- Agents share session history within their tier
- Requires prompt engineering for agent routing
- Loss of native CustomAgentConfig agent selection

---

## Constraints from SDK Architecture

1. **No per-agent model override:** SDK has no mechanism for this
2. **Session model is immutable:** Cannot change model mid-session (only on resume)
3. **CustomAgentConfig is session-scoped:** Agents are not independent entities
4. **No agent-to-agent handoff across models:** Would require cross-session coordination

---

## Recommendation for Squad

**Adopt Option A: Multi-Session Architecture**

### Implementation Strategy:
1. **Group agents by model tier** in Squad roster:
   - Opus tier: Lead, PM, Architect
   - Sonnet tier: Core specialists (Kobayashi, Fenster, etc.)
   - Haiku tier: Scribe, lightweight assistants

2. **Session lifecycle:**
   - Create sessions at Squad startup (one per tier)
   - Reuse sessions for all agents in that tier
   - Destroy sessions at Squad shutdown

3. **Cross-session coordination:**
   - Use shared filesystem state (`.ai-team/` directory)
   - Session events can be forwarded to central coordinator
   - Agent handoffs record state in shared files

4. **Workspace management:**
   - Each session gets its own workspace directory
   - Squad's central state lives in `.ai-team/` (outside session workspaces)
   - Use `configDir` to control workspace locations

### Implementation Code Sketch:
```typescript
class SquadSessionManager {
    sessions: {
        opus: CopilotSession,
        sonnet: CopilotSession,
        haiku: CopilotSession
    };
    
    async init(client: CopilotClient, roster: AgentConfig[]) {
        const tiers = groupAgentsByTier(roster);
        
        this.sessions.opus = await client.createSession({
            model: "claude-opus-4.6",
            customAgents: tiers.opus,
            configDir: ".ai-team/sessions/opus"
        });
        
        this.sessions.sonnet = await client.createSession({
            model: "claude-sonnet-4.6",
            customAgents: tiers.sonnet,
            configDir: ".ai-team/sessions/sonnet"
        });
        
        this.sessions.haiku = await client.createSession({
            model: "claude-haiku-4.5",
            customAgents: tiers.haiku,
            configDir: ".ai-team/sessions/haiku"
        });
    }
    
    getSessionForAgent(agentName: string): CopilotSession {
        const tier = this.getAgentTier(agentName);
        return this.sessions[tier];
    }
}
```

---

## Related SDK Limitations

- **No session.model_change event:** Model changes on resume don't emit events
- **No agent selection API:** SDK doesn't expose which agent is active in a session
- **Workspace isolation:** Each session workspace is isolated; no shared workspace mode

---

## Questions for SDK Team (if escalation needed)

1. Is per-agent model selection planned for future SDK releases?
2. Could `CustomAgentConfig` support an optional `model` field that overrides session model?
3. Could sessions support sub-sessions or agent contexts with independent models?
4. Is there a recommended pattern for multi-model agent systems?

---

**Next Steps:**
- [ ] Validate multi-session approach with prototype
- [ ] Design Squad session manager for 3-tier architecture
- [ ] Document agent-to-tier mappings in roster
- [ ] Test cross-session coordination patterns
