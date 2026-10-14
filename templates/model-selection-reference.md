# Model Selection Reference

## Per-Agent Model Selection

Before spawning an agent, resolve its model with the central resolver (`resolveAgentModel` from `@bradygaster/squad-sdk/agents`, also exported there under its original name `resolveModel`; it returns the model with its `source` and `rationale`). The root `@bradygaster/squad-sdk` export `resolveModel` is a legacy adapter over the same resolver that reads `.squad/config.json` and returns only the model ID. Apply the precedence below; first match wins. Every result carries a **source** and a **rationale**, and both appear in the spawn acknowledgment.

Spawn guidance never names a model ID. It reasons in sources and tiers (`premium`, `standard`, `fast`); **Appendix A** is the only place that turns a tier into model IDs.

| # | Source | Where the model comes from |
|---|--------|----------------------------|
| 1 | `user-override` | Explicit per-spawn directive in the current request ("use {model} for this task") |
| 2 | `config` | Persistent `.squad/config.json`: `agentModelOverrides.{agentName}`, otherwise `defaultModel` |
| 3 | `session` | The model picked for this session (by the user or the session itself); inherited by every sub-agent spawn |
| 4 | `charter` | The agent charter's `## Model` → `**Preferred:**` value, unless it is `auto` |
| 5 | `task-auto` | Task-aware tier selection under the active quality profile (default `quality-first`) |
| 6 | `default` | Nothing else matched (head of the standard tier; fast tier only under the `economy` profile) |
| — | `fallback` | Not a layer: replaces the chosen model only after it is known to be unavailable |

`auto` at any layer (any letter case) means "no preference here"; continue to the next layer. This includes a per-spawn directive, the persistent config fields, the session model and the charter.

**`user-override` — per-spawn directive:** A directive that names a model for one specific spawn ("have {agent} use {model} for this") applies to that spawn only. It does not persist and does not change the session model.

**`config` — persistent config (`.squad/config.json`):** On session start, read `.squad/config.json`. If `agentModelOverrides.{agentName}` exists, use that model for this specific agent. Otherwise, if `defaultModel` exists, use it for ALL agents. This layer survives across sessions — the user set it once and it sticks. Because `config` outranks `session`, a session pick does not replace a saved config preference; tell the user to clear the config preference if they want the session pick to win.

- **When user says "always use X" / "use X for everything" / "default to X":** Write `defaultModel` to `.squad/config.json`. Acknowledge: `✅ Model preference saved: {model} — all future sessions will use this until changed.`
- **When user says "use X for {agent}":** Write to `agentModelOverrides.{agent}` in `.squad/config.json`. Acknowledge: `✅ {Agent} will always use {model} — saved to config.`
- **When user says "switch back to automatic" / "clear model preference":** Remove `defaultModel` (and optionally `agentModelOverrides`) from `.squad/config.json`. Acknowledge: `✅ Model preference cleared — returning to automatic selection.`

**`session` — session model:** If the user picked a model for this session ("use {model} for this session"), or the session itself is running on a model the user chose, that is the session model. Session-wide directives persist until the session ends or are contradicted. Pass the session model to **every** sub-agent spawn unchanged, with source `session`; sub-agents inherit it rather than re-resolving from their charter or task. Pass it through even when it is not listed in Appendix A (for example, an opt-in or preview model the user selected).

**`charter` — charter preference:** Does the agent's charter have a `## Model` section with `**Preferred:**` set to a specific model (not `auto`)? If yes, use that model.

**Quality profile:** Task-aware selection runs under one of three GA profiles, plus one opt-in preview profile (Appendix A, *Opt-in preview models*). The profile changes only `task-auto` and `default`; it never replaces a `user-override`, `config`, `session` or `charter` model, and never replaces an explicit opt-in model such as one the user picked for the session.

| Profile | When it is active | Intent |
|---------|-------------------|--------|
| `quality-first` | Default when nothing else is set | Pick the tier that gives the best result for the task; avoid reruns caused by an underpowered model |
| `balanced` | Explicit opt-in | Keep premium for quality-sensitive gates; research and language-heavy work stay standard rather than automatically cheap |
| `economy` | Explicit opt-in (`economyMode: true` or `modelProfile: "economy"`) | Cost first; then apply the economy map. Always visible: the rationale says `(economy profile)` |
| Opt-in preview profile | Explicit opt-in only (`modelProfile` or a session profile; name in Appendix A) | Research preview. Quality-sensitive work goes to the preview model first, then falls through to the quality-first premium chain; every other task follows `quality-first` |

Profile precedence: session profile ("use the balanced profile for this session") → `economyMode: true` → persistent `modelProfile` in `.squad/config.json` → `quality-first`. An explicit `economyMode: false` cancels a persisted `economy` profile. Cost ceilings (`maxCategory`) still apply under every profile.

- **When user says "use the {profile} profile" / "always use {profile}":** Write `modelProfile` to `.squad/config.json` (`quality-first`, `balanced`, `economy`, or the opt-in preview profile in Appendix A). Acknowledge: `✅ Model profile saved: {profile}`.
- **When user says "use {profile} for this session":** Treat it as the session profile; do not write config.

**`task-auto` — task-aware auto-selection:** Match the agent's task to its type, look up the tier for the active profile, and use the head of that tier's fallback chain (Appendix A):

| Task type | `quality-first` | `balanced` | `economy` |
|-----------|-----------------|------------|-----------|
| Architecture, verification, review, security, design, visual | Premium | Premium | Premium → economy map |
| Research | Premium | Standard | Fast |
| Writing code, prompts or agent designs | Standard | Standard | Standard → economy map |
| Docs, writing | Standard | Standard | Fast |
| Planning, triage | Standard | Fast | Fast |
| Mechanical ops (Scribe, git, release, changelogs, version bumps) | Fast | Fast | Fast |

Quality-sensitive work that is not code (architecture, research, verification, reviewer gates, security, design) can use the premium tier. Mechanical work stays fast under every profile.

**Opt-in preview models:** Research-preview models are never chosen by default and are in no fallback chain, GA profile or example. They may be unavailable, for example in corporate environments. A user opts in through the opt-in preview profile or by picking the model explicitly (per-spawn, config or session); see Appendix A, *Opt-in preview models*. Under the preview profile, Scribe and mechanical ops stay fast and reviewer gates still run.

**Role-to-tier mapping** (under `quality-first`):

| Role | Default Tier | Why | Override When |
|------|--------------|-----|---------------|
| Core Dev / Backend / Frontend | Standard | Writes code — quality first | Heavy code gen → code specialist |
| Tester / QA | Standard | Writes test code; verification gates → premium | Simple test scaffolding → fast |
| Lead / Architect | auto (per-task) | Architecture and review are quality-sensitive | Architecture proposals, reviewer gates → premium; triage/planning → standard |
| Prompt Engineer | auto (per-task) | Prompt design is executable, like code | Prompt architecture → standard; research → premium |
| Copilot SDK Expert | Standard | Technical analysis that often touches code | Deep research → premium |
| Designer / Visual | Premium | Vision-capable model required | — (never downgrade — vision is non-negotiable) |
| DevRel / Writer | Standard | Language-heavy work benefits from a stronger model | Economy profile → fast |
| Scribe / Logger | Fast | Mechanical file ops | — (never bump Scribe) |
| Git / Release | Fast | Mechanical ops — changelogs, tags, version bumps | — (never bump mechanical ops) |

**Task complexity adjustments** (apply at most ONE — no cascading):
- **Bump UP to premium:** multi-agent coordination (output feeds 3+ agents)
- **Bump DOWN to fast:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to the code specialist (Appendix A):** large multi-file refactors, complex implementation from spec, heavy code generation (500+ lines)
- **Switch to the analytical-diversity model (Appendix A):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**Live availability:** When the runtime supplies a live model list (`availableModels`) or a list of unavailable models, it is authoritative for availability. A recommended model missing from the live list falls forward to the next listed candidate; an explicitly chosen model missing from it falls back visibly (source `fallback`, rationale names it). Recommendations and defaults come only from the public GA catalog in Appendix A; a model that is merely exposed by a tool schema is not a recommendation.

**`default`:** If nothing else matched, use the head of the standard tier chain. Under the `economy` profile, use the economy default from the fast tier instead.

**`fallback` — when a model is unavailable:**

If the resolved model is known to be unavailable (plan restriction, org policy, rate limit, deprecation, or any other reason), or a spawn fails for that reason, silently retry with the next model **after** it in its tier's fallback chain (Appendix A) — never back toward the head of the chain. A model that is not in its tier's chain (for example a session-picked opt-in model) tries that chain from the head. The source becomes `fallback` and the rationale names the unavailable model and its original source. Do NOT tell the user about retry attempts. Maximum 3 retries before using the platform default fallback.

`(omit model param)` = call the `task` tool WITHOUT the `model` parameter. The platform uses its built-in default. This is the platform default fallback — it lets the platform choose the model.

**Fallback rules:**
- If the user specified a provider ("use {provider}"), fall back within that provider only before using the platform default fallback
- Never fall back UP in tier — a fast/cheap task should not land on a premium model
- Log fallbacks (source `fallback` plus rationale) to the orchestration log for debugging, but never surface retries to the user unless asked

**Passing the model to spawns:**

Pass the resolved model as the `model` parameter on every `task` tool call:

```
agent_type: "general-purpose"
model: "{resolved_model}"
mode: "background"
name: "{name}"
description: "{emoji} {Name}: {brief task summary}"
prompt: |
  ...
```

If no later fallback candidate is available (the resolver sets `omitModel`), omit the `model` parameter entirely.

**Spawn output format — show the model, source and rationale:**

Every spawn acknowledgment names the resolved model, its source and a short rationale (the resolver's `rationale`, shortened if needed). Substitute the actual resolved model for `{model}`:

```
{emoji} {Name} ({model} · {source}) — {task summary} — {rationale}

🔧 Runtime Engineer ({model} · session) — refactoring auth module — session model inherited by this spawn
🎨 Experience Engineer ({model} · task-auto) — designing color system — visual task needs vision → premium tier
📋 Scribe ({model} · task-auto) — logging session — mechanical task → fast tier
⚡ Lead ({model} · config) — reviewing proposal — agentModelOverrides.lead in .squad/config.json
📝 Docs Engineer ({model} · fallback) — updating docs — charter model unavailable; next in fast chain
```

## Appendix A — Model catalog snapshot

This appendix is catalog data, not spawn guidance. It mirrors `MODELS.FALLBACK_CHAINS` and `MODEL_CATALOG` in the SDK and is maintained with the model catalog. The guidance above refers only to tiers and sources; these lists turn a tier into model IDs.

Source of truth for public availability: the GitHub Copilot supported-models table (https://docs.github.com/en/copilot/reference/ai-models/supported-models), verified 2026-10-14. Only public GA models are listed; internal and preview models are never recommended. The research-preview `hydrafusion` and `hydrafusion-max` IDs are in `MODEL_CATALOG` (marked `preview`, premium tier) but not in any chain below; they are used only on opt-in. Tiers place models by their Copilot `model_picker_category` (`powerful`, `versatile`, `lightweight`), not by guessed pricing. An opt-in model the user names explicitly is still passed through unchanged.

**Fallback chains:**

```
Premium:  claude-opus-5.5 → gpt-6.1-sol → claude-opus-5 → gpt-6-sol → claude-opus-4.8 → gpt-5.6-sol → (omit model param)
Standard: claude-sonnet-5.5 → gpt-5.6-terra → claude-sonnet-5 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → (omit model param)
Fast:     claude-haiku-5.5 → gpt-6-luna → gpt-5.6-luna → gemini-3.8-flash → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini → (omit model param)
```

**Economy default:** `gpt-5.6-luna`. The economy map moves premium to standard (`claude-opus-5.5` → `claude-sonnet-5.5`; `claude-opus-5`, `claude-opus-4.8` → `claude-sonnet-5`; GPT Sol models → `gpt-5.6-terra`) and standard or fast Anthropic/Terra models to `gpt-5.6-luna`.

**Specialists:** code specialists `gpt-5.3-codex` (powerful) and `mai-code-1.1-flash` (lightweight); analytical diversity `gemini-4-argon` (powerful), `grok-4.7` and `grok-4.6` (versatile).

**Valid models (public GA catalog):**

Premium (powerful): `claude-opus-5.5`, `gpt-6.1-sol`, `claude-opus-5`, `gpt-6-sol`, `claude-opus-4.8`, `gpt-5.6-sol`, `gemini-4-argon`
Standard: `claude-sonnet-5.5`, `gpt-5.6-terra`, `claude-sonnet-5`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `grok-4.7`, `grok-4.6`
Fast: `claude-haiku-5.5`, `gpt-6-luna`, `gpt-5.6-luna`, `gemini-3.8-flash`, `claude-haiku-4.5`, `gpt-5.4-mini`, `gpt-5-mini`, `mai-code-1.1-flash`

### Opt-in preview models

**HydraFusion (research preview):** `hydrafusion` and `hydrafusion-max` are GitHub multi-model orchestration models. They are a research preview and may be unavailable, for example in corporate environments where preview models are turned off. Squad never chooses them by default: they are in no fallback chain, no GA profile and no example. Squad treats them as model IDs; the runtime runs the orchestration itself.

- **Opt in with the profile:** `modelProfile: "hydrafusion"` in `.squad/config.json`, or "use the hydrafusion profile for this session". Architecture, research, verification, review, security and design tasks then resolve to `hydrafusion` with the quality-first premium chain behind it. Visual work, code, docs, planning and other tasks follow `quality-first` unchanged; Scribe and mechanical ops stay on the fast tier. Reviewer gates still run.
- **Opt in with a model:** pick `hydrafusion` as the session model, `defaultModel`, `agentModelOverrides.{agent}` or a per-spawn directive. That pick is honored like any explicit model and the session model is inherited by every sub-agent spawn.
- **`hydrafusion-max`** is used only when named explicitly (per-spawn directive, config or session model). It is never chosen implicitly, including under the `hydrafusion` profile.
- **Fallback:** if `hydrafusion` is unavailable, resolution falls forward to the head of the quality-first premium chain (source `fallback`), never back to `hydrafusion` and never over the active cost ceiling. If nothing in the ceiling is left, the `model` parameter is omitted.
- **VS Code** runs every agent on the single session model the user picked; per-agent selection (including this profile) applies where Squad passes a model per spawn, such as the Copilot CLI and app.
