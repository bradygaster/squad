# Decision: Agent name extraction uses dedicated parser module

**Author:** VOX
**Date:** 2025-07-25
**Issue:** #577

## Context

The shell's agent name extraction was a single fragile regex inline in `index.ts`. When the coordinator LLM formatted descriptions differently, names silently fell through to generic hints.

## Decision

Agent name extraction now lives in `agent-name-parser.ts` with 3 cascading strategies:
1. Emoji + name + colon at start of string
2. Name + colon anywhere in string
3. Fuzzy word-boundary match against known agent names

When all strategies fail, the shell shows the trimmed description text instead of a generic tool hint.

## Impact

Any future changes to how coordinator formats task descriptions should update the patterns in `agent-name-parser.ts`, not `index.ts`.
