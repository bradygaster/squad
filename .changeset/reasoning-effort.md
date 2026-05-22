---
"@bradygaster/squad-sdk": minor
---

Add reasoning effort support to agent spawning pipeline

Thread `reasoningEffort` through the full agent lifecycle:

- **Charter**: Parse `**Reasoning Effort:**` from `## Model` section in `charter.md`
- **Config**: Read/write `defaultReasoningEffort` and `agentReasoningEffortOverrides` in `.squad/config.json`
- **Resolution**: New `resolveReasoningEffort()` with layered priority (per-agent config override > global config > spawn override > charter preference > undefined)
- **Clamping**: New `clampReasoningEffort()` caps effort to model's max supported level
- **Lifecycle**: `SpawnAgentOptions.reasoningEffortOverride` passes through to `SquadSessionConfig`
- **Fan-Out**: `AgentSpawnConfig.reasoningEffortOverride` passes through to `createSession()`
- **Builders**: `defineAgent()` and `defineDefaults()` accept `reasoningEffort: "low" | "medium" | "high" | "xhigh"`
- **Template**: Updated charter template with `**Reasoning Effort:** auto`
- **Validation**: `"auto"` and invalid values are normalized to `undefined` at parse time
