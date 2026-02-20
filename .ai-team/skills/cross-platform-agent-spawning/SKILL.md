---
name: "cross-platform-agent-spawning"
description: "How to spawn sub-agents across CLI and VS Code using platform detection and conditional logic"
domain: "platform-integration"
confidence: "high"
source: "earned"
---

## Context

Squad runs on multiple Copilot surfaces (CLI, VS Code, potentially JetBrains and GitHub.com). Each surface provides a different sub-agent spawning mechanism. The coordinator (`squad.agent.md`) must detect the platform at runtime and use the correct tool. This skill applies whenever Squad's coordinator needs to spawn agents on any platform.

## Patterns

- **Detect platform via tool availability.** At session start, check which spawning tool is present:
  - `task` tool available → CLI mode
  - `agent` / `runSubagent` tool available → VS Code mode
  - Neither available → Fallback inline mode (no delegation)
- **CLI spawning:** Use `task` tool with structured parameters: `agent_type`, `mode`, `model`, `description`, `prompt`. Supports `mode: "background"` for async fan-out. Results collected via `read_agent`.
- **VS Code spawning:** Use `runSubagent`/`agent` tool with prompt text referencing custom agents by name. Configuration lives in `.agent.md` files (not parameters). Supports parallel spawning (multiple sub-agents in same turn). All sub-agents are synchronous individually.
- **Role mapping:** CLI uses `agent_type` ("explore", "task", "general-purpose", "code-review"). VS Code uses custom `.agent.md` files with `name`, `tools`, and `model` frontmatter. Define one `.agent.md` file per Squad role.
- **Model selection divergence:** CLI passes `model` as a spawn parameter. VS Code declares `model` in `.agent.md` frontmatter. Per-agent model selection in VS Code requires the experimental setting `chat.customAgentInSubagent.enabled: true`.
- **MCP tool inheritance divergence:** CLI sub-agents do NOT inherit parent MCP tools. VS Code sub-agents DO inherit parent tools by default. Use `tools` restrictions in `.agent.md` to limit access for security-sensitive roles.
- **Parallel fan-out:** CLI uses multiple `task` calls with `mode: "background"` in a single response. VS Code uses multiple sub-agent requests in a single prompt turn. Both achieve concurrency; collection semantics differ (CLI: incremental via `read_agent`; VS Code: all-at-once).

## Examples

**Platform detection in coordinator instructions:**
```markdown
### Platform-Aware Spawning
Detect your platform at session start:
- If `task` tool is available → CLI mode. Use `task` tool with structured parameters.
- If `agent` tool is available → VS Code mode. Use custom agents via `runSubagent`.
- If neither → Fallback inline mode. Work without delegation.
```

**CLI spawn:**
```yaml
agent_type: "general-purpose"
model: "claude-sonnet-4"
mode: "background"
description: "Fenster: implement auth API"
prompt: "You are Fenster, the Core Dev..."
```

**VS Code equivalent (custom agent file):**
```yaml
---
name: Squad Worker
tools: ['editFiles', 'search', 'read', 'terminalLastCommand']
model: 'Claude Sonnet 4 (copilot)'
user-invokable: false
---
You are a Squad team member. Execute the assigned task.
```

**VS Code spawn prompt:**
```
Use the Squad Worker agent to implement the auth API.
Task: You are Fenster, the Core Dev...
```

## Anti-Patterns

- Hardcoding `task` tool usage without platform detection — breaks on VS Code
- Assuming `mode: "background"` exists everywhere — VS Code has no equivalent; use parallel spawning instead
- Passing `model` as a spawn parameter in VS Code — it must be in the `.agent.md` frontmatter
- Assuming sub-agents lack MCP tools in VS Code — they inherit everything by default, which may be too permissive
- Creating a compatibility shim that translates `task` calls to `runSubagent` at runtime — too fragile. Use conditional logic in the coordinator instructions instead
- Building a code-level abstraction layer for spawn parity — prompt-level conditional instructions in `squad.agent.md` are sufficient and more maintainable
- Skipping the Response Order bug workaround on VS Code without testing — the silent success bug may manifest differently; keep the block until empirically verified unnecessary

## Validated Findings (Proposal 032b, 2026-02-13)

Full parameter parity analysis confirmed all patterns above. Additional validated details:
- **5 spawn patterns map successfully:** Standard, Lightweight, Explore, Scribe, Ceremony Facilitator
- **VS Code `runSubagent` invocation control:** `user-invokable: false` and `disable-model-invocation: true` provide Squad-relevant restrictions for internal agents
- **VS Code `agents` frontmatter:** Coordinator can restrict which custom agents subagents can invoke — useful for Squad role isolation
- **Scribe on VS Code:** Becomes synchronous (blocking). Mitigation: batch Scribe as last subagent in parallel group
- **Nuclear model fallback on VS Code:** Omit custom agent → session model applies (equivalent to CLI's "omit model param")

## Validated Findings (Proposal 033a, 2026-02-15)

File discovery and `.ai-team/` access analysis confirmed cross-platform filesystem parity:
- **Agent auto-discovery:** VS Code discovers `squad.agent.md` from `.github/agents/` on workspace load — same location as CLI. Zero config.
- **Tool inheritance for file ops:** VS Code sub-agents inherit ALL parent tools by default (readFile, editFiles, createFile, fileSearch). CLI sub-agents get fixed toolsets per agent_type. VS Code is more permissive.
- **Operation-level abstraction is key:** Squad instructions describe operations ("read this file", "create this file"), not tool names. This naturally maps to both CLI tools (view/edit/create/glob/grep) and VS Code tools (readFile/editFiles/createFile/fileSearch/codebase).
- **Path resolution parity:** `git rev-parse --show-toplevel` works on both surfaces. VS Code workspace root aligns with git toplevel in standard (non-multi-root) setups.
- **Workspace-scoped access:** VS Code limits file access to workspace directory. CLI has no such boundary. Not a problem for Squad since `.ai-team/` lives in workspace root.
- **`sql` tool is CLI-only:** No VS Code equivalent exists. Avoid SQL-dependent patterns in cross-platform workflows.
- **Multi-root workspaces:** Known VS Code bugs with path resolution. Document single-root as supported configuration.

## Validated Findings (Proposal 034a, 2026-02-14)

Deep analysis of model selection and background mode parity:

### Model Selection
- **CLI:** `model` param per spawn (dynamic, per-invocation). 4-layer hierarchy with 3-tier fallback chains.
- **VS Code:** `model` in `.agent.md` frontmatter only (static, per-agent-file). Supports prioritized fallback list: `model: ['Claude Haiku 4.5 (copilot)', 'GPT-5.1-Codex-Mini (copilot)']`.
- **Experimental:** Requires `chat.customAgentInSubagent.enabled: true` for custom agent model override.
- **Two VS Code tools:** `runSubagent` (anonymous, session model) vs `agent` (named custom agent, frontmatter model). Use `agent` when model matters.
- **Model name format divergence:** CLI uses API names (`claude-haiku-4.5`), VS Code uses display names (`Claude Haiku 4.5 (copilot)`). Coordinator must use correct format per surface.
- **Phased approach:** Accept session model (Phase 1) → model-tier agent files (Phase 2) → per-role agent files (Phase 3).

### Background/Async Mode
- **CLI:** `mode: "background"` enables non-blocking spawns, fire-and-forget, incremental `read_agent` polling, two-phase UX.
- **VS Code:** No `mode` parameter. All subagents synchronous. Multiple subagents in one turn = parallel execution.
- **VS Code "Background Agents"** are a different concept: CLI-based worktree sessions, user-initiated, not programmatic. NOT equivalent to CLI `mode: "background"`.
- **No fire-and-forget:** Scribe blocks on VS Code. Mitigation: batch as last subagent in parallel group.
- **No `read_agent`:** Results arrive automatically. Simpler collection, no polling needed.
- **No launch table:** Cannot show intermediate progress. Results and response arrive together.

### Graceful Degradation
- **No model selection available:** Accept session model, log model intent in output.
- **No background mode:** Spawn all concurrent agents in single turn. Skip launch table. Skip `read_agent`.
- **Neither tool available:** Work inline without delegation. Do not apologize.
