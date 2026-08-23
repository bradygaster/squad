---
title: Per-Agent Model Selection
description: Route each agent to the right model based on task type, with persistent overrides and economy mode.
order: 34
---

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
| Writing code (implementation, refactoring, tests, bug fixes) | `gpt-5.6-terra` | Standard |
| Writing prompts or agent designs | `gpt-5.6-terra` | Standard |
| Non-code work (docs, planning, triage, changelogs) | `gpt-5.6-luna` | Fast |
| Visual/design work requiring image analysis | `gpt-5.6-sol` | Premium |

5. **Default** — If nothing matched, `gpt-5.6-luna`. Cost wins when in doubt.

## Persistent Model Preferences

Squad stores your model preferences in `.squad/config.json`:

```json
{
  "version": 1,
  "defaultModel": "gpt-5.6-terra",
  "agentModelOverrides": {
    "fenster": "gpt-5.6-terra",
    "mcmanus": "gpt-5.6-luna"
  }
}
```

- **`defaultModel`** — applies to ALL agents unless overridden. Set with "always use X".
- **`agentModelOverrides`** — per-agent overrides. Set with "use X for {agent}".
- **Clear with** "switch back to automatic" — removes `defaultModel`, returns to auto-selection.

## Role-to-Model Mapping

| Role | Default Model | Why |
|------|--------------|-----|
| Core Dev / Backend / Frontend | `gpt-5.6-terra` | Writes code — quality first |
| Tester / QA | `gpt-5.6-terra` | Writes test code |
| Lead / Architect | auto (per-task) | Mixed: code review vs. planning |
| Prompt Engineer | auto (per-task) | Prompt design is like code |
| DevRel / Writer | `gpt-5.6-luna` | Docs — not code |
| Scribe / Logger | `gpt-5.6-luna` | Mechanical file ops |
| Git / Release | `gpt-5.6-luna` | Changelogs, tags, version bumps |
| Designer / Visual | `gpt-5.6-sol` | Vision capability required |

## 17-Model Catalog

Squad supports 17 models across three tiers:

- **Premium:** gpt-5.6-sol, claude-opus-5, claude-opus-4.8, claude-opus-4.7, claude-opus-4.6
- **Standard:** gpt-5.6-terra, claude-sonnet-5, claude-sonnet-4.6, claude-sonnet-4.5, gpt-5.5, gpt-5.4, gpt-5.3-codex, gemini-3.1-pro
- **Fast/Cheap:** gpt-5.6-luna, claude-haiku-4.5, gpt-5.4-mini, gpt-5-mini

## Fallback Chains

If a model is unavailable (plan restriction, rate limit, deprecation), Squad silently retries with the next in chain:

```
Premium: gpt-5.6-sol → claude-opus-5 → claude-opus-4.8 → claude-opus-4.7 → claude-opus-4.6 → claude-sonnet-4.6
Standard: gpt-5.6-terra → claude-sonnet-5 → claude-sonnet-4.6 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → claude-sonnet-4.5 → gemini-3.1-pro
Fast:     gpt-5.6-luna → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini
```

Never falls back UP in tier — a fast task won't land on a premium model.

## User Overrides

Tell the coordinator what you want:

- `"use opus for this"` — one-off premium for current task
- `"always use opus"` — **persistent** preference saved to `.squad/config.json` (survives sessions)
- `"use gpt-5.3-codex for Fenster"` — **persistent** per-agent override
- `"switch back to automatic"` — clears persistent preference

## Economy Mode

Economy mode automatically falls back to cheaper models when rate limits are approaching or when you want to cap spend. It is opt-in — enable it per session or persistently.

**Enable economy mode:**
```
Switch to economy mode
```

**Disable economy mode:**
```
Turn off economy mode
```

When economy mode is active, Squad remaps models using the `ECONOMY_MODEL_MAP`:

| Normal Tier | Economy Model |
|-------------|--------------|
| Standard (Terra) | `gpt-5.6-luna` |
| Fast (Luna) | `gpt-5.6-luna` |

**Fallback chains in economy mode** run the same logic as normal fallback chains, but start one tier lower. A code task that would normally use `gpt-5.6-terra` uses `gpt-5.6-luna` instead.

**Cost tradeoffs:** Economy mode trades output quality for lower cost and reduced rate limit pressure. Use it for bulk triage, log analysis, or changelog generation — not for architecture work or complex refactors where quality matters.

**Persistent economy mode** saves to `.squad/config.json`:
```json
{
  "version": 1,
  "economyMode": true
}
```

Economy mode is also triggered automatically by the [rate limiting](rate-limiting.md) system when headroom drops to Amber state — you do not have to enable it manually for rate limit protection.

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
use gpt-5.3-codex for all backend work
```

Set a specific model for tasks in a particular domain.

```
switch back to automatic model selection
```

Clear any session-wide overrides and return to task-aware auto-selection.
