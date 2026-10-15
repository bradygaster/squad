---
title: Per-Agent Model Selection
description: Route each agent to the right model based on task type, with quality profiles, persistent overrides, economy mode, and opt-in HydraFusion.
order: 34
---

# Per-Agent Model Selection

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

**Try this to opt in to HydraFusion (research preview):**
```
Use the hydrafusion profile for this session
```

Squad adjusts model selection based on your directive. By default, Squad picks for quality: architecture, research, review, security and design work gets premium models, code and docs get standard models, and only mechanical work (Scribe, git, release) gets fast models. You can override anytime — and persistent overrides survive across sessions.

---

## How It Works

Squad routes each agent to the right model based on what they're doing — not a one-size-fits-all default. The governing principle: **quality first** — pick the tier that gives the best result for the task, so you don't pay for reruns caused by an underpowered model. Your preferences always take priority, and cost-first selection is one opt-in profile away.

Every spawn shows the resolved model, where it came from (its **source**) and a short **rationale**:

```
📋 Scribe (claude-haiku-5.5 · task-auto) — logging session — mechanical task → fast tier
```

## Model Resolution Layers

Model selection uses a layered system. First match wins:

1. **User Override** — You said "use opus for this task"? That one spawn uses it. It doesn't persist or change the session model.
2. **Persistent Config** (`.squad/config.json`) — You said "always use opus"? It's saved to disk. Every session, every agent, until you change it. Per-agent overrides (`agentModelOverrides`) take priority over the global `defaultModel`.
3. **Session Model** — You said "use opus for this session", or picked a model for the session? Every sub-agent spawn inherits it until the session ends.
4. **Charter Preference** — The agent's charter specifies a `## Model` section with a preferred model.
5. **Task-Aware Auto-Selection** — The coordinator checks what the agent is actually doing and picks a tier under the active [model profile](#model-profiles).
6. **Default** — If nothing matched, the head of the standard chain (`claude-sonnet-5.5`). Under the `economy` profile, `gpt-5.6-luna`.

`auto` at any layer means "no preference here" — Squad moves on to the next layer. If the chosen model is unavailable, Squad [falls back](#fallback-chains) and the source becomes `fallback`.

## Model Profiles

The profile changes only task-aware auto-selection and the default. It never replaces a model you picked (user override, config, session or charter). `quality-first` is the default; the others are opt-in.

| Profile | When it's active | Intent |
|---------|------------------|--------|
| `quality-first` | Default | Best result for the task; premium for quality-sensitive work |
| `balanced` | Opt-in | Premium for review-style gates; research stays standard, planning drops to fast |
| `economy` | Opt-in (`"modelProfile": "economy"` or `"economyMode": true`) | Cost first, then the [economy map](#economy-mode) |
| `hydrafusion` | Opt-in, research preview | Quality-sensitive work tries [HydraFusion](#hydrafusion-research-preview) first; everything else follows `quality-first` |

Task-aware tiers per GA profile:

| Task type | `quality-first` | `balanced` | `economy` |
|-----------|-----------------|------------|-----------|
| Architecture, verification, review, security, design, visual | Premium | Premium | Premium → economy map |
| Research | Premium | Standard | Fast |
| Writing code, prompts or agent designs | Standard | Standard | Standard → economy map |
| Docs, writing | Standard | Standard | Fast |
| Planning, triage | Standard | Fast | Fast |
| Mechanical ops (Scribe, git, release, changelogs) | Fast | Fast | Fast |

Each tier resolves to the head of its [fallback chain](#fallback-chains): `claude-opus-5.5` (premium), `claude-sonnet-5.5` (standard) or `claude-haiku-5.5` (fast).

**Set a profile:**

- `"use the balanced profile"` / `"always use balanced"` — saves `modelProfile` to `.squad/config.json`
- `"use the economy profile for this session"` — session only; config is not changed

Profile precedence: session profile → `economyMode: true` → persistent `modelProfile` → `quality-first`. Cost ceilings still apply under every profile.

## Persistent Model Preferences

Squad stores your model preferences in `.squad/config.json`:

```json
{
  "version": 1,
  "defaultModel": "claude-opus-5.5",
  "modelProfile": "balanced",
  "agentModelOverrides": {
    "fenster": "gpt-5.3-codex",
    "mcmanus": "claude-haiku-5.5"
  }
}
```

- **`defaultModel`** — applies to ALL agents unless overridden. Set with "always use X".
- **`agentModelOverrides`** — per-agent overrides. Set with "use X for {agent}".
- **`modelProfile`** — `quality-first` (default), `balanced`, `economy` or `hydrafusion`. Affects only task-aware selection and the default.
- **Clear with** "switch back to automatic" — removes `defaultModel`, returns to auto-selection.

## Role-to-Tier Mapping

Under the default `quality-first` profile:

| Role | Default Tier | Why |
|------|--------------|-----|
| Core Dev / Backend / Frontend | Standard | Writes code — quality first |
| Tester / QA | Standard | Writes test code; verification gates go premium |
| Lead / Architect | auto (per-task) | Architecture and review → premium; planning/triage → standard |
| Prompt Engineer | auto (per-task) | Prompt design is like code; research → premium |
| DevRel / Writer | Standard | Language-heavy work benefits from a stronger model |
| Scribe / Logger | Fast | Mechanical file ops |
| Git / Release | Fast | Changelogs, tags, version bumps |
| Designer / Visual | Premium | Vision capability required |

## Model Catalog

Squad recommends only public GA models from the [GitHub Copilot supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models) table, placed into three tiers:

- **Premium:** claude-opus-5.5, gpt-6.1-sol, claude-opus-5, gpt-6-sol, claude-opus-4.8, gpt-5.6-sol, gemini-4-argon
- **Standard:** claude-sonnet-5.5, gpt-5.6-terra, claude-sonnet-5, gpt-5.5, gpt-5.4, gpt-5.3-codex, grok-4.7, grok-4.6
- **Fast/Cheap:** claude-haiku-5.5, gpt-6-luna, gpt-5.6-luna, gemini-3.8-flash, claude-haiku-4.5, gpt-5.4-mini, gpt-5-mini, mai-code-1.1-flash

The research-preview `hydrafusion` and `hydrafusion-max` models are in the catalog but in no fallback chain or GA profile — see [HydraFusion](#hydrafusion-research-preview). Any other model you name explicitly is passed through unchanged.

## Fallback Chains

If a model is unavailable (plan restriction, org policy, rate limit, deprecation), Squad silently retries with the next model in the chain:

```
Premium:  claude-opus-5.5 → gpt-6.1-sol → claude-opus-5 → gpt-6-sol → claude-opus-4.8 → gpt-5.6-sol
Standard: claude-sonnet-5.5 → gpt-5.6-terra → claude-sonnet-5 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex
Fast:     claude-haiku-5.5 → gpt-6-luna → gpt-5.6-luna → gemini-3.8-flash → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini
```

Fallback only moves forward — never back toward the head of the chain, and never UP in tier — a fast task won't land on a premium model. If no candidate is left, Squad omits the model and lets the platform choose.

## User Overrides

Tell the coordinator what you want:

- `"use opus for this"` — one-off model for the current task (user override)
- `"use opus for this session"` — session model, inherited by every sub-agent spawn
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

Economy mode is the opt-in `economy` [profile](#model-profiles). Research, docs and planning drop to the fast tier, then Squad remaps models using the `ECONOMY_MODEL_MAP`:

| Normal Model | Economy Model |
|--------------|---------------|
| `claude-opus-5.5` (premium) | `claude-sonnet-5.5` |
| `claude-opus-5`, `claude-opus-4.8` (premium) | `claude-sonnet-5` |
| `gpt-6.1-sol`, `gpt-6-sol`, `gpt-5.6-sol` (premium) | `gpt-5.6-terra` |
| `claude-sonnet-5.5`, `claude-sonnet-5`, `gpt-5.6-terra` (standard) | `gpt-5.6-luna` |
| `claude-haiku-5.5`, `claude-haiku-4.5` (fast) | `gpt-5.6-luna` |

A code task that would normally use `claude-sonnet-5.5` uses `gpt-5.6-luna` instead, and the default becomes `gpt-5.6-luna`. Spawn rationales say `(economy profile)` so the downgrade is always visible. Economy mode never changes a model you picked explicitly.

**Cost tradeoffs:** Economy mode trades output quality for lower cost and reduced rate limit pressure. Use it for bulk triage, log analysis, or changelog generation — not for architecture work or complex refactors where quality matters.

**Persistent economy mode** saves to `.squad/config.json` (`"modelProfile": "economy"` works too; an explicit `"economyMode": false` cancels a persisted `economy` profile):
```json
{
  "version": 1,
  "economyMode": true
}
```

Economy mode is also triggered automatically by the [rate limiting](rate-limiting.md) system when headroom drops to Amber state — you do not have to enable it manually for rate limit protection.

## HydraFusion (Research Preview)

[HydraFusion](https://github.blog/changelog/2026-09-30-hydrafusion-in-vs-code-and-the-github-copilot-app/) is a GitHub Copilot model that orchestrates multiple models within a turn. It is a **research preview** and is subject to change, so Squad never uses it by default: `hydrafusion` and `hydrafusion-max` are in no fallback chain and no GA profile. Squad only passes the model ID; Copilot runs the orchestration.

**Requirements:** HydraFusion is available to Copilot Pro, Pro+, Business and Enterprise users. For Copilot Business and Enterprise, an administrator must enable preview features in organization or enterprise settings. Your client may also need HydraFusion turned on (for example, the HydraFusion setting in the GitHub Copilot app). See the [GitHub changelog](https://github.blog/changelog/2026-09-30-hydrafusion-in-vs-code-and-the-github-copilot-app/) for current details.

**Opt in with the profile** — persistently in `.squad/config.json`:

```json
{
  "version": 1,
  "modelProfile": "hydrafusion"
}
```

…or for one session: `"use the hydrafusion profile for this session"`. Architecture, research, verification, review, security and design tasks then resolve to `hydrafusion`, with the quality-first premium chain behind it. Visual work, code, docs, planning and other tasks follow `quality-first` unchanged; Scribe and mechanical ops stay on the fast tier, and reviewer gates still run.

**Opt in with a model** — pick `hydrafusion` as your session model, `defaultModel`, an `agentModelOverrides` entry or a one-off override. It's honored like any explicit model, and a session model is inherited by every sub-agent spawn.

**`hydrafusion-max`** is used only when you name it explicitly (one-off override, config or session model). Squad never picks it on its own, not even under the `hydrafusion` profile.

**Fallback:** if HydraFusion is unavailable (your plan, org policy, or preview features turned off), Squad falls forward to the next GA premium model — the head of the premium chain, `claude-opus-5.5` — within any cost ceiling. It never retries HydraFusion.

## VS Code: One Session Model

In VS Code, every agent runs on the single session model you pick in the Copilot model picker. Per-agent selection — task-aware tiers, profiles (including `hydrafusion`), charter preferences and per-agent overrides — applies only where Squad passes a model per spawn: the Copilot CLI and the GitHub Copilot app. To use HydraFusion for everything in VS Code, pick it in the model picker. See [VS Code](vscode.md) for details.

## Sample Prompts

```
use opus for this architecture work
```

Override to premium model for a single high-stakes task.

```
always use haiku to save costs
```

Set a persistent preference for a fast-tier model.

```
always use the hydrafusion profile
```

Opt in to HydraFusion for quality-sensitive work (research preview).

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
