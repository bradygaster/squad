---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add sub-session spawn backend for Copilot App integration

Spawn cast members as sub-sessions when running in the Copilot App (Tauri desktop),
giving users richer UX with each squad member visible in the left navigation:

- **SpawnBackend interface**: Thin abstraction with `TaskSpawnBackend` (CLI) and
  `SessionSpawnBackend` (App) implementations
- **Detection**: `detectSpawnBackend()` probes for `create_session` tool availability
  at coordinator startup; `detectSpawnPlatform()` returns the platform type
- **Session naming**: `"{Name} {verb}ing {noun}"` convention with 40-char limit
  via `truncateSessionName()` and `buildSessionName()` helpers
- **Concurrency cap**: Maximum 4-5 simultaneous sub-sessions with queuing
- **Depth limit**: No sub-sub-sessions — max depth 1
- **Fallback**: Graceful degradation to `task` tool if `create_session` fails
- **Zero CLI impact**: Behavior unchanged when `create_session` is absent
- **Template updates**: `squad.agent.md` and `spawn-reference.md` updated with
  App dispatch mechanism, platform detection probe, and sub-session rules
