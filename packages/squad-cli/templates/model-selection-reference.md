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
| 5 | `task-auto` | Task-aware tier selection (cost first, unless code is being written) |
| 6 | `default` | Nothing else matched |
| — | `fallback` | Not a layer: replaces the chosen model only after it is known to be unavailable |

`auto` at any layer (any letter case) means "no preference here"; continue to the next layer. This includes a per-spawn directive, the persistent config fields, the session model and the charter.

**`user-override` — per-spawn directive:** A directive that names a model for one specific spawn ("have {agent} use {model} for this") applies to that spawn only. It does not persist and does not change the session model.

**`config` — persistent config (`.squad/config.json`):** On session start, read `.squad/config.json`. If `agentModelOverrides.{agentName}` exists, use that model for this specific agent. Otherwise, if `defaultModel` exists, use it for ALL agents. This layer survives across sessions — the user set it once and it sticks. Because `config` outranks `session`, a session pick does not replace a saved config preference; tell the user to clear the config preference if they want the session pick to win.

- **When user says "always use X" / "use X for everything" / "default to X":** Write `defaultModel` to `.squad/config.json`. Acknowledge: `✅ Model preference saved: {model} — all future sessions will use this until changed.`
- **When user says "use X for {agent}":** Write to `agentModelOverrides.{agent}` in `.squad/config.json`. Acknowledge: `✅ {Agent} will always use {model} — saved to config.`
- **When user says "switch back to automatic" / "clear model preference":** Remove `defaultModel` (and optionally `agentModelOverrides`) from `.squad/config.json`. Acknowledge: `✅ Model preference cleared — returning to automatic selection.`

**`session` — session model:** If the user picked a model for this session ("use {model} for this session"), or the session itself is running on a model the user chose, that is the session model. Session-wide directives persist until the session ends or are contradicted. Pass the session model to **every** sub-agent spawn unchanged, with source `session`; sub-agents inherit it rather than re-resolving from their charter or task. Pass it through even when it is not listed in Appendix A (for example, an opt-in or preview model the user selected).

**`charter` — charter preference:** Does the agent's charter have a `## Model` section with `**Preferred:**` set to a specific model (not `auto`)? If yes, use that model.

**`task-auto` — task-aware auto-selection:** Use the governing principle: **cost first, unless code is being written.** Match the agent's task to its output type, select the tier, and use the head of that tier's fallback chain (Appendix A):

| Task Output | Tier | Rule |
|-------------|------|------|
| Writing code (implementation, refactoring, test code, bug fixes) | Standard | Quality and accuracy matter for code. |
| Writing prompts or agent designs (structured text that functions like code) | Standard | Prompts are executable — treat like code. |
| NOT writing code (docs, planning, triage, logs, changelogs, mechanical ops) | Fast | Cost first. |
| Visual/design work requiring image analysis | Premium | Vision capability required. Overrides cost rule. |

**Role-to-tier mapping** (applying the cost-first principle):

| Role | Default Tier | Why | Override When |
|------|--------------|-----|---------------|
| Core Dev / Backend / Frontend | Standard | Writes code — quality first | Heavy code gen → code specialist |
| Tester / QA | Standard | Writes test code — quality first | Simple test scaffolding → fast |
| Lead / Architect | auto (per-task) | Mixed: code review needs quality, planning needs cost | Architecture proposals → premium; triage/planning → fast |
| Prompt Engineer | auto (per-task) | Mixed: prompt design is like code, research is not | Prompt architecture → standard; research/analysis → fast |
| Copilot SDK Expert | Standard | Technical analysis that often touches code | Pure research → fast |
| Designer / Visual | Premium | Vision-capable model required | — (never downgrade — vision is non-negotiable) |
| DevRel / Writer | Fast | Docs and writing — not code | — |
| Scribe / Logger | Fast | Mechanical file ops — cheapest possible | — (never bump Scribe) |
| Git / Release | Fast | Mechanical ops — changelogs, tags, version bumps | — (never bump mechanical ops) |

**Task complexity adjustments** (apply at most ONE — no cascading):
- **Bump UP to premium:** architecture proposals, reviewer gates, security audits, multi-agent coordination (output feeds 3+ agents)
- **Bump DOWN to fast:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to the code specialist (Appendix A):** large multi-file refactors, complex implementation from spec, heavy code generation (500+ lines)
- **Switch to the analytical-diversity model (Appendix A):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**`default`:** If nothing else matched, use the head of the fast tier chain. Cost wins when in doubt, unless code is being produced.

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

**Fallback chains:**

```
Premium:  gpt-5.6-sol → claude-opus-5 → claude-opus-4.8 → claude-opus-4.7 → claude-opus-4.6 → claude-sonnet-4.6 → (omit model param)
Standard: gpt-5.6-terra → claude-sonnet-5 → claude-sonnet-4.6 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → claude-sonnet-4.5 → gemini-3.1-pro → (omit model param)
Fast:     gpt-5.6-luna → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini → (omit model param)
```

**Specialists:** code specialist `gpt-5.3-codex` (standard); analytical diversity `gemini-3.1-pro` (standard).

**Valid models (current platform catalog):**

Premium: `gpt-5.6-sol`, `claude-opus-5`, `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`
Standard: `gpt-5.6-terra`, `claude-sonnet-5`, `claude-sonnet-4.6`, `claude-sonnet-4.5`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gemini-3.1-pro`
Fast/Cheap: `gpt-5.6-luna`, `claude-haiku-4.5`, `gpt-5.4-mini`, `gpt-5-mini`
