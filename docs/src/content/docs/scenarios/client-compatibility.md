# Agent CLI Compatibility Matrix

> **Quick answer:** Not sure which interface to use? See [Choose your interface](../get-started/choose-your-interface.md) for a concise decision tree and comparison.

Squad works with multiple agent CLIs and surfaces — each with its own agent spawning mechanism, tool set, and constraints. This document maps Squad's core capabilities across Copilot CLI, Claude Code, Gemini CLI, OpenCode, VS Code, and more to help you understand what works where.

## Quick Reference

| Feature | Copilot CLI | Claude Code | Gemini CLI | OpenCode | VS Code |
|---------|:-----------:|:-----------:|:----------:|:--------:|:-------:|
| **Sub-agent spawning** | ✅ `task` tool | ✅ Agent tool | ✅ | ✅ | ✅ `runSubagent` |
| **Agent type selection** | ✅ Full | ✅ Full | ⚠️ Limited | ⚠️ Limited | ✅ Custom agents |
| **Per-spawn model selection** | ✅ Dynamic | ⚠️ Session model | ⚠️ Session model | ⚠️ Session model | ⚠️ Static |
| **Background/async execution** | ✅ Background mode | ✅ Background agents | ✅ | ⚠️ | ⚠️ Sync only |
| **Parallel fan-out** | ✅ Background + `read_agent` | ✅ Multiple agents | ✅ | ✅ | ✅ Multiple subagents |
| **File discovery (.github/agents/)** | ✅ Automatic | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ✅ Automatic |
| **`.squad/` file access** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Workspace-scoped |
| **MCP server access** | ✅ Full | ✅ Full | ✅ Full | ⚠️ Limited | ✅ Full |

**Legend:**
- ✅ **Works** — Feature is fully supported with no degradation
- ⚠️ **Limited** — Feature works with constraints, degraded experience, or special configuration
- ❌ **Not available** — Feature cannot be used on this surface
- ? **Untested** — Not yet validated in production

---

## CLI (Copilot CLI / Claude Code / Gemini CLI / OpenCode)

Squad's **primary platform**. All agent CLIs share the same `.squad/` state and `squad.agent.md` prompt. The sections below detail Copilot CLI specifics, but the core workflow (read agent file, spawn sub-agents, write to `.squad/`) works across all CLIs.

### Agent Spawning

- **Tool:** `task`
- **Parameters:** `agent_type`, `mode`, `model`, `description`, `prompt`
- **Agent types:**
  - `general-purpose` — Full tool access (file ops, CLI, SQL, web, GitHub MCP)
  - `explore` — Read-only tools (grep, glob, view) — optimized for speed and cost
  - `task` — CLI tools + Haiku model (rarely used by Squad)
  - `code-review` — Investigation tools (available but Squad uses its own reviewer pattern)

### Model Selection

- **Mechanism:** Per-spawn `model` parameter
- **Dynamic:** Yes — each spawn can use a different model
- **4-layer hierarchy:**
  1. User override ("use opus")
  2. Agent charter preference (`## Model` section)
  3. Task-aware auto-select (cost-first: haiku for docs, sonnet for code, opus for design)
  4. Default: `claude-haiku-4.5`
- **Fallback chains:** 3 retries + nuclear (omit parameter → platform default)
  - Premium: `claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.5 → (omit)`
  - Standard: `claude-sonnet-4.5 → gpt-5.2-codex → claude-sonnet-4 → gpt-5.2 → (omit)`
  - Fast: `claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini → (omit)`

### Background/Async Execution

- **Mechanism:** `mode: "background"`
- **Behavior:** Non-blocking spawns, fire-and-forget
- **Result collection:** `read_agent` with `wait: true/false` for polling
- **Squad's typical flow:**
  1. Spawn 3-5 agents as background tasks in one response
  2. Show launch table acknowledgment to user
  3. Poll each agent's results via `read_agent` with `wait: true, timeout: 300`
  4. Assemble and present results

### File Discovery & Access

- **Auto-discovery:** `.github/agents/squad.agent.md` is discovered automatically
- **`.ai-team/` access:** Unrestricted (full filesystem)
- **Parallel reads:** Multiple file operations in one turn supported
- **Parallel writes:** Multiple file creates/edits in one turn supported

### Special Tools

- **SQL:** ✅ Available — Squad uses `sql` for tracking todos and batch processing
- **Web fetch:** ✅ Available — `web_fetch` for live data
- **GitHub MCP:** ✅ Available — Full GitHub CLI + API access
- **PowerShell:** ✅ Available — Terminal commands for git operations, builds, tests

---

## VS Code (Copilot in VS Code)

Squad runs on VS Code with **conditional support**. Key differences from CLI:

### Agent Spawning

- **Tools:** `runSubagent` (anonymous) or `agent` (named custom agent)
- **Behavior:** Sub-agents are **always synchronous** (blocking) individually, but **multiple subagents run in parallel** when spawned in the same turn
- **Custom agents:** Auto-discovered from `.github/agents/*.agent.md` (same location as CLI)
- **Default behavior:** Subagents inherit parent model and tools

### Model Selection

- **Mechanism A (Phase 1 — MVP):** Accept session model
  - Subagents use whatever model the user selected in VS Code's model picker
  - No per-spawn control
  - Loss of cost optimization (Scribe might run on Opus instead of Haiku)

- **Mechanism B (Phase 2 — Future):** Custom agent frontmatter
  - Define `model` in `.agent.md` files: `model: "Claude Haiku 4.5 (copilot)"`
  - Supports prioritized lists: `model: ['Claude Haiku 4.5 (copilot)', 'GPT-5.1-Codex-Mini (copilot)']`
  - Static per-agent, not per-spawn dynamic
  - Requires experimental setting: `chat.customAgentInSubagent.enabled: true`

- **Recommendation for now:** Use `runSubagent` (anonymous) for all spawns. Accept session model. Model cost optimization deferred.

### Background/Async Execution

- **Mechanism:** Parallel concurrent subagents (not fire-and-forget)
- **Result collection:** Automatic — no `read_agent` polling needed
- **Synchronicity:** All subagents are sync individually, but multiple subagents in one turn run concurrently
- **Fire-and-forget (Scribe):** Not possible
  - **Workaround:** Batch Scribe as the last subagent in parallel groups. Scribe is light work (Haiku model, file ops only), so blocking is tolerable
- **Launch acknowledgment:** Skip launch tables — results arrive with response, not separately

**Key insight:** VS Code's parallelism model is functionally equivalent to CLI's background mode when multiple subagents launch in the same turn. The difference is UX: CLI shows intermediate feedback (launch table), VS Code waits and shows all results at once.

### File Discovery & Access

- **Auto-discovery:** `.github/agents/squad.agent.md` auto-discovered from workspace on load (file watchers enabled — no restart needed on changes)
- **Scope:** Workspace-scoped (cannot access outside workspace directory)
- **`.ai-team/` read:** ✅ Full access via `readFile` tool
- **`.ai-team/` write:** ✅ Full access via `createFile` / `editFiles` tools
- **First-time approval:** VS Code may prompt for file modification approval on first write (security feature)
  - **User experience:** "Always allow in this workspace" option available
  - Subsequent writes in same workspace are automatic
- **Tool inheritance:** Sub-agents inherit parent's tools by default (a net positive vs CLI)
- **Parallel operations:** Multiple `readFile` / `createFile` / `editFiles` calls in one turn supported

### Special Tools

- **SQL:** ❌ Not available — avoid SQL-dependent workflows
- **Web fetch:** ✅ Available as `fetch` tool (may require URL approval)
- **GitHub MCP:** ✅ Available if configured in workspace
- **Terminal:** ✅ Available as `runInTerminal` — works for git operations
- **Codebase search:** ✅ Available as semantic (`codebase`) + literal (`searchResults`) search

### Constraints & Caveats

- **Workspace trust:** Squad requires a trusted workspace (VS Code security setting)
- **Single-root workspaces:** Recommended; multi-root has path resolution bugs (vscode#264837, vscode#293428)
- **Silent success bug:** VS Code may report file edits as successful when no changes occurred (vscode#253561) — same bug as CLI's P0 issue (Proposal 015)

---

## JetBrains IDEs (IntelliJ IDEA, PyCharm, etc.)

**Status:** Untested. JetBrains Copilot integration exists but sub-agent spawning mechanisms are not yet documented.

### Known Constraints

- No native Copilot CLI equivalent
- Copilot plugin provides chat but sub-agent spawn capability is unclear
- File discovery and workspace integration differ from VS Code

### Questions to Answer

- Does JetBrains Copilot support agent spawning via a tool equivalent to `task` or `runSubagent`?
- Can agents access workspace files and `.ai-team/` directories?
- What model selection mechanisms exist?
- Is there a background/async mode?

---

## GitHub.com (Copilot Chat in GitHub)

**Status:** Untested. GitHub's web-based Copilot has limited agent orchestration.

### Known Constraints

- Copilot Chat on GitHub.com focuses on issue-centric workflows (not general agent spawning)
- No documented sub-agent spawning mechanism
- Context is limited to conversation scope

### Questions to Answer

- Can GitHub Copilot spawn agents for background work?
- Can agents read `.ai-team/` files from the repository?
- Is there a GitHub-specific command protocol for delegation?

---

## Platform Adaptation Guide

### For Developers Using Squad

**Use any agent CLI if:**
- You need sub-agent spawning with full control (model selection, agent type, background mode)
- You want fire-and-forget execution (Scribe)
- You prefer terminal-based workflows

**Copilot CLI specifically if:**
- You need SQL tools or per-spawn model selection
- You want automatic `squad.agent.md` discovery

**Claude Code / Gemini CLI / OpenCode if:**
- You already use these tools and want a consistent workflow
- You prefer their specific model ecosystems

**Use VS Code if:**
- You work in VS Code and want seamless integration
- You don't need per-spawn model selection (accept session model)
- You prefer not to see intermediate launch tables

**Mixing CLIs:**
- All CLIs share the same `.squad/` state — any can read/write the same team files
- Team state is portable — init with `squad init`, use with any agent CLI, export/import across repos
- `squad watch` auto-detects your installed CLI, or use `--agent-cmd` to specify one

### For Squad Developers

**Coordinator Instructions:** Add platform detection logic to `squad.agent.md`:

```markdown
## Platform Detection

Before spawning agents, detect which platform you're running on:

1. **CLI mode** — `task` tool is available
   - Use `task` with `agent_type`, `mode`, `model`, `description`, `prompt` parameters
   - Full spawning control: per-spawn model selection, background mode, agent type selection
   - Use `read_agent` for result collection

2. **VS Code mode** — `runSubagent` or `agent` tool is available
   - Use `runSubagent` with task prompt (equivalent to CLI's `prompt` parameter)
   - Drop: `agent_type` (all subagents have full tools), `mode` (always sync), direct `model` param
   - Spawn multiple subagents in SINGLE turn for parallel execution
   - Results arrive automatically (skip `read_agent`)
   - Batch Scribe as last subagent in parallel groups (Scribe blocks)

3. **Fallback mode** — Neither `task` nor `runSubagent` available
   - Work inline without delegation
   - Do not apologize or explain the limitation
   - Execute the task directly to best of your ability
```

**Feature Degradation Plan:**

| Feature | CLI | VS Code | Degradation |
|---------|-----|---------|-------------|
| **Parallel fan-out** | Background + `read_agent` | Parallel sync subagents in one turn | None — equivalent concurrency |
| **Model selection** | Per-spawn dynamic | Session model (or custom agent static) | Accept session model, log intent |
| **Scribe fire-and-forget** | Background, never read | Sync, must wait | Batch with last parallel group |
| **Launch table UX** | Show table immediately → results later | Skip table → results with response | UX only, results correct |
| **SQL workflows** | Supported | Not available | Avoid SQL in cross-platform code paths |
| **Response order bug** | Critical workaround | Possibly necessary (unknown) | Keep the block — harmless if unnecessary |

---

## Investigation Status

This document is based on active research spikes (#32, #33, #34) conducted in February 2026. Key findings:

- **Proposal 032a** (Strausz): `runSubagent` API research — agent spawning mechanics on VS Code
- **Proposal 032b** (Kujan): CLI spawn parity analysis — all 5 Squad spawn patterns mapped
- **Proposal 033a** (Strausz): VS Code file discovery — `.ai-team/` access and workspace scoping
- **Proposal 034a** (Kujan): Model selection & background mode — per-agent model routing and async execution

**Next steps:**
- [ ] JetBrains investigation spike (#12)
- [ ] GitHub.com investigation spike (#13)
- [ ] VS Code custom agent generation during `squad init` (Phase 2, v0.5.0)
- [ ] Empirical testing of Response Order bug workaround on VS Code

---

## See Also

- [Squad in VS Code](../features/vscode.md) — Getting started with VS Code, what's different from CLI
- [Model Selection](../features/model-selection.md) — Cost-first routing across agents
- [Parallel Execution](../features/parallel-execution.md) — Background and sync patterns
- [Worktrees](../features/worktrees.md) — Multi-branch isolation
- [Troubleshooting](./troubleshooting.md) — Common questions and answers
