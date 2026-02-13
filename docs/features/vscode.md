# Squad in VS Code

Squad is fully supported in VS Code (v0.4.0+). Your team runs identically to the CLI, with the same `.ai-team/` state, same agents, same decisions — but with VS Code-specific tooling and constraints.

This guide covers what's different, what's the same, and when to use CLI vs VS Code.

---

## Getting Started

### Prerequisites

- **VS Code** — Latest version
- **GitHub Copilot extension** — `GitHub.copilot` (installed, authenticated)
- **Workspace trust** — Your workspace must be trusted (VS Code security)
- **Node.js 22+** — If running CLI to initialize Squad
- **Squad installed** — Either in the repo already (from CLI), or initialized fresh via agent selection

### Initial Setup

**Option A: Initialize with CLI (recommended)**

```bash
npm i github:bradygaster/squad
```

Creates `.github/agents/squad.agent.md` and `.ai-team-templates/`. Then open VS Code and select **Squad** from the agent picker.

**Option B: Fresh in VS Code**

Open Copilot in VS Code, select **Squad** from `/agents`. Squad detects it's running in VS Code and bootstraps normally. The `.ai-team/` directory is created on first run.

---

## How It Works

Squad detects VS Code automatically and adapts its spawning mechanism:

- **In CLI:** Uses `task` tool with full control (model selection, agent type, background mode)
- **In VS Code:** Uses `runSubagent` for **parallel synchronous execution**

When you assign work to an agent, the coordinator spawns that agent as a sub-agent in VS Code. Multiple sub-agents spawn in **the same turn** run in **parallel**. Each completes, then you get all results at once — no intermediate "launch table" feedback like CLI shows.

---

## What's Different from CLI

### No Per-Spawn Model Selection

VS Code accepts the session model (your Copilot model picker). No per-spawn dynamic selection. Cost optimization deferred — use Haiku via model picker for cheaper runs.

### Sub-Agents Run Sync (But Parallel)

Agents launch in the same turn and run in parallel, but block as a group. Results arrive all at once — no launch table or `read_agent` polling.

### SQL Tool Not Available

SQL unavailable in VS Code agents. Workflows needing SQL should live in CLI, or use file-based state (JSON in `.ai-team/state/`).

### File Writes May Prompt for Approval

VS Code security feature: approve file modifications once with "Always allow in this workspace".

---

## What's the Same

### Same `.ai-team/` State

Initialize in CLI, use in VS Code, or vice versa. Team roster, decisions, histories are identical across both.

### Same Team, Same Skills

Charters, histories, agent roles persist. Decisions made in CLI are visible in VS Code.

### Parallel Execution Works

Multiple agents in one turn → all run in parallel. Equivalent throughput to CLI background mode.

### Full File Access (Workspace-Scoped)

Read/write your entire workspace and `.ai-team/` directory. Cannot reach outside workspace.

### MCP Tools Inherited

If workspace has MCP servers configured, sub-agents inherit them (GitHub MCP, semantic search, terminal).

---

## Tips

Use single-root workspaces (multi-root has path resolution bugs).

Accept file modification approval once — subsequent writes are automatic.

For initial setup, heavy parallel work (5+ agents), SQL workflows, or cost optimization (per-spawn model selection) → use CLI.

Check the model picker at top of chat if agents seem slow or expensive — switch to Haiku for cost savings.

---

## Known Limitations

- **JetBrains IDEs** — Untested. Agent spawning mechanism undocumented.
- **GitHub.com (web)** — Untested. Copilot Chat on GitHub.com doesn't support Squad.
- **Custom agent model selection** — Phase 2 future feature.

See [Client Compatibility Matrix](../scenarios/client-compatibility.md) for full platform comparison.

---

## See Also

- [Client Compatibility Matrix](../scenarios/client-compatibility.md) — Feature comparison: CLI, VS Code, JetBrains, GitHub.com
- [Parallel Execution](parallel-execution.md) — How Squadron fan-outs agents
- [Model Selection](model-selection.md) — Cost-first routing strategy
- [First Session Walkthrough](../tour-first-session.md) — Getting started with Squad
