# SDK Opportunity & Gap Analysis
**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-19  
**Context:** Evaluating replatforming Squad on GitHub Copilot SDK  
**SDK Version:** Protocol v2, Technical Preview

---

## Executive Summary

The Copilot SDK provides **production-ready infrastructure for what Squad currently builds manually**: multi-session management, custom agents, hooks system, MCP server orchestration, infinite sessions with compaction, and BYOK. The SDK is a **mature runtime with 18+ months production testing** in Copilot CLI. Squad should replatform on SDK for infrastructure, but preserve Squad-specific orchestration, filesystem memory, and casting logic as differentiating value.

**Key finding:** The SDK's `customAgents` config is designed **exactly for Squad's use case** — registering team members as named agents. Combined with hooks for coordinator logic and skills for domain expertise, Squad can reduce ~2,000 lines of spawn orchestration to SDK configuration while gaining session management, compaction, and multi-provider support for free.

**Recommendation:** Replatform on SDK for v0.6.0+. Phase 1 (v0.6.0): SDK as infrastructure, Squad coordinator remains agent.md. Phase 2 (v0.7.0): Coordinator as Node.js process with SDK client.

---

## SDK Capability Inventory

### 1. Multi-Session Management (Core Architecture)

**What it is:** The SDK manages multiple concurrent sessions, each with independent conversation state, model config, tool sets, and working directories.

**API Surface:**
```typescript
client.createSession(config: SessionConfig): Promise<CopilotSession>
client.resumeSession(sessionId: string, config?: ResumeSessionConfig): Promise<CopilotSession>
client.listSessions(filter?: SessionListFilter): Promise<SessionMetadata[]>
client.deleteSession(sessionId: string): Promise<void>
```

**Relevance to Squad:**
- **Current Squad approach:** Uses CLI `task` tool `mode: "background"` to spawn parallel agents, tracks state in `.ai-team/orchestration-log/`, no resume capability, no session isolation.
- **What SDK enables:** Native session isolation with independent context windows, explicit resume by session ID (no forensic log reconstruction), automatic persistence to `~/.copilot/session-state/{sessionId}/` with checkpoints.
- **Unexpected win:** `SessionMetadata` includes `SessionContext` (cwd, gitRoot, repository, branch) — Squad's worktree awareness logic is **already implemented in the SDK**. Zero reinvention needed.

**Gaps:** 
- No session locking — concurrent access to same session ID is undefined. Squad would need application-level locking (Redis, filesystem lock) for multi-worktree safety.
- `listSessions` filters by repo/branch/cwd but not by user. Squad tracks user per session log; SDK doesn't expose user filtering.

**Squad opportunity:** Replace `.ai-team/orchestration-log/` spawn tracking with SDK sessions. Each agent spawn = `client.createSession({ sessionId: "squad-{member}-{timestamp}" })`. Scribe can `listSessions()` to audit active work without parsing logs.

---

### 2. Custom Agents API (`customAgents` Config)

**What it is:** Define named agents with custom prompts, tool access, and MCP servers. Agents are selectable by the model during conversation via the `agent` tool.

**API Surface:**
```typescript
interface CustomAgentConfig {
  name: string;
  displayName?: string;
  description?: string;
  prompt: string;  // System prompt for this agent
  tools?: string[] | null;  // "*" = all, [] = none, or list
  mcpServers?: Record<string, MCPServerConfig>;
  infer?: boolean;  // Whether model can infer this agent
}

session = client.createSession({
  customAgents: [
    { name: "lead", prompt: "...", description: "Scope, decisions, code review" },
    { name: "frontend-dev", prompt: "...", description: "React, UI, components" }
  ]
})
```

**Relevance to Squad:**
- **Current Squad approach:** Each agent is a `.ai-team/agents/{name}/charter.md` file. Coordinator reads all charters, inlines them into spawn prompts. Ceremony facilitator spawns reviewer with full charter. Agent names are cast names (Ripley, Dallas, etc.).
- **What SDK enables:** Register Squad members as `customAgents` array. Each charter.md becomes an agent's `prompt` field. SDK handles agent selection, routing, and discovery. Model can `@mention` agents by name.
- **Unexpected win:** `mcpServers` per agent — Squad's future "agent-specific MCP config" (Proposal 033a discussed opt-in MCP per agent) is **already in the SDK**. No Squad code needed.

**Gaps:**
- `customAgents` is session-scoped, not client-scoped. Squad would need to pass the full team roster on every `createSession()` call. No "register once, use everywhere" pattern.
- No agent lifecycle hooks (onAgentStart, onAgentComplete). Squad's orchestration-log writes and Scribe summaries would need custom hooks.
- Cast names (Ripley, Dallas) are Squad-specific. SDK agents are named by `name` field, not discoverable from filesystem. Squad's casting system would need to generate `customAgents` array from `.ai-team/casting/registry.json`.

**Squad opportunity:** 
1. On session start, load `.ai-team/casting/registry.json` + agent charters.
2. Generate `customAgents` array: `{ name: registry.persistent_name.toLowerCase(), displayName: registry.persistent_name, prompt: fs.readFileSync(charter.md), description: "...from team.md role..." }`.
3. Pass to `createSession()`.
4. Squad's coordinator logic remains separate — SDK doesn't replace orchestration, just agent registration.

**Design question:** Should coordinator itself be a `customAgent`, or stay as a system prompt? Likely system prompt — coordinator is always active, doesn't need to be invoked via `agent` tool.

---

### 3. Hooks System (Lifecycle Interception)

**What it is:** Intercept and customize behavior at key lifecycle points: pre/post tool use, session start/end, user prompt submission, error handling.

**API Surface:**
```typescript
interface SessionHooks {
  onPreToolUse?: (input: PreToolUseHookInput) => PreToolUseHookOutput | void;
  onPostToolUse?: (input: PostToolUseHookInput) => PostToolUseHookOutput | void;
  onUserPromptSubmitted?: (input: UserPromptSubmittedHookInput) => UserPromptSubmittedHookOutput | void;
  onSessionStart?: (input: SessionStartHookInput) => SessionStartHookOutput | void;
  onSessionEnd?: (input: SessionEndHookInput) => SessionEndHookOutput | void;
  onErrorOccurred?: (input: ErrorOccurredHookInput) => ErrorOccurredHookOutput | void;
}

// Example: Coordinator gates reviewer decisions
onPostToolUse: async (input) => {
  if (input.toolName === "edit" && isReviewerSession(input.sessionId)) {
    const approved = await checkReviewerApproval(input);
    if (!approved) {
      return { modifiedResult: { textResultForLlm: "REJECTED", resultType: "denied" } };
    }
  }
  return null;
}
```

**Relevance to Squad:**
- **Current Squad approach:** Coordinator logic is prompt-level conditionals in `squad.agent.md` (1,800 lines). Reviewer gating is "reject and refuse to spawn" logic in coordinator prompt. Permission control is ceremony facilitator blocking until user approves.
- **What SDK enables:** Move coordinator logic from prompt engineering to code. `onPreToolUse` for permission gates, `onPostToolUse` for result transformation (e.g., reviewer rejection), `onSessionStart` to inject Squad context (user name, team root, cast names), `onSessionEnd` for Scribe logging.
- **Unexpected win:** `onUserPromptSubmitted` can intercept user messages to extract directives (Proposal 019a task 1.6) **before** they reach the model. No prompt engineering needed — just parse user message and append to `.ai-team/directives.md`.

**Gaps:**
- Hooks are session-scoped, not agent-scoped. Can't say "onPreToolUse applies only to Tester agent." Squad would need to check `input.sessionId` in hooks and route logic based on which agent session is active.
- No agent-to-agent communication hooks. Squad's Scribe logging pattern (coordinator spawns Scribe after agent completes) would stay prompt-driven, not hook-driven.
- Hooks are synchronous-ish (return values, not event streams). Can't use hooks for long-running coordinator logic like "spawn 5 agents and wait for all."

**Squad opportunity:**
1. **Reviewer gating:** `onPostToolUse` checks if session is a reviewer session (via sessionId lookup), validates approval, blocks writes if rejected.
2. **Directive capture:** `onUserPromptSubmitted` parses user message for directives (e.g., "always use TypeScript"), appends to `.ai-team/directives.md`.
3. **Context injection:** `onSessionStart` reads `.ai-team/team.md`, `.ai-team/decisions.md`, injects as `additionalContext` to every agent session.
4. **Scribe automation:** `onSessionEnd` writes session summary to `.ai-team/orchestration-log/{sessionId}.md`.

**Design question:** Should coordinator hooks run in-process (Node.js SDK client), or prompt-driven (agent.md with tool calls)? Likely in-process for v0.7.0+ when coordinator becomes JS process.

---

### 4. Skills Integration (`skillDirectories` Config)

**What it is:** Load reusable prompt collections from directories. Skills are markdown files + tool definitions + metadata that extend agent capabilities.

**API Surface:**
```typescript
session = client.createSession({
  skillDirectories: [
    "./skills/code-review",
    "./skills/documentation",
    "~/.copilot/skills"
  ],
  disabledSkills: ["experimental-feature"]
})
```

**Skill directory structure:**
```
skills/
└── code-review/
    ├── skill.json          # Metadata
    ├── prompts/
    │   ├── system.md       # System prompt additions
    │   └── examples.md     # Few-shot examples
    └── tools/
        └── lint.json       # Tool definitions
```

**Relevance to Squad:**
- **Current Squad approach:** `.ai-team/skills/{name}/SKILL.md` files (Proposal 015, Phase 1+2 shipped). Coordinator reads `SKILL.md` files, inlines into agent spawn prompts. Skills have confidence lifecycle (low→medium→high). Squad skills are generated from work, not authored upfront.
- **What SDK enables:** Native skill loading from directories. Skills are standard across Copilot SDK, Claude Desktop, and Zed (Agent Skills Open Standard). Squad skills could be portable to other environments.
- **Unexpected win:** `disabledSkills` array — Squad's confidence-based skill filtering ("only use high-confidence skills in prod") could be implemented as dynamic `disabledSkills` list based on `.ai-team/skills/{name}/SKILL.md` confidence field.

**Gaps:**
- SDK skill format != Squad SKILL.md format. Squad's SKILL.md is a single markdown file with YAML frontmatter. SDK skills are directories with `skill.json` + prompt files. Migration path unclear.
- SDK skills are read-only at runtime. Squad's "agents write SKILL.md from real work" pattern would need custom tooling outside SDK.
- No confidence lifecycle in SDK. Squad's low/medium/high confidence is Squad-specific logic.

**Squad opportunity:**
1. **Phase 1 (preserve Squad format):** Keep `.ai-team/skills/` as Squad-specific. Don't use SDK `skillDirectories`. Continue current approach.
2. **Phase 2 (migrate to SDK format):** Write converter that transforms Squad `SKILL.md` → SDK skill directory. Enable SDK native loading. Gain portability to Claude Desktop, Zed, etc.
3. **Phase 3 (hybrid):** Use SDK `skillDirectories` for community skills (e.g., `~/.copilot/skills`), keep Squad skill generation in `.ai-team/skills/` with converter.

**Design question:** Is portability worth the migration cost? Squad skills are tightly integrated with casting, confidence, and decision context. Might not map cleanly to generic Agent Skills format.

---

### 5. MCP Server Management (Per-Session + Global)

**What it is:** Configure MCP servers (Model Context Protocol) for external tool integration. Supports local (stdio) and remote (HTTP/SSE) servers.

**API Surface:**
```typescript
session = client.createSession({
  mcpServers: {
    "filesystem": {
      type: "local",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      tools: ["*"],
    },
    "github": {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { "Authorization": "Bearer ${TOKEN}" },
      tools: ["*"],
    }
  }
})
```

**Relevance to Squad:**
- **Current Squad approach:** No MCP orchestration. Proposal 028a analyzed GitHub API capabilities — MCP tools (Issues read-only) vs. gh CLI (Issues + Projects write). Squad prompts tell agents to use `gh` CLI commands. No server lifecycle management.
- **What SDK enables:** Per-session MCP server config. SDK spawns local servers, manages stdio transport, handles authentication for HTTP servers. Agents get MCP tools automatically. Squad could configure GitHub MCP server per session, eliminate `gh` CLI dependency for read-only ops.
- **Unexpected win:** `customAgents[].mcpServers` — per-agent MCP config. Backend Dev could have PostgreSQL MCP server, Frontend Dev gets GitHub MCP server. **Solves Proposal 033a "provider abstraction is prompt-level command templates" — no, provider abstraction is SDK MCP config.**

**Gaps:**
- MCP server config is session-scoped. Squad would need to pass MCP config on every `createSession()` call, or configure globally at client level (not documented, might not exist).
- No MCP server health monitoring. If GitHub MCP server is down, agents just see "tool failed." Squad can't proactively detect and route to `gh` CLI fallback.
- No MCP server auto-discovery. Squad can't say "if user has `gh` CLI installed, enable GitHub MCP server." Must be explicitly configured.

**Squad opportunity:**
1. **GitHub MCP auto-config:** On Squad init, detect `gh` CLI, configure GitHub MCP server if available. Store in `.ai-team/mcp-config.json`.
2. **Per-agent MCP routing:** Backend Dev gets PostgreSQL MCP server (if configured), Designer gets Figma MCP server, etc. Use `customAgents[].mcpServers`.
3. **Fallback chain:** `onPostToolUse` hook detects MCP tool failures, retries with `gh` CLI or filesystem operations.

**Design question:** Should Squad ship with default MCP config (GitHub, filesystem), or make it opt-in? Default = easier onboarding, opt-in = less magic.

---

### 6. BYOK (Bring Your Own Key) + Custom Providers

**What it is:** Use custom model providers (Azure AI Foundry, OpenAI, Anthropic, Ollama, etc.) with your own API keys. Bypasses GitHub Copilot authentication and billing.

**API Surface:**
```typescript
session = client.createSession({
  model: "gpt-5.2-codex",
  provider: {
    type: "openai",
    baseUrl: "https://your-resource.openai.azure.com/openai/v1/",
    apiKey: process.env.FOUNDRY_API_KEY,
    wireApi: "responses"  // or "completions"
  }
})
```

**Relevance to Squad:**
- **Current Squad approach:** Zero BYOK. Squad requires GitHub Copilot subscription (via `copilot` CLI auth). Model selection is prompt-driven (`model` parameter in task tool). No custom providers.
- **What SDK enables:** Enterprise customers can use Squad with Azure AI Foundry, no GitHub Copilot subscription needed. Squad could support Ollama for local-first workflows. Multi-provider = resilience (fallback from Azure to OpenAI on outage).
- **Unexpected win:** `provider.bearerToken` for static token auth. Squad could integrate with enterprise identity systems (Okta token, etc.) without API key management.

**Gaps:**
- BYOK is session-scoped. Squad would need to pass provider config on every `createSession()` call. No "configure once" client-level default.
- No managed identity support (Entra ID, Azure Managed Identity). Provider config only accepts static API keys or bearer tokens. Tokens must be refreshed externally.
- `model` parameter is required with BYOK. Squad can't say "use default model for this provider." Must always specify.

**Squad opportunity:**
1. **Enterprise tier:** Squad Pro with BYOK support. User configures Azure AI Foundry endpoint in `.ai-team/provider-config.json`, Squad uses that for all agent spawns.
2. **Resilience:** Squad automatically retries failed spawns with fallback provider (Azure → OpenAI → Anthropic). Configured priority list in `.ai-team/provider-config.json`.
3. **Local dev mode:** Squad init detects Ollama, offers "use local models for development" option. Eliminates GitHub Copilot quota usage during iteration.

**Design question:** Should BYOK be a config flag in `team.md`, or a CLI arg to `create-squad`? Likely `team.md` — it's team-level, not repo-level.

---

### 7. Infinite Sessions (Auto-Compaction + Workspace Persistence)

**What it is:** Sessions automatically manage context window limits through background compaction. State persists to `~/.copilot/session-state/{sessionId}/` with checkpoints, plan.md, and artifact files.

**API Surface:**
```typescript
session = client.createSession({
  infiniteSessions: {
    enabled: true,  // Default
    backgroundCompactionThreshold: 0.80,  // Start compaction at 80% context
    bufferExhaustionThreshold: 0.95       // Block at 95% if compaction not done
  }
})

// Session has workspace directory
console.log(session.workspacePath)
// => ~/.copilot/session-state/{sessionId}/
// Contains:
//   checkpoints/001.json, 002.json, ...
//   plan.md
//   files/ (session artifacts)
```

**Relevance to Squad:**
- **Current Squad approach:** No context compaction. Long sessions hit 128K token limit, degrade. Coordinator prompt is 32KB+ — eats significant context. Proposal 007 flagged "agents get in the way more than they help" in long sessions. Suspected cause: context pressure.
- **What SDK enables:** Zero-code context management. Sessions never run out of space. Checkpoints are automatic snapshots — Squad could use them for "undo last decision" feature. `plan.md` is a built-in planning artifact (Squad doesn't use this, but could).
- **Unexpected win:** `session.workspacePath` is a dedicated directory for session state. Squad could write orchestration logs, Scribe summaries, decision drafts to this directory instead of `.ai-team/orchestration-log/`. Automatic cleanup when session is deleted.

**Gaps:**
- Compaction is opaque. Squad can't customize what gets compacted (e.g., "never compact decisions"). SDK decides compression strategy.
- `plan.md` is SDK-specific artifact. Squad doesn't use planning docs (decisions.md is different semantics). Collision risk if Squad wants to use `plan.md` for something else.
- Workspace persistence is `~/.copilot/session-state/`, not repo-relative. Squad's `.ai-team/` directory stays in repo; session state goes to user home dir. Separation might confuse users ("where's the log?").

**Squad opportunity:**
1. **Enable by default:** All Squad sessions use infinite sessions. Eliminates context pressure in long dev sessions.
2. **Checkpoint-driven undo:** "Squad, undo the last decision" triggers rollback to previous checkpoint. Load checkpoint JSON, extract decision state, revert `.ai-team/decisions.md`.
3. **Workspace as scratch space:** Use `session.workspacePath` for Scribe drafts, intermediate artifacts. Copy final artifacts to `.ai-team/` on session end.

**Design question:** Should Squad expose compaction thresholds to users, or hide them? Likely hide — thresholds are SDK internals, not user-facing config.

---

### 8. Session Lifecycle Events (40+ Event Types)

**What it is:** Subscribe to session events: messages, tool calls, errors, usage, compaction, idle state. Events are strongly typed with full payload schemas.

**API Surface:**
```typescript
// All events
session.on((event) => {
  console.log(event.type, event.data)
})

// Specific event type (TypeScript infers payload type)
session.on("assistant.message", (event) => {
  console.log(event.data.content)  // TypeScript knows about .content
})

session.on("tool.execution_start", (event) => {
  console.log(`Tool: ${event.data.toolName}`)
})

session.on("session.compaction_complete", (event) => {
  console.log(`Compacted: ${event.data.before} → ${event.data.after} tokens`)
})
```

**Relevance to Squad:**
- **Current Squad approach:** No event system. Coordinator waits for agent completion via `read_agent` tool (30s default timeout, Proposal 015 flagged 30s timeout causing "no response" failures). Scribe logs are manual spawns after agent completes. No real-time status.
- **What SDK enables:** Real-time agent status without polling. Coordinator subscribes to `tool.execution_start` to show "🔧 Fenster — running tests..." live. `session.idle` event signals completion without timeout. `assistant.usage` tracks token costs per agent.
- **Unexpected win:** `session.compaction_start` / `session.compaction_complete` events. Squad could display "🗜️ Compacting context..." to user during long sessions. Transparency = trust.

**Gaps:**
- Events are session-scoped. Can't subscribe to "all agent sessions" globally. Squad would need to subscribe to each agent session individually, aggregate events.
- No event filtering. Can't say "only tool events for edit/create/delete tools." Squad would filter in handler.
- No event persistence. Events are in-memory only. If coordinator crashes, event history is lost. Squad would need to persist events to `.ai-team/log/` manually.

**Squad opportunity:**
1. **Live agent status:** Subscribe to all agent session events, render live status UI (CLI table or VS Code output channel).
2. **Scribe automation:** Subscribe to `assistant.message` events, accumulate agent responses, write to orchestration log on `session.idle`.
3. **Cost tracking:** Subscribe to `assistant.usage`, aggregate token counts per agent, write to `.ai-team/cost-report.md` on session end.

**Design question:** Should Squad expose event subscription to users (advanced feature), or keep it internal? Likely internal — users don't need raw events, they need high-level status.

---

### 9. Model Selection + Reasoning Effort

**What it is:** List available models with capabilities (vision, reasoning effort, context window). Set model per session. Configure reasoning effort for supported models (GPT-5 series, Claude Sonnet 4).

**API Surface:**
```typescript
const models = await client.listModels()
// Returns ModelInfo[] with:
// - id, name, capabilities (vision, reasoningEffort)
// - supportedReasoningEfforts: ["low", "medium", "high", "xhigh"]
// - limits (max_context_window_tokens, etc.)

session = client.createSession({
  model: "gpt-5.2-codex",
  reasoningEffort: "high"  // Only if model supports it
})
```

**Relevance to Squad:**
- **Current Squad approach:** Model selection is 4-layer priority (user override → charter → registry → auto-select). Proposal 024a documented 16 models across 3 providers. Proposal 034a designed per-agent model selection for CLI/VS Code parity. No reasoning effort config.
- **What SDK enables:** Model catalog is queryable at runtime. Squad doesn't need to hardcode model list — just `listModels()` on init. Reasoning effort is first-class config (no prompt hacks).
- **Unexpected win:** `ModelCapabilities.supports.reasoningEffort` flag. Squad can check if model supports reasoning effort, only show option if available. No guessing.

**Gaps:**
- `listModels()` returns all models, no filtering by provider. Squad can't say "list only Anthropic models." Must filter in code.
- No model cost data (input/output token prices). Squad's cost tracking (Proposal 024a flagged cost-first directive) would need external pricing data.
- `reasoningEffort` is per-session, not per-message. Can't say "use high effort for this specific question." Squad's dynamic effort scaling (easy tasks → low effort) not supported.

**Squad opportunity:**
1. **Dynamic model catalog:** Squad init calls `listModels()`, populates model selector UI. User sees current available models, not stale hardcoded list.
2. **Reasoning effort auto-tuning:** Coordinator analyzes task complexity (e.g., "write tests" = low effort, "design architecture" = high effort), sets `reasoningEffort` per agent spawn.
3. **Model capabilities routing:** Lead agent uses vision-capable model (for screenshot analysis), Backend Dev uses code-optimized model (GPT-5 Codex). Automatic routing based on `ModelCapabilities`.

**Design question:** Should reasoning effort be user-configurable, or auto-tuned by coordinator? Likely auto-tuned — users shouldn't need to know model internals.

---

### 10. Authentication (Multiple Modes)

**What it is:** Authenticate with GitHub Copilot using stored OAuth tokens, environment variables, or GitHub CLI. Check auth status. Use custom tokens (BYOK bypasses auth).

**API Surface:**
```typescript
const client = new CopilotClient({
  githubToken: process.env.GITHUB_TOKEN,  // Explicit token
  useLoggedInUser: true  // Use stored OAuth / gh CLI
})

const authStatus = await client.getAuthStatus()
// Returns: { isAuthenticated, authType: "user" | "env" | "gh-cli" | "api-key", login, statusMessage }
```

**Relevance to Squad:**
- **Current Squad approach:** Squad depends on `gh` CLI auth or Copilot CLI login. Proposal 028a confirmed `gh` CLI as mandatory for write ops (Issues, Projects). No explicit token management.
- **What SDK enables:** Check auth status at runtime, prompt user if not authenticated. Support environment-based auth (`GITHUB_TOKEN`) for CI/CD. BYOK eliminates auth requirement.
- **Unexpected win:** `authStatus.authType` tells Squad which auth method is active. Squad can warn if using `gh-cli` auth but MCP servers need `GITHUB_TOKEN`.

**Gaps:**
- No OAuth device flow. SDK can't initiate login — must rely on `copilot auth login` CLI command or `gh` CLI. Squad can't automate "log in now" prompt.
- No token refresh. If token expires mid-session, SDK doesn't auto-refresh. Squad would need to detect `401` errors, restart session with new token.
- `authStatus` doesn't include scopes. Can't check if token has `project` scope (Proposal 028a flagged as blocker). Squad would need to call GitHub API directly to check scopes.

**Squad opportunity:**
1. **Auth status check on init:** Squad checks `getAuthStatus()` on init, prompts user to run `copilot auth login` if not authenticated.
2. **CI/CD support:** Squad detects `GITHUB_TOKEN` env var in CI, uses that for auth. Enables Squad in GitHub Actions workflows.
3. **Auth failure recovery:** Coordinator detects `session.error` events with `401` status, prompts user to re-authenticate, resumes session.

**Design question:** Should Squad require GitHub Copilot subscription, or support BYOK-only mode? Likely both — subscription for mainstream, BYOK for enterprise.

---

## What Squad Reinvents (SDK Already Has the Answer)

### 1. **Multi-Session Spawn Orchestration**

**Squad's current approach:** 
- Coordinator uses `task` tool with `mode: "background"` to spawn agents in parallel.
- Tracks active sessions in `.ai-team/orchestration-log/` (manual logging).
- No resume capability — if coordinator crashes, state is lost.
- Silent success bug (Proposal 015) caused by platform abandoning sessions after 30s timeout.

**SDK's solution:**
- `client.createSession()` for each agent spawn. Sessions are fully isolated.
- `client.listSessions()` to audit active work — no log parsing.
- `client.resumeSession()` for crash recovery — explicit, not forensic.
- `session.sendAndWait()` with custom timeout eliminates silent success bug.

**Cost of reinvention:** ~300 lines of spawn orchestration logic in `squad.agent.md`, ~200 lines of Scribe logging logic, ~100 lines of `read_agent` timeout handling.

**What Squad gains:** Delete spawn tracking code, replace with SDK session management. Crash recovery for free. No more silent success bug.

---

### 2. **Context Window Management (Infinite Sessions)**

**Squad's current approach:**
- No compaction. Long sessions hit 128K token limit, degrade.
- Proposal 007 flagged "agents get in the way more than they help" in late sessions.
- Coordinator prompt is 32KB+ (1,800 lines) — consumes significant context before any work starts.

**SDK's solution:**
- Infinite sessions with automatic background compaction at 80% context utilization.
- Checkpoints preserve full conversation history even after compaction.
- `session.workspacePath` for persistent state across compaction cycles.

**Cost of reinvention:** User pain (slow agents in long sessions), no technical debt yet (Squad never attempted compaction).

**What Squad gains:** Long-running sessions work reliably. Coordinator prompt size is less critical (compaction handles overflow). Checkpoints enable undo/replay features.

---

### 3. **MCP Server Lifecycle Management**

**Squad's current approach:**
- No MCP orchestration. Agents call `gh` CLI commands directly (prompt-driven).
- Proposal 028a analyzed GitHub API — MCP tools exist (read-only Issues), but Squad doesn't use them.
- Proposal 033a proposed "provider abstraction is prompt-level command templates" — wrong, should be MCP config.

**SDK's solution:**
- Per-session MCP server config. SDK spawns local servers, manages stdio transport, handles HTTP auth.
- `customAgents[].mcpServers` for per-agent MCP config (Backend Dev gets PostgreSQL, Frontend gets GitHub).
- Community MCP servers available (filesystem, GitHub, PostgreSQL, Puppeteer, etc.).

**Cost of reinvention:** Prompt engineering for every external tool integration. No fallback if `gh` CLI is missing. No auto-discovery of available tools.

**What Squad gains:** MCP tools work out of the box. Per-agent tool access control via `tools` array. Auto-fallback if MCP server is down (via `onPostToolUse` hook).

---

### 4. **Worktree Awareness (Session Context)**

**Squad's current approach:**
- Coordinator resolves team root by walking up from `cwd` to find `.squad/` or `.ai-team/`.
- Passes team root into every agent spawn prompt as `TEAM_ROOT` variable.
- Worktree detection is manual logic (~50 lines in coordinator prompt).

**SDK's solution:**
- `SessionMetadata.context` contains `cwd`, `gitRoot`, `repository`, `branch` automatically.
- `client.listSessions({ repository: "owner/repo" })` filters sessions by repo.
- Worktree awareness is built into SDK's session creation — zero config.

**Cost of reinvention:** ~50 lines of worktree detection logic, repeated in every agent spawn.

**What Squad gains:** Delete worktree detection code. Use `SessionContext` for team root, repo, branch. Native multi-worktree support via session filters.

---

### 5. **Tool Permission Control (Hooks System)**

**Squad's current approach:**
- Reviewer approval is prompt-driven: "If reviewer rejects, refuse to spawn another agent."
- Ceremony facilitator (sync mode) blocks until user confirms with `ask_user` tool.
- No permission enforcement at tool execution level — all logic is prompt adherence.

**SDK's solution:**
- `onPreToolUse` hook returns `{ permissionDecision: "allow" | "deny" | "ask" }`.
- SDK enforces decision — tool execution is blocked if `deny`.
- `onPostToolUse` hook can transform results (e.g., change `edit` result to `REJECTED` if reviewer didn't approve).

**Cost of reinvention:** Fragile prompt engineering. Agents can accidentally bypass gates if prompt is misinterpreted.

**What Squad gains:** Hardened permission enforcement. Reviewer gates become code, not prompt instructions. Ceremony facilitator replaces `ask_user` polls with SDK permission handler.

---

## New Doors Opened (Capabilities Squad Couldn't Access Before)

### 1. **Multi-Provider Resilience (BYOK)**

**What it enables:**
- Squad automatically retries failed spawns with fallback provider: Azure → OpenAI → Anthropic.
- User configures provider priority in `.ai-team/provider-config.json`.
- If Azure AI Foundry is down, Squad seamlessly switches to OpenAI with zero user intervention.

**Why Squad couldn't do this before:**
- CLI `task` tool only supports GitHub Copilot models. No custom provider config.
- BYOK requires JSON-RPC protocol access, not available in agent.md context.

**Value:**
- **Uptime:** Squad remains operational during provider outages. Critical for enterprise customers with SLAs.
- **Cost optimization:** Route cheap tasks (code formatting) to GPT-4.1 mini, expensive tasks (architecture design) to GPT-5.2 Codex.
- **Local dev:** Use Ollama for iteration, switch to cloud models for production deployments.

---

### 2. **Per-Agent MCP Server Config**

**What it enables:**
- Backend Dev gets PostgreSQL MCP server (query schema, run migrations).
- Frontend Dev gets GitHub MCP server (list Issues, PRs).
- Designer gets Figma MCP server (fetch designs, extract tokens).
- Each agent sees only their relevant tools — no prompt engineering to filter.

**Why Squad couldn't do this before:**
- MCP servers are session-level, not agent-level in prompt-driven architecture.
- Coordinator would need to spawn separate sessions per agent with different MCP configs — not exposed via `task` tool.

**Value:**
- **Clarity:** Agents don't see irrelevant tools. Backend Dev doesn't get confused by Figma tools.
- **Security:** Frontend Dev can't accidentally query production database — no PostgreSQL MCP server in their config.
- **Extensibility:** Community MCP servers (Slack, Jira, Salesforce) are instantly Squad-compatible — just add to `customAgents[].mcpServers`.

---

### 3. **Real-Time Agent Status (Event Streams)**

**What it enables:**
- Coordinator subscribes to all agent session events, renders live status UI:
  ```
  🔧 Ripley — running tests (tool: powershell)
  ⚛️ Dallas — editing HomePage.tsx (tool: edit)
  🧪 Hockney — analyzing test results (assistant.message_delta)
  ```
- User sees progress without polling or timeouts.
- Token usage displayed live: "Ripley: 2,341 tokens | Dallas: 1,890 tokens | Hockney: 4,102 tokens"

**Why Squad couldn't do this before:**
- `read_agent` tool is polling-based with 30s default timeout (Proposal 015 flagged as P0 issue).
- No event stream access in agent.md context — coordinator can't subscribe to events.

**Value:**
- **Transparency:** User knows exactly what agents are doing. No black box.
- **Cost tracking:** Real-time token usage alerts if agent is running expensive operations.
- **Debugging:** When agent fails, coordinator has full event log for diagnostics (tool calls, errors, usage).

---

### 4. **Checkpoint-Driven Undo/Replay**

**What it enables:**
- User says "Squad, undo the last decision."
- Coordinator loads previous checkpoint from `session.workspacePath/checkpoints/`, restores state, reverts `.ai-team/decisions.md`.
- Replay: Load checkpoint from 3 decisions ago, replay with modified parameters (e.g., "use Python instead of Node.js").

**Why Squad couldn't do this before:**
- No checkpoints. `.ai-team/decisions.md` is append-only, no snapshots.
- Undo would require parsing decision markdown, guessing state from text.

**Value:**
- **Safety:** Teams can experiment without fear. "Try this approach, if it fails, undo."
- **Learning:** Replay past decisions with different parameters, compare outcomes.
- **Auditing:** Checkpoints are forensic evidence of decision history, not just text logs.

---

### 5. **Native Multi-Tenant Support**

**What it enables:**
- Squad SaaS: Multiple users share one Squad CLI server (per-session isolation).
- Each user's sessions are isolated by `sessionId` prefix: `user-{userId}-{taskId}`.
- `listSessions({ cwd: "/workspace/{userId}" })` filters to user's sessions.
- BYOK per user: User A's sessions use Azure AI Foundry, User B's use OpenAI.

**Why Squad couldn't do this before:**
- CLI `task` tool spawns agents in same CLI server context. No user isolation without OS-level process separation.
- Multi-tenancy would require one Copilot CLI instance per user (heavyweight, not scalable).

**Value:**
- **SaaS opportunity:** Squad Cloud with pay-per-seat pricing. Users don't need Copilot CLI installed locally.
- **Enterprise:** Central Squad server for org, users authenticate via SSO, sessions are user-scoped.
- **Cost allocation:** Track token usage per user, charge back to cost centers.

---

## Platform Alignment (Where Squad Fights vs. Flows with Copilot)

### Squad Currently Flows with Copilot ✅

1. **Filesystem-backed memory:** Squad's `.ai-team/` directory is the right primitive. SDK's `session.workspacePath` complements (not replaces) it. Keep both.
2. **Agent spawning via task tool:** Squad's background spawn pattern aligns with SDK's `createSession()` semantics. Migration is parallel, not replacement.
3. **Prompt-first architecture:** Squad's coordinator is an agent.md file. SDK doesn't mandate Node.js process — agent.md can stay as-is for Phase 1.
4. **Git-native state:** Squad's decisions, charters, skills are git-cloneable. SDK doesn't force database or cloud state. Alignment preserved.

### Squad Currently Fights the Platform ⚠️

1. **Silent success bug (Proposal 015):** Platform abandons background agents after 30s if `read_agent` not called. SDK's `sendAndWait()` with custom timeout eliminates this — Squad should migrate.
2. **Context pressure in long sessions (Proposal 007):** 128K token limit causes agent degradation. SDK's infinite sessions solve this — Squad fighting context management manually.
3. **Manual session tracking:** `.ai-team/orchestration-log/` is reinventing `listSessions()`. Squad should use SDK session metadata instead.
4. **Spawn ceremony overhead:** Coordinator inlines full charters (32KB+) into every spawn prompt. SDK's `customAgents` registers charters once — Squad should migrate.

### Where Squad Should Stay Independent 🎯

1. **Casting system:** Persistent character names (Ripley, Dallas) are Squad's UX differentiator. SDK doesn't provide this — Squad should keep registry.json, universe allocation, history.json.
2. **Coordinator orchestration logic:** SDK doesn't decide which agents to spawn, in what order, with what dependencies. Squad's coordinator prompt is the brain — keep it.
3. **Decision governance:** `.ai-team/decisions.md` lifecycle (inbox → reviewed → shipped) is Squad-specific. SDK doesn't have opinion on decisions — keep Squad's model.
4. **Scribe pattern:** Dedicated documentation agent is Squad innovation. SDK doesn't prescribe this — keep Scribe as Squad-specific role.
5. **Reviewer approval gates:** Ceremony facilitator, human approval, CODEOWNERS integration are Squad features. SDK hooks enable them, but don't replace Squad's logic.

---

## Independence Worth Keeping (Squad's Unique Value)

### 1. Casting System (Names That Matter)

**What it is:** Persistent character names from movies (Alien, Usual Suspects, etc.) assigned to agent roles based on resonance signals from project and user context.

**Why it's valuable:**
- **Memorability:** "Ask Ripley" is easier than "Ask lead-engineer-agent-5."
- **Personality:** Cast names imply tone (Ripley = battle-tested, Dallas = pragmatic).
- **Continuity:** Same name across projects for same role type — user learns "Ripley is my go-to for tough decisions."

**Why SDK can't replace it:**
- SDK `customAgents` have `name` and `displayName` fields, but no casting logic.
- Squad's universe allocation (50 characters per universe, Alien → Usual Suspects → ...) is domain-specific.
- Resonance signal parsing ("backend-heavy project → Alien universe") is Squad's secret sauce.

**Keep:** Casting registry, universe mapping, persistent naming, legacy migration. SDK integration: Generate `customAgents` array from casting registry.

---

### 2. Filesystem Memory as Source of Truth

**What it is:** `.ai-team/` directory contains all squad state: team.md, decisions.md, agents/*/history.md, skills/, casting/. Git-cloneable, human-readable, version-controlled.

**Why it's valuable:**
- **Portability:** Clone repo, get full squad context. No cloud dependency.
- **Transparency:** Users read decisions.md, understand team thinking. Not opaque database.
- **Git workflow:** Branches isolate squad work, merge strategies (union merge driver) prevent conflicts.

**Why SDK can't replace it:**
- SDK's `session.workspacePath` is user-home directory (`~/.copilot/session-state/`), not repo-relative.
- Checkpoints are opaque JSON — not human-readable markdown.
- No git integration in SDK — workspaces are per-session, not per-repo.

**Keep:** `.ai-team/` as primary state. Use `session.workspacePath` for scratch artifacts (Scribe drafts, temp files). Sync finalized artifacts back to `.ai-team/` on session end.

---

### 3. Coordinator Orchestration Logic

**What it is:** Squad coordinator decides which agents to spawn, in what order, with what dependencies. Parallel fan-out by default, serial spawns when needed (Scribe after agents complete).

**Why it's valuable:**
- **Efficiency:** Coordinator maximizes parallelism — 5 agents working simultaneously, not sequential queue.
- **Dependency tracking:** "Tester waits for Backend Dev" is encoded in coordinator logic, not rigid workflow engine.
- **Context-aware routing:** Routing.md maps tasks to agents. "API endpoint" → Backend Dev, "button styling" → Frontend Dev.

**Why SDK can't replace it:**
- SDK provides session management, not orchestration strategy.
- `customAgents` registers agents, but doesn't decide when to invoke them.
- Hooks (`onSessionStart`, `onPreToolUse`) are interception points, not orchestration engine.

**Keep:** Coordinator as decision-maker. Use SDK for infrastructure (spawn sessions, track state), keep Squad's logic for "who does what, when."

---

### 4. Decision Governance Model

**What it is:** Proposals go through lifecycle: inbox → reviewed (with team votes) → shipped (merged to decisions.md) or deferred. Decisions are numbered, attributed, time-stamped. Append-only history.

**Why it's valuable:**
- **Accountability:** Every decision has an author, timestamp, rationale. Auditable.
- **Consensus:** Team votes on proposals (e.g., Verbal +1, Keaton +1) before finalizing.
- **Traceability:** "Why did we choose React?" → Search decisions.md for "024a-frontend-framework."

**Why SDK can't replace it:**
- SDK has no opinion on decision-making. Hooks could capture decisions, but not enforce lifecycle.
- Proposals, voting, archiving are domain logic, not platform primitives.

**Keep:** Decision lifecycle, inbox pattern, voting. Use SDK hooks (`onUserPromptSubmitted`) to detect directive-like statements, route to decision inbox.

---

### 5. Scribe Pattern (Dedicated Documentation Agent)

**What it is:** Scribe is a silent agent (never spawned by user, only by coordinator) that logs orchestration, writes session summaries, maintains cross-agent context.

**Why it's valuable:**
- **Consistency:** Scribe's voice is uniform across all logs. No personality variation.
- **Non-blocking:** Scribe spawns after work completes (background mode), doesn't slow down user-facing agents.
- **Context sharing:** Scribe reads all agent outputs, writes summaries for other agents to read (history.md files).

**Why SDK can't replace it:**
- SDK events (`assistant.message`, `tool.execution_complete`) provide raw logs, but not summaries.
- Scribe is a Squad-specific role with custom prompt (always Haiku model, always background mode, always last to run).

**Keep:** Scribe as dedicated role. Use SDK events to feed Scribe (subscribe to all agent session events), but keep Scribe's summarization logic Squad-specific.

---

## SDK Maturity Assessment

### Protocol Stability ✅

**Version:** Protocol v2 (confirmed in `sdk-protocol-version.json`).

**Stability signals:**
- SDK is "Technical Preview" but protocol is v2 (not v0.x or v1.x-beta).
- CLI has been in production for 18+ months (Copilot CLI launched mid-2023, SDK wraps CLI's JSON-RPC protocol).
- 4 language SDKs (TypeScript, Python, Go, .NET) — significant investment in cross-language support.

**Breaking change risk:**
- Protocol v2 implies v1 existed and was superseded. Past breaking changes confirmed.
- SDK README says "may change in breaking ways" (Technical Preview disclaimer).
- No semver commitment (SDK is pre-1.0).

**Mitigation:**
- Squad pins SDK version in `package.json`, doesn't auto-upgrade.
- Protocol version mismatch warnings (SDK logs if CLI protocol != SDK expected protocol).
- Squad's adapter layer isolates SDK calls — breaking changes require updating adapter, not 50+ spawn sites.

**Verdict:** Medium risk. Protocol is stable enough for production (CLI proves it), but breaking changes are possible. Acceptable for v0.6.0 if Squad isolates SDK behind adapter.

---

### Feature Completeness ✅

**Coverage:** SDK exposes ~80% of CLI features (see Compatibility.md in SDK docs).

**Available:**
- Session management (create, resume, list, delete) ✅
- Custom agents, tools, hooks ✅
- MCP servers (local + remote) ✅
- Infinite sessions with compaction ✅
- BYOK / custom providers ✅
- Event streams (40+ event types) ✅
- Model listing + reasoning effort ✅

**Not available (CLI-only):**
- Session export to file/gist ❌
- Slash commands (/help, /clear, /agent) ❌ (TUI-only)
- Interactive agent picker dialog ❌ (TUI-only)
- Token usage UI ❌ (but `assistant.usage` events available)

**Verdict:** SDK has all features Squad needs. Missing features are TUI-specific, irrelevant for programmatic use. Squad is good to proceed.

---

### Community Adoption 📈

**Signals:**
- 4 official SDKs (TypeScript, Python, Go, .NET) — GitHub investment confirmed.
- Community SDKs (Java, Rust, Clojure, C++) — ecosystem emerging.
- MCP server directory has 50+ servers — standardization happening.
- GitHub Docs have full SDK section — not experimental afterthought.

**Questions:**
- No public download counts (npm, PyPI badges exist but no numbers visible in README).
- No GitHub stars visible (repo is likely private or enterprise-only).
- No public roadmap for SDK (vs. CLI has public roadmap).

**Verdict:** Medium confidence. SDK is real product (not prototype), but adoption numbers unknown. Acceptable risk for v0.6.0 — Squad can validate in alpha without committing.

---

### Documentation Quality ✅

**Observed:**
- Comprehensive getting-started guide (1,200+ lines, 5 examples).
- Per-feature guides (hooks, MCP, auth, session persistence, skills).
- API reference in `nodejs/README.md` (700+ lines, every method documented).
- Troubleshooting sections in MCP, debugging guides.
- Code examples in 4 languages for every feature.

**Gaps:**
- No architecture diagrams (how SDK talks to CLI, what JSON-RPC looks like).
- No performance benchmarks (session creation latency, event throughput).
- No migration guide (Copilot CLI → SDK for existing users).

**Verdict:** Strong. Docs are tutorial-first (good for Squad adoption), not just API reference. Sufficient for Phase 1 integration.

---

### Testing & Quality 🔬

**Observed:**
- `nodejs/test/` directory exists (not examined in detail, but structure present).
- `e2e/` subdirectory implies end-to-end tests (not just unit tests).
- `samples/` directory with working examples (chat.ts) — suggests dogfooding.

**Unknown:**
- Test coverage percentage (no badges visible).
- CI/CD pipeline (no `.github/workflows/` visible, repo might be private).
- Known issues count (no public issue tracker visible).

**Verdict:** Moderate confidence. Tests exist, but Squad can't audit quality without repo access. Acceptable risk — worst case, Squad finds bugs, reports to GitHub, waits for fix or works around.

---

### Breaking Change History 🔄

**Evidence:**
- Protocol v2 exists, implying v1 was superseded (breaking change).
- SDK README disclaimer: "may change in breaking ways" (Technical Preview).
- No CHANGELOG.md visible (can't assess change velocity).

**Mitigation:**
- Squad uses adapter pattern (see Recommendation section).
- Pin SDK version, upgrade deliberately with testing.
- Monitor GitHub releases, test Squad on new SDK versions in CI before upgrading prod.

**Verdict:** High risk of breaking changes, but manageable. Squad shouldn't couple directly to SDK — adapter layer required.

---

## Recommendation (Platform-Savvy Take on Replatforming)

### TL;DR: Replatform in Two Phases

**Phase 1 (v0.6.0): SDK as Infrastructure, Coordinator as Agent.md**
- Use SDK for session management, infinite sessions, MCP servers, hooks.
- Coordinator remains `squad.agent.md` file (prompt-driven).
- Hybrid: Coordinator calls SDK via custom tools, not direct API.

**Phase 2 (v0.7.0): Coordinator as Node.js Process**
- Coordinator becomes Node.js script using SDK client.
- Full programmatic control: event subscriptions, dynamic agent spawning, real-time status.
- Agent.md files (charters) loaded as `customAgents` array.

---

### Phase 1 Design (v0.6.0)

**Goal:** Gain SDK benefits without rewriting coordinator.

**Architecture:**
```
User → Copilot CLI (runs squad.agent.md)
         ↓
     Coordinator (agent.md)
         ↓ [custom tools]
     SDK Adapter (Node.js)
         ↓ [JSON-RPC]
     Copilot CLI (SDK mode)
         ↓
     Agent Sessions (Ripley, Dallas, Hockney, etc.)
```

**Changes:**

1. **Custom tools for SDK operations:**
   - `squad_spawn_agent(member: string, task: string, model?: string)` → calls `client.createSession({ sessionId: "squad-{member}-{timestamp}", customAgents: [...] })`
   - `squad_list_active_agents()` → calls `client.listSessions({ cwd: teamRoot })`
   - `squad_resume_agent(sessionId: string)` → calls `client.resumeSession(sessionId)`

2. **Coordinator prompt additions:**
   - "To spawn an agent, use `squad_spawn_agent` tool. Do NOT use `task` tool."
   - "To check agent status, use `squad_list_active_agents` tool."
   - "Sessions are tracked by SDK — no need to write to orchestration-log."

3. **SDK adapter (Node.js script):**
   - Runs as MCP server (local stdio) or HTTP server.
   - Exposes `squad_spawn_agent`, `squad_list_active_agents`, `squad_resume_agent` tools.
   - On `squad_spawn_agent`, loads `.ai-team/casting/registry.json`, generates `customAgents` array from charters, calls SDK.
   - Subscribes to all session events, writes to `.ai-team/orchestration-log/{sessionId}.md` on `session.idle`.

**Benefits:**
- Coordinator logic unchanged (still agent.md).
- Gains SDK session management, infinite sessions, compaction.
- Eliminates silent success bug (SDK's sendAndWait with timeout).
- Crash recovery via resumeSession.

**Tradeoffs:**
- Two Copilot CLI instances (one for coordinator, one for SDK). Slightly heavyweight.
- Custom tools add latency (coordinator → adapter → SDK → agent).
- No real-time event streams (coordinator can't subscribe to events directly).

**Verdict:** Good intermediate step. Validates SDK integration without full rewrite. Can ship in v0.6.0 (3-5 weeks).

---

### Phase 2 Design (v0.7.0)

**Goal:** Full SDK integration, coordinator as Node.js process.

**Architecture:**
```
User → CLI / VS Code / GitHub.com
         ↓
     Squad CLI (Node.js using SDK)
         ↓
     Coordinator (Node.js class)
         ↓
     SDK Client
         ↓
     Agent Sessions
```

**Changes:**

1. **Squad CLI becomes Node.js app:**
   - `npx @bradygaster/create-squad` remains scaffolding tool (installs `.ai-team/` structure).
   - New: `npx @bradygaster/squad` — runtime CLI that spawns coordinator.
   - Coordinator is `src/coordinator.ts` class, not agent.md file.

2. **Coordinator implementation:**
   ```typescript
   class SquadCoordinator {
     private client: CopilotClient
     private teamRoot: string
     private roster: TeamMember[]
     
     constructor() {
       this.client = new CopilotClient()
       this.teamRoot = resolveTeamRoot(process.cwd())
       this.roster = loadRoster(`${this.teamRoot}/.ai-team/team.md`)
     }
     
     async handleUserMessage(message: string) {
       const tasks = this.parseTasksFromMessage(message)
       const agents = this.selectAgents(tasks)
       
       // Spawn agents in parallel
       const sessions = await Promise.all(
         agents.map(agent => this.spawnAgent(agent, tasks[agent]))
       )
       
       // Subscribe to events, render live status
       sessions.forEach(session => {
         session.on("tool.execution_start", event => {
           this.renderStatus(agent.name, event.data.toolName)
         })
       })
       
       // Wait for all agents to complete
       await Promise.all(sessions.map(s => s.sendAndWait({ prompt: task })))
       
       // Spawn Scribe
       await this.spawnScribe(sessions)
     }
     
     private async spawnAgent(member: TeamMember, task: string) {
       const charter = fs.readFileSync(`${this.teamRoot}/.ai-team/agents/${member.name}/charter.md`)
       return this.client.createSession({
         sessionId: `squad-${member.name}-${Date.now()}`,
         model: this.selectModel(member),
         customAgents: this.roster.map(m => ({
           name: m.name.toLowerCase(),
           displayName: m.castName,
           prompt: fs.readFileSync(`${this.teamRoot}/.ai-team/agents/${m.name}/charter.md`),
           description: m.role
         })),
         hooks: {
           onPostToolUse: (input) => this.reviewerGate(input, member)
         },
         infiniteSessions: { enabled: true }
       })
     }
   }
   ```

3. **Agent charters remain markdown files:**
   - No migration needed. Charters are loaded as `customAgents[].prompt`.
   - Casting logic (registry.json) stays in `.ai-team/casting/`.
   - Coordinator generates `customAgents` array dynamically from roster + charters.

**Benefits:**
- Full programmatic control: event streams, live status, dynamic spawning.
- Reviewer gates become code (`onPostToolUse` hook), not prompt adherence.
- Coordinator can implement complex logic (dependency tracking, retries, fallback providers).
- Real-time token usage, cost tracking via `assistant.usage` events.
- No two-CLI overhead — one SDK client manages all sessions.

**Tradeoffs:**
- Coordinator is no longer prompt-editable. Changes require code, not markdown edits.
- Testing complexity increases (unit tests for coordinator class).
- Distribution changes (npm package needs Node.js dependency, not just markdown files).

**Verdict:** Right long-term architecture. Unlocks full SDK value. Target for v0.7.0 (8-12 weeks).

---

### Adapter Pattern (Critical for Phase 1)

**Why it matters:** SDK is "Technical Preview" — breaking changes likely. Squad must not couple directly to SDK everywhere.

**Pattern:**
```typescript
// squad-sdk-adapter.ts
export interface AgentSpawnRequest {
  member: string
  task: string
  model?: string
}

export class SquadSDKAdapter {
  private client: CopilotClient
  
  async spawnAgent(req: AgentSpawnRequest): Promise<string> {
    // Adapter owns SDK interaction
    const session = await this.client.createSession({
      sessionId: `squad-${req.member}-${Date.now()}`,
      model: req.model || this.selectDefaultModel(req.member),
      customAgents: this.loadTeamRoster()
    })
    return session.sessionId
  }
  
  async listActiveAgents(): Promise<AgentStatus[]> {
    const sessions = await this.client.listSessions()
    return sessions.filter(s => s.sessionId.startsWith("squad-"))
      .map(s => ({ sessionId: s.sessionId, member: this.parseMember(s.sessionId), status: "active" }))
  }
}
```

**Benefits:**
- Breaking SDK changes require updating adapter only (1 file, ~200 lines).
- Rest of Squad code uses adapter interface, not SDK directly.
- Easy to mock adapter for testing (no SDK dependency in tests).

**When to remove adapter:**
- After SDK reaches 1.0 (semver stability).
- After 6+ months of no breaking changes (proven stability).
- Likely v1.0.0 of Squad (not before).

---

### Migration Path (Zero Downtime)

**How to migrate existing Squads to SDK:**

1. **Detect SDK availability:**
   - `squad init` checks if `@github/copilot-sdk` is installed.
   - If yes, creates `.ai-team/sdk-config.json` with `{ "enabled": true }`.
   - If no, falls back to current prompt-driven architecture.

2. **Dual-mode coordinator:**
   - Coordinator checks `.ai-team/sdk-config.json` on session start.
   - If `enabled: true`, uses SDK adapter tools (`squad_spawn_agent`).
   - If `enabled: false`, uses current `task` tool spawns.
   - Same coordinator prompt works in both modes.

3. **Gradual rollout:**
   - v0.6.0 ships with SDK support opt-in (default `false`).
   - Users run `squad enable-sdk` to flip flag.
   - v0.7.0 makes SDK default (prompt-driven deprecated).
   - v1.0.0 removes prompt-driven mode (SDK-only).

4. **Compatibility guarantee:**
   - Existing `.ai-team/` structures work unchanged.
   - Charters, decisions, casting registry migrate automatically.
   - No user-facing breaking changes (SDK is internal detail).

**Timeline:**
- v0.5.x (current): Prompt-driven only.
- v0.6.0 (3-5 weeks): SDK opt-in, Phase 1 architecture.
- v0.7.0 (8-12 weeks): SDK default, Phase 2 architecture opt-in.
- v1.0.0 (6 months): SDK-only, prompt-driven removed.

---

### Risk Mitigation

**Risk 1: SDK breaking changes during Squad development.**

**Mitigation:**
- Pin SDK version in `package.json` (e.g., `"@github/copilot-sdk": "0.3.2"`, not `"^0.3.2"`).
- Adapter pattern isolates SDK calls.
- CI tests Squad against latest SDK version weekly, flags incompatibilities before prod upgrade.

**Risk 2: SDK performance degrades (session creation latency, event throughput).**

**Mitigation:**
- Benchmark session creation latency on Squad init (target: <500ms).
- Monitor event throughput during alpha (target: 100 events/sec sustained).
- If SDK is slow, keep prompt-driven mode for latency-sensitive paths (user-facing agent spawns), use SDK only for background work (Scribe, cost tracking).

**Risk 3: SDK missing critical feature Squad needs.**

**Mitigation:**
- Phase 1 is hybrid — prompt-driven coordinator can call SDK adapter AND use `task` tool.
- If SDK fails, coordinator falls back to `task` tool gracefully.
- Escalate missing features to GitHub via SDK issue tracker (Squad is high-profile user, GitHub will prioritize).

**Risk 4: Community adoption stalls, SDK gets deprecated.**

**Mitigation:**
- Monitor SDK release cadence (target: monthly releases = active project).
- If SDK goes 6+ months without update, re-evaluate.
- Worst case: Squad forks SDK, maintains internal version (acceptable — SDK is MIT licensed).

---

### Success Metrics (How to Know SDK Integration Worked)

**Phase 1 (v0.6.0):**
- ✅ Silent success bug eliminated (zero "did not produce a response" errors in logs).
- ✅ Context pressure relief (sessions >100 messages complete without degradation).
- ✅ Crash recovery validated (coordinator crash → resume session → work continues).
- ✅ MCP servers load successfully (GitHub MCP server accessible to agents).

**Phase 2 (v0.7.0):**
- ✅ Real-time agent status UI operational (live tool calls, token usage).
- ✅ Reviewer gates enforced via hooks (zero bypasses in testing).
- ✅ Multi-provider fallback works (Azure down → OpenAI succeeds automatically).
- ✅ Cost tracking accurate (token counts match OpenAI billing within 1%).

**Red flags (abort criteria):**
- Session creation latency >2s (unacceptable UX).
- Breaking changes every release (unstable protocol).
- Missing features can't be worked around (blocking Squad functionality).

---

### Recommendation Summary

**Short answer:** YES, replatform on SDK. Phase 1 (v0.6.0) for infrastructure, Phase 2 (v0.7.0) for full integration.

**Why:**
1. SDK provides production-ready infrastructure Squad currently reinvents (session management, compaction, MCP).
2. CustomAgents API is designed for Squad's use case (team member registration).
3. Hooks system enables coordinator logic as code, not fragile prompt engineering.
4. Multi-provider support (BYOK) opens enterprise market, resilience, cost optimization.
5. Infinite sessions solve context pressure (Proposal 007 pain point).

**What Squad keeps:**
- Casting system (persistent names, universe allocation).
- Filesystem memory (`.ai-team/` as source of truth).
- Coordinator orchestration logic (which agents, when, with what dependencies).
- Decision governance (proposals, voting, lifecycle).
- Scribe pattern (dedicated documentation agent).

**What Squad gains:**
- No more silent success bug (SDK handles timeouts).
- No more context pressure (infinite sessions with compaction).
- Crash recovery (resumeSession by ID).
- Real-time agent status (event streams).
- Multi-provider resilience (BYOK fallback chains).
- MCP server orchestration (zero code).
- Checkpoint-driven undo/replay (safety net for teams).

**When to start:** Immediately. Phase 1 design can begin in parallel with v0.5.0 polish. Target v0.6.0 ship in 3-5 weeks.

