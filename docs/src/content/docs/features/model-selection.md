# Per-Agent Model Selection

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to set a persistent preference (survives across sessions):**
```
Always use Opus
```

**Try this to prioritize quality for the session only:**
```
Have all agents use Opus for the rest of this session
```

**Try this to optimize costs:**
```
Switch to Haiku — I'm trying to save costs
```

**Try this to balance quality and budget:**
```
Use Sonnet for code, Haiku for everything else
```

**Try this to go back to automatic selection:**
```
Switch back to automatic model selection
```

Squad adjusts model selection based on your directive. Agents writing code get quality models (Sonnet/Opus), agents doing docs/logs get cost-optimized models (Haiku). You can override anytime — and persistent overrides survive across sessions.

---

## How It Works

Squad routes each agent to the right model based on what they're doing — not a one-size-fits-all default. The governing principle: **cost first, unless code is being written** — but your preferences always take priority.

## 5-Layer Model Resolution

Model selection uses a layered system. First match wins:

1. **Persistent Config** (`.squad/config.json`) — You said "always use opus"? It's saved to disk. Every session, every agent, until you change it. Per-agent overrides (`agentModelOverrides`) take priority over the global `defaultModel`.
2. **Session Directive** — You said "use opus for this session"? Done. Applies until the session ends.
3. **Charter Preference** — The agent's charter specifies a `## Model` section with a preferred model.
4. **Task-Aware Auto-Selection** — The coordinator checks what the agent is actually doing:

| Task Output | Model | Tier |
|-------------|-------|------|
| Writing code (implementation, refactoring, tests, bug fixes) | `claude-sonnet-4.6` | Standard |
| Writing prompts or agent designs | `claude-sonnet-4.6` | Standard |
| Non-code work (docs, planning, triage, changelogs) | `claude-haiku-4.5` | Fast |
| Visual/design work requiring image analysis | `claude-opus-4.6` | Premium |

5. **Default** — If nothing matched, `claude-haiku-4.5`. Cost wins when in doubt.

## Persistent Model Preferences

Squad stores your model preferences in `.squad/config.json`:

```json
{
  "version": 1,
  "defaultModel": "claude-opus-4.6",
  "agentModelOverrides": {
    "fenster": "claude-sonnet-4.6",
    "mcmanus": "claude-haiku-4.5"
  }
}
```

- **`defaultModel`** — applies to ALL agents unless overridden. Set with "always use X".
- **`agentModelOverrides`** — per-agent overrides. Set with "use X for {agent}".
- **Clear with** "switch back to automatic" — removes `defaultModel`, returns to auto-selection.

## Role-to-Model Mapping

| Role | Default Model | Why |
|------|--------------|-----|
| Core Dev / Backend / Frontend | `claude-sonnet-4.6` | Writes code — quality first |
| Tester / QA | `claude-sonnet-4.6` | Writes test code |
| Lead / Architect | auto (per-task) | Mixed: code review vs. planning |
| Prompt Engineer | auto (per-task) | Prompt design is like code |
| DevRel / Writer | `claude-haiku-4.5` | Docs — not code |
| Scribe / Logger | `claude-haiku-4.5` | Mechanical file ops |
| Git / Release | `claude-haiku-4.5` | Changelogs, tags, version bumps |
| Designer / Visual | `claude-opus-4.6` | Vision capability required |

## 18-Model Catalog

Squad supports 18 models across three tiers:

- **Premium:** claude-opus-4.6, claude-opus-4.6-fast, claude-opus-4.5
- **Standard:** claude-sonnet-4.6, gpt-5.4, gpt-5.3-codex, gpt-5.2-codex, claude-sonnet-4, gpt-5.2, gpt-5.1-codex, gpt-5.1, gpt-5, gemini-3-pro-preview
- **Fast/Cheap:** claude-haiku-4.5, gpt-5.1-codex-mini, gpt-4.1, gpt-5-mini

## Fallback Chains

If a model is unavailable (plan restriction, rate limit, deprecation), Squad silently retries with the next in chain:

```
Premium:  claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.6
Standard: claude-sonnet-4.6 → gpt-5.3-codex → gpt-5.4 → claude-sonnet-4 → gpt-5.2
Fast:     claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini
```

Never falls back UP in tier — a fast task won't land on a premium model.

## User Overrides

Tell the coordinator what you want:

- `"use opus for this"` — one-off premium for current task
- `"always use opus"` — **persistent** preference saved to `.squad/config.json` (survives sessions)
- `"use gpt-5.2-codex for Fenster"` — **persistent** per-agent override
- `"switch back to automatic"` — clears persistent preference

## Sample Prompts

```
use opus for this architecture work
```

Override to premium model for a single high-stakes task.

```
always use haiku to save costs
```

Set session-wide preference for the cheapest model tier.

```
what model did Kane use for that last task?
```

Check which model was actually used for a completed task.

```
use gpt-5.2-codex for all backend work
```

Set a specific model for tasks in a particular domain.

```
switch back to automatic model selection
```

Clear any session-wide overrides and return to task-aware auto-selection.
