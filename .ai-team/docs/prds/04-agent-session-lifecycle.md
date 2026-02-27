# PRD 4: Agent Session Lifecycle

**Owner:** Verbal (Prompt Engineer & AI Strategist)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1
**Dependencies:** PRD 1 (SDK Client Wrapper), PRD 2 (Charter Compilation)

## Problem Statement

Squad agents are currently ephemeral subprocess spawns with no persistent state, no lifecycle hooks, and no crash recovery. Every spawn is a cold start — context is re-injected via string templates, there's no session affinity across related work items, and the coordinator has zero visibility into agent work until completion. The SDK's `CopilotSession` model gives us persistent, observable, resumable agent sessions — but we need a well-defined lifecycle to manage them without introducing complexity that makes agents feel slower or more fragile.

## Goals

1. Define the complete agent lifecycle: spawn → active → idle → cleanup, with clear state transitions
2. Compile `.squad/agents/*/charter.md` files into SDK `CustomAgentConfig` objects at team load time
3. Inject dynamic context (history.md, decisions.md, TEAM_ROOT) via `onSessionStart` hook instead of spawn template string surgery
4. Support per-agent tool allowlists via `availableTools` / `excludedTools` in session config
5. Enable per-agent model selection via `SessionConfig.model`
6. Seed agent context from `history.md` at session creation, not per-message
7. Support session resumption via `resumeSession()` for long-running and crash-recovered agents
8. Map lightweight / standard / full response modes to distinct session configurations
9. Enable infinite sessions with auto-compaction for agents working across multiple issues

## Non-Goals

- Coordinator session management (covered in PRD 3)
- Hook-based governance enforcement (covered in PRD 5)
- Casting system integration with sessions (covered in PRD 11)
- Agent-to-agent communication (covered in PRD 13)
- Skills loading into sessions (covered in PRD 7)

## Background

The SDK analysis (`.ai-team/docs/sdk-agent-design-impact.md`) established that `CustomAgentConfig` maps 1:1 to Squad charters. The SDK provides `CopilotSession` objects with lifecycle hooks (`onSessionStart`, `onSessionEnd`), tool filtering (`availableTools`, `excludedTools`), system message control (`systemMessage` with append/replace modes), event subscriptions, and persistent workspace paths via `infiniteSessions`. The coordinator shifts from "spawn prompt engineer" to **session orchestrator** — less string surgery, more programmatic control.

Key SDK primitives this PRD depends on:
- `client.createSession(config: SessionConfig)` — session creation with full config
- `client.resumeSession(sessionId, config: ResumeSessionConfig)` — resume with history intact
- `session.sendAndWait(options, timeout)` — synchronous message delivery with idle detection
- `session.on(eventType, handler)` — typed event subscription
- `session.abort()` — cancel in-flight work
- `session.destroy()` — release session resources
- `SessionHooks` — `onSessionStart`, `onSessionEnd`, `onPreToolUse`, `onPostToolUse`, `onErrorOccurred`
- `InfiniteSessionConfig` — `backgroundCompactionThreshold` (default 0.80), `bufferExhaustionThreshold` (default 0.95)
- `CustomAgentConfig` — `name`, `displayName`, `description`, `prompt`, `tools`, `mcpServers`

## Proposed Solution

### Charter Compilation

Charters compile to `CustomAgentConfig` at team load. This is a **build step**, not runtime interpretation.

```typescript
interface CompiledAgent {
  config: CustomAgentConfig;
  model: string;              // from charter ## Model section
  tier: 'lightweight' | 'standard' | 'full';
  tools: string[];            // explicit allowlist from charter
  mcpServers?: Record<string, MCPServerConfig>;
  historyPath: string;        // .squad/agents/{name}/history.md
  skillDirectories: string[]; // .squad/skills/{skill}/
}

function compileCharter(charterPath: string): CompiledAgent {
  const markdown = readFileSync(charterPath, 'utf-8');
  const { name, role, expertise, style, model, tools } = parseCharter(markdown);

  return {
    config: {
      name: name.toLowerCase(),
      displayName: name,
      description: role,
      prompt: markdown,  // full charter content becomes the agent prompt
      tools: tools ?? null,  // null = all tools
    },
    model: model ?? 'auto',
    tier: 'standard',
    tools: tools ?? [],
    historyPath: resolve(TEAM_ROOT, `agents/${name.toLowerCase()}/history.md`),
    skillDirectories: [],
  };
}
```

### System Message Injection

Charter content lives in `CustomAgentConfig.prompt`. Dynamic context (team state, decisions, history) is injected via `systemMessage` in append mode:

```typescript
const session = await client.createSession({
  sessionId: `squad-${agent.config.name}`,
  model: agent.model,
  customAgents: [agent.config],
  systemMessage: {
    mode: 'append',
    content: buildAgentContext(agent),
  },
  // ...
});

function buildAgentContext(agent: CompiledAgent): string {
  const history = readFileSync(agent.historyPath, 'utf-8');
  const decisions = readFileSync(resolve(TEAM_ROOT, 'decisions.md'), 'utf-8');

  return `
## Team Context
- TEAM_ROOT: ${TEAM_ROOT}
- User: ${currentUser}
- Project: ${projectIdentity}

## Your History (condensed)
${history}

## Active Team Decisions
${decisions}
  `.trim();
}
```

The `append` mode preserves the SDK's built-in guardrails while adding Squad's team context. Charter prompt + appended context = complete agent identity.

### Session Lifecycle States

```
┌──────────┐    createSession()    ┌──────────┐
│ Spawning ├──────────────────────►│  Active  │
└──────────┘                       └────┬─────┘
                                        │
                              session.idle event
                                        │
                                   ┌────▼─────┐
                                   │   Idle   │◄──── can receive new work
                                   └────┬─────┘
                                        │
                           ┌────────────┼────────────┐
                           │            │            │
                     new message    timeout     session.end
                           │            │            │
                      ┌────▼────┐  ┌────▼────┐  ┌───▼──────┐
                      │ Active  │  │Suspended│  │ Cleanup  │
                      └─────────┘  └────┬────┘  └───┬──────┘
                                        │           │
                                   resumeSession()  destroy()
                                        │           │
                                   ┌────▼────┐      ▼
                                   │ Active  │   (gone)
                                   └─────────┘
```

**State definitions:**

| State | SDK Signal | Squad Behavior |
|-------|-----------|----------------|
| **Spawning** | `createSession()` call | Charter compiled, context built, session config assembled |
| **Active** | Messages flowing, tool calls executing | Agent is working. Coordinator receives streaming events. |
| **Idle** | `session.idle` event | Agent finished current work. Ready for new assignment. Session stays alive. |
| **Suspended** | Idle timeout exceeded (configurable) | Session released via `destroy()`. Can be resumed via `resumeSession(sessionId)`. |
| **Cleanup** | `onSessionEnd` hook fires | History summary written. Session metrics logged. Workspace persisted (if infinite). |

### Session Pool Model

Core agents get **persistent sessions** created at team load. Specialized agents get **on-demand sessions** created per task.

```typescript
// Core pool: always-on agents
const coreAgents = ['keaton', 'ripley', 'dallas', 'hockney', 'scribe'];

// At team load
for (const name of coreAgents) {
  const agent = compiledAgents.get(name);
  const session = await client.createSession(buildSessionConfig(agent));
  sessionPool.set(name, { session, state: 'idle', lastActive: Date.now() });
}

// On-demand: specialized agents
async function spawnSpecialist(agent: CompiledAgent, prompt: string) {
  const session = await client.createSession(buildSessionConfig(agent));
  const result = await session.sendAndWait({ prompt }, 300_000);
  await session.destroy();
  return result;
}
```

### Response Mode → Session Config Mapping

Squad's tiered response modes translate directly to session config profiles:

| Mode | Model | Infinite Sessions | Tools | Context |
|------|-------|-------------------|-------|---------|
| **Lightweight** | `claude-haiku-4.5` | `{ enabled: false }` | Minimal (`view`, `grep`) | No history, no decisions |
| **Standard** | Charter default | `{ enabled: true, backgroundCompactionThreshold: 0.80 }` | Charter allowlist | Full context |
| **Full** | Premium tier | `{ enabled: true, backgroundCompactionThreshold: 0.70 }` | All tools | Full context + attachments |

```typescript
function buildSessionConfig(agent: CompiledAgent, mode: ResponseMode = 'standard'): SessionConfig {
  const base = {
    sessionId: `squad-${agent.config.name}-${Date.now()}`,
    customAgents: [agent.config],
    hooks: sharedHooks,
    workingDirectory: TEAM_ROOT,
  };

  switch (mode) {
    case 'lightweight':
      return { ...base, model: 'claude-haiku-4.5', availableTools: ['view', 'grep', 'glob'],
               infiniteSessions: { enabled: false } };
    case 'standard':
      return { ...base, model: agent.model, availableTools: agent.tools.length ? agent.tools : undefined,
               systemMessage: { mode: 'append', content: buildAgentContext(agent) },
               infiniteSessions: { enabled: true } };
    case 'full':
      return { ...base, model: resolveFullModel(agent),
               systemMessage: { mode: 'append', content: buildAgentContext(agent) },
               infiniteSessions: { enabled: true, backgroundCompactionThreshold: 0.70 } };
  }
}
```

### Session Resumption

For long-running agents and crash recovery, `resumeSession()` restores full conversation history:

```typescript
async function resumeOrCreate(agentName: string): Promise<CopilotSession> {
  const existingId = `squad-${agentName}`;
  const sessions = await client.listSessions({ repository: currentRepo });
  const existing = sessions.find(s => s.sessionId === existingId);

  if (existing) {
    return client.resumeSession(existingId, {
      hooks: sharedHooks,
      systemMessage: { mode: 'append', content: buildAgentContext(compiledAgents.get(agentName)!) },
    });
  }

  return client.createSession(buildSessionConfig(compiledAgents.get(agentName)!));
}
```

### Context Seeding from History

Agent history is loaded **once at session creation** via `onSessionStart`, not re-injected per message:

```typescript
hooks: {
  onSessionStart: async (input, invocation) => {
    const agentName = extractAgentName(invocation.sessionId);
    const agent = compiledAgents.get(agentName);
    if (!agent) return;

    const history = readFileSync(agent.historyPath, 'utf-8');
    return {
      additionalContext: `## Your Project History\n${history}`,
    };
  },
}
```

The `onSessionStart` hook receives a `source` field (`"startup" | "resume" | "new"`) — on resume, we can inject only recent history to avoid re-loading stale context.

### Infinite Sessions for Long-Running Agents

Agents working across multiple issues benefit from auto-compaction:

```typescript
infiniteSessions: {
  enabled: true,
  backgroundCompactionThreshold: 0.80,  // start compacting at 80% context
  bufferExhaustionThreshold: 0.95,      // block at 95% to prevent overflow
}
```

Each agent's workspace at `session.workspacePath` persists checkpoints, plans, and working files. The SDK handles compaction automatically — Squad doesn't manage context window pressure directly.

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Charters compile to CustomAgentConfig | ✅ Decided | 1:1 mapping confirmed in SDK analysis |
| System message uses append mode | ✅ Decided | Preserves SDK guardrails; charter + team context appended |
| Core agents get persistent sessions | ✅ Decided | Eliminates cold-start for frequent agents |
| Lightweight mode disables infinite sessions | ✅ Decided | Lightweight = fast and cheap, no workspace overhead |
| `onSessionStart` for context injection | ✅ Decided | Replaces per-spawn template string surgery |
| Session ID format: `squad-{name}-{timestamp}` | 🔲 Needs discussion | Timestamp enables multiple sessions per agent; may complicate resumption |
| Idle timeout before suspension | 🔲 Needs discussion | How long should idle sessions live before `destroy()`? 5 min? 30 min? Configurable? |
| Session pool max size | 🔲 Needs discussion | Do we cap total concurrent sessions? SDK may have server limits. |

## Implementation Notes

### TypeScript Interfaces

```typescript
interface AgentSessionState {
  session: CopilotSession;
  agentName: string;
  state: 'spawning' | 'active' | 'idle' | 'suspended';
  lastActive: number;
  messageCount: number;
  workspacePath?: string;
}

interface SessionPoolConfig {
  maxConcurrent: number;        // max simultaneous sessions
  idleTimeoutMs: number;        // ms before idle → suspended
  coreAgents: string[];         // always-on agent names
  defaultMode: ResponseMode;    // default tier for new sessions
}

type ResponseMode = 'lightweight' | 'standard' | 'full';
```

### Event Monitoring Pattern

The coordinator subscribes to all agent sessions for real-time visibility:

```typescript
function monitorSession(session: CopilotSession, agentName: string) {
  session.on('assistant.message', (event) => {
    emit('agent.response', { agent: agentName, content: event.data.content });
  });

  session.on('session.idle', () => {
    const entry = sessionPool.get(agentName);
    if (entry) entry.state = 'idle';
  });

  session.on('session.error', (event) => {
    emit('agent.error', { agent: agentName, error: event.data.message });
  });
}
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Session creation latency adds perceived overhead | Users feel agents are slower to start | Core session pool pre-warmed at team load. Streaming events give immediate feedback. |
| SDK session limits (server-side caps) | Can't run full team concurrently | Session pool with priority queue. Specialists share slots. Monitor SDK limits. |
| Persistent sessions accumulate stale context | Agent responses reference outdated decisions | `onSessionStart` re-reads decisions.md on resume. Compaction summarizes, doesn't carry raw history. |
| Charter changes require session recreation | Hot-reloading charters mid-session not supported | `destroy()` + `createSession()` on charter file change detection. Acceptable — charters change rarely. |
| `resumeSession()` fails for corrupted sessions | Agent loses conversation history | Catch resume errors, fall back to fresh `createSession()`. Log the failure for debugging. |

## Success Metrics

1. **Cold-start elimination:** Core agents respond within 2s of user message (no charter re-read, no context re-injection)
2. **Crash recovery:** Agents resume from last checkpoint via `resumeSession()` — zero data loss on transient failures
3. **Context efficiency:** Infinite sessions keep agents productive across 10+ consecutive work items without context overflow
4. **Mode differentiation:** Lightweight sessions complete in <5s; standard in <30s; full sessions support multi-file work exceeding 60s
5. **Zero silent successes:** `sendAndWait()` with timeout replaces spawn-and-pray; every agent invocation returns a response or a timeout error

## Open Questions

1. **Session ID stability:** Should persistent agent sessions use stable IDs (`squad-ripley`) or timestamped IDs (`squad-ripley-1708444800`)? Stable IDs simplify resumption but prevent parallel sessions for the same agent.
2. **Charter hot-reload:** Can we update `CustomAgentConfig.prompt` on a running session, or must we destroy and recreate? SDK docs are unclear on config mutation.
3. **Cross-worktree sessions:** If a user has multiple worktrees, does each get its own session pool? Or do sessions span worktrees with `workingDirectory` swapped?
4. **Session persistence across CLI restarts:** SDK sessions are tied to the CLI server process. If the user restarts their terminal, are sessions recoverable via `listSessions()` + `resumeSession()`?
5. **Memory budget per agent:** How much of the workspace path can agents use before we need cleanup policies? SDK's compaction handles context, but workspace files accumulate indefinitely.
