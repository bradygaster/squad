# Proposal 034a: Model Selection & Background Mode Parity — CLI vs VS Code

**Author:** Kujan (Copilot SDK Expert)
**Date:** 2026-02-14
**Issue:** #34 — VS Code: Model selection and background mode parity
**Status:** Draft
**Related:** #10 (Copilot client parity), #32 (runSubagent research), 032b (CLI spawn parity)

---

## Executive Summary

This is the focused follow-up to my 032b parity analysis. That covered the full spawn surface. This one goes deep on the two features Brady specifically flagged: **per-agent model selection** and **background/async execution**.

**Bottom line:** Neither feature has a direct 1:1 equivalent in VS Code. Both have viable workarounds that preserve Squad's core behavior. Model selection routes through `.agent.md` frontmatter (static, not per-spawn dynamic). Background mode doesn't exist — but VS Code's parallel sync subagents achieve equivalent concurrency. The coordinator needs conditional instructions, not an abstraction layer.

---

## 1. Model Selection

### 1.1 CLI Behavior (What We Have)

The CLI `task` tool accepts a `model` parameter per spawn:

```yaml
agent_type: "general-purpose"
model: "claude-haiku-4.5"    # Per-spawn, dynamic
prompt: "..."
```

Squad's coordinator resolves model via a 4-layer hierarchy:
1. User override → explicit request ("use opus")
2. Charter preference → agent's `## Model` section
3. Task-aware auto-select → cost-first rule
4. Default → `claude-haiku-4.5`

Each spawn can use a different model. Fallback chains (3 retries + nuclear) handle model unavailability.

### 1.2 VS Code Behavior (What runSubagent Offers)

`runSubagent` does **NOT** accept a `model` parameter. Model selection works through two mechanisms:

**Mechanism A: Session model inheritance**
- Subagent inherits the model selected in the VS Code model picker
- No per-spawn control — all subagents use the same model
- This is the default when no custom agent is specified

**Mechanism B: Custom agent frontmatter**
- Define `model` in an `.agent.md` file's YAML frontmatter
- Supports single model or prioritized list:
  ```yaml
  model: 'Claude Haiku 4.5 (copilot)'
  # OR
  model: ['Claude Haiku 4.5 (copilot)', 'GPT-5.1-Codex-Mini (copilot)']
  ```
- Model is **static per agent file** — not dynamically selectable per spawn
- Requires `chat.customAgentInSubagent.enabled: true` (still experimental)

**Key difference:** CLI model selection is **per-spawn dynamic**. VS Code model selection is **per-agent-file static**. You can't say "spawn this agent with haiku this time and sonnet next time" — you'd need two different `.agent.md` files.

### 1.3 The `agent` Tool vs `runSubagent`

VS Code provides two related tools:
- **`runSubagent`** — spawns an anonymous subagent with just a prompt. Inherits session model/tools.
- **`agent`** — invokes a **named custom agent** as a subagent. The custom agent's frontmatter controls model, tools, and behavior.

For Squad, this distinction matters:
- Use `runSubagent` when you don't care about model (accept session default)
- Use `agent` when you need a specific model tier (reference a custom agent that declares the model)

The coordinator should reference custom agents by name when model matters:
```
Use the squad-scribe agent to log this session.
```
This triggers `scribe.agent.md` which declares `model: 'Claude Haiku 4.5 (copilot)'`.

### 1.4 Workaround Options

| Approach | How | Fidelity | Complexity |
|----------|-----|----------|------------|
| **A: Accept session model** | Omit custom agent → all subagents use whatever the user selected in VS Code | Low — no cost optimization | Zero |
| **B: Model-tier agents** | Create 3 agent files: `squad-fast.agent.md` (haiku), `squad-standard.agent.md` (sonnet), `squad-premium.agent.md` (opus) | Medium — 3 tiers, coordinator picks tier | Low |
| **C: Role-specific agents** | Create per-role agent files: `scribe.agent.md` (haiku), `fenster.agent.md` (sonnet), `ripley.agent.md` (opus) | High — matches CLI behavior | Medium |
| **D: Prioritized model list** | Each `.agent.md` declares a fallback list: `model: ['Claude Haiku 4.5 (copilot)', 'GPT-5.1-Codex-Mini (copilot)']` | High — mirrors CLI fallback chains | Medium |

### 1.5 Recommendation

**Phase 1 (v0.4.0 — now):** Approach A. Accept session model. The coordinator's prompt should say:

```markdown
**VS Code mode — model selection:**
When spawning via `runSubagent` or `agent`, model selection is handled differently:
- You CANNOT pass a `model` parameter per spawn
- All subagents inherit the session model unless a custom agent overrides it
- Accept the session model for all spawns
- DO NOT attempt to set model dynamically — it will fail silently
```

**Phase 2 (v0.5.0):** Approach B + D. During `squad init`, generate model-tier agent files with prioritized fallback lists. The coordinator maps role → tier → agent file:
- Scribe, Explorer → `squad-fast.agent.md` (haiku chain)
- Lead, Dev, Tester → `squad-standard.agent.md` (sonnet chain)
- Designer → `squad-premium.agent.md` (opus chain)

**Phase 3 (v0.6.0+):** Approach C if VS Code stabilizes custom agent subagent support. Per-role agents give maximum fidelity but require generating N files during init.

### 1.6 Fallback When Model Selection Isn't Available

The nuclear fallback is already in the CLI design: **omit the model parameter entirely** → platform picks its default. On VS Code, this maps to "don't reference a custom agent" → session model applies. Same outcome. Squad's coordinator already knows this pattern.

If a custom agent's declared model isn't available, VS Code tries the next model in the prioritized list. If all fail, the session model applies. This is cleaner than the CLI's 3-retry-then-nuclear pattern.

---

## 2. Background/Async Mode

### 2.1 CLI Behavior (What We Have)

The CLI `task` tool supports `mode: "background"`:

```yaml
mode: "background"
```

This enables:
1. **Non-blocking spawns** — coordinator continues immediately
2. **Fire-and-forget** — Scribe pattern (spawn, never read results)
3. **Incremental collection** — `read_agent` polls for results with `wait: true/false`
4. **Two-phase UX** — launch table shown immediately, results assembled later

Squad defaults to background mode for nearly all spawns. The coordinator's typical flow:
1. Spawn 3-5 agents as background tasks
2. Show launch table to user
3. Call `read_agent` with `wait: true, timeout: 300` for each
4. Assemble and present results

### 2.2 VS Code Behavior (What's Available)

**`runSubagent` is always synchronous.** There is no `mode` parameter. The main agent blocks until the subagent completes.

However — and this is the critical insight from 032b — **VS Code runs multiple subagents in parallel when spawned in the same turn.** The platform handles the concurrency:

```
// Coordinator spawns 3 subagents in one turn → all run concurrently
Use subagent A to research auth patterns.
Use subagent B to analyze the database schema.
Use subagent C to review the API surface.
```

All three run simultaneously. The coordinator waits for all three, then continues.

### 2.3 What About VS Code "Background Agents"?

VS Code does have a "Background Agents" concept, but it's **completely different** from CLI's `mode: "background"`:

| Aspect | CLI Background Mode | VS Code Background Agents |
|--------|-------------------|--------------------------|
| **What it is** | Non-blocking subagent within same session | Separate CLI-based agent session |
| **Context** | Shares session tools/workspace | Git worktree isolation, separate folder |
| **Control** | `read_agent` / `list_agents` | VS Code Chat view sessions list |
| **Use case** | Parallel fan-out within orchestration | Long-running autonomous tasks |
| **Tools** | Same as parent agent_type | CLI tools only, no VS Code built-in tools |
| **Model** | Per-spawn selection | CLI model (separate from VS Code session model) |
| **Initiated by** | Agent via `task` tool | User via UI/`@cli` or handoff from local session |

**VS Code Background Agents are NOT the equivalent of CLI `mode: "background"`.** They're more like spawning a separate Copilot CLI session that runs autonomously in a worktree. They can't be spawned programmatically by a `runSubagent` call. They're user-initiated.

The actual equivalent is: **multiple `runSubagent` calls in one turn = parallel execution.**

### 2.4 Result Collection: CLI `read_agent` vs VS Code

| Aspect | CLI | VS Code |
|--------|-----|---------|
| **Collection mechanism** | `read_agent` with `agent_id`, `wait`, `timeout` | Automatic — results return when subagent completes |
| **Incremental results** | Yes — poll repeatedly, get partial output | No — all-or-nothing per subagent |
| **Timeout handling** | Configurable per read (default 30s, max 300s) | Platform-managed, no coordinator control |
| **Failure detection** | `read_agent` returns status: "failed" | Subagent failure appears in tool call result |
| **Fire-and-forget** | Supported — spawn and never read | Not possible — coordinator always waits |

**For Squad's coordinator, VS Code result collection is simpler:** no `read_agent` calls needed, no timeout configuration, no polling loops. The downside is loss of fire-and-forget (Scribe) and incremental collection.

### 2.5 Impact on Squad Patterns

| Squad Pattern | CLI Behavior | VS Code Behavior | Degradation |
|---------------|-------------|-------------------|-------------|
| **Parallel fan-out** (3-5 agents) | Background + read_agent | Parallel sync subagents in one turn | **None** — equivalent concurrency |
| **Launch table UX** | Show table immediately → results later | Cannot show table — results arrive with response | **UX only** — results still correct |
| **Scribe fire-and-forget** | Background, never read | Sync, must wait | **Minor** — batch Scribe as last in parallel group |
| **Incremental progress** | read_agent polls, coordinator narrates | No incremental — all results arrive together | **UX only** — no narration mid-flight |
| **Reviewer gate** (sync) | Explicit `mode: "sync"` | Default behavior | **None** — already sync |

### 2.6 Recommendation

The coordinator prompt needs VS Code-specific instructions:

```markdown
**VS Code mode — spawning:**
- All subagents are synchronous — you CANNOT fire-and-forget
- Spawn multiple subagents in a SINGLE turn for parallel execution
- DO NOT show a launch table — results arrive with the response, not separately
- Skip `read_agent` calls — results return automatically
- Batch Scribe as the LAST subagent in any parallel group
```

---

## 3. The `agent` Tool — When to Use What

### 3.1 Tool Landscape

VS Code provides two tools for subagent invocation:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `runSubagent` | Spawn anonymous subagent with prompt | Default for ad-hoc tasks, no model/tool customization needed |
| `agent` | Invoke a named custom agent as subagent | When you need specific model, tool restrictions, or specialized behavior |

Both are listed in the `tools` frontmatter of `.agent.md` files. To use both:
```yaml
tools: ['agent', 'runSubagent', 'read', 'edit', 'search']
```

### 3.2 Squad's Usage

For **Phase 1** (accept session model), Squad should use `runSubagent` for all spawns. The prompt carries all the configuration — charter, identity, task, hygiene rules. No custom agent files needed.

For **Phase 2** (model tiers), Squad should use `agent` to invoke named custom agents:
```
Use the squad-fast agent to log this session. Task: You are Scribe...
Use the squad-standard agent to implement the auth API. Task: You are Fenster...
```

### 3.3 Mapping to CLI

| CLI Pattern | VS Code Equivalent |
|-------------|-------------------|
| `task` with `agent_type: "general-purpose"` | `runSubagent` (default) or `agent` with full-tools custom agent |
| `task` with `agent_type: "explore"` | `agent` with `squad-explorer.agent.md` (restricted tools) |
| `task` with `mode: "background"` | Multiple `runSubagent`/`agent` calls in one turn |
| `task` with `model: "claude-haiku-4.5"` | `agent` referencing custom agent with `model` frontmatter |
| `read_agent` with `wait: true` | Not needed — sync by default |
| `list_agents` | Not applicable |

---

## 4. Graceful Degradation

### 4.1 Model Selection Not Available

**Scenario:** VS Code, no custom agent files exist, or `chat.customAgentInSubagent.enabled` is false.

**Degradation:** All subagents use the session model (whatever the user picked in VS Code's model dropdown).

**Impact:** Cost optimization lost. A sonnet session runs Scribe on sonnet instead of haiku. Not broken, just expensive.

**Coordinator behavior:**
```markdown
If model selection is not available (no custom agents, or VS Code without customAgentInSubagent):
- Accept the session model for ALL spawns
- DO NOT attempt fallback chains — they only work on CLI
- Log model intent in orchestration output: "(intended: haiku, using: session model)"
```

### 4.2 Background Mode Not Available

**Scenario:** VS Code, where `runSubagent` is always sync.

**Degradation:** No fire-and-forget. No incremental progress narration. No launch table.

**Impact:** User sees a longer wait with no intermediate feedback, then gets all results at once.

**Coordinator behavior:**
```markdown
If background mode is not available (VS Code):
- Spawn ALL concurrent agents in a SINGLE turn
- DO NOT show launch table or "agents are working..." messages
- DO NOT call read_agent — results arrive automatically
- Present assembled results directly when all subagents complete
- Batch Scribe with the last parallel group (Scribe blocks, so make it concurrent with real work)
```

### 4.3 Neither Tool Available

**Scenario:** GitHub.com, JetBrains, or future surface with no spawn mechanism.

**Degradation:** Coordinator works inline. No delegation.

**Coordinator behavior:**
```markdown
If neither `task` nor `runSubagent`/`agent` is available:
- Work inline without delegation
- Do NOT apologize or explain the limitation
- Execute the task directly to the best of your ability
```

---

## 5. Concrete Recommendations for `squad.agent.md`

### 5.1 Platform Detection Block (Add to Coordinator)

```markdown
## Platform Detection

Detect your platform by checking available tools:
- **CLI mode:** `task` tool is available → use `task` with `agent_type`, `mode`, `model`, `description`, `prompt`
- **VS Code mode:** `runSubagent` or `agent` tool is available → use subagent spawning
- **Fallback mode:** Neither available → work inline without delegation

### VS Code Adaptations

When in VS Code mode:
1. **Spawning:** Replace `task` calls with `runSubagent` or `agent` calls. Pass the full prompt as the task.
2. **Parallelism:** Spawn ALL concurrent agents in a SINGLE turn. They run in parallel automatically.
3. **Model:** Accept session model. Do NOT attempt per-spawn model selection. If custom agents exist with model frontmatter, reference them by name.
4. **No background mode:** All subagents are sync. Do NOT show launch tables or call read_agent.
5. **No fire-and-forget:** Scribe blocks. Batch Scribe as last subagent in parallel groups.
6. **Result collection:** Results arrive automatically. No polling needed.
7. **Description:** Drop the `description` parameter. Agent name is in the prompt.
8. **agent_type:** Drop it. All subagents have full tool access by default.
9. **Keep prompt structure:** Charter, identity, task, hygiene, response order — all surface-independent.
```

### 5.2 Model Selection Conditional (Add to Spawn Templates)

```markdown
### Model Resolution (Platform-Specific)

**CLI:** Resolve model per 4-layer hierarchy. Pass as `model` parameter.
**VS Code:** 
  - If custom agents with model frontmatter exist → use `agent` tool with appropriate named agent
  - Otherwise → accept session model (no model param needed)
  - DO NOT attempt CLI fallback chains on VS Code
```

### 5.3 Scribe Adaptation (Add to Scribe Spawn Template)

```markdown
### Scribe Spawn

**CLI:** `mode: "background"`, `model: "claude-haiku-4.5"`. Fire and forget.
**VS Code:** Batch Scribe with the last parallel group. Scribe blocks but is light work (haiku, file ops).
  - If custom agent `squad-scribe` exists → use `agent` tool to get haiku model
  - Otherwise → accept session model, Scribe runs on whatever is active
```

---

## 6. Testing Checklist

Per the issue success criteria:

- [ ] **Model parameter support:** Confirmed — `runSubagent` does NOT accept `model`. Custom agent frontmatter is the mechanism.
- [ ] **Background/async execution:** Confirmed — no equivalent. Parallel sync subagents is the pattern.
- [ ] **Test model override in VS Code:** Requires creating a custom `.agent.md` with `model` frontmatter and spawning it via `agent` tool. Cannot be tested from CLI — needs VS Code session.
- [ ] **Test background spawn and result collection:** Spawn multiple `runSubagent` calls in one turn. Verify parallel execution and automatic result return. Needs VS Code session.
- [ ] **Define fallback behavior:** Documented in §4 above.
- [ ] **Update squad.agent.md:** Deferred to implementation issue. This proposal defines what to add; the actual prompt changes are a code task.

---

## 7. Open Questions

1. **Custom agent stability:** `chat.customAgentInSubagent.enabled` is still experimental. When does it graduate? If it stays experimental, Squad needs to document the setting requirement.

2. **Model name format:** VS Code uses display names like `'Claude Haiku 4.5 (copilot)'`. CLI uses API names like `'claude-haiku-4.5'`. The coordinator prompt must use the right format per surface.

3. **Handoffs:** VS Code's `handoffs` frontmatter enables sequential workflows (Plan → Implement → Review). This could replace Squad's ceremony facilitator pattern. Worth exploring in a future spike.

4. **Organization-level agents:** VS Code supports org-level custom agents. Could Squad ship its model-tier agents at the org level so all repos get them? Needs investigation.

---

## Sources

- Proposal 032b: CLI Spawn Parity Analysis (this repo)
- Proposal 032a: runSubagent API Research (Strausz, this repo)
- VS Code Subagents docs: https://code.visualstudio.com/docs/copilot/agents/subagents
- VS Code Background Agents docs: https://code.visualstudio.com/docs/copilot/agents/background-agents
- VS Code Custom Agents docs: https://code.visualstudio.com/docs/copilot/customization/custom-agents
- GitHub Copilot CLI documentation (fetched via `fetch_copilot_cli_documentation`)
- Cross-platform agent spawning skill: `.ai-team/skills/cross-platform-agent-spawning/SKILL.md`
