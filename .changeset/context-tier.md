---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Thread a `contextTier` concept end-to-end through the agent spawning pipeline, mirroring `reasoningEffort`.

Adds the ability to select a model's context window / context tier (Default vs Long-context / 1M) wherever a model and reasoning effort can already be chosen:

- New `SquadContextTier = "default" | "long_context"` type and optional `SquadSessionConfig.contextTier`.
- Per-model `supportedContextTiers` / `defaultContextTier` in the model catalog so requests validate and clamp against what a model supports (e.g. Opus 4.8 → 264K default / 1M long context, inferred from billing token prices).
- `ModelConfig.defaultContextTier` and `agentContextTierOverrides` config-schema fields, with `readContextTier` / `writeContextTier` / `readAgentContextTierOverrides` / `writeAgentContextTierOverrides` / `resolveContextTier` / `clampContextTier` helpers mirroring the reasoning-effort resolvers (unsupported tier clamps to the model default; unknown treated as default; `auto` sentinel means "not set").
- Charter `## Model` → `**Context Tier:**` support in the charter compiler.
- `contextTier` threaded through `spawn-backend.ts` (camelCase for task spawns, `context_tier` snake_case for session kickoff) and `fan-out.ts`.
- New `squad config context-tier [<tier>] [--agent <name>] [--clear]` CLI subcommand parallel to `squad config model`.
