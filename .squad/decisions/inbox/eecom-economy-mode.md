# Economy Mode Design — #500

**Date:** 2026-03-20  
**Author:** EECOM  
**Issue:** #500

## Decision

Economy mode is implemented as a modifier that shifts model selection at Layer 3 (task-aware auto) and Layer 4 (default fallback) only. Layers 0–2 (explicit user preferences) are never downgraded.

## Model Map

| Normal | Economy | Use case |
|--------|---------|----------|
| `claude-opus-4.6` | `claude-sonnet-4.5` | Architecture, review |
| `claude-sonnet-4.6` | `gpt-4.1` | Code writing |
| `claude-sonnet-4.5` | `gpt-4.1` | Code writing |
| `claude-haiku-4.5` | `gpt-4.1` | Docs, planning, mechanical |

## Activation

1. **Persistent:** `"economyMode": true` in `.squad/config.json` (survives sessions)
2. **Session:** `--economy` CLI flag (sets `SQUAD_ECONOMY_MODE=1` env var, current session only)
3. **Toggle command:** `squad economy on|off` writes to config.json

## Hierarchy Integration

Economy mode is a Layer 3/4 modifier — it does NOT override explicit preferences (Layers 0–2). This is intentional: if a user said "always use opus", economy mode respects that choice.

## Implementation Points

- `ECONOMY_MODEL_MAP` + `applyEconomyMode()` in `packages/squad-sdk/src/config/models.ts`
- `readEconomyMode()` + `writeEconomyMode()` in `packages/squad-sdk/src/config/models.ts`
- `resolveModel()` in `config/models.ts` accepts `economyMode?: boolean` option; reads from config if not provided
- `resolveModel()` in `agents/model-selector.ts` also supports `economyMode?: boolean`
- `squad economy [on|off]` command in `packages/squad-cli/src/cli/commands/economy.ts`
- `--economy` global flag in `cli-entry.ts`
