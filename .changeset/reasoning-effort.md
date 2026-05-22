---
"@bradygaster/squad-sdk": minor
---

Add reasoning effort support to agent spawning pipeline

Thread `reasoningEffort` through the full agent lifecycle:

- **Charter**: Parse `**Reasoning Effort:**` from `## Model` section in `charter.md`
- **Config**: Read/write `defaultReasoningEffort` and `agentReasoningEffortOverrides` in `.squad/config.json`
- **Resolution**: New `resolveReasoningEffort()` with layered priority (config override > charter > spawn override > auto=undefined)
- **Lifecycle**: `SpawnAgentOptions.reasoningEffortOverride` passes through to `SquadSessionConfig`
- **Fan-Out**: `AgentSpawnConfig.reasoningEffortOverride` passes through to `createSession()`
- **Builders**: `defineAgent()` and `defineDefaults()` accept `reasoningEffort: "low" | "medium" | "high" | "xhigh"`
- **Template**: Updated charter template with `**Reasoning Effort:** auto`

The value `"auto"` is treated as a sentinel meaning "let the SDK/API decide" and resolves to `undefined`.
