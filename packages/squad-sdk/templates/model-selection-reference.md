# Model Selection Reference

## Per-Agent Model Selection

Before spawning an agent, determine which model to use. Check these layers in order — first match wins:

**Layer 0 — Persistent Config (`.squad/config.json`):** On session start, read `.squad/config.json`. If `agentModelOverrides.{agentName}` exists, use that model for this specific agent. Otherwise, if `defaultModel` exists, use it for ALL agents. This layer survives across sessions — the user set it once and it sticks.

- **When user says "always use X" / "use X for everything" / "default to X":** Write `defaultModel` to `.squad/config.json`. Acknowledge: `✅ Model preference saved: {model} — all future sessions will use this until changed.`
- **When user says "use X for {agent}":** Write to `agentModelOverrides.{agent}` in `.squad/config.json`. Acknowledge: `✅ {Agent} will always use {model} — saved to config.`
- **When user says "switch back to automatic" / "clear model preference":** Remove `defaultModel` (and optionally `agentModelOverrides`) from `.squad/config.json`. Acknowledge: `✅ Model preference cleared — returning to automatic selection.`

**Layer 1 — Session Directive:** Did the user specify a model for this session? ("use opus for this session", "save costs"). If yes, use that model. Session-wide directives persist until the session ends or contradicted.

**Layer 2 — Charter Preference:** Does the agent's charter have a `## Model` section with `Preferred` set to a specific model (not `auto`)? If yes, use that model.

**Layer 3 — Task-Aware Auto-Selection:** Use the governing principle: **cost first, unless code is being written.** Match the agent's task to determine output type, then select accordingly:

| Task Output | Model | Tier | Rule |
|-------------|-------|------|------|
| Writing code (implementation, refactoring, test code, bug fixes) | `gpt-5.6-terra` | Standard | Quality and accuracy matter for code. Use standard tier. |
| Writing prompts or agent designs (structured text that functions like code) | `gpt-5.6-terra` | Standard | Prompts are executable — treat like code. |
| NOT writing code (docs, planning, triage, logs, changelogs, mechanical ops) | `gpt-5.6-luna` | Fast | Cost first. Luna handles non-code tasks. |
| Visual/design work requiring image analysis | `gpt-5.6-sol` | Premium | Vision capability required. Overrides cost rule. |

**Role-to-model mapping** (applying cost-first principle):

| Role | Default Model | Why | Override When |
|------|--------------|-----|---------------|
| Core Dev / Backend / Frontend | `gpt-5.6-terra` | Writes code — quality first | Heavy code gen → `gpt-5.3-codex` |
| Tester / QA | `gpt-5.6-terra` | Writes test code — quality first | Simple test scaffolding → `claude-haiku-4.5` |
| Lead / Architect | auto (per-task) | Mixed: code review needs quality, planning needs cost | Architecture proposals → premium; triage/planning → haiku |
| Prompt Engineer | auto (per-task) | Mixed: prompt design is like code, research is not | Prompt architecture → sonnet; research/analysis → haiku |
| Copilot SDK Expert | `gpt-5.6-terra` | Technical analysis that often touches code | Pure research → `gpt-5.6-luna` |
| Designer / Visual | `gpt-5.6-sol` | Vision-capable model required | — (never downgrade — vision is non-negotiable) |
| DevRel / Writer | `gpt-5.6-luna` | Docs and writing — not code | — |
| Scribe / Logger | `gpt-5.6-luna` | Mechanical file ops — cheapest possible | — (never bump Scribe) |
| Git / Release | `gpt-5.6-luna` | Mechanical ops — changelogs, tags, version bumps | — (never bump mechanical ops) |

**Task complexity adjustments** (apply at most ONE — no cascading):
- **Bump UP to premium:** architecture proposals, reviewer gates, security audits, multi-agent coordination (output feeds 3+ agents)
- **Bump DOWN to fast/cheap:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to code specialist (`gpt-5.3-codex`):** large multi-file refactors, complex implementation from spec, heavy code generation (500+ lines)
- **Switch to analytical diversity (`gemini-3.1-pro`):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**Layer 4 — Default:** If nothing else matched, use `gpt-5.6-luna`. Cost wins when in doubt, unless code is being produced.

**Fallback chains — when a model is unavailable:**

If a spawn fails because the selected model is unavailable (plan restriction, org policy, rate limit, deprecation, or any other reason), silently retry with the next model in the chain. Do NOT tell the user about fallback attempts. Maximum 3 retries before using the platform default fallback.

```
Premium:  gpt-5.6-sol → claude-opus-5 → claude-opus-4.8 → claude-opus-4.7 → claude-opus-4.6 → claude-sonnet-4.6 → (omit model param)
Standard: gpt-5.6-terra → claude-sonnet-5 → claude-sonnet-4.6 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → claude-sonnet-4.5 → gemini-3.1-pro → (omit model param)
Fast:     gpt-5.6-luna → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini → (omit model param)
```

`(omit model param)` = call the `task` tool WITHOUT the `model` parameter. The platform uses its built-in default. This is the platform default fallback — it lets the platform choose the model.

**Fallback rules:**
- If the user specified a provider ("use Claude"), fall back within that provider only before using the platform default fallback
- Never fall back UP in tier — a fast/cheap task should not land on a premium model
- Log fallbacks to the orchestration log for debugging, but never surface to the user unless asked

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

Only set `model` when it differs from the platform default (`claude-sonnet-4.6`). If the resolved model IS `claude-sonnet-4.6`, you MAY omit the `model` parameter — the platform uses it as default.

If you've exhausted the fallback chain and reached the platform default fallback, omit the `model` parameter entirely.

**Spawn output format — show the model choice:**

When spawning, include the model in your acknowledgment:

```
🔧 Fenster (claude-sonnet-5) — refactoring auth module
🎨 Redfoot (gpt-5.6-sol · vision) — designing color system
📋 Scribe (gpt-5.6-luna · fast) — logging session
⚡ Keaton (gpt-5.6-sol · bumped for architecture) — reviewing proposal
📝 McManus (gpt-5.6-luna · fast) — updating docs
```

Include tier annotation only when the model was bumped or a specialist was chosen. Default-tier spawns just show the model name.

**Valid models (current platform catalog):**

Premium: `gpt-5.6-sol`, `claude-opus-5`, `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`
Standard: `gpt-5.6-terra`, `claude-sonnet-5`, `claude-sonnet-4.6`, `claude-sonnet-4.5`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gemini-3.1-pro`
Fast/Cheap: `gpt-5.6-luna`, `claude-haiku-4.5`, `gpt-5.4-mini`, `gpt-5-mini`
