# EECOM History Archive

> Summarized entries prior to 2026-04-01

## Summary

EECOM's primary responsibilities:
- Environmental, Electrical, Consumables: deployment target validation, SDK compatibility, developer environment setup
- PR #942 rebase: cherry-picked insider-based work to dev, resolving file conflicts
- Loop command refactoring (PR #767): fixed worktree CWD path mismatches, streaming output buffering, template deduplication
- archiveDecisions() enhancement: added count-based fallback when all decisions <30 days old but file >20KB

### Key Patterns Documented

1. **Cherry-pick from insider branches:** Expect modify/delete conflicts for insider-only files. Always verify base assumptions — drop or adapt imports referencing insider-only modules.
2. **Loop command worktree fix:** Derive `teamRoot` from `detectSquadDir().path` (not hardcoded). Resolution and execution CWD must use the same root.
3. **Streaming child process output:** Attach `.on('data')` listeners to stdout/stderr after `execFile`. Callback's buffered args are the same — writing both duplicates.
4. **Template file mocking in tests:** Use `vi.importActual<typeof import('node:fs')>('node:fs')` in `beforeAll` to access real filesystem for fixtures when fs is globally mocked.
5. **Decision archival fallback:** When age-based split returns empty but file >20KB, use count-based fallback. Preserve undated entries (they are foundational). Re-sort to original order after split.

### Bug Fixes

- PR #963: Fixed SDK import conflicts blocking CLI build (complement to CONTROL's work)
- PR #767: Fixed worktree CWD path mismatches, streaming buffering, docs alignment
- Loop.md template deduplication: replaced 48-line hardcoded scaffold with filesystem read

### Tests Enhanced

- Loop streaming test: validates real-time output capture
- archiveDecisions tests: 4 adversarial cases (all-today >20KB, mixed dated/undated, under-threshold, exact boundary)

---

*Archive created 2026-04-19 by Scribe during history size management (32.5KB → baseline reduction)*
