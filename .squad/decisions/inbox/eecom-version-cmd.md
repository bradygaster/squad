# Decision: `version` subcommand handled inline

**Author:** EECOM  
**Date:** 2026-07-15  
**Status:** Implemented

## Context

`squad version` returned "Unknown command" while `squad --version` worked. Users expect both forms.

## Decision

Handle `version` inline alongside `--version`/`-v` in `cli-entry.ts` rather than creating a separate command file in `cli/commands/`. Trivial handlers that just print a value don't warrant their own module.

## Rationale

- Same output, same code path — no reason to split.
- Avoids adding a file the wiring test would require an import for.
- Follows precedent: `help` is also handled inline (not a separate command file).
