# PRD 8: Ralph SDK Migration

**Owner:** Fenster (Core Developer)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 2 (after PRD 1 + PRD 2 stable)
**Dependencies:** PRD 1 (SDK Orchestration Runtime), PRD 2 (Custom Tools API)

## Problem Statement

Ralph is Squad's work monitor — a background agent that polls the incoming queue, tracks agent progress, and sends status updates. Today, Ralph is an ephemeral spawn that re-reads `history.md` and `decisions.md` on every poll cycle, burns context tokens re-learning the project state, and has no crash recovery. Brady's directive: "Keep Ralph — SDK has explicit loop samples." The SDK's persistent sessions with `resumeSession()`, event streaming, and infinite sessions solve all three problems — but Ralph's unique architecture (polling loop + watchdog + heartbeat) needs careful migration.

## Goals

1. Replace Ralph's polling loop with a persistent SDK session using `resumeSession()`
2. Accumulate knowledge across poll cycles — no re-reading `history.md` every time
3. Use SDK session events for real-time issue/agent monitoring instead of file-based polling
4. Integrate with GitHub CLI/MCP for issue scanning within the SDK session
5. Preserve all three monitoring layers: in-session loop, local watchdog (`squad watch`), cloud heartbeat
6. Maintain Ralph's existing responsibilities: incoming queue, agent progress, status updates

## Non-Goals

- Changing what Ralph monitors (same queue, same agent tracking)
- Building a Ralph UI (future work)
- Telegram/Discord bridge (separate proposal)
- Making Ralph a coordinator (Ralph observes, doesn't orchestrate)
- Migrating other agents to persistent sessions (this PRD is Ralph-specific)

## Background

### Ralph's Current Architecture

Ralph runs as three layers:
1. **In-session loop** — Coordinator spawns Ralph via `task` tool. Ralph reads queue, checks for work, reports back. Session ends after each cycle.
2. **Local watchdog** (`squad watch`) — CLI command that polls every 30s, re-spawning Ralph if the coordinator doesn't.
3. **Cloud heartbeat** — GitHub Actions `squad-heartbeat.yml` runs on schedule, checks for stale issues, applies labels.

The problem with layer 1: every spawn is a fresh session. Ralph re-reads charter, history, decisions (~50-80K tokens). Discovers the same project state. Makes the same observations. Then the session dies.

### SDK Capabilities That Fix This

From my SDK technical mapping:

1. **`resumeSession(sessionId)`** — Continues a previous conversation with full history. Ralph keeps everything learned from prior cycles.
2. **`infiniteSessions`** — Automatic context compaction at 80% threshold. Ralph's session can run indefinitely without hitting token limits.
3. **Session events** — `session.on("tool.execution_start", ...)` provides real-time tool execution monitoring. Ralph can watch agent activity without polling.
4. **`listSessions()` with filters** — Ralph queries the session pool for all active agent sessions, filtered by repository.
5. **`session.workspacePath`** — Persistent workspace per session. Ralph can write state files that survive restarts.
6. **MCP server integration** — GitHub MCP server (`mcpServers` config) gives Ralph issue scanning within the session, no shell-out to `gh` CLI.

### SDK Session Lifecycle (from `client.ts`)

```typescript
// Create Ralph's initial session
const ralph = await client.createSession({
  sessionId: "squad-ralph",          // Deterministic ID
  model: "claude-haiku-4.5",        // Cost-optimized
  systemMessage: { mode: "append", content: ralphCharter },
  infiniteSessions: { enabled: true, backgroundCompactionThreshold: 0.80 },
  mcpServers: { "github": { type: "local", command: "gh", args: ["copilot", "mcp"], tools: ["*"] } },
  hooks: { onSessionEnd: async (input) => { /* save state on crash */ } },
});

// On subsequent cycles, resume instead of recreating
const ralph = await client.resumeSession("squad-ralph", {
  model: "claude-haiku-4.5",
  hooks: { onSessionEnd: async (input) => { /* save state */ } },
});
```

The SDK's `resumeSession()` loads all prior conversation history. Ralph doesn't need to re-read history.md — it's in the session context.

## Proposed Solution

### Architecture: Ralph as Persistent SDK Session

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Ralph SDK Session (persistent)                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ session: "squad-ralph"                            │  │
│  │ model: claude-haiku-4.5                           │  │
│  │ infiniteSessions: enabled                         │  │
│  │                                                   │  │
│  │ ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │ │ Queue Check  │→ │ Agent Status │→ │ Report   │ │  │
│  │ │ (MCP/gh CLI) │  │ (squad_status│  │ (inbox)  │ │  │
│  │ └─────────────┘  └──────────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↑ resumeSession()               │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Local Watchdog (squad watch)                  │
│  - Polls every 30s                                      │
│  - If Ralph session missing → create new one            │
│  - If Ralph session stale → resume with nudge           │
│  - Reads squad_status for health check                  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Cloud Heartbeat (unchanged)                   │
│  - squad-heartbeat.yml on schedule                      │
│  - Checks stale issues, applies labels                  │
│  - Independent of SDK (runs in GitHub Actions)          │
└─────────────────────────────────────────────────────────┘
```

### Ralph Session Manager (`src/ralph/`)

```
src/ralph/
├── index.ts                # Ralph orchestration entry point
├── session-manager.ts      # Create/resume/monitor Ralph's session
├── state.ts                # Ralph state persistence
└── queue-monitor.ts        # Incoming queue integration
```

### 1. Ralph Session Manager

```typescript
// src/ralph/session-manager.ts
import type { SquadClient } from "../adapter/client.js";
import type { SquadSession } from "../adapter/session.js";
import type { SessionPool } from "../runtime/session-pool.js";
import type { EventBus } from "../runtime/event-bus.js";
import { RalphState } from "./state.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RALPH_SESSION_ID = "squad-ralph";
const RALPH_MODEL = "claude-haiku-4.5";
const RALPH_POLL_INTERVAL_MS = 30_000;

export class RalphSessionManager {
  private session: SquadSession | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private state: RalphState;
  private running = false;

  constructor(
    private client: SquadClient,
    private pool: SessionPool,
    private bus: EventBus,
    private squadDir: string,
  ) {
    this.state = new RalphState(squadDir);
  }

  async start(): Promise<void> {
    this.running = true;

    // Try to resume existing Ralph session
    try {
      const sessions = await this.client.listSessions();
      const existing = sessions.find(s => s.sessionId === RALPH_SESSION_ID);
      if (existing) {
        this.session = await this.resumeRalph();
        console.log("[ralph] Resumed existing session");
      }
    } catch {
      // No existing session — create new one
    }

    if (!this.session) {
      this.session = await this.createRalph();
      console.log("[ralph] Created new session");
    }

    // Subscribe to agent lifecycle events
    this.bus.on("agent.spawned", (event) => {
      this.state.trackAgent(event.sessionId!, event.agentName!, "active");
    });
    this.bus.on("agent.completed", (event) => {
      this.state.trackAgent(event.sessionId!, event.agentName!, "completed");
    });
    this.bus.on("agent.error", (event) => {
      this.state.trackAgent(event.sessionId!, event.agentName!, "error");
    });

    // Start poll loop
    this.pollTimer = setInterval(() => this.pollCycle(), RALPH_POLL_INTERVAL_MS);
    await this.pollCycle(); // Initial cycle
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.state.save();
    // Don't destroy Ralph's session — leave it for resumption
  }

  private async createRalph(): Promise<SquadSession> {
    const charter = await this.loadRalphCharter();
    const accumulated = await this.state.load();

    const systemPrompt = [
      charter,
      accumulated.wisdom.length > 0
        ? `## Accumulated Knowledge\n${accumulated.wisdom.join("\n")}`
        : "",
      `## Current State`,
      `Cycle count: ${accumulated.cycleCount}`,
      `Last poll: ${accumulated.lastPoll ?? "never"}`,
      `Tracked agents: ${accumulated.trackedAgents.length}`,
    ].filter(Boolean).join("\n\n");

    return this.pool.spawn({
      sessionId: RALPH_SESSION_ID,
      agentName: "ralph",
      model: RALPH_MODEL,
      systemPrompt,
      systemPromptMode: "append",
      workingDirectory: process.cwd(),
      infiniteSessions: { enabled: true, compactionThreshold: 0.80 },
      streaming: false,
      hooks: {
        onSessionEnd: async (input) => {
          // Persist state when session ends (crash recovery)
          await this.state.save();
          if (this.running && input.reason === "error") {
            console.error("[ralph] Session ended with error, will recreate on next cycle");
            this.session = null;
          }
        },
      },
    });
  }

  private async resumeRalph(): Promise<SquadSession> {
    return this.pool.resume(RALPH_SESSION_ID, {
      agentName: "ralph",
      model: RALPH_MODEL,
      hooks: {
        onSessionEnd: async (input) => {
          await this.state.save();
          if (this.running && input.reason === "error") {
            this.session = null;
          }
        },
      },
    });
  }

  private async pollCycle(): Promise<void> {
    if (!this.session) {
      try {
        this.session = await this.createRalph();
      } catch (error) {
        console.error("[ralph] Failed to create session:", error);
        return;
      }
    }

    try {
      // Build the poll prompt with current state
      const activeSessions = this.pool.getStatus()
        .filter(s => s.agentName !== "ralph" && s.status !== "destroyed");

      const prompt = [
        `[POLL CYCLE ${this.state.cycleCount + 1}]`,
        "",
        `Active agent sessions: ${activeSessions.length}`,
        ...activeSessions.map(s =>
          `- ${s.agentName}: ${s.status} (age: ${Math.round((Date.now() - s.createdAt.getTime()) / 1000)}s)`
        ),
        "",
        "Check the incoming queue for new work items. Report any issues or agent problems.",
        "If everything is quiet, just confirm monitoring is active.",
      ].join("\n");

      const response = await this.session.sendAndWait(prompt, 60_000);
      this.state.recordCycle(response);
    } catch (error) {
      console.error("[ralph] Poll cycle failed:", error);
      // Session may be broken — null it out so next cycle recreates
      this.session = null;
    }
  }

  private async loadRalphCharter(): Promise<string> {
    try {
      return await readFile(join(this.squadDir, "agents", "ralph", "charter.md"), "utf-8");
    } catch {
      return "You are Ralph, Squad's work monitor. Watch the incoming queue, track agent progress, report issues.";
    }
  }
}
```

### 2. Ralph State Persistence

Unlike other agents, Ralph accumulates state across cycles. The SDK's `infiniteSessions` keeps conversation context, but we also need structured state that survives session deletion.

```typescript
// src/ralph/state.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

interface RalphStateData {
  cycleCount: number;
  lastPoll: string | null;
  wisdom: string[];            // Cross-cycle learnings
  trackedAgents: Array<{
    sessionId: string;
    agentName: string;
    status: string;
    firstSeen: string;
    lastSeen: string;
  }>;
  issueCache: Array<{
    number: number;
    title: string;
    state: string;
    lastChecked: string;
  }>;
}

const EMPTY_STATE: RalphStateData = {
  cycleCount: 0,
  lastPoll: null,
  wisdom: [],
  trackedAgents: [],
  issueCache: [],
};

export class RalphState {
  private data: RalphStateData = { ...EMPTY_STATE };
  private statePath: string;

  constructor(squadDir: string) {
    this.statePath = join(squadDir, "agents", "ralph", "state.json");
  }

  get cycleCount(): number { return this.data.cycleCount; }
  get lastPoll(): string | null { return this.data.lastPoll; }
  get trackedAgents(): RalphStateData["trackedAgents"] { return this.data.trackedAgents; }

  async load(): Promise<RalphStateData> {
    try {
      const raw = await readFile(this.statePath, "utf-8");
      this.data = JSON.parse(raw);
    } catch {
      this.data = { ...EMPTY_STATE };
    }
    return this.data;
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  recordCycle(response?: string): void {
    this.data.cycleCount++;
    this.data.lastPoll = new Date().toISOString();
    if (response) {
      // Extract any learnings Ralph reports (pattern: "[LEARNING] ...")
      const learnings = response.match(/\[LEARNING\]\s*(.+)/g);
      if (learnings) {
        this.data.wisdom.push(...learnings.map(l => l.replace("[LEARNING]", "").trim()));
        // Cap wisdom at 100 entries
        if (this.data.wisdom.length > 100) {
          this.data.wisdom = this.data.wisdom.slice(-100);
        }
      }
    }
  }

  trackAgent(sessionId: string, agentName: string, status: string): void {
    const now = new Date().toISOString();
    const existing = this.data.trackedAgents.find(a => a.sessionId === sessionId);
    if (existing) {
      existing.status = status;
      existing.lastSeen = now;
    } else {
      this.data.trackedAgents.push({
        sessionId, agentName, status,
        firstSeen: now, lastSeen: now,
      });
    }
    // Prune completed agents older than 1 hour
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    this.data.trackedAgents = this.data.trackedAgents.filter(
      a => a.status === "active" || a.lastSeen > oneHourAgo
    );
  }

  cacheIssue(number: number, title: string, state: string): void {
    const now = new Date().toISOString();
    const existing = this.data.issueCache.find(i => i.number === number);
    if (existing) {
      existing.title = title;
      existing.state = state;
      existing.lastChecked = now;
    } else {
      this.data.issueCache.push({ number, title, state, lastChecked: now });
    }
  }
}
```

### 3. Queue Monitor Integration

Ralph currently scans issues via `gh` CLI shell-outs. With SDK migration, Ralph uses the GitHub MCP server directly within its session, or falls back to `gh` CLI tools already available in the session.

```typescript
// src/ralph/queue-monitor.ts
// The queue monitor logic lives in Ralph's session prompt, not in code.
// Ralph's session has access to:
// 1. GitHub MCP server (for issue queries)
// 2. squad_status tool (for agent session status)
// 3. squad_decide tool (for reporting critical findings)
// 4. Standard CLI tools (gh, git) via the session
//
// The RalphSessionManager sends periodic poll prompts.
// Ralph's charter defines what to check and how to respond.
// This keeps queue logic in prompt-space (where it belongs)
// while the SDK provides the reliable transport layer.

export const RALPH_POLL_PROMPT_TEMPLATE = `
[POLL CYCLE {cycleCount}]

## Active Agents
{agentStatus}

## Your Tasks This Cycle
1. Check for new issues with \`squad:\` labels using \`gh issue list\`
2. Check if any active agents are stale (idle > 5 minutes)
3. Check the incoming queue at .squad/incoming/ for pending items
4. If you discover something important, use squad_decide to report it
5. If you learn something worth remembering, prefix it with [LEARNING]

Report format:
- 🟢 All clear (nothing to report)
- 🟡 {issue} (monitoring)
- 🔴 {issue} (needs attention)
`;
```

### 4. Interaction with Coordinator's Session Pool

Ralph subscribes to the session pool's event bus (via PRD 1's EventBus) to track agent spawns in real-time. It no longer needs to poll for agent status — events arrive as they happen.

```typescript
// In RalphSessionManager.start():
this.bus.on("*", (event) => {
  // Ralph sees all events across the system
  switch (event.type) {
    case "agent.spawned":
      this.state.trackAgent(event.sessionId!, event.agentName!, "active");
      break;
    case "agent.completed":
      this.state.trackAgent(event.sessionId!, event.agentName!, "completed");
      break;
    case "agent.error":
      this.state.trackAgent(event.sessionId!, event.agentName!, "error");
      // If critical agent errored, send alert prompt to Ralph's session
      if (this.session && ["keaton", "verbal", "fenster"].includes(event.agentName!)) {
        this.session.send(
          `⚠️ CRITICAL AGENT ERROR: ${event.agentName} session ${event.sessionId} failed. Investigate.`
        );
      }
      break;
    case "connection.lost":
      console.error("[ralph] Connection lost — entering degraded mode");
      break;
  }
});
```

### 5. Three Monitoring Layers — SDK Migration

| Layer | Current | After SDK Migration |
|-------|---------|-------------------|
| **In-session loop** | Ephemeral spawn, re-reads context every cycle, dies after each poll | Persistent session via `resumeSession()`, accumulates context, `infiniteSessions` handles compaction |
| **Local watchdog** (`squad watch`) | Node.js polling loop, spawns Ralph via `task` tool | Node.js polling loop, checks Ralph's SDK session via `listSessions()`, resumes if stale, creates if missing |
| **Cloud heartbeat** | GitHub Actions `squad-heartbeat.yml`, independent of runtime | Unchanged — Actions can't use SDK. Remains label-based automation. |

### Local Watchdog Integration

```typescript
// Updated squad watch command (in index.js or new src/cli/watch.ts)
// Simplified — the watchdog just ensures Ralph's session exists

async function watchLoop(client: SquadClient, pool: SessionPool, bus: EventBus, squadDir: string) {
  const ralph = new RalphSessionManager(client, pool, bus, squadDir);
  await ralph.start();

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[squad watch] Shutting down...");
    await ralph.stop();
    await client.stop();
    process.exit(0);
  });

  // Keep process alive
  console.log("[squad watch] Ralph monitoring active. Press Ctrl+C to stop.");
}
```

## Key Decisions

### Made
1. **Ralph keeps a persistent session** — `resumeSession("squad-ralph")` is the primary path. Fresh creation only on first run or after session deletion.
2. **Deterministic session ID** — `"squad-ralph"` (not random UUID). Enables reliable resume across process restarts.
3. **State persisted to JSON** — `state.json` alongside Ralph's charter. Structured data (not markdown) because Ralph's state is machine-consumed, not human-read.
4. **Event-driven agent tracking** — Ralph subscribes to EventBus, not polling `squad_status`. Real-time awareness.
5. **Haiku model for Ralph** — Cost-optimized. Ralph's work is monitoring, not complex reasoning. Matches the existing per-agent model selection decision (Tester/Scribe/Monitor → Haiku).
6. **Cloud heartbeat unchanged** — GitHub Actions can't use the SDK (no persistent process). Layer 3 stays as-is.

### Needed
1. **How long should Ralph's session persist?** — SDK sessions persist to disk. Should we delete Ralph's session on `squad watch` shutdown? Or keep it forever? (Recommend: keep it, with weekly cleanup of sessions older than 7 days.)
2. **Should Ralph have its own custom tools?** — Beyond `squad_status` and `squad_decide`, should Ralph get `squad_alert` for pushing notifications? (Recommend: defer to notification system PRD.)
3. **MCP server for GitHub issues** — Does Ralph use the GitHub MCP server (via `mcpServers` config) or `gh` CLI tools (already available in session)? (Recommend: `gh` CLI first, MCP if available.)

## Implementation Notes

### Session Resumption Flow

```
[Process Start]
     │
     ▼
  listSessions({ repository: "owner/repo" })
     │
     ├── Found "squad-ralph" session
     │   ▼
     │   resumeSession("squad-ralph")
     │   → Ralph has full conversation history
     │   → No charter/history re-read needed
     │   → Start poll loop
     │
     └── No "squad-ralph" session
         ▼
         createSession({ sessionId: "squad-ralph", ... })
         → Fresh session with charter + accumulated state
         → Start poll loop
```

### Infinite Sessions + Ralph

Ralph's session will accumulate conversation history over hundreds of poll cycles. The SDK's `infiniteSessions` handles this:

- At 80% context utilization → background compaction runs (summary replaces old turns)
- At 95% → session blocks until compaction completes
- `session.workspacePath` provides persistent storage (`checkpoints/`, `plan.md`, `files/`)

This means Ralph effectively has **unbounded memory** — compaction preserves the important bits while discarding routine poll responses.

### Testing Strategy

```
test/sdk/ralph/
├── session-manager.test.ts   # Create/resume/poll cycle lifecycle
├── state.test.ts             # State persistence, agent tracking, wisdom accumulation
└── integration.test.ts       # End-to-end: start Ralph → spawn agents → verify tracking
```

Key test scenarios:
1. **Fresh start** — No existing session → `createSession` called with charter
2. **Resume** — Existing session → `resumeSession` called, no charter re-injection
3. **Crash recovery** — Session ends with error → next cycle creates new session → state preserved via `state.json`
4. **Agent tracking** — Spawn 3 agents → verify Ralph's state tracks all 3 → complete 2 → verify state updated
5. **Wisdom accumulation** — Ralph responds with `[LEARNING] ...` → verify wisdom array grows → verify 100-entry cap

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK session storage grows unbounded on disk | MEDIUM | Infinite sessions compaction handles context. `state.json` is small (<10KB). SDK `deleteSession()` available for cleanup. |
| Ralph's resumed session has stale context after repo changes | MEDIUM | Poll prompts include fresh agent status from pool. Critical context re-injected each cycle. Charter/decisions changes picked up naturally via Scribe. |
| Deterministic session ID causes conflicts if two `squad watch` processes run | LOW | `state.json` lock file (advisory). Second process detects existing session via `listSessions()` and warns. |
| `infiniteSessions` compaction loses important Ralph observations | LOW | Compaction preserves recent context + summaries. `state.json` stores structured wisdom separately from session context. |
| MCP server for GitHub not available in all environments | LOW | Graceful fallback: if MCP not configured, Ralph uses `gh` CLI tools (always available in Copilot sessions). |

## Success Metrics

1. **Zero context re-read on resume** — `resumeSession` succeeds without re-injecting charter/history. Ralph references prior cycle observations from session history.
2. **Token savings** — Compare token usage for 10 poll cycles: old (10 × full context load) vs. new (1 initial + 9 deltas). Target: 70% reduction.
3. **Crash recovery < 60s** — Kill Ralph's process → `squad watch` recreates session within one poll interval (30s) → next cycle succeeds with state preserved.
4. **Agent tracking latency < 5s** — Spawn agent → Ralph's state reflects the spawn within one event bus cycle (not waiting for next poll).
5. **Wisdom accumulation works** — After 50 cycles, `state.json` contains at least 5 wisdom entries. After 200 cycles, count is capped at 100.
6. **Cloud heartbeat unaffected** — `squad-heartbeat.yml` runs independently, no SDK dependency, same label automation.

## Open Questions

1. Should Ralph's session use `streaming: true` for faster event awareness? Or is poll-based sufficient for a monitor agent?
2. How should Ralph handle GitHub rate limits when scanning issues via `gh` CLI in rapid succession?
3. Should Ralph's wisdom entries be shared with other agents (via `squad_memory` tool)? Or is Ralph's wisdom private?
4. If the SDK adds a `session.subscribe()` API for cross-session event streams (not just lifecycle events), should Ralph use that instead of the EventBus? This would let Ralph observe tool calls in other agent sessions.
