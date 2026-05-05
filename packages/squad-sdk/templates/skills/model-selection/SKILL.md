---
name: "model-selection"
description: "Resolves agent models using layer priority, cost policy, and ceiling-aware fallbacks"
domain: "orchestration"
confidence: "high"
source: "manual"
---

# Model Selection

## SCOPE

✅ THIS SKILL PRODUCES:
- A resolved `model` for every agent spawn
- Persistent model preferences in `.squad/config.json`
- Persistent or session cost-policy state
- Spawn acknowledgments that show when included/economy/policy behavior changed the routing

❌ THIS SKILL DOES NOT PRODUCE:
- Cost reports or billing analytics
- Benchmarking or model evals
- New model IDs not exposed by the current Copilot surface

## Context

Squad resolves models in two phases:
1. **Preference resolution** via the 5-layer hierarchy
2. **Policy enforcement** via `costPolicy`, `preferIncluded`, `economyMode`, and ceiling-aware fallback

Use GitHub's category names:
- **Lightweight**
- **Versatile**
- **Powerful**

## 5-Layer Resolution Hierarchy

| Layer | Name | Source | Behavior |
|---|---|---|---|
| 0a | Per-Agent Config | `.squad/config.json` → `agentModelOverrides.{name}` | Explicit persistent override |
| 0b | Global Config | `.squad/config.json` → `defaultModel` | Explicit persistent override |
| 1 | Session Directive | current conversation | Explicit session override |
| 2 | Charter Preference | agent charter `## Model` | Non-user default preference |
| 3 | Task-Aware Auto | task type | Computed default |
| 4 | Default | hardcoded | Final fallback |

**Important:** `costPolicy` is **not** a layer. Apply it after a model is resolved.

## Session start workflow

1. Read `.squad/config.json`
2. Load `defaultModel`
3. Load `agentModelOverrides`
4. Load `costPolicy`
5. Load `economyMode`
6. Store persistent settings in session state

## Cost Policy
