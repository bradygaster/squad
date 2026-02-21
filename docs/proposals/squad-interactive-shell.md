# Proposal: Squad Interactive Shell — Own the Coordination UX

**Status:** Draft  
**Author:** Keaton (Lead)  
**Date:** 2026-02-21  
**Related:** `.squad/decisions/inbox/copilot-directive-2026-02-21T202535Z.md`

---

## Problem Statement

Squad currently depends on the GitHub Copilot CLI as the primary interactive layer. Users invoke `gh copilot`, which then spawns Squad agents through VS Code's `runSubagent` API or MCP-based delegation. This dependency creates three critical problems:

### 1. **Unreliable Handoffs**
The Copilot CLI's agent handoff mechanism is opaque. When Copilot decides to delegate to Squad, the transition is:
- **Non-deterministic** — Copilot's routing logic determines when/if Squad gets control
- **Invisible** — Users can't see when handoff occurs or what context was passed
- **One-way** — Once Squad completes, control returns to Copilot with no feedback loop

**Evidence:** User reports (Brady's directive) indicate handoffs fail silently or provide no indication Squad was even invoked.

### 2. **No Agent Visibility**
Squad spawns multiple background agents (`mode: "background"`). Current architecture:
- Users see **zero indication** agents are running
- No status panel, no live updates, no completion notifications
- Silent success mitigation (7-10% of spawns produce no output) is invisible to users
- Debugging multi-agent work requires reading `.squad/orchestration-log/` after the fact

**Impact:** Users have no mental model of what Squad is doing. Trust erodes when work happens invisibly.

### 3. **UX Controlled by External Tooling**
Copilot CLI owns:
- Terminal output formatting
- Streaming presentation
- Tool call rendering
- Error display
- Interactive prompts

Squad has **zero control** over how its work is presented. UX improvements require changes to Copilot CLI, not Squad.

**Reality check:** Squad is building a multi-agent coordination platform. The coordination UX is the product. Delegating UX to an external tool is an architectural mismatch.

---

## Proposed Architecture

### Core Concept

**Squad becomes a REPL/shell.** Users launch `squad` (no arguments) and enter an interactive session where they talk directly to the team. Squad handles:
- Terminal UI (prompt, output rendering, live status)
- Agent spawning and lifecycle
- Coordination logic and routing
- Real-time visibility into agent work

**Copilot SDK becomes the LLM backend.** Squad shells out to SDK for:
- Streaming completions (via `CopilotSession.sendMessage()`)
- Tool dispatch (Squad registers tools, SDK invokes handlers)
- Model selection and token management

### Terminal UI Approach

**Recommendation: `ink` (React for CLIs)**

**Justification:**
- **Component model** — Agent status panel, message stream, and input prompt are distinct React components
- **State management** — React hooks handle streaming state cleanly (useEffect for event listeners)
- **Battle-tested** — Used by Gatsby, Yarn 2, Parcel. Mature ecosystem.
- **No raw ANSI** — Declarative UI avoids cursor position math and escape code fragility
- **Testing** — `ink-testing-library` enables unit tests for UI components

**Alternatives considered:**
- **`readline`** — Too low-level. Requires manual cursor management and ANSI sequences. No live update support without complex state tracking.
- **`blessed`** — Powerful but overcomplicated for our needs. Older API, less active maintenance.
- **Raw ANSI** — Brittle. Cross-platform cursor behavior is unpredictable. Not testable.

**Trade-off:** `ink` adds a dependency (~200KB). Acceptable given zero-dep CLI scaffolding (init/upgrade) stays separate. Interactive shell is opt-in.

### Subcommand Coexistence

**`squad` with no args → enters interactive shell**

Existing subcommands remain unchanged:
```bash
squad init          # Initialize Squad (current behavior)
squad upgrade       # Update Squad-owned files
squad watch         # Run Ralph's work monitor
squad export        # Export squad to JSON
squad import <file> # Import from export file
squad plugin        # Manage plugin marketplaces
squad copilot       # Manage @copilot agent
squad scrub-emails  # Remove email addresses
squad help          # Show help
squad --version     # Print version
```

**Implementation:**
```typescript
// src/index.ts (main entry point)
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  // No args or explicit 'shell' command → interactive mode
  if (!cmd || cmd === 'shell') {
    const { runShell } = await import('./cli/shell/index.js');
    await runShell();
    return;
  }

  // Existing subcommand routing continues below...
}
```

**No breaking changes.** Existing workflows (CI scripts, automation) are unaffected.

### Copilot SDK as LLM Backend

**What Squad uses from SDK:**

1. **Session management:**
   ```typescript
   import { SquadClientWithPool } from '@bradygaster/squad';
   
   const client = new SquadClientWithPool({ pool: { maxConcurrent: 5 } });
   await client.connect();
   const session = await client.createSession({ 
     model: 'claude-sonnet-4.5',
     streaming: true 
   });
   ```

2. **Streaming completions:**
   ```typescript
   import { StreamingPipeline } from '@bradygaster/squad/runtime/streaming';
   
   const pipeline = new StreamingPipeline();
   pipeline.attachToSession(session.sessionId);
   
   pipeline.onDelta((evt) => {
     // evt.content → feed to ink render component
   });
   
   pipeline.onUsage((evt) => {
     // evt.inputTokens, evt.outputTokens → update status bar
   });
   ```

3. **Tool dispatch:**
   ```typescript
   const session = await client.createSession({
     tools: [
       { name: 'spawn_agent', handler: spawnAgentTool },
       { name: 'write_file', handler: writeFileTool },
       // ... Squad's existing tool implementations
     ]
   });
   ```

**What Squad does NOT use:**
- ❌ Copilot CLI spawning (Squad IS the CLI now)
- ❌ VS Code `runSubagent` (that's for VS Code extension only)
- ❌ MCP server delegation (Squad talks directly to SDK)

**SDK capabilities confirmed (from exploration):**
- ✅ `SquadSession.sendMessage()` with streaming
- ✅ `StreamingPipeline` for delta/usage/reasoning events
- ✅ Tool registration via `SquadSessionConfig.tools`
- ✅ Cross-session event bus (`EventBus`)
- ✅ Session pooling (`SquadClientWithPool`)

**No SDK surface area gaps identified.** All required APIs exist.

### Agent Spawning Model

**Current model (Copilot CLI dependency):**
- Coordinator spawns agents via `task` tool
- Task tool delegates to Copilot CLI's `agent_type` routing
- Copilot CLI spawns new Copilot session, returns result
- No visibility into background agents

**New model (Squad-owned):**
- Coordinator spawns agents directly via SDK:
  ```typescript
  const agentSession = await client.createSession({
    model: selectModelForAgent(agentName),
    systemPrompt: compileCharterFull(agentName),
    tools: getToolsForAgent(agentName),
    streaming: true
  });
  
  await agentSession.sendMessage({ prompt: taskDescription });
  ```

- Background agents run in separate sessions (tracked in registry)
- UI displays live status for each active session
- On completion, coordinator reads session result and updates task state

**Session lifecycle:**
- **Sync agents:** Create session → send message → await completion → close session
- **Background agents:** Create session → send message → track in registry → poll for completion → close when done
- **Persistent agents (Ralph):** Create session at shell startup → keep alive → close on shell exit

**No more Copilot CLI in the loop.** Squad owns the full lifecycle.

### Real-Time Agent Visibility

**UI layout (ink components):**

```
┌─────────────────────────────────────────────────────────────┐
│ Squad Shell v0.7.0                        [5 agents active] │
├─────────────────────────────────────────────────────────────┤
│ Agents:                                                     │
│  🏗️  Keaton      [idle]                                     │
│  🔧 Fenster      [working] Implementing session pool...     │
│  🧪 Hockney      [working] Writing tests for...            │
│  📋 Scribe       [background] Logging session...           │
│  🔄 Ralph        [watching] Next check in 8m               │
├─────────────────────────────────────────────────────────────┤
│ Coordinator: Routing task to Fenster and Hockney...        │
│                                                             │
│ > |                                                         │
└─────────────────────────────────────────────────────────────┘
```

**Status states:**
- **idle** — Session created, no active task
- **working** — Message sent, awaiting completion
- **background** — Running in background, no blocking
- **watching** — Persistent agent (Ralph) polling
- **error** — Tool call failed or session crashed

**Updates:**
- `StreamingPipeline.onDelta()` → append to agent's output buffer
- Session lifecycle events → update status badge
- Tool call events → show tool name + args (collapsible)

**Implementation:**
```tsx
// src/cli/shell/components/AgentPanel.tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export const AgentPanel = ({ agentRegistry }) => {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    const updateAgents = () => setAgents(agentRegistry.getAll());
    agentRegistry.on('update', updateAgents);
    return () => agentRegistry.off('update', updateAgents);
  }, [agentRegistry]);

  return (
    <Box flexDirection="column">
      {agents.map(agent => (
        <Text key={agent.name}>
          {agent.emoji} {agent.name.padEnd(12)} [{agent.status}] {agent.currentTask}
        </Text>
      ))}
    </Box>
  );
};
```

---

## What Changes

### Impact on Existing Waves/Milestones

**This becomes Wave 2 (after SDK Distribution).**

SDK work (Wave 1) must complete first — the shell depends on a clean npm-publishable SDK. Restructure as:

#### **Wave 2: Interactive Shell (after SDK ships)**
- **Scope:**
  - `squad` command enters REPL
  - Terminal UI with ink (agent panel, message stream, input prompt)
  - SDK session management (create, stream, tool dispatch)
  - Agent spawning via SDK (no Copilot CLI dependency)
  - Real-time agent status tracking
  - Coordinator integration (routing logic unchanged, spawning mechanism changed)
- **Deliverables:**
  - `src/cli/shell/` module (REPL logic, ink components)
  - `src/cli/shell/components/` (AgentPanel, MessageStream, InputPrompt)
  - `src/cli/shell/session-registry.ts` (track active agent sessions)
  - `src/cli/shell/spawn.ts` (SDK-based agent spawning)
  - Integration tests: `test/cli/shell/` (REPL startup, agent spawn, session cleanup)
- **Dependencies:** SDK APIs (already available), ink (new dependency)

#### **Wave 1: npm Distribution (UNCHANGED — completes first)**
- **Changes:**
  - Shell is bundled in `cli.js` (ink bundled via esbuild)
  - `npx github:bradygaster/squad` still works (shell is opt-in via `squad` with no args)
  - Insider branch testing includes shell UX validation
- **No scope change** — distribution mechanics stay the same

#### **Wave 3: SquadUI SDK Proposal (DEFERRED)**
- **Changes:**
  - SquadUI integration now targets Squad shell, not Copilot CLI
  - Web-based UI communicates with Squad shell via WebSocket or IPC
  - SquadUI becomes a frontend for the shell, not a standalone runtime
- **Timeline impact:** Deferred until Wave 0 completes (shell is the UX foundation)

#### **Wave 4: Public Docs (LAST)**
- **Changes:**
  - Docs now explain `squad` shell as primary interface
  - Copilot CLI integration documented as "VS Code mode" (via `squad.agent.md`)
  - Getting started guide: `npx github:bradygaster/squad init` → `squad` → talk to team
- **No timeline impact** — docs always come after runtime stabilizes

### What This Deprecates

**Copilot CLI as primary interface:**
- Users will no longer need `gh copilot` to use Squad
- `squad.agent.md` becomes a fallback for VS Code extension users (see "What Stays the Same")

**MCP server delegation path:**
- Squad no longer acts as an MCP server invoked by Copilot
- Squad is a first-class CLI, not a subprocess

---

## What Stays the Same

### 1. **`squad.agent.md` Still Works for Copilot-Native Users**

Users who prefer `gh copilot` workflows can still invoke Squad:
- `squad.agent.md` remains in the repo root
- Copilot CLI can spawn Squad via MCP or `runSubagent` (VS Code extension)
- Squad's agent charters are compatible with both shell mode and Copilot-spawned mode

**No loss of functionality.** Copilot CLI integration is preserved as a secondary path.

### 2. **VS Code Mode Still Works**

VS Code extension users:
- Select Squad agent from Copilot agent picker
- VS Code calls `runSubagent()` with Squad's extension ID
- Squad spawns in extension host, uses SDK session (same backend as shell)

**The shell and VS Code mode share the same SDK integration layer.** Only the frontend differs (terminal UI vs. VS Code chat panel).

### 3. **All CLI Subcommands Unchanged**

`squad init`, `squad watch`, `squad export`, etc. — zero changes. Existing automation scripts continue working.

### 4. **Team State (`.squad/`) Format Unchanged**

Agent charters, history files, decisions log — all file formats stay identical. The shell reads/writes the same `.squad/` structure.

### 5. **Coordinator Logic Unchanged**

Routing rules, response tiers, agent selection — same algorithms. Only the spawning mechanism changes (SDK instead of Copilot CLI).

---

## Key Decisions Needed

### 1. **Terminal UI Library: `ink` (recommended) or alternatives?**

**Recommendation:** `ink`  
**Alternatives:** `blessed`, raw readline  
**Decision rationale:** See "Terminal UI Approach" section above.

**Needs sign-off from:** Brady (product direction), Fortier (runtime performance)

### 2. **Streaming Architecture: Event-driven or polling?**

**Recommendation:** Event-driven (`StreamingPipeline.onDelta()`)  
**Alternatives:** Poll session state every 100ms  
**Decision rationale:** SDK emits events. Polling adds latency and wastes CPU.

**Needs sign-off from:** Fortier (runtime)

### 3. **Tool Dispatch: SDK tools or custom IPC?**

**Recommendation:** SDK tools (`SquadSessionConfig.tools`)  
**Alternatives:** Custom IPC (Squad shell listens on Unix socket, SDK sends requests)  
**Decision rationale:** SDK tools are the native pattern. Custom IPC adds complexity.

**Needs sign-off from:** Kujan (SDK expert)

### 4. **Session Lifecycle: One session per agent or shared session pool?**

**Recommendation:** One session per agent (tracked in registry)  
**Alternatives:** All agents share a single session (coordinator multiplexes)  
**Decision rationale:** Separate sessions enable parallel agent work and independent lifecycle management.

**Needs sign-off from:** Fenster (core dev), Fortier (runtime)

### 5. **Background Agent Cleanup: Timeout or explicit close?**

**Recommendation:** Explicit close (coordinator calls `session.close()` when done)  
**Alternatives:** Auto-timeout after 5 minutes idle  
**Decision rationale:** Explicit close is deterministic. Timeouts cause resource leaks if coordinator crashes.

**Needs sign-off from:** Fenster (core dev)

---

## Risks and Mitigations

### Risk 1: **`ink` Dependency Size**

**Risk:** Adding `ink` (~200KB) increases CLI bundle size.  
**Likelihood:** Certain (it's a dependency).  
**Impact:** Medium — users on slow connections see longer download times.

**Mitigation:**
- Interactive shell is opt-in (`squad` with no args)
- Users running `squad init` or `squad watch` never load ink (lazy import)
- esbuild tree-shaking removes unused ink components
- Measure: Run `esbuild --bundle --metafile` and confirm CLI stays under 500KB

### Risk 2: **SDK Streaming Reliability**

**Risk:** SDK streaming events might drop messages or arrive out of order.  
**Likelihood:** Low (SDK is production-grade).  
**Impact:** High — broken streaming makes shell unusable.

**Mitigation:**
- Add integration test: Send 1000-message stream, verify all deltas arrive in order
- Implement fallback: If streaming fails, fall back to polling session state
- Log all SDK events to `.squad/orchestration-log/sdk-events.jsonl` for debugging

### Risk 3: **Cross-Platform Terminal Compatibility**

**Risk:** Terminal behavior differs on Windows (cmd.exe, PowerShell) vs. Unix (bash, zsh).  
**Likelihood:** Medium (known issue with ANSI support on Windows).  
**Impact:** Medium — Windows users see broken UI.

**Mitigation:**
- `ink` handles cross-platform rendering (uses `ansi-escapes` and `cli-cursor`)
- Test on: macOS (Terminal.app), Windows 11 (Windows Terminal), Linux (gnome-terminal)
- If Windows breaks, provide fallback: `squad shell --simple-mode` (plain text, no live updates)

### Risk 4: **Agent Spawn Latency**

**Risk:** Creating new SDK sessions on every agent spawn is slower than reusing sessions.  
**Likelihood:** Medium (session creation takes ~200-500ms).  
**Impact:** Low — users tolerate sub-second delays.

**Mitigation:**
- Implement session pooling: Pre-create 3 idle sessions, reuse for agent spawns
- Measure: Log session creation time in telemetry
- If latency exceeds 1 second, prioritize pooling in Wave 0.1

### Risk 5: **Memory Leaks from Long-Running Shell**

**Risk:** Shell runs for hours. Streaming buffers or unclosed sessions leak memory.  
**Likelihood:** Medium (common issue in Node.js long-running processes).  
**Impact:** High — shell crashes after extended use.

**Mitigation:**
- Implement session cleanup: Close sessions after agent completes
- Limit output buffer size: Truncate agent output to last 1000 lines
- Add health check: Monitor `process.memoryUsage()`, warn if RSS exceeds 500MB
- Integration test: Run shell for 1 hour with 50 agent spawns, verify memory stays flat

---

## Scope

### What's In — v1 of the Shell

**Core functionality:**
- Launch shell with `squad` (no args)
- Display live agent panel (status, current task)
- Stream coordinator + agent output to terminal
- Input prompt with readline support (history, autocomplete for agent names)
- Agent spawning via SDK (sync and background modes)
- Session lifecycle management (create, track, close)
- Clean exit (`Ctrl+C` or `exit` command)

**Commands in shell:**
- `exit` / `quit` — Close shell
- `@AgentName <message>` — Direct message to specific agent
- `<message>` — Send to coordinator (routes to agents)
- `/status` — Show agent registry state
- `/history` — Show recent messages
- `/clear` — Clear terminal

**Testing:**
- Unit tests for ink components (AgentPanel, MessageStream)
- Integration tests for shell lifecycle (startup, spawn, shutdown)
- Smoke test: `squad` → send message → verify output → `exit`

### What's Deferred — Post-v1

**Not in initial release:**
- ❌ Web-based SquadUI (Wave 2)
- ❌ Agent logs viewer in shell (read `.squad/orchestration-log/` for now)
- ❌ Multi-line input (press Enter to send; no Shift+Enter for newline)
- ❌ Syntax highlighting for code blocks
- ❌ Message editing / retry
- ❌ Session persistence (shell state not saved across restarts)
- ❌ Remote shell (no SSH/WebSocket access to running shell)
- ❌ Agent introspection commands (`/inspect Fenster` → show charter, tools, state)
- ❌ Tab completion for commands (only agent names autocomplete)

**Rationale:** Deliver core UX first. Polish comes in Wave 0.1 and beyond.

---

## Implementation Plan (High-Level)

**Wave 2 Sub-milestones:**

### **M2.1: Shell Scaffolding**
- Create `src/cli/shell/` module
- Add ink to `package.json` (`npm install ink`)
- Implement `runShell()` entry point (loads ink, renders placeholder UI)
- Wire up `src/index.ts` to call `runShell()` when no args
- **Deliverable:** `squad` enters shell, shows static UI, `Ctrl+C` exits

### **M2.2: SDK Integration**
- Implement `src/cli/shell/spawn.ts` (agent spawning via SDK)
- Wire up `StreamingPipeline` to ink render loop
- Add session registry (`src/cli/shell/session-registry.ts`)
- **Deliverable:** Shell can spawn agent, stream output, track session

### **M2.3: Agent Panel UI**
- Implement `AgentPanel` component (shows agent list + status)
- Add status update logic (listen to session events, update registry)
- **Deliverable:** Agent panel shows live status (idle, working, background)

### **M2.4: Input Prompt**
- Implement `InputPrompt` component (readline-based input)
- Add message routing (coordinator, direct messages, slash commands)
- **Deliverable:** User can type messages, see responses

### **M2.5: Testing & Polish**
- Write integration tests (shell lifecycle, agent spawn, cleanup)
- Test on macOS, Windows, Linux
- Fix bugs, handle edge cases (session crashes, network failures)
- **Deliverable:** Shell works reliably across platforms

### **M2.6: Documentation**
- Update README (add "Interactive Shell" section)
- Write `docs/guide/shell.md` (shell commands, agent panel, status codes)
- **Deliverable:** Users know how to use shell

**Timeline estimate:** 2-3 weeks (assuming 1 engineer full-time).

---

## Success Criteria

**The shell is successful if:**

1. **Users can launch Squad without Copilot CLI.**
   - Verification: Run `npx github:bradygaster/squad init` → `squad` → send message → see response.

2. **Agent work is visible in real-time.**
   - Verification: Spawn background agent, see status change from idle → working → done in <1 second.

3. **SDK integration is reliable.**
   - Verification: Send 100 messages in shell, all stream correctly, zero crashes.

4. **Shell is faster than Copilot CLI for Squad tasks.**
   - Baseline: Copilot CLI handoff adds ~2-5 seconds latency.
   - Target: Squad shell responds in <500ms (from message sent to first token streamed).

5. **Users prefer the shell over Copilot CLI.**
   - Metric: Brady uses shell for 80%+ of Squad interactions (manual tracking).

---

## Open Questions

1. **How should shell state persist across restarts?**
   - Current proposal: No persistence (stateless shell). Each launch is a fresh session.
   - Alternative: Save session IDs to `.squad/shell-state.json`, resume on next launch.

2. **Should Ralph run inside the shell or as a separate process?**
   - Current proposal: Ralph session created at shell startup, kept alive.
   - Alternative: Ralph remains a standalone `squad watch` process.

3. **What's the migration path for existing Copilot CLI users?**
   - Current proposal: No migration needed (`squad.agent.md` still works).
   - Alternative: Deprecate `squad.agent.md` in v2, force migration to shell.

4. **How do users share shell sessions with others (pair programming)?**
   - Current proposal: Out of scope for v1.
   - Alternative: Add `squad shell --share` → starts WebSocket server, generates join URL.

---

## Appendix: Prior Art

**Similar interactive shells in dev tooling:**

- **Yarn 2+ CLI** — Uses `ink` for interactive UI (install progress, dependency resolution)
- **Parcel bundler** — `ink`-based terminal UI (build status, hot reload feedback)
- **git cli (via forgit)** — Interactive git commands with fzf
- **gh cli** — GitHub's CLI with interactive PR/issue pickers
- **npm interactive** — Package search/install via terminal UI

**Patterns we can borrow:**
- Yarn's "build tree" display (shows nested task status)
- Parcel's streaming logs (unbuffered output with live updates)
- gh's pager integration (press `q` to exit long output)

**Anti-patterns to avoid:**
- Don't hijack terminal (always allow `Ctrl+C` to exit)
- Don't buffer output (stream immediately, even partial lines)
- Don't assume color support (detect with `supports-color` package)
