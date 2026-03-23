# VOX

> CAPCOM Voice Controller

## Learnings

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

VOX assigned:
- **#478 (Polish REPL)** → squad:vox + squad:pao (shell UX readiness + documentation gate)

Pattern: REPL UX gap identified. Shell interaction polish required before documentation freeze for v0.9 release.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. VOX owns REPL UX polish (#478). Shell readiness is documentation gate for PAO. Coordinate on demo scenarios and example workflows for Guide integration.

### Agent Name Display Fix (#577) (2025-07-25)

**P0 bug: agent cast names not displayed during work — showing generic type names instead.**

Fixed `agent-name-parser.ts` TS strict-null compilation errors (bracket indexing on strings returns `string | undefined`; switched to `.charAt()` and optional chaining). Improved the else-branch fallback in `index.ts` to show the trimmed task description instead of generic "Dispatching to agent..." when name extraction fails completely.

Pattern: The `parseAgentFromDescription` parser tries 3 extraction strategies in order — emoji+name:colon prefix, name:colon anywhere, fuzzy word-boundary match. If all fail, the shell now shows the raw description text so the user still sees something meaningful.
