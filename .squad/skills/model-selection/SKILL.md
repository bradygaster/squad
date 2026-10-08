---
name: model-selection
description: Resolve explicit and persistent model preferences for Squad spawns without pinning stale defaults
domain: orchestration
confidence: high
source: retained pre-recast procedure, narrowed for the descriptive cast
---

# Model Selection

Use this skill when the user requests a model, the team configuration contains a saved model
preference, or a specialist charter explicitly requires one.

## Resolution Order

Apply the first available value:

1. Explicit model requested for the current spawn.
2. Current-session model directive from the user.
3. `.squad/config.json` `agentModelOverrides.{specialist-id}`.
4. `.squad/config.json` `defaultModel`.
5. The specialist charter's explicit model requirement.
6. Runtime automatic selection by omitting the model parameter.

An explicit current request always overrides older persistent configuration. Do not invent a model
preference from task type alone, and do not pin a hardcoded fallback that can become obsolete.

## Persistent Preferences

- Save `defaultModel` or `agentModelOverrides` only when the user explicitly asks for persistence.
- Merge model fields into the existing `.squad/config.json`; do not replace unrelated settings.
- Use active specialist IDs from `.squad/casting/registry.json`.
- Validate a requested model against the runtime's currently supported model list.
- To return to automatic routing, remove the applicable override rather than writing an `"auto"`
  sentinel unless the runtime schema explicitly supports it.

## Spawn Behavior

- Pass a model only when resolution steps 1-5 produce a supported value.
- Otherwise omit the model parameter and allow the runtime to select.
- Preserve the user's requested reasoning effort or context tier only when the runtime supports it.
- If a requested model is unavailable, report that failure and fall back to runtime automatic
  selection unless the user supplied a different fallback.

## Stop Conditions

- Stop if the requested model is not supported and no automatic fallback is acceptable.
- Stop rather than rewriting configuration when `.squad/config.json` cannot be parsed safely.
- Do not benchmark models, estimate billing, or modify specialist responsibilities under this skill.
