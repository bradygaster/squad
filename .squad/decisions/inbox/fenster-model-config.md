# Decision: Structured Model Preference in SDK Config

**Date:** 2026-03-08
**Author:** Fenster (Core Dev)
**Issue:** #223
**PR:** #245

## Context

Model preferences set via `defineAgent({ model: '...' })` were not reliably applied because the build pipeline emitted a flat `**Model:** value` line, but the charter-compiler expected a `## Model` section with `**Preferred:** value` format.

## Decision

1. **`AgentDefinition.model` accepts `string | ModelPreference`** — backwards compatible. A plain string is normalized to `{ preferred: string }` internally.
2. **`ModelPreference` interface** has three fields: `preferred` (required), `rationale` (optional), `fallback` (optional).
3. **Squad-level defaults** via `config.defaults.model` — applied to any agent that doesn't specify its own model preference.
4. **Charter output** uses the `## Model` section format with `**Preferred:**`, `**Rationale:**`, `**Fallback:**` lines — matching what the charter-compiler already parses.

## Impact

- All agents: charter generation now reliably round-trips model preferences.
- Verbal/Keaton: the 4-layer model selection hierarchy documented in squad.agent.md is now supported at the SDK config level.
- Anyone adding new config fields: use the `assertModelPreference()` pattern (accept string-or-object, normalize internally) for fields that need simple and rich config shapes.
