# 032a: `runSubagent` API Research — Spike Output

**Author:** Strausz (VS Code Extension Expert)
**Date:** 2026-02-14
**Issue:** #32 — VS Code: Test and document runSubagent as Squad spawn mechanism
**Status:** Complete

---

## Summary of Findings

VS Code Copilot's `runSubagent` is the editor-native equivalent of the CLI's `task` tool. It spawns an isolated sub-agent with its own context window, runs it to completion, and returns the result to the orchestrating agent. The mechanism is **not** a direct 1:1 replacement for `task` — it's architecturally different in several key ways — but the conceptual model (coordinator delegates work to specialists) maps cleanly to Squad's spawn pattern.

**Key headline:** `runSubagent` is viable as Squad's VS Code spawn mechanism, with some adaptation. The biggest wins are parallel execution support and custom agent integration. The biggest gaps are the lack of explicit `agent_type` and the different approach to model selection.

---

## What `runSubagent` Actually Is

- A **built-in tool** in VS Code Copilot Chat (tool name: `runSubagent` or `agent`)
- Spawns a sub-agent in an **isolated context window** — no shared conversation history or instructions
- The sub-agent receives only the **task prompt** provided by the caller
- Results return to the main agent as a collapsible tool call in the chat UI
- Available since VS Code 1.106+ (previously part of "custom chat modes")

### How It Differs from CLI `task`

The CLI `task` tool is **parameter-driven**: you pass `agent_type`, `mode`, `model`, `description`, and `prompt` as structured parameters. `runSubagent` is **agent-driven**: behavior is configured via `.agent.md` files, and the tool itself primarily takes a prompt. Configuration that CLI handles via parameters, VS Code handles via agent definition files.

---

## Parameter Comparison: CLI `task` vs VS Code `runSubagent`

| CLI `task` Parameter | VS Code `runSubagent` Equivalent | Notes |
|---|---|---|
| `agent_type` ("explore", "task", "general-purpose", "code-review") | **Custom agent selection** via `.agent.md` files | No direct parameter. The orchestrator names a custom agent in the prompt (e.g., "Use the Researcher agent"). Custom agents define their own tool access and instructions. |
| `mode` ("sync" / "background") | **Always synchronous** (blocking) but supports **parallel spawning** | Sub-agents block individually, but multiple can run concurrently. No `mode` parameter — parallelism comes from spawning multiple sub-agents in a single turn. |
| `model` | **`model` field in `.agent.md` frontmatter** | Subagent inherits parent model by default. Override via custom agent definition: `model: "Claude Haiku 4.5"` or `model: ["Claude Opus 4.5", "GPT-5.2"]` (prioritized list). Experimental: requires `chat.customAgentInSubagent.enabled: true`. |
| `description` | **`description` field in `.agent.md` frontmatter** + **`name` field** | The agent's name and description come from the `.agent.md` file, not from the spawn call. |
| `prompt` | **Prompt text passed to `runSubagent`** | Direct equivalent. The orchestrator provides a task prompt to the sub-agent. This is the primary parameter. |
| (no equivalent) | **`tools` field in `.agent.md` frontmatter** | VS Code can restrict tool access per agent (e.g., `tools: ['read', 'search']`). CLI sub-agents get a fixed toolset per `agent_type`. |
| (no equivalent) | **`agents` field in `.agent.md` frontmatter** | VS Code can restrict which sub-agents a coordinator can spawn. CLI has no equivalent. |
| (no equivalent) | **`handoffs`** | VS Code supports sequential handoff workflows between agents. No CLI equivalent. |
| (no equivalent) | **`user-invokable` / `disable-model-invocation`** | Controls visibility in UI and auto-invocation by other agents. |

### Critical Gaps

1. **No `agent_type` parameter.** Squad must define custom `.agent.md` files per specialist role instead of relying on built-in agent types. This is actually *more* powerful but requires additional files.

2. **No `mode: "background"`.** Sub-agents are always synchronous (the main agent waits). However, **multiple sub-agents CAN run in parallel** — VS Code spawns them concurrently when requested in the same turn. This covers Squad's Eager Execution fan-out pattern.

3. **Model selection requires custom agents.** You can't pass `model` as a spawn parameter. It must be declared in the `.agent.md` frontmatter. Per-agent model selection (Squad's tiered model system) requires one `.agent.md` per agent-model combination, or a single agent with a prioritized model list.

---

## Detection Strategy

### How can `squad.agent.md` detect VS Code vs CLI?

There is **no explicit environment variable** that says "you are in VS Code." However, several reliable signals exist:

| Signal | Detection Method | Reliability |
|---|---|---|
| **Tool availability** | Check if `runSubagent` or `agent` tool is available in the tool list | ✅ High — this tool only exists in VS Code |
| **Tool absence** | Check if `task` tool is NOT available | ✅ High — `task` is CLI-only |
| **Tool list shape** | VS Code provides `editFiles`, `search`, `codebase`; CLI provides `powershell`, `grep`, `glob` | ⚠️ Medium — names may change |
| **Agent file detection** | Check for `.github/agents/` custom agent files | ⚠️ Low — both surfaces can read these |

### Recommended Detection Approach

Use a **capability probe** pattern in `squad.agent.md`:

```markdown
## Platform Detection

Before spawning agents, determine the platform:

1. If the `task` tool is available → **CLI mode**. Use `task` tool with `agent_type`, `mode`, `model`, `description`, `prompt` parameters.
2. If the `runSubagent` or `agent` tool is available → **VS Code mode**. Use `runSubagent` with custom agent references.
3. If neither is available → **Fallback mode**. Work inline (no delegation).
```

This is the simplest and most robust approach. The coordinator's system prompt already lists available tools — checking for `task` vs `runSubagent`/`agent` is a natural conditional.

---

## Parallel Execution — Eager Execution Parity

### How It Works in CLI

The CLI achieves parallelism via `mode: "background"` — multiple `task` calls in a single response run concurrently. Results are collected via `read_agent`.

### How It Works in VS Code

VS Code achieves parallelism by **spawning multiple sub-agents in a single prompt**. The platform runs them concurrently and the main agent waits for all results before continuing. This is functionally equivalent to Squad's fan-out pattern, but:

- ✅ Multiple sub-agents can run in parallel
- ✅ Results are collected automatically (no `read_agent` needed)
- ⚠️ No "fire and forget" — the orchestrator always waits
- ⚠️ No incremental result collection (all-or-nothing)

### Impact on Squad

Squad's Eager Execution philosophy ("launch aggressively, collect results later") maps to VS Code's parallel sub-agents. The main difference:

- **CLI:** Spawn 4 background agents → continue talking to user → collect results later
- **VS Code:** Spawn 4 parallel sub-agents → wait for all 4 → then continue

For Squad, this means the VS Code coordinator should batch ALL concurrent spawns into a single sub-agent invocation round, rather than fire-and-forget. The user sees all results at once rather than incrementally.

---

## MCP Tool Inheritance

### CLI Behavior
CLI sub-agents spawned via `task` do **NOT** inherit MCP tools from the parent session. Each agent type (`explore`, `task`, `general-purpose`, `code-review`) has a fixed toolset.

### VS Code Behavior
VS Code sub-agents **DO inherit** the parent agent's tools by default — including MCP tools. This is a significant difference:

- Default sub-agents get the same model and tools as the parent
- Custom agents can **restrict** tools via the `tools` field in `.agent.md`
- Custom agents can **extend** tools by adding MCP server references
- The `tools: ['*']` setting gives access to all available tools

### Impact on Squad
This is a **net positive** for VS Code. Squad agents running in VS Code get richer tool access by default. However, it means Squad should define explicit tool restrictions in custom agent files for security-sensitive roles (e.g., a reviewer should only have read access).

---

## Recommended Approach for Squad

### Phase 1: Conditional Logic in `squad.agent.md`

Add platform detection to the coordinator instructions:

```markdown
### Platform-Aware Spawning

Detect your platform at session start:
- If `task` tool is available → CLI mode
- If `agent` tool is available → VS Code mode

**CLI mode:** Use `task` tool with agent_type, mode, model, description, prompt.
**VS Code mode:** Use `runSubagent`/`agent` tool, referencing custom agents by name.
  Parallel fan-out: request multiple sub-agents in the same prompt.
```

### Phase 2: Custom Agent Definitions

Create `.github/agents/` files for each Squad role that map to CLI agent types:

| Squad Agent | CLI `agent_type` | VS Code Custom Agent File |
|---|---|---|
| Coordinator | (self) | `squad.agent.md` (already exists) |
| Lead / Specialist | `general-purpose` | `squad-worker.agent.md` (tools: all) |
| Explorer / Researcher | `explore` | `squad-explorer.agent.md` (tools: read, search) |
| Reviewer | `code-review` | `squad-reviewer.agent.md` (tools: read, search, usages) |
| Task runner | `task` | `squad-runner.agent.md` (tools: all + terminal) |

Each file specifies:
- `name` and `description` matching the Squad role
- `tools` restricting access appropriately
- `model` (optional) for per-role model selection
- `user-invokable: false` — these are sub-agent-only definitions

### Phase 3: Graceful Degradation

If neither `task` nor `runSubagent`/`agent` is available:
- Coordinator works inline (no delegation)
- Warn the user: "Running without agent spawning — results will be less comprehensive."
- This covers future surfaces (JetBrains, GitHub.com) that may not support either mechanism yet.

---

## Open Questions

1. **Does `runSubagent` support structured parameters?** The official docs show prompt-only usage. Can we pass structured data (like the CLI's JSON parameters)?
   - *Current answer:* No. The prompt is the only input. Agent configuration lives in `.agent.md` files.

2. **Can custom sub-agents read `.ai-team/` files?** If sub-agents have `read` tool access, they can read any workspace file. This should work, but needs validation.

3. **What happens if a sub-agent fails?** CLI `task` returns error information. VS Code behavior on sub-agent failure is less documented.

4. **Can the coordinator dynamically select which custom agent to use?** Yes — the orchestrator mentions the agent by name in the prompt (e.g., "Use the Researcher agent to..."). This maps to Squad's routing logic.

5. **Git worktree isolation:** VS Code sub-agents can optionally work in isolated worktrees. Is this relevant for Squad's parallel write pattern?

---

## References

- [VS Code Docs: Subagents](https://code.visualstudio.com/docs/copilot/agents/subagents)
- [VS Code Docs: Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Docs: Background Agents](https://code.visualstudio.com/docs/copilot/agents/background-agents)
- [GitHub Issue #274630: Run subagents in parallel](https://github.com/microsoft/vscode/issues/274630)
- [GitHub Issue #275855: Allow specifying model for runSubagent](https://github.com/microsoft/vscode/issues/275855)
- [GitHub Issue #278835: runSubagent inherits tool definitions from parent](https://github.com/microsoft/vscode/issues/278835)
- [GitHub Docs: Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
