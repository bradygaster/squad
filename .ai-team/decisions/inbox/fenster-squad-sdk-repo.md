# Decision: Squad SDK Repository Created

**Author:** Fenster (Core Dev)
**Date:** 2026-02-20
**Status:** Implemented

## Context

Brady approved the SDK replatform as a clean-slate rebuild in a new repository, separate from the existing `squad` source repo. The 14 PRDs (documented in `.ai-team/docs/prds/`) define the full replatform plan. PRD 1 (SDK Orchestration Runtime) is the gate — everything else blocks on it.

## Decision

Created `C:\src\squad-sdk` as a new git repository with a complete TypeScript project scaffold aligned to the PRD architecture.

### Repository Details

- **Location:** `C:\src\squad-sdk` (peer to `C:\src\squad`)
- **Package:** `@bradygaster/squad` v0.6.0-alpha.0
- **Runtime:** Node.js ≥ 20, ESM (`"type": "module"`)
- **Language:** TypeScript (strict, ES2022, NodeNext)
- **Testing:** Vitest
- **Bundling:** esbuild
- **SDK:** `@github/copilot-sdk` v0.1.8 via local file reference (`file:../copilot-sdk/nodejs`)

### Module Structure

| Module | PRD | Public API |
|--------|-----|------------|
| `src/client/` | PRD 1 | `SquadClient`, `SessionPool`, `EventBus` |
| `src/tools/` | PRD 2 | `ToolRegistry`, route/decide/memory/status/skill types |
| `src/hooks/` | PRD 3 | `HookPipeline`, pre/post tool hooks, `PolicyConfig` |
| `src/agents/` | PRD 4 | `AgentSessionManager`, `CharterCompiler`, `AgentCharter` |
| `src/coordinator/` | PRD 5 | `Coordinator`, `RoutingDecision` |
| `src/casting/` | PRD 11 | `CastingRegistry`, `CastingEntry` |
| `src/ralph/` | PRD 8 | `RalphMonitor`, `AgentWorkStatus` |

### Key Choices

1. **Local SDK dependency** — `@github/copilot-sdk` is referenced as `file:../copilot-sdk/nodejs` since it's not published to npm. This will change to a registry reference when the SDK ships publicly.
2. **Stubs define API shape** — Each module exports typed interfaces and classes with TODO comments referencing their PRD. No implementation yet — that starts with PRD 1.
3. **Adapter pattern baked in** — `src/client/` wraps the SDK; no other module imports from `@github/copilot-sdk` directly. This is the kill-shot mitigation from PRD 1.
4. **EventBus is functional** — The cross-session event bus (`src/client/event-bus.ts`) has a working pub/sub implementation with typed events and unsubscribe support. 3 of 7 tests cover it.

## Impact

- PRD 1 implementation can begin immediately in `src/client/`
- All PRD owners have their module directories ready with typed API stubs
- No changes to the existing `squad` source repo are needed
