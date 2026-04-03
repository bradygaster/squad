---
name: "model-selection"
description: "Per-agent model selection with 4-layer hierarchy and fallback chains"
license: "MIT"
metadata:
  domain: "orchestration"
  confidence: "high"
  source: "extracted"
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  triggers: [model, selection, hierarchy, fallback, spawning, cost, haiku, sonnet, opus]
  roles: [architect, lead, developer]
---

## Context

Before spawning an agent, the coordinator determines which model to use. This skill codifies the 4-layer hierarchy, role-to-model mappings, task complexity adjustments, and fallback chains. Applies to all agent spawns in Team Mode.

## Patterns

### 4-Layer Hierarchy

Check these layers in order — first match wins:

**Layer 1 — User Override:** Did the user specify a model? ("use opus", "save costs", "use gpt-5.2-codex for this"). If yes, use that model. Session-wide directives ("always use haiku") persist until contradicted.

**Layer 2 — Charter Preference:** Does the agent's charter have a `## Model` section with `Preferred` set to a specific model (not `auto`)? If yes, use that model.

**Layer 3 — Task-Aware Auto-Selection:** Use the governing principle: **cost first, unless code is being written.** Match the agent's task to determine output type, then select accordingly:

| Task Output | Model | Tier | Rule |
|-------------|-------|------|------|
| Writing code (implementation, refactoring, test code, bug fixes) | `claude-sonnet-4.6` | Standard | Quality and accuracy matter for code. Use standard tier. |
| Writing prompts or agent designs (structured text that functions like code) | `claude-sonnet-4.6` | Standard | Prompts are executable — treat like code. |
| NOT writing code (docs, planning, triage, logs, changelogs, mechanical ops) | `claude-haiku-4.5` | Fast | Cost first. Haiku handles non-code tasks. |
| Visual/design work requiring image analysis | `claude-opus-4.5` | Premium | Vision capability required. Overrides cost rule. |

**Role-to-model mapping** (applying cost-first principle):

| Role | Default Model | Why | Override When |
|------|--------------|-----|---------------|
| Core Dev / Backend / Frontend | `claude-sonnet-4.6` | Writes code — quality first | Heavy code gen → `gpt-5.3-codex` |
| Tester / QA | `claude-sonnet-4.6` | Writes test code — quality first | Simple test scaffolding → `claude-haiku-4.5` |
| Lead / Architect | auto (per-task) | Mixed: code review needs quality, planning needs cost | Architecture proposals → premium; triage/planning → haiku |
| Prompt Engineer | auto (per-task) | Mixed: prompt design is like code, research is not | Prompt architecture → sonnet; research/analysis → haiku |
| Copilot SDK Expert | `claude-sonnet-4.6` | Technical analysis that often touches code | Pure research → `claude-haiku-4.5` |
| Designer / Visual | `claude-opus-4.6` | Vision-capable model required | — (never downgrade — vision is non-negotiable) |
| DevRel / Writer | `claude-haiku-4.5` | Docs and writing — not code | — |
| Scribe / Logger | `claude-haiku-4.5` | Mechanical file ops — cheapest possible | — (never bump Scribe) |
| Git / Release | `claude-haiku-4.5` | Mechanical ops — changelogs, tags, version bumps | — (never bump mechanical ops) |

**Task complexity adjustments** (apply at most ONE — no cascading):
- **Bump UP to premium:** architecture proposals, reviewer gates, security audits, multi-agent coordination (output feeds 3+ agents)
- **Bump DOWN to fast/cheap:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to code specialist (`gpt-5.3-codex`):** large multi-file refactors, complex implementation from spec, heavy code generation (500+ lines)
- **Switch to analytical diversity (`gemini-3-pro-preview`):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**Layer 4 — Default:** If nothing else matched, use `claude-haiku-4.5`. Cost wins when in doubt, unless code is being produced.

### Fallback Chains

If a spawn fails because the selected model is unavailable (plan restriction, org policy, rate limit, deprecation, or any other reason), silently retry with the next model in the chain. Do NOT tell the user about fallback attempts. Maximum 3 retries before jumping to the nuclear fallback.

```
Premium:  claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.6 → (omit model param)
Standard: claude-sonnet-4.6 → gpt-5.4 → claude-sonnet-4.5 → gpt-5.3-codex → claude-sonnet-4 → (omit model param)
Fast:     claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini → (omit model param)
```

`(omit model param)` = call the `task` tool WITHOUT the `model` parameter. The platform uses its built-in default. This is the nuclear fallback — it always works.

**Fallback rules:**
- If the user specified a provider ("use Claude"), fall back within that provider only before hitting nuclear
- Never fall back UP in tier — a fast/cheap task should not land on a premium model
- Log fallbacks to the orchestration log for debugging, but never surface to the user unless asked

### Passing the Model to Spawns

Pass the resolved model as the `model` parameter on every `task` tool call:

```
agent_type: "general-purpose"
model: "{resolved_model}"
mode: "background"
description: "{emoji} {Name}: {brief task summary}"
prompt: |
  ...
```

Only set `model` when it differs from the platform default (`claude-sonnet-4.6`). If the resolved model IS `claude-sonnet-4.6`, you MAY omit the `model` parameter — the platform uses it as default.

If you've exhausted the fallback chain and reached nuclear fallback, omit the `model` parameter entirely.

### Spawn Output Format

When spawning, include the model in your acknowledgment:

```
🔧 Fenster (claude-sonnet-4.6) — refactoring auth module
🎨 Redfoot (claude-opus-4.6 · vision) — designing color system
📋 Scribe (claude-haiku-4.5 · fast) — logging session
⚡ Keaton (claude-opus-4.6 · bumped for architecture) — reviewing proposal
📝 McManus (claude-haiku-4.5 · fast) — updating docs
```

Include tier annotation only when the model was bumped or a specialist was chosen. Default-tier spawns just show the model name.

### Valid Models

**Premium:** `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5`
**Standard:** `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-sonnet-4`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1`, `gpt-5`, `gemini-3-pro-preview`
**Fast/Cheap:** `claude-haiku-4.5`, `gpt-5.1-codex-mini`, `gpt-5-mini`, `gpt-4.1`

## Examples

**Example 1: Backend dev writing API endpoints**
- Role: Backend Dev
- Task: "implement REST endpoints for user management"
- Layer 3 decision: writing code → `claude-sonnet-4.6` (standard tier)
- Spawn: `🔧 Fenster (claude-sonnet-4.6) — implementing user API endpoints`

**Example 2: User override**
- User says: "use haiku for everything this session"
- Layer 1 overrides all other layers
- All spawns use `claude-haiku-4.5` regardless of role or task

**Example 3: Complex refactor**
- Role: Backend Dev
- Task: "refactor 15 auth-related files to use new token system"
- Layer 3 base: `claude-sonnet-4.5`
- Task complexity: heavy multi-file refactor → switch to `gpt-5.2-codex`
- Spawn: `🔧 Fenster (gpt-5.2-codex · code specialist) — refactoring auth to new token system`

**Example 4: Scribe logging**
- Role: Scribe
- Task: "log session to decisions.md"
- Layer 3: NOT writing code → `claude-haiku-4.5`
- Role mapping: Scribe always haiku, never bump
- Spawn: `📋 Scribe (claude-haiku-4.5 · fast) — logging session`

## Anti-Patterns

- ❌ Falling back UP in tier (fast task landing on premium model)
- ❌ Telling the user about fallback attempts ("Opus failed, trying Sonnet")
- ❌ Bumping Scribe or mechanical ops agents to higher tiers
- ❌ Using premium models for documentation or planning tasks
- ❌ Applying multiple complexity adjustments (cascading bumps)
- ❌ Forgetting to include model in spawn acknowledgment
- ❌ Downgrading vision-required tasks from opus
