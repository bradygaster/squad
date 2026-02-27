# Feature Comparison — Current Squad vs. SDK-Replatformed Squad

**Author:** Kujan (Copilot SDK Expert)
**Requested by:** Brady (for McManus to produce Mermaid diagrams)
**Date:** 2026-02-21
**Sources:** `index.js` (1662 lines), `squad.agent.md` (~32KB), `templates/` (31 files), SDK `nodejs/src/` (types.ts, client.ts, session.ts), 14 PRDs, feature-risk-punchlist.md, open-questions.md (27/27 resolved)

---

## 1. Feature Inventory — Current Squad

### 1.1 CLI Commands

| ID | Feature | Implementation | Lines in `index.js` | Status | SDK Replatform | Risk | Effort | PRD |
|----|---------|---------------|---------------------|--------|---------------|------|--------|-----|
| CLI-1 | `squad` (init — default) | Scaffolds `.squad/`, agent file, templates, workflows, identity, MCP config, `.gitattributes` | 1098–1662 | ✅ Working | Direct port | 🟢 OK | M | PRD 12, 14 |
| CLI-2 | `squad upgrade` | Overwrites squad-owned files, runs migrations, scrubs emails, stamps version | 1115–1646 | ✅ Working | Needs redesign (SDK adds upgrade path) | 🟡 AT RISK | L | PRD 12 (partial) |
| CLI-3 | `squad upgrade --self` | Self-upgrade for Squad's own repo; refreshes `.ai-team/` from templates without destroying history | 1292–1330 | ✅ Working | Needs redesign | 🟢 OK | S | PRD 14 |
| CLI-4 | `squad upgrade --migrate-directory` | Renames `.ai-team/` → `.squad/`, updates `.gitattributes`, `.gitignore`, scrubs emails | 1120–1190 | ✅ Working | Needs redesign | 🟡 AT RISK | S | PRD 14 (partial) |
| CLI-5 | `squad watch` | Ralph local watchdog — polls GitHub Issues via `gh` CLI, triages by domain, assigns @copilot | 104–264 | ✅ Working | Needs redesign (SDK persistent session) | 🟡 AT RISK | L | PRD 8 (partial) |
| CLI-6 | `squad copilot` | Add/remove @copilot coding agent from roster with capability profiles | 598–713 | ✅ Working | Needs PRD 15 | 🟡 AT RISK | M | PRD 15 (new) |
| CLI-7 | `squad copilot --off` | Remove @copilot from team roster + delete copilot-instructions.md | 609–626 | ✅ Working | Needs PRD 15 | 🟡 AT RISK | S | PRD 15 (new) |
| CLI-8 | `squad copilot --auto-assign` | Enable auto-assignment of @copilot to squad-labeled issues | 631–638 | ✅ Working | Needs PRD 15 | 🟡 AT RISK | S | PRD 15 (new) |
| CLI-9 | `squad plugin marketplace add` | Register a marketplace repo (owner/repo) | 742–761 | ✅ Working | Partially covered | 🟡 AT RISK | S | PRD 7 (future path) |
| CLI-10 | `squad plugin marketplace remove` | Unregister a marketplace | 763–777 | ✅ Working | Partially covered | 🟡 AT RISK | S | PRD 7 (future path) |
| CLI-11 | `squad plugin marketplace list` | List registered marketplaces | 779–793 | ✅ Working | Partially covered | 🟡 AT RISK | S | PRD 7 (future path) |
| CLI-12 | `squad plugin marketplace browse` | Browse plugins in a marketplace repo via `gh` API | 795–830 | ✅ Working | Partially covered | 🟡 AT RISK | S | PRD 7 (future path) |
| CLI-13 | `squad export` | Export squad to portable JSON (casting, agents, skills) | 836–913 | ✅ Working | Needs PRD 16 | 🟡 AT RISK | M | PRD 16 (new) |
| CLI-14 | `squad import` | Import squad from JSON, collision detection, archiving | 917–1029 | ✅ Working | Needs PRD 16 | 🟡 AT RISK | M | PRD 16 (new) |
| CLI-15 | `squad scrub-emails` | Remove PII from Squad state files | 267–595 | ✅ Working | Partially covered (hooks do runtime enforcement, but CLI utility missing) | 🔴 GRAVE | S | PRD 3 (partial) |
| CLI-16 | `squad --version` / `squad --help` | Version display and help text | 51–83 | ✅ Working | Direct port | 🟢 OK | S | PRD 12 |

### 1.2 Agent System (Coordinator — `squad.agent.md`)

| ID | Feature | Status | SDK Replatform | Risk | Effort | PRD |
|----|---------|--------|---------------|------|--------|-----|
| AGT-1 | Agent routing (explicit naming, multi-domain) | ✅ Working | Hybrid: code for deterministic, LLM for ambiguous | 🟢 OK | L | PRD 5, PRD 2 |
| AGT-2 | Agent spawning via `task` tool | ✅ Working | SDK `createSession()` replaces prompt-level task calls | 🟢 OK | L | PRD 1, 4, 5 |
| AGT-3 | Parallel fan-out (background agents) | ✅ Working | SDK session pool enables true parallel execution | 🟢 OK | L | PRD 5 |
| AGT-4 | Charter-based context injection | ✅ Working | Charters compile to `CustomAgentConfig.prompt` | 🟢 OK | M | PRD 4 |
| AGT-5 | Casting universe selection | ✅ Working | Deterministic scoring moves to TypeScript | 🟢 OK | M | PRD 11 |
| AGT-6 | Persistent name allocation + collision detection | ✅ Working | Typed `CastRegistry` with O(1) collision detection | 🟢 OK | M | PRD 11 |
| AGT-7 | Overflow handling (diegetic, thematic, structural) | ✅ Working | Codified as typed functions | 🟢 OK | M | PRD 11 |
| AGT-8 | Ceremony system (before/after triggers) | ✅ Working | Before/after triggers preserved | 🟢 OK | M | PRD 5 |
| AGT-9 | Directive capture (user preferences → decisions) | ✅ Working | Typed `squad_decide` tool | 🟢 OK | S | PRD 2 |
| AGT-10 | Scribe fire-and-forget documentation | ✅ Working | Needs clarification on SDK session model | 🟡 AT RISK | M | PRD 5 (partial) |
| AGT-11 | Per-agent model selection (4-layer priority) | ✅ Working | SDK `CustomAgentConfig` doesn't have per-agent model — session-level only | 🟡 AT RISK | L | PRD 4, 9 |
| AGT-12 | Model fallback chains (Premium/Standard/Fast tiers) | ✅ Working | Prompt-level chains need TypeScript codification | 🟡 AT RISK | M | PRD 1, 5 (partial) |
| AGT-13 | Tiered response modes (Direct/Lightweight/Standard/Full) | ✅ Working | Direct port to TypeScript spawn logic | 🟢 OK | M | PRD 5 |
| AGT-14 | Platform detection (CLI vs. VS Code) | ✅ Working | SDK adapter pattern handles platform differences | 🟢 OK | M | PRD 5 |
| AGT-15 | Context caching (team.md read-once) | ✅ Working | SDK session state management | 🟢 OK | S | PRD 5 |
| AGT-16 | @copilot capability profiling (🟢/🟡/🔴 routing) | ✅ Working | Needs clarification in PRD 4 | 🟢 OK | M | PRD 4 |
| AGT-17 | Coordinator self-version announcement | ✅ Working | Direct port | 🟢 OK | S | PRD 12 |

### 1.3 State Management

| ID | Feature | Current Location | Status | SDK Replatform | Risk | Effort | PRD |
|----|---------|-----------------|--------|---------------|------|--------|-----|
| STM-1 | Decision drop-box pattern (`decisions/inbox/`) | `.squad/decisions/` | ✅ Working | Typed `squad_decide` tool | 🟢 OK | M | PRD 2 |
| STM-2 | Agent history files (`agents/*/history.md`) | `.squad/agents/` | ✅ Working | Preserved — filesystem is source of truth | 🟢 OK | S | PRD 14 |
| STM-3 | Orchestration log | `.squad/orchestration-log/` | ✅ Working | JSONL event logging (richer) | 🟢 OK | M | PRD 5, 6 |
| STM-4 | Casting state (registry, policy, history JSON) | `.squad/casting/` | ✅ Working | TypeScript primary, JSON Phase 1 read-only | 🟡 AT RISK | L | PRD 11 |
| STM-5 | Skills system (SKILL.md, confidence levels) | `.squad/skills/` | ✅ Working | Manifest-based with SDK `skillDirectories` config | 🟢 OK | M | PRD 7 |
| STM-6 | Plugin marketplace config | `.squad/plugins/marketplaces.json` | ✅ Working | No specific migration path | 🟡 AT RISK | S | PRD 7 (partial) |
| STM-7 | Identity system — `now.md` (team focus) | `.squad/identity/now.md` | ✅ Working | PRD 14 needs explicit section | 🟢 OK | S | PRD 14 |
| STM-8 | Identity system — `wisdom.md` (team patterns) | `.squad/identity/wisdom.md` | ✅ Working | PRD 14 needs explicit section | 🟢 OK | S | PRD 14 |
| STM-9 | History splitting on import (portable vs. project) | `splitHistory()` function | ✅ Working | PRD 14 needs explicit section | 🟢 OK | M | PRD 14 |
| STM-10 | `.gitattributes` merge=union setup | Init/upgrade flow | ✅ Working | Not addressed in PRD 14 | 🟡 AT RISK | S | PRD 14 (missing) |
| STM-11 | `.ai-team/` → `.squad/` dual-path detection | `detectSquadDir()` | ✅ Working | PRD 14 clean-slate only | 🟡 AT RISK | S | PRD 14 (partial) |
| STM-12 | Migration registry (version-keyed additive ops) | `migrations[]` array | ✅ Working | PRD 14 needs explicit section | 🟢 OK | M | PRD 14 |

### 1.4 GitHub Integration

| ID | Feature | Status | SDK Replatform | Risk | Effort | PRD |
|----|---------|--------|---------------|------|--------|-----|
| GH-1 | Ralph work monitor (issue polling + triage) | ✅ Working | SDK persistent session, event-driven | 🟢 OK | L | PRD 8 |
| GH-2 | Ralph heartbeat (GitHub Actions workflow) | ✅ Working | Three-layer monitoring preserved | 🟢 OK | M | PRD 8 |
| GH-3 | @copilot auto-assign to issues | ✅ Working | PRD 8 needs explicit section | 🟢 OK | S | PRD 8 |
| GH-4 | Issue triage by domain keyword matching | ✅ Working | SDK-based routing (richer) | 🟢 OK | M | PRD 8 |
| GH-5 | PII/email policy enforcement | ✅ Working | Hooks enforce at tool level | 🟢 OK | M | PRD 3 |
| GH-6 | Reviewer lockout protocol | ✅ Working | Programmatic enforcement via hooks | 🟢 OK | M | PRD 3 |
| GH-7 | File-write authorization (Source of Truth) | ✅ Working | Per-agent `onPreToolUse` hook | 🟢 OK | M | PRD 3 |

### 1.5 Distribution

| ID | Feature | Status | SDK Replatform | Risk | Effort | PRD |
|----|---------|--------|---------------|------|--------|-----|
| DST-1 | `npx github:bradygaster/squad` install path | ✅ Working | "Kept as alias" but primary moves to npm | 🟡 AT RISK | S | PRD 12 |
| DST-2 | Insider channel (`#insider` branch) | ✅ Working | PRD 12 needs explicit section | 🟡 AT RISK | S | PRD 12 |
| DST-3 | Version stamping into `squad.agent.md` | ✅ Working | PRD 12 mentions versions but not stamp mechanism | 🟡 AT RISK | S | PRD 12 (partial) |
| DST-4 | Semver comparison for upgrade logic | ✅ Working | Standard npm semver in TypeScript | 🟢 OK | S | PRD 12 |
| DST-5 | Project-type detection (npm/go/python/java/dotnet) | ✅ Working | PRD 12 needs explicit section | 🟡 AT RISK | M | PRD 12 |
| DST-6 | Project-adapted workflow stubs for non-npm | ✅ Working | PRD 12 needs explicit section | 🟡 AT RISK | M | PRD 12 |
| DST-7 | 12 workflow templates | ✅ Working | PRD 12 covers distribution | 🟡 AT RISK | L | PRD 12 |
| DST-8 | 18 template files (team DNA) | ✅ Working | PRD 14 needs explicit section | 🟢 OK | M | PRD 14 |
| DST-9 | MCP config scaffolding (`.copilot/mcp-config.json`) | ✅ Working | PRD 10 covers per-agent MCP, not scaffolding | 🟡 AT RISK | S | PRD 10 (partial) |
| DST-10 | `.squad-templates/` directory for reference | ✅ Working | Direct port | 🟢 OK | S | PRD 14 |

---

## 2. Summary Counts

**After PRD Gap Audit (2026-02-21):** All 16 "None" items have been mapped and resolved.

| Risk Level | Count | Features |
|------------|-------|----------|
| 🔴 GRAVE (no PRD coverage) | 0 | *(All 18 previously GRAVE items now mapped)* |
| 🟡 AT RISK (partial coverage) | 8 | CLI-2, CLI-4, CLI-5, CLI-9–12, AGT-10, AGT-11, AGT-12, STM-4, STM-6, STM-10, STM-11, DST-1, DST-3, DST-9 |
| 🟢 OK (covered) | 53 | Everything else + CLI-3, CLI-6–8, CLI-13–14, AGT-16, STM-7–9, STM-12, GH-3, DST-2, DST-5–8 |
| ⚪ INTENTIONAL DROP | 5 | 32KB prompt-only arch, convention-based file coordination, prompt-level policy enforcement, `.ai-team/` name, `.ai-team-templates/` name |

**Gap Resolution Summary:**
- **1 item:** Already covered (mapping error only) → updated to PRD 14
- **10 items:** Need addition to existing PRD → specific sections added to PRDs 4, 8, 12, 14
- **5 items:** Need new PRD → PRD 15 (@copilot roster mgmt) and PRD 16 (export/import)

See `.ai-team/docs/prd-gap-resolutions.md` for full audit details and required PRD additions.

---

## 3. New Capabilities Enabled by SDK

These are things Squad **cannot do today** but **could do** with the Copilot SDK (`@github/copilot-sdk`).

### 3.1 Programmatic Session Management

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Create/destroy sessions programmatically** | `client.createSession(config)`, `session.destroy()` | Replace prompt-level `task` tool spawning with true programmatic orchestration. Coordinator becomes TypeScript process, not a prompt. |
| **Resume sessions across restarts** | `client.resumeSession(sessionId, config)` | Ralph can resume monitoring sessions after crashes. Agent context survives process restarts. Solves Proposal 007 context pressure. |
| **Session listing & filtering** | `client.listSessions({ repository, branch })` | Multi-repo Squad coordination. List all active agent sessions per project. |
| **Abort in-flight work** | `session.abort()` | Graceful cancellation of agent work. Today, background agents run to completion or timeout. |
| **Session lifecycle events** | `session.created`, `session.deleted`, `session.updated` | Real-time awareness of agent state changes without polling. |

### 3.2 Hooks System (Replaces Prompt Engineering)

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Pre-tool-use interception** | `hooks.onPreToolUse(input)` → `{ permissionDecision, modifiedArgs }` | Reviewer lockout, file-write auth, PII scrubbing — enforced in code, not prompt adherence. Can `deny`, `allow`, or `ask` per tool call. |
| **Post-tool-use transformation** | `hooks.onPostToolUse(input)` → `{ modifiedResult }` | Transform tool results before agent sees them. Inject context, redact sensitive data. |
| **User prompt interception** | `hooks.onUserPromptSubmitted(input)` → `{ modifiedPrompt }` | Directive capture as code. Intercept and persist user preferences before the LLM sees them. |
| **Session lifecycle hooks** | `hooks.onSessionStart`, `hooks.onSessionEnd` | Context injection at session start (read team.md, decisions.md). Cleanup at session end (write orchestration log). |
| **Error handling hooks** | `hooks.onErrorOccurred(input)` → `{ errorHandling: "retry" \| "skip" \| "abort" }` | Programmatic error recovery. Model fallback chains as code, not prompt instructions. |

### 3.3 Custom Agents (Native Sub-Agent System)

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Named custom agents** | `SessionConfig.customAgents: CustomAgentConfig[]` | Register team members as named agents: `{ name: "baer", prompt: charter, mcpServers: {...} }`. Replaces ~300 lines of spawn orchestration in coordinator prompt. |
| **Per-agent MCP servers** | `CustomAgentConfig.mcpServers` | Backend Dev gets PostgreSQL MCP, Frontend gets Figma MCP. Currently impossible — MCP is session-global. |
| **Per-agent tool filtering** | `CustomAgentConfig.tools: string[]` | Restrict which tools each agent can use. Reviewer can't write files. Scribe can't run tests. |
| **Agent inference toggle** | `CustomAgentConfig.infer: boolean` | Control whether agents participate in model inference. |

### 3.4 BYOK & Multi-Provider

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Custom API providers** | `SessionConfig.provider: ProviderConfig` | Support `openai`, `azure`, `anthropic` provider types. `baseUrl`, `apiKey`, `bearerToken` fields. |
| **Azure AI Foundry** | `provider.type: "azure"`, `provider.azure.apiVersion` | Enterprise customers can use their own Azure OpenAI deployments. |
| **Ollama / local models** | `provider.type: "openai"`, `baseUrl: "http://localhost:11434"` | Air-gapped environments, local development without API keys. |
| **Dynamic model catalog** | `client.listModels()` → `ModelInfo[]` | Returns capabilities (vision, reasoning effort), limits (context window), policy state, billing multiplier. Replaces hardcoded model list. |

### 3.5 Infinite Sessions

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Automatic context compaction** | `SessionConfig.infiniteSessions: { enabled: true, backgroundCompactionThreshold: 0.80 }` | Sessions auto-compact at 80% context utilization. No manual compaction code needed. Solves context pressure (Proposal 007). |
| **Workspace persistence** | `session.workspacePath` → `checkpoints/`, `plan.md`, `files/` | Agent work persists to disk. Checkpoints enable undo/replay. |
| **Buffer exhaustion protection** | `infiniteSessions.bufferExhaustionThreshold: 0.95` | Blocks until compaction completes — prevents context overflow crashes. |

### 3.6 Streaming & Observability

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Real-time event streaming** | `SessionConfig.streaming: true` → `assistant.message_delta`, `assistant.reasoning_delta` | Live agent output display. Today, agents are black boxes until they finish. |
| **Typed event system** | `session.on("assistant.message", handler)` | 30+ event types with TypeScript type safety. Replace polling with push-based status updates. |
| **Session idle detection** | `session.on("session.idle", ...)` | Know exactly when an agent finishes. Eliminates `read_agent` timeout issues (P0 silent success bug — Proposal 015). |
| **Error events** | `session.on("session.error", ...)` with stack traces | Structured error information instead of opaque failures. |

### 3.7 Permissions System

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Programmatic permission control** | `SessionConfig.onPermissionRequest: PermissionHandler` | Approve/deny shell execution, file writes, MCP calls, reads, URLs per agent. `approveAll` utility for trusted agents. |
| **Permission categories** | `PermissionRequest.kind: "shell" \| "write" \| "mcp" \| "read" \| "url"` | Fine-grained access control. Reviewer agent: read-only. Scribe: write to `.squad/` only. |

### 3.8 User Input (Ask User)

| Capability | SDK API | Impact on Squad |
|-----------|---------|----------------|
| **Structured user input** | `SessionConfig.onUserInputRequest: UserInputHandler` | Multiple-choice questions, freeform text, with `choices` and `allowFreeform` options. Today's `ask_user` returns unpredictable text. |

---

## 4. Migration Gap Analysis

### 4.1 Distance Summary

| Category | Current Features | Covered by PRDs | GRAVE Gap | AT RISK | Net Migration Distance |
|----------|-----------------|-----------------|-----------|---------|----------------------|
| CLI Commands | 16 | 6 fully, 6 partial | 7 | 3 | **HIGH** — 7 features with zero PRD coverage |
| Agent System | 17 | 14 | 1 | 3 | **LOW** — well-covered, minor clarifications needed |
| State Management | 12 | 6 | 4 | 4 | **MEDIUM** — identity system and migration registry uncovered |
| GitHub Integration | 7 | 5 | 1 | 0 | **LOW** — @copilot auto-assign is the only gap |
| Distribution | 10 | 3 | 5 | 3 | **HIGH** — workflow templates, project detection, insider channel missing |
| **TOTAL** | **62** | **34** | **18** | **13** | — |

### 4.2 Critical Migration Paths

#### Path A: CLI → SDK Runtime (Effort: XL)

```
Current:   index.js (1662 lines, pure Node.js)
           └─ 9 subcommands, sync/blocking, process.exit() everywhere
           
Target:    TypeScript CLI + SDK client
           └─ init/upgrade remain SDK-free (scaffolding only)
           └─ watch/orchestrate use SDK sessions
           └─ export/import/copilot/plugin preserved as CLI commands
           
Gap:       - SDK-free init confirmed (resolved in open-questions.md)
           - `--include-sdk` flag for optional SDK bundling
           - esbuild bundling for ~5MB target (PRD 12)
           - Migration registry pattern needs TypeScript equivalent
           - 12 workflow templates need path audit (.ai-team/ → .squad/)
```

#### Path B: Coordinator Prompt → SDK Orchestrator (Effort: XL)

```
Current:   squad.agent.md (32KB prompt, ~17K tokens of policy)
           └─ All routing, spawning, ceremony, policy in prompt text
           └─ User-readable/editable
           
Target:    squad.agent.md (~12KB, reference doc only)
           └─ TypeScript runtime reads config files
           └─ Hooks enforce policy (PRD 3)
           └─ CustomAgentConfig[] registers team members (SDK native)
           └─ Routing logic as code with LLM fallback (PRD 5)
           
Gap:       - Customizability regression (#1 UX risk)
             Today: users read/edit 32KB prompt
             After: users edit JSON/YAML config files
             DECISION: Config-driven architecture (resolved in open-questions.md)
           - Per-agent model selection: SDK `CustomAgentConfig` has NO model field
             Must use session-level model or generate separate .agent.md files
           - Scribe fire-and-forget: SDK sessions are sync (sendAndWait)
             Parallel sync ≈ background, but no true fire-and-forget
```

#### Path C: File Conventions → Custom Tools (Effort: L)

```
Current:   Drop-box pattern (write to decisions/inbox/*.md)
           └─ Convention-based: agents write files, coordinator reads
           └─ Lock-free, works today
           
Target:    Typed tools: squad_decide, squad_route, squad_discover
           └─ Tool definitions with JSON Schema parameters
           └─ Handler functions in TypeScript
           └─ SDK Tool type: { name, description, parameters, handler }
           
Gap:       - Tool parameter schemas need design
           - Backward compat: agents still on prompt-based spawning
             during hybrid Phase 1 must use file conventions
           - Dual-mode support needed for transition period
```

#### Path D: Prompt Policy → Hooks (Effort: L)

```
Current:   ~17K tokens of policy instructions in squad.agent.md
           └─ PII scrubbing: "NEVER include email addresses"
           └─ File auth: "Scribe may ONLY write to .squad/"
           └─ Reviewer lockout: "NEVER approve your own PR"
           
Target:    SessionHooks with TypeScript enforcement
           └─ onPreToolUse: check file paths, deny unauthorized writes
           └─ onPostToolUse: scan output for PII, redact
           └─ onErrorOccurred: retry with fallback model
           
Gap:       - Hooks are session-scoped, not per-agent
             Must route via sessionId lookup to apply agent-specific rules
           - Replace mode (`systemMessage.mode: "replace"`) removes
             ALL SDK guardrails — security risk if misused
           - onPreToolUse returns permissionDecision but
             can't inject additional context AND deny in same call
```

#### Path E: gh CLI Polling → SDK Event Stream (Effort: L)

```
Current:   squad watch: setInterval + gh issue list + keyword matching
           └─ 10-min polling interval
           └─ Keyword-based domain routing (fragile)
           
Target:    Ralph as persistent SDK session (PRD 8)
           └─ Event-driven: session.on("session.idle", ...)
           └─ SDK createSession + resumeSession for crash recovery
           └─ Still uses gh CLI for GitHub API (SDK has no GitHub API)
           
Gap:       - SDK doesn't provide GitHub event webhooks
             Still need gh CLI or GitHub MCP for issue queries
           - resumeSession reliability not validated
             (Brady: "assume it works, exercise early")
           - Fallback: must still work without SDK installed
```

### 4.3 What We Keep As-Is

These features survive the replatform unchanged because they're filesystem-based, not prompt-based:

| Feature | Why It Survives |
|---------|----------------|
| `.squad/` directory structure | SDK doesn't replace filesystem memory — it's our differentiator |
| Agent history files | Filesystem is source of truth. SDK adds sessions; we keep history.md |
| Casting state (JSON files) | PRD 11 moves to TypeScript primary but preserves JSON for Phase 1 |
| Skills (SKILL.md) | SDK `skillDirectories` config points to existing `.squad/skills/` |
| Decision governance | Drop-box pattern preserved; typed tools are additive |
| Ceremony definitions | `ceremonies.md` read at session start via `onSessionStart` hook |
| Template files (team DNA) | Scaffolding is SDK-free; templates are pure files |

### 4.4 What We Intentionally Drop

| Feature | Replacement | Rationale |
|---------|------------|-----------|
| 32KB prompt-only architecture | TypeScript runtime + 12KB reference prompt | Entire replatform purpose |
| Convention-based file coordination | Custom Tools API (PRD 2) | Typed tools > file conventions |
| Prompt-level policy enforcement | Hooks (PRD 3) | Code enforcement > prompt compliance |
| `.ai-team/` directory name | `.squad/` | Already deprecated with migration path |
| `.ai-team-templates/` name | `.squad-templates/` or embedded in bundle | Part of clean-slate |

### 4.5 Effort Estimates by Phase

| Phase | Target | Features | Estimated Effort |
|-------|--------|----------|-----------------|
| Phase 1 (v0.6.0) | SDK as infrastructure, coordinator as agent.md | SDK client setup, CustomAgentConfig registration, per-agent MCP, BYOK, basic hooks | 3–5 weeks |
| Phase 2 (v0.7.0) | Coordinator as Node.js process | Full programmatic control, custom tools, event streaming, observability | 8–12 weeks |
| Phase 3 (v0.8.0) | Feature parity + new capabilities | Export/import with SDK sessions, marketplace as MCP, A2A communication | 4–6 weeks |
| Phase 4 (v1.0.0) | Stable release | Remove dual-path, remove `.ai-team/`, cut legacy code | 2–3 weeks |

### 4.6 Blocking Decisions Still Needed

| Decision | Owner | Impact |
|----------|-------|--------|
| Package name for npm registry | Brady | PRD 12 says `@bradygaster/squad` — confirmed? |
| Model fallback chain specification | Brady | Which specific models in each tier? SDK doesn't do fallbacks natively. |
| Provider override scope (session vs. global) | Brady | SDK ProviderConfig is per-session. Do users need global default? |
| Quota routing (org-level cost budgets) | Brady | SDK has `ModelBilling.multiplier` but no quota enforcement. |
| OTLP export for observability | Brady | PRD 6 mentions external dashboards. OTLP or custom format? |
| PRD 16 scope (export/import + marketplace) | Brady/Keaton | GRAVE items 1–3 need formal PRD. Scope with agent marketplace? |

---

*Generated by Kujan (Copilot SDK Expert). This document is input for McManus's Mermaid diagram work. Update as PRDs evolve and decisions land.*
