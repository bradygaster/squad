---
name: "model-selection"
description: "Determines which LLM model to use for each agent spawn"
domain: "orchestration"
confidence: "medium"
source: "extracted"
---

# Model Selection

> Determines which LLM model to use for each agent spawn.

## SCOPE

✅ THIS SKILL PRODUCES:
- A resolved `model` parameter for every `task` tool call
- Persistent model preferences in `.squad/config.json`
- Spawn acknowledgments that include the resolved model

❌ THIS SKILL DOES NOT PRODUCE:
- Code, tests, or documentation
- Model performance benchmarks
- Cost reports or billing artifacts

## Context

Squad supports a curated model catalog across three tiers (premium, standard, fast). The coordinator must select the right model for each agent spawn. Users can set persistent preferences that survive across sessions.

## 5-Layer Model Resolution Hierarchy

Resolution is **first-match-wins** — the highest layer with a value wins.

| Layer | Name | Source | Persistence |
|-------|------|--------|-------------|
| **0a** | Per-Agent Config | `.squad/config.json` → `agentModelOverrides.{name}` | Persistent (survives sessions) |
| **0b** | Global Config | `.squad/config.json` → `defaultModel` | Persistent (survives sessions) |
| **1** | Session Directive | User said "use X" in current session | Session-only |
| **2** | Charter Preference | Agent's `charter.md` → `## Model` section | Persistent (in charter) |
| **3** | Task-Aware Auto | Task type → tier under the active quality profile (default `quality-first`) | Computed per-spawn |
| **4** | Default | Head of the standard chain (`claude-sonnet-5.5`); `gpt-5.6-luna` under the `economy` profile | Hardcoded fallback |

**Key principle:** Layer 0 (persistent config) beats everything. If the user said "always use opus" and it was saved to config.json, every agent gets opus regardless of role or task type. This is intentional — the user explicitly chose quality over cost.

## AGENT WORKFLOW

### On Session Start

1. READ `.squad/config.json`
2. CHECK for `defaultModel` field — if present, this is the Layer 0 override for all spawns
3. CHECK for `agentModelOverrides` field — if present, these are per-agent Layer 0a overrides
4. STORE both values in session context for the duration

### On Every Agent Spawn

1. CHECK Layer 0a: Is there an `agentModelOverrides.{agentName}` in config.json? → Use it.
2. CHECK Layer 0b: Is there a `defaultModel` in config.json? → Use it.
3. CHECK Layer 1: Did the user give a session directive? → Use it.
4. CHECK Layer 2: Does the agent's charter have a `## Model` section? → Use it.
5. CHECK Layer 3: Determine task type and use the head of its tier chain for the active profile (`quality-first` unless the session or `.squad/config.json` `modelProfile` says `balanced` or `economy`, or `economyMode` is on):
- Architecture, research, verification, reviewer gates, security, design, visual → premium (`claude-opus-5.5`); `balanced` and `economy` move research down
- Code (implementation, tests, refactoring, bug fixes), prompts, agent designs → standard (`claude-sonnet-5.5`)
- Docs, writing, planning, triage → standard under `quality-first`; fast under `economy` (and planning under `balanced`)
- Mechanical (Scribe, git, release, changelogs, version bumps) → fast (`claude-haiku-5.5`)
- `economy` then applies the economy map (premium → standard, standard → `gpt-5.6-luna`) and says so in the rationale
- `hydrafusion` (opt-in only) sends architecture, research, verification, reviewer gates, security and design to `hydrafusion`, then the premium chain; everything else (including visual and Scribe) follows `quality-first`
6. FALLBACK Layer 4: head of the standard chain; `gpt-5.6-luna` under `economy`
7. INCLUDE model in spawn acknowledgment: `🔧 {Name} ({resolved_model}) — {task}`

### When User Sets a Preference

**Trigger phrases:** "always use X", "use X for everything", "switch to X", "default to X"

1. VALIDATE the model ID against the catalog
2. WRITE `defaultModel` to `.squad/config.json` (merge, don't overwrite)
3. ACKNOWLEDGE: `✅ Model preference saved: {model} — all future sessions will use this until changed.`

**Per-agent trigger:** "use X for {agent}"

1. VALIDATE model ID
2. WRITE to `agentModelOverrides.{agent}` in `.squad/config.json`
3. ACKNOWLEDGE: `✅ {Agent} will always use {model} — saved to config.`

**Profile trigger:** "use the {quality-first|balanced|economy|hydrafusion} profile" / "always use economy"

1. WRITE `modelProfile` to `.squad/config.json` (merge, don't overwrite); for "this session" only, keep it in session context instead
2. ACKNOWLEDGE: `✅ Model profile saved: {profile}`

A profile never replaces an explicit model (config, session, charter or per-spawn), including an opt-in model the user chose.

### HydraFusion (research preview, opt-in)

`hydrafusion` and `hydrafusion-max` are GitHub multi-model orchestration models in research preview. They may be unavailable, for example in corporate environments where preview models are turned off, so Squad never uses them by default: they are in no fallback chain, no GA profile and no example. The runtime runs the orchestration; Squad only passes the model ID.

- **Opt in:** `modelProfile: "hydrafusion"` (or "use the hydrafusion profile for this session"), or pick `hydrafusion` as the session model, `defaultModel`, an `agentModelOverrides` entry or a per-spawn model. A session model is inherited by every sub-agent spawn.
- **`hydrafusion-max`:** only when named explicitly by ID. Never chosen implicitly, even under the `hydrafusion` profile.
- **Fallback:** when `hydrafusion` is unavailable, fall forward to the head of the premium chain; never back, never over the cost ceiling; omit the model if nothing in the ceiling is left.
- **Unchanged:** Scribe and mechanical ops stay fast; reviewer gates still run.
- **VS Code** uses the single session model for every agent; per-agent selection applies where Squad passes a model per spawn (Copilot CLI and app).

### When User Clears a Preference

**Trigger phrases:** "switch back to automatic", "clear model preference", "use default models"

1. REMOVE `defaultModel` from `.squad/config.json`
2. ACKNOWLEDGE: `✅ Model preference cleared — returning to automatic selection.`

### STOP

After resolving the model and including it in the spawn template, this skill is done. Do NOT:
- Generate model comparison reports
- Run benchmarks or speed tests
- Create new config files (only modify existing `.squad/config.json`)
- Change the model after spawn (fallback chains handle runtime failures)

## Config Schema

`.squad/config.json` model-related fields:

```json
{
  "version": 1,
  "defaultModel": "claude-opus-5.5",
  "modelProfile": "balanced",
  "agentModelOverrides": {
    "agent-alpha": "claude-sonnet-5.5",
    "agent-beta": "claude-haiku-5.5"
  }
}
```

- `defaultModel` — applies to ALL agents unless overridden by `agentModelOverrides`
- `agentModelOverrides` — per-agent overrides that take priority over `defaultModel`
- `modelProfile` — `quality-first` (default), `balanced`, `economy` or `hydrafusion` (opt-in research preview); affects only Layers 3-4
- All fields are optional. When absent, Layers 1-4 apply normally.

## Fallback Chains

If a model is unavailable (rate limit, plan restriction), retry within the same tier:

```
Premium:  claude-opus-5.5 → gpt-6.1-sol → claude-opus-5 → gpt-6-sol → claude-opus-4.8 → gpt-5.6-sol → (omit model param)
Standard: claude-sonnet-5.5 → gpt-5.6-terra → claude-sonnet-5 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → (omit model param)
Fast:     claude-haiku-5.5 → gpt-6-luna → gpt-5.6-luna → gemini-3.8-flash → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini → (omit model param)
```

Chains list only public GA models (https://docs.github.com/en/copilot/reference/ai-models/supported-models, verified 2026-10-14). When the runtime supplies a live model list, it decides availability.

**Never fall UP in tier.** A fast task won't land on a premium model via fallback.
