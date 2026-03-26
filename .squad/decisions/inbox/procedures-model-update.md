# Decision: Model catalog refresh to current platform offerings

**Author:** Procedures
**Date:** 2025-07
**Issue:** #588

## Context

The model catalog in `squad.agent.md` was stale. Platform added `claude-sonnet-4.6`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, and `claude-opus-4.6-1m`. Platform removed `claude-opus-4.6-fast` and `gpt-5` (standalone).

## Decision

- **Default code model bumped to `claude-sonnet-4.6`** — it's the newest standard-tier Claude and replaces `claude-sonnet-4.5` as the recommended model for code-writing tasks, role mappings, and the platform default reference.
- **Code specialist bumped to `gpt-5.3-codex`** — replaces `gpt-5.2-codex` as the recommended model for heavy code generation overrides.
- **Fallback chains restructured** — removed dead model `claude-opus-4.6-fast`, added new models (`gpt-5.4`, `gpt-5.4-mini`) in sensible fallback positions.

## Impact

All agents using model selection or fallback chains will now reference current models. No behavioral change for agents using the platform default (omitting `model` param) — they get whatever the platform serves.
