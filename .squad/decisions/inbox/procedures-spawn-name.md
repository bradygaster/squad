# Decision: Spawn templates must include `name` parameter

**Date:** 2025-07
**Author:** Procedures
**Issue:** #577

## Decision

Every `task` tool spawn MUST include the `name` parameter set to the agent's lowercase cast name (e.g., `name: "eecom"`, `name: "fido"`, `name: "scribe"`).

## Rationale

The `name` parameter generates the human-readable agent ID displayed in the Copilot CLI tasks panel. Without it, the platform shows generic slugs like "general-purpose-task" instead of the cast name, making it impossible for users to identify which agent is working.

## Scope

All spawn templates in `squad.agent.md` — Lightweight, Main, Model-passing, and Scribe templates. Applies to any future spawn templates added to the system.
