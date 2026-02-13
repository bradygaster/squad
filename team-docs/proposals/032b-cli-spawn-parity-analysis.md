# Proposal 032b: CLI Spawn Parity Analysis — `task` Tool vs VS Code `runSubagent`

**Author:** Kujan (Copilot SDK Expert)
**Date:** 2026-02-13
**Issue:** #32 — VS Code: Test and document runSubagent as Squad spawn mechanism
**Status:** Draft
**Related:** #10 (Copilot client parity), #11, #12, #13

---

## Executive Summary

Squad's coordinator (`squad.agent.md`) is built entirely on the CLI `task` tool for agent spawning. VS Code uses a fundamentally different mechanism — `runSubagent` — with a smaller, simpler parameter surface. This analysis catalogs every `task` parameter Squad uses, maps each to VS Code's `runSubagent` capabilities, identifies the parity gaps, and recommends how Squad should bridge them.

**Bottom line:** Squad can work on VS Code today with prompt-level adaptations. The two critical gaps are: (1) no `mode: "background"` — VS Code subagents are sync-only (but parallelizable), and (2) no direct `model` parameter — model selection routes through custom agent `.agent.md` files. Both are solvable without changing Squad's architecture.

---

## 1. CLI `task` Tool — Full Parameter Catalog

### 1.1 Parameter Schema

| Parameter | Type | Required | Squad Usage | Description |
|-----------|------|----------|-------------|-------------|
| `prompt` | string | **Yes** | Every spawn | Full agent instructions — charter, history reads, task, output hygiene, response order |
| `agent_type` | enum | **Yes** | Every spawn | Agent capability tier: `"general-purpose"`, `"explore"`, `"task"`, `"code-review"` |
| `description` | string | **Yes** | Every spawn | UI label: `"{Name}: {brief task summary}"` — agent name + what they're doing |
| `mode` | enum | No | Most spawns | `"sync"` or `"background"` (default: `"sync"` per tool schema, but Squad defaults to `"background"`) |
| `model` | string | No | Most spawns | Model override: e.g., `"claude-haiku-4.5"`, `"claude-sonnet-4.5"`, `"claude-opus-4.5"` |

### 1.2 `agent_type` Values Used by Squad

| Value | Usage | Tool Access | Squad Context |
|-------|-------|-------------|---------------|
| `"general-purpose"` | **All standard spawns** — domain agents, Scribe, ceremonies, PRD decomposition | Full: CLI, file ops, search, SQL, web, GitHub MCP | The workhorse. Used for every agent that writes files or runs commands |
| `"explore"` | **Lightweight read-only queries** — "what does this function do?" | Read-only: grep, glob, view | Speed-optimized. Used in Lightweight response mode for codebase Q&A |
| `"task"` | **Not used by Squad** | CLI tools, Haiku model | Available but Squad prefers `general-purpose` for full tool access |
| `"code-review"` | **Not used by Squad** | CLI tools for investigation | Available but Squad uses its own reviewer pattern (agent with reviewer role) |

### 1.3 `mode` Values Used by Squad

| Value | When Squad Uses It | Behavior |
|-------|-------------------|----------|
| `"background"` | **Default for all spawns** — domain agents, Scribe, parallel fan-out | Non-blocking. Coordinator launches multiple agents simultaneously, collects results later via `read_agent` |
| `"sync"` | **Only when required** — reviewer gates, hard data dependencies, user Q&A, ceremony facilitators | Blocking. Coordinator waits for agent output before proceeding |
| _(omitted)_ | Never explicitly, but sync spawn templates don't include `mode` | Falls back to sync (the tool default) |

### 1.4 `model` Parameter Usage

Squad implements a 4-layer model selection hierarchy:

1. **User override** → explicit model request ("use opus")
2. **Charter preference** → agent's `## Model` section
3. **Task-aware auto-select** → cost-first rule (haiku for non-code, sonnet for code, opus for vision)
4. **Default** → `claude-haiku-4.5` (cost wins when in doubt)

**Fallback chains** (3 retries + nuclear):
- Premium: `claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.5 → (omit model)`
- Standard: `claude-sonnet-4.5 → gpt-5.2-codex → claude-sonnet-4 → gpt-5.2 → (omit model)`
- Fast: `claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini → (omit model)`

Nuclear fallback = omit `model` param entirely → platform default.

### 1.5 `description` Format

Pattern: `"{AgentName}: {brief task summary}"`

Examples from `squad.agent.md`:
- `"Ripley: Design REST API endpoints"`
- `"Dallas: Review architecture proposal"`
- `"Scribe: Log session & merge decisions"`
- `"{Facilitator}: {ceremony name} — {task summary}"`
- `"{Lead}: Decompose PRD into work items"`

### 1.6 `prompt` Structure

Every Squad spawn prompt follows a consistent structure (with variations by spawn type):

```
1. Identity declaration     — "You are {Name}, the {Role} on this project."
2. Charter (inlined)        — Full charter.md contents pasted inline
3. Team root declaration    — "TEAM ROOT: {team_root}"
4. File read directives     — history.md, decisions.md, skills
5. Requester attribution    — "Requested by: {current user name}"
6. Input artifacts          — Authorized file paths
7. Task instruction         — The actual work to do
8. Post-work directives     — History update, decision inbox, skill extraction
9. Output hygiene block     — No SQL leaks, no tool internals
10. Response order block    — Plain text summary MUST be final output (P0 bug workaround)
```

---

## 2. VS Code `runSubagent` — Capability Assessment

### 2.1 How It Works

VS Code's `runSubagent` tool spawns a subagent in an **isolated context window**. The subagent:
- Does NOT inherit the main session's instructions or conversation history
- Receives only the task prompt provided
- Uses the same model and tools as the main session by default
- Can be overridden via a custom `.agent.md` file
- Returns results to the calling agent

### 2.2 Parameter Surface

| Aspect | `runSubagent` Mechanism | Equivalent CLI `task` Param |
|--------|------------------------|---------------------------|
| **Prompt/task** | Required — the task instruction string | `prompt` |
| **Agent selection** | Optional — specify a custom `.agent.md` by name | `agent_type` (loosely) |
| **Model** | Inherited from session; overridable via custom agent's `model` frontmatter | `model` |
| **Tools** | Inherited from session; restrictable via custom agent's `tools` frontmatter | Part of `agent_type` |
| **Mode** | **Always synchronous** — main agent blocks until subagent completes | `mode` |
| **Parallel execution** | Multiple subagents launched in same turn run concurrently | Multiple `task` calls in one turn |
| **Description/label** | Shows custom agent name + current tool activity in collapsed UI | `description` |
| **Subagent restrictions** | `agents` frontmatter controls which custom agents are usable | N/A |
| **Invocability** | `user-invokable`, `disable-model-invocation` frontmatter | N/A |

### 2.3 What `runSubagent` Does NOT Have

| CLI Feature | VS Code Status | Impact on Squad |
|-------------|---------------|-----------------|
| `mode: "background"` | ❌ Not available — all subagents are sync | **HIGH** — Squad's entire parallel fan-out pattern depends on background mode. See §4.1 |
| `agent_type` enum | ❌ No equivalent — all subagents are full-capability by default | **LOW** — Squad only uses `general-purpose` (99% of spawns). `explore` loses speed optimization |
| `model` as direct param | ⚠️ Indirect — via custom agent `.agent.md` `model` frontmatter | **MEDIUM** — Squad's per-spawn model selection needs a different routing mechanism. See §4.2 |
| `description` as direct param | ⚠️ Partial — custom agent `name` and `description` show in UI | **LOW** — Cosmetic. Squad's `{Name}: {task}` pattern can map to agent name |
| `read_agent` polling | ❌ Not applicable — sync means results arrive immediately | **NONE** — No need to poll when execution is synchronous |
| Explicit `mode: "sync"` | ✅ Default behavior | **NONE** — Matches automatically |

---

## 3. Spawn Pattern Inventory

Squad uses **5 distinct spawn patterns**. Each maps differently to VS Code:

### 3.1 Standard Spawn (Full Ceremony)

**CLI implementation:**
```yaml
agent_type: "general-purpose"
model: "{resolved_model}"
mode: "background"
description: "{Name}: {brief task summary}"
prompt: |
  # Full prompt: identity + charter + team root + reads + task + post-work + hygiene + response order
```

**VS Code mapping:**
- Prompt → identical (passed as task to `runSubagent`)
- Model → route through custom agent `.agent.md` OR accept session default
- Background → ❌ becomes sync, but multiple subagents in parallel achieve equivalent concurrency
- Description → custom agent `name` field, or prompt text (agent name in prompt already)
- agent_type → N/A, all subagents get full tools by default

**Verdict:** ✅ Works — prompt is the critical path and it maps 1:1.

### 3.2 Lightweight Spawn (Minimal Ceremony)

**CLI implementation:**
```yaml
agent_type: "general-purpose"
model: "{resolved_model}"
mode: "background"
description: "{Name}: {brief task summary}"
prompt: |
  # Minimal: identity + team root + task + hygiene + response order (NO charter, NO history, NO decisions)
```

**VS Code mapping:**
- Same as Standard but with shorter prompt — maps perfectly.
- Potentially use a lightweight custom agent with `user-invokable: false`.

**Verdict:** ✅ Works — even simpler on VS Code.

### 3.3 Lightweight Explore Spawn

**CLI implementation:**
```yaml
agent_type: "explore"
model: "{resolved_model}"
description: "{Name}: {brief query}"
prompt: |
  # Minimal: identity + question + team root
```

**VS Code mapping:**
- No `explore` agent_type → use standard `runSubagent` with same prompt.
- Loses the speed optimization (explore uses Haiku model and read-only tools).
- Can approximate via a custom `explorer.agent.md` with `tools: ['read', 'search']` and `model: "Claude Haiku 4.5"`.

**Verdict:** ⚠️ Degraded — loses speed/cost optimization unless custom agent exists.

### 3.4 Scribe Spawn (Always Background, Always Haiku)

**CLI implementation:**
```yaml
agent_type: "general-purpose"
model: "claude-haiku-4.5"
mode: "background"
description: "Scribe: Log session & merge decisions"
prompt: |
  # Scribe charter: logging, inbox merge, dedup, commit, history summarization
```

**VS Code mapping:**
- Scribe is always fire-and-forget on CLI (coordinator never reads Scribe output).
- On VS Code, Scribe becomes sync — coordinator must wait for it.
- **Mitigation:** Spawn Scribe as the last subagent in a parallel batch. The coordinator's turn waits, but Scribe is light work (Haiku, file ops only).
- Model → custom `scribe.agent.md` with `model: "Claude Haiku 4.5"`.

**Verdict:** ⚠️ Slower — Scribe blocks the coordinator turn. Tolerable with parallel batching.

### 3.5 Ceremony Facilitator Spawn (Sync, Spawns Sub-Agents)

**CLI implementation:**
```yaml
agent_type: "general-purpose"
model: "{resolved_model}"
# mode: sync (omitted = sync default)
description: "{Facilitator}: {ceremony name} — {task summary}"
prompt: |
  # Facilitator spawns EACH participant as sub-task (sync) to collect input
  # Then synthesizes a ceremony summary
```

**VS Code mapping:**
- Already sync on CLI — maps directly.
- Facilitator itself calls `runSubagent` for each participant.
- **Nested subagents work** — VS Code supports subagents spawning subagents.
- Each participant subagent can be a custom agent or plain prompt.

**Verdict:** ✅ Works — this is the pattern VS Code is designed for (coordinator → worker).

---

## 4. Critical Parity Gaps — Deep Dive

### 4.1 Background Mode Gap

**What Squad does on CLI:**
1. Coordinator spawns 4 agents as `mode: "background"` in one turn.
2. All 4 run concurrently.
3. Coordinator shows launch table to user immediately.
4. Coordinator polls/reads results as they complete.
5. Coordinator shows assembled results.

**What happens on VS Code:**
1. Coordinator spawns 4 subagents in one turn — they run **in parallel** (VS Code supports this).
2. Coordinator blocks until all 4 complete.
3. Coordinator shows assembled results.

**Impact:** Steps 1-2 are functionally equivalent — VS Code's "sync but parallel" achieves the same concurrency as CLI's background mode when multiple subagents launch in the same turn. The difference is:
- CLI: coordinator can show a launch table immediately, then show results later (two-phase UX).
- VS Code: coordinator shows nothing until all subagents complete (one-phase UX).

**Severity:** **Medium.** The concurrency model is equivalent. Only the user-facing latency perception differs. Squad's launch table acknowledgment pattern ("🔧 Fenster is working...") becomes moot — by the time the coordinator speaks, the work is already done.

**Recommended adaptation:**
- On VS Code, skip the launch table. Let the subagents run in parallel, then show assembled results directly.
- The `RESPONSE ORDER` block in spawn prompts (the P0 bug workaround) may not be needed on VS Code if the silent success bug doesn't manifest there. Needs testing.

### 4.2 Model Selection Gap

**What Squad does on CLI:**
- Coordinator resolves model per 4-layer hierarchy.
- Passes `model: "{resolved_model}"` directly to `task` tool call.
- Each spawn can use a different model.

**What VS Code offers:**
- Subagents inherit the session's model by default.
- Model override requires a custom `.agent.md` with `model` in frontmatter.
- Custom agent model is static (defined in file), not per-spawn dynamic.

**Impact:** Squad's per-spawn dynamic model selection (sonnet for code, haiku for docs, opus for design) doesn't map directly.

**Three approaches:**

| Approach | Complexity | Fidelity |
|----------|-----------|----------|
| **A: Accept session model for all spawns** | Zero | Low — loses cost optimization |
| **B: Pre-create custom agents per model tier** | Low | Medium — `fast-agent.agent.md`, `standard-agent.agent.md`, `premium-agent.agent.md` |
| **C: Pre-create custom agents per Squad role** | Medium | High — `scribe.agent.md` (haiku), `backend.agent.md` (sonnet), `designer.agent.md` (opus) |

**Recommended:** Start with **Approach A** (accept session model) for MVP. Model cost optimization is nice-to-have, not blocking. Approach C is the long-term target but requires generating `.agent.md` files during `squad init`.

### 4.3 `agent_type` Gap

**What Squad does on CLI:**
- `"general-purpose"` for 99% of spawns.
- `"explore"` for lightweight read-only queries.

**What VS Code offers:**
- All subagents are full-capability by default.
- Tool restriction via custom agent `tools` frontmatter.

**Impact:** Minimal. Squad barely uses `explore`. The only loss is the speed/cost optimization of the explore agent type.

**Recommended:** Map `explore` to a custom `explorer.agent.md` with restricted tools. Or simply use `runSubagent` with a read-only prompt (agents follow instructions even without tool restrictions).

---

## 5. Criticality Ranking

### Must-Have (Squad breaks without these)

| Requirement | CLI Mechanism | VS Code Mechanism | Status |
|-------------|---------------|-------------------|--------|
| Prompt delivery | `prompt` parameter | Task string to `runSubagent` | ✅ Identical |
| Multiple agents per turn | Multiple `task` calls in one response | Multiple `runSubagent` calls in one turn | ✅ Identical |
| Sync execution for gates | `mode: "sync"` (or omit) | Default behavior | ✅ Identical |
| File system access | `agent_type: "general-purpose"` | Default tool inheritance | ✅ Identical |
| Agent result collection | `read_agent` for background, direct return for sync | Direct return (all sync) | ✅ Simpler on VS Code |

### Important (Degraded experience without these)

| Requirement | CLI Mechanism | VS Code Mechanism | Status |
|-------------|---------------|-------------------|--------|
| Per-spawn model selection | `model` parameter | Custom agent `model` frontmatter | ⚠️ Indirect, static |
| Background/fire-and-forget (Scribe) | `mode: "background"` | N/A — Scribe becomes sync | ⚠️ Slower but functional |
| Launch acknowledgment before results | Background mode enables this | Not possible — results and ack arrive together | ⚠️ UX difference |
| Explore agent speed optimization | `agent_type: "explore"` | Custom agent with restricted tools | ⚠️ Requires setup |

### Nice-to-Have (No functional impact)

| Requirement | CLI Mechanism | VS Code Mechanism | Status |
|-------------|---------------|-------------------|--------|
| Description in UI | `description` parameter | Custom agent `name` + `description` | ⚠️ Different mechanism |
| Agent type specialization | `agent_type` enum | Custom agent definitions | ⚠️ More flexible on VS Code |
| Subagent restriction | N/A | `agents` frontmatter array | 🆕 VS Code only — useful for Squad |
| Invocation control | N/A | `user-invokable`, `disable-model-invocation` | 🆕 VS Code only — useful for Squad |

---

## 6. Platform Detection Strategy

Squad's coordinator needs to detect which spawn mechanism is available and adapt. Here's the recommended detection approach:

### 6.1 Detection Signals

| Signal | How to Check | What It Tells You |
|--------|-------------|-------------------|
| `task` tool available | Attempt `task` tool call | CLI environment |
| `runSubagent` tool available | Attempt `runSubagent` tool call | VS Code environment |
| Custom agents available | Check for `.agent.md` files | VS Code with agent support |
| `chat.customAgentInSubagent.enabled` | Not directly checkable | VS Code with custom agent subagent support |

### 6.2 Recommended Detection Logic

The coordinator cannot introspect its own tool list. Instead, use **prompt-level platform declaration**:

```
## Platform Detection

You are running on one of these Copilot surfaces:
- **CLI** — you have the `task` tool with `agent_type`, `mode`, `model`, `description`, `prompt` params
- **VS Code** — you have the `runSubagent` tool with a task prompt param

Use whichever spawn tool is available. If both exist, prefer `task` (richer params).
If neither exists, answer directly without spawning.
```

### 6.3 Feature Degradation Plan

| Feature | CLI | VS Code | Degradation |
|---------|-----|---------|-------------|
| Parallel fan-out | Background mode, read_agent | Parallel sync subagents | None — equivalent concurrency |
| Model selection | `model` param per spawn | Session model (default) or custom agent | Accept session model. Log model intent in orch log |
| Scribe fire-and-forget | Background, never read | Sync, must wait | Batch Scribe with last parallel group. Tolerable |
| Launch table UX | Show table → collect → show results | Skip table → show results directly | Adapt coordinator prompt: on VS Code, skip launch table |
| Response order bug | Critical — must end with text | Unknown if VS Code has same bug | Keep the block — harmless if unnecessary |
| `read_agent` polling | Required for background | Not needed — sync returns directly | Skip on VS Code |
| Explore speed | Haiku + read-only tools | Full model + full tools | Accept. Or create explorer.agent.md |

---

## 7. Compatibility Matrix

| Spawn Pattern | CLI Support | VS Code Support | Adaptation Needed |
|---------------|------------|-----------------|-------------------|
| **Standard spawn** (full ceremony) | ✅ Full | ✅ Full | Swap `task` → `runSubagent`. Drop `agent_type`, `mode`. Model becomes optional |
| **Lightweight spawn** (minimal) | ✅ Full | ✅ Full | Same as Standard — simpler prompt maps easily |
| **Explore spawn** (read-only) | ✅ Optimized | ⚠️ Degraded | Loses speed optimization. Optional: create explorer.agent.md |
| **Scribe spawn** (background, haiku) | ✅ Fire-and-forget | ⚠️ Blocking | Scribe blocks coordinator. Batch with last parallel group |
| **Ceremony facilitator** (sync, nested) | ✅ Full | ✅ Full | Natural fit — VS Code designed for coordinator patterns |
| **PRD decomposition** (sync, Lead) | ✅ Full | ✅ Full | Direct mapping |
| **Parallel fan-out** (N agents) | ✅ Full | ✅ Full | Multiple `runSubagent` calls in one turn = parallel |
| **Sequential chaining** (A→B→C) | ✅ Full | ✅ Full | Sync by default — natural fit |
| **Reviewer gate** (sync, approval) | ✅ Full | ✅ Full | Direct mapping |

---

## 8. Recommended Abstraction Layer

### 8.1 Do We Need One?

**No.** An abstraction layer adds complexity without proportional benefit. The differences between `task` and `runSubagent` are few enough to handle with **prompt-level conditional instructions** in `squad.agent.md`.

### 8.2 Prompt-Level Adaptation (Recommended)

Add a section to `squad.agent.md` that teaches the coordinator both spawn mechanisms:

```markdown
### Cross-Surface Spawn Instructions

**Detect your surface:**
- If you have the `task` tool → you're on CLI. Use the spawn templates below with full parameters.
- If you have the `runSubagent` tool → you're on VS Code. Adapt:
  - Replace `task` calls with `runSubagent` calls.
  - The `prompt` maps directly to the subagent task.
  - Drop `agent_type` (not available) — all subagents have full tool access.
  - Drop `mode` (not available) — all subagents are sync. Launch multiple in one turn for parallelism.
  - Drop `model` (not directly available) — accept session model, or invoke a named custom agent that sets model in its frontmatter.
  - Drop `description` (not available as param) — agent name is already in the prompt.
  - Skip launch table acknowledgment — results arrive with the response, not separately.
  - Keep all prompt content (charter, history reads, hygiene, response order) — this is surface-independent.
```

### 8.3 Custom Agent File Generation (Future — Approach C)

During `squad init`, if the coordinator detects VS Code, generate `.agent.md` files for each team member:

```yaml
---
name: ripley
description: "Backend developer — APIs, database, services"
model: "Claude Sonnet 4.5 (copilot)"
tools: ['read', 'edit', 'search', 'terminal']
user-invokable: false
---
You are Ripley, the Backend Dev.
```

This enables per-agent model selection on VS Code. Deferred to v0.5.0 — not needed for MVP parity.

---

## 9. Recommendations

1. **v0.4.0 (MVP):** Add platform detection and `runSubagent` adaptation instructions to `squad.agent.md`. Accept session model for all spawns. No custom agent files needed.

2. **v0.4.x (Enhancement):** Generate custom `.agent.md` files during `squad init` for per-agent model selection on VS Code. Add `scribe.agent.md` with `model: "Claude Haiku 4.5"` to preserve cost optimization.

3. **v0.5.0 (Full parity):** Implement the `agents` frontmatter restriction in the coordinator's `.agent.md` to control which custom agents Squad subagents can invoke. Explore using `disable-model-invocation: true` for Squad-internal agents that shouldn't be user-invokable.

4. **Testing:** The Response Order bug workaround (P0 from Proposal 015) needs empirical testing on VS Code. If VS Code doesn't have the silent success bug, the Response Order block can be conditionally omitted for VS Code spawns — reducing prompt size.

5. **No abstraction layer.** Prompt-level conditional instructions are sufficient. The spawn mechanisms are close enough that a code-level abstraction would over-engineer the solution.

---

## Sources

- `squad.agent.md` — lines 230-905 (spawn templates, mode selection, model selection, fan-out)
- VS Code Subagents documentation: https://code.visualstudio.com/docs/copilot/agents/subagents
- VS Code Custom Agents documentation: https://code.visualstudio.com/docs/copilot/customization/custom-agents
- VS Code model selection issue: https://github.com/microsoft/vscode/issues/275855
- VS Code tool inheritance issue: https://github.com/microsoft/vscode/issues/278835
- GitHub Copilot CLI documentation (fetched via `fetch_copilot_cli_documentation`)
