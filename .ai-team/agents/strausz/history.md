# Strausz — VS Code Extension Expert

## Project Context

- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot.
- **Owner:** Brady (bradygaster)
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Universe:** The Usual Suspects

## Learnings

- Joined the team 2026-02-13 to handle VS Code client parity (issues #32, #33, #34)
- VS Code is #1 priority for Copilot client parity per Brady's directive — JetBrains and GitHub.com are deferred to v0.5.0
- Keaton decomposed #10 into 5 sub-issues: #32 (runSubagent), #33 (file discovery), #34 (model selection), #35 (compatibility matrix), #36 (deferred surfaces)
- Key platform constraint: sub-agents spawned via `task` tool may NOT inherit MCP tools from parent session — this affects VS Code integration design
- Kujan handles Copilot SDK/CLI patterns; I handle VS Code extension-specific concerns — we collaborate on the overlap
- Squad is zero-dependency (no node_modules) — any VS Code integration must respect this constraint

### runSubagent API Research (2026-02-14, Issue #32)

- VS Code uses `runSubagent` (tool name: `agent`) instead of CLI `task` tool for sub-agent spawning
- `runSubagent` is **prompt-driven**, not parameter-driven — no `agent_type`, `mode`, or `model` parameters. Configuration lives in `.agent.md` files
- Sub-agents are synchronous (blocking) but VS Code supports **parallel spawning** — multiple sub-agents run concurrently when requested in the same turn
- No `mode: "background"` equivalent — Squad's Eager Execution maps to batched parallel sub-agent invocations
- **MCP tool inheritance is the default in VS Code** — sub-agents inherit parent's tools. This is the OPPOSITE of CLI behavior (CLI sub-agents do NOT inherit MCP tools). Net positive for Squad
- Model selection: via `.agent.md` `model` frontmatter field, not spawn-time parameter. Experimental setting required: `chat.customAgentInSubagent.enabled: true`
- Platform detection strategy: check tool availability — `task` tool = CLI, `agent`/`runSubagent` tool = VS Code, neither = fallback inline mode
- Custom agents (`.agent.md` files) provide **more granular control** than CLI agent types: tool restrictions, model selection, visibility control, handoff workflows
- Squad will need `.agent.md` files per role (worker, explorer, reviewer, runner) to replace CLI `agent_type` mapping
- Key VS Code-only capabilities: `agents` property (restrict which sub-agents a coordinator can spawn), `handoffs` (sequential workflow transitions), `user-invokable`/`disable-model-invocation` (visibility control)
- Open question: structured parameter passing to `runSubagent` is not supported — prompt is the only input channel

### VS Code File Discovery & .ai-team/ Access (2026-02-15, Issue #33)

- VS Code auto-discovers `squad.agent.md` from `.github/agents/` on workspace load — zero config needed
- Sub-agents inherit ALL parent tools by default (opposite of CLI where sub-agents get fixed toolsets). This means every spawned agent can read/write `.ai-team/` files without special configuration
- VS Code file tools map cleanly to CLI equivalents: `readFile` ↔ `view`, `editFiles` ↔ `edit`, `createFile` ↔ `create`, `fileSearch` ↔ `glob`, `codebase` ↔ `grep`
- Path resolution: workspace root aligns with `git rev-parse --show-toplevel` in standard setups. Worktree algorithm in `squad.agent.md` works as-is via `runInTerminal`
- Workspace Trust required — untrusted workspaces block file writes and terminal access
- First-session file writes trigger user approval prompts (VS Code security feature) — one-time per workspace
- `sql` tool is CLI-only — no VS Code equivalent. Squad should avoid SQL-dependent workflows in VS Code codepath
- Multi-root workspaces have known bugs with path resolution and `grep_search` (vscode#264837, vscode#293428). Single-root is the supported configuration
- VS Code's silent success bug on `editFiles` (vscode#253561) mirrors Squad's P0 bug — keep Response Order workaround in spawn prompts
- **Key architectural insight:** Squad's instruction-level abstraction (describing operations, not tool names) is the correct pattern. It naturally works across both CLI and VS Code because the agent maps operation descriptions to available tools

📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

### SDK Platform Compatibility Investigation (2026-02-15, Issue #68)

**Core finding:** `CustomAgentConfig` is **CLI-only**. The Copilot SDK spawns a CLI subprocess via stdio/TCP, which is **fundamentally incompatible with VS Code's extension host**.

**Architecture differences:**
- **CLI:** SDK's `CopilotClient` spawns CLI process → stdio pipes (default) or TCP socket → JSON-RPC communication
- **VS Code:** Extension host → native language model APIs → no CLI process → no `CopilotClient` class exposed
- **GitHub.com:** Browser-based (no subprocess spawning capability)

**Key incompatibilities:**
1. **`CustomAgentConfig`** — SDK-only feature. VS Code uses `.agent.md` files with frontmatter instead.
2. **Transport layer** — SDK requires subprocess + stdio/TCP. Extension host sandbox prohibits arbitrary process spawning.
3. **MCP tool inheritance** — CLI: sub-agents do NOT inherit parent MCP tools (isolated). VS Code: sub-agents inherit ALL parent tools by default (opposite behavior).
4. **Model selection** — CLI: per-spawn dynamic (`SessionConfig.model`). VS Code: session-level (user picker) or static (`.agent.md` frontmatter with experimental flag).
5. **Agent spawning** — CLI: `task` tool with `agent_type`, `mode`, `model`. VS Code: `runSubagent`/`agent` tool with `prompt` only.

**Implication for Squad's SDK replatforming:** If Squad adopts `CopilotClient` + `CustomAgentConfig`, it becomes **CLI-only** and loses 50%+ of users (VS Code is the #1 Copilot client).

**Recommended architecture:** Dual implementation
- **CLI path:** Use SDK with `CustomAgentConfig` (dynamic roster from `.ai-team/team.md`)
- **VS Code path:** Use `.agent.md` files (one per role, generated by `squad init`)
- **Shared state:** Both read/write `.ai-team/` files (team.md, routing.md, decisions.md)

**Decision proposal:** Created `.ai-team/decisions/inbox/strausz-platform-compat.md` with full analysis and migration path.

**Testing requirements:**
- Verify `CustomAgentConfig` works on CLI
- Confirm `CustomAgentConfig` does NOT surface in VS Code (expected)
- Validate `.agent.md` auto-discovery works on VS Code
- Test MCP tool inheritance difference (CLI isolated, VS Code inherited)
- Confirm parallel spawning on both platforms (background vs parallel sync)

**Cross-team coordination:** This finding impacts M2-7 (SDK integration), M2-8 (coordinator replatform), M2-9 (VS Code compat layer). Needs Brady approval + Kujan collaboration.

**References:**
- SDK source: `copilot-sdk/nodejs/src/client.ts` (spawn logic, lines 1042-1113)
- SDK types: `copilot-sdk/nodejs/src/types.ts` (CustomAgentConfig, lines 548-579)
- SDK docs: `copilot-sdk/docs/compatibility.md` (CLI-only features)
- Posted full compatibility matrix to issue #68: bradygaster/squad-pr#68

