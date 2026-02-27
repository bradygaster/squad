# SDK Technical Mapping — Squad Replatforming Analysis

**Author:** Fenster (Core Dev)  
**Date:** 2026-02-20  
**Context:** Brady requested evaluation of replatforming Squad on the GitHub Copilot SDK (@github/copilot-sdk v0.1.8). This document provides a deep technical analysis of how Squad's current runtime maps to SDK primitives, what we gain, and what we must preserve outside SDK boundaries.

---

## Executive Summary

The SDK is **highly viable** for Squad replatforming with significant gains in maintainability and capability. ~75% of Squad's current runtime maps directly to SDK primitives. The critical unmapped features (casting system, decision inbox, Ralph's monitor loop, template installer) are intentionally outside the SDK's scope and must remain Squad-specific.

**Key Findings:**
- **Agent spawning via `task` tool** maps directly to SDK `customAgents` + `session.rpc.createCustomAgentSession()`
- **System message injection** maps to SDK `systemMessage.content` (append mode)
- **Tool control** maps to SDK `availableTools`/`excludedTools` config
- **MCP integration** maps to SDK `mcpServers` config with full local/remote support
- **Infinite sessions** already present in SDK (automatic compaction, workspace persistence)
- **Hooks system** provides pre/post tool interception Squad doesn't currently use

**Biggest Unlock:** The SDK's `customAgents` config + typed RPC layer gives us a **type-safe, protocol-versioned spawning API** to replace our current prompt-only `task` tool orchestration.

**Technical Debt Payoff:** Moving from "the entire runtime is a 32KB markdown file interpreted by the LLM" to SDK-managed sessions eliminates:
- Manual JSON-RPC command generation in prompts
- Model selection hacks (`model: "{resolved_model}"` strings in YAML)
- Platform detection workarounds (CLI vs VS Code)
- Version compatibility guessing

**Risk Assessment:** Low. The SDK wraps the same CLI we already use. Migration path is additive (keep current system working while layering in SDK).

---

## SDK ↔ Squad Feature Mapping

| Squad Feature | SDK Equivalent | Mapping Quality | Notes |
|--------------|----------------|-----------------|-------|
| **Agent Spawning** | | | |
| `task` tool with `agent_type` | `customAgents` config + `session.rpc.createCustomAgentSession()` | ✅ Direct | SDK `customAgents` defines agents; RPC method spawns sessions |
| `mode: "sync"/"background"` | Not applicable (all SDK sessions async) | ⚠️ Semantic mismatch | SDK sessions always async; caller awaits `sendAndWait()` for sync behavior |
| `description` param (for UI) | `customAgents[].displayName` | ✅ Direct | SDK has `name`, `displayName`, `description` |
| **System Message Control** | | | |
| Prompt injection (charter, history, decisions) | `systemMessage: { mode: "append", content: "..." }` | ✅ Direct | Append mode preserves SDK guardrails + adds custom content |
| Full prompt replacement | `systemMessage: { mode: "replace", content: "..." }` | ✅ Direct | Replace mode gives total control (removes SDK guardrails) |
| **Tool Control** | | | |
| `availableTools` allowlist | `availableTools: string[]` | ✅ Direct | Exact same API |
| `excludedTools` blocklist | `excludedTools: string[]` | ✅ Direct | Exact same API |
| Per-agent tool sets | `customAgents[].tools: string[]` | ✅ Direct | SDK supports per-agent tool filtering |
| **Model Selection** | | | |
| `model: "claude-sonnet-4.5"` | `model: "claude-sonnet-4.5"` in session config | ✅ Direct | SDK `SessionConfig.model` |
| Per-agent model override | Custom agent session model param | ⚠️ Workaround needed | `createCustomAgentSession` doesn't accept model override; needs prompt-level detection or SDK enhancement |
| `listModels()` for discovery | `client.listModels()` | ✅ Direct | SDK has full model metadata API |
| **MCP Server Integration** | | | |
| Local stdio MCP servers | `mcpServers: { [name]: { type: "local", command, args, tools } }` | ✅ Direct | SDK has full local MCP support |
| Remote HTTP/SSE servers | `mcpServers: { [name]: { type: "http"\|"sse", url, headers, tools } }` | ✅ Direct | SDK supports remote MCP |
| MCP tool filtering | `mcpServers[name].tools: string[]` | ✅ Direct | Per-server tool allowlist |
| **Permission Handling** | | | |
| Auto-approve all (current default) | `onPermissionRequest: approveAll` | ✅ Direct | SDK exports `approveAll` helper |
| Custom permission logic | `onPermissionRequest: (req, inv) => {...}` | ✅ Direct | Full handler API |
| **Event Handling** | | | |
| Session events (40+ types) | `session.on((event) => {...})` | ✅ Direct | SDK has typed event system |
| Tool execution events | `session.on("tool.execution_start", ...)` | ✅ Direct | SDK emits tool lifecycle events |
| Assistant message streaming | `streaming: true` + `session.on("assistant.message_delta", ...)` | ✅ Direct | SDK supports streaming mode |
| **Session Management** | | | |
| Create session | `client.createSession(config)` | ✅ Direct | SDK core API |
| Resume session | `client.resumeSession(sessionId, config)` | ✅ Direct | SDK core API |
| List sessions | `client.listSessions(filter?)` | ✅ Direct | SDK has full session listing with filters |
| Delete session | `client.deleteSession(sessionId)` | ✅ Direct | SDK core API |
| Get last session | `client.getLastSessionId()` | ✅ Direct | SDK utility method |
| **Infinite Sessions** | | | |
| Automatic context compaction | `infiniteSessions: { enabled: true, backgroundCompactionThreshold: 0.80 }` | ✅ Direct | SDK default (enabled unless disabled) |
| Workspace persistence | `session.workspacePath` | ✅ Direct | SDK provides path to checkpoints/plan.md/files dirs |
| **Authentication** | | | |
| GitHub token via env | `githubToken: process.env.GITHUB_TOKEN` | ✅ Direct | SDK `CopilotClientOptions.githubToken` |
| Use logged-in user | `useLoggedInUser: true` | ✅ Direct | SDK default (true unless token provided) |
| Get auth status | `client.getAuthStatus()` | ✅ Direct | SDK returns auth type, user, host |
| **Custom Tools** | | | |
| Define custom tools | `defineTool(name, { description, parameters, handler })` | ✅ Direct | SDK helper with Zod type inference |
| Tool handlers | `async (args, invocation) => result` | ✅ Direct | SDK typed invocation context |
| **Hooks (NEW)** | | | |
| Pre-tool use (permission, modify args) | `hooks: { onPreToolUse: (input, inv) => {...} }` | 🆕 Not currently used | SDK feature Squad doesn't have yet |
| Post-tool use (modify results) | `hooks: { onPostToolUse: (input, inv) => {...} }` | 🆕 Not currently used | SDK feature Squad doesn't have yet |
| User prompt submitted | `hooks: { onUserPromptSubmitted: (input, inv) => {...} }` | 🆕 Not currently used | SDK feature Squad doesn't have yet |
| Session start/end | `hooks: { onSessionStart, onSessionEnd }` | 🆕 Not currently used | SDK lifecycle hooks |
| Error handling | `hooks: { onErrorOccurred }` | 🆕 Not currently used | Custom error handling |
| **Skills (NEW)** | | | |
| Skill directories | `skillDirectories: ["./skills/code-review", ...]` | 🆕 Not currently used | SDK feature for reusable prompt/tool modules |
| Disable skills | `disabledSkills: ["experimental-feature"]` | 🆕 Not currently used | Per-session skill control |
| **Advanced** | | | |
| Custom provider (BYOK) | `provider: { type: "openai", baseUrl, apiKey }` | ✅ Direct | SDK supports OpenAI, Azure, Anthropic |
| Working directory | `workingDirectory: path` | ✅ Direct | SDK session-level CWD |
| Config directory | `configDir: path` | ✅ Direct | Override `.copilot/` location |
| Session context (git info) | `session.context: { cwd, gitRoot, repository, branch }` | ✅ Direct | SDK provides git metadata |

---

## Squad-Specific Features (No SDK Equivalent)

These are **intentionally outside the SDK's scope** — they are Squad's domain-specific orchestration logic and must remain in the Squad runtime:

### 1. **Casting System**
- **What:** Character-based agent naming (Ripley, Fenster, Verbal) from universe templates (Alien, Usual Suspects, etc.)
- **Why No SDK:** The SDK is a generic CLI control plane. Casting is a Squad UX innovation.
- **Location:** `index.js` casting logic, `.squad/casting/policy.json`, `registry.json`, `history.json`
- **Keep As-Is:** Yes. This is Squad's identity. SDK doesn't care about agent names.

### 2. **Decision Inbox / Drop-Box Pattern**
- **What:** Agents write decisions to `.squad/decisions/inbox/{agent}-{slug}.md`, Scribe merges to canonical `decisions.md`
- **Why No SDK:** SDK doesn't have file-based IPC for parallel agents. This is Squad's architecture.
- **Location:** Spawn prompt template, Scribe charter
- **Keep As-Is:** Yes. This eliminates write conflicts during parallel spawns — core to Squad's fan-out model.

### 3. **Ralph's Work Monitor Loop**
- **What:** Background agent that polls incoming queue, monitors agent progress, sends updates
- **Why No SDK:** SDK doesn't have work queue primitives. This is Squad's orchestration layer.
- **Location:** Ralph's charter, incoming queue SQL, orchestration log
- **Keep As-Is:** Yes. Ralph is Squad's async comms backbone.

### 4. **Template Copying System (npx create-squad)**
- **What:** `index.js` copies `.github/agents/squad.agent.md` and `templates/` to consumer repos
- **Why No SDK:** SDK is a runtime library, not an installer. Squad needs distribution logic.
- **Location:** `index.js`, `templates/`, CLI commands (`squad init`, `squad upgrade`)
- **Keep As-Is:** Yes. SDK doesn't solve distribution. We still need the CLI installer.

### 5. **Tier-Based Response Modes (Direct/Lightweight/Standard/Full)**
- **What:** Coordinator decides whether to answer directly, spawn with minimal context, or full ceremony
- **Why No SDK:** This is Squad's prompt-level orchestration heuristic, not a protocol feature.
- **Location:** squad.agent.md "Tiered Response Modes" section
- **Keep As-Is:** Yes. SDK doesn't have "tier" concept — this is Squad's latency optimization.

### 6. **Ceremony Templates (Charter/History/Decisions injection)**
- **What:** Standard/Full mode agents read their charter, history, decisions before working
- **Why No SDK:** SDK provides `systemMessage` injection but doesn't define *what* to inject. Squad's templates are domain logic.
- **Location:** squad.agent.md spawn templates
- **Keep As-Is:** Yes. SDK is the transport; Squad defines the ceremony.

### 7. **Worktree-Local State Strategy**
- **What:** `.squad/` is worktree-local (not shared across Git worktrees), decisions merge via `union` driver
- **Why No SDK:** This is Git-level state management, not runtime concern.
- **Location:** `.gitattributes`, squad.agent.md "Worktree Awareness" section
- **Keep As-Is:** Yes. SDK doesn't touch Git strategy.

### 8. **GitHub Actions Automation Templates**
- **What:** `squad init` generates workflows for heartbeat, triage, label enforcement, CI, release
- **Why No SDK:** SDK is a library, not a project scaffolder. Squad owns the DevOps template layer.
- **Location:** `templates/workflows/`, `index.js` workflow generation
- **Keep As-Is:** Yes. SDK doesn't do repo setup.

---

## SDK Primitives Squad Should Adopt

These are SDK features Squad doesn't currently use but **would improve the system**:

### 1. **Hooks System — Pre-Tool Use**
**What:** `onPreToolUse` hook intercepts tool calls before execution  
**Use Case:** Permission control, argument sanitization, logging  
**Squad Benefit:** Replace prompt-level instructions ("never use task tool to spawn another coordinator") with **runtime enforcement**:
```typescript
hooks: {
  onPreToolUse: (input, inv) => {
    if (input.toolName === "task" && isCoordinatorSession(inv.sessionId)) {
      return { permissionDecision: "deny", permissionDecisionReason: "Coordinator may not spawn agents recursively" };
    }
    return { permissionDecision: "allow" };
  }
}
```
**Impact:** Prevents coordinator self-spawning bug (current failure mode: infinite loop). Moves constraint from LLM memory to SDK enforcement.

### 2. **Hooks System — Post-Tool Use**
**What:** `onPostToolUse` hook modifies tool results before LLM sees them  
**Use Case:** Result filtering, logging, augmentation  
**Squad Benefit:** Inject context breadcrumbs into tool results:
```typescript
hooks: {
  onPostToolUse: (input, inv) => {
    if (input.toolName === "view" && input.toolResult.textResultForLlm.includes("charter.md")) {
      return {
        additionalContext: `This agent is ${getAgentName(inv.sessionId)}. Their primary concern is ${getPrimaryConcern(inv.sessionId)}.`
      };
    }
  }
}
```
**Impact:** Agents get role-aware context automatically when reading their own charter — improves adherence to specialization.

### 3. **Skills System**
**What:** `skillDirectories` loads reusable prompt/tool modules  
**Use Case:** Package domain expertise (e.g., "code review skill", "API design skill")  
**Squad Benefit:** Replace `.squad/skills/{name}/SKILL.md` ad-hoc pattern with SDK-native skill loading:
```typescript
await client.createSession({
  skillDirectories: [".squad/skills"],
  disabledSkills: ["experimental-websocket-skill"] // per-session control
});
```
**Impact:** Skills become portable across Squad instances. Agent charters can reference skills declaratively instead of reading files manually.

### 4. **User Input Handler (`onUserInputRequest`)**
**What:** Enables `ask_user` tool — agent can prompt user during execution  
**Use Case:** Clarifying questions, confirmation dialogs  
**Squad Benefit:** Agents can request disambiguation **without spawning the coordinator**:
```typescript
onUserInputRequest: async (req, inv) => {
  console.log(`[${getAgentName(inv.sessionId)}] ${req.question}`);
  if (req.choices) {
    console.log("Choices:", req.choices);
  }
  const answer = await readline.question("Your answer: ");
  return { answer, wasFreeform: !req.choices };
}
```
**Impact:** Agents gain interactive capability (currently must write to inbox and wait for coordinator). Reduces orchestration round-trips.

### 5. **Session Context (`session.context`)**
**What:** SDK automatically captures `cwd`, `gitRoot`, `repository`, `branch` at session creation  
**Use Case:** Agents know their Git context without running `git` commands  
**Squad Benefit:** Replace manual `git rev-parse --show-toplevel` in spawn prompts with:
```typescript
const session = await client.createSession({ workingDirectory: process.cwd() });
console.log(session.context.repository); // "bradygaster/squad"
console.log(session.context.branch);     // "dev"
```
**Impact:** Eliminates ~5 lines per spawn prompt. Context is protocol-guaranteed, not LLM-parsed.

### 6. **Typed Session RPC (`session.rpc.*`)**
**What:** SDK exposes typed methods for session operations instead of raw `sendRequest`  
**Use Case:** Type-safe session control, better IDE support  
**Squad Benefit:** Replace raw JSON-RPC strings in prompts with typed SDK calls:
```typescript
// Current (prompt-based):
// "Call task tool with agent_type: 'general-purpose', prompt: '...'"

// SDK (type-safe):
const agentSession = await session.rpc.createCustomAgentSession({
  agentName: "fenster",
  prompt: "Refactor auth module",
  model: "claude-sonnet-4.5"
});
```
**Impact:** Type safety, protocol version compatibility, IDE autocomplete. Reduces prompt surface area.

### 7. **Session Lifecycle Events**
**What:** `client.on("session.created", ...)` notifies when sessions are created/destroyed  
**Use Case:** Monitoring, logging, cleanup  
**Squad Benefit:** Ralph can observe all agent spawns **without polling**:
```typescript
client.on("session.created", (event) => {
  console.log(`Agent spawned: ${event.sessionId}`);
  ralphTracker.registerAgent(event.sessionId);
});
client.on("session.deleted", (event) => {
  ralphTracker.unregisterAgent(event.sessionId);
});
```
**Impact:** Ralph's monitor loop becomes event-driven instead of polling-based. Reduces latency.

---

## New Capabilities Unlocked

Features the SDK provides that Squad **cannot do today** (or does poorly):

### 1. **Multi-Session Management**
**SDK Capability:** `client.listSessions(filter)` returns all stored sessions with metadata  
**What We Can't Do Today:** Squad has no persistent session registry across coordinator restarts  
**Unlock:** Ralph can resume interrupted agents, show session history, clean up orphaned sessions

### 2. **Session Resumption**
**SDK Capability:** `client.resumeSession(sessionId)` continues a previous conversation with full history  
**What We Can't Do Today:** If coordinator crashes mid-work, agents lose context  
**Unlock:** Fault tolerance — coordinator can recover agents after restart

### 3. **Foreground/Background Session Control (TUI+Server Mode)**
**SDK Capability:** `client.setForegroundSessionId(id)` switches TUI focus programmatically  
**What We Can't Do Today:** CLI and VS Code sessions are separate worlds  
**Unlock:** Squad could orchestrate **across** CLI and VS Code — coordinator in CLI, agents in VS Code, all coordinated

### 4. **Streaming Message Deltas**
**SDK Capability:** `streaming: true` emits `assistant.message_delta` events as LLM generates  
**What We Can't Do Today:** All responses are atomic (wait for completion before seeing output)  
**Unlock:** Real-time agent progress in Ralph's dashboard, live typing indicators in Discord connector

### 5. **Protocol Version Negotiation**
**SDK Capability:** `client.getStatus()` returns CLI version + protocol version, SDK validates compatibility  
**What We Can't Do Today:** Squad assumes CLI supports features but doesn't check version  
**Unlock:** Squad can detect old CLI, warn user, or fall back to compatible feature set

### 6. **Custom Provider Support (BYOK)**
**SDK Capability:** `provider: { type: "openai", baseUrl, apiKey }` uses arbitrary OpenAI-compatible APIs  
**What We Can't Do Today:** Hard-coded to GitHub Copilot API  
**Unlock:** Squad can run on Ollama, Azure OpenAI, local models — enterprise airgap scenarios

### 7. **Per-Agent Working Directory**
**SDK Capability:** `workingDirectory` in session config sets CWD for tool operations  
**What We Can't Do Today:** All agents share coordinator's CWD, must `cd` manually  
**Unlock:** Agents can work in different worktrees or submodules concurrently without path conflicts

---

## Technical Risks & Dependencies

### Risk 1: **SDK is a New Dependency (Breaking Changes)**
- **Issue:** SDK is v0.1.8 — protocol may change
- **Mitigation:** Squad already depends on Copilot CLI, which SDK wraps. SDK's protocol version check prevents runtime mismatches. Pin SDK version, test upgrades.
- **Severity:** Low (SDK versioning matches CLI versioning)

### Risk 2: **SDK Doesn't Support Per-Agent Model Override**
- **Issue:** `createCustomAgentSession` doesn't accept `model` parameter (current gap)
- **Mitigation:** Two options: (1) Keep prompt-level model detection (current hack), (2) Request SDK enhancement (add `model` to custom agent session API)
- **Severity:** Medium (blocks full migration until resolved)
- **Workaround:** Use prompt-level detection for now; file SDK enhancement request

### Risk 3: **SDK Sessions Are Always Async**
- **Issue:** Squad's `mode: "sync"` doesn't map directly to SDK (SDK sessions are always async, caller awaits `sendAndWait()`)
- **Mitigation:** This is a semantic difference, not a blocker. `sendAndWait()` provides sync behavior from caller's perspective.
- **Severity:** Low (API change, not capability loss)

### Risk 4: **Prompt Surface Area Doesn't Shrink Much**
- **Issue:** Squad's spawn prompts are ~100 lines of YAML+markdown. SDK moves session creation to code but doesn't eliminate prompt size.
- **Mitigation:** SDK reduces ceremony (no manual JSON-RPC generation) but doesn't replace prompt content. That's Squad's domain logic — intentionally.
- **Severity:** Not a risk (misaligned expectation)

### Risk 5: **No Type Safety for Custom Agents**
- **Issue:** SDK's `customAgents` config is untyped (array of strings/objects) — Squad's agent registry isn't checked at compile time
- **Mitigation:** Build Squad-specific TypeScript types on top of SDK primitives. Validate agent names against registry at runtime.
- **Severity:** Low (TypeScript layer on top, not SDK gap)

### Dependency: **@github/copilot v0.0.411**
- **SDK Dependency:** `@github/copilot-sdk` depends on `@github/copilot` (the CLI binary)
- **Squad Impact:** Squad already has this transitive dependency. SDK formalizes it.
- **Version Coupling:** SDK's protocol version must match CLI version. SDK handles compatibility check.

---

## Implementation Complexity Assessment

### Phase 1: **SDK Client Wrapper (2-3 hours)**
- Create `squad-sdk-client.js` wrapping `CopilotClient`
- Initialize once per coordinator session
- Expose `createAgentSession(agentName, taskDescription, model)` helper
- **Output:** SDK client is initialized but not yet used by agents

### Phase 2: **Migrate Agent Spawning to SDK (6-8 hours)**
- Replace `task` tool prompt-based spawning with `client.createSession()` + `customAgents` config
- Register all Squad agents as `customAgents` at coordinator startup
- Preserve current spawn prompt structure (charter, history, decisions) in `customAgents[].prompt`
- **Output:** Agents spawn via SDK instead of raw `task` tool
- **Risk:** Model selection workaround needed (prompt-level detection until SDK supports per-agent model override)

### Phase 3: **Session Management Integration (4-6 hours)**
- Ralph polls `client.listSessions()` instead of reading orchestration log files
- Coordinator resumes agents via `client.resumeSession()` if crash recovery needed
- Store session IDs in orchestration log for traceability
- **Output:** Ralph has live session visibility, coordinator can recover from crashes

### Phase 4: **Adopt Hooks for Enforcement (3-4 hours)**
- Implement `onPreToolUse` to block coordinator self-spawn
- Implement `onPostToolUse` to inject agent context breadcrumbs
- Add `onUserInputRequest` for agent clarifying questions
- **Output:** Prompt-level constraints become runtime-enforced

### Phase 5: **Skills Migration (Optional, 4-5 hours)**
- Convert `.squad/skills/{name}/SKILL.md` to SDK skill directories
- Update agent charters to reference skills declaratively
- Test skill loading in multiple Squad instances
- **Output:** Skills become portable across repos

### **Total Effort Estimate: 19-26 hours** (2.5–3.5 days of focused work)

**Parallel Work Risk:** Low. Phases 1–3 are sequential (SDK client → spawning → session mgmt). Phase 4 can run parallel to Phase 5.

**Rollback Strategy:** Keep current `task` tool spawning as fallback. Introduce SDK spawning behind feature flag. If SDK path fails, fall back to prompt-based spawning. Migration is additive, not replacement.

---

## Recommendation

**Proceed with replatforming.** The SDK provides:
- Type safety and protocol versioning (eliminates current hacks)
- New capabilities (session resumption, streaming, BYOK, hooks)
- Maintainability (SDK tracks CLI changes, Squad doesn't)
- Foundation for future features (multi-session orchestration, event-driven Ralph, CLI+VS Code coordination)

**Migration Path:** Incremental (Phases 1–3 are MVP, Phases 4–5 are enhancements). Feature-flag the SDK path, keep `task` tool as fallback. Ship Phase 1–3 in v0.6.0, evaluate Phases 4–5 for v0.7.0.

**Blockers:** Only one — per-agent model override (Phase 2). Workaround: Keep prompt-level model detection until SDK adds `model` param to `createCustomAgentSession`. File enhancement request with SDK team.

**Next Steps:**
1. Brady approves approach
2. Fenster implements Phase 1 (SDK client wrapper)
3. Keaton designs Phase 2 (agent spawning migration) with model selection workaround
4. Hockney writes integration tests (SDK session lifecycle, hooks enforcement)
5. Ship Phase 1–3 as v0.6.0 beta, gather feedback
